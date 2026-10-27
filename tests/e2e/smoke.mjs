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

async function profile(name) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && errors.push(`[${name}] console: ${m.text()}`))
  return page
}

// 원래 탭의 미리보기 틀을 작은 창 크기(240×160)·작은 창 글자 크기로 찍는다. 화면 상태는 바꾸지 않는다.
async function pipShot(page, path) {
  const frame = page.locator('.pip-frame')
  const style = await page.addStyleTag({ content: `
    .pip-frame { --pip-pad: 8px; --pip-tab-h: 30px; --pip-btn-h: 44px; --pip-icon: 30px; --pip-row-h: 28px;
      --pip-fs-q: 13px; --pip-fs-list: 12px; --pip-fs-meta: 11px; width: 240px !important; border-radius: 0 }
    .pip-frame .pv { height: 160px !important }
    .pip-frame .pv-tab, .pip-frame .pv-icon { font-size: 13px }
    .pip-frame .pv-action { min-height: 32px; font-size: 12px }
    .pip-frame .pv-stat-num { font-size: 15px }
    .pip-frame .pv-meter { height: 6px }
    .pip-frame .qv-input, .pip-frame .qv-send { height: 32px }
    .pip-frame .qv-send { width: 32px }
    .pip-frame .qv-line { line-height: 18px; padding: 5px 2px }` })
  await frame.screenshot({ path })
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
  await student.getByText('현재 응답 요청이 없어요').waitFor()
  step('학생 입장, 요청 없음 안내 표시')

  // 강사: 연결된 학생 확인 후 준비 확인 보내기
  await host.getByText('지금 연결된 수강생 1명').waitFor({ timeout: 15_000 })
  await host.getByRole('button', { name: '준비 확인' }).click()
  await host.getByText('준비 확인 진행 중').waitFor()
  step('강사 준비 확인 시작')

  // 학생: 요청 수신 → 응답
  await student.getByText('실습할 준비가 됐나요?').waitFor({ timeout: 5_000 })
  await student.getByRole('button', { name: '준비됐어요' }).click()
  await student.getByText('‘준비됐어요’로 전달했어요').waitFor()
  step('학생 응답 전달 확인 표시')

  // 강사: 집계 반영 (대상 1명 중 1명 → 100%, 과반)
  await host.getByText('✓ 과반이 ‘준비됨’ (100%)').waitFor({ timeout: 5_000 })
  step('강사 집계 준비됨 1명·100%·과반 표시')
  await pipShot(host, 'tests/e2e/pip-host-active.png')

  // 강사: 확인 종료 → 지난 기록, 학생: 지난 응답 표시
  await host.getByRole('button', { name: '확인 종료' }).click()
  await host.getByRole('heading', { name: '지난 확인 기록' }).waitFor({ timeout: 5_000 })
  await student.getByText('지난 준비 확인: ‘준비됐어요’로 응답했어요').waitFor({ timeout: 5_000 })
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
  await student2.getByRole('button', { name: /^질문/ }).click()
  await student2.getByRole('button', { name: '저도 궁금해요 0' }).click()
  await student2.getByRole('button', { name: '저도 궁금해요 1' }).waitFor({ timeout: 5_000 })
  step('다른 학생 🙋 공감 +1')
  await pipShot(student2, 'tests/e2e/pip-student-question.png')

  // 강사: 질문 보이고 답변 완료
  await host.getByRole('button', { name: /^질문/ }).click()
  await host.getByText('useEffect 왜 두 번 실행돼요?').waitFor({ timeout: 5_000 })
  await host.getByRole('button', { name: '답변 완료로 표시' }).click()
  await host.getByRole('button', { name: '미답변 0' }).waitFor({ timeout: 5_000 })
  step('강사 질문 확인·답변 완료')

  await host.screenshot({ path: 'tests/e2e/host.png', fullPage: true })
  await student.screenshot({ path: 'tests/e2e/student.png', fullPage: true })
} catch (e) {
  errors.push(`FAILED: ${e.message.split('\n')[0]}`)
} finally {
  await browser.close()
}

if (errors.length) {
  console.log('\n문제:\n' + errors.join('\n'))
  process.exit(1)
}
console.log('\n모든 단계 통과')
