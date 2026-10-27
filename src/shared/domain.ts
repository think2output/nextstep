// 서버(supabase/migrations)와 같은 값을 쓰는 공통 타입·문구. 값을 바꾸면 SQL도 함께 바꾼다.

export type Role = 'host' | 'student'
export type RoundType = 'ready' | 'understood' | 'proceed'
export type Choice = 'yes' | 'no'
export type QuestionStatus = 'pending' | 'answered' | 'hidden'
export type QuestionFilter = 'pending' | 'answered'
export type QuestionSort = 'popular' | 'latest'

// RESP-01 고정 요청 사전. short는 작은 창 집계 칸용.
export const ROUND_TEXT: Record<
  RoundType,
  { label: string; question: string; yes: string; no: string; yesShort: string; noShort: string }
> = {
  ready: { label: '준비 확인', question: '실습할 준비가 됐나요?', yes: '준비됐어요', no: '잠시만요', yesShort: '준비됨', noShort: '잠시만' },
  understood: { label: '이해 확인', question: '여기까지 이해됐나요?', yes: '이해했어요', no: '다시 설명해주세요', yesShort: '이해함', noShort: '다시 설명' },
  proceed: { label: '진행 확인', question: '다음 단계로 넘어갈까요?', yes: '좋아요', no: '조금만 더요', yesShort: '좋아요', noShort: '조금 더' },
}

export const ROUND_TYPES: RoundType[] = ['ready', 'understood', 'proceed']

export const QUESTION_MAX = 200
export const TITLE_MAX = 30

// JS trim + code point 길이 (서버 private.trim_text + char_length와 같은 기준, AT30)
export function textLength(value: string) {
  return Array.from(value.trim()).length
}

// PRD 15.5 오류 코드 → 사용자 문구
export const ERROR_TEXT: Record<string, string> = {
  UNAUTHENTICATED: '접속 정보를 확인하지 못했어요. 새로고침해주세요.',
  FORBIDDEN: '권한이 없어요.',
  INVALID_INPUT: '입력한 내용을 다시 확인해주세요.',
  ROOM_UNAVAILABLE: '참여 코드를 다시 확인해주세요.',
  ROOM_ENDED: '수업 방이 종료됐어요.',
  ROOM_EXPIRED: '보관 기간이 지나 볼 수 없는 방이에요.',
  ROOM_FULL: '참여 인원이 가득 찼어요.',
  ACTIVE_ROOM_EXISTS: '이미 열려 있는 방이 있어요.',
  ACTIVE_ROUND_EXISTS: '진행 중인 확인을 먼저 종료해주세요.',
  NO_CONNECTED_STUDENTS: '연결된 수강생이 없어요.',
  ROUND_CLOSED: '이번 확인은 종료됐어요.',
  NOT_ROUND_TARGET: '이번 확인은 시작됐어요. 다음 확인부터 참여할 수 있어요.',
  QUESTION_UNAVAILABLE: '볼 수 없는 질문이에요.',
  QUESTION_NOT_PENDING: '이미 답변된 질문이에요.',
  SELF_REACTION_NOT_ALLOWED: '내 질문에는 공감할 수 없어요.',
  RATE_LIMITED: '잠시 후 다시 시도해주세요.',
  QUESTION_LIMIT_REACHED: '질문을 더 남길 수 없어요.',
  VERSION_CONFLICT: '다른 화면에서 바뀌었어요. 다시 확인해주세요.',
  ACTION_ID_REUSED: '요청이 겹쳤어요. 다시 시도해주세요.',
  INTERNAL_ERROR: '처리하지 못했어요. 잠시 후 다시 시도해주세요.',
  TIMEOUT: '전송을 확인하지 못했어요. 상태를 다시 확인해주세요.',
  NETWORK: '연결이 불안정해요. 잠시 후 다시 시도해주세요.',
}

export function errorText(code: string, retryAfter?: number) {
  if (code === 'RATE_LIMITED' && retryAfter) return `${retryAfter}초 뒤에 다시 시도해주세요.`
  return ERROR_TEXT[code] ?? ERROR_TEXT.INTERNAL_ERROR
}

// ───────── snapshot (PRD 15.4) ─────────

export type HostRound = {
  id: string
  type: RoundType
  status: 'open' | 'closed'
  opened_at: string
  closed_at: string | null
  target_count: number
  yes_count: number
  no_count: number
  unanswered_count: number
  target_connection_unknown_count: number
}

export type StudentRound = {
  id: string
  type: RoundType
  status: 'open' | 'closed'
  opened_at: string
  closed_at: string | null
  is_target: boolean
  my_choice: Choice | null
  my_response_version: number
}

export type QuestionCard = {
  id: string
  body: string
  status: QuestionStatus
  version: number
  created_at: string
  answered_at: string | null
  reaction_count: number
  is_mine: boolean
  reacted_by_me: boolean
}

export type Snapshot = {
  room: {
    id: string
    title: string
    status: 'open' | 'ended'
    auto_end_at: string
    ended_at: string | null
    revision: number
    join_code?: string // 강사에게만
  }
  my_role: Role
  active_round: HostRound | StudentRound | null
  latest_closed_round: HostRound | StudentRound | null
  pending_question_count: number
  current_connected_students: number | null
  questions_page: QuestionCard[]
  next_offset: number | null
  filter: QuestionFilter
  sort: QuestionSort
}
