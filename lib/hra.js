// ════════════════════════════════════════════════════════════════════
//  lib/hra.js — sestavení stavu hry pro tým (kapitoly, stanoviště, postup)
// ════════════════════════════════════════════════════════════════════

import { HRA, supabase, normalizuj } from './spolecne.js';

// Kolik pokusů má tým na jedno znamení (číslo z místa převede na písmeno a zapíše ho).
export const POKUSU_NA_ZNAMENI = 3;

// Dobré skutky: když znamení po třech pokusech zůstane skryté, Papavilon ho rozzáří za dobrý skutek.
// Seznam jde upravit ve správě (tabulka nastaveni, klíč omg_skutky); tohle je výchozí sada.
export const SKUTKY_VYCHOZI = [
  'Popřejte třem lidem krásný advent.',
  'Seberte tři odpadky a odneste je do koše.',
  'Napište někomu blízkému, že ho máte rádi.',
  'Podržte někomu dveře nebo pomozte s taškou.',
  'Pochvalte někoho cizího za něco hezkého, co na něm vidíte.',
  'Zavolejte babičce, dědovi nebo někomu, kdo vás dlouho neslyšel.',
  'Řekněte každému v týmu jednu věc, kterou na něm máte rádi.',
  'Usmějte se na pět lidí a pozdravte je.',
  'Zeptejte se staršího člověka, jak se dnes má, a chvíli si s ním povídejte.',
  'Nechte na lavičce lísteček s milým vzkazem pro toho, kdo ho najde.',
  'Pošlete fotku z dnešní cesty někomu, kdo s vámi být nemohl, a napište mu k ní pár hezkých slov.',
  'Přispějte na dobrou věc nebo něco darujte: do kasičky, charitě nebo někomu potřebnému.',
];
export async function seznamSkutku() {
  try {
    const { data } = await supabase().from('nastaveni').select('hodnota').eq('klic', 'omg_skutky').maybeSingle();
    const s = JSON.parse((data && data.hodnota) || '[]').map((x) => String(x).trim()).filter(Boolean);
    if (s.length) return s;
  } catch (e) { console.error('seznamSkutku:', e); }
  return SKUTKY_VYCHOZI;
}

// Vylosuje týmu dobrý skutek, který ještě neměl. Až tým vystřídá celý seznam,
// přijde na řadu ten, který dělal nejméněkrát a nejdéle zpátky (a jiný než ten současný).
export async function vylosujSkutek(tymId, soucasny = null) {
  const vse = await seznamSkutku();
  const { data: radky } = await supabase().from('omg_pokrok').select('znameni').eq('tym_id', tymId);
  const zaznamy = (radky || []).flatMap((r) => Object.values(r.znameni || {})).filter((x) => x && x.skutek);
  const meli = new Set(zaznamy.map((x) => x.skutek));
  const volne = vse.filter((x) => !meli.has(x));
  if (volne.length) return volne[Math.floor(Math.random() * volne.length)];
  const pocet = new Map(), naposled = new Map();
  for (const x of zaznamy) {
    pocet.set(x.skutek, (pocet.get(x.skutek) || 0) + 1);
    const kdy = x.skutek_at || '9999';   // rozdělaný skutek se počítá jako nejčerstvější
    if (kdy > (naposled.get(x.skutek) || '')) naposled.set(x.skutek, kdy);
  }
  const kandidati = vse.filter((x) => x !== soucasny);
  const razeni = (kandidati.length ? kandidati : vse).slice()
    .sort((a, b) => (pocet.get(a) || 0) - (pocet.get(b) || 0) || String(naposled.get(a) || '').localeCompare(String(naposled.get(b) || '')));
  return razeni[0];
}

// Po kolika pokusech o tajenku nabídne Papavilon radu za dobrý skutek.
export const POKUSU_PRED_RADOU = 3;

