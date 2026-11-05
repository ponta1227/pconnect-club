import Link from 'next/link'
import { sql } from '@/lib/db'
import { Logo } from '@/components/logo'

export const metadata = { title: '初期設定' }

// 最初の管理者を作るためのページ。/setup?secret=<SETUP_SECRET> で開く。
export default async function SetupPage({ searchParams }: PageProps<'/setup'>) {
  const { secret } = await searchParams
  const [{ count }] = await sql<{ count: number }[]>`select count(*)::int as count from profiles`
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-6 text-center">
      <Logo className="mx-auto h-16 w-16" />
      {count > 0 ? (
        <>
          <h1 className="text-xl font-bold">初期設定は完了しています</h1>
          <Link href="/login" className="btn-primary">ログイン画面へ</Link>
        </>
      ) : (
        <>
          <h1 className="text-xl font-bold">最初の管理者を登録</h1>
          <p className="text-sm text-muted">ここでLINEログインした人が管理者になります。</p>
          <a href={`/api/auth/line/start?setup=${encodeURIComponent(typeof secret === 'string' ? secret : '')}`} className="btn w-full bg-[#06C755] text-white">
            LINEでログインして管理者になる
          </a>
        </>
      )}
    </main>
  )
}
