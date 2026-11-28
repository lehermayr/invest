// Alles Persönliche bleibt auf dem Gerät: Depot, Merkliste, Einstellungen.
// Mit Anmeldung (verschlüsselte Daten): Der Stand gehört zum angemeldeten Konto und wird mit dessen Passwort
// verschlüsselt abgelegt (tresor.js). Ohne Anmeldung (Arbeit am PC, Beispieldaten): offen im localStorage.
// Der Speicher kann fehlen oder gesperrt sein (privates Fenster), deshalb jedes Lesen und Schreiben mit try/catch.

const SCHLUESSEL = 'investment-analyst-v1';

const VORGABE = () => ({
  depot: [],
  merkliste: [],
  einstellungen: { kapital: 10000, risiko: null, ordergroesse: null, krypto_weg: 'broker', kosten: {}, thema: 'system' },
  ansicht: {},
});

let zustand = VORGABE();
let dauerhaft = true;
let offen = false;          // Betrieb ohne Anmeldung
let schreiber = null;       // mit Anmeldung: Funktion, die den Stand verschlüsselt ablegt
let kette = Promise.resolve();

// Betrieb ohne Anmeldung: Stand offen aus dem localStorage lesen.
export function oeffneOffen() {
  offen = true;
  schreiber = null;
  try {
    const roh = localStorage.getItem(SCHLUESSEL);
    if (roh) zustand = pruefe(JSON.parse(roh));
  } catch (e) {
    dauerhaft = false;
  }
}

// Nach der Anmeldung: Stand des Kontos übernehmen. schreibFn(zustand) legt ihn verschlüsselt ab.
export function oeffneKonto(daten, schreibFn) {
  offen = false;
  zustand = pruefe(daten);
  schreiber = schreibFn;
  dauerhaft = true;
}

// Beim Abmelden: nichts Persönliches im Arbeitsspeicher lassen.
export function schliesse() {
  zustand = VORGABE();
  schreiber = null;
  offen = false;
}

function ablegen() {
  if (schreiber) {
    const fn = schreiber;
    // nacheinander schreiben, immer den neuesten Stand
    kette = kette.then(() => fn(zustand)).then((ok) => { dauerhaft = ok !== false; }).catch(() => { dauerhaft = false; });
    return;
  }
  if (!offen) return;       // vor der Anmeldung wird nichts gespeichert
  try {
    localStorage.setItem(SCHLUESSEL, JSON.stringify(zustand));
    dauerhaft = true;
  } catch (e) {
    dauerhaft = false;
  }
}

function pruefe(z) {
  const v = VORGABE();
  if (!z || typeof z !== 'object') return v;
  if (Array.isArray(z.depot)) {
    v.depot = z.depot
      .filter((p) => p && typeof p.pid === 'string' && isFinite(Number(p.stueck)))
      .map((p) => ({
        id: String(p.id || 'p' + Math.random().toString(36).slice(2)),
        pid: p.pid,
        sym: String(p.sym || ''),
        name: String(p.name || p.sym || ''),
        klasse: String(p.klasse || ''),
        stueck: Number(p.stueck),
        kaufpreis: num(p.kaufpreis),
        kaufdatum: /^\d{4}-\d{2}-\d{2}$/.test(p.kaufdatum || '') ? p.kaufdatum : null,
        stop: num(p.stop),
        notiz: String(p.notiz || '').slice(0, 300),
      }));
  }
  if (Array.isArray(z.merkliste)) v.merkliste = z.merkliste.filter((x) => typeof x === 'string');
  if (z.einstellungen && typeof z.einstellungen === 'object') {
    const e = z.einstellungen;
    if (num(e.kapital) != null) v.einstellungen.kapital = Number(e.kapital);
    if (num(e.risiko) != null) v.einstellungen.risiko = Number(e.risiko);
    if (['system', 'hell', 'dunkel'].includes(e.thema)) v.einstellungen.thema = e.thema;
    if (num(e.ordergroesse) != null && Number(e.ordergroesse) > 0) v.einstellungen.ordergroesse = Number(e.ordergroesse);
    if (e.krypto_weg === 'fusion') v.einstellungen.krypto_weg = 'fusion';
    if (e.kosten && typeof e.kosten === 'object') {
      for (const [k, w] of Object.entries(e.kosten)) {
        if (w && (num(w.kauf) != null || num(w.verkauf) != null)) v.einstellungen.kosten[k] = { kauf: num(w.kauf), verkauf: num(w.verkauf) };
      }
    }
  }
  if (z.ansicht && typeof z.ansicht === 'object') v.ansicht = z.ansicht;
  return v;
}

function num(x) {
  if (x == null || x === '') return null;
  const n = Number(x);
  return isFinite(n) ? n : null;
}

function sichere() {
  ablegen();
  window.dispatchEvent(new CustomEvent('ia-zustand'));
}

export const speichertDauerhaft = () => dauerhaft;
export const depot = () => zustand.depot;
export const merkliste = () => zustand.merkliste;
export const einstellungen = () => zustand.einstellungen;

export function setzePosition(pos) {
  const i = zustand.depot.findIndex((p) => p.id === pos.id);
  if (i >= 0) zustand.depot[i] = pos;
  else zustand.depot.push({ ...pos, id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) });
  zustand = pruefe(zustand);
  sichere();
}

export function loeschePosition(id) {
  zustand.depot = zustand.depot.filter((p) => p.id !== id);
  sichere();
}

export function gemerkt(pid) {
  return zustand.merkliste.includes(pid);
}

export function schalteMerken(pid) {
  if (gemerkt(pid)) zustand.merkliste = zustand.merkliste.filter((x) => x !== pid);
  else zustand.merkliste.push(pid);
  sichere();
  return gemerkt(pid);
}

export function setzeEinstellungen(teil) {
  zustand.einstellungen = { ...zustand.einstellungen, ...teil };
  zustand = pruefe(zustand);
  sichere();
}

// Zuletzt gewählte Umschalter und Filter je Bereich (nur Bequemlichkeit).
export function ansicht(name, vorgabe) {
  return { ...vorgabe, ...(zustand.ansicht[name] || {}) };
}

export function setzeAnsicht(name, teil) {
  zustand.ansicht[name] = { ...(zustand.ansicht[name] || {}), ...teil };
  ablegen();
}

// Sicherung für den Wechsel zwischen Handy und PC.
export function sicherungAlsText() {
  return JSON.stringify({
    art: 'investment-analyst-sicherung',
    version: 1,
    erstellt: new Date().toISOString(),
    depot: zustand.depot,
    merkliste: zustand.merkliste,
    einstellungen: zustand.einstellungen,
  });
}

export function leseSicherung(text) {
  let d;
  try {
    d = JSON.parse(String(text || '').trim());
  } catch (e) {
    return { ok: false, grund: 'Der Text ist keine gültige Sicherung.' };
  }
  if (!d || d.art !== 'investment-analyst-sicherung') return { ok: false, grund: 'Das ist keine Sicherung dieser App.' };
  const neu = pruefe({ depot: d.depot, merkliste: d.merkliste, einstellungen: d.einstellungen, ansicht: zustand.ansicht });
  zustand = neu;
  sichere();
  return { ok: true, positionen: neu.depot.length, gemerkt: neu.merkliste.length };
}
