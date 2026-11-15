import 'server-only'
import { sql } from './db'
import { eventTargetChildIds } from './access'
import { jstParts } from './time'

/*
 * 参加曜日と振替
 * - 子どもごとに「参加曜日」を持つ。その曜日の練習は、何もしなくても参加扱い。
 * - 参加曜日の練習を休むと、振替が1回たまる（欠席連絡・連絡なしで来なかった・クラブ都合の休み）。遅刻・早退ではたまらない。
 * - 参加曜日が1日の人は、ほかの曜日に来るとき振替を1回使う。2日以上の人は使わずに「参加する」を押すだけ。
 * - 振替に期限はない。残り回数 = makeup_credits.delta の合計。
 */

export type Plan = 'none' | 'weekly1' | 'weekly2plus'

export function planOf(weekdays: number[]): Plan {
  if (weekdays.length === 0) return 'none'
  return weekdays.length === 1 ? 'weekly1' : 'weekly2plus'
}

export function isRegularDay(weekdays: number[], startsAt: Date): boolean {
  return weekdays.includes(jstParts(startsAt).dow)
}

export async function creditBalances(childIds: string[]): Promise<Map<string, number>> {
  if (childIds.length === 0) return new Map()
  const rows = await sql<{ child_id: string; balance: number }[]>`
    select child_id, coalesce(sum(delta), 0)::int as balance from makeup_credits
    where child_id = any(${childIds}::uuid[]) group by child_id`
  return new Map(rows.map((r) => [r.child_id, r.balance]))
}

type Practice = { id: string; starts_at: Date; ends_at: Date | null; status: string; uses_arrival: boolean }

export async function loadPractice(eventId: string): Promise<Practice | null> {
  const [e] = await sql<Practice[]>`
    select e.id, e.starts_at, e.ends_at, e.status, t.uses_arrival
    from events e join event_types t on t.id = e.type_id where e.id = ${eventId}`
  return e && e.uses_arrival ? e : null
}

export function practiceEnded(e: { starts_at: Date; ends_at: Date | null }, now = new Date()) {
  const end = e.ends_at ?? new Date(e.starts_at.getTime() + 2 * 3600_000)
  return end.getTime() <= now.getTime()
}

/** この練習が参加曜日にあたる（対象クラスにも入っている）子 */
export async function regularChildrenFor(e: Practice): Promise<string[]> {
  const targets = await eventTargetChildIds(e.id)
  if (targets.length === 0) return []
  const dow = jstParts(e.starts_at).dow
  const rows = await sql<{ id: string }[]>`
    select id from children where id = any(${targets}::uuid[]) and status = 'active' and ${dow}::int = any(weekdays)`
  return rows.map((r) => r.id)
}

/** 振替を1回ためる（同じ練習で二重にはたまらない） */
export async function earnCredit(childId: string, eventId: string, reason: 'absent' | 'no_show' | 'club_cancel', by: string | null = null) {
  await sql`
    insert into makeup_credits (child_id, event_id, delta, reason, created_by)
    values (${childId}, ${eventId}, 1, ${reason}, ${by})
    on conflict (child_id, event_id) where delta > 0 and event_id is not null do nothing`
}

/** ためた振替を取り消す（欠席連絡の取り消し・到着の手動登録・練習ありに戻したとき） */
export async function removeEarned(childId: string | null, eventId: string, reasons: ('absent' | 'no_show' | 'club_cancel')[]) {
  await sql`
    delete from makeup_credits
    where event_id = ${eventId} and delta > 0 and reason = any(${reasons}::text[])
      and (${childId}::uuid is null or child_id = ${childId}::uuid)`
}

/** 練習が中止（休み）になったとき: 参加曜日の子に振替をため、振替を使って参加予定だった子には返す */
export async function onPracticeCancelled(eventId: string, by: string | null) {
  const e = await loadPractice(eventId)
  if (!e) return
  for (const childId of await regularChildrenFor(e)) await earnCredit(childId, eventId, 'club_cancel', by)
  await sql`delete from makeup_credits where event_id = ${eventId} and reason = 'used'`
  await sql`delete from practice_extras where event_id = ${eventId}`
}

/** 休みを取り消して練習ありに戻したとき */
export async function onPracticeRestored(eventId: string) {
  await removeEarned(null, eventId, ['club_cancel'])
}

