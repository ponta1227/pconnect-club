'use client'

import { useState, useSyncExternalStore } from 'react'
import { isStandalone } from './push'
import { InstallGuide } from './install-guide'

type Env = { standalone: boolean; inLine: boolean; mobile: boolean }
let cached: Env | null = null
function detect(): Env {
  if (!cached) {
    const ua = navigator.userAgent
    cached = { standalone: isStandalone(), inLine: / Line\//i.test(ua), mobile: /iPhone|iPad|iPod|Android/.test(ua) }
  }
  return cached
}
const noop = () => () => {}

/**
 * 招待リンクを開いたとき、まずホーム画面に追加してもらう。
 * ホーム画面のアイコン（またはパソコン）から開いていれば、そのまま登録ボタンを出す。
 */
export function JoinGate({ children }: { children: React.ReactNode }) {
  const env = useSyncExternalStore(noop, detect, () => null)
  const [skip, setSkip] = useState(false)
  if (!env) return null
  if (env.standalone || !env.mobile || skip) return <>{children}</>

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-ball-soft p-4">
        <p className="font-bold text-ball-ink">まず、このアプリをホーム画面に追加してください</p>
        <p className="mt-1 text-sm text-text">
          追加したアイコンから開くと、通知が届くようになり、続きの登録もそこからできます。
        </p>
      </div>
      {env.inLine ? (
        <div className="card space-y-2 p-4 text-sm">
          <p className="font-bold">LINEの中で開いています</p>
          <p>
            このままでは追加できません。画面右下（または右上）の「…」から<b>「ブラウザで開く」</b>を押して、
            iPhoneは<b>Safari</b>、Androidは<b>Chrome</b>で開き直してください。
          </p>
        </div>
      ) : (
        <InstallGuide />
      )}
      <p className="text-center text-sm text-muted">追加したら、ホーム画面の「P-CONNECT Jr.」から開いてください。</p>
      <button type="button" className="btn-ghost w-full text-sm" onClick={() => setSkip(true)}>
        追加せずに、このまま登録する
      </button>
    </div>
  )
}
