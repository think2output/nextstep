// S02~S04, S09: 방 화면(원래 탭). 작은 창이 열려 있으면 이 탭은 상태·다시 열기 안내 중심 (PIP-02).
import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { navigate } from '../app/router'
import { PIP_SIZE_COMPACT, PIP_SIZE_DEFAULT, usePip } from '../pip/usePip'
import PipView, { type PipTab } from '../room/PipView'
import { useNudge } from '../room/useNudge'
import { useRoom } from '../room/useRoom'
import { copyText } from '../lib/clipboard'
import { call } from '../lib/rpc'
import { RoundStats } from '../room/AnswerViews'
import { ROUND_TEXT, errorText, type HostRound } from '../shared/domain'

function draftKey(roomId: string) {
  return `nextstep:draft:${roomId}`
}

const SOUND_KEY = 'nextstep:nudge-sound'

function readSound() {
  try {
    return localStorage.getItem(SOUND_KEY) !== 'off'
  } catch {
    return true
  }
}

function readDraft(roomId: string) {
  try {
    return sessionStorage.getItem(draftKey(roomId)) ?? ''
  } catch {
    return ''
  }
}

export default function RoomPage({ roomId }: { roomId: string }) {
  const store = useRoom(roomId)
  const { snap } = store
  const pip = usePip()
  const [tab, setTab] = useState<PipTab>('answer')
  const [compact, setCompact] = useState(false)
  const [ending, setEnding] = useState(false)
  const [endError, setEndError] = useState<string | null>(null)
  const [soundOn, setSoundOn] = useState(readSound)
  const nudge = useNudge(store, soundOn)
  const toggleSound = (on: boolean) => {
    setSoundOn(on)
    try {
      localStorage.setItem(SOUND_KEY, on ? 'on' : 'off')
    } catch {
      // 이 브라우저에서만 기억 못 할 뿐
    }
  }

  // 작성 중 질문은 같은 탭 새로고침에서 복원. 서버로 보내지 않는다 (PIP-03)
  const [draft, setDraftState] = useState(() => readDraft(roomId))
  const setDraft = useCallback(
    (value: string) => {
      setDraftState(value)
      try {
        if (value) sessionStorage.setItem(draftKey(roomId), value)
        else sessionStorage.removeItem(draftKey(roomId))
      } catch {
        // 저장소를 못 쓰면 복원만 안 될 뿐 동작에는 문제없다
      }
    },
    [roomId],
  )

  // 방이 종료되면 초안을 지운다
  const ended = snap?.room.status === 'ended'
  if (ended && draft) setDraft('')

  if (store.fatal) {
    return (
      <main className="page">
        <h1 className="page-title">방에 들어갈 수 없어요</h1>
        <p className="page-desc">{errorText(store.fatal)}</p>
        <button type="button" className="btn btn-primary btn-block" onClick={() => navigate('/')}>처음으로</button>
      </main>
    )
  }

  if (!snap) {
    return (
      <main className="page">
        <p className="muted" aria-live="polite">수업 방 정보를 불러오는 중…</p>
      </main>
    )
  }

  const isHost = snap.my_role === 'host'
  const joinCode = snap.room.join_code ?? null
  const view = (
    <PipView
      store={store}
      tab={tab}
      setTab={setTab}
      compact={compact}
      setCompact={setCompact}
      draft={draft}
      nudge={nudge}
      setDraft={setDraft}
    />
  )

  const endRoom = async () => {
    if (!window.confirm('방을 종료하면 새 응답과 질문을 받을 수 없어요. 종료할까요?')) return
    setEnding(true)
    setEndError(null)
    const res = await store.write('end_room', { p_room_id: roomId })
    setEnding(false)
    if (!res.ok) setEndError(errorText(res.error.code))
  }

  return (
    <main className="page">
      <p className="muted">{isHost ? '강사' : '수강생 · 익명'}</p>
      <h1 className="page-title" title={snap.room.title}>{snap.room.title}</h1>

      {ended && <p className="notice">수업 방이 종료됐어요. 종료 후 24시간 동안 읽기만 가능해요.</p>}

      {isHost && joinCode && !ended && <HostShare joinCode={joinCode} />}

      <section className="section stack">
        <h2 className="section-title">작은 창</h2>
        {pip.status === 'unsupported' ? (
          <p className="notice notice-warn">
            이 브라우저는 작은 창을 지원하지 않아요. Windows의 최신 Chrome에서 열어주세요. 아래 화면으로는 사용할 수 있어요.
          </p>
        ) : pip.status === 'open' ? (
          <p className="notice">작은 창을 사용하는 동안 이 탭은 닫지 마세요.</p>
        ) : (
          <p className="muted">VS Code·젭 위에 떠 있는 작은 창에서 응답{isHost ? '을 확인' : '하고 질문'}할 수 있어요.</p>
        )}
        {pip.error && <p className="error-text">작은 창을 열지 못했어요. 아래 화면을 사용해주세요.</p>}
        {pip.status !== 'unsupported' && pip.status !== 'open' && (
          <button
            type="button"
            className="btn btn-primary btn-block"
            disabled={pip.status === 'opening'}
            onClick={() => void pip.open(compact ? PIP_SIZE_COMPACT : PIP_SIZE_DEFAULT)}
          >
            {pip.status === 'closed' && pip.wasOpened ? '작은 창 다시 열기' : '작은 창 띄우기'}
          </button>
        )}
        {pip.status !== 'open' && <div className="pip-frame">{view}</div>}
        {!isHost && (
          <label className="switch-row">
            <input type="checkbox" checked={soundOn} onChange={(e) => toggleSound(e.target.checked)} />
            <span>
              재촉 알림음
              <span className="muted"> · 강사님이 응답을 기다릴 때 짧은 소리로 알려요</span>
            </span>
          </label>
        )}
      </section>

      {isHost && <RoundHistory roomId={roomId} lastClosedId={snap.latest_closed_round?.id ?? null} />}

      {isHost && !ended && (
        <section className="section stack">
          {endError && <p className="error-text">{endError}</p>}
          <button type="button" className="btn btn-danger btn-block" disabled={ending} onClick={() => void endRoom()}>
            수업 방 종료
          </button>
          <p className="muted">수업이 끝나도 질문 확인을 위해 방은 자동으로 닫히지 않아요. (최대 12시간)</p>
        </section>
      )}

      {pip.pipWindow && createPortal(view, pip.pipWindow.document.body)}
    </main>
  )
}

