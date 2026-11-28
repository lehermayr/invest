// Bereich „Scanner": zwei getrennte Ranglisten plus Marktübersicht.

import { h, datumZeit } from './format.js';
import { lade } from './daten.js';
import { ansicht, setzeAnsicht, gemerkt } from './speicher.js';
import { beobachte } from './beobachtung.js';
import { seitenkopf, bildStil } from './einfach.js';
import {
  segment, wertSuche, keineDaten, notenBalken, statusPlakette, plakette, preisEl, stern, rendite, trendEl, hinweisKasten,
  KLASSEN, GROESSE, HORIZONT, STATUS, RISIKO, TRAGF, TREND, notenWort,
} from './bausteine.js';

const LISTEN = [
  { id: 'qualitaet', name: 'Qualitätsführer' },
  { id: 'wachstum', name: 'Wachstumschancen' },
  { id: 'maerkte', name: 'Märkte' },
];
const ERKL = {
  qualitaet: 'Etablierte Werte mit starkem Fundament. Ein hoher Rang heißt nicht „jetzt kaufen": Der Status sagt, ob der Zeitpunkt passt.',
  wachstum: 'Mittlere und kleinere Werte mit belegbarem Wachstum. Höhere Chancen, höhere Risiken, oft weniger Daten.',
  maerkte: 'ETFs, Metalle, Rohstoffe und Krypto-Indizes ohne Rangliste: Preis, Entwicklung und Trend.',
};
const FILTER_LEER = { klasse: '', sektor: '', region: '', groesse: '', horizont: '', risiko: '', status: '', nq: '', nb: '', nt: '', nw: '', merk: false };
const MARKT_LEER = { mgruppe: '', mtrend: '' };
// Filter nach den Kategorien auf den Karten: Stufe hoch, mitte oder tief der jeweiligen Note
const STUFEN = { nq: ['qualitaet', 'Qualität', ['stark', 'mittel', 'schwach']], nb: ['bewertung', 'Preis', ['günstig', 'normal', 'teuer']],
  nt: ['technik', 'Trend', ['stark', 'neutral', 'schwach']], nw: ['wachstum', 'Wachstum', ['stark', 'mittel', 'schwach']] };
const stufeVon = (k, id) => { const w = notenWort(id, (k.noten || {})[id]); return w ? w.stufe : ''; };
const SCHRITT = 10;

