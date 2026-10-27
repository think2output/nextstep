// 서버 RPC 호출 (PRD 15장). 역할·사용자 ID는 보내지 않는다 — 서버가 auth.uid()로 판정.
import { supabase } from './supabase'

export type RpcOk<T> = {
  ok: true
  action_id: string | null
  server_time: string
  room_revision: number | null
  data: T
}

export type RpcErr = {
  ok: false
  error: { code: string; retryable: boolean; message_key: string; data?: Record<string, any> }
  server_time?: string
}

export type RpcResult<T> = RpcOk<T> | RpcErr

export const WRITE_TIMEOUT_MS = 8_000 // PRD 18: 8초 후 결과 미확인

// 같은 브라우저 프로필의 탭은 같은 익명 세션을 쓴다 (ROOM-02)
let sessionPromise: Promise<void> | null = null
export function ensureSession() {
  sessionPromise ??= (async () => {
    const { data } = await supabase.auth.getSession()
    if (data.session) return
    const { error } = await supabase.auth.signInAnonymously()
    if (error) {
      sessionPromise = null
      throw error
    }
  })()
  return sessionPromise
}

// 전송 계층 실패·타임아웃은 앱 오류 코드(TIMEOUT/NETWORK)로 바꿔 돌려준다.
// TIMEOUT은 실패 확정이 아니다: 호출한 쪽이 snapshot으로 반영 여부를 확인한다 (RESP-04).
export async function call<T>(fn: string, args: Record<string, unknown>, timeoutMs = WRITE_TIMEOUT_MS): Promise<RpcResult<T>> {
  try {
    await ensureSession()
  } catch {
    return fail('UNAUTHENTICATED')
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const { data, error } = await supabase.rpc(fn, args).abortSignal(controller.signal)
    if (error) return fail(controller.signal.aborted ? 'TIMEOUT' : 'NETWORK')
    return data as RpcResult<T>
  } catch {
    return fail(controller.signal.aborted ? 'TIMEOUT' : 'NETWORK')
  } finally {
    clearTimeout(timer)
  }
}

function fail(code: string): RpcErr {
  return { ok: false, error: { code, retryable: true, message_key: code.toLowerCase() } }
}

export const newActionId = (): string => crypto.randomUUID()
