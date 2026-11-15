'use client'

import { useState, useTransition } from 'react'
import { adjustCredits, declareInitialCredits, setWeekdays } from '@/app/actions/attendance'
import { registerNewChild } from '@/app/actions/enroll'
import { GRADE_OPTIONS } from '@/lib/grades'

const DOW = ['日', '月', '火', '水', '木', '金', '土']
const ORDER = [1, 2, 3, 4, 5, 6, 0]

export type Slot = { weekday: number; label: string }
export type SetupKid = { id: string; full_name: string; weekdays: number[]; declared: boolean; status: 'pending' | 'approved' }

/** 参加曜日を選ぶ（保存すると、その曜日の練習は自動で参加になる） */
export function WeekdayPicker({ kid, slots, locked = false }: { kid: SetupKid; slots: Slot[]; locked?: boolean }) {
  const [days, setDays] = useState<number[]>(kid.weekdays)
  const [saved, setSaved] = useState(kid.weekdays.length > 0)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const available = ORDER.filter((d) => slots.some((s) => s.weekday === d))

  if (saved || locked) {
    return (
      <div className="flex items-center gap-2">
        <span className="flex-1 text-[0.95rem]">
          参加曜日: <b>{days.length ? days.map((d) => DOW[d]).join('・') : '未設定'}</b>
          {days.length === 1 && <span className="ml-1 text-xs text-muted">（週1日）</span>}
          {days.length >= 2 && <span className="ml-1 text-xs text-muted">（週2日以上）</span>}
        </span>
        {!locked && saved && <span className="chip-ok">保存済み</span>}
      </div>
    )
  }
  return (
    <div className="space-y-2">
      <p className="text-sm font-bold">参加する曜日を選んでください</p>
      <div className="flex flex-wrap gap-2">
        {available.map((d) => {
          const on = days.includes(d)
          const slot = slots.find((s) => s.weekday === d)
          return (
            <button
              key={d}
              type="button"
              aria-pressed={on}
              onClick={() => setDays(on ? days.filter((x) => x !== d) : [...days, d])}
              className={`flex min-h-14 min-w-[4.5rem] flex-col items-center justify-center rounded-xl border-2 px-2 ${on ? 'border-brand bg-brand text-white' : 'border-line bg-white'}`}
            >
              <span className="text-lg font-bold">{DOW[d]}</span>
              {slot && <span className={`text-[0.65rem] ${on ? 'opacity-90' : 'text-muted'}`}>{slot.label}</span>}
            </button>
          )
        })}
      </div>
      <p className="hint">選んだ曜日の練習は、連絡しなくても参加として扱われます。週2日以上を選ぶと、ほかの曜日にも自由に参加できます。</p>
      {error && <p className="text-sm text-danger">{error}</p>}
      <button
        type="button"
        className="btn-primary w-full"
        disabled={pending || days.length === 0}
        onClick={() =>
          start(async () => {
            setError(null)
            try {
              await setWeekdays(kid.id, days)
              setSaved(true)
            } catch (e) {
              setError(e instanceof Error ? e.message : '保存できませんでした')
            }
          })
        }
      >
        {pending ? '保存中…' : 'この曜日で決める'}
      </button>
    </div>
  )
}

/** BANDから移行する人: いまたまっている振替の回数を申告（1回だけ） */
export function InitialCredits({ kid }: { kid: SetupKid }) {
  const [n, setN] = useState(0)
  const [done, setDone] = useState(kid.declared)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  if (done) return <p className="text-sm text-muted">いまの振替の回数は申告済みです（違っていたら管理者に連絡してください）。</p>
  return (
    <div className="space-y-2 border-t border-line pt-3">
      <p className="text-sm font-bold">いま、振替がたまっている回数</p>
      <p className="hint">お休みして、まだ振替をしていない日の数です。なければ0のまま「申告する」を押してください。</p>
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center rounded-full border border-line bg-white">
          <button type="button" className="h-11 w-11 text-xl font-bold text-brand disabled:opacity-30" disabled={n <= 0} onClick={() => setN(n - 1)} aria-label="減らす">−</button>
          <span className="num w-12 text-center text-xl">{n}</span>
          <button type="button" className="h-11 w-11 text-xl font-bold text-brand disabled:opacity-30" disabled={n >= 60} onClick={() => setN(n + 1)} aria-label="増やす">＋</button>
        </span>
        <span>回</span>
        <button
          type="button"
          className="btn-secondary ml-auto"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null)
              try {
                await declareInitialCredits(kid.id, n)
                setDone(true)
              } catch (e) {
                setError(e instanceof Error ? e.message : '保存できませんでした')
              }
            })
          }
        >
          申告する
        </button>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  )
}

