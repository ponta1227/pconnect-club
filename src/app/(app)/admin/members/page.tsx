import { requireAdmin } from '@/lib/auth'
import { membersWithChildren } from '@/lib/members'
import { removeMember, setRole } from '@/app/actions/admin'
import { Avatar, Page, PageHeader } from '@/components/ui'
import { ActionButton } from '@/components/client'

export const metadata = { title: 'メンバーと権限' }

export default async function AdminMembersPage() {
  const me = await requireAdmin()
  const members = await membersWithChildren()
  return (
    <>
      <PageHeader title="メンバーと権限" back="/admin" />
      <Page className="space-y-2">
        <p className="px-1 text-sm text-muted">コーチには「管理者」を付与してください。管理者は予定・掲示板・名簿などを編集できます。</p>
        <ul className="card divide-y divide-line">
          {members.map((m) => (
            <li key={m.id} className="space-y-2 px-4 py-3">
              <div className="flex items-center gap-3">
                <Avatar name={m.display_name} url={m.avatar_url} />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">
                    {m.display_name}
                    {m.kind === 'admin' && <span className="badge ml-1 bg-brand-soft text-brand">管理者</span>}
                    {m.kind === 'child' && <span className="badge ml-1 bg-bg text-muted">子どもアカウント</span>}
                  </span>
                  {m.children.length > 0 && <span className="block truncate text-xs text-muted">{m.children.join('・')}</span>}
                </span>
              </div>
              {m.kind !== 'child' && m.id !== me.id && (
                <div className="flex gap-2">
                  {m.kind === 'admin' ? (
                    <ActionButton action={setRole.bind(null, m.id, 'member')} className="btn-secondary btn-sm" confirm={`${m.display_name}さんの管理者権限を外しますか？`}>メンバーにする</ActionButton>
                  ) : (
                    <>
                      <ActionButton action={setRole.bind(null, m.id, 'admin')} className="btn-secondary btn-sm" confirm={`${m.display_name}さんを管理者にしますか？`}>管理者にする</ActionButton>
                      <ActionButton action={removeMember.bind(null, m.id)} className="btn-ghost btn-sm text-danger" confirm={`${m.display_name}さんをクラブから外しますか？（元に戻せません）`}>外す</ActionButton>
                    </>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      </Page>
    </>
  )
}
