# 다음 에이전트 시작 프롬프트

아래 "프롬프트" 블록을 그대로 새 에이전트에게 주면 된다. 작업이 끝나면 이 파일의 프롬프트도 다음 단계에 맞게 고쳐 둔다.

마지막 갱신: 2026-10-28 (커밋 51187a6 이후, 배포·작은 창 실기 피드백 반영 세션)

---

## 프롬프트

```
너는 d:\project_1 (GitHub: think2output/nextstep) 의 다음 작업자야.
"다음으로"라는 수업 소통 웹앱이야: 수강생이 VS Code·젭 위에 떠 있는 작은 창(Chrome Document Picture-in-Picture)에서
강사의 확인 요청에 한 번 클릭으로 응답하고, 익명 질문·+N 공감을 남긴다. 강사는 같은 작은 창에서 집계를 본다.

## 먼저 읽을 것 (이 순서로)
1. CLAUDE.md — 절대 규칙 15개와 작업 방식. 어기면 안 된다.
2. docs/STATUS.md — 현재 단계, 다음 작업 우선순위, 알려진 빈틈, 열린 질문.
3. docs/architecture.md — 실제 코드·migration·RPC 구조.
4. docs/PRD.md (v1.10) — 요구사항 원천. 필요한 장만 요구 ID(RESP-02, AT17 등)로 찾아 읽어라. 8.2~8.6은 사용자와 반복 실기로 정한 값이 많다.
5. docs/decisions.md — 이미 내린 결정(D-001~D-043). 다시 논쟁하지 말고, 바꾸려면 새 항목을 추가해라.

## 지금 상태
- 배포: https://nextstep-smoky.vercel.app (Vercel 프로젝트 nextstep, GitHub main push마다 자동 배포). 이 PC의 Vercel CLI는 사용자 계정으로 로그인·link 되어 있다.
- Supabase 프로젝트 rumytuhqrrpdvtojokpz(Tokyo), migration 6개. CLI 로그인·link 됨. Realtime 공개 채널 꺼짐. Auth site_url = 배포 주소.
- .env.local 에 VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, PILOT_CODE(방 만들기 코드), VERCEL_OIDC_TOKEN이 있다. 커밋·채팅·로그 금지.
- npm test 35개 통과. npm run smoke 12단계 통과(BASE_URL=배포주소 로 배포본도 시험 가능). 배포 주소 smoke 간헐 실패 3회 기록(docs/test-report.md).
- 사용자 실기: G5·G7 통과, 옆 질문 보기 창 동작(사용자 보고). G6 10분·G8 남음.

## 이번에 할 일 (우선순위 순) — 자세한 건 docs/STATUS.md "다음 작업"
1. 사용자와 실기 마무리: G6(원래 탭 뒤 10분), G8(인터넷 10초 끊기), ↗ 동작, 옆 창 좌우 자동 배치·두 모니터 → docs/gate-01.md.
2. 배포 주소 smoke 간헐 실패 원인: 전체 출력을 남기고 반복 실행, 실패 단계·요청 수신 지연 시간 측정.
3. 남은 인수 테스트: AT06, AT25, AT47·AT48, AT51·AT52, AT54·AT55, AT56(30명 60분, 스크립트), AT59 Network 탭, AT60.
4. 알려진 빈틈 중 P0에 걸리는 것.
발표 자료·시연 영상(DEV10)은 사용자가 요청할 때 시작한다.

## 지켜야 할 것
- 사용자와는 쉬운 한국어로 짧게 말한다. 전문용어는 꼭 필요할 때만, 한 줄로 풀어서. "지금 한 것 / 해볼 것 / 정해줄 것"만.
- 화면(UI)을 바꾸는 변경은 코드 전에 그림(ASCII)과 선택지로 먼저 합의한다. 사용자가 "일단 해봐"라고 하면 만든 뒤 사진으로 보여준다.
- 작은 창 값은 사용자가 정했다: 200×120 시작·＋ 240×160, 질문 12px·28px 줄, 질문 탭에서 창 크기 안 바꿈(D-015), 직접 만든 스크롤 막대, 전송 완료 잠깐 표시, −/＋/↗, N/M명 응답, 옆 질문 보기 창. 이유 없이 바꾸지 마라.
- 작은 창 화면을 바꾸면 두 크기(240×160, 200×120) 모두, 전송 중·재촉·결과 미확인 같은 순간 상태까지 넘침을 측정해라. 공간이 모자라면 줄이 높이 0으로 찌그러져 측정에서 안 보일 수 있다(ai-log).
- 서버가 역할·집계·최종 상태를 정한다. 클라이언트 입력의 role·member_id를 믿지 않는다. 학생에게 다른 학생의 선택·집계·작성자를 주지 않는다. 강사에게도 개별 응답·작성자·미응답자 신원을 주지 않는다.
- 새 창(옆 창 등)은 원래 탭이 portal로 그려 넣는다. 인증·구독·heartbeat를 새로 만들지 않는다(절대 규칙 11).
- DB 변경은 새 migration 파일로만. 공개 RPC를 추가하면 revoke public/anon + grant authenticated를 함께. 변경 후 `npx supabase db push --linked` → npm test.
- 비밀값은 커밋·채팅·로그에 남기지 않는다. 커밋 전에 staged diff에서 PILOT_CODE 값을 검색해 0건인지 확인한다(저장소는 공개).
- 실행해 보지 않은 명령·결과를 "확인됨"으로 쓰지 않는다. 사용자 보고·자동 시험·근사 측정을 구분해 적는다.

## 작업할 때마다 남길 기록
- 의미 있는 사용자 프롬프트 → docs/prompts.md (원문, P-045부터).
- AI가 틀렸다가 고친 것 → docs/ai-log.md.
- 결정 → docs/decisions.md (D-044부터). PRD 수치·정책을 바꾸면 PRD 버전 올리고 변경 이력에 기록.
- 시험 결과 → docs/test-report.md, 작은 창 실기 → docs/gate-01.md.
- 끝날 때 docs/STATUS.md "현재 단계·다음 작업"과 이 파일(docs/HANDOFF.md)의 프롬프트를 갱신.
- 커밋 메시지에 관련 요구 ID를 붙인다. 예: fix(pip): … [PRD 8.4, RESP-04]

## 자주 쓰는 명령
npm run dev / npm run build / npm run lint / npm test / npm run smoke(dev 켜둔 상태) / BASE_URL=https://nextstep-smoky.vercel.app npm run smoke
npx supabase db push --linked --dry-run / npx supabase db push --linked / npx supabase db query --linked "<sql>" / npx supabase db advisors --linked
npx vercel ls / npx vercel inspect <배포주소>
```
