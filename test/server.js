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

// seed: 4 kapitoly (1. otevřená), světla 1. kapitoly jako v supabase/002_znameni.sql
const d = (s) => new Date(s).toISOString();
DB.omg_kapitoly.push(
  { id: 1, hra: 'vanocni-jizda-2026', poradi: 1, nazev: 'První svíčka', podtitul: 'Světlo naděje', uvod: 'Papavilon zapaluje první svíčku.', otevreno_od: d('2026-11-01T00:00:00+01:00'), aktivni: true, audio_url: null },
  { id: 2, hra: 'vanocni-jizda-2026', poradi: 2, nazev: 'Druhá svíčka', podtitul: 'Světlo míru', uvod: 'Druhá kapitola.', otevreno_od: d('2026-12-06T00:00:00+01:00'), aktivni: true, audio_url: null },
  { id: 3, hra: 'vanocni-jizda-2026', poradi: 3, nazev: 'Třetí svíčka', podtitul: 'Světlo radosti', uvod: null, otevreno_od: d('2026-12-13T00:00:00+01:00'), aktivni: true, audio_url: null },
  { id: 4, hra: 'vanocni-jizda-2026', poradi: 4, nazev: 'Čtvrtá svíčka', podtitul: 'Světlo lásky', uvod: null, otevreno_od: d('2026-12-20T00:00:00+01:00'), aktivni: true, audio_url: null },
);
DB.omg_stanoviste.push(
  {"id": 1, "kapitola_id": 1, "poradi": 1, "typ": "znameni", "nazev": "Voda, kámen a světlo", "misto": "Velké náměstí", "zadani": "Tady začíná vaše cesta. Voda, kámen a světlo střeží první tři znamení.", "napoveda": "V erbu žijí lvi a orli. Lampy počítejte ty, které vyrůstají ze země.", "znameni": [{"id": "z1", "pismeno": "D", "odpovedi": ["4", "čtyři"], "zadani": "Obejděte kašnu a spočítejte její rohy."}, {"id": "z2", "pismeno": "D", "odpovedi": ["4", "čtyři"], "zadani": "Na Mariánském sloupu najděte kamenný erb. Kolik lvů v něm stojí? Zapište si i počet všech zvířat v erbu, ještě ho použijete."}, {"id": "z3", "pismeno": "Y", "odpovedi": ["25", "dvacet pět"], "zadani": "Spočítejte lampy, které stojí na vlastní noze po celém náměstí."}], "odpovedi": [], "body": 0, "srazka_napoveda": 0, "aktivni": true, "audio_url": null, "obrazek_url": null},
  {"id": 2, "kapitola_id": 1, "poradi": 2, "typ": "znameni", "nazev": "Jméno v bronzu", "misto": "Vodní brána", "zadani": "Kudy kdysi vcházeli do města lidé i voda, leží dnes jméno brány v bronzu pod vašima nohama.", "napoveda": "Desky jsou dvě a nesou stejný nápis. Sečtěte obě slova na jedné z nich.", "znameni": [{"id": "z1", "pismeno": "J", "odpovedi": ["10", "deset"], "zadani": "Najděte bronzovou desku v dlažbě a spočítejte písmena na jedné desce."}], "odpovedi": [], "body": 0, "srazka_napoveda": 0, "aktivni": true, "audio_url": null, "obrazek_url": null},
  {"id": 3, "kapitola_id": 1, "poradi": 3, "typ": "znameni", "nazev": "Strážce a zlato", "misto": "Riegrovo náměstí", "zadani": "V kašně plave strážce a na sloupu se třpytí zlato. Dívejte se pozorně.", "napoveda": "Sloup obejděte celý dokola, zlato září ze všech stran. Zvířata z erbu máte zapsaná z Velkého náměstí.", "znameni": [{"id": "z1", "pismeno": "A", "odpovedi": ["1", "jedna", "jeden"], "zadani": "Kolik velkých ryb střeží kašnu?"}, {"id": "z2", "pismeno": "N", "odpovedi": ["14", "čtrnáct"], "zadani": "Spočítejte bytosti na sloupu, které nesou něco zlatého, a přičtěte všechna zvířata z erbu."}], "odpovedi": [], "body": 0, "srazka_napoveda": 0, "aktivni": true, "audio_url": null, "obrazek_url": null},
  {"id": 4, "kapitola_id": 1, "poradi": 4, "typ": "znameni", "nazev": "Kamenní mudrci", "misto": "Justiční škola", "zadani": "Tenhle dům hlídají kamenní mudrci. Každý z nich vám něco napoví.", "napoveda": "Sochy stojí nahoře mezi okny a ve výklencích s mušlí. Kamenné tváře v kruhu hledejte hned pod nápisem.", "znameni": [{"id": "z1", "pismeno": "K", "odpovedi": ["11", "jedenáct"], "zadani": "Sečtěte sochy na průčelí a kulatá okna se sklem."}, {"id": "z2", "pismeno": "Z", "odpovedi": ["26", "dvacet šest"], "zadani": "Spočítejte písmena nápisu na průčelí a vynásobte je počtem kamenných tváří v kruhu."}], "odpovedi": [], "body": 0, "srazka_napoveda": 0, "aktivni": true, "audio_url": null, "obrazek_url": null},
  {"id": 5, "kapitola_id": 1, "poradi": 5, "typ": "znameni", "nazev": "Škola základ života", "misto": "Komenského náměstí", "zadani": "Škola základ života, stojí tu psáno. Ta slova v sobě nesou poslední znamení.", "napoveda": "Nápis má tři slova. Lvy jste potkali na Velkém náměstí.", "znameni": [{"id": "z1", "pismeno": "U", "odpovedi": ["21", "dvacet jedna"], "zadani": "Spočítejte písmena nápisu ŠKOLA ZÁKLAD ŽIVOTA a přičtěte lvy z erbu."}], "odpovedi": [], "body": 0, "srazka_napoveda": 0, "aktivni": true, "audio_url": null, "obrazek_url": null},
  {"id": 6, "kapitola_id": 1, "poradi": 6, "typ": "odpoved", "nazev": "Papavilonovo poselství", "misto": null, "zadani": "Máte devět písmen. Složte z nich dvě slova, začátek mého poselství.", "napoveda": "První slovo má čtyři písmena a začíná na K. Jedno písmeno si zaslouží háček.", "znameni": [], "odpovedi": ["KDYŽ NAJDU", "KDYŽNAJDU"], "body": 0, "srazka_napoveda": 0, "aktivni": true, "audio_url": null, "obrazek_url": null},
);
DB.omg_tymy.push({ id: 'aaaaaaaa-0000-0000-0000-000000000001', vs: 26120000, token: 'a'.repeat(32), hra: 'vanocni-jizda-2026', email: 'soupere@example.com', castka: 300, platba: 'prevod', stav: 'zaplaceno', zaplaceno_at: d('2026-11-01'), nazev_tymu: 'Soupeři', pocet_hracu: 3, vek_hracu: '9, 40, 41', hraci: [{ jmeno: 'Ema', vek: 9, krystal: null }, { jmeno: 'Jana', vek: 40, krystal: null }], registrovano_at: d('2026-11-01'), body: 80, posledni_reseni_at: d('2026-11-02'), souhlas: true, created_at: d('2026-11-01') });

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
