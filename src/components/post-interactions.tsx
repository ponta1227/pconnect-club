'use client'

import { useRef, useState, useTransition } from 'react'
import { addComment, deleteComment, deletePost, togglePin, toggleReaction } from '@/app/actions/posts'
import { REACTIONS } from '@/lib/reactions'

function useRun() {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const run = (fn: () => Promise<unknown>, after?: () => void) =>
    start(async () => {
      setError(null)
      try {
        await fn()
        after?.()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'エラーが発生しました')
      }
    })
  return { pending, error, run }
}

export function Reactions({ postId, counts, mine }: { postId: string; counts: Record<string, number>; mine: string[] }) {
  const r = useRun()
  const [open, setOpen] = useState(false)
  const used = REACTIONS.filter((e) => counts[e])
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {used.map((e) => (
        <button
          key={e}
          type="button"
          disabled={r.pending}
          onClick={() => r.run(() => toggleReaction(postId, e))}
          className={`flex h-9 items-center gap-1 rounded-full border px-2.5 text-sm ${mine.includes(e) ? 'border-brand bg-brand-soft' : 'border-line bg-white'}`}
        >
          <span>{e}</span>
          <span className="text-xs font-semibold">{counts[e]}</span>
        </button>
      ))}
      <button type="button" onClick={() => setOpen(!open)} className="flex h-9 items-center rounded-full border border-line bg-white px-3 text-sm text-muted">
        ＋スタンプ
      </button>
      {open && (
        <div className="flex w-full flex-wrap gap-1 rounded-xl border border-line bg-white p-2">
          {REACTIONS.map((e) => (
            <button key={e} type="button" className="h-11 w-11 rounded-lg text-2xl hover:bg-bg" onClick={() => r.run(() => toggleReaction(postId, e), () => setOpen(false))}>
              {e}
            </button>
          ))}
        </div>
      )}
      {r.error && <p className="w-full text-xs text-danger">{r.error}</p>}
    </div>
  )
}

export function CommentForm({ postId }: { postId: string }) {
  const r = useRun()
  const ref = useRef<HTMLTextAreaElement>(null)
  return (
    <form
      className="flex items-end gap-2"
      action={(fd) => r.run(() => addComment(postId, String(fd.get('body') ?? '')), () => { if (ref.current) ref.current.value = '' })}
    >
      <textarea ref={ref} name="body" rows={1} maxLength={2000} required placeholder="コメントを書く" className="input min-h-11 flex-1 resize-none" />
      <button className="btn-primary" disabled={r.pending}>送信</button>
      {r.error && <p className="text-xs text-danger">{r.error}</p>}
    </form>
  )
}

export function DeleteCommentButton({ id }: { id: string }) {
  const r = useRun()
  return (
    <button type="button" className="text-xs text-muted underline" disabled={r.pending} onClick={() => confirm('コメントを削除しますか？') && r.run(() => deleteComment(id))}>
      削除
    </button>
  )
}

export function PostAdminActions({ postId, pinned }: { postId: string; pinned: boolean }) {
  const r = useRun()
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" className="btn-secondary btn-sm" disabled={r.pending} onClick={() => r.run(() => togglePin(postId, !pinned))}>
        {pinned ? '固定を外す' : '上部に固定'}
      </button>
      <button type="button" className="btn-secondary btn-sm text-danger" disabled={r.pending} onClick={() => confirm('この投稿を削除しますか？') && r.run(() => deletePost(postId))}>
        削除
      </button>
      {r.error && <p className="w-full text-xs text-danger">{r.error}</p>}
    </div>
  )
}
