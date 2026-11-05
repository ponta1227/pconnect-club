-- P-CONNECT Jr. 連絡アプリ 初期スキーマ
-- すべてのテーブルでRLSを有効化し、ポリシーは作らない（= anon / authenticated からは一切読めない）。
-- アプリはサーバー側から postgres ロール（DATABASE_URL）で接続し、認可はサーバーコード（src/lib/access.ts ほか）で行う。

create extension if not exists pg_trgm;

-- ---------------------------------------------------------------- アカウント
create table profiles (
  id uuid primary key default gen_random_uuid(),
  line_user_id text unique,
  display_name text not null,
  avatar_url text,
  email text,
  email_verified boolean not null default false,
  role text not null default 'member' check (role in ('admin', 'member')),
  account_kind text not null default 'adult' check (account_kind in ('adult', 'child')),
  terms_agreed_at timestamptz,
  onboarded_at timestamptz,
  font_size text not null default 'normal' check (font_size in ('normal', 'large')),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table sessions (
  token_hash text primary key,
  profile_id uuid not null references profiles on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index sessions_profile_idx on sessions (profile_id);

-- ---------------------------------------------------------------- 名簿
create table classes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

-- grade: 1-6=小1-6, 7-9=中1-3, 10-12=高1-3, 0=その他
create table children (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  kana text not null default '',
  grade int not null default 0 check (grade between 0 and 12),
  status text not null default 'active' check (status in ('active', 'left', 'graduated')),
  left_at timestamptz,
  created_at timestamptz not null default now()
);
create index children_kana_idx on children (kana);

create table child_classes (
  child_id uuid not null references children on delete cascade,
  class_id uuid not null references classes on delete cascade,
  primary key (child_id, class_id)
);

create table guardian_children (
  profile_id uuid not null references profiles on delete cascade,
  child_id uuid not null references children on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved')),
  via text not null default 'roster' check (via in ('roster', 'family_invite', 'admin')),
  approved_by uuid references profiles on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (profile_id, child_id)
);
create index guardian_children_child_idx on guardian_children (child_id);

create table child_accounts (
  profile_id uuid primary key references profiles on delete cascade,
  child_id uuid not null references children on delete cascade,
  issued_by uuid references profiles on delete set null,
  status text not null default 'pending' check (status in ('pending', 'active', 'revoked')),
  approved_by uuid references profiles on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);
-- 1人の子につき有効な子どもアカウントは1つ
create unique index child_accounts_one_per_child on child_accounts (child_id) where status in ('pending', 'active');

-- kind=club: クラブ招待（再利用可、失効まで有効）
-- kind=family: 家族招待（1回限り、child_ids に自動で紐づく）
-- kind=child: 子どもアカウント招待（1回限り、child_ids[1] の本人、管理者承認が必要）
create table invites (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('club', 'family', 'child')),
  token_hash text not null unique,
  child_ids uuid[] not null default '{}',
  created_by uuid references profiles on delete set null,
  consent_at timestamptz,
  used_at timestamptz,
  used_by uuid references profiles on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- 予定
create table venues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text not null default '',
  note text not null default '',
  sort int not null default 0,
  created_at timestamptz not null default now()
);

create table event_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#1E6FD9',
  uses_rsvp boolean not null default false,
  uses_arrival boolean not null default false,
  remind boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

create table event_series (
  id uuid primary key default gen_random_uuid(),
  freq text not null check (freq in ('weekly', 'monthly')),
  weekdays int[] not null default '{}',
  month_day int,
  until_date date,
  occurrence_count int,
  created_at timestamptz not null default now()
);

create table events (
  id uuid primary key default gen_random_uuid(),
  type_id uuid not null references event_types,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean not null default false,
  venue_id uuid references venues on delete set null,
  venue_text text not null default '',
  note text not null default '',
  meet_time text not null default '',
  meet_place text not null default '',
  fee_note text not null default '',
  member_deadline timestamptz,
  entry_deadline timestamptz,
  capacity int check (capacity is null or capacity > 0),
  allow_companions boolean not null default false,
  status text not null default 'active' check (status in ('active', 'cancelled')),
  series_id uuid references event_series on delete set null,
  reminded_3d_at timestamptz,
  reminded_1d_at timestamptz,
  created_by uuid references profiles on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index events_starts_idx on events (starts_at);
create index events_series_idx on events (series_id);
create index events_title_trgm on events using gin (title gin_trgm_ops);
create index events_note_trgm on events using gin (note gin_trgm_ops);

create table event_classes (
  event_id uuid not null references events on delete cascade,
  class_id uuid not null references classes on delete cascade,
  primary key (event_id, class_id)
);

create table rsvps (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events on delete cascade,
  child_id uuid not null references children on delete cascade,
  companions int not null default 0 check (companions between 0 and 20),
  status text not null default 'going' check (status in ('going', 'waitlist')),
  paid boolean not null default false,
  payment_note text not null default '',
  created_by uuid references profiles on delete set null,
  created_at timestamptz not null default now(),
  unique (event_id, child_id)
);

create table arrivals (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events on delete cascade,
  child_id uuid not null references children on delete cascade,
  arrived_at timestamptz not null default now(),
  source text not null check (source in ('kiosk', 'manual')),
  created_by uuid references profiles on delete set null,
  cancelled_at timestamptz
);
create unique index arrivals_one_active on arrivals (event_id, child_id) where cancelled_at is null;
create index arrivals_child_idx on arrivals (child_id);

create table absence_reports (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events on delete cascade,
  child_id uuid not null references children on delete cascade,
  kind text not null check (kind in ('absent', 'late', 'early')),
  at_time text not null default '',
  reason text not null default '',
  reported_by uuid references profiles on delete set null,
  reporter_kind text not null default 'adult' check (reporter_kind in ('adult', 'child', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, child_id)
);

-- ---------------------------------------------------------------- 掲示板
create table posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null default '',
  pinned boolean not null default false,
  pinned_at timestamptz,
  urgent boolean not null default false,
  published_at timestamptz,
  created_by uuid references profiles on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index posts_published_idx on posts (published_at desc);
create index posts_title_trgm on posts using gin (title gin_trgm_ops);
create index posts_body_trgm on posts using gin (body gin_trgm_ops);

create table post_classes (
  post_id uuid not null references posts on delete cascade,
  class_id uuid not null references classes on delete cascade,
  primary key (post_id, class_id)
);

create table post_reads (
  post_id uuid not null references posts on delete cascade,
  profile_id uuid not null references profiles on delete cascade,
  read_at timestamptz not null default now(),
  primary key (post_id, profile_id)
);

create table post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts on delete cascade,
  profile_id uuid references profiles on delete set null,
  body text not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index post_comments_post_idx on post_comments (post_id, created_at);

create table post_reactions (
  post_id uuid not null references posts on delete cascade,
  profile_id uuid not null references profiles on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (post_id, profile_id, emoji)
);

-- ---------------------------------------------------------------- チャット
create table chat_rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references profiles on delete set null,
  created_at timestamptz not null default now()
);

create table chat_members (
  room_id uuid not null references chat_rooms on delete cascade,
  profile_id uuid not null references profiles on delete cascade,
  muted boolean not null default false,
  last_read_at timestamptz not null default now(),
  last_push_at timestamptz,
  joined_at timestamptz not null default now(),
  primary key (room_id, profile_id)
);
create index chat_members_profile_idx on chat_members (profile_id);

create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references chat_rooms on delete cascade,
  sender_id uuid references profiles on delete set null,
  body text not null default '',
  reply_to uuid references chat_messages on delete set null,
  mentions uuid[] not null default '{}',
  poll_id uuid,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index chat_messages_room_idx on chat_messages (room_id, created_at);
create index chat_messages_body_trgm on chat_messages using gin (body gin_trgm_ops);

create table chat_notes (
  room_id uuid primary key references chat_rooms on delete cascade,
  body text not null default '',
  updated_by uuid references profiles on delete set null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- アンケート・投票
create table polls (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null check (owner_type in ('post', 'room')),
  owner_id uuid not null,
  question text not null,
  kind text not null default 'normal' check (kind in ('normal', 'schedule')),
  multiple boolean not null default false,
  anonymous boolean not null default false,
  closes_at timestamptz,
  closed_at timestamptz,
  reminded_at timestamptz,
  converted_event_id uuid references events on delete set null,
  created_by uuid references profiles on delete set null,
  created_at timestamptz not null default now()
);
create index polls_owner_idx on polls (owner_type, owner_id);
create index polls_question_trgm on polls using gin (question gin_trgm_ops);

create table poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references polls on delete cascade,
  label text not null,
  starts_at timestamptz,
  sort int not null default 0
);

-- 誰が回答済みか（匿名投票でも回答者の重複防止と催促に使う。選択内容とは結びつけない）
create table poll_voters (
  poll_id uuid not null references polls on delete cascade,
  profile_id uuid not null references profiles on delete cascade,
  voted_at timestamptz not null default now(),
  primary key (poll_id, profile_id)
);

-- 匿名投票では profile_id を保存しない
create table poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references polls on delete cascade,
  option_id uuid not null references poll_options on delete cascade,
  profile_id uuid references profiles on delete set null,
  value text not null default 'yes' check (value in ('yes', 'maybe', 'no'))
);
create index poll_votes_poll_idx on poll_votes (poll_id);

-- ---------------------------------------------------------------- 写真・ファイル
create table attachments (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('photo', 'pdf')),
  storage_path text not null unique,
  file_name text not null default '',
  mime text not null,
  size int not null,
  owner_type text check (owner_type in ('post', 'event', 'message', 'album', 'document')),
  owner_id uuid,
  uploaded boolean not null default false,
  created_by uuid references profiles on delete set null,
  created_at timestamptz not null default now()
);
create index attachments_owner_idx on attachments (owner_type, owner_id);

