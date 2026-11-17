// ════════════════════════════════════════════════════════════════════
//  /api/hra.js — herní akce týmu na stanovišti
//  POST { k, akce: 'odpoved' | 'znameni' | 'znameni_obnov' | 'skutek_vyber' | 'skutek_hotovo' | 'hotovo' | 'krystaly', stanoviste_id, znameni_id?, odpoved?, n? }
//  → { vysledek, hra: { kapitoly }, tym }
// ════════════════════════════════════════════════════════════════════

import { supabase, cors, jeAdmin, normalizuj, verejnyTym } from '../lib/spolecne.js';
import { stavHry, ulozKrystaly, seznamSkutku, POKUSU_NA_ZNAMENI } from '../lib/hra.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ chyba: 'Pouze POST.' });

  try {
    const d = req.body || {};
    const sb = supabase();
    const admin = jeAdmin(req);

    if (!/^[a-f0-9]{32}$/.test(String(d.k || ''))) return res.status(404).json({ chyba: 'Tenhle odkaz neznáme.' });
    const { data: tym } = await sb.from('omg_tymy').select('*').eq('token', d.k).maybeSingle();
    if (!tym) return res.status(404).json({ chyba: 'Tenhle odkaz neznáme.' });
    if (tym.stav !== 'zaplaceno' || !tym.nazev_tymu) return res.status(403).json({ chyba: 'Nejdřív pojmenuj svůj tým.' });

    const sid = parseInt(d.stanoviste_id, 10);
    if (!sid) return res.status(400).json({ chyba: 'Chybí stanoviště.' });

    // stanoviště musí být pro tým právě otevřené
    const hra = await stavHry(tym, { admin });
    let stan = null;
    for (const k of hra.kapitoly) for (const s of k.stanoviste) if (s.id === sid) stan = s;
    if (!stan) return res.status(403).json({ chyba: 'Tohle světlo se ti zatím neukázalo.' });

    // ── správce: vrátit světlu se znameními všechny pokusy (zkoušení hry, pomoc týmu) ──
    if (d.akce === 'znameni_obnov') {
      if (!admin) return res.status(401).json({ chyba: 'Pokusy obnovuje správce hry.' });
      await sb.from('omg_pokrok').update({ znameni: {}, pokusy: 0, vyreseno_at: null, odpoved: null }).eq('tym_id', tym.id).eq('stanoviste_id', sid);
      return res.status(200).json({ vysledek: 'obnoveno', hra: await stavHry(tym, { admin }), tym: verejnyTym(tym) });
    }
    const { data: plne } = await sb.from('omg_stanoviste').select('*').eq('id', sid).single();
    const { data: p } = await sb.from('omg_pokrok').select('*').eq('tym_id', tym.id).eq('stanoviste_id', sid).maybeSingle();
    const ted = new Date().toISOString();

    // ── dobrý skutek: rozzáří písmeno, které po třech pokusech zůstalo skryté (jde i na dohraném světle) ──
    if (d.akce === 'skutek_vyber' || d.akce === 'skutek_hotovo') {
      if (plne.typ !== 'znameni' || stan.stav === 'zamceno') return res.status(400).json({ chyba: 'Tady se dobrý skutek nenabízí.' });
      const seznam = Array.isArray(plne.znameni) ? plne.znameni : [];
      const z = seznam.find((x) => x.id === String(d.znameni_id || ''));
      const zapis = { ...((p && p.znameni) || {}) };
      const st = z ? { ...(zapis[z.id] || {}) } : null;
      if (!z || st.sviti || (st.pokusy || 0) < POKUSU_NA_ZNAMENI) return res.status(400).json({ chyba: 'Dobrý skutek patří ke znamení, které po třech pokusech zůstalo skryté.' });
      const odpovez = async (vysledek) => res.status(200).json({ vysledek, znameni_id: z.id, hra: await stavHry(tym, { admin }), tym: verejnyTym(tym) });

      if (d.akce === 'skutek_vyber') {
        if (st.skutek && !d.jiny) return odpovez('skutek');
        // losuje se ze skutků, které tým ještě neměl (když dojdou, ze všech kromě toho posledního)
        const vse = await seznamSkutku();
        const { data: radky } = await sb.from('omg_pokrok').select('znameni').eq('tym_id', tym.id);
        const meli = new Set((radky || []).flatMap((r) => Object.values(r.znameni || {}).map((x) => x && x.skutek)).filter(Boolean));
        let volne = vse.filter((x) => !meli.has(x));
        if (!volne.length) volne = vse.filter((x) => x !== st.skutek);
        if (!volne.length) volne = vse;
        st.skutek = volne[Math.floor(Math.random() * volne.length)];
        zapis[z.id] = st;
        await sb.from('omg_pokrok').update({ znameni: zapis }).eq('tym_id', tym.id).eq('stanoviste_id', sid);
        return odpovez('skutek');
      }

      if (!st.skutek) return res.status(400).json({ chyba: 'Nejdřív si nech vylosovat dobrý skutek.' });
      const popis = String(d.popis || '').trim().replace(/\s+/g, ' ').substring(0, 300);
      if (popis.length < 10) return res.status(400).json({ chyba: 'Napište aspoň jednou větou, co jste udělali.' });
      Object.assign(st, { sviti: true, skutek_popis: popis, skutek_at: ted });
      zapis[z.id] = st;
      const pismena = seznam.map((x) => (zapis[x.id] && zapis[x.id].sviti ? x.pismeno : '✧')).join(' ');
      await sb.from('omg_pokrok').update({ znameni: zapis, ...(p && p.vyreseno_at ? { odpoved: pismena } : {}) }).eq('tym_id', tym.id).eq('stanoviste_id', sid);
      await sb.from('omg_pokusy').insert({ tym_id: tym.id, stanoviste_id: sid, odpoved: `${z.id} dobrý skutek: ${popis}`.substring(0, 400), spravne: true });
      return odpovez('skutek_hotovo');
    }

    if (stan.stav === 'vyreseno' || stan.stav === 'preskoceno') return res.status(200).json({ vysledek: 'hotovo', hra, tym: verejnyTym(tym) });
    if (stan.stav !== 'otevreno') return res.status(403).json({ chyba: 'Nejdřív vyřeš předchozí stanoviště.' });

    const zaklad = { tym_id: tym.id, stanoviste_id: sid, pokusy: p?.pokusy || 0 };

    const hotovo = async (extra) => {
      await sb.from('omg_pokrok').upsert({ ...zaklad, ...extra }, { onConflict: 'tym_id,stanoviste_id' });
      const { data: t2 } = await sb.from('omg_tymy').select('*').eq('id', tym.id).single();
      return res.status(200).json({ vysledek: extra.preskoceno ? 'preskoceno' : 'spravne', hra: await stavHry(t2, { admin }), tym: verejnyTym(t2) });
    };

    // ── informační stanoviště: jen pokračovat ─────────────────────
    if (d.akce === 'hotovo') {
      if (plne.typ !== 'info') return res.status(400).json({ chyba: 'Tady se čeká na odpověď.' });
      return hotovo({ vyreseno_at: ted, body: 0, odpoved: null });
    }

    // ── světlo „krystal“: tým zapíše čísla krystalů svých hráčů ───
    if (d.akce === 'krystaly') {
      if (plne.typ !== 'krystal') return res.status(400).json({ chyba: 'Tady se krystaly nezapisují.' });
      const v = await ulozKrystaly(tym, d.krystaly);
      if (v.chyba) return res.status(v.status).json({ chyba: v.chyba });
      return hotovo({ vyreseno_at: ted, body: 0, odpoved: v.hraci.map((h) => `${h.jmeno} ${h.krystal}`).join(', ') });
    }

    // ── znamení: tým najde číslo, převede ho abecedou a zapíše písmeno; na každé jsou 3 pokusy ──
    if (d.akce === 'znameni') {
      if (plne.typ !== 'znameni') return res.status(400).json({ chyba: 'Tady se znamení nehledají.' });
      const seznam = Array.isArray(plne.znameni) ? plne.znameni : [];
      const z = seznam.find((x) => x.id === String(d.znameni_id || ''));
      if (!z) return res.status(400).json({ chyba: 'Tohle znamení Papavilon na světle nemá.' });

      const zapis = { ...((p && p.znameni) || {}) };
      const st = { pokusy: 0, zkousene: [], ...(zapis[z.id] || {}) };
      const odpovez = async (vysledek, t = tym) => res.status(200).json({ vysledek, znameni_id: z.id, zbyva: Math.max(0, POKUSU_NA_ZNAMENI - st.pokusy), hra: await stavHry(t, { admin }), tym: verejnyTym(t) });
      if (st.sviti || st.pokusy >= POKUSU_NA_ZNAMENI) return odpovez('hotovo');

      const odpoved = String(d.odpoved || '').trim().substring(0, 40);
      const n = normalizuj(odpoved);
      if (!n) return res.status(400).json({ chyba: 'Napiš písmeno, které vám vyšlo.' });
      // číslo ani delší text pokus nestojí: Papavilon čeká jedno písmeno
      if (/^[0-9 ]+$/.test(n)) return odpovez('cislo');
      if (n.length !== 1) return odpovez('jedno');
      // stejná odpověď podruhé pokus nestojí
      if ((st.zkousene || []).includes(n)) return odpovez('opakovani');

      // klid mezi pokusy (chrání i před dvojím ťuknutím)
      const { data: posledni } = await sb.from('omg_pokusy').select('created_at').eq('tym_id', tym.id).eq('stanoviste_id', sid)
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (posledni && Date.now() - new Date(posledni.created_at).getTime() < 3000) {
        return res.status(429).json({ chyba: 'Chviličku… Papavilon ještě přemýšlí nad tou předchozí.' });
      }

      const spravne = normalizuj(z.pismeno) === n;
      await sb.from('omg_pokusy').insert({ tym_id: tym.id, stanoviste_id: sid, odpoved: `${z.id}: ${odpoved}`, spravne });
      st.pokusy += 1;
      if (spravne) st.sviti = true; else st.zkousene = [...(st.zkousene || []), n];
      zapis[z.id] = st;
      zaklad.pokusy += 1;

      // světlo je dokončené, když každé znamení svítí nebo vyčerpalo pokusy
      const vse = seznam.every((x) => { const y = zapis[x.id] || {}; return y.sviti || (y.pokusy || 0) >= POKUSU_NA_ZNAMENI; });
      const radek = { ...zaklad, znameni: zapis };
      if (vse) Object.assign(radek, { vyreseno_at: ted, body: 0, odpoved: seznam.map((x) => (zapis[x.id] && zapis[x.id].sviti ? x.pismeno : '✧')).join(' ') });
      await sb.from('omg_pokrok').upsert(radek, { onConflict: 'tym_id,stanoviste_id' });
      const { data: t2 } = await sb.from('omg_tymy').select('*').eq('id', tym.id).single();
      return odpovez(spravne ? 'sviti' : (st.pokusy >= POKUSU_NA_ZNAMENI ? 'stin' : 'spatne'), t2 || tym);
    }

    // ── odpověď ───────────────────────────────────────────────────
    if (d.akce === 'odpoved') {
      if (plne.typ !== 'odpoved' && plne.typ !== 'tajenka') return res.status(400).json({ chyba: 'Tady se odpověď nezapisuje.' });
      const odpoved = String(d.odpoved || '').trim().substring(0, 200);
      if (!normalizuj(odpoved)) return res.status(400).json({ chyba: 'Napiš odpověď.' });

      // klid mezi pokusy
      const { data: posledni } = await sb.from('omg_pokusy').select('created_at').eq('tym_id', tym.id).eq('stanoviste_id', sid)
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (posledni && Date.now() - new Date(posledni.created_at).getTime() < 3000) {
        return res.status(429).json({ chyba: 'Chviličku… Papavilon ještě přemýšlí nad tou předchozí.' });
      }

      const shoda = (plne.odpovedi || []).find((a) => normalizuj(a) && normalizuj(a) === normalizuj(odpoved));
      const spravne = !!shoda;
      await sb.from('omg_pokusy').insert({ tym_id: tym.id, stanoviste_id: sid, odpoved, spravne });
      zaklad.pokusy += 1;

      // u tajenky se ukládá první uznávaná podoba (s háčky a mezerami)
      if (spravne) return hotovo({ vyreseno_at: ted, body: 0, odpoved: plne.typ === 'tajenka' ? (plne.odpovedi[0] || odpoved) : odpoved });

      await sb.from('omg_pokrok').upsert(zaklad, { onConflict: 'tym_id,stanoviste_id' });
      return res.status(200).json({ vysledek: 'spatne', pokusy: zaklad.pokusy, hra: await stavHry(tym, { admin }), tym: verejnyTym(tym) });
    }

    return res.status(400).json({ chyba: 'Neznámá akce.' });
  } catch (err) {
    console.error('hra:', err);
    return res.status(500).json({ chyba: 'Nastala neočekávaná chyba.' });
  }
}
