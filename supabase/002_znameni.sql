-- ════════════════════════════════════════════════════════════════════
--  Outdoor Magic Games — znamení (tým najde číslo a zapíše jeho písmeno)
--  + obsah 1. kapitoly Velké Vánoční jízdy (tajenka KDYŽ NAJDU)
--  Spusť celé najednou v Supabase → SQL Editor. Jde spustit i opakovaně.
-- ════════════════════════════════════════════════════════════════════

-- ── Nový typ světla „znameni“ a místo pro jeho data ──────────────────
alter table public.omg_stanoviste add column if not exists znameni jsonb not null default '[]'::jsonb;
alter table public.omg_pokrok     add column if not exists znameni jsonb not null default '{}'::jsonb;
comment on column public.omg_stanoviste.znameni is 'Znamení na světle typu znameni: [{ id, pismeno, odpovedi[], zadani }]. Tým najde číslo, převede ho abecedou a zapíše písmeno; odpovedi = číslo řešení jako poznámka.';
comment on column public.omg_pokrok.znameni is 'Postup týmu na znameních světla: { z1: { pokusy, sviti, zkousene[] } }. Na každé znamení jsou 3 pokusy.';

alter table public.omg_stanoviste drop constraint if exists omg_stanoviste_typ_check;
alter table public.omg_stanoviste add constraint omg_stanoviste_typ_check
  check (typ in ('odpoved', 'info', 'krystal', 'znameni', 'tajenka'));

-- ── 1. kapitola: úvod ────────────────────────────────────────────────
update public.omg_kapitoly set
  uvod = 'Vítejte, poutníci! Já jsem Papavilon, zapaluji první svíčku a zvu vás do ulic Kroměříže. Na každém místě čekají znamení. U každého najděte číslo. Dole pod úkoly je moje abeceda: vyhledejte v ní své číslo a písmeno nad ním zapište do políčka u znamení. Správné písmeno se rozzáří. Na každé znamení máte tři pokusy, tak se dívejte pozorně a počítejte dvakrát. Z písmen nakonec složíte začátek mého poselství. A možná se stane i něco velmi krásného :-)'
where hra = 'vanocni-jizda-2026' and poradi = 1;

-- ── 1. kapitola: pět světel se znameními a tajenka ───────────────────
-- (vloží se jen do prázdné kapitoly; později vše upravíš ve /sprava → Obsah hry)
insert into public.omg_stanoviste (kapitola_id, poradi, typ, nazev, misto, zadani, napoveda, znameni, odpovedi)
select k.id, v.poradi, v.typ, v.nazev, v.misto, v.zadani, v.napoveda, v.znameni::jsonb, v.odpovedi
from public.omg_kapitoly k
cross join (values
  (1, 'znameni', 'Velké náměstí', null,
   'Tady začíná vaše cesta. Voda, kámen a světlo střeží první tři znamení.',
   'V erbu žijí lvi a orli. Lampy počítejte ty, které vyrůstají ze země.',
   '[{"id":"z1","pismeno":"D","odpovedi":["4","čtyři"],"zadani":"Obejděte kašnu a spočítejte její rohy."},
     {"id":"z2","pismeno":"D","odpovedi":["4","čtyři"],"zadani":"Na Mariánském sloupu uprostřed Velkého náměstí najděte kamenný erb. Kolik lvů v něm stojí? Zapište si i počet všech zvířat v erbu, ještě ho použijete."},
     {"id":"z3","pismeno":"Y","odpovedi":["25","dvacet pět"],"zadani":"Spočítejte lampy, které stojí na vlastní noze po celém náměstí."}]',
   '{}'::text[]),
  (2, 'znameni', 'Název v bronzu', 'Vodní ulice',
   'Kudy kdysi vcházeli lidé i voda, vedl starý vstup do města. Najděte Vodní ulici. Hned na jejím začátku leží název vstupu v bronzu pod vašima nohama.',
   'Desky jsou dvě a nesou stejný nápis. Sečtěte obě slova na jedné z nich.',
   '[{"id":"z1","pismeno":"J","odpovedi":["10","deset"],"zadani":"Najděte bronzovou desku v dlažbě a spočítejte písmena na jedné desce."}]',
   '{}'::text[]),
  (3, 'znameni', 'Strážce a zlato', 'Riegrovo náměstí',
   'Na Riegrově náměstí čekají dvě znamení. Jedno se třpytí zlatem na sloupu se sochami. Druhé hlídá strážce z říše vody nad kašnou, kterou najdete od sloupu směrem ke kostelu.',
   'Sloup obejděte celý dokola, zlato září ze všech stran. Zvířata z erbu máte zapsaná z Velkého náměstí.',
   '[{"id":"z1","pismeno":"N","odpovedi":["14","čtrnáct"],"zadani":"Najděte sloup se sochami. Spočítejte na něm postavy, které mají něco zlatého, třeba svatozář, kříž nebo berlu. K jejich počtu přičtěte všechna zvířata z erbu."},
     {"id":"z2","pismeno":"A","odpovedi":["1","jedna","jeden"],"zadani":"Od sloupu se vydejte směrem ke kostelu, až dojdete ke kašně. Kolik velkých ryb se nad ní tyčí?"}]',
   '{}'::text[]),
  (4, 'znameni', 'Kamenní mudrci', 'Justiční škola',
   'Tenhle dům hlídají kamenní mudrci. Každý z nich vám něco napoví.',
   'Sochy stojí nahoře mezi okny a ve výklencích s mušlí. Kamenné tváře v kruhu hledejte hned pod nápisem.',
   '[{"id":"z1","pismeno":"K","odpovedi":["11","jedenáct"],"zadani":"Sečtěte sochy na průčelí a kulatá okna se sklem."},
     {"id":"z2","pismeno":"Z","odpovedi":["26","dvacet šest"],"zadani":"Spočítejte písmena nápisu na průčelí a vynásobte je počtem kamenných tváří v kruhu."}]',
   '{}'::text[]),
  (5, 'znameni', 'Škola základ života', 'Komenského náměstí',
   'Škola základ života, stojí tu psáno. Ta slova v sobě nesou poslední znamení.',
   'Nápis má tři slova. Lvy jste potkali na Velkém náměstí.',
   '[{"id":"z1","pismeno":"U","odpovedi":["21","dvacet jedna"],"zadani":"Spočítejte písmena nápisu ŠKOLA ZÁKLAD ŽIVOTA a přičtěte lvy z erbu."}]',
   '{}'::text[]),
  (6, 'tajenka', 'Papavilonovo poselství', null,
   'Máte devět písmen. Posouvejte je doleva a doprava, až z nich složíte dvě slova, začátek mého poselství.',
   'První slovo má čtyři písmena a začíná na K. Jedno písmeno si zaslouží háček.',
   '[]',
   array['KDYŽ NAJDU', 'KDYŽNAJDU'])
) as v(poradi, typ, nazev, misto, zadani, napoveda, znameni, odpovedi)
where k.hra = 'vanocni-jizda-2026' and k.poradi = 1
  and not exists (select 1 from public.omg_stanoviste s where s.kapitola_id = k.id);
