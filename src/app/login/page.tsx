import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { env } from '@/lib/env'
import { Logo } from '@/components/logo'

export const metadata = { title: 'ログイン' }

const ERRORS: Record<string, string> = {
  invite: 'はじめての方は、クラブから届いた招待リンクから参加してください。',
  used: 'この招待リンクは使用済みか、無効になっています。管理者または保護者に新しいリンクをもらってください。',
  setup: '初期設定のリンクが正しくありません。',
  state: 'ログインの有効期限が切れました。もう一度お試しください。',
  line: 'LINEでのログインに失敗しました。もう一度お試しください。',
  cancel: 'ログインがキャンセルされました。',
  config: 'LINEログインの設定がまだ完了していません（管理者向け: LINE_CHANNEL_ID を設定してください）。',
}

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  if (await getCurrentUser()) redirect('/')
  const { error } = await searchParams
  const message = typeof error === 'string' ? ERRORS[error] : undefined
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-8 px-6 py-10">
      <div className="text-center">
        <Logo className="mx-auto h-20 w-20" />
        <h1 className="mt-4 text-2xl font-bold">P-CONNECT Jr.</h1>
        <p className="mt-1 text-sm text-muted">クラブの予定・連絡をまとめて確認できます</p>
      </div>
      {message && <p className="rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn">{message}</p>}
      <a href="/api/auth/line/start" className="btn w-full bg-[#06C755] text-white hover:brightness-95">
        LINEでログイン
      </a>
      <p className="text-center text-xs text-muted">
        ログインすると<Link href="/terms" className="underline">利用規約</Link>と
        <Link href="/privacy" className="underline">プライバシーポリシー</Link>に同意したものとみなします。
      </p>
      {env.devLoginEnabled() && (
        <Link href="/dev-login" className="btn-secondary w-full">
          開発用ログイン
        </Link>
      )}
    </main>
  )
}
