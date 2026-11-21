import 'server-only'
import { sql } from './db'

// クラブのご案内（球拾い網・金曜練習・ラケット・自主練など）。
// 入会の手順で確認してもらい、その他 → クラブのご案内 でいつでも見られる。
// 管理者が「全員にもう一度確認してもらう」で保存すると guide_version が上がり、未確認の人のやることに出る。

export type ClubGuide = { text: string; version: number }

export async function clubGuide(): Promise<ClubGuide> {
  const [row] = await sql<{ guide_text: string; guide_version: number }[]>`select guide_text, guide_version from app_settings where id = 1`
  return { text: row?.guide_text ?? '', version: row?.guide_version ?? 0 }
}

/** この人がまだ確認していないご案内があるか（子どもアカウントは対象外） */
export async function guideUnread(profileId: string, isChild: boolean): Promise<boolean> {
  if (isChild) return false
  const [row] = await sql<{ unread: boolean }[]>`
    select (s.guide_text <> '' and p.guide_read_version < s.guide_version) as unread
    from profiles p cross join app_settings s where p.id = ${profileId} and s.id = 1`
  return row?.unread ?? false
}

export type GuideBlock =
  | { kind: 'heading'; text: string; id: string }
  | { kind: 'para'; lines: string[] }
  | { kind: 'image'; src: string; caption: string }

/** 「![説明](/guide/xxx.jpg)」の行は写真。アプリ内の /guide/ の画像と https の画像だけ */
const IMAGE_LINE = /^!\[([^\]]*)\]\((\/guide\/[\w.-]+|https:\/\/[^\s)]+)\)$/

/** 「## 見出し」・写真の行・空行区切りの段落に分ける */
export function parseGuide(text: string): GuideBlock[] {
  const blocks: GuideBlock[] = []
  let para: string[] = []
  const flush = () => {
    if (para.length) blocks.push({ kind: 'para', lines: para })
    para = []
  }
  let n = 0
  for (const raw of text.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trimEnd()
    const img = line.trim().match(IMAGE_LINE)
    if (img) {
      flush()
      blocks.push({ kind: 'image', src: img[2], caption: img[1] })
    } else if (line.startsWith('## ')) {
      flush()
      blocks.push({ kind: 'heading', text: line.slice(3).trim(), id: `s${++n}` })
    } else if (!line.trim()) flush()
    else para.push(line)
  }
  flush()
  return blocks
}
