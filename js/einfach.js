// Die einfache Sicht auf „Heute": In welchen Bereichen kann man jetzt kaufen, wo wartet man, was sollte man verkaufen?
// Drei Farben, drei Worte. Die Regeln stehen in METHODIK.md, Abschnitt „Einfache Sicht".

import { h, eur } from './format.js';
import { depot } from './speicher.js';

const WORT = { gruen: 'Kaufen möglich', gelb: 'Abwarten', rot: 'Jetzt nicht kaufen' };
const ZEICHEN = { gruen: '✓', gelb: '…', rot: '✕' };

const trendFarbe = (t) => (t === 'auf' ? 'gruen' : t === 'ab' ? 'rot' : t ? 'gelb' : null);

function anteilFarbe(liste) {
  const mit = liste.filter((m) => m.trend);
  if (mit.length < 3) return null;
  const auf = mit.filter((m) => m.trend === 'auf').length / mit.length;
  const ab = mit.filter((m) => m.trend === 'ab').length / mit.length;
  return auf >= 0.5 ? 'gruen' : ab >= 0.5 ? 'rot' : 'gelb';
}

// Bereiche mit Ampel. Jede Ampel hat eine Begründung in einem Satz.
function bereiche({ markt, nachk }) {
  const ampel = Object.fromEntries(((markt && markt.ampeln) || []).map((a) => [a.id, a]));
  const maerkte = (markt && markt.maerkte) || [];
  const m = (sym) => maerkte.find((x) => x.sym === sym);
  const stufen = Object.fromEntries(((nachk && nachk.liste) || []).map((n) => [n.id, n]));
  const sparen = (id) => {
    const n = stufen[id];
    if (!n || !n.staffel || !n.staffel.length) return null;
    const e = n.staffel.filter((s) => s.erreicht).length;
    return e ? `Langfristig sparen: Nachkauf-Stufe ${e} von ${n.staffel.length} erreicht.` : null;
  };
  const satz = { gruen: 'Der Trend zeigt nach oben.', gelb: 'Kein klarer Trend.', rot: 'Die Kurse fallen.' };
  const aus = [];
  const dazu = (id, name, bild, farbe, extra, link) => { if (farbe) aus.push({ id, name, bild, farbe, text: satz[farbe], extra, link }); };
  dazu('aktien', 'Aktien weltweit', 'aktien', ampel.aktien && ampel.aktien.zustand, sparen('welt'), '#scanner');
  dazu('technik', 'Technologie', 'technik', trendFarbe((m('NASDAQ100') || {}).trend), sparen('usa_tech'), m('NASDAQ100') ? '#wert/' + m('NASDAQ100').pid : '#scanner');
  dazu('krypto', 'Krypto', 'krypto', ampel.krypto && ampel.krypto.zustand, sparen('btc'), '#strategien');
  dazu('gold', 'Gold', 'gold', trendFarbe((m('XAU') || {}).trend), sparen('gold'), m('XAU') ? '#wert/' + m('XAU').pid : '#scanner');
  dazu('rohstoff', 'Rohstoffe', 'rohstoff', anteilFarbe(maerkte.filter((x) => x.klasse === 'rohstoff')), null, '#scanner');
  return aus;
}

function kachel(b) {
  return h('a', { class: 'bereich b-' + b.farbe, href: b.link },
    h('img', { src: `bilder/${b.bild}.webp`, alt: '', loading: 'lazy', width: '720', height: '400' }),
    h('span', { class: 'bereich-inhalt' },
      h('span', { class: 'bereich-name' }, b.name),
      h('span', { class: 'bereich-signal' }, h('i', { 'aria-hidden': 'true' }, ZEICHEN[b.farbe]), WORT[b.farbe]),
      h('span', { class: 'bereich-text' }, b.text),
      b.extra ? h('span', { class: 'bereich-extra' }, b.extra) : null));
}

function wertZeile(k, art) {
  return h('a', { class: 'einfachzeile z-' + art, href: '#wert/' + k.pid },
    h('span', { class: 'ez-punkt', 'aria-hidden': 'true' }, art === 'gruen' ? '✓' : '✕'),
    h('span', { class: 'ez-name' }, k.name, h('small', {}, k.grund || '')),
    k.preis != null ? h('span', { class: 'ez-preis zahl' }, eur(k.preis)) : null);
}

