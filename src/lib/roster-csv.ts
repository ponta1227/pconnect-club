import { parseGrade } from './grades'

// 名簿CSV（列: 氏名, よみがな, 学年, クラス名）の読み込み。
// クラスは「・」「/」「;」区切りで複数指定可。1行目が見出しなら読み飛ばす。

export type RosterRow = { full_name: string; kana: string; grade: number; classes: string[] }
export type RosterError = { line: number; message: string }

/** CSV を行と列に分ける（ダブルクォート対応） */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '')
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"'
          i++
        } else quoted = false
      } else cell += ch
      continue
    }
    if (ch === '"') quoted = true
    else if (ch === ',') {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell !== '' || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

export function parseRosterCsv(text: string, knownClasses: string[]): { rows: RosterRow[]; errors: RosterError[] } {
  const all = parseCsv(text)
  const rows: RosterRow[] = []
  const errors: RosterError[] = []
  const known = new Set(knownClasses)
  all.forEach((cols, idx) => {
    const line = idx + 1
    const [name = '', kana = '', gradeText = '', classText = ''] = cols.map((c) => c.trim())
    if (idx === 0 && /氏名|名前/.test(name)) return
    if (!name && !kana && !gradeText && !classText) return
    if (!name) return errors.push({ line, message: '氏名が空です' })
    if (name.length > 50) return errors.push({ line, message: '氏名が長すぎます' })
    const grade = parseGrade(gradeText)
    if (grade === null) return errors.push({ line, message: `学年「${gradeText}」が読めません（例: 小3、中1、高2、その他）` })
    const classes = classText
      .split(/[・/／;；、]/)
      .map((c) => c.trim())
      .filter(Boolean)
    const unknown = classes.filter((c) => !known.has(c))
    if (unknown.length) return errors.push({ line, message: `クラス「${unknown.join('・')}」がありません。先にクラスを作成してください` })
    rows.push({ full_name: name, kana, grade, classes })
  })
  return { rows, errors }
}
