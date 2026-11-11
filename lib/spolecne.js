// ════════════════════════════════════════════════════════════════════
//  lib/spolecne.js — společné věci pro všechna API
//  Outdoor Magic Games — Velká Vánoční jízda 2026
// ════════════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js';

// ── Konstanty hry ────────────────────────────────────────────────────
export const HRA           = 'vanocni-jizda-2026';
export const CENA          = 300;                              // Kč za tým do 4 hráčů na celý advent
export const HRACU_V_CENE  = 4;                                // hráčů v základní ceně
export const PRIPLATEK    = 80;                               // Kč za každého dalšího hráče
export const MAX_HRACU    = 6;
export const CENA_NAPOVEDY = 40;                             // Kč za jednu Papavilonovu nápovědu
export function cenaZa(pocet) { const n = Math.min(Math.max(parseInt(pocet, 10) || HRACU_V_CENE, 1), MAX_HRACU); return CENA + Math.max(0, n - HRACU_V_CENE) * PRIPLATEK; }
export function pocetHracu(pocet) { return Math.min(Math.max(parseInt(pocet, 10) || HRACU_V_CENE, 1), MAX_HRACU); }
export const REGISTRACE_OD = process.env.REGISTRACE_OD || '2026-11-27T00:00:00+01:00';
export const FINALE        = '2026-12-24T10:00:00+01:00';
export const NAZEV_HRY     = 'Velká Vánoční jízda 2026';

// ── Prostředí (Vercel Environment Variables) ─────────────────────────
export const ENV = {
  SUPABASE_URL:          process.env.SUPABASE_URL,
  SUPABASE_SERVICE_KEY:  process.env.SUPABASE_SERVICE_KEY,
  BREVO_API_KEY:         process.env.BREVO_API_KEY,
  SENDER_EMAIL:          process.env.SENDER_EMAIL || 'info@oaza-adamanthea.cz',
  SENDER_NAME:           process.env.SENDER_NAME  || 'Outdoor Magic Games',
  ADMIN_EMAIL:           process.env.ADMIN_EMAIL  || 'oaza.adamanthea@gmail.com',
  ADMIN_KEY:             process.env.ADMIN_KEY,
  BETA_KEY:              process.env.BETA_KEY,
  STRIPE_SECRET_KEY:     process.env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  SITE_URL:              process.env.SITE_URL,
};

// ── Bankovní účet pro QR platbu (převod) ─────────────────────────────
export const UCET = {
  iban:     'CZ1655000000008159854004',
  ucet:     '8159854004/5500',
  banka:    'Raiffeisenbank',
  prijemce: 'Lukas Hudecek',          // bez diakritiky (SPAYD)
  prijemceZobrazit: 'Lukáš Hudeček',
};

// ── Supabase (service role, čte a píše jen server) ───────────────────
let _sb = null;
export function supabase() {
  if (!_sb) _sb = createClient(ENV.SUPABASE_URL, ENV.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
  return _sb;
}

// ── Pomocné ──────────────────────────────────────────────────────────
export function cors(req, res, methods = 'POST, OPTIONS') {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');
  if (req.method === 'OPTIONS') { res.status(200).end(); return true; }
  return false;
}

export function siteUrl(req) {
  if (ENV.SITE_URL) return ENV.SITE_URL.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host  = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

export function escHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

export function jeEmail(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '').trim());
}

// Datum otevření prodeje se čte z tabulky nastaveni (klíč omg_registrace_od), mění se ve správě.
export async function registraceOd() {
  try {
    const { data } = await supabase().from('nastaveni').select('hodnota').eq('klic', 'omg_registrace_od').maybeSingle();
    if (data?.hodnota && !Number.isNaN(new Date(data.hodnota).getTime())) return new Date(data.hodnota).toISOString();
  } catch (e) { console.error('registraceOd:', e); }
  return new Date(REGISTRACE_OD).toISOString();
}