create table albums (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  event_id uuid references events on delete set null,
  created_by uuid references profiles on delete set null,
  created_at timestamptz not null default now()
);

create table documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  attachment_id uuid references attachments on delete set null,
  created_by uuid references profiles on delete set null,
  created_at timestamptz not null default now()
);
create index documents_title_trgm on documents using gin (title gin_trgm_ops);

create table document_classes (
  document_id uuid not null references documents on delete cascade,
  class_id uuid not null references classes on delete cascade,
  primary key (document_id, class_id)
);

-- ---------------------------------------------------------------- 通知
create table notification_settings (
  profile_id uuid not null references profiles on delete cascade,
  kind text not null,
  push boolean not null,
  email boolean not null,
  primary key (profile_id, kind)
);

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

-- 静かな時間帯（22:00-07:00）に保留したプッシュ
create table notification_queue (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  url text not null default '/',
  send_after timestamptz not null,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index notification_queue_pending_idx on notification_queue (send_after) where sent_at is null;

create table email_verifications (
  token_hash text primary key,
  profile_id uuid not null references profiles on delete cascade,
  email text not null,
  expires_at timestamptz not null
);

-- ---------------------------------------------------------------- 設定・キオスク
create table app_settings (
  id int primary key default 1 check (id = 1),
  kiosk_pin_hash text,
  last_promotion_year int,
  updated_at timestamptz not null default now()
);
insert into app_settings (id) values (1);

create table kiosk_sessions (
  token_hash text primary key,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table rate_limits (
  key text not null,
  created_at timestamptz not null default now()
);
create index rate_limits_key_idx on rate_limits (key, created_at);

-- ---------------------------------------------------------------- RLS（すべて拒否）
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
