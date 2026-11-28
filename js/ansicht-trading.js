// Bereich „Trading": Swing-Setups aus der Analyse, Intraday und Scalping live gegen die Kosten gerechnet, Positionsgrößen-Rechner.

import { h, eur, pct, zahl, betrag, leseZahl, eingabeZahl, zeit } from './format.js';
import { seitenkopf } from './einfach.js';
import { lade, universum } from './daten.js';
import { ansicht, setzeAnsicht, depot, merkliste, einstellungen } from './speicher.js';
import { kerzenViele } from './live.js';
import { beobachte } from './beobachtung.js';
import { sma, rsi, atr } from './kennzahlen.js';
import { kosten, kostenDaten, hinUndZurueck, crvNetto, crvMin, kryptoWeg, kostenText, risikoJeTrade, ordergroesse, kostenId } from './kosten.js';
import { sortiereSetups, setupKarte, rueckText } from './setups.js';
import { abschnitt, segment, hinweisKasten, raster, plakette, wertLink, KLASSEN } from './bausteine.js';

const MODI = [
  { id: 'swing', name: 'Swing' },
  { id: 'intraday', name: 'Intraday' },
  { id: 'scalping', name: 'Scalping' },
];
const MODUS_TEXT = {
  swing: 'Tage bis Wochen. Setups kommen aus der täglichen Analyse und sind nach Kosten rückgerechnet.',
  intraday: 'Innerhalb eines Tages. Live aus den Stundenkerzen der letzten Woche gerechnet, nicht rückgerechnet.',
  scalping: 'Minuten. Live aus den 10-Minuten-Kerzen des letzten Tages gerechnet, nicht rückgerechnet.',
};
// Kennungen für den Fall, dass die Liste der handelbaren Werte fehlt (dann antwortet nur die Ersatzquelle).
const STANDARD = ['BTC', 'ETH', 'SOL', 'XRP'];
const MAX_LIVE = 12;

