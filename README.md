# Outdoor Magic Games — Velká Vánoční jízda 2026

Web, vstupenky, registrace týmů a hra v telefonu. Statické HTML + Vercel API (Node, ESM) + Supabase + Stripe + Brevo — stejný vzor jako `prihlaska-pyramidy`.

## Jak to funguje

1. **/vstupenka** — e-mail + platba (Stripe Checkout, nebo QR převod). Do 27. 11. ukazuje odpočet; s `?beta=BETA_KEY` jde koupit i dřív.
2. **Zaplaceno** → e-mail „Vstupenka platí“ s osobním odkazem `/tym?k=TOKEN`.
   - Karta: Stripe webhook (`/api/stripe-webhook`) + stránka `/dekujeme` ověří platbu hned.
   - Převod: ve **/sprava** klikneš „Označit zaplaceno“ → odkaz odejde sám.
3. **/tym?k=TOKEN** — tým si dá jméno, počet hráčů a věk → vstup do hry.
4. **Hra** — 4 kapitoly (svíčky), otevírají se podle data (29. 11., 6. 12., 13. 12., 20. 12.). Světla (stanoviště) se ukazují postupně; odpověď se ověřuje na serveru bez diakritiky a velikosti písmen. Body: 100 za světlo, −20 za Papavilonovu nápovědu, po 5 pokusech s nápovědou jde přeskočit za 0.
5. **/zebricek** — veřejné pořadí. **/odkaz** — znovu poslat odkaz. **/pravidla** — pravidla hry.
6. **/sprava** — klíč `ADMIN_KEY`: týmy (zaplaceno, poslat odkaz, poznámka, založit vstupenku ručně/zdarma) a obsah hry (kapitoly, světla, odpovědi, nápovědy, audio). Když máš klíč uložený v prohlížeči, vidíš v `/tym` všechny kapitoly otevřené (náhled).

## Nasazení

1. **Supabase** → SQL Editor → spustit `supabase/001_omg_schema.sql` (tabulky `omg_*`, pohled `omg_zebricek`, 4 kapitoly).
2. **GitHub** → nové repo `lukassirael-stack/outdoor-magic-games`, nahrát obsah složky (bez `node_modules`, `test/` může zůstat).
3. **Vercel** → Add New Project → import repa (Framework: Other). Env proměnné podle `.env.example`.
4. Po prvním deployi doplnit `SITE_URL` (adresa projektu) a znovu nasadit.
5. **Stripe** → Developers → Webhooks → Add endpoint `https://…/api/stripe-webhook`, událost `checkout.session.completed` → Signing secret do `STRIPE_WEBHOOK_SECRET`.
6. **Test** před otevřením: `/vstupenka?beta=BETA_KEY` → převod → ve správě označit zaplaceno → e-mail s odkazem → pojmenovat tým. Obsah kapitol doplnit ve `/sprava` → Obsah hry.

## Lokální test bez Supabase

```
npm install
node --import ./test/hooks.js test/server.js   # http://localhost:3999, klíč správy „tajny“, beta „beta“
```

## Soubory

- `index.html` hlavní stránka · `vstupenka.html` · `dekujeme.html` · `tym.html` (registrace + hra) · `odkaz.html` · `zebricek.html` · `pravidla.html` · `sprava.html`
- `api/vstupenka.js` · `api/stripe-webhook.js` · `api/stripe-stav.js` · `api/tym.js` · `api/hra.js` · `api/odkaz.js` · `api/zebricek.js` · `api/sprava.js`
- `lib/spolecne.js` (konstanty, Supabase, Brevo, e-maily, SPAYD) · `lib/hra.js` (stav hry pro tým)
- `styl.css` · `web.js` · `img/` · `supabase/001_omg_schema.sql`
