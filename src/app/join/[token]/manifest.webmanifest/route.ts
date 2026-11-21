import { findInvite } from '@/lib/invites'
import { appManifest, manifestResponse } from '@/lib/manifest'

// 招待リンクの画面から「ホーム画面に追加」したとき、アイコンから招待の続きを開けるようにする
export async function GET(_req: Request, ctx: RouteContext<'/join/[token]/manifest.webmanifest'>) {
  const { token } = await ctx.params
  const invite = await findInvite(token)
  return manifestResponse(appManifest(invite ? `/join/${encodeURIComponent(token)}` : '/'))
}
