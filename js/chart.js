// Eigene Charts auf Canvas: Kerzen mit Linien, Bändern und Marken sowie ein Liniendiagramm (logarithmisch).
// Farben kommen aus den CSS-Tokens, damit helles und dunkles Thema stimmen.

import { zahl } from './format.js';

const beobachter = new Set();

// Beim Wechsel der Ansicht aufrufen, damit keine Beobachter auf entfernte Canvas zeigen.
export function raeumeCharts() {
  for (const b of beobachter) b.disconnect();
  beobachter.clear();
}

function farben() {
  const s = getComputedStyle(document.documentElement);
  const f = (n) => s.getPropertyValue(n).trim();
  return {
    text: f('--text-2'),
    schwach: f('--text-3'),
    linie: f('--linie'),
    flaeche: f('--flaeche'),
    auf: f('--kerze-auf'),
    ab: f('--kerze-ab'),
    akzent: f('--akzent'),
    gut: f('--gut'),
    warn: f('--warn'),
    schlecht: f('--schlecht'),
    neutral: f('--neutral'),
    reihe2: f('--reihe-2'),
    schrift: getComputedStyle(document.body).fontFamily,
  };
}

// Zeichnet jetzt und bei jeder Größenänderung neu.
function mitGroesse(canvas, zeichne) {
  const lauf = () => {
    const b = canvas.clientWidth;
    const hh = canvas.clientHeight;
    if (!b || !hh) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(b * dpr);
    canvas.height = Math.round(hh * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, b, hh);
    zeichne(ctx, b, hh, farben());
  };
  lauf();
  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver(lauf);
    ro.observe(canvas);
    beobachter.add(ro);
  }
  return lauf;
}

// „Schöne" Schrittweite für etwa n Achsenstriche
function schritt(spanne, n) {
  const roh = spanne / Math.max(1, n);
  const p = Math.pow(10, Math.floor(Math.log10(roh)));
  const m = roh / p;
  return (m >= 5 ? 10 : m >= 2 ? 5 : m >= 1 ? 2 : 1) * p;
}

function preisText(v) {
  const a = Math.abs(v);
  return zahl(v, a >= 1000 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : a >= 0.01 ? 4 : 6);
}

const zwei = (n) => String(n).padStart(2, '0');

function zeitText(t, art) {
  const d = new Date(t);
  if (art === 'tag') return `${zwei(d.getHours())}:${zwei(d.getMinutes())}`;
  if (art === 'woche') return `${zwei(d.getDate())}.${zwei(d.getMonth() + 1)}.`;
  return `${zwei(d.getMonth() + 1)}.${String(d.getFullYear()).slice(2)}`;
}

