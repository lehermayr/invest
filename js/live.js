// Live-Daten. Die Quelle ist austauschbar:
//   1. Bitpanda (öffentliche Schnittstelle, ohne Schlüssel): Preise und Kerzen in Euro für alle Werte.
//   2. Binance als Ersatz, nur für Krypto, falls Bitpanda nicht antwortet (Bitpanda hat die Abschaltung
//      seiner alten Schnittstelle zum 31.01.2027 angekündigt).
// Für Wertpapiere gibt es im Browser keine Ersatzquelle: Dann zeigt die App den Preis aus der Analyse.
// Zum Testen: ?live=binance überspringt Bitpanda, ?live=aus schaltet alle Live-Abrufe ab.

const BITPANDA = 'https://api.bitpanda.com';
const BINANCE = 'https://data-api.binance.vision';
const TICKER_KLASSEN = new Set(['krypto', 'metall', 'index', 'hebel']);
const NUR_BOERSENZEIT = new Set(['aktie', 'etf', 'rohstoff']);
const BUENDEL = 50;
const ERZWUNGEN = new URLSearchParams(location.search).get('live');
const IST_KENNUNG = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const preisCache = new Map(); // pid → {preis, zeit, quelle}
const kerzenCache = new Map(); // "pid|periode" → {zeit, daten, quelle}
let letzterErfolg = 0;
let letzteQuelle = null;
let bitpandaPauseBis = 0;

const bitpandaAktiv = () => ERZWUNGEN !== 'binance' && ERZWUNGEN !== 'aus' && Date.now() > bitpandaPauseBis;
const binanceAktiv = () => ERZWUNGEN !== 'aus';
function bitpandaFehler() {
  bitpandaPauseBis = Date.now() + 120000; // zwei Minuten nicht erneut versuchen
}
function erfolg(quelle) {
  letzterErfolg = Date.now();
  letzteQuelle = quelle;
  window.dispatchEvent(new CustomEvent('ia-live'));
}

