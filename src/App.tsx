import { Suspense, lazy } from 'react'
import { useLocation } from './app/router'
import RoomPage from './pages/RoomPage'
import StartPage from './pages/StartPage'

// GATE-01 시험 페이지는 /gate 에서만 따로 불러온다 (전용 CSS가 앱에 섞이지 않게)
const GatePage = lazy(() => import('./gate/GatePage'))

const ROOM_PATH = /^\/room\/([0-9a-f-]{36})\/?$/

export default function App() {
  const url = useLocation()

  if (url.pathname.startsWith('/gate')) {
    return (
      <Suspense fallback={null}>
        <GatePage />
      </Suspense>
    )
  }

  const room = url.pathname.match(ROOM_PATH)
  if (room) return <RoomPage key={room[1]} roomId={room[1]} />

  // '/' 와 '/join?code=XXXX' (참여 링크)
  return <StartPage initialCode={url.searchParams.get('code') ?? ''} />
}
