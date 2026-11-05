import type { NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { monthlyAttendance } from '@/lib/attendance'
import { csvResponse, toCsv } from '@/lib/csv'
import { gradeLabel } from '@/lib/grades'

export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user?.isAdmin) return new Response('Forbidden', { status: 403 })
  const ym = req.nextUrl.searchParams.get('ym') ?? ''
  if (!/^\d{4}-\d{2}$/.test(ym)) return new Response('ym=YYYY-MM を指定してください', { status: 400 })
  const [year, month] = ym.split('-').map(Number)
  const data = await monthlyAttendance(year, month)
  const body = toCsv([
    [`${year}年${month}月 出席集計`, `練習${data.practiceCount}回`],
    [],
    ['氏名', 'よみがな', '学年', 'クラス', '出席回数', '対象練習回数', '出席率(%)', '欠席', '遅刻', '早退'],
    ...data.rows.map((r) => [r.child.full_name, r.child.kana, gradeLabel(r.child.grade), r.child.class_names.join('・'), r.attended, r.eligible, r.rate ?? '', r.absent, r.late, r.early]),
    [],
    ['クラス', '人数', '出席のべ', '出席率(%)'],
    ...data.classes.map((c) => [c.name, c.children, c.attended, c.rate ?? '']),
    [],
    ['会場', '練習回数', '到着のべ', '平均人数'],
    ...data.venues.map((v) => [v.venue, v.practices, v.arrivals, v.average]),
  ])
  return csvResponse(`出席集計_${ym}.csv`, body)
}
