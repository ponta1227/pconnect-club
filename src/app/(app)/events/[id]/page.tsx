import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { sql } from '@/lib/db'
import { eventTargetChildIds, myChildren } from '@/lib/access'
import { getEvent, mapUrl } from '@/lib/events'
import { attachmentsFor } from '@/lib/files'
import { rsvpOpen } from '@/lib/event-rules'
import { fmtDateFull, fmtDateTime, fmtTime } from '@/lib/time'
import { Linkify, Page, PageHeader } from '@/components/ui'
import { AttachmentList } from '@/components/uploader'
import { IconClock, IconMap, IconUsers } from '@/components/icons'
import {
  AbsencePanel,
  AdminChildPicker,
  CancelArrivalButton,
  EventAdminActions,
  PaymentCell,
  RsvpPanel,
} from '@/components/event-panels'

export const metadata = { title: '予定' }

const KIND_LABEL = { absent: '欠席', late: '遅刻', early: '早退' } as const

export default async function EventPage({ params }: PageProps<'/events/[id]'>) {
  const user = await requireUser()
  const { id } = await params
  const e = await getEvent(id)
  if (!e) notFound()

  const [files, mine] = await Promise.all([attachmentsFor('event', [id]), myChildren(user)])
  const cancelled = e.status === 'cancelled'
  const venue = e.venue_name ?? e.venue_text
  const map = mapUrl(e.venue_address, venue)
  const canSeeOthers = !user.isChild

  // 参加登録
  const rsvps = e.uses_rsvp
    ? await sql<{ id: string; child_id: string; full_name: string; kana: string; grade: number; companions: number; status: 'going' | 'waitlist'; created_at: Date; paid: boolean; payment_note: string }[]>`
        select r.id, r.child_id, c.full_name, c.kana, c.grade, r.companions, r.status, r.created_at, r.paid, r.payment_note
        from rsvps r join children c on c.id = r.child_id
        where r.event_id = ${id} order by r.status, r.created_at`
    : []
  const myIds = new Set(mine.map((c) => c.id))
  const myRsvps = rsvps.filter((r) => myIds.has(r.child_id))

  const targets = user.isAdmin ? await eventTargetChildIds(id) : []
  const allTargetChildren = user.isAdmin && targets.length
    ? await sql<{ id: string; full_name: string }[]>`select id, full_name from children where id = any(${targets}::uuid[]) order by kana, full_name`
    : []
  const respondedIds = new Set(rsvps.map((r) => r.child_id))
  const unanswered = allTargetChildren.filter((c) => !respondedIds.has(c.id))

  // 到着・欠席
  const arrivals = e.uses_arrival && canSeeOthers
    ? await sql<{ id: string; child_id: string; full_name: string; arrived_at: Date; source: string }[]>`
        select a.id, a.child_id, c.full_name, a.arrived_at, a.source from arrivals a join children c on c.id = a.child_id
        where a.event_id = ${id} and a.cancelled_at is null order by a.arrived_at`
    : []
  const myArrivals = e.uses_arrival && user.isChild
    ? await sql<{ arrived_at: Date }[]>`select arrived_at from arrivals where event_id = ${id} and child_id = ${user.childAccount!.childId} and cancelled_at is null`
    : []
  const absences = e.uses_arrival
    ? await sql<{ child_id: string; full_name: string; kind: 'absent' | 'late' | 'early'; at_time: string; reason: string; reporter_kind: string; reporter: string | null; updated_at: Date }[]>`
        select ar.child_id, c.full_name, ar.kind, ar.at_time, ar.reason, ar.reporter_kind, p.display_name as reporter, ar.updated_at
        from absence_reports ar join children c on c.id = ar.child_id left join profiles p on p.id = ar.reported_by
        where ar.event_id = ${id} order by c.kana`
    : []
  const myAbsences = absences.filter((a) => myIds.has(a.child_id))
  const arrivedIds = new Set(arrivals.map((a) => a.child_id))

  const open = rsvpOpen(e)
  const going = rsvps.filter((r) => r.status === 'going')
  const waiting = rsvps.filter((r) => r.status === 'waitlist')

  return (
    <>
      <PageHeader
        title={e.type_name}
        back="/events"
        action={user.isAdmin ? <Link href={`/events/${id}/edit`} className="btn-secondary btn-sm">編集</Link> : undefined}
      />
      <Page className="space-y-4">
        <section className="card space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="badge text-white" style={{ background: e.type_color }}>{e.type_name}</span>
            {cancelled && <span className="badge bg-danger text-white">中止</span>}
            {e.class_names.map((n) => (
              <span key={n} className="badge bg-bg text-muted">{n}</span>
            ))}
          </div>
          <h2 className={`text-xl font-bold ${cancelled ? 'line-through opacity-60' : ''}`}>{e.title}</h2>
          <div className="space-y-1.5 text-sm">
            <p className="flex items-start gap-2">
              <IconClock className="h-5 w-5 shrink-0 text-muted" />
              <span>
                {fmtDateFull(e.starts_at)}
                <br />
                {e.all_day ? '終日' : `${fmtTime(e.starts_at)}${e.ends_at ? ` – ${fmtTime(e.ends_at)}` : ''}`}
              </span>
            </p>
            {venue && (
              <p className="flex items-start gap-2">
                <IconMap className="h-5 w-5 shrink-0 text-muted" />
                <span>
                  {venue}
                  {map && (
                    <a href={map} target="_blank" rel="noopener noreferrer" className="ml-2 text-brand underline">地図</a>
                  )}
                </span>
              </p>
            )}
          </div>
          {(e.meet_time || e.meet_place) && (
            <div className="rounded-xl bg-brand-soft px-3 py-2 text-sm">
              <b>集合</b> {e.meet_time} {e.meet_place}
            </div>
          )}
          {e.fee_note && (
            <div className="rounded-xl bg-bg px-3 py-2 text-sm">
              <p className="mb-0.5 text-xs font-bold text-muted">参加費・持ち物・服装など</p>
              <Linkify text={e.fee_note} />
            </div>
          )}
          {e.note && (
            <p className="text-sm">
              <Linkify text={e.note} />
            </p>
          )}
          <AttachmentList files={files.get(id) ?? []} />
        </section>

        {/* ---------------- 大会・イベントの参加 */}
        {e.uses_rsvp && !cancelled && (
          <section className="card space-y-3 p-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold">参加の受付</h3>
              <span className="text-sm text-muted">
                参加 {e.going}{e.capacity ? ` / 定員 ${e.capacity}` : ''}人{e.waitlist > 0 && `・待ち ${e.waitlist}`}
              </span>
            </div>
            {e.member_deadline && (
              <p className={`text-sm ${open ? 'text-danger' : 'text-muted'}`}>
                部内締め: {fmtDateTime(e.member_deadline)} {!open && '（締め切りました）'}
              </p>
            )}
            {user.isAdmin && e.entry_deadline && (
              <p className="text-xs text-muted">大会の申込締切（管理者のみ表示）: {fmtDateTime(e.entry_deadline)}</p>
            )}
            <RsvpPanel
              eventId={id}
              kids={mine.map((c) => ({ id: c.id, full_name: c.full_name }))}
              mine={myRsvps.map((r) => ({ child_id: r.child_id, status: r.status, companions: r.companions }))}
              open={open}
              allowCompanions={e.allow_companions}
              isAdmin={user.isAdmin}
            />
          </section>
        )}

        {e.uses_rsvp && canSeeOthers && rsvps.length > 0 && (
          <section className="card p-4">
            <h3 className="mb-2 flex items-center gap-1.5 font-bold">
              <IconUsers className="h-5 w-5" /> 参加者
            </h3>
            <ul className="divide-y divide-line">
              {[...going, ...waiting].map((r) => (
                <li key={r.id} className="space-y-1 py-2">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="flex-1 font-semibold">{r.full_name}</span>
                    {r.status === 'waitlist' && <span className="badge bg-warn-soft text-warn">待ち</span>}
                    {e.allow_companions && r.companions > 0 && <span className="text-xs text-muted">同行{r.companions}人</span>}
                    <span className="text-xs text-muted">{fmtDateTime(r.created_at)}</span>
                  </div>
                  {user.isAdmin && <PaymentCell rsvpId={r.id} paid={r.paid} note={r.payment_note} />}
                </li>
              ))}
            </ul>
          </section>
        )}

        {e.uses_rsvp && user.isAdmin && (
          <section className="card space-y-3 p-4">
            <h3 className="font-bold">管理者メニュー</h3>
            <div className="flex flex-wrap gap-2">
              <a href={`/api/events/${id}/participants.csv`} className="btn-secondary btn-sm">参加者CSV</a>
              <Link href={`/events/${id}/print`} className="btn-secondary btn-sm">印刷・PDF（A4）</Link>
            </div>
            <AdminChildPicker eventId={id} mode="rsvp" kids={unanswered} />
            <details>
              <summary className="cursor-pointer text-sm font-semibold">未反応 {unanswered.length}人</summary>
              <p className="mt-2 text-sm text-muted">{unanswered.map((c) => c.full_name).join('、') || 'なし'}</p>
            </details>
          </section>
        )}

        {/* ---------------- 練習：到着・欠席 */}
        {e.uses_arrival && !cancelled && (
          <section className="card space-y-3 p-4">
            <h3 className="font-bold">欠席・遅刻・早退の連絡</h3>
            {mine.length > 0 ? (
              <AbsencePanel
                eventId={id}
                kids={mine.map((c) => ({ id: c.id, full_name: c.full_name }))}
                reports={myAbsences.map((a) => ({ child_id: a.child_id, kind: a.kind, at_time: a.at_time, reason: a.reason }))}
              />
            ) : (
              <p className="text-sm text-muted">連絡できるお子さんが登録されていません。</p>
            )}
            {user.isChild && (
              <p className="text-sm">
                {myArrivals.length > 0 ? `✅ ${fmtTime(myArrivals[0].arrived_at)} に到着しました` : 'まだ到着していません'}
              </p>
            )}
          </section>
        )}

        {e.uses_arrival && canSeeOthers && (
          <section className="card p-4">
            <h3 className="mb-2 font-bold">到着済み {arrivals.length}人</h3>
            {arrivals.length === 0 ? (
              <p className="text-sm text-muted">まだ到着した人はいません。会場のタブレットで登録されます。</p>
            ) : (
              <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
                {arrivals.map((a) => (
                  <li key={a.id} className="flex items-center gap-1.5">
                    <span className="text-ok">●</span>
                    <span className="flex-1 truncate">{a.full_name}</span>
                    <span className="text-xs text-muted">{fmtTime(a.arrived_at)}</span>
                    {user.isAdmin && <CancelArrivalButton arrivalId={a.id} name={a.full_name} />}
                  </li>
                ))}
              </ul>
            )}
            {user.isAdmin && (
              <div className="mt-3">
                <AdminChildPicker eventId={id} mode="arrival" kids={allTargetChildren.filter((c) => !arrivedIds.has(c.id))} />
              </div>
            )}
          </section>
        )}

        {e.uses_arrival && user.isAdmin && (
          <section className="card p-4">
            <h3 className="mb-2 font-bold">欠席・遅刻・早退（管理者のみ） {absences.length}件</h3>
            {absences.length === 0 ? (
              <p className="text-sm text-muted">連絡はありません。</p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {absences.map((a) => (
                  <li key={a.child_id} className="py-2">
                    <div className="flex items-center gap-2">
                      <span className="badge bg-warn-soft text-warn">{KIND_LABEL[a.kind]}{a.at_time && ` ${a.at_time}`}</span>
                      <span className="flex-1 font-semibold">{a.full_name}</span>
                    </div>
                    {a.reason && <p className="mt-0.5 text-muted">{a.reason}</p>}
                    <p className="text-xs text-muted">
                      連絡者: {a.reporter_kind === 'child' ? '本人（子どもアカウント）' : (a.reporter ?? '—')}・{fmtDateTime(a.updated_at)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {user.isAdmin && (
          <section className="card p-4">
            <EventAdminActions eventId={id} cancelled={cancelled} series={!!e.series_id} />
          </section>
        )}
      </Page>
    </>
  )
}
