-- Realtime private 채널 권한 (PRD 13.4)과 보관 만료 정리 (PRD 17.4, ROOM-03)

-- 채널 room:<room_uuid> 는 그 방의 멤버이면서 보관 접근 기간 내일 때만 받을 수 있다.
-- 클라이언트 발신(insert) 정책은 만들지 않는다 → 서버의 변경 알림만 존재.
create function private.can_receive_room_topic(p_topic text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.room_members m
    join private.rooms r on r.id = m.room_id
    where m.auth_user_id = auth.uid()
      and p_topic = 'room:' || r.id::text
      and (r.status = 'open' or r.ended_at > now() - interval '24 hours')
  )
$$;

-- 정책 평가 시 authenticated가 이 함수 하나만 호출할 수 있도록 한다 (테이블 권한은 여전히 없음)
grant usage on schema private to authenticated;
revoke all on function private.can_receive_room_topic(text) from public, anon;
grant execute on function private.can_receive_room_topic(text) to authenticated;

create policy "room members receive room broadcasts"
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and private.can_receive_room_topic((select realtime.topic()))
);

-- 정기 정리: 자동 마감, 종료 24시간 경과 방 삭제(하위 데이터 cascade), 오래된 receipt·제한 카운터·익명 계정 정리
create function private.purge_expired()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room record;
  v_ended int := 0;
  v_deleted_rooms int;
  v_deleted_receipts int;
  v_deleted_limits int;
  v_deleted_users int := 0;
begin
  for v_room in
    select id from private.rooms where status = 'open' and auto_end_at <= now() for update
  loop
    if private.end_room_if_due(v_room.id) then
      v_ended := v_ended + 1;
    end if;
  end loop;

  delete from private.rooms where status = 'ended' and ended_at < now() - interval '24 hours';
  get diagnostics v_deleted_rooms = row_count;

  delete from private.action_receipts where room_id is null and created_at < now() - interval '48 hours';
  get diagnostics v_deleted_receipts = row_count;

  delete from private.pilot_access_limits where window_start < now() - interval '1 day';
  get diagnostics v_deleted_limits = row_count;

  -- 어떤 방에도 속하지 않고 48시간 지난 익명 계정. 실패해도 방 정리는 유지한다.
  begin
    delete from auth.users u
    where u.is_anonymous
      and coalesce(u.last_sign_in_at, u.created_at) < now() - interval '48 hours'
      and not exists (select 1 from private.room_members m where m.auth_user_id = u.id);
    get diagnostics v_deleted_users = row_count;
  exception when others then
    raise warning 'purge_expired: anonymous user cleanup failed: %', sqlerrm;
  end;

  return jsonb_build_object(
    'ended_rooms', v_ended,
    'deleted_rooms', v_deleted_rooms,
    'deleted_receipts', v_deleted_receipts,
    'deleted_limits', v_deleted_limits,
    'deleted_anonymous_users', v_deleted_users
  );
end;
$$;

revoke all on function private.purge_expired() from public, anon, authenticated;

create extension if not exists pg_cron;

-- 매시 7분. 종료 후 늦어도 25시간 안에 삭제된다.
select cron.schedule('nextstep-purge-expired', '7 * * * *', $$select private.purge_expired()$$);
