-- 서버 함수 계약 (PRD 15장). 모든 공개 함수는 SECURITY DEFINER + search_path 고정 + auth.uid() 필수.
-- 역할·작성자·멤버는 요청 값이 아니라 auth.uid()와 멤버십으로 서버가 판정한다 (PRD 13.2).
-- 오류는 예외 대신 {ok:false, error:{code}} 를 반환한다. 시도 횟수 제한 카운터가 실패 시에도 남아야 하기 때문.
-- 쓰기 순서 원칙: 모든 검사를 먼저 하고, 쓰기는 마지막에 한다. 잠금 순서: room → round → question.

-- ───────── 공통 응답 ─────────

create function private.ok(p_action_id uuid, p_revision bigint, p_data jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'ok', true,
    'action_id', p_action_id,
    'server_time', now(),
    'room_revision', p_revision,
    'data', coalesce(p_data, '{}'::jsonb)
  )
$$;

create function private.err(p_code text, p_retryable boolean default false, p_data jsonb default null)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'ok', false,
    'error', jsonb_build_object('code', p_code, 'retryable', p_retryable, 'message_key', lower(p_code))
      || case when p_data is null then '{}'::jsonb else jsonb_build_object('data', p_data) end,
    'server_time', now()
  )
$$;

-- JS String.prototype.trim에 대응하는 앞뒤 공백 제거. 빈 문자열이면 null.
create function private.trim_text(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(regexp_replace(p, '^[[:space:]]+|[[:space:]]+$', '', 'g'), '')
$$;

-- ───────── 멱등성 (PRD 15.3) ─────────

-- 같은 (사용자, action_id)를 직렬화하고, 이미 확정된 결과가 있으면 돌려준다. 없으면 null.
create function private.receipt_begin(p_uid uuid, p_action_id uuid, p_operation text, p_request jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_receipt private.action_receipts;
begin
  if p_action_id is null then
    return private.err('INVALID_INPUT');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_uid::text || ':' || p_action_id::text, 0));
  select * into v_receipt
  from private.action_receipts
  where auth_user_id = p_uid and action_id = p_action_id;
  if not found then
    return null;
  end if;
  if v_receipt.operation <> p_operation
     or v_receipt.request_hash <> md5(p_operation || ':' || p_request::text) then
    return private.err('ACTION_ID_REUSED');
  end if;
  return v_receipt.response_json;
end;
$$;

create function private.receipt_save(
  p_uid uuid, p_action_id uuid, p_room_id uuid, p_operation text, p_request jsonb, p_response jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $$
begin
  insert into private.action_receipts (auth_user_id, action_id, room_id, operation, request_hash, response_json)
  values (p_uid, p_action_id, p_room_id, p_operation, md5(p_operation || ':' || p_request::text), p_response);
  return p_response;
end;
$$;

-- ───────── 시도 제한 (PRD 17.3) ─────────

create function private.limit_window(p_window interval)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select to_timestamp(floor(extract(epoch from now()) / extract(epoch from p_window)) * extract(epoch from p_window))
$$;

-- 제한에 걸렸으면 남은 초, 아니면 0
create function private.limit_exceeded(p_key text, p_window interval, p_max int)
returns int
language sql
stable
set search_path = ''
as $$
  select case
    when coalesce((
      select l.count from private.pilot_access_limits l
      where l.key_hash = md5(p_key) and l.window_start = private.limit_window(p_window)
    ), 0) >= p_max
    then greatest(1, ceil(extract(epoch from (private.limit_window(p_window) + p_window - now()))))::int
    else 0
  end
$$;

create function private.limit_add(p_key text, p_window interval)
returns void
language sql
set search_path = ''
as $$
  insert into private.pilot_access_limits (key_hash, window_start, count)
  values (md5(p_key), private.limit_window(p_window), 1)
  on conflict (key_hash, window_start)
  do update set count = private.pilot_access_limits.count + 1
$$;

-- 응답·공감: 세션당 초당 3회, 분당 60회
create function private.click_limited(p_kind text, p_uid uuid)
returns int
language plpgsql
set search_path = ''
as $$
declare
  v_retry int;
begin
  v_retry := greatest(
    private.limit_exceeded(p_kind || ':s:' || p_uid, interval '1 second', 3),
    private.limit_exceeded(p_kind || ':m:' || p_uid, interval '1 minute', 60)
  );
  if v_retry = 0 then
    perform private.limit_add(p_kind || ':s:' || p_uid, interval '1 second');
    perform private.limit_add(p_kind || ':m:' || p_uid, interval '1 minute');
  end if;
  return v_retry;
end;
$$;

-- ───────── 방 상태 ─────────

-- 서버에서 생성하는 8자리 참여 코드 (혼동 문자 제외 32자, 바이트 % 32는 편향 없음)
create function private.new_join_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea := extensions.gen_random_bytes(8);
  v_code text := '';
begin
  for i in 0..7 loop
    v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
  end loop;
  return v_code;
end;
$$;

-- revision 증가 + 최소 변경 알림 (PRD 13.3-5·6, 16.1). 본문·작성자·선택값은 넣지 않는다.
create function private.bump(p_room_id uuid, p_kind text)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  v_revision bigint;
begin
  update private.rooms set revision = revision + 1
  where id = p_room_id
  returning revision into v_revision;

  perform realtime.send(
    jsonb_build_object('room_id', p_room_id, 'revision', v_revision, 'kind', p_kind, 'server_time', now()),
    'room_changed',
    'room:' || p_room_id::text,
    true
  );
  return v_revision;
end;
$$;

-- 12시간 자동 마감 (ROOM-03). 모든 요청에서 검사해 만료 후 쓰기를 막는다.
create function private.end_room_if_due(p_room_id uuid)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  update private.rooms
  set status = 'ended', ended_at = auto_end_at
  where id = p_room_id and status = 'open' and auto_end_at <= now();
  if not found then
    return false;
  end if;
  update private.rounds set status = 'closed', closed_at = now()
  where room_id = p_room_id and status = 'open';
  perform private.bump(p_room_id, 'room_ended');
  return true;
end;
$$;

create function private.is_expired(p_room private.rooms)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_room.status = 'ended' and p_room.ended_at < now() - interval '24 hours'
$$;

-- ───────── snapshot 구성 (PRD 15.4) ─────────
-- STABLE 함수는 호출한 쿼리와 같은 스냅샷을 보므로 get_snapshot의 한 SELECT 안에서 일관된다.

create function private.round_host_view(p_round private.rounds)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_round.id,
    'type', p_round.type,
    'status', p_round.status,
    'opened_at', p_round.opened_at,
    'closed_at', p_round.closed_at,
    'target_count', t.target_count,
    'yes_count', t.yes_count,
    'no_count', t.no_count,
    'unanswered_count', t.target_count - t.yes_count - t.no_count,
    'target_connection_unknown_count', t.unknown_count
  )
  from (
    select
      count(*) as target_count,
      count(*) filter (where r.choice = 'yes') as yes_count,
      count(*) filter (where r.choice = 'no') as no_count,
      count(*) filter (where m.last_seen_at < now() - interval '45 seconds') as unknown_count
    from private.round_targets rt
    join private.room_members m on m.id = rt.member_id
    left join private.responses r on r.round_id = rt.round_id and r.member_id = rt.member_id
    where rt.round_id = p_round.id
  ) t
