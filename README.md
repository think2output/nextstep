# 다음으로 (NextStep) — 실시간 수업 소통창

젭에서 수업을 듣고 VS Code로 실습하는 수강생이, 작업 화면 위에 떠 있는 작은 창(Document Picture-in-Picture)에서
상태를 한 번의 클릭으로 전달하고 익명 질문을 남기는 수업 소통 도구. 제품명은 가칭.

> 상태: 배포 주소 https://nextstep-smoky.vercel.app (Vercel, HTTPS). 진행 상황은 [`docs/STATUS.md`](docs/STATUS.md).

## 기능

| 기능 | 수강생 (작은 창) | 강사 (작은 창 + 원래 탭) |
|---|---|---|
| 상태 응답 | 준비·이해·진행 확인에 응답·변경. 전송 확인 전에는 완료로 표시하지 않음 | 확인 보내기·종료, 응답 수·%·미응답, 50% 기준 과반 안내, 지난 확인 기록 |
| 재촉하기 | 미응답이면 빨간 테두리 깜빡임·알림음(끌 수 있음) | 🔔로 미응답자에게만 알림 (누가 미응답인지는 안 보임) |
| 익명 질문 | 입력칸 하나로 비슷한 질문 찾기 + 200자 질문 남기기 | 미답변/답변 완료 목록, 답변 완료·되돌리기·숨김 |
| 질문 공감 | 🙋 저도 궁금해요 선택·취소 | 질문별 공감 수, 🙋 많은 순 정렬 |

만들지 않는 것: 채팅 대체, 화상 수업, 젭 플러그인, 출결·성적, AI 답변, 녹화, 화면 감시 등 (PRD 0.4).

## 지원 환경 (v1)

- Windows 11 + 데스크톱 Chrome(116 이상, 시험은 155.0.8059.85) + HTTPS(로컬은 localhost)
- 작은 창은 젭·VS Code·Chrome 일반 창 전환, 최대화, F11, 젭 전체 화면에서 유지됨을 확인 (`docs/gate-01.md`)
- 웹은 작은 창의 **위치**를 정할 수 없음. 크기는 240×160(기본) / 200×120(더 작게)
- 그 외 OS·브라우저는 미검증. 작은 창을 지원하지 않으면 원래 탭 화면으로 사용

## 사용 방법

1. **강사**: 첫 화면 → `강사로 방 만들기` → 수업 이름 + 방 만들기 코드(운영자에게 받음) → 참여 링크 복사해 젭 채팅에 공유 → `작은 창 띄우기`
2. **수강생**: 참여 링크 열기 → `입장하기` → `작은 창 띄우기` (이름 입력 없음)
3. 작은 창: 강사가 `준비 확인`·`이해 확인`·`진행 확인`을 보내면 수강생이 응답. 질문 탭에서 익명 질문·🙋
4. 수업이 끝나면 강사가 원래 탭에서 `수업 방 종료` (종료 후 24시간 읽기만, 이후 삭제)

## 로컬 실행

확인한 환경: Node v24.21.0, npm 11.19.0, Windows 11.

```bash
npm install
cp .env.example .env.local    # 값 채우기 (아래)
npm run dev                   # http://localhost:5173
```

`.env.local`

| 이름 | 내용 |
|---|---|
| `VITE_SUPABASE_URL` | Supabase 프로젝트 URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | publishable key (`sb_publishable_…`, 브라우저 공개용) |
| `PILOT_CODE` | 방 만들기 코드 원문. 테스트·운영자 메모용이며 `VITE_` 접두사를 붙이지 않는다(번들 제외) |

두 사람 시험: 강사는 일반 Chrome 창, 수강생은 시크릿 창(Ctrl+Shift+N)이나 다른 Chrome 프로필.

## Supabase 설정 (새 프로젝트에 재현할 때)

```bash
npx supabase login
npx supabase link --project-ref <프로젝트 ref>
npx supabase config push          # 익명 로그인 켜기, 익명 로그인 시간당 300 (supabase/config.toml)
npx supabase db push --linked     # supabase/migrations 적용 (pg_cron 정리 작업 포함)
```

방 만들기 코드 설정 (원문은 저장하지 않고 bcrypt 해시만):

```bash
npx supabase db query --linked "insert into private.app_secrets(name, value) values ('pilot_code_hash', extensions.crypt('<코드>', extensions.gen_salt('bf', 10))) on conflict (name) do update set value = excluded.value;"
```

