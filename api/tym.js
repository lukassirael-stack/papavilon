// ════════════════════════════════════════════════════════════════════
//  /api/tym.js — stav týmu a registrace týmu
//  GET  ?k=TOKEN                       → { tym, hra: { kapitoly, pozice } }
//  POST { k, nazev_tymu, pocet_hracu, vek_hracu } → pojmenování týmu
// ════════════════════════════════════════════════════════════════════

import { CENA, HRACU_V_CENE, UCET, supabase, cors, jeAdmin, verejnyTym, generujSPAYD, qrUrl } from '../lib/spolecne.js';
import { stavHry } from '../lib/hra.js';

async function nactiTym(token) {
  if (!/^[a-f0-9]{32}$/.test(String(token || ''))) return null;
  const { data } = await supabase().from('omg_tymy').select('*').eq('token', token).maybeSingle();
  return data || null;
}

export default async function handler(req, res) {
  if (cors(req, res, 'GET, POST, OPTIONS')) return;

  try {
    // ── GET: stav ─────────────────────────────────────────────────
    if (req.method === 'GET') {
      const tym = await nactiTym(req.query.k);
      if (!tym) return res.status(404).json({ chyba: 'Tenhle odkaz neznáme. Nový si pošleš na stránce Zapomenutý odkaz.' });

      const odpoved = { tym: verejnyTym(tym) };
      if (tym.stav !== 'zaplaceno' && tym.platba === 'prevod') {
        const spayd = generujSPAYD({ castka: tym.castka || CENA, vs: tym.vs, zprava: `Vanocni jizda ${tym.vs}` });
        odpoved.platba = { spayd, qr: qrUrl(spayd), ucet: UCET.ucet, iban: UCET.iban, prijemce: UCET.prijemceZobrazit, zprava: `Vanocni jizda ${tym.vs}` };
      }
      if (tym.stav === 'zaplaceno' && tym.nazev_tymu) {
        odpoved.hra = await stavHry(tym, { admin: jeAdmin(req) });
      }
      return res.status(200).json(odpoved);
    }

    // ── POST: registrace týmu ─────────────────────────────────────
    if (req.method === 'POST') {
      const d = req.body || {};
      const tym = await nactiTym(d.k);
      if (!tym) return res.status(404).json({ chyba: 'Tenhle odkaz neznáme.' });
      if (tym.stav !== 'zaplaceno') return res.status(403).json({ chyba: 'Tým pojmenuješ, jakmile dorazí platba.' });

      const db = supabase();
      const maxHracu = tym.pocet_hracu || HRACU_V_CENE;

      // ── zápis čísel krystalů z čajovny (po registraci) ──────────
      if (d.akce === 'krystaly') {
        if (!tym.nazev_tymu) return res.status(400).json({ chyba: 'Nejdřív pojmenuj tým.' });
        const hraci = Array.isArray(tym.hraci) ? tym.hraci.map((h) => ({ ...h })) : [];
        const cisla = Array.isArray(d.krystaly) ? d.krystaly : [];
        hraci.forEach((h, i) => {
          const c = String(cisla[i] ?? '').trim().replace(/\s+/g, '').substring(0, 12);
          h.krystal = c || null;
        });
        const moje = hraci.map((h) => h.krystal).filter(Boolean);
        if (new Set(moje).size !== moje.length) return res.status(400).json({ chyba: 'Každý krystal má jiné číslo, zkontroluj prosím zápis.' });
        if (moje.length) {
          const { data: ostatni } = await db.from('omg_tymy').select('id, hraci').eq('hra', tym.hra).neq('id', tym.id);
          const obsazena = new Set((ostatni || []).flatMap((t) => (t.hraci || []).map((h) => h.krystal).filter(Boolean)));
          const kolize = moje.find((c) => obsazena.has(c));
          if (kolize) return res.status(409).json({ chyba: `Krystal č. ${kolize} už má zapsaný jiný tým. Zkontroluj číslo, případně se ozvi v čajovně.` });
        }
        const { data: upd2, error: e2 } = await db.from('omg_tymy').update({ hraci }).eq('id', tym.id).select('*').single();
        if (e2) { console.error('krystaly:', e2); return res.status(500).json({ chyba: 'Uložení se nepovedlo, zkus to prosím znovu.' }); }
        return res.status(200).json({ uspech: true, tym: verejnyTym(upd2), hra: await stavHry(upd2, { admin: jeAdmin(req) }) });
      }

      // ── registrace týmu: jméno + hráči (jméno a věk) ────────────
      const nazev = String(d.nazev_tymu || '').trim().replace(/\s+/g, ' ');
      if (nazev.length < 2 || nazev.length > 40) return res.status(400).json({ chyba: 'Jméno týmu má mít 2 až 40 znaků.' });
      const vstup = (Array.isArray(d.hraci) ? d.hraci : [])
        .map((h) => ({ jmeno: String(h?.jmeno || '').trim().replace(/\s+/g, ' ').substring(0, 40), vek: parseInt(h?.vek, 10) }))
        .filter((h) => h.jmeno || h.vek);
      if (!vstup.length) return res.status(400).json({ chyba: 'Napiš aspoň jednoho hráče se jménem a věkem.' });
      if (vstup.length > maxHracu) return res.status(400).json({ chyba: `Vstupenka platí pro ${maxHracu} ${maxHracu < 5 ? 'hráče' : 'hráčů'}.` });
      for (const h of vstup) {
        if (h.jmeno.length < 1) return res.status(400).json({ chyba: 'U každého hráče doplň jméno.' });
        if (!(h.vek >= 1 && h.vek <= 110)) return res.status(400).json({ chyba: `U hráče ${h.jmeno} doplň věk.` });
      }
      const puvodni = Array.isArray(tym.hraci) ? tym.hraci : [];
      const hraci = vstup.map((h, i) => ({ jmeno: h.jmeno, vek: h.vek, krystal: puvodni[i]?.krystal || null }));

      const { data: upd, error } = await db.from('omg_tymy')
        .update({ nazev_tymu: nazev, hraci, vek_hracu: hraci.map((h) => `${h.jmeno} ${h.vek}`).join(', '), registrovano_at: tym.registrovano_at || new Date().toISOString() })
        .eq('id', tym.id).select('*').single();
      if (error) {
        if (error.code === '23505') return res.status(409).json({ chyba: 'Tohle jméno už má jiný tým. Zkus jiné, třeba s přívlastkem.' });
        console.error('tym update:', error);
        return res.status(500).json({ chyba: 'Uložení se nepovedlo, zkus to prosím znovu.' });
      }
      return res.status(200).json({ uspech: true, tym: verejnyTym(upd), hra: await stavHry(upd, { admin: jeAdmin(req) }) });
    }

    return res.status(405).json({ chyba: 'Nepodporovaná metoda.' });
  } catch (err) {
    console.error('tym:', err);
    return res.status(500).json({ chyba: 'Nastala neočekávaná chyba.' });
  }
}
