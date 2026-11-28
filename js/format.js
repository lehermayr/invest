// Zahlen, Datum und ein kleiner DOM-Helfer. Texte aus Daten werden immer als Textknoten gesetzt, nie als HTML.

const L = 'de-DE';

export function zahl(v, stellen = 2) {
  if (v == null || !isFinite(v)) return '–';
  return new Intl.NumberFormat(L, { minimumFractionDigits: stellen, maximumFractionDigits: stellen }).format(v);
}

// Preis in Euro: Nachkommastellen passen sich der Größe an (Krypto unter 1 Cent bleibt lesbar).
export function eur(v) {
  if (v == null || !isFinite(v)) return '–';
  const a = Math.abs(v);
  const max = a >= 1000 ? 0 : a >= 1 ? 2 : a >= 0.01 ? 4 : 6;
  const min = a >= 1000 ? 0 : 2;
  return new Intl.NumberFormat(L, { minimumFractionDigits: min, maximumFractionDigits: max }).format(v) + ' €';
}

// Geldbetrag mit festen zwei Nachkommastellen (Depotwerte, Gewinn und Verlust).
export function betrag(v, vz = false) {
  if (v == null || !isFinite(v)) return '–';
  const s = zahl(v, 2) + ' €';
  return vz && v > 0 ? '+' + s : s;
}

export function pct(v, stellen = 1, vz = false) {
  if (v == null || !isFinite(v)) return '–';
  const s = zahl(v * 100, stellen) + ' %';
  return vz && v > 0 ? '+' + s : s;
}

// Große Zahlen: 2,9 Bio., 14,2 Mrd., 420 Mio.
export function gross(v, einheit = '') {
  if (v == null || !isFinite(v)) return '–';
  const a = Math.abs(v);
  let s;
  if (a >= 1e12) s = zahl(v / 1e12, 1) + ' Bio.';
  else if (a >= 1e9) s = zahl(v / 1e9, 1) + ' Mrd.';
  else if (a >= 1e6) s = zahl(v / 1e6, a >= 1e8 ? 0 : 1) + ' Mio.';
  else s = zahl(v, 0);
  return einheit ? s + ' ' + einheit : s;
}

function alsDatum(wert) {
  if (wert == null || wert === '') return null;
  if (wert instanceof Date) return wert;
  if (typeof wert === 'number') return new Date(wert);
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(wert) ? wert + 'T12:00:00' : wert);
  return isNaN(d) ? null : d;
}

const zwei = (n) => String(n).padStart(2, '0');

export function datum(wert) {
  if (typeof wert === 'string' && /^\d{4}-\d{2}$/.test(wert)) return wert.slice(5) + '.' + wert.slice(0, 4);
  const d = alsDatum(wert);
  return d ? `${zwei(d.getDate())}.${zwei(d.getMonth() + 1)}.${d.getFullYear()}` : '–';
}

export function zeit(wert) {
  const d = alsDatum(wert);
  return d ? `${zwei(d.getHours())}:${zwei(d.getMinutes())}` : '–';
}

export function datumZeit(wert) {
  const d = alsDatum(wert);
  return d ? `${datum(d)}, ${zeit(d)}` : '–';
}

export function alterStunden(wert) {
  const d = alsDatum(wert);
  return d ? (Date.now() - d.getTime()) / 3600000 : null;
}

export function heute() {
  const d = new Date();
  return `${d.getFullYear()}-${zwei(d.getMonth() + 1)}-${zwei(d.getDate())}`;
}

// Eingaben mit deutschem Komma lesen: „1.234,56" und „1234.56" ergeben beide 1234.56.
export function leseZahl(text) {
  if (text == null) return null;
  let s = String(text).trim().replace(/\s|€|%/g, '');
  if (s === '') return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const v = Number(s);
  return isFinite(v) ? v : null;
}

export function eingabeZahl(v, stellen = 6) {
  if (v == null || !isFinite(v)) return '';
  return String(Number(v.toFixed(stellen))).replace('.', ',');
}

// DOM-Helfer: h('div', {class: 'x', onclick: fn}, 'Text', kind)
export function h(tag, attrs, ...kinder) {
  const el = document.createElement(tag);
  setze(el, attrs);
  haenge(el, kinder);
  return el;
}

const SVGNS = 'http://www.w3.org/2000/svg';
export function svg(tag, attrs, ...kinder) {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs || {})) if (v != null && v !== false) el.setAttribute(k, v);
  haenge(el, kinder);
  return el;
}

function setze(el, attrs) {
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'value') el.value = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
}

function haenge(el, kinder) {
  for (const kind of kinder.flat(Infinity)) {
    if (kind == null || kind === false || kind === '') continue;
    el.append(kind instanceof Node ? kind : document.createTextNode(String(kind)));
  }
}
