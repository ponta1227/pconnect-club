import { requireAdmin } from '@/lib/auth'
import { sql } from '@/lib/db'
import { deleteClass, saveClass } from '@/app/actions/admin'
import { Page, PageHeader } from '@/components/ui'
import { ActionButton, SubmitButton } from '@/components/client'

export const metadata = { title: 'クラス' }

export default async function ClassesPage() {
  await requireAdmin()
  const rows = await sql<{ id: string; name: string; sort: number; children: number }[]>`
    select c.id, c.name, c.sort, (select count(*)::int from child_classes cc join children ch on ch.id = cc.child_id and ch.status = 'active' where cc.class_id = c.id) as children
    from classes c order by sort, name`
  return (
    <>
      <PageHeader title="クラス" back="/admin" />
      <Page className="space-y-3">
        <p className="px-1 text-sm text-muted">学年やコース（初心者・選手など）を自由に作れます。予定・掲示板の対象や、タブレットの絞り込みに使います。</p>
        {rows.map((r) => (
          <div key={r.id} className="card space-y-2 p-3">
            <form action={saveClass} className="flex items-center gap-2">
              <input type="hidden" name="id" value={r.id} />
              <input name="name" defaultValue={r.name} className="input flex-1" maxLength={30} required />
              <input name="sort" type="number" defaultValue={r.sort} className="input w-16" aria-label="並び順" />
              <SubmitButton className="btn-secondary btn-sm">保存</SubmitButton>
            </form>
            <div className="flex items-center justify-between text-xs text-muted">
              <span>在籍 {r.children}人</span>
              <ActionButton action={deleteClass.bind(null, r.id)} className="btn-ghost btn-sm text-danger" confirm={`「${r.name}」を削除しますか？（子どもの所属からも外れます）`}>削除</ActionButton>
            </div>
          </div>
        ))}
        <form action={saveClass} className="card flex items-center gap-2 p-3">
          <input name="name" className="input flex-1" placeholder="新しいクラス名" maxLength={30} required />
          <input name="sort" type="number" defaultValue={rows.length + 1} className="input w-16" aria-label="並び順" />
          <SubmitButton className="btn-primary btn-sm">追加</SubmitButton>
        </form>
      </Page>
    </>
  )
}
