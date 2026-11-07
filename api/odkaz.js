// ════════════════════════════════════════════════════════════════════
//  /api/odkaz.js — znovu poslat odkaz do hry na e-mail
//  POST { email } → vždy { uspech: true } (bez prozrazení, zda e-mail známe)
// ════════════════════════════════════════════════════════════════════

import { HRA, supabase, cors, siteUrl, jeEmail, emailOdkazDoHry } from '../lib/spolecne.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ chyba: 'Pouze POST.' });

  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!jeEmail(email)) return res.status(400).json({ chyba: 'Zadej platný e-mail.' });

    const sb = supabase();
    const { data: tymy } = await sb.from('omg_tymy').select('*').eq('hra', HRA).eq('stav', 'zaplaceno').ilike('email', email).limit(5);
    const site = siteUrl(req);
    for (const tym of tymy || []) {
      // nejvýš jednou za 5 minut na tým
      if (tym.odkaz_odeslan_at && Date.now() - new Date(tym.odkaz_odeslan_at).getTime() < 5 * 60 * 1000) continue;
      await emailOdkazDoHry({ tym, site }).catch((e) => console.error('odkaz e-mail:', e));
      await sb.from('omg_tymy').update({ odkaz_odeslan_at: new Date().toISOString() }).eq('id', tym.id);
    }
    return res.status(200).json({ uspech: true });
  } catch (err) {
    console.error('odkaz:', err);
    return res.status(500).json({ chyba: 'Nastala neočekávaná chyba.' });
  }
}
