// 옆 창의 질문 원문 보기 (PRD v1.9 8.6, D-042). 본문은 텍스트로만 렌더링한다.
import type { QuestionCard } from '../shared/domain'
import { useQuestionActions } from './useQuestionActions'
import type { RoomStore } from './useRoom'

type Props = {
  store: RoomStore
  card: QuestionCard
  // 지금 목록(snapshot)에 없는 질문: 숨김·필터 변경 등. 마지막으로 본 내용만 보여주고 조작은 막는다
  stale: boolean
  onClose: () => void
}

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' })

export default function QuestionDetail({ store, card: q, stale, onClose }: Props) {
  const isHost = store.snap?.my_role === 'host'
  const { busyIds, message, react, setStatus, hide } = useQuestionActions(store)
  const busy = busyIds.has(q.id)
  const canAct = store.canWrite && !busy && !stale

  return (
    <div
      className="qd"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
    >
      <div className="qd-head">
        {q.is_mine && <span className="qv-me" title="내 질문" aria-label="내 질문">me</span>}
        <span className="qd-meta">
          {time(q.created_at)} · {q.status === 'pending' ? '미답변' : '답변 완료'}
        </span>
        <span className="pv-spacer" />
        <button type="button" className="pv-icon" aria-label="질문 보기 닫기" title="닫기 (Esc)" onClick={onClose}>
          ✕
        </button>
      </div>

      <p className="qd-body">{q.body}</p>

      {stale && <p className="qd-note">목록에서 사라진 질문이에요 (숨김 또는 다른 목록).</p>}
      {message && <p className="qv-error">{message}</p>}

      <div className="qd-actions">
        {isHost ? (
          <>
            <span className="qv-mini" aria-label={`저도 궁금해요 ${q.reaction_count}`} title="저도 궁금해요">+{q.reaction_count}</span>
            <span className="pv-spacer" />
            <button type="button" className="qd-btn qd-btn-danger" disabled={!canAct} onClick={(e) => hide(q, e)}>
              숨기기
            </button>
            <button
              type="button"
              className="qd-btn qd-btn-primary"
              disabled={!canAct}
              onClick={() => void setStatus(q, q.status === 'pending' ? 'answered' : 'pending')}
            >
              {q.status === 'pending' ? '답변 완료' : '미답변으로'}
            </button>
          </>
        ) : q.is_mine ? (
          <span className="qv-mini" aria-label={`내 질문, 저도 궁금해요 ${q.reaction_count}`} title="저도 궁금해요">+{q.reaction_count}</span>
        ) : (
          <button
            type="button"
            className="qv-react qd-react"
            aria-pressed={q.reacted_by_me}
            aria-label={`저도 궁금해요 ${q.reaction_count}`}
            title="저도 궁금해요"
            disabled={!canAct || q.status !== 'pending'}
            onClick={() => void react(q)}
          >
            저도 궁금해요 +{q.reaction_count}
          </button>
        )}
      </div>
    </div>
  )
}
