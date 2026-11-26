'use client'

import { useState, useTransition } from 'react'
import { createLoginLink } from '@/app/actions/account'
import { CopyButton } from './client'

/** ほかの端末でも同じアカウントを使うためのログイン用リンクを作る */
export function LoginLinkMaker({ askName = false }: { askName?: boolean }) {
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [pending, start] = useTransition()
  const make = () =>
    start(async () => {
      setError('')
      try {
        const res = await createLoginLink(name)
        if ('error' in res) setError(res.error)
        else setUrl(res.url)
      } catch {
        setError('リンクを作れませんでした。もう一度お試しください。')
      }
    })
  return (
    <div className="space-y-2">
      {askName && (
        <label className="block text-sm">
          <span className="font-semibold">使う人の名前</span>
          <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} maxLength={20} placeholder="例：田中コーチ" />
          <span className="mt-1 block text-xs text-muted">その端末で書いた掲示板・チャットに、管理者だけが見える目印として付きます。</span>
        </label>
      )}
      <button type="button" className="btn-secondary w-full" onClick={make} disabled={pending}>
        {pending ? '作っています…' : url ? '新しいリンクを作り直す' : 'ログイン用リンクを作る'}
      </button>
      {error && <p className="text-sm text-danger">{error}</p>}
      {url && (
        <div className="space-y-2 rounded-lg bg-bg p-3">
          <p className="break-all text-sm">{url}</p>
          <CopyButton text={url} label="コピー・共有" />
          <p className="text-xs text-muted">このリンクは30分・1回だけ使えます。開いた人はあなたのアカウントでログインできるので、信頼できる人にだけ送ってください。</p>
        </div>
      )}
    </div>
  )
}
