// 질문 탭 크기 체감용 목업 (PRD 8.6). 서버 전송 없음, 새로고침하면 사라진다.
import { useState } from 'react'

const MAX_LEN = 200

type MockQuestion = { id: number; body: string; time: string; count: number; mine: boolean; reacted: boolean }

const SAMPLES: MockQuestion[] = [
  { id: 3, body: 'useEffect 의존성 배열에 함수를 넣으면 왜 계속 실행되나요?', time: '14:52', count: 4, mine: false, reacted: false },
  { id: 2, body: 'git push 할 때 rejected 뜨는데 pull 먼저 해야 하나요?', time: '14:40', count: 2, mine: false, reacted: true },
  { id: 1, body: '방금 설명하신 부분 코드 다시 보여주실 수 있나요?', time: '14:31', count: 0, mine: false, reacted: false },
]

function hhmm() {
  return new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
}

export default function QuestionMock() {
  const [draft, setDraft] = useState('')
  const [list, setList] = useState(SAMPLES)
  const len = Array.from(draft.trim()).length

  const submit = () => {
    if (len < 1 || len > MAX_LEN) return
    setList((prev) => [
      { id: Date.now(), body: draft.trim(), time: hhmm(), count: 0, mine: true, reacted: false },
      ...prev,
    ])
    setDraft('')
  }

  const toggle = (id: number) =>
    setList((prev) =>
      prev.map((q) => (q.id === id ? { ...q, reacted: !q.reacted, count: q.count + (q.reacted ? -1 : 1) } : q)),
    )

  return (
    <div className="qm">
      <textarea
        className="qm-input"
        value={draft}
        maxLength={MAX_LEN * 2}
        placeholder="궁금한 점을 익명으로 남겨주세요"
        onChange={(e) => setDraft(e.target.value)}
      />
      <div className="qm-row">
        <span className={len > MAX_LEN ? 'error' : 'hint'}>{len}/{MAX_LEN}</span>
        <button type="button" disabled={len < 1 || len > MAX_LEN} onClick={submit}>질문 남기기</button>
      </div>
      <p className="qm-note">이름·연락처·API 키는 적지 마세요.</p>
      <ul className="qm-list">
        {list.map((q) => (
          <li key={q.id} className="qm-card">
            <p className="qm-body">{q.body}</p>
            <div className="qm-row">
              <span className="hint">{q.time}{q.mine && ' · 내 질문'}</span>
              {!q.mine && (
                <button type="button" aria-pressed={q.reacted} onClick={() => toggle(q.id)}>
                  🙋 {q.count}
                </button>
              )}
              {q.mine && <span className="hint">🙋 {q.count}</span>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
