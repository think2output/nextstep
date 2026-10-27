// GATE-01 PiP 기술 검증용 최소 화면 (PRD 4.3). 실제 제품 화면이 아니다.
// ?role=host / ?role=student 로 역할을 고른다 (시험 전용, useGateChannel.ts 주석 참고).
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  PIP_SIZE_COMPACT,
  PIP_SIZE_DEFAULT,
  PIP_SIZE_QUESTION,
  resizePip,
  type PipSize,
  usePip,
} from '../pip/usePip'
import './gate.css'
import QuestionMock, { type QuestionSort } from './QuestionMock'
import { type Role, useGateChannel } from './useGateChannel'

type Tab = 'answer' | 'question'

const AUTO_REQUEST_MS = 10_000
const TICK_MS = 1_000

function now() {
  return new Date().toLocaleTimeString('ko-KR', { hour12: false })
}

function readRole(): Role | null {
  const role = new URLSearchParams(window.location.search).get('role')
  return role === 'host' || role === 'student' ? role : null
}

export default function GatePage() {
  const role = readRole()
  if (!role) return <RoleChooser />
  return <GateRoom role={role} />
}

function RoleChooser() {
  const base = `${window.location.origin}${window.location.pathname}`
  return (
    <main className="gate">
      <h1>GATE-01 두 창 시험</h1>
      <p className="hint">시험용 화면이에요. 강사 창과 학생 창을 따로 여세요.</p>
      <section className="panel">
        <p><strong>강사 창</strong> — 지금 창에서 열기</p>
        <a href={`${base}?role=host`}>{base}?role=host</a>
      </section>
      <section className="panel">
        <p><strong>학생 창</strong> — 주소를 복사해서 시크릿 창(Ctrl+Shift+N)이나 다른 컴퓨터에서 열기</p>
        <a href={`${base}?role=student`}>{base}?role=student</a>
      </section>
    </main>
  )
}