export function einfachBlock({ markt, rang, nachk, ueb }) {
  const el = h('div', { class: 'einfach' });
  const liste = bereiche({ markt, nachk });
  if (liste.length) {
    const kopf = h('header', { class: 'held' },
      h('img', { src: 'bilder/welt.webp', alt: '', width: '720', height: '400' }),
      h('div', { class: 'held-text' },
        h('p', { class: 'held-frage' }, 'Wo kann ich heute kaufen?'),
        h('p', { class: 'held-antwort' },
          liste.filter((b) => b.farbe === 'gruen').length
            ? 'Grün: ' + liste.filter((b) => b.farbe === 'gruen').map((b) => b.name).join(', ')
            : 'Heute steht kein Bereich auf Grün.'),
        liste.some((b) => b.farbe === 'rot') ? h('p', { class: 'held-rot' }, 'Rot: ' + liste.filter((b) => b.farbe === 'rot').map((b) => b.name).join(', ')) : null));
    el.append(kopf,
      h('div', { class: 'legende-einfach' },
        h('span', { class: 'l-gruen' }, '✓ Grün: Kaufen möglich'), h('span', { class: 'l-gelb' }, '… Gelb: Abwarten'), h('span', { class: 'l-rot' }, '✕ Rot: Jetzt nicht kaufen')),
      h('div', { class: 'bereiche' }, liste.map(kachel)));
  }

  // Einzelne Werte auf Grün: die besten mit Status „Kaufen möglich"
  const gruen = [];
  for (const name of ['qualitaet', 'wachstum']) {
    for (const k of (rang && rang[name]) || []) {
      if (k.status === 'einstieg' && gruen.length < 6) gruen.push({ ...k, grund: k.kurz });
    }
  }
  gruen.sort((a, b) => (b.score || 0) - (a.score || 0));
  el.append(h('section', { class: 'einfach-teil' },
    h('h2', {}, 'Diese Werte stehen auf Grün'),
    gruen.length
      ? h('div', { class: 'einfachliste' }, gruen.slice(0, 5).map((k) => wertZeile(k, 'gruen')))
      : h('p', { class: 'kasten k-neutral' }, 'Heute steht kein einzelner Wert auf Grün. Nichts zu kaufen ist auch eine Entscheidung.'),
    h('p', { class: 'leise' }, 'Grün heißt: gutes Unternehmen, fairer Preis, Kurs steigt. Tippe auf einen Wert für die Gründe und die Gegenargumente.')));

  // Verkaufen: nur das eigene Depot
  const werte = (ueb && ueb.werte) || {};
  const pos = depot();
  const rot = pos.filter((p) => werte[p.pid] && (werte[p.pid].urteil === 'verkauf' || werte[p.pid].urteil === 'teilverkauf'))
    .map((p) => ({ pid: p.pid, name: p.name, preis: werte[p.pid].preis, grund: werte[p.pid].urteil === 'verkauf' ? 'Verkaufen prüfen: schwache Zahlen und fallender Kurs.' : 'Teil verkaufen prüfen: sehr teuer und weit gelaufen.' }));
  el.append(h('section', { class: 'einfach-teil' },
    h('h2', {}, 'Was sollte ich verkaufen?'),
    !pos.length
      ? h('p', { class: 'kasten k-neutral' }, 'Trag im ', h('a', { href: '#depot' }, 'Depot'), ' ein, was du besitzt. Dann steht hier, ob etwas davon auf Rot steht.')
      : rot.length
        ? h('div', { class: 'einfachliste' }, rot.map((k) => wertZeile(k, 'rot')))
        : h('p', { class: 'kasten k-gut' }, h('strong', {}, 'Nichts. '), `Keine deiner ${pos.length} Positionen steht auf Rot.`)));
  el.append(h('p', { class: 'leise' }, 'Die Ampeln folgen festen Regeln und sind keine Anlageberatung. Kaufen und verkaufen musst du selbst in der Bitpanda-App.'));
  return el;
}

// Seitenkopf für jeden Bereich: Foto, eine Frage, eine Antwort in einem Satz. Die Antwort füllt sich aus den Daten.
import { lade } from './daten.js';

