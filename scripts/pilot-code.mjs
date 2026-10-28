// 운영자 코드(방 만들기 코드) 바꾸기 — .env.local을 직접 열지 않고 터미널에서 (D-046)
//   npm run pilot:new          무작위 12자 코드를 만들어 서버에 반영하고 .env.local에 저장, 화면에 한 번 보여준다
//   npm run pilot:set          원하는 코드를 직접 입력(입력 글자는 화면에 안 보임)
//   node scripts/pilot-code.mjs --from-env   .env.local에 있는 코드를 서버에 다시 반영(확인용, 코드는 출력 안 함)
// 서버에는 bcrypt 해시만 저장된다(private.app_secrets.pilot_code_hash). 코드 원문은 저장소·로그에 남기지 않는다(절대 규칙 13).
// 필요: Supabase CLI 로그인·link (npx supabase login, link). 반영 전까지는 이전 코드가 계속 통한다.
import { spawnSync } from 'node:child_process'
import { randomInt } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline'

const ENV_FILE = '.env.local'
// 헷갈리는 글자(0/O, 1/l/I) 없이, 대소문자 구분
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
// 서버 비교는 대소문자·공백까지 그대로(crypt). SQL 안전을 위해 따옴표·역슬래시·공백은 받지 않는다. bcrypt는 72바이트까지만 본다
const ALLOWED = /^[A-Za-z0-9!@#$%^&*_+=.\-]{8,72}$/

const mode = process.argv.includes('--from-env') ? 'env' : process.argv[2] === 'set' ? 'set' : 'new'

function readEnvCode() {
  const line = fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/).find((l) => l.startsWith('PILOT_CODE='))
  return line ? line.slice('PILOT_CODE='.length).trim().replace(/^"|"$/g, '') : ''
}

function writeEnvCode(code) {
  const text = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8') : ''
  const lines = text.split(/\r?\n/)
  const i = lines.findIndex((l) => l.startsWith('PILOT_CODE='))
  if (i >= 0) lines[i] = `PILOT_CODE=${code}`
  else lines.splice(lines.length && lines[lines.length - 1] === '' ? lines.length - 1 : lines.length, 0, `PILOT_CODE=${code}`)
  fs.writeFileSync(ENV_FILE, lines.join('\n'))
}

// 입력 글자를 화면에 찍지 않는다. 두 질문을 한 입력 흐름에서 받는다(붙여 넣은 줄이 첫 질문에 다 먹히지 않게)
function askTwice(first, second) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY })
    let muted = false
    rl._writeToOutput = (text) => {
      if (!muted) process.stdout.write(text)
    }
    const answers = []
    const prompt = (q) => {
      muted = false
      process.stdout.write(q)
      muted = true
    }
    rl.on('line', (line) => {
      answers.push(line)
      process.stdout.write('\n')
      if (answers.length === 1) prompt(second)
      else {
        rl.close()
        resolve(answers)
      }
    })
    rl.on('close', () => resolve(answers))
    prompt(first)
  })
}

function applyToServer(code) {
  const sql = `insert into private.app_secrets(name, value)
values ('pilot_code_hash', extensions.crypt('${code}', extensions.gen_salt('bf', 10)))
on conflict (name) do update set value = excluded.value;
select 'ok' as pilot_code_updated;`
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-')), 'set.sql')
  fs.writeFileSync(file, sql, { mode: 0o600 })
  try {
    // Windows에서 npx를 찾으려면 shell이 필요하다. 인자는 우리가 만든 임시 파일 경로뿐
    const res = spawnSync(`npx supabase db query --linked -f "${file}"`, { encoding: 'utf8', shell: true })
    return res.status === 0 && /pilot_code_updated/.test(res.stdout)
  } finally {
    fs.rmSync(path.dirname(file), { recursive: true, force: true })
  }
}

let code
if (mode === 'env') {
  code = readEnvCode()
  if (!code) {
    console.log(`${ENV_FILE}에 PILOT_CODE가 없어요.`)
    process.exit(1)
  }
} else if (mode === 'set') {
  const [first = '', again = ''] = await askTwice('새 운영자 코드 (8~72자, 영문·숫자·!@#$%^&*_+=.- , 띄어쓰기 X): ', '한 번 더 입력: ')
  code = first
  if (code !== again) {
    console.log('두 번 입력한 코드가 달라요. 바꾸지 않았어요.')
    process.exit(1)
  }
} else {
  code = Array.from({ length: 12 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')
}

if (!ALLOWED.test(code)) {
  console.log('쓸 수 없는 코드예요. 8~72자, 영문·숫자·!@#$%^&*_+=.- 만, 띄어쓰기 없이. 바꾸지 않았어요.')
  process.exit(1)
}

console.log('서버에 반영하는 중…')
if (!applyToServer(code)) {
  console.log('서버 반영에 실패했어요. 이전 코드가 그대로예요. (npx supabase login · link 상태를 확인해주세요)')
  process.exit(1)
}
if (mode !== 'env') writeEnvCode(code)

if (mode === 'env') {
  console.log(`✓ ${ENV_FILE}의 운영자 코드를 서버에 다시 반영했어요.`)
} else {
  console.log('✓ 운영자 코드를 바꿨어요. 이제 이전 코드로는 방을 만들 수 없어요.')
  console.log(`  ${ENV_FILE}에도 저장했어요 (자동 시험이 이 값을 써요).`)
  if (mode === 'new') {
    console.log('\n  ┌──────────────────────┐')
    console.log(`  │  ${code}        │`)
    console.log('  └──────────────────────┘')
    console.log('  강사에게는 메신저 등으로 따로 전해주세요. 저장소·발표 자료·채팅에는 넣지 마세요.')
  }
}
