import { requireUser } from '@/lib/auth'
import { Avatar, ListLink, Page, PageHeader } from '@/components/ui'
import { IconBell, IconChild, IconFile, IconGear, IconPhoto, IconSearch, IconShare, IconUsers } from '@/components/icons'

export const metadata = { title: 'その他' }

export default async function MorePage() {
  const user = await requireUser()
  const items: { href: string; label: string; icon: React.ReactNode; show: boolean }[] = [
    { href: '/albums', label: 'アルバム', icon: <IconPhoto />, show: true },
    { href: '/documents', label: '資料', icon: <IconFile />, show: true },
    { href: '/search', label: '検索', icon: <IconSearch />, show: true },
    { href: '/members', label: 'メンバー', icon: <IconUsers />, show: !user.isChild },
    { href: '/children', label: 'お子さん・家族の管理', icon: <IconChild />, show: !user.isChild },
    { href: '/settings', label: user.isChild ? '設定' : '通知・プロフィール設定', icon: <IconBell />, show: true },
    { href: '/guide', label: 'ホーム画面に追加・通知の設定方法', icon: <IconShare />, show: true },
  ]
  return (
    <>
      <PageHeader title="その他" />
      <Page className="space-y-4">
        <div className="card flex items-center gap-3 p-4">
          <Avatar name={user.displayName} url={user.avatarUrl} size={48} />
          <div>
            <p className="font-bold">{user.displayName}</p>
            <p className="text-xs text-muted">{user.isAdmin ? '管理者' : user.isChild ? '子どもアカウント' : 'メンバー'}</p>
          </div>
        </div>
        <ul className="card divide-y divide-line">
          {items.filter((i) => i.show).map((i) => (
            <li key={i.href}>
              <ListLink href={i.href}>
                <span className="flex items-center gap-3"><span className="text-muted">{i.icon}</span>{i.label}</span>
              </ListLink>
            </li>
          ))}
        </ul>
        {user.isAdmin && (
          <ul className="card divide-y divide-line">
            <li>
              <ListLink href="/admin">
                <span className="flex items-center gap-3 font-bold text-brand"><IconGear />管理者メニュー</span>
              </ListLink>
            </li>
          </ul>
        )}
        <div className="flex justify-center gap-4 text-xs text-muted">
          <a href="/terms" className="underline">利用規約</a>
          <a href="/privacy" className="underline">プライバシーポリシー</a>
        </div>
        <form action="/api/auth/logout" method="post">
          <button className="btn-secondary w-full">ログアウト</button>
        </form>
      </Page>
    </>
  )
}
