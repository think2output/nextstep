// 발표용 화면 캡처: 가상 수업(강사 1·학생 4)으로 주요 장면을 3배 해상도로 찍는다.
// 작은 창은 헤드리스에서 열 수 없으므로 원래 탭 미리보기 틀을 작은 창 모양(html.pip-doc, 200×120/240×160)으로 바꿔 찍고,
// 실제 작은 창에만 있는 −/＋·↗ 버튼은 사진에만 그려 넣는다(제품 코드는 그대로).
// 실행: npm run dev 가 켜진 상태에서 node tests/e2e/presentation-shots.mjs  → docs/presentation/shots/
import fs from 'node:fs'
import { chromium } from 'playwright-core'

const BASE = process.env.BASE_URL ?? 'http://localhost:5173'
const OUT = 'docs/presentation/shots'
fs.mkdirSync(OUT, { recursive: true })
const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const shots = []
async function profile() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 3 })
  return ctx.newPage()
}

// 작은 창 모양으로 찍기. size: 'small'(200×120, 시작 크기) | 'base'(240×160)
async function pip(page, name, size = 'small') {
  const [w, h] = size === 'small' ? [200, 120] : [240, 160]
  const style = await page.addStyleTag({ content: `.pip-shot { width: ${w}px; border: 1px solid #e5e8eb } .pip-shot .pv { height: ${h}px }` })
  await page.locator('.pip-frame').evaluate((el, small) => {
    el.classList.replace('pip-frame', 'pip-shot')
    document.documentElement.classList.add('pip-doc')
    const pv = el.querySelector('.pv')
    if (small) pv.classList.add('pv-compact')
    const bar = el.querySelector('.pv-bar')
    for (const [t, label] of [[small ? '＋' : '−', 'size'], ['↗', 'back']]) {
      const b = document.createElement('button')
      b.className = 'pv-icon shot-fake'
      b.dataset.k = label
      b.textContent = t
      bar.appendChild(b)
    }
  }, size === 'small')
  const file = `${OUT}/${name}-${w}x${h}.png`
  await page.locator('.pip-shot').screenshot({ path: file })
  await page.locator('.pip-shot').evaluate((el) => {
    el.querySelectorAll('.shot-fake').forEach((b) => b.remove())
    el.querySelector('.pv').classList.remove('pv-compact')
    el.classList.replace('pip-shot', 'pip-frame')
    document.documentElement.classList.remove('pip-doc')
  })
  await style.evaluate((el) => el.remove())
  shots.push(file)
}
async function both(page, name) {
  await pip(page, name, 'small')
  await pip(page, name, 'base')
}
async function full(page, name) {
  const file = `${OUT}/${name}.png`
  await page.screenshot({ path: file, fullPage: true })
  shots.push(file)
}

