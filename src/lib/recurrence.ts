import { addDaysStr, fromJst, jstParts, daysInMonth } from './time'

export type RecurrenceRule =
  | { freq: 'weekly'; weekdays: number[]; untilDate: string | null; count: number | null }
  | { freq: 'monthly'; monthDay: number; untilDate: string | null; count: number | null }

/** 1つの繰り返しで作る予定の上限（暴走防止） */
export const MAX_OCCURRENCES = 400

/**
 * 開始日（'YYYY-MM-DD'）から繰り返しの日付一覧を作る。
 * 終了日・回数のどちらも無い場合は1年後まで。
 */
export function expandDates(startDate: string, rule: RecurrenceRule): string[] {
  const limitDate = rule.untilDate ?? addDaysStr(startDate, 365)
  const limitCount = Math.min(rule.count ?? MAX_OCCURRENCES, MAX_OCCURRENCES)
  const out: string[] = []

  if (rule.freq === 'weekly') {
    const days = new Set(rule.weekdays)
    if (days.size === 0) return [startDate]
    let cur = startDate
    while (cur <= limitDate && out.length < limitCount) {
      if (days.has(jstParts(fromJst(cur)).dow)) out.push(cur)
      cur = addDaysStr(cur, 1)
    }
    return out
  }

  const start = jstParts(fromJst(startDate))
  let year = start.year
  let month = start.month
  for (let i = 0; i < 240 && out.length < limitCount; i++) {
    // 31日指定で30日までの月は月末にする
    const day = Math.min(rule.monthDay, daysInMonth(year, month))
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    if (date > limitDate) break
    if (date >= startDate) out.push(date)
    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
  }
  return out
}
