'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { addPractice, fillMonth, removePractice, restorePractice, setPracticeOff, updatePractice } from '@/app/actions/schedule'
import { Sheet } from './sheet'

export type PlannerDay = {
  date: string
  day: number
  dow: number
  past: boolean
  practice: { id: string; start: string; end: string; venue_id: string | null; venue: string; cancelled: boolean } | null
  /** 同じ日の、練習以外の予定（大会など） */
  others: string[]
}
type Venue = { id: string; name: string }
type Slot = { weekday: number; venue_id: string | null; start_time: string; end_time: string }

const DOW = ['日', '月', '火', '水', '木', '金', '土']

export function Planner({
  ym,
  label,
  prev,
  next,
  today,
  days,
  venues,
  slots,
  fillable,
}: {
  ym: string
  label: string
  prev: string
  next: string
  today: string
  days: PlannerDay[]
  venues: Venue[]
  slots: Slot[]
  /** 「まとめて入れる」で入る日数 */
  fillable: number
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const day = days.find((d) => d.date === selected) ?? null

  const run = (fn: () => Promise<unknown>, done?: (r: unknown) => void) =>
    start(async () => {
      setError(null)
      try {
        const r = await fn()
        done?.(r)
      } catch (e) {
        setError(e instanceof Error ? e.message : '保存できませんでした。もう一度お試しください')
      }
    })

  const blanks = days.length ? days[0].dow : 0
  const practices = days.filter((d) => d.practice && !d.practice.cancelled).length
  const offs = days.filter((d) => d.practice?.cancelled).length

  return (
    <div className="space-y-3">
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-2 py-2">
          <Link href={`/admin/schedule?ym=${prev}`} className="btn-ghost h-11 w-11 px-0 text-xl" aria-label="前の月">‹</Link>
          <h2 className="num text-xl">{label}</h2>
          <Link href={`/admin/schedule?ym=${next}`} className="btn-ghost h-11 w-11 px-0 text-xl" aria-label="次の月">›</Link>
        </div>
        <div className="grid grid-cols-7 border-t border-line text-center text-xs font-bold text-muted">
          {DOW.map((d, i) => (
            <div key={d} className={`py-1 ${i === 0 ? 'text-danger' : i === 6 ? 'text-brand' : ''}`}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {Array.from({ length: blanks }, (_, i) => (
            <div key={`b${i}`} className="min-h-[4.25rem] border-t border-line bg-bg/60" />
          ))}
          {days.map((d) => {
            const p = d.practice
            return (
              <button
                key={d.date}
                type="button"
                onClick={() => {
                  setError(null)
                  setSelected(d.date)
                }}
                className={`flex min-h-[4.25rem] flex-col items-center gap-0.5 border-t border-line px-0.5 pt-1 ${d.past ? 'opacity-45' : ''}`}
                aria-label={`${d.day}日(${DOW[d.dow]}) ${p ? (p.cancelled ? '休み' : `${p.start}から ${p.venue}`) : '練習なし'}`}
              >
                <span
                  className={`num flex h-6 w-6 items-center justify-center rounded-full text-sm ${
                    d.date === today ? 'bg-brand text-white' : d.dow === 0 ? 'text-danger' : d.dow === 6 ? 'text-brand' : ''
                  }`}
                >
                  {d.day}
                </span>
                {p ? (
                  p.cancelled ? (
                    <span className="rounded bg-danger-soft px-1 text-[0.7rem] font-bold text-danger">休み</span>
                  ) : (
                    <>
                      <span className="num text-[0.8rem] leading-none text-brand">{p.start}</span>
                      <span className="max-w-full truncate text-[0.65rem] leading-tight text-muted">{p.venue.slice(0, 2)}</span>
                    </>
                  )
                ) : (
                  <span className="text-[0.7rem] text-line">—</span>
                )}
                {d.others.length > 0 && <span className="h-1.5 w-1.5 rounded-full bg-ball" aria-hidden />}
              </button>
            )
          })}
          {Array.from({ length: (7 - ((blanks + days.length) % 7)) % 7 }, (_, i) => (
            <div key={`t${i}`} className="min-h-[4.25rem] border-t border-line bg-bg/60" />
          ))}
        </div>
        <p className="border-t border-line px-3 py-2 text-sm text-muted">
          練習 <b className="num text-base text-text">{practices}</b>日{offs > 0 && <>　休み <b className="num text-base text-text">{offs}</b>日</>}
          <span className="ml-2 text-xs">日付を押すと、休み・時間の変更ができます</span>
        </p>
      </div>

      {fillable > 0 ? (
        <button
          type="button"
          className="btn-primary h-13 w-full text-base"
          disabled={pending}
          onClick={() =>
            run(
              () => fillMonth(ym),
              (r) => setMessage(`${(r as { created: number }).created}日ぶんの練習を入れました。休みの日は日付を押して「休みにする」を選んでください。`),
            )
          }
        >
          {pending ? '入れています…' : `いつもの練習をまとめて入れる（${fillable}日ぶん）`}
        </button>
      ) : (
        <p className="rounded-xl bg-ok-soft px-3 py-2.5 text-sm text-ok">この月は、いつもの練習がすべて入っています。</p>
      )}
      {message && <p className="rounded-xl bg-ok-soft px-3 py-2.5 text-sm text-ok">{message}</p>}
      {error && !day && <p className="rounded-xl bg-danger-soft px-3 py-2.5 text-sm text-danger">{error}</p>}

      {day && (
        <DaySheet
          key={day.date + (day.practice?.id ?? '') + (day.practice?.cancelled ? 'x' : '')}
          day={day}
          venues={venues}
          slot={slots.find((s) => s.weekday === day.dow)}
          pending={pending}
          error={error}
          run={(fn) => run(fn, () => setSelected(null))}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}

function DaySheet({
  day,
  venues,
  slot,
  pending,
  error,
  run,
  onClose,
}: {
  day: PlannerDay
  venues: Venue[]
  slot?: Slot
  pending: boolean
  error: string | null
  run: (fn: () => Promise<unknown>) => void
  onClose: () => void
}) {
  const p = day.practice
  const [start, setStart] = useState(p?.start ?? slot?.start_time ?? '18:30')
  const [end, setEnd] = useState(p?.end ?? slot?.end_time ?? '20:30')
  const [venueId, setVenueId] = useState(p?.venue_id ?? slot?.venue_id ?? venues[0]?.id ?? '')
  const [notify, setNotify] = useState(!day.past)
  const [editing, setEditing] = useState(false)
  const title = `${Number(day.date.slice(5, 7))}月${day.day}日(${DOW[day.dow]})`

  const fields = (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="label">開始</span>
          <input type="time" className="input" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="block">
          <span className="label">終了</span>
          <input type="time" className="input" value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
      </div>
      <label className="block">
        <span className="label">会場</span>
        <select className="input" value={venueId} onChange={(e) => setVenueId(e.target.value)}>
          {venues.map((v) => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
        </select>
      </label>
    </div>
  )
  const notifyBox = (text: string) => (
    <label className="flex min-h-11 items-center gap-3 text-[0.95rem]">
      <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="h-5 w-5" />
      {text}
    </label>
  )

  return (
    <Sheet title={title} onClose={onClose}>
      <div className="space-y-4">
        {day.others.length > 0 && <p className="rounded-xl bg-ball-soft px-3 py-2 text-sm text-ball-ink">この日の予定: {day.others.join('、')}</p>}

        {!p && (
          <>
            <p className="text-muted">この日は練習が入っていません。</p>
            {fields}
            {notifyBox('保護者に知らせる')}
            <button
              type="button"
              className="btn-primary h-13 w-full text-base"
              disabled={pending}
              onClick={() => run(() => addPractice({ date: day.date, start, end, venueId: venueId || null, notify }))}
            >
              練習を入れる
            </button>
          </>
        )}

        {p && !p.cancelled && !editing && (
          <>
            <p>
              <span className="num text-2xl">{p.start} – {p.end}</span>
              <span className="ml-2 font-semibold">{p.venue}</span>
            </p>
            {notifyBox('保護者と子どもアカウントに知らせる')}
            <button type="button" className="btn-danger h-13 w-full text-base" disabled={pending} onClick={() => run(() => setPracticeOff(p.id, notify))}>
              休みにする
            </button>
            <button type="button" className="btn-secondary w-full" onClick={() => setEditing(true)}>
              時間・会場を変える
            </button>
            <div className="flex items-center justify-between text-sm">
              <Link href={`/events/${p.id}`} className="font-semibold text-brand underline">予定の画面を開く</Link>
              <button
                type="button"
                className="text-muted underline"
                disabled={pending}
                onClick={() => confirm('この日の練習の予定を削除します。到着・欠席の記録も消えます。よろしいですか？') && run(() => removePractice(p.id))}
              >
                予定ごと削除
              </button>
            </div>
          </>
        )}

        {p && !p.cancelled && editing && (
          <>
            {fields}
            {notifyBox('変更を保護者と子どもアカウントに知らせる')}
            <button
              type="button"
              className="btn-primary h-13 w-full text-base"
              disabled={pending}
              onClick={() => run(() => updatePractice({ eventId: p.id, start, end, venueId: venueId || null, notify }))}
            >
              変更を保存
            </button>
            <button type="button" className="btn-ghost w-full" onClick={() => setEditing(false)}>
              もどる
            </button>
          </>
        )}

        {p && p.cancelled && (
          <>
            <p className="rounded-xl bg-danger-soft px-3 py-2.5 font-bold text-danger">この日は休みになっています</p>
            {notifyBox('練習ありに戻したことを知らせる')}
            <button type="button" className="btn-primary h-13 w-full text-base" disabled={pending} onClick={() => run(() => restorePractice(p.id, notify))}>
              休みを取り消す（練習あり）
            </button>
            <button
              type="button"
              className="w-full text-center text-sm text-muted underline"
              disabled={pending}
              onClick={() => confirm('この日の予定を削除します。よろしいですか？') && run(() => removePractice(p.id))}
            >
              予定ごと削除
            </button>
          </>
        )}
        {error && <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      </div>
    </Sheet>
  )
}
