import { notFound } from 'next/navigation'
import { sql } from '@/lib/db'
import { env } from '@/lib/env'
import { devCreateUser, devLoginAs, devSetup } from '@/app/actions/dev'

export const metadata = { title: '開発用ログイン' }

export default async function DevLoginPage() {
  if (!env.devLoginEnabled()) notFound()
  const profiles = await sql<{ id: string; display_name: string; role: string; account_kind: string }[]>`
    select id, display_name, role, account_kind from profiles where deleted_at is null order by created_at`
  return (
    <main className="mx-auto max-w-sm space-y-6 px-4 py-8">
      <h1 className="text-xl font-bold">開発用ログイン</h1>
      <p className="text-xs text-muted">本番環境では表示されません。</p>
      {profiles.length === 0 && (
        <form action={devSetup} className="card space-y-2 p-4">
          <p className="text-sm font-bold">最初の管理者を作成</p>
          <input name="name" className="input" defaultValue="木村直登" />
          <button className="btn-primary w-full">管理者として開始</button>
        </form>
      )}
      <div className="card divide-y divide-line">
        {profiles.map((p) => (
          <form key={p.id} action={devLoginAs} className="flex items-center justify-between gap-2 p-3">
            <input type="hidden" name="profileId" value={p.id} />
            <span className="text-sm">
              {p.display_name}
              <span className="ml-2 text-xs text-muted">
                {p.account_kind === 'child' ? '子ども' : p.role === 'admin' ? '管理者' : 'メンバー'}
              </span>
            </span>
            <button className="btn-secondary btn-sm">ログイン</button>
          </form>
        ))}
      </div>
      {profiles.length > 0 && (
        <form action={devCreateUser} className="card space-y-2 p-4">
          <p className="text-sm font-bold">ユーザーを作成</p>
          <input name="name" className="input" placeholder="表示名" required />
          <select name="role" className="input">
            <option value="member">メンバー</option>
            <option value="admin">管理者</option>
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="agreed" defaultChecked /> 規約同意・初回設定を済ませる
          </label>
          <button className="btn-primary w-full">作成してログイン</button>
        </form>
      )}
    </main>
  )
}
