'use client'

import { useState, useTransition } from 'react'
import { createChildAccountInvite, createFamilyInvite } from '@/app/actions/children'
import { CopyButton } from './client'

function LinkBox({ url, message }: { url: string; message: string }) {
  return (
    <div className="space-y-2 rounded-xl bg-brand-soft p-3">
      <p className="break-all text-xs">{url}</p>
      <div className="flex gap-2">
        <CopyButton text={url} label="コピー・共有" />
        <a className="btn-secondary btn-sm" href={`https://line.me/R/share?text=${encodeURIComponent(`${message}\n${url}`)}`} target="_blank" rel="noopener">
          LINEで送る
        </a>
      </div>
      <p className="text-xs text-muted">このリンクは1回だけ使えます。</p>
    </div>
  )
}

export function FamilyInvite({ kids }: { kids: { id: string; full_name: string }[] }) {
  const [selected, setSelected] = useState<string[]>(kids.map((k) => k.id))
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  if (url) return <LinkBox url={url} message="P-CONNECT Jr. の連絡アプリに家族として招待します。" />
  return (
    <div className="space-y-2">
      {kids.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {kids.map((k) => (
            <label key={k.id} className="flex min-h-11 items-center gap-2 rounded-xl border border-line bg-white px-3 text-sm">
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={selected.includes(k.id)}
                onChange={(e) => setSelected((s) => (e.target.checked ? [...s, k.id] : s.filter((x) => x !== k.id)))}
              />
              {k.full_name}
            </label>
          ))}
        </div>
      )}
      <button
        className="btn-primary w-full"
        disabled={pending || selected.length === 0}
        onClick={() =>
          start(async () => {
            setError(null)
            try {
              setUrl((await createFamilyInvite(selected)).url)
            } catch (e) {
              setError(e instanceof Error ? e.message : 'エラーが発生しました')
            }
          })
        }
      >
        家族招待リンクを作る
      </button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  )
}

export function ChildAccountInvite({ childId, childName }: { childId: string; childName: string }) {
  const [open, setOpen] = useState(false)
  const [consent, setConsent] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  if (url) return <LinkBox url={url} message={`${childName}さん用のP-CONNECT Jr.アカウントの招待です。自分のLINEでログインしてください。`} />
  if (!open)
    return (
      <div className="space-y-1">
        <p className="text-sm text-muted">ありません。保護者の方が忙しく、お子さん本人から欠席などの連絡をする場合に作れます。</p>
        <button className="btn-secondary btn-sm" onClick={() => setOpen(true)}>子どもアカウントを作る</button>
      </div>
    )
  return (
    <div className="space-y-2 rounded-xl bg-bg p-3 text-sm">
      <p>子どもアカウントでできること：</p>
      <ul className="list-disc pl-5 text-xs text-muted">
        <li>予定の確認、本人の欠席・遅刻・早退の連絡、大会の参加登録</li>
        <li>掲示板の閲覧・コメント、写真・資料の閲覧</li>
        <li>チャット・他の子の情報（到着状況・メンバー一覧）は見られません</li>
        <li>通知は「予定の変更・中止」だけ届きます。本人が連絡すると保護者にも通知されます</li>
      </ul>
      <label className="flex items-start gap-2">
        <input type="checkbox" className="mt-0.5 h-5 w-5" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>保護者として、{childName}さんが本アプリを利用することに同意します（利用規約・プライバシーポリシーに同意）</span>
      </label>
      <button
        className="btn-primary w-full"
        disabled={!consent || pending}
        onClick={() =>
          start(async () => {
            setError(null)
            try {
              setUrl((await createChildAccountInvite(childId, consent)).url)
            } catch (e) {
              setError(e instanceof Error ? e.message : 'エラーが発生しました')
            }
          })
        }
      >
        招待リンクを作る
      </button>
      <p className="text-xs text-muted">お子さんがリンクを開いてLINEでログインし、クラブの管理者が承認すると使えるようになります。</p>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  )
}
