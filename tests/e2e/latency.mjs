// 원격 반영 지연 측정 (PRD 3.2 “서버 승인 후 다른 클라이언트 반영 P95 2초 이하”, AT47·AT56 준비)
// 강사·학생 두 프로필을 한 프로세스에서 띄워 같은 시계로 잰다(PRD 18장: 다른 기기 시계 차이를 지연으로 쓰지 않음).
// 측정값은 “버튼 클릭 → 상대 화면에 보임”이라 서버 처리 시간이 포함된 상한값이다.
// 실행: npm run dev 켜둔 상태에서 node tests/e2e/latency.mjs [반복 횟수]
//       배포본: BASE_URL=https://nextstep-smoky.vercel.app node tests/e2e/latency.mjs 20
import fs from 'node:fs'
import { chromium } from 'playwright-core'

const BASE = process.env.BASE_URL ?? 'http://localhost:5173'
const ROUNDS = Number(process.argv[2] ?? 20)
const SLOW_MS = 2_000
const WAIT_MS = 30_000
const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)

const TYPES = [
  { button: '준비 확인', question: '실습할 준비가 됐나요?', yes: '준비됐어요' },
  { button: '이해 확인', question: '여기까지 이해됐나요?', yes: '이해했어요' },
  { button: '진행 확인', question: '다음 단계로 넘어갈까요?', yes: '좋아요' },
]

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const profile = async () => (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage()
const samples = { start: [], answer: [], close: [] }
const slow = []

const timed = async (kind, round, act, seen) => {
  const t0 = Date.now()
  await act()
  await seen()
  const ms = Date.now() - t0
  samples[kind].push(ms)
  if (ms > SLOW_MS) slow.push(`${round}회 ${kind} ${ms}ms`)
  return ms
}

try {
  const host = await profile()
  await host.goto(BASE)
  await host.getByRole('button', { name: '강사로 방 만들기' }).click()
  await host.getByPlaceholder('예: 리액트 3주차 실습').fill('지연 측정')
  await host.getByPlaceholder('운영자에게 받은 코드').fill(env.PILOT_CODE)
  await host.getByRole('button', { name: '방 만들기', exact: true }).click()
  await host.waitForURL(/\/room\//)
  const code = (await host.locator('.code-big').innerText()).trim()

  const student = await profile()
  await student.goto(`${BASE}/join?code=${code}`)
  await student.getByRole('button', { name: '입장하기' }).click()
  await student.getByRole('button', { name: /작은 창 없이 여기서 쓰기/ }).click()
  await host.getByText('지금 연결된 수강생 1명').waitFor({ timeout: WAIT_MS })

  for (let i = 1; i <= ROUNDS; i++) {
    const t = TYPES[i % TYPES.length]
    // 강사 요청 → 학생 화면에 질문
    await timed('start', i,
      () => host.getByRole('button', { name: t.button, exact: true }).click(),
      () => student.getByText(t.question).waitFor({ timeout: WAIT_MS }))
    // 학생 응답 → 강사 화면 1/1명 응답 (학생 화면 승인 표시까지 포함)
    await timed('answer', i,
      () => student.getByRole('button', { name: t.yes }).click(),
      () => host.getByText('1/1명 응답').waitFor({ timeout: WAIT_MS }))
    // 강사 종료 → 학생 화면 요청 없음
    await timed('close', i,
      () => host.getByRole('button', { name: '확인 종료' }).click(),
      () => student.getByText('현재 응답 요청이 없어요').waitFor({ timeout: WAIT_MS }))
    await host.getByRole('button', { name: TYPES[(i + 1) % TYPES.length].button, exact: true }).waitFor({ timeout: WAIT_MS })
    process.stdout.write('.')
  }
  console.log()

  const pct = (arr, p) => {
    const s = [...arr].sort((a, b) => a - b)
    return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]
  }
  console.log(`대상 ${BASE}, ${ROUNDS}회 (클릭 → 상대 화면 표시, ms)`)
  for (const [kind, label] of [['start', '요청 → 학생'], ['answer', '응답 → 강사'], ['close', '종료 → 학생']]) {
    const a = samples[kind]
    console.log(`${label}: 중앙값 ${pct(a, 50)}, P95 ${pct(a, 95)}, 최대 ${Math.max(...a)}, 최소 ${Math.min(...a)}`)
  }
  console.log(slow.length ? `2초 초과: ${slow.join(', ')}` : '2초 초과 없음')
} catch (e) {
  console.log(`\nFAILED: ${e.message.split('\n')[0]}`)
  process.exitCode = 1
} finally {
  await browser.close()
}
