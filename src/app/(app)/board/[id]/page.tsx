import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { sql } from '@/lib/db'
import { myChildren } from '@/lib/access'
import { getEvent, mapUrl } from '@/lib/events'
import { rsvpOpen } from '@/lib/event-rules'
import { postUnread } from '@/lib/todo'
import { attachmentsFor } from '@/lib/files'
import { pollsFor } from '@/lib/polls'
import { toPollData } from '@/lib/poll-view'
import { fmtDateFull, fmtDateTime, fmtRelative, fmtTime } from '@/lib/time'
import { Avatar, Linkify, Page, PageHeader } from '@/components/ui'
import { AttachmentList } from '@/components/uploader'
import { Poll } from '@/components/poll'
import { CommentForm, DeleteCommentButton, PostAdminActions, Reactions, UnreadNudge } from '@/components/post-interactions'
import { RsvpRows } from '@/components/rsvp'
import { IconAlert, IconPin } from '@/components/icons'

export const metadata = { title: '掲示板' }

export default async function PostPage({ params }: PageProps<'/board/[id]'>) {
  const user = await requireUser()
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const [post] = await sql<{ id: string; title: string; body: string; pinned: boolean; urgent: boolean; published_at: Date | null; updated_at: Date; author: string | null; staff_label: string | null; author_avatar: string | null; event_id: string | null; class_ids: string[]; class_names: string[] }[]>`
    select p.id, p.title, p.body, p.pinned, p.urgent, p.published_at, p.updated_at, pr.display_name as author, case when ${user.isAdmin}::boolean then p.staff_label end as staff_label, pr.avatar_url as author_avatar, p.event_id,
      coalesce((select array_agg(class_id) from post_classes pc where pc.post_id = p.id), '{}') as class_ids,
      coalesce((select array_agg(c.name order by c.sort) from post_classes pc join classes c on c.id = pc.class_id where pc.post_id = p.id), '{}') as class_names
    from posts p left join profiles pr on pr.id = p.created_by where p.id = ${id}`
  if (!post || (!post.published_at && !user.isAdmin)) notFound()

  // 開いた時点で既読
  if (post.published_at) {
    await sql`insert into post_reads (post_id, profile_id) values (${id}, ${user.id}) on conflict do nothing`
  }

  const [files, comments, reactions, readers, polls, event, unread] = await Promise.all([
    attachmentsFor('post', [id]),
    sql<{ id: string; body: string; created_at: Date; profile_id: string | null; name: string | null; staff_label: string | null; avatar: string | null }[]>`
      select c.id, c.body, c.created_at, c.profile_id, p.display_name as name, case when ${user.isAdmin}::boolean then c.staff_label end as staff_label, p.avatar_url as avatar
      from post_comments c left join profiles p on p.id = c.profile_id
      where c.post_id = ${id} and c.deleted_at is null order by c.created_at`,
    sql<{ emoji: string; profile_id: string }[]>`select emoji, profile_id from post_reactions where post_id = ${id}`,
    sql<{ name: string; read_at: Date }[]>`
      select p.display_name as name, r.read_at from post_reads r join profiles p on p.id = r.profile_id
      where r.post_id = ${id} and p.deleted_at is null order by r.read_at`,
    pollsFor('post', [id], user),
    post.event_id ? getEvent(post.event_id) : Promise.resolve(null),
    user.isAdmin && post.published_at ? postUnread(id, post.class_ids) : Promise.resolve(null),
  ])

  // 予定つきのお知らせ：この画面でそのまま参加・見送りを回答できる
  const embed = event && event.uses_rsvp ? event : null
  let embedKids: { id: string; full_name: string; status: 'going' | 'waitlist' | 'declined' | null; companions: number }[] = []
  if (embed) {
    const mine = await myChildren(user)
    const rows = mine.length
      ? await sql<{ child_id: string; status: 'going' | 'waitlist' | 'declined'; companions: number }[]>`
          select child_id, status, companions from rsvps where event_id = ${embed.id} and child_id = any(${mine.map((c) => c.id)}::uuid[])`
      : []
    embedKids = mine.map((c) => {
      const r = rows.find((x) => x.child_id === c.id)
      return { id: c.id, full_name: c.full_name, status: r?.status ?? null, companions: r?.companions ?? 0 }
    })
  }
  const embedOpen = embed ? rsvpOpen(embed) : false
  const embedVenue = embed ? (embed.venue_name ?? embed.venue_text) : ''
  const embedMap = embed ? mapUrl(embed.venue_address, embedVenue) : null
  const counts: Record<string, number> = {}
  for (const r of reactions) counts[r.emoji] = (counts[r.emoji] ?? 0) + 1
  const myReactions = reactions.filter((r) => r.profile_id === user.id).map((r) => r.emoji)

  return (
    <>
      <PageHeader
        title="掲示板"
        back="/board"
        action={user.isAdmin ? <Link href={`/board/${id}/edit`} className="btn-secondary btn-sm">編集</Link> : undefined}
      />
      <Page className="space-y-3">
        <article className={`card space-y-3 p-4 ${post.urgent ? 'border-danger' : ''}`}>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {post.urgent && <span className="badge bg-danger text-white"><IconAlert className="mr-0.5 h-3.5 w-3.5" />緊急</span>}
            {post.pinned && <span className="badge bg-brand-soft text-brand"><IconPin className="mr-0.5 h-3.5 w-3.5" />固定</span>}
            {post.class_names.map((n) => <span key={n} className="badge bg-bg text-muted">{n}</span>)}
          </div>
          <h2 className="text-xl font-bold">{post.title}</h2>
          <div className="flex items-center gap-2 text-sm text-muted">
            <Avatar name={post.author ?? '?'} url={post.author_avatar} size={28} />
            <span>{post.author ?? '—'}{post.staff_label ? `（${post.staff_label}）` : ''}</span>
            <span>・{post.published_at ? fmtDateTime(post.published_at) : '下書き'}</span>
          </div>
          {post.body && (
            <div className="text-[0.97rem] leading-7">
              <Linkify text={post.body} />
            </div>
          )}
          <AttachmentList files={files.get(id) ?? []} />
          {event && !embed && (
            <Link href={`/events/${event.id}`} className="block rounded-xl bg-brand-soft px-3 py-2.5 font-semibold text-brand-dark">
              予定を見る: {event.title}
            </Link>
          )}
          {embed && (
            <section className={`overflow-hidden rounded-2xl border ${embedOpen && embedKids.some((k) => k.status === null) ? 'border-ball' : 'border-line'}`}>
              <div className="h-1.5" style={{ background: embed.status === 'cancelled' ? '#9aa3af' : embed.type_color }} />
              <div className="space-y-2.5 p-3.5">
                <div>
                  <p className="text-sm text-muted">{fmtDateFull(embed.starts_at)}</p>
                  <p className="num text-2xl leading-tight">
                    {embed.all_day ? <span className="text-lg font-bold">終日</span> : `${fmtTime(embed.starts_at)}${embed.ends_at ? ` – ${fmtTime(embed.ends_at)}` : ''}`}
                  </p>
                  {embedVenue && (
                    <p className="mt-0.5 font-semibold">
                      {embedVenue}
                      {embedMap && (
                        <a href={embedMap} target="_blank" rel="noopener noreferrer" className="ml-2 text-sm text-brand underline">地図を開く</a>
                      )}
                    </p>
                  )}
                </div>
                {embed.fee_note && (
                  <div className="rounded-xl bg-bg px-3 py-2 text-[0.95rem]">
                    <p className="mb-0.5 text-xs font-bold text-muted">参加費・持ち物・服装など</p>
                    <Linkify text={embed.fee_note} />
                  </div>
                )}
                {embed.status === 'cancelled' ? (
                  <p className="rounded-xl bg-danger-soft px-3 py-2 font-bold text-danger">この予定は中止になりました</p>
                ) : user.isAdmin && embedKids.length === 0 ? (
                  <Link href={`/events/${embed.id}#answers`} className="btn-secondary w-full">
                    回答の状況を見る（管理者）
                  </Link>
                ) : (
                  <div className="space-y-2 border-t border-line pt-2.5">
                    <p className="font-bold">
                      参加しますか？
                      {embed.member_deadline && (
                        <span className={`ml-2 text-sm font-normal ${embedOpen ? 'text-ball-ink' : 'text-muted'}`}>
                          回答は {fmtDateTime(embed.member_deadline)} まで
                        </span>
                      )}
                    </p>
                    <RsvpRows eventId={embed.id} kids={embedKids} open={embedOpen} allowCompanions={embed.allow_companions} isAdmin={user.isAdmin} />
                  </div>
                )}
                <Link href={`/events/${embed.id}`} className="block text-sm font-semibold text-brand underline">
                  予定のくわしい内容を見る
                </Link>
              </div>
            </section>
          )}
          {polls.map((p) => (
            <Poll key={p.id} poll={toPollData(p)} isAdmin={user.isAdmin} />
          ))}
          <Reactions postId={id} counts={counts} mine={myReactions} />
          {!user.isAdmin && <p className="border-t border-line pt-2 text-xs text-muted">既読 {readers.length}人</p>}
        </article>

        {user.isAdmin && (
          <section id="readers" className="card scroll-mt-16 space-y-3 p-4">
            <h3 className="font-bold">読まれた状況（管理者のみ）</h3>
            {unread && (
              <>
                <dl className="grid grid-cols-2 divide-x divide-line rounded-xl bg-bg py-2 text-center">
                  <div>
                    <dt className="text-xs font-bold text-muted">既読</dt>
                    <dd className="num text-3xl">{unread.target - unread.unread.length}</dd>
                  </div>
                  <div>
                    <dt className={`text-xs font-bold ${unread.unread.length > 0 ? 'text-ball-ink' : 'text-muted'}`}>未読</dt>
                    <dd className={`num text-3xl ${unread.unread.length > 0 ? 'text-ball-ink' : ''}`}>{unread.unread.length}</dd>
                  </div>
                </dl>
                {unread.unread.length > 0 && (
                  <details open={unread.unread.length <= 12}>
                    <summary className="cursor-pointer text-sm font-bold">まだ読んでいない人 {unread.unread.length}人</summary>
                    <p className="mt-1 text-sm leading-7 text-muted">{unread.unread.map((u) => u.name).join('、')}</p>
                  </details>
                )}
                <UnreadNudge postId={id} count={unread.unread.filter((u) => u.id !== user.id).length} />
              </>
            )}
            <details>
              <summary className="cursor-pointer text-sm font-bold">読んだ人 {readers.length}人</summary>
              <p className="mt-1 text-sm leading-7 text-muted">{readers.map((r) => r.name).join('、')}</p>
            </details>
            <div className="border-t border-line pt-3">
              <PostAdminActions postId={id} pinned={post.pinned} />
            </div>
          </section>
        )}

        {post.published_at && (
          <section className="card space-y-3 p-4">
            <h3 className="text-sm font-bold">コメント {comments.length}</h3>
            {comments.map((c) => (
              <div key={c.id} className="flex gap-2">
                <Avatar name={c.name ?? '?'} url={c.avatar} size={32} />
                <div className="min-w-0 flex-1 rounded-2xl bg-bg px-3 py-2">
                  <div className="flex items-center gap-2 text-xs text-muted">
                    <b className="text-text">{c.name ?? '退会したメンバー'}</b>
                    {c.staff_label && <span>（{c.staff_label}）</span>}
                    <span>{fmtRelative(c.created_at)}</span>
                    {(c.profile_id === user.id || user.isAdmin) && <span className="ml-auto"><DeleteCommentButton id={c.id} /></span>}
                  </div>
                  <p className="text-sm"><Linkify text={c.body} /></p>
                </div>
              </div>
            ))}
            <CommentForm postId={id} />
          </section>
        )}
      </Page>
    </>
  )
}
