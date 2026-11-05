'use client'

import { useActionState, useState } from 'react'
import { savePost, type PostFormState } from '@/app/actions/posts'
import { Uploader, type UploadedFile } from './uploader'
import { PollFields } from './poll'

type Opt = { id: string; name: string }

export function PostForm({
  classes,
  initial,
}: {
  classes: Opt[]
  initial: { id?: string; title: string; body: string; class_ids: string[]; urgent: boolean; pinned: boolean; attachments: UploadedFile[]; published: boolean }
}) {
  const [state, action, pending] = useActionState<PostFormState, FormData>(savePost, undefined)
  const [urgent, setUrgent] = useState(initial.urgent)
  const [withPoll, setWithPoll] = useState(false)
  return (
    <form action={action} className="space-y-4">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <section className="card space-y-4 p-4">
        <label className="block">
          <span className="label">タイトル</span>
          <input name="title" className="input" defaultValue={initial.title} maxLength={100} required />
        </label>
        <label className="block">
          <span className="label">本文</span>
          <textarea name="body" rows={8} className="input" defaultValue={initial.body} maxLength={10000} />
        </label>
        <div>
          <span className="label">添付</span>
          <Uploader purpose="post" initial={initial.attachments} />
        </div>
        {classes.length > 0 && (
          <div>
            <span className="label">対象クラス（通知の送り先）</span>
            <div className="flex flex-wrap gap-2">
              {classes.map((c) => (
                <label key={c.id} className="cursor-pointer">
                  <input type="checkbox" name="class_ids" value={c.id} defaultChecked={initial.class_ids.includes(c.id)} className="peer sr-only" />
                  <span className="badge min-h-9 border border-line bg-white px-3 text-sm peer-checked:border-brand peer-checked:bg-brand-soft peer-checked:text-brand">{c.name}</span>
                </label>
              ))}
            </div>
            <p className="hint">選ばない場合は全員に通知します。投稿は全員が閲覧できます。</p>
          </div>
        )}
      </section>

      {!initial.id && (
        <section className="card space-y-3 p-4">
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={withPoll} onChange={(e) => setWithPoll(e.target.checked)} className="h-5 w-5" />
            アンケート・日程調整を付ける
          </label>
          {withPoll && <PollFields />}
        </section>
      )}

      <section className="card space-y-3 p-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="pinned" defaultChecked={initial.pinned} className="h-5 w-5" />
          上部に固定する（最大3件）
        </label>
        <label className={`flex items-start gap-2 rounded-xl p-2 text-sm ${urgent ? 'bg-danger-soft text-danger' : ''}`}>
          <input type="checkbox" name="urgent" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} className="mt-0.5 h-5 w-5" />
          <span>
            <b>緊急</b>（台風・休館・練習中止など）
            <br />
            <span className="text-xs">通知をOFFにしている人にもメールで届き、夜間でもすぐに通知されます。</span>
          </span>
        </label>
      </section>

      {state?.error && <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{state.error}</p>}
      <div className="flex gap-2">
        {!initial.published && (
          <button name="intent" value="draft" className="btn-secondary flex-1" disabled={pending}>下書き保存</button>
        )}
        <button name="intent" value="publish" className={`${urgent ? 'btn-danger' : 'btn-primary'} flex-[2]`} disabled={pending}>
          {pending ? '保存中…' : initial.published ? '保存' : urgent ? '緊急で投稿する' : '投稿する'}
        </button>
      </div>
    </form>
  )
}
