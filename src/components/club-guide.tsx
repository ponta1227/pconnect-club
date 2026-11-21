import { Linkify } from '@/components/ui'
import type { GuideBlock } from '@/lib/guide'

/** クラブのご案内の本文（目次つき） */
export function ClubGuideBody({ blocks }: { blocks: GuideBlock[] }) {
  const heads = blocks.filter((b) => b.kind === 'heading')
  return (
    <div className="space-y-4">
      {heads.length > 1 && (
        <nav aria-label="目次" className="card p-4">
          <ul className="space-y-1.5 text-sm">
            {heads.map((h) => (
              <li key={h.id}>
                <a href={`#${h.id}`} className="text-brand underline">{h.text}</a>
              </li>
            ))}
          </ul>
        </nav>
      )}
      <article className="card space-y-3 p-4 text-[15px] leading-relaxed">
        {blocks.map((b, i) =>
          b.kind === 'image' ? (
            <figure key={i} className="space-y-1">
              {/* eslint-disable-next-line @next/next/no-img-element -- 管理者が差し替える写真なので素のimgで出す */}
              <img src={b.src} alt={b.caption} loading="lazy" className="w-full rounded-xl border border-line" />
              {b.caption && <figcaption className="text-center text-sm text-muted">{b.caption}</figcaption>}
            </figure>
          ) : b.kind === 'heading' ? (
            <h2 key={b.id} id={b.id} className="scroll-mt-20 border-t border-line pt-4 text-lg font-bold first:border-t-0 first:pt-0">
              {b.text}
            </h2>
          ) : (
            <p key={i} className="break-words">
              {b.lines.map((l, j) => (
                <span key={j} className={`block ${l.startsWith('【') ? 'mt-1 font-bold' : ''}`}>
                  <Linkify text={l} />
                </span>
              ))}
            </p>
          ),
        )}
      </article>
    </div>
  )
}