/*
  kerzenChart(canvas, kerzen, {
    art: 'tag' | 'woche' | 'jahr',
    linien: [{ werte: [...], farbe: 'akzent' | 'warn' | …, name }],
    baender: [{ von, bis, farbe, name }],
    marken: [{ wert, farbe, name }]
  })
*/
export function kerzenChart(canvas, kerzen, opt = {}) {
  return mitGroesse(canvas, (ctx, b, hh, F) => {
    const rand = { l: 6, r: 62, o: 10, u: 22 };
    const innenB = b - rand.l - rand.r;
    const innenH = hh - rand.o - rand.u;
    ctx.font = `11px ${F.schrift}`;
    ctx.textBaseline = 'middle';
    if (!kerzen || kerzen.length < 2) {
      ctx.fillStyle = F.schwach;
      ctx.textAlign = 'center';
      ctx.fillText('Keine Kursdaten', b / 2, hh / 2);
      return;
    }
    let min = Infinity;
    let max = -Infinity;
    for (const k of kerzen) {
      if (k.l < min) min = k.l;
      if (k.h > max) max = k.h;
    }
    const spanneKerzen = max - min || max * 0.02 || 1;
    // Linien, Bänder und Marken sollen sichtbar sein, dürfen die Skala aber nicht sprengen.
    const grenzeU = min - spanneKerzen * 0.35;
    const grenzeO = max + spanneKerzen * 0.35;
    const nimm = (v) => {
      if (v == null || !isFinite(v)) return;
      if (v >= grenzeU && v < min) min = v;
      if (v <= grenzeO && v > max) max = v;
    };
    for (const l of opt.linien || []) for (const v of l.werte) nimm(v);
    for (const bd of opt.baender || []) {
      nimm(bd.von);
      nimm(bd.bis);
    }
    for (const m of opt.marken || []) nimm(m.wert);
    const polster = (max - min) * 0.06 || max * 0.01;
    min -= polster;
    max += polster;
    const y = (v) => rand.o + (1 - (v - min) / (max - min)) * innenH;
    const n = kerzen.length;
    const breite = innenB / n;
    const x = (i) => rand.l + (i + 0.5) * breite;

    // Gitter und Preisachse (rechts)
    const st = schritt(max - min, Math.max(3, Math.floor(innenH / 44)));
    ctx.strokeStyle = F.linie;
    ctx.lineWidth = 1;
    ctx.fillStyle = F.text;
    ctx.textAlign = 'left';
    for (let v = Math.ceil(min / st) * st; v <= max; v += st) {
      const yy = Math.round(y(v)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(rand.l, yy);
      ctx.lineTo(rand.l + innenB, yy);
      ctx.stroke();
      ctx.fillText(preisText(v), rand.l + innenB + 6, yy);
    }
    // Zeitachse
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const marken = Math.max(2, Math.min(6, Math.floor(innenB / 70)));
    for (let j = 0; j < marken; j++) {
      const i = Math.round(((j + 0.5) / marken) * (n - 1));
      ctx.fillStyle = F.text;
      ctx.fillText(zeitText(kerzen[i].t, opt.art), x(i), rand.o + innenH + 6);
    }
    ctx.textBaseline = 'middle';

    // Bänder (zum Beispiel Kaufzone)
    for (const bd of opt.baender || []) {
      if (bd.von == null || bd.bis == null) continue;
      const o = Math.max(rand.o, y(Math.max(bd.von, bd.bis)));
      const u = Math.min(rand.o + innenH, y(Math.min(bd.von, bd.bis)));
      if (u <= o) continue;
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = F[bd.farbe] || F.akzent;
      ctx.fillRect(rand.l, o, innenB, u - o);
      ctx.globalAlpha = 1;
    }

    // Kerzen. Sind sie zu schmal, wird eine Linie der Schlusskurse gezeichnet.
    if (breite >= 2.4) {
      const koerper = Math.max(1, Math.min(11, breite * 0.68));
      for (let i = 0; i < n; i++) {
        const k = kerzen[i];
        const farbe = k.c >= k.o ? F.auf : F.ab;
        const xx = Math.round(x(i)) + 0.5;
        ctx.strokeStyle = farbe;
        ctx.fillStyle = farbe;
        ctx.beginPath();
        ctx.moveTo(xx, y(k.h));
        ctx.lineTo(xx, y(k.l));
        ctx.stroke();
        const o = y(Math.max(k.o, k.c));
        const u = y(Math.min(k.o, k.c));
        ctx.fillRect(xx - koerper / 2, o, koerper, Math.max(1, u - o));
      }
    } else {
      ctx.strokeStyle = F.text;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        if (i === 0) ctx.moveTo(x(i), y(kerzen[i].c));
        else ctx.lineTo(x(i), y(kerzen[i].c));
      }
      ctx.stroke();
      ctx.lineWidth = 1;
    }

    // Linien (Durchschnitte)
    for (const l of opt.linien || []) {
      ctx.strokeStyle = F[l.farbe] || F.akzent;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      let offen = false;
      for (let i = 0; i < n; i++) {
        const v = l.werte[i];
        if (v == null || !isFinite(v) || v < min || v > max) {
          offen = false;
          continue;
        }
        if (!offen) ctx.moveTo(x(i), y(v));
        else ctx.lineTo(x(i), y(v));
        offen = true;
      }
      ctx.stroke();
      ctx.lineWidth = 1;
    }

    // Marken (Stop, Ziele): gestrichelte Linie mit Beschriftung an der Preisachse
    ctx.textAlign = 'left';
    for (const m of opt.marken || []) {
      if (m.wert == null || m.wert < min || m.wert > max) continue;
      const yy = Math.round(y(m.wert)) + 0.5;
      const farbe = F[m.farbe] || F.neutral;
      ctx.strokeStyle = farbe;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(rand.l, yy);
      ctx.lineTo(rand.l + innenB, yy);
      ctx.stroke();
      ctx.setLineDash([]);
      const text = m.name;
      const tb = ctx.measureText(text).width + 8;
      ctx.fillStyle = farbe;
      ctx.fillRect(rand.l, yy - 8, tb, 16);
      ctx.fillStyle = F.flaeche;
      ctx.fillText(text, rand.l + 4, yy + 0.5);
    }

    // Letzter Kurs an der Achse
    const letzter = kerzen[n - 1].c;
    const yy = Math.round(y(letzter)) + 0.5;
    ctx.fillStyle = F.akzent;
    ctx.fillRect(rand.l + innenB + 2, yy - 8, rand.r - 4, 16);
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--akzent-text').trim() || '#fff';
    ctx.fillText(preisText(letzter), rand.l + innenB + 6, yy + 0.5);
  });
}

