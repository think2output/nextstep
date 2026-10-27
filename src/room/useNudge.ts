// 학생 쪽 재촉 감지 (D-028). 서버는 '내가 미응답일 때만' nudge_count를 준다.
// 같은 회차에서 횟수가 늘면 알림음. 깜빡임은 key가 바뀔 때 CSS 애니메이션이 다시 돈다.
import { useEffect, useRef } from 'react'
import { playChime } from '../lib/chime'
import type { StudentRound } from '../shared/domain'
import type { RoomStore } from './useRoom'

export function useNudge(store: RoomStore, soundOn: boolean) {
  const round = store.snap?.my_role === 'student' ? (store.snap.active_round as StudentRound | null) : null
  const roundId = round?.id ?? null
  const count = round?.nudge_count ?? 0
  const seen = useRef<{ roundId: string | null; count: number } | null>(null)

  useEffect(() => {
    const prev = seen.current
    seen.current = { roundId, count }
    // 처음 불러올 때(새로고침 등)는 소리 없이 상태만 보여준다
    if (!prev || prev.roundId !== roundId) return
    if (count > prev.count && soundOn) playChime()
  }, [roundId, count, soundOn])

  return {
    active: count > 0,
    key: `${roundId}:${count}`,
  }
}

export type NudgeState = ReturnType<typeof useNudge>
