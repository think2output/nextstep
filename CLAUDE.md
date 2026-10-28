# CLAUDE.md — 다음으로(NextStep) 작업 규칙

이 파일은 이 저장소에서 작업하는 모든 AI 에이전트(Claude, Codex, Cursor 등)와 사람에게 적용되는 규칙이다.
`AGENTS.md`는 이 파일을 가리키는 진입점이다.

## 1. 먼저 읽을 것 (순서대로)

1. `docs/HANDOFF.md` — 이어서 할 일과 주의점 (시작 프롬프트).
2. `docs/STATUS.md` — 지금 어디까지 했고 다음에 무엇을 하는지. **작업 시작 전 반드시 확인.**
3. `docs/PRD.md` — 유일한 요구사항 원천(Single Source of Truth). 요구 ID(ROOM-01, RESP-02, AT17 등)로 참조.
4. `docs/architecture.md` — 실제 코드·migration·RPC 구조.
5. `docs/decisions.md` — 이미 내린 결정. 다시 논쟁하지 말고 바꾸려면 새 항목으로 기록.

PRD와 다른 문서가 충돌하면 **PRD가 우선**이다. 다른 문서를 PRD에 맞게 고친다.

## 2. 프로젝트 한 줄

젭 + VS Code로 실습하는 수강생이 Document Picture-in-Picture 작은 창에서 상태 응답·익명 질문·공감을 하고, 강사는 집계와 미답변 질문을 보는 데스크톱 웹 서비스.
스택(제안): React + TypeScript + Vite / Supabase(PostgreSQL, 익명 Auth, RPC, private Realtime Broadcast) / HTTPS 정적 호스팅.

## 3. 절대 규칙 (PRD 0.5, 23.2)

위반 시 PRD 변경(버전 업) 없이는 진행 금지.

1. 실제 다른 컴퓨터 간 통신이어야 한다. localStorage·역할 전환 데모로 대체 금지.
2. PiP를 일반 `window.open` 팝업으로 바꾸고 "항상 위"라고 주장 금지.
3. 미응답을 yes/no로 저장하거나 해석하지 않는다. 미응답 = 대상 인원 − 응답 행 수.
4. 응답 분모는 `round_targets`(요청 시작 시 고정). 실시간 연결 인원으로 바꾸지 않는다.
5. 새 회차에 이전 응답을 이월·재사용하지 않는다.
6. 서버 승인 전 "전달했어요"/성공 표시 금지. 8초 타임아웃은 "결과 미확인"이지 실패가 아니다.
7. `role`, `member_id`, `author_id`, `host_id`를 클라이언트 입력으로 신뢰하지 않는다. 서버가 `auth.uid()`로 유도.
8. private 원본 테이블을 클라이언트에 직접 노출 금지. 허용 RPC만 사용.
9. Broadcast payload에 질문 본문·작성자 ID·개별 choice·인증 정보 금지. 알림 → snapshot 재조회.
10. 다른 참여자(강사 포함)에게 작성자 식별 정보·개별 응답·멤버 목록을 내려주지 않는다.
11. 원래 탭과 PiP가 인증·구독·heartbeat를 중복 생성하지 않는다(상태 저장소 1개 공유).
12. 작은 창이 포커스를 자동으로 빼앗지 않는다. 자동 열기·자동 크기 변경·자동 탭 이동 금지. 점멸·소리는 재촉 알림에만 허용(PRD v1.4 8.3).
13. `service_role` key·파일럿 생성 코드를 프런트 코드·저장소·로그에 넣지 않는다.
14. 테스트 결과·사용자 발언·수치를 꾸며내지 않는다. 미측정은 "미측정"으로 쓴다.
15. 새 기능보다 P0 완주·검증이 우선. 제외 범위(PRD 3.3)는 구현하지 않는다.

## 4. 작업 방식

- 변경마다 관련 PRD 요구 ID를 커밋 메시지·PR·`docs/STATUS.md`에 연결한다. 예: `feat(resp): set_response 멱등 처리 [RESP-03, AT26]`
- 요구사항이 모호하면 추측으로 채우지 말고 `docs/STATUS.md`의 "열린 질문"에 적고 사람에게 묻는다.
- PRD의 수치·정책(30명, 200자, 24시간, 45초 등)을 바꾸려면 `docs/PRD.md` 변경 이력 + `docs/decisions.md` 기록이 먼저다.
- 변경 후 관련 인수 테스트(AT)를 우선 실행하고, 결과·미검증 범위를 `docs/test-report.md`에 기록한다.
- 실행해 보지 않은 명령을 README에 "확인됨"으로 쓰지 않는다.
- AI가 만든 오류를 발견·수정했으면 `docs/ai-log.md`에 기록한다.
- 의미 있는 사용자 프롬프트(기획·설계·구현 방향을 정한 것)는 `docs/prompts.md`에 원문으로 추가한다.
- 저장소는 **공개**다. 커밋 전 비밀키·파일럿 코드·실명·실제 질문 원문이 없는지 확인한다.
- 작업 종료 시 `docs/STATUS.md`와 `docs/HANDOFF.md`를 갱신한다(다음 에이전트 인수인계용).
- 사용자에게는 쉬운 한국어로 짧게 설명한다. 큰 UI 변경은 사용자가 원하면 코드 전에 그림과 선택지로 먼저 합의한다.

