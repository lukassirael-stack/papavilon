// ════════════════════════════════════════════════════════════════════
//  /api/hra.js — herní akce týmu na stanovišti
//  POST { k, akce: 'odpoved' | 'napoveda' | 'hotovo' | 'preskocit', stanoviste_id, odpoved? }
//  → { vysledek, spravne?, body?, hra: { kapitoly, pozice }, tym }
// ════════════════════════════════════════════════════════════════════

import { supabase, cors, jeAdmin, normalizuj, verejnyTym } from '../lib/spolecne.js';
import { stavHry, ulozKrystaly } from '../lib/hra.js';

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
    if (stan.stav === 'vyreseno' || stan.stav === 'preskoceno') return res.status(200).json({ vysledek: 'hotovo', hra, tym: verejnyTym(tym) });
    if (stan.stav !== 'otevreno') return res.status(403).json({ chyba: 'Nejdřív vyřeš předchozí stanoviště.' });

    const { data: plne } = await sb.from('omg_stanoviste').select('*').eq('id', sid).single();
    const { data: p } = await sb.from('omg_pokrok').select('*').eq('tym_id', tym.id).eq('stanoviste_id', sid).maybeSingle();
    const ted = new Date().toISOString();
    const zaklad = { tym_id: tym.id, stanoviste_id: sid, pokusy: p?.pokusy || 0, napoveda_at: p?.napoveda_at || null };

    const bodyZa = () => Math.max(0, (plne.body || 0) - (zaklad.napoveda_at ? (plne.srazka_napoveda || 0) : 0));
    const hotovo = async (extra) => {
      await sb.from('omg_pokrok').upsert({ ...zaklad, ...extra }, { onConflict: 'tym_id,stanoviste_id' });
      const { data: t2 } = await sb.from('omg_tymy').select('*').eq('id', tym.id).single();
      return res.status(200).json({ vysledek: extra.preskoceno ? 'preskoceno' : 'spravne', body: extra.body, hra: await stavHry(t2, { admin }), tym: verejnyTym(t2) });
    };

    // ── nápověda ──────────────────────────────────────────────────
    if (d.akce === 'napoveda') {
      if (!plne.napoveda) return res.status(400).json({ chyba: 'Tady Papavilon nápovědu nechystá.' });
      if (!zaklad.napoveda_at) {
        zaklad.napoveda_at = ted;
        await sb.from('omg_pokrok').upsert(zaklad, { onConflict: 'tym_id,stanoviste_id' });
      }
      return res.status(200).json({ vysledek: 'napoveda', napoveda: plne.napoveda, hra: await stavHry(tym, { admin }), tym: verejnyTym(tym) });
    }

    // ── informační stanoviště: jen pokračovat ─────────────────────
    if (d.akce === 'hotovo') {
      if (plne.typ !== 'info') return res.status(400).json({ chyba: 'Tady se čeká na odpověď.' });
      return hotovo({ vyreseno_at: ted, body: plne.body || 0, odpoved: null });
    }

    // ── světlo „krystal“: tým zapíše čísla krystalů svých hráčů ───
    if (d.akce === 'krystaly') {
      if (plne.typ !== 'krystal') return res.status(400).json({ chyba: 'Tady se krystaly nezapisují.' });
      const v = await ulozKrystaly(tym, d.krystaly);
      if (v.chyba) return res.status(v.status).json({ chyba: v.chyba });
      return hotovo({ vyreseno_at: ted, body: plne.body || 0, odpoved: v.hraci.map((h) => `${h.jmeno} ${h.krystal}`).join(', ') });
    }

    // ── přeskočit (po 5 pokusech s nápovědou) ─────────────────────
    if (d.akce === 'preskocit') {
      if (!stan.muze_preskocit) return res.status(400).json({ chyba: 'Přeskočit půjde po pěti pokusech s nápovědou.' });
      return hotovo({ vyreseno_at: ted, preskoceno: true, body: 0, odpoved: null });
    }

    // ── odpověď ───────────────────────────────────────────────────
    if (d.akce === 'odpoved') {
      if (plne.typ !== 'odpoved') return res.status(400).json({ chyba: 'Tady se odpověď nezapisuje.' });
      const odpoved = String(d.odpoved || '').trim().substring(0, 200);
      if (!normalizuj(odpoved)) return res.status(400).json({ chyba: 'Napiš odpověď.' });

      // klid mezi pokusy
      const { data: posledni } = await sb.from('omg_pokusy').select('created_at').eq('tym_id', tym.id).eq('stanoviste_id', sid)
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (posledni && Date.now() - new Date(posledni.created_at).getTime() < 3000) {
        return res.status(429).json({ chyba: 'Chviličku… Papavilon ještě přemýšlí nad tou předchozí.' });
      }

      const spravne = (plne.odpovedi || []).some((a) => normalizuj(a) && normalizuj(a) === normalizuj(odpoved));
      await sb.from('omg_pokusy').insert({ tym_id: tym.id, stanoviste_id: sid, odpoved, spravne });
      zaklad.pokusy += 1;

      if (spravne) return hotovo({ vyreseno_at: ted, body: bodyZa(), odpoved });

      await sb.from('omg_pokrok').upsert(zaklad, { onConflict: 'tym_id,stanoviste_id' });
      return res.status(200).json({ vysledek: 'spatne', pokusy: zaklad.pokusy, hra: await stavHry(tym, { admin }), tym: verejnyTym(tym) });
    }

    return res.status(400).json({ chyba: 'Neznámá akce.' });
  } catch (err) {
    console.error('hra:', err);
    return res.status(500).json({ chyba: 'Nastala neočekávaná chyba.' });
  }
}
