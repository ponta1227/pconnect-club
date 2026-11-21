import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { agreeTerms, finishOnboarding } from '@/app/actions/account'
import { markFormSubmitted, markPaymentReported } from '@/app/actions/enroll'
import { enrollState, enrollSteps, type EnrollStep } from '@/lib/enroll'
import { practiceSlots } from '@/lib/schedule'
import { sql } from '@/lib/db'
import { InitialCredits, NewChildForm, WeekdayPicker, type SetupKid } from '@/components/enroll'
import { PushToggle } from '@/components/push'
import { Logo } from '@/components/logo'
import { InstallGuide } from '@/components/install-guide'
import { ClubGuideBody } from '@/components/club-guide'
import { clubGuide, parseGuide } from '@/lib/guide'
import { confirmGuide } from '@/app/actions/guide'

export const metadata = { title: 'はじめに' }

export default async function OnboardingPage({ searchParams }: PageProps<'/onboarding'>) {
  const user = await requireUser({ allowOnboarding: true, allowPending: true })
  const { step, error } = await searchParams
  if (user.termsAgreedAt && user.onboardedAt) redirect('/')

  // 1. 表示名と規約同意
  if (!user.termsAgreedAt) {
    return (
      <main className="mx-auto max-w-sm space-y-6 px-5 py-10">
        <div className="text-center">
          <Logo className="mx-auto h-14 w-14" />
          <h1 className="mt-3 text-xl font-bold">ようこそ</h1>
          <p className="mt-1 text-sm text-muted">はじめに、いくつか設定をお願いします。</p>
        </div>
        <form action={agreeTerms} className="card space-y-4 p-5">
          {user.isChild ? (
            <p className="text-sm">
              <b>{user.childAccount?.childName}</b> さんのアカウントです。
            </p>
          ) : (
            <label className="block">
              <span className="label">表示名</span>
              <input name="displayName" className="input" defaultValue={user.displayName} maxLength={40} required />
              <span className="hint block">クラブ内で表示される名前です（フルネーム推奨。例: 山田花子（太郎の母））</span>
            </label>
          )}
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="agree" className="mt-1 h-5 w-5" required />
            <span>
              <Link href="/terms" target="_blank" className="text-brand underline">利用規約</Link>と
              <Link href="/privacy" target="_blank" className="text-brand underline">プライバシーポリシー</Link>に同意します
            </span>
          </label>
          {error && <p className="text-sm text-danger">入力内容を確認してください。</p>}
          <button className="btn-primary w-full">次へ</button>
        </form>
      </main>
    )
  }

  // 2以降. 招待の種類（BANDから移行／新規入会）で手順が変わる
  const enroll = await enrollState(user.id)
  const steps = user.isChild ? (['notify'] as EnrollStep[]) : enrollSteps(enroll)
  const current: EnrollStep = steps.includes(step as EnrollStep) ? (step as EnrollStep) : steps[0]
  const total = steps.length + 1
  const no = steps.indexOf(current) + 2
  const nextHref = (s: EnrollStep) => `/onboarding?step=${steps[Math.min(steps.length - 1, steps.indexOf(s) + 1)]}`
  const head = (title: string, lead: string) => (
    <div>
      <p className="text-xs font-bold text-brand">
        ステップ {no} / {total}
      </p>
      <h1 className="mt-1 text-xl font-bold">{title}</h1>
      <p className="mt-1 text-sm text-muted">{lead}</p>
    </div>
  )

  // Googleフォーム
  if (current === 'form') {
    return (
      <main className="mx-auto max-w-sm space-y-5 px-5 py-10">
        {head('入会の申込みフォーム', 'クラブに必要な情報（連絡先など）を、Googleフォームで送ってください。送信したら、この画面に戻って「送信しました」を押します。')}
        <a href={enroll.formUrl} target="_blank" rel="noopener noreferrer" className="btn-primary h-13 w-full text-base">
          Googleフォームを開く
        </a>
        <form action={markFormSubmitted}>
          <button className="btn-secondary w-full">{enroll.formSubmitted ? '次へ' : '送信しました'}</button>
        </form>
        <p className="text-center text-xs text-muted">フォームは別のタブで開きます。</p>
      </main>
    )
  }

  // 決済（新規入会のみ）
  if (current === 'payment') {
    return (
      <main className="mx-auto max-w-sm space-y-5 px-5 py-10">
        {head('お支払い', '決済ページで支払い方法を登録してください。済んだら、この画面に戻って「支払い方法を登録しました」を押します。')}
        <a href={enroll.paymentUrl} target="_blank" rel="noopener noreferrer" className="btn-primary h-13 w-full text-base">
          決済ページを開く
        </a>
        <form action={markPaymentReported}>
          <button className="btn-secondary w-full">{enroll.paymentReported ? '次へ' : '支払い方法を登録しました'}</button>
        </form>
        <p className="text-center text-xs text-muted">お支払いはクラブの管理者が確認します。</p>
      </main>
    )
  }

  // クラブのご案内（最後まで読んで「確認しました」）
  if (current === 'guide') {
    const guide = await clubGuide()
    return (
      <main className="mx-auto max-w-xl space-y-5 px-5 py-10">
        {head('クラブのご案内', '練習の持ち物やルールです。最後まで読んで、いちばん下の「確認しました」を押してください。あとから「その他 → クラブのご案内」でいつでも見られます。')}
        <ClubGuideBody blocks={parseGuide(guide.text)} />
        <form action={confirmGuide.bind(null, true)}>
          <button className="btn-primary h-13 w-full text-base">確認しました</button>
        </form>
      </main>
    )
  }

  // お子さんの登録と参加曜日
  if (current === 'children') {
    const slots = await practiceSlots()
    const kids = await setupKids(user.id)
    const slotList = slots.map((s) => ({ weekday: s.weekday, label: `${s.start_time}〜` }))
    const ready = kids.length > 0 && kids.every((k) => k.weekdays.length > 0) && (enroll.route !== 'existing' || kids.every((k) => k.declared))
    return (
      <main className="mx-auto max-w-sm space-y-5 px-5 py-10">
        {head(
          'お子さんと参加曜日',
          'お子さんの名前を入力して登録し、参加する曜日を選んでください。クラブの管理者が確認すると、到着の通知などが届くようになります。',
        )}
        <NewChildForm />
        {kids.map((k) => (
          <section key={k.id} className="card space-y-3 p-4">
            <p className="font-bold">
              {k.full_name}
              {k.status === 'pending' && <span className="chip-muted ml-2 text-xs">承認待ち</span>}
            </p>
            <WeekdayPicker kid={k} slots={slotList} />
            {enroll.route === 'existing' && <InitialCredits kid={k} />}
          </section>
        ))}
        {ready || !enroll.route ? (
          <Link href={nextHref('children')} className="btn-primary w-full">次へ</Link>
        ) : (
          <>
            <Link href={nextHref('children')} className="btn-secondary w-full">あとで設定して次へ</Link>
            <p className="text-center text-xs text-muted">参加曜日{enroll.route === 'existing' && '・振替の回数'}は、あとから「その他 → お子さん・家族の管理」でも設定できます。</p>
          </>
        )}
        {!enroll.route && <p className="text-center text-xs text-muted">コーチなどでお子さんがいない場合も「次へ」で進めます。</p>}
      </main>
    )
  }

  // 通知とホーム画面追加の案内
  return (
    <main className="mx-auto max-w-sm space-y-5 px-5 py-10">
      {head('通知を受け取る', 'ホーム画面に追加してから通知をオンにすると、到着のお知らせなどがすぐ届きます。')}
      <InstallGuide />
      <div className="card p-4">
        <PushToggle />
      </div>
      <form action={finishOnboarding}>
        <button className="btn-primary w-full">はじめる</button>
      </form>
    </main>
  )
}

/** 保護者が申請・登録したお子さん（承認待ちも含む）と、参加曜日・振替の申告状況 */
async function setupKids(profileId: string): Promise<SetupKid[]> {
  return sql<SetupKid[]>`
    select c.id, c.full_name, c.weekdays, gc.status,
      exists (select 1 from makeup_credits m where m.child_id = c.id and m.reason = 'initial') as declared
    from guardian_children gc join children c on c.id = gc.child_id
    where gc.profile_id = ${profileId} and c.status = 'active'
    order by gc.created_at`
}
