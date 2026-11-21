-- 練習の種類
-- ・いつもの練習の曜日ごとに mode を持つ:
--     regular = 参加曜日として選べる（その曜日は自動で参加）
--     dropin  = 参加曜日にはできず、都度「参加する」を押す（金曜日など）
--     self    = 自主練（場所だけあり、自分たちで練習。都度参加・振替は使わない）
-- ・個々の練習の予定に self_practice（自主練）を持つ
alter table practice_slots add column mode text not null default 'regular' check (mode in ('regular', 'dropin', 'self'));
update practice_slots set mode = 'dropin' where weekday = 5;

alter table events add column self_practice boolean not null default false;

-- 金曜日はもう参加曜日にできない
update children set weekdays = array_remove(weekdays, 5) where 5 = any(weekdays);
