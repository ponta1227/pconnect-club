import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { sql } from '@/lib/db'
import { attachmentsFor } from '@/lib/files'
import { pollsFor } from '@/lib/polls'
import { toPollData } from '@/lib/poll-view'
import { fmtDateTime, fmtRelative } from '@/lib/time'
import { Avatar, Linkify, Page, PageHeader } from '@/components/ui'
import { AttachmentList } from '@/components/uploader'
import { Poll } from '@/components/poll'
import { CommentForm, DeleteCommentButton, PostAdminActions, Reactions } from '@/components/post-interactions'
import { IconAlert, IconPin } from '@/components/icons'

export const metadata = { title: '掲示板' }

export default async function PostPage({ params }: PageProps<'/board/[id]'>) {
  const user = await requireUser()
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const [post] = await sql<{ id: string; title: string; body: string; pinned: boolean; urgent: boolean; published_at: Date | null; updated_at: Date; author: string | null; author_avatar: string | null; class_names: string[] }[]>`
    select p.id, p.title, p.body, p.pinned, p.urgent, p.published_at, p.updated_at, pr.display_name as author, pr.avatar_url as author_avatar,
      coalesce((select array_agg(c.name order by c.sort) from post_classes pc join classes c on c.id = pc.class_id where pc.post_id = p.id), '{}') as class_names
    from posts p left join profiles pr on pr.id = p.created_by where p.id = ${id}`
  if (!post || (!post.published_at && !user.isAdmin)) notFound()

  // 開いた時点で既読
  if (post.published_at) {
    await sql`insert into post_reads (post_id, profile_id) values (${id}, ${user.id}) on conflict do nothing`
  }

  const [files, comments, reactions, readers, polls] = await Promise.all([
    attachmentsFor('post', [id]),
    sql<{ id: string; body: string; created_at: Date; profile_id: string | null; name: string | null; avatar: string | null }[]>`
      select c.id, c.body, c.created_at, c.profile_id, p.display_name as name, p.avatar_url as avatar
      from post_comments c left join profiles p on p.id = c.profile_id
      where c.post_id = ${id} and c.deleted_at is null order by c.created_at`,
    sql<{ emoji: string; profile_id: string }[]>`select emoji, profile_id from post_reactions where post_id = ${id}`,
    sql<{ name: string; read_at: Date }[]>`
      select p.display_name as name, r.read_at from post_reads r join profiles p on p.id = r.profile_id
      where r.post_id = ${id} and p.deleted_at is null order by r.read_at`,
    pollsFor('post', [id], user),
  ])
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
            <span>{post.author ?? '—'}</span>
            <span>・{post.published_at ? fmtDateTime(post.published_at) : '下書き'}</span>
          </div>
          {post.body && (
            <div className="text-[0.97rem] leading-7">
              <Linkify text={post.body} />
            </div>
          )}
          <AttachmentList files={files.get(id) ?? []} />
          {polls.map((p) => (
            <Poll key={p.id} poll={toPollData(p)} isAdmin={user.isAdmin} />
          ))}
          <Reactions postId={id} counts={counts} mine={myReactions} />
          <div className="border-t border-line pt-2 text-xs text-muted">
            {user.isAdmin ? (
              <details>
                <summary className="cursor-pointer">既読 {readers.length}人（管理者のみ一覧を表示）</summary>
                <p className="mt-1 leading-6">{readers.map((r) => r.name).join('、')}</p>
              </details>
            ) : (
              <span>既読 {readers.length}人</span>
            )}
          </div>
        </article>

        {user.isAdmin && (
          <div className="card p-3">
            <PostAdminActions postId={id} pinned={post.pinned} />
          </div>
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