export async function zeige(root) {
  const [setupsD, meta, ueb] = await Promise.all([lade('setups'), lade('meta'), lade('uebersicht')]);
  const werteUeb = (ueb && ueb.werte) || {};
  let modus = ansicht('trading', { modus: 'swing' }).modus;
  if (!MODI.some((m) => m.id === modus)) modus = 'swing';
  let laufNr = 0;

  const kopf = h('div', {});
  const inhalt = h('div', {});
  const rechnerEl = h('div', {});
  root.append(h('h1', {}, 'Trading'), seitenkopf('trading'), kopf, inhalt, rechnerEl);
  const rechner = baueRechner();
  rechnerEl.append(rechner.el);

  function zeichne() {
    laufNr += 1;
    kopf.replaceChildren(
      segment(MODI, modus, (id) => { modus = id; setzeAnsicht('trading', { modus }); zeichne(); }, 'Modus wählen'),
      h('p', { class: 'leise' }, MODUS_TEXT[modus]),
      h('p', { class: 'leise' }, `Krypto-Kosten gerechnet für: ${kryptoWeg() === 'fusion' ? 'Bitpanda Fusion' : 'Broker'}. `, h('a', { href: '#einstellungen' }, 'Ändern')));
    inhalt.replaceChildren();
    if (modus === 'swing') zeichneSwing();
    else zeichneLive(modus, laufNr);
  }

  function zeichneSwing() {
    if (!setupsD) {
      inhalt.append(hinweisKasten('Es liegt noch keine Analyse mit Setups vor. Der Rechner unten funktioniert trotzdem.', 'warn'));
      return;
    }
    const typen = setupsD.typen || [];
    const alle = sortiereSetups(setupsD.liste || []);
    const frei = alle.filter((x) => x.bew.freigabe);
    const gesperrt = alle.filter((x) => !x.bew.freigabe);
    if (!frei.length) {
      inhalt.append(h('div', { class: 'kein-trade' },
        h('strong', {}, 'Aktuell kein guter Trade'),
        h('p', {}, (setupsD.kein_trade || 'Kein freigegebenes Setup erfüllt die Bedingungen.').replace(/^Aktuell kein guter Trade:\s*/, '')),
        h('p', {}, 'Nichts zu tun ist eine gültige Entscheidung: Jeder Trade ohne Vorteil kostet nur Gebühren.')));
    } else {
      inhalt.append(h('h2', {}, `Freigegebene Setups (${frei.length})`),
        h('ul', { class: 'kartenliste' }, frei.map(({ s, bew }) => h('li', {}, setupKarte(s, typen, { bew, onRechner: rechner.uebernimm })))));
    }
    if (gesperrt.length) {
      inhalt.append(h('h2', {}, `Nicht freigegeben (${gesperrt.length})`),
        h('p', { class: 'leise' }, 'Die Bedingungen sind erfüllt, aber der Setup-Typ hat nach Kosten nichts verdient oder das Chance-Risiko-Verhältnis ist zu klein. Nur zur Information.'),
        h('ul', { class: 'kartenliste' }, gesperrt.map(({ s, bew }) => h('li', {}, setupKarte(s, typen, { bew, onRechner: rechner.uebernimm })))));
    }
    if (typen.length) inhalt.append(rueckTabelle(typen));
    beobachte(alle.map((x) => x.s));
  }

  async function zeichneLive(art, nr) {
    const periode = art === 'intraday' ? 'week' : 'day';
    const einheit = art === 'intraday' ? 'Stunde' : '10 Minuten';
    const status = h('p', { class: 'laden' }, 'Rechne live aus den Bitpanda-Kursen …');
    inhalt.append(status);
    const werte = await liveWerte();
    const m = await kerzenViele(werte, periode, 120000);
    if (nr !== laufNr) return;
    const zeilen = werte.map((w) => rechneLive(w, m.get(w.pid), art)).filter(Boolean);
    inhalt.replaceChildren();
    if (!zeilen.length) {
      inhalt.append(hinweisKasten('Gerade sind keine Live-Kurse abrufbar. Ohne aktuelle Kurse gibt es keine Einschätzung.', 'warn'));
      return;
    }
    const szenarien = zeilen.filter((z) => z.szenario);
    if (!szenarien.length) {
      const b = zeilen[0];
      inhalt.append(h('div', { class: 'kein-trade' },
        h('strong', {}, 'Aktuell kein guter Trade'),
        h('p', {}, art === 'scalping'
          ? `In 10 Minuten bewegt sich zum Beispiel ${b.wert.name} üblicherweise um ${pct(b.atrPct, 2)}. Kauf und Verkauf kosten ${pct(b.kostenBroker, 1)} im Broker und etwa ${pct(b.kostenFusion, 1)} über Fusion. Mit so kleinen Bewegungen sind diese Kosten nicht zu verdienen.`
          : 'Kein Wert erfüllt gerade Trend, Rücksetzer und ein ausreichendes Chance-Risiko-Verhältnis nach Kosten. Die Zahlen je Wert stehen unten.')));
    } else {
      inhalt.append(h('h2', {}, `Mögliche Szenarien (${szenarien.length})`),
        hinweisKasten('Live gerechnet, nicht rückgerechnet. Diese Szenarien sind keine geprüften Setups. Kleine Beträge, fester Stop.', 'warn'),
        h('ul', { class: 'kartenliste' }, szenarien.map((z) => h('li', {}, szenarioKarte(z, einheit)))));
    }
    inhalt.append(h('h2', {}, 'Bewegung gegen Kosten'),
      h('ul', { class: 'kartenliste' }, zeilen.map((z) => h('li', {}, h('article', { class: 'karte livezeile' },
        h('header', { class: 'setup-kopf' },
          h('h3', {}, wertLink(z.wert, z.wert.name), ' ', h('span', { class: 'sym' }, z.wert.sym)),
          z.szenario ? plakette('Szenario möglich', 'akzent', 'raute') : plakette('Kein Trade', 'neutral', 'strich')),
        raster([
          { name: `Bewegung je ${einheit}`, wert: pct(z.atrPct, 2) },
          { name: 'Kosten Broker', wert: pct(z.kostenBroker, 1), zusatz: 'Kauf und Verkauf' },
          { name: 'Kosten Fusion', wert: pct(z.kostenFusion, 1) + (z.fusionBelegt ? '' : ' *'), zusatz: 'Kauf und Verkauf' },
        ], 'raster-drei'),
        h('p', { class: 'leise' }, z.grund))))),
      h('p', { class: 'stand' }, `Live gerechnet um ${zeit(Date.now())} aus den Kursen von ${zeilen[0].quelle || 'Bitpanda'}. „Bewegung" ist die durchschnittliche Spanne einer Kerze (ATR, 14 Kerzen). * Schätzung: Die Spanne im Orderbuch von Fusion veröffentlicht Bitpanda nicht.`));
  }

  // BTC, ETH, SOL, XRP plus Krypto aus Depot und Merkliste
  async function liveWerte() {
    const u = await universum();
    const aus = [];
    const gesehen = new Set();
    const nimm = (w) => {
      if (w && w.pid && !gesehen.has(w.pid) && aus.length < MAX_LIVE) {
        gesehen.add(w.pid);
        // Kostenklasse aus der Analyse. Ohne Analyse gilt für Bitcoin der eigene, günstigere Satz.
        const kk = werteUeb[w.pid] && werteUeb[w.pid].kk ? werteUeb[w.pid].kk : w.sym === 'BTC' ? 'krypto_btc' : undefined;
        aus.push({ pid: w.pid, sym: w.sym, name: w.name || w.sym, klasse: 'krypto', kostenklasse: kk });
      }
    };
    for (const sym of STANDARD) {
      nimm(u.liste.find((w) => w.klasse === 'krypto' && w.sym === sym) || { pid: 'sym:' + sym, sym, name: sym });
    }
    for (const p of depot()) if (p.klasse === 'krypto') nimm(p);
    for (const pid of merkliste()) {
      const w = u.nachPid.get(pid);
      if (w && w.klasse === 'krypto') nimm(w);
    }
    return aus;
  }

  zeichne();
  const beiZustand = () => { rechner.rechne(); };
  window.addEventListener('ia-zustand', beiZustand);
  return () => window.removeEventListener('ia-zustand', beiZustand);

  // ---------- Positionsgrößen-Rechner ----------
  function baueRechner() {
    const klassen = (meta && meta.kosten && meta.kosten.klassen) || kostenDaten().klassen || {};
    const ids = Object.keys(klassen);
    const start = ids.includes(kostenId({ klasse: 'krypto' })) ? kostenId({ klasse: 'krypto' }) : ids[0] || '';
    const ergebnis = h('div', { class: 'rechner-ergebnis', role: 'status' });
    const eingabe = (id, name, wert, zusatz) => h('div', { class: 'feld' },
      h('label', { for: id }, name),
      h('input', { id, type: 'text', inputmode: 'decimal', autocomplete: 'off', value: wert, oninput: () => rechne() }),
      zusatz ? h('small', {}, zusatz) : null);
    const auswahl = h('select', { id: 'r-klasse', onchange: () => rechne() },
      ids.length ? ids.map((id) => h('option', { value: id, selected: id === start }, klassen[id].name || id)) : h('option', { value: '' }, 'ohne Kosten'));
    const form = h('form', { class: 'karte formular', novalidate: true, onsubmit: (ev) => ev.preventDefault() },
      h('div', { class: 'felder' },
        eingabe('r-kapital', 'Kapital in €', eingabeZahl(einstellungen().kapital, 2)),
        eingabe('r-risiko', 'Risiko je Trade in %', eingabeZahl(risikoJeTrade() * 100, 2), 'so viel vom Kapital darf ein Fehltrade kosten'),
        h('div', { class: 'feld' }, h('label', { for: 'r-klasse' }, 'Kosten nach'), auswahl),
        eingabe('r-einstieg', 'Einstieg in €', ''),
        eingabe('r-stop', 'Stop in €', ''),
        eingabe('r-ziel1', 'Ziel 1 in €', '', 'freiwillig'),
        eingabe('r-ziel2', 'Ziel 2 in €', '', 'freiwillig')),
      ergebnis);
    const el = abschnitt('Positionsgrößen-Rechner',
      h('p', { class: 'leise' }, 'Wie viel darfst du kaufen, damit ein Fehltrade höchstens den gewählten Anteil deines Kapitals kostet? Kosten für Kauf und Verkauf sind eingerechnet.'),
      form);
    el.id = 'rechner';
    const lese = (id) => leseZahl(form.querySelector('#' + id).value);

    function rechne() {
      const kapital = lese('r-kapital');
      const risiko = lese('r-risiko');
      const e = lese('r-einstieg');
      const s = lese('r-stop');
      const ziele = [lese('r-ziel1'), lese('r-ziel2')].filter((z) => z != null && z > 0);
      ergebnis.replaceChildren();
      if (!(kapital > 0) || !(risiko > 0) || !(e > 0) || !(s > 0)) {
        ergebnis.append(h('p', { class: 'leise' }, 'Kapital, Risiko, Einstieg und Stop eintragen, dann steht hier die Stückzahl.'));
        return;
      }
      if (e === s) {
        ergebnis.append(h('p', { class: 'meldung schlecht' }, 'Einstieg und Stop dürfen nicht gleich sein.'));
        return;
      }
      const id = auswahl.value;
      const k = kosten({ klasse: id, kostenklasse: id }, 'broker'); // genau die gewählte Kostenklasse, ohne Umleitung
      const lang = s < e;
      const budget = kapital * (risiko / 100);
      const jeStueck = Math.abs(e - s) + e * k.kauf + s * k.verkauf;
      let stueck = Math.max(0, (budget - 2 * k.fix) / jeStueck);
      let begrenzt = false;
      if (stueck * e > kapital) {
        stueck = kapital / e;
        begrenzt = true;
      }
      const einsatz = stueck * e;
      const verlust = stueck * jeStueck + 2 * k.fix;
      const eintraege = [
        { name: 'Stückzahl', wert: zahl(stueck, stueck >= 100 ? 0 : stueck >= 1 ? 2 : 6) },
        { name: 'Einsatz', wert: betrag(einsatz), zusatz: pct(einsatz / kapital, 0) + ' des Kapitals' },
        { name: 'Verlust am Stop mit Kosten', wert: betrag(-verlust), zusatz: pct(verlust / kapital, 2) + ' des Kapitals' },
        { name: 'Kosten für Kauf und Verkauf', wert: kostenText(k, einsatz > 0 ? hinUndZurueck(k, einsatz) : k.kauf + k.verkauf), zusatz: k.name },
      ];
      ziele.forEach((z, i) => {
        const richtig = lang ? z > e : z < e;
        const gewinn = stueck * (Math.abs(z - e) - e * k.kauf - z * k.verkauf) - 2 * k.fix;
        eintraege.push({
          name: `Gewinn am Ziel ${i + 1} nach Kosten`,
          wert: richtig ? betrag(gewinn, true) : 'Ziel liegt auf der falschen Seite',
          zusatz: richtig && verlust > 0 ? `Chance-Risiko ${zahl(gewinn / verlust, 1)}` : '',
        });
      });
      ergebnis.append(raster(eintraege, 'raster-rechner'));
      if (stueck <= 0) ergebnis.append(hinweisKasten('Die festen Gebühren sind höher als dein Risikobetrag. Dieser Trade ist zu klein.', 'warn'));
      if (begrenzt) ergebnis.append(hinweisKasten('Der Stop liegt so nah, dass die Rechnung mehr als dein Kapital ergäbe. Die Stückzahl ist auf dein Kapital begrenzt.', 'neutral'));
      if (!lang) ergebnis.append(hinweisKasten('Stop über dem Einstieg bedeutet Short. Short geht bei Bitpanda nur über Hebel-Token mit laufenden Kosten.', 'warn'));
      if (k.pro_tag) ergebnis.append(hinweisKasten(`Dazu kommen ${pct(k.pro_tag, 2)} pro Tag über Nacht.`, 'neutral'));
      if (ziele.length && crvNetto(e, s, ziele[0], hinUndZurueck(k, einsatz || ordergroesse())) < crvMin()) {
        ergebnis.append(hinweisKasten(`Das Chance-Risiko-Verhältnis nach Kosten liegt unter ${zahl(crvMin(), 1)}. Solche Trades lohnen sich auf Dauer selten.`, 'warn'));
      }
    }

    function uebernimm(s, bew) {
      const setze = (id, v) => { form.querySelector('#' + id).value = eingabeZahl(v); };
      setze('r-einstieg', bew.einstieg);
      setze('r-stop', s.stop);
      setze('r-ziel1', (s.ziele || [])[0]);
      setze('r-ziel2', (s.ziele || [])[1]);
      if (ids.includes(bew.kosten.id)) auswahl.value = bew.kosten.id;
      rechne();
      el.scrollIntoView({ block: 'start' });
      form.querySelector('#r-kapital').focus({ preventScroll: true });
    }

    rechne();
    return { el, rechne, uebernimm };
  }
}

