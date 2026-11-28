// Kostenmodell aus meta.json (config/kosten.json), mit eigener Überschreibung aus den Einstellungen.
// Kosten hin und zurück als Anteil = kauf + verkauf + 2 × fix_eur / Orderbetrag.

import { einstellungen } from './speicher.js';

let meta = null;

export function setzeMeta(m) {
  meta = m;
}

export const metaDaten = () => meta;
export const kostenDaten = () => (meta && meta.kosten) || {};
export const regeln = () => (meta && meta.regeln) || {};

const zahlOder = (v, ersatz) => (typeof v === 'number' && isFinite(v) ? v : ersatz);

export function ordergroesse() {
  const eigen = einstellungen().ordergroesse;
  if (eigen > 0) return eigen;
  return zahlOder(kostenDaten().ordergroesse_eur, 0) > 0 ? kostenDaten().ordergroesse_eur : 1000;
}

export function risikoJeTrade() {
  const eigen = einstellungen().risiko;
  if (eigen > 0) return eigen;
  return zahlOder(regeln().risiko_je_trade, 0) > 0 ? regeln().risiko_je_trade : 0.01;
}

export function crvMin() {
  return zahlOder(regeln().crv_min, 0) > 0 ? regeln().crv_min : 1.5;
}

export const kryptoWeg = () => (einstellungen().krypto_weg === 'fusion' ? 'fusion' : 'broker');

// wert: {klasse, kostenklasse | kk, sym}. weg: 'broker' | 'fusion' (Vorgabe: Einstellung).
export function kostenId(wert, weg = kryptoWeg()) {
  let id = (wert && (wert.kostenklasse || wert.kk)) || (wert && wert.klasse) || '';
  if (weg === 'fusion' && id.startsWith('krypto')) id = 'krypto_fusion';
  return id;
}

export function kosten(wert, weg) {
  const k = kostenDaten();
  const klassen = k.klassen || {};
  const id = kostenId(wert, weg);
  const basis = klassen[id] || klassen[wert && wert.klasse] || {};
  let kauf = zahlOder(basis.kauf, 0);
  let verkauf = zahlOder(basis.verkauf, 0);
  let belegt = basis.belegt !== false && Object.keys(basis).length > 0;
  const sym = wert && wert.sym;
  if (k.symbole && sym && k.symbole[sym] && id === (wert && wert.klasse)) {
    kauf = zahlOder(k.symbole[sym].kauf, kauf);
    verkauf = zahlOder(k.symbole[sym].verkauf, verkauf);
  }
  const eigen = einstellungen().kosten[id];
  let ueberschrieben = false;
  if (eigen) {
    if (eigen.kauf != null) {
      kauf = eigen.kauf;
      ueberschrieben = true;
    }
    if (eigen.verkauf != null) {
      verkauf = eigen.verkauf;
      ueberschrieben = true;
    }
  }
  return {
    id,
    name: basis.name || id || 'unbekannt',
    kauf,
    verkauf,
    fix: zahlOder(basis.fix_eur, 0),
    pro_tag: zahlOder(basis.pro_tag, null),
    belegt: belegt && !ueberschrieben,
    eigen: ueberschrieben,
    hinweis: basis.hinweis || '',
    bekannt: Object.keys(basis).length > 0,
  };
}

// Kosten für Kauf plus Verkauf als Anteil des Orderbetrags.
export function hinUndZurueck(k, betrag = ordergroesse()) {
  return k.kauf + k.verkauf + (betrag > 0 ? (2 * k.fix) / betrag : 0);
}

// Chance-Risiko-Verhältnis nach Kosten. Die Kosten mindern die Chance und erhöhen das Risiko.
export function crvNetto(einstieg, stop, ziel, kostenAnteil) {
  if (![einstieg, stop, ziel].every((x) => typeof x === 'number' && isFinite(x)) || einstieg <= 0) return null;
  const k = einstieg * (kostenAnteil || 0);
  const risiko = Math.abs(einstieg - stop) + k;
  const chance = Math.abs(ziel - einstieg) - k;
  return risiko > 0 ? chance / risiko : null;
}

export function crvBrutto(einstieg, stop, ziel) {
  return crvNetto(einstieg, stop, ziel, 0);
}

// Für die Anzeige: „0,6 % (Schätzung)"
export function kostenText(k, anteil) {
  const s = (anteil * 100).toFixed(anteil < 0.01 ? 2 : 1).replace('.', ',') + ' %';
  return k.belegt || k.eigen ? s : s + ' (Schätzung)';
}