$$;

-- 학생에게는 다른 사람의 선택·집계를 주지 않는다 (PRD 8.4)
create function private.round_student_view(p_round private.rounds, p_member_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_round.id,
    'type', p_round.type,
    'status', p_round.status,
    'opened_at', p_round.opened_at,
    'closed_at', p_round.closed_at,
    'is_target', exists (
      select 1 from private.round_targets rt
      where rt.round_id = p_round.id and rt.member_id = p_member_id
    ),
    'my_choice', (
      select r.choice from private.responses r
      where r.round_id = p_round.id and r.member_id = p_member_id
    ),
    'my_response_version', coalesce((
      select r.version from private.responses r
      where r.round_id = p_round.id and r.member_id = p_member_id
    ), 0)
  )
$$;

create function private.round_view(p_round private.rounds, p_member private.room_members)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select case
    when p_round.id is null then null
    when p_member.role = 'host' then private.round_host_view(p_round)
    else private.round_student_view(p_round, p_member.id)
  end
$$;

-- 질문 카드: 작성자 식별 정보 없음 (Q-02). is_mine은 본인 여부만.
create function private.question_card(p_question private.questions, p_member_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_question.id,
    'body', p_question.body,
    'status', p_question.status,
    'version', p_question.version,
    'created_at', p_question.created_at,
    'answered_at', p_question.answered_at,
    'reaction_count', (select count(*) from private.question_reactions qr where qr.question_id = p_question.id),
    'is_mine', p_question.author_member_id = p_member_id,
    'reacted_by_me', exists (
      select 1 from private.question_reactions qr
      where qr.question_id = p_question.id and qr.member_id = p_member_id
    )
  )
$$;

-- ───────── 공개 RPC ─────────

