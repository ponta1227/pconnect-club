'use server'

import { z } from 'zod'
import { requireUser } from '@/lib/auth'
import { sql } from '@/lib/db'
import { sendPush } from '@/lib/notify'

const SubSchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({ p256dh: z.string().max(500), auth: z.string().max(500) }),
})

export async function savePushSubscription(input: unknown) {
  const user = await requireUser({ allowOnboarding: true })
  const sub = SubSchema.parse(input)
  await sql`
    insert into push_subscriptions (profile_id, endpoint, p256dh, auth)
    values (${user.id}, ${sub.endpoint}, ${sub.keys.p256dh}, ${sub.keys.auth})
    on conflict (endpoint) do update set profile_id = excluded.profile_id, p256dh = excluded.p256dh, auth = excluded.auth`
  return { ok: true }
}

export async function removePushSubscription(endpoint: string) {
  const user = await requireUser({ allowOnboarding: true })
  await sql`delete from push_subscriptions where endpoint = ${endpoint} and profile_id = ${user.id}`
  return { ok: true }
}

export async function sendTestPush() {
  const user = await requireUser({ allowOnboarding: true })
  await sendPush(user.id, { title: 'テスト通知', body: 'P-CONNECT Jr. の通知が届きました', url: '/settings' })
  return { ok: true }
}
