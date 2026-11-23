// ════════════════════════════════════════════════════════════════════
//  /api/kontakt.js — zpráva z formuláře „Napiš nám" v kontaktu
//  POST { email, jmeno?, zprava, web? } → { uspech: true }
//  Zpráva odejde správci e-mailem, odpověď míří rovnou pisateli.
// ════════════════════════════════════════════════════════════════════

import { ENV, cors, jeEmail, escHtml, brevoSend } from '../lib/spolecne.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ chyba: 'Pouze POST.' });

  try {
    const d = req.body || {};
    // skryté pole pro roboty: vyplněné = tichý úspěch bez odeslání
    if (String(d.web || '').trim()) return res.status(200).json({ uspech: true });

    const email  = String(d.email || '').trim().toLowerCase().substring(0, 200);
    const jmeno  = String(d.jmeno || '').trim().replace(/\s+/g, ' ').substring(0, 80);
    const zprava = String(d.zprava || '').trim().substring(0, 3000);
    if (!jeEmail(email))     return res.status(400).json({ chyba: 'Zadej platný e-mail, na který ti odpovíme.' });
    if (zprava.length < 5)   return res.status(400).json({ chyba: 'Napiš nám prosím pár slov.' });

    const html = `<html><body style="font-family:Arial,sans-serif;color:#222;max-width:600px;margin:auto;padding:20px;">
      <h2 style="color:#5b2a9a;">✦ Zpráva z papavilon.cz</h2>
      <p><strong>Od:</strong> ${escHtml(jmeno || 'bez jména')} &lt;${escHtml(email)}&gt;</p>
      <p style="white-space:pre-wrap;font-size:15px;line-height:1.5;border-left:3px solid #c9a34a;padding-left:12px;">${escHtml(zprava)}</p>
      <p style="font-size:12px;color:#777;">Odpovědí na tento e-mail píšeš rovnou pisateli.</p>
    </body></html>`;
    await brevoSend({ to: { email: ENV.ADMIN_EMAIL, name: 'Papavilon' }, subject: `✦ Zpráva z webu Papavilon${jmeno ? ' — ' + jmeno : ''}`, html, replyTo: email });
    return res.status(200).json({ uspech: true });
  } catch (err) {
    console.error('kontakt:', err);
    return res.status(500).json({ chyba: 'Zprávu se teď nepodařilo odeslat. Napiš nám prosím na e-mail níže.' });
  }
}
