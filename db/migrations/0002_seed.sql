-- 初期データ（現行BAND運用より）
insert into event_types (name, color, uses_rsvp, uses_arrival, remind, sort) values
  ('練習', '#1E6FD9', false, true, false, 1),
  ('大会', '#D93B3B', true, false, true, 2),
  ('イベント', '#2E9E5B', true, false, true, 3);

insert into venues (name, note, sort) values
  ('朝霞市総合体育館', '月・火・木・金 18:30–20:30', 1),
  ('大和中', '水 19:00–20:30', 2),
  ('志木市民体育館', '土 18:30–20:30', 3);
