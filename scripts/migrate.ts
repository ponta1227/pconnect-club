// 使い方: DATABASE_URL=... npx tsx scripts/migrate.ts
// db/migrations/*.sql を名前順に1回ずつ適用する。
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import postgres from 'postgres'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL が設定されていません')
  process.exit(1)
}

const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} })
const dir = join(process.cwd(), 'db', 'migrations')

async function main() {
  await sql`create table if not exists schema_migrations (version text primary key, applied_at timestamptz not null default now())`
  await sql`alter table schema_migrations enable row level security`
  const applied = new Set((await sql<{ version: string }[]>`select version from schema_migrations`).map((r) => r.version))
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
  for (const file of files) {
    if (applied.has(file)) continue
    const body = readFileSync(join(dir, file), 'utf8')
    await sql.begin(async (tx) => {
      await tx.unsafe(body)
      await tx`insert into schema_migrations (version) values (${file})`
    })
    console.log(`applied ${file}`)
  }
  console.log('migrations up to date')
  await sql.end()
}

main().catch(async (e) => {
  console.error(e)
  await sql.end()
  process.exit(1)
})
