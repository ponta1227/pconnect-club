'use server'

import { refresh } from 'next/cache'
import { z } from 'zod'
import { assertAdmin, requireUser } from '@/lib/auth'
import { sql } from '@/lib/db'
import { adultsForClasses, childAccountsForClasses } from '@/lib/access'
import { notifyLater } from '@/lib/notify'
import { practiceSlots, practiceType } from '@/lib/schedule'
import { onPracticeCancelled, onPracticeRestored } from '@/lib/makeup'
import { daysInMonth, fmtDate, fmtTime, fromJst, jstDateStr, jstParts, monthRange } from '@/lib/time'

// 練習日程の月間プランナー（管理者のみ）

const uuid = z.string().uuid()
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const timeStr = z.string().regex(/^\d{2}:\d{2}$/)

async function admin() {
  const user = await requireUser()
  assertAdmin(user)
  return user
}

async function loadPractice(eventId: string) {
  const [e] = await sql<{ id: string; title: string; starts_at: Date; ends_at: Date | null; status: string; uses_arrival: boolean }[]>`
    select e.id, e.title, e.starts_at, e.ends_at, e.status, t.uses_arrival
    from events e join event_types t on t.id = e.type_id where e.id = ${uuid.parse(eventId)}`
  if (!e || !e.uses_arrival) throw new Error('練習の予定が見つかりません')
  return e
}

/** 対象クラスの保護者・家族と子どもアカウントに知らせる（当日の変更は夜間でもすぐ届ける） */
async function tell(eventId: string, day: Date, title: string, body: string) {
  const classIds = (await sql<{ class_id: string }[]>`select class_id from event_classes where event_id = ${eventId}`).map((r) => r.class_id)
  const recipients = [...(await adultsForClasses(classIds)), ...(await childAccountsForClasses(classIds))]
  const sameDay = jstDateStr(day) === jstDateStr(new Date())
  notifyLater(recipients, sameDay ? 'urgent' : 'event', { title, body, url: `/events/${eventId}` }, { urgent: sameDay, bypassQuiet: sameDay, childOk: true })
}

/** その月の、まだ練習が入っていない日に「いつもの練習」をまとめて入れる（今日以降だけ。通知なし） */
export async function fillMonth(ym: string): Promise<{ created: number }> {
  const user = await admin()
  if (!/^\d{4}-\d{2}$/.test(ym)) throw new Error('月の指定が正しくありません')
  const [year, month] = ym.split('-').map(Number)
  const type = await practiceType()
  if (!type) throw new Error('練習の種別（到着登録あり）がありません。「予定の種別」で作ってください')
  const slots = await practiceSlots()
  const { start, end } = monthRange(year, month)
  const existing = new Set(
    (
      await sql<{ starts_at: Date }[]>`
        select e.starts_at from events e join event_types t on t.id = e.type_id
        where t.uses_arrival and e.starts_at >= ${start} and e.starts_at < ${end}`
    ).map((r) => jstDateStr(r.starts_at)),
  )
  const today = jstDateStr(new Date())
  const rows: { type_id: string; title: string; starts_at: Date; ends_at: Date; venue_id: string | null; created_by: string; self_practice: boolean }[] = []
  for (let d = 1; d <= daysInMonth(year, month); d++) {
    const date = `${ym}-${String(d).padStart(2, '0')}`
    if (date < today || existing.has(date)) continue
    const slot = slots.find((s) => s.weekday === jstParts(fromJst(date)).dow)
    if (!slot) continue
    rows.push({
      type_id: type.id,
      title: slot.mode === 'self' ? '自主練' : type.name,
      self_practice: slot.mode === 'self',
      starts_at: fromJst(date, slot.start_time),
      ends_at: fromJst(date, slot.end_time),
      venue_id: slot.venue_id,
      created_by: user.id,
    })
  }
  if (rows.length) await sql`insert into events ${sql(rows)}`
  refresh()
  return { created: rows.length }
}

const PracticeInput = z.object({
  start: timeStr,
  end: timeStr,
  venueId: uuid.nullable(),
  notify: z.boolean(),
  /** 自主練（場所だけあり、都度参加・振替なし） */
  selfPractice: z.boolean().optional().default(false),
})

/** 1日だけ練習を入れる */
export async function addPractice(input: { date: string; start: string; end: string; venueId: string | null; notify: boolean; selfPractice?: boolean }) {
  const user = await admin()
  const date = dateStr.parse(input.date)
  const v = PracticeInput.parse(input)
  if (v.end <= v.start) throw new Error('終了は開始より後の時刻にしてください')
  const type = await practiceType()
  if (!type) throw new Error('練習の種別（到着登録あり）がありません')
  const startsAt = fromJst(date, v.start)
  const title = v.selfPractice ? '自主練' : type.name
  const [e] = await sql<{ id: string }[]>`
    insert into events (type_id, title, starts_at, ends_at, venue_id, created_by, self_practice)
    values (${type.id}, ${title}, ${startsAt}, ${fromJst(date, v.end)}, ${v.venueId}, ${user.id}, ${v.selfPractice}) returning id`
  if (v.notify) await tell(e.id, startsAt, `${title}が追加されました`, `${fmtDate(startsAt)} ${v.start}–${v.end}`)
  refresh()
}

