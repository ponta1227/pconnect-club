'use server'

import { redirect } from 'next/navigation'
import { refresh } from 'next/cache'
import { z } from 'zod'
import { assertAdmin, requireUser } from '@/lib/auth'
import { sql } from '@/lib/db'
import { adminIds, adultsForClasses, canActForChild, childAccountsForClasses, guardiansOf } from '@/lib/access'
import { attachTo, detachMissing } from '@/lib/files'
import { notifyLater } from '@/lib/notify'
import { expandDates, type RecurrenceRule } from '@/lib/recurrence'
import { defaultMemberDeadline, placement, rsvpOpen } from '@/lib/event-rules'
import { fmtDateTime, fromDatetimeLocal, fromJst, jstDateStr } from '@/lib/time'
import { recordArrival } from '@/lib/arrivals'

const uuid = z.string().uuid()
const time = z.string().regex(/^\d{2}:\d{2}$/)
const optStr = (max: number) => z.string().trim().max(max).optional().default('')

const EventForm = z.object({
  id: uuid.optional(),
  scope: z.enum(['this', 'following', 'all']).default('this'),
  type_id: uuid,
  title: z.string().trim().min(1, 'タイトルを入力してください').max(100),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time: time.optional().or(z.literal('')),
  end_time: time.optional().or(z.literal('')),
  all_day: z.boolean(),
  venue_id: uuid.optional().or(z.literal('')),
  venue_text: optStr(100),
  note: optStr(5000),
  meet_time: optStr(50),
  meet_place: optStr(100),
  fee_note: optStr(2000),
  member_deadline: z.string().optional().default(''),
  entry_deadline: z.string().optional().default(''),
  capacity: z.string().optional().default(''),
  allow_companions: z.boolean(),
  class_ids: z.array(uuid),
  repeat: z.enum(['none', 'weekly', 'monthly']).default('none'),
  weekdays: z.array(z.coerce.number().int().min(0).max(6)),
  until_date: z.string().optional().default(''),
  count: z.string().optional().default(''),
  attachments: z.array(z.string()),
  notify: z.boolean(),
})

function parseForm(fd: FormData) {
  return EventForm.safeParse({
    id: fd.get('id') || undefined,
    scope: fd.get('scope') || undefined,
    type_id: fd.get('type_id'),
    title: fd.get('title'),
    date: fd.get('date'),
    start_time: fd.get('start_time') ?? '',
    end_time: fd.get('end_time') ?? '',
    all_day: fd.get('all_day') === 'on',
    venue_id: fd.get('venue_id') ?? '',
    venue_text: fd.get('venue_text') ?? '',
    note: fd.get('note') ?? '',
    meet_time: fd.get('meet_time') ?? '',
    meet_place: fd.get('meet_place') ?? '',
    fee_note: fd.get('fee_note') ?? '',
    member_deadline: fd.get('member_deadline') ?? '',
    entry_deadline: fd.get('entry_deadline') ?? '',
    capacity: fd.get('capacity') ?? '',
    allow_companions: fd.get('allow_companions') === 'on',
    class_ids: fd.getAll('class_ids'),
    repeat: fd.get('repeat') || undefined,
    weekdays: fd.getAll('weekdays'),
    until_date: fd.get('until_date') ?? '',
    count: fd.get('count') ?? '',
    attachments: fd.getAll('attachments').map(String),
    notify: fd.get('notify') === 'on',
  })
}

export type FormState = { error?: string } | undefined