/** 新規入会: お子さんの名前を入力して登録 */
export function NewChildForm() {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [key, setKey] = useState(0)
  return (
    <form
      key={key}
      className="card space-y-3 p-4"
      action={(fd) =>
        start(async () => {
          setError(null)
          const r = await registerNewChild(fd)
          if (r.error) setError(r.error)
          else setKey(key + 1)
        })
      }
    >
      <p className="font-bold">お子さんを登録</p>
      <label className="block">
        <span className="label">名前（フルネーム）</span>
        <input name="full_name" className="input" required maxLength={40} placeholder="例: 山田 太郎" />
      </label>
      <label className="block">
        <span className="label">よみがな</span>
        <input name="kana" className="input" required maxLength={40} placeholder="例: やまだ たろう" />
      </label>
      <label className="block">
        <span className="label">学年</span>
        <select name="grade" className="input" defaultValue="3">
          {GRADE_OPTIONS.map((g) => (
            <option key={g.value} value={g.value}>{g.label}</option>
          ))}
        </select>
      </label>
      {error && <p className="text-sm text-danger">{error}</p>}
      <button className="btn-primary w-full" disabled={pending}>{pending ? '登録中…' : 'このお子さんを登録'}</button>
      <p className="hint">兄弟・姉妹がいる場合は、1人ずつ登録してください。</p>
    </form>
  )
}

/** 管理者: 参加曜日の変更と、振替の回数の手直し */
export function MakeupAdminRow({ kid, balance, slots }: { kid: { id: string; full_name: string; weekdays: number[] }; balance: number; slots: Slot[] }) {
  const [days, setDays] = useState<number[]>(kid.weekdays)
  const [delta, setDelta] = useState(0)
  const [note, setNote] = useState('')
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const available = ORDER.filter((d) => slots.some((s) => s.weekday === d))
  const changed = days.slice().sort().join() !== kid.weekdays.slice().sort().join()
  const run = (fn: () => Promise<unknown>, ok: string) =>
    start(async () => {
      setMsg(null)
      try {
        await fn()
        setMsg(ok)
      } catch (e) {
        setMsg(e instanceof Error ? e.message : '保存できませんでした')
      }
    })
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {available.map((d) => {
          const on = days.includes(d)
          return (
            <button
              key={d}
              type="button"
              aria-pressed={on}
              aria-label={`${kid.full_name} ${DOW[d]}曜日`}
              onClick={() => setDays(on ? days.filter((x) => x !== d) : [...days, d])}
              className={`h-10 w-10 rounded-full border text-sm font-bold ${on ? 'border-brand bg-brand text-white' : 'border-line bg-white'}`}
            >
              {DOW[d]}
            </button>
          )
        })}
        {changed && (
          <button type="button" className="btn-primary btn-sm" disabled={pending} onClick={() => run(() => setWeekdays(kid.id, days), '参加曜日を保存しました')}>
            曜日を保存
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span>
          振替の残り <b className="num text-lg">{balance}</b>回
        </span>
        <span className="inline-flex items-center rounded-full border border-line bg-white">
          <button type="button" className="h-9 w-9 font-bold text-brand" onClick={() => setDelta(delta - 1)} aria-label={`${kid.full_name} 振替を減らす`}>−</button>
          <span className="num w-10 text-center">{delta > 0 ? `+${delta}` : delta}</span>
          <button type="button" className="h-9 w-9 font-bold text-brand" onClick={() => setDelta(delta + 1)} aria-label={`${kid.full_name} 振替を増やす`}>＋</button>
        </span>
        {delta !== 0 && (
          <>
            <input value={note} onChange={(e) => setNote(e.target.value)} className="input h-9 w-40 py-1 text-sm" placeholder="理由（任意）" aria-label="理由" />
            <button
              type="button"
              className="btn-secondary btn-sm"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  await adjustCredits(kid.id, delta, note)
                  setDelta(0)
                  setNote('')
                }, '振替の回数を直しました')
              }
            >
              反映
            </button>
          </>
        )}
      </div>
      {msg && <p className="text-xs text-muted">{msg}</p>}
    </div>
  )
}
