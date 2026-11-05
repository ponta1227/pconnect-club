import 'server-only'
import { env } from './env'

// LINE ログイン v2.1（OpenID Connect）
export function lineRedirectUri(): string {
  return `${env.appUrl()}/api/auth/line/callback`
}

export function lineAuthorizeUrl(state: string, nonce: string): string {
  const u = new URL('https://access.line.me/oauth2/v2.1/authorize')
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('client_id', env.lineChannelId())
  u.searchParams.set('redirect_uri', lineRedirectUri())
  u.searchParams.set('state', state)
  u.searchParams.set('scope', 'profile openid email')
  u.searchParams.set('nonce', nonce)
  u.searchParams.set('bot_prompt', 'normal')
  return u.toString()
}

export type LineIdentity = { sub: string; name: string; picture: string | null; email: string | null }

export async function lineExchangeAndVerify(code: string, nonce: string): Promise<LineIdentity> {
  const tokenRes = await fetch('https://api.line.me/oauth2/v2.1/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: lineRedirectUri(),
      client_id: env.lineChannelId(),
      client_secret: env.lineChannelSecret(),
    }),
  })
  if (!tokenRes.ok) throw new Error(`LINE token error: ${tokenRes.status}`)
  const token = (await tokenRes.json()) as { id_token?: string }
  if (!token.id_token) throw new Error('LINE id_token missing')

  // IDトークンの検証は LINE の検証エンドポイントに任せる（署名・期限・aud・nonce を確認）
  const verifyRes = await fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ id_token: token.id_token, client_id: env.lineChannelId(), nonce }),
  })
  if (!verifyRes.ok) throw new Error(`LINE verify error: ${verifyRes.status}`)
  const claims = (await verifyRes.json()) as { sub: string; name?: string; picture?: string; email?: string }
  return { sub: claims.sub, name: claims.name ?? 'メンバー', picture: claims.picture ?? null, email: claims.email ?? null }
}
