import 'server-only'
import { sql } from './db'
import { eventTargetChildIds, guardiansOf } from './access'
import { flushQueue, notify } from './notify'
import { reminderDue } from './event-rules'
import { fmtDateTime } from './time'
import { runGradePromotion } from './promotion'
import { removeObjects } from './storage'
import { pollTargets } from './polls'

/** 部内締め前のリマインド（未反応の子の保護者・家族へ。子どもアカウントには送らない） */
export async function sendRsvpReminders(now = new Date()) {
  const events = await sql<{ id: string; title: string; starts_at: Date; member_deadline: Date; reminded_3d_at: Date | null; reminded_1d_at: Date | null }[]>`
    select e.id, e.title, e.starts_at, e.member_deadline, e.reminded_3d_at, e.reminded_1d_at
    from events e join event_types t on t.id = e.type_id
    where t.uses_rsvp and t.remind and e.status = 'active'
      and e.member_deadline > ${now} and e.member_deadline < ${new Date(now.getTime() + 4 * 86400000)}`
  let sent = 0
  for (const e of events) {
    const due = reminderDue(e.member_deadline, now, { d3: e.reminded_3d_at, d1: e.reminded_1d_at })
    if (!due) continue
    const targets = await eventTargetChildIds(e.id)
    const responded = new Set((await sql<{ child_id: string }[]>`select child_id from rsvps where event_id = ${e.id}`).map((r) => r.child_id))
    const pending = targets.filter((c) => !responded.has(c))
    const recipients = await guardiansOf(pending)
    if (recipients.length) {
      await notify(recipients, 'reminder', {
        title: `参加の締切が近づいています`,
        body: `「${e.title}」（${fmtDateTime(e.starts_at)}）の部内締めは ${fmtDateTime(e.member_deadline)} です。参加する場合は登録してください`,
        url: `/events/${e.id}`,
      })
      sent += recipients.length
    }
    if (due === 'd3') await sql`update events set reminded_3d_at = now() where id = ${e.id}`
    else await sql`update events set reminded_1d_at = now(), reminded_3d_at = coalesce(reminded_3d_at, now()) where id = ${e.id}`
  }
  return sent
}

/** 締切が近いアンケートの未回答者へ自動で催促（締切の前日に1回） */
export async function sendPollReminders(now = new Date()) {
  const polls = await sql<{ id: string; owner_type: 'post' | 'room'; owner_id: string; question: string }[]>`
    select id, owner_type, owner_id, question from polls
    where closed_at is null and reminded_at is null and closes_at > ${now} and closes_at < ${new Date(now.getTime() + 36 * 3600000)}`
  let sent = 0
  for (const p of polls) {
    const targets = await pollTargets(p.owner_type, p.owner_id)
    const voted = new Set((await sql<{ profile_id: string }[]>`select profile_id from poll_voters where poll_id = ${p.id}`).map((r) => r.profile_id))
    const pending = targets.filter((t) => !voted.has(t))
    await notify(pending, 'poll', {
      title: '回答のお願い',
      body: `「${p.question}」の締切が近づいています`,
      url: p.owner_type === 'post' ? `/board/${p.owner_id}` : `/chat/${p.owner_id}`,
    })
    await sql`update polls set reminded_at = now() where id = ${p.id}`
    sent += pending.length
  }
  return sent
}

/** 使われなかったアップロードや期限切れデータの掃除 */
export async function cleanup() {
  const orphans = await sql<{ storage_path: string }[]>`
    delete from attachments where owner_id is null and created_at < now() - interval '1 day' returning storage_path`
  await removeObjects(orphans.map((o) => o.storage_path))
  await sql`delete from sessions where expires_at < now()`
  await sql`delete from kiosk_sessions where expires_at < now()`
  await sql`delete from rate_limits where created_at < now() - interval '1 day'`
  await sql`delete from email_verifications where expires_at < now()`
  await sql`delete from notification_queue where sent_at < now() - interval '7 days'`
  return orphans.length
}

export async function runDailyJobs() {
  const flushed = await flushQueue()
  const reminders = await sendRsvpReminders()
  const polls = await sendPollReminders()
  const promotion = await runGradePromotion()
  const cleaned = await cleanup()
  return { flushed, reminders, polls, promotion, cleaned }
}
