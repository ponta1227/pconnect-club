import { NextResponse, type NextRequest } from 'next/server'
import { sql } from '@/lib/db'
import { sha256 } from '@/lib/crypto'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') ?? ''
  const [row] = await sql<{ profile_id: string; email: string }[]>`
    delete from email_verifications where token_hash = ${sha256(token)} and expires_at > now()
    returning profile_id, email`
  if (!row) return NextResponse.redirect(new URL('/settings?email=expired', req.url))
  await sql`update profiles set email = ${row.email}, email_verified = true where id = ${row.profile_id}`
  return NextResponse.redirect(new URL('/settings?email=verified', req.url))
}
