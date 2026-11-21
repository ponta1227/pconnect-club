import Link from 'next/link'
import { sql } from '@/lib/db'
import { env } from '@/lib/env'
import { findInvite } from '@/lib/invites'
import { getCurrentUser } from '@/lib/auth'
import { Logo } from '@/components/logo'
import { devJoin } from '@/app/actions/dev'
import { redirect } from 'next/navigation'
import { JoinGate } from '@/components/join-gate'

export async function generateMetadata({ params }: PageProps<'/join/[token]'>) {
  const { token } = await params
  // ここからホーム画面に追加すると、アイコンがこの招待の続きを開く
  return { title: '招待', manifest: `/join/${encodeURIComponent(token)}/manifest.webmanifest` }
}

export default async function JoinPage({ params }: PageProps<'/join/[token]'>) {
  const { token } = await params
  const user = await getCurrentUser()
  const invite = await findInvite(token)
  // 登録が済んだあとにホーム画面のアイコン（招待リンク）から開いたら、ふつうにホームへ
  if (user && invite?.kind !== 'family') redirect('/')

  if (!invite) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 px-6 text-center">
        <Logo className="mx-auto h-16 w-16" />
        <h1 className="text-xl font-bold">この招待リンクは使えません</h1>
        <p className="text-sm text-muted">使用済み、または無効になっています。管理者または保護者に新しいリンクをもらってください。</p>
        <Link href="/login" className="btn-secondary">ログイン画面へ</Link>
      </main>
    )
  }

  const children = invite.child_ids.length
    ? await sql<{ full_name: string }[]>`select full_name from children where id = any(${invite.child_ids}::uuid[])`
    : []
  const names = children.map((c) => `${c.full_name}さん`).join('、')

  const title =
    invite.kind === 'club' ? 'P-CONNECT Jr. に参加' : invite.kind === 'family' ? '家族として参加' : '子どもアカウントで参加'
  const description =
    invite.kind === 'club'
      ? `${env.emailLoginEnabled() ? 'LINEかメールアドレス' : 'LINE'}でログインすると、クラブに参加できます。参加後に、お子さんの名前を登録してください。`
      : invite.kind === 'family'
        ? `${names}の家族として参加します。保護者と同じように予定の確認や連絡ができます。`
        : `${names}本人のアカウントを作ります。クラブの管理者が承認すると使えるようになります。お子さん本人のLINEでログインしてください。`

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-6 py-10">
      <div className="text-center">
        <Logo className="mx-auto h-16 w-16" />
        <h1 className="mt-4 text-xl font-bold">{title}</h1>
        <p className="mt-2 text-sm text-muted">{description}</p>
      </div>
      <JoinGate>
        <div className="space-y-3">
          <a href={`/api/auth/line/start?invite=${encodeURIComponent(token)}`} className="btn w-full bg-[#06C755] text-white">
            LINEでログインして参加
          </a>
          {env.emailLoginEnabled() && invite.kind !== 'child' && (
            <Link href={`/login/email?invite=${encodeURIComponent(token)}`} className="btn-secondary w-full">
              LINEを使っていない方（メールアドレスで参加）
            </Link>
          )}
        </div>
      </JoinGate>
      {env.devLoginEnabled() && (
        <form action={devJoin} className="card space-y-2 p-4">
          <p className="text-xs font-bold text-muted">開発用: LINEなしで参加</p>
          <input type="hidden" name="token" value={token} />
          <input name="name" className="input" placeholder="表示名" required />
          <button className="btn-secondary w-full">この名前で参加</button>
        </form>
      )}
    </main>
  )
}