export async function saveEvent(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser()
  assertAdmin(user)
  const parsed = parseForm(fd)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? '入力内容を確認してください' }
  const v = parsed.data

  const [type] = await sql<{ uses_rsvp: boolean }[]>`select uses_rsvp from event_types where id = ${v.type_id}`
  if (!type) return { error: '種別が見つかりません' }

  const startTime = v.all_day ? '00:00' : v.start_time || '00:00'
  const startsAt = fromJst(v.date, startTime)
  const endsAt = !v.all_day && v.end_time ? fromJst(v.date, v.end_time) : null
  if (endsAt && endsAt <= startsAt) return { error: '終了時刻は開始時刻より後にしてください' }

  const entryDeadline = type.uses_rsvp ? fromDatetimeLocal(v.entry_deadline) : null
  const memberDeadline = type.uses_rsvp ? (fromDatetimeLocal(v.member_deadline) ?? defaultMemberDeadline(entryDeadline)) : null
  const capacity = type.uses_rsvp && v.capacity ? Math.max(1, Number.parseInt(v.capacity, 10) || 0) || null : null

  const base = {
    type_id: v.type_id,
    title: v.title,
    all_day: v.all_day,
    venue_id: v.venue_id || null,
    venue_text: v.venue_id ? '' : v.venue_text,
    note: v.note,
    meet_time: type.uses_rsvp ? v.meet_time : '',
    meet_place: type.uses_rsvp ? v.meet_place : '',
    fee_note: type.uses_rsvp ? v.fee_note : '',
    capacity,
    allow_companions: type.uses_rsvp && v.allow_companions,
  }
  // 締切は開始日時からの差分として扱い、繰り返しの各回に同じ差分を適用する
  const memberOffset = memberDeadline ? memberDeadline.getTime() - startsAt.getTime() : null
  const entryOffset = entryDeadline ? entryDeadline.getTime() - startsAt.getTime() : null
  const durationMs = endsAt ? endsAt.getTime() - startsAt.getTime() : null

  const rowFor = (start: Date) => ({
    ...base,
    starts_at: start,
    ends_at: durationMs != null ? new Date(start.getTime() + durationMs) : null,
    member_deadline: memberOffset != null ? new Date(start.getTime() + memberOffset) : null,
    entry_deadline: entryOffset != null ? new Date(start.getTime() + entryOffset) : null,
  })

  let targetId: string
  let created = 0

  if (!v.id) {
    // ---------- 新規作成
    let dates = [v.date]
    let seriesId: string | null = null
    if (v.repeat !== 'none') {
      const rule: RecurrenceRule =
        v.repeat === 'weekly'
          ? { freq: 'weekly', weekdays: v.weekdays, untilDate: v.until_date || null, count: v.count ? Number(v.count) : null }
          : { freq: 'monthly', monthDay: Number(v.date.slice(8, 10)), untilDate: v.until_date || null, count: v.count ? Number(v.count) : null }
      if (rule.freq === 'weekly' && rule.weekdays.length === 0) return { error: '繰り返す曜日を選んでください' }
      dates = expandDates(v.date, rule)
      if (dates.length === 0) return { error: '繰り返しの条件に合う日がありません' }
    }
    targetId = await sql.begin(async (tx) => {
      if (v.repeat !== 'none') {
        const [s] = await tx<{ id: string }[]>`
          insert into event_series (freq, weekdays, month_day, until_date, occurrence_count)
          values (${v.repeat}, ${v.weekdays}::int[], ${v.repeat === 'monthly' ? Number(v.date.slice(8, 10)) : null},
                  ${v.until_date || null}::date, ${v.count ? Number(v.count) : null})
          returning id`
        seriesId = s.id
      }
      let first = ''
      for (const d of dates) {
        const row = { ...rowFor(fromJst(d, startTime)), series_id: seriesId, created_by: user.id }
        const [e] = await tx<{ id: string }[]>`insert into events ${tx(row)} returning id`
        if (!first) first = e.id
        for (const c of v.class_ids) await tx`insert into event_classes (event_id, class_id) values (${e.id}, ${c})`
      }
      await attachTo(tx, user, 'event', first, v.attachments)
      return first
    })
    created = dates.length

    if (v.notify) {
      notifyLater(await adultsForClasses(v.class_ids), 'event', {
        title: created > 1 ? `予定が追加されました（${created}件）` : '予定が追加されました',
        body: created > 1 ? `${v.title}（${fmtDateTime(startsAt)} から）` : `${fmtDateTime(startsAt)} ${v.title}`,
        url: `/events/${targetId}`,
      })
    }
  } else {
    // ---------- 編集
    const [cur] = await sql<{ id: string; starts_at: Date; series_id: string | null }[]>`
      select id, starts_at, series_id from events where id = ${v.id}`
    if (!cur) return { error: '予定が見つかりません' }
    targetId = cur.id
    const scope = cur.series_id ? v.scope : 'this'
    await sql.begin(async (tx) => {
      const targets =
        scope === 'this'
          ? [cur]
          : scope === 'following'
            ? await tx<{ id: string; starts_at: Date }[]>`select id, starts_at from events where series_id = ${cur.series_id} and starts_at >= ${cur.starts_at}`
            : await tx<{ id: string; starts_at: Date }[]>`select id, starts_at from events where series_id = ${cur.series_id}`
      for (const t of targets) {
        // 「この予定のみ」は日付も変更、まとめて変更のときは各回の日付を保ち時刻だけ変える
        const day = scope === 'this' ? v.date : jstDateStr(t.starts_at)
        const row = { ...rowFor(fromJst(day, startTime)), updated_at: new Date() }
        await tx`update events set ${tx(row)} where id = ${t.id}`
        await tx`delete from event_classes where event_id = ${t.id}`
        for (const c of v.class_ids) await tx`insert into event_classes (event_id, class_id) values (${t.id}, ${c})`
      }
      await detachMissing(tx, 'event', cur.id, v.attachments.filter((x) => /^[0-9a-f-]{36}$/.test(x)))
      await attachTo(tx, user, 'event', cur.id, v.attachments)
    })
    if (v.notify) {
      const recipients = [...(await adultsForClasses(v.class_ids)), ...(await childAccountsForClasses(v.class_ids))]
      notifyLater(recipients, 'event', {
        title: '予定が変更されました',
        body: `${fmtDateTime(startsAt)} ${v.title}`,
        url: `/events/${targetId}`,
      }, { childOk: true })
    }
  }
  redirect(`/events/${targetId}`)
}

