// Bereich „Heute": Marktlage, was zu tun ist, Kennzahlen, Änderungen der Ranglisten.

import { h, eur, zahl, datum, heute, betrag } from './format.js';
import { lade } from './daten.js';
import { depot } from './speicher.js';
import { livePreis } from './live.js';
import { beobachte } from './beobachtung.js';
import { abschnitt, keineDaten, plakette, raster, URTEIL } from './bausteine.js';
import { sortiereSetups } from './setups.js';
import { einfachBlock } from './einfach.js';

export async function zeige(root) {
  const [meta, markt, rang, setupsD, strat, ueb, nachk] = await Promise.all(['meta', 'markt', 'ranglisten', 'setups', 'strategien', 'uebersicht', 'nachkauf'].map(lade));
  root.append(h('h1', {}, 'Heute'));
  const ohneAnalyse = !meta && !markt && !rang && !setupsD && !strat;
  if (ohneAnalyse) root.append(keineDaten());

  // Marktlage
  const ampeln = (markt && markt.ampeln) || [];
  if (ampeln.length) {
    // Ein Satz vorweg, damit man die Lage ohne Lesen der Karten erfasst.
    const zeichen = { gruen: '🟢', gelb: '🟡', rot: '🔴' };
    const kurz = ampeln.filter((a) => a.id !== 'stimmung').map((a) => h('span', { class: 'kurzzeile' }, `${zeichen[a.zustand] || ''} ${a.name}: ${a.titel}`));
    const rat = ampeln.some((a) => a.zustand === 'rot') && ampeln.some((a) => a.zustand === 'gruen')
      ? 'Gemischte Lage: Bei Grün sind Käufe im Trend, bei Rot nur gestaffelt nachkaufen.'
      : ampeln.every((a) => a.zustand !== 'rot') ? 'Der Markt gibt Rückenwind.' : 'Vorsicht: Kurse fallen, Einsätze klein halten.';
    root.append(einfachBlock({ markt, rang, nachk, ueb }));
    root.append(h('h2', { class: 'trenner' }, 'Mehr Einzelheiten'));
    root.append(abschnitt('Marktlage', h('div', { class: 'ampeln' }, ampeln.map(ampelKarte))));
  }

  // Was heute zu tun ist
  const aufgabenEl = h('div', { class: 'aufgaben' });
  const depotZeile = h('p', { class: 'depotzeile' });
  root.append(abschnitt('Was heute zu tun ist', aufgabenEl, depotZeile));
  const werteUeb = (ueb && ueb.werte) || {};
  const setups = sortiereSetups((setupsD && setupsD.liste) || []).filter((x) => x.bew.freigabe && x.s.zustand !== 'vorbereitung').slice(0, 3);
  const typen = (setupsD && setupsD.typen) || [];

  const zeichneAufgaben = () => {
    const liste = [];
    for (const p of depot()) {
      const u = werteUeb[p.pid];
      const kurs = livePreis(p.pid, u ? u.preis : null);
      if (p.stop != null && kurs != null && kurs <= p.stop) {
        liste.push({ art: 'schlecht', marke: 'Stop erreicht', titel: p.name, text: `Kurs ${eur(kurs)}, dein Stop liegt bei ${eur(p.stop)}.`, link: '#wert/' + p.pid });
      }
      if (u && (u.urteil === 'verkauf' || u.urteil === 'teilverkauf')) {
        liste.push({ art: u.urteil, marke: URTEIL[u.urteil], titel: p.name, text: 'Die Analyse sieht Gründe für einen Verkauf. Gründe und Gegenargumente stehen im Depot.', link: '#depot' });
      }
    }
    for (const s of (strat && strat.liste) || []) {
      const sig = s.signal || {};
      if (sig.naechste_pruefung && sig.naechste_pruefung <= heute()) {
        liste.push({ art: 'gelb', marke: 'Prüfung fällig', titel: s.name, text: sig.text || 'Signal der Strategie prüfen.', link: '#strategien' });
      }
    }
    for (const { s, bew } of setups) {
      const typ = typen.find((t) => t.id === s.typ);
      const e = s.einstieg || {};
      const zone = e.von != null && e.bis != null ? `${eur(e.von)} bis ${eur(e.bis)}` : eur(bew.einstieg);
      liste.push({
        art: 'akzent', marke: 'Setup', titel: `${s.name || s.sym}: ${typ ? typ.name : s.typ}`,
        text: `Einstieg ${zone}, Stop ${eur(s.stop)}, Chance-Risiko nach Kosten ${bew.netto != null ? zahl(bew.netto, 1) : '–'}.`, link: '#trading',
      });
    }
    aufgabenEl.replaceChildren();
    if (!liste.length) {
      aufgabenEl.append(h('p', { class: 'kasten k-gut ruhe' },
        h('strong', {}, 'Heute ist nichts zu tun.'), ' ',
        ohneAnalyse ? 'Ohne Analyse gibt es keine Signale.' : 'Kein Verkaufssignal im Depot, keine fällige Prüfung, kein freigegebenes Setup.'));
    } else {
      aufgabenEl.append(h('ul', { class: 'aufgabenliste' }, liste.map((a) =>
        h('li', {}, h('a', { href: a.link },
          plakette(a.marke, a.art),
          h('span', { class: 'aufgabe-text' }, h('strong', {}, a.titel), h('span', {}, a.text)))))));
    }
    // Depot in einer Zeile
    const pos = depot();
    if (pos.length) {
      let summe = 0;
      let offen = 0;
      for (const p of pos) {
        const kurs = livePreis(p.pid, werteUeb[p.pid] ? werteUeb[p.pid].preis : null);
        if (kurs == null) offen += 1;
        else summe += kurs * p.stueck;
      }
      depotZeile.replaceChildren(
        h('a', { href: '#depot' }, 'Depot'), `: ${betrag(summe)} in ${pos.length} ${pos.length === 1 ? 'Position' : 'Positionen'}`,
        offen ? ` (${offen} ohne Preis)` : '', '.');
    } else {
      depotZeile.replaceChildren('Noch kein Depot angelegt. ', h('a', { href: '#depot' }, 'Positionen eintragen'), ', dann prüft die App sie hier jeden Tag.');
    }
  };
  zeichneAufgaben();
  window.addEventListener('ia-preise', zeichneAufgaben);
  beobachte(depot());

  // Kennzahlen
  const kz = (markt && markt.kennzahlen) || [];
  if (kz.length) {
    root.append(abschnitt('Kennzahlen', h('div', { class: 'kacheln' }, kz.map((k) =>
      h('div', { class: 'kachel' },
        h('span', { class: 'kachel-name' }, k.name),
        h('span', { class: 'kachel-wert zahl' }, k.wert != null ? String(k.wert) : '–'),
        k.text ? h('span', { class: 'kachel-text' }, k.text) : null,
        h('span', { class: 'kachel-quelle' }, [k.quelle, k.stand ? datum(k.stand) : ''].filter(Boolean).join(', ')))))));
  }

  // Änderungen der Ranglisten
  const aend = (rang && rang.aenderungen) || {};
  const teile = [['qualitaet', 'Qualitätsführer'], ['wachstum', 'Wachstumschancen']]
    .map(([id, name]) => [name, aend[id] || []])
    .filter(([, l]) => l.length);
  if (rang) {
    const inhalt = teile.length
      ? teile.map(([name, l]) => h('div', { class: 'aenderungen' }, h('h3', {}, name), h('ul', { class: 'punkte' }, l.map(aenderung))))
      : h('p', { class: 'leise' }, 'Seit dem letzten Lauf hat sich in den Ranglisten nichts geändert.');
    root.append(abschnitt('Änderungen in den Ranglisten', inhalt, h('p', {}, h('a', { href: '#scanner' }, 'Zum Scanner'))));
  }

  return () => window.removeEventListener('ia-preise', zeichneAufgaben);
}

