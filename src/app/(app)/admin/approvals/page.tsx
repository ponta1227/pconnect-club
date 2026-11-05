import { requireAdmin } from '@/lib/auth'
import { sql } from '@/lib/db'
import { gradeLabel } from '@/lib/grades'
import { fmtDateTime } from '@/lib/time'
import { approveChildAccount, approveLink, rejectChildAccount, rejectLink } from '@/app/actions/admin'
import { Empty, Page, PageHeader } from '@/components/ui'
import { ActionButton } from '@/components/client'

export const metadata = { title: '承認待ち' }

export default async function ApprovalsPage() {
  await requireAdmin()
  const [links, accounts] = await Promise.all([
    sql<{ profile_id: string; child_id: string; guardian: string; child: string; grade: number; created_at: Date; others: string[] }[]>`
      select gc.profile_id, gc.child_id, p.display_name as guardian, c.full_name as child, c.grade, gc.created_at,
        coalesce((select array_agg(p2.display_name) from guardian_children g2 join profiles p2 on p2.id = g2.profile_id
          where g2.child_id = gc.child_id and g2.status = 'approved' and p2.deleted_at is null), '{}') as others
      from guardian_children gc join profiles p on p.id = gc.profile_id join children c on c.id = gc.child_id
      where gc.status = 'pending' and p.deleted_at is null order by gc.created_at`,
    sql<{ profile_id: string; child: string; grade: number; issued_by: string | null; created_at: Date }[]>`
      select ca.profile_id, c.full_name as child, c.grade, ip.display_name as issued_by, ca.created_at
      from child_accounts ca join children c on c.id = ca.child_id left join profiles ip on ip.id = ca.issued_by
      where ca.status = 'pending' order by ca.created_at`,
  ])
  return (
    <>
      <PageHeader title="承認待ちの申請" back="/admin" />
      <Page className="space-y-2">
        <h2 className="section-title pt-0">保護者の紐づけ申請 {links.length}件</h2>
        {links.length === 0 ? (
          <Empty>申請はありません</Empty>
        ) : (
          <ul className="space-y-2">
            {links.map((l) => (
              <li key={`${l.profile_id}-${l.child_id}`} className="card space-y-2 p-4">
                <p>
                  <b>{l.guardian}</b> さんが <b>{l.child}</b>（{gradeLabel(l.grade)}）の保護者として申請
                </p>
                <p className="text-xs text-muted">
                  {fmtDateTime(l.created_at)}
                  {l.others.length > 0 && `・登録済みの保護者: ${l.others.join('、')}`}
                </p>
                <div className="flex gap-2">
                  <ActionButton action={rejectLink.bind(null, l.profile_id, l.child_id)} className="btn-secondary flex-1" confirm="申請を却下しますか？">却下</ActionButton>
                  <ActionButton action={approveLink.bind(null, l.profile_id, l.child_id)} className="btn-primary flex-1">承認</ActionButton>
                </div>
              </li>
            ))}
          </ul>
        )}

        <h2 className="section-title">子どもアカウント {accounts.length}件</h2>
        {accounts.length === 0 ? (
          <Empty>申請はありません</Empty>
        ) : (
          <ul className="space-y-2">
            {accounts.map((a) => (
              <li key={a.profile_id} className="card space-y-2 p-4">
                <p>
                  <b>{a.child}</b>（{gradeLabel(a.grade)}）本人のアカウント
                </p>
                <p className="text-xs text-muted">発行: {a.issued_by ?? '—'}（保護者の同意済み）・{fmtDateTime(a.created_at)}</p>
                <p className="text-xs text-muted">承認すると、予定の確認・本人の欠席連絡・大会の参加登録・掲示板の閲覧ができます。他の子の情報やチャットは見えません。</p>
                <div className="flex gap-2">
                  <ActionButton action={rejectChildAccount.bind(null, a.profile_id)} className="btn-secondary flex-1" confirm="このアカウントを却下しますか？">却下</ActionButton>
                  <ActionButton action={approveChildAccount.bind(null, a.profile_id)} className="btn-primary flex-1">承認</ActionButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Page>
    </>
  )
}
