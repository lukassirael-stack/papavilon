// ════════════════════════════════════════════════════════════════════
//  /api/navsteva.js — anonymní měření návštěvnosti (bez cookies, bez IP)
//  POST { relace, stranka, referrer?, zdroj?, zarizeni? } → { id }
//  POST { id, relace, doba }                              → { uspech }   (doba na stránce ve vteřinách)
//  Relace je náhodné číslo jedné návštěvy v prohlížeči (sessionStorage).
// ════════════════════════════════════════════════════════════════════

import { supabase, cors } from '../lib/spolecne.js';

const ROBOT = /bot|crawl|spider|slurp|preview|headless|lighthouse|pingdom|uptime|monitor|facebookexternalhit|whatsapp|curl|wget|python|node-fetch|axios/i;
const cisti = (v, n) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().substring(0, n);

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ chyba: 'Pouze POST.' });
  try {
    let d = req.body || {};
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { d = {}; } }
    if (ROBOT.test(String(req.headers['user-agent'] || ''))) return res.status(200).json({ uspech: true });

    const relace = cisti(d.relace, 40);
    if (!/^[a-z0-9-]{8,40}$/i.test(relace)) return res.status(200).json({ uspech: true });
    const sb = supabase();

    if (d.id) {
      const doba = Math.max(0, Math.min(3600, Math.round(Number(d.doba) || 0)));
      await sb.from('omg_navstevy').update({ doba_s: doba }).eq('id', Number(d.id)).eq('relace', relace);
      return res.status(200).json({ uspech: true });
    }

    // jen cesta stránky, bez parametrů (v parametrech bývá osobní odkaz do hry)
    const stranka = cisti(String(d.stranka || '/').split('?')[0].split('#')[0], 120) || '/';
    const { data, error } = await sb.from('omg_navstevy').insert({
      relace, stranka,
      referrer: cisti(d.referrer, 120) || null,
      zdroj: cisti(d.zdroj, 60).toLowerCase() || null,
      zarizeni: ['mobil', 'tablet', 'desktop'].includes(d.zarizeni) ? d.zarizeni : null,
    }).select('id').single();
    if (error) throw new Error(error.message);
    return res.status(200).json({ id: data.id });
  } catch (err) {
    console.error('navsteva:', err);
    return res.status(200).json({ uspech: false });
  }
}
