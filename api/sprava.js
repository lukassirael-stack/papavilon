// ════════════════════════════════════════════════════════════════════
//  /api/sprava.js — správa hry (týmy, kapitoly, stanoviště)
//  Hlavička x-admin-key musí odpovídat ADMIN_KEY.
//  POST { akce, ...data }
// ════════════════════════════════════════════════════════════════════

import { HRA, CENA, supabase, cors, jeAdmin, siteUrl, oznacZaplaceno, emailOdkazDoHry, jeEmail, registraceOd } from '../lib/spolecne.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ chyba: 'Pouze POST.' });
  if (!jeAdmin(req)) return res.status(401).json({ chyba: 'Neplatný klíč správy.' });

  const d = req.body || {};
  const sb = supabase();
  const site = siteUrl(req);

  try {
    switch (d.akce) {

      // ── přehled: čísla, týmy, obsah ─────────────────────────────
      case 'prehled': {
        const [{ data: tymy }, { data: kapitoly }, { data: stanoviste }, { data: napovedy }] = await Promise.all([
          sb.from('omg_tymy').select('id, vs, email, platba, stav, castka, zaplaceno_at, nazev_tymu, pocet_hracu, vek_hracu, hraci, body, registrovano_at, created_at, poznamka, zdroj, odkaz_odeslan_at, token')
            .eq('hra', HRA).order('created_at', { ascending: false }).limit(1000),
          sb.from('omg_kapitoly').select('*').eq('hra', HRA).order('poradi'),
          sb.from('omg_stanoviste').select('*').order('kapitola_id').order('poradi'),
          sb.from('omg_pokrok').select('napoveda_castka').not('napoveda_platba', 'is', null),
        ]);
        const placene = (napovedy || []).filter((x) => (x.napoveda_castka || 0) > 0);
        const t = tymy || [];
        const od = await registraceOd();
        return res.status(200).json({
          prodej: { registrace_od: od, otevreno: Date.now() >= new Date(od).getTime() },
          cisla: {
            celkem: t.length,
            ceka: t.filter((x) => x.stav === 'ceka_platbu').length,
            zaplaceno: t.filter((x) => x.stav === 'zaplaceno').length,
            registrovano: t.filter((x) => x.stav === 'zaplaceno' && x.nazev_tymu).length,
            trzba: t.filter((x) => x.stav === 'zaplaceno').reduce((s, x) => s + (x.castka || 0), 0),
            napovedy: placene.length,
            trzba_napovedy: placene.reduce((s, x) => s + (x.napoveda_castka || 0), 0),
          },
          tymy: t, kapitoly: kapitoly || [], stanoviste: stanoviste || [],
        });
      }

      // ── prodej vstupenek: otevřít hned / od data / zavřít ───────
      case 'prodej.nastav': {
        let od;
        if (d.rezim === 'hned') od = new Date();
        else if (d.rezim === 'zavrit') od = new Date('2099-01-01T00:00:00Z');
        else od = new Date(d.registrace_od);
        if (Number.isNaN(od.getTime())) return res.status(400).json({ chyba: 'Zadej platné datum a čas.' });
        const { error } = await sb.from('nastaveni').upsert({ klic: 'omg_registrace_od', hodnota: od.toISOString() }, { onConflict: 'klic' });
        if (error) return res.status(400).json({ chyba: error.message });
        return res.status(200).json({ uspech: true, registrace_od: od.toISOString(), otevreno: Date.now() >= od.getTime() });
      }

      // ── losovací čísla: hráči s krystalem + čísla zdarma ────────
      case 'losovani': {
        const { data: tymy } = await sb.from('omg_tymy').select('nazev_tymu, email, hraci').eq('hra', HRA).eq('stav', 'zaplaceno').not('nazev_tymu', 'is', null);
        const radky = [];
        for (const t of tymy || []) for (const h of t.hraci || []) if (h.krystal) radky.push({ cislo: h.krystal, jmeno: h.jmeno, vek: h.vek, tym: t.nazev_tymu, email: t.email, zdroj: 'krystal' });
        return res.status(200).json({ radky });
      }

      // ── týmy ────────────────────────────────────────────────────
      case 'tymy.zaplaceno': {
        const { tym, novePotvrzeno } = await oznacZaplaceno({ tymId: d.id, site, zdroj: 'sprava' });
        return res.status(200).json({ uspech: true, novePotvrzeno, stav: tym.stav });
      }
      case 'tymy.odkaz': {
        const { data: tym } = await sb.from('omg_tymy').select('*').eq('id', d.id).single();
        if (!tym || tym.stav !== 'zaplaceno') return res.status(400).json({ chyba: 'Odkaz se posílá jen zaplaceným týmům.' });
        await emailOdkazDoHry({ tym, site });
        await sb.from('omg_tymy').update({ odkaz_odeslan_at: new Date().toISOString() }).eq('id', d.id);
        return res.status(200).json({ uspech: true });
      }
      case 'tymy.poznamka': {
        await sb.from('omg_tymy').update({ poznamka: String(d.poznamka || '').substring(0, 500) || null }).eq('id', d.id);
        return res.status(200).json({ uspech: true });
      }
      case 'tymy.zrusit': {
        await sb.from('omg_tymy').update({ stav: 'zruseno' }).eq('id', d.id).eq('stav', 'ceka_platbu');
        return res.status(200).json({ uspech: true });
      }
      case 'tymy.vytvor': {
        // vstupenka založená ve správě (beta rodiny, školy, dárek) — rovnou zaplacená, odkaz odejde e-mailem
        const email = String(d.email || '').trim().toLowerCase();
        if (!jeEmail(email)) return res.status(400).json({ chyba: 'Zadej platný e-mail.' });
        const { data: tym, error } = await sb.from('omg_tymy').insert({
          hra: HRA, email, castka: d.castka === 0 ? 0 : CENA, pocet_hracu: 4, platba: 'prevod', souhlas: true,
          zdroj: 'sprava', poznamka: String(d.poznamka || 'založeno ve správě').substring(0, 500),
        }).select('*').single();
        if (error) { console.error(error); return res.status(500).json({ chyba: 'Založení se nepovedlo.' }); }
        await oznacZaplaceno({ tymId: tym.id, site, zdroj: 'sprava' });
        return res.status(200).json({ uspech: true, token: tym.token, odkaz: `${site}/tym?k=${tym.token}` });
      }
      case 'tymy.postup': {
        const { data } = await sb.from('omg_pokrok').select('*, omg_stanoviste(nazev, kapitola_id, poradi)').eq('tym_id', d.id);
        const { data: pokusy } = await sb.from('omg_pokusy').select('*').eq('tym_id', d.id).order('created_at', { ascending: false }).limit(200);
        return res.status(200).json({ pokrok: data || [], pokusy: pokusy || [] });
      }

      // ── kapitoly ────────────────────────────────────────────────
      case 'kapitola.uloz': {
        const z = {
          nazev: String(d.nazev || '').trim() || 'Kapitola', podtitul: d.podtitul || null, uvod: d.uvod || null,
          audio_url: d.audio_url || null, aktivni: d.aktivni !== false,
        };
        if (d.otevreno_od) z.otevreno_od = new Date(d.otevreno_od).toISOString();
        const { error } = await sb.from('omg_kapitoly').update(z).eq('id', d.id);
        if (error) return res.status(400).json({ chyba: error.message });
        return res.status(200).json({ uspech: true });
      }

      // ── stanoviště ──────────────────────────────────────────────
      case 'stanoviste.uloz': {
        const odpovedi = Array.isArray(d.odpovedi) ? d.odpovedi
          : String(d.odpovedi || '').split(/[\n;|]+/).map((s) => s.trim()).filter(Boolean);
        const z = {
          kapitola_id: parseInt(d.kapitola_id, 10), poradi: parseInt(d.poradi, 10) || 1,
          typ: ['info', 'krystal'].includes(d.typ) ? d.typ : 'odpoved',
          nazev: String(d.nazev || '').trim() || 'Světlo', misto: d.misto || null, zadani: d.zadani || null, napoveda: d.napoveda || null,
          audio_url: d.audio_url || null, obrazek_url: d.obrazek_url || null, odpovedi,
          aktivni: d.aktivni !== false,
        };
        if (!z.kapitola_id) return res.status(400).json({ chyba: 'Chybí kapitola.' });
        if (z.typ === 'odpoved' && odpovedi.length === 0) return res.status(400).json({ chyba: 'Doplň aspoň jednu uznávanou odpověď.' });
        const q = d.id ? sb.from('omg_stanoviste').update(z).eq('id', d.id) : sb.from('omg_stanoviste').insert(z);
        const { data, error } = await q.select('*').single();
        if (error) return res.status(400).json({ chyba: error.message });
        return res.status(200).json({ uspech: true, stanoviste: data });
      }
      case 'stanoviste.smaz': {
        const { error } = await sb.from('omg_stanoviste').delete().eq('id', d.id);
        if (error) return res.status(400).json({ chyba: error.message });
        return res.status(200).json({ uspech: true });
      }

      default:
        return res.status(400).json({ chyba: 'Neznámá akce.' });
    }
  } catch (err) {
    console.error('sprava:', err);
    return res.status(500).json({ chyba: err.message || 'Nastala neočekávaná chyba.' });
  }
}
