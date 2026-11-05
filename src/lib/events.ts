import 'server-only'
import { sql } from './db'

export type EventType = {
  id: string
  name: string
  color: string
  uses_rsvp: boolean
  uses_arrival: boolean
  remind: boolean
  sort: number
}

export type EventListItem = {
  id: string
  title: string
  starts_at: Date
  ends_at: Date | null
  all_day: boolean
  status: 'active' | 'cancelled'
  type_id: string
  type_name: string
  type_color: string
  uses_rsvp: boolean
  uses_arrival: boolean
  venue_name: string | null
  venue_text: string
  member_deadline: Date | null
  capacity: number | null
  going: number
  waitlist: number
  arrived: number
  class_names: string[]
}

export type EventDetail = EventListItem & {
  note: string
  meet_time: string
  meet_place: string
  fee_note: string
  entry_deadline: Date | null
  allow_companions: boolean
  venue_id: string | null
  venue_address: string | null
  series_id: string | null
  class_ids: string[]
  created_at: Date
  updated_at: Date
}

export async function eventTypes(): Promise<EventType[]> {
  return sql<EventType[]>`select id, name, color, uses_rsvp, uses_arrival, remind, sort from event_types order by sort, name`
}

export async function venues() {
  return sql<{ id: string; name: string; address: string; note: string }[]>`
    select id, name, address, note from venues order by sort, name`
}

export async function classes() {
  return sql<{ id: string; name: string }[]>`select id, name from classes order by sort, name`
}

export async function listEvents(from: Date, to: Date, opts: { classId?: string | null } = {}): Promise<EventListItem[]> {
  const classId = opts.classId ?? null
  return sql<EventListItem[]>`
    select e.id, e.title, e.starts_at, e.ends_at, e.all_day, e.status, e.type_id,
      t.name as type_name, t.color as type_color, t.uses_rsvp, t.uses_arrival,
      v.name as venue_name, e.venue_text, e.member_deadline, e.capacity,
      (select count(*)::int from rsvps r where r.event_id = e.id and r.status = 'going') as going,
      (select count(*)::int from rsvps r where r.event_id = e.id and r.status = 'waitlist') as waitlist,
      (select count(*)::int from arrivals a where a.event_id = e.id and a.cancelled_at is null) as arrived,
      coalesce((select array_agg(c.name order by c.sort) from event_classes ec join classes c on c.id = ec.class_id where ec.event_id = e.id), '{}') as class_names
    from events e
    join event_types t on t.id = e.type_id
    left join venues v on v.id = e.venue_id
    where e.starts_at >= ${from} and e.starts_at < ${to}
      and (${classId}::uuid is null
        or not exists (select 1 from event_classes ec where ec.event_id = e.id)
        or exists (select 1 from event_classes ec where ec.event_id = e.id and ec.class_id = ${classId}::uuid))
    order by e.starts_at, t.sort`
}

export async function getEvent(id: string): Promise<EventDetail | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null
  const [row] = await sql<EventDetail[]>`
    select e.id, e.title, e.starts_at, e.ends_at, e.all_day, e.status, e.type_id,
      t.name as type_name, t.color as type_color, t.uses_rsvp, t.uses_arrival,
      v.name as venue_name, v.address as venue_address, e.venue_id, e.venue_text,
      e.member_deadline, e.entry_deadline, e.capacity, e.allow_companions,
      e.note, e.meet_time, e.meet_place, e.fee_note, e.series_id, e.created_at, e.updated_at,
      (select count(*)::int from rsvps r where r.event_id = e.id and r.status = 'going') as going,
      (select count(*)::int from rsvps r where r.event_id = e.id and r.status = 'waitlist') as waitlist,
      (select count(*)::int from arrivals a where a.event_id = e.id and a.cancelled_at is null) as arrived,
      coalesce((select array_agg(c.name order by c.sort) from event_classes ec join classes c on c.id = ec.class_id where ec.event_id = e.id), '{}') as class_names,
      coalesce((select array_agg(ec.class_id) from event_classes ec where ec.event_id = e.id), '{}') as class_ids
    from events e
    join event_types t on t.id = e.type_id
    left join venues v on v.id = e.venue_id
    where e.id = ${id}`
  return row ?? null
}

/** 今日（日本時間）の練習（到着登録の対象）。1日1練習の前提で、最初の1件 */
export async function todaysPractice(dayStart: Date, dayEnd: Date) {
  const [row] = await sql<{ id: string; title: string; starts_at: Date; ends_at: Date | null; venue_name: string | null; venue_text: string; status: string }[]>`
    select e.id, e.title, e.starts_at, e.ends_at, v.name as venue_name, e.venue_text, e.status
    from events e join event_types t on t.id = e.type_id left join venues v on v.id = e.venue_id
    where t.uses_arrival and e.starts_at >= ${dayStart} and e.starts_at < ${dayEnd} and e.status = 'active'
    order by e.starts_at limit 1`
  return row ?? null
}

export function mapUrl(address: string | null | undefined, name: string | null | undefined): string | null {
  const q = (address && address.trim()) || (name && name.trim())
  if (!q) return null
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
}

export function venueLabel(e: { venue_name: string | null; venue_text: string }): string {
  return e.venue_name ?? e.venue_text ?? ''
}
