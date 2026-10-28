부분 | DB 자동 room.test.ts: 종료 직후 읽기 가능·쓰기 거절. 24시간 경계는 미시험 |통과 | DB 자동 room.test.ts |통과 | DB 자동 security.test.ts (private·public 직접 조회 차단) |통과 | DB 자동 security.test.ts |부분 | DB 자동 security.test.ts: RPC·Realtime 비멤버 차단. 다른 방 ID로 쓰기 RPC는 미시험 |부분 | DB 자동 security.test.ts: snapshot·Broadcast에 인증 ID·작성자·개별 응답 없음. 브라우저 Network 탭 확인은 UI 구현 후 |통과 | DB 자동 question.test.ts (강사·학생 모든 필터 snapshot) |통과 | DB 자동 question.test.ts |통과 | DB 자동 question.test.ts |통과 | DB 자동 question.test.ts |통과 | DB 자동 question.test.ts |부분 | DB 자동 서버 거절 확인(question.test.ts). UI 차단은 UI 구현 후 |통과 | DB 자동 question.test.ts |통과 | DB 자동 question.test.ts (동시 2회) |부분 | DB 자동 question.test.ts: 문자열 그대로 저장만 확인. 화면 렌더링·가로 넘침은 UI 구현 후 |통과 | DB 자동 question.test.ts (이모지 200/201 code point) |통과 | DB 자동 question.test.ts |통과 | DB 자동 round.test.ts |통과 | DB 자동 round.test.ts |통과 | DB 자동 round.test.ts |통과 | DB 자동 round.test.ts |통과 | DB 자동 round.test.ts |통과 | DB 자동 round.test.ts |통과 | DB 자동 round.test.ts |통과 | DB 자동 round.test.ts |통과 | DB 자동 round.test.ts |통과 | DB 자동 round.test.ts (같은 강사 동시 2요청) |통과 | DB 자동 round.test.ts (거절 시 회차 미생성) |통과 | DB 자동 round.test.ts |통과 | DB 자동 room.test.ts (target_count=1) |통과 | DB 자동 room.test.ts (공백·하이픈·소문자 정규화 포함) |통과 | DB 자동 room.test.ts (동시 2회) |통과 | DB 자동 room.test.ts (앞뒤 공백 제외 30자) |통과 | DB 자동 room.test.ts |# 인수 테스트 결과 (PRD 21)

기록 규칙: 준비 조건·실행·기대 결과·실제 결과·증거·환경 버전을 남긴다. 기대값을 통과해야 기능 완료로 표시한다.
실행하지 않은 테스트는 "미실행"으로 둔다. 결과를 추측해 채우지 않는다.

심각도: Blocker(PiP 핵심 실패, 다른 방·익명 정보 노출, 집계 오류, 비밀키 노출) / Major / Minor.
출시 조건: Blocker·Major 0건.

## 환경

| 항목 | 값 |
|---|---|
| 빌드 커밋 | 9de7126 (2026-10-28) |
| OS / Chrome | Windows 11 Home / Chrome 155 (헤드리스 smoke) |
| 배포 URL | https://nextstep-smoky.vercel.app (Vercel, 2026-10-28). DB = Supabase 프로젝트 rumytuhqrrpdvtojokpz (Tokyo) |

## 결과

