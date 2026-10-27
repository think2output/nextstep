// 권한·익명성·실시간 (PRD 13장, 17장, AT43~AT47)
import { describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { aid, createRoom, newUser, rpc, setupRoom, sleep, snapshot } from './helpers'

describe('접근 제어', () => {
  it('AT44 다른 방 snapshot·쓰기는 방 존재 여부도 알려주지 않음', async () => {
    const { room } = await setupRoom(1)
    const outsider = await newUser()
    const snap = await rpc(outsider, 'get_snapshot', { p_room_id: room.room_id })
    expect(snap.error?.code).toBe('ROOM_UNAVAILABLE')
    expect(snap.error?.data).toBeUndefined()

    const fake = await rpc(outsider, 'get_snapshot', { p_room_id: crypto.randomUUID() })
    expect(fake.error?.code).toBe('ROOM_UNAVAILABLE')
  })

  it('AT45 학생이 강사 함수 직접 호출 → 거절', async () => {
    const { room, students } = await setupRoom(1)
    const [s] = students
    expect((await rpc(s, 'start_round', { p_room_id: room.room_id, p_type: 'ready', p_action_id: aid() })).error?.code)
      .toBe('FORBIDDEN')
  })

  it('AT46 원본 테이블 직접 조회 차단', async () => {
    const user = await newUser()
    const priv = await user.schema('private' as any).from('rooms').select('*')
    expect(priv.error).not.toBeNull()
    const pub = await user.from('rooms').select('*')
    expect(pub.error).not.toBeNull()
  })

  it('로그인 안 한 사용자는 RPC 실행 불가', async () => {
    const anon = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: false },
    })
    const { error } = await anon.rpc('get_snapshot', { p_room_id: crypto.randomUUID() })
    expect(error).not.toBeNull()
  })
})

describe('익명성 (Q-02)', () => {
  it('AT43 snapshot에 다른 사람의 인증 ID·작성자·개별 응답이 없음', async () => {
    const { host, room, students } = await setupRoom(2)
    const [a, b] = students
    await rpc(a, 'create_question', { p_room_id: room.room_id, p_body: '익명 시험', p_action_id: aid() })
    const start = await rpc(host, 'start_round', { p_room_id: room.room_id, p_type: 'ready', p_action_id: aid() })
    await rpc(a, 'set_response', { p_round_id: start.data!.round.id, p_choice: 'no', p_expected_version: 0, p_action_id: aid() })

    const ids = await Promise.all([a, b, host].map(async (c) => (await c.auth.getUser()).data.user!.id))
    for (const viewer of [host, b]) {
      const text = JSON.stringify(await snapshot(viewer, room.room_id))
      for (const id of ids) expect(text).not.toContain(id)
      expect(text).not.toContain('author')
      expect(text).not.toContain('member_id')
    }
    // 다른 학생에게는 집계도 없다
    const bSnap = await snapshot(b, room.room_id)
    expect(bSnap.active_round.no_count).toBeUndefined()
    expect(bSnap.questions_page[0]).toMatchObject({ is_mine: false })
  })
})

describe('Realtime private 채널 (13.4, 16.1)', () => {
  it('멤버는 최소 변경 알림을 받고, 멤버 아닌 사람은 못 받음', async () => {
    const { host, room, students } = await setupRoom(1)
    const outsider = await newUser()
    await createRoom(outsider) // outsider도 정상 사용자

    const listen = async (client: typeof host) => {
      await client.realtime.setAuth()
      const got: any[] = []
      const ch = client.channel(`room:${room.room_id}`, { config: { private: true } })
      ch.on('broadcast', { event: 'room_changed' }, (msg) => got.push(msg.payload))
      const status = await new Promise<string>((resolve) => {
        ch.subscribe((s) => {
          if (s !== 'CLOSED') resolve(s)
        })
        setTimeout(() => resolve('TIMEOUT'), 10_000)
      })
      return { got, status, ch }
    }

    const member = await listen(students[0])
    const stranger = await listen(outsider)
    expect(member.status).toBe('SUBSCRIBED')

    await rpc(students[0], 'create_question', { p_room_id: room.room_id, p_body: '알림 시험', p_action_id: aid() })
    for (let i = 0; i < 20 && member.got.length === 0; i++) await sleep(250)

    expect(member.got[0]).toMatchObject({ room_id: room.room_id, kind: 'question_created' })
    // id는 Realtime이 붙이는 메시지 번호. 그 외에는 room_id·revision·kind·server_time만 (본문·작성자·선택값 없음)
    expect(Object.keys(member.got[0]).sort()).toEqual(['id', 'kind', 'revision', 'room_id', 'server_time'])
    expect(stranger.got).toHaveLength(0)

    await member.ch.unsubscribe()
    await stranger.ch.unsubscribe()
  })
})
