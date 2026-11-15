import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { sql } from '@/lib/db'
import { eventTargetChildIds } from '@/lib/access'
import { listEvents, mapUrl } from '@/lib/events'
import { getAdminStatus, getTodos, type RsvpTodo } from '@/lib/todo'
import { practiceKidsFor } from '@/lib/makeup'
import { addDays, fmtDate, fmtDateTime, fmtRelative, fmtTime, jstDateStr, startOfJstDay } from '@/lib/time'
import { Page } from '@/components/ui'
import { EventRow } from '@/components/event-card'
import { RsvpRows } from '@/components/rsvp'
import { AbsenceRows, type AbsenceKid } from '@/components/absence'
import { IconAlert, IconBoard, IconCheck, IconChevron, IconPin, IconPoll, IconSearch } from '@/components/icons'
import { Logo } from '@/components/logo'

type Practice = {
  id: string
  starts_at: Date
  ends_at: Date | null
  status: 'active' | 'cancelled'
  venue: string
  venue_address: string | null
}

/** 締切までの残りを短い言葉にする */
function deadlineLabel(deadline: Date, now: Date): string {
  const days = Math.round((startOfJstDay(deadline).getTime() - startOfJstDay(now).getTime()) / 86400000)
  if (days <= 0) return 'きょうまで'
  if (days === 1) return 'あしたまで'
  return `あと${days}日`
}

