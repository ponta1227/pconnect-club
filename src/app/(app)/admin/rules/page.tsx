import { requireAdmin } from '@/lib/auth'
import { Notice, Page, PageHeader } from '@/components/ui'
import { clubGuide } from '@/lib/guide'
import { saveGuide } from '@/app/actions/guide'

export const metadata = { title: 'クラブのご案内を編集' }

export default async function AdminRulesPage({ searchParams }: PageProps<'/admin/rules'>) {
  await requireAdmin()
  const { saved } = await searchParams
  const guide = await clubGuide()
  return (
    <>
      <PageHeader title="クラブのご案内を編集" back="/admin" />
      <Page className="space-y-4">
        {saved && <Notice tone="ok">保存しました。</Notice>}
        <p className="text-sm text-muted">
          入会するときに全員が読んで「確認しました」を押す文章です。「## 」で始まる行が見出しになり、目次に並びます。URLはそのままリンクになります。写真は「![説明](/guide/ファイル名.jpg)」の1行で入ります（写真の追加は木村さんからClaudeに頼んでください）。
        </p>
        <form action={saveGuide} className="space-y-3">
          <textarea name="guide_text" defaultValue={guide.text} className="input min-h-[60vh] font-[inherit] text-sm leading-relaxed" />
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="reconfirm" className="mt-0.5 h-5 w-5" />
            <span>大事な変更なので、いまいる保護者にも、もう一度確認してもらう（ホームの「やること」に出ます）</span>
          </label>
          <button className="btn-primary w-full">保存する</button>
        </form>
        <a href="/rules" className="btn-secondary w-full">保護者が見る画面を確認する</a>
      </Page>
    </>
  )
}