export async function registraceOtevrena(betaKlic) {
  if (betaKlic && ENV.BETA_KEY && betaKlic === ENV.BETA_KEY) return true;
  return Date.now() >= new Date(await registraceOd()).getTime();
}

export function jeAdmin(req) {
  const k = req.headers['x-admin-key'];
  return !!(ENV.ADMIN_KEY && k && k.length === ENV.ADMIN_KEY.length && k === ENV.ADMIN_KEY);
}

// Odpovědi se porovnávají bez diakritiky, velikosti písmen a interpunkce.
export function normalizuj(s) {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim().replace(/\s+/g, ' ');
}

// Tým se do odpovědi API posílá bez interních polí.
export function verejnyTym(t) {
  return {
    token:        t.token,
    email:        t.email,
    vs:           t.vs,
    castka:       t.castka,
    platba:       t.platba,
    stav:         t.stav,
    zaplaceno_at: t.zaplaceno_at,
    nazev_tymu:   t.nazev_tymu,
    pocet_hracu:  t.pocet_hracu,
    vek_hracu:    t.vek_hracu,
    hraci:        Array.isArray(t.hraci) ? t.hraci : [],
    max_hracu:    t.pocet_hracu || HRACU_V_CENE,
    body:         t.body,
    registrovano: !!t.nazev_tymu,
  };
}

// ── SPAYD (český QR platební řetězec) ────────────────────────────────
export function generujSPAYD({ castka, vs, zprava }) {
  const sanitize = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[*]/g, ' ').substring(0, 60);
  return ['SPD', '1.0', `ACC:${UCET.iban}`, `AM:${Number(castka).toFixed(2)}`, 'CC:CZK',
          `X-VS:${vs}`, `MSG:${sanitize(zprava)}`, `RN:${sanitize(UCET.prijemce)}`].join('*');
}
export function qrUrl(spayd) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(spayd)}`;
}

// ── Brevo ────────────────────────────────────────────────────────────
export async function brevoSend({ to, subject, html, replyTo }) {
  if (!ENV.BREVO_API_KEY) { console.warn('BREVO_API_KEY chybí, e-mail se neposílá:', subject); return null; }
  const body = {
    sender: { email: ENV.SENDER_EMAIL, name: ENV.SENDER_NAME },
    to: [{ email: to.email, name: to.name || to.email }],
    subject, htmlContent: html,
  };
  if (replyTo) body.replyTo = { email: replyTo };
  const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { accept: 'application/json', 'api-key': ENV.BREVO_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) { console.error('Brevo error:', resp.status, await resp.text()); throw new Error('E-mail se nepodařilo odeslat.'); }
  return resp.json();
}

// ── Šablona e-mailu ──────────────────────────────────────────────────
function obal(nadpis, podnadpis, obsah) {
  return `<!DOCTYPE html><html lang="cs"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0d1440;font-family:Georgia,'Times New Roman',serif;color:#f3e6cc;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0d1440;padding:30px 0;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#1a1850;border:1px solid #c9a34a;border-radius:14px;">
  <tr><td style="padding:36px 36px 16px;text-align:center;">
    <div style="font-size:11px;letter-spacing:6px;color:#e3a93b;margin-bottom:12px;">✦ &nbsp;·&nbsp; ✦</div>
    <h1 style="font-size:24px;color:#f6d27a;letter-spacing:2px;margin:0 0 8px;text-transform:uppercase;">${nadpis}</h1>
    <p style="color:#e3a93b;font-size:13px;letter-spacing:3px;margin:0;">${podnadpis}</p>
  </td></tr>
  <tr><td style="padding:0 36px;"><hr style="border:none;border-top:1px solid rgba(246,198,106,.35);margin:0;"></td></tr>
  <tr><td style="padding:26px 36px;font-size:16px;line-height:1.65;">${obsah}</td></tr>
  <tr><td style="padding:18px 36px 28px;text-align:center;border-top:1px solid rgba(246,198,106,.25);">
    <p style="font-size:12px;color:#a99cc7;margin:0;letter-spacing:1px;">Outdoor Magic Games · Kroměříž · <a href="mailto:${ENV.ADMIN_EMAIL}" style="color:#f6d27a;">${ENV.ADMIN_EMAIL}</a></p>
  </td></tr>
