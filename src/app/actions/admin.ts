'use server'

import { redirect } from 'next/navigation'
import { refresh } from 'next/cache'
import { z } from 'zod'
import { assertAdmin, requireUser } from '@/lib/auth'
import { sql } from '@/lib/db'
import { hashPin } from '@/lib/crypto'
import { createInvite } from '@/lib/invites'
import { notifyLater } from '@/lib/notify'
import { parseRosterCsv } from '@/lib/roster-csv'
import { runGradePromotion } from '@/lib/promotion'

async function admin() {
  const user = await requireUser()
  assertAdmin(user)
  return user
}

const uuid = z.string().uuid()

// ------------------------------------------------------------ 承認

export async function approveLink(profileId: string, childId: string) {
  const user = await admin()
  const [row] = await sql<{ name: string }[]>`
    update guardian_children set status = 'approved', approved_by = ${user.id}, approved_at = now()
    where profile_id = ${profileId} and child_id = ${childId} and status = 'pending'
    returning (select full_name from children where id = ${childId}) as name`
  if (row) {
    notifyLater([profileId], 'approval', {
      title: 'お子さんの登録が承認されました',
      body: `${row.name}さんの保護者として登録されました`,
      url: '/',
    }, { bypassQuiet: false })
  }
  refresh()
}

export async function rejectLink(profileId: string, childId: string) {
  await admin()
  await sql`delete from guardian_children where profile_id = ${profileId} and child_id = ${childId} and status = 'pending'`
  refresh()
}

export async function approveChildAccount(profileId: string) {
  const user = await admin()
  await sql`update child_accounts set status = 'active', approved_by = ${user.id}, approved_at = now() where profile_id = ${profileId} and status = 'pending'`
  refresh()
}

export async function rejectChildAccount(profileId: string) {
  await admin()
  await sql`update child_accounts set status = 'revoked' where profile_id = ${profileId}`
  await sql`delete from sessions where profile_id = ${profileId}`
  refresh()
}

// ------------------------------------------------------------ 名簿

const ChildForm = z.object({
  id: uuid.optional(),
  full_name: z.string().trim().min(1, '氏名を入力してください').max(50),
  kana: z.string().trim().max(50),
  grade: z.coerce.number().int().min(0).max(12),
  class_ids: z.array(uuid),
  status: z.enum(['active', 'left', 'graduated']).default('active'),
})

export async function saveChild(formData: FormData) {
  await admin()
  const v = ChildForm.parse({
    id: formData.get('id') || undefined,
    full_name: formData.get('full_name'),
    kana: formData.get('kana') ?? '',
    grade: formData.get('grade') ?? 0,
    class_ids: formData.getAll('class_ids'),
    status: formData.get('status') || undefined,
  })
  await sql.begin(async (tx) => {
    let id = v.id
    if (id) {
      const [cur] = await tx<{ status: string; left_at: Date | null }[]>`select status, left_at from children where id = ${id}`
      const leftAt = v.status === 'active' ? null : cur?.status === 'active' ? new Date() : (cur?.left_at ?? new Date())
      await tx`
        update children set full_name = ${v.full_name}, kana = ${v.kana}, grade = ${v.grade}, status = ${v.status}, left_at = ${leftAt}
        where id = ${id}`
      // 在籍終了なら子どもアカウントも無効化
      if (v.status !== 'active') {
        const revoked = await tx<{ profile_id: string }[]>`
          update child_accounts set status = 'revoked' where child_id = ${id} and status in ('pending', 'active') returning profile_id`
        for (const r of revoked) await tx`delete from sessions where profile_id = ${r.profile_id}`
      }
      await tx`delete from child_classes where child_id = ${id}`
    } else {
      const [c] = await tx<{ id: string }[]>`
        insert into children (full_name, kana, grade) values (${v.full_name}, ${v.kana}, ${v.grade}) returning id`
      id = c.id
    }
    for (const cid of v.class_ids) await tx`insert into child_classes (child_id, class_id) values (${id}, ${cid})`
  })
  redirect('/admin/roster')
}

