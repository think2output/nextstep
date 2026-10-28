// 질문 원문을 보는 옆 창 (PRD v1.9 8.6, D-042). 작은 창(PiP)은 페이지당 하나라 보통 팝업 창이다 → 항상 위가 아니다.
// 화면은 원래 탭이 portal로 그려 넣는다: 인증·구독·heartbeat를 새로 만들지 않는다 (PIP-02, 절대 규칙 11).
import { useCallback, useEffect, useRef, useState } from 'react'
import { copyStyles, syncStyles } from './usePip'

export const SIDE_SIZE = { width: 280, height: 220 }
const GAP = 8
const NAME = 'nextstep-question'

type ScreenWithAvail = Screen & { availLeft?: number; availTop?: number }

// 누른 창(작은 창) 기준으로 빈 공간이 더 넓은 쪽(왼쪽/오른쪽)에, 같은 높이로 붙인다. 화면 밖으로는 안 나가게.
export function sidePosition(src: Window) {
  const sc = src.screen as ScreenWithAvail
  const areaLeft = sc.availLeft ?? 0
  const areaTop = sc.availTop ?? 0
  const areaRight = areaLeft + sc.availWidth
  const areaBottom = areaTop + sc.availHeight
  const x = src.screenX
  const w = src.outerWidth
  const rightRoom = areaRight - (x + w)
  const leftRoom = x - areaLeft
  let left = rightRoom >= leftRoom ? x + w + GAP : x - SIDE_SIZE.width - GAP
  left = Math.max(areaLeft, Math.min(left, areaRight - SIDE_SIZE.width))
  const top = Math.max(areaTop, Math.min(src.screenY, areaBottom - SIDE_SIZE.height))
  return { left: Math.round(left), top: Math.round(top) }
}

export function useSideWindow() {
  const [win, setWin] = useState<Window | null>(null)
  // 작은 창 닫힘 처리처럼 먼저 만들어진 콜백에서도 지금 열린 옆 창을 닫을 수 있게 ref로 둔다
  const ref = useRef<Window | null>(null)
  const stop = useRef<(() => void) | null>(null)

  // 반드시 사용자 클릭 핸들러 안에서 호출한다 (팝업 차단·자동 열기 금지, PIP-01)
  const open = useCallback((src: Window, title: string) => {
    const { left, top } = sidePosition(src)
    const current = ref.current && !ref.current.closed ? ref.current : null
    if (current) {
      try {
        current.moveTo(left, top)
      } catch {
        // 위치를 못 옮기면 그 자리에서 내용만 바뀐다
      }
      current.focus()
      current.document.title = title
      return current
    }
    const features = `popup,width=${SIDE_SIZE.width},height=${SIDE_SIZE.height},left=${left},top=${top}`
    // 작은 창 안의 클릭이어도 원래 탭에서 연다 (같은 출처 빈 문서 → portal 대상). 막히면 누른 창에서 다시 시도
    const next = window.open('', NAME, features) ?? (src !== window ? src.open('', NAME, features) : null)
    if (!next) return null
    // 새로고침 전에 열어 둔 같은 이름의 창을 다시 받으면 이전 내용이 남아 있을 수 있다
    next.document.body.replaceChildren()
    copyStyles(next)
    stop.current = syncStyles(next)
    next.document.title = title
    next.document.documentElement.classList.add('side-doc')
    next.addEventListener('pagehide', () => {
      stop.current?.()
      stop.current = null
      if (ref.current === next) ref.current = null
      setWin((w) => (w === next ? null : w))
    })
    ref.current = next
    setWin(next)
    return next
  }, [])

  const close = useCallback(() => {
    const w = ref.current
    ref.current = null
    if (w && !w.closed) w.close()
    setWin(null)
  }, [])

  // 방 화면을 떠나면 옆 창도 닫는다
  useEffect(() => close, [close])

  return { win, open, close }
}
