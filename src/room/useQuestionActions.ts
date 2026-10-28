// 질문 공감·답변 완료·숨기기 (Q-02~Q-04). 작은 창 목록과 옆 질문 보기 창이 같이 쓴다.
import { type MouseEvent, useState } from 'react'
import { errorText, type QuestionCard } from '../shared/domain'
import type { RoomStore } from './useRoom'

export function useQuestionActions(store: RoomStore) {
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set())
  const [message, setMessage] = useState<string | null>(null)

  const withBusy = async (id: string, job: () => Promise<void>) => {
    setBusyIds((s) => new Set(s).add(id))
    try {
      await job()
    } finally {
      setBusyIds((s) => {
        const next = new Set(s)
        next.delete(id)
        return next
      })
    }
  }

  const react = (q: QuestionCard) =>
    withBusy(q.id, async () => {
      const res = await store.write('set_reaction', { p_question_id: q.id, p_desired: !q.reacted_by_me })
      if (!res.ok) setMessage(errorText(res.error.code))
    })

  const setStatus = (q: QuestionCard, desired: 'pending' | 'answered') =>
    withBusy(q.id, async () => {
      const res = await store.write('set_question_status', {
        p_question_id: q.id, p_desired_status: desired, p_expected_version: q.version,
      })
      if (!res.ok) setMessage(errorText(res.error.code))
    })

  const hide = (q: QuestionCard, e: MouseEvent<HTMLButtonElement>) => {
    // 버튼이 있는 창(작은 창·옆 창)의 confirm을 쓴다
    const win = e.currentTarget.ownerDocument.defaultView ?? window
    if (!win.confirm('이 질문을 숨길까요? 숨기면 되돌릴 수 없고 모든 화면에서 사라져요.')) return
    void withBusy(q.id, async () => {
      const res = await store.write('hide_question', { p_question_id: q.id, p_expected_version: q.version })
      if (!res.ok) setMessage(errorText(res.error.code))
    })
  }

  return { busyIds, message, setMessage, react, setStatus, hide }
}
