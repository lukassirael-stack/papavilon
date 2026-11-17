-- ════════════════════════════════════════════════════════════════════
--  Velká Vánoční jízda 2026 — obsah 2. kapitoly (tajenka MÁM ČAJ)
--  Vloží se jen do prázdné kapitoly; texty pak upravíš ve /sprava.
-- ════════════════════════════════════════════════════════════════════

update public.omg_kapitoly set
  uvod = 'Vítejte zpátky, poutníci! Zapaluji druhou svíčku. Cestu už znáte: u každého znamení najděte číslo, vyhledejte ho dole v mé abecedě a písmeno nad ním zapište do políčka. Dnes na vás čeká šest písmen a druhá část mého poselství.'
where hra = 'vanocni-jizda-2026' and poradi = 2;

insert into public.omg_stanoviste (kapitola_id, poradi, typ, nazev, misto, zadani, znameni, odpovedi)
select k.id, v.poradi, v.typ, v.nazev, v.misto, v.zadani, v.znameni::jsonb, v.odpovedi
from public.omg_kapitoly k
cross join (values
  (1, 'znameni', 'Velké náměstí', 'Mariánský sloup',
   'Vraťte se ke sloupu uprostřed Velkého náměstí. Tentokrát si prohlédněte jeho sochy i erb, který už znáte.',
   '[{"id":"z1","pismeno":"J","odpovedi":["10","deset"],"zadani":"Spočítejte všechny sochy na sloupu, i tu na vrcholu. Jejich počet vynásobte (× krát) počtem orlů v erbu."},
     {"id":"z2","pismeno":"C","odpovedi":["3","tři"],"zadani":"Od soch na nárožích sloupu odečtěte sochu na vrcholu. Spočítejte si i všechna zvířata v erbu, ještě se budou hodit."}]',
   '{}'::text[]),
  (2, 'znameni', 'Milíčovo náměstí', null,
   'Na Milíčově náměstí stojí kašna a na ní váza ozdobená zelenými listy.',
   '[{"id":"z1","pismeno":"M","odpovedi":["13","třináct"],"zadani":"Spočítejte zelené listy v jedné řadě na váze. Odečtěte od nich všechna zvířata z erbu na Mariánském sloupu."}]',
   '{}'::text[]),
  (3, 'znameni', 'Riegrovo náměstí', 'Kostel Panenky Marie',
   'Na Riegrově náměstí stojí kostel Panenky Marie. Dojděte až k němu a zvedněte oči ke střeše.',
   '[{"id":"z1","pismeno":"A","odpovedi":["1","jedna"],"zadani":"Kolik věží má kostel?"}]',
   '{}'::text[]),
  (4, 'znameni', 'Komenského náměstí', null,
   'Školu se zlatým nápisem už znáte. Dnes vám poradí její okna a ten, kdo před ní stojí.',
   '[{"id":"z1","pismeno":"M","odpovedi":["13","třináct"],"zadani":"Spočítejte velká okna na průčelí školy. Obě číslice výsledku pak sečtěte."},
     {"id":"z2","pismeno":"A","odpovedi":["1","jedna"],"zadani":"Kolik soch stojí před školou?"}]',
   '{}'::text[]),
  (5, 'tajenka', 'Papavilonovo poselství', null,
   'Máte šest písmen. Posouvejte je doleva a doprava, až z nich složíte dvě slova, druhou část mého poselství.',
   '[]',
   array['MÁM ČAJ', 'MÁMČAJ'])
) as v(poradi, typ, nazev, misto, zadani, znameni, odpovedi)
where k.hra = 'vanocni-jizda-2026' and k.poradi = 2
  and not exists (select 1 from public.omg_stanoviste s where s.kapitola_id = k.id);
