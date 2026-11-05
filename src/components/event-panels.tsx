'use client'

import { useState, useTransition } from 'react'
import {
  addArrivalManually,
  cancelArrival,
  cancelEvent,
  cancelRsvp,
  deleteEvent,
  reopenEvent,
  reportAbsence,
  rsvp,
  setPayment,
  updateCompanions,
  withdrawAbsence,
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
type MyRsvp = { child_id: string; status: 'going' | 'waitlist'; companions: number }

/** 大会・イベントの参加ボタン */
export function RsvpPanel({
  eventId,
  kids: children,
  mine,
  open,
  allowCompanions,
  isAdmin,
}: {
  eventId: string
  kids: Child[]
  mine: MyRsvp[]
  open: boolean
  allowCompanions: boolean
  isAdmin: boolean
}) {
  const a = useAction()
  const registered = new Map(mine.map((m) => [m.child_id, m]))
  const remaining = children.filter((c) => !registered.has(c.id))
  const [selected, setSelected] = useState<string[]>(remaining.length === 1 ? [remaining[0].id] : [])
  const [companions, setCompanions] = useState(0)
  const editable = open || isAdmin
  // 未登録の子が1人だけならその子を選択済みにする
  const effective = remaining.length === 1 ? [remaining[0].id] : selected.filter((id) => remaining.some((r) => r.id === id))

  if (children.length === 0) return <p className="text-sm text-muted">参加登録できるお子さんが登録されていません。</p>

  return (
    <div className="space-y-3">
      {mine.length > 0 && (
        <ul className="space-y-2">
          {children
            .filter((c) => registered.has(c.id))
            .map((c) => {
              const r = registered.get(c.id)!
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-bg px-3 py-2">
                  <span className="flex-1 font-semibold">{c.full_name}</span>
                  {r.status === 'going' ? (
                    <span className="badge bg-ok-soft text-ok">参加</span>
                  ) : (
                    <span className="badge bg-warn-soft text-warn">キャンセル待ち</span>
                  )}
                  {allowCompanions && (
                    <select
                      className="input !min-h-9 w-auto py-1 text-sm"
                      value={r.companions}
                      disabled={!editable || a.pending}
                      onChange={(e) => a.run(() => updateCompanions(eventId, c.id, Number(e.target.value)))}
                      aria-label="同行者数"
                    >
                      {Array.from({ length: 11 }, (_, i) => (
                        <option key={i} value={i}>同行 {i}人</option>
                      ))}
                    </select>
                  )}
                  {editable && (
                    <button
                      className="btn-ghost btn-sm text-danger"
                      disabled={a.pending}
                      onClick={() => {
                        if (confirm(`${c.full_name}さんの参加を取り消しますか？`)) a.run(() => cancelRsvp(eventId, c.id))
                      }}
                    >
                      取消
                    </button>
                  )}
                </li>
              )
            })}
        </ul>
      )}

      {remaining.length > 0 && editable && (
        <div className="space-y-3 rounded-xl border border-line p-3">
          {remaining.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {remaining.map((c) => (
                <label key={c.id} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-line bg-white px-3">
                  <input
                    type="checkbox"
                    className="h-5 w-5"
                    checked={selected.includes(c.id)}
                    onChange={(e) => setSelected((s) => (e.target.checked ? [...s, c.id] : s.filter((x) => x !== c.id)))}
                  />
                  {c.full_name}
                </label>
              ))}
            </div>
          )}
          {allowCompanions && (
            <label className="flex items-center gap-2 text-sm">
              同行者
              <select className="input w-auto" value={companions} onChange={(e) => setCompanions(Number(e.target.value))}>
                {Array.from({ length: 11 }, (_, i) => (
                  <option key={i} value={i}>{i}人</option>
                ))}
              </select>
              <span className="text-xs text-muted">（保護者など）</span>
            </label>
          )}
          <button
            className="btn-primary w-full"
            disabled={a.pending || effective.length === 0}
            onClick={() =>
              a.run(
                () => rsvp(eventId, effective, companions),
                (r) => {
                  const w = (r as { waitlisted: number }).waitlisted
                  if (w > 0) a.setInfo('定員に達しているため、キャンセル待ちで登録しました')
                  setSelected([])
                  setCompanions(0)
                },
              )
            }
          >
            {remaining.length === 1 ? `${remaining[0].full_name}さん 参加する` : '参加する'}
          </button>
        </div>
      )}
      {!editable && remaining.length > 0 && <p className="text-sm text-muted">部内締めを過ぎました。参加を希望する場合は管理者に連絡してください。</p>}
      {a.info && <p className="text-sm text-warn">{a.info}</p>}
      {a.error && <p className="text-sm text-danger">{a.error}</p>}
    </div>
  )
}

type Absence = { child_id: string; kind: 'absent' | 'late' | 'early'; at_time: string; reason: string }
const KINDS = [
  ['absent', '欠席'],
  ['late', '遅刻'],
  ['early', '早退'],
] as const

