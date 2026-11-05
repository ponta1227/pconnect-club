import { describe, expect, it } from 'vitest'
import { expandDates } from '@/lib/recurrence'
import { parseGrade, promote, gradeLabel } from '@/lib/grades'
import { parseCsv, parseRosterCsv } from '@/lib/roster-csv'
import { defaultMemberDeadline, placement, reminderDue, rsvpOpen } from '@/lib/event-rules'
import { computeAttendance } from '@/lib/attendance-calc'
import { fromJst, isQuietHours, jstDateStr, quietHoursEnd, fiscalYear, fromDatetimeLocal, toDatetimeLocal } from '@/lib/time'
import { toCsv } from '@/lib/csv'

describe('時刻（日本時間）', () => {
  it('JSTの日付と時刻を正しく扱う', () => {
    const d = fromJst('2026-11-05', '23:30')
    expect(d.toISOString()).toBe('2026-11-05T14:30:00.000Z')
    expect(jstDateStr(d)).toBe('2026-11-05')
    expect(toDatetimeLocal(fromDatetimeLocal('2026-12-01T09:05'))).toBe('2026-12-01T09:05')
  })
  it('静かな時間帯は22時〜7時', () => {
    expect(isQuietHours(fromJst('2026-11-05', '21:59'))).toBe(false)
    expect(isQuietHours(fromJst('2026-11-05', '22:00'))).toBe(true)
    expect(isQuietHours(fromJst('2026-11-06', '06:59'))).toBe(true)
    expect(isQuietHours(fromJst('2026-11-06', '07:00'))).toBe(false)
  })
  it('保留した通知は次の7時に送る', () => {
    expect(quietHoursEnd(fromJst('2026-11-05', '23:00')).toISOString()).toBe(fromJst('2026-11-06', '07:00').toISOString())
    expect(quietHoursEnd(fromJst('2026-11-06', '02:00')).toISOString()).toBe(fromJst('2026-11-06', '07:00').toISOString())
  })
  it('年度は4月始まり', () => {
    expect(fiscalYear(fromJst('2027-03-31', '23:59'))).toBe(2026)
    expect(fiscalYear(fromJst('2027-04-01', '00:00'))).toBe(2027)
  })
})

describe('繰り返し予定', () => {
  it('毎週 月火木金 を期間内で展開する', () => {
    const dates = expandDates('2026-11-02', { freq: 'weekly', weekdays: [1, 2, 4, 5], untilDate: '2026-11-15', count: null })
    expect(dates).toEqual(['2026-11-02', '2026-11-03', '2026-11-05', '2026-11-06', '2026-11-09', '2026-11-10', '2026-11-12', '2026-11-13'])
  })
  it('回数指定で止まる', () => {
    expect(expandDates('2026-11-04', { freq: 'weekly', weekdays: [3], untilDate: null, count: 3 })).toEqual(['2026-11-04', '2026-11-11', '2026-11-18'])
  })
  it('毎月31日は月末に寄せる', () => {
    expect(expandDates('2027-01-31', { freq: 'monthly', monthDay: 31, untilDate: '2027-04-30', count: null })).toEqual([
      '2027-01-31',
      '2027-02-28',
      '2027-03-31',
      '2027-04-30',
    ])
  })
  it('終了条件なしでも1年で止まる', () => {
    const dates = expandDates('2026-11-01', { freq: 'weekly', weekdays: [0, 1, 2, 3, 4, 5, 6], untilDate: null, count: null })
    expect(dates.length).toBe(366)
  })
})

describe('学年', () => {
  it('表記を読み取る', () => {
    expect(parseGrade('小3')).toBe(3)
    expect(parseGrade('中１')).toBe(7)
    expect(parseGrade('高校2年')).toBe(11)
    expect(parseGrade('小学6年生')).toBe(6)
    expect(parseGrade('その他')).toBe(0)
    expect(parseGrade('')).toBe(0)
    expect(parseGrade('小7')).toBeNull()
    expect(parseGrade('大1')).toBeNull()
  })
  it('進級：小6→中1、高3→卒業、その他は据え置き', () => {
    expect(promote(6)).toBe(7)
    expect(gradeLabel(promote(6)!)).toBe('中1')
    expect(promote(12)).toBeNull()
    expect(promote(0)).toBe(0)
  })
})

