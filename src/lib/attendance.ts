import 'server-only'
import { sql } from './db'
import { monthRange } from './time'
import { computeAttendance, type Absence, type Arrival, type ChildInfo, type Practice } from './attendance-calc'

/** 月次出席集計（その月の、今日までに行われた練習が対象） */
export async function monthlyAttendance(year: number, month: number) {
  const { start, end } = monthRange(year, month)
  const until = end.getTime() < Date.now() ? end : new Date()
  const practices = await sql<Practice[]>`
    select e.id, coalesce((select array_agg(class_id) from event_classes ec where ec.event_id = e.id), '{}') as class_ids,
      coalesce(v.name, nullif(e.venue_text, ''), '（会場なし）') as venue
    from events e join event_types t on t.id = e.type_id left join venues v on v.id = e.venue_id
    where t.uses_arrival and e.status = 'active' and e.starts_at >= ${start} and e.starts_at < ${until}`
  // その月に在籍していた子（月の途中で在籍終了した子も含む）
  const children = await sql<ChildInfo[]>`
    select c.id, c.full_name, c.kana, c.grade,
      coalesce((select array_agg(cc.class_id order by cl.sort) from child_classes cc join classes cl on cl.id = cc.class_id where cc.child_id = c.id), '{}') as class_ids,
      coalesce((select array_agg(cl.name order by cl.sort) from child_classes cc join classes cl on cl.id = cc.class_id where cc.child_id = c.id), '{}') as class_names
    from children c
    where c.created_at < ${end} and (c.status = 'active' or c.left_at >= ${start})
    order by c.grade desc, c.kana`
  const ids = practices.map((p) => p.id)
  const [arrivals, absences] = ids.length
    ? await Promise.all([
        sql<Arrival[]>`select event_id, child_id from arrivals where event_id = any(${ids}::uuid[]) and cancelled_at is null`,
        sql<Absence[]>`select event_id, child_id, kind from absence_reports where event_id = any(${ids}::uuid[])`,
      ])
    : [[], []]
  return computeAttendance(practices, children, arrivals, absences)
}
