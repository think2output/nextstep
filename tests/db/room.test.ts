// 방 생성·참여·종료 (PRD 7장, AT01~AT07, AT50~AT51)
import { describe, expect, it } from 'vitest'
import { PILOT_CODE, aid, createRoom, joinRoom, newUser, rpc, setupRoom, snapshot } from './helpers'

describe('create_room', () => {
  it('파일럿 코드가 틀리면 거절', async () => {
    const host = await newUser()
    const res = await rpc(host, 'create_room', { p_title: '수업', p_pilot_code: 'WRONG-CODE', p_action_id: aid() })
    expect(res.error?.code).toBe('FORBIDDEN')
  })

  it('AT01 공백 수업명 거절', async () => {
    const host = await newUser()
    const res = await rpc(host, 'create_room', { p_title: '   ', p_pilot_code: PILOT_CODE, p_action_id: aid() })
    expect(res.error?.code).toBe('INVALID_INPUT')
  })

  it('AT02 수업명 30자 허용, 31자 거절 (앞뒤 공백 제외)', async () => {
    const h31 = await newUser()
    const r31 = await rpc(h31, 'create_room', { p_title: '가'.repeat(31), p_pilot_code: PILOT_CODE, p_action_id: aid() })
    expect(r31.error?.code).toBe('INVALID_INPUT')

    const h30 = await newUser()
    const r30 = await rpc(h30, 'create_room', { p_title: `  ${'가'.repeat(30)}  `, p_pilot_code: PILOT_CODE, p_action_id: aid() })
    expect(r30.ok).toBe(true)
    expect(r30.data?.join_code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/)
  })

  it('AT03 같은 action 중복 전송은 방 1개', async () => {
    const host = await newUser()
    const action = aid()
    const args = { p_title: '중복 시험', p_pilot_code: PILOT_CODE, p_action_id: action }
    const [a, b] = await Promise.all([rpc(host, 'create_room', args), rpc(host, 'create_room', args)])
    expect(a.ok && b.ok).toBe(true)
    expect(a.data?.room_id).toBe(b.data?.room_id)
  })

  it('열린 방이 있으면 새 방 대신 기존 방 안내', async () => {
    const host = await newUser()
    const room = await createRoom(host)
    const res = await rpc(host, 'create_room', { p_title: '두 번째', p_pilot_code: PILOT_CODE, p_action_id: aid() })
    expect(res.error?.code).toBe('ACTIVE_ROOM_EXISTS')
    expect(res.error?.data?.room_id).toBe(room.room_id)
  })
})

describe('join_room', () => {
  it('AT04 정상 입장 / 없는 코드는 내용 없는 오류', async () => {
    const host = await newUser()
    const room = await createRoom(host)
    const student = await newUser()

    // 공백·하이픈·소문자 정규화
    const code = room.join_code.toLowerCase()
    const joined = await joinRoom(student, ` ${code.slice(0, 4)}-${code.slice(4)} `)
    expect(joined).toMatchObject({ room_id: room.room_id, role: 'student' })

    const bad = await rpc(student, 'join_room', { p_code: 'ZZZZZZZZ', p_action_id: aid() })
    expect(bad.ok).toBe(false)
    expect(bad.error?.code).toBe('ROOM_UNAVAILABLE')
    expect(bad.error?.data).toBeUndefined()
  })

  it('AT05 같은 세션 두 번 참여해도 멤버 1명', async () => {
    const host = await newUser()
    const room = await createRoom(host)
    const student = await newUser()
    await joinRoom(student, room.join_code)
    await joinRoom(student, room.join_code)

    const started = await rpc(host, 'start_round', { p_room_id: room.room_id, p_type: 'ready', p_action_id: aid() })
    expect(started.data?.target_count).toBe(1)
  })

  it('강사는 자기 방에 학생으로 들어갈 수 없음 (host 역할 유지)', async () => {
    const host = await newUser()
    const room = await createRoom(host)
    const res = await joinRoom(host, room.join_code)
    expect(res.role).toBe('host')
  })
})

describe('end_room', () => {
  it('AT50·AT51 종료 방: 신규 입장 거절, 기존 멤버 읽기만', async () => {
    const host = await newUser()
    const room = await createRoom(host)
    const student = await newUser()
    await joinRoom(student, room.join_code)

    const ended = await rpc(host, 'end_room', { p_room_id: room.room_id, p_action_id: aid() })
    expect(ended.ok).toBe(true)
    // 같은 의도 반복은 성공
    const again = await rpc(host, 'end_room', { p_room_id: room.room_id, p_action_id: aid() })
    expect(again.ok).toBe(true)

    const newcomer = await newUser()
    const join = await rpc(newcomer, 'join_room', { p_code: room.join_code, p_action_id: aid() })
    expect(join.error?.code).toBe('ROOM_ENDED')

    const snap = await snapshot(student, room.room_id)
    expect(snap.room.status).toBe('ended')

    const write = await rpc(student, 'create_question', { p_room_id: room.room_id, p_body: '질문', p_action_id: aid() })
    expect(write.error?.code).toBe('ROOM_ENDED')
  })

  it('학생은 방을 종료할 수 없음', async () => {
    const host = await newUser()
    const room = await createRoom(host)
    const student = await newUser()
    await joinRoom(student, room.join_code)
    const res = await rpc(student, 'end_room', { p_room_id: room.room_id, p_action_id: aid() })
    expect(res.error?.code).toBe('FORBIDDEN')
  })
})

// AT06 정원 (PRD v1.12: 학생 50명). 익명 로그인을 52번 쓰므로 평소 npm test에서는 건너뛴다.
// 실행: CAPACITY_TEST=1 npx vitest run tests/db/room.test.ts -t AT06
describe('정원', () => {
  it.skipIf(!process.env.CAPACITY_TEST)('AT06 학생 50명까지 입장, 51번째 거절', async () => {
    const { room, students } = await setupRoom(50)
    expect(students).toHaveLength(50)
    const extra = await newUser()
    const res = await rpc(extra, 'join_room', { p_code: room.join_code, p_action_id: aid() })
    expect(res.error?.code).toBe('ROOM_FULL')
    // 이미 들어온 학생의 재참여는 인원을 늘리지 않고 성공
    const again = await joinRoom(students[0], room.join_code)
    expect(again.role).toBe('student')
  }, 180_000)
})
