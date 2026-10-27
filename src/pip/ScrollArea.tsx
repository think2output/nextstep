// PiP 창에서 기본 스크롤바를 잡아 끌면 움직이지 않는 문제(사용자 보고, 휠은 정상)를 피하기 위한 직접 만든 스크롤바.
// 내용은 일반 overflow 스크롤(휠·키보드·터치 그대로), 막대만 포인터 이벤트로 직접 처리한다.
import { type ReactNode, type PointerEvent, useCallback, useLayoutEffect, useRef, useState } from 'react'

const MIN_THUMB = 28

export default function ScrollArea({ className, children }: { className?: string; children: ReactNode }) {
  const viewRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ startY: number; startTop: number } | null>(null)
  const [thumb, setThumb] = useState({ top: 0, height: 0, visible: false })

  const update = useCallback(() => {
    const el = viewRef.current
    if (!el) return
    const { scrollTop, scrollHeight, clientHeight } = el
    if (scrollHeight <= clientHeight + 1) {
      setThumb((t) => (t.visible ? { top: 0, height: 0, visible: false } : t))
      return
    }
    const height = Math.max((clientHeight / scrollHeight) * clientHeight, MIN_THUMB)
    const top = (scrollTop / (scrollHeight - clientHeight)) * (clientHeight - height)
    setThumb({ top, height, visible: true })
  }, [])

  // PiP 문서에 들어 있을 수 있으므로 그 창의 ResizeObserver를 쓴다
  useLayoutEffect(() => {
    const el = viewRef.current
    if (!el) return
    update()
    const win = el.ownerDocument.defaultView
    if (!win) return
    const ro = new win.ResizeObserver(update)
    ro.observe(el)
    if (el.firstElementChild) ro.observe(el.firstElementChild)
    return () => ro.disconnect()
  }, [update])

  const scrollRatio = () => {
    const el = viewRef.current!
    return (el.scrollHeight - el.clientHeight) / Math.max(el.clientHeight - thumb.height, 1)
  }

  const onThumbDown = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { startY: e.clientY, startTop: viewRef.current!.scrollTop }
  }

  const onThumbMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return
    viewRef.current!.scrollTop = drag.current.startTop + (e.clientY - drag.current.startY) * scrollRatio()
  }

  const onThumbUp = (e: PointerEvent<HTMLDivElement>) => {
    drag.current = null
    e.currentTarget.releasePointerCapture(e.pointerId)
  }

  // 막대 빈 곳을 누르면 그 위치로 이동
  const onTrackDown = (e: PointerEvent<HTMLDivElement>) => {
    const el = viewRef.current!
    const rect = e.currentTarget.getBoundingClientRect()
    const target = e.clientY - rect.top - thumb.height / 2
    el.scrollTop = target * scrollRatio()
  }

  return (
    <div className={`scroll-area${className ? ` ${className}` : ''}`}>
      <div ref={viewRef} className="scroll-view" onScroll={update}>
        {children}
      </div>
      {thumb.visible && (
        <div className="scroll-track" aria-hidden="true" onPointerDown={onTrackDown}>
          <div
            className="scroll-thumb"
            style={{ top: thumb.top, height: thumb.height }}
            onPointerDown={onThumbDown}
            onPointerMove={onThumbMove}
            onPointerUp={onThumbUp}
            onPointerCancel={onThumbUp}
          />
        </div>
      )}
    </div>
  )
}
