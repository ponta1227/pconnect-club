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
  // どの曜日にテストを実行しても「きょうの練習」を参加曜日にできるよう、日曜の練習枠も足しておく
  const db = postgres(url, { max: 1, onnotice: () => {} })
  await db`insert into practice_slots (weekday, venue_id, start_time, end_time)
    select 0, id, '09:00', '12:00' from venues where name = '朝霞市総合体育館' on conflict (weekday) do nothing`
  await db.end()
}