| ID | 시험 | 기대 결과 | 결과 | 증거·메모 |
|---|---|---|---|---|
| AT01 | 수업명 공백 입력 | 생성 불가 | 통과 | DB 자동 room.test.ts |
| AT02 | 수업명 30자·31자 | 30 허용, 31 거절 | 통과 | DB 자동 room.test.ts (앞뒤 공백 제외 30자) |
| AT03 | 생성 버튼 중복 전송 | 같은 action으로 방 1개 | 통과 | DB 자동 room.test.ts (동시 2회) |
| AT04 | 유효·오류 참여 코드 | 정상 입장 / 내용 노출 없는 오류 | 통과 | DB 자동 room.test.ts (공백·하이픈·소문자 정규화 포함) |
| AT05 | 동일 세션 두 탭 참여 | 멤버 1명 | 통과 | DB 자동 room.test.ts (target_count=1) |
| AT06 | 서로 다른 세션 31명 입장 | 30명까지, 31번째 거절 | 미실행 | |
| AT07 | 강사 권한으로 학생 응답 | 거절 | 통과 | DB 자동 round.test.ts |
| AT08 | API 없는 브라우저 | 지원 안내 | 미실행 | |
| AT09 | PiP 사용자 클릭으로 열기 | 별도 작은 창 | 미실행 | |
| AT10 | 젭·VS Code·Chrome 각 10회 전환 | 창 유지 | 미실행 | |
| AT11 | 새 요청 수신 중 VS Code 타이핑 | 포커스 유지 | 미실행 | |
| AT12 | 질문 작성 중 요청 도착 | 초안 유지, 배지, 자동 전환 없음 | 미실행 | |
| AT13 | PiP 닫기 | 방 유지, 재열기 | 미실행 | |
| AT14 | 원래 탭 새로고침 | 서버 상태·초안 복구, 수동 재열기 | 미실행 | |
| AT15 | 연결된 학생 0명 요청 | 생성 거절 | 통과 | DB 자동 round.test.ts (거절 시 회차 미생성) |
| AT16 | 두 강사 탭 동시 요청 | 활성 요청 1개 | 통과 | DB 자동 round.test.ts (같은 강사 동시 2요청) |
| AT17 | 5명 대상, yes 2/no 1 | 미응답 2, 합계 5 | 통과 | DB 자동 round.test.ts |
| AT18 | no → yes 변경 | yes+1/no-1, 총응답 고정 | 통과 | DB 자동 round.test.ts |
| AT19 | 같은 선택 재클릭 | 집계 변화 없음 | 통과 | DB 자동 round.test.ts |
| AT20 | 새 회차 | 이월 없음 | 통과 | DB 자동 round.test.ts |
| AT21 | 요청 후 새 학생 입장 | 대상 제외 안내 | 통과 | DB 자동 round.test.ts |
| AT22 | 대상자 연결 끊김 | 분모 유지, 연결 미확인 | 미실행 | |
| AT23 | 종료와 응답 경합 | 순서 일관, 종료 후 거절 | 미실행 | |
| AT24 | 오래된 회차 ID 전송 | 새 회차 반영 안 됨 | 통과 | DB 자동 round.test.ts |
| AT25 | 승인 지연 8초 | 결과 미확인 | 미실행 | |
| AT26 | 성공 유실 후 같은 action 재시도 | 중복 없음 | 통과 | DB 자동 round.test.ts |
| AT27 | 같은 action 다른 payload | ACTION_ID_REUSED | 통과 | DB 자동 round.test.ts |
| AT28 | stale version | VERSION_CONFLICT | 통과 | DB 자동 round.test.ts |
| AT29 | 빈·공백·200·201자 질문 | 앞둘 거절, 200 허용, 201 거절 | 통과 | DB 자동 question.test.ts |
| AT30 | 한글·개행·이모지 길이 | 서버·클라 동일 | 통과 | DB 자동 question.test.ts (이모지 200/201 code point) |
| AT31 | script 태그·긴 URL | 실행 없음, 넘침 없음 | 부분 | DB 자동 question.test.ts: 문자열 그대로 저장만 확인. 화면 렌더링·가로 넘침은 UI 구현 후 |
| AT32 | 질문 전송 실패 | 입력 유지 | 미실행 | |
| AT33 | 질문 등록 재시도 | 질문 1개 | 통과 | DB 자동 question.test.ts (동시 2회) |
| AT34 | 10초 내 재작성 | 제한 안내 | 통과 | DB 자동 question.test.ts |
| AT35 | 학생 21번째·방 301번째 | 한도 거절 | 미실행 | |
| AT36 | 내 질문 공감 | UI 차단·서버 거절 | 부분 | DB 자동 서버 거절 확인(question.test.ts). UI 차단은 UI 구현 후 |
| AT37 | 타인 공감 선택·취소 | +1/-1 | 통과 | DB 자동 question.test.ts |
| AT38 | 공감 중복 전송 | 중복 증가 없음 | 통과 | DB 자동 question.test.ts |
| AT39 | 완료 질문 공감 | 거절 | 통과 | DB 자동 question.test.ts |
| AT40 | 답변 완료·복구 | 필터·수 정합 | 통과 | DB 자동 question.test.ts |
| AT41 | 질문 숨김 | 모든 화면 본문 제거 | 통과 | DB 자동 question.test.ts (강사·학생 모든 필터 snapshot) |
| AT42 | 실시간 질문 추가 | 초안·스크롤·정렬 유지 | 미실행 | |
| AT43 | Network 확인 | 타인 author_id·개별 응답 없음 | 부분 | DB 자동 security.test.ts: snapshot·Broadcast에 인증 ID·작성자·개별 응답 없음. 브라우저 Network 탭 확인은 UI 구현 후 |
| AT44 | 다른 방 RPC·구독 | 차단 | 부분 | DB 자동 security.test.ts: snapshot RPC·Realtime 비멤버 차단. 다른 방 ID로 쓰기 RPC는 미시험 |
| AT45 | 학생이 host API 호출 | 거절 | 통과 | DB 자동 security.test.ts |
| AT46 | 원본 테이블 직접 조회 | 차단 | 통과 | DB 자동 security.test.ts (private·public 직접 조회 차단) |
| AT47 | Realtime 중복·역순·누락 | 최신 revision 수렴 | 미실행 | |
| AT48 | 인터넷 끊기·재연결 | 쓰기 잠금, 복구 | 미실행 | |
| AT49 | 방 종료 중 질문 | 원자적 성공 또는 거절 | 미실행 | |
| AT50 | 종료 방 신규 입장 | 거절 | 통과 | DB 자동 room.test.ts |
| AT51 | 종료 방 기존 멤버 | 24시간 읽기만 | 부분 | DB 자동 room.test.ts: 종료 직후 읽기 가능·쓰기 거절. 24시간 경계는 미시험 |
| AT52 | 종료 24시간 경과 | 읽기 차단 | 미실행 | |
| AT53 | 정리 작업 | 하위 데이터 삭제 | 미실행 | |
| AT54 | 기본·확장·최소 창 크기 | 넘침·잘림 없음 | 미실행 | |
| AT55 | 키보드·색각 대비 | 식별 가능 | 미실행 | |
| AT56 | 30명+강사 60분 | 정합성 유지 | 미실행 | |
| AT57 | 백그라운드 10분 | 요청·heartbeat 동작 | 미실행 | |
| AT58 | 화면 공유 관찰 | 공유 범위 확인 | 미실행 | |
| AT59 | 빌드·네트워크 검사 | secret·파일럿 코드 없음 | 부분 통과 | 2026-10-28 자동: 배포 주소에서 받은 JS 번들과 로컬 dist 모두 PILOT_CODE 값 0건, `service_role` 0건, `sb_secret_` 1건은 supabase-js의 키 접두사 검사 코드(키 아님), /gate 코드 0건. Vercel 환경변수는 VITE_ 2개만. 브라우저 Network 탭 확인은 미실행 |
| AT60 | README 재현 | 타인이 생성·참여·응답 | 미실행 | |

