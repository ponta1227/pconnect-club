import { migrationRoster } from '@/lib/migration-roster'
import { requireAdmin } from '@/lib/auth'
import { sql } from '@/lib/db'
import { fmtDateTime } from '@/lib/time'
import { revokeClubInvite } from '@/app/actions/admin'
import { saveMigrationRoster, saveEnrollSettings } from '@/app/actions/enroll'
import { Page, PageHeader } from '@/components/ui'
import { ActionButton, SubmitButton } from '@/components/client'
import { InviteGenerator } from '@/components/invite-generator'

export const metadata = { title: '招待リンク' }

export default async function InvitesPage({ searchParams }: PageProps<'/admin/invites'>) {
  await requireAdmin()
  const sp = await searchParams
  const roster = await migrationRoster()
  const [current, [settings]] = await Promise.all([
    sql<{ audience: 'existing' | 'new'; created_at: Date; by: string | null }[]>`
      select distinct on (i.audience) i.audience, i.created_at, p.display_name as by
      from invites i left join profiles p on p.id = i.created_by
      where i.kind = 'club' and i.revoked_at is null order by i.audience, i.created_at desc`,
    sql<{ form_url: string; payment_url: string }[]>`select form_url, payment_url from app_settings where id = 1`,
  ])

  const block = (audience: 'existing' | 'new', title: string, flow: string) => {
    const c = current.find((x) => x.audience === audience)
    return (
      <section className="card space-y-3 p-4 text-sm">
        <h2 className="text-base font-bold">{title}</h2>
        <p>{flow}</p>
        <p className="text-muted">
          {c ? `有効なリンクがあります（${fmtDateTime(c.created_at)} ${c.by ?? ''} 発行）。` : '有効なリンクはありません。'}
          リンクは保存していないので、必要なときに発行し直してください（発行し直すと古いリンクは使えなくなります）。
        </p>
        <InviteGenerator audience={audience} label={audience === 'new' ? '新規入会の招待リンクを発行' : '移行用の招待リンクを発行'} />
        {c && (
          <ActionButton action={revokeClubInvite.bind(null, audience)} className="btn-ghost btn-sm text-danger" confirm="このリンクを無効にしますか？">
            リンクを無効にする
          </ActionButton>
        )}
      </section>
    )
  }

  return (
    <>
      <PageHeader title="招待リンク" back="/admin" />
      <Page className="space-y-4">
        {block(
          'existing',
          'BANDを使っている方へ（移行用）',
          '流れ: LINEでログイン → Googleフォーム → 名簿からお子さんを選ぶ → 参加曜日と、いまたまっている振替の回数を入力 → 完了。お子さんの紐づけは管理者が承認します。',
        )}
        {block(
          'new',
          '新しく入会する方へ',
          '流れ: LINEでログイン → Googleフォーム → 決済ページ → お子さんの名前を登録 → 参加曜日を選ぶ → 完了。入金を確認してから、承認待ちの画面でお子さんを承認してください。',
        )}

        <section className="card space-y-3 p-4">
          <h2 className="font-bold">入会の流れで開くページ</h2>
          <form action={saveEnrollSettings} className="space-y-3">
            <label className="block">
              <span className="label">GoogleフォームのURL</span>
              <input name="form_url" type="url" className="input" defaultValue={settings?.form_url ?? ''} placeholder="https://forms.gle/..." />
              <span className="hint block">空にすると、この手順は飛ばします。</span>
            </label>
            <label className="block">
              <span className="label">決済ページのURL（新規入会のみ）</span>
              <input name="payment_url" type="url" className="input" defaultValue={settings?.payment_url ?? ''} placeholder="https://..." />
              <span className="hint block">空にすると、この手順は飛ばします。</span>
            </label>
            {sp.error === 'url' && <p className="text-sm text-danger">https:// で始まるURLを入力してください。</p>}
            {sp.saved === '1' && <p className="text-sm text-ok">保存しました。</p>}
            <SubmitButton pendingText="保存中…">保存する</SubmitButton>
          </form>
        </section>

        <section className="card space-y-3 p-4">
          <h2 className="font-bold">BANDから移行する人の確認（会費の支払い一覧）</h2>
          <p className="text-sm text-muted">
            移行用の招待リンクで入った人は、ここにある名前と<b>苗字が合うお子さん</b>しか登録できません（合わないときは「クラブにお問い合わせください」と出ます）。空にすると確認しません。いま <span className="num font-bold text-text">{roster.length}</span> 人。
          </p>
          {typeof sp.roster === 'string' && /^\d+$/.test(sp.roster) && <p className="text-sm text-ok">{sp.roster}人分を保存しました。</p>}
          {sp.roster === 'nocol' && <p className="text-sm text-danger">CSVに「氏名」の列が見つかりませんでした。</p>}
          {sp.roster === 'toobig' && <p className="text-sm text-danger">ファイルが大きすぎます。</p>}
          <form action={saveMigrationRoster} className="space-y-3">
            <label className="block">
              <span className="label">会費ペイのCSVで入れ替える</span>
              <input name="csv" type="file" accept=".csv,text/csv" className="block w-full text-sm" />
            </label>
            <SubmitButton pendingText="保存中…">CSVで入れ替える</SubmitButton>
          </form>
          <details>
            <summary className="cursor-pointer text-sm font-bold">名前を直接直す（1行に1人）</summary>
            <form action={saveMigrationRoster} className="mt-2 space-y-2">
              <textarea name="names" defaultValue={roster.join('\n')} className="input min-h-48 text-sm" aria-label="移行の名簿" />
              <SubmitButton pendingText="保存中…">この名前で保存する</SubmitButton>
            </form>
          </details>
        </section>
      </Page>
    </>
  )
}
