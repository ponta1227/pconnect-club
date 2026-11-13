'use client'

import { useState, useTransition } from 'react'
import { answerRsvp, clearRsvp } from '@/app/actions/events'

export type RsvpKid = { id: string; full_name: string; status: 'going' | 'waitlist' | 'declined' | null; companions: number }

/**
 * 大会・イベントの回答。子どもごとに「参加する／見送る」をその場で押せる。
 * ホームのやること・予定の詳細・掲示板の告知で同じ部品を使う。
 */
export function RsvpRows({
  eventId,
  kids,
  open,
  allowCompanions,
  isAdmin = false,
}: {
  eventId: string
  kids: RsvpKid[]
  /** 部内締め前か */
  open: boolean
  allowCompanions: boolean
  isAdmin?: boolean
}) {
  const [pending, start] = useTransition()
  const [busy, setBusy] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const editable = open || isAdmin

  if (kids.length === 0) return <p className="text-sm text-muted">回答できるお子さんが登録されていません。</p>

  const run = (kidId: string, fn: () => Promise<{ status?: string | null } | void>) => {
    setBusy(kidId)
    setError(null)
    setNote(null)
    start(async () => {
      try {
        const r = await fn()
        if (r && r.status === 'waitlist') setNote('定員に達しているため、キャンセル待ちで登録しました。空きが出たらお知らせします。')
        setEditing(null)
      } catch (e) {
        setError(e instanceof Error ? e.message : '回答を保存できませんでした。もう一度お試しください')
      } finally {
        setBusy(null)
      }
    })
  }

  return (
    <div className="space-y-2">
      <ul className="divide-y divide-line">
        {kids.map((k) => {
          const showButtons = editable && (k.status === null || editing === k.id)
          const going = k.status === 'going' || k.status === 'waitlist'
          return (
            <li key={k.id} className="py-2.5 first:pt-0 last:pb-0">
              <div className="flex min-h-11 items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-semibold">{k.full_name}</span>
                {showButtons ? (
                  <>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(k.id, () => answerRsvp(eventId, k.id, 'going', k.companions))}
                      className={`btn px-4 ${going ? 'bg-brand text-white' : 'btn-primary'}`}
                      aria-label={`${k.full_name} 参加する`}
                    >
                      {busy === k.id ? '…' : '参加する'}
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(k.id, () => answerRsvp(eventId, k.id, 'declined'))}
                      className="btn-secondary px-4"
                      aria-label={`${k.full_name} 見送る`}
                    >
                      見送る
                    </button>
                  </>
                ) : (
                  <>
                    {k.status === 'going' && <span className="chip-ok">✓ 参加</span>}
                    {k.status === 'waitlist' && <span className="chip-wait">キャンセル待ち</span>}
                    {k.status === 'declined' && <span className="chip-muted">見送り</span>}
                    {k.status === null && <span className="text-sm text-muted">締め切りました</span>}
                    {editable && k.status !== null && (
                      <button type="button" className="btn-ghost btn-sm" onClick={() => setEditing(k.id)} aria-label={`${k.full_name} の回答を変更`}>
                        変更
                      </button>
                    )}
                  </>
                )}
              </div>
              {showButtons && k.status !== null && (
                <div className="mt-1 flex justify-end gap-3 text-sm">
                  <button type="button" className="text-muted underline" disabled={pending} onClick={() => run(k.id, () => clearRsvp(eventId, k.id))}>
                    未回答に戻す
                  </button>
                  <button type="button" className="text-muted underline" onClick={() => setEditing(null)}>
                    やめる
                  </button>
                </div>
              )}
              {allowCompanions && going && !showButtons && (
                <div className="mt-1 flex items-center justify-end gap-2 text-sm text-muted">
                  <span>同行する人（保護者など）</span>
                  <Stepper
                    value={k.companions}
                    disabled={!editable || pending}
                    onChange={(n) => run(k.id, () => answerRsvp(eventId, k.id, 'going', n))}
                  />
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {note && <p className="rounded-xl bg-ball-soft px-3 py-2 text-sm text-ball-ink">{note}</p>}
      {error && <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
    </div>
  )
}

function Stepper({ value, onChange, disabled }: { value: number; onChange: (n: number) => void; disabled?: boolean }) {
  return (
    <span className="inline-flex items-center rounded-full border border-line bg-white">
      <button type="button" className="h-9 w-9 text-lg font-bold text-brand disabled:opacity-30" disabled={disabled || value <= 0} onClick={() => onChange(value - 1)} aria-label="同行者を減らす">
        −
      </button>
      <span className="num w-9 text-center text-base font-bold text-text">{value}人</span>
      <button type="button" className="h-9 w-9 text-lg font-bold text-brand disabled:opacity-30" disabled={disabled || value >= 10} onClick={() => onChange(value + 1)} aria-label="同行者を増やす">
        ＋
      </button>
    </span>
  )
}
