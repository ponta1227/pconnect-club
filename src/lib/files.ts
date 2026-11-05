import 'server-only'
import type { Sql, TransactionSql } from 'postgres'
import { sql } from './db'
import type { CurrentUser } from './auth'

export const LIMITS = {
  photo: { maxBytes: 10 * 1024 * 1024, mimes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] },
  pdf: { maxBytes: 20 * 1024 * 1024, mimes: ['application/pdf'] },
} as const

export type OwnerType = 'post' | 'event' | 'message' | 'album' | 'document'

export type AttachmentRow = {
  id: string
  kind: 'photo' | 'pdf'
  file_name: string
  mime: string
  size: number
  storage_path: string
  owner_type: OwnerType | null
  owner_id: string | null
  created_by: string | null
}

export type AttachmentView = { id: string; kind: 'photo' | 'pdf'; file_name: string; size: number }

export async function attachmentsFor(ownerType: OwnerType, ownerIds: string[]): Promise<Map<string, AttachmentView[]>> {
  const map = new Map<string, AttachmentView[]>()
  if (ownerIds.length === 0) return map
  const rows = await sql<(AttachmentView & { owner_id: string })[]>`
    select id, kind, file_name, size, owner_id from attachments
    where owner_type = ${ownerType} and owner_id = any(${ownerIds}::uuid[]) and uploaded
    order by created_at`
  for (const r of rows) map.set(r.owner_id, [...(map.get(r.owner_id) ?? []), r])
  return map
}

/** フォームで送られた添付IDを、その所有者に紐づける（自分がアップロードした未紐づけのものだけ） */
export async function attachTo(
  db: Sql | TransactionSql,
  user: CurrentUser,
  ownerType: OwnerType,
  ownerId: string,
  ids: string[],
) {
  const clean = ids.filter((id) => /^[0-9a-f-]{36}$/.test(id))
  if (clean.length === 0) return
  await db`
    update attachments set owner_type = ${ownerType}, owner_id = ${ownerId}
    where id = any(${clean}::uuid[]) and created_by = ${user.id} and owner_id is null and uploaded`
}

/** 既存の添付のうち、フォームで残されなかったものを外す */
export async function detachMissing(db: Sql | TransactionSql, ownerType: OwnerType, ownerId: string, keepIds: string[]) {
  await db`
    update attachments set owner_type = null, owner_id = null
    where owner_type = ${ownerType} and owner_id = ${ownerId} and not (id = any(${keepIds}::uuid[]))`
}

/** そのファイルを見てよいか */
export async function canViewAttachment(user: CurrentUser, a: AttachmentRow): Promise<boolean> {
  if (!a.owner_type || !a.owner_id) return a.created_by === user.id
  switch (a.owner_type) {
    case 'message': {
      const [row] = await sql`
        select 1 from chat_messages m join chat_members cm on cm.room_id = m.room_id
        where m.id = ${a.owner_id} and cm.profile_id = ${user.id}`
      return !!row
    }
    case 'post': {
      if (user.isAdmin) return true
      const [row] = await sql`select 1 from posts where id = ${a.owner_id} and published_at is not null`
      return !!row
    }
    default:
      return true
  }
}
