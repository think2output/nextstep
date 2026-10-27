// 질문 탭 크기 체감용 목업 (PRD 8.6). 서버 전송 없음, 새로고침하면 사라진다.
// 입력칸 하나로 찾기와 쓰기를 겸한다: 쓰는 동안 목록이 비슷한 질문만 남아 중복 질문을 줄인다.
// 비슷한 질문 표시는 사용자가 고르는 것이며 자동 병합이 아니다 (PRD 3.3 제외 범위: 자동 질문 병합).
import { useMemo, useState } from 'react'

const MAX_LEN = 200
const SEARCH_MIN_CHARS = 2
const MATCH_THRESHOLD = 0.5

type MockQuestion = { id: number; body: string; createdAt: number; count: number; mine: boolean; reacted: boolean }
export type QuestionSort = 'popular' | 'latest'

const BASE = Date.now()
const SAMPLES: MockQuestion[] = [
  ['useEffect 의존성 배열에 함수를 넣으면 왜 계속 실행되나요?', 4],
  ['npm install 하면 빨간 글씨 경고가 엄청 뜨는데 무시해도 되나요? 설치는 끝까지 된 것 같은데 실행할 때 문제가 생길 수도 있는지, 경고 중에 꼭 봐야 하는 게 있는지 궁금합니다.', 3],
  ['git push 할 때 rejected 뜨는데 pull 먼저 해야 하나요?', 2],
  ['.env 파일은 깃허브에 올리면 안 되는 거죠?', 5],
  ['props랑 state 차이를 한 번만 더 설명해주실 수 있나요?', 1],
  ['VS Code에서 자동 저장 켜는 방법이 뭔가요?', 0],
  ['방금 설명하신 부분 코드 다시 보여주실 수 있나요?', 0],
  ['useEffect 안에서 async 함수 쓰면 왜 에러 나요?', 2],
].map(([body, count], i) => ({
  id: i + 1,
  body: body as string,
  createdAt: BASE - i * 4 * 60_000,
  count: count as number,
  mine: false,
  reacted: i === 2,
}))

function hhmm(t: number) {
  return new Date(t).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function normalize(text: string) {
  return text.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '')
}

function bigrams(text: string) {
  const chars = Array.from(normalize(text))
  const set = new Set<string>()
  for (let i = 0; i < chars.length - 1; i++) set.add(chars[i] + chars[i + 1])
  return set
}

// 검색어가 질문에 얼마나 들어 있는지 (0~1). 영어 단어는 일부만 맞아도 찾는다 (use → useEffect).
function matchScore(query: string, body: string) {
  const words = query.toLowerCase().match(/[a-z0-9]{2,}/g) ?? []
  const lowerBody = body.toLowerCase()
  const wordHit = words.length > 0 && words.every((w) => lowerBody.includes(w))
  const q = bigrams(query)
  if (q.size === 0) return wordHit ? 1 : 0
  const b = bigrams(body)
  let common = 0
  for (const g of q) if (b.has(g)) common++
  return Math.max(common / q.size, wordHit ? 1 : 0)
}

// 정렬 버튼은 공간 절약을 위해 작은 창의 탭 줄에 있으므로 정렬 값은 부모가 가진다
export default function QuestionMock({ sort }: { sort: QuestionSort }) {
  const [draft, setDraft] = useState('')
  const [list, setList] = useState(SAMPLES)
  const [openId, setOpenId] = useState<number | null>(null)
  const len = Array.from(draft.trim()).length
  const searching = len >= SEARCH_MIN_CHARS

  const shown = useMemo(() => {
    if (searching) {
      return list
        .map((q) => ({ q, score: matchScore(draft.trim(), q.body) }))
        .filter((x) => x.score >= MATCH_THRESHOLD)
        .sort((a, b) => b.score - a.score || b.q.count - a.q.count)
        .map((x) => x.q)
    }
    return [...list].sort((a, b) =>
      sort === 'popular' ? b.count - a.count || a.createdAt - b.createdAt : b.createdAt - a.createdAt,
    )
  }, [draft, searching, list, sort])

  const submit = () => {
    if (len < 1 || len > MAX_LEN) return
    setList((prev) => [
      { id: Date.now(), body: draft.trim(), createdAt: Date.now(), count: 0, mine: true, reacted: false },
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
      <div className="qm-compose">
        <textarea
          className="qm-input"
          value={draft}
          maxLength={MAX_LEN * 2}
          rows={1}
          placeholder="익명 질문·찾기 (이름·키 X)"
          aria-label="익명 질문 입력. 쓰는 동안 비슷한 질문이 아래에 표시됩니다. 이름이나 API 키는 적지 마세요"
          onChange={(e) => setDraft(e.target.value)}
        />
        <button
          type="button"
          className="qm-send"
          aria-label="질문 남기기"
          title="질문 남기기"
          disabled={len < 1 || len > MAX_LEN}
          onClick={submit}
        >
          ➤
        </button>
      </div>

      {/* 쓰는 중에만 한 줄 상태 표시 */}
      {searching && (
        <div className="qm-head" aria-live="polite">
          <span>{shown.length > 0 ? `비슷한 질문 ${shown.length} · 같으면 🙋` : '비슷한 질문 없음 · ➤로 남기기'}</span>
          <span className={len > MAX_LEN ? 'error' : 'hint'}>{len}/{MAX_LEN}</span>
        </div>
      )}

      <ul className="qm-list">
        {shown.map((q) => {
          const open = openId === q.id
          return (
            <li key={q.id} className="qm-item">
              <button
                type="button"
                className={`qm-line${open ? ' qm-open' : ''}`}
                aria-expanded={open}
                title={q.body}
                onClick={() => setOpenId(open ? null : q.id)}
              >
                {q.body}
              </button>
              {q.mine ? (
                <span className="qm-react qm-mine" title="내 질문">나 🙋{q.count}</span>
              ) : (
                <button
                  type="button"
                  className="qm-react"
                  aria-pressed={q.reacted}
                  aria-label={`저도 궁금해요 ${q.count}`}
                  title={`${hhmm(q.createdAt)} · 저도 궁금해요`}
                  onClick={() => toggle(q.id)}
                >
                  🙋{q.count}
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