/** 練習の欠席・遅刻・早退の連絡 */
export function AbsencePanel({ eventId, kids: children, reports }: { eventId: string; kids: Child[]; reports: Absence[] }) {
  const a = useAction()
  const [editing, setEditing] = useState<string | null>(null)
  const byChild = new Map(reports.map((r) => [r.child_id, r]))
  if (children.length === 0) return null
  return (
    <div className="space-y-2">
      {children.map((c) => {
        const r = byChild.get(c.id)
        const isEditing = editing === c.id
        if (r && !isEditing) {
          return (
            <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-warn-soft px-3 py-2 text-sm">
              <span className="flex-1">
                <b>{c.full_name}</b>：{KINDS.find((k) => k[0] === r.kind)?.[1]}
                {r.at_time && `（${r.at_time}）`}
                {r.reason && <span className="text-muted"> / {r.reason}</span>}
              </span>
              <button className="btn-ghost btn-sm" onClick={() => setEditing(c.id)}>変更</button>
              <button className="btn-ghost btn-sm text-danger" disabled={a.pending} onClick={() => a.run(() => withdrawAbsence(eventId, c.id))}>
                取消
              </button>
            </div>
          )
        }
        if (!isEditing) {
          return (
            <button key={c.id} className="btn-secondary w-full" onClick={() => setEditing(c.id)}>
              {c.full_name}さんの欠席・遅刻・早退を連絡
            </button>
          )
        }
        return (
          <form
            key={c.id}
            className="space-y-3 rounded-xl border border-line p-3"
            action={(fd) =>
              a.run(
                () =>
                  reportAbsence({
                    eventId,
                    childId: c.id,
                    kind: String(fd.get('kind')) as Absence['kind'],
                    atTime: String(fd.get('atTime') ?? ''),
                    reason: String(fd.get('reason') ?? ''),
                  }),
                () => setEditing(null),
              )
            }
          >
            <p className="text-sm font-bold">{c.full_name}さん</p>
            <div className="flex gap-2">
              {KINDS.map(([v, l]) => (
                <label key={v} className="flex-1 cursor-pointer">
                  <input type="radio" name="kind" value={v} defaultChecked={(r?.kind ?? 'absent') === v} className="peer sr-only" />
                  <span className="btn w-full border border-line bg-white peer-checked:border-warn peer-checked:bg-warn-soft peer-checked:text-warn">{l}</span>
                </label>
              ))}
            </div>
            <label className="block text-sm">
              時刻（遅刻・早退のとき）
              <input type="time" name="atTime" defaultValue={r?.at_time} className="input mt-1" />
            </label>
            <label className="block text-sm">
              理由・メモ（任意）
              <input name="reason" defaultValue={r?.reason} maxLength={500} className="input mt-1" placeholder="例: 学校行事のため" />
            </label>
            <div className="flex gap-2">
              <button type="button" className="btn-secondary flex-1" onClick={() => setEditing(null)}>やめる</button>
              <button className="btn-primary flex-1" disabled={a.pending}>連絡する</button>
            </div>
            <p className="text-xs text-muted">連絡はクラブの管理者に届きます（他の保護者には表示されません）。</p>
          </form>
        )
      })}
      {a.error && <p className="text-sm text-danger">{a.error}</p>}
    </div>
  )
}

/** 管理者: 支払い状況メモ */
export function PaymentCell({ rsvpId, paid, note }: { rsvpId: string; paid: boolean; note: string }) {
  const a = useAction()
  const [value, setValue] = useState(note)
  return (
    <div className="flex items-center gap-2">
      <label className="flex items-center gap-1 text-xs">
        <input type="checkbox" defaultChecked={paid} className="h-4 w-4" onChange={(e) => a.run(() => setPayment(rsvpId, e.target.checked, value))} />
        入金済み
      </label>
      <input
        className="input !min-h-8 flex-1 py-1 text-xs"
        placeholder="メモ"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => value !== note && a.run(() => setPayment(rsvpId, paid, value))}
        maxLength={200}
      />
    </div>
  )
}

/** 管理者: 子どもを選んで代理で参加登録・到着登録 */
export function AdminChildPicker({
  eventId,
  kids: children,
  mode,
}: {
  eventId: string
  kids: Child[]
  mode: 'rsvp' | 'arrival'
}) {
  const a = useAction()
  const [id, setId] = useState('')
  if (children.length === 0) return null
  return (
    <div className="flex gap-2">
      <select className="input flex-1" value={id} onChange={(e) => setId(e.target.value)}>
        <option value="">{mode === 'rsvp' ? '代理で参加登録…' : '手動で到着登録…'}</option>
        {children.map((c) => (
          <option key={c.id} value={c.id}>{c.full_name}</option>
        ))}
      </select>
      <button
        className="btn-secondary"
        disabled={!id || a.pending}
        onClick={() => a.run(() => (mode === 'rsvp' ? rsvp(eventId, [id], 0) : addArrivalManually(eventId, id)), () => setId(''))}
      >
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
