-- 再設計（2026-11）: 使い勝手の作り直しに伴う追加

-- 参加の回答に「見送り」を追加（未回答と区別して、催促を止められるようにする）
alter table rsvps drop constraint rsvps_status_check;
alter table rsvps add constraint rsvps_status_check check (status in ('going', 'waitlist', 'declined'));

-- 掲示板の投稿に予定を添付（大会の登録と告知を1回で行う）
alter table posts add column event_id uuid references events on delete set null;
create index posts_event_idx on posts (event_id);

-- いつもの練習日程（曜日ごとの会場・時間）。練習プランナーの元になる
create table practice_slots (
  id uuid primary key default gen_random_uuid(),
  weekday int not null check (weekday between 0 and 6),
  venue_id uuid references venues on delete set null,
  start_time text not null check (start_time ~ '^\d{2}:\d{2}$'),
  end_time text not null check (end_time ~ '^\d{2}:\d{2}$'),
  created_at timestamptz not null default now(),
  unique (weekday)
);
alter table practice_slots enable row level security;

insert into practice_slots (weekday, venue_id, start_time, end_time)
select d.weekday, v.id, d.start_time, d.end_time
from (values
  (1, '朝霞市総合体育館', '18:30', '20:30'),
  (2, '朝霞市総合体育館', '18:30', '20:30'),
  (3, '大和中', '19:00', '20:30'),
  (4, '朝霞市総合体育館', '18:30', '20:30'),
  (5, '朝霞市総合体育館', '18:30', '20:30'),
  (6, '志木市民体育館', '18:30', '20:30')
) as d(weekday, venue_name, start_time, end_time)
join venues v on v.name = d.venue_name;
