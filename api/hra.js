// ════════════════════════════════════════════════════════════════════
//  /api/hra.js — herní akce týmu na stanovišti
//  POST { k, akce: 'odpoved' | 'napoveda' | 'napoveda_over' | 'hotovo' | 'krystaly' | 'preskocit', stanoviste_id, odpoved?, n? }
//  → { vysledek, hra: { kapitoly }, tym }   nápověda: { vysledek: 'platba', url } → Stripe (40 Kč)
// ════════════════════════════════════════════════════════════════════

import Stripe from 'stripe';
import { ENV, HRA, NAZEV_HRY, CENA_NAPOVEDY, supabase, cors, siteUrl, jeAdmin, normalizuj, verejnyTym } from '../lib/spolecne.js';
import { stavHry, ulozKrystaly, odemkniNapovedu } from '../lib/hra.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ chyba: 'Pouze POST.' });

  try {
    const d = req.body || {};
    const sb = supabase();
    const admin = jeAdmin(req);

    if (!/^[a-f0-9]{32}$/.test(String(d.k || ''))) return res.status(404).json({ chyba: 'Tenhle odkaz neznáme.' });
    const { data: tym } = await sb.from('omg_tymy').select('*').eq('token', d.k).maybeSingle();
    if (!tym) return res.status(404).json({ chyba: 'Tenhle odkaz neznáme.' });
    if (tym.stav !== 'zaplaceno' || !tym.nazev_tymu) return res.status(403).json({ chyba: 'Nejdřív pojmenuj svůj tým.' });

    const sid = parseInt(d.stanoviste_id, 10);
    if (!sid) return res.status(400).json({ chyba: 'Chybí stanoviště.' });

    // stanoviště musí být pro tým právě otevřené
    const hra = await stavHry(tym, { admin });
    let stan = null;
    for (const k of hra.kapitoly) for (const s of k.stanoviste) if (s.id === sid) stan = s;
    if (!stan) return res.status(403).json({ chyba: 'Tohle světlo se ti zatím neukázalo.' });
    if (stan.stav === 'vyreseno' || stan.stav === 'preskoceno') return res.status(200).json({ vysledek: 'hotovo', hra, tym: verejnyTym(tym) });
    if (stan.stav !== 'otevreno') return res.status(403).json({ chyba: 'Nejdřív vyřeš předchozí stanoviště.' });

    const { data: plne } = await sb.from('omg_stanoviste').select('*').eq('id', sid).single();
    const { data: p } = await sb.from('omg_pokrok').select('*').eq('tym_id', tym.id).eq('stanoviste_id', sid).maybeSingle();
    const ted = new Date().toISOString();
    const zaklad = { tym_id: tym.id, stanoviste_id: sid, pokusy: p?.pokusy || 0, napoveda_at: p?.napoveda_at || null };

    const hotovo = async (extra) => {
      await sb.from('omg_pokrok').upsert({ ...zaklad, ...extra }, { onConflict: 'tym_id,stanoviste_id' });
      const { data: t2 } = await sb.from('omg_tymy').select('*').eq('id', tym.id).single();
      return res.status(200).json({ vysledek: extra.preskoceno ? 'preskoceno' : 'spravne', hra: await stavHry(t2, { admin }), tym: verejnyTym(t2) });
    };

    const ukazNapovedu = async () => res.status(200).json({ vysledek: 'napoveda', napoveda: plne.napoveda, hra: await stavHry(tym, { admin }), tym: verejnyTym(tym) });

    // ── nápověda: koupě přes Stripe (správce ji vidí zdarma) ──────
    if (d.akce === 'napoveda') {
      if (!plne.napoveda) return res.status(400).json({ chyba: 'Tady Papavilon nápovědu nechystá.' });
      if (zaklad.napoveda_at) return ukazNapovedu();
      if (admin) { await odemkniNapovedu({ tymId: tym.id, stanovisteId: sid, platba: 'spravce', castka: 0 }); return ukazNapovedu(); }
      if (!ENV.STRIPE_SECRET_KEY) return res.status(500).json({ chyba: 'Platba nápovědy se právě připravuje.' });
      const stripe = new Stripe(ENV.STRIPE_SECRET_KEY);
      const site = siteUrl(req);
      const session = await stripe.checkout.sessions.create({
        mode: 'payment', locale: 'cs', customer_email: tym.email || undefined,
        line_items: [{ quantity: 1, price_data: { currency: 'czk', unit_amount: CENA_NAPOVEDY * 100,
          product_data: { name: `Papavilonova nápověda — ${plne.nazev || 'světlo'}`, description: NAZEV_HRY } } }],
        metadata: { typ: 'napoveda', hra: HRA, tym_id: tym.id, stanoviste_id: String(sid) },
        payment_intent_data: { description: `Napoveda VS ${tym.vs} svetlo ${sid}` },
        success_url: `${site}/tym?k=${tym.token}&n={CHECKOUT_SESSION_ID}&s=${sid}`,
        cancel_url:  `${site}/tym?k=${tym.token}`,
      });
      return res.status(200).json({ vysledek: 'platba', url: session.url });
    }

    // ── nápověda: ověření po návratu ze Stripe ────────────────────
    if (d.akce === 'napoveda_over') {
      if (zaklad.napoveda_at) return ukazNapovedu();
      const n = String(d.n || '');
      if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(n)) return res.status(400).json({ chyba: 'Neplatná platba.' });
      const session = await new Stripe(ENV.STRIPE_SECRET_KEY).checkout.sessions.retrieve(n);
      const m = session.metadata || {};
      if (m.typ !== 'napoveda' || m.tym_id !== tym.id || String(m.stanoviste_id) !== String(sid)) return res.status(400).json({ chyba: 'Platba nepatří k tomuto světlu.' });
      if (session.payment_status !== 'paid') return res.status(402).json({ chyba: 'Platba zatím nedorazila. Zkus to za chvilku znovu.' });
      await odemkniNapovedu({ tymId: tym.id, stanovisteId: sid, platba: session.id, castka: Math.round((session.amount_total || 0) / 100) });
      return ukazNapovedu();
    }

    // ── informační stanoviště: jen pokračovat ─────────────────────
    if (d.akce === 'hotovo') {
      if (plne.typ !== 'info') return res.status(400).json({ chyba: 'Tady se čeká na odpověď.' });
      return hotovo({ vyreseno_at: ted, body: 0, odpoved: null });
    }

    // ── světlo „krystal“: tým zapíše čísla krystalů svých hráčů ───
    if (d.akce === 'krystaly') {
      if (plne.typ !== 'krystal') return res.status(400).json({ chyba: 'Tady se krystaly nezapisují.' });
      const v = await ulozKrystaly(tym, d.krystaly);
      if (v.chyba) return res.status(v.status).json({ chyba: v.chyba });
      return hotovo({ vyreseno_at: ted, body: 0, odpoved: v.hraci.map((h) => `${h.jmeno} ${h.krystal}`).join(', ') });
    }

    // ── přeskočit (po 5 pokusech; světlo s tajenkou se luští do konce) ──
    if (d.akce === 'preskocit') {
      if (!stan.muze_preskocit) return res.status(400).json({ chyba: 'Tohle světlo je potřeba rozluštit.' });
      return hotovo({ vyreseno_at: ted, preskoceno: true, body: 0, odpoved: null });
    }

    // ── odpověď ───────────────────────────────────────────────────
    if (d.akce === 'odpoved') {
      if (plne.typ !== 'odpoved') return res.status(400).json({ chyba: 'Tady se odpověď nezapisuje.' });
      const odpoved = String(d.odpoved || '').trim().substring(0, 200);
      if (!normalizuj(odpoved)) return res.status(400).json({ chyba: 'Napiš odpověď.' });

      // klid mezi pokusy
      const { data: posledni } = await sb.from('omg_pokusy').select('created_at').eq('tym_id', tym.id).eq('stanoviste_id', sid)
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (posledni && Date.now() - new Date(posledni.created_at).getTime() < 3000) {
        return res.status(429).json({ chyba: 'Chviličku… Papavilon ještě přemýšlí nad tou předchozí.' });
      }

      const spravne = (plne.odpovedi || []).some((a) => normalizuj(a) && normalizuj(a) === normalizuj(odpoved));
      await sb.from('omg_pokusy').insert({ tym_id: tym.id, stanoviste_id: sid, odpoved, spravne });
      zaklad.pokusy += 1;

      if (spravne) return hotovo({ vyreseno_at: ted, body: 0, odpoved });

      await sb.from('omg_pokrok').upsert(zaklad, { onConflict: 'tym_id,stanoviste_id' });
      return res.status(200).json({ vysledek: 'spatne', pokusy: zaklad.pokusy, hra: await stavHry(tym, { admin }), tym: verejnyTym(tym) });
    }

    return res.status(400).json({ chyba: 'Neznámá akce.' });
  } catch (err) {
    console.error('hra:', err);
    return res.status(500).json({ chyba: 'Nastala neočekávaná chyba.' });
  }
}
