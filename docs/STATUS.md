# 진행 상태 (에이전트 인수인계)

> 작업을 시작할 때 읽고, 끝날 때 갱신한다. 최신 항목을 위에 쓴다.

## 현재 단계

- 단계: **DEV03·DEV04 1차 완료 — 실제 앱 화면(시작·방·작은 창) + snapshot·Realtime·heartbeat 연결. 헤드리스 Chrome 연기 시험 7단계 통과**
- 다음 작업: 사용자가 실제 PiP로 강사·학생 흐름 확인 → 다듬기. 이후 Vercel 배포(HTTPS), DEV07 접근성·크기 검수, 남은 GATE 항목.
- 막힌 것: 없음

## 작업 목록 (PRD 22장)

| 작업 | 상태 | 선행 | 완료 증거 | 비고 |
|---|---|---|---|---|
| DEV01 PiP 기술 검증 | 완료(일부 항목 남음) | 없음 | `docs/gate-01.md` 기록 | G2·G3·G6 실패 시 PRD 수정 |
| DEV02 데이터 모델·권한 | 완료 | DEV01 | migration·권한 테스트 | |
| DEV03 방 생성·참여·익명 세션 | 1차 완료 | DEV02 | 두 기기 참여 | |
| DEV04 snapshot·Realtime·재연결 | 1차 완료 | DEV03 | 원격 상태 동기화 | |
| DEV05 요청·응답·집계 | 대기 | DEV04 | AT15~28 | |
| DEV06 질문·공감·완료·숨김 | 대기 | DEV04 | AT29~46 | |
| DEV07 작은 창 통합·접근성 | 대기 | DEV05/06 | 앱 전환·크기 검수 | |
| DEV08 만료·정리·운영 제한 | 대기 | DEV02/03 | 수명·비용·키 검수 | |
| DEV09 사용자 비교 테스트 | 대기 | DEV07/08 | 실제 결과 표 | |
| DEV10 문서·발표·영상 | 대기 | DEV09 | 재현·3분 발표 | |

상태 값: 대기 / 진행 중 / 완료 / 막힘 / 범위 변경

## 열린 질문 (PRD 26장 + 작업 중 발견)

| 항목 | 기본값 | 확인 대상 | 상태 |
|---|---|---|---|
| 1차 과제에서 Supabase·DB 사용 허용 | Supabase 제안 | 멘토 | 미확인 |
| 실제 수강생 OS 분포 | Windows Chrome | 인터뷰 | 미확인 |
| 최대화·F11·젭 전체 화면에서 PiP | 보장 안 함 | GATE-01 | 미확인 |
| 강사 질문 확인 운영 담당 | 쉬는 시간·종료 전 | 인터뷰 | 미확인 |
| 배포 공급자 | HTTPS 정적 호스팅 | 2일차 | 미정 |
| 질문 탭 확장 시 작은 창 위치 이동 | 창 크기 고정 + 찾기·쓰기 통합 (D-015, D-016) | 사용자 | 해결 |

## 제출물 (과제 요건)

| 항목 | 필수 | 상태 |
|---|---|---|
| GitHub 주소 (코드 + README 실행 방법) | 필수 | 저장소 생성됨, 내용 진행 중 |
| 발표 자료 (PPT/PDF) | 필수 | 미착수 |
| 배포 주소 | 택1 이상 | 미착수 (Vercel 검토) |
| 시연 영상 1~3분 (핵심 흐름 + 방어 장면) | 택1 이상 | 미착수 |

## 작업 기록

### 2026-10-28
- git init, GitHub 공개 저장소 think2output/nextstep 생성·push.
- docs/prompts.md(프롬프트 모음) 추가.
- Vite + React + TS 초기화. GATE-01 시험 페이지(`src/gate/GatePage.tsx`), PiP 훅(`src/pip/usePip.ts`) 작성. 빌드 통과.
- GATE-01 1차 시험(로컬, Chrome 155, 1920×1080): G1·G2·G3·G4-a·G4-b 통과, G7 부분 통과. 결과는 `docs/gate-01.md`.
- 저장소 골격 생성: CLAUDE.md, AGENTS.md, README.md, docs/*, .env.example, .gitignore, 빈 폴더.
- 원본 PRD(`NextStep_PRD_v1.0_KO.md`)를 `docs/PRD.md`로 이동.
- 코드·패키지 초기화는 아직 하지 않음.
- PRD v1.1: 작은 창 크기 변경(D-012). Supabase 프로젝트 연결 확인(.env.local, 커밋 제외).
- 두 창 실시간 시험 페이지(src/gate/useGateChannel.ts, 시험 전용 공개 Broadcast). Node 자체 시험: 두 클라이언트 간 Broadcast 전달 성공(73ms). 크기 전환은 사용자 '되는 것 같음' — 정식 확인은 보류.
- DEV02: supabase/migrations 3개(schema, rpc, realtime_cleanup) 원격 적용. 익명 로그인 켬, 익명 로그인 제한 30→300/시간(교실 공용 IP 대비). 파일럿 코드 bcrypt 해시 저장(원문은 .env.local PILOT_CODE). tests/db 33개 통과. db advisors: 의도된 WARN만.
- 미구현·후속: telemetry 테이블(P1), Realtime 'public access' 끄기(GATE 시험 페이지가 공개 채널 사용 중이라 보류), 30명 정원 실측(AT06·AT56), 24시간 만료 경계 시험.
- DEV03·04: src/pages(StartPage, RoomPage), src/room(useRoom 상태 저장소, PipView, AnswerViews, QuestionView), src/styles(TDS 참고 토큰). /gate는 시험 페이지로 분리(lazy). 강사 snapshot에 join_code 추가(migration 0300). tests/e2e/smoke.mjs(헤드리스 Chrome 2프로필) 통과. 실제 PiP 창에서의 확인은 사용자 몫.
- 알려진 미흡: 학생은 답변 완료 질문 목록을 볼 수 없음(미답변만), 질문 50개 초과 '더 보기' 없음, 연결 미확인 30초 후 '다시 연결'은 채널만 재생성.
