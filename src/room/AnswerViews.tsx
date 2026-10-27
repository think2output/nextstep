// 작은 창 응답 탭 (PRD 8.4 학생, 8.5 강사, RESP-04 전송 UI)
import { useState } from 'react'
import { newActionId } from '../lib/rpc'
import {
  ROUND_TEXT,
  ROUND_TYPES,
  errorText,
  type Choice,
  type HostRound,
  type RoundType,
  type StudentRound,
} from '../shared/domain'
import type { RoomStore } from './useRoom'

type Pending = { roundId: string; choice: Choice; actionId: string; base: number; state: 'sending' | 'unknown' }

export function StudentAnswer({ store }: { store: RoomStore }) {
  const round = store.snap?.active_round as StudentRound | null
  const [rawPending, setPending] = useState<Pending | null>(null)
  const [confirmed, setConfirmed] = useState<{ roundId: string; choice: Choice; version: number } | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  // 새 회차에는 이전 전송 상태를 가져가지 않는다 (RESP-03)
  const roundId = round?.id ?? null
  const [stateRound, setStateRound] = useState(roundId)
  if (stateRound !== roundId) {
    setStateRound(roundId)
    setPending(null)
    setMessage(null)
  }

  const serverVersion = round?.my_response_version ?? 0
  // 서버 승인 직후 snapshot이 따라오기 전까지는 승인 결과를 보여준다
  const local = confirmed && confirmed.roundId === round?.id && confirmed.version > serverVersion ? confirmed : null
  const myChoice = local?.choice ?? round?.my_choice ?? null
  const myVersion = local?.version ?? serverVersion

  // 결과 미확인이어도 snapshot에 반영됐으면 성공으로 본다 (RESP-04-5·6)
  const resolved =
    rawPending?.state === 'unknown' &&
    round?.id === rawPending.roundId &&
    round.my_response_version > rawPending.base &&
    round.my_choice === rawPending.choice
  const pending = resolved ? null : rawPending

  if (!round) {
    // 지난 확인에 내가 어떻게 응답했는지 (사용자 피드백 2). 다른 학생의 선택·집계는 보여주지 않는다.
    const last = store.snap?.latest_closed_round as StudentRound | null
    const lastText = last ? ROUND_TEXT[last.type] : null
    return (
      <>
        <p className="pv-empty">현재 응답 요청이 없어요.<br />실습을 계속해주세요.</p>
        {last?.is_target && lastText && (
          <p className="pv-status pv-hide-compact" title={lastText.question}>
            지난 {lastText.label}:{' '}
            {last.my_choice ? `‘${last.my_choice === 'yes' ? lastText.yes : lastText.no}’로 응답했어요` : '응답하지 않았어요'}
          </p>
        )}
      </>
    )
  }
  const text = ROUND_TEXT[round.type]
  if (!round.is_target) {
    return (
      <>
        <p className="pv-q" title={text.question}>{text.question}</p>
        <p className="pv-empty">이번 확인은 시작됐어요.<br />다음 확인부터 참여할 수 있어요.</p>
      </>
    )
  }

  const send = async (choice: Choice, retry?: Pending) => {
    if (pending?.state === 'sending') return
    if (!retry && !pending && choice === myChoice) return // 같은 값 재클릭은 변화 없음 (AT19)
    const next: Pending = retry
      ? { ...retry, state: 'sending' }
      : { roundId: round.id, choice, actionId: newActionId(), base: myVersion, state: 'sending' }
    setPending(next)
    setMessage(null)
    const res = await store.write<{ my_choice: Choice; version: number }>(
      'set_response',
      { p_round_id: next.roundId, p_choice: next.choice, p_expected_version: next.base },
      next.actionId,
    )
    if (res.ok) {
      setConfirmed({ roundId: next.roundId, choice: res.data.my_choice, version: res.data.version })
      setPending(null)
    } else if (res.error.code === 'TIMEOUT' || res.error.code === 'NETWORK') {
      setPending({ ...next, state: 'unknown' })
    } else {
      setPending(null) // 이전 확정 선택으로 복원 (RESP-04-7)
      setMessage(errorText(res.error.code, res.error.data?.retry_after_seconds))
    }
  }

  const shown = pending?.choice ?? myChoice
  const label = (c: Choice) => (c === 'yes' ? text.yes : text.no)

  let status
  if (pending?.state === 'sending') {
    status = <p className="pv-status" aria-live="polite">전송 중…</p>
  } else if (pending?.state === 'unknown') {
    status = (
      <p className="pv-status pv-status-warn" aria-live="polite">
        전송을 확인하지 못했어요
        <button type="button" className="pv-retry" onClick={() => void send(pending.choice, pending)}>
          다시 보내기
        </button>
      </p>
    )
  } else if (message) {
    status = <p className="pv-status pv-status-warn" aria-live="polite">{message}</p>
  } else if (myChoice) {
    status = <p className="pv-status pv-status-ok" aria-live="polite">✓ ‘{label(myChoice)}’로 전달했어요</p>
  } else {
    status = <p className="pv-status pv-status-idle" aria-live="polite">미응답</p>
  }

  return (
    <>
      <p className="pv-q" title={text.question}>{text.question}</p>
      <div className="pv-choices">
        {(['yes', 'no'] as const).map((c) => (
          <button
            key={c}
            type="button"
            className="pv-choice"
            aria-pressed={shown === c}
            disabled={!store.canWrite || pending?.state === 'sending'}
            onClick={() => void send(c)}
          >
            {shown === c && '✓ '}
            {label(c)}
          </button>
        ))}
      </div>
      {status}
    </>
  )
}

