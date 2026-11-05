// 学年コード: 1-6=小1-6, 7-9=中1-3, 10-12=高1-3, 0=その他
export const GRADE_OPTIONS: { value: number; label: string }[] = [
  ...[1, 2, 3, 4, 5, 6].map((n) => ({ value: n, label: `小${n}` })),
  ...[1, 2, 3].map((n) => ({ value: 6 + n, label: `中${n}` })),
  ...[1, 2, 3].map((n) => ({ value: 9 + n, label: `高${n}` })),
  { value: 0, label: 'その他' },
]

export function gradeLabel(grade: number): string {
  return GRADE_OPTIONS.find((g) => g.value === grade)?.label ?? 'その他'
}

/** 「小3」「中1」「高2」「その他」などの表記から学年コードへ */
export function parseGrade(text: string): number | null {
  const t = text.trim().replace(/\s/g, '').replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
  if (!t || t === 'その他') return 0
  const m = t.match(/^(小|中|高)(?:学)?(?:校)?(\d)(?:年(?:生)?)?$/)
  if (!m) return null
  const n = Number(m[2])
  if (m[1] === '小' && n >= 1 && n <= 6) return n
  if (m[1] === '中' && n >= 1 && n <= 3) return 6 + n
  if (m[1] === '高' && n >= 1 && n <= 3) return 9 + n
  return null
}

/** 年度替わりの進級。高3は卒業（null）、その他は据え置き */
export function promote(grade: number): number | null {
  if (grade === 0) return 0
  if (grade >= 12) return null
  return grade + 1
}
