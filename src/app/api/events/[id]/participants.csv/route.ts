import { getCurrentUser } from '@/lib/auth'
import { csvResponse, toCsv } from '@/lib/csv'
import { getEvent } from '@/lib/events'
import { gradeLabel } from '@/lib/grades'
import { participants } from '@/lib/participants'
import { fmtDateTime, jstDateStr } from '@/lib/time'

export async function GET(_req: Request, ctx: RouteContext<'/api/events/[id]/participants.csv'>) {
  const user = await getCurrentUser()
  if (!user?.isAdmin) return new Response('Forbidden', { status: 403 })
  const { id } = await ctx.params
  const e = await getEvent(id)
  if (!e) return new Response('Not found', { status: 404 })
  const rows = await participants(id)
  const body = toCsv([
    ['氏名', 'よみがな', '学年', 'クラス', '状態', '同行者数', '登録日時', '保護者', '入金', '支払いメモ'],
    ...rows.map((r) => [
      r.full_name,
      r.kana,
      gradeLabel(r.grade),
      r.class_names.join('・'),
      r.status === 'going' ? '参加' : 'キャンセル待ち',
      r.companions,
      fmtDateTime(r.created_at),
      r.guardians.join('・'),
      r.paid ? '済' : '',
      r.payment_note,
    ]),
  ])
  return csvResponse(`参加者_${jstDateStr(e.starts_at)}_${e.title}.csv`, body)
}
