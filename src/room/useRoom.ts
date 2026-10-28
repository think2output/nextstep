// 방 상태 저장소 (PRD 12.2, 16장). 원래 탭과 작은 창이 이 하나를 공유한다 (PIP-02: 구독·heartbeat 1세트).
// 서버 snapshot이 진실의 원천. Realtime 알림은 "바뀌었다"는 신호만 받아 snapshot을 다시 읽는다.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { call, ensureSession, newActionId, type RpcResult } from '../lib/rpc'
import type { QuestionFilter, QuestionSort, Snapshot } from '../shared/domain'

export type ConnStatus = 'connecting' | 'live' | 'reconnecting' | 'unavailable'

const HEARTBEAT_MS = 15_000
const DEBOUNCE_MS = 150
const MAX_WAIT_MS = 500
// 스스로 다시 연결하다가 이 시간 안에 안 되면 '다시 연결' 버튼 (PRD v1.10 12.2, D-043)
const UNAVAILABLE_AFTER_MS = 20_000
const PAGE_LIMIT = 50
const FATAL = new Set(['ROOM_UNAVAILABLE', 'ROOM_EXPIRED', 'FORBIDDEN', 'UNAUTHENTICATED'])

export function useRoom(roomId: string) {
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [fatal, setFatal] = useState<string | null>(null)
  const [conn, setConn] = useState<ConnStatus>('connecting')
  const [filter, setFilter] = useState<QuestionFilter>('pending')
  const [sort, setSort] = useState<QuestionSort>('popular')
  const [epoch, setEpoch] = useState(0)

  const revision = useRef(-1)
  const view = useRef({ filter, sort })
  const fetching = useRef(false)
  const again = useRef(false)
  const timer = useRef<number | null>(null)
  const firstScheduledAt = useRef(0)

  const fetchNow = useCallback(async () => {
    if (fetching.current) {
      again.current = true
      return
    }
    fetching.current = true
    try {
      do {
        again.current = false
        const want = view.current
        const res = await call<Snapshot>(
          'get_snapshot',
          { p_room_id: roomId, p_filter: want.filter, p_sort: want.sort, p_offset: 0, p_limit: PAGE_LIMIT },
          10_000,
        )
        if (!res.ok) {
          if (FATAL.has(res.error.code)) setFatal(res.error.code)
          continue
        }
        const next = res.data
        // 받아온 snapshot이 현재보다 오래됐으면 버린다 (16.2)
        if (next.room.revision < revision.current) continue
        // 읽는 동안 필터·정렬이 바뀌었으면 다시 읽는다
        if (next.filter !== view.current.filter || next.sort !== view.current.sort) {
          again.current = true
          continue
        }
        revision.current = next.room.revision
        setSnap(next)
        setFatal(null)
      } while (again.current)
    } finally {
      fetching.current = false
    }
  }, [roomId])

  // 150ms 모아서 읽기, 첫 알림부터 최대 500ms 안에는 반드시 읽기
  const schedule = useCallback(() => {
    const now = Date.now()
    if (timer.current === null) firstScheduledAt.current = now
    else clearTimeout(timer.current)
    const wait = Math.max(0, Math.min(DEBOUNCE_MS, MAX_WAIT_MS - (now - firstScheduledAt.current)))
    timer.current = window.setTimeout(() => {
      timer.current = null
      void fetchNow()
    }, wait)
  }, [fetchNow])

  useEffect(() => {
    view.current = { filter, sort }
    schedule()
  }, [filter, sort, schedule])

  useEffect(() => {
    let disposed = false
    let channel: RealtimeChannel | null = null
    let subscribed = false
    let badSince: number | null = null

    const markBad = () => {
      badSince ??= Date.now()
      setConn(Date.now() - badSince > UNAVAILABLE_AFTER_MS ? 'unavailable' : 'reconnecting')
    }
    const markGood = () => {
      badSince = null
      setConn('live')
    }

    const beat = async () => {
      const res = await call('heartbeat', { p_room_id: roomId })
      if (disposed) return
      if (res.ok) {
        if (subscribed) markGood()
        // 30초 재확인 대신 heartbeat 응답의 revision으로 누락 알림을 복구한다 (12.2)
        if ((res.room_revision ?? -1) > revision.current) schedule()
      } else if (FATAL.has(res.error.code)) {
        setFatal(res.error.code)
      } else {
        markBad()
      }
    }

    void (async () => {
      try {
        await ensureSession()
      } catch {
        if (!disposed) setFatal('UNAUTHENTICATED')
        return
      }
      if (disposed) return
      await supabase.realtime.setAuth()
      channel = supabase.channel(`room:${roomId}`, { config: { private: true } })
      channel
        .on('broadcast', { event: 'room_changed' }, ({ payload }) => {
          if ((payload?.revision ?? 0) > revision.current) schedule()
        })
        .subscribe((status) => {
          if (disposed) return
          if (status === 'SUBSCRIBED') {
            subscribed = true
            markGood()
            schedule() // 구독 전후 틈에 놓친 변경 복구
          } else {
            subscribed = false
            markBad()
          }
        })
      void beat()
    })()

    void fetchNow()
    const heartbeat = setInterval(() => void beat(), HEARTBEAT_MS)
    // 20초 경계를 늦지 않게 넘기도록 1초마다 확인 (로컬 계산만, 서버 호출 없음)
    const badTick = setInterval(() => {
      if (badSince !== null) markBad()
    }, 1_000)
    // 기기 인터넷이 끊기면 heartbeat(15초)를 기다리지 않고 바로 '다시 연결하는 중'으로 (D-043)
    const onOffline = () => markBad()
    const onWake = () => {
      if (document.visibilityState === 'hidden') return
      schedule()
      void beat()
    }
    window.addEventListener('focus', onWake)
    window.addEventListener('online', onWake)
    window.addEventListener('offline', onOffline)
    document.addEventListener('visibilitychange', onWake)

    return () => {
      disposed = true
      clearInterval(heartbeat)
      clearInterval(badTick)
      window.removeEventListener('focus', onWake)
      window.removeEventListener('online', onWake)
      window.removeEventListener('offline', onOffline)
      document.removeEventListener('visibilitychange', onWake)
      if (channel) void supabase.removeChannel(channel)
    }
  }, [roomId, epoch, schedule, fetchNow])

  // 쓰기: action_id는 사용자 의도마다 새로, 재시도는 같은 값 (15.3). 결과와 상관없이 snapshot으로 확인.
  const write = useCallback(
    async <T,>(fn: string, args: Record<string, unknown>, actionId = newActionId()): Promise<RpcResult<T>> => {
      const res = await call<T>(fn, { ...args, p_action_id: actionId })
      schedule()
      return res
    },
    [schedule],
  )

  const reconnect = useCallback(() => {
    setConn('connecting')
    setEpoch((e) => e + 1)
  }, [])

  return {
    snap,
    fatal,
    conn,
    filter,
    setFilter,
    sort,
    setSort,
    write,
    refresh: schedule,
    reconnect,
    // 복구 중·종료된 방에서는 쓰기 잠금 (12.2, 6.3)
    canWrite: conn === 'live' && snap?.room.status === 'open',
  }
}

export type RoomStore = ReturnType<typeof useRoom>
