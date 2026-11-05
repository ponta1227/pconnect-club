import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { env } from './env'
import { randomToken, sha256 } from './crypto'

// 本番: Supabase Storage（非公開バケット）＋署名付きURL
// 開発: SUPABASE_URL 未設定ならローカルの .data/uploads に保存する
export const LOCAL_DIR = join(process.cwd(), '.data', 'uploads')

let client: SupabaseClient | null = null
function supabase(): SupabaseClient | null {
  if (!env.supabaseUrl() || !env.supabaseServiceKey()) return null
  client ??= createClient(env.supabaseUrl(), env.supabaseServiceKey(), { auth: { persistSession: false } })
  return client
}

export function usingLocalStorage(): boolean {
  return supabase() === null
}

// 開発用の一時トークン（プロセス内メモリ）
const g = globalThis as unknown as { __pcUploadTokens?: Map<string, { path: string; expires: number }> }
const localUploadTokens = (g.__pcUploadTokens ??= new Map())

export async function createUploadUrl(path: string): Promise<string> {
  const s = supabase()
  if (s) {
    const { data, error } = await s.storage.from(env.storageBucket()).createSignedUploadUrl(path)
    if (error || !data) throw new Error(`アップロードURLの作成に失敗しました: ${error?.message}`)
    return data.signedUrl
  }
  const token = randomToken()
  localUploadTokens.set(sha256(token), { path, expires: Date.now() + 10 * 60 * 1000 })
  return `/api/uploads/local?token=${token}`
}

export function consumeLocalUploadToken(token: string): string | null {
  const key = sha256(token)
  const entry = localUploadTokens.get(key)
  localUploadTokens.delete(key)
  if (!entry || entry.expires < Date.now()) return null
  return entry.path
}

export async function writeLocal(path: string, data: Buffer) {
  const full = join(LOCAL_DIR, path)
  if (!full.startsWith(LOCAL_DIR)) throw new Error('invalid path')
  await mkdir(dirname(full), { recursive: true })
  await writeFile(full, data)
}

export async function readLocal(path: string): Promise<Buffer> {
  const full = join(LOCAL_DIR, path)
  if (!full.startsWith(LOCAL_DIR)) throw new Error('invalid path')
  return readFile(full)
}

/** 閲覧用URL（Supabaseは1時間有効の署名付きURL） */
export async function signedUrl(path: string, opts: { download?: string } = {}): Promise<string | null> {
  const s = supabase()
  if (s) {
    const { data, error } = await s.storage
      .from(env.storageBucket())
      .createSignedUrl(path, 3600, opts.download ? { download: opts.download } : undefined)
    if (error || !data) return null
    return data.signedUrl
  }
  return null
}

export async function objectExists(path: string): Promise<boolean> {
  const s = supabase()
  if (s) {
    const { data } = await s.storage.from(env.storageBucket()).exists(path)
    return !!data
  }
  try {
    await readLocal(path)
    return true
  } catch {
    return false
  }
}

export async function removeObjects(paths: string[]) {
  if (paths.length === 0) return
  const s = supabase()
  if (s) {
    await s.storage.from(env.storageBucket()).remove(paths)
    return
  }
  await Promise.all(paths.map((p) => rm(join(LOCAL_DIR, p), { force: true })))
}
