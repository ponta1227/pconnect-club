import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { sql } from '@/lib/db'
import { fmtRelative } from '@/lib/time'
import { Empty, Page, PageHeader } from '@/components/ui'
import { IconAlert, IconPin, IconPlus, IconPoll, IconPhoto } from '@/components/icons'

export const metadata = { title: '掲示板' }

const PAGE = 30

export default async function BoardPage({ searchParams }: PageProps<'/board'>) {
  const user = await requireUser()
  const sp = await searchParams
  const page = Math.max(0, Number(sp.page) || 0)
  const posts = await sql<{ id: string; title: string; body: string; pinned: boolean; urgent: boolean; published_at: Date | null; created_at: Date; author: string | null; comments: number; reads: number; read: boolean; has_poll: boolean; photos: number; class_names: string[] }[]>`
    select p.id, p.title, p.body, p.pinned, p.urgent, p.published_at, p.created_at, pr.display_name as author,
      (select count(*)::int from post_comments c where c.post_id = p.id and c.deleted_at is null) as comments,
      (select count(*)::int from post_reads r where r.post_id = p.id) as reads,
      exists (select 1 from post_reads r where r.post_id = p.id and r.profile_id = ${user.id}) as read,
      exists (select 1 from polls pl where pl.owner_type = 'post' and pl.owner_id = p.id) as has_poll,
      (select count(*)::int from attachments a where a.owner_type = 'post' and a.owner_id = p.id and a.kind = 'photo') as photos,
      coalesce((select array_agg(c.name order by c.sort) from post_classes pc join classes c on c.id = pc.class_id where pc.post_id = p.id), '{}') as class_names
    from posts p left join profiles pr on pr.id = p.created_by
    where p.published_at is not null or ${user.isAdmin}::bool
    order by (p.published_at is null) desc, (p.urgent and p.published_at > now() - interval '3 days') desc, p.pinned desc, coalesce(p.published_at, p.created_at) desc
    limit ${PAGE + 1} offset ${page * PAGE}`
  const hasMore = posts.length > PAGE
  const list = posts.slice(0, PAGE)

  return (
    <>
      <PageHeader
        title="掲示板"
        action={user.isAdmin ? <Link href="/board/new" className="btn-primary btn-sm"><IconPlus className="h-5 w-5" />投稿</Link> : undefined}
      />
      <Page className="space-y-2">
        {list.length === 0 && <Empty>まだ投稿はありません</Empty>}
        {list.map((p) => (
          <Link key={p.id} href={p.published_at ? `/board/${p.id}` : `/board/${p.id}/edit`} className={`card block p-4 ${p.urgent ? 'border-danger' : ''}`}>
            <div className="mb-1 flex flex-wrap items-center gap-1.5 text-xs">
              {!p.published_at && <span className="badge bg-bg text-muted">下書き</span>}
              {p.urgent && <span className="badge bg-danger text-white"><IconAlert className="mr-0.5 h-3.5 w-3.5" />緊急</span>}
              {p.pinned && <span className="badge bg-brand-soft text-brand"><IconPin className="mr-0.5 h-3.5 w-3.5" />固定</span>}
              {p.class_names.map((n) => <span key={n} className="badge bg-bg text-muted">{n}</span>)}
              {!p.read && p.published_at && <span className="h-2 w-2 rounded-full bg-danger" aria-label="未読" />}
            </div>
            <p className={`text-[1.02rem] ${p.read ? 'font-semibold' : 'font-bold'}`}>{p.title}</p>
            {p.body && <p className="mt-1 line-clamp-2 text-sm text-muted">{p.body}</p>}
            <div className="mt-2 flex items-center gap-3 text-xs text-muted">
              <span>{p.author ?? '—'}</span>
              <span>{fmtRelative(p.published_at ?? p.created_at)}</span>
              {p.photos > 0 && <span className="inline-flex items-center gap-0.5"><IconPhoto className="h-4 w-4" />{p.photos}</span>}
              {p.has_poll && <span className="inline-flex items-center gap-0.5"><IconPoll className="h-4 w-4" />投票</span>}
              <span className="ml-auto">💬 {p.comments}　既読 {p.reads}</span>
            </div>
          </Link>
        ))}
        <div className="flex justify-between pt-2">
          {page > 0 ? <Link href={`/board?page=${page - 1}`} className="btn-ghost btn-sm">‹ 新しい投稿</Link> : <span />}
          {hasMore && <Link href={`/board?page=${page + 1}`} className="btn-ghost btn-sm">古い投稿 ›</Link>}
        </div>
      </Page>
    </>
  )
}
