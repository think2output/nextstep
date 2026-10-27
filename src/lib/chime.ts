// 재촉 알림음 (D-028). 파일 없이 짧은 두 음을 만든다.
// 브라우저는 사용자가 한 번이라도 누른 뒤에만 소리를 허용하므로, 첫 클릭 때 오디오를 깨워 둔다.

let ctx: AudioContext | null = null

function context() {
  ctx ??= new AudioContext()
  return ctx
}

export function unlockAudioOnFirstGesture() {
  const unlock = () => {
    void context().resume()
    window.removeEventListener('pointerdown', unlock)
    window.removeEventListener('keydown', unlock)
  }
  window.addEventListener('pointerdown', unlock)
  window.addEventListener('keydown', unlock)
}

export function playChime() {
  try {
    const ac = context()
    if (ac.state !== 'running') void ac.resume()
    const start = ac.currentTime + 0.02
    // 띵-동 (E6 → C6), 각 0.18초, 작은 음량
    ;[1318.5, 1046.5].forEach((freq, i) => {
      const t = start + i * 0.2
      const osc = ac.createOscillator()
      const gain = ac.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18)
      osc.connect(gain).connect(ac.destination)
      osc.start(t)
      osc.stop(t + 0.2)
    })
  } catch {
    // 소리를 못 내도 화면 알림은 그대로 동작한다
  }
}
