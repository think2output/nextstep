// GATE-01 G5·G6·G8 시험용 실시간 연결.
// 시험 전용: 공개 Broadcast 채널 + URL의 role 값을 그대로 믿는다.
// 실제 제품은 private 채널, 서버 권한 판정, DB snapshot 기준이어야 한다 (PRD 13.2·13.4·16). 이 코드를 제품에 재사용하지 않는다.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export type Role = 'host' | 'student'
export type Choice = 'yes' | 'no'
export type ConnStatus = 'connecting' | 'live' | 'reconnecting'
export type SendState = 'idle' | 'sending' | 'confirmed' | 'unknown'
export type GateRequest = { id: number; sentAt: number }

const CHANNEL = 'gate-01-test'
const clientId = crypto.randomUUID()

export function useGateChannel(role: Role, addLog: (msg: string) => void) {
  const [conn, setConn] = useState<ConnStatus>('connecting')
  const [students, setStudents] = useState(0)
  const [request, setRequest] = useState<GateRequest | null>(null)
  const [answers, setAnswers] = useState<Record<string, Choice>>({}) // 강사: 학생별 마지막 선택
  const [myChoice, setMyChoice] = useState<Choice | null>(null) // 학생
  const [sendState, setSendState] = useState<SendState>('idle')
  const channelRef = useRef<RealtimeChannel | null>(null)
  const requestRef = useRef<GateRequest | null>(null)

  useEffect(() => {
    const ch = supabase.channel(CHANNEL, {
      config: { broadcast: { ack: true, self: false }, presence: { key: clientId } },
    })
    channelRef.current = ch

    ch.on('broadcast', { event: 'request' }, ({ payload }) => {
      if (role !== 'student') return
      const req = payload as GateRequest
      if (requestRef.current?.id === req.id) return
      // 새 요청은 이전 선택을 이어받지 않는다 (PRD 0.5-4)
      requestRef.current = req
      setRequest(req)
      setMyChoice(null)
      setSendState('idle')
      addLog(`요청 #${req.id} 받음`)
    })
      .on('broadcast', { event: 'answer' }, ({ payload }) => {
        if (role !== 'host') return
        const { requestId, from, choice } = payload as { requestId: number; from: string; choice: Choice }
        if (requestRef.current?.id !== requestId) {
          addLog(`지난 요청 #${requestId}에 대한 응답 무시`)
          return
        }
        setAnswers((prev) => ({ ...prev, [from]: choice }))
        addLog(`응답 받음: ${choice === 'yes' ? '준비됐어요' : '잠시만요'}`)
      })
      .on('broadcast', { event: 'hello' }, () => {
        // 새로 연결·재연결한 학생에게 진행 중인 요청을 다시 알려준다
        if (role !== 'host' || !requestRef.current) return
        void ch.send({ type: 'broadcast', event: 'request', payload: requestRef.current })
        addLog('새로 연결된 학생에게 현재 요청 다시 보냄')
      })
      .on('presence', { event: 'sync' }, () => {
        const state = ch.presenceState<{ role: Role }>()
        setStudents(Object.values(state).flat().filter((p) => p.role === 'student').length)
      })
      .subscribe(async (status) => {
        addLog(`연결 상태: ${status}`)
        if (status === 'SUBSCRIBED') {
          setConn('live')
          await ch.track({ role })
          if (role === 'student') void ch.send({ type: 'broadcast', event: 'hello', payload: {} })
        } else {
          setConn('reconnecting')
        }
      })

    const onOffline = () => addLog('인터넷 끊김 감지')
    const onOnline = () => addLog('인터넷 다시 연결됨')
    window.addEventListener('offline', onOffline)
    window.addEventListener('online', onOnline)

    return () => {
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('online', onOnline)
      channelRef.current = null
      void supabase.removeChannel(ch)
    }
  }, [role, addLog])

  const sendRequest = useCallback(async () => {
    const ch = channelRef.current
    if (!ch) return
    const req = { id: (requestRef.current?.id ?? 0) + 1, sentAt: Date.now() }
    requestRef.current = req
    setRequest(req)
    setAnswers({})
    const result = await ch.send({ type: 'broadcast', event: 'request', payload: req })
    addLog(`요청 #${req.id} 보냄 (${result === 'ok' ? '서버 받음' : `확인 못 함: ${result}`})`)
  }, [addLog])

  const answer = useCallback(
    async (choice: Choice) => {
      const ch = channelRef.current
      const req = requestRef.current
      if (!ch || !req) return
      setSendState('sending')
      const result = await ch.send({
        type: 'broadcast',
        event: 'answer',
        payload: { requestId: req.id, from: clientId, choice },
      })
      // 서버가 받았다고 확인한 뒤에만 '전달했어요' (PRD 0.5-5)
      if (requestRef.current?.id !== req.id) return
      if (result === 'ok') {
        setMyChoice(choice)
        setSendState('confirmed')
      } else {
        setSendState('unknown')
      }
      addLog(`응답 보냄: ${choice} (${result === 'ok' ? '서버 받음' : `확인 못 함: ${result}`})`)
    },
    [addLog],
  )

  const values = Object.values(answers)
  const yes = values.filter((c) => c === 'yes').length
  const no = values.length - yes

  return {
    conn,
    students,
    request,
    yes,
    no,
    unanswered: Math.max(students - values.length, 0),
    myChoice,
    sendState,
    sendRequest,
    answer,
  }
}