- `config push`는 원격과 다른 설정을 모두 덮어쓴다. 실행 전 출력되는 차이를 확인한다.
- service_role key는 쓰지 않는다. 저장소·프런트에 넣지 않는다.
- 정리 작업: `cron` 작업 `nextstep-purge-expired`(매시 7분). 수동 실행: `select private.purge_expired();`

## 시험

```bash
npm test          # tests/db: 원격 Supabase에 익명 사용자를 만들어 RPC·권한·익명성 검사 (실행당 익명 로그인 약 60회)
npm run smoke     # tests/e2e: npm run dev 켜둔 상태에서 설치된 Chrome(헤드리스)으로 강사·학생 흐름 (BASE_URL=배포주소 로 배포본 시험)
npm run build     # 타입 검사 + 빌드
npm run lint
```

결과 기록: [`docs/test-report.md`](docs/test-report.md). 작은 창 실기 시험: [`docs/gate-01.md`](docs/gate-01.md).

## 배포

운영 주소: https://nextstep-smoky.vercel.app (Vercel). 아래는 2026-10-28에 실제로 실행한 절차다.

```bash
npx vercel login                                  # 브라우저에서 기기 코드 승인 (토큰을 복사·공유하지 않는다)
npx vercel link --yes --project nextstep          # 프로젝트 생성·연결 (GitHub 저장소도 연결됨 → main push마다 자동 배포)
npx vercel env add VITE_SUPABASE_URL production   # 값은 입력창(stdin)으로. preview도 같은 방법
npx vercel env add VITE_SUPABASE_PUBLISHABLE_KEY production
npx vercel deploy --prod                          # 수동 배포
```

- 환경변수는 위 2개만 넣는다. `PILOT_CODE`·service_role key는 넣지 않는다.
- `vercel.json`: 모든 경로 → `index.html` (`/join?code=…`, `/room/<id>` 직접 접속·새로고침용).
- `.vercelignore`: CLI 업로드에서 `.env*`·`node_modules`·`tests` 등을 뺀다.
- `/gate` 시험 페이지는 개발 모드에서만 열린다(배포 빌드에 포함 안 됨).
- Supabase Auth 주소: `supabase/config.toml`의 `site_url`·`additional_redirect_urls`에 배포 주소를 넣고 `npx supabase config push` (차이 출력 확인 후 적용).
- 배포 후 비밀값 검사(AT59): `dist/assets/*.js`에서 PILOT_CODE 값·`service_role`·`sb_secret_` 검색. `sb_secret_` 1건은 supabase-js의 키 형식 검사 문자열이다.
- 배포 주소로 연기 시험: `BASE_URL=https://nextstep-smoky.vercel.app npm run smoke`

## 기술 구조

React 19 + TypeScript + Vite / Supabase(PostgreSQL private 스키마, 익명 Auth, SECURITY DEFINER RPC, private Realtime Broadcast, pg_cron).
서버가 역할·집계·최종 상태를 정하고, Realtime은 "바뀌었다"는 신호만 보낸다. 상세: [`docs/architecture.md`](docs/architecture.md).

디자인은 Toss Design System의 색·형태 원칙을 참고한 자체 토큰(`src/styles/tokens.css`)과 Pretendard 폰트를 쓴다. Toss 로고·이름·전용 폰트는 쓰지 않는다.

## 문서

| 문서 | 내용 |
|---|---|
| `docs/PRD.md` | 요구사항 원천 (v1.5) |
| `docs/STATUS.md` | 진행 상태·다음 작업 |
| `docs/HANDOFF.md` | 다음 작업자(에이전트)용 시작 프롬프트 |
| `docs/architecture.md` | 코드·데이터·권한·이벤트 구조 |
| `docs/decisions.md` | 설계 판단·포기한 것 |
| `docs/gate-01.md` | 작은 창 기술 검증 기록 |
| `docs/test-report.md` | 인수 테스트 결과 |
| `docs/ai-log.md` | AI 출력 문제·수정 기록 |
| `docs/prompts.md` | 사용한 프롬프트 모음 |
| `CLAUDE.md` / `AGENTS.md` | AI 에이전트 작업 규칙 |

## 알려진 한계

- "항상 위"는 일반 창 상태의 앱 전환에서 보이는 것을 뜻한다. OS 오버레이나 모든 전체 화면 위 표시를 보장하지 않는다.
- 완전 익명이 아니다: 운영자는 익명 인증 ID와 질문의 연결을 기술적으로 볼 수 있다. 강사·다른 수강생에게는 보이지 않는다.
- 같은 사람이 시크릿 창·다른 기기로 들어오면 다른 사람으로 센다.
- 무료 플랜 운영을 영구 보장하지 않는다.
- 클릭 응답은 실제 이해도를 측정하지 않는다.
