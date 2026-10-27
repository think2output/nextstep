// S01 시작: 학생 참여 코드 입력 / 강사 방 만들기 (PRD 7장, 8.1)
import { type FormEvent, useState } from 'react'
import { navigate } from '../app/router'
import { call, newActionId } from '../lib/rpc'
import { TITLE_MAX, errorText, textLength } from '../shared/domain'

const pipSupported = 'documentPictureInPicture' in window

export default function StartPage({ initialCode }: { initialCode: string }) {
  const [code, setCode] = useState(initialCode)
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)

  const [hostOpen, setHostOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [pilot, setPilot] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [existingRoom, setExistingRoom] = useState<string | null>(null)

  const join = async (e: FormEvent) => {
    e.preventDefault()
    if (joining) return
    setJoining(true)
    setJoinError(null)
    const res = await call<{ room_id: string }>('join_room', { p_code: code, p_action_id: newActionId() })
    setJoining(false)
    if (res.ok) navigate(`/room/${res.data.room_id}`)
    else setJoinError(errorText(res.error.code, res.error.data?.retry_after_seconds))
  }

  const create = async (e: FormEvent) => {
    e.preventDefault()
    if (creating) return
    setCreating(true)
    setCreateError(null)
    setExistingRoom(null)
    const res = await call<{ room_id: string }>('create_room', {
      p_title: title,
      p_pilot_code: pilot,
      p_action_id: newActionId(),
    })
    setCreating(false)
    if (res.ok) {
      navigate(`/room/${res.data.room_id}`)
      return
    }
    if (res.error.code === 'ACTIVE_ROOM_EXISTS') setExistingRoom(res.error.data?.room_id ?? null)
    setCreateError(
      res.error.code === 'FORBIDDEN'
        ? '방 만들기 코드가 맞지 않아요.'
        : errorText(res.error.code, res.error.data?.retry_after_seconds),
    )
  }

  const titleLen = textLength(title)

  return (
    <main className="page">
      <h1 className="page-title">수업 중 한 번의 클릭으로<br />상태를 전해요</h1>
      <p className="page-desc">실습 화면 위 작은 창에서 응답하고, 익명으로 질문하세요.</p>

      {!pipSupported && (
        <p className="notice notice-warn">
          이 브라우저는 작은 창을 지원하지 않아요. Windows의 최신 Chrome에서 열어주세요. 일반 화면으로는 사용할 수 있어요.
        </p>
      )}

      <form className="section stack" onSubmit={join}>
        <label className="field">
          <span className="field-label">참여 코드</span>
          <input
            className="input input-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="8자리 코드"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={16}
          />
        </label>
        <p className="notice">이름 없이 익명으로 참여해요. 질문 작성자는 강사와 다른 수강생에게 보이지 않아요.</p>
        {joinError && <p className="error-text" role="alert">{joinError}</p>}
        <button type="submit" className="btn btn-primary btn-block" disabled={joining || code.trim().length < 8}>
          {joining ? '입장하는 중…' : '입장하기'}
        </button>
      </form>

      <hr className="divider" />

      {!hostOpen ? (
        <button type="button" className="btn btn-grey btn-block" onClick={() => setHostOpen(true)}>
          강사로 방 만들기
        </button>
      ) : (
        <form className="stack" onSubmit={create}>
          <h2 className="section-title">강사로 방 만들기</h2>
          <label className="field">
            <span className="field-label">수업 이름 ({titleLen}/{TITLE_MAX})</span>
            <input
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 리액트 3주차 실습"
              maxLength={TITLE_MAX * 2}
            />
          </label>
          <label className="field">
            <span className="field-label">방 만들기 코드</span>
            <input
              className="input"
              type="password"
              value={pilot}
              onChange={(e) => setPilot(e.target.value)}
              placeholder="운영자에게 받은 코드"
              autoComplete="off"
            />
          </label>
          <p className="notice">이 브라우저의 사이트 데이터를 지우면 강사 권한을 복구할 수 없어요.</p>
          {createError && <p className="error-text" role="alert">{createError}</p>}
          {existingRoom && (
            <button type="button" className="btn btn-weak btn-block" onClick={() => navigate(`/room/${existingRoom}`)}>
              열려 있는 방으로 가기
            </button>
          )}
          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={creating || titleLen < 1 || titleLen > TITLE_MAX || !pilot}
          >
            {creating ? '만드는 중…' : '방 만들기'}
          </button>
        </form>
      )}
    </main>
  )
}
