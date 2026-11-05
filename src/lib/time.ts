// 日本時間（JST, UTC+9、夏時間なし）の扱いをまとめる。
// 画面表示・締切計算・静かな時間帯の判定はすべてここを通す。
const OFFSET = 9 * 60 * 60 * 1000
const DOW = ['日', '月', '火', '水', '木', '金', '土']

function shifted(d: Date) {
  return new Date(d.getTime() + OFFSET)
}

const pad = (n: number) => String(n).padStart(2, '0')

export function jstParts(d: Date) {
  const s = shifted(d)
  return {
    year: s.getUTCFullYear(),
    month: s.getUTCMonth() + 1,
    day: s.getUTCDate(),
    hour: s.getUTCHours(),
    minute: s.getUTCMinutes(),
    dow: s.getUTCDay(),
  }
}

/** 'YYYY-MM-DD' と 'HH:MM' を日本時間として解釈 */
export function fromJst(date: string, time = '00:00'): Date {
  return new Date(`${date}T${time}:00+09:00`)
}

export function jstDateStr(d: Date): string {
  const p = jstParts(d)
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`
}

export function jstTimeStr(d: Date): string {
  const p = jstParts(d)
  return `${pad(p.hour)}:${pad(p.minute)}`
}

export function dowLabel(d: Date): string {
  return DOW[jstParts(d).dow]
}

export function fmtDate(d: Date): string {
  const p = jstParts(d)
  return `${p.month}月${p.day}日(${DOW[p.dow]})`
}

export function fmtDateTime(d: Date): string {
  const p = jstParts(d)
  return `${p.month}/${p.day}(${DOW[p.dow]}) ${pad(p.hour)}:${pad(p.minute)}`
}

export function fmtDateFull(d: Date): string {
  const p = jstParts(d)
  return `${p.year}年${p.month}月${p.day}日(${DOW[p.dow]})`
}

export function fmtTime(d: Date): string {
  return jstTimeStr(d)
}

/** 相対表記（チャット・コメント用） */
export function fmtRelative(d: Date, now = new Date()): string {
  const diff = (now.getTime() - d.getTime()) / 1000
  if (diff < 60) return 'たった今'
  if (diff < 3600) return `${Math.floor(diff / 60)}分前`
  if (jstDateStr(d) === jstDateStr(now)) return jstTimeStr(d)
  return fmtDateTime(d)
}

/** その日の日本時間 0:00 */
export function startOfJstDay(d: Date): Date {
  return fromJst(jstDateStr(d))
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86400000)
}

/** 'YYYY-MM-DD' に日数を足す */
export function addDaysStr(date: string, days: number): string {
  return jstDateStr(addDays(fromJst(date), days))
}

export function monthRange(year: number, month: number): { start: Date; end: Date } {
  const start = fromJst(`${year}-${pad(month)}-01`)
  const ny = month === 12 ? year + 1 : year
  const nm = month === 12 ? 1 : month + 1
  const end = fromJst(`${ny}-${pad(nm)}-01`)
  return { start, end }
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** 静かな時間帯（22:00〜翌7:00） */
export const QUIET_START = 22
export const QUIET_END = 7

export function isQuietHours(d = new Date()): boolean {
  const h = jstParts(d).hour
  return h >= QUIET_START || h < QUIET_END
}

/** 次の 7:00（日本時間） */
export function quietHoursEnd(d = new Date()): Date {
  const p = jstParts(d)
  const today = jstDateStr(d)
  const target = p.hour < QUIET_END ? today : addDaysStr(today, 1)
  return fromJst(target, `${pad(QUIET_END)}:00`)
}

/** 年度（4月始まり） */
export function fiscalYear(d = new Date()): number {
  const p = jstParts(d)
  return p.month >= 4 ? p.year : p.year - 1
}

/** datetime-local 入力値（JST）→ Date */
export function fromDatetimeLocal(v: string | null | undefined): Date | null {
  if (!v) return null
  const [date, time] = v.split('T')
  if (!date) return null
  return fromJst(date, (time ?? '00:00').slice(0, 5))
}

/** Date → datetime-local 入力値（JST） */
export function toDatetimeLocal(d: Date | null | undefined): string {
  if (!d) return ''
  return `${jstDateStr(d)}T${jstTimeStr(d)}`
}
