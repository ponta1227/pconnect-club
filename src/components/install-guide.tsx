'use client'

import { useSyncExternalStore } from 'react'
import { isStandalone } from './push'

// ホーム画面に追加する手順（端末に合わせて表示）
function Step({ n, children, art }: { n: number; children: React.ReactNode; art: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">{n}</span>
      <span className="flex-1 text-sm">{children}</span>
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-bg">{art}</span>
    </li>
  )
}

const ShareArt = () => (
  <svg viewBox="0 0 24 24" className="h-7 w-7 text-[#0a84ff]" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
    <path d="M12 3v12M8 7l4-4 4 4" />
    <path d="M5 11v9h14v-9" />
  </svg>
)
const AddArt = () => (
  <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
    <rect x="4" y="4" width="16" height="16" rx="3" />
    <path d="M12 8v8M8 12h8" />
  </svg>
)
const MenuArt = () => (
  <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor">
    <circle cx="12" cy="5" r="1.8" />
    <circle cx="12" cy="12" r="1.8" />
    <circle cx="12" cy="19" r="1.8" />
  </svg>
)
const AppArt = () => (
  <svg viewBox="0 0 64 64" className="h-9 w-9">
    <rect width="64" height="64" rx="14" fill="var(--brand)" />
    <path d="M20 48V16h11a9 9 0 0 1 0 18H20" fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const noop = () => () => {}
let cached: { os: 'ios' | 'android' | 'other'; installed: boolean } | null = null
function detect() {
  if (!cached) {
    const ua = navigator.userAgent
    cached = { os: /iPhone|iPad|iPod/.test(ua) ? 'ios' : /Android/.test(ua) ? 'android' : 'other', installed: isStandalone() }
  }
  return cached
}

export function InstallGuide() {
  const env = useSyncExternalStore(noop, detect, () => null)
  const os = env?.os ?? null
  const installed = env?.installed ?? false
  if (!os) return null
  if (installed) return <p className="rounded-xl bg-ok-soft px-3 py-2 text-sm text-ok">ホーム画面のアプリから開いています。</p>

  return (
    <div className="card space-y-3 p-4">
      <p className="text-sm font-bold">ホーム画面に追加する</p>
      {os === 'ios' && (
        <ol className="space-y-3">
          <Step n={1} art={<ShareArt />}>Safariの下にある「共有」ボタンをタップ</Step>
          <Step n={2} art={<AddArt />}>「ホーム画面に追加」を選ぶ</Step>
          <Step n={3} art={<AppArt />}>ホーム画面の「P-CONNECT Jr.」から開き、通知をオンにする</Step>
        </ol>
      )}
      {os === 'android' && (
        <ol className="space-y-3">
          <Step n={1} art={<MenuArt />}>Chromeの右上「︙」をタップ</Step>
          <Step n={2} art={<AddArt />}>「ホーム画面に追加」または「アプリをインストール」を選ぶ</Step>
          <Step n={3} art={<AppArt />}>ホーム画面の「P-CONNECT Jr.」から開く</Step>
        </ol>
      )}
      {os === 'other' && <p className="text-sm text-muted">スマートフォンで開くと、ホーム画面に追加する手順が表示されます。</p>}
      {os === 'ios' && <p className="text-xs text-muted">※ iPhoneは iOS 16.4 以降で、Safariから追加した場合に通知が届きます。</p>}
    </div>
  )
}
