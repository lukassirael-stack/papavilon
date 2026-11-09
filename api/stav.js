// ════════════════════════════════════════════════════════════════════
//  /api/stav.js — veřejný stav prodeje (čte hlavní stránka i vstupenka)
//  GET → { registrace_od, otevreno, cena }
// ════════════════════════════════════════════════════════════════════

import { CENA, cors, registraceOd } from '../lib/spolecne.js';

export default async function handler(req, res) {
  if (cors(req, res, 'GET, OPTIONS')) return;
  if (req.method !== 'GET') return res.status(405).json({ chyba: 'Pouze GET.' });
  try {
    const od = await registraceOd();
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    return res.status(200).json({ registrace_od: od, otevreno: Date.now() >= new Date(od).getTime(), cena: CENA });
  } catch (err) {
    console.error('stav:', err);
    return res.status(500).json({ chyba: 'Stav se nepodařilo načíst.' });
  }
}