-- ROOM-01. 파일럿 생성 코드는 bcrypt 해시(private.app_secrets.pilot_code_hash)와 비교한다.
create function public.create_room(p_title text, p_pilot_code text, p_action_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_req jsonb := jsonb_build_object('title', p_title);
  v_prev jsonb;
  v_retry int;
  v_hash text;
  v_title text;
  v_room private.rooms;
  v_due private.rooms;
begin
  if v_uid is null then
    return private.err('UNAUTHENTICATED');
  end if;
  v_prev := private.receipt_begin(v_uid, p_action_id, 'create_room', v_req);
  if v_prev is not null then
    return v_prev;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('create_room:' || v_uid::text, 0));

  v_retry := private.limit_exceeded('create_room:' || v_uid, interval '1 hour', 3);
  if v_retry > 0 then
    return private.err('RATE_LIMITED', true, jsonb_build_object('retry_after_seconds', v_retry));
  end if;
  perform private.limit_add('create_room:' || v_uid, interval '1 hour');

  select value into v_hash from private.app_secrets where name = 'pilot_code_hash';
  if v_hash is null or p_pilot_code is null or extensions.crypt(p_pilot_code, v_hash) <> v_hash then
    return private.err('FORBIDDEN');
  end if;

  v_title := private.trim_text(p_title);
  if v_title is null or char_length(v_title) > 30 then
    return private.err('INVALID_INPUT');
  end if;

  for v_due in
    select * from private.rooms
    where host_auth_id = v_uid and status = 'open' and auto_end_at <= now()
    for update
  loop
    perform private.end_room_if_due(v_due.id);
  end loop;

  select * into v_room from private.rooms where host_auth_id = v_uid and status = 'open';
  if found then
    return private.err('ACTIVE_ROOM_EXISTS', false,
      jsonb_build_object('room_id', v_room.id, 'join_code', v_room.join_code));
  end if;

  v_room := null;
  for i in 1..10 loop
    begin
      insert into private.rooms (title, join_code, host_auth_id, auto_end_at)
      values (v_title, private.new_join_code(), v_uid, now() + interval '12 hours')
      returning * into v_room;
      exit;
    exception when unique_violation then
      v_room := null;
    end;
  end loop;
  if v_room.id is null then
    return private.err('INTERNAL_ERROR', true);
  end if;

  insert into private.room_members (room_id, auth_user_id, role) values (v_room.id, v_uid, 'host');

  return private.receipt_save(v_uid, p_action_id, v_room.id, 'create_room', v_req,
    private.ok(p_action_id, v_room.revision, jsonb_build_object(
      'room_id', v_room.id,
      'join_code', v_room.join_code,
      'title', v_room.title,
      'auto_end_at', v_room.auto_end_at
    )));
end;
$$;

