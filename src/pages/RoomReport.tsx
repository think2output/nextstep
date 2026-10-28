// 강사 원래 탭 수업 리포트 (PRD v1.11 8.5, D-044). 이 방의 집계만 쓴다 — 개별 학생 선택·신원 없음 (Q-02).
// 숫자 카드 + 확인마다 긍정 % 막대(시간 순) + 누른 확인 하나의 자세한 결과. 전체 목록은 접어 둔다(표 보기 대체).
// 다운로드·여러 수업 이력은 범위 밖 (PRD 3.3).
import { useEffect, useState } from 'react'
import { call } from '../lib/rpc'
import { RoundStats } from '../room/AnswerViews'
import { ROUND_TEXT, type HostRound, type RoundType } from '../shared/domain'

const HISTORY_LIMIT = 50 // get_round_history 최대값

const hhmm = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' }) : ''

const pct = (n: number, total: number) => (total > 0 ? Math.round((n * 100) / total) : 0)
const majorityNo = (r: HostRound) => r.no_count >= Math.floor(r.target_count / 2) + 1

export default function RoomReport({
  roomId,
  lastClosedId,
  pendingQuestions,
}: {
  roomId: string
  lastClosedId: string | null
  pendingQuestions: number
}) {
  const [rounds, setRounds] = useState<HostRound[] | null>(null)
  const [pickedId, setPickedId] = useState<string | null>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  // 확인을 종료할 때마다 다시 불러온다
  useEffect(() => {
    let cancelled = false
    void call<{ rounds: HostRound[] }>('get_round_history', { p_room_id: roomId, p_limit: HISTORY_LIMIT }).then((res) => {
      if (!cancelled && res.ok) setRounds(res.data.rounds)
    })
    return () => {
      cancelled = true
    }
  }, [roomId, lastClosedId])

  if (!rounds) return null

  if (rounds.length === 0) {
    return (
      <section className="section">
        <h2 className="section-title">수업 리포트</h2>
        <p className="muted">확인을 보내고 종료하면 여기에 결과가 쌓여요.</p>
      </section>
    )
  }

  const timeline = [...rounds].reverse() // 서버는 최신순 → 막대는 시간 순
  const picked = rounds.find((r) => r.id === pickedId) ?? rounds[0]
  const hovered = timeline.find((r) => r.id === hoverId) ?? null

  const rated = rounds.filter((r) => r.target_count > 0)
  const avgRate = rated.length
    ? Math.round(rated.reduce((sum, r) => sum + ((r.yes_count + r.no_count) * 100) / r.target_count, 0) / rated.length)
    : 0
  const noMajority = rounds.filter(majorityNo).length

  const barLabel = (r: HostRound) => {
    const t = ROUND_TEXT[r.type]
    return `${hhmm(r.closed_at)} ${t.label} · ${t.yesShort} ${pct(r.yes_count, r.target_count)}% · 응답 ${r.yes_count + r.no_count}/${r.target_count}명`
  }

  return (
    <section className="section report" aria-labelledby="report-title">
      <h2 id="report-title" className="section-title">수업 리포트</h2>

      <div className="report-tiles">
        <div className="report-tile">
          <span className="report-tile-label">확인 횟수</span>
          <span className="report-tile-num">{rounds.length >= HISTORY_LIMIT ? `${HISTORY_LIMIT}+` : rounds.length}번</span>
        </div>
        <div className="report-tile">
          <span className="report-tile-label">평균 응답률</span>
          <span className="report-tile-num">{avgRate}%</span>
        </div>
        <div className="report-tile" title="‘다시 설명’·‘잠시만’·‘조금 더’가 과반이었던 확인 수">
          <span className="report-tile-label">대기가 과반</span>
          <span className={`report-tile-num${noMajority > 0 ? ' report-tile-warn' : ''}`}>{noMajority}번</span>
        </div>
        <div className="report-tile">
          <span className="report-tile-label">미답변 질문</span>
          <span className="report-tile-num">{pendingQuestions}개</span>
        </div>
      </div>

      <div className="report-chart-head">
        <h3 className="report-sub">확인 기록 <span className="muted">· 막대를 누르면 아래에 자세히</span></h3>
        <ul className="report-legend" aria-label="막대 색">
          {(['ready', 'understood', 'proceed'] as RoundType[]).map((type) => (
            <li key={type}>
              <i className={`report-swatch report-${type}`} aria-hidden="true" />
              {ROUND_TEXT[type].label}
            </li>
          ))}
        </ul>
      </div>

      {/* 막대 높이 = 그 확인의 긍정 응답 % (대상 인원 대비, RESP-02). 50% 점선 */}
      <div className="report-chart">
        <span className="report-axis report-axis-100" aria-hidden="true">100%</span>
        <span className="report-axis report-axis-50" aria-hidden="true">50%</span>
        <i className="report-half" aria-hidden="true" />
        <div className="report-bars" role="group" aria-label="확인별 긍정 응답 비율, 시간 순">
          {timeline.map((r) => (
            <button
              key={r.id}
              type="button"
              className={`report-bar-hit${r.id === picked.id ? ' report-bar-picked' : ''}`}
              aria-label={barLabel(r)}
              aria-pressed={r.id === picked.id}
              onClick={() => setPickedId(r.id)}
              onMouseEnter={() => setHoverId(r.id)}
              onMouseLeave={() => setHoverId(null)}
              onFocus={() => setHoverId(r.id)}
              onBlur={() => setHoverId(null)}
            >
              <span
                className={`report-bar report-${r.type}`}
                style={{ height: `${Math.max(pct(r.yes_count, r.target_count), 1)}%` }}
              />
            </button>
          ))}
        </div>
      </div>
      <div className="report-xaxis" aria-hidden="true">
        <span>{hhmm(timeline[0].closed_at)}</span>
        {timeline.length > 1 && <span>{hhmm(timeline[timeline.length - 1].closed_at)}</span>}
      </div>
      <p className="report-readout" aria-live="polite">{barLabel(hovered ?? picked)}</p>

      <div className="history-item report-picked">
        <div className="history-head">
          <span>{ROUND_TEXT[picked.type].label}</span>
          <time dateTime={picked.closed_at ?? undefined}>{hhmm(picked.closed_at)}</time>
        </div>
        <RoundStats round={picked} />
      </div>

      <button type="button" className="text-link report-toggle" aria-expanded={showAll} onClick={() => setShowAll(!showAll)}>
        전체 기록 목록 {showAll ? '접기 ▾' : `펼치기 (${rounds.length}) ▸`}
      </button>
      {showAll && (
        <ol className="history">
          {rounds.map((r) => (
            <li key={r.id} className="history-item">
              <div className="history-head">
                <span>{ROUND_TEXT[r.type].label}</span>
                <time dateTime={r.closed_at ?? undefined}>{hhmm(r.closed_at)}</time>
              </div>
              <RoundStats round={r} />
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
