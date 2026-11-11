// Minimal in-memory náhrada supabase-js pro lokální test API (bez Supabase).
import { randomUUID, randomBytes } from 'node:crypto';

const DB = {
  omg_tymy: [], omg_kapitoly: [], omg_stanoviste: [], omg_pokrok: [], omg_pokusy: [],
  omg_los_zdarma: [],
  nastaveni: [{ klic: 'omg_registrace_od', hodnota: '2026-11-27T00:00:00+01:00' }],
};
let vsSeq = 26120001, kapSeq = 1, stanSeq = 100, pokusSeq = 1;
const PK = { omg_tymy: ['id'], omg_kapitoly: ['id'], omg_stanoviste: ['id'], omg_pokrok: ['tym_id', 'stanoviste_id'], omg_pokusy: ['id'], nastaveni: ['klic'], omg_los_zdarma: ['id'] };

function defaults(table, row) {
  const now = new Date().toISOString();
  if (table === 'omg_tymy') return { id: randomUUID(), vs: vsSeq++, token: randomBytes(16).toString('hex'), hra: 'vanocni-jizda-2026', castka: 300, stav: 'ceka_platbu', body: 0, souhlas: false, created_at: now, nazev_tymu: null, pocet_hracu: null, vek_hracu: null, registrovano_at: null, zaplaceno_at: null, hraci: [], posledni_reseni_at: null, stripe_session_id: null, stripe_payment_intent: null, zdroj: null, poznamka: null, odkaz_odeslan_at: null, ...row };
  if (table === 'omg_kapitoly') return { id: kapSeq++, hra: 'vanocni-jizda-2026', aktivni: true, podtitul: null, uvod: null, audio_url: null, ...row };
  if (table === 'omg_stanoviste') return { id: stanSeq++, poradi: 1, typ: 'odpoved', misto: null, zadani: null, napoveda: null, audio_url: null, obrazek_url: null, odpovedi: [], body: 100, srazka_napoveda: 20, aktivni: true, created_at: now, ...row };
  if (table === 'omg_pokrok') return { pokusy: 0, napoveda_at: null, vyreseno_at: null, preskoceno: false, odpoved: null, body: 0, ...row };
  if (table === 'omg_los_zdarma') return { id: (DB.omg_los_zdarma.length + 1), created_at: now, ...row };
  if (table === 'omg_tymy' && false) {}
  if (table === 'omg_pokusy') return { id: pokusSeq++, created_at: now, ...row };
  return row;
}

// trigger: přepočet bodů týmu
function prepocitej(tymId) {
  const t = DB.omg_tymy.find((x) => x.id === tymId); if (!t) return;
  const p = DB.omg_pokrok.filter((x) => x.tym_id === tymId && x.vyreseno_at);
  t.body = p.reduce((s, x) => s + (x.body || 0), 0);
  t.posledni_reseni_at = p.length ? p.map((x) => x.vyreseno_at).sort().pop() : null;
}

function zebricek() {
  return DB.omg_tymy.filter((t) => t.stav === 'zaplaceno' && t.nazev_tymu)
    .map((t) => ({ nazev_tymu: t.nazev_tymu, body: t.body, posledni_reseni_at: t.posledni_reseni_at, vyreseno: DB.omg_pokrok.filter((p) => p.tym_id === t.id && p.vyreseno_at).length, registrovano_at: t.registrovano_at }))
    .sort((a, b) => b.body - a.body || String(a.posledni_reseni_at || '9').localeCompare(String(b.posledni_reseni_at || '9')) || String(a.registrovano_at).localeCompare(String(b.registrovano_at)));
}

