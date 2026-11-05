import Link from 'next/link'
import type { EventListItem } from '@/lib/events'
import { fmtDate, fmtDateTime, fmtTime } from '@/lib/time'
import { IconClock, IconMap } from './icons'

export function EventCard({ e, showDate = false, extra }: { e: EventListItem; showDate?: boolean; extra?: React.ReactNode }) {
  const cancelled = e.status === 'cancelled'
  const venue = e.venue_name ?? e.venue_text
  const time = e.all_day ? '終日' : `${fmtTime(e.starts_at)}${e.ends_at ? `–${fmtTime(e.ends_at)}` : ''}`
  // サーバーコンポーネントなのでリクエストごとに1回だけ評価される
  // eslint-disable-next-line react-hooks/purity
  const deadlineOpen = e.member_deadline && e.member_deadline.getTime() > Date.now()
  return (
    <Link href={`/events/${e.id}`} className={`card flex overflow-hidden ${cancelled ? 'opacity-70' : ''}`}>
      <span className="w-1.5 shrink-0" style={{ background: cancelled ? '#9aa3af' : e.type_color }} />
      <div className="min-w-0 flex-1 space-y-1 px-3.5 py-3">
        <div className="flex items-center gap-2">
          <span className="badge text-white" style={{ background: cancelled ? '#9aa3af' : e.type_color }}>{e.type_name}</span>
          {cancelled && <span className="badge bg-danger text-white">中止</span>}
          {e.class_names.length > 0 && <span className="truncate text-xs text-muted">{e.class_names.join('・')}</span>}
        </div>
        <p className={`font-bold ${cancelled ? 'line-through' : ''}`}>{e.title}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted">
          <span className="inline-flex items-center gap-1">
            <IconClock className="h-4 w-4" />
            {showDate && `${fmtDate(e.starts_at)} `}
            {time}
          </span>
          {venue && (
            <span className="inline-flex items-center gap-1">
              <IconMap className="h-4 w-4" />
              {venue}
            </span>
          )}
        </div>
        {e.uses_rsvp && !cancelled && (
          <div className="flex flex-wrap items-center gap-2 pt-0.5 text-xs">
            <span className="badge bg-brand-soft text-brand">
              参加 {e.going}
              {e.capacity ? ` / ${e.capacity}` : ''}人
            </span>
            {e.waitlist > 0 && <span className="badge bg-warn-soft text-warn">キャンセル待ち {e.waitlist}</span>}
            {e.member_deadline && (
              <span className={deadlineOpen ? 'text-danger' : 'text-muted'}>
                部内締め {fmtDateTime(e.member_deadline)}
                {!deadlineOpen && '（締切）'}
              </span>
            )}
          </div>
        )}
        {extra}
      </div>
    </Link>
  )
}