-- ROOM-02. 없는 코드와 잘못된 코드는 같은 오류로 응답한다.
create function public.join_room(p_code text, p_action_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_req jsonb := jsonb_build_object('code', p_code);
  v_prev jsonb;
  v_key text;
  v_retry int;
  v_code text;
  v_room private.rooms;
  v_member private.room_members;
  v_revision bigint;
begin
  if v_uid is null then
    return private.err('UNAUTHENTICATED');
  end if;
  v_prev := private.receipt_begin(v_uid, p_action_id, 'join_room', v_req);
  if v_prev is not null then
    return v_prev;
  end if;

  v_key := 'join_fail:' || v_uid;
  v_retry := private.limit_exceeded(v_key, interval '10 minutes', 10);
  if v_retry > 0 then
    return private.err('RATE_LIMITED', true, jsonb_build_object('retry_after_seconds', v_retry));
  end if;

  v_code := upper(regexp_replace(coalesce(p_code, ''), '[[:space:]-]', '', 'g'));
  if v_code !~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$' then
    perform private.limit_add(v_key, interval '10 minutes');
    return private.err('ROOM_UNAVAILABLE');
  end if;

  select * into v_room from private.rooms where join_code = v_code for update;
  if not found then
    perform private.limit_add(v_key, interval '10 minutes');
    return private.err('ROOM_UNAVAILABLE');
  end if;
  if private.end_room_if_due(v_room.id) then
    select * into v_room from private.rooms where id = v_room.id;
  end if;

  -- 같은 세션 재참여: 기존 멤버 반환, 인원 증가 없음
  select * into v_member from private.room_members where room_id = v_room.id and auth_user_id = v_uid;
  if found then
    if private.is_expired(v_room) then
      return private.err('ROOM_EXPIRED');
    end if;
    return private.receipt_save(v_uid, p_action_id, v_room.id, 'join_room', v_req,
      private.ok(p_action_id, v_room.revision,
        jsonb_build_object('room_id', v_room.id, 'role', v_member.role, 'title', v_room.title)));
  end if;

  if v_room.status <> 'open' then
    return private.err('ROOM_ENDED');
  end if;
  if (select count(*) from private.room_members where room_id = v_room.id and role = 'student') >= 30 then
    return private.err('ROOM_FULL');
  end if;

  insert into private.room_members (room_id, auth_user_id, role)
  values (v_room.id, v_uid, 'student');
  v_revision := private.bump(v_room.id, 'membership_changed');

  return private.receipt_save(v_uid, p_action_id, v_room.id, 'join_room', v_req,
    private.ok(p_action_id, v_revision,
      jsonb_build_object('room_id', v_room.id, 'role', 'student', 'title', v_room.title)));
end;
$$;

-- 12.2 연결 확인. 방송·revision 증가 없음.
create function public.heartbeat(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_room private.rooms;
begin
  if v_uid is null then
    return private.err('UNAUTHENTICATED');
  end if;
  update private.room_members set last_seen_at = now()
  where room_id = p_room_id and auth_user_id = v_uid;
  if not found then
    return private.err('ROOM_UNAVAILABLE');
  end if;
  perform private.end_room_if_due(p_room_id);
  select * into v_room from private.rooms where id = p_room_id;
  if private.is_expired(v_room) then
    return private.err('ROOM_EXPIRED');
  end if;
  return private.ok(null, v_room.revision,
    jsonb_build_object('room_status', v_room.status, 'ended_at', v_room.ended_at));
end;
$$;

-- 15.4 역할별 snapshot. 질문 페이지는 offset 기반 20개 단위.
create function public.get_snapshot(
  p_room_id uuid,
  p_filter text default 'pending',
  p_sort text default 'popular',
  p_offset int default 0,
  p_limit int default 20
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_member private.room_members;
  v_room private.rooms;
  v_snapshot jsonb;
begin
  if v_uid is null then
    return private.err('UNAUTHENTICATED');
  end if;
  select * into v_member from private.room_members where room_id = p_room_id and auth_user_id = v_uid;
  if not found then
    return private.err('ROOM_UNAVAILABLE');
  end if;
  if p_filter not in ('pending', 'answered') or p_sort not in ('popular', 'latest')
     or p_offset is null or p_offset < 0 or p_limit is null or p_limit not between 1 and 50 then
    return private.err('INVALID_INPUT');
  end if;

  perform private.end_room_if_due(p_room_id);
  select * into v_room from private.rooms where id = p_room_id;
  if private.is_expired(v_room) then
    return private.err('ROOM_EXPIRED');
  end if;

  -- 한 SELECT로 만들어 합계가 서로 다른 시점에서 읽히지 않게 한다
  with ranked as (
    select q, row_number() over (
      order by
        case when p_sort = 'popular' then (select count(*) from private.question_reactions qr where qr.question_id = q.id) end desc,
        case when p_sort = 'popular' then q.created_at end asc,
        case when p_sort = 'latest' then q.created_at end desc,
        case when p_sort = 'popular' then q.id end asc,
        case when p_sort = 'latest' then q.id end desc
    ) as rn
    from private.questions q
    where q.room_id = p_room_id and q.status = p_filter::private.question_status
  )
  select jsonb_build_object(
    'room', jsonb_build_object(
      'id', r.id, 'title', r.title, 'status', r.status,
      'auto_end_at', r.auto_end_at, 'ended_at', r.ended_at, 'revision', r.revision
    ),
    'my_role', v_member.role,
    'my_last_seen_at', v_member.last_seen_at,
    'active_round', (
      select private.round_view(a, v_member) from private.rounds a
      where a.room_id = r.id and a.status = 'open'
    ),
    'latest_closed_round', (
      select private.round_view(c, v_member) from private.rounds c
      where c.room_id = r.id and c.status = 'closed'
      order by c.closed_at desc, c.id desc limit 1
    ),
    'pending_question_count', (
      select count(*) from private.questions q where q.room_id = r.id and q.status = 'pending'
    ),
    'current_connected_students', case when v_member.role = 'host' then (
      select count(*) from private.room_members m
      where m.room_id = r.id and m.role = 'student' and m.last_seen_at >= now() - interval '45 seconds'
    ) end,
    'questions_page', coalesce((
      select jsonb_agg(private.question_card(x.q, v_member.id) order by x.rn)
      from ranked x where x.rn > p_offset and x.rn <= p_offset + p_limit
    ), '[]'::jsonb),
    'next_offset', case when exists (select 1 from ranked x where x.rn > p_offset + p_limit)
      then p_offset + p_limit end,
    'filter', p_filter,
    'sort', p_sort
  )
  into v_snapshot
  from private.rooms r
  where r.id = p_room_id;

  return private.ok(null, (v_snapshot -> 'room' ->> 'revision')::bigint, v_snapshot);
end;
$$;

-- RESP-02, RESP-03. 대상자 = 시작 시점 45초 내 heartbeat 학생.
create function public.start_round(p_room_id uuid, p_type text, p_action_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_req jsonb := jsonb_build_object('room_id', p_room_id, 'type', p_type);
  v_prev jsonb;
  v_member private.room_members;
  v_room private.rooms;
  v_round private.rounds;
  v_targets int;
  v_revision bigint;
begin
  if v_uid is null then
    return private.err('UNAUTHENTICATED');
  end if;
  v_prev := private.receipt_begin(v_uid, p_action_id, 'start_round', v_req);
  if v_prev is not null then
    return v_prev;
  end if;
  select * into v_member from private.room_members where room_id = p_room_id and auth_user_id = v_uid;
  if not found then
    return private.err('ROOM_UNAVAILABLE');
  end if;
  if v_member.role <> 'host' then
    return private.err('FORBIDDEN');
  end if;
  if p_type is null or p_type not in ('ready', 'understood', 'proceed') then
    return private.err('INVALID_INPUT');
  end if;

  select * into v_room from private.rooms where id = p_room_id for update;
  if private.end_room_if_due(p_room_id) or v_room.status <> 'open' then
    return private.err('ROOM_ENDED');
  end if;
  if exists (select 1 from private.rounds where room_id = p_room_id and status = 'open') then
    return private.err('ACTIVE_ROUND_EXISTS');
  end if;

  begin
    insert into private.rounds (room_id, type) values (p_room_id, p_type::private.round_type)
    returning * into v_round;
    insert into private.round_targets (room_id, round_id, member_id)
    select p_room_id, v_round.id, m.id
    from private.room_members m
    where m.room_id = p_room_id and m.role = 'student' and m.last_seen_at >= now() - interval '45 seconds';
    get diagnostics v_targets = row_count;
    if v_targets = 0 then
      raise exception using errcode = 'NS001';
    end if;
  exception when sqlstate 'NS001' then
    return private.err('NO_CONNECTED_STUDENTS');
  end;

  v_revision := private.bump(p_room_id, 'round_started');
  return private.receipt_save(v_uid, p_action_id, p_room_id, 'start_round', v_req,
    private.ok(p_action_id, v_revision, jsonb_build_object(
      'round', jsonb_build_object('id', v_round.id, 'type', v_round.type, 'opened_at', v_round.opened_at),
      'target_count', v_targets
    )));
end;
$$;

-- RESP-03. 첫 응답 expected_version=0 → 1, 변경마다 +1. 같은 값은 변화 없음.
create function public.set_response(p_round_id uuid, p_choice text, p_expected_version int, p_action_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_req jsonb := jsonb_build_object('round_id', p_round_id, 'choice', p_choice, 'expected_version', p_expected_version);
  v_prev jsonb;
  v_retry int;
  v_room_id uuid;
  v_member private.room_members;
  v_room private.rooms;
  v_round private.rounds;
  v_response private.responses;
  v_current int;
  v_revision bigint;
begin
  if v_uid is null then
    return private.err('UNAUTHENTICATED');
  end if;
  v_prev := private.receipt_begin(v_uid, p_action_id, 'set_response', v_req);
  if v_prev is not null then
    return v_prev;
  end if;
  v_retry := private.click_limited('response', v_uid);
  if v_retry > 0 then
    return private.err('RATE_LIMITED', true, jsonb_build_object('retry_after_seconds', v_retry));
  end if;

  select room_id into v_room_id from private.rounds where id = p_round_id;
  if not found then
    return private.err('ROOM_UNAVAILABLE');
  end if;
  select * into v_member from private.room_members where room_id = v_room_id and auth_user_id = v_uid;
  if not found then
    return private.err('ROOM_UNAVAILABLE');
  end if;
  if v_member.role <> 'student' then
    return private.err('FORBIDDEN');
  end if;
  if p_choice is null or p_choice not in ('yes', 'no') or p_expected_version is null or p_expected_version < 0 then
    return private.err('INVALID_INPUT');
  end if;

  select * into v_room from private.rooms where id = v_room_id for update;
  if private.end_room_if_due(v_room_id) or v_room.status <> 'open' then
    return private.err('ROOM_ENDED');
  end if;
  select * into v_round from private.rounds where id = p_round_id for update;
  if v_round.status <> 'open' then
    return private.err('ROUND_CLOSED');
  end if;
  if not exists (
    select 1 from private.round_targets where round_id = p_round_id and member_id = v_member.id
  ) then
    return private.err('NOT_ROUND_TARGET');
  end if;

  select * into v_response from private.responses
  where round_id = p_round_id and member_id = v_member.id
  for update;
  v_current := coalesce(v_response.version, 0);
  if p_expected_version <> v_current then
    return private.err('VERSION_CONFLICT', false,
      jsonb_build_object('my_choice', v_response.choice, 'version', v_current));
  end if;

  if v_response.choice::text = p_choice then
    return private.receipt_save(v_uid, p_action_id, v_room_id, 'set_response', v_req,
      private.ok(p_action_id, v_room.revision,
        jsonb_build_object('round_id', p_round_id, 'my_choice', v_response.choice, 'version', v_current)));
  end if;

  insert into private.responses (round_id, member_id, choice, version)
  values (p_round_id, v_member.id, p_choice::private.choice, 1)
  on conflict (round_id, member_id) do update
    set choice = excluded.choice,
        version = private.responses.version + 1,
        updated_at = now()
  returning * into v_response;

  v_revision := private.bump(v_room_id, 'response_changed');
  return private.receipt_save(v_uid, p_action_id, v_room_id, 'set_response', v_req,
    private.ok(p_action_id, v_revision,
      jsonb_build_object('round_id', p_round_id, 'my_choice', v_response.choice, 'version', v_response.version)));
end;
$$;

-- RESP-03. 이미 닫힌 회차의 동일 의도는 성공으로 반환.
create function public.close_round(p_round_id uuid, p_action_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_req jsonb := jsonb_build_object('round_id', p_round_id);
  v_prev jsonb;
  v_room_id uuid;
  v_member private.room_members;
  v_room private.rooms;
  v_round private.rounds;
  v_revision bigint;
begin
  if v_uid is null then
    return private.err('UNAUTHENTICATED');
  end if;
  v_prev := private.receipt_begin(v_uid, p_action_id, 'close_round', v_req);
  if v_prev is not null then
    return v_prev;
  end if;
  select room_id into v_room_id from private.rounds where id = p_round_id;
  if not found then
    return private.err('ROOM_UNAVAILABLE');
  end if;
  select * into v_member from private.room_members where room_id = v_room_id and auth_user_id = v_uid;
  if not found then
    return private.err('ROOM_UNAVAILABLE');
  end if;
  if v_member.role <> 'host' then
    return private.err('FORBIDDEN');
  end if;

  select * into v_room from private.rooms where id = v_room_id for update;
  perform private.end_room_if_due(v_room_id);
  select * into v_round from private.rounds where id = p_round_id for update;
  if v_round.status = 'closed' then
    select * into v_room from private.rooms where id = v_room_id;
    return private.receipt_save(v_uid, p_action_id, v_room_id, 'close_round', v_req,
      private.ok(p_action_id, v_room.revision, jsonb_build_object('round', private.round_host_view(v_round))));
  end if;

  update private.rounds set status = 'closed', closed_at = now()
  where id = p_round_id
  returning * into v_round;
  v_revision := private.bump(v_room_id, 'round_closed');

  return private.receipt_save(v_uid, p_action_id, v_room_id, 'close_round', v_req,
    private.ok(p_action_id, v_revision, jsonb_build_object('round', private.round_host_view(v_round))));
end;
$$;

-- Q-01. 1~200 code point, 10초 간격, 학생당 20개, 방당 300개(숨김 포함).
create function public.create_question(p_room_id uuid, p_body text, p_action_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_req jsonb := jsonb_build_object('room_id', p_room_id, 'body', p_body);
  v_prev jsonb;
  v_member private.room_members;
  v_room private.rooms;
  v_body text;
  v_last timestamptz;
  v_question private.questions;
  v_revision bigint;
begin
  if v_uid is null then
    return private.err('UNAUTHENTICATED');
  end if;
  v_prev := private.receipt_begin(v_uid, p_action_id, 'create_question', v_req);
  if v_prev is not null then
    return v_prev;
  end if;
  select * into v_member from private.room_members where room_id = p_room_id and auth_user_id = v_uid;
  if not found then
    return private.err('ROOM_UNAVAILABLE');
  end if;
  if v_member.role <> 'student' then
    return private.err('FORBIDDEN');
  end if;
  v_body := private.trim_text(p_body);
  if v_body is null or char_length(v_body) > 200 then
    return private.err('INVALID_INPUT');
  end if;

  select * into v_room from private.rooms where id = p_room_id for update;
  if private.end_room_if_due(p_room_id) or v_room.status <> 'open' then
    return private.err('ROOM_ENDED');
  end if;

  select max(created_at) into v_last from private.questions where author_member_id = v_member.id;
  if v_last is not null and v_last > now() - interval '10 seconds' then
    return private.err('RATE_LIMITED', true, jsonb_build_object(
      'retry_after_seconds', greatest(1, ceil(extract(epoch from (v_last + interval '10 seconds' - now()))))::int));
  end if;
  if (select count(*) from private.questions where author_member_id = v_member.id) >= 20
     or (select count(*) from private.questions where room_id = p_room_id) >= 300 then
    return private.err('QUESTION_LIMIT_REACHED');
  end if;

  insert into private.questions (room_id, author_member_id, body)
  values (p_room_id, v_member.id, v_body)
  returning * into v_question;
  v_revision := private.bump(p_room_id, 'question_created');

  return private.receipt_save(v_uid, p_action_id, p_room_id, 'create_question', v_req,
    private.ok(p_action_id, v_revision, private.question_card(v_question, v_member.id)));
end;
$$;

-- Q-03. toggle이 아니라 원하는 상태(desired)를 보낸다.
create function public.set_reaction(p_question_id uuid, p_desired boolean, p_action_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_req jsonb := jsonb_build_object('question_id', p_question_id, 'desired', p_desired);
  v_prev jsonb;
  v_retry int;
  v_room_id uuid;
  v_member private.room_members;
  v_room private.rooms;
  v_question private.questions;
  v_changed int;
  v_revision bigint;
begin
  if v_uid is null then
    return private.err('UNAUTHENTICATED');
  end if;
  v_prev := private.receipt_begin(v_uid, p_action_id, 'set_reaction', v_req);
  if v_prev is not null then
    return v_prev;
  end if;
  v_retry := private.click_limited('reaction', v_uid);
  if v_retry > 0 then
    return private.err('RATE_LIMITED', true, jsonb_build_object('retry_after_seconds', v_retry));
  end if;

  select room_id into v_room_id from private.questions where id = p_question_id;
  if not found then
    return private.err('QUESTION_UNAVAILABLE');
  end if;
  select * into v_member from private.room_members where room_id = v_room_id and auth_user_id = v_uid;
  if not found then
    return private.err('ROOM_UNAVAILABLE');
  end if;
  if v_member.role <> 'student' then
    return private.err('FORBIDDEN');
  end if;
  if p_desired is null then
    return private.err('INVALID_INPUT');
  end if;

  select * into v_room from private.rooms where id = v_room_id for update;
  if private.end_room_if_due(v_room_id) or v_room.status <> 'open' then
    return private.err('ROOM_ENDED');
  end if;
  select * into v_question from private.questions where id = p_question_id for update;
  if v_question.status = 'hidden' then
    return private.err('QUESTION_UNAVAILABLE');
  end if;
  if v_question.status <> 'pending' then
    return private.err('QUESTION_NOT_PENDING');
  end if;
  if v_question.author_member_id = v_member.id then
    return private.err('SELF_REACTION_NOT_ALLOWED');
  end if;

  if p_desired then
    insert into private.question_reactions (room_id, question_id, member_id)
    values (v_room_id, p_question_id, v_member.id)
    on conflict do nothing;
  else
    delete from private.question_reactions where question_id = p_question_id and member_id = v_member.id;
  end if;
  get diagnostics v_changed = row_count;

  v_revision := case when v_changed > 0 then private.bump(v_room_id, 'reaction_changed') else v_room.revision end;
  return private.receipt_save(v_uid, p_action_id, v_room_id, 'set_reaction', v_req,
    private.ok(p_action_id, v_revision, jsonb_build_object(
      'question_id', p_question_id,
      'reacted_by_me', p_desired,
      'reaction_count', (select count(*) from private.question_reactions where question_id = p_question_id)
    )));
end;
$$;

-- Q-04. pending ↔ answered (강사). 같은 상태 요청은 변화 없음.
create function public.set_question_status(
  p_question_id uuid, p_desired_status text, p_expected_version int, p_action_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_req jsonb := jsonb_build_object('question_id', p_question_id, 'desired_status', p_desired_status,
    'expected_version', p_expected_version);
  v_prev jsonb;
  v_room_id uuid;
  v_member private.room_members;
  v_room private.rooms;
  v_question private.questions;
  v_revision bigint;
begin
  if v_uid is null then
    return private.err('UNAUTHENTICATED');
  end if;
  v_prev := private.receipt_begin(v_uid, p_action_id, 'set_question_status', v_req);
  if v_prev is not null then
    return v_prev;
  end if;
  select room_id into v_room_id from private.questions where id = p_question_id;
  if not found then
    return private.err('QUESTION_UNAVAILABLE');
  end if;
  select * into v_member from private.room_members where room_id = v_room_id and auth_user_id = v_uid;
  if not found then
    return private.err('ROOM_UNAVAILABLE');
  end if;
  if v_member.role <> 'host' then
    return private.err('FORBIDDEN');
  end if;
  if p_desired_status is null or p_desired_status not in ('pending', 'answered') or p_expected_version is null then
    return private.err('INVALID_INPUT');
  end if;

  select * into v_room from private.rooms where id = v_room_id for update;
  if private.end_room_if_due(v_room_id) or v_room.status <> 'open' then
    return private.err('ROOM_ENDED');
  end if;
  select * into v_question from private.questions where id = p_question_id for update;
  if v_question.status = 'hidden' then
    return private.err('QUESTION_UNAVAILABLE');
  end if;
  if v_question.version <> p_expected_version then
    return private.err('VERSION_CONFLICT', false,
      jsonb_build_object('status', v_question.status, 'version', v_question.version));
  end if;
  if v_question.status::text = p_desired_status then
    return private.receipt_save(v_uid, p_action_id, v_room_id, 'set_question_status', v_req,
      private.ok(p_action_id, v_room.revision,
        jsonb_build_object('question_id', p_question_id, 'status', v_question.status, 'version', v_question.version)));
  end if;

  update private.questions
  set status = p_desired_status::private.question_status,
      answered_at = case when p_desired_status = 'answered' then now() end,
      version = version + 1
  where id = p_question_id
  returning * into v_question;
  v_revision := private.bump(v_room_id, 'question_status_changed');

  return private.receipt_save(v_uid, p_action_id, v_room_id, 'set_question_status', v_req,
    private.ok(p_action_id, v_revision,
      jsonb_build_object('question_id', p_question_id, 'status', v_question.status, 'version', v_question.version)));
end;
$$;

-- Q-04. 숨김은 복구 불가. 이후 snapshot에서 본문 제외.
create function public.hide_question(p_question_id uuid, p_expected_version int, p_action_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_req jsonb := jsonb_build_object('question_id', p_question_id, 'expected_version', p_expected_version);
  v_prev jsonb;
  v_room_id uuid;
  v_member private.room_members;
  v_room private.rooms;
  v_question private.questions;
  v_revision bigint;
begin
  if v_uid is null then
    return private.err('UNAUTHENTICATED');
  end if;
  v_prev := private.receipt_begin(v_uid, p_action_id, 'hide_question', v_req);
  if v_prev is not null then
    return v_prev;
  end if;
  select room_id into v_room_id from private.questions where id = p_question_id;
  if not found then
    return private.err('QUESTION_UNAVAILABLE');
  end if;
  select * into v_member from private.room_members where room_id = v_room_id and auth_user_id = v_uid;
  if not found then
    return private.err('ROOM_UNAVAILABLE');
  end if;
  if v_member.role <> 'host' then
    return private.err('FORBIDDEN');
  end if;
  if p_expected_version is null then
    return private.err('INVALID_INPUT');
  end if;

  select * into v_room from private.rooms where id = v_room_id for update;
  if private.end_room_if_due(v_room_id) or v_room.status <> 'open' then
    return private.err('ROOM_ENDED');
  end if;
  select * into v_question from private.questions where id = p_question_id for update;
  if v_question.status = 'hidden' then
    return private.receipt_save(v_uid, p_action_id, v_room_id, 'hide_question', v_req,
      private.ok(p_action_id, v_room.revision,
        jsonb_build_object('question_id', p_question_id, 'status', 'hidden', 'version', v_question.version)));
  end if;
  if v_question.version <> p_expected_version then
    return private.err('VERSION_CONFLICT', false,
      jsonb_build_object('status', v_question.status, 'version', v_question.version));
  end if;

  update private.questions
  set status = 'hidden', hidden_at = now(), version = version + 1
  where id = p_question_id
  returning * into v_question;
  v_revision := private.bump(v_room_id, 'question_hidden');

  return private.receipt_save(v_uid, p_action_id, v_room_id, 'hide_question', v_req,
    private.ok(p_action_id, v_revision,
      jsonb_build_object('question_id', p_question_id, 'status', 'hidden', 'version', v_question.version)));
end;
$$;

-- ROOM-03. 활성 요청을 같은 트랜잭션에서 종료. 이미 종료면 성공.
create function public.end_room(p_room_id uuid, p_action_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_req jsonb := jsonb_build_object('room_id', p_room_id);
  v_prev jsonb;
  v_member private.room_members;
  v_room private.rooms;
  v_revision bigint;
begin
  if v_uid is null then
    return private.err('UNAUTHENTICATED');
  end if;
  v_prev := private.receipt_begin(v_uid, p_action_id, 'end_room', v_req);
  if v_prev is not null then
    return v_prev;
  end if;
  select * into v_member from private.room_members where room_id = p_room_id and auth_user_id = v_uid;
  if not found then
    return private.err('ROOM_UNAVAILABLE');
  end if;
  if v_member.role <> 'host' then
    return private.err('FORBIDDEN');
  end if;

  select * into v_room from private.rooms where id = p_room_id for update;
  perform private.end_room_if_due(p_room_id);
  select * into v_room from private.rooms where id = p_room_id;
  if v_room.status = 'ended' then
    return private.receipt_save(v_uid, p_action_id, p_room_id, 'end_room', v_req,
      private.ok(p_action_id, v_room.revision, jsonb_build_object('ended_at', v_room.ended_at)));
  end if;

  update private.rooms set status = 'ended', ended_at = now()
  where id = p_room_id
  returning * into v_room;
  update private.rounds set status = 'closed', closed_at = now()
  where room_id = p_room_id and status = 'open';
  v_revision := private.bump(p_room_id, 'room_ended');

  return private.receipt_save(v_uid, p_action_id, p_room_id, 'end_room', v_req,
    private.ok(p_action_id, v_revision, jsonb_build_object('ended_at', v_room.ended_at)));
end;
$$;

-- ───────── 권한 ─────────
-- private 함수는 아무도 직접 실행하지 못한다. 공개 RPC는 authenticated(익명 로그인 포함)만.

revoke all on all functions in schema private from public, anon, authenticated;

do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.create_room(text, text, uuid)',
    'public.join_room(text, uuid)',
    'public.heartbeat(uuid)',
    'public.get_snapshot(uuid, text, text, int, int)',
    'public.start_round(uuid, text, uuid)',
    'public.set_response(uuid, text, int, uuid)',
    'public.close_round(uuid, uuid)',
    'public.create_question(uuid, text, uuid)',
    'public.set_reaction(uuid, boolean, uuid)',
    'public.set_question_status(uuid, text, int, uuid)',
    'public.hide_question(uuid, int, uuid)',
    'public.end_room(uuid, uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', v_fn);
    execute format('grant execute on function %s to authenticated', v_fn);
  end loop;
end;
$$;