// Live-Einschätzung eines Werts aus Stunden- oder 10-Minuten-Kerzen.
function rechneLive(wert, eintrag, art) {
  const k = eintrag && eintrag.daten;
  if (!k || k.length < 60) return null;
  const c = k.map((x) => x.c);
  const n = c.length;
  const preis = c[n - 1];
  const a = atr(k, 14)[n - 1];
  const s20 = sma(c, 20)[n - 1];
  const s50 = sma(c, 50)[n - 1];
  const r = rsi(c, 14)[n - 1];
  if (!(a > 0) || !s50) return null;
  const kb = kosten(wert, 'broker');
  const kf = kosten(wert, 'fusion');
  const kostenBroker = hinUndZurueck(kb);
  const kostenFusion = hinUndZurueck(kf);
  const gewaehlt = kryptoWeg() === 'fusion' ? kostenFusion : kostenBroker;
  const atrPct = a / preis;
  const stop = preis - 1.5 * a;
  const ziel = preis + 3 * a;
  const netto = crvNetto(preis, stop, ziel, gewaehlt);
  const nettoBroker = crvNetto(preis, stop, ziel, kostenBroker);
  const nettoFusion = crvNetto(preis, stop, ziel, kostenFusion);
  const trend = preis > s50 && s20 > s50;
  const ruecksetzer = preis <= s20 * 1.004 || (r != null && r < 50);
  const einheit = art === 'intraday' ? 'Stundenbewegungen' : '10-Minuten-Bewegungen';
  let grund;
  let szenario = null;
  const kostenSatz = `Ein Ziel von drei üblichen ${einheit} bringt ${pct((3 * a) / preis, 1)}. Kosten: Broker ${pct(kostenBroker, 1)}, Fusion ${pct(kostenFusion, 1)}.`;
  if (netto == null || netto < crvMin()) {
    grund = `${kostenSatz} Chance-Risiko nach Kosten: Broker ${zahl(nettoBroker, 1)}, Fusion ${zahl(nettoFusion, 1)}. Verlangt sind ${zahl(crvMin(), 1)}.`;
  } else if (!trend) {
    grund = 'Die Kosten wären verdienbar, aber es gibt keinen Aufwärtstrend in diesem Zeitfenster.';
  } else if (!ruecksetzer) {
    grund = 'Aufwärtstrend, aber kein Rücksetzer: Der Kurs ist schon gelaufen.';
  } else {
    grund = `Aufwärtstrend mit Rücksetzer. Chance-Risiko nach Kosten ${zahl(netto, 1)}.`;
    szenario = { einstieg: preis, stop, ziel, netto, nettoBroker, nettoFusion };
  }
  return { wert, atrPct, kostenBroker, kostenFusion, fusionBelegt: kf.belegt, grund, szenario, quelle: eintrag.quelle, rsi: r };
}

