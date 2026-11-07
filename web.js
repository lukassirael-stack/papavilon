/* Outdoor Magic Games — společné drobnosti pro stránky */
window.OMG = {
  REGISTRACE_OD: '2026-11-27T00:00:00+01:00',
  FINALE: '2026-12-24T10:00:00+01:00',
  CENA: 300,

  registraceOtevrena() { return Date.now() >= new Date(this.REGISTRACE_OD).getTime(); },

  // odpočet do data: vykreslí dny / hodiny / minuty do prvku
  odpocet(el, datum, hotovo) {
    const cil = new Date(datum).getTime();
    const tik = () => {
      let z = Math.max(0, cil - Date.now());
      if (z === 0) { if (hotovo) hotovo(); return; }
      const d = Math.floor(z / 86400000); z -= d * 86400000;
      const h = Math.floor(z / 3600000);  z -= h * 3600000;
      const m = Math.floor(z / 60000);
      el.innerHTML = `<div><b>${d}</b><span>${d === 1 ? 'den' : (d >= 2 && d <= 4 ? 'dny' : 'dní')}</span></div>
        <div><b>${h}</b><span>hod</span></div><div><b>${m}</b><span>min</span></div>`;
      setTimeout(tik, 30000);
    };
    tik();
  },

  async api(cesta, body, metoda) {
    const hlavicky = { 'Content-Type': 'application/json' };
    const klic = localStorage.getItem('omg_admin_key');
    if (klic) hlavicky['x-admin-key'] = klic;
    const r = await fetch(cesta, { method: metoda || (body ? 'POST' : 'GET'), headers: hlavicky, body: body ? JSON.stringify(body) : undefined });
    let data = {};
    try { data = await r.json(); } catch (e) { data = {}; }
    if (!r.ok) throw new Error(data.chyba || 'Něco se nepovedlo, zkus to prosím znovu.');
    return data;
  },

  esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },

  datum(iso) { const d = new Date(iso); return `${d.getDate()}. ${d.getMonth() + 1}.`; },
};
