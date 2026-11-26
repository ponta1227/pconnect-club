import 'server-only'
import { sql } from './db'

// スタッフとの連絡チャット（chat_rooms.is_staff）
// ・保護者（管理者ではない大人）の家族ごとに1つ。同じ子の保護者（承認済み）は同じ部屋にまとめる。
// ・管理者は全員、すべての部屋に入る。子どもアカウントは入らない。
// ・部屋の名前は「スタッフ連絡｜お子さんの名前」。名前もメンバーも自動で、手では変えられない。
// 何度呼んでも同じ結果になる（足りないものだけ直す）。チャット一覧を開いたときと、
// 家族のつながり・権限・退会が変わったときに呼ぶ。

export const STAFF_ROOM_PREFIX = 'スタッフ連絡｜'

export async function syncStaffRooms(): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(727001)`
    const adults = await tx<{ id: string; role: string; display_name: string; created_at: Date }[]>`
      select id, role, display_name, created_at from profiles
      where account_kind = 'adult' and deleted_at is null order by created_at, id`
    const admins = adults.filter((a) => a.role === 'admin').map((a) => a.id)
    const parents = adults.filter((a) => a.role !== 'admin')
    const parentIds = new Set(parents.map((p) => p.id))
    const links = await tx<{ profile_id: string; child_id: string; full_name: string; active: boolean }[]>`
      select gc.profile_id, gc.child_id, c.full_name, c.status = 'active' as active
      from guardian_children gc join children c on c.id = gc.child_id
      where gc.status = 'approved' order by c.created_at, c.id`

    // 同じ子でつながる保護者をひとまとめにする
    const parent = new Map<string, string>()
    const find = (x: string): string => {
      let r = x
      while (parent.get(r) !== r) r = parent.get(r)!
      parent.set(x, r)
      return r
    }
    for (const p of parents) parent.set(p.id, p.id)
    const byChild = new Map<string, string>()
    for (const l of links) {
      if (!parentIds.has(l.profile_id)) continue
      const first = byChild.get(l.child_id)
      if (first) parent.set(find(l.profile_id), find(first))
      else byChild.set(l.child_id, l.profile_id)
    }
    const families = new Map<string, string[]>()
    for (const p of parents) {
      const root = find(p.id)
      families.set(root, [...(families.get(root) ?? []), p.id])
    }

    const rooms = (await tx<{ id: string; name: string; members: string[] }[]>`
      select r.id, r.name,
        coalesce(array_agg(cm.profile_id order by cm.joined_at, cm.profile_id) filter (where cm.profile_id is not null), '{}') as members
      from chat_rooms r left join chat_members cm on cm.room_id = r.id
      where r.is_staff group by r.id order by r.created_at, r.id`).map((r) => ({ ...r, owner: null as string | null }))
    // 部屋の持ち主 = その部屋にいちばん多く入っている家族（同数なら、先に入っていた人の家族）
    for (const r of rooms) {
      const count = new Map<string, number>()
      for (const m of r.members) if (parentIds.has(m)) count.set(find(m), (count.get(find(m)) ?? 0) + 1)
      let best = 0
      for (const m of r.members) {
        const n = parentIds.has(m) ? count.get(find(m))! : 0
        if (n > best) {
          best = n
          r.owner = find(m)
        }
      }
    }
    const claimed = new Set<string>()
    const nameOf = new Map(adults.map((a) => [a.id, a.display_name]))

    for (const [root, members] of families) {
      const mine = new Set(members)
      const kids = [...new Map(links.filter((l) => mine.has(l.profile_id) && l.active).map((l) => [l.child_id, l.full_name])).values()]
      const label = (kids.length ? kids : members.map((m) => nameOf.get(m) ?? '')).join('・')
      const name = (STAFF_ROOM_PREFIX + label).slice(0, 60)

      const candidates = rooms.filter((r) => r.owner === root)
      let roomId: string
      let current: string[]
      if (candidates.length === 0) {
        const [r] = await tx<{ id: string }[]>`insert into chat_rooms (name, is_staff) values (${name}, true) returning id`
        roomId = r.id
        current = []
      } else {
        const target = candidates[0]
        roomId = target.id
        current = target.members
        if (target.name !== name) await tx`update chat_rooms set name = ${name} where id = ${roomId}`
        // この家族だけの部屋がほかにもあれば（別々に登録したあとで家族になった）、1つにまとめる
        for (const other of candidates.slice(1)) {
          if (!other.members.every((m) => mine.has(m) || !parentIds.has(m))) continue
          await tx`update chat_messages set room_id = ${roomId} where room_id = ${other.id}`
          await tx`update polls set owner_id = ${roomId} where owner_type = 'room' and owner_id = ${other.id}`
          await tx`
            insert into chat_notes (room_id, body, updated_by, updated_at)
            select ${roomId}, body, updated_by, updated_at from chat_notes where room_id = ${other.id} and body <> ''
            on conflict (room_id) do update set body = chat_notes.body || E'\n\n' || excluded.body`
          await tx`delete from chat_rooms where id = ${other.id}`
          claimed.add(other.id)
        }
      }
      claimed.add(roomId)
      const want = new Set([...members, ...admins])
      const add = [...want].filter((m) => !current.includes(m))
      const drop = current.filter((m) => !want.has(m))
      if (add.length) {
        await tx`insert into chat_members (room_id, profile_id) select ${roomId}, unnest(${add}::uuid[]) on conflict do nothing`
      }
      if (drop.length) await tx`delete from chat_members where room_id = ${roomId} and profile_id = any(${drop}::uuid[])`
    }

    // 保護者が退会したなどで残った部屋も、やりとりの記録として管理者は見られるようにしておく
    for (const r of rooms) {
      if (claimed.has(r.id)) continue
      // 一度も使われていなければ片づける
      const [used] = await tx`select 1 from chat_messages where room_id = ${r.id} limit 1`
      if (!used) {
        await tx`delete from chat_rooms where id = ${r.id}`
        continue
      }
      const add = admins.filter((a) => !r.members.includes(a))
      const drop = r.members.filter((m) => !admins.includes(m))
      if (add.length) await tx`insert into chat_members (room_id, profile_id) select ${r.id}, unnest(${add}::uuid[]) on conflict do nothing`
      if (drop.length) await tx`delete from chat_members where room_id = ${r.id} and profile_id = any(${drop}::uuid[])`
    }
  })
}
