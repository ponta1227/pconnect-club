import { requireAdmin } from '@/lib/auth'
import { eventTypes } from '@/lib/events'
import { deleteEventType, saveEventType } from '@/app/actions/admin'
import { Page, PageHeader } from '@/components/ui'
import { ActionButton, SubmitButton } from '@/components/client'

export const metadata = { title: '予定の種別' }

function TypeFields({ t }: { t?: { name: string; color: string; uses_rsvp: boolean; uses_arrival: boolean; remind: boolean; sort: number } }) {
  return (
    <>
      <div className="flex gap-2">
        <input name="color" type="color" defaultValue={t?.color ?? '#1e6fd9'} className="h-11 w-12 shrink-0 rounded-lg border border-line" aria-label="色" />
        <input name="name" defaultValue={t?.name} className="input flex-1" placeholder="種別名" maxLength={20} required />
        <input name="sort" type="number" defaultValue={t?.sort ?? 0} className="input w-16" aria-label="並び順" />
      </div>
      <div className="space-y-1 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" name="uses_rsvp" defaultChecked={t?.uses_rsvp} className="h-5 w-5" />参加ボタンを使う（大会・イベント向け）</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="uses_arrival" defaultChecked={t?.uses_arrival} className="h-5 w-5" />到着登録・欠席連絡の対象（練習向け）</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="remind" defaultChecked={t?.remind ?? true} className="h-5 w-5" />部内締めのリマインドを送る</label>
      </div>
    </>
  )
}

export default async function TypesPage() {
  await requireAdmin()
  const rows = await eventTypes()
  return (
    <>
      <PageHeader title="予定の種別" back="/admin" />
      <Page className="space-y-3">
        {rows.map((t) => (
          <div key={t.id} className="card space-y-2 p-3">
            <form action={saveEventType} className="space-y-2">
              <input type="hidden" name="id" value={t.id} />
              <TypeFields t={t} />
              <SubmitButton className="btn-secondary btn-sm w-full">保存</SubmitButton>
            </form>
            <ActionButton action={deleteEventType.bind(null, t.id)} className="btn-ghost btn-sm text-danger" confirm={`「${t.name}」を削除しますか？`}>削除</ActionButton>
          </div>
        ))}
        <form action={saveEventType} className="card space-y-2 p-3">
          <p className="text-sm font-bold">種別を追加</p>
          <TypeFields />
          <SubmitButton className="btn-primary btn-sm w-full">追加</SubmitButton>
        </form>
      </Page>
    </>
  )
}
