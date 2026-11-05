import 'server-only'
import webpush from 'web-push'
import { after } from 'next/server'
import { sql } from './db'
import { env } from './env'
import { isQuietHours, quietHoursEnd } from './time'
import { NOTIFY_KINDS, type NotifyKind } from './notify-kinds'

export type NotifyMessage = { title: string; body: string; url: string }
export type NotifyOptions = {
  /** 緊急：設定・静かな時間帯を無視し、メールも強制送信 */
  urgent?: boolean
  /** 静かな時間帯でも即時送信（メンション・中止など） */
  bypassQuiet?: boolean
  /** 子どもアカウントにも送る（予定の変更・中止のみ true にする） */
  childOk?: boolean
}

type Recipient = {
  id: string
  account_kind: 'adult' | 'child'
  email: string | null
  email_verified: boolean
  push: boolean | null
  email_on: boolean | null
}

let vapidReady = false
function ensureVapid(): boolean {
  if (vapidReady) return true
  if (!env.vapidPublic() || !env.vapidPrivate()) return false
  webpush.setVapidDetails(env.vapidSubject(), env.vapidPublic(), env.vapidPrivate())
  vapidReady = true
  return true
}

export async function sendPush(profileId: string, msg: NotifyMessage) {
  const subs = await sql<{ id: string; endpoint: string; p256dh: string; auth: string }[]>`
    select id, endpoint, p256dh, auth from push_subscriptions where profile_id = ${profileId}`
  if (subs.length === 0) return
  if (!ensureVapid()) {
    console.info(`[push:dev] to=${profileId} ${msg.title} / ${msg.body}`)
    return
  }
  const payload = JSON.stringify(msg)
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
          TTL: 60 * 60 * 24,
        })
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) await sql`delete from push_subscriptions where id = ${s.id}`
        else console.error('push failed', status, (e as Error).message)
      }
    }),
  )
}

export async function sendEmail(to: string, subject: string, text: string) {
  if (!env.resendKey()) {
    console.info(`[mail:dev] to=${to} subject=${subject}\n${text}`)
    return
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.resendKey()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.mailFrom(), to: [to], subject, text }),
  })
  if (!res.ok) console.error('mail failed', res.status, await res.text())
}

/** 通知を送る。設定・子どもアカウント・静かな時間帯の判定をここで行う。 */
export async function notify(recipientIds: string[], kind: NotifyKind, msg: NotifyMessage, opts: NotifyOptions = {}) {
  const ids = [...new Set(recipientIds)]
  if (ids.length === 0) return
  const recipients = await sql<Recipient[]>`
    select p.id, p.account_kind, p.email, p.email_verified, ns.push, ns.email as email_on
    from profiles p
    left join notification_settings ns on ns.profile_id = p.id and ns.kind = ${kind}
    where p.id = any(${ids}::uuid[]) and p.deleted_at is null`

  const defaults = NOTIFY_KINDS[kind]
  const quiet = isQuietHours()
  const url = msg.url.startsWith('http') ? msg.url : `${env.appUrl()}${msg.url}`

  await Promise.all(
    recipients.map(async (r) => {
      const isChild = r.account_kind === 'child'
      // 子どもアカウントには「予定の変更・中止」だけを送る（設定変更不可）
      if (isChild && !opts.childOk) return
      const forced = opts.urgent === true
      const pushOn = forced || isChild ? true : (r.push ?? defaults.push)
      const emailOn = forced ? true : isChild ? false : (r.email_on ?? defaults.email)

      if (pushOn) {
        if (quiet && !forced && !opts.bypassQuiet) {
          await sql`
            insert into notification_queue (profile_id, kind, title, body, url, send_after)
            values (${r.id}, ${kind}, ${msg.title}, ${msg.body}, ${msg.url}, ${quietHoursEnd()})`
        } else {
          await sendPush(r.id, msg)
        }
      }
      if (emailOn && r.email && r.email_verified) {
        await sendEmail(r.email, `【P-CONNECT Jr.】${msg.title}`, `${msg.body}\n\n${url}\n\n※ 通知設定はアプリの「その他 > 通知設定」から変更できます。`)
      }
    }),
  )
}

/** レスポンスを返したあとに通知する（画面の待ち時間を増やさない） */
export function notifyLater(recipientIds: string[], kind: NotifyKind, msg: NotifyMessage, opts: NotifyOptions = {}) {
  after(async () => {
    try {
      await notify(recipientIds, kind, msg, opts)
    } catch (e) {
      console.error('notify failed', e)
    }
  })
}

/** 静かな時間帯に保留した通知を送る（cron から呼ぶ） */
export async function flushQueue(): Promise<number> {
  const rows = await sql<{ id: string; profile_id: string; title: string; body: string; url: string }[]>`
    update notification_queue set sent_at = now()
    where id in (select id from notification_queue where sent_at is null and send_after <= now() order by created_at limit 500)
    returning id, profile_id, title, body, url`
  // 同じ人への通知が多い場合は1通にまとめる
  const byProfile = new Map<string, { title: string; body: string; url: string }[]>()
  for (const r of rows) byProfile.set(r.profile_id, [...(byProfile.get(r.profile_id) ?? []), r])
  for (const [profileId, list] of byProfile) {
    if (list.length === 1) await sendPush(profileId, list[0])
    else
      await sendPush(profileId, {
        title: `夜間のお知らせ ${list.length}件`,
        body: list.map((l) => `・${l.title}`).slice(0, 5).join('\n'),
        url: '/',
      })
  }
  return rows.length
}
