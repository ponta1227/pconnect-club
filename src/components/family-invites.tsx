'use client'

import { useState, useTransition } from 'react'
import { createChildLogin, createFamilyInvite, resetChildPassword } from '@/app/actions/children'
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
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [done, setDone] = useState<{ loginId: string; password: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  if (done)
    return (
      <div className="space-y-2 rounded-xl bg-brand-soft p-3 text-sm">
        <p className="font-bold">作りました。{childName}さんに次の2つを伝えてください。</p>
        <p>
          ログインID: <b className="num select-all text-base">{done.loginId}</b>
          <br />
          パスワード: <b className="num select-all text-base">{done.password}</b>
        </p>
        <p className="text-xs text-muted">
          ログイン画面の「子ども用アカウントでログイン」から入ります。クラブの管理者が承認すると使えるようになります。パスワードはこの画面を閉じると見られなくなるので、メモしておいてください（忘れたら新しくできます）。
        </p>
      </div>
    )
  if (!open)
    return (
      <div className="space-y-1">
        <p className="text-sm text-muted">ありません。お子さん本人が自分のスマホやタブレットで予定を見たり、欠席の連絡をしたりするときに作れます。LINEやメールは要りません。</p>
        <button className="btn-secondary btn-sm" onClick={() => setOpen(true)}>子どもアカウントを作る</button>
      </div>
    )
  return (
    <div className="space-y-3 rounded-xl bg-bg p-3 text-sm">
      <p>子どもアカウントでできること：</p>
      <ul className="list-disc pl-5 text-xs text-muted">
        <li>予定の確認、本人の欠席・遅刻・早退の連絡、大会の参加登録</li>
        <li>掲示板の閲覧・コメント、写真・資料の閲覧</li>
        <li>チャット・他の子の情報（到着状況・メンバー一覧）は見られません</li>
        <li>通知は「予定の変更・中止」だけ届きます。本人が連絡すると保護者にも通知されます</li>
      </ul>
      <label className="block space-y-1">
        <span className="font-bold">ログインID</span>
        <input
          className="input"
          value={loginId}
          onChange={(e) => setLoginId(e.target.value)}
          placeholder="例：taro2015"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-label={`${childName} のログインID`}
        />
        <span className="hint block">半角の英字・数字で4〜20文字。ほかの人と同じIDは使えません。</span>
      </label>
      <label className="block space-y-1">
        <span className="font-bold">パスワード</span>
        <input
          className="input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          aria-label={`${childName} のパスワード`}
        />
        <span className="hint block">6文字以上。お子さんが覚えやすく、ほかの人に分かりにくいものにしてください。</span>
      </label>
      <label className="flex items-start gap-2">
        <input type="checkbox" className="mt-0.5 h-5 w-5" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>保護者として、{childName}さんがこのアプリを利用することに同意します</span>
      </label>
      <button
        className="btn-primary w-full"
        disabled={!consent || pending}
        onClick={() =>
          start(async () => {
            setError(null)
            const r = await createChildLogin(childId, loginId, password, consent)
            if (r.ok) setDone({ loginId: loginId.trim().toLowerCase(), password })
            else setError(r.error)
          })
        }
      >
        {pending ? '作っています…' : 'このIDとパスワードで作る'}
      </button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  )
}

/** 子ども用アカウントのパスワードを新しくする */
export function ChildPasswordReset({ childId, childName }: { childId: string; childName: string }) {
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  if (done) return <p className="text-sm text-ok">新しいパスワードにしました。{childName}さんに伝えてください。</p>
  if (!open)
    return (
      <button className="btn-ghost btn-sm" onClick={() => setOpen(true)}>
        パスワードを変える
      </button>
    )
  return (
    <div className="w-full space-y-2 rounded-xl bg-bg p-3 text-sm">
      <label className="block space-y-1">
        <span className="font-bold">新しいパスワード</span>
        <input className="input" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" aria-label={`${childName} の新しいパスワード`} />
        <span className="hint block">6文字以上。変えると、お子さんのスマホは一度ログアウトされます。</span>
      </label>
      <div className="flex gap-2">
        <button
          className="btn-primary flex-1"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null)
              const r = await resetChildPassword(childId, password)
              if (r.ok) setDone(true)
              else setError(r.error)
            })
          }
        >
          {pending ? '…' : '変える'}
        </button>
        <button className="btn-ghost" onClick={() => setOpen(false)}>やめる</button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  )
}