try {
  const host = await profile()
  await host.goto(BASE)
  await full(host, 'web-01-start')
  await host.getByRole('button', { name: '강사로 방 만들기' }).click()
  await host.getByPlaceholder('예: 리액트 3주차 실습').fill('리액트 3주차 실습')
  await full(host, 'web-02-create-room')
  await host.getByPlaceholder('운영자에게 받은 코드').fill(env.PILOT_CODE)
  await host.getByRole('button', { name: '방 만들기', exact: true }).click()
  await host.waitForURL(/\/room\//)
  const code = (await host.locator('.code-big').innerText()).trim()

  const students = []
  for (let i = 0; i < 4; i++) {
    const s = await profile()
    await s.goto(`${BASE}/join?code=${code}`)
    if (i === 0) await full(s, 'web-03-student-join')
    await s.getByRole('button', { name: '입장하기' }).click()
    await s.getByText('먼저 작은 창을 띄워주세요').waitFor()
    if (i === 0) await full(s, 'web-04-student-entry-guide')
    await s.getByRole('button', { name: /작은 창 없이 여기서 쓰기/ }).click()
    await s.getByText('현재 응답 요청이 없어요').waitFor()
    students.push(s)
  }
  const [s1, s2, s3, s4] = students
  await host.getByText('지금 연결된 수강생 4명').waitFor({ timeout: 20_000 })
  await full(host, 'web-05-host-room')
  await both(host, 'pip-01-host-idle')
  await both(s1, 'pip-02-student-idle')

  // 확인 1: 준비 확인 — 전원 긍정
  const round = async (label, question, answers) => {
    await host.getByRole('button', { name: label, exact: true }).click()
    await host.getByText(`${label} 진행 중`).waitFor()
    for (let i = 0; i < 4; i++) {
      if (!answers[i]) continue
      await students[i].getByText(question).waitFor({ timeout: 20_000 })
      await students[i].getByRole('button', { name: answers[i] }).click()
      await students[i].locator('.pv-toast').waitFor()
    }
  }
  const close = async () => {
    await host.getByRole('button', { name: '확인 종료' }).click()
    await host.getByRole('heading', { name: '수업 리포트' }).waitFor({ timeout: 10_000 })
  }
  await round('준비 확인', '실습할 준비가 됐나요?', ['준비됐어요', '준비됐어요', '준비됐어요', '준비됐어요'])
  await close()

  // 확인 2: 이해 확인 — 응답 과정을 장면별로
  await host.getByRole('button', { name: '이해 확인', exact: true }).click()
  await host.getByText('이해 확인 진행 중').waitFor()
  await both(host, 'pip-03-host-sent-0of4')
  await s1.getByText('여기까지 이해됐나요?').waitFor({ timeout: 20_000 })
  await both(s1, 'pip-04-student-request')
  await s1.getByRole('button', { name: '이해했어요' }).click()
  await s1.locator('.pv-toast').waitFor()
  await pip(s1, 'pip-05-student-sent-toast', 'small')
  await pip(s1, 'pip-05-student-sent-toast', 'base')
  await s1.locator('.pv-toast').waitFor({ state: 'detached' })
  await both(s1, 'pip-06-student-chosen')
  for (const [s, a] of [[s2, '이해했어요'], [s3, '다시 설명해주세요']]) {
    await s.getByText('여기까지 이해됐나요?').waitFor({ timeout: 20_000 })
    await s.getByRole('button', { name: a }).click()
    await s.locator('.pv-toast').waitFor()
  }
  await host.locator('.pv-answered', { hasText: '3/4' }).first().waitFor({ timeout: 20_000 })
  await both(host, 'pip-07-host-3of4')

  // 재촉: 응답 안 한 학생(s4)만 빨간 테두리
  await host.getByRole('button', { name: /^미응답 1명에게 재촉하기/ }).click()
  await s4.locator('.pv-nudge').waitFor({ timeout: 20_000 })
  await s4.waitForTimeout(2600) // 3번 깜빡임 뒤 유지되는 모습
  await both(s4, 'pip-08-student-nudged')
  await s4.getByRole('button', { name: '이해했어요' }).click()
  await host.locator('.pv-answered', { hasText: '4/4' }).first().waitFor({ timeout: 20_000 })
  await both(host, 'pip-09-host-4of4')
  await close()
  await both(host, 'pip-10-host-closed-result')

  // 확인 3~5: 리포트를 채우는 회차
  await round('진행 확인', '다음 단계로 넘어갈까요?', ['좋아요', '조금만 더요', '좋아요', '조금만 더요'])
  await close()
  await round('이해 확인', '여기까지 이해됐나요?', ['다시 설명해주세요', '다시 설명해주세요', '이해했어요', null])
  await close()
  await round('이해 확인', '여기까지 이해됐나요?', ['이해했어요', '이해했어요', '이해했어요', '이해했어요'])
  await close()

  // 질문: 학생 3명이 남기고 서로 공감
  const ask = async (s, text) => {
    await s.getByRole('button', { name: /^질문/ }).click()
    await s.getByLabel(/익명 질문 입력/).fill(text)
    await s.getByRole('button', { name: '질문 남기기' }).click()
    await s.locator('.qv-item', { hasText: text }).waitFor()
  }
  await ask(s1, 'useEffect가 왜 두 번 실행돼요?')
  await ask(s2, 'props와 state 차이를 다시 알려주세요')
  await ask(s3, 'key 경고는 어떻게 없애요?')
  await s4.getByRole('button', { name: /^질문/ }).click()
  for (const s of [s2, s3, s4]) {
    const btn = s.locator('.qv-item', { hasText: 'useEffect가 왜 두 번 실행돼요?' }).getByRole('button', { name: /^저도 궁금해요/ })
    await btn.waitFor({ timeout: 20_000 })
    await btn.click()
  }
  const btn2 = s4.locator('.qv-item', { hasText: 'props와 state' }).getByRole('button', { name: /^저도 궁금해요/ })
  await btn2.click()
  await s1.getByRole('button', { name: '저도 궁금해요 2' }).first().waitFor({ timeout: 20_000 }).catch(() => {})
  await s1.waitForTimeout(1500)
  await both(s1, 'pip-11-student-questions')
  await s1.getByLabel(/익명 질문 입력/).fill('useEff')
  await both(s1, 'pip-12-student-similar-search')
  await s1.getByLabel(/익명 질문 입력/).fill('')

  await host.getByRole('button', { name: /^질문/ }).click()
  await host.getByText('useEffect가 왜 두 번 실행돼요?').waitFor({ timeout: 20_000 })
  await both(host, 'pip-13-host-questions')
  const [side] = await Promise.all([
    host.context().waitForEvent('page'),
    host.locator('.qv-line', { hasText: 'useEffect가 왜 두 번 실행돼요?' }).click(),
  ])
  await side.locator('.qd-body', { hasText: 'useEffect' }).waitFor({ timeout: 10_000 })
  await side.setViewportSize({ width: 280, height: 220 })
  await side.screenshot({ path: `${OUT}/side-01-host-question-detail-280x220.png` })
  shots.push(`${OUT}/side-01-host-question-detail-280x220.png`)
  await side.getByRole('button', { name: '답변 완료' }).click()
  await side.getByRole('button', { name: '질문 보기 닫기' }).click()

  // 수업 리포트 (원래 탭)
  await host.getByRole('button', { name: /^응답/ }).click()
  const report = host.locator('section', { has: host.getByRole('heading', { name: '수업 리포트' }) })
  await report.screenshot({ path: `${OUT}/web-06-host-report.png` })
  shots.push(`${OUT}/web-06-host-report.png`)
  await full(host, 'web-07-host-room-with-report')

  // 연결 끊김: 바로 띠 → 20초 넘으면 덮개
  await s2.getByRole('button', { name: /^응답/ }).click()
  await s2.context().setOffline(true)
  await s2.locator('.pv-offline-bar').waitFor({ timeout: 5_000 })
  await both(s2, 'pip-14-student-reconnecting')
  await s2.locator('.pv-offline-cover').waitFor({ timeout: 30_000 })
  await s2.waitForTimeout(2600)
  await both(s2, 'pip-15-student-disconnected')
  await s2.context().setOffline(false)

  // 시험 방 정리 (24시간 뒤 자동 삭제)
  host.on('dialog', (d) => d.accept())
  await host.getByRole('button', { name: '수업 방 종료' }).click().catch(() => {})
} catch (e) {
  console.log(`실패: ${e.message.split('\n')[0]}`)
  process.exitCode = 1
} finally {
  await browser.close()
}
console.log(`${shots.length}장 → ${OUT}`)
shots.forEach((f) => console.log(' ', f))