const KOEPFE = {
  scanner: { bild: 'scanner', frage: 'Welche Werte sind gerade gut?', antwort: async () => {
    const r = await lade('ranglisten');
    if (!r) return ['Noch keine Analyse vorhanden.', 'gelb'];
    const n = [...(r.qualitaet || []), ...(r.wachstum || [])].filter((k) => k.status === 'einstieg').length;
    return n ? [`${n} Werte stehen auf Grün.`, 'gruen'] : ['Heute steht kein Wert auf Grün.', 'gelb'];
  } },
  depot: { bild: 'depot', frage: 'Was mache ich mit meinem Depot?', antwort: async () => {
    const pos = depot();
    if (!pos.length) return ['Trag ein, was du besitzt.', 'gelb'];
    const u = await lade('uebersicht');
    const werte = (u && u.werte) || {};
    const rot = pos.filter((p) => werte[p.pid] && ['verkauf', 'teilverkauf'].includes(werte[p.pid].urteil)).length;
    const gelb = pos.filter((p) => werte[p.pid] && werte[p.pid].urteil === 'beobachten').length;
    if (rot) return [`${rot} ${rot === 1 ? 'Position steht' : 'Positionen stehen'} auf Rot: Verkaufen prüfen.`, 'rot'];
    if (gelb) return [`Nichts verkaufen. ${gelb} ${gelb === 1 ? 'Position' : 'Positionen'} im Auge behalten.`, 'gelb'];
    return ['Alles behalten. Keine Position steht auf Rot.', 'gruen'];
  } },
  trading: { bild: 'trading', frage: 'Gibt es heute einen guten Trade?', antwort: async () => {
    const s = await lade('setups');
    const n = ((s && s.liste) || []).filter((x) => x.freigabe && x.zustand === 'aktiv').length;
    return n ? [`Ja: ${n} ${n === 1 ? 'Setup ist' : 'Setups sind'} freigegeben.`, 'gruen'] : ['Nein. Heute lieber nichts tun.', 'rot'];
  } },
  strategien: { bild: 'regeln', frage: 'Was sagen die festen Regeln?', antwort: async () => {
    const n = await lade('nachkauf');
    const namen = ((n && n.liste) || []).filter((x) => x.stufen_erreicht > 0).map((x) => x.name.replace(/ \(.*\)/, ''));
    return namen.length ? ['Nachkauf-Stufe erreicht bei: ' + namen.join(', ') + '.', 'gelb'] : ['Keine Nachkauf-Stufe erreicht. Signale stehen unten.', 'gruen'];
  } },
};

// Passendes Hintergrundfoto für eine Karte: nach Sektor, sonst nach Anlageklasse.
const BILD_SEKTOR = { Technologie: 'technik', Gesundheit: 'gesundheit', Finanzen: 'aktien', 'Konsum (zyklisch)': 'konsum', 'Konsum (Grundbedarf)': 'konsum',
  Industrie: 'industrie', Energie: 'energie', Grundstoffe: 'rohstoff', Kommunikation: 'kommunikation', Versorger: 'versorger', Immobilien: 'industrie' };
const BILD_KLASSE = { krypto: 'krypto', krypto_btc: 'krypto', index: 'krypto', hebel: 'krypto', metall: 'gold', rohstoff: 'rohstoff', etf: 'etf', aktie: 'aktien' };
export function bildStil(wert) {
  const w = wert || {};
  const name = (w.klasse === 'aktie' && BILD_SEKTOR[w.sektor]) || BILD_KLASSE[w.klasse] || w.bild || 'aktien';
  return `--bild: url(bilder/${name}.webp)`;
}

// Drei Schritte je Seite: so einfach, dass man ohne Vorwissen weiß, was zu tun ist.
const SCHRITTE = {
  scanner: ['Schau auf die Farbe: Grün heißt kaufen möglich, Gelb heißt warten, Rot heißt nicht kaufen.', 'Tippe auf eine Karte. Dort steht, warum.', 'Der Stern merkt dir einen Wert für später.'],
  depot: ['Trag ein, was du bei Bitpanda besitzt.', 'Jede Position bekommt eine Farbe: Grün behalten, Gelb im Auge behalten, Rot verkaufen prüfen.', 'Gekauft und verkauft wird in der Bitpanda-App. Hier wird nichts gekauft.'],
  trading: ['Nur Karten mit grünem Rand zählen. Graue sind nur zur Information.', 'Kaufe im Einstiegsbereich und gib den Stop gleich mit ein.', 'Kein grünes Setup? Dann heute nichts tun.'],
  strategien: ['Such dir eine Regel aus, die zu dir passt.', 'Schau am Tag der nächsten Prüfung hinein.', 'Mach genau das, was beim aktuellen Signal steht. Nicht mehr.'],
};

export function seitenkopf(name) {
  const k = KOEPFE[name];
  if (!k) return null;
  return h('div', { class: 'kopfblock' }, seitenbild(name, k),
    h('ol', { class: 'schritte' }, (SCHRITTE[name] || []).map((t, i) => h('li', {}, h('span', { class: 'schritt-nr', 'aria-hidden': 'true' }, String(i + 1)), h('span', {}, t)))));
}

function seitenbild(name, k) {
  const antwort = h('p', { class: 'held-antwort held-offen' }, '…');
  const el = h('header', { class: 'held held-seite' },
    h('img', { src: `bilder/${k.bild}.webp`, alt: '', width: '720', height: '400' }),
    h('div', { class: 'held-text' }, h('p', { class: 'held-frage' }, k.frage), antwort));
  k.antwort().then(([text, farbe]) => {
    antwort.textContent = text;
    antwort.className = 'held-antwort a-' + farbe;
  }).catch(() => { antwort.textContent = ''; });
  return el;
}
