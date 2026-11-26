-- ほかの端末でも同じアカウントを使うための、1回だけ使えるログイン用リンク（30分で切れる）
create table login_links (
  token_hash text primary key,
  profile_id uuid not null references profiles on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);
create index login_links_profile_idx on login_links (profile_id);
alter table login_links enable row level security;
