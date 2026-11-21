'use client'

import { useState, useTransition } from 'react'
import {
  addArrivalManually,
  cancelArrival,
  cancelEvent,
  deleteEvent,
  reopenEvent,
  answerRsvp,
  nudgeUnanswered,
  setPayment,
} from '@/app/actions/events'

function useAction() {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const run = (fn: () => Promise<unknown>, done?: (r: unknown) => void) =>
    start(async () => {
      setError(null)
      setInfo(null)
      try {
        const r = await fn()
        done?.(r)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'エラーが発生しました')
      }
    })
  return { pending, error, info, setInfo, run }
}

type Child = { id: string; full_name: string }

/** 管理者: 参加費を徴収したか（ボタンで切り替え）とメモ */
export function PaymentCell({ rsvpId, name, paid, note }: { rsvpId: string; name: string; paid: boolean; note: string }) {
  const a = useAction()
  const [value, setValue] = useState(note)
  const [memo, setMemo] = useState(note !== '')
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={a.pending}
          aria-pressed={paid}
          aria-label={`${name} の参加費を${paid ? '未徴収に戻す' : '徴収済みにする'}`}
          onClick={() => a.run(() => setPayment(rsvpId, !paid, value))}
          className={`btn btn-sm flex-1 ${paid ? 'bg-ok-soft text-ok' : 'border border-ball bg-white text-ball-ink'}`}
        >
          {a.pending ? '…' : paid ? '✓ 参加費 徴収済み' : '参加費 未徴収（押すと徴収済み）'}
        </button>
        {!memo && (
          <button type="button" className="btn-ghost btn-sm text-xs" onClick={() => setMemo(true)}>
            メモ
          </button>
        )}
      </div>
      {memo && (
        <input
          className="input !min-h-8 py-1 text-xs"
          placeholder="メモ（例：現金で受取、次回払い）"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => value !== note && a.run(() => setPayment(rsvpId, paid, value))}
          maxLength={200}
          aria-label={`${name} の参加費のメモ`}
        />
      )}
      {a.error && <p className="text-xs text-danger">{a.error}</p>}
    </div>
  )
}

