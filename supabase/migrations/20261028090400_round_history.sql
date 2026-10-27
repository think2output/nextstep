-- 강사용 지난 확인 기록 (사용자 피드백: 이전 요청에 수강생이 어떻게 응답했는지 보기)
-- 집계만 돌려준다. 개별 학생 선택·식별 정보 없음 (Q-02).

create function public.get_round_history(p_room_id uuid, p_limit int default 10)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_member private.room_members;
  v_room private.rooms;
begin
  if v_uid is null then
    return private.err('UNAUTHENTICATED');
  end if;
  select * into v_member from private.room_members where room_id = p_room_id and auth_user_id = v_uid;
  if not found then
    return private.err('ROOM_UNAVAILABLE');
  end if;
  if v_member.role <> 'host' then
    return private.err('FORBIDDEN');
  end if;
  if p_limit is null or p_limit not between 1 and 50 then
    return private.err('INVALID_INPUT');
  end if;
  select * into v_room from private.rooms where id = p_room_id;
  if private.is_expired(v_room) then
    return private.err('ROOM_EXPIRED');
  end if;

  return private.ok(null, v_room.revision, jsonb_build_object(
    'rounds', coalesce((
      select jsonb_agg(private.round_host_view(r) order by r.closed_at desc, r.id desc)
      from (
        select * from private.rounds
        where room_id = p_room_id and status = 'closed'
        order by closed_at desc, id desc
        limit p_limit
      ) r
    ), '[]'::jsonb)
  ));
end;
$$;

revoke all on function public.get_round_history(uuid, int) from public, anon;
grant execute on function public.get_round_history(uuid, int) to authenticated;
