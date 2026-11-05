'use client'

import { useState, useTransition } from 'react'
import { closePoll, convertScheduleToEvent, remindPoll, vote } from '@/app/actions/polls'
import { IconPoll } from './icons'

type Option = { id: string; label: string; yes: number; maybe: number; no: number; voters: { name: string; value: string }[] }
export type PollData = {
  id: string
  question: string
  kind: 'normal' | 'schedule'
  multiple: boolean
  anonymous: boolean
  closesLabel: string | null
  closed: boolean
  convertedEventId: string | null
  voterCount: number
  targetCount: number
  hasVoted: boolean
  myVotes: { option_id: string; value: string }[]
  options: Option[]
}

const MARK = { yes: '○', maybe: '△', no: '×' } as const

export function Poll({ poll, isAdmin, canVote = true }: { poll: PollData; isAdmin: boolean; canVote?: boolean }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [editing, setEditing] = useState(!poll.hasVoted)
  const [picked, setPicked] = useState<Record<string, 'yes' | 'maybe' | 'no'>>(
    Object.fromEntries(poll.myVotes.map((v) => [v.option_id, v.value as 'yes' | 'maybe' | 'no'])),
  )
  const run = (fn: () => Promise<unknown>, after?: (r: unknown) => void) =>
    start(async () => {
      setError(null)
      try {
        const r = await fn()
        after?.(r)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'エラーが発生しました')
      }
    })

  const total = Math.max(1, poll.voterCount)
  const showForm = canVote && !poll.closed && editing && !(poll.anonymous && poll.hasVoted)
  const best = poll.kind === 'schedule' ? Math.max(...poll.options.map((o) => o.yes * 2 + o.maybe)) : 0

  return (
    <div className="space-y-3 rounded-2xl border border-brand/30 bg-brand-soft/40 p-3">
      <div className="flex items-start gap-2">
        <IconPoll className="h-5 w-5 shrink-0 text-brand" />
        <div className="min-w-0 flex-1">
          <p className="font-bold">{poll.question}</p>
          <p className="text-xs text-muted">
            {poll.kind === 'schedule' ? '日程調整' : poll.multiple ? '複数選択' : '1つ選択'}
            {poll.anonymous && '・匿名'}・回答 {poll.voterCount}/{poll.targetCount}人
            {poll.closesLabel && `・締切 ${poll.closesLabel}`}
            {poll.closed && '・締め切り'}
          </p>
        </div>
      </div>

      {showForm ? (
        <div className="space-y-2">
          {poll.options.map((o) =>
            poll.kind === 'schedule' ? (
              <div key={o.id} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2">
                <span className="flex-1 text-sm font-semibold">{o.label}</span>
                {(['yes', 'maybe', 'no'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setPicked((p) => ({ ...p, [o.id]: v }))}
                    className={`h-10 w-10 rounded-full border text-lg font-bold ${picked[o.id] === v ? 'border-brand bg-brand text-white' : 'border-line bg-white text-muted'}`}
                  >
                    {MARK[v]}
                  </button>
                ))}
              </div>
            ) : (
              <label key={o.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl bg-white px-3">
                <input
                  type={poll.multiple ? 'checkbox' : 'radio'}
                  name={`poll-${poll.id}`}
                  className="h-5 w-5"
                  checked={!!picked[o.id]}
                  onChange={(e) =>
                    setPicked((p) => {
                      if (!poll.multiple) return e.target.checked ? { [o.id]: 'yes' } : {}
                      const next = { ...p }
                      if (e.target.checked) next[o.id] = 'yes'
                      else delete next[o.id]
                      return next
                    })
                  }
                />
                <span className="text-sm">{o.label}</span>
              </label>
            ),
          )}
          <button
            type="button"
            className="btn-primary w-full"
            disabled={pending}
            onClick={() =>
              run(
                () => vote(poll.id, Object.entries(picked).map(([optionId, value]) => ({ optionId, value }))),
                () => setEditing(false),
              )
            }
          >
            {poll.hasVoted ? '回答を変更する' : '回答する'}
          </button>
          {poll.anonymous && <p className="text-xs text-muted">匿名投票は、あとから回答を変更できません。</p>}
        </div>
      ) : (
        <ul className="space-y-1.5">
          {poll.options.map((o) => {
            const score = o.yes * 2 + o.maybe
            const mine = poll.myVotes.find((v) => v.option_id === o.id)
            return (
              <li key={o.id} className="rounded-xl bg-white px-3 py-2">
                <div className="flex items-center gap-2 text-sm">
                  <span className="flex-1 font-semibold">
                    {o.label}
                    {mine && <span className="ml-1 text-xs text-brand">（あなた: {poll.kind === 'schedule' ? MARK[mine.value as 'yes'] : '✓'}）</span>}
                  </span>
                  {poll.kind === 'schedule' ? (
                    <span className={`text-xs ${score === best && best > 0 ? 'font-bold text-ok' : 'text-muted'}`}>
                      ○{o.yes} △{o.maybe} ×{o.no}
                    </span>
                  ) : (
                    <span className="text-xs text-muted">{o.yes}票</span>
                  )}
                </div>
                {poll.kind === 'normal' && (
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-bg">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${(o.yes / total) * 100}%` }} />
                  </div>
                )}
                {!poll.anonymous && o.voters.length > 0 && (
                  <p className="mt-1 text-xs text-muted">
                    {o.voters.map((v) => (poll.kind === 'schedule' ? `${v.name}${MARK[v.value as 'yes']}` : v.name)).join('、')}
                  </p>
                )}
                {isAdmin && poll.kind === 'schedule' && !poll.convertedEventId && (
                  <button type="button" className="mt-1 text-xs font-semibold text-brand underline" disabled={pending} onClick={() => run(() => convertScheduleToEvent(poll.id, o.id))}>
                    この日時で予定を作る
                  </button>
                )}
              </li>
            )
          })}
          {canVote && !poll.closed && !poll.anonymous && (
            <button type="button" className="btn-ghost btn-sm" onClick={() => setEditing(true)}>回答を変更</button>
          )}
          {canVote && !poll.hasVoted && poll.closed && <p className="text-xs text-muted">締め切られました。</p>}
        </ul>
      )}

      {isAdmin && (
        <div className="flex flex-wrap gap-2 border-t border-brand/20 pt-2">
          {!poll.closed && (
            <>
              <button type="button" className="btn-secondary btn-sm" disabled={pending} onClick={() => run(() => remindPoll(poll.id), (r) => setInfo(`${(r as { sent: number }).sent}人に催促しました`))}>
                未回答者に催促
              </button>
              <button type="button" className="btn-secondary btn-sm" disabled={pending} onClick={() => confirm('締め切りますか？') && run(() => closePoll(poll.id))}>
                締め切る
              </button>
            </>
          )}
        </div>
      )}
      {info && <p className="text-xs text-ok">{info}</p>}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  )
}

