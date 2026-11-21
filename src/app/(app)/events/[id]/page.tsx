import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { sql } from '@/lib/db'
import { eventTargetChildIds, myChildren } from '@/lib/access'
import { getEvent, mapUrl } from '@/lib/events'
import { attachmentsFor } from '@/lib/files'
import { expectedAttendees, practiceEnded, practiceKidsFor } from '@/lib/makeup'
import { rsvpOpen } from '@/lib/event-rules'
import { fmtDate, fmtDateFull, fmtDateTime, fmtTime } from '@/lib/time'
import { Linkify, Page, PageHeader } from '@/components/ui'
import { AttachmentList } from '@/components/uploader'
import { IconMap } from '@/components/icons'
import { RsvpRows } from '@/components/rsvp'
import { AbsenceRows } from '@/components/absence'
import { AdminChildPicker, CancelArrivalButton, EventAdminActions, PaymentCell, UnansweredList } from '@/components/event-panels'

export const metadata = { title: '予定' }

const KIND_LABEL = { absent: '欠席', late: '遅刻', early: '早退' } as const
type Status = 'going' | 'waitlist' | 'declined'

export default async function EventPage({ params }: PageProps<'/events/[id]'>) {
  const user = await requireUser()
  const { id } = await params
  const e = await getEvent(id)
  if (!e) notFound()

  const [files, mine, [post]] = await Promise.all([
    attachmentsFor('event', [id]),
    myChildren(user),
    sql<{ id: string }[]>`select id from posts where event_id = ${id} and published_at is not null order by published_at limit 1`,
  ])
  const cancelled = e.status === 'cancelled'
  const venue = e.venue_name ?? e.venue_text
  const map = mapUrl(e.venue_address, venue)
  const canSeeOthers = !user.isChild
  const myIds = new Set(mine.map((c) => c.id))

  // ---- 参加・見送りの回答
  const rsvps = e.uses_rsvp
    ? await sql<{ id: string; child_id: string; full_name: string; companions: number; status: Status; created_at: Date; paid: boolean; payment_note: string }[]>`
        select r.id, r.child_id, c.full_name, r.companions, r.status, r.created_at, r.paid, r.payment_note
        from rsvps r join children c on c.id = r.child_id
        where r.event_id = ${id} order by r.created_at`
    : []
  const going = rsvps.filter((r) => r.status === 'going')
  const waiting = rsvps.filter((r) => r.status === 'waitlist')
  const declined = rsvps.filter((r) => r.status === 'declined')
  const open = rsvpOpen(e)
  const myKids = mine.map((c) => {
    const r = rsvps.find((x) => x.child_id === c.id)
    return { id: c.id, full_name: c.full_name, status: r?.status ?? null, companions: r?.companions ?? 0 }
  })

  // ---- 管理者：対象の子ども（未回答・到着の手動登録に使う）
  const targetIds = user.isAdmin ? await eventTargetChildIds(id) : []
  const targets = targetIds.length
    ? await sql<{ id: string; full_name: string; has_guardian: boolean }[]>`
        select c.id, c.full_name,
          exists (select 1 from guardian_children gc join profiles p on p.id = gc.profile_id
                  where gc.child_id = c.id and gc.status = 'approved' and p.deleted_at is null) as has_guardian
        from children c where c.id = any(${targetIds}::uuid[]) order by c.kana, c.full_name`
    : []
  const answeredIds = new Set(rsvps.map((r) => r.child_id))
  // 保護者が「非表示」にした子（＝今のところ参加しない）と、まだ何もしていない子に分ける
  const hiddenKidIds = targetIds.length
    ? new Set((await sql<{ child_id: string }[]>`
        select distinct gc.child_id from rsvp_hidden h join guardian_children gc on gc.profile_id = h.profile_id and gc.status = 'approved'
        where h.event_id = ${id} and gc.child_id = any(${targetIds}::uuid[])`).map((r) => r.child_id))
    : new Set<string>()
  const notJoined = targets.filter((c) => !answeredIds.has(c.id))
  const hiddenKids = notJoined.filter((c) => hiddenKidIds.has(c.id))
  const unanswered = notJoined.filter((c) => !hiddenKidIds.has(c.id))

  // ---- 練習：到着・欠席
  const arrivals = e.uses_arrival
    ? await sql<{ id: string; child_id: string; full_name: string; arrived_at: Date }[]>`
        select a.id, a.child_id, c.full_name, a.arrived_at from arrivals a join children c on c.id = a.child_id
        where a.event_id = ${id} and a.cancelled_at is null
          and (${canSeeOthers}::bool or a.child_id = any(${[...myIds]}::uuid[]))
        order by a.arrived_at`
    : []
  const absences = e.uses_arrival
    ? await sql<{ child_id: string; full_name: string; kind: 'absent' | 'late' | 'early'; at_time: string; reason: string; reporter_kind: string; reporter: string | null; updated_at: Date }[]>`
        select ar.child_id, c.full_name, ar.kind, ar.at_time, ar.reason, ar.reporter_kind, p.display_name as reporter, ar.updated_at
        from absence_reports ar join children c on c.id = ar.child_id left join profiles p on p.id = ar.reported_by
        where ar.event_id = ${id}
          and (${user.isAdmin}::bool or ar.child_id = any(${[...myIds]}::uuid[]))
        order by c.kana`
    : []
  const arrivedIds = new Set(arrivals.map((a) => a.child_id))
  const absenceKids = e.uses_arrival ? await practiceKidsFor(e, mine, fmtTime) : []
  const expected = e.uses_arrival && user.isAdmin && !cancelled ? await expectedAttendees(id) : []
  const ended = practiceEnded(e)
  const othersArrivals = canSeeOthers ? arrivals : []

  return (
    <>
      <PageHeader
        title={e.type_name}
        back="/events"
        action={user.isAdmin ? <Link href={`/events/${id}/edit`} className="btn-secondary btn-sm">編集</Link> : undefined}
      />
      <Page className="space-y-4">
        {/* ---------------- 予定の内容 */}
        <section className="card overflow-hidden">
          <div className="h-1.5" style={{ background: cancelled ? '#9aa3af' : e.type_color }} />
          <div className="space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
              <span className="rounded-md px-1.5 py-0.5 text-white" style={{ background: e.type_color }}>{e.type_name}</span>
              {cancelled && <span className="rounded-md bg-danger px-1.5 py-0.5 text-white">中止</span>}
              {e.class_names.map((n) => (
                <span key={n} className="rounded-md bg-bg px-1.5 py-0.5 text-muted">{n}</span>
              ))}
            </div>
            <h2 className={`text-[1.4rem] font-bold leading-snug ${cancelled ? 'line-through opacity-60' : ''}`}>{e.title}</h2>
            <div>
              <p className="text-sm text-muted">{fmtDateFull(e.starts_at)}</p>
              <p className="num text-3xl leading-tight">
                {e.all_day ? <span className="text-xl font-bold">終日</span> : `${fmtTime(e.starts_at)}${e.ends_at ? ` – ${fmtTime(e.ends_at)}` : ''}`}
              </p>
            </div>
            {venue && (
              <p className="flex items-center gap-2">
                <IconMap className="h-5 w-5 shrink-0 text-muted" />
                <span className="font-semibold">{venue}</span>
                {map && (
                  <a href={map} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-brand underline">地図を開く</a>
                )}
              </p>
            )}
            {(e.meet_time || e.meet_place) && (
              <div className="rounded-xl bg-brand-soft px-3 py-2 text-[0.95rem]">
                <b>集合</b>　{e.meet_time} {e.meet_place}
              </div>
            )}
            {e.fee_note && (
              <div className="rounded-xl bg-bg px-3 py-2 text-[0.95rem]">
                <p className="mb-0.5 text-xs font-bold text-muted">参加費・持ち物・服装など</p>
                <Linkify text={e.fee_note} />
              </div>
            )}
            {e.note && (
              <p className="text-[0.95rem] leading-7">
                <Linkify text={e.note} />
              </p>
            )}
            <AttachmentList files={files.get(id) ?? []} />
            {post && (
              <Link href={`/board/${post.id}`} className="block text-sm font-semibold text-brand underline">
                この予定のお知らせ（掲示板）を見る
              </Link>
            )}
          </div>
        </section>

        {/* ---------------- 大会・イベント：参加の回答 */}
        {e.uses_rsvp && !cancelled && !(user.isAdmin && myKids.length === 0) && (
          <section className={open && myKids.some((k) => k.status === null) ? 'todo-card' : 'card'}>
            <div className="space-y-3 p-4">
              <div>
                <h3 className="text-lg font-bold">参加しますか？</h3>
                {e.member_deadline ? (
                  <p className={`text-sm ${open ? 'text-ball-ink' : 'text-muted'}`}>
                    回答は <b>{fmtDateTime(e.member_deadline)}</b> まで{!open && '（締め切りました。変更は管理者へ）'}
                  </p>
                ) : (
                  !open && <p className="text-sm text-muted">受付は終了しました。変更は管理者へご連絡ください。</p>
                )}
              </div>
              <RsvpRows eventId={id} kids={myKids} open={open} allowCompanions={e.allow_companions} isAdmin={user.isAdmin} />
              <p className="border-t border-line pt-2 text-sm text-muted">
                いまの参加 <b className="num text-base text-text">{e.going}</b>
                {e.capacity ? ` / 定員 ${e.capacity}` : ''}人{e.waitlist > 0 && `　キャンセル待ち ${e.waitlist}人`}
              </p>
            </div>
          </section>
        )}

        {/* ---------------- 練習：欠席・遅刻・早退 */}
        {e.uses_arrival && !cancelled && (
          <section className="card space-y-3 p-4">
            <h3 className="text-lg font-bold">参加・欠席の連絡</h3>
            {absenceKids.length > 0 ? (
              <AbsenceRows eventId={id} eventLabel={`${fmtDate(e.starts_at)} ${fmtTime(e.starts_at)} の${e.title}`} kids={absenceKids} ended={ended} />
            ) : (
              <p className="text-sm text-muted">連絡できるお子さんが登録されていません。</p>
            )}
            <p className="text-xs text-muted">
              参加曜日の練習は、連絡しなければ参加として扱います。休んだ日は振替が1回たまり、ほかの曜日に使えます。到着すると保護者に通知が届きます。
            </p>
          </section>
        )}

        {/* ---------------- 管理者：回答状況 */}
        {e.uses_rsvp && user.isAdmin && (
          <section id="answers" className="card scroll-mt-16 space-y-4 p-4">
            <h3 className="text-lg font-bold">回答の状況（管理者のみ）</h3>
            <dl className="grid grid-cols-3 divide-x divide-line rounded-xl bg-bg py-2 text-center">
              {(
                [
                  ['参加', going.length + waiting.length, false],
                  ['非表示・見送り', hiddenKids.length + declined.length, false],
                  ['まだ', unanswered.length, unanswered.length > 0],
                ] as const
              ).map(([label, n, hot]) => (
                <div key={label}>
                  <dt className={`text-xs font-bold ${hot ? 'text-ball-ink' : 'text-muted'}`}>{label}</dt>
                  <dd className={`num text-3xl ${hot ? 'text-ball-ink' : ''}`}>{n}</dd>
                </div>
              ))}
            </dl>
            <p className="text-sm text-muted">
              {e.member_deadline ? (
                <>
                  部内締め: <b className="text-text">{fmtDateTime(e.member_deadline)}</b>
                  {!open && '（締め切りました）'}
                </>
              ) : (
                '部内締めなし（開始時刻まで受付）'
              )}
              {e.entry_deadline && <span className="block">大会の申込締切: {fmtDateTime(e.entry_deadline)}</span>}
            </p>
            <div>
              <h4 className="mb-2 text-sm font-bold">まだ何もしていない {unanswered.length}人</h4>
              <UnansweredList eventId={id} kids={unanswered} />
            </div>
            {hiddenKids.length + declined.length > 0 && (
              <details>
                <summary className="cursor-pointer text-sm font-bold">非表示・見送り {hiddenKids.length + declined.length}人</summary>
                <p className="mt-2 text-sm leading-7 text-muted">{[...hiddenKids.map((c) => c.full_name), ...declined.map((r) => r.full_name)].join('、')}</p>
                <p className="hint mt-1">保護者がホームで「非表示」にした子です。あとから参加することもあります。</p>
              </details>
            )}
            <div className="flex flex-wrap gap-2 border-t border-line pt-3">
              <a href={`/api/events/${id}/participants.csv`} className="btn-secondary btn-sm">参加者CSV</a>
              <Link href={`/events/${id}/print`} className="btn-secondary btn-sm">印刷・PDF（A4）</Link>
            </div>
          </section>
        )}

        {/* ---------------- 参加者 */}
        {e.uses_rsvp && canSeeOthers && going.length + waiting.length > 0 && (
          <section className="card p-4">
            <h3 className="mb-2 text-lg font-bold">参加者 {going.length}人</h3>
            <ul className="divide-y divide-line">
              {[...going, ...waiting].map((r) => (
                <li key={r.id} className="space-y-1 py-2">
                  <div className="flex items-center gap-2">
                    <span className="flex-1 font-semibold">{r.full_name}</span>
                    {r.status === 'waitlist' && <span className="rounded-md bg-ball-soft px-1.5 py-0.5 text-xs font-bold text-ball-ink">キャンセル待ち</span>}
                    {e.allow_companions && r.companions > 0 && <span className="text-xs text-muted">同行{r.companions}人</span>}
                  </div>
                  {user.isAdmin && <PaymentCell rsvpId={r.id} paid={r.paid} note={r.payment_note} />}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ---------------- 管理者：参加予定 */}
        {e.uses_arrival && user.isAdmin && !cancelled && (
          <section className="card p-4">
            <h3 className="mb-2 text-lg font-bold">参加予定 {expected.length}人（管理者のみ）</h3>
            {expected.length === 0 ? (
              <p className="text-sm text-muted">参加曜日を設定している子がいません。</p>
            ) : (
              <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
                {expected.map((c) => (
                  <li key={c.id} className="flex items-center gap-1.5">
                    <span className="flex-1 truncate">{c.full_name}</span>
                    {c.kind !== 'regular' && (
                      <span className="rounded-md bg-brand-soft px-1.5 text-xs font-bold text-brand">{c.kind === 'credit' ? '振替' : '追加'}</span>
                    )}
                    {arrivedIds.has(c.id) && <span className="text-xs text-ok">✓</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* ---------------- 到着 */}
        {e.uses_arrival && canSeeOthers && (
          <section className="card p-4">
            <h3 className="mb-2 text-lg font-bold">到着済み {othersArrivals.length}人</h3>
            {othersArrivals.length === 0 ? (
              <p className="text-sm text-muted">まだ到着した人はいません。会場のタブレットで登録されます。</p>
            ) : (
              <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
                {othersArrivals.map((a) => (
                  <li key={a.id} className="flex items-center gap-1.5">
                    <span className="flex-1 truncate">{a.full_name}</span>
                    <span className="num text-muted">{fmtTime(a.arrived_at)}</span>
                    {user.isAdmin && <CancelArrivalButton arrivalId={a.id} name={a.full_name} />}
                  </li>
                ))}
              </ul>
            )}
            {user.isAdmin && (
              <div className="mt-3">
                <AdminChildPicker eventId={id} kids={targets.filter((c) => !arrivedIds.has(c.id))} />
              </div>
            )}
          </section>
        )}

        {e.uses_arrival && user.isAdmin && (
          <section className="card p-4">
            <h3 className="mb-2 text-lg font-bold">欠席・遅刻・早退（管理者のみ） {absences.length}件</h3>
            {absences.length === 0 ? (
              <p className="text-sm text-muted">連絡はありません。</p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {absences.map((a) => (
                  <li key={a.child_id} className="py-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-ball-soft px-1.5 py-0.5 text-xs font-bold text-ball-ink">{KIND_LABEL[a.kind]}{a.at_time && ` ${a.at_time}`}</span>
                      <span className="flex-1 text-base font-semibold">{a.full_name}</span>
                    </div>
                    {a.reason && <p className="mt-0.5">{a.reason}</p>}
                    <p className="text-xs text-muted">
                      連絡者: {a.reporter_kind === 'child' ? '本人（子どもアカウント）' : (a.reporter ?? '—')}　{fmtDateTime(a.updated_at)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {user.isAdmin && (
          <section className="card space-y-3 p-4">
            <h3 className="text-sm font-bold text-muted">この予定の操作（管理者）</h3>
            <div className="flex flex-wrap gap-2">
              <Link href={`/events/new?from=${id}`} className="btn-secondary btn-sm">複製して新しく作る</Link>
            </div>
            <EventAdminActions eventId={id} cancelled={cancelled} series={!!e.series_id} />
          </section>
        )}
      </Page>
    </>
  )
}