/** その日の練習の時間・会場を変える */
export async function updatePractice(input: { eventId: string; start: string; end: string; venueId: string | null; notify: boolean }) {
  await admin()
  const e = await loadPractice(input.eventId)
  const v = PracticeInput.parse(input)
  if (v.end <= v.start) throw new Error('終了は開始より後の時刻にしてください')
  const date = jstDateStr(e.starts_at)
  const startsAt = fromJst(date, v.start)
  await sql`
    update events set starts_at = ${startsAt}, ends_at = ${fromJst(date, v.end)}, venue_id = ${v.venueId},
      venue_text = case when ${v.venueId}::uuid is null then venue_text else '' end, updated_at = now()
    where id = ${e.id}`
  if (v.notify) {
    const [venue] = v.venueId ? await sql<{ name: string }[]>`select name from venues where id = ${v.venueId}` : []
    await tell(e.id, startsAt, '練習の時間・会場が変わりました', `${fmtDate(startsAt)} ${v.start}–${v.end}${venue ? ` ${venue.name}` : ''}`)
  }
  refresh()
}

/**
 * 自主練に切り替える／通常の練習に戻す。
 * 自主練にすると、だれの参加曜日でもなくなるので、この日にたまった振替と、振替で参加予定だった分は元に戻す。
 */
export async function setSelfPractice(eventId: string, on: boolean) {
  await admin()
  const e = await loadPractice(eventId)
  const type = await practiceType()
  await sql.begin(async (tx) => {
    await tx`update events set self_practice = ${on}, title = ${on ? '自主練' : (type?.name ?? '練習')}, updated_at = now() where id = ${e.id}`
    if (on) {
      await tx`delete from makeup_credits where event_id = ${e.id}`
      await tx`update practice_extras set uses_credit = false where event_id = ${e.id}`
    }
  })
  refresh()
}

/** 練習を休みにする（予定は残して「中止」の表示にする） */
export async function setPracticeOff(eventId: string, notify: boolean) {
  await admin()
  const e = await loadPractice(eventId)
  await sql`update events set status = 'cancelled', updated_at = now() where id = ${e.id}`
  await onPracticeCancelled(e.id, null)
  if (notify) await tell(e.id, e.starts_at, `【休み】${fmtDate(e.starts_at)} の練習`, `${fmtDate(e.starts_at)} ${fmtTime(e.starts_at)} からの練習は休みになりました`)
  refresh()
}

/** 休みを取り消して、練習ありに戻す */
export async function restorePractice(eventId: string, notify: boolean) {
  await admin()
  const e = await loadPractice(eventId)
  await sql`update events set status = 'active', updated_at = now() where id = ${e.id}`
  await onPracticeRestored(e.id)
  if (notify) await tell(e.id, e.starts_at, `${fmtDate(e.starts_at)} の練習を行います`, `休みの連絡を取り消しました。${fmtTime(e.starts_at)} から練習があります`)
  refresh()
}

/** 練習の予定そのものを消す（到着・欠席の記録も消える） */
export async function removePractice(eventId: string) {
  await admin()
  const e = await loadPractice(eventId)
  await sql`delete from events where id = ${e.id}`
  refresh()
}

/** 「いつもの練習」（曜日ごとの会場・時間）を保存する */
export async function saveSlots(fd: FormData) {
  await admin()
  const rows: { weekday: number; venue_id: string | null; start_time: string; end_time: string; mode: 'regular' | 'dropin' | 'self' }[] = []
  for (let d = 0; d <= 6; d++) {
    if (fd.get(`on_${d}`) !== 'on') continue
    const start = timeStr.safeParse(fd.get(`start_${d}`))
    const end = timeStr.safeParse(fd.get(`end_${d}`))
    const venue = uuid.safeParse(fd.get(`venue_${d}`))
    if (!start.success || !end.success || end.data <= start.data) continue
    const m = String(fd.get(`mode_${d}`) ?? 'regular')
    // 金曜日は参加曜日にしない（都度参加）
    const mode = m === 'self' ? 'self' : m === 'dropin' || d === 5 ? 'dropin' : 'regular'
    rows.push({ weekday: d, venue_id: venue.success ? venue.data : null, start_time: start.data, end_time: end.data, mode })
  }
  await sql.begin(async (tx) => {
    await tx`delete from practice_slots`
    if (rows.length) await tx`insert into practice_slots ${tx(rows)}`
  })
  refresh()
}
