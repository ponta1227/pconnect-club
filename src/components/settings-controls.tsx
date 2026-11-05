'use client'

import { useState, useTransition } from 'react'
import { setFontSize, updateNotificationSetting } from '@/app/actions/account'

export function NotifySwitch({ kind, channel, value, disabled }: { kind: string; channel: 'push' | 'email'; value: boolean; disabled?: boolean }) {
  const [on, setOn] = useState(value)
  const [pending, start] = useTransition()
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={`${kind} ${channel}`}
      disabled={disabled || pending}
      onClick={() => {
        const next = !on
        setOn(next)
        start(async () => {
          try {
            await updateNotificationSetting(kind, channel, next)
          } catch {
            setOn(!next)
          }
        })
      }}
      className={`relative mx-auto h-7 w-12 rounded-full transition ${on && !disabled ? 'bg-brand' : 'bg-line'} disabled:opacity-40`}
    >
      <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition ${on ? 'left-[1.375rem]' : 'left-0.5'}`} />
    </button>
  )
}

export function FontSizeToggle({ value }: { value: 'normal' | 'large' }) {
  const [pending, start] = useTransition()
  return (
    <div className="flex gap-2">
      {(
        [
          ['normal', '標準'],
          ['large', '大きい'],
        ] as const
      ).map(([v, l]) => (
        <button
          key={v}
          type="button"
          disabled={pending}
          onClick={() => start(() => setFontSize(v))}
          className={`btn flex-1 border ${value === v ? 'border-brand bg-brand-soft text-brand' : 'border-line bg-white'}`}
        >
          {l}
        </button>
      ))}
    </div>
  )
}
