# 아키텍처 요약

PRD 13~16장 요약. 충돌 시 `docs/PRD.md` 우선. 구현이 진행되면 실제 구조로 갱신한다.

## 1. 구성

```
[학생/강사 브라우저 원래 탭] ── 상태 저장소 1개 ── [Document PiP 창]
        │  (인증·구독·heartbeat 1세트 공유)
        ▼
  Supabase
   ├─ Auth (익명 세션)
   ├─ RPC (public schema의 허용 함수만, authenticated)
   │    └─ private schema 원본 테이블 (직접 접근 차단)
   ├─ Edge Function: create_room (파일럿 코드 해시 + JWT 검증 → 내부 함수)
   └─ Realtime private 채널 room:<room_uuid> (서버 발신 전용, 멤버만 receive)
```

원칙: **DB가 진실의 원천, Realtime은 "바뀌었다" 알림만.** 클라이언트는 알림 수신 → snapshot 재조회.

## 2. 데이터 모델 (PRD 14)

| 테이블 | 핵심 |
|---|---|
| rooms | join_code unique, status open/ended, revision, host당 열린 방 1개 |
| room_members | unique(room_id, auth_user_id), role host/student, last_seen_at(서버 시각) |
| rounds | type ready/understood/proceed, 방당 open 1개 (partial unique) |
| round_targets | 요청 시작 시 45초 내 heartbeat 학생 고정 = 분모 |
| responses | PK(round_id, member_id), choice yes/no, version |
| questions | body 1~200 code point, status pending/answered/hidden, version(초기 1) |
| question_reactions | PK(question_id, member_id), 자가 공감 금지 |
| action_receipts | unique(auth_user_id, action_id) 멱등성 |
| pilot_access_limits | 생성·참여 rate limit 카운터 |
| telemetry | 허용 이벤트만, 본문·코드·token 제외 |

잠금 순서: room → round → question. heartbeat·telemetry·receipt는 revision 증가 없음.

## 3. 서버 함수 (PRD 15.2)

create_room, join_room, heartbeat, get_snapshot, start_round, set_response, close_round,
create_question, set_reaction, set_question_status, hide_question, end_room.

공통 응답: `{ ok, action_id, server_time, room_revision, data }` / `{ ok:false, error:{code, retryable, message_key}, server_time }`.

## 4. 오류 코드 (PRD 15.5)

UNAUTHENTICATED, FORBIDDEN, INVALID_INPUT, ROOM_UNAVAILABLE, ROOM_ENDED, ROOM_EXPIRED, ROOM_FULL,
ACTIVE_ROOM_EXISTS, ACTIVE_ROUND_EXISTS, NO_CONNECTED_STUDENTS, ROUND_CLOSED, NOT_ROUND_TARGET,
QUESTION_UNAVAILABLE, QUESTION_NOT_PENDING, SELF_REACTION_NOT_ALLOWED, RATE_LIMITED,
QUESTION_LIMIT_REACHED, VERSION_CONFLICT, ACTION_ID_REUSED, INTERNAL_ERROR.

## 5. Broadcast (PRD 16)

```json
{ "event": "room_changed", "payload": { "room_id": "uuid", "revision": 13, "kind": "response_changed", "server_time": "..." } }
```
kind: round_started, response_changed, round_closed, question_created, reaction_changed,
question_status_changed, question_hidden, room_ended, membership_changed.

클라이언트 규칙: revision ≤ 현재 → 무시 / 더 크면 150ms debounce(최대 500ms) 후 snapshot / 받은 snapshot이 더 오래되면 폐기 / 30초마다 revision 재확인.

## 6. 클라이언트 상태 (PRD 12.1)

| 객체 | 상태 |
|---|---|
| 연결 | connecting / live / reconnecting / unavailable |
| 쓰기 | idle / sending / confirmed / unknown / rejected |
| PiP | unsupported / closed / opening / open / failed |

재연결 순서: 인증 복원 → 구독 → snapshot → revision 확인 → 쓰기 활성. 재시도 1·2·4·8·15초 + 지터.

## 7. 주요 수치 (초기 기본값)

정원 학생 30 / 수업명 1~30자 / 질문 1~200자 / heartbeat 15초, 미확인 45초 / 쓰기 타임아웃 8초 /
방 최대 12시간 / 종료 후 읽기 24시간, 25시간 내 삭제 / 질문 10초 간격, 학생 20개, 방 300개 /
PiP 기본 240×160, 더 작게 200×120, 질문 380×480 (PRD v1.1).
