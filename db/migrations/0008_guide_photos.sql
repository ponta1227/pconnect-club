-- クラブのご案内: ダイソーの網のURLを差し替え、ラバー摩耗の写真2枚を入れる
update app_settings set guide_text = replace(replace(replace(guide_text,
  'https://jp.daisonet.com/products/4550480770017', 'https://jp.daisonet.com/products/4550480341224'),
  'https://jp.daisonet.com/products/4550480736334', 'https://jp.daisonet.com/products/4550480500904'),
  '摩耗による寿命のサインです。そろそろ交換しましょう。斑点がはっきり見えるようになったら、なるべく早めに交換してください（できればその前に交換したいところです）。',
  '摩耗による寿命のサインです。そろそろ交換しましょう。

![斑点がうっすら浮かんできた状態（そろそろ交換）](/guide/rubber-wear-early.jpg)

斑点がはっきり見えるようになったら、なるべく早めに交換してください（できればその前に交換したいところです）。

![斑点がはっきり見える状態（早めに交換）](/guide/rubber-wear-late.jpg)')
where id = 1;
