// 상태 응답·집계 (PRD 10장, AT07, AT15~AT28)
import { describe, expect, it } from 'vitest'
import { aid, createRoom, joinRoom, newUser, rpc, setupRoom, sleep, snapshot } from './helpers'

async function startRound(host: Awaited<ReturnType<typeof newUser>>, roomId: string, type = 'ready') {
  const res = await rpc(host, 'start_round', { p_room_id: roomId, p_type: type, p_action_id: aid() })
  if (!res.ok) throw new Error(JSON.stringify(res.error))
  return res.data!.round.id as string
}

describe('start_round', () => {
  it('AT15 연결된 학생 0명이면 거절', async () => {
    const host = await newUser()
    const room = await createRoom(host)
    const res = await rpc(host, 'start_round', { p_room_id: room.room_id, p_type: 'ready', p_action_id: aid() })
    expect(res.error?.code).toBe('NO_CONNECTED_STUDENTS')
    // 거절 시 회차가 남지 않는다
    const snap = await snapshot(host, room.room_id)
    expect(snap.active_round).toBeNull()
  })

  it('AT16 두 강사 탭 동시 요청 → 활성 요청 1개', async () => {
    const { host, room } = await setupRoom(1)
    const results = await Promise.all(
      ['ready', 'understood'].map((t) =>
        rpc(host, 'start_round', { p_room_id: room.room_id, p_type: t, p_action_id: aid() }),
      ),
    )
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(results.find((r) => !r.ok)?.error?.code).toBe('ACTIVE_ROUND_EXISTS')
  })

  it('AT07 강사는 응답할 수 없음', async () => {
    const { host, room } = await setupRoom(1)
    const roundId = await startRound(host, room.room_id)
    const res = await rpc(host, 'set_response', {
      p_round_id: roundId, p_choice: 'yes', p_expected_version: 0, p_action_id: aid(),
    })
    expect(res.error?.code).toBe('FORBIDDEN')
  })
})

