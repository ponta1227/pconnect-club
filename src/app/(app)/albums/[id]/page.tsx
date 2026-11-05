import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { sql } from '@/lib/db'
import { fmtDate } from '@/lib/time'
import { deleteAlbum } from '@/app/actions/media'
import { Page, PageHeader } from '@/components/ui'
import { ActionButton } from '@/components/client'
import { AlbumAdder, AlbumGrid } from '@/components/album'

export const metadata = { title: 'アルバム' }

export default async function AlbumPage({ params }: PageProps<'/albums/[id]'>) {
  const user = await requireUser()
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const [album] = await sql<{ title: string; created_at: Date; event_id: string | null; event_title: string | null; event_date: Date | null }[]>`
    select a.title, a.created_at, a.event_id, e.title as event_title, e.starts_at as event_date
    from albums a left join events e on e.id = a.event_id where a.id = ${id}`
  if (!album) notFound()
  const photos = await sql<{ id: string; file_name: string; created_by: string | null }[]>`
    select id, file_name, created_by from attachments where owner_type = 'album' and owner_id = ${id} and uploaded order by created_at`
  return (
    <>
      <PageHeader title={album.title} sub={`${fmtDate(album.event_date ?? album.created_at)}・${photos.length}枚`} back="/albums" />
      <Page className="space-y-4">
        {album.event_id && (
          <a href={`/events/${album.event_id}`} className="block text-sm text-brand underline">予定: {album.event_title}</a>
        )}
        <AlbumGrid
          title={album.title}
          photos={photos.map((p) => ({ id: p.id, file_name: p.file_name, canDelete: user.isAdmin || p.created_by === user.id }))}
        />
        {user.isAdmin && (
          <>
            <section className="card space-y-2 p-4">
              <h2 className="text-sm font-bold">写真を追加</h2>
              <AlbumAdder albumId={id} />
            </section>
            <ActionButton action={deleteAlbum.bind(null, id)} className="btn-secondary w-full text-danger" confirm="アルバムと写真をすべて削除しますか？">
              アルバムを削除
            </ActionButton>
          </>
        )}
      </Page>
    </>
  )
}
