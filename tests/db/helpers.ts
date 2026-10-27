import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type RpcResult = {
  ok: boolean
  action_id?: string | null
  room_revision?: number
  data?: Record<string, any>
  error?: { code: string; retryable: boolean; data?: Record<string, any> }
}

const url = process.env.VITE_SUPABASE_URL!
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!
export const PILOT_CODE = process.env.PILOT_CODE!

if (!url || !key || !PILOT_CODE) {
  throw new Error('.env.local에 VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, PILOT_CODE가 필요합니다')
}

// 서로 다른 브라우저 프로필처럼 각자 익명 세션을 가진 클라이언트
export async function newUser(): Promise<SupabaseClient> {
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error } = await client.auth.signInAnonymously()
  if (error) throw error
  return client
}

export async function rpc(client: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<RpcResult> {
  const { data, error } = await client.rpc(fn, args)
  if (error) throw new Error(`${fn}: ${error.message}`)
  return data as RpcResult
}

export const aid = () => crypto.randomUUID()

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function createRoom(host: SupabaseClient, title = '테스트 수업') {
  const res = await rpc(host, 'create_room', { p_title: title, p_pilot_code: PILOT_CODE, p_action_id: aid() })
  if (!res.ok) throw new Error(`create_room failed: ${JSON.stringify(res.error)}`)
  return res.data as { room_id: string; join_code: string }
}

export async function joinRoom(student: SupabaseClient, code: string) {
  const res = await rpc(student, 'join_room', { p_code: code, p_action_id: aid() })
  if (!res.ok) throw new Error(`join_room failed: ${JSON.stringify(res.error)}`)
  return res.data as { room_id: string; role: string }
}

export async function snapshot(client: SupabaseClient, roomId: string, extra: Record<string, unknown> = {}) {
  const res = await rpc(client, 'get_snapshot', { p_room_id: roomId, ...extra })
  if (!res.ok) throw new Error(`get_snapshot failed: ${JSON.stringify(res.error)}`)
  return res.data as Record<string, any>
}

// 방 + 강사 + 학생 n명
export async function setupRoom(studentCount: number) {
  const host = await newUser()
  const room = await createRoom(host)
  const students = await Promise.all(Array.from({ length: studentCount }, () => newUser()))
  for (const s of students) await joinRoom(s, room.join_code)
  return { host, room, students }
}
