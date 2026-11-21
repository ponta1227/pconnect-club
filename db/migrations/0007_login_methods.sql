-- LINE以外のログイン方法
-- ・保護者: メールアドレス（確認コード）
-- ・子ども: 保護者が決めるログインIDとパスワード
alter table profiles
  add column login_id text,
  add column password_hash text,
  add column failed_logins int not null default 0,
  add column locked_until timestamptz;

create unique index profiles_login_id_key on profiles (lower(login_id)) where login_id is not null;
-- 確認済みのメールアドレスは1人1つ（メールでログインするときの照合に使う）
create unique index profiles_verified_email_key on profiles (lower(email)) where email_verified and deleted_at is null;

-- メールで送る6桁の確認コード
create table email_codes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  code_hash text not null,
  invite_token text,
  display_name text,
  expires_at timestamptz not null,
  attempts int not null default 0,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index email_codes_email_idx on email_codes (lower(email), created_at desc);
alter table email_codes enable row level security;