function szenarioKarte(z, einheit) {
  const s = z.szenario;
  return h('article', { class: 'karte setup' },
    h('header', { class: 'setup-kopf' },
      h('div', {}, h('h3', {}, wertLink(z.wert, z.wert.name), ' ', h('span', { class: 'sym' }, z.wert.sym)),
        h('p', { class: 'unterzeile' }, `Rücksetzer im Aufwärtstrend, Kerzen je ${einheit} · ${KLASSEN[z.wert.klasse] || ''}`)),
      h('div', { class: 'plaketten' }, plakette('Long', 'gut', 'auf'), plakette('Live gerechnet, nicht rückgerechnet', 'warn', 'dreieck'))),
    raster([
      { name: 'Einstieg', wert: 'um ' + eur(s.einstieg) },
      { name: 'Stop', wert: eur(s.stop), zusatz: pct((s.einstieg - s.stop) / s.einstieg, 1) + ' Risiko' },
      { name: 'Ziel', wert: eur(s.ziel) },
      { name: 'Chance-Risiko nach Kosten', wert: zahl(s.netto, 1), zusatz: `Broker ${zahl(s.nettoBroker, 1)}, Fusion ${zahl(s.nettoFusion, 1)}` },
      { name: 'Kosten hin und zurück', wert: `Broker ${pct(z.kostenBroker, 1)}`, zusatz: `Fusion ${pct(z.kostenFusion, 1)}${z.fusionBelegt ? '' : ' (Schätzung)'}` },
      { name: 'Gültig', wert: 'nur jetzt', zusatz: 'verfällt, wenn der Kurs den Stop berührt' },
    ], 'raster-setup'));
}

