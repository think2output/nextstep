import { useCallback, useState } from 'react'

// PRD 12.1 PiP 상태
export type PipStatus = 'unsupported' | 'closed' | 'opening' | 'open' | 'failed'

export const PIP_SIZE_DEFAULT = { width: 340, height: 280 } // PRD 8.2
export const PIP_SIZE_QUESTION = { width: 380, height: 480 }

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
