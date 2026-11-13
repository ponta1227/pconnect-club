'use client'

import { useState, useTransition } from 'react'
import { reportAbsence, withdrawAbsence } from '@/app/actions/events'
import { Sheet } from './sheet'

export type AbsenceKid = {
  id: string
  full_name: string
  report: { kind: 'absent' | 'late' | 'early'; at_time: string; reason: string } | null
  /** 到着済みなら時刻（表示用） */
  arrived: string | null
}

const KINDS = [
  ['absent', '欠席'],
  ['late', '遅刻'],
  ['early', '早退'],
] as const
const LABEL = { absent: '欠席', late: '遅刻', early: '早退' } as const

/**
 * 練習の欠席・遅刻・早退の連絡。子どもごとの状況と、連絡ボタン（下からシートが出る）。
 * tone="band" はホーム上部の青い帯の中で使う配色。
 */
export function AbsenceRows({ eventId, eventLabel, kids, tone = 'plain' }: { eventId: string; eventLabel: string; kids: AbsenceKid[]; tone?: 'plain' | 'band' }) {
  const [target, setTarget] = useState<AbsenceKid | null>(null)
  const band = tone === 'band'
  if (kids.length === 0) return null
  return (
    <>
      <ul className={band ? 'space-y-1.5' : 'divide-y divide-line'}>
        {kids.map((k) => (
          <li key={k.id} className={`flex min-h-11 items-center gap-2 ${band ? '' : 'py-2 first:pt-0 last:pb-0'}`}>
            <span className="min-w-0 flex-1 truncate font-semibold">{k.full_name}</span>
            {k.arrived ? (
              <span className={band ? 'rounded-full bg-white px-2.5 py-1 text-sm font-bold text-ok' : 'chip-ok'}>✓ <span className="num">{k.arrived}</span> 到着</span>
            ) : (
              <>
                {k.report && (
                  <span className={band ? 'rounded-full bg-ball px-2.5 py-1 text-sm font-bold text-text' : 'chip-wait'}>
                    {LABEL[k.report.kind]}
                    {k.report.at_time && <span className="num ml-1">{k.report.at_time}</span>} 連絡済み
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setTarget(k)}
                  className={
                    band
                      ? 'btn btn-sm border border-white/50 bg-white/10 text-white'
                      : k.report
                        ? 'btn-ghost btn-sm'
                        : 'btn-secondary btn-sm'
                  }
                  aria-label={`${k.full_name} ${k.report ? '連絡を変更' : '欠席・遅刻を連絡'}`}
                >
                  {k.report ? '変更' : '欠席・遅刻を連絡'}
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
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
        <p className="text-center text-xs text-muted">連絡はコーチ（管理者）だけに届きます。</p>
      </div>
    </Sheet>
  )
}