## 5. 코드 규칙

- 공통 enum·타입·문구 매핑은 `src/shared/`에 한 곳만 둔다(요청 type, choice, 오류 코드, 상태). 서버 SQL과 값이 일치해야 한다.
- 문자열 길이는 code point 기준: JS `Array.from(s.trim()).length`, DB `char_length`와 동일 판정(AT30).
- 쓰기 RPC는 모두 `action_id`(UUID, 의도당 1개, 재시도 시 동일) 필수.
- DB 잠금 순서 고정: room → round → question.
- SECURITY DEFINER 함수: `set search_path = ''`, 완전 수식 테이블명, 최소 실행 권한, `auth.uid()` 확인.
- 사용자 입력은 텍스트로만 렌더링. `dangerouslySetInnerHTML`·Markdown 렌더·링크 자동화 금지.
- 시간: DB는 timestamptz UTC, 화면은 Asia/Seoul. 판정은 서버 시각 기준.
- 라이브러리 버전은 lockfile로 고정. 문서에 미확인 버전을 적지 않는다.

## 6. 폴더

```
docs/            PRD, 설계, 결정, 테스트 결과, AI 로그, 진행 상태
src/             프런트엔드 (React + TS + Vite)
src/gate/        GATE-01 시험 페이지 (시험 전용, 제품 코드 아님)
src/pip/         PiP 공통 (usePip, ScrollArea)
src/room/        방 상태(useRoom)·작은 창 화면(PipView, AnswerViews, QuestionView)·옆 질문 보기(QuestionDetail)
src/pages/       StartPage, RoomPage
src/styles/      tokens.css, app.css
src/shared/      서버·클라이언트 공통 enum·타입·문구
supabase/migrations/  schema(private), RPC(public), realtime 권한·정리 작업
tests/e2e/       헤드리스 Chrome 연기 시험
tests/db/        실제 Supabase에 대고 도는 RPC·권한 테스트 (vitest)
seed/            공개 가능한 가상 데이터만 (실명·실제 질문 금지)
```

## 7. 명령

실제로 실행해 확인한 명령만 적는다. (Node v24.21.0, npm 11.19.0에서 확인)

```
npm install      # 의존성 설치
npm run dev      # 개발 서버 http://localhost:5173 (localhost는 HTTPS 없이 PiP 동작)
npm run build    # 타입 검사 + 빌드
npm run lint     # oxlint
npm run smoke    # tests/e2e: 헤드리스 Chrome으로 강사·학생 흐름 (npm run dev 켜둔 상태, 설치된 Chrome 사용). BASE_URL=배포주소 로 배포본
node tests/e2e/latency.mjs 20   # 강사↔학생 반영 지연 중앙값·P95 (BASE_URL 지정 가능)
npm test         # tests/db: 원격 Supabase에 익명 사용자를 만들어 RPC·권한 검사 (.env.local 필요, 1회 약 60명 익명 로그인)

npx supabase db push --linked --dry-run   # 적용 예정 migration 확인
npx supabase db push --linked             # migration 원격 적용 (supabase login 필요)
npx supabase db query --linked "<sql>"    # 원격 SQL 실행
npx supabase db advisors --linked         # 보안·성능 점검
```

- DB 변경은 반드시 새 migration 파일로 한다. 이미 적용된 migration 파일을 고치지 않는다.
- 공개 RPC를 추가하면 rpc migration 끝의 권한 블록처럼 `revoke ... from public, anon` + `grant ... to authenticated`를 함께 넣는다.
- 파일럿 코드 원문은 `.env.local`의 `PILOT_CODE`(VITE_ 접두사 금지 → 번들에 안 들어감). DB에는 bcrypt 해시만 `private.app_secrets.pilot_code_hash`.
- 화면: `/` 시작, `/join?code=` 참여 링크, `/room/<id>` 방, `/gate` GATE-01 시험 페이지(시험 전용, `npm run dev`에서만 열림 D-030). 상태는 `src/room/useRoom.ts` 하나가 원래 탭·작은 창 공유.
- 디자인 토큰은 `src/styles/tokens.css`(TDS 참고, Toss 로고·이름·전용 폰트 금지). 작은 창 전용 규칙은 `.pip-doc`·`.pv`·`.qv` 아래.