## 지표 (PRD 3.2) — 미측정

| 지표 | 목표 | 실측 | 표본 수·환경 |
|---|---|---|---|
| 상태 응답 시간 감소율 중앙값 | ≥30% | | |
| 15초 내 응답률 | ≥90% | | |
| 미답변 식별 정확도 | ≥90% | | |
| 원격 반영 지연 P95 | ≤2초 | | |

## 추가 자동 시험 (PRD 인수 목록 밖, 사용자 결정 기능)

`npm test` 기준 2026-10-28, 35개 통과.

| 시험 | 기대 결과 | 결과 | 위치 |
|---|---|---|---|
| 파일럿 코드 틀림 | FORBIDDEN | 통과 | room.test.ts |
| 열린 방이 있는데 새 방 | ACTIVE_ROOM_EXISTS + 기존 room_id | 통과 | room.test.ts |
| 강사가 자기 방 코드로 입장 | host 역할 유지 | 통과 | room.test.ts |
| 학생이 방 종료 | FORBIDDEN | 통과 | room.test.ts |
| 지난 확인 기록 | 강사: 닫힌 회차 최신순 집계 / 학생: FORBIDDEN | 통과 | round.test.ts |
| 재촉하기 | 미응답 학생만 nudge_count>0, 응답한 학생 0, 학생 재촉 FORBIDDEN, 닫힌 회차 ROUND_CLOSED | 통과 | round.test.ts |
| 참여 코드 노출 범위 | 강사 snapshot에만 join_code | 통과 | security.test.ts |
| Realtime 수신 권한 | 멤버만 수신, 비멤버 0건, payload 키 제한 | 통과 | security.test.ts |
| 로그인 안 한 호출 | RPC 실행 불가 | 통과 | security.test.ts |
| 정렬·페이지 | 공감순·최신순, next_offset | 통과 | question.test.ts |

## 화면 연기 시험 (`npm run smoke`)

헤드리스 Chrome 155, 강사 1·학생 2 프로필, localhost. 작은 창(PiP)은 헤드리스에서 열 수 없어 원래 탭의 같은 화면으로 확인하고, 240×160 크기로 바꿔 사진을 찍어 넘침을 눈으로 확인했다.

