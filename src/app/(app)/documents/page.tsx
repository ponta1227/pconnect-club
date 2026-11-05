import { requireUser } from '@/lib/auth'
import { sql } from '@/lib/db'
import { classes as listClasses } from '@/lib/events'
import { fmtDate } from '@/lib/time'
import { createDocument, deleteDocument } from '@/app/actions/media'
import { Empty, Notice, Page, PageHeader } from '@/components/ui'
import { ActionButton, SubmitButton } from '@/components/client'
import { Uploader } from '@/components/uploader'
import { IconFile } from '@/components/icons'

export const metadata = { title: '資料' }

export default async function DocumentsPage({ searchParams }: PageProps<'/documents'>) {
  const user = await requireUser()
  const sp = await searchParams
  const q = typeof sp.q === 'string' ? sp.q.trim() : ''
  const classId = typeof sp.class === 'string' && /^[0-9a-f-]{36}$/.test(sp.class) ? sp.class : null
  const cls = await listClasses()
  const docs = await sql<{ id: string; title: string; created_at: Date; attachment_id: string | null; size: number | null; class_names: string[] }[]>`
    select d.id, d.title, d.created_at, d.attachment_id, a.size,
      coalesce((select array_agg(c.name order by c.sort) from document_classes dc join classes c on c.id = dc.class_id where dc.document_id = d.id), '{}') as class_names
    from documents d left join attachments a on a.id = d.attachment_id
    where (${q} = '' or d.title ilike ${'%' + q + '%'})
      and (${classId}::uuid is null or not exists (select 1 from document_classes dc where dc.document_id = d.id)
           or exists (select 1 from document_classes dc where dc.document_id = d.id and dc.class_id = ${classId}::uuid))
    order by d.created_at desc`
  return (
    <>
      <PageHeader title="資料" back="/more" />
      <Page className="space-y-3">
        <form className="flex gap-2">
          <input name="q" defaultValue={q} placeholder="タイトルで検索" className="input flex-1" />
          {cls.length > 0 && (
            <select name="class" defaultValue={classId ?? ''} className="input w-auto">
              <option value="">全クラス</option>
              {cls.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <button className="btn-secondary">検索</button>
        </form>
        {docs.length === 0 ? (
          <Empty>資料はありません</Empty>
        ) : (
          <ul className="card divide-y divide-line">
            {docs.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-4 py-3">
                <IconFile className="h-7 w-7 shrink-0 text-danger" />
                <a href={d.attachment_id ? `/api/files/${d.attachment_id}` : '#'} target="_blank" rel="noopener" className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{d.title}</span>
                  <span className="block text-xs text-muted">
                    {fmtDate(d.created_at)}
                    {d.size ? `・${Math.ceil(d.size / 1024)}KB` : ''}
                    {d.class_names.length > 0 && `・${d.class_names.join('・')}`}
                  </span>
                </a>
                {user.isAdmin && (
                  <ActionButton action={deleteDocument.bind(null, d.id)} className="btn-ghost btn-sm text-danger" confirm={`「${d.title}」を削除しますか？`}>削除</ActionButton>
                )}
              </li>
            ))}
          </ul>
        )}

        {user.isAdmin && (
          <form action={createDocument} className="card space-y-3 p-4">
            <h2 className="font-bold">資料を配布（PDF）</h2>
            {sp.error && <Notice tone="danger">PDFを選んでください</Notice>}
            <input name="title" className="input" placeholder="タイトル（例: 〇〇大会 要項）" required maxLength={100} />
            <Uploader purpose="document" accept="application/pdf" label="PDFを選ぶ" />
            {cls.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {cls.map((c) => (
                  <label key={c.id} className="cursor-pointer">
                    <input type="checkbox" name="class_ids" value={c.id} className="peer sr-only" />
                    <span className="badge min-h-9 border border-line bg-white px-3 text-sm peer-checked:border-brand peer-checked:bg-brand-soft peer-checked:text-brand">{c.name}</span>
                  </label>
                ))}
              </div>
            )}
            <SubmitButton>配布する</SubmitButton>
          </form>
        )}
      </Page>
    </>
  )
}
