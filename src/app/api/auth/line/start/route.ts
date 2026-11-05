import { NextResponse, type NextRequest } from 'next/server'
import { randomToken } from '@/lib/crypto'
import { env } from '@/lib/env'
import { lineAuthorizeUrl } from '@/lib/line'

const COOKIE_OPTS = { httpOnly: true, sameSite: 'lax' as const, path: '/', maxAge: 600 }

export async function GET(req: NextRequest) {
  if (!env.lineChannelId()) {
    return NextResponse.redirect(new URL('/login?error=config', req.url))
  }
  const state = randomToken(16)
  const nonce = randomToken(16)
  const res = NextResponse.redirect(lineAuthorizeUrl(state, nonce))
  const secure = env.isProd()
  res.cookies.set('pc_line_state', state, { ...COOKIE_OPTS, secure })
  res.cookies.set('pc_line_nonce', nonce, { ...COOKIE_OPTS, secure })
  const invite = req.nextUrl.searchParams.get('invite')
  if (invite) res.cookies.set('pc_invite', invite, { ...COOKIE_OPTS, secure })
  const setup = req.nextUrl.searchParams.get('setup')
  if (setup) res.cookies.set('pc_setup', setup, { ...COOKIE_OPTS, secure })
  return res
}