function HostShare({ joinCode }: { joinCode: string }) {
  const link = `${window.location.origin}/join?code=${joinCode}`
  const [result, setResult] = useState<{ what: 'code' | 'link'; ok: boolean } | null>(null)

  const copy = async (what: 'code' | 'link') => {
    const ok = await copyText(what === 'code' ? joinCode : link)
    setResult({ what, ok })
    if (ok) setTimeout(() => setResult(null), 2000)
  }
  const label = (what: 'code' | 'link', text: string) =>
    result?.what === what && result.ok ? '✓ 복사했어요' : text

  return (
    <section className="card stack">
      <span className="field-label">참여 코드</span>
      <span className="code-big">{joinCode}</span>
      <div className="row">
        <button type="button" className="btn btn-weak btn-s" onClick={() => void copy('link')}>
          {label('link', '참여 링크 복사')}
        </button>
        <button type="button" className="btn btn-grey btn-s" onClick={() => void copy('code')}>
          {label('code', '코드만 복사')}
        </button>
      </div>
      {result && !result.ok && (
        <p className="error-text" role="alert">복사하지 못했어요. 아래 링크를 직접 선택해서 복사해주세요.</p>
      )}
      <input
        className="input share-link"
        readOnly
        value={link}
        aria-label="참여 링크"
        onFocus={(e) => e.currentTarget.select()}
      />
      <p className="muted">링크를 젭 채팅에 올려주세요. 코드는 수업 밖에 공유하지 마세요.</p>
    </section>
  )
}

// 지난 확인 기록 (사용자 피드백 2). 마지막으로 닫힌 회차가 바뀔 때 다시 불러온다.
function RoundHistory({ roomId, lastClosedId }: { roomId: string; lastClosedId: string | null }) {
  const [rounds, setRounds] = useState<HostRound[] | null>(null)

  useEffect(() => {
    let cancelled = false
    void call<{ rounds: HostRound[] }>('get_round_history', { p_room_id: roomId, p_limit: 20 }).then((res) => {
      if (!cancelled && res.ok) setRounds(res.data.rounds)
    })
    return () => {
      cancelled = true
    }
  }, [roomId, lastClosedId])

  if (!rounds || rounds.length === 0) return null
  return (
    <section className="section">
      <h2 className="section-title">지난 확인 기록</h2>
      <ol className="history">
        {rounds.map((r) => (
          <li key={r.id} className="history-item">
            <div className="history-head">
              <span>{ROUND_TEXT[r.type].label}</span>
              <time dateTime={r.closed_at ?? undefined}>
                {r.closed_at &&
                  new Date(r.closed_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}
              </time>
            </div>
            <RoundStats round={r} />
          </li>
        ))}
      </ol>
    </section>
  )
}
