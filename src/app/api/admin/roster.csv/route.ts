import { getCurrentUser } from '@/lib/auth'
import { sql } from '@/lib/db'
import { csvResponse, toCsv } from '@/lib/csv'
import { gradeLabel } from '@/lib/grades'
import { jstDateStr } from '@/lib/time'

const STATUS = { active: '在籍', left: '在籍終了', graduated: '卒業' } as Record<string, string>

export async function GET() {
  const user = await getCurrentUser()
  if (!user?.isAdmin) return new Response('Forbidden', { status: 403 })
  const rows = await sql<{ full_name: string; kana: string; grade: number; status: string; classes: string[]; guardians: string[] }[]>`
    select c.full_name, c.kana, c.grade, c.status,
      coalesce((select array_agg(cl.name order by cl.sort) from child_classes cc join classes cl on cl.id = cc.class_id where cc.child_id = c.id), '{}') as classes,
      coalesce((select array_agg(p.display_name) from guardian_children gc join profiles p on p.id = gc.profile_id where gc.child_id = c.id and gc.status = 'approved' and p.deleted_at is null), '{}') as guardians
    from children c order by c.status, c.grade desc, c.kana`
  const body = toCsv([
    ['氏名', 'よみがな', '学年', 'クラス', '在籍', '保護者'],
    ...rows.map((r) => [r.full_name, r.kana, gradeLabel(r.grade), r.classes.join('・'), STATUS[r.status], r.guardians.join('・')]),
  ])
  return csvResponse(`名簿_${jstDateStr(new Date())}.csv`, body)
}
