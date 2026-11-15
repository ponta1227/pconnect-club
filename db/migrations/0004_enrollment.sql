-- 入会の流れ（BANDからの移行／新規）と、参加曜日・振替（2026-11）

-- 招待リンクを「BANDからの移行用」と「新規入会用」に分ける
alter table invites add column audience text not null default 'existing' check (audience in ('existing', 'new'));

-- 保護者ごとの入会の進み具合
alter table profiles
  add column join_route text check (join_route in ('existing', 'new')),
  add column form_submitted_at timestamptz,
  add column payment_reported_at timestamptz,
  add column payment_confirmed_at timestamptz;

-- 子どもの参加曜日（0=日〜6=土）。この曜日の練習は自動で「参加」
alter table children add column weekdays int[] not null default '{}';

-- 振替の出入り（残り回数 = delta の合計）
create table makeup_credits (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references children on delete cascade,
  event_id uuid references events on delete set null,
  delta int not null check (delta <> 0 or reason = 'initial'),
  reason text not null check (reason in ('absent', 'no_show', 'club_cancel', 'initial', 'used', 'admin')),
  note text not null default '',
  created_by uuid references profiles on delete set null,
  created_at timestamptz not null default now()
);
create index makeup_credits_child_idx on makeup_credits (child_id);
-- 1つの練習で、たまるのは1回まで・使うのも1回まで
create unique index makeup_credits_earn_uniq on makeup_credits (child_id, event_id) where delta > 0 and event_id is not null;
create unique index makeup_credits_use_uniq on makeup_credits (child_id, event_id) where delta < 0 and event_id is not null;
alter table makeup_credits enable row level security;

-- 参加曜日以外の練習への参加（振替を使う／週2日以上の人の追加参加）
create table practice_extras (
  event_id uuid not null references events on delete cascade,
  child_id uuid not null references children on delete cascade,
  uses_credit boolean not null default false,
  created_by uuid references profiles on delete set null,
  created_at timestamptz not null default now(),
  primary key (event_id, child_id)
);
alter table practice_extras enable row level security;

-- 入会の流れで開くGoogleフォームと決済ページ
alter table app_settings
  add column form_url text not null default '',
  add column payment_url text not null default '';
