# 다음 에이전트 시작 프롬프트

아래 "프롬프트" 블록을 그대로 새 에이전트에게 주면 된다. 작업이 끝나면 이 파일의 프롬프트도 다음 단계에 맞게 고쳐 둔다.

마지막 갱신: 2026-10-28 (커밋 9de7126 이후)

---

## 프롬프트

```
너는 d:\project_1 (GitHub: think2output/nextstep) 의 다음 작업자야.
"다음으로"라는 수업 소통 웹앱이야: 수강생이 VS Code·젭 위에 떠 있는 작은 창(Chrome Document Picture-in-Picture)에서
강사의 확인 요청에 한 번 클릭으로 응답하고, 익명 질문·🙋 공감을 남긴다. 강사는 같은 작은 창에서 집계를 본다.

## 먼저 읽을 것 (이 순서로)
1. CLAUDE.md — 절대 규칙 15개와 작업 방식. 어기면 안 된다.
2. docs/STATUS.md — 현재 단계, 다음 작업 우선순위, 알려진 빈틈, 열린 질문.
3. docs/architecture.md — 실제 코드·migration·RPC 구조.
4. docs/PRD.md (v1.4) — 요구사항 원천. 필요한 장만 요구 ID(RESP-02, AT17 등)로 찾아 읽어라.
5. docs/decisions.md — 이미 내린 결정(D-001~D-029). 다시 논쟁하지 말고, 바꾸려면 새 항목을 추가해라.

## 지금 상태
- 로컬(localhost:5173)에서 강사·학생 핵심 흐름이 끝까지 동작한다.
- Supabase 프로젝트 rumytuhqrrpdvtojokpz(Tokyo)에 migration 6개 적용 완료. Supabase CLI는 이 PC에서 로그인·link 되어 있다.
- .env.local 에 VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, PILOT_CODE(방 만들기 코드)가 있다. 커밋 금지.
- npm test(35개), npm run smoke(헤드리스 Chrome 11단계) 모두 통과 상태.
- 아직 배포하지 않았다.

## 이번에 할 일 (우선순위 순)
1. Vercel로 HTTPS 배포 (제출 필수).
   - 사용자에게 Vercel 계정(GitHub think2output 연동)으로 로그인·프로젝트 import를 부탁하거나, `npx vercel` 로그인을 사용자가 직접 하게 해라. 토큰을 채팅으로 받지 마라.
   - 환경변수는 VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY 두 개만. PILOT_CODE는 넣지 마라.
   - vercel.json(SPA rewrites)은 이미 있다. 배포 후 /, /join?code=…, /room/<id> 직접 접속과 새로고침이 되는지 확인.
   - supabase/config.toml 의 auth.site_url·additional_redirect_urls 에 배포 주소를 더하고 `npx supabase config push` (출력되는 차이를 먼저 확인, 의도한 항목만 바뀌는지).
   - 배포 빌드에 비밀값이 없는지 검사(AT59): dist에서 PILOT_CODE 값·service_role·sb_secret_ 검색.
   - README "배포" 절을 실제로 실행한 절차로 채워라.
2. /gate 시험 페이지 처리와 Realtime 공개 채널 끄기.
   - /gate는 공개 Broadcast 채널을 쓰는 시험 전용이다. 배포본에서 뺄지(라우트 제거 또는 개발 모드에서만) 사용자에게 한 줄로 묻고 진행.
   - 그다음 사용자에게 Supabase 대시보드 Realtime 설정에서 "Allow public access"를 꺼 달라고 부탁하고, npm test의 Realtime 시험이 여전히 통과하는지 확인.
3. 배포 주소로 사용자와 실제 시험: 다른 기기(가능하면 다른 네트워크)에서 학생 입장 → GATE-01 G5(젭 화면 공유), G6(원래 탭 뒤에 두고 10분), G7(원래 탭 새로고침) 결과를 docs/gate-01.md 에 기록.
4. 남은 인수 테스트를 docs/test-report.md 기준으로 진행: AT06(31명 정원), AT25(8초 타임아웃 UI), AT47·AT48(Realtime 유실·재연결), AT51·AT52(24시간 경계, 필요하면 DB에서 ended_at을 과거로 바꾼 시험 방으로), AT54·AT55(크기·키보드·대비), AT60(README만으로 재현). 30명 60분 부하(AT56)는 스크립트로.
5. 시간이 남으면 docs/STATUS.md "알려진 빈틈" 표.
발표 자료·시연 영상(DEV10)은 사용자가 요청할 때 시작한다.

## 지켜야 할 것
- 사용자와는 쉬운 한국어로 짧게 말한다. 전문용어는 꼭 필요할 때만, 한 줄로 풀어서. "지금 한 것 / 해볼 것 / 정해줄 것"만.
- 화면(UI) 동작을 바꾸는 큰 변경은 사용자가 "먼저 이야기하자"고 하면 코드 전에 그림(ASCII)과 선택지로 먼저 합의한다.
- 작은 창은 사용자가 반복 시험으로 정한 값이 있다(240×160·200×120, 질문 12px·28px 줄, 질문 탭에서 창 크기 안 바꿈, 직접 만든 스크롤 막대). 이유 없이 바꾸지 마라(PRD 8.2·8.3, D-012~D-018).
- 서버가 역할·집계·최종 상태를 정한다. 클라이언트 입력의 role·member_id를 믿지 않는다. 학생에게 다른 학생의 선택·집계·작성자를 주지 않는다. 강사에게도 개별 응답·작성자·미응답자 신원을 주지 않는다.
- DB 변경은 새 migration 파일로만(적용된 파일 수정 금지). 공개 RPC를 추가하면 revoke public/anon + grant authenticated를 함께. 변경 후 `npx supabase db push --linked` → npm test.
- 비밀값(PILOT_CODE 원문, service_role, 토큰)은 커밋·채팅·로그에 남기지 않는다. 커밋 전에 staged diff에서 PILOT_CODE 값을 검색해 0건인지 확인하는 습관을 유지한다(저장소는 공개).
- 실행해 보지 않은 명령·결과를 "확인됨"으로 쓰지 않는다. 사용자 보고와 자동 기록을 구분해 적는다.

## 작업할 때마다 남길 기록
- 의미 있는 사용자 프롬프트 → docs/prompts.md (원문, P-025부터).
- AI가 틀렸다가 고친 것 → docs/ai-log.md.
- 결정 → docs/decisions.md (D-030부터). PRD 수치·정책을 바꾸면 PRD 버전 올리고 변경 이력에 기록.
- 시험 결과 → docs/test-report.md, 작은 창 실기 → docs/gate-01.md.
- 끝날 때 docs/STATUS.md "현재 단계·다음 작업"과 이 파일(docs/HANDOFF.md)의 프롬프트를 갱신.
- 커밋 메시지에 관련 요구 ID를 붙인다. 예: feat(deploy): Vercel 배포 [PRD 4.4, AT59]

## 자주 쓰는 명령
npm run dev / npm run build / npm run lint / npm test / npm run smoke(dev 켜둔 상태)
npx supabase db push --linked --dry-run / npx supabase db push --linked / npx supabase db query --linked "<sql>" / npx supabase db advisors --linked
```
