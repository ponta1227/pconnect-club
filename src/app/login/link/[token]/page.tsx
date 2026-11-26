import Link from 'next/link'
import { peekLoginLink } from '@/lib/login-link'
import { loginWithLink } from '@/app/actions/account'
import { Logo } from '@/components/logo'
import { SubmitButton } from '@/components/client'

export const metadata = { title: 'ログイン' }

// リンクを開いただけではログインしない（LINEなどがリンクを先読みしても使われないように、ボタンを押してもらう）
export default async function LoginLinkPage({ params }: PageProps<'/login/link/[token]'>) {
  const { token } = await params
  const link = /^[A-Za-z0-9_-]{20,200}$/.test(token) ? await peekLoginLink(token) : null
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-6 py-10">
      <div className="text-center">
        <Logo className="mx-auto h-16 w-16" />
        {link ? (
          <>
            <h1 className="mt-4 text-xl font-bold">{link.name}さんのアカウントでログインします</h1>
            <p className="mt-2 text-sm text-muted">この端末で、{link.name}さんと同じ画面が使えるようになります。心当たりがなければ、このページを閉じてください。</p>
          </>
        ) : (
          <>
            <h1 className="mt-4 text-xl font-bold">このリンクは使えません</h1>
            <p className="mt-2 text-sm text-muted">ログイン用のリンクは、作ってから30分・1回だけ使えます。もう一度「設定」から新しいリンクを作ってもらってください。</p>
          </>
        )}
      </div>
      {link ? (
        <form action={loginWithLink.bind(null, token)}>
          <SubmitButton className="btn-primary w-full">ログインする</SubmitButton>
        </form>
      ) : (
        <Link href="/login" className="btn-secondary w-full text-center">ログイン画面へ</Link>
      )}
    </main>
  )
}
