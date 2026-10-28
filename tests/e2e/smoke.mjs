// 화면 연기 시험: 설치된 Chrome(헤드리스)으로 강사·학생 두 프로필을 띄워 핵심 흐름을 확인한다.
// 작은 창(PiP)은 헤드리스에서 열 수 없으므로 원래 탭의 미리보기 틀로 같은 화면을 누른다.
// 실행: npm run dev 가 켜진 상태에서 node tests/e2e/smoke.mjs  (PILOT_CODE는 .env.local)
import fs from 'node:fs'
import { chromium } from 'playwright-core'

const BASE = process.env.BASE_URL ?? 'http://localhost:5173'
const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const errors = []
const step = (msg) => console.log(`✓ ${msg}`)

// 다른 화면에 반영되는 것(실시간)은 heartbeat 복구 범위(15초, PRD 12.2)까지 기다린다.
// 실패는 16초 초과만, 2초(PRD 3.2 P95 목표) 넘으면 경고로 시간을 남긴다. 지연 분포는 tests/e2e/latency.mjs
const RT_WAIT = 16_000
const SLOW_MS = 2_000
const slow = []
async function seen(locator, label, options = {}) {
  const t0 = Date.now()
  await locator.waitFor({ timeout: RT_WAIT, ...options })
  const ms = Date.now() - t0
  if (ms > SLOW_MS) slow.push(`${label} ${ms}ms`)
}

async function profile(name) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && errors.push(`[${name}] console: ${m.text()}`))
  return page
}

// 원래 탭의 미리보기 틀을 잠시 작은 창 모양(240×160, 작은 창 글자·여백)으로 바꿔 찍고 되돌린다.
async function pipShot(page, path) {
  const style = await page.addStyleTag({ content: '.pip-shot { width: 240px; border: 1px solid #e5e8eb } .pip-shot .pv { height: 160px }' })
  await page.locator('.pip-frame').evaluate((el) => el.classList.replace('pip-frame', 'pip-shot'))
  await page.locator('.pip-shot').screenshot({ path })
  await page.locator('.pip-shot').evaluate((el) => el.classList.replace('pip-shot', 'pip-frame'))
  await style.evaluate((el) => el.remove())
}

