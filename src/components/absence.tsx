'use client'

import { useState, useTransition } from 'react'
import { reportAbsence, withdrawAbsence } from '@/app/actions/events'
import { joinExtra, leaveExtra } from '@/app/actions/attendance'
import { Sheet } from './sheet'

export type AbsenceKid = {
  id: string
  full_name: string
  report: { kind: 'absent' | 'late' | 'early'; at_time: string; reason: string } | null
  /** 到着済みなら時刻（表示用） */
  arrived: string | null
  /** 参加曜日の練習か（false なら「振替で参加」などのボタンを出す） */
  regular: boolean
  plan: 'none' | 'weekly1' | 'weekly2plus'
  /** 参加曜日以外で参加予定 */
  extra: { uses_credit: boolean } | null
  /** 振替の残り */
  balance: number
}

const KINDS = [
  ['absent', '欠席'],
  ['late', '遅刻'],
  ['early', '早退'],
] as const
const LABEL = { absent: '欠席', late: '遅刻', early: '早退' } as const

/**
 * 練習の、子どもごとの参加の状況とボタン。
 * - 参加曜日 → 何もしなければ参加。休む・遅れるときだけ「欠席・遅刻を連絡」
 * - 参加曜日以外 → 「振替で参加する」（週1日の子）／「参加する」（週2日以上の子）
 * tone="band" はホーム上部の青い帯の中で使う配色。
 */
export function AbsenceRows({ eventId, eventLabel, kids, tone = 'plain', ended = false }: { eventId: string; eventLabel: string; kids: AbsenceKid[]; tone?: 'plain' | 'band'; ended?: boolean }) {
  const [target, setTarget] = useState<AbsenceKid | null>(null)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const band = tone === 'band'
  if (kids.length === 0) return null

  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      setError(null)
      try {
        await fn()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'うまくいきませんでした。もう一度お試しください')
      }
    })

  const chip = (kind: 'ok' | 'wait' | 'muted', text: React.ReactNode) =>
    band ? (
      <span className={`rounded-full px-2.5 py-1 text-sm font-bold ${kind === 'ok' ? 'bg-white text-ok' : kind === 'wait' ? 'bg-ball text-text' : 'bg-white/15 text-white'}`}>{text}</span>
    ) : (
      <span className={kind === 'ok' ? 'chip-ok' : kind === 'wait' ? 'chip-wait' : 'chip-muted'}>{text}</span>
    )
  const button = (label: string, onClick: () => void, opts: { aria: string; strong?: boolean; disabled?: boolean }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={pending || opts.disabled}
      aria-label={opts.aria}
      className={
        band
          ? `btn btn-sm ${opts.strong ? 'bg-white text-brand' : 'border border-white/50 bg-white/10 text-white'}`
          : opts.strong
            ? 'btn-primary btn-sm'
            : 'btn-secondary btn-sm'
      }
    >
      {label}
    </button>
  )

  return (
    <>
      <ul className={band ? 'space-y-2' : 'divide-y divide-line'}>
        {kids.map((k) => {
          const going = k.regular || !!k.extra
          return (
            <li key={k.id} className={band ? '' : 'py-2.5 first:pt-0 last:pb-0'}>
              <div className="flex min-h-11 flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-semibold">{k.full_name}</span>
                {k.arrived ? (
                  chip('ok', <>✓ <span className="num">{k.arrived}</span> 到着</>)
                ) : k.regular ? (
                  <>
                    {k.report
                      ? chip('wait', <>{LABEL[k.report.kind]}{k.report.at_time && <span className="num ml-1">{k.report.at_time}</span>} 連絡済み</>)
                      : chip('muted', '参加予定')}
                    {!ended && button(k.report ? '変更' : '欠席・遅刻を連絡', () => setTarget(k), { aria: `${k.full_name} ${k.report ? '連絡を変更' : '欠席・遅刻を連絡'}` })}
                  </>
                ) : k.extra ? (
                  <>
                    {chip('ok', k.extra.uses_credit ? '振替で参加' : '参加する')}
                    {!ended && button('取り消す', () => run(() => leaveExtra(eventId, k.id)), { aria: `${k.full_name} の参加を取り消す` })}
                  </>
                ) : k.plan === 'none' ? (
                  <a href="/children" className={band ? 'text-sm underline' : 'text-sm text-brand underline'}>参加曜日を設定する</a>
                ) : ended ? (
                  chip('muted', '参加曜日ではありません')
                ) : k.plan === 'weekly1' ? (
                  button(k.balance > 0 ? '振替で参加する' : '振替の残りがありません', () => run(() => joinExtra(eventId, k.id)), {
                    aria: `${k.full_name} 振替でこの練習に参加する`,
                    strong: k.balance > 0,
                    disabled: k.balance < 1,
                  })
                ) : (
                  button('参加する', () => run(() => joinExtra(eventId, k.id)), { aria: `${k.full_name} この練習に参加する`, strong: true })
                )}
              </div>
              {k.plan !== 'none' && (k.plan === 'weekly1' || k.balance !== 0) && (
                <p className={`text-right text-xs ${band ? 'opacity-80' : 'text-muted'}`}>
                  振替の残り <span className="num text-sm">{k.balance}</span>回
                  {!going && k.plan === 'weekly1' && k.balance > 0 && '（使うと1回へります）'}
                </p>
              )}
            </li>
          )
        })}
      </ul>
      {error && <p className={`mt-2 rounded-xl px-3 py-2 text-sm ${band ? 'bg-white text-danger' : 'bg-danger-soft text-danger'}`}>{error}</p>}
      {target && <AbsenceSheet eventId={eventId} eventLabel={eventLabel} kid={target} onClose={() => setTarget(null)} />}
    </>
  )
}