export function HostAnswer({ store }: { store: RoomStore }) {
  const snap = store.snap!
  const active = snap.active_round as HostRound | null
  const last = snap.latest_closed_round as HostRound | null
  const connected = snap.current_connected_students ?? 0
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const run = async (fn: string, args: Record<string, unknown>) => {
    setBusy(true)
    setMessage(null)
    const res = await store.write(fn, args)
    setBusy(false)
    if (!res.ok) setMessage(errorText(res.error.code))
  }

  if (active) {
    const t = ROUND_TEXT[active.type]
    return (
      <>
        {/* 확인 종료 버튼을 제목 줄에 두어 240×160 안에 집계·막대·과반이 모두 들어가게 한다 */}
        <div className="pv-q-row">
          <p className="pv-q" title={t.question}>{t.label} 진행 중</p>
          <button
            type="button"
            className="pv-action pv-action-grey pv-action-inline"
            disabled={!store.canWrite || busy}
            onClick={() => void run('close_round', { p_round_id: active.id })}
          >
            확인 종료
          </button>
        </div>
        <RoundStats round={active} />
        {active.target_connection_unknown_count > 0 && (
          <p className="pv-meta">대상 중 연결 미확인 {active.target_connection_unknown_count}명</p>
        )}
        {message && <p className="pv-status pv-status-warn">{message}</p>}
      </>
    )
  }

  return (
    <>
      {last ? (
        <>
          <p className="pv-q pv-hide-compact" title="종료된 확인">종료된 {ROUND_TEXT[last.type].label}</p>
          <div className="pv-hide-compact">
            <RoundStats round={last} />
          </div>
        </>
      ) : (
        <p className="pv-q">보낼 확인을 고르세요</p>
      )}
      <p className="pv-meta">{connected > 0 ? `지금 연결된 수강생 ${connected}명` : '연결된 수강생이 없어요. 코드를 공유해주세요.'}</p>
      <div className="pv-actions">
        {ROUND_TYPES.map((type: RoundType) => (
          <button
            key={type}
            type="button"
            className="pv-action"
            title={ROUND_TEXT[type].question}
            disabled={!store.canWrite || busy || connected === 0}
            onClick={() => void run('start_round', { p_room_id: snap.room.id, p_type: type })}
          >
            {ROUND_TEXT[type].label}
          </button>
        ))}
      </div>
      {message && <p className="pv-status pv-status-warn">{message}</p>}
    </>
  )
}

// 강사 집계: 인원 + 대상 대비 %, 막대(50% 표시선), 과반 안내 (사용자 피드백 3).
// 분모는 요청 시작 시 고정한 대상 인원 (RESP-02). 색만으로 구분하지 않도록 글자로도 표시.
export function RoundStats({ round }: { round: HostRound }) {
  const t = ROUND_TEXT[round.type]
  const total = round.target_count
  const pct = (n: number) => (total > 0 ? Math.round((n * 100) / total) : 0)
  const width = (n: number) => `${total > 0 ? (n * 100) / total : 0}%`
  const need = Math.floor(total / 2) + 1

  let majority: string
  if (round.yes_count >= need) majority = `✓ 과반이 ‘${t.yesShort}’ (${pct(round.yes_count)}%)`
  else if (round.no_count >= need) majority = `과반이 ‘${t.noShort}’ (${pct(round.no_count)}%)`
  else majority = `‘${t.yesShort}’ 과반까지 ${need - round.yes_count}명`

  const cells = [
    { key: 'yes', label: t.yesShort, title: t.yes, n: round.yes_count },
    { key: 'no', label: t.noShort, title: t.no, n: round.no_count },
    { key: 'unanswered', label: '미응답', title: '미응답', n: round.unanswered_count },
  ]

  return (
    <>
      <div className="pv-stats">
        {cells.map((c) => (
          <div key={c.key} className={`pv-stat pv-stat-${c.key}`} title={`${c.title} ${c.n}명 (${pct(c.n)}%)`}>
            <span className="pv-stat-label">{c.label}</span>
            <span className="pv-stat-num">
              {c.n}
              <span className="pv-stat-pct">{pct(c.n)}%</span>
            </span>
          </div>
        ))}
      </div>
      <div
        className="pv-meter"
        role="img"
        aria-label={`${t.yesShort} ${pct(round.yes_count)}%, ${t.noShort} ${pct(round.no_count)}%, 미응답 ${pct(round.unanswered_count)}%`}
      >
        <span className="pv-meter-yes" style={{ width: width(round.yes_count) }} />
        <span className="pv-meter-no" style={{ width: width(round.no_count) }} />
        <i className="pv-meter-half" />
      </div>
      <p className="pv-majority" title={`대상 ${total}명 중 과반은 ${need}명`}>
        {majority} · 대상 {total}명
      </p>
    </>
  )
}
