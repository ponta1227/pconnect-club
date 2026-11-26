import 'server-only'
import { sql } from './db'
import { randomToken, sha256 } from './crypto'
import { env } from './env'

// ほかの端末でも同じアカウントを使うためのログイン用リンク。1回だけ・30分だけ使える。
export const LOGIN_LINK_MINUTES = 30

export async function issueLoginLink(profileId: string, label: string | null = null): Promise<string> {
  const token = randomToken()
  await sql`delete from login_links where expires_at < now() - interval '1 day'`
  await sql`
    insert into login_links (token_hash, profile_id, label, expires_at)
    values (${sha256(token)}, ${profileId}, ${label}, now() + make_interval(mins => ${LOGIN_LINK_MINUTES}::int))`
  return `${env.appUrl()}/login/link/${token}`
}

/** まだ使えるリンクなら、だれのアカウントかを返す（使ったことにはしない） */
export async function peekLoginLink(token: string): Promise<{ name: string } | null> {
  const [row] = await sql<{ name: string }[]>`
    select p.display_name as name from login_links l join profiles p on p.id = l.profile_id
    where l.token_hash = ${sha256(token)} and l.used_at is null and l.expires_at > now()
      and p.deleted_at is null and p.account_kind = 'adult'`
  return row ?? null
}

/** リンクを使う（1回だけ）。使えたらそのアカウントのIDと、端末を使う人の名前を返す */
export async function consumeLoginLink(token: string): Promise<{ profileId: string; label: string | null } | null> {
  const [row] = await sql<{ profile_id: string; label: string | null }[]>`
    update login_links l set used_at = now() from profiles p
    where l.token_hash = ${sha256(token)} and l.used_at is null and l.expires_at > now()
      and p.id = l.profile_id and p.deleted_at is null and p.account_kind = 'adult'
    returning l.profile_id, l.label`
  return row ? { profileId: row.profile_id, label: row.label } : null
}
