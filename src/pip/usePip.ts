import { useCallback, useState } from 'react'

// PRD 12.1 PiP 상태
export type PipStatus = 'unsupported' | 'closed' | 'opening' | 'open' | 'failed'

export type PipSize = { width: number; height: number }

// PRD 8.2 (v1.1)
export const PIP_SIZE_DEFAULT: PipSize = { width: 240, height: 160 }
export const PIP_SIZE_COMPACT: PipSize = { width: 200, height: 120 }
export const PIP_SIZE_QUESTION: PipSize = { width: 380, height: 480 }

// 작은 창 안의 버튼 클릭 핸들러에서만 호출한다 (Chrome은 PiP 창의 사용자 클릭이 있어야 크기 변경 허용).
// resizeBy는 바깥 창 기준이라 현재 안쪽 크기와의 차이만큼 조정한다.
export function resizePip(win: Window, size: PipSize) {
  try {
    win.resizeBy(size.width - win.innerWidth, size.height - win.innerHeight)
    return true
  } catch {
    return false
  }
}

// 원래 페이지의 스타일을 PiP 문서로 복사한다. PiP는 빈 문서로 열리기 때문.
function copyStyles(target: Window) {
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const css = Array.from(sheet.cssRules).map((r) => r.cssText).join('\n')
      const style = target.document.createElement('style')
      style.textContent = css
      target.document.head.appendChild(style)
    } catch {
      // 교차 출처 스타일시트는 cssRules 접근이 막히므로 link로 연결
      if (sheet.href) {
        const link = target.document.createElement('link')
        link.rel = 'stylesheet'
        link.href = sheet.href
        target.document.head.appendChild(link)
      }
    }
  }
}

export function usePip(onClosed?: () => void) {
  const api = window.documentPictureInPicture
  const [status, setStatus] = useState<PipStatus>(api ? 'closed' : 'unsupported')
  const [pipWindow, setPipWindow] = useState<Window | null>(null)
  const [error, setError] = useState<string | null>(null)

  // 반드시 사용자 클릭 핸들러 안에서 호출한다 (PIP-01: 자동 열기 금지)
  const open = useCallback(
    async (size = PIP_SIZE_DEFAULT) => {
      if (!api) return
      if (api.window) return // 이미 열려 있으면 중복 생성하지 않는다
      setStatus('opening')
      setError(null)
      try {
        const win = await api.requestWindow(size)
        copyStyles(win)
        win.document.title = '다음으로'
        win.addEventListener('pagehide', () => {
          setPipWindow(null)
          setStatus('closed')
          onClosed?.()
        })
        setPipWindow(win)
        setStatus('open')
      } catch (e) {
        setStatus('failed')
        setError(e instanceof Error ? e.message : String(e))
      }
    },
    [api, onClosed],
  )

  return { status, pipWindow, error, open }
}
