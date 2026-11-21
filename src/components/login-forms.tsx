'use client'

import { useActionState } from 'react'
import { loginWithPassword, sendLoginCode, verifyLoginCode, type LoginFormState } from '@/app/actions/login'

function ErrorText({ state }: { state: LoginFormState }) {
  return state?.error ? (
    <p role="alert" className="rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn">
      {state.error}
    </p>
  ) : null
}

/** メールアドレスを入れて確認コードを送る（招待から来た新しい人は名前も） */
export function EmailStartForm({ invite, askName }: { invite: string | null; askName: boolean }) {
  const [state, action, pending] = useActionState(sendLoginCode, null)
  return (
    <form action={action} className="space-y-4">
      {invite && <input type="hidden" name="invite" value={invite} />}
      {askName && (
        <label className="block space-y-1">
          <span className="text-sm font-bold">お名前（保護者の方）</span>
          <input name="name" defaultValue={state?.name} key={`n${state?.name}`} className="input" autoComplete="name" placeholder="例：山田 花子" required maxLength={40} />
          <span className="hint">クラブの中で表示されます。はじめて参加するときだけ入力します。</span>
        </label>
      )}
      <label className="block space-y-1">
        <span className="text-sm font-bold">メールアドレス</span>
        <input name="email" defaultValue={state?.email} key={`e${state?.email}`} type="email" inputMode="email" autoComplete="email" className="input" required />
      </label>
      <ErrorText state={state} />
      <button className="btn-primary w-full" disabled={pending}>
        {pending ? '送っています…' : '確認コードを送る'}
      </button>
    </form>
  )
}

export function EmailCodeForm() {
  const [state, action, pending] = useActionState(verifyLoginCode, null)
  return (
    <form action={action} className="space-y-4">
      <label className="block space-y-1">
        <span className="text-sm font-bold">確認コード（6桁）</span>
        <input
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]*"
          maxLength={7}
          className="input num text-center text-2xl tracking-[0.3em]"
          required
          autoFocus
        />
      </label>
      <ErrorText state={state} />
      <button className="btn-primary w-full" disabled={pending}>
        {pending ? '確かめています…' : 'ログイン'}
      </button>
    </form>
  )
}

export function KidLoginForm() {
  const [state, action, pending] = useActionState(loginWithPassword, null)
  return (
    <form action={action} className="space-y-4">
      <label className="block space-y-1">
        <span className="text-sm font-bold">ログインID</span>
        <input name="login_id" defaultValue={state?.loginId} key={`l${state?.loginId}`} className="input" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} required />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-bold">パスワード</span>
        <input name="password" type="password" className="input" autoComplete="current-password" required />
      </label>
      <ErrorText state={state} />
      <button className="btn-primary w-full" disabled={pending}>
        {pending ? '確かめています…' : 'ログイン'}
      </button>
    </form>
  )
}
