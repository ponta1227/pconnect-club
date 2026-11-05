import 'server-only'
import { sql } from './db'

export type ParticipantRow = {
  full_name: string
  kana: string
  grade: number
  class_names: string[]
  status: 'going' | 'waitlist'
  companions: number
  created_at: Date
  guardians: string[]
  paid: boolean
  payment_note: string
}

/** 参加者一覧（管理者の出力用） */
export async function participants(eventId: string): Promise<ParticipantRow[]> {
  return sql<ParticipantRow[]>`
    select c.full_name, c.kana, c.grade,
      coalesce((select array_agg(cl.name order by cl.sort) from child_classes cc join classes cl on cl.id = cc.class_id where cc.child_id = c.id), '{}') as class_names,
      r.status, r.companions, r.created_at,
      coalesce((select array_agg(p.display_name order by p.display_name) from guardian_children gc join profiles p on p.id = gc.profile_id
        where gc.child_id = c.id and gc.status = 'approved' and p.deleted_at is null), '{}') as guardians,
      r.paid, r.payment_note
    from rsvps r join children c on c.id = r.child_id
    where r.event_id = ${eventId}
    order by r.status, c.grade desc, c.kana`
}