| 단계 | 결과 |
|---|---|
| 강사 방 생성·참여 코드 표시 | 통과 |
| 학생 참여 링크 입장, 요청 없음 안내 | 통과 |
| 강사 준비 확인 시작 → 학생 수신 → 응답 → ‘전달했어요’ | 통과 |
| 강사 집계 1명·100%·과반 표시 | 통과 |
| 확인 종료 → 강사 지난 확인 기록, 학생 지난 응답 | 통과 |
| 학생 질문 등록, 다른 학생 🙋 +1 | 통과 |
| 재촉 → 학생 응답 탭 빨간 점·빨간 테두리·안내 → 응답하면 사라짐 | 통과 |
| 강사 질문 확인·답변 완료 → 미답변 0 | 통과 |

실제 PiP 창(다른 앱 위)에서의 확인은 사용자 수동 시험(`docs/gate-01.md`)으로 한다. 알림음은 자동 시험하지 않았다.

### 배포 주소 연기 시험 (2026-10-28, `BASE_URL=https://nextstep-smoky.vercel.app npm run smoke`)

| 실행 | 결과 |
|---|---|
| 1회 | 실패: 4단계 "학생이 요청 수신"이 5초 안에 화면에 안 뜸 (오류 메시지 없음) |
| 2~5회 | 11단계 모두 통과 |

같은 날 localhost(dev)·로컬 배포 빌드(`vite preview`)는 각 1회 모두 통과.
해석(확인 안 됨): 학생 채널 구독이 끝나기 전에 강사 요청 알림이 나갔거나 알림이 늦게 온 경우로 보인다. 앱은 15초 heartbeat의 revision으로 놓친 변경을 복구하도록 설계(PRD 12.2)되어 있으나, 이번 실패에서 15초 안에 복구됐는지는 시험이 5초에서 멈춰 확인하지 못했다. AT47·AT48에서 이어서 확인한다.
배포 경로 직접 접속: `/`, `/join?code=…`, `/room/<id>`, `/gate` 모두 200 + 앱 HTML (curl). HSTS 헤더 있음. 브라우저 새로고침은 smoke에서 확인하지 않음.

### Realtime 공개 채널 끄기 후 (2026-10-28)

사용자가 Supabase 대시보드에서 "Allow public access to channels"를 껐다(사용자 보고).
- `npm test` 35개 모두 통과(Realtime 수신 권한 시험 포함).
- 공개 채널 구독 시도(로그인 없이 `private` 아닌 채널): `CHANNEL_ERROR PrivateOnly: This project only allows private channels` — 차단 확인(자동).

### 작은 창 넘침 측정 (2026-10-28, PRD v1.5 변경 후)

방법: 헤드리스 Chrome에서 원래 탭 미리보기 틀을 작은 창 크기로 바꾸고 `html.pip-doc`(실제 작은 창 규칙)를 붙인 뒤 응답 탭 본문의 scrollHeight와 높이를 비교. 측정 스크립트는 저장소에 넣지 않음(일회성). 실제 PiP 창이 아니라 근사치다.

| 상태 | 240×160 | 200×120 |
|---|---|---|
| 강사 요청 없음 | 0px | 0px |
| 강사 진행 중 | 0px | 0px (변경 전 26px, 과반 줄 숨김) |
| 강사 종료된 확인 + 다음 버튼 | 0px (변경 전 36px — 제목·연결 줄이 찌그러져 숨어 있었음) | 0px |
| 학생 요청 수신 | 0px | 0px |
| 학생 선택 후 / 전송 완료 표시 | 0px | 0px (긴 선택지는 짧은 말) |

같은 변경 후 `npm run smoke`(localhost) 11단계 통과. 실제 PiP 창에서의 모양·↗(원래 탭으로) 동작은 사용자 실기 확인 필요.

### 배포 주소 smoke (2026-10-28, PRD v1.5 배포 후)

| 실행 | 결과 |
|---|---|
| 1회 (자동 배포 전환 직후) | 실패: 학생 페이지가 이전 배포의 JS 파일을 요청 → 없는 파일에 index.html(200, text/html)이 응답돼 모듈 로드 실패 |
| 2회 | 11단계 모두 통과 |

조치: `vercel.json` rewrite에서 `/assets/`를 빼서 없는 정적 파일은 404로 응답하게 함
배포 후 확인: 없는 `/assets/nope-123.js` → 404, `/`·`/join?code=…`·`/room/<id>`·`/gate` → 200, smoke 1회 모든 단계 통과.

### 작은 창 넘침 측정 (2026-10-28, PRD v1.6 변경 후)

