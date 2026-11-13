import { requireAdmin } from '@/lib/auth'
import { attachableEvents, classes } from '@/lib/events'
import { fmtDate } from '@/lib/time'
import { Page, PageHeader } from '@/components/ui'
import { PostForm } from '@/components/post-form'

export const metadata = { title: '投稿する' }

export default async function NewPostPage() {
  await requireAdmin()
  const events = await attachableEvents()
  return (
    <>
      <PageHeader title="投稿する" back="/board" />
      <Page>
        <PostForm
          classes={await classes()}
          events={events.map((e) => ({ id: e.id, label: `${fmtDate(e.starts_at)} ${e.title}` }))}
          initial={{ title: '', body: '', class_ids: [], urgent: false, pinned: false, attachments: [], published: false }}
        />
      </Page>
    </>
  )
}
