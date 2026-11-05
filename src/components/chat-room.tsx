'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { deleteMessage, sendMessage } from '@/app/actions/chat'
import { uploadFile, AttachmentList } from './uploader'
import { Avatar } from './ui'
import { IconPhoto } from './icons'

type Msg = {
  id: string
  sender_id: string | null
  sender_name: string
  sender_avatar: string | null
  body: string
  created_at: string
  deleted: boolean
  reply_to: string | null
  reply_name: string | null
  reply_body: string | null
  mentions: string[]
  poll_id: string | null
  read_count: number
  attachments: { id: string; kind: 'photo' | 'pdf'; file_name: string }[]
}
type Member = { id: string; display_name: string }

const POLL_MS = 4000

function timeLabel(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' })
}
function dayLabel(iso: string) {
  return new Date(iso).toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short', timeZone: 'Asia/Tokyo' })
}

/** 本文中の @名前 を強調表示 */
function Body({ text, members }: { text: string; members: Member[] }) {
  const names = members.map((m) => m.display_name).filter(Boolean).sort((a, b) => b.length - a.length)
  if (names.length === 0) return <>{text}</>
  const re = new RegExp(`(@(?:${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}))`, 'g')
  return (
    <>
      {text.split(re).map((part, i) =>
        part.startsWith('@') && names.includes(part.slice(1)) ? (
          <span key={i} className="font-bold text-brand">{part}</span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  )
}

export function ChatRoom({
  roomId,
  meId,
  isAdmin,
  initial,
  members,
}: {
  roomId: string
  meId: string
  isAdmin: boolean
  initial: Msg[]
  members: Member[]
}) {
  const [messages, setMessages] = useState<Msg[]>(initial)
  const [text, setText] = useState('')
  const [replyTo, setReplyTo] = useState<Msg | null>(null)
  const [mentions, setMentions] = useState<string[]>([])
  const [showMentions, setShowMentions] = useState(false)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [olderDone, setOlderDone] = useState(initial.length < 50)
  const bottom = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const lastAt = useRef<string | null>(initial.at(-1)?.created_at ?? null)

  const scrollToBottom = (smooth = true) => bottom.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'end' })
  useEffect(() => {
    scrollToBottom(false)
  }, [])

  const merge = useCallback((incoming: Msg[]) => {
    if (incoming.length === 0) return
    setMessages((cur) => {
      const map = new Map(cur.map((m) => [m.id, m]))
      for (const m of incoming) map.set(m.id, m)
      return [...map.values()].sort((a, b) => a.created_at.localeCompare(b.created_at))
    })
    const last = incoming.at(-1)!.created_at
    if (!lastAt.current || last > lastAt.current) lastAt.current = last
  }, [])

  // 新着の取得（画面を見ているときだけ）
  useEffect(() => {
    let stop = false
    async function tick() {
      if (document.visibilityState !== 'visible') return
      const nearBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 200
      const after = lastAt.current ?? new Date(0).toISOString()
      try {
        const res = await fetch(`/api/chat/${roomId}/messages?after=${encodeURIComponent(after)}&visible=1`, { cache: 'no-store' })
        if (!res.ok || stop) return
        const data = (await res.json()) as { messages: Msg[]; reads: { id: string; read_count: number }[] }
        merge(data.messages)
        if (data.reads.length) {
          const reads = new Map(data.reads.map((r) => [r.id, r.read_count]))
          setMessages((cur) => cur.map((m) => (reads.has(m.id) ? { ...m, read_count: reads.get(m.id)! } : m)))
        }
        if (data.messages.length && nearBottom) setTimeout(() => scrollToBottom(), 50)
      } catch {
        /* 通信エラーは次回再試行 */
      }
    }
    const t = setInterval(tick, POLL_MS)
    const onVis = () => tick()
    document.addEventListener('visibilitychange', onVis)
    tick()
    return () => {
      stop = true
      clearInterval(t)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [roomId, merge])

  async function loadOlder() {
    const first = messages[0]?.created_at
    if (!first) return
    const res = await fetch(`/api/chat/${roomId}/messages?before=${encodeURIComponent(first)}`, { cache: 'no-store' })
    const data = (await res.json()) as { messages: Msg[] }
    if (data.messages.length < 50) setOlderDone(true)
    setMessages((cur) => [...data.messages.filter((m) => !cur.some((c) => c.id === m.id)), ...cur])
  }

  async function send(attachments: string[] = []) {
    if (!text.trim() && attachments.length === 0) return
    setSending(true)
    setError(null)
    try {
      const usedMentions = mentions.filter((id) => text.includes('@' + (members.find((m) => m.id === id)?.display_name ?? '')))
      const msg = await sendMessage({ roomId, body: text, replyTo: replyTo?.id ?? null, mentions: usedMentions, attachments })
      if (msg) merge([msg])
      setText('')
      setReplyTo(null)
      setMentions([])
      setTimeout(() => scrollToBottom(), 50)
    } catch (e) {
      setError(e instanceof Error ? e.message : '送信できませんでした')
    } finally {
      setSending(false)
    }
  }

  async function onPickFiles(files: FileList | null) {
    if (!files?.length) return
    setSending(true)
    setError(null)
    try {
      const ids: string[] = []
      for (const f of Array.from(files).slice(0, 10)) ids.push((await uploadFile(f, 'message')).id)
      await send(ids)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'アップロードに失敗しました')
      setSending(false)
    }
  }

  return (
    <div className="flex min-h-[calc(100dvh-7.5rem)] flex-col">
      <div ref={listRef} className="flex-1 space-y-2 px-3 pb-40 pt-3">
        {!olderDone && messages.length > 0 && (
          <div className="text-center">
            <button className="btn-ghost btn-sm" onClick={loadOlder}>さらに前を読み込む</button>
          </div>
        )}
        {messages.length === 0 && <p className="py-10 text-center text-sm text-muted">まだメッセージはありません</p>}
        {messages.map((m, idx) => {
          const mine = m.sender_id === meId
          const day = dayLabel(m.created_at)
          const showDay = idx === 0 || day !== dayLabel(messages[idx - 1].created_at)
          // 本人の削除は送信後24時間以内（サーバー側で判定）
          const canDelete = !m.deleted && (isAdmin || mine)
          return (
            <div key={m.id}>
              {showDay && <p className="my-3 text-center text-xs text-muted">{day}</p>}
              <div className={`flex items-end gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
                {!mine && <Avatar name={m.sender_name} url={m.sender_avatar} size={32} />}
                <div className={`max-w-[78%] ${mine ? 'items-end' : 'items-start'} flex flex-col`}>
                  {!mine && <span className="mb-0.5 text-xs text-muted">{m.sender_name}</span>}
                  <button
                    type="button"
                    onClick={() => !m.deleted && setMenuFor(menuFor === m.id ? null : m.id)}
                    className={`rounded-2xl px-3 py-2 text-left text-[0.95rem] ${
                      m.deleted ? 'bg-bg italic text-muted' : mine ? 'bg-brand text-white' : 'border border-line bg-white'
                    } ${m.mentions.includes(meId) ? 'ring-2 ring-warn' : ''}`}
                  >
                    {m.reply_to && !m.deleted && (
                      <span className={`mb-1 block border-l-2 pl-2 text-xs ${mine ? 'border-white/60 text-white/80' : 'border-line text-muted'}`}>
                        {m.reply_name}: {m.reply_body}
                      </span>
                    )}
                    {m.deleted ? (
                      'メッセージは削除されました'
                    ) : (
                      <span className="whitespace-pre-wrap">
                        <Body text={m.body} members={members} />
                      </span>
                    )}
                    {m.poll_id && !m.deleted && <span className="mt-1 block text-xs underline">上の「アンケート」から回答できます</span>}
                  </button>
                  {m.attachments.length > 0 && (
                    <div className="mt-1 w-56">
                      <AttachmentList files={m.attachments} />
                    </div>
                  )}
                  {menuFor === m.id && (
                    <div className="mt-1 flex gap-1">
                      <button className="btn-secondary btn-sm" onClick={() => { setReplyTo(m); setMenuFor(null) }}>返信</button>
                      {canDelete && (
                        <button
                          className="btn-secondary btn-sm text-danger"
                          onClick={async () => {
                            if (!confirm('このメッセージを削除しますか？')) return
                            try {
                              await deleteMessage(m.id)
                              setMessages((cur) => cur.map((x) => (x.id === m.id ? { ...x, deleted: true, body: '', attachments: [] } : x)))
                            } catch (e) {
                              setError(e instanceof Error ? e.message : '削除できませんでした')
                            }
                            setMenuFor(null)
                          }}
                        >
                          削除
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <span className="mb-1 shrink-0 text-[0.65rem] leading-tight text-muted">
                  {mine && m.read_count > 0 && <span className="block">既読 {m.read_count}</span>}
                  {timeLabel(m.created_at)}
                </span>
              </div>
            </div>
          )
        })}
        <div ref={bottom} />
      </div>

      <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom)+0.5rem)] z-20 border-t border-line bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-xl space-y-1.5 px-3 py-2">
          {replyTo && (
            <div className="flex items-center gap-2 rounded-lg bg-bg px-2 py-1 text-xs">
              <span className="flex-1 truncate">返信: {replyTo.sender_name}「{replyTo.body.slice(0, 30)}」</span>
              <button onClick={() => setReplyTo(null)} className="text-muted">×</button>
            </div>
          )}
          {showMentions && (
            <div className="flex max-h-40 flex-wrap gap-1 overflow-y-auto rounded-xl border border-line bg-white p-2">
              {members
                .filter((m) => m.id !== meId)
                .map((m) => (
                  <button
                    key={m.id}
                    className="badge min-h-8 border border-line bg-white px-2 text-sm"
                    onClick={() => {
                      setText((t) => `${t}${t && !t.endsWith(' ') ? ' ' : ''}@${m.display_name} `)
                      setMentions((cur) => [...new Set([...cur, m.id])])
                      setShowMentions(false)
                    }}
                  >
                    @{m.display_name}
                  </button>
                ))}
            </div>
          )}
          <div className="flex items-end gap-1.5">
            <label className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted hover:bg-bg" aria-label="写真・PDFを送る">
              <IconPhoto />
              <input type="file" accept="image/*,application/pdf" multiple className="hidden" disabled={sending} onChange={(e) => onPickFiles(e.target.files)} />
            </label>
            <button type="button" className="flex h-11 w-9 shrink-0 items-center justify-center rounded-full text-lg font-bold text-muted hover:bg-bg" onClick={() => setShowMentions(!showMentions)} aria-label="メンション">
              @
            </button>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={1}
              maxLength={4000}
              placeholder="メッセージ"
              className="input max-h-32 min-h-11 flex-1 resize-none py-2.5"
            />
            <button className="btn-primary shrink-0 px-3" disabled={sending || !text.trim()} onClick={() => send()}>
              {sending ? '…' : '送信'}
            </button>
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
        </div>
      </div>
    </div>
  )
}
