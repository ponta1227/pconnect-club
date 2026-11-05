'use client'

import { useState, useTransition } from 'react'
import { zip } from 'fflate'
import { addAlbumPhotos, deleteAttachment } from '@/app/actions/media'
import { uploadFile, Lightbox } from './uploader'

type Photo = { id: string; file_name: string; canDelete: boolean }

export function AlbumGrid({ title, photos }: { title: string; photos: Photo[] }) {
  const [open, setOpen] = useState<number | null>(null)
  const [zipping, setZipping] = useState<string | null>(null)
  const [pending, start] = useTransition()

  /** 端末側でまとめてZIPにする（サーバーの負荷を増やさない） */
  async function downloadAll() {
    try {
      const files: Record<string, Uint8Array> = {}
      let i = 0
      for (const p of photos) {
        setZipping(`準備中… ${++i}/${photos.length}`)
        const res = await fetch(`/api/files/${p.id}`)
        if (!res.ok) continue
        const name = `${String(i).padStart(3, '0')}_${p.file_name || 'photo.jpg'}`
        files[name] = new Uint8Array(await res.arrayBuffer())
      }
      setZipping('ZIPを作成中…')
      const data = await new Promise<Uint8Array>((resolve, reject) => zip(files, { level: 0 }, (err, out) => (err ? reject(err) : resolve(out))))
      const blob = new Blob([data.slice().buffer as ArrayBuffer], { type: 'application/zip' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${title}.zip`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
    } finally {
      setZipping(null)
    }
  }

  if (photos.length === 0) return <p className="py-8 text-center text-sm text-muted">写真はまだありません</p>
  return (
    <div className="space-y-3">
      <button className="btn-secondary w-full" disabled={!!zipping} onClick={downloadAll}>
        {zipping ?? `まとめてダウンロード（${photos.length}枚・ZIP）`}
      </button>
      <ul className="grid grid-cols-3 gap-1">
        {photos.map((p, i) => (
          <li key={p.id} className="relative">
            <button type="button" className="block w-full overflow-hidden rounded-lg bg-bg" onClick={() => setOpen(i)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/files/${p.id}`} alt="" loading="lazy" className="aspect-square w-full object-cover" />
            </button>
            {p.canDelete && (
              <button
                type="button"
                aria-label="削除"
                disabled={pending}
                onClick={() => confirm('この写真を削除しますか？') && start(() => deleteAttachment(p.id))}
                className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-sm text-white"
              >
                ×
              </button>
            )}
          </li>
        ))}
      </ul>
      {open != null && <Lightbox id={photos[open].id} onClose={() => setOpen(null)} />}
    </div>
  )
}

export function AlbumAdder({ albumId }: { albumId: string }) {
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="space-y-2">
      <label className="btn-primary w-full cursor-pointer">
        {progress ?? '写真を選んで追加'}
        <input
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          disabled={!!progress}
          onChange={async (e) => {
            const files = Array.from(e.target.files ?? [])
            if (!files.length) return
            setError(null)
            const ids: string[] = []
            try {
              for (let i = 0; i < files.length; i++) {
                setProgress(`アップロード中… ${i + 1}/${files.length}`)
                ids.push((await uploadFile(files[i], 'album')).id)
              }
            } catch (err) {
              setError(err instanceof Error ? err.message : 'アップロードに失敗しました')
            } finally {
              if (ids.length) await addAlbumPhotos(albumId, ids)
              setProgress(null)
              e.target.value = ''
            }
          }}
        />
      </label>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  )
}
