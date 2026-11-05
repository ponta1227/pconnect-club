import { NextResponse, type NextRequest } from 'next/server'
import { env } from '@/lib/env'
import { runDailyJobs } from '@/lib/jobs'

export const maxDuration = 60

// Vercel Cron から毎朝7:00（日本時間）に呼ばれる。Authorization: Bearer <CRON_SECRET> が必要。
export async function GET(req: NextRequest) {
  const secret = env.cronSecret()
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }
  const result = await runDailyJobs()
  return NextResponse.json({ ok: true, ...result })
}
