# 아키텍처 (실제 구현 기준)

PRD 13~16장을 구현한 현재 구조. 충돌 시 `docs/PRD.md`(v1.4)가 우선이며, 구현을 바꾸면 이 문서도 갱신한다.

## 1. 구성

```
브라우저 (같은 프로필 = 같은 익명 세션)
 ├─ 원래 탭 RoomPage ─┐
 │                    ├─ useRoom (상태 저장소 1개: snapshot·구독·heartbeat 1세트, PIP-02)
 └─ Document PiP 창 ──┘   PiP 내용은 React portal로 같은 트리에서 렌더 (src/pip/usePip.ts)
        │
        ▼ supabase-js (publishable key + 익명 JWT)
Supabase (프로젝트 rumytuhqrrpdvtojokpz, Tokyo)
 ├─ Auth: 익명 로그인 (시간당 300/IP)
 ├─ public 스키마: SECURITY DEFINER RPC 14개 (authenticated만 실행)
 │    └─ private 스키마: 원본 테이블 (API 비노출, 직접 접근 권한 없음)
 ├─ Realtime private 채널 room:<room_uuid>: 서버만 발신(realtime.send), 멤버만 수신(RLS 정책)
 └─ pg_cron 'nextstep-purge-expired' 매시 7분: 자동 마감·24시간 경과 방 삭제·정리
```

원칙: **DB가 진실의 원천, Realtime은 "바뀌었다" 신호만.** 알림을 받으면 snapshot을 다시 읽는다. 클라이언트는 숫자를 더하지 않는다.

## 2. 코드 위치

| 경로 | 역할 |
|---|---|
| `src/App.tsx`, `src/app/router.ts` | 라우팅: `/` 시작, `/join?code=` 참여 링크, `/room/<uuid>` 방, `/gate` GATE-01 시험(lazy, 개발 모드에서만 D-030) |
| `src/pages/StartPage.tsx` | 참여 코드 입장, 강사 방 만들기(파일럿 코드) |
| `src/pages/RoomPage.tsx` | 방 원래 탭: 참여 코드 공유, 작은 창 열기, 웹 미리보기, 수업 리포트(RoomReport), 알림음 설정, 방 종료 |
| `src/room/useRoom.ts` | snapshot 조회(150ms debounce·최대 500ms), private 채널 구독, 15초 heartbeat, 쓰기 래퍼, 쓰기 잠금 |
| `src/room/PipView.tsx` | 작은 창 틀: 탭·정렬·연결 표시·크기 전환·재촉 테두리 |
| `src/room/AnswerViews.tsx` | 학생 응답(전송 중/미확인/다시 보내기), 강사 확인 보내기·집계(RoundStats)·재촉·종료 |
| `src/room/QuestionView.tsx` | 질문 탭: 학생 찾기+쓰기·🙋, 강사 필터·답변 완료·숨김, 순서 고정 |
| `src/room/useNudge.ts`, `src/lib/chime.ts` | 재촉 감지·알림음 |
| `src/lib/rpc.ts` | RPC 호출, 익명 세션 보장, 8초 타임아웃 → TIMEOUT |
| `src/shared/domain.ts` | 서버와 같은 enum·문구·오류 문구·snapshot 타입 |
| `src/shared/similar.ts` | 비슷한 질문 판정 |
| `src/pip/` | usePip(열기·스타일 복사·동기화), ScrollArea(직접 만든 스크롤 막대) |
| `src/styles/` | tokens.css(TDS 참고 토큰), app.css(`.pip-doc`·`.pv`·`.qv`는 작은 창, `.pip-frame`은 웹 미리보기) |
| `src/pip/useSideWindow.ts` | 옆 질문 보기 창(보통 팝업). 작은 창 기준 빈 쪽 배치, 원래 탭이 portal로 그림 (D-042) |
| `src/room/QuestionDetail.tsx`, `src/room/useQuestionActions.ts` | 옆 창 질문 원문·조작, 공감·답변 완료·숨기기 공통 로직 |
| `src/pages/RoomReport.tsx` | 강사 원래 탭 수업 리포트(get_round_history 50개 집계, D-044) |
| `scripts/pilot-code.mjs` | 운영자 코드 바꾸기(npm run pilot:new / pilot:set), 서버엔 bcrypt 해시 (D-046) |
| `src/gate/` | GATE-01 시험 전용(공개 채널, `?role=`) — 제품 코드에서 재사용 금지 |
| `supabase/migrations/` | 아래 3장 |
| `tests/db/` | 실제 프로젝트에 대고 도는 RPC·권한 테스트(vitest) |
| `tests/e2e/smoke.mjs` | 헤드리스 Chrome 화면 흐름 시험 |

