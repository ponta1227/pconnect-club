import { requireAdmin } from '@/lib/auth'
import { classes } from '@/lib/events'
import { Page, PageHeader } from '@/components/ui'
import { ChildForm } from '@/components/child-form'

export const metadata = { title: '子どもを追加' }

export default async function NewChildPage() {
  await requireAdmin()
  return (
    <>
      <PageHeader title="子どもを追加" back="/admin/roster" />
      <Page>
        <ChildForm classes={await classes()} initial={{ full_name: '', kana: '', grade: 1, class_ids: [], status: 'active' }} />
      </Page>
    </>
  )
}
