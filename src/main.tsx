import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css'
import './styles/tokens.css'
import './styles/app.css'
import { unlockAudioOnFirstGesture } from './lib/chime'
import App from './App.tsx'

// 재촉 알림음: 첫 클릭 때 오디오를 깨워 둔다 (브라우저 자동 재생 정책)
unlockAudioOnFirstGesture()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
