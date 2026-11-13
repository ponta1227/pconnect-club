import { requireAdmin } from '@/lib/auth'
import { classes, eventTypes, getEvent, venues } from '@/lib/events'
import { practiceSlots } from '@/lib/schedule'
import { fromJst, jstDateStr, jstParts, jstTimeStr } from '@/lib/time'
import { Page, PageHeader } from '@/components/ui'
import { EventForm } from '@/components/event-form'

export const metadata = { title: '予定を登録' }

export default async function NewEventPage({ searchParams }: PageProps<'/events/new'>) {
  await requireAdmin()
  const sp = await searchParams
  const [types, vs, cs, slots] = await Promise.all([eventTypes(), venues(), classes(), practiceSlots()])
  const date = typeof sp.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : jstDateStr(new Date())

  // 「複製して新しく作る」：元の予定の内容を引き継ぐ（日付と締切は入れ直す）
  const from = typeof sp.from === 'string' ? await getEvent(sp.from) : null

  const type =
    (from && types.find((t) => t.id === from.type_id)) ||
    (typeof sp.type === 'string' && types.find((t) => t.id === sp.type)) ||
    (sp.kind === 'rsvp' && types.find((t) => t.uses_rsvp)) ||
    types[0]
  const slot = type?.uses_arrival ? slots.find((s) => s.weekday === jstParts(fromJst(date)).dow) : undefined

  return (
    <>
      <PageHeader title={from ? '予定を複製' : '予定を登録'} back={from ? `/events/${from.id}` : '/events'} />
      <Page>
        <EventForm
          types={types}
          venues={vs}
          classes={cs}
          slots={slots}
          initial={
            from
              ? {
                  type_id: from.type_id,
                  title: from.title,
                  date,
                  start_time: from.all_day ? '' : jstTimeStr(from.starts_at),
                  end_time: from.ends_at ? jstTimeStr(from.ends_at) : '',
                  all_day: from.all_day,
                  venue_id: from.venue_id ?? '',
                  venue_text: from.venue_text,
                  note: from.note,
                  meet_time: from.meet_time,
                  meet_place: from.meet_place,
                  fee_note: from.fee_note,
                  member_deadline: '',
                  entry_deadline: '',
                  capacity: from.capacity ? String(from.capacity) : '',
                  allow_companions: from.allow_companions,
                  class_ids: from.class_ids,
                  attachments: [],
                }
              : {
                  type_id: type?.id ?? '',
                  title: typeof sp.title === 'string' ? sp.title : type?.uses_arrival ? type.name : '',
                  date,
                  start_time: slot?.start_time ?? (type?.uses_rsvp ? '09:00' : '18:30'),
                  end_time: slot?.end_time ?? '',
                  all_day: false,
                  venue_id: slot?.venue_id ?? vs[0]?.id ?? '',
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
                }
          }
        />
      </Page>
    </>
  )
}
