// Detailseite eines Werts: Chart live, getrennte Noten, Gründe und Gegenargumente, alle Angaben mit Datenstand.

import { bildStil } from './einfach.js';
import { h, eur, pct, zahl, datum, gross } from './format.js';
import { lade, ladeWert, stamm } from './daten.js';
import { kerzen as holeKerzen } from './live.js';
import { beobachte } from './beobachtung.js';
import { sma, fuerKennzahlen, technik as rechneTechnik, technischesUrteil } from './kennzahlen.js';
import { kerzenChart } from './chart.js';
import { kosten, hinUndZurueck, kostenText } from './kosten.js';
import { setupKarte } from './setups.js';
import {
  abschnitt, notenBalken, notenLang, statusPlakette, urteilPlakette, plakette, preisEl, stern, punkteListe, raster, rendite, trendEl,
  segment, hinweisKasten, KLASSEN, GROESSE, HORIZONT, TRAGF,
} from './bausteine.js';

const PERIODEN = [
  { id: 'day', name: '1 Tag', art: 'tag' },
  { id: 'week', name: '1 Woche', art: 'woche' },
  { id: 'quartal', name: '3 Monate', art: 'woche' },
  { id: 'year', name: '1 Jahr', art: 'jahr' },
];

export async function zeige(root, pid) {
  const [detail, ueb, st, setupsD] = await Promise.all([ladeWert(pid), lade('uebersicht'), stamm(pid), lade('setups')]);
  const kurz = ueb && ueb.werte ? ueb.werte[pid] : null;
  const zurueck = h('p', { class: 'zurueck' }, h('a', { href: '#scanner', onclick: (ev) => { if (history.length > 1) { ev.preventDefault(); history.back(); } } }, '← Zurück'));
  root.append(zurueck);
  if (!detail && !st) {
    root.append(h('h1', {}, 'Wert nicht gefunden'),
      hinweisKasten('Zu dieser Kennung gibt es keinen Eintrag in der Liste der handelbaren Werte. Vielleicht wird der Wert bei Bitpanda nicht mehr angeboten.', 'warn'),
      h('p', {}, h('a', { href: '#scanner' }, 'Zum Scanner')));
    return;
  }
  const d = detail || {};
  const wert = {
    pid,
    sym: d.sym || (st && st.sym) || '',
    name: d.name || (st && st.name) || 'Wert',
    klasse: d.klasse || (st && st.klasse) || '',
    isin: d.isin || (st && st.isin) || '',
    kostenklasse: d.kostenklasse || (kurz && kurz.kk) || undefined,
  };
  const noten = d.noten || notenLang(kurz);
  const status = d.status || (kurz && kurz.status);
  const setups = (Array.isArray(d.setups) && d.setups.length ? d.setups : ((setupsD && setupsD.liste) || []).filter((s) => s.pid === pid));
  const typen = (setupsD && setupsD.typen) || [];
  const k = kosten(wert);

  // Kopf
  const analysePreis = kurz && kurz.preis != null ? kurz.preis : null;
  root.append(h('header', { class: 'wertkopf mit-bild', style: bildStil({ klasse: wert.klasse, sektor: d.sektor }) },
    h('div', { class: 'wertkopf-titel' },
      h('h1', {}, wert.name),
      h('p', { class: 'unterzeile' }, [wert.sym, KLASSEN[wert.klasse] || wert.klasse, wert.isin, d.region, d.sektor, d.branche].filter(Boolean).join(' · ')),
      h('p', { class: 'unterzeile' }, [
        d.groesse_text || GROESSE[d.groesse],
        d.liste && d.rang ? `Rang ${d.rang} der ${d.liste === 'wachstum' ? 'Wachstumschancen' : 'Qualitätsführer'}${d.score != null ? ', Note ' + Math.round(d.score) : ''}` : null,
        (d.horizont || []).map((x) => HORIZONT[x]).filter(Boolean).join(', ') || null,
      ].filter(Boolean).join(' · '))),
    h('div', { class: 'wertkopf-preis' }, preisEl(wert, analysePreis), stern(pid, wert.name)),
    h('div', { class: 'wertkopf-status' },
      statusPlakette(status),
      d.status_text ? h('p', {}, d.status_text) : null,
      h('p', { class: 'leise' }, `Kosten für Kauf und Verkauf: ${kostenText(k, hinUndZurueck(k))} (${k.name}).`))));
  beobachte([wert]);

  // Chart
  const chartBox = h('div', { class: 'chartbox' });
  const legende = h('p', { class: 'legende' });
  const quelle = h('p', { class: 'stand' });
  let periode = window.matchMedia('(max-width: 640px)').matches ? 'quartal' : 'year';
  const umschalter = h('div', {});
  const leinwand = h('canvas', { class: 'chart', role: 'img', 'aria-label': 'Kursverlauf von ' + wert.name });
  chartBox.append(umschalter, leinwand, legende, quelle);
  root.append(abschnitt('Kursverlauf', chartBox));
  const technikHier = h('div', {});

  let jahr = null; // Tageskerzen, auch für die Technik im Browser
  async function zeichneChart() {
    umschalter.replaceChildren(segment(PERIODEN, periode, (id) => { periode = id; zeichneChart(); }, 'Zeitraum'));
    const p = PERIODEN.find((x) => x.id === periode);
    const tage = periode === 'year' || periode === 'quartal';
    const e = await holeKerzen(wert, tage ? 'year' : periode, tage ? 600000 : 60000);
    let daten = e.daten;
    const opt = { art: p.art, linien: [], baender: [], marken: [] };
    const teile = [];
    if (tage) {
      daten = fuerKennzahlen(daten, wert.klasse);
      jahr = daten;
      const c = daten.map((x) => x.c);
      // „3 Monate" zeigt die letzten Handelstage als Kerzen, die Durchschnitte stammen aus dem ganzen Jahr.
      const ab = periode === 'quartal' ? Math.max(0, daten.length - (['aktie', 'etf', 'rohstoff'].includes(wert.klasse) ? 64 : 92)) : 0;
      if (c.length >= 50) {
        opt.linien.push({ werte: sma(c, 50).slice(ab), farbe: 'akzent' });
        teile.push(h('span', { class: 'leg leg-akzent' }, '50 Tage'));
      }
      if (c.length >= 200) {
        opt.linien.push({ werte: sma(c, 200).slice(ab), farbe: 'warn' });
        teile.push(h('span', { class: 'leg leg-warn' }, '200 Tage'));
      }
      daten = daten.slice(ab);
      if (d.kaufzone && d.kaufzone.von != null && d.kaufzone.bis != null) {
        opt.baender.push({ von: d.kaufzone.von, bis: d.kaufzone.bis, farbe: 'gut' });
        teile.push(h('span', { class: 'leg leg-band' }, 'Kaufzone'));
      }
    }
    const aktiv = setups.find((s) => s.zustand !== 'vorbereitung') || setups[0];
    if (aktiv) {
      if (aktiv.stop != null) opt.marken.push({ wert: aktiv.stop, farbe: 'schlecht', name: 'Stop' });
      (aktiv.ziele || []).forEach((z, i) => opt.marken.push({ wert: z, farbe: 'gut', name: 'Ziel ' + (i + 1) }));
      teile.push(h('span', { class: 'leg leg-strich' }, 'Stop und Ziele des Setups'));
    }
    kerzenChart(leinwand, daten, opt);
    legende.replaceChildren(...teile);
    quelle.textContent = daten.length
      ? `Kerzen live von ${e.quelle || 'Bitpanda'}${e.quelle === 'Binance' ? ' (Ersatzquelle, kann vom Bitpanda-Preis abweichen)' : ''}. ${periode === 'day' ? 'Jede Kerze 10 bis 15 Minuten.' : periode === 'week' ? 'Jede Kerze eine Stunde.' : (periode === 'year' ? 'Tageskurse, bei schmaler Ansicht als Linie der Schlusskurse' : 'Jede Kerze ein Tag') + (['aktie', 'etf', 'rohstoff'].includes(wert.klasse) ? ', ohne Wochenenden.' : '.')}`
      : 'Gerade sind keine Live-Kerzen abrufbar.';
    if (tage && !d.technik) zeichneTechnikAusKerzen();
  }

  // Nur Kursdaten vorhanden: klar sagen und Technik im Browser rechnen.
  function zeichneTechnikAusKerzen() {
    const t = rechneTechnik(jahr || [], wert.klasse);
    technikHier.replaceChildren();
    if (!t) {
      technikHier.append(hinweisKasten('Für eine technische Einschätzung reichen die Kursdaten nicht.', 'neutral'));
      return;
    }
    const u = technischesUrteil(t);
    technikHier.append(
      abschnitt('Technik', technikRaster(t), h('p', { class: 'stand' }, 'Im Browser aus den Bitpanda-Tageskerzen des letzten Jahres gerechnet.')),
      abschnitt('Wenn du den Wert schon hast', urteilBlock(u, true)));
  }

  if (!detail) {
    root.append(hinweisKasten('Für diesen Wert liegen nur Kursdaten vor. Noten, Status, Gründe und Fundamentaldaten gibt es nur für Werte, die die tägliche Analyse bewertet hat.', 'neutral'));
  }

  // Noten
  if (noten) {
    root.append(abschnitt('Die sechs Noten', notenBalken(noten),
      h('p', { class: 'leise' }, 'Jede Note steht für sich, von 0 bis 100. Bei Bewertung heißt hoch günstig, bei Risiko heißt hoch riskant.')));
  }

  // Gründe und Gegenargumente
  if ((d.gruende && d.gruende.length) || (d.gegen && d.gegen.length)) {
    root.append(abschnitt('Gründe und Gegenargumente', h('div', { class: 'zweispalter' },
      h('div', { class: 'spalte spalte-gut' }, h('h3', {}, 'Dafür spricht'), punkteListe(d.gruende) || h('p', { class: 'leise' }, 'Keine Punkte.')),
      h('div', { class: 'spalte spalte-schlecht' }, h('h3', {}, 'Dagegen spricht'), punkteListe(d.gegen) || h('p', { class: 'leise' }, 'Keine Punkte.')))));
  }
  if (d.luecken && d.luecken.length) root.append(abschnitt('Datenlücken', punkteListe(d.luecken, 'luecken')));

  // Halteurteil
  if (d.halteurteil) root.append(abschnitt('Wenn du den Wert schon hast', urteilBlock(d.halteurteil, false)));

  // Kaufzone und Bewertung
  if (d.kaufzone || d.bewertung) {
    const b = d.bewertung || {};
    root.append(abschnitt('Bewertung und Einstieg',
      d.kaufzone ? h('p', { class: 'kasten k-gut' }, h('strong', {}, `Mögliche Kaufzone: ${eur(d.kaufzone.von)} bis ${eur(d.kaufzone.bis)}. `), d.kaufzone.text || '') : null,
      b.text ? h('p', {}, b.text) : null,
      raster((b.kennzahlen || []).map((x) => ({ name: x.name, wert: x.wert, zusatz: x.vergleich })))));
  }

  // Dimensionen
  if (Array.isArray(d.dimensionen) && d.dimensionen.length) {
    root.append(abschnitt('So entstehen die Noten', d.dimensionen.map((dim) =>
      h('details', { class: 'dimension' },
        h('summary', {},
          h('span', { class: 'dim-name' }, dim.name),
          h('span', { class: 'dim-note zahl' }, dim.note != null ? String(Math.round(dim.note)) : '–'),
          h('span', { class: 'dim-zusatz' },
            dim.gewicht != null ? h('span', { class: 'dim-gewicht' }, 'Gewicht ' + pct(dim.gewicht, 0)) : null,
            dim.art === 'indiz' ? h('span', { class: 'marke marke-warn' }, 'Indiz aus Zahlen') : null)),
        dim.art === 'indiz' ? h('p', { class: 'leise' }, 'Diese Dimension ist aus Zahlen abgeleitet. Sie ersetzt keine Recherche zu Wettbewerb und Management.') : null,
        Array.isArray(dim.kennzahlen) && dim.kennzahlen.length
          ? h('div', { class: 'tabellenrahmen' }, h('table', { class: 'tabelle' },
            h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Kennzahl'), h('th', { scope: 'col', class: 'r' }, 'Wert'), h('th', { scope: 'col', class: 'r' }, 'besser als'))),
            h('tbody', {}, dim.kennzahlen.map((kz) => h('tr', {},
              h('th', { scope: 'row' }, kz.name, kz.erkl ? h('small', {}, kz.erkl) : null),
              h('td', { class: 'r zahl' }, kz.wert != null ? String(kz.wert) : '–'),
              h('td', { class: 'r zahl' }, kz.rang != null ? Math.round(kz.rang) + ' %' : '–'))))))
          : h('p', { class: 'leise' }, 'Keine Kennzahlen vorhanden.')))));
  }

  // Wachstum: Tragfähigkeit und Szenarien
  if (d.wachstum) {
    const w = d.wachstum;
    const teile = [];
    if (TRAGF[w.tragfaehigkeit]) teile.push(h('p', {}, plakette(TRAGF[w.tragfaehigkeit], w.tragfaehigkeit === 'belegt' ? 'gut' : w.tragfaehigkeit === 'plausibel' ? 'warn' : 'schlecht')));
    if (Array.isArray(w.pruefung) && w.pruefung.length) {
      teile.push(h('ul', { class: 'pruefung' }, w.pruefung.map((p) =>
        h('li', { class: p.ok ? 'ok' : 'nein' }, h('span', { class: 'pr-marke' }, p.ok ? 'erfüllt' : 'offen'), h('span', {}, h('strong', {}, p.feld + ': '), p.text || '')))));
    }
    teile.push(raster([
      { name: 'Finanzierung reicht', wert: w.reichweite_monate != null ? zahl(w.reichweite_monate, 0) + ' Monate' : null },
      { name: 'Wachstum plus Marge („Regel 40")', wert: w.regel40 != null ? zahl(w.regel40, 0) : null },
    ]));
    if (Array.isArray(w.szenarien) && w.szenarien.length) {
      teile.push(h('h3', {}, 'Drei Szenarien'), h('div', { class: 'tabellenrahmen' }, h('table', { class: 'tabelle' },
        h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Szenario'), h('th', { scope: 'col' }, 'Annahmen'), h('th', { scope: 'col', class: 'r' }, 'Rendite pro Jahr'))),
        h('tbody', {}, w.szenarien.map((s) => h('tr', {}, h('th', { scope: 'row' }, s.name), h('td', {}, s.annahmen || ''), h('td', { class: 'r' }, rendite(s.rendite_pa))))))),
        h('p', { class: 'leise' }, 'Rechenbeispiele mit offenen Annahmen, keine Prognose.'));
    }
    root.append(abschnitt('Tragfähigkeit des Wachstums', ...teile));
  }

  // Technik aus der Analyse
  if (d.technik) root.append(abschnitt('Technik', technikRaster(d.technik)));
  root.append(technikHier);

  // Fundamentaldaten
  if (d.fundamental && Array.isArray(d.fundamental.jahre) && d.fundamental.jahre.length) {
    const f = d.fundamental;
    const zeilen = [...f.jahre.map((j) => ({ ...j, kopf: j.jahr })), ...(f.ttm ? [{ ...f.ttm, kopf: 'letzte 12 Monate' }] : [])];
    const z = (v) => (v == null ? '–' : zahl(v, 0));
    root.append(abschnitt('Fundamentaldaten',
      h('div', { class: 'tabellenrahmen' }, h('table', { class: 'tabelle' },
        h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Zeitraum'), h('th', { scope: 'col', class: 'r' }, 'Umsatz'), h('th', { scope: 'col', class: 'r' }, 'Gewinn'),
          h('th', { scope: 'col', class: 'r' }, 'Freier Cashflow'), h('th', { scope: 'col', class: 'r' }, 'Operative Marge'))),
        h('tbody', {}, zeilen.map((j) => h('tr', {}, h('th', { scope: 'row' }, String(j.kopf)),
          h('td', { class: 'r zahl' }, z(j.umsatz)), h('td', { class: 'r zahl' }, z(j.gewinn)), h('td', { class: 'r zahl' }, z(j.fcf)), h('td', { class: 'r zahl' }, pct(j.marge_op, 1))))))),
      h('p', { class: 'stand' }, `Beträge in ${f.einheit || 'Mio.'} ${f.waehrung || ''}.`)));
  }
  if (d.schaetzung || d.termine) {
    const s = d.schaetzung || {};
    const r = raster([
      { name: 'Erwartetes Umsatzwachstum nächstes Jahr', wert: s.wachstum_umsatz_naechstes_jahr != null ? pct(s.wachstum_umsatz_naechstes_jahr, 1, true) : null },
      { name: 'Erwartetes Gewinnwachstum nächstes Jahr', wert: s.wachstum_gewinn_naechstes_jahr != null ? pct(s.wachstum_gewinn_naechstes_jahr, 1, true) : null },
      { name: 'Analysten', wert: s.analysten != null ? String(s.analysten) : null },
      { name: 'Nächste Quartalszahlen', wert: d.termine && d.termine.zahlen ? datum(d.termine.zahlen) : null },
    ]);
    if (r) root.append(abschnitt('Schätzungen und Termine', r, h('p', { class: 'leise' }, 'Schätzungen sind Erwartungen von Analysten und oft zu optimistisch.')));
  }

  // Krypto
  if (d.krypto) {
    const c = d.krypto;
    root.append(abschnitt('Krypto-Kennzahlen', raster([
      { name: 'Börsenwert', wert: c.mc_usd != null ? gross(c.mc_usd, '$') : null },
      { name: 'Wert bei voller Ausgabe (FDV)', wert: c.fdv_usd != null ? gross(c.fdv_usd, '$') : null, zusatz: c.fdv_mc != null ? `${zahl(c.fdv_mc, 2)} mal Börsenwert` : '' },
      { name: 'Handelsvolumen am Tag', wert: c.volumen_mc != null ? pct(c.volumen_mc, 1) + ' des Börsenwerts' : null },
      { name: 'Gebühreneinnahmen im Jahr', wert: c.gebuehren_jahr_usd != null ? gross(c.gebuehren_jahr_usd, '$') : null },
      { name: 'Kategorie', wert: c.kategorie || null },
      { name: 'Alter', wert: c.alter_jahre != null ? zahl(c.alter_jahre, 1) + ' Jahre' : null },
      { name: 'Abstand zum Allzeithoch', wert: c.vom_allzeithoch != null ? rendite(c.vom_allzeithoch) : null },
    ])));
  }

  // Setups
  if (setups.length) root.append(abschnitt('Trading-Setups für diesen Wert', h('ul', { class: 'kartenliste' }, setups.map((s) => h('li', {}, setupKarte({ ...wert, ...s }, typen))))));

  // Datenstände
  const sd = d.stand || {};
  root.append(abschnitt('Datenstand', raster([
    { name: 'Kurse der Analyse', wert: sd.kurs ? datum(sd.kurs) : null },
    { name: 'Fundamentaldaten bis', wert: sd.fundamental ? datum(sd.fundamental) : null },
    { name: 'Abgerufen am', wert: sd.abruf ? datum(sd.abruf) : null },
    { name: 'Preis und Chart', wert: 'live beim Öffnen' },
  ]), h('p', { class: 'leise' }, 'Keine Anlageberatung. Die App informiert, entscheiden und handeln musst du selbst.')));

  // Nicht abwarten: Die Seite soll sofort stehen, der Chart füllt sich, sobald die Kerzen da sind.
  zeichneChart().catch(() => { quelle.textContent = 'Gerade sind keine Live-Kerzen abrufbar.'; });
}