/*
  linienChart(canvas, { t: ['2008-07', …], reihen: [{ name, werte, farbe }], log: true })
  Die x-Achse zeigt Jahre, die y-Achse den Wert von 1 € (logarithmisch).
*/
export function linienChart(canvas, opt) {
  return mitGroesse(canvas, (ctx, b, hh, F) => {
    const rand = { l: 40, r: 10, o: 10, u: 24 };
    const innenB = b - rand.l - rand.r;
    const innenH = hh - rand.o - rand.u;
    ctx.font = `11px ${F.schrift}`;
    const t = opt.t || [];
    const reihen = (opt.reihen || []).filter((r) => Array.isArray(r.werte) && r.werte.length > 1);
    if (!reihen.length || t.length < 2) {
      ctx.fillStyle = F.schwach;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Keine Kurve vorhanden', b / 2, hh / 2);
      return;
    }
    let min = Infinity;
    let max = -Infinity;
    for (const r of reihen) {
      for (const v of r.werte) {
        if (v > 0 && v < min) min = v;
        if (v > max) max = v;
      }
    }
    const f = (v) => (opt.log === false ? v : Math.log(v));
    let lo = f(min);
    let hi = f(max);
    const polster = (hi - lo) * 0.06 || 0.1;
    lo -= polster;
    hi += polster;
    const n = t.length;
    const x = (i) => rand.l + (i / (n - 1)) * innenB;
    const y = (v) => rand.o + (1 - (f(v) - lo) / (hi - lo)) * innenH;

    // y-Achse: 1, 2, 5 mal Zehnerpotenz
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = F.linie;
    ctx.fillStyle = F.text;
    const striche = [];
    if (opt.log === false) {
      const st = schritt(max - min, 4);
      for (let v = Math.ceil(min / st) * st; v <= max; v += st) striche.push(v);
    } else {
      for (let e = Math.floor(Math.log10(min)) - 1; e <= Math.ceil(Math.log10(max)); e++) {
        for (const m of [1, 2, 5]) striche.push(m * Math.pow(10, e));
      }
    }
    let letztesY = Infinity;
    for (const v of striche) {
      if (f(v) < lo || f(v) > hi) continue;
      const yy = Math.round(y(v)) + 0.5;
      if (letztesY - yy < 16) continue;
      letztesY = yy;
      ctx.beginPath();
      ctx.moveTo(rand.l, yy);
      ctx.lineTo(rand.l + innenB, yy);
      ctx.stroke();
      ctx.fillText(zahl(v, v < 1 ? 1 : 0) + ' €', rand.l - 6, yy);
    }
    // x-Achse: Jahre
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const jahre = [];
    for (let i = 0; i < n; i++) {
      const j = String(t[i]).slice(0, 4);
      if (!jahre.length || jahre[jahre.length - 1].j !== j) jahre.push({ j, i });
    }
    const jedes = Math.max(1, Math.ceil(jahre.length / Math.max(2, Math.floor(innenB / 44))));
    jahre.forEach((e, k) => {
      if (k % jedes !== 0 || e.i === 0) return;
      ctx.fillStyle = F.text;
      ctx.fillText(e.j, x(e.i), rand.o + innenH + 6);
      ctx.strokeStyle = F.linie;
      ctx.beginPath();
      ctx.moveTo(Math.round(x(e.i)) + 0.5, rand.o + innenH);
      ctx.lineTo(Math.round(x(e.i)) + 0.5, rand.o + innenH + 4);
      ctx.stroke();
    });
    // Reihen: die erste (Strategie) kräftig, weitere dünner
    reihen.forEach((r, k) => {
      ctx.strokeStyle = F[r.farbe] || (k === 0 ? F.akzent : F.reihe2);
      ctx.lineWidth = k === 0 ? 2 : 1.5;
      ctx.beginPath();
      let offen = false;
      for (let i = 0; i < Math.min(n, r.werte.length); i++) {
        const v = r.werte[i];
        if (!(v > 0)) {
          offen = false;
          continue;
        }
        if (!offen) ctx.moveTo(x(i), y(v));
        else ctx.lineTo(x(i), y(v));
        offen = true;
      }
      ctx.stroke();
    });
    ctx.lineWidth = 1;
  });
}
