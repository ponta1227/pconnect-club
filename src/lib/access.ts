import 'server-only'
import type { Sql, TransactionSql } from 'postgres'
import { sql } from './db'
import type { CurrentUser } from './auth'

type Db = Sql | TransactionSql

export type ChildLite = { id: string; full_name: string; kana: string; grade: number }

/** 自分が連絡・参加登録できる子ども（承認済み・在籍中） */
export async function myChildren(user: CurrentUser): Promise<ChildLite[]> {
  if (user.isChild) {
    if (!user.childAccount || user.childAccount.status !== 'active') return []
    return sql<ChildLite[]>`
      select id, full_name, kana, grade from children
      where id = ${user.childAccount.childId} and status = 'active'`
  }
  return sql<ChildLite[]>`
    select c.id, c.full_name, c.kana, c.grade
    from guardian_children gc join children c on c.id = gc.child_id
    where gc.profile_id = ${user.id} and gc.status = 'approved' and c.status = 'active'
    order by c.kana, c.full_name`
}

export async function myChildIds(user: CurrentUser): Promise<string[]> {
  return (await myChildren(user)).map((c) => c.id)
}

/** その子について操作してよいか（管理者は全員分可） */
export async function canActForChild(user: CurrentUser, childId: string): Promise<boolean> {
  if (user.isAdmin) return true
  return (await myChildIds(user)).includes(childId)
}

/** 予定の対象となる子ども（対象クラス未指定なら在籍中の全員） */
export async function eventTargetChildIds(eventId: string, db: Db = sql): Promise<string[]> {
  const rows = await db<{ id: string }[]>`
    select c.id from children c
    where c.status = 'active'
      and (
        not exists (select 1 from event_classes ec where ec.event_id = ${eventId})
        or exists (
          select 1 from event_classes ec join child_classes cc on cc.class_id = ec.class_id
          where ec.event_id = ${eventId} and cc.child_id = c.id
        )
      )`
  return rows.map((r) => r.id)
}

/** 子どもの保護者・家族（＋任意で子どもアカウント本人） */
export async function guardiansOf(childIds: string[], opts: { includeChildAccounts?: boolean } = {}): Promise<string[]> {
  if (childIds.length === 0) return []
  const adults = await sql<{ id: string }[]>`
    select distinct p.id from guardian_children gc join profiles p on p.id = gc.profile_id
    where gc.child_id = any(${childIds}::uuid[]) and gc.status = 'approved' and p.deleted_at is null`
  const ids = adults.map((r) => r.id)
  if (opts.includeChildAccounts) {
    const kids = await sql<{ id: string }[]>`
      select p.id from child_accounts ca join profiles p on p.id = ca.profile_id
      where ca.child_id = any(${childIds}::uuid[]) and ca.status = 'active' and p.deleted_at is null`
    ids.push(...kids.map((r) => r.id))
  }
  return [...new Set(ids)]
}

export async function adminIds(): Promise<string[]> {
  const rows = await sql<{ id: string }[]>`
    select id from profiles where role = 'admin' and account_kind = 'adult' and deleted_at is null`
  return rows.map((r) => r.id)
}

/** 保護者・家族・管理者の全員 */
export async function allAdultIds(): Promise<string[]> {
  const rows = await sql<{ id: string }[]>`
    select id from profiles where account_kind = 'adult' and deleted_at is null`
  return rows.map((r) => r.id)
}

/** 対象クラスの子の保護者＋管理者（クラス未指定なら大人全員） */
export async function adultsForClasses(classIds: string[]): Promise<string[]> {
  if (classIds.length === 0) return allAdultIds()
  const rows = await sql<{ id: string }[]>`
    select distinct gc.profile_id as id
    from child_classes cc
    join children c on c.id = cc.child_id and c.status = 'active'
    join guardian_children gc on gc.child_id = cc.child_id and gc.status = 'approved'
    join profiles p on p.id = gc.profile_id and p.deleted_at is null
    where cc.class_id = any(${classIds}::uuid[])`
  return [...new Set([...rows.map((r) => r.id), ...(await adminIds())])]
}

/** 対象クラスの子どもアカウント（クラス未指定なら全員） */
export async function childAccountsForClasses(classIds: string[]): Promise<string[]> {
  const rows = classIds.length
    ? await sql<{ id: string }[]>`
        select distinct ca.profile_id as id from child_accounts ca
        join child_classes cc on cc.child_id = ca.child_id
        where ca.status = 'active' and cc.class_id = any(${classIds}::uuid[])`
    : await sql<{ id: string }[]>`select profile_id as id from child_accounts where status = 'active'`
  return rows.map((r) => r.id)
}

/** チャットルームのメンバーか */
export async function isRoomMember(userId: string, roomId: string): Promise<boolean> {
  const [row] = await sql`select 1 from chat_members where room_id = ${roomId} and profile_id = ${userId}`
  return !!row
}
