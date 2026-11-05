import { execFileSync } from 'node:child_process'
import postgres from 'postgres'

// テスト用DBを空にしてマイグレーションを流し直す
export default async function globalSetup() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgres://app:app@localhost:5432/pconnect_test'
  if (!/test/.test(url)) throw new Error('TEST_DATABASE_URL にはテスト用DB（名前に test を含む）を指定してください')
  const sql = postgres(url, { max: 1, onnotice: () => {} })
  await sql.unsafe('drop schema if exists public cascade; create schema public;')
  await sql.end()
  execFileSync('npx', ['tsx', 'scripts/migrate.ts'], { env: { ...process.env, DATABASE_URL: url }, stdio: 'inherit' })
}