export async function zeige(root) {
  const [rang, markt] = await Promise.all([lade('ranglisten'), lade('markt')]);
  let zustand = ansicht('scanner', { liste: 'qualitaet', ...FILTER_LEER, ...MARKT_LEER });
  if (!LISTEN.some((l) => l.id === zustand.liste)) zustand.liste = 'qualitaet';
  let anzahl = SCHRITT;

  root.append(
    h('h1', {}, 'Scanner'),
    seitenkopf('scanner'),
    h('div', { class: 'suchzeile' },
      h('label', { for: 'scanner-suche' }, 'Alle handelbaren Werte durchsuchen'),
      wertSuche({ id: 'scanner-suche', onWahl: (w) => { location.hash = '#wert/' + w.pid; } })));
  const kopf = h('div', {});
  const inhalt = h('div', {});
  root.append(kopf, inhalt);

  const setze = (teil, behalteAnzahl = false) => {
    zustand = { ...zustand, ...teil };
    setzeAnsicht('scanner', zustand);
    if (!behalteAnzahl) anzahl = SCHRITT;
    zeichne();
  };

  function zeichne() {
    kopf.replaceChildren(
      segment(LISTEN, zustand.liste, (id) => setze({ liste: id }), 'Liste wählen'),
      h('p', { class: 'leise' }, ERKL[zustand.liste]));
    inhalt.replaceChildren();
    if (zustand.liste === 'maerkte') zeichneMaerkte();
    else zeichneListe();
  }

  function zeichneListe() {
    if (!rang) {
      inhalt.append(keineDaten());
      return;
    }
    const alle = Array.isArray(rang[zustand.liste]) ? rang[zustand.liste] : [];
    const hinweis = rang.hinweise && rang.hinweise[zustand.liste];
    const werte = (feld) => [...new Set(alle.map((k) => k[feld]).filter(Boolean))].sort();
    const wahl = (id, name, optionen, feld) => {
      const sel = h('select', { id: 'filter-' + feld, onchange: (ev) => setze({ [feld]: ev.target.value }) },
        h('option', { value: '' }, 'alle'),
        optionen.map(([v, t]) => h('option', { value: v, selected: zustand[feld] === v }, t)));
      return h('div', { class: 'feld' }, h('label', { for: 'filter-' + feld }, name), sel);
    };
    const aktiv = Object.entries(FILTER_LEER).filter(([k, leer]) => zustand[k] !== leer).length;
    const filter = h('details', { class: 'filter', open: aktiv > 0 },
      h('summary', {}, 'Filter', aktiv ? ` (${aktiv} aktiv)` : ''),
      h('div', { class: 'filterfelder' },
        wahl('klasse', 'Anlageklasse', werte('klasse').map((v) => [v, KLASSEN[v] || v]), 'klasse'),
        wahl('sektor', 'Sektor', werte('sektor').map((v) => [v, v]), 'sektor'),
        wahl('region', 'Region', werte('region').map((v) => [v, v]), 'region'),
        ...Object.entries(STUFEN).map(([feld, [, name, worte]]) => wahl(feld, name, [['hoch', worte[0]], ['mitte', worte[1]], ['tief', worte[2]]], feld)),
        wahl('groesse', 'Größe', Object.entries(GROESSE), 'groesse'),
        wahl('horizont', 'Anlagehorizont', Object.entries(HORIZONT), 'horizont'),
        wahl('risiko', 'Risikostufe', Object.entries(RISIKO), 'risiko'),
        wahl('status', 'Status', Object.entries(STATUS), 'status'),
        h('div', { class: 'feld feld-haken' },
          h('input', { type: 'checkbox', id: 'filter-merk', checked: !!zustand.merk, onchange: (ev) => setze({ merk: ev.target.checked }) }),
          h('label', { for: 'filter-merk' }, 'nur Merkliste')),
        aktiv ? h('button', { type: 'button', class: 'leicht', onclick: () => setze({ ...FILTER_LEER }) }, 'Filter zurücksetzen') : null));
    const passend = alle.filter((k) =>
      (!zustand.klasse || k.klasse === zustand.klasse) &&
      (!zustand.sektor || k.sektor === zustand.sektor) &&
      Object.entries(STUFEN).every(([feld, [id]]) => !zustand[feld] || stufeVon(k, id) === zustand[feld]) &&
      (!zustand.region || k.region === zustand.region) &&
      (!zustand.groesse || k.groesse === zustand.groesse) &&
      (!zustand.horizont || (k.horizont || []).includes(zustand.horizont)) &&
      (!zustand.risiko || k.risikostufe === zustand.risiko) &&
      (!zustand.status || k.status === zustand.status) &&
      (!zustand.merk || gemerkt(k.pid)));
    const sichtbar = passend.slice(0, anzahl);
    inhalt.append(filter);
    if (hinweis) inhalt.append(hinweisKasten(hinweis, 'neutral'));
    if (!alle.length) {
      inhalt.append(hinweisKasten('Derzeit erfüllt kein Wert die Kriterien dieser Liste. Die App füllt die Liste nicht mit schwachen Treffern auf.', 'neutral'));
      return;
    }
    inhalt.append(h('p', { class: 'zaehler' },
      aktiv ? `${passend.length} von ${alle.length} Werten passen zu den Filtern.` : `${Math.min(anzahl, alle.length)} von ${alle.length} Werten, sortiert nach der Note in dieser Liste.`,
      rang.stand ? ' Stand ' + datumZeit(rang.stand) + '.' : ''));
    if (!passend.length) {
      inhalt.append(hinweisKasten('Kein Wert passt zu den Filtern.', 'neutral'));
      return;
    }
    inhalt.append(h('ol', { class: 'kartenliste' }, sichtbar.map((k) => h('li', {}, wertKarte(k, zustand.liste)))));
    if (passend.length > anzahl) {
      inhalt.append(h('div', { class: 'knoepfe mitte' },
        h('button', { type: 'button', onclick: () => { anzahl += SCHRITT; zeichne(); } }, `Mehr anzeigen (${passend.length - anzahl} weitere)`)));
    }
    beobachte(sichtbar);
  }

  function zeichneMaerkte() {
    const liste = (markt && markt.maerkte) || [];
    if (!liste.length) {
      inhalt.append(markt ? hinweisKasten('Die Marktübersicht ist leer.', 'neutral') : keineDaten());
      return;
    }
    const gruppenNamen = [...new Set(liste.map((m) => m.gruppe || KLASSEN[m.klasse] || 'Weitere'))];
    const mwahl = (feld, name, optionen) => h('div', { class: 'feld' }, h('label', { for: 'filter-' + feld }, name),
      h('select', { id: 'filter-' + feld, onchange: (ev) => setze({ [feld]: ev.target.value }) }, h('option', { value: '' }, 'alle'),
        optionen.map(([v, t]) => h('option', { value: v, selected: zustand[feld] === v }, t))));
    const maktiv = (zustand.mgruppe ? 1 : 0) + (zustand.mtrend ? 1 : 0);
    inhalt.append(h('details', { class: 'filter', open: maktiv > 0 }, h('summary', {}, 'Filter', maktiv ? ` (${maktiv} aktiv)` : ''),
      h('div', { class: 'filterfelder' },
        mwahl('mgruppe', 'Kategorie', gruppenNamen.map((g) => [g, g])),
        mwahl('mtrend', 'Trend', Object.entries(TREND)),
        maktiv ? h('button', { type: 'button', class: 'leicht', onclick: () => setze({ ...MARKT_LEER }) }, 'Filter zurücksetzen') : null)));
    const gefiltert = liste.filter((m) => (!zustand.mgruppe || (m.gruppe || KLASSEN[m.klasse] || 'Weitere') === zustand.mgruppe) && (!zustand.mtrend || m.trend === zustand.mtrend));
    if (!gefiltert.length) inhalt.append(hinweisKasten('Kein Wert passt zu den Filtern.', 'neutral'));
    const gruppen = new Map();
    for (const m of gefiltert) {
      const g = m.gruppe || KLASSEN[m.klasse] || 'Weitere';
      if (!gruppen.has(g)) gruppen.set(g, []);
      gruppen.get(g).push(m);
    }
    for (const [name, werte] of gruppen) {
      inhalt.append(h('h2', {}, name), h('div', { class: 'tabellenrahmen' },
        h('table', { class: 'tabelle maerkte' },
          h('thead', {}, h('tr', {},
            h('th', { scope: 'col' }, 'Name'), h('th', { scope: 'col', class: 'r' }, 'Preis'),
            h('th', { scope: 'col', class: 'r' }, '1 Woche'), h('th', { scope: 'col', class: 'r' }, '1 Monat'),
            h('th', { scope: 'col', class: 'r' }, '3 Monate'), h('th', { scope: 'col', class: 'r' }, '12 Monate'),
            h('th', { scope: 'col' }, 'Trend'), h('th', { scope: 'col', class: 'r' }, 'zur 200-Tage-Linie'))),
          h('tbody', {}, werte.map((m) => h('tr', {},
            h('th', { scope: 'row' }, h('a', { href: '#wert/' + m.pid }, m.name), h('span', { class: 'sym' }, m.sym || '')),
            h('td', { class: 'r' }, preisEl(m, m.preis, { zusatz: false })),
            h('td', { class: 'r' }, rendite(m.r1w)), h('td', { class: 'r' }, rendite(m.r1m)),
            h('td', { class: 'r' }, rendite(m.r3m)), h('td', { class: 'r' }, rendite(m.r12m)),
            h('td', {}, trendEl(m.trend)), h('td', { class: 'r' }, rendite(m.abst200))))))));
    }
    inhalt.append(h('p', { class: 'leise' }, 'Live-Preise gibt es in dieser Tabelle für Metalle und Krypto-Indizes. Bei ETFs und Rohstoffen steht der Preis aus der Analyse, den Live-Preis zeigt die Detailseite.'));
    // In dieser langen Tabelle nur die Werte live holen, die im Ticker stehen (ein Abruf für alle).
    beobachte(liste.filter((m) => ['metall', 'index', 'krypto', 'hebel'].includes(m.klasse)));
  }

  zeichne();
}