// Tajenka: délky slov, písmena usazená Papavilonovou radou a stav rady.
// První rada usadí první písmeno každého slova, každá další jedno písmeno navíc; poslední dvě písmena zůstávají na týmu.
export function tajenkaInfo(s, p) {
  const slova = String((s.odpovedi || [])[0] || '').trim().split(/\s+/).filter(Boolean);
  const pismena = normalizuj(slova.join(' ')).replace(/ /g, '').toUpperCase();
  const sHacky = pismenaTajenky(s);   // stejná písmena i s háčky a čárkami
  const zacatky = []; let n = 0;
  for (const w of slova) { zacatky.push(n); n += normalizuj(w).replace(/ /g, '').length; }
  const poradi = [...zacatky, ...Array.from({ length: n }, (_, i) => i).filter((i) => !zacatky.includes(i))];
  const zapis = (p && p.znameni) || {};
  const hotove = Object.values(zapis).filter((x) => x && x.skutek_at).length;
  const pocet = hotove ? Math.min(zacatky.length + hotove - 1, Math.max(0, n - 2)) : 0;
  const cekajici = Object.entries(zapis).find(([, x]) => x && x.skutek && !x.skutek_at) || null;
  return {
    slova: slova.map((w) => normalizuj(w).replace(/ /g, '').length), pismena, hotove, cekajici,
    usazena: poradi.slice(0, pocet).sort((a, b) => a - b).map((i) => ({ pozice: i, pismeno: sHacky[i] || pismena[i] })),
    muzeDalsi: (hotove ? zacatky.length + hotove : zacatky.length) <= Math.max(0, n - 2),
  };
}

// Písmena tajenky tak, jak se píšou v jejím řešení (s háčky a čárkami), bez mezer.
export function pismenaTajenky(s) {
  return [...String((s.odpovedi || [])[0] || '').normalize('NFC').toUpperCase()].filter((c) => normalizuj(c).length === 1);
}

// Háčky a čárky doplní Papavilon sám: tým zapíše Z a rozzáří se Ž, když ho tak píše tajenka kapitoly.
// Vrací Map 'idSvětla:idZnamení' → písmeno. Stejná písmena se rozdělují v pořadí znamení.
export function pismenaSHacky(seznam) {
  const taj = (seznam || []).find((s) => s.typ === 'tajenka');
  const zasoba = {};
  if (taj) for (const c of pismenaTajenky(taj)) (zasoba[normalizuj(c)] ||= []).push(c);
  // nejdřív písmena s háčkem nebo čárkou, ať je tým dostane hned u prvního stejného znamení
  for (const k of Object.keys(zasoba)) zasoba[k].sort((a, b) => (normalizuj(a).toUpperCase() === a) - (normalizuj(b).toUpperCase() === b));
  const mapa = new Map();
  for (const s of seznam || []) {
    if (s.typ !== 'znameni') continue;
    for (const z of (Array.isArray(s.znameni) ? s.znameni : [])) {
      const fronta = zasoba[normalizuj(z.pismeno)];
      mapa.set(`${s.id}:${z.id}`, (fronta && fronta.shift()) || z.pismeno);
    }
  }
  return mapa;
}

// Stav znamení na světle pro tým. Odpovědi se ven neposílají, písmeno jen u rozsvícených.
export function stavZnameni(s, p, hacky) {
  const zapis = (p && p.znameni) || {};
  return (Array.isArray(s.znameni) ? s.znameni : []).map((z) => {
    const st = zapis[z.id] || {};
    const pokusy = st.pokusy || 0;
    const sviti = !!st.sviti;
    return {
      id: z.id, zadani: z.zadani,
      stav: sviti ? 'sviti' : (pokusy >= POKUSU_NA_ZNAMENI ? 'stin' : 'ceka'),
      zbyva: sviti ? 0 : Math.max(0, POKUSU_NA_ZNAMENI - pokusy),
      pismeno: sviti ? ((hacky && hacky.get(`${s.id}:${z.id}`)) || z.pismeno) : null,
      skutek: !sviti && st.skutek ? st.skutek : null,   // vylosovaný dobrý skutek, který čeká na splnění
      skutkem: sviti && !!st.skutek_at,                  // písmeno rozzářil dobrý skutek
    };
  });
}

