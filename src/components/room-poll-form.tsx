'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { createRoomPoll } from '@/app/actions/polls'
import { PollFields } from './poll'

export function RoomPollForm({ roomId }: { roomId: string }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  return (
    <form
      action={(fd) =>
        start(async () => {
          setError(null)
          const kind = fd.get('poll_kind') === 'schedule' ? 'schedule' : 'normal'
          const options = (kind === 'schedule' ? fd.getAll('poll_dates').map(String) : String(fd.get('poll_options') ?? '').split('\n'))
            .map((s) => s.trim())
            .filter(Boolean)
          try {
            await createRoomPoll(roomId, {
              question: String(fd.get('poll_question') ?? ''),
              kind,
              multiple: kind === 'schedule' || fd.get('poll_multiple') === 'on',
              anonymous: kind === 'normal' && fd.get('poll_anonymous') === 'on',
              closes_at: String(fd.get('poll_closes_at') ?? ''),
              options,
            })
            router.push(`/chat/${roomId}`)
          } catch (e) {
            setError(e instanceof Error ? e.message : '作成できませんでした')
          }
        })
      }
      className="space-y-3"
    >
      <PollFields />
      {error && <p className="text-sm text-danger">{error}</p>}
      <button className="btn-primary w-full" disabled={pending}>アンケートを送る</button>
    </form>
  )
}
