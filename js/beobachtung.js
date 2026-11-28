// Welche Werte die aktuelle Ansicht live braucht, und der Takt der Abrufe.
// Ticker-Preise (Krypto, Metalle, Indizes) jede Minute, Preise aus Kerzen (Aktien, ETFs, Rohstoffe) alle drei Minuten,
// beides nur, solange die Seite sichtbar ist.

import { aktualisierePreise } from './live.js';

const werte = new Map();
let geplant = null;
let takt = 0;
let letzter = 0;

export function leereBeobachtung() {
  werte.clear();
}

// liste: [{pid, sym, klasse}]
export function beobachte(liste) {
  let neu = false;
  for (const w of liste || []) {
    if (w && w.pid && !werte.has(w.pid)) {
      werte.set(w.pid, { pid: w.pid, sym: w.sym || '', klasse: w.klasse || '' });
      neu = true;
    }
  }
  if (neu && !geplant) {
    geplant = setTimeout(() => {
      geplant = null;
      hole(true);
    }, 60);
  }
}

async function hole(mitKerzen) {
  if (!werte.size) return;
  letzter = Date.now();
  try {
    await aktualisierePreise([...werte.values()], { mitKerzen });
  } catch (e) {
    /* still: Die App zeigt dann die Preise aus der Analyse */
  }
}

export function starteTakt() {
  setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    takt += 1;
    hole(takt % 3 === 0);
  }, 60000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - letzter > 60000) hole(true);
  });
  window.addEventListener('online', () => hole(true));
}

// Ansicht neu aufbauen, ohne die Adresse zu ändern.
export function neuZeichnen() {
  window.dispatchEvent(new CustomEvent('ia-neu'));
}
