import { requireAdmin } from '@/lib/auth'
import { sql } from '@/lib/db'
import { fmtDate } from '@/lib/time'
import { createAlbum } from '@/app/actions/media'
import { Page, PageHeader } from '@/components/ui'
import { SubmitButton } from '@/components/client'
import { Uploader } from '@/components/uploader'

export const metadata = { title: 'アルバムを作成' }

export default async function NewAlbumPage() {
  await requireAdmin()
  const events = await sql<{ id: string; title: string; starts_at: Date }[]>`
    select e.id, e.title, e.starts_at from events e join event_types t on t.id = e.type_id
    where not t.uses_arrival and e.starts_at > now() - interval '120 days' and e.starts_at < now() + interval '30 days'
    order by e.starts_at desc limit 50`
  return (
    <>
      <PageHeader title="アルバムを作成" back="/albums" />
      <Page>
        <form action={createAlbum} className="card space-y-4 p-4">
          <label className="block">
            <span className="label">タイトル</span>
            <input name="title" className="input" required maxLength={100} placeholder="例: 11月 市民大会" />
          </label>
          <label className="block">
            <span className="label">関連する予定（任意）</span>
            <select name="event_id" className="input">
              <option value="">なし</option>
              {events.map((e) => <option key={e.id} value={e.id}>{fmtDate(e.starts_at)} {e.title}</option>)}
            </select>
          </label>
          <div>
            <span className="label">写真</span>
            <Uploader purpose="album" accept="image/*" label="写真を選ぶ" />
          </div>
          <SubmitButton>作成する</SubmitButton>
        </form>
      </Page>
    </>
  )
}