function ampelKarte(a) {
  const form = a.zustand === 'gruen' ? 'kreis' : a.zustand === 'gelb' ? 'dreieck' : 'quadrat';
  const wort = a.zustand === 'gruen' ? 'Grün' : a.zustand === 'gelb' ? 'Gelb' : a.zustand === 'rot' ? 'Rot' : '';
  return h('article', { class: `karte ampel ampel-${a.zustand || 'leer'}` },
    h('header', {},
      h('i', { class: `licht f-${form}`, 'aria-hidden': 'true' }),
      h('div', {}, h('span', { class: 'ampel-name' }, a.name), h('strong', { class: 'ampel-titel' }, a.titel || wort))),
    h('span', { class: 'nur-vorleser' }, wort ? `Ampel ${wort}.` : ''),
    a.text ? h('p', {}, a.text) : null,
    raster((a.werte || []).map((w) => ({ name: w.name, wert: w.wert })), 'raster-klein'));
}

function aenderung(a) {
  const name = h('a', { href: '#wert/' + a.pid }, a.name || a.sym);
  let text;
  if (a.art === 'neu') text = [' ist neu auf Rang ', String(a.nach), '.'];
  else if (a.art === 'auf') text = [` steigt von Rang ${a.von} auf ${a.nach}.`];
  else if (a.art === 'ab') text = [` fällt von Rang ${a.von} auf ${a.nach}.`];
  else if (a.art === 'raus') text = [` ist nicht mehr in der Liste${a.von ? ` (zuvor Rang ${a.von})` : ''}.`];
  else text = ['.'];
  return h('li', {}, name, ...text, a.grund ? ' ' + a.grund : '');
}