</table></td></tr></table></body></html>`;
}

function tlacitko(url, text) {
  return `<div style="text-align:center;margin:26px 0;"><a href="${url}" style="display:inline-block;padding:14px 34px;border-radius:999px;background:#5b2a9a;border:2px solid #f6d27a;color:#ffe7a6;font-weight:bold;font-size:18px;text-decoration:none;">${text}</a></div>`;
}

// E-mail 1: údaje k platbě převodem
export async function emailPlatbaPrevodem({ tym, spayd }) {
  const obsah = `
    <p>Díky za objednávku vstupenky do <strong>${NAZEV_HRY}</strong>.</p>
    <p>Jakmile platba dorazí na účet, přijde ti e-mail s odkazem do hry. Tam pojmenuješ svůj tým a 29. listopadu se otevře první kapitola.</p>
    <h2 style="font-size:15px;color:#f6d27a;letter-spacing:2px;margin:26px 0 12px;border-bottom:1px solid rgba(246,198,106,.35);padding-bottom:8px;">ÚDAJE K PLATBĚ</h2>
    <table width="100%" cellpadding="6" cellspacing="0" style="font-size:15px;">
      <tr><td style="color:#cdbfa6;width:170px;">Částka:</td><td><strong style="color:#f6d27a;font-size:20px;">${tym.castka} Kč</strong></td></tr>
      <tr><td style="color:#cdbfa6;">Variabilní symbol:</td><td><strong>${tym.vs}</strong></td></tr>
      <tr><td style="color:#cdbfa6;">Číslo účtu:</td><td><strong>${UCET.ucet}</strong></td></tr>
      <tr><td style="color:#cdbfa6;">IBAN:</td><td>${UCET.iban}</td></tr>
      <tr><td style="color:#cdbfa6;">Příjemce:</td><td>${UCET.prijemceZobrazit}</td></tr>
      <tr><td style="color:#cdbfa6;">Zpráva pro příjemce:</td><td>Vanocni jizda ${tym.vs}</td></tr>
    </table>
    <div style="text-align:center;margin:26px 0 8px;">
      <p style="font-size:13px;color:#cdbfa6;margin:0 0 12px;">QR platba (načti v bankovní aplikaci):</p>
      <img src="${qrUrl(spayd)}" alt="QR platba" width="220" height="220" style="border-radius:10px;padding:8px;background:#fff;">
    </div>
    <p style="font-size:13px;color:#a99cc7;font-style:italic;margin-top:22px;">Odpovědí na tento e-mail se nám kdykoli ozveš.</p>`;
  return brevoSend({
    to: { email: tym.email },
    subject: `Vstupenka do Vánoční jízdy — údaje k platbě (VS ${tym.vs})`,
    html: obal('Velká Vánoční jízda', 'VSTUPENKA PRO TÝM', obsah),
    replyTo: ENV.ADMIN_EMAIL,
  });
}

// E-mail 2: vstupenka zaplacená → odkaz do hry
export async function emailOdkazDoHry({ tym, site }) {
  const url = `${site}/tym?k=${tym.token}`;
  const obsah = `
    <p>Vstupenka do <strong>${NAZEV_HRY}</strong> je tvoje. Papavilon už na tebe čeká.</p>
    ${tlacitko(url, 'Vstoupit do hry')}
    <p style="font-size:14px;color:#cdbfa6;">Tvůj osobní odkaz: <a href="${url}" style="color:#f6d27a;word-break:break-all;">${url}</a></p>
    <h2 style="font-size:15px;color:#f6d27a;letter-spacing:2px;margin:26px 0 12px;border-bottom:1px solid rgba(246,198,106,.35);padding-bottom:8px;">CO TEĎ</h2>
    <ol style="padding-left:22px;margin:0;">
      <li style="margin-bottom:8px;">Klikni na odkaz a <strong>pojmenuj svůj tým</strong> .</li>
      <li style="margin-bottom:8px;">Ulož si odkaz do telefonu, se kterým vyrazíte do ulic. Hra běží přímo na webu.</li>
      <li style="margin-bottom:8px;"><strong>29. listopadu</strong> se otevře první kapitola, další každou adventní neděli. Hrajete kdykoli až do 24. 12.</li>
    </ol>
    <p style="font-size:14px;color:#cdbfa6;margin-top:22px;">Kdyby se odkaz ztratil, nový si pošleš na <a href="${site}/odkaz" style="color:#f6d27a;">${site}/odkaz</a>.</p>`;
  return brevoSend({
    to: { email: tym.email, name: tym.nazev_tymu || undefined },
    subject: 'Tvoje vstupenka do Velké Vánoční jízdy ✦ odkaz do hry',
    html: obal('Vstupenka platí', 'VELKÁ VÁNOČNÍ JÍZDA 2026', obsah),
    replyTo: ENV.ADMIN_EMAIL,
  });
}

// E-mail 3: upozornění pro správce
export async function emailAdmin({ predmet, radky }) {
  const html = `<html><body style="font-family:Arial,sans-serif;color:#222;max-width:600px;margin:auto;padding:20px;">
    <h2 style="color:#5b2a9a;">✦ ${escHtml(predmet)}</h2>
    <table cellpadding="4" style="font-size:14px;">${radky.map(([k, v]) => `<tr><td><strong>${escHtml(k)}:</strong></td><td>${escHtml(v)}</td></tr>`).join('')}</table>
  </body></html>`;
  return brevoSend({ to: { email: ENV.ADMIN_EMAIL, name: 'Správce' }, subject: `✦ ${predmet}`, html });
}

// ── Označit vstupenku jako zaplacenou (idempotentní) a poslat odkaz ──
export async function oznacZaplaceno({ tymId, site, stripe = null, zdroj = 'sprava' }) {
  const sb = supabase();
  const { data: tym, error } = await sb.from('omg_tymy').select('*').eq('id', tymId).single();
  if (error || !tym) throw new Error('Tým nenalezen.');
  if (tym.stav === 'zaplaceno') return { tym, novePotvrzeno: false };

  const zmena = { stav: 'zaplaceno', zaplaceno_at: new Date().toISOString() };
  if (stripe) { zmena.stripe_session_id = stripe.session_id || tym.stripe_session_id; zmena.stripe_payment_intent = stripe.payment_intent || null; }
  const { data: upd, error: e2 } = await sb.from('omg_tymy').update(zmena).eq('id', tymId).eq('stav', 'ceka_platbu').select('*').single();
  if (e2 || !upd) {
    // někdo byl rychlejší (webhook vs. stránka díky) → jen vrátit aktuální stav
    const { data: znovu } = await sb.from('omg_tymy').select('*').eq('id', tymId).single();
    return { tym: znovu, novePotvrzeno: false };
  }

  await Promise.allSettled([
    emailOdkazDoHry({ tym: upd, site }).then(() => sb.from('omg_tymy').update({ odkaz_odeslan_at: new Date().toISOString() }).eq('id', tymId)),
    emailAdmin({ predmet: `Nová vstupenka Vánoční jízda (${zdroj})`, radky: [['E-mail', upd.email], ['VS', upd.vs], ['Platba', upd.platba], ['Částka', `${upd.castka} Kč`]] }),
  ]);
  return { tym: upd, novePotvrzeno: true };
}
