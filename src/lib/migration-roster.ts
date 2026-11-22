import 'server-only'
import { sql } from './db'

// BANDから移行する人の確認（会費の支払い一覧に載っている人だけ登録できる）。
// 苗字が合えばよい。表記ゆれ（髙/高、﨑/崎、澤/沢 など）はそろえてから比べる。

const VARIANTS: Record<string, string> = {
  髙: '高', 﨑: '崎', 嵜: '崎', 邉: '辺', 邊: '辺', 澤: '沢', 濱: '浜', 齋: '斉', 齊: '斉', 斎: '斉',
  嶋: '島', 嶌: '島', 德: '徳', 廣: '広', 國: '国', 櫻: '桜', 藪: '薮', 槇: '槙', 冨: '富', 眞: '真',
  惠: '恵', 瀨: '瀬', 曾: '曽', 祐: '祐', 栁: '柳', 籠: '篭',
}

export function normalizeName(s: string): string {
  return [...s.normalize('NFKC').replace(/[\s　・･]/g, '')].map((c) => VARIANTS[c] ?? c).join('')
}

/** 入力されたお名前（苗字と名前の間にスペースがあれば苗字を使う）が、名簿のだれかと苗字で合うか */
export function surnameMatches(entered: string, roster: string[]): boolean {
  const parts = entered.normalize('NFKC').trim().split(/[\s　]+/)
  const whole = normalizeName(entered)
  const surname = parts.length >= 2 ? normalizeName(parts[0]) : ''
  return roster.some((raw) => {
    const r = normalizeName(raw)
    if (!r) return false
    if (r === whole) return true
    const rp = raw.normalize('NFKC').trim().split(/[\s　]+/)
    const rs = rp.length >= 2 ? normalizeName(rp[0]) : ''
    // どちらにもスペースがあれば、苗字どうしが同じか
    if (rs && surname) return rs === surname
    // 片方にだけスペースがあれば、もう片方がその苗字で始まるか
    if (rs) return whole.startsWith(rs)
    if (surname) return r.startsWith(surname)
    // どちらもスペースがないときは、先頭の2文字が同じなら同じ苗字とみなす
    let common = 0
    while (common < Math.min(r.length, whole.length) && r[common] === whole[common]) common++
    return common >= 2
  })
}

export async function migrationRoster(): Promise<string[]> {
  return (await sql<{ name: string }[]>`select name from migration_roster order by name`).map((r) => r.name)
}

/** 会費の支払い一覧（CSV）から氏名を取り出す。Shift_JIS でも UTF-8 でもよい */
export function namesFromPaymentCsv(bytes: ArrayBuffer): string[] {
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  const text = utf8.includes('氏名') ? utf8 : new TextDecoder('shift_jis').decode(bytes)
  const rows = parseCsv(text)
  const header = rows[0] ?? []
  const col = header.findIndex((h) => h.trim() === '氏名' || h.trim() === '名前')
  if (col < 0) return []
  return [...new Set(rows.slice(1).map((r) => (r[col] ?? '').trim()).filter(Boolean))]
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  if (cell || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}
