-- 全体チャット: 加入した大人（保護者・家族・スタッフ）全員が自動で入り、抜けられない
alter table chat_rooms add column is_everyone boolean not null default false;
create unique index chat_rooms_one_everyone on chat_rooms (is_everyone) where is_everyone;

insert into chat_rooms (name, is_everyone)
select '全体チャット', true where not exists (select 1 from chat_rooms where is_everyone);

insert into chat_members (room_id, profile_id)
select r.id, p.id from chat_rooms r cross join profiles p
where r.is_everyone and p.account_kind = 'adult' and p.deleted_at is null
on conflict do nothing;

-- 新しく大人のアカウントができたら、自動で全体チャットに入れる
create or replace function join_everyone_chat() returns trigger language plpgsql as $$
begin
  if new.account_kind = 'adult' and new.deleted_at is null then
    insert into chat_members (room_id, profile_id)
    select id, new.id from chat_rooms where is_everyone
    on conflict do nothing;
  end if;
  return new;
end $$;

create trigger profiles_join_everyone_chat after insert or update of account_kind, deleted_at on profiles
  for each row execute function join_everyone_chat();
