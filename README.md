# 다음으로 (NextStep) — 실시간 수업 소통창

젭에서 수업을 듣고 VS Code로 실습하는 수강생이, 작업 화면 위의 작은 창(Document Picture-in-Picture)에서
상태를 한 번의 클릭으로 전달하고 익명 질문을 남기는 수업 소통 도구. 제품명은 가칭.

> 상태: **구현 착수 전.** 아래 실행 방법은 구현 후 실제로 확인한 명령만 채운다.

## 기능

| 기능 | 수강생 | 강사 |
|---|---|---|
| 상태 응답 | 준비·이해·진행 요청에 응답·변경 | 긍정·대기·미응답 수, 연결 미확인 참고 |
| 익명 질문 | 200자 이내 작성 | 미답변 질문 목록, 답변 완료·숨김 |
| 질문 공감 | 🙋 저도 궁금해요 선택·취소 | 질문별 공감 수 |

만들지 않는 것: 채팅 대체, 화상 수업, 젭 플러그인, 출결·성적, AI 답변, 녹화, 화면 감시 등 (PRD 0.4).

## 지원 환경 (v1)

- Windows 11 + 데스크톱 Chrome 안정 버전 + HTTPS
- 그 외 OS·브라우저는 미검증. 실제 검증 결과는 `docs/gate-01.md`, `docs/test-report.md` 참조.

## 기술 구조 (제안)

React + TypeScript + Vite / Supabase (PostgreSQL, 익명 Auth, RPC, private Realtime) / HTTPS 정적 호스팅.
상세: `docs/architecture.md`.

## 실행·배포

_구현 후 작성 (PRD 23.4 항목: 런타임 버전, 설치, Supabase 설정, migration, Realtime 권한, 환경변수, 파일럿 코드, 정기 삭제 작업, 로컬 실행, 배포, 두 프로필 테스트, PiP 사용법, 비용 한도, 데이터 정리)._

## 문서

| 문서 | 내용 |
|---|---|
| `docs/PRD.md` | 요구사항 원천 |
| `docs/STATUS.md` | 진행 상태·인수인계 |
| `docs/architecture.md` | 권한·데이터·이벤트 구조 |
| `docs/decisions.md` | 설계 판단·포기한 것 |
| `docs/gate-01.md` | PiP 기술 검증 기록 |
| `docs/test-report.md` | 인수 테스트 결과 |
| `docs/ai-log.md` | AI 활용·수정 기록 |
| `CLAUDE.md` / `AGENTS.md` | AI 에이전트 작업 규칙 |

## 알려진 한계

- "항상 위"는 일반 창 상태의 앱 전환에서 보이는 것을 의미. 전체 화면·OS 오버레이를 보장하지 않음.
- 완전 익명이 아님: 운영자는 익명 인증 ID와 질문의 연결을 기술적으로 볼 수 있음.
- 무료 플랜 운영을 영구 보장하지 않음.
