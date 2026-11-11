// ════════════════════════════════════════════════════════════════════
//  /api/los.js — losovací číslo zdarma (bez vstupenky)
//  POST { jmeno, email, souhlas } → { cislo: 'Z-12' } + e-mail s číslem
//  Do štědrovečerního losování se tak může zapojit kdokoli i bez nákupu.
// ════════════════════════════════════════════════════════════════════

import { HRA, supabase, cors, jeEmail, brevoSend, escHtml, ENV } from '../lib/spolecne.js';

const KONEC = new Date('2026-12-23T23:59:59+01:00').getTime();

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ chyba: 'Pouze POST.' });
  try {
    const d = req.body || {};
    const jmeno = String(d.jmeno || '').trim().replace(/\s+/g, ' ').substring(0, 60);
    const email = String(d.email || '').trim().toLowerCase();
    if (Date.now() > KONEC) return res.status(403).json({ chyba: 'Losovací čísla se vydávala do 23. 12.' });
    if (jmeno.length < 2) return res.status(400).json({ chyba: 'Napiš své jméno.' });
    if (!jeEmail(email)) return res.status(400).json({ chyba: 'Zadej platný e-mail, pošleme na něj tvé číslo.' });
    if (!d.souhlas) return res.status(400).json({ chyba: 'Potvrď prosím souhlas s pravidly losování.' });

    const sb = supabase();
    // jedno číslo zdarma na e-mail
    const { data: uz } = await sb.from('omg_los_zdarma').select('id').eq('hra', HRA).ilike('email', email).maybeSingle();
    if (uz) return res.status(200).json({ uspech: true, cislo: `Z-${uz.id}`, existuje: true });

    const { data, error } = await sb.from('omg_los_zdarma').insert({ hra: HRA, jmeno, email }).select('id').single();
    if (error) { console.error('los insert:', error); return res.status(500).json({ chyba: 'Číslo se nepodařilo vydat, zkus to prosím znovu.' }); }
    const cislo = `Z-${data.id}`;

    await brevoSend({
      to: { email, name: jmeno },
      subject: `Tvé losovací číslo ${cislo} ✦ Velká Vánoční jízda`,
      html: `<div style="font-family:Georgia,serif;background:#0d1440;color:#f3e6cc;padding:30px;text-align:center">
        <h1 style="color:#f6d27a;font-size:22px;letter-spacing:2px">TVÉ LOSOVACÍ ČÍSLO</h1>
        <p style="font-size:40px;color:#f6d27a;margin:16px 0">${cislo}</p>
        <p>Ahoj ${escHtml(jmeno)}, jsi zařazen/a do štědrovečerního losování Papavilonových darů.</p>
        <p>Losuje se 24. 12. v 10:00 na <a href="https://papavilon.cz" style="color:#f6d27a">papavilon.cz</a>.</p>
        <p style="font-size:12px;color:#a99cc7;margin-top:24px">Outdoor Magic Games · Kroměříž · ${ENV.ADMIN_EMAIL}</p></div>`,
      replyTo: ENV.ADMIN_EMAIL,
    }).catch((e) => console.error('los e-mail:', e));

    return res.status(200).json({ uspech: true, cislo });
  } catch (err) {
    console.error('los:', err);
    return res.status(500).json({ chyba: 'Nastala neočekávaná chyba.' });
  }
}