export async function deleteEvent(id: string, scope: 'this' | 'following' | 'all') {
  const user = await requireUser()
  assertAdmin(user)
  const [cur] = await sql<{ starts_at: Date; series_id: string | null }[]>`select starts_at, series_id from events where id = ${id}`
  if (!cur) redirect('/events')
  if (!cur.series_id || scope === 'this') await sql`delete from events where id = ${id}`
  else if (scope === 'following') await sql`delete from events where series_id = ${cur.series_id} and starts_at >= ${cur.starts_at}`
  else await sql`delete from events where series_id = ${cur.series_id}`
  redirect(`/events?date=${jstDateStr(cur.starts_at)}`)
}

/** 中止（赤い「中止」バッジ。対象者と子どもアカウントに通知） */
export async function cancelEvent(id: string, urgent: boolean) {
  const user = await requireUser()
  assertAdmin(user)
  const [e] = await sql<{ title: string; starts_at: Date }[]>`
    update events set status = 'cancelled', updated_at = now() where id = ${id} returning title, starts_at`
  if (!e) return
  const classIds = (await sql<{ class_id: string }[]>`select class_id from event_classes where event_id = ${id}`).map((r) => r.class_id)
  const recipients = [...(await adultsForClasses(classIds)), ...(await childAccountsForClasses(classIds))]
  notifyLater(recipients, urgent ? 'urgent' : 'event', {
    title: `【中止】${e.title}`,
    body: `${fmtDateTime(e.starts_at)} の「${e.title}」は中止になりました`,
    url: `/events/${id}`,
  }, { urgent, bypassQuiet: true, childOk: true })
  refresh()
}

export async function reopenEvent(id: string) {
  const user = await requireUser()
  assertAdmin(user)
  await sql`update events set status = 'active', updated_at = now() where id = ${id}`
  refresh()
}

// ------------------------------------------------------------ 参加登録

async function loadRsvpEvent(eventId: string) {
  const [e] = await sql<{ id: string; title: string; status: 'active' | 'cancelled'; starts_at: Date; member_deadline: Date | null; capacity: number | null; allow_companions: boolean; uses_rsvp: boolean }[]>`
    select e.id, e.title, e.status, e.starts_at, e.member_deadline, e.capacity, e.allow_companions, t.uses_rsvp
    from events e join event_types t on t.id = e.type_id where e.id = ${eventId}`
  if (!e || !e.uses_rsvp) throw new Error('この予定は参加登録の対象ではありません')
  return e
}

