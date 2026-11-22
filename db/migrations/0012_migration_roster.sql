-- BANDから移行する人の確認用の名簿（会費の支払い一覧の氏名）。
-- 移行用の招待で入った保護者がお子さんを登録するとき、苗字がこの名簿のだれとも合わなければ登録できない。空なら確認しない。
create table migration_roster (
  name text primary key,
  added_at timestamptz not null default now()
);
alter table migration_roster enable row level security;
