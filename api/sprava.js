// ════════════════════════════════════════════════════════════════════
//  /api/sprava.js — správa hry (týmy, kapitoly, stanoviště)
//  Hlavička x-admin-key musí odpovídat ADMIN_KEY.
//  POST { akce, ...data }
// ════════════════════════════════════════════════════════════════════

import { HRA, CENA, supabase, cors, jeAdmin, siteUrl, oznacZaplaceno, emailOdkazDoHry, jeEmail } from '../lib/spolecne.js';

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
        const [{ data: tymy }, { data: kapitoly }, { data: stanoviste }] = await Promise.all([
          sb.from('omg_tymy').select('id, vs, email, platba, stav, castka, zaplaceno_at, nazev_tymu, pocet_hracu, vek_hracu, body, registrovano_at, created_at, poznamka, zdroj, odkaz_odeslan_at, token')
            .eq('hra', HRA).order('created_at', { ascending: false }).limit(1000),
          sb.from('omg_kapitoly').select('*').eq('hra', HRA).order('poradi'),
          sb.from('omg_stanoviste').select('*').order('kapitola_id').order('poradi'),
        ]);
        const t = tymy || [];
        return res.status(200).json({
          cisla: {
            celkem: t.length,
            ceka: t.filter((x) => x.stav === 'ceka_platbu').length,
            zaplaceno: t.filter((x) => x.stav === 'zaplaceno').length,
            registrovano: t.filter((x) => x.stav === 'zaplaceno' && x.nazev_tymu).length,
            trzba: t.filter((x) => x.stav === 'zaplaceno').reduce((s, x) => s + (x.castka || 0), 0),
          },
          tymy: t, kapitoly: kapitoly || [], stanoviste: stanoviste || [],
        });
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
          hra: HRA, email, castka: d.castka === 0 ? 0 : CENA, platba: 'prevod', souhlas: true,
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
          typ: d.typ === 'info' ? 'info' : 'odpoved',
          nazev: String(d.nazev || '').trim() || 'Světlo', misto: d.misto || null, zadani: d.zadani || null, napoveda: d.napoveda || null,
          audio_url: d.audio_url || null, obrazek_url: d.obrazek_url || null, odpovedi,
          body: parseInt(d.body, 10) >= 0 ? parseInt(d.body, 10) : 100,
          srazka_napoveda: parseInt(d.srazka_napoveda, 10) >= 0 ? parseInt(d.srazka_napoveda, 10) : 20,
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