try {
  // 강사: 방 만들기
  const host = await profile('host')
  await host.goto(BASE)
  await host.getByRole('button', { name: '강사로 방 만들기' }).click()
  await host.getByPlaceholder('예: 리액트 3주차 실습').fill('연기 시험 수업')
  await host.getByPlaceholder('운영자에게 받은 코드').fill(env.PILOT_CODE)
  await host.getByRole('button', { name: '방 만들기', exact: true }).click()
  await host.waitForURL(/\/room\//)
  const code = (await host.locator('.code-big').innerText()).trim()
  step(`강사 방 생성, 참여 코드 ${code}`)

  // 학생: 참여 링크로 입장
  const student = await profile('student')
  await student.goto(`${BASE}/join?code=${code}`)
  await student.getByRole('button', { name: '입장하기' }).click()
  await student.waitForURL(/\/room\//)
  // 학생은 작은 창 띄우기 안내가 먼저, 웹 화면은 펼쳐야 보인다 (PRD v1.5 8.2)
  await student.getByText('먼저 작은 창을 띄워주세요').waitFor()
  await student.getByRole('button', { name: /작은 창 없이 여기서 쓰기/ }).click()
  await student.getByText('현재 응답 요청이 없어요').waitFor()
  step('학생 입장, 작은 창 안내 → 웹 화면 펼침, 요청 없음 안내 표시')

  // 강사: 연결된 학생 확인 후 준비 확인 보내기
  await host.getByText('지금 연결된 수강생 1명').waitFor({ timeout: 15_000 })
  await host.getByRole('button', { name: '준비 확인' }).click()
  await host.getByText('준비 확인 진행 중').waitFor()
  step('강사 준비 확인 시작')

  // 학생: 요청 수신 → 응답
  await seen(student.getByText('실습할 준비가 됐나요?'), '요청 → 학생')
  await student.getByRole('button', { name: '준비됐어요' }).click()
  await student.locator('.pv-toast', { hasText: '전송 완료' }).waitFor()
  await student.getByText('‘준비됐어요’로 전달했어요').waitFor({ state: 'attached' })
  step('학생 응답 승인 후 ‘전송 완료’ 표시')

  // 강사: 집계 반영 (대상 1명 중 1명 → 100%, 과반)
  await seen(host.locator('.pip-frame [title="준비됐어요 1명 (100%)"]'), '응답 → 강사 집계')
  step('강사 집계 준비됨 1명·100% 표시')
  await pipShot(host, 'tests/e2e/pip-host-active.png')

  // 강사: 확인 종료 → 지난 기록, 학생: 지난 응답 표시
  await host.getByRole('button', { name: '확인 종료' }).click()
  await host.getByRole('heading', { name: '지난 확인 기록' }).waitFor({ timeout: 5_000 })
  await seen(student.getByText('지난 준비 확인: ‘준비됐어요’로 응답했어요'), '종료 → 학생')
  step('지난 확인 기록(강사)·지난 응답(학생) 표시')

  // 학생: 질문 남기기
  await student.getByRole('button', { name: /^질문/ }).click()
  await student.getByLabel(/익명 질문 입력/).fill('useEffect 왜 두 번 실행돼요?')
  await student.getByRole('button', { name: '질문 남기기' }).click()
  await student.locator('.qv-item', { hasText: 'useEffect 왜 두 번 실행돼요?' }).waitFor()
  step('학생 질문 등록')

  // 두 번째 학생: 다른 사람 질문에 🙋 (질문 줄·버튼 정렬 확인용 사진)
  const student2 = await profile('student2')
  await student2.goto(`${BASE}/join?code=${code}`)
  await student2.getByRole('button', { name: '입장하기' }).click()
  await student2.waitForURL(/\/room\//)
  await student2.getByRole('button', { name: /작은 창 없이 여기서 쓰기/ }).click()
  await student2.getByRole('button', { name: /^질문/ }).click()
  await student2.getByRole('button', { name: '저도 궁금해요 0' }).click()
  await seen(student2.getByRole('button', { name: '저도 궁금해요 1' }), '공감 반영')
  step('다른 학생 공감 +1')
  await pipShot(student2, 'tests/e2e/pip-student-question.png')

  // 재촉: 강사가 이해 확인을 보내고 미응답자에게 재촉 → 학생 빨간 테두리·안내
  await host.getByRole('button', { name: '이해 확인' }).click()
  await host.getByText('이해 확인 진행 중').waitFor()
  await host.getByRole('button', { name: /^미응답 2명에게 재촉하기/ }).click()
  await seen(student.getByRole('button', { name: /^응답/ }).locator('.pv-badge-alert'), '재촉 → 학생')
  await student.getByRole('button', { name: /^응답/ }).click()
  await student.getByText('강사님이 응답을 기다리고 있어요').waitFor()
  await student.locator('.pv-nudge').waitFor()
  step('재촉: 학생 응답 탭 빨간 점 → 빨간 테두리·안내')
  await pipShot(student, 'tests/e2e/pip-student-nudge.png')
  await pipShot(host, 'tests/e2e/pip-host-nudge.png')
  await student.getByRole('button', { name: '이해했어요' }).click()
  await student.getByText('‘이해했어요’로 전달했어요').waitFor()
  await student.locator('.pv-nudge').waitFor({ state: 'detached', timeout: 3_000 })
  step('응답하면 재촉 표시 사라짐')
  await host.screenshot({ path: 'tests/e2e/host-web.png', fullPage: true })

  // 강사: 질문 보이고 답변 완료
  await host.getByRole('button', { name: /^질문/ }).click()
  await seen(host.getByText('useEffect 왜 두 번 실행돼요?'), '질문 → 강사')

  // 강사: 질문 줄을 누르면 옆 질문 보기 창 (D-042). 원래 탭이 그려 넣으므로 새 연결 없이 같은 상태를 본다
  const [side] = await Promise.all([
    host.context().waitForEvent('page'),
    host.locator('.qv-line', { hasText: 'useEffect 왜 두 번 실행돼요?' }).click(),
  ])
  await side.locator('.qd-body', { hasText: 'useEffect 왜 두 번 실행돼요?' }).waitFor({ timeout: 5_000 })
  await side.getByLabel('저도 궁금해요 1').waitFor()
  await side.getByRole('button', { name: '답변 완료' }).click()
  await seen(host.getByRole('button', { name: '미답변 0' }), '답변 완료 → 목록')
  await side.getByText(/목록에서 사라진 질문이에요/).waitFor({ timeout: 5_000 })
  await side.getByRole('button', { name: '질문 보기 닫기' }).click()
  await side.waitForEvent('close', { timeout: 3_000 }).catch(() => {})
  if (!side.isClosed()) throw new Error('옆 질문 보기 창이 닫히지 않음')
  step('강사 질문 줄 → 옆 창 원문·공감 수, 옆 창에서 답변 완료 → 미답변 0, 닫기')

  await host.screenshot({ path: 'tests/e2e/host.png', fullPage: true })
  await student.screenshot({ path: 'tests/e2e/student.png', fullPage: true })
} catch (e) {
  errors.push(`FAILED: ${e.message.split('\n')[0]}`)
} finally {
  await browser.close()
}

if (slow.length) console.log(`\n느림(2초 초과, 실패 아님): ${slow.join(', ')}`)
if (errors.length) {
  console.log('\n문제:\n' + errors.join('\n'))
  process.exit(1)
}
console.log('\n모든 단계 통과')