export async function rsvp(eventId: string, childIds: string[], companions: number) {
  const user = await requireUser()
  const e = await loadRsvpEvent(eventId)
  if (!user.isAdmin && !rsvpOpen(e)) throw new Error('部内締めを過ぎたため、参加登録は管理者にお問い合わせください')
  const comp = e.allow_companions ? Math.min(20, Math.max(0, Math.floor(companions || 0))) : 0
  for (const childId of childIds) {
    if (!(await canActForChild(user, childId))) throw new Error('この子どもの参加登録はできません')
  }
  const results = await sql.begin(async (tx) => {
    // 定員判定のため予定の行をロック
    await tx`select id from events where id = ${eventId} for update`
    const out: string[] = []
    for (const childId of childIds) {
      const [{ count }] = await tx<{ count: number }[]>`select count(*)::int as count from rsvps where event_id = ${eventId} and status = 'going'`
      const status = placement(e.capacity, count)
      const [row] = await tx<{ status: string }[]>`
        insert into rsvps (event_id, child_id, companions, status, created_by)
        values (${eventId}, ${childId}, ${comp}, ${status}, ${user.id})
        on conflict (event_id, child_id) do update set companions = excluded.companions
        returning status`
      out.push(row.status)
    }
    return out
  })
  refresh()
  return { waitlisted: results.filter((s) => s === 'waitlist').length }
}

export async function updateCompanions(eventId: string, childId: string, companions: number) {
  const user = await requireUser()
  const e = await loadRsvpEvent(eventId)
  if (!(await canActForChild(user, childId))) throw new Error('権限がありません')
  if (!user.isAdmin && !rsvpOpen(e)) throw new Error('部内締めを過ぎています')
  const comp = e.allow_companions ? Math.min(20, Math.max(0, Math.floor(companions || 0))) : 0
  await sql`update rsvps set companions = ${comp} where event_id = ${eventId} and child_id = ${childId}`
  refresh()
}

export async function cancelRsvp(eventId: string, childId: string) {
  const user = await requireUser()
  const e = await loadRsvpEvent(eventId)
  if (!(await canActForChild(user, childId))) throw new Error('権限がありません')
  if (!user.isAdmin && !rsvpOpen(e)) throw new Error('部内締めを過ぎたため、取り消しは管理者にお問い合わせください')

  const promoted = await sql.begin(async (tx) => {
    await tx`select id from events where id = ${eventId} for update`
    const [removed] = await tx<{ status: string }[]>`
      delete from rsvps where event_id = ${eventId} and child_id = ${childId} returning status`
    if (!removed || removed.status !== 'going' || e.capacity == null) return null
    // 空いた枠をキャンセル待ちの先頭に繰り上げ
    const [next] = await tx<{ child_id: string }[]>`
      update rsvps set status = 'going'
      where id = (select id from rsvps where event_id = ${eventId} and status = 'waitlist' order by created_at limit 1)
      returning child_id`
    return next?.child_id ?? null
  })

  if (promoted) {
    const [c] = await sql<{ full_name: string }[]>`select full_name from children where id = ${promoted}`
    notifyLater(await guardiansOf([promoted]), 'waitlist', {
      title: 'キャンセル待ちから繰り上がりました',
      body: `${c.full_name}さんが「${e.title}」に参加できるようになりました`,
      url: `/events/${eventId}`,
    })
  }
  refresh()
}

export async function setPayment(rsvpId: string, paid: boolean, note: string) {
  const user = await requireUser()
  assertAdmin(user)
  await sql`update rsvps set paid = ${paid}, payment_note = ${note.slice(0, 200)} where id = ${rsvpId}`
  refresh()
}

// ------------------------------------------------------------ 欠席・遅刻・早退

const AbsenceForm = z.object({
  eventId: uuid,
  childId: uuid,
  kind: z.enum(['absent', 'late', 'early']),
  atTime: z.string().max(5).optional().default(''),
  reason: z.string().trim().max(500).optional().default(''),
})

const KIND_LABEL = { absent: '欠席', late: '遅刻', early: '早退' } as const

