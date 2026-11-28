// Start der App: Hülle, Wege über location.hash, Datenstand, Takt der Live-Preise.

import { h, datumZeit, zeit, alterStunden } from './format.js';
import { lade, BEISPIEL, zugang, leereCache, schluesselPasstNicht } from './daten.js';
import { einstellungen, oeffneOffen, oeffneKonto } from './speicher.js';
import * as tresor from './tresor.js';
import { zeigeAnmeldung } from './ansicht-anmeldung.js';
import { setzeMeta } from './kosten.js';
import { letzterLiveAbruf } from './live.js';
import { leereBeobachtung, starteTakt } from './beobachtung.js';
import { raeumeCharts } from './chart.js';
import { fuellePreise } from './bausteine.js';
import * as heute from './ansicht-heute.js';
import * as scanner from './ansicht-scanner.js';
import * as wert from './ansicht-wert.js';
import * as depot from './ansicht-depot.js';
import * as trading from './ansicht-trading.js';
import * as strategien from './ansicht-strategien.js';
import * as einstellungenAnsicht from './ansicht-einstellungen.js';

const ANSICHTEN = { heute, scanner, wert, depot, trading, strategien, einstellungen: einstellungenAnsicht };
const TITEL = { heute: 'Heute', scanner: 'Scanner', wert: 'Wert', depot: 'Depot', trading: 'Trading', strategien: 'Strategien', einstellungen: 'Einstellungen' };
const NAV_FUER = { wert: 'scanner' };

const inhalt = document.getElementById('inhalt');
const standEl = document.getElementById('stand');
const warnEl = document.getElementById('warnung');
let meta = null;
let aufraeumen = null;
let laufNr = 0;

function setzeThema() {
  const t = einstellungen().thema;
  if (t === 'hell' || t === 'dunkel') document.documentElement.dataset.thema = t;
  else delete document.documentElement.dataset.thema;
}

function zeichneStand() {
  const teile = [];
  if (BEISPIEL) teile.push('Beispieldaten');
  teile.push(meta && meta.erstellt ? 'Analyse vom ' + datumZeit(meta.erstellt) : 'Noch keine Analyse');
  const live = letzterLiveAbruf();
  if (live.zeit) teile.push(`Preise live von ${live.quelle}${live.quelle === 'Binance' ? ' (Ersatzquelle)' : ''}, ${zeit(live.zeit)}`);
  else teile.push(meta && meta.erstellt ? 'Preise aus der Analyse' : 'Preise noch nicht geladen');
  standEl.textContent = teile.join(' · ');
  const warnungen = [];
  if (!navigator.onLine) warnungen.push('Du bist offline. Die App zeigt den zuletzt geladenen Stand.');
  const alter = meta && meta.erstellt ? alterStunden(meta.erstellt) : null;
  if (alter != null && alter > 36) warnungen.push(`Die Analyse ist ${alter > 72 ? Math.round(alter / 24) + ' Tage' : Math.round(alter) + ' Stunden'} alt. Ranglisten, Setups und Urteile können überholt sein.`);
  warnEl.textContent = warnungen.join(' ');
  warnEl.hidden = warnungen.length === 0;
}

