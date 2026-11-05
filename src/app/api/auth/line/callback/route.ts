import { NextResponse, type NextRequest } from 'next/server'
import { createSession, SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth'
import { resolveLogin } from '@/lib/invites'
import { lineExchangeAndVerify } from '@/lib/line'

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const code = params.get('code')
  const state = params.get('state')
  const savedState = req.cookies.get('pc_line_state')?.value
  const nonce = req.cookies.get('pc_line_nonce')?.value

  const fail = (error: string) => {
    const res = NextResponse.redirect(new URL(`/login?error=${error}`, req.url))
    for (const c of ['pc_line_state', 'pc_line_nonce', 'pc_invite', 'pc_setup']) res.cookies.delete(c)
    return res
  }

  if (params.get('error')) return fail('cancel')
  if (!code || !state || !savedState || state !== savedState || !nonce) return fail('state')

  let identity
  try {
    identity = await lineExchangeAndVerify(code, nonce)
  } catch (e) {
    console.error(e)
    return fail('line')
  }

  const result = await resolveLogin(
    { lineUserId: identity.sub, name: identity.name, picture: identity.picture, email: identity.email },
    { inviteToken: req.cookies.get('pc_invite')?.value, setupSecret: req.cookies.get('pc_setup')?.value },
  )
  if (!result.ok) return fail(result.error)

  const session = await createSession(result.profileId, false)
  const res = NextResponse.redirect(new URL('/', req.url))
  res.cookies.set(SESSION_COOKIE, session.token, sessionCookieOptions(session.expires))
  for (const c of ['pc_line_state', 'pc_line_nonce', 'pc_invite', 'pc_setup']) res.cookies.delete(c)
  return res
}
