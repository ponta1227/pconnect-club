'use server'

import { redirect } from 'next/navigation'
import { refresh } from 'next/cache'
import { z } from 'zod'
import { assertAdmin, requireUser, type CurrentUser } from '@/lib/auth'
import { insertPoll, type PollInputT } from '@/lib/poll-write'
import { sql } from '@/lib/db'
import { isRoomMember } from '@/lib/access'
import { pollTargets } from '@/lib/polls'
import { notifyLater } from '@/lib/notify'
import { jstDateStr, jstTimeStr } from '@/lib/time'

async function loadPollForUser(pollId: string, user: CurrentUser) {
  const [p] = await sql<{ id: string; owner_type: 'post' | 'room'; owner_id: string; question: string; kind: string; multiple: boolean; anonymous: boolean; closes_at: Date | null; closed_at: Date | null }[]>`
    select id, owner_type, owner_id, question, kind, multiple, anonymous, closes_at, closed_at from polls where id = ${pollId}`
  if (!p) throw new Error('投票が見つかりません')
  if (p.owner_type === 'room' && !(await isRoomMember(user.id, p.owner_id))) throw new Error('このルームのメンバーではありません')
  return p
}

const VoteInput = z.array(z.object({ optionId: z.string().uuid(), value: z.enum(['yes', 'maybe', 'no']) })).max(20)

export async function vote(pollId: string, raw: z.input<typeof VoteInput>) {
  const user = await requireUser()
  const p = await loadPollForUser(pollId, user)
  if (p.closed_at || (p.closes_at && p.closes_at.getTime() < Date.now())) throw new Error('この投票は締め切られました')
  const votes = VoteInput.parse(raw)
  const validIds = new Set((await sql<{ id: string }[]>`select id from poll_options where poll_id = ${pollId}`).map((r) => r.id))
  const clean = votes.filter((v) => validIds.has(v.optionId))
  if (p.kind === 'normal') {
    if (clean.length === 0) throw new Error('選択してください')
    if (!p.multiple && clean.length > 1) throw new Error('1つだけ選んでください')
  }
  await sql.begin(async (tx) => {
    const [already] = await tx`select 1 from poll_voters where poll_id = ${pollId} and profile_id = ${user.id}`
    if (already && p.anonymous) throw new Error('匿名投票は回答の変更ができません')
    if (!p.anonymous) await tx`delete from poll_votes where poll_id = ${pollId} and profile_id = ${user.id}`
    for (const v of clean) {
      await tx`
        insert into poll_votes (poll_id, option_id, profile_id, value)
        values (${pollId}, ${v.optionId}, ${p.anonymous ? null : user.id}, ${p.kind === 'normal' ? 'yes' : v.value})`
    }
    await tx`insert into poll_voters (poll_id, profile_id) values (${pollId}, ${user.id}) on conflict do nothing`
  })
  refresh()
}

export async function closePoll(pollId: string) {
  const user = await requireUser()
  assertAdmin(user)
  await sql`update polls set closed_at = now() where id = ${pollId}`
  refresh()
}

/** 未回答者に催促（管理者の操作。cron からも前日に自動で送る） */
export async function remindPoll(pollId: string) {
  const user = await requireUser()
  assertAdmin(user)
  const n = await sendPollReminder(pollId)
  refresh()
  return { sent: n }
}

export async function sendPollReminder(pollId: string): Promise<number> {
  const [p] = await sql<{ owner_type: 'post' | 'room'; owner_id: string; question: string }[]>`select owner_type, owner_id, question from polls where id = ${pollId}`
  if (!p) return 0
  const targets = await pollTargets(p.owner_type, p.owner_id)
  const voted = new Set((await sql<{ profile_id: string }[]>`select profile_id from poll_voters where poll_id = ${pollId}`).map((r) => r.profile_id))
  const pending = targets.filter((t) => !voted.has(t))
  notifyLater(pending, 'poll', {
    title: '回答のお願い',
    body: `「${p.question}」にまだ回答していません`,
    url: p.owner_type === 'post' ? `/board/${p.owner_id}` : `/chat/${p.owner_id}`,
  })
  await sql`update polls set reminded_at = now() where id = ${pollId}`
  return pending.length
}

/** 日程調整で決まった日時を予定の登録画面に引き継ぐ */
export async function convertScheduleToEvent(pollId: string, optionId: string) {
  const user = await requireUser()
  assertAdmin(user)
  const [o] = await sql<{ starts_at: Date | null; question: string }[]>`
    select o.starts_at, p.question from poll_options o join polls p on p.id = o.poll_id where o.id = ${optionId} and p.id = ${pollId}`
  if (!o?.starts_at) throw new Error('日時が見つかりません')
  await sql`update polls set closed_at = coalesce(closed_at, now()) where id = ${pollId}`
  const q = new URLSearchParams({ date: jstDateStr(o.starts_at), time: jstTimeStr(o.starts_at), title: o.question, poll: pollId })
  redirect(`/events/new?${q}`)
}

/** チャットルームに投票を追加（管理者） */
export async function createRoomPoll(roomId: string, raw: PollInputT) {
  const user = await requireUser()
  assertAdmin(user)
  if (!(await isRoomMember(user.id, roomId))) throw new Error('このルームのメンバーではありません')
  const pollId = await sql.begin(async (tx) => {
    const id = await insertPoll(tx, user, 'room', roomId, raw)
    await tx`insert into chat_messages (room_id, sender_id, body, poll_id) values (${roomId}, ${user.id}, ${'📊 ' + String(raw.question)}, ${id})`
    return id
  })
  const members = (await sql<{ profile_id: string }[]>`select profile_id from chat_members where room_id = ${roomId} and profile_id <> ${user.id}`).map((r) => r.profile_id)
  notifyLater(members, 'chat', { title: '新しいアンケート', body: String(raw.question), url: `/chat/${roomId}` })
  refresh()
  return { pollId }
}
