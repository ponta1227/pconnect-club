'use client'

import { useEffect, useState } from 'react'
import { removePushSubscription, savePushSubscription, sendTestPush } from '@/app/actions/push'

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

async function registration() {
  return navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
}

/** 画面表示時に Service Worker を登録し、購読済みならサーバーと同期する */
export function PushRegistrar() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    registration()
      .then(async (reg) => {
        if (!('PushManager' in window) || Notification.permission !== 'granted') return
        const sub = await reg.pushManager.getSubscription()
        if (sub) await savePushSubscription(JSON.parse(JSON.stringify(sub)))
      })
      .catch(() => {})
  }, [])
  return null
}

export function isStandalone() {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true
}

type State = 'loading' | 'unsupported' | 'needs-install' | 'denied' | 'off' | 'on'

/** 通知のオン・オフ（ユーザー操作が必要なためボタンで行う） */
export function PushToggle() {
  const [state, setState] = useState<State>('loading')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      const ios = /iPhone|iPad|iPod/.test(navigator.userAgent)
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        setState(ios && !isStandalone() ? 'needs-install' : 'unsupported')
        return
      }
      if (Notification.permission === 'denied') return setState('denied')
      const reg = await registration()
      const sub = await reg.pushManager.getSubscription()
      setState(sub ? 'on' : 'off')
    })().catch(() => setState('unsupported'))
  }, [])

  async function enable() {
    setBusy(true)
    setMsg(null)
    try {
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!key) throw new Error('通知の設定（VAPIDキー）がまだされていません')
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') {
        setState(perm === 'denied' ? 'denied' : 'off')
        return
      }
      const reg = await registration()
      await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) })
      await savePushSubscription(JSON.parse(JSON.stringify(sub)))
      setState('on')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '通知をオンにできませんでした')
    } finally {
      setBusy(false)
    }
  }

  async function disable() {
    setBusy(true)
    try {
      const reg = await registration()
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await removePushSubscription(sub.endpoint)
        await sub.unsubscribe()
      }
      setState('off')
    } finally {
      setBusy(false)
    }
  }

  if (state === 'loading') return <p className="text-sm text-muted">確認中…</p>
  if (state === 'needs-install')
    return (
      <p className="text-sm text-warn">
        iPhoneでは、ホーム画面に追加したアプリから開くと通知を受け取れます。<a className="underline" href="/guide">追加の手順を見る</a>
      </p>
    )
  if (state === 'unsupported') return <p className="text-sm text-muted">このブラウザは通知に対応していません。メール通知をご利用ください。</p>
  if (state === 'denied')
    return <p className="text-sm text-warn">通知がブロックされています。端末の設定からこのアプリの通知を許可してください。</p>

  return (
    <div className="space-y-2">
      {state === 'on' ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="badge bg-ok-soft text-ok">この端末で通知オン</span>
          <button className="btn-secondary btn-sm" disabled={busy} onClick={() => sendTestPush().then(() => setMsg('テスト通知を送りました'))}>
            テスト通知
          </button>
          <button className="btn-ghost btn-sm" disabled={busy} onClick={disable}>
            オフにする
          </button>
        </div>
      ) : (
        <button className="btn-primary w-full" disabled={busy} onClick={enable}>
          この端末で通知を受け取る
        </button>
      )}
      {msg && <p className="text-xs text-muted">{msg}</p>}
    </div>
  )
}
