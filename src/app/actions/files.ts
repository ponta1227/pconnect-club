'use server'

import { z } from 'zod'
import { requireUser } from '@/lib/auth'
import { sql } from '@/lib/db'
import { randomToken } from '@/lib/crypto'
import { LIMITS } from '@/lib/files'
import { createUploadUrl, objectExists } from '@/lib/storage'

const Input = z.object({
  kind: z.enum(['photo', 'pdf']),
  mime: z.string().max(100),
  size: z.number().int().positive(),
  name: z.string().max(200),
  purpose: z.enum(['post', 'event', 'message', 'album', 'document']),
})

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
}

/** アップロードの準備（署名付きアップロードURLを返す） */
export async function prepareUpload(input: z.input<typeof Input>) {
  const user = await requireUser()
  const v = Input.parse(input)
  // アルバム・資料・予定・掲示板のアップロードは管理者のみ。チャットは参加者が添付できる。
  if (v.purpose !== 'message' && !user.isAdmin) throw new Error('アップロードできるのは管理者のみです')
  const limit = LIMITS[v.kind]
  if (!(limit.mimes as readonly string[]).includes(v.mime)) throw new Error('対応していないファイル形式です（写真またはPDFのみ）')
  if (v.size > limit.maxBytes) throw new Error(`ファイルが大きすぎます（上限 ${limit.maxBytes / 1024 / 1024}MB）`)

  const now = new Date()
  const path = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomToken(12)}.${EXT[v.mime]}`
  const [row] = await sql<{ id: string }[]>`
    insert into attachments (kind, storage_path, file_name, mime, size, created_by)
    values (${v.kind}, ${path}, ${v.name.slice(0, 200)}, ${v.mime}, ${v.size}, ${user.id})
    returning id`
  const uploadUrl = await createUploadUrl(path)
  return { id: row.id, uploadUrl }
}

/** アップロード完了を記録 */
export async function confirmUpload(id: string) {
  const user = await requireUser()
  const [row] = await sql<{ storage_path: string }[]>`
    select storage_path from attachments where id = ${id} and created_by = ${user.id}`
  if (!row) throw new Error('ファイルが見つかりません')
  if (!(await objectExists(row.storage_path))) throw new Error('アップロードが完了していません')
  await sql`update attachments set uploaded = true where id = ${id}`
  return { ok: true }
}