function technikRaster(t) {
  return raster([
    { name: 'Trend', wert: trendEl(t.trend) },
    { name: 'Abstand zur 200-Tage-Linie', wert: t.abst200 != null ? rendite(t.abst200) : null },
    { name: '50-Tage-Linie', wert: t.sma50 != null ? eur(t.sma50) : null },
    { name: '200-Tage-Linie', wert: t.sma200 != null ? eur(t.sma200) : null },
    { name: 'RSI (14 Tage)', wert: t.rsi14 != null ? String(Math.round(t.rsi14)) : null, zusatz: t.rsi14 != null ? (t.rsi14 >= 70 ? 'stark gelaufen' : t.rsi14 <= 30 ? 'stark gefallen' : 'neutral') : '' },
    { name: 'Übliche Tagesschwankung', wert: t.atr_pct != null ? pct(t.atr_pct, 1) : null },
    { name: 'Hoch und Tief (12 Monate)', wert: t.hoch52 != null ? `${eur(t.hoch52)} / ${eur(t.tief52)}` : null },
    { name: 'Abstand zum Hoch', wert: t.vom_hoch != null ? rendite(t.vom_hoch) : null },
    { name: '1 Woche', wert: t.r1w != null ? rendite(t.r1w) : null },
    { name: '1 Monat', wert: t.r1m != null ? rendite(t.r1m) : null },
    { name: '3 Monate', wert: t.r3m != null ? rendite(t.r3m) : null },
    { name: '6 Monate', wert: t.r6m != null ? rendite(t.r6m) : null },
    { name: '12 Monate', wert: t.r12m != null ? rendite(t.r12m) : null },
    { name: 'Schwankung pro Jahr', wert: t.schwankung != null ? pct(t.schwankung, 0) : null },
    { name: 'Größter Rückgang (12 Monate)', wert: t.rueckgang_max != null ? rendite(t.rueckgang_max) : null },
    { name: 'Unterstützungen', wert: Array.isArray(t.unterstuetzung) && t.unterstuetzung.length ? t.unterstuetzung.map((x) => eur(x)).join(' · ') : null },
    { name: 'Widerstände', wert: Array.isArray(t.widerstand) && t.widerstand.length ? t.widerstand.map((x) => eur(x)).join(' · ') : null },
  ]);
}

export function urteilBlock(u, nurKurs) {
  return h('div', { class: 'urteil' },
    h('p', {}, urteilPlakette(u.urteil), nurKurs ? h('span', { class: 'marke marke-warn' }, 'nur aus Kursdaten') : null),
    u.text ? h('p', {}, u.text) : null,
    (u.gruende && u.gruende.length) || (u.gegen && u.gegen.length)
      ? h('div', { class: 'zweispalter' },
        h('div', { class: 'spalte spalte-gut' }, h('h3', {}, 'Fürs Halten'), punkteListe(u.gruende) || h('p', { class: 'leise' }, 'Keine Punkte.')),
        h('div', { class: 'spalte spalte-schlecht' }, h('h3', {}, 'Dagegen'), punkteListe(u.gegen) || h('p', { class: 'leise' }, 'Keine Punkte.')))
      : null,
    h('p', { class: 'leise' }, 'Dein Kaufpreis spielt für das Urteil keine Rolle. Es zählt, ob die Gründe für den Wert heute noch gelten.'));
}
