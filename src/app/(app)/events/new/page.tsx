import { requireAdmin } from '@/lib/auth'
import { classes, eventTypes, venues } from '@/lib/events'
import { jstDateStr } from '@/lib/time'
import { Page, PageHeader } from '@/components/ui'
import { EventForm } from '@/components/event-form'

export const metadata = { title: '予定を登録' }

export default async function NewEventPage({ searchParams }: PageProps<'/events/new'>) {
  await requireAdmin()
  const sp = await searchParams
  const [types, vs, cs] = await Promise.all([eventTypes(), venues(), classes()])
  const date = typeof sp.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : jstDateStr(new Date())
  const typeId = (typeof sp.type === 'string' && types.find((t) => t.id === sp.type)?.id) || types[0]?.id || ''
  return (
    <>
      <PageHeader title="予定を登録" back="/events" />
      <Page>
        <EventForm
          types={types}
          venues={vs}
          classes={cs}
          initial={{
            type_id: typeId,
            title: typeof sp.title === 'string' ? sp.title : '',
            date,
            start_time: typeof sp.time === 'string' ? sp.time : '18:30',
            end_time: '',
            all_day: false,
            venue_id: vs[0]?.id ?? '',
            venue_text: '',
            note: '',
            meet_time: '',
            meet_place: '',
            fee_note: '',
            member_deadline: '',
            entry_deadline: '',
            capacity: '',
            allow_companions: false,
            class_ids: [],
            attachments: [],
          }}
        />
      </Page>
    </>
  )
}