describe('名簿CSV', () => {
  it('引用符・改行・BOMを扱える', () => {
    expect(parseCsv('﻿a,"b,c","d""e"\r\nf,g\n')).toEqual([
      ['a', 'b,c', 'd"e'],
      ['f', 'g'],
    ])
  })
  it('見出し行を飛ばし、クラスを複数指定できる', () => {
    const { rows, errors } = parseRosterCsv('氏名,よみがな,学年,クラス\n山田太郎,やまだたろう,小3,初心者・選手\n佐藤花子,さとうはなこ,中1,\n', ['初心者', '選手'])
    expect(errors).toEqual([])
    expect(rows).toEqual([
      { full_name: '山田太郎', kana: 'やまだたろう', grade: 3, classes: ['初心者', '選手'] },
      { full_name: '佐藤花子', kana: 'さとうはなこ', grade: 7, classes: [] },
    ])
  })
  it('学年・クラスの誤りを行番号付きで返す', () => {
    const { errors } = parseRosterCsv('山田太郎,,小9,\n佐藤,,中1,存在しない\n,,,\n', ['選手'])
    expect(errors).toEqual([
      { line: 1, message: expect.stringContaining('学年') },
      { line: 2, message: expect.stringContaining('存在しない') },
    ])
  })
})

describe('参加のルール', () => {
  const start = fromJst('2026-12-20', '09:00')
  it('部内締めは申込締切の2週間前', () => {
    const entry = fromJst('2026-12-10', '23:59')
    expect(jstDateStr(defaultMemberDeadline(entry)!)).toBe('2026-11-26')
    expect(defaultMemberDeadline(null)).toBeNull()
  })
  it('部内締めまで参加ボタンが有効', () => {
    const e = { status: 'active' as const, starts_at: start, member_deadline: fromJst('2026-12-01', '23:59') }
    expect(rsvpOpen(e, fromJst('2026-12-01', '23:00'))).toBe(true)
    expect(rsvpOpen(e, fromJst('2026-12-02', '00:00'))).toBe(false)
    expect(rsvpOpen({ ...e, status: 'cancelled' }, fromJst('2026-11-01'))).toBe(false)
    expect(rsvpOpen({ ...e, member_deadline: null }, fromJst('2026-12-20', '08:59'))).toBe(true)
  })
  it('定員を超えたらキャンセル待ち', () => {
    expect(placement(null, 100)).toBe('going')
    expect(placement(2, 1)).toBe('going')
    expect(placement(2, 2)).toBe('waitlist')
  })
  it('リマインドは3日前と前日に1回ずつ', () => {
    const dl = fromJst('2026-12-10', '20:00')
    const none = { d3: null, d1: null }
    expect(reminderDue(dl, fromJst('2026-12-05', '07:00'), none)).toBeNull()
    expect(reminderDue(dl, fromJst('2026-12-07', '07:00'), none)).toBe('d3')
    expect(reminderDue(dl, fromJst('2026-12-07', '07:00'), { d3: new Date(), d1: null })).toBeNull()
    expect(reminderDue(dl, fromJst('2026-12-10', '07:00'), { d3: new Date(), d1: null })).toBe('d1')
    expect(reminderDue(dl, fromJst('2026-12-10', '21:00'), none)).toBeNull()
  })
})

describe('月次出席集計', () => {
  const kids = [
    { id: 'a', full_name: 'A', kana: 'a', grade: 3, class_ids: ['c1'], class_names: ['初心者'] },
    { id: 'b', full_name: 'B', kana: 'b', grade: 7, class_ids: ['c2'], class_names: ['選手'] },
  ]
  const practices = [
    { id: 'p1', class_ids: [], venue: '朝霞' },
    { id: 'p2', class_ids: ['c2'], venue: '朝霞' },
    { id: 'p3', class_ids: ['c1'], venue: '志木' },
  ]
  it('対象クラスの練習だけを分母にする', () => {
    const r = computeAttendance(
      practices,
      kids,
      [
        { event_id: 'p1', child_id: 'a' },
        { event_id: 'p1', child_id: 'b' },
        { event_id: 'p2', child_id: 'b' },
      ],
      [{ event_id: 'p3', child_id: 'a', kind: 'absent' }],
    )
    const a = r.rows.find((x) => x.child.id === 'a')!
    const b = r.rows.find((x) => x.child.id === 'b')!
    expect([a.eligible, a.attended, a.rate, a.absent]).toEqual([2, 1, 50, 1])
    expect([b.eligible, b.attended, b.rate]).toEqual([2, 2, 100])
    expect(r.venues).toEqual([
      { venue: '朝霞', practices: 2, arrivals: 3, average: 1.5 },
      { venue: '志木', practices: 1, arrivals: 0, average: 0 },
    ])
    expect(r.classes.find((c) => c.name === '選手')!.rate).toBe(100)
  })
})

describe('CSV出力', () => {
  it('BOM付きで、カンマ・引用符をエスケープする', () => {
    const out = toCsv([['氏名', 'メモ'], ['山田', 'a,"b"']])
    expect(out.startsWith('﻿')).toBe(true)
    expect(out).toContain('山田,"a,""b"""')
  })
})
