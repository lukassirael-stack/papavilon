// ════════════════════════════════════════════════════════════════════
//  /api/stripe-stav.js — stránka „Děkujeme" se po návratu ze Stripe
//  zeptá, zda je zaplaceno. Když ano, vstupenka se potvrdí hned
//  (i kdyby webhook dorazil později) a stránka ukáže odkaz do hry.
//  GET ?s=cs_...  → { stav, token }
// ════════════════════════════════════════════════════════════════════

import Stripe from 'stripe';
import { ENV, supabase, cors, siteUrl, oznacZaplaceno } from '../lib/spolecne.js';

export default async function handler(req, res) {
  if (cors(req, res, 'GET, OPTIONS')) return;
  if (req.method !== 'GET') return res.status(405).json({ chyba: 'Pouze GET.' });

  const sessionId = String(req.query.s || '');
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) return res.status(400).json({ chyba: 'Neplatná platba.' });

  try {
    const sb = supabase();
    const { data: tym } = await sb.from('omg_tymy').select('*').eq('stripe_session_id', sessionId).maybeSingle();
    if (!tym) return res.status(404).json({ chyba: 'Vstupenka k této platbě nebyla nalezena.' });
    if (tym.stav === 'zaplaceno') return res.status(200).json({ stav: 'zaplaceno', token: tym.token });

    const stripe = new Stripe(ENV.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status === 'paid') {
      const { tym: upd } = await oznacZaplaceno({
        tymId: tym.id, site: siteUrl(req), zdroj: 'stripe-stav',
        stripe: { session_id: session.id, payment_intent: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id },
      });
      return res.status(200).json({ stav: upd.stav, token: upd.token });
    }
    return res.status(200).json({ stav: 'ceka_platbu' });
  } catch (err) {
    console.error('stripe-stav:', err);
    return res.status(500).json({ chyba: 'Stav platby se nepodařilo ověřit.' });
  }
}
