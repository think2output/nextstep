// Document Picture-in-Picture API (Chrome 116+). TS 기본 DOM 타입에 아직 없어 직접 선언한다.

interface DocumentPictureInPictureOptions {
  width?: number
  height?: number
  disallowReturnToOpener?: boolean
  preferInitialWindowPlacement?: boolean
}

interface DocumentPictureInPicture extends EventTarget {
  requestWindow(options?: DocumentPictureInPictureOptions): Promise<Window>
  readonly window: Window | null
}

interface Window {
  // 지원하지 않는 브라우저에서는 없으므로 optional로 둔다 (PIP-01 feature detection)
  documentPictureInPicture?: DocumentPictureInPicture
}
