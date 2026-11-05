import Link from 'next/link'
import { requireAdmin } from '@/lib/auth'
import { sql } from '@/lib/db'
import { env } from '@/lib/env'
import { setKioskPin } from '@/app/actions/admin'
import { Notice, Page, PageHeader } from '@/components/ui'
import { SubmitButton } from '@/components/client'

export const metadata = { title: '会場のタブレット' }

export default async function KioskAdminPage({ searchParams }: PageProps<'/admin/kiosk'>) {
  await requireAdmin()
  const sp = await searchParams
  const [s] = await sql<{ kiosk_pin_hash: string | null }[]>`select kiosk_pin_hash from app_settings where id = 1`
  return (
    <>
      <PageHeader title="会場のタブレット" back="/admin" />
      <Page className="space-y-4">
        <section className="card space-y-2 p-4 text-sm">
          <p className="font-bold">使い方</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>タブレットのブラウザで <b>{env.appUrl()}/kiosk</b> を開き、ホーム画面に追加しておきます。</li>
            <li>練習開始時に、コーチがPINを入力して開始します（12時間有効）。</li>
            <li>子どもが自分の名前をタップすると、保護者に到着の通知が届きます。</li>
            <li>終了するときは、画面右上を長押ししてPINを入力します。60分操作がないと自動でロックされます。</li>
          </ol>
        </section>
        {sp.saved && <Notice tone="ok">PINを保存しました。タブレットは再度PINで開始してください。</Notice>}
        {sp.error && <Notice tone="danger">PINは4〜6桁の数字にしてください。</Notice>}
        <form action={setKioskPin} className="card space-y-3 p-4">
          <label className="block">
            <span className="label">{s.kiosk_pin_hash ? 'PINを変更' : 'PINを設定'}（4〜6桁の数字）</span>
            <input name="pin" type="password" inputMode="numeric" pattern="\d{4,6}" maxLength={6} className="input" required autoComplete="new-password" />
          </label>
          <SubmitButton>保存</SubmitButton>
        </form>
        <Link href="/kiosk" className="btn-secondary w-full">この端末でタブレット画面を開く</Link>
      </Page>
    </>
  )
}
