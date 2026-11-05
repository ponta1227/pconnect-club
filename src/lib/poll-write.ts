import 'server-only'
import { z } from 'zod'
import type { TransactionSql } from 'postgres'
import type { CurrentUser } from './auth'
import { fromDatetimeLocal, jstDateStr, jstTimeStr } from './time'

export const PollInput = z.object({
  question: z.string().trim().min(1, '質問を入力してください').max(200),
  kind: z.enum(['normal', 'schedule']),
  multiple: z.boolean(),
  anonymous: z.boolean(),
  closes_at: z.string().optional().default(''),
  options: z.array(z.string().trim().min(1).max(100)).min(2, '選択肢を2つ以上入力してください').max(20),
})
export type PollInputT = z.input<typeof PollInput>

/** フォームから投票の入力を読む（poll_ で始まる項目） */
export function readPollForm(fd: FormData): PollInputT | null {
  const question = String(fd.get('poll_question') ?? '').trim()
  if (!question) return null
  const kind = fd.get('poll_kind') === 'schedule' ? 'schedule' : 'normal'
  const options = (kind === 'schedule' ? fd.getAll('poll_dates').map(String) : String(fd.get('poll_options') ?? '').split('\n'))
    .map((s) => s.trim())
    .filter(Boolean)
  return {
    question,
    kind,
    multiple: kind === 'schedule' || fd.get('poll_multiple') === 'on',
    anonymous: kind === 'normal' && fd.get('poll_anonymous') === 'on',
    closes_at: String(fd.get('poll_closes_at') ?? ''),
    options,
  }
}

export async function insertPoll(tx: TransactionSql, user: CurrentUser, ownerType: 'post' | 'room', ownerId: string, raw: PollInputT) {
  const v = PollInput.parse(raw)
  const [p] = await tx<{ id: string }[]>`
    insert into polls (owner_type, owner_id, question, kind, multiple, anonymous, closes_at, created_by)
    values (${ownerType}, ${ownerId}, ${v.question}, ${v.kind}, ${v.multiple}, ${v.anonymous}, ${fromDatetimeLocal(v.closes_at)}, ${user.id})
    returning id`
  let i = 0
  for (const o of v.options) {
    // 日程調整の選択肢は datetime-local の値
    const startsAt = v.kind === 'schedule' ? fromDatetimeLocal(o) : null
    const label = startsAt ? `${jstDateStr(startsAt)} ${jstTimeStr(startsAt)}` : o
    await tx`insert into poll_options (poll_id, label, starts_at, sort) values (${p.id}, ${label}, ${startsAt}, ${i++})`
  }
  return p.id
}

