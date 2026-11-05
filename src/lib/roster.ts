import 'server-only'
import { sql } from './db'
import { gradeLabel } from './grades'

export async function rosterForLinking() {
  const rows = await sql<{ id: string; full_name: string; kana: string; grade: number }[]>`
    select id, full_name, kana, grade from children where status = 'active' order by kana, full_name`
  return rows.map((r) => ({ id: r.id, full_name: r.full_name, kana: r.kana, grade_label: gradeLabel(r.grade) }))
}

export async function myLinks(profileId: string) {
  return sql<{ child_id: string; status: 'pending' | 'approved' }[]>`
    select child_id, status from guardian_children where profile_id = ${profileId}`
}
