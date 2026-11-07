// Lokální testovací server: statické soubory + reálné API handlery nad mock Supabase.
// Spuštění: node --import ./test/hooks.js test/server.js
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DB } from './mock-supabase.js';

process.env.ADMIN_KEY = 'tajny';
process.env.BETA_KEY = 'beta';
process.env.SITE_URL = 'http://localhost:3999';
process.env.SUPABASE_URL = 'http://mock'; process.env.SUPABASE_SERVICE_KEY = 'mock';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.webp': 'image/webp', '.json': 'application/json' };

// seed: 4 kapitoly (1. otevřená), pár světel
const d = (s) => new Date(s).toISOString();
DB.omg_kapitoly.push(
  { id: 1, hra: 'vanocni-jizda-2026', poradi: 1, nazev: 'První svíčka', podtitul: 'Světlo naděje', uvod: 'Papavilon zapaluje první svíčku.', otevreno_od: d('2026-11-01T00:00:00+01:00'), aktivni: true, audio_url: null },
  { id: 2, hra: 'vanocni-jizda-2026', poradi: 2, nazev: 'Druhá svíčka', podtitul: 'Světlo míru', uvod: 'Druhá kapitola.', otevreno_od: d('2026-12-06T00:00:00+01:00'), aktivni: true, audio_url: null },
  { id: 3, hra: 'vanocni-jizda-2026', poradi: 3, nazev: 'Třetí svíčka', podtitul: 'Světlo radosti', uvod: null, otevreno_od: d('2026-12-13T00:00:00+01:00'), aktivni: true, audio_url: null },
  { id: 4, hra: 'vanocni-jizda-2026', poradi: 4, nazev: 'Čtvrtá svíčka', podtitul: 'Světlo lásky', uvod: null, otevreno_od: d('2026-12-20T00:00:00+01:00'), aktivni: true, audio_url: null },
);
DB.omg_stanoviste.push(
  { id: 1, kapitola_id: 1, poradi: 1, typ: 'odpoved', nazev: 'Kašna', misto: 'Velké náměstí', zadani: 'Kolik má kašna sloupů?', napoveda: 'Obejdi ji dokola.', odpovedi: ['4', 'čtyři'], body: 100, srazka_napoveda: 20, aktivni: true, audio_url: null, obrazek_url: null },
  { id: 2, kapitola_id: 1, poradi: 2, typ: 'info', nazev: 'Papavilon vypráví', misto: null, zadani: 'Poslechni si příběh.', napoveda: null, odpovedi: [], body: 0, srazka_napoveda: 0, aktivni: true, audio_url: null, obrazek_url: null },
  { id: 3, kapitola_id: 1, poradi: 3, typ: 'odpoved', nazev: 'Morový sloup', misto: 'Velké náměstí', zadani: 'Jaké slovo je vytesané nad vchodem?', napoveda: 'Začíná na M.', odpovedi: ['Masaryk'], body: 100, srazka_napoveda: 20, aktivni: true, audio_url: null, obrazek_url: null },
);
DB.omg_tymy.push({ id: 'aaaaaaaa-0000-0000-0000-000000000001', vs: 26120000, token: 'a'.repeat(32), hra: 'vanocni-jizda-2026', email: 'soupere@example.com', castka: 300, platba: 'prevod', stav: 'zaplaceno', zaplaceno_at: d('2026-11-01'), nazev_tymu: 'Soupeři', pocet_hracu: 3, vek_hracu: '9, 40, 41', registrovano_at: d('2026-11-01'), body: 80, posledni_reseni_at: d('2026-11-02'), souhlas: true, created_at: d('2026-11-01') });

const handlers = {};
for (const f of fs.readdirSync(path.join(root, 'api'))) handlers['/api/' + f.replace(/\.js$/, '')] = (await import(path.join(root, 'api', f))).default;

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (handlers[url.pathname]) {
    const chunks = []; for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString();
    req.query = Object.fromEntries(url.searchParams);
    if (!url.pathname.includes('webhook')) { try { req.body = raw ? JSON.parse(raw) : {}; } catch { req.body = {}; } }
    const r = { status(c) { res.statusCode = c; return r; }, setHeader: (k, v) => res.setHeader(k, v), json(o) { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); }, send(t) { res.end(String(t)); }, end: () => res.end() };
    try { await handlers[url.pathname](req, r); } catch (e) { console.error(e); res.statusCode = 500; res.end('err'); }
    return;
  }
  let p = url.pathname === '/' ? '/index.html' : url.pathname;
  if (!path.extname(p)) p += '.html';
  const file = path.join(root, p);
  if (!file.startsWith(root) || !fs.existsSync(file)) { res.statusCode = 404; return res.end('404'); }
  res.setHeader('content-type', MIME[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
}).listen(3999, () => console.log('test server http://localhost:3999'));
