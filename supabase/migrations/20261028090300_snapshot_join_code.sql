-- 강사 snapshot에 참여 코드 포함 (S02: 새로고침 후에도 강사가 코드를 다시 볼 수 있게).
-- 학생에게는 주지 않는다. 시그니처가 같아 기존 권한(grant)은 유지된다.

create or replace function public.get_snapshot(
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
    ) || case when v_member.role = 'host' then jsonb_build_object('join_code', r.join_code) else '{}'::jsonb end,
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
