'use server'

import { redirect } from 'next/navigation'
import { refresh } from 'next/cache'
import { z } from 'zod'
import { assertAdmin, requireUser } from '@/lib/auth'
import { sql } from '@/lib/db'
import { attachTo } from '@/lib/files'
import { removeObjects } from '@/lib/storage'

export async function createAlbum(formData: FormData) {
  const user = await requireUser()
  assertAdmin(user)
  const title = z.string().trim().min(1).max(100).parse(formData.get('title'))
  const eventId = String(formData.get('event_id') ?? '')
  const [a] = await sql<{ id: string }[]>`
    insert into albums (title, event_id, created_by) values (${title}, ${/^[0-9a-f-]{36}$/.test(eventId) ? eventId : null}, ${user.id}) returning id`
  await attachTo(sql, user, 'album', a.id, formData.getAll('attachments').map(String))
  redirect(`/albums/${a.id}`)
}

export async function addAlbumPhotos(albumId: string, attachmentIds: string[]) {
  const user = await requireUser()
  assertAdmin(user)
  await attachTo(sql, user, 'album', albumId, attachmentIds)
  refresh()
}

export async function renameAlbum(albumId: string, title: string) {
  const user = await requireUser()
  assertAdmin(user)
  await sql`update albums set title = ${title.trim().slice(0, 100)} where id = ${albumId}`
  refresh()
}

export async function deleteAlbum(albumId: string) {
  const user = await requireUser()
  assertAdmin(user)
  const files = await sql<{ storage_path: string }[]>`
    delete from attachments where owner_type = 'album' and owner_id = ${albumId} returning storage_path`
  await removeObjects(files.map((f) => f.storage_path))
  await sql`delete from albums where id = ${albumId}`
  redirect('/albums')
}

/** 写真・ファイルの削除（アップロードした本人か管理者） */
export async function deleteAttachment(attachmentId: string) {
  const user = await requireUser()
  const [a] = await sql<{ storage_path: string; created_by: string | null }[]>`select storage_path, created_by from attachments where id = ${attachmentId}`
  if (!a) return
  if (a.created_by !== user.id && !user.isAdmin) throw new Error('削除できるのはアップロードした本人か管理者です')
  await sql`delete from attachments where id = ${attachmentId}`
  await removeObjects([a.storage_path])
  refresh()
}

export async function createDocument(formData: FormData) {
  const user = await requireUser()
  assertAdmin(user)
  const title = z.string().trim().min(1, 'タイトルを入力してください').max(100).parse(formData.get('title'))
  const attachmentId = String(formData.getAll('attachments')[0] ?? '')
  if (!/^[0-9a-f-]{36}$/.test(attachmentId)) redirect('/documents?error=file')
  const classIds = formData.getAll('class_ids').map(String).filter((x) => /^[0-9a-f-]{36}$/.test(x))
  await sql.begin(async (tx) => {
    const [d] = await tx<{ id: string }[]>`insert into documents (title, attachment_id, created_by) values (${title}, ${attachmentId}, ${user.id}) returning id`
    await attachTo(tx, user, 'document', d.id, [attachmentId])
    for (const c of classIds) await tx`insert into document_classes (document_id, class_id) values (${d.id}, ${c})`
  })
  redirect('/documents')
}

export async function deleteDocument(id: string) {
  const user = await requireUser()
  assertAdmin(user)
  const [d] = await sql<{ attachment_id: string | null }[]>`delete from documents where id = ${id} returning attachment_id`
  if (d?.attachment_id) {
    const files = await sql<{ storage_path: string }[]>`delete from attachments where id = ${d.attachment_id} returning storage_path`
    await removeObjects(files.map((f) => f.storage_path))
  }
  refresh()
}
