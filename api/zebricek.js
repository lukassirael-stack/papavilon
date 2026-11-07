// ════════════════════════════════════════════════════════════════════
//  /api/zebricek.js — veřejný žebříček (jméno týmu, body, vyřešená světla)
//  GET → { tymy: [...], pocet_tymu }
// ════════════════════════════════════════════════════════════════════

import { HRA, supabase, cors } from '../lib/spolecne.js';

export default async function handler(req, res) {
  if (cors(req, res, 'GET, OPTIONS')) return;
  if (req.method !== 'GET') return res.status(405).json({ chyba: 'Pouze GET.' });
  try {
    const sb = supabase();
    const [{ data: tymy }, { count }] = await Promise.all([
      sb.from('omg_zebricek').select('nazev_tymu, body, vyreseno, posledni_reseni_at').limit(100),
      sb.from('omg_tymy').select('id', { count: 'exact', head: true }).eq('hra', HRA).eq('stav', 'zaplaceno').not('nazev_tymu', 'is', null),
    ]);
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({ tymy: tymy || [], pocet_tymu: count || 0 });
  } catch (err) {
    console.error('zebricek:', err);
    return res.status(500).json({ chyba: 'Žebříček se nepodařilo načíst.' });
  }
}
