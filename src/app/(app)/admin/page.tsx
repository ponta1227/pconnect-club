import { requireAdmin } from '@/lib/auth'
import { sql } from '@/lib/db'
import { ListLink, Page, PageHeader } from '@/components/ui'

export const metadata = { title: '管理者メニュー' }

export default async function AdminPage() {
  await requireAdmin()
  const [c] = await sql<{ pending: number; children: number; members: number }[]>`
    select (select count(*)::int from guardian_children where status = 'pending') + (select count(*)::int from child_accounts where status = 'pending') as pending,
           (select count(*)::int from children where status = 'active') as children,
           (select count(*)::int from profiles where deleted_at is null and account_kind = 'adult') as members`
  const items: [string, string, string?][] = [
    ['/admin/approvals', '承認待ちの申請', c.pending ? `${c.pending}件` : undefined],
    ['/admin/roster', '名簿（子ども）', `${c.children}人`],
    ['/admin/members', 'メンバーと権限', `${c.members}人`],
    ['/admin/invites', '招待リンク'],
    ['/admin/attendance', '月次の出席集計'],
    ['/admin/kiosk', '会場のタブレット（到着登録）'],
    ['/admin/practices', '練習予定の一括作成'],
    ['/admin/classes', 'クラス'],
    ['/admin/venues', '会場'],
    ['/admin/types', '予定の種別'],
  ]
  return (
    <>
      <PageHeader title="管理者メニュー" back="/more" />
      <Page>
        <ul className="card divide-y divide-line">
          {items.map(([href, label, right]) => (
            <li key={href}>
              <ListLink href={href} right={right ? <span className={`text-sm ${href.includes('approvals') ? 'font-bold text-danger' : 'text-muted'}`}>{right}</span> : undefined}>
                {label}
              </ListLink>
            </li>
          ))}
        </ul>
      </Page>
    </>
  )
}
