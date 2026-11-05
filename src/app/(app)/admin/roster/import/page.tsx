import { requireAdmin } from '@/lib/auth'
import { classes } from '@/lib/events'
import { importRosterCsv } from '@/app/actions/admin'
import { Notice, Page, PageHeader } from '@/components/ui'
import { SubmitButton } from '@/components/client'

export const metadata = { title: 'CSVで一括登録' }

export default async function ImportPage({ searchParams }: PageProps<'/admin/roster/import'>) {
  await requireAdmin()
  const sp = await searchParams
  let errors: { line: number; message: string }[] = []
  try {
    if (typeof sp.errors === 'string') errors = JSON.parse(sp.errors)
  } catch {}
  const cls = await classes()
  return (
    <>
      <PageHeader title="CSVで一括登録" back="/admin/roster" />
      <Page className="space-y-4">
        <section className="card space-y-2 p-4 text-sm">
          <p className="font-bold">CSVの形式</p>
          <p>1行に1人。列は <b>氏名, よみがな, 学年, クラス</b> の順です。1行目が見出しでも構いません。</p>
          <pre className="overflow-x-auto rounded-xl bg-bg p-3 text-xs">{`氏名,よみがな,学年,クラス\n山田太郎,やまだたろう,小3,初心者\n佐藤花子,さとうはなこ,中1,選手・中学生`}</pre>
          <ul className="list-disc pl-5 text-muted">
            <li>学年: 小1〜小6、中1〜中3、高1〜高3、その他</li>
            <li>クラス: 「・」「/」区切りで複数可。空欄でも可。先にクラスを作成してください（現在: {cls.map((c) => c.name).join('、') || 'なし'}）</li>
            <li>同じ氏名の在籍者がいる行は登録しません（重複防止）</li>
            <li>Excelで作る場合は「CSV UTF-8」で保存してください</li>
          </ul>
        </section>
        {sp.error && <Notice tone="danger">{sp.error === 'size' ? 'ファイルが大きすぎます（1MBまで）' : 'ファイルを選んでください'}</Notice>}
        {errors.length > 0 && (
          <Notice tone="danger">
            <p className="font-bold">エラーがあったため登録していません。修正してもう一度アップロードしてください。</p>
            <ul className="mt-1 list-disc pl-5">
              {errors.map((e, i) => <li key={i}>{e.line}行目: {e.message}</li>)}
            </ul>
          </Notice>
        )}
        <form action={importRosterCsv} className="card space-y-3 p-4">
          <input type="file" name="file" accept=".csv,text/csv" required className="block w-full text-sm" />
          <SubmitButton>登録する</SubmitButton>
        </form>
      </Page>
    </>
  )
}
