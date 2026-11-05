import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/auth'
import { classes, eventTypes, getEvent, venues } from '@/lib/events'
import { attachmentsFor } from '@/lib/files'
import { jstDateStr, jstTimeStr, toDatetimeLocal } from '@/lib/time'
import { Page, PageHeader } from '@/components/ui'
import { EventForm } from '@/components/event-form'

export const metadata = { title: '予定を編集' }

export default async function EditEventPage({ params }: PageProps<'/events/[id]/edit'>) {
  await requireAdmin()
  const { id } = await params
  const e = await getEvent(id)
  if (!e) notFound()
  const [types, vs, cs, files] = await Promise.all([eventTypes(), venues(), classes(), attachmentsFor('event', [id])])
  return (
    <>
      <PageHeader title="予定を編集" back={`/events/${id}`} />
      <Page>
        <EventForm
          types={types}
          venues={vs}
          classes={cs}
          initial={{
            id: e.id,
            series: !!e.series_id,
            type_id: e.type_id,
            title: e.title,
            date: jstDateStr(e.starts_at),
            start_time: e.all_day ? '' : jstTimeStr(e.starts_at),
            end_time: e.ends_at ? jstTimeStr(e.ends_at) : '',
            all_day: e.all_day,
            venue_id: e.venue_id ?? '',
            venue_text: e.venue_text,
            note: e.note,
            meet_time: e.meet_time,
            meet_place: e.meet_place,
            fee_note: e.fee_note,
            member_deadline: toDatetimeLocal(e.member_deadline),
            entry_deadline: toDatetimeLocal(e.entry_deadline),
            capacity: e.capacity ? String(e.capacity) : '',
            allow_companions: e.allow_companions,
            class_ids: e.class_ids,
            attachments: files.get(id) ?? [],
          }}
        />
      </Page>
    </>
  )
}
