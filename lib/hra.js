// ════════════════════════════════════════════════════════════════════
//  lib/hra.js — sestavení stavu hry pro tým (kapitoly, stanoviště, postup)
// ════════════════════════════════════════════════════════════════════

import { HRA, supabase } from './spolecne.js';

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
        id: s.id, poradi: s.poradi, typ: s.typ, body: s.body, srazka_napoveda: s.srazka_napoveda,
        stav: hotovo ? (p.preskoceno ? 'preskoceno' : 'vyreseno') : (dostupne ? 'otevreno' : 'zamceno'),
        pokusy: p?.pokusy || 0,
        napoveda_pouzita: !!p?.napoveda_at,
        ziskano: hotovo ? p.body : null,
      };
      if (dostupne || hotovo) {
        Object.assign(zaznam, {
          nazev: s.nazev, misto: s.misto, zadani: s.zadani, audio_url: s.audio_url, obrazek_url: s.obrazek_url,
          napoveda: p?.napoveda_at ? s.napoveda : null,
          ma_napovedu: !!s.napoveda,
          odpoved: hotovo ? p.odpoved : null,
          muze_preskocit: !hotovo && (p?.pokusy || 0) >= 5 && (!!p?.napoveda_at || !s.napoveda),
        });
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
      hotovo: seznam.length > 0 && vyreseno === seznam.length,
      stanoviste: otevrena ? st : [],
    };
  });

  // pořadí v žebříčku
  let pozice = null;
  if (tym.nazev_tymu) {
    const zaklad = () => sb.from('omg_tymy').select('id', { count: 'exact', head: true }).eq('hra', HRA).eq('stav', 'zaplaceno').not('nazev_tymu', 'is', null);
    const { count: vic } = await zaklad().gt('body', tym.body || 0);
    let drive = 0;
    if (tym.posledni_reseni_at) {
      const { count } = await zaklad().eq('body', tym.body || 0).lt('posledni_reseni_at', tym.posledni_reseni_at);
      drive = count || 0;
    }
    pozice = (vic || 0) + drive + 1;
  }

  return { kapitoly: vystup, pozice };
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
