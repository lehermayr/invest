// Bereich „Strategien": regelbasierte Strategien mit Rückrechnung und aktuellem Signal, darunter das Signal-Protokoll.

import { h, pct, zahl, datum, eur, heute } from './format.js';
import { lade } from './daten.js';
import { seitenkopf, bildStil } from './einfach.js';
import { linienChart } from './chart.js';
import { abschnitt, keineDaten, plakette, punkteListe, hinweisKasten, rendite, KLASSEN } from './bausteine.js';

const ZUSTAND = { offen: ['Offen', 'neutral', 'strich'], ziel: ['Ziel erreicht', 'gut', 'kreis'], stop: ['Stop', 'schlecht', 'quadrat'], zeit: ['Zeit abgelaufen', 'warn', 'dreieck'] };

export async function zeige(root) {
  const [strat, prot, setupsD, nachk] = await Promise.all([lade('strategien'), lade('protokoll'), lade('setups'), lade('nachkauf')]);
  root.append(h('h1', {}, 'Strategien'), seitenkopf('strategien'));
  if (!strat && !prot) {
    root.append(keineDaten());
    return;
  }
  if (nachk && Array.isArray(nachk.liste) && nachk.liste.length) root.append(nachkaufBlock(nachk));
  root.append(h('p', { class: 'leise' }, 'Feste Regeln statt Bauchgefühl. Jede Strategie ist über die Vergangenheit nachgerechnet, mit Bitpanda-Kosten und Steuer, und zeigt ihr aktuelles Signal. Vergangene Ergebnisse sichern nichts zu.'));
  const liste = (strat && strat.liste) || [];
  if (!liste.length) root.append(hinweisKasten('Es sind noch keine Strategien gerechnet.', 'neutral'));
  for (const s of liste) root.append(strategieKarte(s));
  root.append(protokoll(prot, (setupsD && setupsD.typen) || []));
}

// Nachkauf-Sicht: Abstand zum Hoch, was nach solchen Phasen früher geschah, und Stufen zum gestaffelten Nachkaufen.
function nachkaufBlock(nachk) {
  const karten = nachk.liste.map((n) => {
    const stufen = Array.isArray(n.staffel) ? n.staffel : [];
    const erreicht = stufen.filter((s) => s.erreicht).length;
    const art = erreicht === 0 ? 'neutral' : erreicht === stufen.length ? 'gut' : 'warn';
    return h('article', { class: 'karte strategie mit-bild', style: bildStil({ klasse: n.klasse, bild: { welt: 'welt', usa_tech: 'technik' }[n.id] }) },
      h('header', {},
        h('h3', {}, n.pid ? h('a', { href: '#wert/' + n.pid }, n.name) : n.name, n.sym ? h('span', { class: 'sym' }, ' ' + n.sym) : null),
        plakette(erreicht ? `Stufe ${erreicht} von ${stufen.length} erreicht` : 'keine Stufe erreicht', art, erreicht ? 'dreieck' : 'strich')),
      n.zone_text ? h('p', { class: 'zone zone-' + (n.zone || 'normal') }, n.zone_text) : null,
      h('p', {}, n.text || ''),
      Array.isArray(n.muster) && n.muster.length ? h('div', { class: 'muster' }, h('h4', {}, 'Was bisher fast immer galt'), punkteListe(n.muster)) : null,
      stufen.length ? h('div', { class: 'tabellenrahmen' }, h('table', { class: 'tabelle' },
        h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Nachkauf-Stufe'), h('th', { scope: 'col', class: 'r' }, 'Kurs bei Bitpanda etwa'), h('th', { scope: 'col' }, 'Stand'))),
        h('tbody', {}, stufen.map((s, i) => h('tr', {},
          h('th', { scope: 'row' }, `Stufe ${i + 1}: ${pct(Math.abs(s.abstand), 0)} unter dem Hoch`),
          h('td', { class: 'r zahl' }, s.preis != null ? eur(s.preis) : '–'),
          h('td', {}, s.erreicht ? plakette('erreicht', 'gut', 'kreis') : plakette('noch nicht', 'neutral', 'strich'))))))) : null,
      h('details', { class: 'klappe' }, h('summary', {}, `Was nach solchen Phasen früher geschah (${n.zeitraum || ''})`),
        h('div', { class: 'tabellenrahmen' }, h('table', { class: 'tabelle' },
          h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Abstand zum Hoch am Kauftag'), h('th', { scope: 'col', class: 'r' }, 'Rückgänge'),
            h('th', { scope: 'col', class: 'r' }, '1 Jahr später (Mittel)'), h('th', { scope: 'col', class: 'r' }, 'im Plus'),
            h('th', { scope: 'col', class: 'r' }, 'schlechtester Fall'), h('th', { scope: 'col', class: 'r' }, '3 Jahre später (Mittel)'))),
          h('tbody', {}, (n.tabelle || []).map((z) => h('tr', { class: z.aktuell ? 'aktuell' : '' },
            h('th', { scope: 'row' }, z.text, z.aktuell ? h('small', {}, 'hier steht der Kurs heute') : null),
            h('td', { class: 'r zahl' }, String(z.phasen != null ? z.phasen : '–')),
            h('td', { class: 'r' }, rendite(z.median_1j)), h('td', { class: 'r zahl' }, z.positiv_1j != null ? pct(z.positiv_1j, 0) : '–'),
            h('td', { class: 'r' }, rendite(z.schlechtester_1j)), h('td', { class: 'r' }, rendite(z.median_3j)))))))));
  });
  return abschnitt('Nachkaufen bei Rückgängen',
    h('p', { class: 'leise' }, 'Aus der Vergangenheit lernen: Für Werte, die du über Jahre aufbaust, war Kaufen in der Angst bisher besser als Kaufen in der Euphorie. Rot heißt hier Gelegenheit, Grün heißt Gewinne prüfen. Die Stufen helfen, den Einsatz zu staffeln.'),
    ...karten,
    Array.isArray(nachk.grenzen) && nachk.grenzen.length ? h('details', { class: 'klappe' }, h('summary', {}, 'Grenzen dieser Sicht'), punkteListe(nachk.grenzen)) : null);
}

