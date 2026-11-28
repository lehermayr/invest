// Wiederkehrende Bausteine der Oberfläche.

import { h, eur, pct, datum } from './format.js';
import { universum, suche } from './daten.js';
import { gemerkt, schalteMerken, sicherungAlsText, leseSicherung, speichertDauerhaft } from './speicher.js';
import { preis, handelOffen } from './live.js';

export const KLASSEN = { aktie: 'Aktie', etf: 'ETF', krypto: 'Krypto', metall: 'Metall', rohstoff: 'Rohstoff', index: 'Krypto-Index', hebel: 'Hebel-Token' };
// Einfache Worte: Grün = kaufen möglich, Gelb = warten, Rot = nicht kaufen bzw. verkaufen prüfen
export const STATUS = { einstieg: 'Kaufen möglich', interessant: 'Gut, aber noch warten', beobachten: 'Abwarten', unattraktiv: 'Jetzt nicht kaufen' };
export const URTEIL = { halten: 'Behalten', beobachten: 'Im Auge behalten', teilverkauf: 'Teil verkaufen prüfen', verkauf: 'Verkaufen prüfen' };
export const GROESSE = { gross: 'Groß', mittel: 'Mittel', klein: 'Klein' };
export const HORIZONT = { kurz: 'kurzfristig', mittel: 'mittelfristig', lang: 'langfristig' };
export const TRAGF = { belegt: 'Tragfähigkeit gut belegt', plausibel: 'Plausibel, aber noch nicht bewiesen', schwach: 'Schwach belegt' };
export const RISIKO = { niedrig: 'niedrig', mittel: 'mittel', hoch: 'hoch' };
export const TREND = { auf: 'aufwärts', seit: 'seitwärts', ab: 'abwärts' };
export const NOTEN = [
  ['qualitaet', 'Qualität', 'Q'],
  ['wachstum', 'Wachstum', 'W'],
  ['bewertung', 'Bewertung', 'B'],
  ['risiko', 'Risiko', 'R'],
  ['daten', 'Datenvertrauen', 'D'],
  ['technik', 'Technik', 'T'],
];
const NOTEN_KURZ = { q: 'qualitaet', w: 'wachstum', b: 'bewertung', r: 'risiko', d: 'daten', t: 'technik' };

// Noten aus uebersicht.json (q, w, b, …) in die lange Form bringen.
export function notenLang(kurz) {
  if (!kurz) return null;
  const aus = {};
  for (const [k, lang] of Object.entries(NOTEN_KURZ)) if (typeof kurz[k] === 'number') aus[lang] = kurz[k];
  return Object.keys(aus).length ? aus : null;
}

const ART_FARBE = {
  einstieg: 'gut', interessant: 'warn', beobachten: 'warn', unattraktiv: 'schlecht',
  halten: 'gut', teilverkauf: 'warn', verkauf: 'schlecht',
  gruen: 'gut', gelb: 'warn', rot: 'schlecht',
};

// Plakette mit Form und Text, damit der Zustand nicht nur an der Farbe hängt.
export function plakette(text, art, form) {
  const farbe = ART_FARBE[art] || art || 'neutral';
  return h('span', { class: `plakette p-${farbe}` }, h('i', { class: `form f-${form || formFuer(art)}`, 'aria-hidden': 'true' }), text);
}

function formFuer(art) {
  if (art === 'einstieg' || art === 'halten' || art === 'gruen' || art === 'gut') return 'kreis';
  if (art === 'beobachten' || art === 'teilverkauf' || art === 'gelb' || art === 'warn') return 'dreieck';
  if (art === 'verkauf' || art === 'rot' || art === 'schlecht') return 'quadrat';
  if (art === 'interessant' || art === 'akzent') return 'raute';
  return 'strich';
}

export const statusPlakette = (s) => (STATUS[s] ? plakette(STATUS[s], s) : null);
export const urteilPlakette = (u) => (URTEIL[u] ? plakette(URTEIL[u], u) : null);

export function trendEl(t) {
  if (!TREND[t]) return h('span', { class: 'trend' }, '–');
  const pfeil = t === 'auf' ? '↗' : t === 'ab' ? '↘' : '→';
  return h('span', { class: `trend trend-${t}` }, h('span', { 'aria-hidden': 'true' }, pfeil + ' '), TREND[t]);
}