// Vrátí kompletní stav hry pro tým. admin=true otevře všechny kapitoly (náhled).
export async function stavHry(tym, { admin = false } = {}) {
  const sb = supabase();
  const now = Date.now();

  const [{ data: kapitoly }, { data: stanoviste }, { data: pokrok }] = await Promise.all([
    sb.from('omg_kapitoly').select('*').eq('hra', HRA).eq('aktivni', true).order('poradi'),
    sb.from('omg_stanoviste').select('*').eq('aktivni', true).order('kapitola_id').order('poradi'),
    sb.from('omg_pokrok').select('*').eq('tym_id', tym.id),
  ]);

  const pokrokMap = new Map((pokrok || []).map((p) => [p.stanoviste_id, p]));

  const vystup = (kapitoly || []).map((k) => {
    const otevrena = admin || now >= new Date(k.otevreno_od).getTime();
    const seznam = (stanoviste || []).filter((s) => s.kapitola_id === k.id);
    const hacky = pismenaSHacky(seznam);
    let predchoziHotovo = true;
    let vyreseno = 0;

    const st = seznam.map((s) => {
      const p = pokrokMap.get(s.id);
      const hotovo = !!(p && p.vyreseno_at);
      if (hotovo) vyreseno++;
      const dostupne = otevrena && predchoziHotovo;
      const zaznam = {
        id: s.id, poradi: s.poradi, typ: s.typ,
        stav: hotovo ? (p.preskoceno ? 'preskoceno' : 'vyreseno') : (dostupne ? 'otevreno' : 'zamceno'),
        pokusy: p?.pokusy || 0,
      };
      if (dostupne || hotovo) {
        Object.assign(zaznam, {
          nazev: s.nazev, misto: s.misto, zadani: s.zadani, audio_url: s.audio_url, obrazek_url: s.obrazek_url,
          odpoved: hotovo ? p.odpoved : null,
        });
        if (s.typ === 'znameni') zaznam.znameni = stavZnameni(s, p, hacky);
        // tajenka: tým ji skládá z písmen kapitoly; ven jdou jen délky slov (kde je mezi písmeny mezera)
        if (s.typ === 'tajenka' && !hotovo) {
          const t = tajenkaInfo(s, p);
          const dostupna = (p?.pokusy || 0) >= POKUSU_PRED_RADOU && (t.muzeDalsi || !!t.cekajici);
          Object.assign(zaznam, { slova: t.slova, usazena: t.usazena, rada: { dostupna, skutek: dostupna && t.cekajici ? t.cekajici[1].skutek : null } });
        }
      }
      predchoziHotovo = predchoziHotovo && hotovo;
      return zaznam;
    });

    return {
      id: k.id, poradi: k.poradi, nazev: k.nazev, podtitul: k.podtitul, otevreno_od: k.otevreno_od,
      otevrena,
      uvod: otevrena ? k.uvod : null,
      audio_url: otevrena ? k.audio_url : null,
      pocet: seznam.length, vyreseno,
      pismen: otevrena ? seznam.reduce((n, x) => n + (x.typ === 'znameni' && Array.isArray(x.znameni) ? x.znameni.length : 0), 0) : 0,
      hotovo: seznam.length > 0 && vyreseno === seznam.length,
      stanoviste: otevrena ? st : [],
    };
  });

  return { kapitoly: vystup };
}

// Uloží čísla krystalů hráčů (pořadí podle tym.hraci). Vrací { hraci } nebo { chyba, status }.
export async function ulozKrystaly(tym, cisla) {
  const sb = supabase();
  const hraci = (Array.isArray(tym.hraci) ? tym.hraci : []).map((h, i) => ({
    ...h, krystal: String((Array.isArray(cisla) ? cisla[i] : '') ?? '').trim().replace(/\s+/g, '').substring(0, 12) || null,
  }));
  if (!hraci.length) return { chyba: 'Tým nemá zapsané hráče.', status: 400 };
  const chybi = hraci.find((h) => !h.krystal);
  if (chybi) return { chyba: `Doplň číslo krystalu u hráče ${chybi.jmeno}.`, status: 400 };
  const moje = hraci.map((h) => h.krystal);
  if (new Set(moje).size !== moje.length) return { chyba: 'Každý krystal má jiné číslo, zkontroluj prosím zápis.', status: 400 };
  const { data: ostatni } = await sb.from('omg_tymy').select('id, hraci').eq('hra', tym.hra).neq('id', tym.id);
  const obsazena = new Set((ostatni || []).flatMap((t) => (t.hraci || []).map((h) => h.krystal).filter(Boolean)));
  const kolize = moje.find((c) => obsazena.has(c));
  if (kolize) return { chyba: `Krystal č. ${kolize} už má zapsaný jiný tým. Zkontroluj číslo.`, status: 409 };
  const { error } = await sb.from('omg_tymy').update({ hraci }).eq('id', tym.id);
  if (error) { console.error('ulozKrystaly:', error); return { chyba: 'Uložení se nepovedlo, zkus to prosím znovu.', status: 500 }; }
  return { hraci };
}
