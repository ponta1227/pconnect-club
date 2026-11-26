'use client'

import { useState, useTransition } from 'react'
import { createLoginLink } from '@/app/actions/account'
import { CopyButton } from './client'

/** ほかの端末でも同じアカウントを使うためのログイン用リンクを作る */
export function LoginLinkMaker() {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [pending, start] = useTransition()
  const make = () =>
    start(async () => {
      setError('')
      try {
        setUrl((await createLoginLink()).url)
      } catch {
        setError('リンクを作れませんでした。もう一度お試しください。')
      }
    })
  return (
    <div className="space-y-2">
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
