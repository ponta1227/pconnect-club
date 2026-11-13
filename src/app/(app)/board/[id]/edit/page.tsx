import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/auth'
import { sql } from '@/lib/db'
import { attachableEvents, classes } from '@/lib/events'
import { fmtDate } from '@/lib/time'
import { attachmentsFor } from '@/lib/files'
import { Page, PageHeader } from '@/components/ui'
import { PostForm } from '@/components/post-form'
import { PostAdminActions } from '@/components/post-interactions'

export const metadata = { title: '投稿を編集' }

export default async function EditPostPage({ params }: PageProps<'/board/[id]/edit'>) {
  await requireAdmin()
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const [post] = await sql<{ title: string; body: string; pinned: boolean; urgent: boolean; published_at: Date | null; event_id: string | null; class_ids: string[] }[]>`
    select title, body, pinned, urgent, published_at, event_id,
      coalesce((select array_agg(class_id) from post_classes where post_id = ${id}), '{}') as class_ids
    from posts where id = ${id}`
  if (!post) notFound()
  const [files, events] = await Promise.all([attachmentsFor('post', [id]), attachableEvents(post.event_id)])
  return (
    <>
      <PageHeader title={post.published_at ? '投稿を編集' : '下書き'} back={post.published_at ? `/board/${id}` : '/board'} />
      <Page className="space-y-4">
        <PostForm
          classes={await classes()}
          events={events.map((e) => ({ id: e.id, label: `${fmtDate(e.starts_at)} ${e.title}` }))}
          initial={{
            id,
            title: post.title,
            body: post.body,
            class_ids: post.class_ids,
            urgent: post.urgent,
            pinned: post.pinned,
            attachments: files.get(id) ?? [],
            published: !!post.published_at,
            event_id: post.event_id,
          }}
        />
        {!post.published_at && (
          <div className="card p-3">
            <PostAdminActions postId={id} pinned={post.pinned} />
          </div>
        )}
      </Page>
    </>
  )
}
