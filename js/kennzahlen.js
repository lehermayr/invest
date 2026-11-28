// Technische Kennzahlen im Browser, für Werte ohne Analyse-Datei und für die Live-Ansichten im Trading.
// Dieselben Definitionen wie in der Pipeline: einfacher Durchschnitt, RSI und ATR nach Wilder.

export function sma(werte, n) {
  const aus = new Array(werte.length).fill(null);
  let summe = 0;
  for (let i = 0; i < werte.length; i++) {
    summe += werte[i];
    if (i >= n) summe -= werte[i - n];
    if (i >= n - 1) aus[i] = summe / n;
  }
  return aus;
}

export function rsi(schluss, n = 14) {
  const aus = new Array(schluss.length).fill(null);
  if (schluss.length <= n) return aus;
  let auf = 0;
  let ab = 0;
  for (let i = 1; i <= n; i++) {
    const d = schluss[i] - schluss[i - 1];
    if (d >= 0) auf += d;
    else ab -= d;
  }
  auf /= n;
  ab /= n;
  aus[n] = ab === 0 ? 100 : 100 - 100 / (1 + auf / ab);
  for (let i = n + 1; i < schluss.length; i++) {
    const d = schluss[i] - schluss[i - 1];
    auf = (auf * (n - 1) + Math.max(d, 0)) / n;
    ab = (ab * (n - 1) + Math.max(-d, 0)) / n;
    aus[i] = ab === 0 ? 100 : 100 - 100 / (1 + auf / ab);
  }
  return aus;
}

export function atr(kerzen, n = 14) {
  const aus = new Array(kerzen.length).fill(null);
  if (kerzen.length <= n) return aus;
  const tr = kerzen.map((k, i) => (i === 0 ? k.h - k.l : Math.max(k.h - k.l, Math.abs(k.h - kerzen[i - 1].c), Math.abs(k.l - kerzen[i - 1].c))));
  let a = 0;
  for (let i = 1; i <= n; i++) a += tr[i];
  a /= n;
  aus[n] = a;
  for (let i = n + 1; i < kerzen.length; i++) {
    a = (a * (n - 1) + tr[i]) / n;
    aus[i] = a;
  }
  return aus;
}

// Aktien, ETFs und Rohstoff-Papiere haben bei Bitpanda auch Wochenendkerzen. Für Kennzahlen zählen nur Handelstage.
const MIT_WOCHENENDE = new Set(['krypto', 'metall', 'index', 'hebel']);

export function fuerKennzahlen(kerzen, klasse) {
  if (MIT_WOCHENENDE.has(klasse)) return kerzen;
  return kerzen.filter((k) => {
    const tag = new Date(k.t).getUTCDay();
    return tag !== 0 && tag !== 6;
  });
}

const letzter = (a) => (a.length ? a[a.length - 1] : null);

