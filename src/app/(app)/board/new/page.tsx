import { requireAdmin } from '@/lib/auth'
import { classes } from '@/lib/events'
import { Page, PageHeader } from '@/components/ui'
import { PostForm } from '@/components/post-form'

export const metadata = { title: '投稿する' }

export default async function NewPostPage() {
  await requireAdmin()
  return (
    <>
      <PageHeader title="投稿する" back="/board" />
      <Page>
        <PostForm
          classes={await classes()}
          initial={{ title: '', body: '', class_ids: [], urgent: false, pinned: false, attachments: [], published: false }}
        />
      </Page>
    </>
  )
}
