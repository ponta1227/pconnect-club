import 'server-only'
import postgres, { type Sql } from 'postgres'

// Supabase の接続プーラー（transaction モード）でも動くよう prepare: false。
const globalForDb = globalThis as unknown as { __pcSql?: Sql }

function create(): Sql {
  const url = process.env.DATABASE_URL
  const options = {
    prepare: false,
    max: process.env.VERCEL ? 3 : 10,
    idle_timeout: 20,
    onnotice: () => {},
  }
  return url ? postgres(url, options) : postgres(options)
}

export const sql: Sql = globalForDb.__pcSql ?? create()
if (process.env.NODE_ENV !== 'production') globalForDb.__pcSql = sql