export default async function HomePage() {
  const user = await requireUser()
  const now = new Date()
  const dayStart = startOfJstDay(now)

  const [todos, [practice], week, posts, urgent, admin, [links]] = await Promise.all([
    getTodos(),
    // 帯に出す練習：まだ終わっていない、いちばん近い練習（中止も知らせる）
    sql<Practice[]>`
      select e.id, e.starts_at, e.ends_at, e.status, coalesce(v.name, e.venue_text, '') as venue, v.address as venue_address
      from events e join event_types t on t.id = e.type_id left join venues v on v.id = e.venue_id
      where t.uses_arrival and e.starts_at >= ${dayStart}
        and coalesce(e.ends_at, e.starts_at + interval '2 hours') > now()
      order by e.starts_at limit 1`,
    listEvents(dayStart, addDays(dayStart, 8)),
    sql<{ id: string; title: string; pinned: boolean; published_at: Date; read: boolean; event_id: string | null }[]>`
      select p.id, p.title, p.pinned, p.published_at, p.event_id,
        exists (select 1 from post_reads r where r.post_id = p.id and r.profile_id = ${user.id}) as read
      from posts p
      where p.published_at is not null and (p.pinned or p.published_at > now() - interval '21 days')
      order by p.pinned desc, p.published_at desc limit 5`,
    sql<{ id: string; title: string; published_at: Date }[]>`
      select id, title, published_at from posts
      where urgent and published_at > now() - interval '3 days' order by published_at desc limit 3`,
    user.isAdmin ? getAdminStatus() : Promise.resolve(null),
    !user.isChild
      ? sql<{ pending: number }[]>`select count(*)::int as pending from guardian_children where profile_id = ${user.id} and status = 'pending'`
      : Promise.resolve([{ pending: 0 }]),
  ])
  const kids = todos.kids

  // 帯の練習についての、わが子の状況（到着・欠席連絡）
  let practiceKids: AbsenceKid[] = []
  let arrivedCount = 0
  if (practice) {
    const targets = new Set(await eventTargetChildIds(practice.id))
    practiceKids = await practiceKidsFor(practice, kids.filter((k) => targets.has(k.id)), fmtTime)
    if (!user.isChild) {
      const [a] = await sql<{ n: number }[]>`select count(*)::int as n from arrivals where event_id = ${practice.id} and cancelled_at is null`
      arrivedCount = a.n
    }
  }

  const today = jstDateStr(now)
  const practiceDay = practice ? jstDateStr(practice.starts_at) : ''
  const practiceLabel = !practice ? '' : practiceDay === today ? 'きょうの練習' : practiceDay === jstDateStr(addDays(now, 1)) ? 'あしたの練習' : '次の練習'
  const isToday = practiceDay === today
  const practiceMap = practice ? mapUrl(practice.venue_address, practice.venue) : null
  const weekEvents = week.filter((e) => e.id !== practice?.id).slice(0, 8)
  const pendingEventIds = new Set(todos.rsvps.map((e) => e.id))

  return (
    <>
      {/* ---------- 青い帯：きょう（次）の練習と、わが子の状況 */}
      <header className="table-band">
        <div className="mx-auto max-w-xl px-4 pb-4 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
          <div className="flex items-center gap-2">
            <Logo className="h-8 w-8" />
            <h1 className="flex-1 text-sm font-bold">P-CONNECT Jr.</h1>
            <Link href="/search" className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full" aria-label="検索">
              <IconSearch />
            </Link>
          </div>

          {practice ? (
            <>
              <Link href={`/events/${practice.id}`} className="mt-2 block">
                <p className="text-sm font-semibold opacity-90">
                  {practiceLabel}・{fmtDate(practice.starts_at)}
                </p>
                {practice.status === 'cancelled' ? (
                  <p className="mt-1 text-3xl font-bold">中止です</p>
                ) : (
                  <p className="num mt-0.5 text-[2.75rem] leading-none">
                    {fmtTime(practice.starts_at)}
                    {practice.ends_at && <span className="opacity-80"> – {fmtTime(practice.ends_at)}</span>}
                  </p>
                )}
              </Link>
              <p className="mt-2 flex items-center gap-3 text-[0.95rem]">
                <span className="font-semibold">{practice.venue}</span>
                {practiceMap && (
                  <a href={practiceMap} target="_blank" rel="noopener noreferrer" className="underline opacity-90">
                    地図
                  </a>
                )}
                {isToday && !user.isChild && practice.status === 'active' && (
                  <span className="ml-auto text-sm opacity-90">
                    到着 <span className="num text-base">{arrivedCount}</span>人
                  </span>
                )}
              </p>
              {practice.status === 'active' && practiceKids.length > 0 && (
                <>
                  <div className="table-line my-3" />
                  <AbsenceRows
                    tone="band"
                    eventId={practice.id}
                    eventLabel={`${fmtDate(practice.starts_at)} ${fmtTime(practice.starts_at)} の練習`}
                    kids={practiceKids}
                  />
                </>
              )}
            </>
          ) : (
            <p className="mt-3 text-lg font-bold">練習の予定は、まだ入っていません</p>
          )}
        </div>
      </header>

      <Page className="space-y-5">
        {urgent.map((p) => (
          <Link key={p.id} href={`/board/${p.id}`} className="flex items-start gap-2 rounded-2xl bg-danger px-4 py-3 text-white">
            <IconAlert className="h-6 w-6 shrink-0" />
            <span>
              <span className="block text-xs font-bold opacity-90">緊急のお知らせ・{fmtRelative(p.published_at)}</span>
              <span className="font-bold">{p.title}</span>
            </span>
          </Link>
        ))}

        {!user.isChild && !user.isAdmin && kids.length === 0 && (
          <Link href="/children" className="todo-card flex items-center gap-2 p-4">
            <span className="flex-1 font-semibold">
              {links.pending > 0 ? 'お子さんの登録は管理者の承認待ちです' : 'お子さんを登録すると、参加の回答や欠席連絡ができます'}
            </span>
            <IconChevron className="h-5 w-5 shrink-0 text-muted" />
          </Link>
        )}

        {/* ---------- やること */}
        <section aria-labelledby="todo-title">
          <h2 id="todo-title" className="section-title flex items-center gap-2 pt-0">
            やること
            {todos.count > 0 && <span className="num rounded-full bg-ball px-2 text-base leading-6 text-text">{todos.count}</span>}
          </h2>
          {todos.count === 0 ? (
            <div className="card flex items-center gap-2 p-4 text-[0.95rem] text-muted">
              <IconCheck className="h-5 w-5 shrink-0 text-ok" />
              いま対応が必要なことはありません
            </div>
          ) : (
            <div className="space-y-2.5">
              {todos.rsvps.map((e) => (
                <RsvpCard key={e.id} e={e} now={now} todo />
              ))}
              {todos.polls.map((p) => (
                <Link key={p.id} href={p.href} className="todo-card flex items-center gap-3 p-4">
                  <IconPoll className="h-5 w-5 shrink-0 text-ball-ink" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-bold text-ball-ink">
                      アンケートに回答{p.closes_at && `・${fmtDateTime(p.closes_at)} まで`}
                    </span>
                    <span className="block truncate font-bold">{p.question}</span>
                  </span>
                  <IconChevron className="h-5 w-5 shrink-0 text-muted" />
                </Link>
              ))}
              {todos.posts.map((p) => (
                <Link key={p.id} href={`/board/${p.id}`} className="todo-card flex items-center gap-3 p-4">
                  <IconBoard className="h-5 w-5 shrink-0 text-ball-ink" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-bold text-ball-ink">まだ読んでいないお知らせ・{fmtRelative(p.published_at)}</span>
                    <span className="block truncate font-bold">{p.title}</span>
                  </span>
                  <IconChevron className="h-5 w-5 shrink-0 text-muted" />
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* ---------- 管理者：クラブの状況 */}
        {admin && (
          <section aria-labelledby="admin-title">
            <h2 id="admin-title" className="section-title pt-0">クラブの状況（管理者）</h2>
            <div className="space-y-2.5">
              {admin.approvals > 0 && (
                <Link href="/admin/approvals" className="todo-card flex items-center gap-2 p-4">
                  <span className="flex-1 font-bold">
                    承認待ちの申請が <span className="num text-lg">{admin.approvals}</span> 件あります
                  </span>
                  <IconChevron className="h-5 w-5 shrink-0 text-muted" />
                </Link>
              )}
              {admin.events.length > 0 && (
                <ul className="card divide-y divide-line">
                  {admin.events.map((e) => (
                    <li key={e.id}>
                      <Link href={`/events/${e.id}#answers`} className="block px-4 py-3">
                        <span className="flex items-baseline gap-2">
                          <span className="min-w-0 flex-1 truncate font-bold">{e.title}</span>
                          {e.member_deadline && <span className="shrink-0 text-xs text-muted">部内締め {fmtDate(e.member_deadline)}</span>}
                        </span>
                        <span className="mt-1 flex gap-4 text-sm text-muted">
                          <span>参加 <b className="num text-lg text-text">{e.going}</b></span>
                          <span>見送り <b className="num text-lg text-text">{e.declined}</b></span>
                          <span className={e.unanswered > 0 ? 'font-bold text-ball-ink' : ''}>
                            未回答 <b className={`num text-lg ${e.unanswered > 0 ? '' : 'text-text'}`}>{e.unanswered}</b>
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {admin.posts.length > 0 && (
                <ul className="card divide-y divide-line">
                  {admin.posts.map((p) => (
                    <li key={p.id}>
                      <Link href={`/board/${p.id}#readers`} className="flex items-center gap-3 px-4 py-3">
                        <span className="min-w-0 flex-1 truncate">{p.title}</span>
                        <span className={`shrink-0 text-sm ${p.unread > 0 ? 'font-bold text-ball-ink' : 'text-muted'}`}>
                          未読 <span className="num text-base">{p.unread}</span>/{p.target}人
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <div className="grid grid-cols-3 gap-2">
                <Link href="/events/new?kind=rsvp" className="btn-secondary px-2 text-sm">大会を登録</Link>
                <Link href="/board/new" className="btn-secondary px-2 text-sm">お知らせを書く</Link>
                <Link href="/admin/schedule" className="btn-secondary px-2 text-sm">練習日程</Link>
              </div>
            </div>
          </section>
        )}

        {/* ---------- 回答済み（変更はここからも、予定の画面からもできる） */}
        {todos.answered.length > 0 && (
          <section aria-labelledby="answered-title">
            <h2 id="answered-title" className="section-title pt-0">回答済みの予定</h2>
            <div className="space-y-2.5">
              {todos.answered.slice(0, 5).map((e) => (
                <RsvpCard key={e.id} e={e} now={now} />
              ))}
            </div>
          </section>
        )}

        {/* ---------- これから1週間 */}
        <section aria-labelledby="week-title">
          <div className="flex items-center justify-between">
            <h2 id="week-title" className="section-title pt-0">これから1週間</h2>
            <Link href="/events" className="px-1 pb-2 text-sm font-semibold text-brand">カレンダー</Link>
          </div>
          {weekEvents.length === 0 ? (
            <div className="card p-4 text-[0.95rem] text-muted">この1週間、ほかの予定はありません</div>
          ) : (
            <ul className="card divide-y divide-line">
              {weekEvents.map((e) => (
                <li key={e.id}>
                  <EventRow e={e} today={today} needsAnswer={pendingEventIds.has(e.id)} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ---------- お知らせ */}
        {posts.length > 0 && (
          <section aria-labelledby="news-title">
            <div className="flex items-center justify-between">
              <h2 id="news-title" className="section-title pt-0">お知らせ</h2>
              <Link href="/board" className="px-1 pb-2 text-sm font-semibold text-brand">すべて見る</Link>
            </div>
            <ul className="card divide-y divide-line">
              {posts.map((p) => (
                <li key={p.id}>
                  <Link href={`/board/${p.id}`} className="flex min-h-12 items-center gap-2 px-4 py-3">
                    {p.pinned && <IconPin className="h-4 w-4 shrink-0 text-brand" />}
                    <span className={`min-w-0 flex-1 truncate ${p.read ? '' : 'font-bold'}`}>{p.title}</span>
                    {!p.read && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-ball" aria-label="未読" />}
                    <span className="shrink-0 text-xs text-muted">{fmtRelative(p.published_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </Page>
    </>
  )
}

/** 大会・イベントの回答カード。ホームでそのまま「参加する／見送る」を押せる */
function RsvpCard({ e, now, todo = false }: { e: RsvpTodo; now: Date; todo?: boolean }) {
  return (
    <article className={todo ? 'todo-card' : 'card'}>
      <div className="space-y-3 p-4">
        <Link href={`/events/${e.id}`} className="block">
          <p className="flex items-center gap-2 text-xs font-bold">
            <span className="rounded-md px-1.5 py-0.5 text-white" style={{ background: e.type_color }}>{e.type_name}</span>
            {e.member_deadline && (
              <span className={todo ? 'text-ball-ink' : 'text-muted'}>
                回答は {fmtDate(e.member_deadline)} まで{todo && `（${deadlineLabel(e.member_deadline, now)}）`}
              </span>
            )}
          </p>
          <p className="mt-1.5 text-lg font-bold leading-snug">{e.title}</p>
          <p className="mt-0.5 text-sm text-muted">
            <span className="num text-base text-text">{e.all_day ? fmtDate(e.starts_at) : fmtDateTime(e.starts_at)}</span>
            {e.venue && `　${e.venue}`}
          </p>
          {todo && e.fee_note && <p className="mt-1 line-clamp-2 text-sm text-muted">{e.fee_note}</p>}
        </Link>
        <div className="border-t border-line pt-3">
          <RsvpRows eventId={e.id} kids={e.kids} open allowCompanions={e.allow_companions} />
        </div>
      </div>
    </article>
  )
}
