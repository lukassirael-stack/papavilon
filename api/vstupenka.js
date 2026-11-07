// ════════════════════════════════════════════════════════════════════
//  /api/vstupenka.js — koupě vstupenky (1 vstupenka = 1 tým, 300 Kč)
//  POST { email, platba: 'stripe' | 'prevod', souhlas: true, zdroj?, beta? }
//   → stripe: { url }  (přesměrování na Stripe Checkout)
//   → prevod: { vs, castka, spayd, qr, ucet, token }  (QR k platbě + e-mail)
// ════════════════════════════════════════════════════════════════════

import Stripe from 'stripe';
import {
  CENA, HRA, NAZEV_HRY, ENV, UCET, supabase, cors, siteUrl, jeEmail,
  registraceOtevrena, generujSPAYD, qrUrl, emailPlatbaPrevodem, emailAdmin,
} from '../lib/spolecne.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ chyba: 'Pouze POST.' });

  try {
    const d = req.body || {};
    const email  = String(d.email || '').trim().toLowerCase();
    const platba = d.platba === 'prevod' ? 'prevod' : 'stripe';

    if (!registraceOtevrena(d.beta)) return res.status(403).json({ chyba: 'Registrace se otevírá 27. listopadu 2026.' });
    if (!jeEmail(email))            return res.status(400).json({ chyba: 'Zadej platný e-mail, tam ti přijde odkaz do hry.' });
    if (!d.souhlas)                 return res.status(400).json({ chyba: 'Potvrď prosím souhlas s pravidly hry.' });

    const sb = supabase();
    const { data: tym, error } = await sb.from('omg_tymy').insert({
      hra: HRA, email, castka: CENA, platba, souhlas: true,
      zdroj: d.zdroj ? String(d.zdroj).substring(0, 200) : null,
    }).select('*').single();
    if (error) { console.error('Supabase insert:', error); return res.status(500).json({ chyba: 'Vstupenku se nepodařilo založit. Zkus to prosím za chvíli.' }); }

    const site = siteUrl(req);

    // ── Stripe Checkout ─────────────────────────────────────────────
    if (platba === 'stripe') {
      if (!ENV.STRIPE_SECRET_KEY) return res.status(500).json({ chyba: 'Platba kartou se právě připravuje, zvol prosím převod.' });
      const stripe = new Stripe(ENV.STRIPE_SECRET_KEY);
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        locale: 'cs',
        customer_email: email,
        line_items: [{
          quantity: 1,
          price_data: {
            currency: 'czk',
            unit_amount: CENA * 100,
            product_data: {
              name: `${NAZEV_HRY} — vstupenka pro tým`,
              description: 'Celý advent, čtyři kapitoly, Papavilonův hlas a hra o Vánoční Sigil.',
            },
          },
        }],
        metadata: { tym_id: tym.id, token: tym.token, hra: HRA },
        payment_intent_data: { description: `Vanocni jizda VS ${tym.vs}` },
        success_url: `${site}/dekujeme?s={CHECKOUT_SESSION_ID}`,
        cancel_url:  `${site}/vstupenka?zruseno=1`,
      });
      await sb.from('omg_tymy').update({ stripe_session_id: session.id }).eq('id', tym.id);
      return res.status(200).json({ uspech: true, url: session.url });
    }

    // ── Převod na účet (QR) ─────────────────────────────────────────
    const spayd = generujSPAYD({ castka: CENA, vs: tym.vs, zprava: `Vanocni jizda ${tym.vs}` });
    await Promise.allSettled([
      emailPlatbaPrevodem({ tym, spayd }),
      emailAdmin({ predmet: 'Nová objednávka převodem — Vánoční jízda', radky: [['E-mail', email], ['VS', tym.vs], ['Částka', `${CENA} Kč`]] }),
    ]);
    return res.status(200).json({
      uspech: true, platba: 'prevod', vs: tym.vs, castka: CENA, spayd, qr: qrUrl(spayd), token: tym.token,
      ucet: { ucet: UCET.ucet, iban: UCET.iban, banka: UCET.banka, prijemce: UCET.prijemceZobrazit, zprava: `Vanocni jizda ${tym.vs}` },
    });
  } catch (err) {
    console.error('vstupenka:', err);
    return res.status(500).json({ chyba: 'Nastala neočekávaná chyba. Zkus to prosím znovu.' });
  }
}
