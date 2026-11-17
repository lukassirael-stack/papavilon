// ════════════════════════════════════════════════════════════════════
//  lib/hra.js — sestavení stavu hry pro tým (kapitoly, stanoviště, postup)
// ════════════════════════════════════════════════════════════════════

import { HRA, supabase } from './spolecne.js';

// Kolik pokusů má tým na jedno znamení (číslo z místa převede na písmeno a zapíše ho).
export const POKUSU_NA_ZNAMENI = 3;

// Dobré skutky: když znamení po třech pokusech zůstane skryté, Papavilon ho rozzáří za dobrý skutek.
// Seznam jde upravit ve správě (tabulka nastaveni, klíč omg_skutky); tohle je výchozí sada.
export const SKUTKY_VYCHOZI = [
  'Zeptejte se někoho cizího, jestli chce obejmout, a obejměte ho.',
  'Popřejte třem lidem krásný advent.',
  'Seberte tři odpadky a odneste je do koše.',
  'Napište někomu blízkému, že ho máte rádi.',
  'Podržte někomu dveře nebo pomozte s taškou.',
  'Pochvalte někoho cizího za něco hezkého, co na něm vidíte.',
  'Zavolejte babičce, dědovi nebo někomu, kdo vás dlouho neslyšel.',
  'Řekněte každému v týmu jednu věc, kterou na něm máte rádi.',
  'Nabídněte kolemjdoucím, že je společně vyfotíte.',
  'Usmějte se na pět lidí a pozdravte je.',
  'Zeptejte se staršího člověka, jak se dnes má, a chvíli si s ním povídejte.',
  'Nechte na lavičce lísteček s milým vzkazem pro toho, kdo ho najde.',
  'Pošlete fotku z dnešní cesty někomu, kdo s vámi být nemohl, a napište mu k ní pár hezkých slov.',
  'Přispějte na dobrou věc: do kasičky, charitě nebo někomu, kdo sbírá na pomoc druhým.',
];
export async function seznamSkutku() {
  try {
    const { data } = await supabase().from('nastaveni').select('hodnota').eq('klic', 'omg_skutky').maybeSingle();
    const s = JSON.parse((data && data.hodnota) || '[]').map((x) => String(x).trim()).filter(Boolean);
    if (s.length) return s;
  } catch (e) { console.error('seznamSkutku:', e); }
  return SKUTKY_VYCHOZI;
}

// Stav znamení na světle pro tým. Odpovědi se ven neposílají, písmeno jen u rozsvícených.
export function stavZnameni(s, p) {
  const zapis = (p && p.znameni) || {};
  return (Array.isArray(s.znameni) ? s.znameni : []).map((z) => {
    const st = zapis[z.id] || {};
    const pokusy = st.pokusy || 0;
    const sviti = !!st.sviti;
    return {
      id: z.id, zadani: z.zadani,
      stav: sviti ? 'sviti' : (pokusy >= POKUSU_NA_ZNAMENI ? 'stin' : 'ceka'),
      zbyva: sviti ? 0 : Math.max(0, POKUSU_NA_ZNAMENI - pokusy),
      pismeno: sviti ? z.pismeno : null,
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
        if (s.typ === 'znameni') zaznam.znameni = stavZnameni(s, p);
        // tajenka: tým ji skládá z písmen kapitoly; ven jde jen počet mezer mezi slovy
        if (s.typ === 'tajenka') zaznam.mezer = Math.max(0, String((s.odpovedi || [])[0] || '').trim().split(/\s+/).length - 1);
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
