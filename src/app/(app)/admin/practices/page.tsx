import { requireAdmin } from '@/lib/auth'
import { createStandardPractices } from '@/app/actions/events'
import { fiscalYear, jstDateStr } from '@/lib/time'
import { Notice, Page, PageHeader } from '@/components/ui'
import { SubmitButton } from '@/components/client'

export const metadata = { title: '練習予定の一括作成' }

export default async function PracticesPage({ searchParams }: PageProps<'/admin/practices'>) {
  await requireAdmin()
  const sp = await searchParams
  const today = jstDateStr(new Date())
  const end = `${fiscalYear() + 1}-03-31`
  return (
    <>
      <PageHeader title="練習予定の一括作成" back="/admin" />
      <Page className="space-y-4">
        {sp.created && <Notice tone="ok">{String(sp.created)}件の練習を登録しました。休みの日は予定を開いて「中止」にしてください。</Notice>}
        {sp.error && <Notice tone="danger">日付を確認してください。</Notice>}
        <section className="card space-y-2 p-4 text-sm">
          <p>いつもの練習日程を、指定した期間にまとめて登録します。</p>
          <ul className="list-disc pl-5 text-muted">
            <li>月・火・木・金　朝霞市総合体育館　18:30–20:30</li>
            <li>水　大和中　19:00–20:30</li>
            <li>土　志木市民体育館　18:30–20:30</li>
          </ul>
          <p className="text-xs text-muted">登録時に通知は送りません。それ以外の日程は「予定」の「登録」から繰り返し設定で作れます。</p>
        </section>
        <form action={createStandardPractices} className="card space-y-3 p-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="label">開始日</span>
              <input type="date" name="from" defaultValue={today} className="input" required />
            </label>
            <label className="block">
              <span className="label">終了日</span>
              <input type="date" name="until" defaultValue={end} className="input" required />
            </label>
          </div>
          <SubmitButton confirm="練習予定をまとめて登録します。よろしいですか？">まとめて登録</SubmitButton>
        </form>
      </Page>
    </>
  )
}