// Farbe für eine Rendite: plus grün, minus rot
export function rendite(v, stellen = 1) {
  if (v == null || !isFinite(v)) return h('span', { class: 'zahl' }, '–');
  return h('span', { class: 'zahl ' + (v > 0 ? 'plus' : v < 0 ? 'minus' : '') }, pct(v, stellen, true));
}

// Sechs getrennte Noten als Balken. Bei „Risiko" ist ein hoher Wert schlecht.
// Noten in Worten: auf den Karten zählt das Wort, die Zahl steht in der Detailansicht.
const WORTE = {
  qualitaet: ['Qualität', 'stark', 'mittel', 'schwach'],
  wachstum: ['Wachstum', 'stark', 'mittel', 'schwach'],
  bewertung: ['Preis', 'günstig', 'normal', 'teuer'],
  risiko: ['Risiko', 'niedrig', 'mittel', 'hoch'],
  daten: ['Daten', 'vollständig', 'lückenhaft', 'dünn'],
  technik: ['Trend', 'stark', 'neutral', 'schwach'],
};

export function notenWort(id, v) {
  if (typeof v !== 'number' || !isFinite(v) || !WORTE[id]) return null;
  const gut = id === 'risiko' ? 100 - v : v;
  const i = gut >= 67 ? 1 : gut >= 34 ? 2 : 3;
  return { name: WORTE[id][0], wort: WORTE[id][i], stufe: i === 1 ? 'hoch' : i === 2 ? 'mitte' : 'tief' };
}

// Karten: vier Aussagen in Worten mit Farbe und Zeichen statt sechs Zahlen.
function notenWorte(noten) {
  const el = h('ul', { class: 'worte' });
  for (const id of ['qualitaet', 'bewertung', 'risiko', 'technik']) {
    const w = notenWort(id, noten[id]);
    el.append(h('li', { class: 'wort w-' + (w ? w.stufe : 'leer'), title: w ? `${w.name}: ${Math.round(noten[id])} von 100` : '' },
      h('span', { class: 'wort-name' }, WORTE[id][0]),
      h('span', { class: 'wort-wert' }, h('i', { 'aria-hidden': 'true' }, w ? (w.stufe === 'hoch' ? '●' : w.stufe === 'mitte' ? '◐' : '○') : '–'), ' ', w ? w.wort : 'keine Daten')));
  }
  return el;
}

export function notenBalken(noten, { kompakt = false } = {}) {
  if (!noten) return null;
  if (kompakt) return notenWorte(noten);
  const el = h('dl', { class: 'noten' + (kompakt ? ' noten-kompakt' : '') });
  for (const [id, name, kurz] of NOTEN) {
    const v = noten[id];
    const hat = typeof v === 'number' && isFinite(v);
    const gut = id === 'risiko' ? 100 - v : v;
    const stufe = !hat ? 'leer' : gut >= 67 ? 'hoch' : gut >= 34 ? 'mitte' : 'tief';
    el.append(
      h('div', { class: 'note', title: hat ? `${name}: ${v} von 100` : `${name}: keine Daten` },
        h('dt', {}, kompakt ? h('abbr', { title: name }, kurz) : name),
        h('dd', {},
          h('span', { class: `balken b-${stufe}`, 'aria-hidden': 'true' }, h('span', { style: `width:${hat ? Math.max(3, Math.min(100, v)) : 0}%` })),
          h('span', { class: 'zahl' }, hat ? String(Math.round(v)) : '–'),
          hat && !kompakt ? h('span', { class: 'note-wort w-' + stufe }, notenWort(id, v).wort) : null)));
  }
  return el;
}

// Preis, der sich mit den Live-Preisen füllt. ersatz = Preis aus der Analyse.
export function preisEl(wert, ersatz, { zusatz = true } = {}) {
  const el = h('span', { class: 'preisblock', dataset: { preis: wert.pid, klasse: wert.klasse || '', ersatz: ersatz != null ? String(ersatz) : '', zusatz: zusatz ? '1' : '' } },
    h('span', { class: 'preis zahl' }, eur(ersatz)),
    h('span', { class: 'preis-zusatz' }));
  fuellePreis(el);
  return el;
}

