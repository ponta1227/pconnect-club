import 'server-only'
import { sql } from './db'

export type EnrollStep = 'form' | 'payment' | 'guide' | 'children' | 'notify'
export type EnrollState = {
  route: 'existing' | 'new' | null
  formUrl: string
  paymentUrl: string
  formSubmitted: boolean
  paymentReported: boolean
  /** クラブのご案内が登録されているか */
  hasGuide: boolean
}

export async function enrollState(profileId: string): Promise<EnrollState> {
  const [row] = await sql<{ join_route: 'existing' | 'new' | null; form_submitted_at: Date | null; payment_reported_at: Date | null; form_url: string | null; payment_url: string | null; has_guide: boolean | null }[]>`
    select p.join_route, p.form_submitted_at, p.payment_reported_at, s.form_url, s.payment_url, (s.guide_text <> '') as has_guide
    from profiles p left join app_settings s on s.id = 1 where p.id = ${profileId}`
  return {
    route: row?.join_route ?? null,
    formUrl: row?.form_url ?? '',
    paymentUrl: row?.payment_url ?? '',
    formSubmitted: !!row?.form_submitted_at,
    paymentReported: !!row?.payment_reported_at,
    hasGuide: !!row?.has_guide,
  }
}

/** この保護者がたどる手順（URLが設定されていない手順は飛ばす） */
export function enrollSteps(s: EnrollState): EnrollStep[] {
  const steps: EnrollStep[] = []
  if (s.route && s.formUrl) steps.push('form')
  if (s.route === 'new' && s.paymentUrl) steps.push('payment')
  if (s.hasGuide) steps.push('guide')
  steps.push('children', 'notify')
  return steps
}

export async function nextEnrollStep(profileId: string, after: EnrollStep | null): Promise<EnrollStep> {
  const steps = enrollSteps(await enrollState(profileId))
  if (!after) return steps[0]
  const i = steps.indexOf(after)
  return steps[Math.min(steps.length - 1, i + 1)] ?? 'notify'
}