/**
 * 練習が終わったあと、参加曜日なのに来なかった（到着登録も欠席連絡もない）子に振替をためる。
 * 毎日の定期処理から呼ぶ。直近2週間の練習が対象。
 */
export async function settleNoShows(now = new Date()): Promise<number> {
  const practices = await sql<Practice[]>`
    select e.id, e.starts_at, e.ends_at, e.status, t.uses_arrival
    from events e join event_types t on t.id = e.type_id
    where t.uses_arrival and e.status = 'active'
      and e.starts_at > ${now}::timestamptz - interval '14 days' and e.starts_at < ${now}::timestamptz`
  let added = 0
  for (const e of practices) {
    if (!practiceEnded(e, now)) continue
    const regular = await regularChildrenFor(e)
    if (regular.length === 0) continue
    const rows = await sql<{ id: string }[]>`
      select c.id from children c
      where c.id = any(${regular}::uuid[])
        and not exists (select 1 from arrivals a where a.event_id = ${e.id} and a.child_id = c.id and a.cancelled_at is null)
        and not exists (select 1 from absence_reports r where r.event_id = ${e.id} and r.child_id = c.id and r.kind in ('late', 'early'))
        and not exists (select 1 from makeup_credits m where m.event_id = ${e.id} and m.child_id = c.id and m.delta > 0)`
    for (const r of rows) {
      await earnCredit(r.id, e.id, 'no_show')
      added++
    }
  }
  return added
}

export type PracticeKid = {
  id: string
  full_name: string
  weekdays: number[]
  plan: Plan
  regular: boolean
  extra: { uses_credit: boolean } | null
  balance: number
  arrived: string | null
  report: { kind: 'absent' | 'late' | 'early'; at_time: string; reason: string } | null
}

/** ある練習についての、指定した子どもたちの状況（参加曜日か・振替での参加・残り回数・到着・欠席連絡） */
export async function practiceKidsFor(
  e: { id: string; starts_at: Date },
  kids: { id: string; full_name: string }[],
  fmtArrival: (d: Date) => string,
): Promise<PracticeKid[]> {
  if (kids.length === 0) return []
  const ids = kids.map((k) => k.id)
  const [rows, balances] = await Promise.all([
    sql<{ id: string; weekdays: number[]; arrived_at: Date | null; uses_credit: boolean | null; kind: 'absent' | 'late' | 'early' | null; at_time: string | null; reason: string | null }[]>`
      select c.id, c.weekdays,
        (select arrived_at from arrivals a where a.event_id = ${e.id} and a.child_id = c.id and a.cancelled_at is null) as arrived_at,
        px.uses_credit, ar.kind, ar.at_time, ar.reason
      from children c
      left join practice_extras px on px.event_id = ${e.id} and px.child_id = c.id
      left join absence_reports ar on ar.event_id = ${e.id} and ar.child_id = c.id
      where c.id = any(${ids}::uuid[])`,
    creditBalances(ids),
  ])
  return kids.map((k) => {
    const r = rows.find((x) => x.id === k.id)
    const weekdays = r?.weekdays ?? []
    return {
      id: k.id,
      full_name: k.full_name,
      weekdays,
      plan: planOf(weekdays),
      regular: isRegularDay(weekdays, e.starts_at),
      extra: r?.uses_credit == null ? null : { uses_credit: r.uses_credit },
      balance: balances.get(k.id) ?? 0,
      arrived: r?.arrived_at ? fmtArrival(r.arrived_at) : null,
      report: r?.kind ? { kind: r.kind, at_time: r.at_time ?? '', reason: r.reason ?? '' } : null,
    }
  })
}

/** 管理者向け: ある練習に参加予定の子（参加曜日の子＋追加で参加する子−欠席連絡のあった子） */
export async function expectedAttendees(eventId: string) {
  const e = await loadPractice(eventId)
  if (!e) return []
  const regular = await regularChildrenFor(e)
  return sql<{ id: string; full_name: string; kind: 'regular' | 'credit' | 'extra' }[]>`
    select c.id, c.full_name,
      case when px.child_id is null then 'regular' when px.uses_credit then 'credit' else 'extra' end as kind
    from children c
    left join practice_extras px on px.event_id = ${eventId} and px.child_id = c.id
    where c.status = 'active'
      and (c.id = any(${regular}::uuid[]) or px.child_id is not null)
      and not exists (select 1 from absence_reports r where r.event_id = ${eventId} and r.child_id = c.id and r.kind = 'absent')
    order by c.kana, c.full_name`
}
