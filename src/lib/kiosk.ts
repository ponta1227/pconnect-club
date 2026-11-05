import 'server-only'
import { cookies, headers } from 'next/headers'
import { sql } from './db'
import { randomToken, sha256 } from './crypto'
import { env } from './env'

export const KIOSK_COOKIE = 'pc_kiosk'
const KIOSK_HOURS = 12

export async function kioskSessionValid(): Promise<boolean> {
  const token = (await cookies()).get(KIOSK_COOKIE)?.value
  if (!token) return false
  const [row] = await sql`select 1 from kiosk_sessions where token_hash = ${sha256(token)} and expires_at > now()`
  return !!row
}

export async function startKioskSession() {
  const token = randomToken()
  const expires = new Date(Date.now() + KIOSK_HOURS * 3600 * 1000)
  await sql`insert into kiosk_sessions (token_hash, expires_at) values (${sha256(token)}, ${expires})`
  await sql`delete from kiosk_sessions where expires_at < now()`
  ;(await cookies()).set(KIOSK_COOKIE, token, { httpOnly: true, secure: env.isProd(), sameSite: 'strict', path: '/', expires })
}

export async function endKioskSession() {
  const store = await cookies()
  const token = store.get(KIOSK_COOKIE)?.value
  if (token) await sql`delete from kiosk_sessions where token_hash = ${sha256(token)}`
  store.delete(KIOSK_COOKIE)
}

async function clientKey(): Promise<string> {
  const h = await headers()
  const ip = (h.get('x-forwarded-for') ?? h.get('x-real-ip') ?? 'unknown').split(',')[0].trim()
  return `kiosk-pin:${ip}`
}

/** PINの失敗が多すぎないか（10分間に5回まで） */
export async function pinAttemptsExceeded(): Promise<boolean> {
  const key = await clientKey()
  const [{ count }] = await sql<{ count: number }[]>`
    select count(*)::int as count from rate_limits where key = ${key} and created_at > now() - interval '10 minutes'`
  return count >= 5
}

export async function recordPinFailure() {
  await sql`insert into rate_limits (key) values (${await clientKey()})`
  await sql`delete from rate_limits where created_at < now() - interval '1 day'`
}