export async function importRosterCsv(formData: FormData) {
  await admin()
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) redirect('/admin/roster/import?error=file')
  if (file.size > 1024 * 1024) redirect('/admin/roster/import?error=size')
  const text = new TextDecoder('utf-8').decode(await file.arrayBuffer())
  const classes = await sql<{ id: string; name: string }[]>`select id, name from classes`
  const { rows, errors } = parseRosterCsv(text, classes.map((c) => c.name))
  if (errors.length) {
    redirect(`/admin/roster/import?errors=${encodeURIComponent(JSON.stringify(errors.slice(0, 30)))}`)
  }
  const byName = new Map(classes.map((c) => [c.name, c.id]))
  let created = 0
  let skipped = 0
  await sql.begin(async (tx) => {
    for (const r of rows) {
      // 同じ氏名の在籍中の子がいれば重複として飛ばす
      const [dup] = await tx`select 1 from children where full_name = ${r.full_name} and status = 'active'`
      if (dup) {
        skipped++
        continue
      }
      const [c] = await tx<{ id: string }[]>`insert into children (full_name, kana, grade) values (${r.full_name}, ${r.kana}, ${r.grade}) returning id`
      for (const name of r.classes) await tx`insert into child_classes (child_id, class_id) values (${c.id}, ${byName.get(name)!})`
      created++
    }
  })
  redirect(`/admin/roster?imported=${created}&skipped=${skipped}`)
}

/** 重複した子どもを統合（from を into にまとめて from を削除） */
export async function mergeChildren(formData: FormData) {
  await admin()
  const from = uuid.parse(formData.get('from'))
  const into = uuid.parse(formData.get('into'))
  if (from === into) redirect('/admin/roster')
  await sql.begin(async (tx) => {
    await tx`insert into guardian_children (profile_id, child_id, status, via, approved_by, approved_at, created_at)
      select profile_id, ${into}, status, via, approved_by, approved_at, created_at from guardian_children where child_id = ${from}
      on conflict (profile_id, child_id) do nothing`
    await tx`insert into child_classes (child_id, class_id) select ${into}, class_id from child_classes where child_id = ${from} on conflict do nothing`
    await tx`update rsvps set child_id = ${into} where child_id = ${from} and not exists (select 1 from rsvps r2 where r2.event_id = rsvps.event_id and r2.child_id = ${into})`
    await tx`update arrivals set child_id = ${into} where child_id = ${from} and not exists (select 1 from arrivals a2 where a2.event_id = arrivals.event_id and a2.child_id = ${into} and a2.cancelled_at is null)`
    await tx`update absence_reports set child_id = ${into} where child_id = ${from} and not exists (select 1 from absence_reports b2 where b2.event_id = absence_reports.event_id and b2.child_id = ${into})`
    await tx`update child_accounts set child_id = ${into} where child_id = ${from} and not exists (select 1 from child_accounts c2 where c2.child_id = ${into} and c2.status in ('pending','active'))`
    await tx`delete from children where id = ${from}`
  })
  redirect(`/admin/roster/${into}`)
}

export async function linkGuardianByAdmin(childId: string, profileId: string) {
  const user = await admin()
  await sql`
    insert into guardian_children (profile_id, child_id, status, via, approved_by, approved_at)
    values (${profileId}, ${childId}, 'approved', 'admin', ${user.id}, now())
    on conflict (profile_id, child_id) do update set status = 'approved', approved_by = ${user.id}, approved_at = now()`
  refresh()
}

export async function unlinkGuardian(childId: string, profileId: string) {
  await admin()
  await sql`delete from guardian_children where child_id = ${childId} and profile_id = ${profileId}`
  refresh()
}

export async function promoteGradesNow() {
  await admin()
  const r = await runGradePromotion({ force: true })
  redirect(`/admin/roster?promoted=${r.promoted}&graduated=${r.graduated}`)
}

// ------------------------------------------------------------ クラス・会場・種別

export async function saveClass(formData: FormData) {
  await admin()
  const id = formData.get('id') ? uuid.parse(formData.get('id')) : null
  const name = z.string().trim().min(1).max(30).parse(formData.get('name'))
  const sort = Number(formData.get('sort') ?? 0) || 0
  if (id) await sql`update classes set name = ${name}, sort = ${sort} where id = ${id}`
  else await sql`insert into classes (name, sort) values (${name}, ${sort})`
  refresh()
}

export async function deleteClass(id: string) {
  await admin()
  await sql`delete from classes where id = ${id}`
  refresh()
}