function strategieKarte(s) {
  const sig = s.signal || {};
  const faellig = sig.naechste_pruefung && sig.naechste_pruefung <= heute();
  const halten = Array.isArray(sig.halten) ? sig.halten : [];
  const k = s.kennzahlen || {};
  const v = s.vergleich || {};
  const zeile = (name, a, b, erkl) => h('tr', {}, h('th', { scope: 'row' }, name, erkl ? h('small', {}, erkl) : null), h('td', { class: 'r' }, a), h('td', { class: 'r' }, b));
  const z = (x, stellen = 1) => (x == null ? '–' : zahl(x, stellen));
  const leinwand = h('canvas', { class: 'chart chart-linie', role: 'img', 'aria-label': `Wertentwicklung von ${s.name} gegen ${v.name || 'Vergleich'}` });
  const kurve = s.kurve || {};
  if (Array.isArray(kurve.t) && kurve.t.length > 1) {
    linienChart(leinwand, { t: kurve.t, log: true, reihen: [{ name: s.name, werte: kurve.strategie || [] }, { name: v.name || 'Vergleich', werte: kurve.vergleich || [] }] });
  }
  return h('article', { class: 'karte strategie mit-bild', style: bildStil({ bild: { 'trend-welt': 'welt', rotation: 'etf', 'trend-bitcoin': 'krypto', 'kern-satellit': 'welt' }[s.id] || 'regeln' }) },
    h('header', {}, h('h2', {}, s.name), s.aufwand ? h('span', { class: 'marke' }, 'Aufwand: ' + s.aufwand) : null),
    s.erkl ? h('p', {}, s.erkl) : null,
    h('div', { class: 'signal' + (faellig ? ' faellig' : '') },
      h('h3', {}, 'Aktuelles Signal'),
      h('p', { class: 'signal-text' }, sig.text || 'Kein Signal vorhanden.'),
      halten.length
        ? h('ul', { class: 'punkte' }, halten.map((x) => h('li', {},
          x.anteil != null ? pct(x.anteil, 0) + ' ' : '',
          x.pid ? h('a', { href: '#wert/' + x.pid }, x.name || x.sym) : (x.name || x.sym || ''),
          x.sym ? h('span', { class: 'sym' }, x.sym) : null)))
        : (s.signal ? h('p', {}, 'Nichts halten: Geld auf dem Konto lassen.') : null),
      h('p', { class: 'leise' },
        sig.seit ? `Signal seit ${datum(sig.seit)}. ` : '',
        sig.naechste_pruefung ? `Nächste Prüfung: ${datum(sig.naechste_pruefung)}.` : '',
        faellig ? ' ' : '', faellig ? plakette('Prüfung fällig', 'warn', 'dreieck') : null)),
    h('div', { class: 'tabellenrahmen' }, h('table', { class: 'tabelle vergleich' },
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, s.zeitraum ? 'Rückrechnung ' + s.zeitraum : 'Rückrechnung'),
        h('th', { scope: 'col', class: 'r' }, 'Strategie'), h('th', { scope: 'col', class: 'r' }, v.name || 'Vergleich'))),
      h('tbody', {},
        zeile('Rendite pro Jahr', rendite(k.rendite_pa), rendite(v.rendite_pa), 'nach Kosten, vor Steuer'),
        zeile('Rendite pro Jahr nach Steuer', rendite(k.rendite_pa_nach_steuer), rendite(v.rendite_pa_nach_steuer)),
        zeile('Größter Rückgang', rendite(k.rueckgang_max), rendite(v.rueckgang_max), 'vom Hoch bis zum Tief'),
        zeile('Schwankung pro Jahr', pct(k.schwankung, 0), pct(v.schwankung, 0)),
        zeile('Schlechtestes Jahr', rendite(k.schlechtestes_jahr), rendite(v.schlechtestes_jahr)),
        zeile('Wechsel pro Jahr', z(k.wechsel_pro_jahr), z(v.wechsel_pro_jahr))))),
    h('figure', { class: 'chartbox' }, leinwand,
      h('figcaption', { class: 'legende' },
        h('span', { class: 'leg leg-akzent' }, 'Strategie'), h('span', { class: 'leg leg-reihe2' }, v.name || 'Vergleich'),
        h('span', {}, 'Wert von 1 €, logarithmisch'))),
    Array.isArray(s.regeln) && s.regeln.length ? h('details', { class: 'klappe' }, h('summary', {}, 'Die Regeln'), h('ol', { class: 'punkte nummern' }, s.regeln.map((r) => h('li', {}, r)))) : null,
    Array.isArray(s.grenzen) && s.grenzen.length ? h('details', { class: 'klappe' }, h('summary', {}, 'Grenzen dieser Rechnung'), punkteListe(s.grenzen)) : null);
}

