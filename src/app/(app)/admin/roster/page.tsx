import Link from 'next/link'
import { requireAdmin } from '@/lib/auth'
import { sql } from '@/lib/db'
import { classes as listClasses } from '@/lib/events'
import { GRADE_OPTIONS, gradeLabel } from '@/lib/grades'
import { promoteGradesNow } from '@/app/actions/admin'
import { Empty, Notice, Page, PageHeader } from '@/components/ui'
import { SubmitButton } from '@/components/client'
import { IconChevron, IconPlus } from '@/components/icons'

export const metadata = { title: '名簿' }

export default async function RosterPage({ searchParams }: PageProps<'/admin/roster'>) {
  await requireAdmin()
  const sp = await searchParams
  const status = sp.status === 'left' || sp.status === 'graduated' ? sp.status : 'active'
  const classId = typeof sp.class === 'string' && /^[0-9a-f-]{36}$/.test(sp.class) ? sp.class : null
  const grade = typeof sp.grade === 'string' && sp.grade !== '' ? Number(sp.grade) : null
  const q = typeof sp.q === 'string' ? sp.q.trim() : ''
  const cls = await listClasses()
  const rows = await sql<{ id: string; full_name: string; kana: string; grade: number; class_names: string[]; guardians: number; pending: number; child_account: string | null }[]>`
    select c.id, c.full_name, c.kana, c.grade,
      coalesce((select array_agg(cl.name order by cl.sort) from child_classes cc join classes cl on cl.id = cc.class_id where cc.child_id = c.id), '{}') as class_names,
      (select count(*)::int from guardian_children gc join profiles p on p.id = gc.profile_id where gc.child_id = c.id and gc.status = 'approved' and p.deleted_at is null) as guardians,
      (select count(*)::int from guardian_children gc where gc.child_id = c.id and gc.status = 'pending') as pending,
      (select status from child_accounts ca where ca.child_id = c.id and ca.status in ('pending','active') limit 1) as child_account
    from children c
    where c.status = ${status}
      and (${classId}::uuid is null or exists (select 1 from child_classes cc where cc.child_id = c.id and cc.class_id = ${classId}::uuid))
      and (${grade}::int is null or c.grade = ${grade}::int)
      and (${q} = '' or c.full_name ilike ${'%' + q + '%'} or c.kana ilike ${'%' + q + '%'})
    order by c.grade desc, c.kana, c.full_name`

  return (
    <>
      <PageHeader title="名簿" back="/admin" action={<Link href="/admin/roster/new" className="btn-primary btn-sm"><IconPlus className="h-5 w-5" />追加</Link>} />
      <Page className="space-y-3">
        {sp.imported && <Notice tone="ok">{String(sp.imported)}人を登録しました{Number(sp.skipped) > 0 && `（同じ名前の在籍者がいたため${sp.skipped}人は飛ばしました）`}</Notice>}
        {sp.promoted && <Notice tone="ok">進級処理: {String(sp.promoted)}人の学年を上げ、{String(sp.graduated)}人を卒業にしました</Notice>}
        <div className="flex gap-2">
          <Link href="/admin/roster/import" className="btn-secondary btn-sm flex-1">CSVで一括登録</Link>
          <a href="/api/admin/roster.csv" className="btn-secondary btn-sm flex-1">CSVで出力</a>
        </div>
        <form className="card grid grid-cols-2 gap-2 p-3">
          <input name="q" defaultValue={q} placeholder="名前・よみがな" className="input col-span-2" />
          <select name="class" defaultValue={classId ?? ''} className="input">
            <option value="">すべてのクラス</option>
            {cls.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select name="grade" defaultValue={grade ?? ''} className="input">
            <option value="">すべての学年</option>
            {GRADE_OPTIONS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
          </select>
          <select name="status" defaultValue={status} className="input">
            <option value="active">在籍</option>
            <option value="left">在籍終了</option>
            <option value="graduated">卒業</option>
          </select>
          <button className="btn-primary">絞り込み</button>
        </form>
        <p className="px-1 text-sm text-muted">{rows.length}人</p>
        {rows.length === 0 ? (
          <Empty>該当する子どもはいません</Empty>
        ) : (
          <ul className="card divide-y divide-line">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={`/admin/roster/${r.id}`} className="flex items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">
                      {r.full_name} <span className="text-xs font-normal text-muted">{r.kana}</span>
                    </span>
                    <span className="block text-xs text-muted">
                      {gradeLabel(r.grade)}
                      {r.class_names.length > 0 && `・${r.class_names.join('・')}`}
                      ・保護者{r.guardians}人
                      {r.pending > 0 && <span className="text-danger">（申請{r.pending}）</span>}
                      {r.child_account && `・子どもアカウント${r.child_account === 'pending' ? '（承認待ち）' : ''}`}
                    </span>
                  </span>
                  <IconChevron className="h-5 w-5 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        )}
        <details className="card p-4">
          <summary className="cursor-pointer text-sm font-bold">年度替わりの進級</summary>
          <p className="mt-2 text-sm text-muted">毎年4月1日に自動で学年が1つ上がります（クラスは変わりません）。高3の子は「卒業」になります。今すぐ実行する場合は下のボタンを押してください。</p>
          <form action={promoteGradesNow} className="mt-3">
            <SubmitButton className="btn-secondary w-full" confirm="在籍中の全員の学年を1つ上げます。よろしいですか？">今すぐ進級処理を実行</SubmitButton>
          </form>
        </details>
      </Page>
    </>
  )
}
