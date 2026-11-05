'use client'

import { useActionState, useState } from 'react'
import { saveEvent, type FormState } from '@/app/actions/events'
import { Uploader, type UploadedFile } from './uploader'

type Type = { id: string; name: string; color: string; uses_rsvp: boolean; uses_arrival: boolean }
type Opt = { id: string; name: string }

export type EventFormValues = {
  id?: string
  series?: boolean
  type_id: string
  title: string
  date: string
  start_time: string
  end_time: string
  all_day: boolean
  venue_id: string
  venue_text: string
  note: string
  meet_time: string
  meet_place: string
  fee_note: string
  member_deadline: string
  entry_deadline: string
  capacity: string
  allow_companions: boolean
  class_ids: string[]
  attachments: UploadedFile[]
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

export function EventForm({
  types,
  venues,
  classes,
  initial,
}: {
  types: Type[]
  venues: Opt[]
  classes: Opt[]
  initial: EventFormValues
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveEvent, undefined)
  const [typeId, setTypeId] = useState(initial.type_id)
  const [allDay, setAllDay] = useState(initial.all_day)
  const [repeat, setRepeat] = useState<'none' | 'weekly' | 'monthly'>('none')
  const [venueId, setVenueId] = useState(initial.venue_id)
  const type = types.find((t) => t.id === typeId)
  const isEdit = !!initial.id

  return (
    <form action={action} className="space-y-5">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}

      <section className="card space-y-4 p-4">
        <div>
          <span className="label">種別</span>
          <div className="flex flex-wrap gap-2">
            {types.map((t) => (
              <label key={t.id} className={`btn-sm btn cursor-pointer border ${typeId === t.id ? 'border-transparent text-white' : 'border-line bg-white'}`} style={typeId === t.id ? { background: t.color } : undefined}>
                <input type="radio" name="type_id" value={t.id} checked={typeId === t.id} onChange={() => setTypeId(t.id)} className="sr-only" />
                {t.name}
              </label>
            ))}
          </div>
        </div>
        <label className="block">
          <span className="label">タイトル</span>
          <input name="title" className="input" defaultValue={initial.title} maxLength={100} required placeholder={type?.uses_rsvp ? '例: 〇〇市民大会' : '例: 練習'} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-2 block">
            <span className="label">日付</span>
            <input type="date" name="date" className="input" defaultValue={initial.date} required />
          </label>
          {!allDay && (
            <>
              <label className="block">
                <span className="label">開始</span>
                <input type="time" name="start_time" className="input" defaultValue={initial.start_time} required />
              </label>
              <label className="block">
                <span className="label">終了</span>
                <input type="time" name="end_time" className="input" defaultValue={initial.end_time} />
              </label>
            </>
          )}
          <label className="col-span-2 flex items-center gap-2 text-sm">
            <input type="checkbox" name="all_day" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="h-5 w-5" />
            終日
          </label>
        </div>

        {!isEdit && (
          <div className="space-y-2 rounded-xl bg-bg p-3">
            <span className="label">繰り返し</span>
            <select name="repeat" className="input" value={repeat} onChange={(e) => setRepeat(e.target.value as typeof repeat)}>
              <option value="none">繰り返さない</option>
              <option value="weekly">毎週（曜日を選ぶ）</option>
              <option value="monthly">毎月（同じ日）</option>
            </select>
            {repeat === 'weekly' && (
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAYS.map((w, i) => (
                  <label key={w} className="cursor-pointer">
                    <input type="checkbox" name="weekdays" value={i} className="peer sr-only" />
                    <span className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-white text-sm font-bold peer-checked:border-brand peer-checked:bg-brand peer-checked:text-white">{w}</span>
                  </label>
                ))}
              </div>
            )}
            {repeat !== 'none' && (
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="label">終了日</span>
                  <input type="date" name="until_date" className="input" />
                </label>
                <label className="block">
                  <span className="label">または回数</span>
                  <input type="number" name="count" min={1} max={400} className="input" />
                </label>
                <p className="hint col-span-2">どちらも空なら1年分を作ります。開始日以降の該当日に登録されます。</p>
              </div>
            )}
          </div>
        )}
        {isEdit && initial.series && (
          <div className="space-y-1 rounded-xl bg-bg p-3">
            <span className="label">変更する範囲</span>
            {[
              ['this', 'この予定のみ'],
              ['following', 'これ以降すべて'],
              ['all', 'すべて'],
            ].map(([v, l]) => (
              <label key={v} className="flex items-center gap-2 text-sm">
                <input type="radio" name="scope" value={v} defaultChecked={v === 'this'} className="h-4 w-4" /> {l}
              </label>
            ))}
            <p className="hint">「これ以降」「すべて」では各回の日付は変わらず、時刻や内容が変わります。</p>
          </div>
        )}
      </section>

      <section className="card space-y-4 p-4">
        <label className="block">
          <span className="label">会場</span>
          <select name="venue_id" className="input" value={venueId} onChange={(e) => setVenueId(e.target.value)}>
            {venues.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
            <option value="">その他（自由入力）</option>
          </select>
        </label>
        {!venueId && <input name="venue_text" className="input" defaultValue={initial.venue_text} placeholder="会場名・住所" maxLength={100} />}
        {classes.length > 0 && (
          <div>
            <span className="label">対象クラス</span>
            <div className="flex flex-wrap gap-2">
              {classes.map((c) => (
                <label key={c.id} className="cursor-pointer">
                  <input type="checkbox" name="class_ids" value={c.id} defaultChecked={initial.class_ids.includes(c.id)} className="peer sr-only" />
                  <span className="badge min-h-9 border border-line bg-white px-3 text-sm peer-checked:border-brand peer-checked:bg-brand-soft peer-checked:text-brand">{c.name}</span>
                </label>
              ))}
            </div>
            <p className="hint">選ばない場合は全員が対象です。</p>
          </div>
        )}
        <label className="block">
          <span className="label">メモ</span>
          <textarea name="note" rows={4} className="input" defaultValue={initial.note} maxLength={5000} />
        </label>
        <div>
          <span className="label">添付</span>
          <Uploader purpose="event" initial={initial.attachments} />
        </div>
      </section>

      {type?.uses_rsvp && (
        <section className="card space-y-4 p-4">
          <p className="text-sm font-bold">参加の受付</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="label">集合時刻</span>
              <input name="meet_time" className="input" defaultValue={initial.meet_time} placeholder="例: 7:30" maxLength={50} />
            </label>
            <label className="block">
              <span className="label">集合場所</span>
              <input name="meet_place" className="input" defaultValue={initial.meet_place} placeholder="例: 朝霞台駅" maxLength={100} />
            </label>
          </div>
          <label className="block">
            <span className="label">参加費・持ち物・服装など</span>
            <textarea name="fee_note" rows={3} className="input" defaultValue={initial.fee_note} maxLength={2000} />
          </label>
          <label className="block">
            <span className="label">大会の申込締切（管理者のみ表示）</span>
            <input type="datetime-local" name="entry_deadline" className="input" defaultValue={initial.entry_deadline} />
          </label>
          <label className="block">
            <span className="label">部内締め（参加ボタンの受付締切）</span>
            <input type="datetime-local" name="member_deadline" className="input" defaultValue={initial.member_deadline} />
            <span className="hint block">空欄で申込締切がある場合は、申込締切の2週間前になります。どちらも空欄なら開始時刻まで受け付けます。</span>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="label">定員</span>
              <input type="number" name="capacity" min={1} className="input" defaultValue={initial.capacity} placeholder="なし" />
            </label>
            <label className="flex items-end gap-2 pb-3 text-sm">
              <input type="checkbox" name="allow_companions" defaultChecked={initial.allow_companions} className="h-5 w-5" />
              同行者数を入力
            </label>
          </div>
        </section>
      )}

      <label className="flex items-center gap-2 px-1 text-sm">
        <input type="checkbox" name="notify" defaultChecked={!isEdit} className="h-5 w-5" />
        {isEdit ? '変更を対象者に通知する' : '対象者に通知する'}
      </label>
      {state?.error && <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{state.error}</p>}
      <button className="btn-primary w-full" disabled={pending}>
        {pending ? '保存中…' : isEdit ? '変更を保存' : '登録する'}
      </button>
    </form>
  )
}
