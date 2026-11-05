'use client'

import { useRef, useState } from 'react'
import { confirmUpload, prepareUpload } from '@/app/actions/files'
import { IconFile, IconPhoto } from './icons'

export type UploadedFile = { id: string; kind: 'photo' | 'pdf'; file_name: string; size?: number }
type Purpose = 'post' | 'event' | 'message' | 'album' | 'document'

/** 写真は長辺2048pxに縮小してJPEGに変換 */
async function resizeImage(file: File): Promise<Blob> {
  if (file.type === 'image/gif') return file
  const bitmap = await createImageBitmap(file).catch(() => null)
  if (!bitmap) return file
  const max = 2048
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  if (scale === 1 && file.type === 'image/jpeg' && file.size < 2 * 1024 * 1024) return file
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? file), 'image/jpeg', 0.85))
}

export async function uploadFile(file: File, purpose: Purpose): Promise<UploadedFile> {
  const isPdf = file.type === 'application/pdf'
  const isImage = file.type.startsWith('image/')
  if (!isPdf && !isImage) throw new Error('写真またはPDFを選んでください')
  const blob = isImage ? await resizeImage(file) : file
  const mime = isImage && blob !== file ? 'image/jpeg' : file.type
  const name = isImage && blob !== file ? file.name.replace(/\.[^.]+$/, '') + '.jpg' : file.name
  const { id, uploadUrl } = await prepareUpload({ kind: isPdf ? 'pdf' : 'photo', mime, size: blob.size, name, purpose })
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': mime, 'x-upsert': 'false', 'cache-control': 'max-age=3600' },
    body: blob,
  })
  if (!res.ok) throw new Error('アップロードに失敗しました')
  await confirmUpload(id)
  return { id, kind: isPdf ? 'pdf' : 'photo', file_name: name, size: blob.size }
}

/** フォームに添付欄を追加する。選んだファイルのIDを hidden の name="attachments" で送る */
export function Uploader({
  purpose,
  initial = [],
  accept = 'image/*,application/pdf',
  label = '写真・PDFを添付',
  name = 'attachments',
}: {
  purpose: Purpose
  initial?: UploadedFile[]
  accept?: string
  label?: string
  name?: string
}) {
  const [files, setFiles] = useState<UploadedFile[]>(initial)
  const [busy, setBusy] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  async function onPick(list: FileList | null) {
    if (!list) return
    setError(null)
    const picked = Array.from(list)
    setBusy((b) => b + picked.length)
    for (const f of picked) {
      try {
        const up = await uploadFile(f, purpose)
        setFiles((cur) => [...cur, up])
      } catch (e) {
        setError(e instanceof Error ? e.message : 'アップロードに失敗しました')
      } finally {
        setBusy((b) => b - 1)
      }
    }
    if (input.current) input.current.value = ''
  }

  return (
    <div className="space-y-2">
      {files.map((f) => (
        <input key={f.id} type="hidden" name={name} value={f.id} />
      ))}
      {files.length > 0 && (
        <ul className="grid grid-cols-3 gap-2">
          {files.map((f) => (
            <li key={f.id} className="relative overflow-hidden rounded-xl border border-line bg-white">
              {f.kind === 'photo' ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/files/${f.id}`} alt="" className="aspect-square w-full object-cover" />
              ) : (
                <div className="flex aspect-square flex-col items-center justify-center gap-1 p-2 text-center text-[0.65rem] text-muted">
                  <IconFile className="h-7 w-7 text-danger" />
                  <span className="line-clamp-2 break-all">{f.file_name}</span>
                </div>
              )}
              <button
                type="button"
                aria-label="削除"
                onClick={() => setFiles((cur) => cur.filter((x) => x.id !== f.id))}
                className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <label className="btn-secondary btn-sm cursor-pointer">
        <IconPhoto className="h-5 w-5" />
        {busy > 0 ? `アップロード中…（${busy}）` : label}
        <input ref={input} type="file" accept={accept} multiple className="hidden" onChange={(e) => onPick(e.target.files)} disabled={busy > 0} />
      </label>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  )
}

/** 添付の表示（写真はタップで拡大、PDFはリンク） */
export function AttachmentList({ files }: { files: UploadedFile[] }) {
  const [open, setOpen] = useState<string | null>(null)
  if (files.length === 0) return null
  const photos = files.filter((f) => f.kind === 'photo')
  const pdfs = files.filter((f) => f.kind === 'pdf')
  return (
    <div className="space-y-2">
      {photos.length > 0 && (
        <div className={`grid gap-1.5 ${photos.length === 1 ? 'grid-cols-1' : 'grid-cols-3'}`}>
          {photos.map((p) => (
            <button key={p.id} type="button" onClick={() => setOpen(p.id)} className="overflow-hidden rounded-xl bg-bg">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/files/${p.id}`} alt="" loading="lazy" className={`w-full object-cover ${photos.length === 1 ? 'max-h-96' : 'aspect-square'}`} />
            </button>
          ))}
        </div>
      )}
      {pdfs.map((p) => (
        <a key={p.id} href={`/api/files/${p.id}`} target="_blank" rel="noopener" className="flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-2.5 text-sm">
          <IconFile className="h-6 w-6 shrink-0 text-danger" />
          <span className="min-w-0 flex-1 truncate">{p.file_name}</span>
          <span className="text-xs text-brand">開く</span>
        </a>
      ))}
      {open && <Lightbox id={open} onClose={() => setOpen(null)} />}
    </div>
  )
}

export function Lightbox({ id, onClose }: { id: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95" onClick={onClose}>
      <div className="flex justify-end gap-2 p-3" onClick={(e) => e.stopPropagation()}>
        <a href={`/api/files/${id}?download=1`} className="btn-secondary btn-sm">保存</a>
        <button type="button" className="btn-secondary btn-sm" onClick={onClose}>閉じる</button>
      </div>
      <div className="flex flex-1 items-center justify-center p-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/files/${id}`} alt="" className="max-h-full max-w-full object-contain" />
      </div>
    </div>
  )
}