function fuellePreis(el) {
  const p = preis(el.dataset.preis);
  const ersatz = el.dataset.ersatz === '' ? null : Number(el.dataset.ersatz);
  const zahlEl = el.querySelector('.preis');
  const zusatzEl = el.querySelector('.preis-zusatz');
  zahlEl.textContent = eur(p ? p.preis : ersatz);
  el.classList.toggle('live', !!p);
  if (el.dataset.zusatz !== '1') return;
  const offen = handelOffen(el.dataset.klasse);
  let text = '';
  if (!offen) text = 'Handel geschlossen';
  else if (!p && ersatz != null) text = 'Preis aus der Analyse';
  else if (p && p.quelle && p.quelle !== 'Bitpanda') text = 'Quelle ' + p.quelle;
  zusatzEl.textContent = text;
}

export function fuellePreise(wurzel = document) {
  for (const el of wurzel.querySelectorAll('[data-preis]')) fuellePreis(el);
}

// Stern für die Merkliste
export function stern(pid, name) {
  const knopf = h('button', { class: 'stern', type: 'button' });
  const zeichne = () => {
    const an = gemerkt(pid);
    knopf.setAttribute('aria-pressed', an ? 'true' : 'false');
    knopf.setAttribute('aria-label', (an ? 'Von der Merkliste nehmen: ' : 'Auf die Merkliste: ') + (name || ''));
    knopf.title = an ? 'Auf der Merkliste' : 'Auf die Merkliste';
    knopf.textContent = an ? '★' : '☆';
  };
  knopf.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    schalteMerken(pid);
    zeichne();
  });
  zeichne();
  return knopf;
}

// Umschalter: optionen = [{id, name}]
export function segment(optionen, aktiv, onWahl, beschriftung) {
  const el = h('div', { class: 'segment', role: 'group', 'aria-label': beschriftung });
  for (const o of optionen) {
    el.append(h('button', {
      type: 'button',
      class: o.id === aktiv ? 'aktiv' : '',
      'aria-pressed': o.id === aktiv ? 'true' : 'false',
      onclick: () => onWahl(o.id),
    }, o.name));
  }
  return el;
}

// Suchfeld über das ganze Universum. onWahl(wert) wird mit {pid, sym, name, klasse, isin} aufgerufen.
export function wertSuche({ id, platzhalter = 'Name, Symbol oder ISIN', onWahl }) {
  const eingabe = h('input', { type: 'search', id, placeholder: platzhalter, autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Wert suchen' });
  const treffer = h('ul', { class: 'suchtreffer', hidden: true });
  const el = h('div', { class: 'suche' }, eingabe, treffer);
  let nr = 0;
  const zeige = async () => {
    const lauf = ++nr;
    const text = eingabe.value;
    if (text.trim().length < 2) {
      treffer.hidden = true;
      return;
    }
    const u = await universum();
    if (lauf !== nr) return;
    treffer.replaceChildren();
    if (!u.liste.length) {
      treffer.append(h('li', { class: 'leer' }, 'Die Liste der handelbaren Werte ist noch nicht geladen.'));
    } else {
      const liste = suche(u.liste, text);
      if (!liste.length) treffer.append(h('li', { class: 'leer' }, 'Kein Wert gefunden.'));
      for (const w of liste) {
        treffer.append(h('li', {},
          h('button', { type: 'button', onclick: () => { treffer.hidden = true; eingabe.value = ''; onWahl(w); } },
            h('span', { class: 'st-name' }, w.name),
            h('span', { class: 'st-zusatz' }, [w.sym, KLASSEN[w.klasse] || w.klasse].filter(Boolean).join(' · ')))));
      }
    }
    treffer.hidden = false;
  };
  eingabe.addEventListener('input', zeige);
  eingabe.addEventListener('focus', () => { universum(); if (eingabe.value.trim().length >= 2) zeige(); });
  eingabe.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') treffer.hidden = true;
    if (ev.key === 'Enter') {
      ev.preventDefault();
      const erster = treffer.querySelector('button');
      if (erster && !treffer.hidden) erster.click();
    }
  });
  document.addEventListener('click', (ev) => { if (!el.contains(ev.target)) treffer.hidden = true; });
  return el;
}

export function abschnitt(titel, ...kinder) {
  return h('section', { class: 'abschnitt' }, titel ? h('h2', {}, titel) : null, ...kinder);
}

export function hinweisKasten(text, art = 'neutral') {
  return h('p', { class: `kasten k-${art}` }, text);
}