function rueckTabelle(typen) {
  const namen = { aktie: 'Aktien', etf: 'ETFs', krypto: 'Krypto (Broker)', krypto_fusion: 'Krypto (Fusion)', metall: 'Metalle', rohstoff: 'Rohstoffe', krypto_short: 'Krypto Short', index: 'Krypto-Indizes' };
  const zeilen = [];
  for (const t of typen) {
    for (const [klasse, r] of Object.entries(t.rueck || {})) {
      if (!r) continue;
      zeilen.push(h('tr', {},
        h('th', { scope: 'row' }, t.name, h('small', {}, namen[klasse] || klasse)),
        h('td', { class: 'r zahl' }, r.n != null ? zahl(r.n, 0) : '–'),
        h('td', { class: 'r zahl' }, pct(r.treffer, 0)),
        h('td', { class: 'r zahl ' + (r.erw_pct > 0 ? 'plus' : r.erw_pct < 0 ? 'minus' : '') }, pct(r.erw_pct, 1, true)),
        h('td', { class: 'r zahl' }, r.pf != null ? zahl(r.pf, 1) : '–'),
        h('td', {}, r.freigabe ? plakette('freigegeben', 'gut', 'kreis') : plakette('gesperrt', 'neutral', 'strich')),
        h('td', {}, r.zeitraum || '')));
    }
  }
  if (!zeilen.length) return null;
  return h('details', { class: 'klappe' },
    h('summary', {}, 'Rückrechnung aller Setup-Typen'),
    h('p', { class: 'leise' }, 'Jeder Typ wird je Anlageklasse über die Vergangenheit nachgerechnet, mit den Kosten von Bitpanda. Nur was dabei nach Kosten verdient hat, wird freigegeben. Grenzen: Die Rechnung kennt nur Werte, die es heute noch gibt, und vergangene Ergebnisse sichern nichts zu.'),
    typen.filter((t) => t.erkl).map((t) => h('p', {}, h('strong', {}, t.name + ': '), t.erkl, t.haltedauer ? ` Haltedauer ${t.haltedauer}.` : '')),
    h('div', { class: 'tabellenrahmen' }, h('table', { class: 'tabelle' },
      h('thead', {}, h('tr', {},
        h('th', { scope: 'col' }, 'Typ und Klasse'), h('th', { scope: 'col', class: 'r' }, 'Trades'), h('th', { scope: 'col', class: 'r' }, 'Trefferquote'),
        h('th', { scope: 'col', class: 'r' }, 'Schnitt je Trade'), h('th', { scope: 'col', class: 'r' }, 'Gewinnfaktor'), h('th', { scope: 'col' }, 'Freigabe'), h('th', { scope: 'col' }, 'Zeitraum'))),
      h('tbody', {}, zeilen))));
}
