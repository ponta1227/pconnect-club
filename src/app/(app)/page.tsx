import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { sql } from '@/lib/db'
import { myChildren } from '@/lib/access'
import { listEvents, todaysPractice } from '@/lib/events'
import { addDays, fmtDate, fmtDateTime, fmtRelative, fmtTime, startOfJstDay } from '@/lib/time'
import { Page, PageHeader, Notice } from '@/components/ui'
import { EventCard } from '@/components/event-card'
import { IconAlert, IconPin, IconSearch } from '@/components/icons'
import { Logo } from '@/components/logo'

export default async function HomePage() {
  const user = await requireUser()
  const now = new Date()
  const dayStart = startOfJstDay(now)
  const [practice, kids, upcoming] = await Promise.all([
    todaysPractice(dayStart, addDays(dayStart, 1)),
    myChildren(user),
    listEvents(dayStart, addDays(dayStart, 120)),
  ])

  const [posts, myRsvps, practiceStatus, approvals, links] = await Promise.all([
    sql<{ id: string; title: string; urgent: boolean; pinned: boolean; published_at: Date; read: boolean }[]>`
      select p.id, p.title, p.urgent, p.pinned, p.published_at,
        exists (select 1 from post_reads r where r.post_id = p.id and r.profile_id = ${user.id}) as read
      from posts p
      where p.published_at is not null
        and (p.pinned or (p.urgent and p.published_at > now() - interval '3 days') or p.published_at > now() - interval '14 days')
      order by p.urgent desc, p.pinned desc, p.published_at desc limit 8`,
    kids.length
      ? sql<{ event_id: string; child_id: string; status: string }[]>`
          select event_id, child_id, status from rsvps where child_id = any(${kids.map((k) => k.id)}::uuid[])`
      : Promise.resolve([]),
    practice && kids.length
      ? sql<{ child_id: string; arrived_at: Date | null; kind: string | null }[]>`
          select c.id as child_id,
            (select arrived_at from arrivals a where a.event_id = ${practice.id} and a.child_id = c.id and a.cancelled_at is null) as arrived_at,
            (select kind from absence_reports ar where ar.event_id = ${practice.id} and ar.child_id = c.id) as kind
          from children c where c.id = any(${kids.map((k) => k.id)}::uuid[])`
      : Promise.resolve([]),
    user.isAdmin
      ? sql<{ links: number; accounts: number }[]>`
          select (select count(*)::int from guardian_children where status = 'pending') as links,
                 (select count(*)::int from child_accounts where status = 'pending') as accounts`
      : Promise.resolve([{ links: 0, accounts: 0 }]),
    !user.isChild ? sql<{ pending: number }[]>`select count(*)::int as pending from guardian_children where profile_id = ${user.id} and status = 'pending'` : Promise.resolve([{ pending: 0 }]),
  ])

  const [arrivedCount] = practice
    ? await sql<{ n: number }[]>`select count(*)::int as n from arrivals where event_id = ${practice.id} and cancelled_at is null`
    : [{ n: 0 }]

  const urgent = posts.filter((p) => p.urgent && p.published_at > addDays(now, -3))
  const pinned = posts.filter((p) => p.pinned && !urgent.includes(p))
  const recent = posts.filter((p) => !p.pinned && !urgent.includes(p)).slice(0, 3)

  const accepting = upcoming
    .filter((e) => e.uses_rsvp && e.status === 'active' && (e.member_deadline ? e.member_deadline > now : e.starts_at > now))
    .slice(0, 5)
  const myRsvpEvents = new Map<string, string[]>()
  for (const r of myRsvps) myRsvpEvents.set(r.event_id, [...(myRsvpEvents.get(r.event_id) ?? []), r.status])
  const acceptingIds = new Set(accepting.map((e) => e.id))
  const nextEvents = upcoming.filter((e) => e.starts_at >= dayStart && !(practice && e.id === practice.id) && !acceptingIds.has(e.id)).slice(0, 3)
  const kidName = new Map(kids.map((k) => [k.id, k.full_name]))
  const KIND = { absent: '欠席連絡済み', late: '遅刻連絡済み', early: '早退連絡済み' } as Record<string, string>

  return (
    <>
      <PageHeader
        title="P-CONNECT Jr."
        action={
          <Link href="/search" className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-bg" aria-label="検索">
            <IconSearch />
          </Link>
        }
      />
      <Page className="space-y-4">
        <div className="flex items-center gap-3 px-1">
          <Logo className="h-9 w-9" />
          <p className="text-sm">
            <b>{user.displayName}</b> さん、こんにちは
          </p>
        </div>

        {user.isAdmin && approvals[0].links + approvals[0].accounts > 0 && (
          <Link href="/admin/approvals" className="block">
            <Notice tone="warn">承認待ちの申請が {approvals[0].links + approvals[0].accounts} 件あります →</Notice>
          </Link>
        )}
        {!user.isChild && !user.isAdmin && kids.length === 0 && (
          <Link href="/children" className="block">
            <Notice>
              {links[0].pending > 0 ? 'お子さんの登録は管理者の承認待ちです。' : 'お子さんを登録すると、到着の通知などが届きます →'}
            </Notice>
          </Link>
        )}

        {urgent.map((p) => (
          <Link key={p.id} href={`/board/${p.id}`} className="flex items-start gap-2 rounded-2xl bg-danger px-4 py-3 text-white">
            <IconAlert className="h-6 w-6 shrink-0" />
            <span>
              <span className="block text-xs font-bold opacity-90">緊急のお知らせ・{fmtRelative(p.published_at)}</span>
              <span className="font-bold">{p.title}</span>
            </span>
          </Link>
        ))}

        <section>
          <h2 className="section-title pt-0">今日の練習</h2>
          {practice ? (
            <Link href={`/events/${practice.id}`} className="card block space-y-2 p-4">
              <div className="flex items-baseline justify-between">
                <p className="text-lg font-bold">
                  {fmtTime(practice.starts_at)}
                  {practice.ends_at && `–${fmtTime(practice.ends_at)}`}
                </p>
                {!user.isChild && <span className="badge bg-ok-soft text-ok">到着 {arrivedCount.n}人</span>}
              </div>
              <p className="text-sm text-muted">{practice.venue_name ?? practice.venue_text}</p>
              {practiceStatus.length > 0 && (
                <ul className="space-y-1 border-t border-line pt-2 text-sm">
                  {practiceStatus.map((s) => (
                    <li key={s.child_id} className="flex justify-between">
                      <span>{kidName.get(s.child_id)}</span>
                      {s.arrived_at ? (
                        <span className="font-semibold text-ok">✓ {fmtTime(s.arrived_at)} 到着</span>
                      ) : s.kind ? (
                        <span className="text-warn">{KIND[s.kind]}</span>
                      ) : (
                        <span className="text-muted">未到着</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Link>
          ) : (
            <div className="card p-4 text-sm text-muted">今日は練習がありません</div>
          )}
        </section>

        {accepting.length > 0 && (
          <section>
            <h2 className="section-title">参加受付中</h2>
            <div className="space-y-2">
              {accepting.map((e) => {
                const mine = myRsvpEvents.get(e.id)
                const left = e.member_deadline ? Math.ceil((e.member_deadline.getTime() - now.getTime()) / 86400000) : null
                return (
                  <EventCard
                    key={e.id}
                    e={e}
                    showDate
                    extra={
                      <p className="text-xs font-semibold">
                        {mine ? (
                          <span className="text-ok">✓ 参加登録済み{mine.includes('waitlist') && '（キャンセル待ちあり）'}</span>
                        ) : kids.length > 0 ? (
                          <span className="text-danger">未登録{left != null && ` ・ 締切まであと${left}日`}</span>
                        ) : null}
                      </p>
                    }
                  />
                )
              })}
            </div>
          </section>
        )}

        {(pinned.length > 0 || recent.length > 0) && (
          <section>
            <div className="flex items-center justify-between">
              <h2 className="section-title">お知らせ</h2>
              <Link href="/board" className="text-sm font-semibold text-brand">すべて見る</Link>
            </div>
            <ul className="card divide-y divide-line">
              {[...pinned, ...recent].map((p) => (
                <li key={p.id}>
                  <Link href={`/board/${p.id}`} className="flex items-center gap-2 px-4 py-3">
                    {p.pinned && <IconPin className="h-4 w-4 shrink-0 text-brand" />}
                    {!p.read && <span className="h-2 w-2 shrink-0 rounded-full bg-danger" />}
                    <span className={`min-w-0 flex-1 truncate ${p.read ? '' : 'font-bold'}`}>{p.title}</span>
                    <span className="shrink-0 text-xs text-muted">{fmtRelative(p.published_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {nextEvents.length > 0 && (
          <section>
            <div className="flex items-center justify-between">
              <h2 className="section-title">これからの予定</h2>
              <Link href="/events?view=list" className="text-sm font-semibold text-brand">一覧</Link>
            </div>
            <div className="space-y-2">
              {nextEvents.map((e) => <EventCard key={e.id} e={e} showDate />)}
            </div>
          </section>
        )}
        <p className="pt-2 text-center text-xs text-muted">更新: {fmtDate(now)} {fmtDateTime(now).split(' ')[1]}</p>
      </Page>
    </>
  )
}
