-- 방 정원 30명 → 50명 (PRD v1.12 6.x·17장, D-045. 사용자: 한 수업 50명).
-- join_room 본문은 20261028090100_rpc.sql과 같고 정원 숫자만 바뀐다. create or replace라 기존 실행 권한(authenticated)은 유지된다.

create or replace function public.join_room(p_code text, p_action_id uuid)
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
  if (select count(*) from private.room_members where room_id = v_room.id and role = 'student') >= 50 then
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
