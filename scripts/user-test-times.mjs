// 사용자 비교 시험(PRD 20) B 조건 응답 시간 뽑기 — 시험이 끝난 뒤 24시간 안에 실행 (방 종료 24시간 뒤 데이터 삭제, 17.4)
//   npm run usertest:times -- <참여코드 8자>
// 참가자는 입장 순서대로 P1, P2, … 익명 코드로만 나온다. 이름·질문 본문·인증 ID는 뽑지 않는다(PRD 20.4, 17.4).
// 시간 = 첫 응답 시각(responses.created_at) − 요청 시작(rounds.opened_at), 둘 다 서버 시계(PRD 18: 서로 다른 기기 시계를 섞지 않음).
// 필요: Supabase CLI 로그인·link.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const code = (process.argv[2] ?? '').trim().toUpperCase()
if (!/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/.test(code)) {
  console.log('참여 코드 8자를 넣어주세요. 예: npm run usertest:times -- ABCD2345')
  process.exit(1)
}

const sql = `with r as (select id from private.rooms where join_code = '${code}'),
m as (
  select id, 'P' || row_number() over (order by joined_at) as p
  from private.room_members where room_id = (select id from r) and role = 'student'
),
rd as (
  select id, type, opened_at, closed_at, row_number() over (order by opened_at) as n
  from private.rounds where room_id = (select id from r)
)
select rd.n as round_no, rd.type, m.p as participant,
  case when s.created_at is null then 'no_response' else 'ok' end as result,
  round(extract(epoch from (s.created_at - rd.opened_at))::numeric, 2) as seconds,
  (s.updated_at > s.created_at) as changed
from rd
join private.round_targets t on t.round_id = rd.id
join m on m.id = t.member_id
left join private.responses s on s.round_id = rd.id and s.member_id = t.member_id
order by rd.n, m.p;`

const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'usertest-')), 'times.sql')
fs.writeFileSync(file, sql)
try {
  // Windows에서 npx를 찾으려면 shell이 필요하다. 인자는 우리가 만든 임시 파일 경로뿐
  const res = spawnSync(`npx supabase db query --linked -f "${file}"`, { encoding: 'utf8', shell: true })
  if (res.status !== 0) {
    console.log('조회에 실패했어요. (npx supabase login · link 상태를 확인해주세요)')
    console.log(res.stderr)
    process.exit(1)
  }
  const rows = JSON.parse(res.stdout.slice(res.stdout.indexOf('{'))).rows ?? []
  if (!rows.length) {
    console.log('이 참여 코드로 찾은 응답 기록이 없어요. (방 종료 24시간이 지나면 지워져요)')
    process.exit(1)
  }
  console.log('회차\t종류\t참가자\t결과\t초\t바꿈')
  for (const r of rows) console.log([r.round_no, r.type, r.participant, r.result, r.seconds ?? '-', r.changed ? '예' : ''].join('\t'))
  const median = (xs) => {
    const s = [...xs].sort((a, b) => a - b)
    return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
  }
  console.log('\n참가자\t응답(15초 이내)/요청\t중앙값(초)')
  for (const p of [...new Set(rows.map((r) => r.participant))]) {
    const mine = rows.filter((r) => r.participant === p)
    const ok = mine.filter((r) => r.result === 'ok' && Number(r.seconds) <= 15).map((r) => Number(r.seconds))
    console.log(`${p}\t${ok.length}/${mine.length}\t${ok.length ? median(ok).toFixed(2) : '-'}`)
  }
  console.log('\n15초 넘게 걸린 응답은 시간 표본에서 빼고, 실패율 분모에는 넣는다(PRD 20.5). 이 결과는 docs/user-test-plan.md 기록표로 옮긴다.')
} finally {
  fs.rmSync(path.dirname(file), { recursive: true, force: true })
}
