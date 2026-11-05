import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { classes as listClasses, listEvents, type EventListItem } from '@/lib/events'
import { addDays, daysInMonth, fmtDate, fromJst, jstDateStr, jstParts, monthRange, startOfJstDay } from '@/lib/time'
import { Empty, Page, PageHeader } from '@/components/ui'
import { EventCard } from '@/components/event-card'
import { IconPlus } from '@/components/icons'

export const metadata = { title: '予定' }

const DOW = ['日', '月', '火', '水', '木', '金', '土']

export default async function EventsPage({ searchParams }: PageProps<'/events'>) {
  const user = await requireUser()
  const sp = await searchParams
  const view = sp.view === 'list' ? 'list' : 'month'
  const classId = typeof sp.class === 'string' && /^[0-9a-f-]{36}$/.test(sp.class) ? sp.class : null
  const today = jstDateStr(new Date())
  const cls = await listClasses()

  const qs = (over: Record<string, string | null>) => {
    const p = new URLSearchParams()
    const base: Record<string, string | null> = { view, class: classId, ym: typeof sp.ym === 'string' ? sp.ym : null, date: typeof sp.date === 'string' ? sp.date : null }
    for (const [k, v] of Object.entries({ ...base, ...over })) if (v) p.set(k, v)
    const s = p.toString()
    return s ? `?${s}` : ''
  }

  const header = (
    <PageHeader
      title="予定"
      action={
        user.isAdmin ? (
          <Link href={`/events/new${typeof sp.date === 'string' ? `?date=${sp.date}` : ''}`} className="btn-primary btn-sm">
            <IconPlus className="h-5 w-5" />
            登録
          </Link>
        ) : undefined
      }
    />
  )

  const toolbar = (
    <div className="mb-3 flex items-center gap-2">
      <div className="flex rounded-xl border border-line bg-white p-0.5 text-sm font-semibold">
        <Link href={`/events${qs({ view: 'month' })}`} className={`rounded-lg px-3 py-1.5 ${view === 'month' ? 'bg-brand text-white' : 'text-muted'}`}>月</Link>
        <Link href={`/events${qs({ view: 'list', ym: null, date: null })}`} className={`rounded-lg px-3 py-1.5 ${view === 'list' ? 'bg-brand text-white' : 'text-muted'}`}>リスト</Link>
      </div>
      {cls.length > 0 && (
        <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
          <Link href={`/events${qs({ class: null })}`} className={`badge shrink-0 border px-3 py-1.5 ${!classId ? 'border-brand bg-brand-soft text-brand' : 'border-line bg-white text-muted'}`}>すべて</Link>
          {cls.map((c) => (
            <Link key={c.id} href={`/events${qs({ class: c.id })}`} className={`badge shrink-0 border px-3 py-1.5 ${classId === c.id ? 'border-brand bg-brand-soft text-brand' : 'border-line bg-white text-muted'}`}>
              {c.name}
            </Link>
          ))}
        </div>
      )}
    </div>
  )

  if (view === 'list') {
    const from = startOfJstDay(new Date())
    const events = await listEvents(from, addDays(from, 62), { classId })
    const groups = new Map<string, EventListItem[]>()
    for (const e of events) groups.set(jstDateStr(e.starts_at), [...(groups.get(jstDateStr(e.starts_at)) ?? []), e])
    return (
      <>
        {header}
        <Page>
          {toolbar}
          {events.length === 0 && <Empty>今後2か月の予定はありません</Empty>}
          <div className="space-y-4">
            {[...groups].map(([d, list]) => (
              <section key={d}>
                <h2 className="section-title pt-0">{d === today ? `今日 ${fmtDate(fromJst(d))}` : fmtDate(fromJst(d))}</h2>
                <div className="space-y-2">
                  {list.map((e) => <EventCard key={e.id} e={e} />)}
                </div>
              </section>
            ))}
          </div>
        </Page>
      </>
    )
  }

  // 月表示
  const ym = typeof sp.ym === 'string' && /^\d{4}-\d{2}$/.test(sp.ym) ? sp.ym : today.slice(0, 7)
  const [year, month] = ym.split('-').map(Number)
  const { start, end } = monthRange(year, month)
  const events = await listEvents(start, end, { classId })
  const byDate = new Map<string, EventListItem[]>()
  for (const e of events) byDate.set(jstDateStr(e.starts_at), [...(byDate.get(jstDateStr(e.starts_at)) ?? []), e])

  const firstDow = jstParts(start).dow
  const days = daysInMonth(year, month)
  const cells: (string | null)[] = [...Array(firstDow).fill(null)]
  for (let d = 1; d <= days; d++) cells.push(`${ym}-${String(d).padStart(2, '0')}`)
  while (cells.length % 7) cells.push(null)

  const prev = month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`
  const next = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`
  const selected = typeof sp.date === 'string' && sp.date.startsWith(ym) ? sp.date : today.startsWith(ym) ? today : null
  const selectedEvents = selected ? (byDate.get(selected) ?? []) : []

  return (
    <>
      {header}
      <Page>
        {toolbar}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-2 py-2">
            <Link href={`/events${qs({ ym: prev, date: null })}`} className="btn-ghost btn-sm" aria-label="前の月">‹</Link>
            <span className="font-bold">{year}年{month}月</span>
            <Link href={`/events${qs({ ym: next, date: null })}`} className="btn-ghost btn-sm" aria-label="次の月">›</Link>
          </div>
          <div className="grid grid-cols-7 border-t border-line text-center text-[0.7rem] font-bold text-muted">
            {DOW.map((d, i) => (
              <div key={d} className={`py-1 ${i === 0 ? 'text-danger' : i === 6 ? 'text-brand' : ''}`}>{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((d, i) => {
              if (!d) return <div key={i} className="min-h-14 border-t border-line bg-bg/50" />
              const list = byDate.get(d) ?? []
              const isSel = d === selected
              const dow = i % 7
              return (
                <Link
                  key={d}
                  href={`/events${qs({ ym, date: d })}`}
                  className={`min-h-14 border-t border-line px-0.5 pt-1 text-center ${isSel ? 'bg-brand-soft' : ''}`}
                >
                  <span
                    className={`mx-auto flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                      d === today ? 'bg-brand text-white' : dow === 0 ? 'text-danger' : dow === 6 ? 'text-brand' : ''
                    }`}
                  >
                    {Number(d.slice(8))}
                  </span>
                  <span className="mt-0.5 flex flex-wrap justify-center gap-0.5">
                    {list.slice(0, 3).map((e) => (
                      <span key={e.id} className="h-1.5 w-1.5 rounded-full" style={{ background: e.status === 'cancelled' ? '#c0c6cf' : e.type_color }} />
                    ))}
                  </span>
                </Link>
              )
            })}
          </div>
        </div>

        {selected && (
          <section className="mt-4">
            <div className="flex items-center justify-between">
              <h2 className="section-title">{fmtDate(fromJst(selected))}</h2>
              {user.isAdmin && (
                <Link href={`/events/new?date=${selected}`} className="btn-ghost btn-sm">＋ この日に登録</Link>
              )}
            </div>
            {selectedEvents.length === 0 ? (
              <Empty>予定はありません</Empty>
            ) : (
              <div className="space-y-2">
                {selectedEvents.map((e) => <EventCard key={e.id} e={e} />)}
              </div>
            )}
          </section>
        )}
      </Page>
    </>
  )
}
