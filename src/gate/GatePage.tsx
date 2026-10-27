// GATE-01 PiP 기술 검증용 최소 화면 (PRD 4.3). 실제 제품 화면이 아니다.
// 서버 통신 없음: G5·G6·G8의 기기 간 시험은 Supabase 연결 후 별도 진행.
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

type Tab = 'answer' | 'question'

const AUTO_REQUEST_MS = 10_000
const TICK_MS = 1_000

function now() {
  return new Date().toLocaleTimeString('ko-KR', { hour12: false })
}

export default function GatePage() {
  const [log, setLog] = useState<string[]>([])
  const addLog = useCallback((msg: string) => {
    setLog((prev) => [`${now()}  ${msg}`, ...prev].slice(0, 300))
  }, [])

  const { status, pipWindow, error, open } = usePip(
    useCallback(() => addLog('작은 창 닫힘 감지'), [addLog]),
  )

  const [yes, setYes] = useState(0)
  const [no, setNo] = useState(0)
  const [autoOn, setAutoOn] = useState(false)
  const [requestNo, setRequestNo] = useState(0)
  const requestCounter = useRef(0)
  const [pipSize, setPipSize] = useState('')
  const [tab, setTab] = useState<Tab>('answer')
  const [compact, setCompact] = useState(false)
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

  // 백그라운드 타이머 지연 측정 (G6 참고값: 1초 타이머가 실제로 몇 초 간격으로 도는지)
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

  // 가짜 요청 자동 도착: VS Code에서 타이핑하면서 포커스가 유지되는지 확인용
  useEffect(() => {
    if (!autoOn) return
    const id = setInterval(() => {
      requestCounter.current += 1
      setRequestNo(requestCounter.current)
      addLog(`가짜 요청 #${requestCounter.current} 도착`)
    }, AUTO_REQUEST_MS)
    return () => clearInterval(id)
  }, [autoOn, addLog])

  const answer = (choice: 'yes' | 'no') => {
    if (choice === 'yes') setYes((v) => v + 1)
    else setNo((v) => v + 1)
    addLog(`버튼 클릭: ${choice === 'yes' ? '준비됐어요' : '잠시만요'}`)
  }

  const copyLog = async () => {
    const text = [
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

  // 질문 탭은 사용자가 눌렀을 때만 크게 (PRD 8.2). 응답 탭으로 오면 이전 크기로.
  const changeTab = (next: Tab) => {
    if (next === tab) return
    setTab(next)
    resizeTo(next === 'question' ? PIP_SIZE_QUESTION : compact ? PIP_SIZE_COMPACT : PIP_SIZE_DEFAULT)
  }

  const toggleCompact = () => {
    const next = !compact
    setCompact(next)
    resizeTo(next ? PIP_SIZE_COMPACT : PIP_SIZE_DEFAULT)
  }

  const pipContent = (
    <div className={`pip${compact && tab === 'answer' ? ' pip-compact' : ''}`}>
      <div className="pip-tabs">
        <button type="button" aria-pressed={tab === 'answer'} onClick={() => changeTab('answer')}>응답</button>
        <button type="button" aria-pressed={tab === 'question'} onClick={() => changeTab('question')}>질문</button>
        {tab === 'answer' && (
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
      {tab === 'answer' ? (
        <>
          <p className="pip-q">{requestNo > 0 ? `#${requestNo} 실습할 준비가 됐나요?` : '실습할 준비가 됐나요?'}</p>
          <div className="pip-buttons">
            <button type="button" onClick={() => answer('yes')}>준비됐어요</button>
            <button type="button" onClick={() => answer('no')}>잠시만요</button>
          </div>
          <p className="pip-count">준비됐어요 {yes} · 잠시만요 {no}</p>
        </>
      ) : (
        <p className="pip-q">질문 탭 자리 (크기 시험용)</p>
      )}
    </div>
  )

  return (
    <main className="gate">
      <h1>GATE-01 작은 창 시험</h1>
      <p className="hint">작은 창을 띄우고 VS Code·젭 창으로 왔다 갔다 하면서 창이 계속 보이는지 확인하세요.</p>

      <section className="panel">
        <p>
          지원 여부: <strong>{status === 'unsupported' ? '지원 안 됨 (Chrome 116 이상 필요)' : '지원됨'}</strong>
          {' · '}상태: <strong>{status}</strong>
        </p>
        {error && <p className="error">열기 실패: {error}</p>}
        <button
          type="button"
          disabled={status !== 'closed' && status !== 'failed'}
          onClick={() => {
            setTab('answer')
            setCompact(false)
            open(PIP_SIZE_DEFAULT)
          }}
        >
          작은 창 띄우기
        </button>
        {status === 'open' && <p>작은 창 실제 크기: <strong>{pipSize}</strong></p>}
        {status === 'open' && <p className="hint">작은 창을 사용하는 동안 이 탭은 닫지 마세요.</p>}
      </section>

      <section className="panel">
        <label className="row">
          <input type="checkbox" checked={autoOn} onChange={(e) => setAutoOn(e.target.checked)} />
          10초마다 가짜 요청 보내기 (VS Code에서 타이핑하며 포커스가 안 뺏기는지 확인)
        </label>
        <p>최대 타이머 간격: {(maxGapMs / 1000).toFixed(1)}초 (탭을 뒤에 둘 때 늘어나는지 확인)</p>
      </section>

      {/* 작은 창이 열려 있으면 원래 탭에는 버튼을 숨긴다 (PIP-02: 쓰기 UI 중복 금지) */}
      {status !== 'open' && (
        <section className="panel">
          <p className="hint">작은 창이 없을 때 보이는 일반 화면입니다. ‘항상 위’ 기능이 아닙니다.</p>
          {pipContent}
        </section>
      )}

      <section className="panel">
        <div className="row">
          <h2>기록</h2>
          <button type="button" onClick={copyLog}>기록 복사</button>
          <button type="button" onClick={() => setLog([])}>지우기</button>
        </div>
        <pre className="log">{log.join('\n') || '아직 기록 없음'}</pre>
      </section>

      {pipWindow && createPortal(pipContent, pipWindow.document.body)}
    </main>
  )
}
