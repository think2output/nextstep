// 작은 창 질문 탭 (PRD 8.6 v1.2, 8.7, Q-01~Q-04)
// 학생: 입력칸 하나로 찾기+쓰기, +N 공감. 강사: 미답변/완료 전환, 답변 완료·되돌리기. 숨기기는 옆 질문 보기 창에서.
// 질문 줄을 누르면 옆 창에 원문 (D-042).
import { type MouseEvent, useEffect, useMemo, useState } from 'react'
import ScrollArea from '../pip/ScrollArea'
import { QUESTION_MAX, errorText, textLength, type QuestionCard } from '../shared/domain'
import { MATCH_THRESHOLD, SEARCH_MIN_CHARS, matchScore } from '../shared/similar'
import { useQuestionActions } from './useQuestionActions'
import type { RoomStore } from './useRoom'

type Props = {
  store: RoomStore
  draft: string
  setDraft: (value: string) => void
  onOpenQuestion: (q: QuestionCard, e: MouseEvent<HTMLButtonElement>) => void
}

const SORT_TOAST_MS = 1600

// 이모지는 OS마다 모양이 달라 정렬·보내기는 직접 그린 선 아이콘을 쓴다 (D-041)
const SortIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 13V3M2.5 5.5 5 3l2.5 2.5M11 3v10M8.5 10.5 11 13l2.5-2.5" />
  </svg>
)

const MailIcon = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
    <rect x="2" y="3.5" width="12" height="9" rx="1.5" />
    <path d="m2.5 4.5 5.5 4 5.5-4" strokeLinecap="round" />
  </svg>
)

export default function QuestionView({ store, draft, setDraft, onOpenQuestion }: Props) {
  const snap = store.snap!
  const isHost = snap.my_role === 'host'
  const cards = snap.questions_page
  const [sending, setSending] = useState(false)
  const { busyIds, message, setMessage, react, setStatus } = useQuestionActions(store)

  // 정렬을 바꾸면 무엇으로 바뀌었는지 잠깐 보여준다 (사용자 피드백)
  const [sortToast, setSortToast] = useState(0)
  useEffect(() => {
    if (!sortToast) return
    const t = setTimeout(() => setSortToast(0), SORT_TOAST_MS)
    return () => clearTimeout(t)
  }, [sortToast])
  const toggleSort = () => {
    store.setSort(store.sort === 'popular' ? 'latest' : 'popular')
    setSortToast(Date.now())
  }

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

  // 정렬은 탭 줄이 아니라 질문 탭 첫 줄에 둔다. 탭 줄이 응답·질문에서 같아야 꺾이지 않는다 (사용자 피드백, D-041)
  const sortLabel = store.sort === 'popular' ? '공감 많은 순' : '최신순'
  const sortButton = (
    <button
      type="button"
      className="pv-icon qv-sort"
      aria-label={`정렬: ${sortLabel}. 눌러서 바꾸기`}
      title={`${sortLabel} (눌러서 ${store.sort === 'popular' ? '최신순' : '공감 많은 순'})`}
      onClick={toggleSort}
    >
      <SortIcon />
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
            placeholder="익명으로 질문해요"
            aria-label="익명 질문 입력. 쓰는 동안 비슷한 질문이 아래에 표시돼요. 이름·연락처·API 키는 적지 마세요"
            disabled={!store.canWrite}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button
            type="button"
            className="qv-send"
            aria-label="질문 남기기"
            title="질문 남기기"
            disabled={!store.canWrite || sending || len < 1 || len > QUESTION_MAX}
            onClick={() => void submit()}
          >
            {sending ? '…' : <MailIcon />}
          </button>
          {sortButton}
        </div>
      )}

      <div className={`qv-head${isHost || len > 0 ? '' : ' qv-head-empty'}`} aria-live="polite">
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
        ) : len > 0 ? (
          <>
            {/* 쓰기 시작하면 개인정보 안내, 비슷한 질문이 있으면 그 개수 */}
            <span className="qv-head-text">
              {searching && list.length > 0 ? `비슷한 질문 ${list.length} · 같으면 +1` : '이름·연락처·키는 적지 마세요'}
            </span>
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
              ? '같은 질문이 없어요. ✉로 남겨주세요.'
              : store.filter === 'answered'
                ? '답변 완료된 질문이 없어요.'
                : isHost
                  ? '아직 질문이 없어요.'
                  : '아직 질문이 없어요. 궁금한 점을 남겨보세요.'}
          </p>
        ) : (
          <ul className="qv-list">
            {list.map((q) => {
              const busy = busyIds.has(q.id)
              return (
                <li key={q.id} className="qv-item">
                  <button
                    type="button"
                    className="qv-line"
                    aria-haspopup="dialog"
                    title={`${new Date(q.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })} · 눌러서 옆 창에서 전체 보기`}
                    onClick={(e) => onOpenQuestion(q, e)}
                  >
                    {q.is_mine && <span className="qv-me" title="내 질문" aria-label="내 질문">me</span>}
                    {q.body}
                  </button>

                  {isHost ? (
                    <>
                      <span className="qv-mini" aria-label={`저도 궁금해요 ${q.reaction_count}`} title="저도 궁금해요">+{q.reaction_count}</span>
                      <button
                        type="button"
                        className={`qv-mini${q.status === 'pending' ? ' qv-done' : ''}`}
                        aria-label={q.status === 'pending' ? '답변 완료로 표시' : '미답변으로 되돌리기'}
                        title={q.status === 'pending' ? '답변 완료' : '미답변으로 되돌리기'}
                        disabled={!store.canWrite || busy}
                        onClick={() => void setStatus(q, q.status === 'pending' ? 'answered' : 'pending')}
                      >
                        {q.status === 'pending' ? '✓' : '↩'}
                      </button>
                    </>
                  ) : q.is_mine ? (
                    <span className="qv-mini" aria-label={`내 질문, 저도 궁금해요 ${q.reaction_count}`} title="저도 궁금해요">+{q.reaction_count}</span>
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
                      +{q.reaction_count}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </ScrollArea>
      {sortToast > 0 && (
        <span key={sortToast} className="pv-toast" aria-hidden="true">{sortLabel}</span>
      )}
    </>
  )
}
