import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { Logo } from '@/components/logo'
import { KidLoginForm } from '@/components/login-forms'

export const metadata = { title: '子ども用アカウントでログイン' }

export default async function KidLoginPage() {
  if (await getCurrentUser()) redirect('/')
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-6 py-10">
      <div className="text-center">
        <Logo className="mx-auto h-16 w-16" />
        <h1 className="mt-4 text-xl font-bold">子ども用アカウントでログイン</h1>
        <p className="mt-2 text-sm text-muted">保護者の方に教えてもらったログインIDとパスワードを入れてください。</p>
      </div>
      <KidLoginForm />
      <p className="text-center text-xs text-muted">パスワードを忘れたら、保護者の方に「お子さん・家族の管理」から新しいパスワードにしてもらってください。</p>
      <Link href="/login" className="text-center text-sm text-muted underline">もどる</Link>
    </main>
  )
}
