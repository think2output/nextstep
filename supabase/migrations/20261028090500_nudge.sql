-- 재촉하기 (사용자 결정 D-028): 강사가 진행 중인 확인의 미응답자에게 알림.
-- 횟수 제한 없음(연타 방지만). 학생 snapshot에는 '내가 미응답일 때만' 재촉 횟수가 보인다.
-- 누가 미응답인지는 강사에게도 알려주지 않는다 (Q-02: 집계만).

alter table private.rounds
  add column nudge_count int not null default 0 check (nudge_count >= 0),
  add column last_nudged_at timestamptz;

create or replace function private.round_host_view(p_round private.rounds)
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
    'target_connection_unknown_count', t.unknown_count,
    'nudge_count', p_round.nudge_count,
    'last_nudged_at', p_round.last_nudged_at
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

create or replace function private.round_student_view(p_round private.rounds, p_member_id uuid)
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
    'is_target', x.is_target,
    'my_choice', x.my_choice,
    'my_response_version', coalesce(x.my_version, 0),
    -- 대상이면서 아직 응답하지 않은 학생에게만 재촉 횟수를 준다
    'nudge_count', case when x.is_target and x.my_choice is null and p_round.status = 'open'
      then p_round.nudge_count else 0 end
  )
  from (
    select
      exists (
        select 1 from private.round_targets rt
        where rt.round_id = p_round.id and rt.member_id = p_member_id
      ) as is_target,
      (select r.choice from private.responses r where r.round_id = p_round.id and r.member_id = p_member_id) as my_choice,
      (select r.version from private.responses r where r.round_id = p_round.id and r.member_id = p_member_id) as my_version
  ) x
$$;

create function public.nudge_round(p_round_id uuid, p_action_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_req jsonb := jsonb_build_object('round_id', p_round_id);
  v_prev jsonb;
  v_retry int;
  v_room_id uuid;
  v_member private.room_members;
  v_room private.rooms;
  v_round private.rounds;
  v_revision bigint;
begin
  if v_uid is null then
    return private.err('UNAUTHENTICATED');
  end if;
  v_prev := private.receipt_begin(v_uid, p_action_id, 'nudge_round', v_req);
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
  -- 횟수 제한은 없고 연타만 막는다 (초당 3회)
  v_retry := private.click_limited('nudge', v_uid);
  if v_retry > 0 then
    return private.err('RATE_LIMITED', true, jsonb_build_object('retry_after_seconds', v_retry));
  end if;

  select * into v_room from private.rooms where id = v_room_id for update;
  if private.end_room_if_due(v_room_id) or v_room.status <> 'open' then
    return private.err('ROOM_ENDED');
  end if;
  select * into v_round from private.rounds where id = p_round_id for update;
  if v_round.status <> 'open' then
    return private.err('ROUND_CLOSED');
  end if;

  update private.rounds
  set nudge_count = nudge_count + 1, last_nudged_at = now()
  where id = p_round_id
  returning * into v_round;
  v_revision := private.bump(v_room_id, 'round_nudged');

  return private.receipt_save(v_uid, p_action_id, v_room_id, 'nudge_round', v_req,
    private.ok(p_action_id, v_revision, jsonb_build_object(
      'round_id', p_round_id,
      'nudge_count', v_round.nudge_count,
      'unanswered_count', (private.round_host_view(v_round) ->> 'unanswered_count')::int
    )));
end;
$$;

revoke all on function public.nudge_round(uuid, uuid) from public, anon;
grant execute on function public.nudge_round(uuid, uuid) to authenticated;
revoke all on function private.round_host_view(private.rounds) from public, anon, authenticated;
revoke all on function private.round_student_view(private.rounds, uuid) from public, anon, authenticated;
