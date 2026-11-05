import { requireAdmin } from '@/lib/auth'
import { sql } from '@/lib/db'
import { deleteVenue, saveVenue } from '@/app/actions/admin'
import { Page, PageHeader } from '@/components/ui'
import { ActionButton, SubmitButton } from '@/components/client'

export const metadata = { title: '会場' }

function VenueFields({ v }: { v?: { name: string; address: string; note: string; sort: number } }) {
  return (
    <>
      <input name="name" defaultValue={v?.name} className="input" placeholder="会場名" maxLength={50} required />
      <input name="address" defaultValue={v?.address} className="input" placeholder="住所（地図リンクに使います）" maxLength={200} />
      <div className="flex gap-2">
        <input name="note" defaultValue={v?.note} className="input flex-1" placeholder="メモ（例: 月・火 18:30–20:30）" maxLength={200} />
        <input name="sort" type="number" defaultValue={v?.sort ?? 0} className="input w-16" aria-label="並び順" />
      </div>
    </>
  )
}

export default async function VenuesPage() {
  await requireAdmin()
  const rows = await sql<{ id: string; name: string; address: string; note: string; sort: number }[]>`select id, name, address, note, sort from venues order by sort, name`
  return (
    <>
      <PageHeader title="会場" back="/admin" />
      <Page className="space-y-3">
        {rows.map((r) => (
          <div key={r.id} className="card space-y-2 p-3">
            <form action={saveVenue} className="space-y-2">
              <input type="hidden" name="id" value={r.id} />
              <VenueFields v={r} />
              <SubmitButton className="btn-secondary btn-sm w-full">保存</SubmitButton>
            </form>
            <ActionButton action={deleteVenue.bind(null, r.id)} className="btn-ghost btn-sm text-danger" confirm={`「${r.name}」を削除しますか？`}>削除</ActionButton>
          </div>
        ))}
        <form action={saveVenue} className="card space-y-2 p-3">
          <p className="text-sm font-bold">会場を追加</p>
          <VenueFields />
          <SubmitButton className="btn-primary btn-sm w-full">追加</SubmitButton>
        </form>
      </Page>
    </>
  )
}
