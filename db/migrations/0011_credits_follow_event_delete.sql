-- 練習の予定を削除したら、その練習でたまった振替・使った振替も消す（使った分は戻る）。
-- 以前は event_id が空になって振替だけが残っていた。
create or replace function drop_event_credits() returns trigger language plpgsql as $$
begin
  delete from makeup_credits where event_id = old.id;
  return old;
end $$;

create trigger events_drop_credits before delete on events
  for each row execute function drop_event_credits();

-- すでに残ってしまっている分（予定が消えた振替）を片付ける。移行時の申告・管理者の調整は残す
delete from makeup_credits where event_id is null and reason in ('absent', 'no_show', 'club_cancel', 'used');
