// 라우터 라이브러리 없이 쓰는 최소 경로 처리. 배포 시 모든 경로를 index.html로 보내야 한다 (vercel.json).
import { useEffect, useState } from 'react'

function current() {
  return window.location.pathname + window.location.search
}

export function useLocation() {
  const [path, setPath] = useState(current)
  useEffect(() => {
    const onPop = () => setPath(current())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  return new URL(path, window.location.origin)
}

export function navigate(to: string, replace = false) {
  if (replace) window.history.replaceState(null, '', to)
  else window.history.pushState(null, '', to)
  window.dispatchEvent(new PopStateEvent('popstate'))
}
