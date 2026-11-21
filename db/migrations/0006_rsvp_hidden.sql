-- 大会・イベントを「やること」から非表示にする（見送るボタンの代わり）。
-- 回答（rsvps）は変えない。あとで予定から「参加する」を押せばよい。
create table rsvp_hidden (
  profile_id uuid not null references profiles on delete cascade,
  event_id uuid not null references events on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, event_id)
);
alter table rsvp_hidden enable row level security;