describe('집계', () => {
  it('AT17·AT18·AT19 대상 5명 yes2/no1 → 미응답 2, 변경·재클릭 정합', async () => {
    const { host, room, students } = await setupRoom(5)
    const roundId = await startRound(host, room.room_id)
    const [a, b, c] = students
    const send = (s: typeof a, choice: string, v: number) =>
      rpc(s, 'set_response', { p_round_id: roundId, p_choice: choice, p_expected_version: v, p_action_id: aid() })

    expect((await send(a, 'yes', 0)).data?.version).toBe(1)
    expect((await send(b, 'yes', 0)).ok).toBe(true)
    expect((await send(c, 'no', 0)).ok).toBe(true)

    let round = (await snapshot(host, room.room_id)).active_round
    expect(round).toMatchObject({ target_count: 5, yes_count: 2, no_count: 1, unanswered_count: 2 })

    // AT18 no → yes
    await sleep(400)
    const changed = await send(c, 'yes', 1)
    expect(changed.data).toMatchObject({ my_choice: 'yes', version: 2 })
    round = (await snapshot(host, room.room_id)).active_round
    expect(round).toMatchObject({ yes_count: 3, no_count: 0, unanswered_count: 2 })

    // AT19 같은 선택 재클릭 → 변화 없음
    await sleep(400)
    const same = await send(c, 'yes', 2)
    expect(same.data).toMatchObject({ my_choice: 'yes', version: 2 })
    round = (await snapshot(host, room.room_id)).active_round
    expect(round).toMatchObject({ yes_count: 3, no_count: 0, unanswered_count: 2 })

    // 학생 snapshot에는 집계가 없다
    const mine = (await snapshot(c, room.room_id)).active_round
    expect(mine).toMatchObject({ my_choice: 'yes', my_response_version: 2, is_target: true })
    expect(mine.yes_count).toBeUndefined()
  })

  it('AT20·AT24 새 회차는 이월 없음, 지난 회차 ID 전송은 거절', async () => {
    const { host, room, students } = await setupRoom(1)
    const [s] = students
    const first = await startRound(host, room.room_id)
    await rpc(s, 'set_response', { p_round_id: first, p_choice: 'yes', p_expected_version: 0, p_action_id: aid() })
    const closed = await rpc(host, 'close_round', { p_round_id: first, p_action_id: aid() })
    expect(closed.data?.round).toMatchObject({ status: 'closed', yes_count: 1 })

    const second = await startRound(host, room.room_id, 'understood')
    const snap = await snapshot(s, room.room_id)
    expect(snap.active_round).toMatchObject({ id: second, my_choice: null, my_response_version: 0 })

    await sleep(400)
    const late = await rpc(s, 'set_response', {
      p_round_id: first, p_choice: 'no', p_expected_version: 1, p_action_id: aid(),
    })
    expect(late.error?.code).toBe('ROUND_CLOSED')
    const hostSnap = await snapshot(host, room.room_id)
    expect(hostSnap.active_round).toMatchObject({ yes_count: 0, no_count: 0, unanswered_count: 1 })
  })

  it('지난 확인 기록: 강사는 닫힌 회차 집계를 최신순으로, 학생은 거절', async () => {
    const { host, room, students } = await setupRoom(2)
    const first = await startRound(host, room.room_id)
    await rpc(students[0], 'set_response', { p_round_id: first, p_choice: 'yes', p_expected_version: 0, p_action_id: aid() })
    await rpc(host, 'close_round', { p_round_id: first, p_action_id: aid() })
    const second = await startRound(host, room.room_id, 'proceed')
    await rpc(host, 'close_round', { p_round_id: second, p_action_id: aid() })

    const res = await rpc(host, 'get_round_history', { p_room_id: room.room_id })
    expect(res.data?.rounds.map((r: any) => r.id)).toEqual([second, first])
    expect(res.data?.rounds[1]).toMatchObject({ type: 'ready', yes_count: 1, unanswered_count: 1, target_count: 2 })

    const denied = await rpc(students[0], 'get_round_history', { p_room_id: room.room_id })
    expect(denied.error?.code).toBe('FORBIDDEN')
  })

  it('AT21 요청 후 입장한 학생은 대상 아님', async () => {
    const { host, room } = await setupRoom(1)
    const roundId = await startRound(host, room.room_id)
    const late = await newUser()
    await joinRoom(late, room.join_code)
    const res = await rpc(late, 'set_response', {
      p_round_id: roundId, p_choice: 'yes', p_expected_version: 0, p_action_id: aid(),
    })
    expect(res.error?.code).toBe('NOT_ROUND_TARGET')
    expect((await snapshot(late, room.room_id)).active_round.is_target).toBe(false)
  })
})

describe('멱등성·버전', () => {
  it('AT26·AT27 같은 action 재시도는 중복 없음, 다른 내용이면 ACTION_ID_REUSED', async () => {
    const { host, room, students } = await setupRoom(1)
    const [s] = students
    const roundId = await startRound(host, room.room_id)
    const action = aid()
    const args = { p_round_id: roundId, p_choice: 'no', p_expected_version: 0, p_action_id: action }
    const first = await rpc(s, 'set_response', args)
    const retry = await rpc(s, 'set_response', args)
    expect(retry).toEqual(first)
    expect((await snapshot(host, room.room_id)).active_round.no_count).toBe(1)

    const reused = await rpc(s, 'set_response', { ...args, p_choice: 'yes' })
    expect(reused.error?.code).toBe('ACTION_ID_REUSED')
  })

  it('AT28 오래된 version → VERSION_CONFLICT', async () => {
    const { host, room, students } = await setupRoom(1)
    const [s] = students
    const roundId = await startRound(host, room.room_id)
    await rpc(s, 'set_response', { p_round_id: roundId, p_choice: 'yes', p_expected_version: 0, p_action_id: aid() })
    await sleep(400)
    const stale = await rpc(s, 'set_response', {
      p_round_id: roundId, p_choice: 'no', p_expected_version: 0, p_action_id: aid(),
    })
    expect(stale.error?.code).toBe('VERSION_CONFLICT')
    expect(stale.error?.data).toMatchObject({ my_choice: 'yes', version: 1 })
  })
})