export async function reportAbsence(input: z.input<typeof AbsenceForm>) {
  const user = await requireUser()
  const v = AbsenceForm.parse(input)
  if (!(await canActForChild(user, v.childId))) throw new Error('この子どもの連絡はできません')
  const [e] = await sql<{ title: string; starts_at: Date; uses_arrival: boolean }[]>`
    select e.title, e.starts_at, t.uses_arrival from events e join event_types t on t.id = e.type_id where e.id = ${v.eventId}`
  if (!e?.uses_arrival) throw new Error('この予定では連絡できません')
  const reporterKind = user.isChild ? 'child' : user.isAdmin ? 'admin' : 'adult'
  const atTime = v.kind === 'absent' ? '' : v.atTime
  await sql`
    insert into absence_reports (event_id, child_id, kind, at_time, reason, reported_by, reporter_kind)
    values (${v.eventId}, ${v.childId}, ${v.kind}, ${atTime}, ${v.reason}, ${user.id}, ${reporterKind})
    on conflict (event_id, child_id) do update set kind = excluded.kind, at_time = excluded.at_time,
      reason = excluded.reason, reported_by = excluded.reported_by, reporter_kind = excluded.reporter_kind, updated_at = now()`

  const [c] = await sql<{ full_name: string }[]>`select full_name from children where id = ${v.childId}`
  const label = KIND_LABEL[v.kind] + (atTime ? `（${atTime}）` : '')
  const msg = {
    title: `${KIND_LABEL[v.kind]}の連絡: ${c.full_name}さん`,
    body: `${fmtDateTime(e.starts_at)} ${e.title} / ${label}${v.reason ? ` / ${v.reason}` : ''}${user.isChild ? '（本人から）' : ''}`,
    url: `/events/${v.eventId}`,
  }
  const recipients = await adminIds()
  // 子ども本人からの連絡は保護者・家族にも知らせる
  if (user.isChild) recipients.push(...(await guardiansOf([v.childId])))
  notifyLater(recipients.filter((id) => id !== user.id), 'absence', msg)
  refresh()
}

export async function withdrawAbsence(eventId: string, childId: string) {
  const user = await requireUser()
  if (!(await canActForChild(user, childId))) throw new Error('権限がありません')
  await sql`delete from absence_reports where event_id = ${eventId} and child_id = ${childId}`
  refresh()
}

// ------------------------------------------------------------ 到着（管理者の手動登録・取消）

export async function addArrivalManually(eventId: string, childId: string) {
  const user = await requireUser()
  assertAdmin(user)
  await recordArrival(eventId, childId, 'manual', user.id)
  refresh()
}

export async function cancelArrival(arrivalId: string) {
  const user = await requireUser()
  assertAdmin(user)
  await sql`update arrivals set cancelled_at = now() where id = ${arrivalId} and cancelled_at is null`
  refresh()
}

/** 初期の練習予定（現行の曜日・会場）をまとめて作成 */
export async function createStandardPractices(formData: FormData) {
  const user = await requireUser()
  assertAdmin(user)
  const from = String(formData.get('from'))
  const until = String(formData.get('until'))
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(until) || until < from) {
    redirect('/admin/practices?error=date')
  }
  const [type] = await sql<{ id: string }[]>`select id from event_types where uses_arrival order by sort limit 1`
  if (!type) redirect('/admin/practices?error=type')
  const venueRows = await sql<{ id: string; name: string }[]>`select id, name from venues`
  const venueId = (name: string) => venueRows.find((v) => v.name === name)?.id ?? null
  const plans = [
    { venue: '朝霞市総合体育館', weekdays: [1, 2, 4, 5], start: '18:30', end: '20:30' },
    { venue: '大和中', weekdays: [3], start: '19:00', end: '20:30' },
    { venue: '志木市民体育館', weekdays: [6], start: '18:30', end: '20:30' },
  ]
  let total = 0
  await sql.begin(async (tx) => {
    for (const p of plans) {
      const [s] = await tx<{ id: string }[]>`
        insert into event_series (freq, weekdays, until_date) values ('weekly', ${p.weekdays}::int[], ${until}::date) returning id`
      for (const d of expandDates(from, { freq: 'weekly', weekdays: p.weekdays, untilDate: until, count: null })) {
        const startsAt = fromJst(d, p.start)
        await tx`
          insert into events (type_id, title, starts_at, ends_at, venue_id, venue_text, series_id, created_by)
          values (${type.id}, '練習', ${startsAt}, ${fromJst(d, p.end)}, ${venueId(p.venue)}, ${venueId(p.venue) ? '' : p.venue}, ${s.id}, ${user.id})`
        total++
      }
    }
  })
  redirect(`/admin/practices?created=${total}`)
}
