import { requireUser } from '@/lib/auth'
import { Empty, Page, PageHeader } from '@/components/ui'
import { ClubGuideBody } from '@/components/club-guide'
import { clubGuide, guideUnread, parseGuide } from '@/lib/guide'
import { confirmGuide } from '@/app/actions/guide'

export const metadata = { title: 'クラブのご案内' }

export default async function RulesPage() {
  const user = await requireUser()
  const [guide, unread] = await Promise.all([clubGuide(), guideUnread(user.id, user.isChild)])
  return (
    <>
      <PageHeader title="クラブのご案内" back="/more" />
      <Page className="space-y-4">
        {guide.text ? <ClubGuideBody blocks={parseGuide(guide.text)} /> : <Empty>ご案内はまだ登録されていません。</Empty>}
        {unread && (
          <form action={confirmGuide.bind(null, false)}>
            <p className="mb-2 text-center text-sm text-muted">内容が更新されました。読んだら押してください。</p>
            <button className="btn-primary w-full">確認しました</button>
          </form>
        )}
        {user.isAdmin && (
          <a href="/admin/rules" className="btn-secondary w-full">ご案内の文章を編集する</a>
        )}
      </Page>
    </>
  )
}
