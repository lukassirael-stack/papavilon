// ════════════════════════════════════════════════════════════════════
//  /api/tym.js — stav týmu a registrace týmu
//  GET  ?k=TOKEN                       → { tym, hra: { kapitoly, pozice } }
//  POST { k, nazev_tymu, pocet_hracu, vek_hracu } → pojmenování týmu
// ════════════════════════════════════════════════════════════════════

import { CENA, UCET, supabase, cors, jeAdmin, verejnyTym, generujSPAYD, qrUrl } from '../lib/spolecne.js';
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

      const nazev = String(d.nazev_tymu || '').trim().replace(/\s+/g, ' ');
      const pocet = parseInt(d.pocet_hracu, 10);
      const vek   = String(d.vek_hracu || '').trim().substring(0, 120);
      if (nazev.length < 2 || nazev.length > 40) return res.status(400).json({ chyba: 'Jméno týmu má mít 2 až 40 znaků.' });
      if (!(pocet >= 1 && pocet <= 20))          return res.status(400).json({ chyba: 'Zadej počet hráčů (1 až 20).' });
      if (!vek)                                   return res.status(400).json({ chyba: 'Napiš věk hráčů, třeba „8, 11, 40“.' });

      const { data: upd, error } = await supabase().from('omg_tymy')
        .update({ nazev_tymu: nazev, pocet_hracu: pocet, vek_hracu: vek, registrovano_at: tym.registrovano_at || new Date().toISOString() })
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