function AbsenceSheet({ eventId, eventLabel, kid, onClose }: { eventId: string; eventLabel: string; kid: AbsenceKid; onClose: () => void }) {
  const [kind, setKind] = useState<'absent' | 'late' | 'early'>(kid.report?.kind ?? 'absent')
  const [atTime, setAtTime] = useState(kid.report?.at_time ?? '')
  const [reason, setReason] = useState(kid.report?.reason ?? '')
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const send = () =>
    start(async () => {
      setError(null)
      try {
        await reportAbsence({ eventId, childId: kid.id, kind, atTime: kind === 'absent' ? '' : atTime, reason })
        onClose()
      } catch (e) {
        setError(e instanceof Error ? e.message : '連絡を送れませんでした。もう一度お試しください')
      }
    })

  return (
    <Sheet title={`${kid.full_name}さんの連絡`} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-muted">{eventLabel}</p>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="連絡の種類">
          {KINDS.map(([v, l]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={kind === v}
              onClick={() => setKind(v)}
              className={`h-14 rounded-2xl border-2 text-lg font-bold ${kind === v ? 'border-brand bg-brand text-white' : 'border-line bg-white text-text'}`}
            >
              {l}
            </button>
          ))}
        </div>
        {kind !== 'absent' && (
          <label className="block">
            <span className="label">{kind === 'late' ? '到着する時刻（わかれば）' : '帰る時刻（わかれば）'}</span>
            <input type="time" value={atTime} onChange={(e) => setAtTime(e.target.value)} className="input" />
          </label>
        )}
        <label className="block">
          <span className="label">ひとこと（書かなくても送れます）</span>
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} className="input" placeholder="例: 学校行事のため" />
        </label>
        {error && <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
        <button type="button" className="btn-primary h-14 w-full text-lg" disabled={pending} onClick={send}>
          {pending ? '送信中…' : `${LABEL[kind]}を連絡する`}
        </button>
        {kid.report && (
          <button
            type="button"
            className="btn-ghost w-full text-danger"
            disabled={pending}
            onClick={() =>
              start(async () => {
                await withdrawAbsence(eventId, kid.id)
                onClose()
              })
            }
          >
            連絡を取り消す（出席します）
          </button>
        )}
        <p className="text-center text-xs text-muted">
          連絡はコーチ（管理者）だけに届きます。{kind === 'absent' && '欠席すると振替が1回たまります。'}
        </p>
      </div>
    </Sheet>
  )
}
