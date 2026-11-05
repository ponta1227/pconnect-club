import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { sql } from '@/lib/db'
import { fmtDate } from '@/lib/time'
import { Empty, Page, PageHeader } from '@/components/ui'
import { IconBoard, IconCalendar, IconFile, IconPoll } from '@/components/icons'

export const metadata = { title: '検索' }

type Hit = { kind: 'post' | 'event' | 'document' | 'poll'; id: string; title: string; snippet: string; at: Date; href: string }

export default async function SearchPage({ searchParams }: PageProps<'/search'>) {
  const user = await requireUser()
  const { q: raw } = await searchParams
  const q = typeof raw === 'string' ? raw.trim().slice(0, 50) : ''
  let hits: Hit[] = []
  if (q) {
    const like = `%${q.replace(/[%_\\]/g, (c) => '\\' + c)}%`
    const [posts, events, docs, polls] = await Promise.all([
      sql<{ id: string; title: string; body: string; at: Date }[]>`
        select id, title, body, published_at as at from posts where published_at is not null and (title ilike ${like} or body ilike ${like})
        order by published_at desc limit 30`,
      sql<{ id: string; title: string; note: string; at: Date }[]>`
        select id, title, note, starts_at as at from events where title ilike ${like} or note ilike ${like} or fee_note ilike ${like}
        order by abs(extract(epoch from starts_at - now())) limit 30`,
      sql<{ id: string; title: string; attachment_id: string; at: Date }[]>`
        select id, title, attachment_id, created_at as at from documents where title ilike ${like} order by created_at desc limit 30`,
      // チャットのアンケートは、参加しているルームのものだけ
      sql<{ id: string; question: string; owner_type: string; owner_id: string; at: Date }[]>`
        select p.id, p.question, p.owner_type, p.owner_id, p.created_at as at from polls p
        where p.question ilike ${like}
          and (p.owner_type = 'post' or exists (select 1 from chat_members cm where cm.room_id = p.owner_id and cm.profile_id = ${user.id}))
        order by p.created_at desc limit 30`,
    ])
    const snip = (s: string) => {
      const i = s.indexOf(q)
      return i < 0 ? s.slice(0, 60) : (i > 20 ? '…' : '') + s.slice(Math.max(0, i - 20), i + 40)
    }
    hits = [
      ...posts.map<Hit>((p) => ({ kind: 'post', id: p.id, title: p.title, snippet: snip(p.body), at: p.at, href: `/board/${p.id}` })),
      ...events.map<Hit>((e) => ({ kind: 'event', id: e.id, title: e.title, snippet: snip(e.note), at: e.at, href: `/events/${e.id}` })),
      ...docs.map<Hit>((d) => ({ kind: 'document', id: d.id, title: d.title, snippet: '', at: d.at, href: `/api/files/${d.attachment_id}` })),
      ...polls
        .filter((p) => p.owner_type === 'post' || !user.isChild)
        .map<Hit>((p) => ({ kind: 'poll', id: p.id, title: p.question, snippet: '', at: p.at, href: p.owner_type === 'post' ? `/board/${p.owner_id}` : `/chat/${p.owner_id}` })),
    ]
  }
  const ICON = { post: <IconBoard className="h-5 w-5" />, event: <IconCalendar className="h-5 w-5" />, document: <IconFile className="h-5 w-5" />, poll: <IconPoll className="h-5 w-5" /> }
  const LABEL = { post: '掲示板', event: '予定', document: '資料', poll: 'アンケート' }

  return (
    <>
      <PageHeader title="検索" back="/" />
      <Page className="space-y-3">
        <form className="flex gap-2">
          <input name="q" defaultValue={q} className="input flex-1" placeholder="掲示板・予定・資料・アンケートを検索" autoFocus maxLength={50} />
          <button className="btn-primary">検索</button>
        </form>
        {q && hits.length === 0 && <Empty>「{q}」は見つかりませんでした</Empty>}
        {hits.length > 0 && (
          <ul className="card divide-y divide-line">
            {hits.map((h) => (
              <li key={`${h.kind}-${h.id}`}>
                <Link href={h.href} className="flex gap-3 px-4 py-3">
                  <span className="mt-0.5 text-muted">{ICON[h.kind]}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs text-muted">{LABEL[h.kind]}・{fmtDate(h.at)}</span>
                    <span className="block font-semibold">{h.title}</span>
                    {h.snippet && <span className="block truncate text-sm text-muted">{h.snippet}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className="px-1 text-xs text-muted">チャットのメッセージは、各ルームの検索ボタンから探せます。</p>
      </Page>
    </>
  )
}