export function keineDaten() {
  return h('div', { class: 'kasten k-warn leerseite' },
    h('strong', {}, 'Es liegt noch keine Analyse vor.'),
    h('p', {}, 'Die Analyse wird in der Cloud gerechnet und hier abgelegt. Sobald der erste Lauf fertig ist, erscheinen Marktlage, Ranglisten und Setups.'),
    h('p', {}, 'Depot, Merkliste, Rechner und Live-Preise funktionieren auch ohne Analyse.'));
}

export function punkteListe(punkte, klasse = '') {
  const liste = (punkte || []).filter(Boolean);
  if (!liste.length) return null;
  return h('ul', { class: 'punkte ' + klasse }, liste.map((p) => h('li', {}, p)));
}

// Raster aus Kennzahlen: [{name, wert, zusatz}]. wert darf Text oder ein Element sein.
export function raster(eintraege, klasse = '') {
  const liste = (eintraege || []).filter((e) => e && e.wert != null && e.wert !== '');
  if (!liste.length) return null;
  return h('dl', { class: 'raster ' + klasse }, liste.map((e) =>
    h('div', {}, h('dt', {}, e.name), h('dd', {}, e.wert, e.zusatz ? h('small', {}, e.zusatz) : null))));
}

export function wertLink(wert, text) {
  return h('a', { href: '#wert/' + wert.pid, class: 'wertlink' }, text || wert.name || wert.sym);
}

export function stand(text) {
  return h('p', { class: 'stand' }, text);
}

export const standText = (iso) => (iso ? 'Stand ' + datum(iso) : '');

// Sicherung: Datei speichern und einlesen, Text kopieren und einfügen.
export function sicherungBlock() {
  const meldung = h('p', { class: 'meldung', role: 'status' });
  const feld = h('textarea', { id: 'sicherung-text', rows: '4', placeholder: 'Sicherung hier einfügen', 'aria-label': 'Sicherung als Text' });
  const datei = h('input', { type: 'file', id: 'sicherung-datei', accept: '.json,application/json', hidden: true });
  const sag = (text, gut = true) => {
    meldung.textContent = text;
    meldung.className = 'meldung ' + (gut ? 'gut' : 'schlecht');
  };
  const uebernimm = (text) => {
    const r = leseSicherung(text);
    if (r.ok) sag(`Eingelesen: ${r.positionen} Positionen, ${r.gemerkt} Werte auf der Merkliste.`);
    else sag(r.grund, false);
  };
  datei.addEventListener('change', async () => {
    const f = datei.files && datei.files[0];
    if (!f) return;
    try {
      uebernimm(await f.text());
    } catch (e) {
      sag('Die Datei konnte nicht gelesen werden.', false);
    }
    datei.value = '';
  });
  return h('div', { class: 'sicherung' },
    h('p', {}, 'Depot, Merkliste und Einstellungen liegen nur auf diesem Gerät. Für Handy und PC: hier sichern, am anderen Gerät einlesen.'),
    speichertDauerhaft() ? null : hinweisKasten('Dieser Browser speichert gerade nichts dauerhaft (privates Fenster oder gesperrter Speicher). Sichere deine Eingaben als Datei oder Text.', 'warn'),
    h('div', { class: 'knoepfe' },
      h('button', { type: 'button', onclick: () => {
        try {
          const url = URL.createObjectURL(new Blob([sicherungAlsText()], { type: 'application/json' }));
          const a = h('a', { href: url, download: 'investment-analyst-sicherung.json' });
          document.body.append(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 2000);
          sag('Datei gespeichert.');
        } catch (e) {
          sag('Speichern als Datei geht hier nicht. Nimm „Als Text kopieren".', false);
        }
      } }, 'Als Datei speichern'),
      h('button', { type: 'button', onclick: () => datei.click() }, 'Datei einlesen'),
      h('button', { type: 'button', onclick: async () => {
        const text = sicherungAlsText();
        try {
          await navigator.clipboard.writeText(text);
          sag('In die Zwischenablage kopiert.');
        } catch (e) {
          feld.value = text;
          feld.select();
          sag('Kopieren ging nicht automatisch. Der Text steht im Feld, bitte dort kopieren.', false);
        }
      } }, 'Als Text kopieren'),
      h('button', { type: 'button', onclick: () => {
        if (!feld.value.trim()) sag('Bitte zuerst die Sicherung in das Feld einfügen.', false);
        else uebernimm(feld.value);
      } }, 'Text einlesen')),
    feld, datei, meldung);
}
