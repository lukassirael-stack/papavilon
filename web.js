/* Outdoor Magic Games — společné drobnosti pro stránky */
window.OMG = {
  REGISTRACE_OD: '2026-11-27T00:00:00+01:00',
  FINALE: '2026-12-24T10:00:00+01:00',
  CENA: 300,

  registraceOtevrena() { return Date.now() >= new Date(this.REGISTRACE_OD).getTime(); },

  // stav prodeje ze serveru (datum otevření se mění ve správě); při výpadku platí konstanta výše
  async stav() {
    try {
      const d = await this.api('/api/stav');
      if (d.registrace_od) this.REGISTRACE_OD = d.registrace_od;
      return d;
    } catch (e) { return { registrace_od: this.REGISTRACE_OD, otevreno: this.registraceOtevrena(), cena: this.CENA }; }
  },

  datumDlouhe(iso) {
    const d = new Date(iso), m = ['ledna','února','března','dubna','května','června','července','srpna','září','října','listopadu','prosince'];
    return `${d.getDate()}. ${m[d.getMonth()]} ${d.getFullYear()}`;
  },

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

/* Návštěvnost: anonymní měření bez cookies. Počítá zobrazení stránek a dobu na stránce;
   správce (přihlášený do /sprava) a automatické prohlížeče se nepočítají. */
(function () {
  try {
    if (localStorage.getItem('omg_admin_key') || navigator.webdriver || location.pathname.indexOf('/sprava') === 0) return;
    var relace = sessionStorage.getItem('omg_relace');
    if (!relace) { relace = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + '-' + Math.random().toString(36).slice(2, 12)); sessionStorage.setItem('omg_relace', relace); }
    var q = new URLSearchParams(location.search), ref = '';
    try { var h = document.referrer ? new URL(document.referrer).hostname : ''; if (h && h !== location.hostname) ref = h.replace(/^www\./, ''); } catch (e) {}
    var zdroj = q.get('utm_source') || (q.get('fbclid') ? 'facebook' : '') || sessionStorage.getItem('omg_zdroj') || '';
    if (zdroj) sessionStorage.setItem('omg_zdroj', zdroj);
    var s = Math.min(window.innerWidth, screen.width || 9999), zarizeni = s < 700 ? 'mobil' : (s < 1100 ? 'tablet' : 'desktop');
    var id = null, viditelne = 0, od = document.visibilityState === 'visible' ? Date.now() : 0;
    fetch('/api/navsteva', { method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
      body: JSON.stringify({ relace: relace, stranka: location.pathname, referrer: ref, zdroj: zdroj, zarizeni: zarizeni }) })
      .then(function (r) { return r.json(); }).then(function (d) { id = d && d.id; }).catch(function () {});
    var posli = function () {
      if (od) { viditelne += Date.now() - od; od = 0; }
      if (!id) return;
      var telo = JSON.stringify({ id: id, relace: relace, doba: Math.round(viditelne / 1000) });
      if (navigator.sendBeacon) navigator.sendBeacon('/api/navsteva', new Blob([telo], { type: 'application/json' }));
      else fetch('/api/navsteva', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: telo, keepalive: true }).catch(function () {});
    };
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') posli(); else od = Date.now(); });
    window.addEventListener('pagehide', posli);
  } catch (e) {}
})();
