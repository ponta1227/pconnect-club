import 'server-only'
import { sql } from './db'
import { guardiansOf } from './access'
import { notifyLater } from './notify'
import { fmtTime } from './time'

/** 到着を記録し、その子の保護者・家族に通知（子どもアカウントには送らない）。二重登録は無視 */
export async function recordArrival(eventId: string, childId: string, source: 'kiosk' | 'manual', by: string | null) {
  const [row] = await sql<{ arrived_at: Date }[]>`
    insert into arrivals (event_id, child_id, source, created_by)
    select ${eventId}, ${childId}, ${source}, ${by}
    where exists (select 1 from children where id = ${childId} and status = 'active')
    on conflict (event_id, child_id) where cancelled_at is null do nothing
    returning arrived_at`
  if (!row) return { created: false }
  const [child] = await sql<{ full_name: string }[]>`select full_name from children where id = ${childId}`
  notifyLater(await guardiansOf([childId]), 'arrival', {
    title: `${child.full_name}さんが到着しました`,
    body: `${fmtTime(row.arrived_at)} に練習会場に到着しました`,
    url: `/events/${eventId}`,
  }, { bypassQuiet: true })
  return { created: true }
}