/** 投票を作成するフォーム部品（掲示板の投稿フォームやチャットで使う） */
export function PollFields({ prefix = 'poll_' }: { prefix?: string }) {
  const [kind, setKind] = useState<'normal' | 'schedule'>('normal')
  const [dates, setDates] = useState<string[]>(['', ''])
  return (
    <div className="space-y-3">
      <label className="block">
        <span className="label">質問</span>
        <input name={`${prefix}question`} className="input" maxLength={200} placeholder="例: 忘年会の参加希望" />
      </label>
      <div className="flex gap-2">
        {(
          [
            ['normal', '選択式'],
            ['schedule', '日程調整'],
          ] as const
        ).map(([v, l]) => (
          <label key={v} className="flex-1 cursor-pointer">
            <input type="radio" name={`${prefix}kind`} value={v} checked={kind === v} onChange={() => setKind(v)} className="peer sr-only" />
            <span className="btn w-full border border-line bg-white peer-checked:border-brand peer-checked:bg-brand-soft peer-checked:text-brand">{l}</span>
          </label>
        ))}
      </div>
      {kind === 'normal' ? (
        <>
          <label className="block">
            <span className="label">選択肢（1行に1つ）</span>
            <textarea name={`${prefix}options`} rows={4} className="input" placeholder={'参加する\n参加しない\n未定'} />
          </label>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" name={`${prefix}multiple`} className="h-5 w-5" /> 複数選択
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name={`${prefix}anonymous`} className="h-5 w-5" /> 匿名
            </label>
          </div>
        </>
      ) : (
        <div className="space-y-2">
          <span className="label">候補日時</span>
          {dates.map((d, i) => (
            <input
              key={i}
              type="datetime-local"
              name={`${prefix}dates`}
              className="input"
              value={d}
              onChange={(e) => setDates((cur) => cur.map((x, j) => (j === i ? e.target.value : x)))}
            />
          ))}
          <button type="button" className="btn-ghost btn-sm" onClick={() => setDates((d) => [...d, ''])}>＋ 候補を追加</button>
          <p className="hint">各自が ○ △ × で回答します。決まったら「この日時で予定を作る」で予定に変換できます。</p>
        </div>
      )}
      <label className="block">
        <span className="label">回答の締切（任意）</span>
        <input type="datetime-local" name={`${prefix}closes_at`} className="input" />
      </label>
    </div>
  )
}
