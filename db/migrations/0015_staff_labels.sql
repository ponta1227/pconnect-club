-- 管理者のアカウントをコーチと共用するとき、どの端末（だれ）が書いたかを管理者だけが分かるようにする。
-- 端末（セッション）に「使う人の名前」を付け、掲示板・コメント・チャットを書いたときにその名前を控える。
alter table sessions add column label text;
alter table login_links add column label text;
alter table posts add column staff_label text;
alter table post_comments add column staff_label text;
alter table chat_messages add column staff_label text;