export async function saveVenue(formData: FormData) {
  await admin()
  const id = formData.get('id') ? uuid.parse(formData.get('id')) : null
  const name = z.string().trim().min(1).max(50).parse(formData.get('name'))
  const address = String(formData.get('address') ?? '').trim().slice(0, 200)
  const note = String(formData.get('note') ?? '').trim().slice(0, 200)
  const sort = Number(formData.get('sort') ?? 0) || 0
  if (id) await sql`update venues set name = ${name}, address = ${address}, note = ${note}, sort = ${sort} where id = ${id}`
  else await sql`insert into venues (name, address, note, sort) values (${name}, ${address}, ${note}, ${sort})`
  refresh()
}

export async function deleteVenue(id: string) {
  await admin()
  await sql`delete from venues where id = ${id}`
  refresh()
}

export async function saveEventType(formData: FormData) {
  await admin()
  const id = formData.get('id') ? uuid.parse(formData.get('id')) : null
  const name = z.string().trim().min(1).max(20).parse(formData.get('name'))
  const color = z.string().regex(/^#[0-9a-fA-F]{6}$/).parse(formData.get('color'))
  const usesRsvp = formData.get('uses_rsvp') === 'on'
  const usesArrival = formData.get('uses_arrival') === 'on'
  const remind = formData.get('remind') === 'on'
  const sort = Number(formData.get('sort') ?? 0) || 0
  if (id) {
    await sql`update event_types set name = ${name}, color = ${color}, uses_rsvp = ${usesRsvp}, uses_arrival = ${usesArrival}, remind = ${remind}, sort = ${sort} where id = ${id}`
  } else {
    await sql`insert into event_types (name, color, uses_rsvp, uses_arrival, remind, sort) values (${name}, ${color}, ${usesRsvp}, ${usesArrival}, ${remind}, ${sort})`
  }
  refresh()
}

export async function deleteEventType(id: string) {
  await admin()
  const [used] = await sql`select 1 from events where type_id = ${id} limit 1`
  if (used) throw new Error('この種別の予定があるため削除できません')
  await sql`delete from event_types where id = ${id}`
  refresh()
}

// ------------------------------------------------------------ メンバー・招待・タブレット

export async function setRole(profileId: string, role: 'admin' | 'member') {
  const user = await admin()
  if (role === 'member') {
    const [{ count }] = await sql<{ count: number }[]>`
      select count(*)::int as count from profiles where role = 'admin' and account_kind = 'adult' and deleted_at is null and id <> ${profileId}`
    if (count === 0) throw new Error('管理者が1人もいなくなるため変更できません')
  }
  await sql`update profiles set role = ${role} where id = ${profileId} and account_kind = 'adult'`
  if (profileId === user.id && role === 'member') redirect('/')
  refresh()
}

/** 管理者がメンバーを外す（退会と同じ処理） */
export async function removeMember(profileId: string) {
  const user = await admin()
  if (profileId === user.id) throw new Error('自分自身は外せません。退会は設定画面から行ってください')
  const [target] = await sql<{ role: string }[]>`select role from profiles where id = ${profileId}`
  if (target?.role === 'admin') throw new Error('管理者は先に「メンバーにする」で権限を外してください')
  await sql.begin(async (tx) => {
    await tx`
      update profiles set deleted_at = now(), display_name = '退会したメンバー', line_user_id = null,
        email = null, email_verified = false, avatar_url = null
      where id = ${profileId}`
    await tx`delete from guardian_children where profile_id = ${profileId}`
    await tx`update child_accounts set status = 'revoked' where profile_id = ${profileId}`
    await tx`delete from push_subscriptions where profile_id = ${profileId}`
    await tx`delete from chat_members where profile_id = ${profileId}`
    await tx`delete from sessions where profile_id = ${profileId}`
  })
  refresh()
}

export async function regenerateClubInvite() {
  const user = await admin()
  await sql`update invites set revoked_at = now() where kind = 'club' and revoked_at is null`
  const { url } = await createInvite('club', user.id)
  return { url }
}

export async function revokeClubInvite() {
  await admin()
  await sql`update invites set revoked_at = now() where kind = 'club' and revoked_at is null`
  refresh()
}

export async function setKioskPin(formData: FormData) {
  await admin()
  const pin = String(formData.get('pin') ?? '')
  if (!/^\d{4,6}$/.test(pin)) redirect('/admin/kiosk?error=pin')
  await sql`update app_settings set kiosk_pin_hash = ${hashPin(pin)}, updated_at = now() where id = 1`
  // PIN を変えたら既存のタブレットのセッションも終了
  await sql`delete from kiosk_sessions`
  redirect('/admin/kiosk?saved=1')
}