function wertKarte(k, liste) {
  const zusatz = [k.sym, KLASSEN[k.klasse] || k.klasse, k.groesse_text || GROESSE[k.groesse], k.region, k.sektor].filter(Boolean).join(' · ');
  return h('article', { class: 'karte wertkarte mit-bild st-' + (k.status || 'leer'), style: bildStil(k) },
    h('div', { class: 'wk-rang', 'aria-label': 'Rang ' + k.rang }, h('span', {}, String(k.rang != null ? k.rang : '–'))),
    h('div', { class: 'wk-haupt' },
      h('h3', {}, h('a', { href: '#wert/' + k.pid, class: 'kartenlink' }, k.name || k.sym)),
      h('p', { class: 'unterzeile' }, zusatz),
      h('div', { class: 'plaketten' },
        statusPlakette(k.status),
        liste === 'wachstum' && TRAGF[k.tragfaehigkeit] ? plakette(TRAGF[k.tragfaehigkeit], k.tragfaehigkeit === 'belegt' ? 'gut' : 'warn', k.tragfaehigkeit === 'belegt' ? 'kreis' : 'dreieck') : null,
        (k.horizont || []).map((x) => (HORIZONT[x] ? h('span', { class: 'marke' }, HORIZONT[x]) : null)))),
    h('div', { class: 'wk-text' },
      k.kurz ? h('p', { class: 'kurz' }, k.kurz) : null,
      k.status_text ? h('p', { class: 'leise' }, k.status_text) : null),
    h('div', { class: 'wk-seite' },
      h('div', { class: 'score', title: 'Note innerhalb dieser Liste, 0 bis 100' },
        h('span', { class: 'score-zahl zahl' }, k.score != null ? String(Math.round(k.score)) : '–'),
        h('span', { class: 'score-name' }, 'Note in der Liste')),
      stern(k.pid, k.name)),
    h('div', { class: 'wk-noten' }, notenBalken(k.noten, { kompakt: true })),
    h('div', { class: 'wk-fuss' },
      preisEl(k, k.preis),
      h('span', { class: 'wk-rendite' }, '1 Monat ', rendite(k.r1m)),
      h('span', { class: 'wk-rendite' }, '12 Monate ', rendite(k.r12m)),
      k.trend ? trendEl(k.trend) : null));
}
