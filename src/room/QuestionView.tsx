// 작은 창 질문 탭 (PRD 8.6 v1.2, 8.7, Q-01~Q-04)
// 학생: 입력칸 하나로 찾기+쓰기, 🙋 공감. 강사: 미답변/완료 전환, 답변 완료·되돌리기·숨기기.
import { type MouseEvent, useMemo, useState } from 'react'
import ScrollArea from '../pip/ScrollArea'
import { QUESTION_MAX, errorText, textLength, type QuestionCard } from '../shared/domain'
import { MATCH_THRESHOLD, SEARCH_MIN_CHARS, matchScore } from '../shared/similar'
import type { RoomStore } from './useRoom'

type Props = {
  store: RoomStore
  draft: string
  setDraft: (value: string) => void
}

export default function QuestionView({ store, draft, setDraft }: Props) {
  const snap = store.snap!
  const isHost = snap.my_role === 'host'
  const cards = snap.questions_page
  const [openId, setOpenId] = useState<string | null>(null)
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set())
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  // 보고 있는 순서를 실시간 변경으로 갑자기 바꾸지 않는다 (8.6): 기존 질문 순서는 유지하고 새 질문은 맨 아래에 붙인다.
  // 서버 순서와 달라지면 '목록 업데이트'로 다시 정렬. 필터·정렬이 바뀌면 서버 순서로 새로 시작.
  const key = `${snap.filter}|${snap.sort}`
  const serverIds = cards.map((c) => c.id)
  const [order, setOrder] = useState({ key: '', ids: [] as string[] })
  // 내가 방금 남긴 질문이 snapshot에 들어오면 서버 순서로 맞춘다 (내 질문을 바로 제자리에서 확인)
  const [resyncOn, setResyncOn] = useState<string | null>(null)
  if (order.key !== key || (resyncOn && serverIds.includes(resyncOn))) {
    setOrder({ key, ids: serverIds })
    if (resyncOn) setResyncOn(null)
  }
  const base = order.key === key ? order.ids : serverIds
  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards])
  const kept = base.filter((id) => byId.has(id))
  const keptSet = new Set(kept)
  const ids = [...kept, ...serverIds.filter((id) => !keptSet.has(id))]
  const outOfOrder = ids.some((id, i) => id !== serverIds[i])
  const ordered = ids.map((id) => byId.get(id)!)

  const len = textLength(draft)
  const searching = !isHost && len >= SEARCH_MIN_CHARS
  const list = searching
    ? cards
        .map((c) => ({ c, score: matchScore(draft.trim(), c.body) }))
        .filter((x) => x.score >= MATCH_THRESHOLD)
        .sort((a, b) => b.score - a.score || b.c.reaction_count - a.c.reaction_count)
        .map((x) => x.c)
    : ordered

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

  const submit = async () => {
    if (sending || len < 1 || len > QUESTION_MAX) return
    setSending(true)
    setMessage(null)
    const res = await store.write<QuestionCard>('create_question', { p_room_id: snap.room.id, p_body: draft })
    setSending(false)
    if (res.ok) {
      setDraft('') // 등록 성공 후에만 지운다 (Q-01)
      setResyncOn(res.data.id)
    } else {
      setMessage(errorText(res.error.code, res.error.data?.retry_after_seconds))
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
    // 작은 창 안에서 확인창을 띄우려면 그 창의 confirm을 쓴다
    const win = e.currentTarget.ownerDocument.defaultView ?? window
    if (!win.confirm('이 질문을 숨길까요? 숨기면 되돌릴 수 없고 모든 화면에서 사라져요.')) return
    void withBusy(q.id, async () => {
      const res = await store.write('hide_question', { p_question_id: q.id, p_expected_version: q.version })
      if (!res.ok) setMessage(errorText(res.error.code))
    })
  }

  // 정렬은 탭 줄이 아니라 질문 탭 첫 줄에 둔다. 탭 줄이 응답·질문에서 같아야 꺾이지 않는다 (사용자 피드백, D-041)
  const sortButton = (
    <button
      type="button"
      className="pv-icon qv-sort"
      aria-label={`정렬: ${store.sort === 'popular' ? '저도 궁금해요 많은 순' : '최신순'}. 눌러서 바꾸기`}
      title={store.sort === 'popular' ? '🙋 많은 순 (눌러서 최신순)' : '최신순 (눌러서 🙋 많은 순)'}
      onClick={() => store.setSort(store.sort === 'popular' ? 'latest' : 'popular')}
    >
      {store.sort === 'popular' ? '🙋⇅' : '🕒⇅'}
    </button>
  )

  return (
    <>
      {!isHost && (
        <div className="qv-compose">
          <textarea
            className="qv-input"
            value={draft}
            rows={1}
            maxLength={QUESTION_MAX * 2}
            placeholder="익명 질문·찾기 (이름·키 X)"
            aria-label="익명 질문 입력. 쓰는 동안 비슷한 질문이 아래에 표시돼요. 이름·연락처·API 키는 적지 마세요"
            disabled={!store.canWrite}
            onChange={(e) => setDraft(e.target.value)}
          />
          {sortButton}
          <button
            type="button"
            className="qv-send"
            aria-label="질문 남기기"
            title="질문 남기기"
            disabled={!store.canWrite || sending || len < 1 || len > QUESTION_MAX}
            onClick={() => void submit()}
          >
            {sending ? '…' : '➤'}
          </button>
        </div>
      )}

      <div className={`qv-head${isHost || searching ? '' : ' qv-head-empty'}`} aria-live="polite">
        {isHost ? (
          <>
            <span className="qv-seg" role="group" aria-label="질문 필터">
              <button type="button" aria-pressed={store.filter === 'pending'} onClick={() => store.setFilter('pending')}>
                미답변 {snap.pending_question_count}
              </button>
              <button type="button" aria-pressed={store.filter === 'answered'} onClick={() => store.setFilter('answered')}>
                답변 완료
              </button>
            </span>
            {sortButton}
          </>
        ) : searching ? (
          <>
            <span>{list.length > 0 ? `비슷한 질문 ${list.length} · 같으면 🙋` : '비슷한 질문 없음 · ➤로 남기기'}</span>
            <span style={{ color: len > QUESTION_MAX ? 'var(--red-500)' : undefined }}>{len}/{QUESTION_MAX}</span>
          </>
        ) : null}
      </div>

      {message && <p className="qv-error">{message}</p>}
      {!searching && outOfOrder && (
        <button type="button" className="qv-update" onClick={() => setOrder({ key, ids: serverIds })}>
          순서가 바뀌었어요 · 눌러서 목록 업데이트
        </button>
      )}

      <ScrollArea className="qv-scroll">
        {list.length === 0 ? (
          <p className="qv-empty">
            {searching
              ? '같은 질문이 없어요.'
              : store.filter === 'answered'
                ? '답변 완료된 질문이 없어요.'
                : isHost
                  ? '아직 질문이 없어요.'
                  : '아직 질문이 없어요. 궁금한 점을 남겨보세요.'}
          </p>
        ) : (
          <ul className="qv-list">
            {list.map((q) => {
              const open = openId === q.id
              const busy = busyIds.has(q.id)
              return (
                <li key={q.id} className="qv-item">
                  <button
                    type="button"
                    className={`qv-line${open ? ' qv-line-open' : ''}`}
                    aria-expanded={open}
                    title={`${new Date(q.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })} · ${q.body}`}
                    onClick={() => setOpenId(open ? null : q.id)}
                  >
                    {q.is_mine && <span className="qv-mine-tag">내 질문 · </span>}
                    {q.body}
                  </button>

                  {isHost ? (
                    <>
                      <span className="qv-mini" aria-label={`저도 궁금해요 ${q.reaction_count}`}>🙋{q.reaction_count}</span>
                      {open && (
                        <button
                          type="button"
                          className="qv-mini qv-mini-danger"
                          aria-label="질문 숨기기"
                          title="숨기기 (되돌릴 수 없음)"
                          disabled={!store.canWrite || busy}
                          onClick={(e) => hide(q, e)}
                        >
                          숨김
                        </button>
                      )}
                      <button
                        type="button"
                        className="qv-mini"
                        aria-label={q.status === 'pending' ? '답변 완료로 표시' : '미답변으로 되돌리기'}
                        title={q.status === 'pending' ? '답변 완료' : '미답변으로 되돌리기'}
                        disabled={!store.canWrite || busy}
                        onClick={() => void setStatus(q, q.status === 'pending' ? 'answered' : 'pending')}
                      >
                        {q.status === 'pending' ? '✓' : '↩'}
                      </button>
                    </>
                  ) : q.is_mine ? (
                    <span className="qv-mini" aria-label={`내 질문, 저도 궁금해요 ${q.reaction_count}`}>🙋{q.reaction_count}</span>
                  ) : (
                    <button
                      type="button"
                      className="qv-react"
                      aria-pressed={q.reacted_by_me}
                      aria-label={`저도 궁금해요 ${q.reaction_count}`}
                      title="저도 궁금해요"
                      disabled={!store.canWrite || busy || q.status !== 'pending'}
                      onClick={() => void react(q)}
                    >
                      🙋{q.reaction_count}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </ScrollArea>
    </>
  )
}
