// 작은 창 내용 (PRD 8.2~8.7). 원래 탭의 미리보기 틀과 PiP 창에 같은 컴포넌트를 쓴다.
import { type MouseEvent, useState } from 'react'
import { PIP_SIZE_COMPACT, PIP_SIZE_DEFAULT, resizePip } from '../pip/usePip'
import { HostAnswer, StudentAnswer } from './AnswerViews'
import QuestionView from './QuestionView'
import type { NudgeState } from './useNudge'
import type { RoomStore } from './useRoom'

export type PipTab = 'answer' | 'question'

type Props = {
  store: RoomStore
  tab: PipTab
  setTab: (tab: PipTab) => void
  compact: boolean
  setCompact: (compact: boolean) => void
  draft: string
  setDraft: (value: string) => void
  nudge: NudgeState
  // 실제 작은 창(PiP) 안에 그릴 때만 true. 원래 탭 미리보기에는 '탭으로 돌아가기'가 필요 없다
  inPip: boolean
}

export default function PipView({ store, tab, setTab, compact, setCompact, draft, setDraft, nudge, inPip }: Props) {
  const snap = store.snap!
  const isHost = snap.my_role === 'host'
  const activeId = snap.active_round?.id ?? null

  // 질문 탭에 있는 동안 새 요청이 오면 배지만 표시. 자동 탭 이동·크기 변경 없음 (PIP-04)
  const [seenRound, setSeenRound] = useState(activeId)
  if (tab === 'answer' && seenRound !== activeId) setSeenRound(activeId)
  const newRequest = !isHost && tab === 'question' && activeId !== null && activeId !== seenRound

  const toggleCompact = (e: MouseEvent<HTMLButtonElement>) => {
    const next = !compact
    setCompact(next)
    // 작은 창 안의 클릭일 때만 그 창 크기를 바꾼다 (Chrome: PiP 창의 사용자 클릭 필요)
    const win = e.currentTarget.ownerDocument.defaultView
    if (win && win !== window) resizePip(win, next ? PIP_SIZE_COMPACT : PIP_SIZE_DEFAULT)
  }

  // 사용자가 누를 때만 원래 탭으로 돌아가고 작은 창은 닫는다 (Chrome '탭으로 돌아가기'와 같게, D-039).
  // 다시 쓰려면 원래 탭의 '작은 창 다시 열기' (PIP-03, 자동 재열기 없음)
  const backToTab = (e: MouseEvent<HTMLButtonElement>) => {
    window.focus()
    const win = e.currentTarget.ownerDocument.defaultView
    if (win && win !== window) win.close()
  }

  const conn =
    store.conn === 'live' ? (
      <span className="pv-conn pv-conn-live" title="연결됨" aria-label="연결됨">●</span>
    ) : store.conn === 'unavailable' ? (
      <button type="button" className="pv-icon pv-conn pv-conn-bad" onClick={store.reconnect}>다시 연결</button>
    ) : (
      <span className="pv-conn pv-conn-bad" aria-live="polite">{store.conn === 'connecting' ? '연결 중' : '재연결 중'}</span>
    )

  return (
    // 크기 전환은 실제 작은 창에서만. 원래 탭 미리보기는 항상 기본 배치
    <div className={`pv${compact && inPip ? ' pv-compact' : ''}`}>
      {/* 재촉: 빨간 테두리 3번 깜빡인 뒤 응답할 때까지 유지 (D-028). 횟수가 바뀌면 key로 애니메이션 재시작 */}
      {nudge.active && <div key={nudge.key} className="pv-nudge" aria-hidden="true" />}
      <div className="pv-bar">
        <button type="button" className="pv-tab" aria-pressed={tab === 'answer'} onClick={() => setTab('answer')}>
          응답
          {nudge.active && tab === 'question' ? (
            <span className="pv-badge pv-badge-alert" role="status" aria-label="강사님이 응답을 기다려요" />
          ) : (
            newRequest && <span className="pv-badge" role="status" aria-label="새 응답 요청" />
          )}
        </button>
        <button type="button" className="pv-tab" aria-pressed={tab === 'question'} onClick={() => setTab('question')}>
          질문 {snap.pending_question_count}
        </button>
        <span className="pv-spacer" />
        {conn}
        {inPip && (
          <button
            type="button"
            className="pv-icon"
            aria-label={compact ? '기본 크기로' : '더 작게'}
            title={compact ? '기본 크기로' : '더 작게'}
            onClick={toggleCompact}
          >
            {compact ? '＋' : '−'}
          </button>
        )}
        {inPip && (
          <button type="button" className="pv-icon" aria-label="작은 창 닫고 원래 탭으로" title="작은 창 닫고 원래 탭으로" onClick={backToTab}>
            ↗
          </button>
        )}
      </div>

      {snap.room.status === 'ended' && <p className="pv-ended">종료된 방이에요 · 읽기만 가능</p>}

      <div className={`pv-body${tab === 'answer' ? ' pv-scroll-body' : ''}`}>
        {tab === 'answer' ? (
          isHost ? <HostAnswer store={store} /> : <StudentAnswer store={store} />
        ) : (
          <QuestionView store={store} draft={draft} setDraft={setDraft} />
        )}
      </div>
    </div>
  )
}