/** 管理者: 未回答の子の一覧。その場で代理回答でき、まとめて催促も送れる */
export function UnansweredList({ eventId, kids }: { eventId: string; kids: (Child & { has_guardian: boolean })[] }) {
  const a = useAction()
  const [busy, setBusy] = useState<string | null>(null)
  if (kids.length === 0) return <p className="text-sm text-muted">全員が回答済みです。</p>
  const reachable = kids.filter((k) => k.has_guardian).length
  const answer = (id: string, v: 'going' | 'declined') => {
    setBusy(id)
    a.run(() => answerRsvp(eventId, id, v), () => setBusy(null))
  }
  return (
    <div className="space-y-3">
      <button
        type="button"
        className="btn-primary w-full"
        disabled={a.pending || reachable === 0}
        onClick={() =>
          a.run(
            () => nudgeUnanswered(eventId),
            (r) => a.setInfo(`${(r as { sent: number }).sent}人の保護者に、回答のお願いを送りました`),
          )
        }
      >
        未回答の保護者に催促を送る
      </button>
      {a.info && <p className="rounded-xl bg-ok-soft px-3 py-2 text-sm text-ok">{a.info}</p>}
      {a.error && <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{a.error}</p>}
      <ul className="divide-y divide-line">
        {kids.map((k) => (
          <li key={k.id} className="flex min-h-12 items-center gap-2 py-1.5">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{k.full_name}</span>
              {!k.has_guardian && <span className="block text-xs text-ball-ink">保護者が未登録のため、通知が届きません</span>}
            </span>
            <button type="button" className="btn-secondary btn-sm" disabled={a.pending} onClick={() => answer(k.id, 'going')} aria-label={`${k.full_name} を参加にする`}>
              {busy === k.id ? '…' : '参加'}
            </button>
            <button type="button" className="btn-secondary btn-sm" disabled={a.pending} onClick={() => answer(k.id, 'declined')} aria-label={`${k.full_name} を見送りにする`}>
              見送り
            </button>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted">電話や口頭で聞いた回答は、ここで代わりに入力できます。</p>
    </div>
  )
}

/** 管理者: 子どもを選んで手動で到着登録 */
export function AdminChildPicker({ eventId, kids: children }: { eventId: string; kids: Child[] }) {
  const a = useAction()
  const [id, setId] = useState('')
  if (children.length === 0) return null
  return (
    <div className="flex gap-2">
      <select className="input flex-1" value={id} onChange={(e) => setId(e.target.value)} aria-label="手動で到着登録する子">
        <option value="">手動で到着登録…</option>
        {children.map((c) => (
          <option key={c.id} value={c.id}>{c.full_name}</option>
        ))}
      </select>
      <button className="btn-secondary" disabled={!id || a.pending} onClick={() => a.run(() => addArrivalManually(eventId, id), () => setId(''))}>
        登録
      </button>
      {a.error && <p className="text-xs text-danger">{a.error}</p>}
    </div>
  )
}

export function CancelArrivalButton({ arrivalId, name }: { arrivalId: string; name: string }) {
  const a = useAction()
  return (
    <button
      className="text-xs text-danger underline"
      disabled={a.pending}
      onClick={() => confirm(`${name}さんの到着を取り消しますか？（通知は送られません）`) && a.run(() => cancelArrival(arrivalId))}
    >
      取消
    </button>
  )
}

/** 管理者: 中止・再開・削除 */
export function EventAdminActions({ eventId, cancelled, series }: { eventId: string; cancelled: boolean; series: boolean }) {
  const a = useAction()
  const [mode, setMode] = useState<'none' | 'cancel' | 'delete'>('none')
  const [urgent, setUrgent] = useState(true)
  const [scope, setScope] = useState<'this' | 'following' | 'all'>('this')
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {cancelled ? (
          <button className="btn-secondary btn-sm" disabled={a.pending} onClick={() => a.run(() => reopenEvent(eventId))}>中止を取り消す</button>
        ) : (
          <button className="btn-secondary btn-sm text-danger" onClick={() => setMode(mode === 'cancel' ? 'none' : 'cancel')}>中止にする</button>
        )}
        <button className="btn-secondary btn-sm text-danger" onClick={() => setMode(mode === 'delete' ? 'none' : 'delete')}>削除</button>
      </div>
      {mode === 'cancel' && (
        <div className="space-y-2 rounded-xl bg-danger-soft p-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} className="h-5 w-5" />
            緊急扱い（通知OFFの人にもメールで届けます）
          </label>
          <button className="btn-danger w-full" disabled={a.pending} onClick={() => a.run(() => cancelEvent(eventId, urgent), () => setMode('none'))}>
            中止にして通知する
          </button>
        </div>
      )}
      {mode === 'delete' && (
        <div className="space-y-2 rounded-xl bg-danger-soft p-3">
          {series &&
            (
              [
                ['this', 'この予定のみ'],
                ['following', 'これ以降すべて'],
                ['all', 'すべて'],
              ] as const
            ).map(([v, l]) => (
              <label key={v} className="flex items-center gap-2 text-sm">
                <input type="radio" checked={scope === v} onChange={() => setScope(v)} className="h-4 w-4" /> {l}
              </label>
            ))}
          <p className="text-xs text-danger">参加登録・到着記録も削除されます。休みの日は「中止」をおすすめします。</p>
          <button className="btn-danger w-full" disabled={a.pending} onClick={() => a.run(() => deleteEvent(eventId, scope))}>削除する</button>
        </div>
      )}
      {a.error && <p className="text-sm text-danger">{a.error}</p>}
    </div>
  )
}