function protokoll(prot, typen) {
  const typName = (id) => { const t = typen.find((x) => x.id === id); return t ? t.name : id; };
  if (!prot) return abschnitt('Signal-Protokoll', hinweisKasten('Das Protokoll ist noch nicht angelegt.', 'neutral'));
  const st = (prot.statistik && prot.statistik.gesamt) || {};
  const jeTyp = (prot.statistik && prot.statistik.je_typ) || {};
  const eintraege = Array.isArray(prot.eintraege) ? [...prot.eintraege].sort((a, b) => String(b.datum).localeCompare(String(a.datum))) : [];
  const kachel = (name, wert, text) => h('div', { class: 'kachel' }, h('span', { class: 'kachel-name' }, name), h('span', { class: 'kachel-wert zahl' }, wert), text ? h('span', { class: 'kachel-text' }, text) : null);
  const r = (x) => (x == null ? '–' : zahl(x, 2) + ' R');
  const teile = [
    h('p', {}, `Die Messung beginnt am ${prot.start ? datum(prot.start) : '–'}. Jedes freigegebene Signal wird eingetragen und später nach Kosten ausgewertet. So zeigt sich, ob die Signale der App wirklich Geld verdienen.`),
    h('div', { class: 'kacheln' },
      kachel('Abgeschlossen', st.n != null ? String(st.n) : '0', `${st.offen != null ? st.offen : 0} offen`),
      kachel('Trefferquote', st.treffer != null ? pct(st.treffer, 0) : '–', 'Anteil der Gewinner'),
      kachel('Schnitt je Trade', r(st.erw_r), '1 R = das eingegangene Risiko'),
      kachel('Summe', r(st.summe_r), 'alle abgeschlossenen Trades')),
  ];
  if ((st.n || 0) < 30) teile.push(hinweisKasten(`Erst ${st.n || 0} abgeschlossene Trades. Unter 30 sagt die Statistik noch wenig, Zufall überwiegt.`, 'neutral'));
  const typZeilen = Object.entries(jeTyp).filter(([, x]) => x);
  if (typZeilen.length) {
    teile.push(h('div', { class: 'tabellenrahmen' }, h('table', { class: 'tabelle' },
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Setup-Typ'), h('th', { scope: 'col', class: 'r' }, 'Abgeschlossen'), h('th', { scope: 'col', class: 'r' }, 'Offen'),
        h('th', { scope: 'col', class: 'r' }, 'Trefferquote'), h('th', { scope: 'col', class: 'r' }, 'Schnitt'), h('th', { scope: 'col', class: 'r' }, 'Summe'))),
      h('tbody', {}, typZeilen.map(([id, x]) => h('tr', {}, h('th', { scope: 'row' }, typName(id)),
        h('td', { class: 'r zahl' }, String(x.n != null ? x.n : 0)), h('td', { class: 'r zahl' }, String(x.offen != null ? x.offen : 0)),
        h('td', { class: 'r zahl' }, x.treffer != null ? pct(x.treffer, 0) : '–'), h('td', { class: 'r zahl' }, r(x.erw_r)), h('td', { class: 'r zahl' }, r(x.summe_r))))))));
  }
  if (!eintraege.length) {
    teile.push(h('p', { class: 'leise' }, 'Noch keine Einträge. Der erste erscheint, sobald ein freigegebenes Setup ausgelöst wird.'));
  } else {
    teile.push(h('h3', {}, 'Einträge'), h('div', { class: 'tabellenrahmen' }, h('table', { class: 'tabelle' },
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Datum'), h('th', { scope: 'col' }, 'Wert'), h('th', { scope: 'col' }, 'Typ'),
        h('th', { scope: 'col', class: 'r' }, 'Einstieg'), h('th', { scope: 'col', class: 'r' }, 'Stop'), h('th', { scope: 'col', class: 'r' }, 'Ziel'),
        h('th', { scope: 'col' }, 'Zustand'), h('th', { scope: 'col', class: 'r' }, 'Ergebnis'))),
      h('tbody', {}, eintraege.map((e) => {
        const zs = ZUSTAND[e.zustand] || [e.zustand || '–', 'neutral', 'strich'];
        return h('tr', {},
          h('td', { class: 'zahl' }, datum(e.datum)),
          h('th', { scope: 'row' }, e.pid ? h('a', { href: '#wert/' + e.pid }, e.name || e.sym) : (e.name || e.sym || ''), h('small', {}, [e.sym, KLASSEN[e.klasse], e.richtung === 'short' ? 'Short' : 'Long'].filter(Boolean).join(' · '))),
          h('td', {}, typName(e.typ)),
          h('td', { class: 'r zahl' }, eur(e.einstieg)), h('td', { class: 'r zahl' }, eur(e.stop)), h('td', { class: 'r zahl' }, eur(e.ziel)),
          h('td', {}, plakette(zs[0], zs[1], zs[2]), e.ende_datum ? h('small', {}, datum(e.ende_datum)) : null),
          h('td', { class: 'r zahl ' + (e.ergebnis_r > 0 ? 'plus' : e.ergebnis_r < 0 ? 'minus' : '') },
            e.ergebnis_r != null ? r(e.ergebnis_r) : '–', e.ergebnis_pct != null ? h('small', {}, pct(e.ergebnis_pct, 1, true)) : null));
      })))));
  }
  return abschnitt('Signal-Protokoll', ...teile);
}