## 3. Migration

| 파일 | 내용 |
|---|---|
| `20261028090000_schema.sql` | private 스키마·enum·테이블·제약·인덱스, 자가 공감 금지 트리거 |
| `20261028090100_rpc.sql` | 공통 함수(ok/err, 멱등성, 시도 제한, bump·알림, 자동 마감, snapshot 뷰) + 공개 RPC 12개 + 권한 |
| `20261028090200_realtime_cleanup.sql` | Realtime 수신 정책, purge_expired, pg_cron |
| `20261028090300_snapshot_join_code.sql` | 강사 snapshot에 join_code |
| `20261028090400_round_history.sql` | get_round_history (강사, 집계만) |
| `20261028090500_nudge.sql` | rounds.nudge_count, nudge_round, 학생 뷰에 미응답일 때만 nudge_count |

이미 적용된 migration은 고치지 않는다. 바꿀 때는 새 파일(`create or replace`)로.

## 4. 데이터 모델 (private)

| 테이블 | 핵심 |
|---|---|
| rooms | join_code unique(8자, 혼동 문자 제외), status open/ended, revision, host당 열린 방 1개, auto_end_at=생성+12h |
| room_members | unique(room_id, auth_user_id), role host/student, 방당 host 1, last_seen_at(서버 시각) |
| rounds | type ready/understood/proceed, 방당 open 1개, nudge_count·last_nudged_at |
| round_targets | 시작 시 45초 내 heartbeat 학생 고정 = 분모 |
| responses | PK(round_id, member_id), target FK, choice yes/no, version. 미응답 = 행 없음 |
| questions | body 1~200 code point, status pending/answered/hidden, version(초기 1) |
| question_reactions | PK(question_id, member_id), 같은 방 composite FK, 자가 공감 금지 |
| action_receipts | PK(auth_user_id, action_id), 요청 해시·최초 응답 |
| pilot_access_limits | 시도 제한 카운터(고정 창) |
| app_secrets | pilot_code_hash(bcrypt). `npm run pilot:new`/`pilot:set`으로 바꿈 (D-046) |

telemetry(PRD 14)는 아직 없음. 잠금 순서: room → round → question.

## 5. 공개 RPC

| 함수 | 역할 | 권한 |
|---|---|---|
| create_room(p_title, p_pilot_code, p_action_id) | 방 생성 | 파일럿 코드, 시간당 3회, 열린 방 1개 |
| join_room(p_code, p_action_id) | 입장(재참여는 기존 멤버) | 실패 10분 10회 |
| heartbeat(p_room_id) | 연결 확인, revision 반환 | 멤버 |
| get_snapshot(p_room_id, p_filter, p_sort, p_offset, p_limit) | 역할별 snapshot (강사만 join_code·집계) | 멤버, 보관 기간 |
| get_round_history(p_room_id, p_limit) | 닫힌 확인 집계 목록 | 강사 |
| start_round / close_round / nudge_round | 확인 시작·종료·재촉 | 강사 |
| set_response(p_round_id, p_choice, p_expected_version, p_action_id) | 응답·변경 | 대상 학생 |
| create_question / set_reaction | 질문·공감 | 학생 |
| set_question_status / hide_question | 답변 완료·되돌리기·숨김 | 강사 |
| end_room | 방 종료 | 강사 |

응답 형식: `{ok:true, action_id, server_time, room_revision, data}` / `{ok:false, error:{code, retryable, message_key, data?}, server_time}`. 오류는 예외가 아니라 반환값(D-020).

## 6. Realtime

```json
{ "event": "room_changed", "payload": { "room_id": "uuid", "revision": 13, "kind": "response_changed", "server_time": "...", "id": "메시지 번호" } }
```
kind: round_started, response_changed, round_closed, round_nudged, question_created, reaction_changed, question_status_changed, question_hidden, room_ended, membership_changed.
payload에 본문·작성자·선택값 없음 (tests/db/security.test.ts로 검사).

클라이언트: revision ≤ 현재 → 무시 / 크면 debounce 후 snapshot / 받은 snapshot이 더 오래되면 폐기 / 구독 직후·포커스·online·heartbeat 응답 revision으로 누락 복구.

## 7. 주요 수치

정원 학생 50(v1.12) / 수업명 1~30자 / 질문 1~200자(10초 간격, 학생 20, 방 300) / heartbeat 15초, 미확인 45초 / 쓰기 타임아웃 8초 / 방 12시간, 종료 후 읽기 24시간 / 응답·공감·재촉 초당 3·분당 60 / 작은 창 240×160, 더 작게 200×120(질문 탭도 크기 유지) / 질문 목록 12px·줄 28px.