// Technik aus Tageskerzen (ein Jahr). Felder wie im Datenvertrag unter werte/<pid>.json → technik.
export function technik(kerzenRoh, klasse) {
  const kerzen = fuerKennzahlen(kerzenRoh || [], klasse);
  if (kerzen.length < 30) return null;
  const c = kerzen.map((k) => k.c);
  const n = c.length;
  const preis = c[n - 1];
  const tageJeJahr = MIT_WOCHENENDE.has(klasse) ? 365 : 252;
  const zurueck = (anteil) => {
    const i = n - 1 - Math.round(tageJeJahr * anteil);
    return i >= 0 ? preis / c[i] - 1 : null;
  };
  const s20 = letzter(sma(c, 20));
  const s50 = letzter(sma(c, 50));
  const n200 = Math.min(200, n >= 150 ? n : 0);
  const s200roh = n200 ? sma(c, n200) : [];
  const s200 = n >= 200 ? letzter(s200roh) : null;
  const r = letzter(rsi(c, 14));
  const a = letzter(atr(kerzen, 14));
  const hoch = Math.max(...kerzen.map((k) => k.h));
  const tief = Math.min(...kerzen.map((k) => k.l));
  // Schwankung: Standardabweichung der Tagesrenditen, aufs Jahr hochgerechnet
  const rend = [];
  for (let i = 1; i < n; i++) rend.push(Math.log(c[i] / c[i - 1]));
  const mittel = rend.reduce((x, y) => x + y, 0) / rend.length;
  const varianz = rend.reduce((x, y) => x + (y - mittel) ** 2, 0) / Math.max(1, rend.length - 1);
  // Größter Rückgang vom Hoch
  let spitze = c[0];
  let rueck = 0;
  for (const v of c) {
    spitze = Math.max(spitze, v);
    rueck = Math.min(rueck, v / spitze - 1);
  }
  let trend = 'seit';
  if (s200 != null && s50 != null) {
    if (preis > s200 && s50 > s200) trend = 'auf';
    else if (preis < s200 && s50 < s200) trend = 'ab';
  } else if (s50 != null && s20 != null) {
    if (preis > s50 && s20 > s50) trend = 'auf';
    else if (preis < s50 && s20 < s50) trend = 'ab';
  }
  return {
    trend,
    sma20: s20,
    sma50: s50,
    sma200: s200,
    abst200: s200 ? preis / s200 - 1 : null,
    rsi14: r != null ? Math.round(r) : null,
    atr_pct: a != null ? a / preis : null,
    hoch52: hoch,
    tief52: tief,
    vom_hoch: preis / hoch - 1,
    r1w: zurueck(1 / 52),
    r1m: zurueck(1 / 12),
    r3m: zurueck(0.25),
    r6m: zurueck(0.5),
    r12m: n >= tageJeJahr * 0.97 ? preis / c[0] - 1 : null,
    schwankung: Math.sqrt(varianz * tageJeJahr),
    rueckgang_max: rueck,
    tage: n,
  };
}

// Urteil nur aus Kursdaten, für Depot-Positionen ohne Bewertung aus der Analyse.
export function technischesUrteil(t) {
  if (!t) return { urteil: 'beobachten', text: 'Zu wenig Kursdaten für ein Urteil.', gruende: [], gegen: [] };
  const gruende = [];
  const gegen = [];
  const p = (v) => (v == null ? null : (v * 100).toFixed(1).replace('.', ',') + ' %');
  if (t.trend === 'auf') gruende.push('Der Kurs liegt im Aufwärtstrend' + (t.abst200 != null ? ` (${p(t.abst200)} über der 200-Tage-Linie).` : '.'));
  if (t.trend === 'ab') gegen.push('Der Kurs liegt im Abwärtstrend' + (t.abst200 != null ? ` (${p(Math.abs(t.abst200))} unter der 200-Tage-Linie).` : '.'));
  if (t.trend === 'seit') gegen.push('Kein klarer Trend.');
  if (t.r3m != null) (t.r3m >= 0 ? gruende : gegen).push(`Entwicklung in drei Monaten: ${p(t.r3m)}.`);
  if (t.vom_hoch != null && t.vom_hoch < -0.3) gegen.push(`Der Kurs liegt ${p(Math.abs(t.vom_hoch))} unter dem Hoch der letzten zwölf Monate.`);
  if (t.rsi14 != null && t.rsi14 > 75) gegen.push(`RSI ${t.rsi14}: kurzfristig stark gelaufen.`);
  let urteil = 'beobachten';
  let text = 'Kein klares Bild aus den Kursdaten.';
  if (t.trend === 'ab' && t.abst200 != null && t.abst200 < -0.15) {
    urteil = 'verkauf';
    text = 'Klarer Abwärtstrend. Prüfe, ob dein Grund für den Kauf noch gilt.';
  } else if (t.trend === 'auf' && t.abst200 != null && t.abst200 > 0.4 && t.rsi14 != null && t.rsi14 > 75) {
    urteil = 'teilverkauf';
    text = 'Sehr weit über dem langfristigen Durchschnitt. Ein Teilverkauf sichert Gewinne.';
  } else if (t.trend === 'auf') {
    urteil = 'halten';
    text = 'Aufwärtstrend intakt.';
  } else if (t.trend === 'ab') {
    text = 'Abwärtstrend. Beobachten, ob der Kurs wieder über die 50-Tage-Linie steigt.';
  }
  return { urteil, text, gruende, gegen };
}
