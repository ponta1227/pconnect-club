import 'server-only'
import { sql } from './db'

/** メンバー一覧（保護者は子どもの名前付き） */
export async function membersWithChildren() {
  const rows = await sql<{ id: string; display_name: string; avatar_url: string | null; role: string; account_kind: string; children: string[]; created_at: Date }[]>`
    select p.id, p.display_name, p.avatar_url, p.role, p.account_kind, p.created_at,
      case when p.account_kind = 'child' then
        coalesce((select array_agg(c.full_name) from child_accounts ca join children c on c.id = ca.child_id where ca.profile_id = p.id), '{}')
      else
        coalesce((select array_agg(c.full_name order by c.kana) from guardian_children gc join children c on c.id = gc.child_id
          where gc.profile_id = p.id and gc.status = 'approved' and c.status = 'active'), '{}')
      end as children
    from profiles p
    left join child_accounts ca on ca.profile_id = p.id
    where p.deleted_at is null and (p.account_kind = 'adult' or ca.status = 'active')
    order by (p.role = 'admin') desc, p.display_name`
  return rows.map((r) => ({
    ...r,
    kind: r.account_kind === 'child' ? 'child' : r.role === 'admin' ? 'admin' : 'member',
  }))
}