class Q {
  constructor(table) { this.table = table; this.filters = []; this.orders = []; this.op = 'select'; this._limit = null; this._single = null; this._count = null; this._head = false; this._cols = '*'; }
  select(cols = '*', opts = {}) { if (this.op === 'select') { this._cols = cols; } this._wantSelect = true; this._count = opts.count || null; this._head = !!opts.head; return this; }
  eq(c, v) { this.filters.push((r) => r[c] === v); return this; }
  not(c, op, v) { if (op === 'is' && v === null) this.filters.push((r) => r[c] !== null && r[c] !== undefined); return this; }
  neq(c, v) { this.filters.push((r) => r[c] !== v); return this; }
  gt(c, v) { this.filters.push((r) => r[c] > v); return this; }
  lt(c, v) { this.filters.push((r) => r[c] !== null && r[c] !== undefined && r[c] < v); return this; }
  ilike(c, v) { const s = String(v).toLowerCase().replace(/%/g, ''); this.filters.push((r) => String(r[c] || '').toLowerCase().includes(s)); return this; }
  order(c, o = {}) { this.orders.push([c, o.ascending === false ? -1 : 1]); return this; }
  limit(n) { this._limit = n; return this; }
  single() { this._single = 'strict'; return this; }
  maybeSingle() { this._single = 'maybe'; return this; }
  insert(row) { this.op = 'insert'; this.payload = row; return this; }
  update(row) { this.op = 'update'; this.payload = row; return this; }
  upsert(row, opts) { this.op = 'upsert'; this.payload = row; this.onConflict = (opts?.onConflict || '').split(','); return this; }
  delete() { this.op = 'delete'; return this; }
  rows() {
    let rows = this.table === 'omg_zebricek' ? zebricek() : DB[this.table].filter((r) => this.filters.every((f) => f(r)));
    if (this.table === 'omg_stanoviste' && this._cols.includes('omg_stanoviste')) {}
    for (const [c, dir] of this.orders.slice().reverse()) rows.sort((a, b) => (a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0) * dir);
    if (this._limit) rows = rows.slice(0, this._limit);
    return rows;
  }
  finish(rows) {
    if (this._count) return { data: this._head ? null : rows, count: rows.length, error: null };
    if (this._single === 'strict') return rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { message: rows.length ? 'více řádků' : 'žádný řádek', code: 'PGRST116' } };
    if (this._single === 'maybe') return { data: rows[0] || null, error: null };
    return { data: rows, error: null };
  }
  then(resolve, reject) {
    try {
      if (this.op === 'select') return resolve(this.finish(this.rows()));
      if (this.op === 'insert') {
        const list = Array.isArray(this.payload) ? this.payload : [this.payload];
        const out = list.map((r) => defaults(this.table, r));
        for (const r of out) {
          if (this.table === 'omg_tymy' && r.nazev_tymu && DB.omg_tymy.some((t) => t.nazev_tymu && t.nazev_tymu.toLowerCase() === r.nazev_tymu.toLowerCase())) return resolve({ data: null, error: { code: '23505', message: 'duplicate' } });
          DB[this.table].push(r); if (this.table === 'omg_pokrok') prepocitej(r.tym_id);
        }
        return resolve(this.finish(out));
      }
      if (this.op === 'update') {
        const rows = this.rows();
        if (this.table === 'omg_tymy' && this.payload.nazev_tymu && DB.omg_tymy.some((t) => !rows.includes(t) && t.nazev_tymu && t.nazev_tymu.toLowerCase() === this.payload.nazev_tymu.toLowerCase())) return resolve({ data: null, error: { code: '23505', message: 'duplicate' } });
        for (const r of rows) Object.assign(r, this.payload);
        if (this.table === 'omg_pokrok') rows.forEach((r) => prepocitej(r.tym_id));
        return resolve(this.finish(rows));
      }
      if (this.op === 'upsert') {
        const keys = this.onConflict.length && this.onConflict[0] ? this.onConflict : PK[this.table];
        const ex = DB[this.table].find((r) => keys.every((k) => r[k] === this.payload[k]));
        let row;
        if (ex) { Object.assign(ex, this.payload); row = ex; } else { row = defaults(this.table, this.payload); DB[this.table].push(row); }
        if (this.table === 'omg_pokrok') prepocitej(row.tym_id);
        return resolve(this.finish([row]));
      }
      if (this.op === 'delete') {
        const rows = this.rows();
        DB[this.table] = DB[this.table].filter((r) => !rows.includes(r));
        if (this.table === 'omg_stanoviste') DB.omg_pokrok = DB.omg_pokrok.filter((p) => !rows.some((s) => s.id === p.stanoviste_id));
        return resolve(this.finish(rows));
      }
    } catch (e) { return reject ? reject(e) : resolve({ data: null, error: { message: e.message } }); }
  }
}

export function createClient() { return { from: (t) => new Q(t) }; }
export { DB };
