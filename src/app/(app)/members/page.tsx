import { requireAdult } from '@/lib/auth'
import { membersWithChildren } from '@/lib/members'
import { Avatar, Page, PageHeader } from '@/components/ui'

export const metadata = { title: 'メンバー' }

export default async function MembersPage() {
  await requireAdult()
  // 子どもアカウントは一覧に出さない
  const members = (await membersWithChildren()).filter((m) => m.kind !== 'child')
  return (
    <>
      <PageHeader title="メンバー" sub={`${members.length}人`} back="/more" />
      <Page>
        <ul className="card divide-y divide-line">
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-4 py-3">
              <Avatar name={m.display_name} url={m.avatar_url} />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">
                  {m.display_name}
                  {m.kind === 'admin' && <span className="badge ml-1 bg-brand-soft text-brand">管理者</span>}
                </span>
                {m.children.length > 0 && <span className="block truncate text-xs text-muted">{m.children.join('・')}</span>}
              </span>
            </li>
          ))}
        </ul>
      </Page>
    </>
  )
}
