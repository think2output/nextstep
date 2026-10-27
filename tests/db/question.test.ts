// 익명 질문·공감 (PRD 11장, AT29~AT41)
import { describe, expect, it } from 'vitest'
import { aid, rpc, setupRoom, sleep, snapshot } from './helpers'

describe('create_question', () => {
  it('AT29 빈·공백 거절, 200자 허용, 201자 거절', async () => {
    const { room, students } = await setupRoom(2)
    const [a, b] = students
    const ask = (s: typeof a, body: string) =>
      rpc(s, 'create_question', { p_room_id: room.room_id, p_body: body, p_action_id: aid() })

    expect((await ask(a, '')).error?.code).toBe('INVALID_INPUT')
    expect((await ask(a, '  \n  ')).error?.code).toBe('INVALID_INPUT')
    expect((await ask(a, '가'.repeat(201))).error?.code).toBe('INVALID_INPUT')
    expect((await ask(b, '가'.repeat(200))).ok).toBe(true)
  })

  it('AT30 이모지·한글은 code point 기준으로 서버·클라이언트 동일 판정', async () => {
    const { room, students } = await setupRoom(2)
    const [a, b] = students
    const ok200 = '😀'.repeat(200)
    const over = '😀'.repeat(199) + '👍🏽' // 👍🏽 = 2 code points → 201
    expect(Array.from(ok200).length).toBe(200)
    expect(Array.from(over).length).toBe(201)

    const r1 = await rpc(a, 'create_question', { p_room_id: room.room_id, p_body: ok200, p_action_id: aid() })
    expect(r1.ok).toBe(true)
    const r2 = await rpc(b, 'create_question', { p_room_id: room.room_id, p_body: over, p_action_id: aid() })
    expect(r2.error?.code).toBe('INVALID_INPUT')
  })

  it('AT33·AT34 재시도는 질문 1개, 10초 안에 새 질문은 제한', async () => {
    const { host, room, students } = await setupRoom(1)
    const [s] = students
    const args = { p_room_id: room.room_id, p_body: '재시도 시험', p_action_id: aid() }
    const [x, y] = await Promise.all([rpc(s, 'create_question', args), rpc(s, 'create_question', args)])
    expect(x.data?.id).toBe(y.data?.id)
    expect((await snapshot(host, room.room_id)).pending_question_count).toBe(1)

    const soon = await rpc(s, 'create_question', { p_room_id: room.room_id, p_body: '두 번째', p_action_id: aid() })
    expect(soon.error?.code).toBe('RATE_LIMITED')
    expect(soon.error?.data?.retry_after_seconds).toBeGreaterThan(0)
  })

  it('AT31 script 태그는 문자열 그대로 저장', async () => {
    const { room, students } = await setupRoom(1)
    const body = '<script>alert(1)</script>'
    const res = await rpc(students[0], 'create_question', { p_room_id: room.room_id, p_body: body, p_action_id: aid() })
    expect(res.data?.body).toBe(body)
  })
})

describe('공감·상태', () => {
  async function withQuestion() {
    const ctx = await setupRoom(3)
    const [author] = ctx.students
    const q = await rpc(author, 'create_question', {
      p_room_id: ctx.room.room_id, p_body: 'useEffect 왜 두 번 실행돼요?', p_action_id: aid(),
    })
    return { ...ctx, questionId: q.data!.id as string }
  }

  it('AT36 내 질문 공감은 서버 거절', async () => {
    const { students, questionId } = await withQuestion()
    const res = await rpc(students[0], 'set_reaction', { p_question_id: questionId, p_desired: true, p_action_id: aid() })
    expect(res.error?.code).toBe('SELF_REACTION_NOT_ALLOWED')
  })

  it('AT37·AT38 공감 +1/-1, 중복 전송해도 한 번만', async () => {
    const { students, questionId } = await withQuestion()
    const [, b, c] = students
    const set = (s: typeof b, desired: boolean) =>
      rpc(s, 'set_reaction', { p_question_id: questionId, p_desired: desired, p_action_id: aid() })

    expect((await set(b, true)).data?.reaction_count).toBe(1)
    await sleep(400)
    expect((await set(b, true)).data?.reaction_count).toBe(1)
    expect((await set(c, true)).data?.reaction_count).toBe(2)
    await sleep(400)
    expect((await set(b, false)).data).toMatchObject({ reaction_count: 1, reacted_by_me: false })
  })

  it('AT39·AT40 답변 완료 질문은 공감 거절, 미답변 복구 시 수 정합', async () => {
    const { host, room, students, questionId } = await withQuestion()
    const answered = await rpc(host, 'set_question_status', {
      p_question_id: questionId, p_desired_status: 'answered', p_expected_version: 1, p_action_id: aid(),
    })
    expect(answered.data).toMatchObject({ status: 'answered', version: 2 })
    let snap = await snapshot(host, room.room_id)
    expect(snap.pending_question_count).toBe(0)

    const react = await rpc(students[1], 'set_reaction', { p_question_id: questionId, p_desired: true, p_action_id: aid() })
    expect(react.error?.code).toBe('QUESTION_NOT_PENDING')

    const back = await rpc(host, 'set_question_status', {
      p_question_id: questionId, p_desired_status: 'pending', p_expected_version: 2, p_action_id: aid(),
    })
    expect(back.data).toMatchObject({ status: 'pending', version: 3 })
    snap = await snapshot(host, room.room_id)
    expect(snap.pending_question_count).toBe(1)

    const stale = await rpc(host, 'set_question_status', {
      p_question_id: questionId, p_desired_status: 'answered', p_expected_version: 1, p_action_id: aid(),
    })
    expect(stale.error?.code).toBe('VERSION_CONFLICT')
  })

  it('AT41 숨김 질문은 모든 snapshot에서 사라지고 공감 불가', async () => {
    const { host, room, students, questionId } = await withQuestion()
    const hidden = await rpc(host, 'hide_question', { p_question_id: questionId, p_expected_version: 1, p_action_id: aid() })
    expect(hidden.ok).toBe(true)

    for (const who of [host, ...students]) {
      for (const filter of ['pending', 'answered']) {
        const snap = await snapshot(who, room.room_id, { p_filter: filter })
        expect(JSON.stringify(snap)).not.toContain(questionId)
      }
    }
    const react = await rpc(students[1], 'set_reaction', { p_question_id: questionId, p_desired: true, p_action_id: aid() })
    expect(react.error?.code).toBe('QUESTION_UNAVAILABLE')
  })

  it('정렬: 공감순·최신순, 20개 단위 페이지', async () => {
    const { host, room, students } = await setupRoom(3)
    const [a, b, c] = students
    const q1 = await rpc(a, 'create_question', { p_room_id: room.room_id, p_body: '첫 질문', p_action_id: aid() })
    const q2 = await rpc(b, 'create_question', { p_room_id: room.room_id, p_body: '둘째 질문', p_action_id: aid() })
    await rpc(c, 'set_reaction', { p_question_id: q1.data!.id, p_desired: true, p_action_id: aid() })

    const popular = await snapshot(host, room.room_id, { p_sort: 'popular' })
    expect(popular.questions_page.map((q: any) => q.id)).toEqual([q1.data!.id, q2.data!.id])
    const latest = await snapshot(host, room.room_id, { p_sort: 'latest', p_limit: 1 })
    expect(latest.questions_page.map((q: any) => q.id)).toEqual([q2.data!.id])
    expect(latest.next_offset).toBe(1)
  })
})
