import 'server-only'
import { sql } from './db'

// 「いつもの練習」：曜日ごとの会場と時間。月間プランナーと予定の登録フォームが使う。

/** regular=参加曜日として選べる／dropin=都度参加（金曜など）／self=自主練 */
export type SlotMode = 'regular' | 'dropin' | 'self'
export type PracticeSlot = { weekday: number; venue_id: string | null; venue: string | null; start_time: string; end_time: string; mode: SlotMode }

export async function practiceSlots(): Promise<PracticeSlot[]> {
  return sql<PracticeSlot[]>`
    select s.weekday, s.venue_id, v.name as venue, s.start_time, s.end_time, s.mode
    from practice_slots s left join venues v on v.id = s.venue_id
    order by s.weekday`
}

/** 参加曜日として選べる曜日（金曜などの都度参加・自主練の曜日は選べない） */
export function selectableSlots(slots: PracticeSlot[]) {
  return slots.filter((s) => s.mode === 'regular')
}

/** 練習として扱う種別（到着登録の対象のうち、並び順が最初のもの） */
export async function practiceType(): Promise<{ id: string; name: string; color: string } | null> {
  const [t] = await sql<{ id: string; name: string; color: string }[]>`
    select id, name, color from event_types where uses_arrival order by sort, name limit 1`
  return t ?? null
}