같은 방법(근사치)으로 강사 요청 없음·진행 중·종료된 확인, 학생 수신·선택·전송 완료 모두 240×160·200×120에서 넘침 0px. localhost smoke 11단계 통과(과반 문구 대신 집계 칸 title로 확인).

### PRD v1.7 변경 확인 (2026-10-28)

- 강사 진행 중 제목 줄 가로 넘침(응답 인원을 30/30으로 바꿔 측정): 240×160 222/222px, 200×120 182/182px — 넘침 없음(근사 측정).
- 세로 넘침: 모든 상태 0px. localhost smoke 11단계 통과.
- ↗(작은 창 닫고 원래 탭으로)는 헤드리스에서 PiP를 열 수 없어 미시험 → 사용자 실기 필요.

### 배포 주소 smoke (2026-10-28, 응답 인원 글자 변경 배포 직후)

| 실행 | 결과 |
|---|---|
| 1회 (새 CSS 확인 직후) | 실패: 어떤 단계에서 버튼 클릭 30초 초과. 출력 마지막 줄만 남겨 어느 단계인지 기록 못 함. 배포 전환과 겹쳤을 가능성(확인 안 됨) |
| 2회 | 11단계 모두 통과 |

메모: 배포 직후 smoke 실패가 2번째다. 다음 배포 때는 전체 출력을 남겨 원인 단계를 확인한다.

### 학생 상태 줄 넘침 (2026-10-28)

set_response 요청을 일부러 늦춰(2.5초, 12초) 상태별로 측정(근사치). 수정 전 200×120에서 재촉·전송 중 20px 넘침 → 수정 후 대기·재촉·전송 중·결과 미확인(8초)·전송 완료 모두 두 크기에서 0px. 결과 미확인 줄의 ‘다시 보내기’ 버튼은 두 크기 모두 줄 안에 보임. localhost smoke 11단계 통과.

### 질문 탭 줄 (2026-10-28, PRD v1.8)

학생 4명이 질문 1개씩 남긴 방에서 근사 측정(실제 작은 창에만 있는 −/＋·↗ 버튼을 흉내로 붙임): 탭 줄 폭 240×160 224/224px·높이 40px, 200×120 184/184px·38px — 강사·학생 모두 한 줄. localhost smoke 11단계 통과. 실제 작은 창 확인은 사용자 실기 대기.

### 질문 탭·옆 질문 보기 창 (2026-10-28, PRD v1.9)

- smoke에 단계 추가: 강사가 원래 탭 미리보기의 질문 줄을 누르면 옆 창이 열리고 원문·공감 수(+1) 표시 → 옆 창에서 ‘답변 완료’ → 원래 탭 미답변 0, 옆 창에 “목록에서 사라진 질문” 표시 → 닫기로 창 닫힘. localhost 12단계 통과.
- 근사 사진(240×160·200×120, 학생·강사, 입력 중, 옆 창 280×220)으로 줄 꺾임 없음·+N·me·안내 문구 확인. 정렬 버튼 누르면 “최신순” 알림 확인.
- 미확인(실기 필요): 실제 작은 창(PiP) 안 클릭으로 옆 창이 열리는지(팝업 허용), 작은 창 위치를 읽어 빈 쪽에 붙는지, 두 모니터.

### 옆 질문 보기 창 실기 (2026-10-28, 사용자 보고)

배포 주소에서 실제 작은 창으로 질문을 눌러 옆 창 확인: 사용자 “되는 것 같아”. 좌우 자동 배치·두 모니터·팝업 차단 여부는 세부 보고 없음 → 미확인으로 둔다.

### 연결 끊김 표시 (2026-10-28, PRD v1.10 / AT47·AT48 일부)

Playwright `setOffline`으로 학생 기기 인터넷 끊김을 흉내(실제 네트워크 끊김·Realtime 서버 장애는 아님).

| 단계 | 결과 |
|---|---|
| 끊김 → ‘다시 연결하는 중…’ 띠·주황 테두리 | 0초 (수정 전 14초) |
| 20초 넘김 → 덮개 + ‘다시 연결’ | 21초 (수정 전 39초) |
| 인터넷 복구 + ‘다시 연결’ → “✓ 다시 연결됐어요” | 표시됨 |
| 다시 연결 뒤 학생 응답 → 강사 “1/1명 응답” | 반영됨 |
| 두 크기 탭 줄 폭·본문 넘침 (세 단계 모두) | 240×160 224/224px, 200×120 184/184px, 넘침 0px |

AT47(알림 유실 복구)·AT48(재연결) 전체 기준은 실제 네트워크 끊김(G8)과 함께 사용자 실기로 남는다.