async function holeJson(url, ms = 20000) {
  const ab = new AbortController();
  const t = setTimeout(() => ab.abort(), ms);
  try {
    const r = await fetch(url, { signal: ab.signal, cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

// ---------- Quelle Bitpanda ----------

let bpTickerDaten = null;
let bpTickerZeit = 0;

async function bpTicker(maxAlter = 30000) {
  if (bpTickerDaten && Date.now() - bpTickerZeit < maxAlter) return bpTickerDaten;
  bpTickerDaten = await holeJson(BITPANDA + '/v1/ticker');
  bpTickerZeit = Date.now();
  return bpTickerDaten;
}

function bpLeseKerzen(roh) {
  const liste = Array.isArray(roh) ? roh : roh && Array.isArray(roh.data) ? roh.data : [];
  const aus = [];
  for (const k of liste) {
    const a = k && k.attributes;
    if (!a || !a.time) continue;
    const c = { t: Number(a.time.unix) * 1000, o: Number(a.open), h: Number(a.high), l: Number(a.low), c: Number(a.close) };
    if (isFinite(c.t) && isFinite(c.c) && c.c > 0) aus.push(c);
  }
  aus.sort((x, y) => x.t - y.t);
  return aus;
}

async function bpKerzen(pids, periode) {
  const d = await holeJson(`${BITPANDA}/v3/ohlc/eur/${periode}?assets=${pids.join(',')}`, 30000);
  const klein = {};
  for (const [k, v] of Object.entries((d && d.data) || {})) klein[k.toLowerCase()] = v;
  const aus = new Map();
  for (const pid of pids) {
    const kerzen = bpLeseKerzen(klein[pid.toLowerCase()]);
    if (kerzen.length) aus.set(pid, kerzen);
  }
  return aus;
}

// ---------- Quelle Binance (nur Krypto) ----------

let bnPreisDaten = null;
let bnPreisZeit = 0;

async function bnAllePreise(maxAlter = 30000) {
  if (bnPreisDaten && Date.now() - bnPreisZeit < maxAlter) return bnPreisDaten;
  const liste = await holeJson(BINANCE + '/api/v3/ticker/price');
  const m = {};
  for (const e of liste) m[e.symbol] = Number(e.price);
  bnPreisDaten = m;
  bnPreisZeit = Date.now();
  return m;
}

function bnPreis(m, sym) {
  const s = String(sym || '').toUpperCase();
  if (m[s + 'EUR'] > 0) return m[s + 'EUR'];
  if (m[s + 'USDT'] > 0 && m.EURUSDT > 0) return m[s + 'USDT'] / m.EURUSDT;
  return null;
}

const BN_PERIODE = { year: ['1d', 365], week: ['1h', 168], day: ['15m', 96] };

async function bnKerzen(sym, periode) {
  const [intervall, anzahl] = BN_PERIODE[periode] || BN_PERIODE.year;
  const s = String(sym || '').toUpperCase();
  const lese = (liste, faktor) =>
    liste.map((k) => ({ t: Number(k[0]), o: k[1] * faktor, h: k[2] * faktor, l: k[3] * faktor, c: k[4] * faktor })).filter((k) => isFinite(k.c) && k.c > 0);
  try {
    return lese(await holeJson(`${BINANCE}/api/v3/klines?symbol=${s}EUR&interval=${intervall}&limit=${anzahl}`), 1);
  } catch (e) {
    // Kein Euro-Paar: Dollar-Paar mit dem aktuellen Wechselkurs umrechnen.
    const m = await bnAllePreise();
    if (!(m.EURUSDT > 0)) throw e;
    return lese(await holeJson(`${BINANCE}/api/v3/klines?symbol=${s}USDT&interval=${intervall}&limit=${anzahl}`), 1 / m.EURUSDT);
  }
}

// ---------- Gemeinsame Abrufe ----------

// werte: [{pid, sym, klasse}]. periode: 'day' (10 Minuten), 'week' (Stunden), 'year' (Tage).
// Ergebnis: Map pid → {daten: Kerzen, quelle, zeit}
export async function kerzenViele(werte, periode, maxAlter = 60000) {
  const ergebnis = new Map();
  const fehlen = [];
  const gesehen = new Set();
  for (const w of werte) {
    if (!w || !w.pid || gesehen.has(w.pid)) continue;
    gesehen.add(w.pid);
    const e = kerzenCache.get(w.pid + '|' + periode);
    if (e && Date.now() - e.zeit < maxAlter) ergebnis.set(w.pid, e);
    else fehlen.push(w);
  }
  const merke = (pid, daten, quelle) => {
    const e = { zeit: Date.now(), daten, quelle };
    kerzenCache.set(pid + '|' + periode, e);
    ergebnis.set(pid, e);
  };
  let offen = fehlen;
  if (bitpandaAktiv() && offen.some((w) => IST_KENNUNG.test(w.pid))) {
    const rest = offen.filter((w) => !IST_KENNUNG.test(w.pid));
    offen = offen.filter((w) => IST_KENNUNG.test(w.pid));
    for (let i = 0; i < offen.length; i += BUENDEL) {
      const teil = offen.slice(i, i + BUENDEL);
      try {
        const m = await bpKerzen(teil.map((w) => w.pid), periode);
        for (const w of teil) {
          if (m.has(w.pid)) merke(w.pid, m.get(w.pid), 'Bitpanda');
          else rest.push(w);
        }
        erfolg('Bitpanda');
      } catch (e) {
        bitpandaFehler();
        rest.push(...teil, ...offen.slice(i + BUENDEL));
        break;
      }
    }
    offen = rest;
  }
  if (binanceAktiv()) {
    for (const w of offen.filter((x) => x.klasse === 'krypto' && x.sym)) {
      try {
        const k = await bnKerzen(w.sym, periode);
        if (k.length) {
          merke(w.pid, k, 'Binance');
          erfolg('Binance');
        }
      } catch (e) {
        /* still */
      }
    }
  }
  // Was jetzt noch fehlt: lieber alte Kerzen als keine.
  for (const w of fehlen) {
    if (!ergebnis.has(w.pid)) {
      const alt = kerzenCache.get(w.pid + '|' + periode);
      if (alt) ergebnis.set(w.pid, alt);
    }
  }
  return ergebnis;
}

export async function kerzen(wert, periode, maxAlter = 60000) {
  const m = await kerzenViele([wert], periode, maxAlter);
  return m.get(wert.pid) || { daten: [], quelle: null, zeit: 0 };
}

// Füllt den Preis-Zwischenspeicher und meldet 'ia-preise'. mitKerzen: auch Werte ohne Ticker (Aktien, ETFs, Rohstoffe).
export async function aktualisierePreise(werte, { mitKerzen = true } = {}) {
  const liste = [];
  const gesehen = new Set();
  for (const w of werte) {
    if (w && w.pid && !gesehen.has(w.pid)) {
      gesehen.add(w.pid);
      liste.push(w);
    }
  }
  const frisch = new Set();
  let ausTicker = liste.filter((w) => TICKER_KLASSEN.has(w.klasse) && w.sym);
  if (ausTicker.length && bitpandaAktiv()) {
    try {
      const t = await bpTicker();
      for (const w of ausTicker) {
        const p = t[w.sym] && Number(t[w.sym].EUR);
        if (isFinite(p) && p > 0) {
          preisCache.set(w.pid, { preis: p, zeit: bpTickerZeit, quelle: 'Bitpanda' });
          frisch.add(w.pid);
        }
      }
      erfolg('Bitpanda');
    } catch (e) {
      bitpandaFehler();
    }
  }
  const kryptoOffen = ausTicker.filter((w) => w.klasse === 'krypto' && !frisch.has(w.pid));
  if (kryptoOffen.length && binanceAktiv()) {
    try {
      const m = await bnAllePreise();
      for (const w of kryptoOffen) {
        const p = bnPreis(m, w.sym);
        if (p) {
          preisCache.set(w.pid, { preis: p, zeit: bnPreisZeit, quelle: 'Binance' });
          frisch.add(w.pid);
        }
      }
      if (kryptoOffen.some((w) => frisch.has(w.pid))) erfolg('Binance');
    } catch (e) {
      /* still */
    }
  }
  const ausKerzen = liste.filter((w) => !frisch.has(w.pid) && w.klasse !== 'krypto' && IST_KENNUNG.test(w.pid));
  if (mitKerzen && ausKerzen.length && bitpandaAktiv()) {
    const m = await kerzenViele(ausKerzen, 'day', 170000);
    for (const [pid, e] of m) {
      const l = e.daten[e.daten.length - 1];
      if (l && e.quelle === 'Bitpanda') {
        preisCache.set(pid, { preis: l.c, zeit: l.t, quelle: 'Bitpanda' });
        frisch.add(pid);
      }
    }
  }
  window.dispatchEvent(new CustomEvent('ia-preise', { detail: { ok: frisch.size > 0 } }));
  return frisch.size > 0;
}

export function preis(pid) {
  return preisCache.get(pid) || null;
}

export function livePreis(pid, ersatz = null) {
  const p = preisCache.get(pid);
  return p ? p.preis : ersatz;
}

export const letzterLiveAbruf = () => ({ zeit: letzterErfolg, quelle: letzteQuelle });

// Aktien, ETFs und Rohstoffe sind bei Bitpanda Montag bis Freitag von 07:30 bis 23:00 Uhr (Wiener Zeit) handelbar.
export function handelOffen(klasse, jetzt = new Date()) {
  if (!NUR_BOERSENZEIT.has(klasse)) return true;
  try {
    const teile = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Vienna', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(jetzt);
    const t = Object.fromEntries(teile.map((p) => [p.type, p.value]));
    if (t.weekday === 'Sat' || t.weekday === 'Sun') return false;
    const minuten = Number(t.hour) * 60 + Number(t.minute);
    return minuten >= 450 && minuten < 1380;
  } catch (e) {
    return true;
  }
}
