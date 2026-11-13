import Link from 'next/link'
import type { EventListItem } from '@/lib/events'
import { dowLabel, fmtDate, fmtDateTime, fmtTime, jstDateStr, jstParts } from '@/lib/time'
import { IconClock, IconMap } from './icons'

const GREY = '#9aa3af'

export function EventCard({ e, showDate = false, extra }: { e: EventListItem; showDate?: boolean; extra?: React.ReactNode }) {
  const cancelled = e.status === 'cancelled'
  const venue = e.venue_name ?? e.venue_text
  const time = e.all_day ? '終日' : `${fmtTime(e.starts_at)}${e.ends_at ? `–${fmtTime(e.ends_at)}` : ''}`
  // サーバーコンポーネントなのでリクエストごとに1回だけ評価される
  // eslint-disable-next-line react-hooks/purity
  const deadlineOpen = e.member_deadline && e.member_deadline.getTime() > Date.now()
  return (
    <Link href={`/events/${e.id}`} className={`card flex overflow-hidden ${cancelled ? 'opacity-70' : ''}`}>
      <span className="w-1.5 shrink-0" style={{ background: cancelled ? GREY : e.type_color }} />
      <div className="min-w-0 flex-1 space-y-1 px-3.5 py-3">
        <div className="flex items-center gap-2 text-xs font-bold">
          <span className="rounded-md px-1.5 py-0.5 text-white" style={{ background: cancelled ? GREY : e.type_color }}>{e.type_name}</span>
          {cancelled && <span className="rounded-md bg-danger px-1.5 py-0.5 text-white">中止</span>}
          {e.class_names.length > 0 && <span className="truncate font-normal text-muted">{e.class_names.join('・')}</span>}
        </div>
        <p className={`font-bold ${cancelled ? 'line-through' : ''}`}>{e.title}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted">
          <span className="inline-flex items-center gap-1">
            <IconClock className="h-4 w-4" />
            <span className="num text-[0.95rem] text-text">
              {showDate && `${fmtDate(e.starts_at)} `}
              {time}
            </span>
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
            <span className="rounded-md bg-brand-soft px-1.5 py-0.5 font-bold text-brand">
              参加 {e.going}
              {e.capacity ? ` / ${e.capacity}` : ''}人
            </span>
            {e.waitlist > 0 && <span className="rounded-md bg-ball-soft px-1.5 py-0.5 font-bold text-ball-ink">キャンセル待ち {e.waitlist}</span>}
            {e.member_deadline && (
              <span className="text-muted">
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

/** 1行の予定（ホームの「これから1週間」）。左に日付、右に状態 */
export function EventRow({ e, today, needsAnswer = false }: { e: EventListItem; today: string; needsAnswer?: boolean }) {
  const cancelled = e.status === 'cancelled'
  const p = jstParts(e.starts_at)
  const venue = e.venue_name ?? e.venue_text
  const isToday = jstDateStr(e.starts_at) === today
  return (
    <Link href={`/events/${e.id}`} className="flex min-h-14 items-center gap-3 px-3 py-2.5">
      <span className={`flex w-11 shrink-0 flex-col items-center rounded-xl py-1 ${isToday ? 'bg-brand text-white' : 'bg-bg'}`}>
        <span className="num text-lg leading-5">{p.day}</span>
        <span className={`text-[0.7rem] font-bold ${isToday ? '' : p.dow === 0 ? 'text-danger' : p.dow === 6 ? 'text-brand' : 'text-muted'}`}>{dowLabel(e.starts_at)}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className={`flex items-center gap-1.5 font-bold ${cancelled ? 'text-muted line-through' : ''}`}>
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: cancelled ? GREY : e.type_color }} />
          <span className="truncate">{e.title}</span>
        </span>
        <span className="block truncate text-sm text-muted">
          <span className="num text-[0.95rem]">{e.all_day ? '終日' : `${fmtTime(e.starts_at)}${e.ends_at ? `–${fmtTime(e.ends_at)}` : ''}`}</span>
          {venue && `　${venue}`}
        </span>
      </span>
      {cancelled ? (
        <span className="shrink-0 rounded-md bg-danger px-1.5 py-0.5 text-xs font-bold text-white">中止</span>
      ) : needsAnswer ? (
        <span className="shrink-0 rounded-md bg-ball px-1.5 py-0.5 text-xs font-bold text-text">回答する</span>
      ) : null}
    </Link>
  )
}
