// ════════════════════════════════════════════════════════════════════
//  /api/sprava.js — správa hry (týmy, kapitoly, stanoviště)
//  Hlavička x-admin-key musí odpovídat ADMIN_KEY.
//  POST { akce, ...data }
// ════════════════════════════════════════════════════════════════════

import { HRA, CENA, supabase, cors, jeAdmin, siteUrl, oznacZaplaceno, emailOdkazDoHry, jeEmail, registraceOd } from '../lib/spolecne.js';
import { seznamSkutku, PREDPREMIERA_MAX } from '../lib/hra.js';

const POKUSY = new Map(), MAX_POKUSU = 8, OKNO_MS = 15 * 60 * 1000;

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ chyba: 'Pouze POST.' });
  // ochrana proti hádání klíče: po několika chybných pokusech z jedné adresy správa na čas zamkne
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'neznama';
  const ted = Date.now(), z = POKUSY.get(ip);
  if (z && ted - z.od > OKNO_MS) POKUSY.delete(ip);
  if ((POKUSY.get(ip)?.n || 0) >= MAX_POKUSU) return res.status(429).json({ chyba: 'Příliš mnoho pokusů. Zkus to prosím za čtvrt hodiny.' });
  if (!jeAdmin(req)) {
    if (!req.headers['x-admin-key']) return res.status(401).json({ chyba: 'Neplatný klíč správy.' });   // stránka bez přihlášení se do pokusů nepočítá
    const p = POKUSY.get(ip) || { n: 0, od: ted }; p.n++; POKUSY.set(ip, p);
    if (POKUSY.size > 5000) POKUSY.clear();
    await new Promise((r) => setTimeout(r, 700));
    return res.status(401).json({ chyba: 'Neplatný klíč správy.' });
  }
  POKUSY.delete(ip);

  const d = req.body || {};
  const sb = supabase();
  const site = siteUrl(req);

  try {
    switch (d.akce) {

      // ── přehled: čísla, týmy, obsah ─────────────────────────────
      case 'prehled': {
        const [{ data: tymy }, { data: kapitoly }, { data: stanoviste }] = await Promise.all([
          sb.from('omg_tymy').select('id, vs, email, platba, stav, castka, zaplaceno_at, nazev_tymu, pocet_hracu, vek_hracu, hraci, body, registrovano_at, created_at, poznamka, zdroj, odkaz_odeslan_at, token, predpremiera')
            .eq('hra', HRA).order('created_at', { ascending: false }).limit(1000),
          sb.from('omg_kapitoly').select('*').eq('hra', HRA).order('poradi'),
          sb.from('omg_stanoviste').select('*').order('kapitola_id').order('poradi'),
        ]);
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
          },
          predpremiera: { pocet: t.filter((x) => x.predpremiera).length, max: PREDPREMIERA_MAX },
          tymy: t, kapitoly: kapitoly || [], stanoviste: stanoviste || [], skutky: await seznamSkutku(),
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

      // ── dobré skutky: seznam, ze kterého Papavilon losuje, a kronika splněných ──
      case 'skutky.uloz': {
        const seznam = String(d.skutky || '').split(/\n+/).map((x) => x.trim().replace(/\s+/g, ' ')).filter(Boolean).slice(0, 100);
        if (!seznam.length) return res.status(400).json({ chyba: 'Napiš aspoň jeden dobrý skutek.' });
        const { error } = await sb.from('nastaveni').upsert({ klic: 'omg_skutky', hodnota: JSON.stringify(seznam) }, { onConflict: 'klic' });
        if (error) return res.status(400).json({ chyba: error.message });
        return res.status(200).json({ uspech: true, skutky: seznam });
      }
      case 'navstevnost': {
        // souhrn návštěvnosti za posledních N dní (dny podle pražského času)
        const dni = Math.max(1, Math.min(60, Number(d.dni) || 14));
        const od = new Date(Date.now() - dni * 86400000).toISOString();
        const radky = []; let posledni = 0;
        for (let i = 0; i < 40; i++) {
          const { data: cast, error } = await sb.from('omg_navstevy').select('id, relace, stranka, referrer, zdroj, zarizeni, doba_s, created_at').gt('created_at', od).gt('id', posledni).order('id', { ascending: true }).limit(1000);
          if (error) return res.status(400).json({ chyba: error.message });
          radky.push(...(cast || [])); if (!cast || cast.length < 1000) break; posledni = cast[cast.length - 1].id;
        }
        const denPraha = (iso) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date(iso));
        const dny = new Map(), stranky = new Map(), zdroje = new Map(), zarizeni = new Map(), relace = new Set(), uVstupenky = new Set(), prvni = new Map();
        let doba = 0, sDobou = 0;
        for (const r of radky) {
          const den = denPraha(r.created_at); if (!dny.has(den)) dny.set(den, { den, zobrazeni: 0, r: new Set() });
          dny.get(den).zobrazeni++; dny.get(den).r.add(r.relace);
          stranky.set(r.stranka, (stranky.get(r.stranka) || 0) + 1);
          relace.add(r.relace); if (r.stranka === '/vstupenka') uVstupenky.add(r.relace);
          if (!prvni.has(r.relace)) prvni.set(r.relace, r);
          if (r.doba_s > 0) { doba += r.doba_s; sDobou++; }
        }
        for (const r of prvni.values()) {
          const z = r.zdroj || r.referrer || 'přímo / odkaz'; zdroje.set(z, (zdroje.get(z) || 0) + 1);
          const k = r.zarizeni || 'jiné'; zarizeni.set(k, (zarizeni.get(k) || 0) + 1);
        }
        const { data: tymy } = await sb.from('omg_tymy').select('stav, zdroj, created_at').eq('hra', HRA).gt('created_at', od);
        const objednavky = (tymy || []).filter((t) => t.zdroj !== 'sprava');
        const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([nazev, pocet]) => ({ nazev, pocet }));
        return res.status(200).json({
          dni,
          celkem: { navstevy: relace.size, zobrazeni: radky.length, prumerna_doba_s: sDobou ? Math.round(doba / sDobou) : 0 },
          dny: [...dny.values()].sort((a, b) => b.den.localeCompare(a.den)).map((x) => ({ den: x.den, navstevy: x.r.size, zobrazeni: x.zobrazeni })),
          stranky: top(stranky, 10), zdroje: top(zdroje, 10), zarizeni: top(zarizeni, 4),
          cesta: { navstevy: relace.size, vstupenka: uVstupenky.size, objednavky: objednavky.length, zaplaceno: objednavky.filter((t) => t.stav === 'zaplaceno').length },
        });
      }
      case 'skutky.kronika': {
        const [{ data: radky }, { data: tymy }] = await Promise.all([
          sb.from('omg_pokrok').select('tym_id, stanoviste_id, znameni'),
          sb.from('omg_tymy').select('id, nazev_tymu').eq('hra', HRA),
        ]);
        const jmeno = new Map((tymy || []).map((t) => [t.id, t.nazev_tymu]));
        const kronika = [];
        for (const r of radky || []) for (const z of Object.values(r.znameni || {})) if (z && z.skutek_at) kronika.push({ kdy: z.skutek_at, tym: jmeno.get(r.tym_id) || '', skutek: z.skutek, popis: z.skutek_popis });
        kronika.sort((a, b) => String(b.kdy).localeCompare(String(a.kdy)));
        return res.status(200).json({ kronika });
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
        const { tym, novePotvrzeno, emailOdeslan } = await oznacZaplaceno({ tymId: d.id, site, zdroj: 'sprava' });
        return res.status(200).json({ uspech: true, novePotvrzeno, emailOdeslan: emailOdeslan !== false, stav: tym.stav });
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
      case 'tymy.predpremiera': {
        // první svíčka se týmu otevře hned (předpremiéra pro vybrané týmy)
        const zapnout = d.zapnout !== false;
        const { data: tym } = await sb.from('omg_tymy').select('id, stav, predpremiera').eq('id', d.id).single();
        if (!tym || tym.stav !== 'zaplaceno') return res.status(400).json({ chyba: 'Předpremiéra patří zaplaceným týmům.' });
        if (zapnout && !tym.predpremiera) {
          const { count } = await sb.from('omg_tymy').select('id', { count: 'exact', head: true }).eq('hra', HRA).eq('predpremiera', true);
          if ((count || 0) >= PREDPREMIERA_MAX) return res.status(400).json({ chyba: `Předpremiéra je plná, hraje v ní ${PREDPREMIERA_MAX} týmů.` });
        }
        const { error } = await sb.from('omg_tymy').update({ predpremiera: zapnout }).eq('id', d.id);
        if (error) return res.status(400).json({ chyba: error.message });
        return res.status(200).json({ uspech: true, predpremiera: zapnout });
      }
      case 'tymy.zrusit': {
        await sb.from('omg_tymy').update({ stav: 'zruseno' }).eq('id', d.id).eq('stav', 'ceka_platbu');
        return res.status(200).json({ uspech: true });
      }
      case 'tymy.vytvor': {
        // vstupenka založená ve správě (beta rodiny, školy, dárek) — rovnou zaplacená, odkaz odejde e-mailem
        const email = String(d.email || '').trim().toLowerCase();
        if (!jeEmail(email)) return res.status(400).json({ chyba: 'Zadej platný e-mail.' });
        const predpremiera = d.predpremiera === true;
        if (predpremiera) {
          const { count } = await sb.from('omg_tymy').select('id', { count: 'exact', head: true }).eq('hra', HRA).eq('predpremiera', true);
          if ((count || 0) >= PREDPREMIERA_MAX) return res.status(400).json({ chyba: `Předpremiéra je plná, hraje v ní ${PREDPREMIERA_MAX} týmů.` });
        }
        const { data: tym, error } = await sb.from('omg_tymy').insert({
          hra: HRA, email, castka: d.castka === 0 ? 0 : CENA, pocet_hracu: 4, platba: 'prevod', souhlas: true,
          zdroj: 'sprava', poznamka: String(d.poznamka || 'založeno ve správě').substring(0, 500), predpremiera,
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
        // znamení: jeden řádek = PÍSMENO | uznávané odpovědi oddělené čárkou | zadání
        const znameni = [];
        for (const radek of String(d.znameni_text || '').split(/\n+/).map((r) => r.trim()).filter(Boolean)) {
          const casti = radek.split('|');
          const pismeno = String(casti[0] || '').trim().toUpperCase();
          const uznane = String(casti[1] || '').split(/[,;]+/).map((x) => x.trim()).filter(Boolean);
          const zadaniZ = casti.slice(2).join('|').trim();
          if ([...pismeno].length !== 1 || !uznane.length || !zadaniZ) return res.status(400).json({ chyba: `Znamení na řádku ${znameni.length + 1} zapiš jako: PÍSMENO | odpověď | zadání.` });
          znameni.push({ id: `z${znameni.length + 1}`, pismeno, odpovedi: uznane, zadani: zadaniZ });
        }
        const z = {
          kapitola_id: parseInt(d.kapitola_id, 10), poradi: parseInt(d.poradi, 10) || 1,
          typ: ['info', 'krystal', 'znameni', 'tajenka'].includes(d.typ) ? d.typ : 'odpoved',
          nazev: String(d.nazev || '').trim() || 'Světlo', misto: d.misto || null, zadani: d.zadani || null,
          audio_url: d.audio_url || null, obrazek_url: d.obrazek_url || null, odpovedi,
          aktivni: d.aktivni !== false,
        };
        if (!z.kapitola_id) return res.status(400).json({ chyba: 'Chybí kapitola.' });
        if ((z.typ === 'odpoved' || z.typ === 'tajenka') && odpovedi.length === 0) return res.status(400).json({ chyba: 'Doplň aspoň jednu uznávanou odpověď.' });
        if (z.typ === 'znameni' && znameni.length === 0) return res.status(400).json({ chyba: 'Doplň aspoň jedno znamení.' });
        if (z.typ === 'znameni') z.znameni = znameni;
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
