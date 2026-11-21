import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { env } from '@/lib/env'
import { findInvite } from '@/lib/invites'
import { Logo } from '@/components/logo'
import { EmailCodeForm, EmailStartForm } from '@/components/login-forms'

export const metadata = { title: 'メールアドレスでログイン' }

export default async function EmailLoginPage({ searchParams }: PageProps<'/login/email'>) {
  if (await getCurrentUser()) redirect('/')
  if (!env.emailLoginEnabled()) redirect('/login')
  const { step, invite: inviteParam } = await searchParams
  const invite = typeof inviteParam === 'string' && inviteParam ? inviteParam : null
  const valid = invite ? await findInvite(invite) : null
  const back = invite ? `/join/${encodeURIComponent(invite)}` : '/login'

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-6 py-10">
      <div className="text-center">
        <Logo className="mx-auto h-16 w-16" />
        <h1 className="mt-4 text-xl font-bold">{valid ? 'メールアドレスで参加' : 'メールアドレスでログイン'}</h1>
        <p className="mt-2 text-sm text-muted">
          {step === 'code'
            ? 'メールに届いた6桁の確認コードを入力してください。届かないときは、迷惑メールのフォルダも見てください。'
            : 'LINEを使っていない方はこちら。入力したメールアドレスに、6桁の確認コードを送ります。パスワードは使いません。'}
        </p>
      </div>
      {step === 'code' ? <EmailCodeForm /> : <EmailStartForm invite={valid ? invite : null} askName={!!valid && valid.kind !== 'child'} />}
      {step === 'code' && (
        <Link href={`/login/email${invite ? `?invite=${encodeURIComponent(invite)}` : ''}`} className="btn-ghost w-full">
          メールアドレスを入れ直す・もう一度送る
        </Link>
      )}
      <Link href={back} className="text-center text-sm text-muted underline">もどる</Link>
    </main>
  )
}
