import { requireAdmin } from '@/lib/auth'
import { sql } from '@/lib/db'
import { fmtDateTime } from '@/lib/time'
import { revokeClubInvite } from '@/app/actions/admin'
import { Page, PageHeader } from '@/components/ui'
import { ActionButton } from '@/components/client'
import { InviteGenerator } from '@/components/invite-generator'

export const metadata = { title: '招待リンク' }

export default async function InvitesPage() {
  await requireAdmin()
  const [current] = await sql<{ created_at: Date; by: string | null }[]>`
    select i.created_at, p.display_name as by from invites i left join profiles p on p.id = i.created_by
    where i.kind = 'club' and i.revoked_at is null order by i.created_at desc limit 1`
  return (
    <>
      <PageHeader title="招待リンク" back="/admin" />
      <Page className="space-y-4">
        <section className="card space-y-3 p-4 text-sm">
          <p>
            保護者に送る招待リンクです。リンクを開いてLINEでログインすると、すぐにクラブに参加できます（承認なし）。
            参加後、保護者がお子さんを名簿から選んで申請し、管理者が承認します。
          </p>
          <p className="text-muted">
            {current ? `有効なリンクがあります（${fmtDateTime(current.created_at)} ${current.by ?? ''} 発行）。` : '有効なリンクはありません。'}
            セキュリティのためリンクは保存していません。必要なときに再発行してください（再発行すると古いリンクは使えなくなります）。
          </p>
          <InviteGenerator />
          {current && (
            <ActionButton action={revokeClubInvite} className="btn-ghost btn-sm text-danger" confirm="招待リンクを無効にしますか？">
              リンクを無効にする
            </ActionButton>
          )}
        </section>
      </Page>
    </>
  )
}