function markiereNav(name) {
  for (const a of document.querySelectorAll('[data-nav]')) {
    const aktiv = a.dataset.nav === name;
    a.classList.toggle('aktiv', aktiv);
    if (aktiv) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
}

async function route({ behalteScroll = false } = {}) {
  if (document.body.classList.contains('gesperrt')) return;      // vor der Anmeldung gibt es keine Ansichten
  const nr = ++laufNr;
  let roh = location.hash.replace(/^#/, '');
  try {
    roh = decodeURIComponent(roh);
  } catch (e) {
    /* unverändert */
  }
  const [erstes, ...rest] = roh.split('/');
  const name = ANSICHTEN[erstes] ? erstes : 'heute';
  if (aufraeumen) {
    try {
      aufraeumen();
    } catch (e) {
      /* still */
    }
    aufraeumen = null;
  }
  raeumeCharts();
  leereBeobachtung();
  markiereNav(NAV_FUER[name] || name);
  const wurzel = h('div', { class: 'ansicht ansicht-' + name });
  if (!inhalt.firstChild) inhalt.append(h('p', { class: 'laden' }, 'Lädt …'));
  try {
    const r = await ANSICHTEN[name].zeige(wurzel, rest.join('/'));
    if (nr !== laufNr) {
      if (typeof r === 'function') r();
      return;
    }
    aufraeumen = typeof r === 'function' ? r : null;
    inhalt.replaceChildren(wurzel);
  } catch (e) {
    console.error(e);
    if (nr !== laufNr) return;
    inhalt.replaceChildren(h('div', { class: 'kasten k-schlecht' },
      h('strong', {}, 'Diese Ansicht konnte nicht aufgebaut werden.'),
      h('p', {}, 'Lade die Seite neu. Bleibt der Fehler, sind die Daten der Analyse unvollständig.'),
      h('p', { class: 'leise' }, String((e && e.message) || e))));
  }
  const ueberschrift = inhalt.querySelector('h1');
  document.title = (ueberschrift && name === 'wert' ? ueberschrift.textContent : TITEL[name]) + ' · Investment-Analyst';
  if (!behalteScroll) window.scrollTo(0, 0);
}

window.addEventListener('hashchange', () => route());
window.addEventListener('ia-neu', () => route({ behalteScroll: true }));
window.addEventListener('ia-thema', setzeThema);
window.addEventListener('ia-preise', () => {
  fuellePreise();
  zeichneStand();
});
window.addEventListener('ia-live', zeichneStand);
window.addEventListener('online', zeichneStand);
window.addEventListener('offline', zeichneStand);

let taktLaeuft = false;
let zugangsInfo = null;

// Zeigt nur das Anmeldeformular. modus: undefined (anmelden oder einrichten) oder 'code' (neuer Einladungscode).
function zeigeSperre(modus) {
  document.body.classList.add('gesperrt');
  standEl.textContent = modus === 'code' ? 'Neuer Einladungscode nötig' : 'Bitte anmelden';
  warnEl.hidden = true;
  document.title = 'Anmelden · Investment-Analyst';
  zeigeAnmeldung(inhalt, { info: zugangsInfo, modus, beiErfolg: () => oeffneApp() });
}

// Nach der Anmeldung (oder im Betrieb ohne Anmeldung): Daten laden und die Ansichten freigeben.
async function oeffneApp() {
  leereCache();
  if (tresor.angemeldet()) {
    oeffneKonto(await tresor.ladeNutzerdaten(), (z) => tresor.schreibeNutzerdaten(z));
  }
  setzeThema();
  meta = await lade('meta');
  if (!meta && zugangsInfo && schluesselPasstNicht()) {
    zeigeSperre('code');          // die Daten wurden mit einem neuen Einladungscode verschlüsselt
    return;
  }
  document.body.classList.remove('gesperrt');
  setzeMeta(meta);
  zeichneStand();
  if (!taktLaeuft) {
    taktLaeuft = true;
    starteTakt();
    // Handelszeiten und Alter der Analyse ändern sich auch ohne neue Preise.
    setInterval(() => {
      if (document.body.classList.contains('gesperrt')) return;
      fuellePreise();
      zeichneStand();
    }, 60000);
  }
  await route();
}

async function start() {
  setzeThema();
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  zugangsInfo = await zugang();
  if (!zugangsInfo) {               // Daten liegen offen vor (Arbeit am PC, Beispieldaten): kein Konto nötig
    oeffneOffen();
    return oeffneApp();
  }
  if (await tresor.setzeSitzungFort()) return oeffneApp();
  zeigeSperre();
}

start();
