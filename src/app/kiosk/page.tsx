import type { Metadata } from 'next'
import { sql } from '@/lib/db'
import { kioskSessionValid } from '@/lib/kiosk'
import { todaysPractice } from '@/lib/events'
import { eventTargetChildIds } from '@/lib/access'
import { addDays, fmtDateFull, fmtTime, startOfJstDay } from '@/lib/time'
import { KioskBoard, KioskUnlock } from '@/components/kiosk'

export const metadata: Metadata = { title: '到着登録', manifest: undefined }

// 会場の共用タブレット用画面。ログイン不要だが、管理者が設定したPINで開始しないと使えない。
export default async function KioskPage() {
  const unlocked = await kioskSessionValid()
  if (!unlocked) return <KioskUnlock />

  const now = new Date()
  const dayStart = startOfJstDay(now)
  const practice = await todaysPractice(dayStart, addDays(dayStart, 1))
  if (!practice) {
    return (
      <KioskBoard
        title={fmtDateFull(now)}
        sub="今日の練習はありません"
        kids={[]}
        classes={[]}
      />
    )
  }
  const targets = await eventTargetChildIds(practice.id)
  const kids = targets.length
    ? await sql<{ id: string; full_name: string; kana: string; class_ids: string[]; arrived_at: Date | null }[]>`
        select c.id, c.full_name, c.kana,
          coalesce((select array_agg(class_id) from child_classes cc where cc.child_id = c.id), '{}') as class_ids,
          (select arrived_at from arrivals a where a.event_id = ${practice.id} and a.child_id = c.id and a.cancelled_at is null) as arrived_at
        from children c where c.id = any(${targets}::uuid[])
        order by c.kana, c.full_name`
    : []
  const classes = await sql<{ id: string; name: string }[]>`
    select distinct cl.id, cl.name, cl.sort from classes cl join child_classes cc on cc.class_id = cl.id
    where cc.child_id = any(${targets}::uuid[]) order by cl.sort, cl.name`

  return (
    <KioskBoard
      title={`${fmtDateFull(now)} ${fmtTime(practice.starts_at)}〜`}
      sub={practice.venue_name ?? practice.venue_text ?? ''}
      kids={kids.map((k) => ({ id: k.id, full_name: k.full_name, kana: k.kana, class_ids: k.class_ids, arrived: k.arrived_at ? fmtTime(k.arrived_at) : null }))}
      classes={classes.map((c) => ({ id: c.id, name: c.name }))}
    />
  )
}
