// 질문 탭 크기 체감용 목업 (PRD 8.6). 서버 전송 없음, 새로고침하면 사라진다.
// 작은 창(240×160)에서 목록을 먼저 보여주고, 쓰기 화면에서는 비슷한 질문을 제안해 중복을 줄인다.
// 비슷한 질문 제안은 사용자가 고르는 것이며 자동 병합이 아니다 (PRD 3.3 제외 범위: 자동 질문 병합).
import { useMemo, useState } from 'react'

const MAX_LEN = 200
const SIMILAR_MIN_CHARS = 4
const SIMILAR_THRESHOLD = 0.2
const SIMILAR_MAX = 3

type MockQuestion = { id: number; body: string; time: string; count: number; mine: boolean; reacted: boolean }

const SAMPLES: MockQuestion[] = [
  { id: 8, body: 'useEffect 의존성 배열에 함수를 넣으면 왜 계속 실행되나요?', time: '14:58', count: 4, mine: false, reacted: false },
  { id: 7, body: 'npm install 하면 빨간 글씨 경고가 엄청 뜨는데 무시해도 되나요?', time: '14:55', count: 3, mine: false, reacted: false },
  { id: 6, body: 'git push 할 때 rejected 뜨는데 pull 먼저 해야 하나요?', time: '14:50', count: 2, mine: false, reacted: true },
  { id: 5, body: '.env 파일은 깃허브에 올리면 안 되는 거죠?', time: '14:47', count: 5, mine: false, reacted: false },
  { id: 4, body: 'props랑 state 차이를 한 번만 더 설명해주실 수 있나요?', time: '14:44', count: 1, mine: false, reacted: false },
  { id: 3, body: 'VS Code에서 자동 저장 켜는 방법이 뭔가요?', time: '14:38', count: 0, mine: false, reacted: false },
  { id: 2, body: '방금 설명하신 부분 코드 다시 보여주실 수 있나요?', time: '14:31', count: 0, mine: false, reacted: false },
  { id: 1, body: 'useEffect 안에서 async 함수 쓰면 왜 에러 나요?', time: '14:20', count: 2, mine: false, reacted: false },
]

function hhmm() {
  return new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
}

// 공백·문장부호를 뺀 두 글자 묶음으로 겹치는 정도를 본다 (한국어 조사 차이에 덜 민감)
function bigrams(text: string) {
  const chars = Array.from(text.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, ''))
  const set = new Set<string>()
  for (let i = 0; i < chars.length - 1; i++) set.add(chars[i] + chars[i + 1])
  return set
}

function similarity(a: Set<string>, b: Set<string>) {
  if (a.size === 0 || b.size === 0) return 0
  let common = 0
  for (const g of a) if (b.has(g)) common++
  return common / Math.min(a.size, b.size)
}

export default function QuestionMock() {
  const [mode, setMode] = useState<'list' | 'write'>('list')
  const [draft, setDraft] = useState('')
  const [list, setList] = useState(SAMPLES)
  const [openId, setOpenId] = useState<number | null>(null)
  const len = Array.from(draft.trim()).length

  const similar = useMemo(() => {
    if (len < SIMILAR_MIN_CHARS) return []
    const d = bigrams(draft)
    return list
      .filter((q) => !q.mine)
      .map((q) => ({ q, score: similarity(d, bigrams(q.body)) }))
      .filter((x) => x.score >= SIMILAR_THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, SIMILAR_MAX)
      .map((x) => x.q)
  }, [draft, len, list])

  const submit = () => {
    if (len < 1 || len > MAX_LEN) return
    setList((prev) => [
      { id: Date.now(), body: draft.trim(), time: hhmm(), count: 0, mine: true, reacted: false },
      ...prev,
    ])
    setDraft('')
    setMode('list')
  }

  const toggle = (id: number) =>
    setList((prev) =>
      prev.map((q) => (q.id === id ? { ...q, reacted: !q.reacted, count: q.count + (q.reacted ? -1 : 1) } : q)),
    )

  const reactButton = (q: MockQuestion) =>
    q.mine ? (
      <span className="hint qm-react">내 질문 🙋{q.count}</span>
    ) : (
      <button
        type="button"
        className="qm-react"
        aria-pressed={q.reacted}
        aria-label={`저도 궁금해요 ${q.count}`}
        onClick={() => toggle(q.id)}
      >
        🙋{q.count}
      </button>
    )

  if (mode === 'write') {
    return (
      <div className="qm">
        <div className="qm-row">
          <button type="button" onClick={() => setMode('list')}>← 목록</button>
          <span className={len > MAX_LEN ? 'error' : 'hint'}>{len}/{MAX_LEN}</span>
          <button type="button" disabled={len < 1 || len > MAX_LEN} onClick={submit}>남기기</button>
        </div>
        <textarea
          className="qm-input"
          value={draft}
          maxLength={MAX_LEN * 2}
          placeholder="궁금한 점을 익명으로 남겨주세요 (이름·API 키 X)"
          onChange={(e) => setDraft(e.target.value)}
        />
        {similar.length > 0 && (
          <div className="qm-similar" aria-live="polite">
            <p className="qm-similar-title">비슷한 질문이 있어요. 같으면 🙋를 눌러주세요</p>
            <ul className="qm-list">
              {similar.map((q) => (
                <li key={q.id} className="qm-item">
                  <span className="qm-line qm-open">{q.body}</span>
                  {reactButton(q)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="qm">
      <button type="button" className="qm-write" onClick={() => setMode('write')}>✏ 질문 쓰기</button>
      <ul className="qm-list">
        {list.map((q) => (
          <li key={q.id} className="qm-item">
            <button
              type="button"
              className={`qm-line${openId === q.id ? ' qm-open' : ''}`}
              aria-expanded={openId === q.id}
              onClick={() => setOpenId(openId === q.id ? null : q.id)}
            >
              {q.body}
            </button>
            {reactButton(q)}
          </li>
        ))}
      </ul>
    </div>
  )
}
