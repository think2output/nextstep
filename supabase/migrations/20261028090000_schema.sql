-- 다음으로 v1 데이터 모델 (PRD 14장)
-- 원본 데이터는 API에 노출되지 않는 private 스키마에 둔다 (PRD 13.3).
-- 클라이언트는 public 스키마의 허용 RPC로만 접근한다 (20261028090100_rpc.sql).

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create type private.room_status as enum ('open', 'ended');
create type private.member_role as enum ('host', 'student');
create type private.round_type as enum ('ready', 'understood', 'proceed');
create type private.round_status as enum ('open', 'closed');
create type private.choice as enum ('yes', 'no');
create type private.question_status as enum ('pending', 'answered', 'hidden');

-- ROOM-01, ROOM-03
create table private.rooms (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 30),
  join_code text not null unique check (join_code ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$'),
  host_auth_id uuid not null,
  status private.room_status not null default 'open',
  created_at timestamptz not null default now(),
  auto_end_at timestamptz not null,
  ended_at timestamptz,
  revision bigint not null default 0,
  check ((status = 'ended') = (ended_at is not null))
);
-- 강사 한 세션은 열린 방 1개만
create unique index rooms_one_open_per_host on private.rooms (host_auth_id) where status = 'open';
create index rooms_status_auto_end on private.rooms (status, auto_end_at);
create index rooms_ended_at on private.rooms (ended_at);

-- ROOM-02
create table private.room_members (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references private.rooms (id) on delete cascade,
  auth_user_id uuid not null,
  role private.member_role not null,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (room_id, auth_user_id),
  unique (room_id, id)
);
create unique index room_members_one_host on private.room_members (room_id) where role = 'host';
create index room_members_room_last_seen on private.room_members (room_id, last_seen_at);

-- RESP-01, RESP-03: 방당 열린 요청 1개
create table private.rounds (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references private.rooms (id) on delete cascade,
  type private.round_type not null,
  status private.round_status not null default 'open',
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  check ((status = 'closed') = (closed_at is not null)),
  unique (room_id, id)
);
create unique index rounds_one_open_per_room on private.rounds (room_id) where status = 'open';
create index rounds_room_opened on private.rounds (room_id, opened_at desc);

-- RESP-02: 요청 시작 시 고정한 대상자 = 분모. 같은 방 멤버만 (composite FK)
create table private.round_targets (
  room_id uuid not null,
  round_id uuid not null,
  member_id uuid not null,
  primary key (round_id, member_id),
  foreign key (room_id, round_id) references private.rounds (room_id, id) on delete cascade,
  foreign key (room_id, member_id) references private.room_members (room_id, id) on delete cascade
);

-- RESP-03: 대상자만 응답 가능 (target FK). 미응답은 행이 없는 것이다 — yes/no로 저장하지 않는다.
create table private.responses (
  round_id uuid not null,
  member_id uuid not null,
  choice private.choice not null,
  version int not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (round_id, member_id),
  foreign key (round_id, member_id) references private.round_targets (round_id, member_id) on delete cascade
);

-- Q-01, Q-04
create table private.questions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null,
  author_member_id uuid not null,
  body text not null check (char_length(body) between 1 and 200),
  status private.question_status not null default 'pending',
  version int not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  hidden_at timestamptz,
  foreign key (room_id, author_member_id) references private.room_members (room_id, id) on delete cascade,
  unique (room_id, id)
);
create index questions_room_status_created on private.questions (room_id, status, created_at desc);
create index questions_author on private.questions (author_member_id, created_at desc);

-- Q-03: 질문당 한 세션 한 번, 같은 방, 자가 공감 금지(트리거)
create table private.question_reactions (
  room_id uuid not null,
  question_id uuid not null,
  member_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (question_id, member_id),
  foreign key (room_id, question_id) references private.questions (room_id, id) on delete cascade,
  foreign key (room_id, member_id) references private.room_members (room_id, id) on delete cascade
);
create index question_reactions_question on private.question_reactions (question_id);

create function private.forbid_self_reaction() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from private.questions q
    where q.id = new.question_id and q.author_member_id = new.member_id
  ) then
    raise exception 'SELF_REACTION_NOT_ALLOWED';
  end if;
  return new;
end;
$$;

create trigger question_reactions_no_self
before insert on private.question_reactions
for each row execute function private.forbid_self_reaction();

-- 15.3 멱등성: 같은 action_id 재시도는 최초 확정 결과 반환
create table private.action_receipts (
  auth_user_id uuid not null,
  action_id uuid not null,
  room_id uuid references private.rooms (id) on delete cascade,
  operation text not null,
  request_hash text not null,
  response_json jsonb not null,
  created_at timestamptz not null default now(),
  primary key (auth_user_id, action_id)
);
create index action_receipts_created on private.action_receipts (created_at);

-- 17.3 생성·참여 시도 제한 카운터
create table private.pilot_access_limits (
  key_hash text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (key_hash, window_start)
);

-- 서버 전용 설정 (파일럿 생성 코드의 bcrypt 해시 등). 값은 migration에 넣지 않고 운영자가 직접 설정한다.
create table private.app_secrets (
  name text primary key,
  value text not null
);

revoke all on all tables in schema private from public, anon, authenticated;