function GateRoom({ role }: { role: Role }) {
  const isHost = role === 'host'
  const [log, setLog] = useState<string[]>([])
  const addLog = useCallback((msg: string) => {
    setLog((prev) => [`${now()}  ${msg}`, ...prev].slice(0, 300))
  }, [])

  const { status, pipWindow, error, open } = usePip(
    useCallback(() => addLog('작은 창 닫힘 감지'), [addLog]),
  )
  const live = useGateChannel(role, addLog)

  const [autoOn, setAutoOn] = useState(false)
  const [pipSize, setPipSize] = useState('')
  const [tab, setTab] = useState<Tab>('answer')
  const [compact, setCompact] = useState(false)
  // 질문 탭에서 창을 키울지: 키우면 화면 가장자리에서 창 위치가 밀릴 수 있다 (gate-01.md 2차 발견)
  const [growOnQuestion, setGrowOnQuestion] = useState(false)
  const [questionSort, setQuestionSort] = useState<QuestionSort>('popular')
  const [maxGapMs, setMaxGapMs] = useState(0)

  // 원래 탭 보임/포커스 기록
  useEffect(() => {
    const onVis = () => addLog(`원래 탭: ${document.visibilityState === 'visible' ? '보임' : '숨김'}`)
    const onFocus = () => addLog('원래 탭: 포커스 받음')
    const onBlur = () => addLog('원래 탭: 포커스 잃음')
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', onFocus)
    window.addEventListener('blur', onBlur)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('blur', onBlur)
    }
  }, [addLog])

  // 작은 창 포커스·크기 기록 (G2: 새 요청이 와도 포커스를 가져가면 안 됨)
  useEffect(() => {
    if (!pipWindow) return
    addLog(`작은 창 열림 ${pipWindow.innerWidth}×${pipWindow.innerHeight}`)
    const onFocus = () => addLog('작은 창: 포커스 받음')
    const onBlur = () => addLog('작은 창: 포커스 잃음')
    const onResize = () => setPipSize(`${pipWindow.innerWidth}×${pipWindow.innerHeight}`)
    onResize()
    pipWindow.addEventListener('focus', onFocus)
    pipWindow.addEventListener('blur', onBlur)
    pipWindow.addEventListener('resize', onResize)
    return () => {
      pipWindow.removeEventListener('focus', onFocus)
      pipWindow.removeEventListener('blur', onBlur)
      pipWindow.removeEventListener('resize', onResize)
    }
  }, [pipWindow, addLog])

  // 백그라운드 타이머 지연 측정 (G6 참고값)
  const lastTick = useRef(0)
  useEffect(() => {
    lastTick.current = performance.now()
    const id = setInterval(() => {
      const t = performance.now()
      const gap = t - lastTick.current
      lastTick.current = t
      if (gap > TICK_MS * 3) addLog(`타이머 지연 감지: ${(gap / 1000).toFixed(1)}초`)
      setMaxGapMs((m) => Math.max(m, gap))
    }, TICK_MS)
    return () => clearInterval(id)
  }, [addLog])

  // 강사: 10초마다 자동 요청 (학생이 VS Code에서 타이핑하며 포커스 유지 확인용)
  const { sendRequest } = live
  useEffect(() => {
    if (!isHost || !autoOn) return
    const id = setInterval(() => void sendRequest(), AUTO_REQUEST_MS)
    return () => clearInterval(id)
  }, [isHost, autoOn, sendRequest])

  const copyLog = async () => {
    const text = [
      `역할: ${isHost ? '강사' : '학생'}`,
      `UA: ${navigator.userAgent}`,
      `화면: ${screen.width}×${screen.height}, 배율 ${window.devicePixelRatio}`,
      `최대 타이머 간격: ${(maxGapMs / 1000).toFixed(1)}초`,
      '',
      ...[...log].reverse(),
    ].join('\n')
    await navigator.clipboard.writeText(text)
    addLog('기록 복사함')
  }

  const resizeTo = (size: PipSize) => {
    if (!pipWindow) return
    const ok = resizePip(pipWindow, size)
    addLog(ok ? `크기 변경 요청 ${size.width}×${size.height}` : '크기 변경 실패')
  }

  // 질문 탭 확장은 옵션을 켰을 때만. 끄면 탭을 바꿔도 창 크기·위치가 그대로다.
  const changeTab = (next: Tab) => {
    if (next === tab) return
    setTab(next)
    if (growOnQuestion) {
      resizeTo(next === 'question' ? PIP_SIZE_QUESTION : compact ? PIP_SIZE_COMPACT : PIP_SIZE_DEFAULT)
    }
  }

  const toggleCompact = () => {
    const next = !compact
    setCompact(next)
    resizeTo(next ? PIP_SIZE_COMPACT : PIP_SIZE_DEFAULT)
  }

  const connLabel = live.conn === 'live' ? '● 연결됨' : live.conn === 'connecting' ? '… 연결 중' : '⚠ 재연결 중'
  const canWrite = live.conn === 'live'

  const hostBody = (
    <>
      <p className="pip-q">{live.request ? `#${live.request.id} 실습할 준비가 됐나요?` : '보낸 요청 없음'}</p>
      <button type="button" className="pip-wide" disabled={!canWrite} onClick={() => void sendRequest()}>
        {live.request ? '새 요청 보내기' : '준비 확인 보내기'}
      </button>
      <p className="pip-count">
        준비 {live.yes} · 잠시만 {live.no} · 미응답 {live.unanswered} / 학생 {live.students}
      </p>
    </>
  )

  const studentStatus =
    live.sendState === 'sending'
      ? '전송 중…'
      : live.sendState === 'unknown'
        ? '전송을 확인하지 못했어요'
        : live.myChoice
          ? `✓ ${live.myChoice === 'yes' ? '준비됐어요' : '잠시만요'}로 전달했어요`
          : '미응답'

  const studentBody = live.request ? (
    <>
      <p className="pip-q">#{live.request.id} 실습할 준비가 됐나요?</p>
      <div className="pip-buttons">
        {(['yes', 'no'] as const).map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={live.myChoice === c}
            disabled={!canWrite || live.sendState === 'sending'}
            onClick={() => void live.answer(c)}
          >
            {c === 'yes' ? '준비됐어요' : '잠시만요'}
          </button>
        ))}
      </div>
      <p className="pip-count" aria-live="polite">{studentStatus}</p>
    </>
  ) : (
    <p className="pip-q pip-wrap">현재 응답 요청이 없어요. 실습을 계속해주세요.</p>
  )

  const pipContent = (
    <div className={`pip${compact ? ' pip-compact' : ''}`}>
      <div className="pip-tabs">
        <button type="button" aria-pressed={tab === 'answer'} onClick={() => changeTab('answer')}>응답</button>
        <button type="button" aria-pressed={tab === 'question'} onClick={() => changeTab('question')}>질문</button>
        {tab === 'question' && (
          <button
            type="button"
            className="pip-icon"
            aria-label={`정렬: ${questionSort === 'popular' ? '저도 궁금해요 많은 순' : '최신순'}. 눌러서 바꾸기`}
            title={questionSort === 'popular' ? '🙋 많은 순 (눌러서 최신순)' : '최신순 (눌러서 🙋 많은 순)'}
            onClick={() => setQuestionSort(questionSort === 'popular' ? 'latest' : 'popular')}
          >
            {questionSort === 'popular' ? '🙋⇅' : '🕒⇅'}
          </button>
        )}
        <span className="pip-conn" title={connLabel} aria-label={connLabel}>
          {live.conn === 'live' ? '●' : '⚠'}
        </span>
        {(tab === 'answer' || !growOnQuestion) && (
          <button
            type="button"
            className="pip-size"
            aria-label={compact ? '기본 크기로' : '더 작게'}
            title={compact ? '기본 크기로' : '더 작게'}
            onClick={toggleCompact}
          >
            {compact ? '⤢' : '⤡'}
          </button>
        )}
      </div>
      <div className={`pip-body${tab === 'question' ? ' pip-body-question' : ''}`}>
        {tab === 'answer' ? (isHost ? hostBody : studentBody) : <QuestionMock sort={questionSort} />}
      </div>
    </div>
  )

  return (
    <main className="gate">
      <h1>GATE-01 {isHost ? '강사' : '학생'} 창</h1>
      <p>
        연결: <strong>{connLabel}</strong>
        {isHost && <> · 연결된 학생 <strong>{live.students}</strong>명</>}
      </p>

      <section className="panel">
        <p>
          작은 창: <strong>{status === 'unsupported' ? '지원 안 됨 (Chrome 116 이상 필요)' : status}</strong>
          {status === 'open' && <> · 실제 크기 <strong>{pipSize}</strong></>}
        </p>
        {error && <p className="error">열기 실패: {error}</p>}
        <button
          type="button"
          disabled={status !== 'closed' && status !== 'failed'}
          onClick={() => {
            setTab('answer')
            setCompact(false)
            void open(PIP_SIZE_DEFAULT)
          }}
        >
          작은 창 띄우기
        </button>
        {status === 'open' && <p className="hint">작은 창을 사용하는 동안 이 탭은 닫지 마세요.</p>}
        <label className="row">
          <input type="checkbox" checked={growOnQuestion} onChange={(e) => setGrowOnQuestion(e.target.checked)} />
          질문 탭 누르면 창 키우기 (380×480, 위치가 밀릴 수 있음)
        </label>
      </section>

      {isHost && (
        <section className="panel">
          <label className="row">
            <input type="checkbox" checked={autoOn} onChange={(e) => setAutoOn(e.target.checked)} />
            10초마다 자동으로 새 요청 보내기
          </label>
        </section>
      )}

      {/* 작은 창이 열려 있으면 원래 탭에는 버튼을 숨긴다 (PIP-02: 쓰기 UI 중복 금지) */}
      {status !== 'open' && (
        <section className="panel">
          <p className="hint">작은 창이 없을 때 보이는 일반 화면이에요. ‘항상 위’ 기능이 아니에요.</p>
          {pipContent}
        </section>
      )}

      <section className="panel">
        <div className="row">
          <h2>기록</h2>
          <button type="button" onClick={copyLog}>기록 복사</button>
          <button type="button" onClick={() => setLog([])}>지우기</button>
        </div>
        <p className="hint">최대 타이머 간격: {(maxGapMs / 1000).toFixed(1)}초</p>
        <pre className="log">{log.join('\n') || '아직 기록 없음'}</pre>
      </section>

      {pipWindow && createPortal(pipContent, pipWindow.document.body)}
    </main>
  )
}
