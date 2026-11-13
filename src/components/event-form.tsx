'use client'

import { useActionState, useState } from 'react'
import { saveEvent, type FormState } from '@/app/actions/events'
import { defaultMemberDeadline } from '@/lib/event-rules'
import { fmtDateTime, fromDatetimeLocal, fromJst, jstParts } from '@/lib/time'
import { Uploader, type UploadedFile } from './uploader'

type Type = { id: string; name: string; color: string; uses_rsvp: boolean; uses_arrival: boolean }
type Opt = { id: string; name: string }
export type Slot = { weekday: number; venue_id: string | null; start_time: string; end_time: string }

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
  slots = [],
  initial,
}: {
  types: Type[]
  venues: Opt[]
  classes: Opt[]
  /** いつもの練習（曜日ごとの会場・時間）。練習を新しく作るとき、日付に合わせて自動で入る */
  slots?: Slot[]
  initial: EventFormValues
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveEvent, undefined)
  const isEdit = !!initial.id
  const [typeId, setTypeId] = useState(initial.type_id)
  const [title, setTitle] = useState(initial.title)
  const [date, setDate] = useState(initial.date)
  const [start, setStart] = useState(initial.start_time)
  const [end, setEnd] = useState(initial.end_time)
  const [allDay, setAllDay] = useState(initial.all_day)
  const [venueId, setVenueId] = useState(initial.venue_id)
  const [repeat, setRepeat] = useState<'none' | 'weekly' | 'monthly'>('none')
  const [entry, setEntry] = useState(initial.entry_deadline)
  const [announce, setAnnounce] = useState(true)
  // 時間・会場を自分で変えるまでは、「いつもの練習」に合わせて自動で入れる
  const [followSlot, setFollowSlot] = useState(!isEdit)

  const type = types.find((t) => t.id === typeId)
  const rsvp = !!type?.uses_rsvp
  const autoDeadline = defaultMemberDeadline(fromDatetimeLocal(entry))
  const [manualDeadline, setManualDeadline] = useState(
    !!initial.member_deadline &&
      fromDatetimeLocal(initial.member_deadline)?.getTime() !== defaultMemberDeadline(fromDatetimeLocal(initial.entry_deadline))?.getTime(),
  )

  const applySlot = (nextType: Type | undefined, nextDate: string) => {
    if (!followSlot || !nextType?.uses_arrival || !/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) return
    const slot = slots.find((s) => s.weekday === jstParts(fromJst(nextDate)).dow)
    if (!slot) return
    setStart(slot.start_time)
    setEnd(slot.end_time)
    if (slot.venue_id) setVenueId(slot.venue_id)
    setAllDay(false)
  }
  const changeType = (t: Type) => {
    setTypeId(t.id)
    if (!isEdit) {
      // 種別の名前がそのままタイトルになっているときは、新しい種別の名前に合わせる
      if (t.uses_arrival && (!title || types.some((x) => x.name === title))) setTitle(t.name)
      else if (!t.uses_arrival && types.some((x) => x.uses_arrival && x.name === title)) setTitle('')
    }
    applySlot(t, date)
  }

  const detailsOpen =
    initial.class_ids.length > 0 || !!initial.capacity || initial.allow_companions || !!initial.meet_time || !!initial.meet_place

  return (
    <form action={action} className="space-y-4">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}

      <section className="card space-y-4 p-4">
        <fieldset>
          <legend className="label">何の予定ですか？</legend>
          <div className="grid grid-cols-3 gap-2">
            {types.map((t) => (
              <label
                key={t.id}
                className={`flex min-h-12 cursor-pointer items-center justify-center rounded-xl border-2 px-2 text-center text-[0.95rem] font-bold ${
                  typeId === t.id ? 'border-transparent text-white' : 'border-line bg-white text-text'
                }`}
                style={typeId === t.id ? { background: t.color } : undefined}
              >
                <input type="radio" name="type_id" value={t.id} checked={typeId === t.id} onChange={() => changeType(t)} className="sr-only" />
                {t.name}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="block">
          <span className="label">タイトル</span>
          <input
            name="title"
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={100}
            required
            placeholder={rsvp ? '例: 〇〇市民大会' : '例: 練習'}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-2 block">
            <span className="label">日付</span>
            <input
              type="date"
              name="date"
              className="input"
              value={date}
              onChange={(e) => {
                setDate(e.target.value)
                applySlot(type, e.target.value)
              }}
              required
            />
          </label>
          {!allDay && (
            <>
              <label className="block">
                <span className="label">開始</span>
                <input
                  type="time"
                  name="start_time"
                  className="input"
                  value={start}
                  onChange={(e) => {
                    setStart(e.target.value)
                    setFollowSlot(false)
                  }}
                  required
                />
              </label>
              <label className="block">
                <span className="label">終了</span>
                <input
                  type="time"
                  name="end_time"
                  className="input"
                  value={end}
                  onChange={(e) => {
                    setEnd(e.target.value)
                    setFollowSlot(false)
                  }}
                />
              </label>
            </>
          )}
          <label className="col-span-2 flex min-h-9 items-center gap-2 text-sm">
            <input type="checkbox" name="all_day" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="h-5 w-5" />
            時間を決めない（終日）
          </label>
        </div>
        <label className="block">
          <span className="label">会場</span>
          <select
            name="venue_id"
            className="input"
            value={venueId}
            onChange={(e) => {
              setVenueId(e.target.value)
              setFollowSlot(false)
            }}
          >
            {venues.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
            <option value="">その他（自由に入力）</option>
          </select>
        </label>
        {!venueId && <input name="venue_text" className="input" defaultValue={initial.venue_text} placeholder="会場名・住所" maxLength={100} aria-label="会場名・住所" />}

        {isEdit && initial.series && (
          <fieldset className="space-y-1 rounded-xl bg-bg p-3">
            <legend className="label">変更する範囲</legend>
            {[
              ['this', 'この予定のみ'],
              ['following', 'これ以降すべて'],
              ['all', 'すべて'],
            ].map(([v, l]) => (
              <label key={v} className="flex min-h-9 items-center gap-2 text-sm">
                <input type="radio" name="scope" value={v} defaultChecked={v === 'this'} className="h-4 w-4" /> {l}
              </label>
            ))}
            <p className="hint">「これ以降」「すべて」では各回の日付は変わらず、時刻や内容が変わります。</p>
          </fieldset>
        )}
      </section>

      {/* ---------- 大会・イベント：保護者に伝えること */}
      {rsvp && (
        <section className="card space-y-4 p-4">
          <h2 className="font-bold">保護者に伝えること</h2>
          <label className="block">
            <span className="label">参加費・持ち物・服装など</span>
            <textarea name="fee_note" rows={3} className="input" defaultValue={initial.fee_note} maxLength={2000} placeholder="例: 参加費 1,500円（当日集金）／ユニフォーム・ゼッケン" />
          </label>
          <label className="block">
            <span className="label">案内文（種目・注意点など）</span>
            <textarea name="note" rows={4} className="input" defaultValue={initial.note} maxLength={5000} />
          </label>
          <div>
            <span className="label">添付（大会要項など）</span>
            <Uploader purpose="event" initial={initial.attachments} />
          </div>
          <label className="block">
            <span className="label">大会の申込締切（管理者だけに表示）</span>
            <input type="datetime-local" name="entry_deadline" className="input" value={entry} onChange={(e) => setEntry(e.target.value)} />
          </label>
          <div className="rounded-xl bg-brand-soft p-3 text-[0.95rem]">
            <p className="font-bold">部内締め（保護者の回答期限）</p>
            {!manualDeadline ? (
              <>
                <p className="mt-0.5">
                  {autoDeadline ? (
                    <>
                      <b className="num text-lg">{fmtDateTime(autoDeadline)}</b>
                      <span className="text-sm">　申込締切の2週間前に自動で決まります</span>
                    </>
                  ) : (
                    <span className="text-sm">申込締切を入れると、その2週間前に自動で決まります。入れない場合は、開始時刻まで受け付けます。</span>
                  )}
                </p>
                <button type="button" className="mt-1 text-sm font-semibold text-brand underline" onClick={() => setManualDeadline(true)}>
                  自分で日時を決める
                </button>
              </>
            ) : (
              <>
                <input type="datetime-local" name="member_deadline" className="input mt-1" defaultValue={initial.member_deadline} aria-label="部内締めの日時" />
                <button type="button" className="mt-1 text-sm font-semibold text-brand underline" onClick={() => setManualDeadline(false)}>
                  自動（申込締切の2週間前）に戻す
                </button>
              </>
            )}
          </div>
        </section>
      )}

      {!rsvp && (
        <section className="card space-y-4 p-4">
          <label className="block">
            <span className="label">メモ（書かなくてもかまいません）</span>
            <textarea name="note" rows={3} className="input" defaultValue={initial.note} maxLength={5000} />
          </label>
          <div>
            <span className="label">添付</span>
            <Uploader purpose="event" initial={initial.attachments} />
          </div>
        </section>
      )}

      {/* ---------- くわしい設定（ふだんは開かなくてよい） */}
      <details className="card group" open={detailsOpen}>
        <summary className="flex min-h-12 cursor-pointer items-center px-4 font-bold">
          <span className="flex-1">くわしい設定</span>
          <span className="text-sm font-normal text-muted group-open:hidden">対象クラス・定員・繰り返しなど</span>
        </summary>
        <div className="space-y-4 border-t border-line p-4">
          {classes.length > 0 && (
            <div>
              <span className="label">対象クラス</span>
              <div className="flex flex-wrap gap-2">
                {classes.map((c) => (
                  <label key={c.id} className="cursor-pointer">
                    <input type="checkbox" name="class_ids" value={c.id} defaultChecked={initial.class_ids.includes(c.id)} className="peer sr-only" />
                    <span className="inline-flex min-h-10 items-center rounded-full border border-line bg-white px-3.5 text-sm font-semibold peer-checked:border-brand peer-checked:bg-brand peer-checked:text-white">{c.name}</span>
                  </label>
                ))}
              </div>
              <p className="hint">選ばない場合は全員が対象です。</p>
            </div>
          )}
          {rsvp && (
            <>
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
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="label">定員</span>
                  <input type="number" name="capacity" min={1} className="input" defaultValue={initial.capacity} placeholder="なし" />
                </label>
                <label className="flex items-end gap-2 pb-3 text-sm">
                  <input type="checkbox" name="allow_companions" defaultChecked={initial.allow_companions} className="h-5 w-5" />
                  同行者の人数も聞く
                </label>
              </div>
            </>
          )}
          {!isEdit && (
            <div className="space-y-2">
              <label className="block">
                <span className="label">繰り返し</span>
                <select name="repeat" className="input" value={repeat} onChange={(e) => setRepeat(e.target.value as typeof repeat)}>
                  <option value="none">繰り返さない</option>
                  <option value="weekly">毎週（曜日を選ぶ）</option>
                  <option value="monthly">毎月（同じ日）</option>
                </select>
              </label>
              {repeat === 'weekly' && (
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAYS.map((w, i) => (
                    <label key={w} className="cursor-pointer">
                      <input type="checkbox" name="weekdays" value={i} className="peer sr-only" />
                      <span className="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-white text-sm font-bold peer-checked:border-brand peer-checked:bg-brand peer-checked:text-white">{w}</span>
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
                  <p className="hint col-span-2">どちらも空なら1年分を作ります。</p>
                </div>
              )}
              {type?.uses_arrival && <p className="hint">ふだんの練習は「管理者メニュー → 練習日程」から月ごとにまとめて入れられます。</p>}
            </div>
          )}
        </div>
      </details>

      {/* ---------- お知らせ */}
      {rsvp && !isEdit ? (
        <section className={`card p-4 ${announce ? 'border-brand' : ''}`}>
          <label className="flex items-start gap-3">
            <input type="checkbox" name="announce" checked={announce} onChange={(e) => setAnnounce(e.target.checked)} className="mt-0.5 h-6 w-6" />
            <span>
              <b>掲示板にもお知らせを出す</b>
              <span className="mt-0.5 block text-sm text-muted">
                この内容でお知らせを自動で作り、対象の保護者に通知します。保護者はお知らせの画面からそのまま「参加する／見送る」を回答できます。
              </span>
            </span>
          </label>
          {!announce && (
            <label className="mt-3 flex min-h-9 items-center gap-3 border-t border-line pt-3 text-sm">
              <input type="checkbox" name="notify" className="h-5 w-5" />
              予定の追加だけを通知する
            </label>
          )}
        </section>
      ) : (
        <label className="flex min-h-9 items-center gap-2 px-1 text-sm">
          <input key={typeId} type="checkbox" name="notify" defaultChecked={!isEdit && !type?.uses_arrival} className="h-5 w-5" />
          {isEdit ? '変更を対象者に通知する' : '対象者に通知する'}
        </label>
      )}

      {state?.error && <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{state.error}</p>}
      <button className="btn-primary h-13 w-full text-base" disabled={pending}>
        {pending ? '保存中…' : isEdit ? '変更を保存' : rsvp && announce ? '登録して、お知らせを出す' : '登録する'}
      </button>
    </form>
  )
}
