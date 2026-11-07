// ════════════════════════════════════════════════════════════════════
//  /api/stripe-webhook.js — Stripe pošle checkout.session.completed
//  → vstupenka se označí jako zaplacená a týmu odejde odkaz do hry.
//  Ve Stripe: Developers → Webhooks → endpoint {SITE_URL}/api/stripe-webhook
//  událost: checkout.session.completed → signing secret do STRIPE_WEBHOOK_SECRET
// ════════════════════════════════════════════════════════════════════

import Stripe from 'stripe';
import { ENV, HRA, supabase, siteUrl, oznacZaplaceno } from '../lib/spolecne.js';

export const config = { api: { bodyParser: false } };

function rawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Pouze POST.');
  if (!ENV.STRIPE_SECRET_KEY || !ENV.STRIPE_WEBHOOK_SECRET) return res.status(500).send('Stripe není nastaven.');

  const stripe = new Stripe(ENV.STRIPE_SECRET_KEY);
  let event;
  try {
    const body = await rawBody(req);
    event = stripe.webhooks.constructEvent(body, req.headers['stripe-signature'], ENV.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook podpis:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      const session = event.data.object;
      if (session.payment_status !== 'paid') return res.status(200).json({ received: true, ceka: true });
      if (session.metadata?.hra && session.metadata.hra !== HRA) return res.status(200).json({ received: true, jina_hra: true });

      let tymId = session.metadata?.tym_id || null;
      if (!tymId) {
        const { data } = await supabase().from('omg_tymy').select('id').eq('stripe_session_id', session.id).maybeSingle();
        tymId = data?.id || null;
      }
      if (!tymId) { console.error('Webhook: tým pro session nenalezen', session.id); return res.status(200).json({ received: true, nenalezeno: true }); }

      await oznacZaplaceno({
        tymId, site: siteUrl(req), zdroj: 'stripe',
        stripe: { session_id: session.id, payment_intent: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id },
      });
    }
    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('Webhook zpracování:', err);
    return res.status(500).send('Chyba zpracování.');
  }
}
