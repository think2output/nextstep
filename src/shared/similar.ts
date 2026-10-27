// 비슷한 질문 찾기 (PRD 8.6 v1.2). 사용자가 고르는 보조 표시이며 자동 병합·차단이 아니다.

export const SEARCH_MIN_CHARS = 2
export const MATCH_THRESHOLD = 0.5

function normalize(text: string) {
  return text.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '')
}

function bigrams(text: string) {
  const chars = Array.from(normalize(text))
  const set = new Set<string>()
  for (let i = 0; i < chars.length - 1; i++) set.add(chars[i] + chars[i + 1])
  return set
}

// 검색어의 두 글자 묶음 중 질문에 들어 있는 비율 (0~1). 영어·숫자 단어는 부분 포함이면 1 (use → useEffect).
export function matchScore(query: string, body: string) {
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
