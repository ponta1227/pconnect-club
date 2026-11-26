-- スタッフとの連絡チャット: 家族（同じ子の保護者どうし）ごとに1つ、管理者全員が入る。
-- 部屋の作成・メンバーの出し入れはアプリ側（src/lib/staff-chat.ts の syncStaffRooms）が自動で行う。
alter table chat_rooms add column is_staff boolean not null default false;
create index chat_rooms_staff_idx on chat_rooms (is_staff) where is_staff;
