import 'server-only'
import { sql } from './db'
import { adminIds } from './access'
import { notify } from './notify'
import { fiscalYear, jstParts } from './time'

/**
 * 年度替わりの進級（4/1 以降に1年度1回）。学年を+1し、高3は「卒業」にして管理者に確認を依頼する。
 * クラスは変更しない。
 */
export async function runGradePromotion(opts: { force?: boolean; now?: Date } = {}) {
  const now = opts.now ?? new Date()
  const year = fiscalYear(now)
  const p = jstParts(now)
  const [setting] = await sql<{ last_promotion_year: number | null }[]>`select last_promotion_year from app_settings where id = 1`
  // 初回は「今年度は進級済み」として記録するだけ（導入時の名簿は現在の学年で登録されるため）
  if (setting.last_promotion_year == null && !opts.force) {
    await sql`update app_settings set last_promotion_year = ${year} where id = 1`
    return { promoted: 0, graduated: 0, skipped: true }
  }
  if (!opts.force && (setting.last_promotion_year ?? 0) >= year) return { promoted: 0, graduated: 0, skipped: true }
  if (!opts.force && !(p.month >= 4)) return { promoted: 0, graduated: 0, skipped: true }

  const result = await sql.begin(async (tx) => {
    const graduated = await tx<{ full_name: string }[]>`
      update children set status = 'graduated', left_at = now() where status = 'active' and grade = 12 returning full_name`
    const promoted = await tx`update children set grade = grade + 1 where status = 'active' and grade between 1 and 11`
    await tx`update app_settings set last_promotion_year = ${year}, updated_at = now() where id = 1`
    // 卒業した子の子どもアカウントは無効化
    const revoked = await tx<{ profile_id: string }[]>`update child_accounts set status = 'revoked' where status in ('pending', 'active')
      and child_id in (select id from children where status = 'graduated') returning profile_id`
    for (const r of revoked) {
      await tx`delete from sessions where profile_id = ${r.profile_id}`
      await tx`delete from chat_members where profile_id = ${r.profile_id}`
    }
    return { promoted: promoted.count, graduated: graduated.map((g) => g.full_name) }
  })

  if (result.graduated.length) {
    await notify(await adminIds(), 'approval', {
      title: '進級処理: 卒業の確認',
      body: `高3だった ${result.graduated.join('、')} さんを「卒業」にしました。続けて在籍する場合は名簿で「在籍」に戻してください`,
      url: '/admin/roster?status=graduated',
    })
  }
  return { promoted: result.promoted, graduated: result.graduated.length, skipped: false }
}
