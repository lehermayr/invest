// Lädt die Ergebnisdateien der Pipeline (siehe DATENVERTRAG.md). Fehlende Dateien ergeben null, nie einen Fehler.
// Liegt im Datenordner eine zugang.json, sind die Dateien verschlüsselt (.enc) und werden mit dem Schlüssel
// der angemeldeten Person geöffnet (tresor.js).

import { entschluessleDaten } from './tresor.js';

const params = new URLSearchParams(location.search);
const ordner = (params.get('daten') || 'data').replace(/[^a-zA-Z0-9_-]/g, '') || 'data';
export const BASIS = ordner + '/';
export const BEISPIEL = ordner !== 'data';

const cache = new Map();
let zugangInfo = null;
let schluesselFalsch = false;

// Angaben zur Verschlüsselung (data/zugang.json). null heißt: Die Daten liegen offen vor (Arbeit am PC, Beispieldaten).
export function zugang() {
  if (!zugangInfo) {
    const MERKER = 'ia-zugang-v1';
    zugangInfo = fetch(BASIS + 'zugang.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .then((z) => {
        const info = z && z.verschluesselt ? z : null;
        try {
          if (info && !BEISPIEL) localStorage.setItem(MERKER, JSON.stringify(info));
        } catch (e) { /* ohne Merker geht es auch */ }
        return info;
      })
      .catch(() => {
        // Kein Netz: Wurde die App hier schon mit Anmeldung benutzt, bleibt es dabei (nie unverschlüsselt weiterarbeiten).
        try {
          return BEISPIEL ? null : JSON.parse(localStorage.getItem(MERKER) || 'null');
        } catch (e) {
          return null;
        }
      });
  }
  return zugangInfo;
}

// Rohinhalt einer Datei im Datenordner (für die Prüfung des Einladungscodes).
export async function ladeRoh(datei) {
  const r = await fetch(BASIS + datei, { cache: 'no-cache' });
  if (!r.ok) throw new Error('Die Datei ' + datei + ' ist nicht erreichbar.');
  return r.arrayBuffer();
}

// true, wenn eine Datei da war, sich aber mit dem gespeicherten Schlüssel nicht öffnen ließ (neuer Einladungscode).
export const schluesselPasstNicht = () => schluesselFalsch;

export function leereCache() {
  cache.clear();
  uni = null;
  schluesselFalsch = false;
}

export function lade(name) {
  if (cache.has(name)) return cache.get(name);
  const p = (async () => {
    const z = await zugang();
    if (!z) {
      const r = await fetch(BASIS + name + '.json', { cache: 'no-cache' });
      return r.ok ? r.json() : null;
    }
    const r = await fetch(BASIS + name + '.enc', { cache: 'no-cache' });
    if (!r.ok) return null;
    const puffer = await r.arrayBuffer();
    try {
      return await entschluessleDaten(puffer);
    } catch (e) {
      schluesselFalsch = true;
      return null;
    }
  })().catch(() => null);
  cache.set(name, p);
  return p;
}

export function ladeWert(pid) {
  if (!/^[a-zA-Z0-9-]+$/.test(pid || '')) return Promise.resolve(null);
  return lade('werte/' + pid);
}

let uni = null;

// Universum als Liste von Objekten plus Nachschlagetabelle nach pid.
export function universum() {
  if (uni) return uni;
  uni = lade('universum').then((d) => {
    const liste = [];
    const nachPid = new Map();
    if (d && Array.isArray(d.werte)) {
      const f = Array.isArray(d.felder) ? d.felder : ['pid', 'sym', 'name', 'klasse', 'isin'];
      const i = (n) => f.indexOf(n);
      const [ip, is, iname, ik, ii] = [i('pid'), i('sym'), i('name'), i('klasse'), i('isin')];
      for (const z of d.werte) {
        if (!Array.isArray(z) || !z[ip]) continue;
        const w = { pid: z[ip], sym: z[is] || '', name: z[iname] || z[is] || '', klasse: z[ik] || '', isin: z[ii] || '' };
        w.such = (w.name + ' ' + w.sym + ' ' + w.isin).toLowerCase();
        liste.push(w);
        nachPid.set(w.pid, w);
      }
    }
    return { liste, nachPid, stand: d ? d.stand : null };
  });
  return uni;
}

// Stammdaten zu einer pid aus dem Universum (oder null).
export async function stamm(pid) {
  const u = await universum();
  return u.nachPid.get(pid) || null;
}

export function suche(liste, text, max = 12) {
  const q = (text || '').trim().toLowerCase();
  if (q.length < 2) return [];
  const treffer = [];
  for (const w of liste) {
    const sym = w.sym.toLowerCase();
    const name = w.name.toLowerCase();
    let rang = -1;
    if (sym === q) rang = 0;
    else if (name === q) rang = 1;
    else if (sym.startsWith(q)) rang = 2;
    else if (name.startsWith(q)) rang = 3;
    else if (w.such.includes(q)) rang = 4;
    if (rang >= 0) treffer.push([rang, w]);
  }
  treffer.sort((a, b) => a[0] - b[0] || a[1].name.length - b[1].name.length);
  return treffer.slice(0, max).map((t) => t[1]);
}
