import { requireAdmin } from '@/lib/auth'
import { sql } from '@/lib/db'
import { venues as listVenues } from '@/lib/events'
import { practiceSlots } from '@/lib/schedule'
import { saveSlots } from '@/app/actions/schedule'
import { daysInMonth, fromJst, jstDateStr, jstParts, jstTimeStr, monthRange } from '@/lib/time'
import { Page, PageHeader } from '@/components/ui'
import { SubmitButton } from '@/components/client'
import { Planner, type PlannerDay } from '@/components/planner'

export const metadata = { title: '練習日程' }

const DOW = ['日', '月', '火', '水', '木', '金', '土']
const ORDER = [1, 2, 3, 4, 5, 6, 0]
const pad = (n: number) => String(n).padStart(2, '0')

export default async function SchedulePage({ searchParams }: PageProps<'/admin/schedule'>) {
  await requireAdmin()
  const sp = await searchParams
  const today = jstDateStr(new Date())
  const ym = typeof sp.ym === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.ym) ? sp.ym : today.slice(0, 7)
  const [year, month] = ym.split('-').map(Number)
  const { start, end } = monthRange(year, month)

  const [events, slots, venues] = await Promise.all([
    sql<{ id: string; title: string; starts_at: Date; ends_at: Date | null; status: string; venue_id: string | null; venue: string; uses_arrival: boolean }[]>`
      select e.id, e.title, e.starts_at, e.ends_at, e.status, e.venue_id, coalesce(v.name, e.venue_text, '') as venue, t.uses_arrival
      from events e join event_types t on t.id = e.type_id left join venues v on v.id = e.venue_id
      where e.starts_at >= ${start} and e.starts_at < ${end}
      order by e.starts_at`,
    practiceSlots(),
    listVenues(),
  ])

  const days: PlannerDay[] = []
  for (let d = 1; d <= daysInMonth(year, month); d++) {
    const date = `${ym}-${pad(d)}`
    const todays = events.filter((e) => jstDateStr(e.starts_at) === date)
    const p = todays.find((e) => e.uses_arrival)
    days.push({
      date,
      day: d,
      dow: jstParts(fromJst(date)).dow,
      past: date < today,
      practice: p
        ? {
            id: p.id,
            start: jstTimeStr(p.starts_at),
            end: p.ends_at ? jstTimeStr(p.ends_at) : '',
            venue_id: p.venue_id,
            venue: p.venue,
            cancelled: p.status === 'cancelled',
          }
        : null,
      others: todays.filter((e) => !e.uses_arrival && e.status === 'active').map((e) => e.title),
    })
  }
  const fillable = days.filter((d) => !d.past && !d.practice && slots.some((s) => s.weekday === d.dow)).length
  const prev = month === 1 ? `${year - 1}-12` : `${year}-${pad(month - 1)}`
  const next = month === 12 ? `${year + 1}-01` : `${year}-${pad(month + 1)}`

  return (
    <>
      <PageHeader title="練習日程" back="/admin" />
      <Page className="space-y-4">
        <Planner
          ym={ym}
          label={`${year}年${month}月`}
          prev={prev}
          next={next}
          today={today}
          days={days}
          venues={venues.map((v) => ({ id: v.id, name: v.name }))}
          slots={slots.map((s) => ({ weekday: s.weekday, venue_id: s.venue_id, start_time: s.start_time, end_time: s.end_time }))}
          fillable={fillable}
        />

        <details className="card group">
          <summary className="flex min-h-12 cursor-pointer items-center gap-2 px-4 font-bold">
            <span className="flex-1">いつもの練習の曜日・時間</span>
            <span className="text-sm font-normal text-brand group-open:hidden">変更する</span>
          </summary>
          <form action={saveSlots} className="space-y-3 border-t border-line p-4">
            <p className="text-sm text-muted">ここで決めた内容が、「まとめて入れる」で使われます。すでに入っている予定は変わりません。</p>
            {ORDER.map((d) => {
              const s = slots.find((x) => x.weekday === d)
              return (
                <fieldset key={d} className="rounded-xl bg-bg p-3">
                  <label className="flex min-h-9 items-center gap-3 font-bold">
                    <input type="checkbox" name={`on_${d}`} defaultChecked={!!s} className="h-5 w-5" />
                    {DOW[d]}曜日に練習する
                  </label>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <input type="time" name={`start_${d}`} defaultValue={s?.start_time ?? '18:30'} className="input" aria-label={`${DOW[d]}曜日の開始`} />
                    <input type="time" name={`end_${d}`} defaultValue={s?.end_time ?? '20:30'} className="input" aria-label={`${DOW[d]}曜日の終了`} />
                    <select name={`venue_${d}`} defaultValue={s?.venue_id ?? venues[0]?.id ?? ''} className="input col-span-2" aria-label={`${DOW[d]}曜日の会場`}>
                      {venues.map((v) => (
                        <option key={v.id} value={v.id}>{v.name}</option>
                      ))}
                    </select>
                  </div>
                </fieldset>
              )
            })}
            <SubmitButton pendingText="保存中…">いつもの練習を保存</SubmitButton>
          </form>
        </details>
      </Page>
    </>
  )
}
