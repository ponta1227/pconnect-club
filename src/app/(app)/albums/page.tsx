import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { sql } from '@/lib/db'
import { fmtDate } from '@/lib/time'
import { Empty, Page, PageHeader } from '@/components/ui'
import { IconPhoto, IconPlus } from '@/components/icons'

export const metadata = { title: 'アルバム' }

export default async function AlbumsPage() {
  const user = await requireUser()
  const albums = await sql<{ id: string; title: string; created_at: Date; count: number; cover: string | null; event_date: Date | null }[]>`
    select a.id, a.title, a.created_at, e.starts_at as event_date,
      (select count(*)::int from attachments x where x.owner_type = 'album' and x.owner_id = a.id and x.uploaded) as count,
      (select x.id from attachments x where x.owner_type = 'album' and x.owner_id = a.id and x.uploaded order by x.created_at limit 1) as cover
    from albums a left join events e on e.id = a.event_id
    order by coalesce(e.starts_at, a.created_at) desc`
  return (
    <>
      <PageHeader title="アルバム" back="/more" action={user.isAdmin ? <Link href="/albums/new" className="btn-primary btn-sm"><IconPlus className="h-5 w-5" />作成</Link> : undefined} />
      <Page>
        {albums.length === 0 ? (
          <Empty>アルバムはまだありません</Empty>
        ) : (
          <ul className="grid grid-cols-2 gap-3">
            {albums.map((a) => (
              <li key={a.id}>
                <Link href={`/albums/${a.id}`} className="card block overflow-hidden">
                  {a.cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/files/${a.cover}`} alt="" loading="lazy" className="aspect-square w-full object-cover" />
                  ) : (
                    <div className="flex aspect-square items-center justify-center bg-bg text-muted"><IconPhoto className="h-10 w-10" /></div>
                  )}
                  <div className="p-2.5">
                    <p className="truncate text-sm font-bold">{a.title}</p>
                    <p className="text-xs text-muted">{fmtDate(a.event_date ?? a.created_at)}・{a.count}枚</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Page>
    </>
  )
}
