'use client'

import { useFormStatus } from 'react-dom'
import { useState, useTransition, type ReactNode } from 'react'

/** フォーム送信中は二重送信を防ぐボタン */
export function SubmitButton({
  children,
  className = 'btn-primary w-full',
  pendingText = '送信中…',
  name,
  value,
  confirm,
}: {
  children: ReactNode
  className?: string
  pendingText?: string
  name?: string
  value?: string
  confirm?: string
}) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      name={name}
      value={value}
      className={className}
      disabled={pending}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault()
      }}
    >
      {pending ? pendingText : children}
    </button>
  )
}

/** Server Action を呼ぶボタン（確認ダイアログ付き） */
export function ActionButton({
  action,
  children,
  className = 'btn-secondary',
  confirm,
}: {
  action: () => Promise<unknown>
  children: ReactNode
  className?: string
  confirm?: string
}) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <>
      <button
        type="button"
        className={className}
        disabled={pending}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return
          setError(null)
          start(async () => {
            try {
              await action()
            } catch (e) {
              setError(e instanceof Error ? e.message : 'エラーが発生しました')
            }
          })
        }}
      >
        {pending ? '処理中…' : children}
      </button>
      {error && <span className="mt-1 block text-xs text-danger">{error}</span>}
    </>
  )
}

/** URLをコピーするボタン */
export function CopyButton({ text, label = 'コピー' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      className="btn-secondary btn-sm"
      onClick={async () => {
        try {
          if (navigator.share && /iPhone|iPad|Android/i.test(navigator.userAgent)) {
            await navigator.share({ url: text })
          } else {
            await navigator.clipboard.writeText(text)
            setDone(true)
            setTimeout(() => setDone(false), 1500)
          }
        } catch {
          /* キャンセル */
        }
      }}
    >
      {done ? 'コピーしました' : label}
    </button>
  )
}
