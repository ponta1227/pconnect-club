'use client'

import { useState, useTransition } from 'react'
import { saveNote } from '@/app/actions/chat'
import { Linkify } from './ui'

/** ルームのノート（固定メモ） */
export function RoomNote({ roomId, body, meta, canEdit }: { roomId: string; body: string; meta?: string; canEdit: boolean }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(body)
  const [pending, start] = useTransition()
  if (editing) {
    return (
      <div className="card space-y-2 p-3">
        <textarea className="input" rows={6} value={value} onChange={(e) => setValue(e.target.value)} maxLength={5000} placeholder="当番表・会場のルールなど" />
        <div className="flex gap-2">
          <button className="btn-secondary btn-sm flex-1" onClick={() => setEditing(false)}>やめる</button>
          <button className="btn-primary btn-sm flex-1" disabled={pending} onClick={() => start(async () => { await saveNote(roomId, value); setEditing(false) })}>
            保存
          </button>
        </div>
      </div>
    )
  }
  return (
    <details className="card p-3">
      <summary className="cursor-pointer text-sm font-bold">📌 ノート</summary>
      <div className="mt-2 text-sm">
        {body ? <Linkify text={body} /> : <span className="text-muted">ノートはまだありません</span>}
      </div>
      <div className="mt-2 flex items-center justify-between">
        {meta && <span className="text-xs text-muted">更新: {meta}</span>}
        {canEdit && <button className="btn-ghost btn-sm" onClick={() => setEditing(true)}>編集</button>}
      </div>
    </details>
  )
}
