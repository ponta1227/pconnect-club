'use server'

import { redirect } from 'next/navigation'
import { refresh } from 'next/cache'
import { z } from 'zod'
import { assertAdmin, requireUser } from '@/lib/auth'
import { sql } from '@/lib/db'
import { adminIds, adultsForClasses, canActForChild, childAccountsForClasses, eventTargetChildIds, guardiansOf } from '@/lib/access'
import { attachTo, detachMissing } from '@/lib/files'
import { notifyLater } from '@/lib/notify'
import { earnCredit, isRegularDay, onPracticeCancelled, onPracticeRestored, removeEarned } from '@/lib/makeup'
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
  announce: z.boolean(),
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
    announce: fd.get('announce') === 'on',
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

    // 大会・イベントは、登録と同時に掲示板へ告知（予定つきの投稿）を作れる
    if (type.uses_rsvp && v.announce) {
      const postId = await sql.begin(async (tx) => {
        const [p] = await tx<{ id: string }[]>`
          insert into posts (title, body, event_id, published_at, created_by)
          values (${v.title}, ${v.note}, ${targetId}, now(), ${user.id}) returning id`
        for (const c of v.class_ids) await tx`insert into post_classes (post_id, class_id) values (${p.id}, ${c})`
        // 自分で出したお知らせは既読にしておく（未読の人数に数えない）
        await tx`insert into post_reads (post_id, profile_id) values (${p.id}, ${user.id})`
        return p.id
      })
      notifyLater((await adultsForClasses(v.class_ids)).filter((id) => id !== user.id), 'post', {
        title: v.title,
        body: `${fmtDateTime(startsAt)} 参加する場合は「参加する」を押してください${memberDeadline ? `（部内締め ${fmtDateTime(memberDeadline)}）` : ''}`,
        url: `/board/${postId}`,
      })
    } else if (v.notify) {
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
  await onPracticeCancelled(id, user.id)
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
  await onPracticeRestored(id)
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

type Answer = 'going' | 'declined'

/** 回答を1件反映する（定員・キャンセル待ち・繰り上げを含む）。繰り上がった子のIDを返す */
async function applyAnswer(
  e: Awaited<ReturnType<typeof loadRsvpEvent>>,
  userId: string,
  childId: string,
  answer: Answer | 'clear',
  companions: number,
): Promise<{ status: 'going' | 'waitlist' | 'declined' | null; promoted: string | null }> {
  return sql.begin(async (tx) => {
    // 定員判定のため予定の行をロック
    await tx`select id from events where id = ${e.id} for update`
    const [cur] = await tx<{ status: 'going' | 'waitlist' | 'declined' }[]>`
      select status from rsvps where event_id = ${e.id} and child_id = ${childId}`
    let status: 'going' | 'waitlist' | 'declined' | null = null
    if (answer === 'going') {
      if (cur && cur.status !== 'declined') {
        status = cur.status
        await tx`update rsvps set companions = ${companions} where event_id = ${e.id} and child_id = ${childId}`
      } else {
        const [{ count }] = await tx<{ count: number }[]>`select count(*)::int as count from rsvps where event_id = ${e.id} and status = 'going'`
        status = placement(e.capacity, count)
        await tx`
          insert into rsvps (event_id, child_id, companions, status, created_by)
          values (${e.id}, ${childId}, ${companions}, ${status}, ${userId})
          on conflict (event_id, child_id) do update set status = excluded.status, companions = excluded.companions,
            created_by = excluded.created_by, created_at = now()`
      }
    } else if (answer === 'declined') {
      status = 'declined'
      await tx`
        insert into rsvps (event_id, child_id, companions, status, created_by)
        values (${e.id}, ${childId}, 0, 'declined', ${userId})
        on conflict (event_id, child_id) do update set status = 'declined', companions = 0, created_by = excluded.created_by, created_at = now()`
    } else {
      await tx`delete from rsvps where event_id = ${e.id} and child_id = ${childId}`
    }
    // 参加の枠が空いたら、キャンセル待ちの先頭を繰り上げ
    let promoted: string | null = null
    if (cur?.status === 'going' && status !== 'going' && e.capacity != null) {
      const [next] = await tx<{ child_id: string }[]>`
        update rsvps set status = 'going'
        where id = (select id from rsvps where event_id = ${e.id} and status = 'waitlist' order by created_at limit 1)
        returning child_id`
      promoted = next?.child_id ?? null
    }
    return { status, promoted }
  })
}

async function notifyPromoted(e: { id: string; title: string }, childId: string | null) {
  if (!childId) return
  const [c] = await sql<{ full_name: string }[]>`select full_name from children where id = ${childId}`
  notifyLater(await guardiansOf([childId]), 'waitlist', {
    title: 'キャンセル待ちから繰り上がりました',
    body: `${c.full_name}さんが「${e.title}」に参加できるようになりました`,
    url: `/events/${e.id}`,
  })
}

/** 参加・見送りの回答（保護者・子ども本人・管理者の代理）。回答したら、その予定の告知も既読にする */
export async function answerRsvp(eventId: string, childId: string, answer: Answer, companions = 0) {
  const user = await requireUser()
  const e = await loadRsvpEvent(eventId)
  if (answer !== 'going' && answer !== 'declined') throw new Error('回答が正しくありません')
  if (!(await canActForChild(user, childId))) throw new Error('この子どもの回答はできません')
  if (!user.isAdmin && !rsvpOpen(e)) throw new Error('部内締めを過ぎたため、変更は管理者にお問い合わせください')
  const comp = e.allow_companions && answer === 'going' ? Math.min(20, Math.max(0, Math.floor(companions || 0))) : 0
  const r = await applyAnswer(e, user.id, childId, answer, comp)
  await notifyPromoted(e, r.promoted)
  await sql`
    insert into post_reads (post_id, profile_id)
    select id, ${user.id} from posts where event_id = ${eventId} and published_at is not null
    on conflict do nothing`
  refresh()
  return { status: r.status }
}

/** ホームの「やること」から非表示にする（回答はしない。あとで予定から参加できる） */
export async function hideRsvpTodo(eventId: string) {
  const user = await requireUser()
  const [e] = await sql`select 1 from events where id = ${eventId}`
  if (!e) throw new Error('予定が見つかりません')
  await sql`insert into rsvp_hidden (profile_id, event_id) values (${user.id}, ${eventId}) on conflict do nothing`
  // 大会のお知らせも既読にして、掲示板の未読に残さない
  await sql`
    insert into post_reads (post_id, profile_id)
    select p.id, ${user.id} from posts p where p.event_id = ${eventId}
    on conflict do nothing`
  refresh()
}

/** 非表示を取り消す（ホームに戻す） */
export async function unhideRsvpTodo(eventId: string) {
  const user = await requireUser()
  await sql`delete from rsvp_hidden where profile_id = ${user.id} and event_id = ${eventId}`
  refresh()
}

/** 回答を取り消して未回答に戻す */
export async function clearRsvp(eventId: string, childId: string) {
  const user = await requireUser()
  const e = await loadRsvpEvent(eventId)
  if (!(await canActForChild(user, childId))) throw new Error('権限がありません')
  if (!user.isAdmin && !rsvpOpen(e)) throw new Error('部内締めを過ぎたため、変更は管理者にお問い合わせください')
  const r = await applyAnswer(e, user.id, childId, 'clear', 0)
  await notifyPromoted(e, r.promoted)
  refresh()
}

/** 管理者: 未回答の子の保護者・家族に催促を送る */
export async function nudgeUnanswered(eventId: string) {
  const user = await requireUser()
  assertAdmin(user)
  const e = await loadRsvpEvent(eventId)
  const targets = await eventTargetChildIds(eventId)
  const answered = new Set((await sql<{ child_id: string }[]>`select child_id from rsvps where event_id = ${eventId}`).map((r) => r.child_id))
  const pending = targets.filter((c) => !answered.has(c))
  const hiddenBy = new Set((await sql<{ profile_id: string }[]>`select profile_id from rsvp_hidden where event_id = ${eventId}`).map((r) => r.profile_id))
  const recipients = (await guardiansOf(pending)).filter((id) => !hiddenBy.has(id))
  notifyLater(recipients, 'reminder', {
    title: '参加する場合は申込をお願いします',
    body: `「${e.title}」（${fmtDateTime(e.starts_at)}）${e.member_deadline ? `の部内締めは ${fmtDateTime(e.member_deadline)} です` : 'の回答がまだです'}`,
    url: `/events/${eventId}`,
  })
  return { sent: recipients.length }
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
  const [child] = await sql<{ weekdays: number[] }[]>`select weekdays from children where id = ${v.childId}`
  const regular = !!child && isRegularDay(child.weekdays, e.starts_at)
  // 参加曜日以外の日（振替などで参加予定）を休むときは、参加の取り消しとして扱う（使った振替は戻る）
  if (!regular && v.kind === 'absent') {
    await sql.begin(async (tx) => {
      await tx`delete from practice_extras where event_id = ${v.eventId} and child_id = ${v.childId}`
      await tx`delete from makeup_credits where event_id = ${v.eventId} and child_id = ${v.childId} and reason = 'used'`
    })
    refresh()
    return
  }
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
  // 参加曜日の欠席は振替が1回たまる。遅刻・早退に変えたときは取り消す
  if (regular && v.kind === 'absent') await earnCredit(v.childId, v.eventId, 'absent', user.id)
  else await removeEarned(v.childId, v.eventId, ['absent'])
  refresh()
}

export async function withdrawAbsence(eventId: string, childId: string) {
  const user = await requireUser()
  if (!(await canActForChild(user, childId))) throw new Error('権限がありません')
  await sql`delete from absence_reports where event_id = ${eventId} and child_id = ${childId}`
  await removeEarned(childId, eventId, ['absent'])
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
