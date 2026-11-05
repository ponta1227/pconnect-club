import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { myLinks, rosterForLinking } from '@/lib/roster'
import { agreeTerms, finishOnboarding } from '@/app/actions/account'
import { ChildLinker } from '@/components/child-linker'
import { PushToggle } from '@/components/push'
import { Logo } from '@/components/logo'
import { InstallGuide } from '@/components/install-guide'

export const metadata = { title: 'はじめに' }

export default async function OnboardingPage({ searchParams }: PageProps<'/onboarding'>) {
  const user = await requireUser({ allowOnboarding: true, allowPending: true })
  const { step, error } = await searchParams
  if (user.termsAgreedAt && user.onboardedAt) redirect('/')

  // 1. 表示名と規約同意
  if (!user.termsAgreedAt) {
    return (
      <main className="mx-auto max-w-sm space-y-6 px-5 py-10">
        <div className="text-center">
          <Logo className="mx-auto h-14 w-14" />
          <h1 className="mt-3 text-xl font-bold">ようこそ</h1>
          <p className="mt-1 text-sm text-muted">はじめに、いくつか設定をお願いします。</p>
        </div>
        <form action={agreeTerms} className="card space-y-4 p-5">
          {user.isChild ? (
            <p className="text-sm">
              <b>{user.childAccount?.childName}</b> さんのアカウントです。
            </p>
          ) : (
            <label className="block">
              <span className="label">表示名</span>
              <input name="displayName" className="input" defaultValue={user.displayName} maxLength={40} required />
              <span className="hint block">クラブ内で表示される名前です（フルネーム推奨。例: 山田花子（太郎の母））</span>
            </label>
          )}
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="agree" className="mt-1 h-5 w-5" required />
            <span>
              <Link href="/terms" target="_blank" className="text-brand underline">利用規約</Link>と
              <Link href="/privacy" target="_blank" className="text-brand underline">プライバシーポリシー</Link>に同意します
            </span>
          </label>
          {error && <p className="text-sm text-danger">入力内容を確認してください。</p>}
          <button className="btn-primary w-full">次へ</button>
        </form>
      </main>
    )
  }

  // 2. 子どもの登録（大人のみ）
  if (step !== 'notify' && !user.isChild) {
    const [roster, mine] = await Promise.all([rosterForLinking(), myLinks(user.id)])
    return (
      <main className="mx-auto max-w-sm space-y-5 px-5 py-10">
        <div>
          <p className="text-xs font-bold text-brand">ステップ 2 / 3</p>
          <h1 className="mt-1 text-xl font-bold">お子さんを登録</h1>
          <p className="mt-1 text-sm text-muted">名簿からお子さんを選んで申請してください。クラブの管理者が承認すると、到着の通知などが届くようになります。</p>
        </div>
        <ChildLinker roster={roster} mine={mine} />
        <Link href="/onboarding?step=notify" className="btn-primary w-full">次へ</Link>
        <p className="text-center text-xs text-muted">コーチなどでお子さんがいない場合も「次へ」で進めます。</p>
      </main>
    )
  }

  // 3. 通知とホーム画面追加の案内
  return (
    <main className="mx-auto max-w-sm space-y-5 px-5 py-10">
      <div>
        <p className="text-xs font-bold text-brand">ステップ 3 / 3</p>
        <h1 className="mt-1 text-xl font-bold">通知を受け取る</h1>
        <p className="mt-1 text-sm text-muted">ホーム画面に追加してから通知をオンにすると、到着のお知らせなどがすぐ届きます。</p>
      </div>
      <InstallGuide />
      <div className="card p-4">
        <PushToggle />
      </div>
      <form action={finishOnboarding}>
        <button className="btn-primary w-full">はじめる</button>
      </form>
    </main>
  )
}
