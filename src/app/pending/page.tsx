import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { Logo } from '@/components/logo'

export const metadata = { title: '承認待ち' }

export default async function PendingPage() {
  const user = await requireUser({ allowOnboarding: true, allowPending: true })
  if (!user.isChild) redirect('/')
  const status = user.childAccount?.status
  if (status === 'active') redirect('/')
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-5 px-6 text-center">
      <Logo className="mx-auto h-16 w-16" />
      {status === 'revoked' ? (
        <>
          <h1 className="text-xl font-bold">このアカウントは使えません</h1>
          <p className="text-sm text-muted">保護者または管理者によって無効になりました。保護者の方に確認してください。</p>
        </>
      ) : (
        <>
          <h1 className="text-xl font-bold">承認をお待ちください</h1>
          <p className="text-sm text-muted">
            {user.childAccount?.childName} さんのアカウントは、クラブの管理者が承認すると使えるようになります。
          </p>
          <a href="/pending" className="btn-secondary">再読み込み</a>
        </>
      )}
      <form action="/api/auth/logout" method="post">
        <button className="btn-ghost w-full">ログアウト</button>
      </form>
    </main>
  )
}
