import { GRADE_OPTIONS } from '@/lib/grades'
import { saveChild } from '@/app/actions/admin'
import { SubmitButton } from './client'

type Opt = { id: string; name: string }

export function ChildForm({
  classes,
  initial,
}: {
  classes: Opt[]
  initial: { id?: string; full_name: string; kana: string; grade: number; class_ids: string[]; status: string }
}) {
  return (
    <form action={saveChild} className="card space-y-4 p-4">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <label className="block">
        <span className="label">氏名</span>
        <input name="full_name" className="input" defaultValue={initial.full_name} required maxLength={50} placeholder="山田 太郎" />
      </label>
      <label className="block">
        <span className="label">よみがな</span>
        <input name="kana" className="input" defaultValue={initial.kana} maxLength={50} placeholder="やまだ たろう" />
      </label>
      <label className="block">
        <span className="label">学年</span>
        <select name="grade" className="input" defaultValue={initial.grade}>
          {GRADE_OPTIONS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
        </select>
        <span className="hint block">毎年4月1日に自動で1つ上がります。</span>
      </label>
      {classes.length > 0 && (
        <div>
          <span className="label">クラス</span>
          <div className="flex flex-wrap gap-2">
            {classes.map((c) => (
              <label key={c.id} className="cursor-pointer">
                <input type="checkbox" name="class_ids" value={c.id} defaultChecked={initial.class_ids.includes(c.id)} className="peer sr-only" />
                <span className="badge min-h-9 border border-line bg-white px-3 text-sm peer-checked:border-brand peer-checked:bg-brand-soft peer-checked:text-brand">{c.name}</span>
              </label>
            ))}
          </div>
        </div>
      )}
      {initial.id && (
        <label className="block">
          <span className="label">在籍</span>
          <select name="status" className="input" defaultValue={initial.status}>
            <option value="active">在籍</option>
            <option value="left">在籍終了（退会）</option>
            <option value="graduated">卒業</option>
          </select>
          <span className="hint block">在籍終了にすると名簿・タブレット・通知から外れます。出席記録は残ります。</span>
        </label>
      )}
      <SubmitButton>保存</SubmitButton>
    </form>
  )
}
