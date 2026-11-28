// Bereich „Depot": Positionen (nur auf diesem Gerät), Live-Wert, Urteil je Position mit Gründen, Klumpenrisiko, Sicherung.

import { h, eur, betrag, pct, zahl, datum, leseZahl, eingabeZahl } from './format.js';
import { seitenkopf, bildStil } from './einfach.js';
import { lade, ladeWert } from './daten.js';
import { depot, setzePosition, loeschePosition } from './speicher.js';
import { livePreis, kerzenViele } from './live.js';
import { beobachte } from './beobachtung.js';
import { technik, technischesUrteil } from './kennzahlen.js';
import { kosten, hinUndZurueck, kostenText } from './kosten.js';
import { abschnitt, wertSuche, urteilPlakette, plakette, preisEl, punkteListe, hinweisKasten, sicherungBlock, KLASSEN } from './bausteine.js';

const KLUMPEN = 0.25;

export async function zeige(root) {
  const [ueb, meta] = await Promise.all([lade('uebersicht'), lade('meta')]);
  const werteUeb = (ueb && ueb.werte) || {};
  const ausKurs = new Map(); // pid → technisches Urteil (für Werte ohne Bewertung)
  let bearbeite = null; // Position in Bearbeitung
  let formOffen = depot().length === 0;
  let loeschFrage = null;
  let zahlen = []; // Stellen, die bei neuen Preisen nachgerechnet werden

  const kopf = h('div', {});
  const listeEl = h('div', {});
  const formEl = h('div', {});
  root.append(h('h1', {}, 'Depot'), seitenkopf('depot'), kopf, listeEl, formEl);

  // Steuer und Sicherung
  const steuer = (meta && meta.kosten && meta.kosten.steuer) || null;
  if (steuer && (steuer.hinweis || (steuer.hinweise || []).length)) {
    root.append(h('details', { class: 'klappe' }, h('summary', {}, 'Steuer beim Verkauf'),
      steuer.hinweis ? h('p', { class: 'leise' }, steuer.hinweis) : null, punkteListe(steuer.hinweise)));
  }
  root.append(h('details', { class: 'klappe' }, h('summary', {}, 'Sicherung und Wechsel zwischen Geräten'), sicherungBlock()));
  const neuNachImport = () => { bearbeite = null; zeichne(); };
  window.addEventListener('ia-zustand', neuNachImport);

  const kursVon = (p) => livePreis(p.pid, werteUeb[p.pid] ? werteUeb[p.pid].preis : null);

  function urteilVon(p) {
    const u = werteUeb[p.pid];
    if (u && u.urteil) return { urteil: u.urteil, nurKurs: false };
    const t = ausKurs.get(p.pid);
    return t ? { ...t, nurKurs: true } : null;
  }

  function rechne() {
    const pos = depot();
    let summe = 0;
    let einsatz = 0;
    let wertMitKauf = 0;
    let ohnePreis = 0;
    const werte = pos.map((p) => {
      const kurs = kursVon(p);
      if (kurs == null) {
        ohnePreis += 1;
        return null;
      }
      const w = kurs * p.stueck;
      summe += w;
      if (p.kaufpreis != null) {
        einsatz += p.kaufpreis * p.stueck;
        wertMitKauf += w;
      }
      return w;
    });
    for (const z of zahlen) z(summe, werte);
    kopf.replaceChildren();
    if (!pos.length) {
      kopf.append(h('p', {}, 'Trage hier ein, was du bei Bitpanda hältst. Die App prüft jede Position täglich neu, auch wenn sie im Gewinn oder Verlust liegt. Die Angaben bleiben auf diesem Gerät.'));
      return;
    }
    const guv = einsatz > 0 ? wertMitKauf - einsatz : null;
    kopf.append(h('div', { class: 'kacheln' },
      h('div', { class: 'kachel' }, h('span', { class: 'kachel-name' }, 'Depotwert'), h('span', { class: 'kachel-wert zahl' }, betrag(summe)),
        h('span', { class: 'kachel-text' }, `${pos.length} ${pos.length === 1 ? 'Position' : 'Positionen'}${ohnePreis ? `, ${ohnePreis} ohne Preis` : ''}`)),
      h('div', { class: 'kachel' }, h('span', { class: 'kachel-name' }, 'Gewinn oder Verlust'),
        h('span', { class: 'kachel-wert zahl ' + (guv > 0 ? 'plus' : guv < 0 ? 'minus' : '') }, guv != null ? betrag(guv, true) : '–'),
        h('span', { class: 'kachel-text' }, guv != null ? pct(guv / einsatz, 1, true) + ' auf den Einsatz, vor Verkaufskosten und Steuer' : 'Kaufpreise eintragen, dann steht hier das Ergebnis'))));
    const klumpen = pos.filter((p, i) => werte[i] != null && summe > 0 && werte[i] / summe > KLUMPEN);
    if (klumpen.length && pos.length > 1) {
      kopf.append(hinweisKasten(`Klumpenrisiko: ${klumpen.map((p) => p.name).join(', ')} ${klumpen.length === 1 ? 'macht' : 'machen jeweils'} mehr als ${pct(KLUMPEN, 0)} des Depots aus. Fällt dieser Wert stark, trifft es das ganze Depot.`, 'warn'));
    } else if (pos.length === 1) {
      kopf.append(hinweisKasten('Das Depot besteht aus einer einzigen Position. Das ist das größtmögliche Klumpenrisiko.', 'warn'));
    }
    kopf.append(h('p', { class: 'leise' }, 'Dein Kaufpreis spielt für die Entscheidung keine Rolle. Es zählt, ob du den Wert heute zu diesem Preis kaufen würdest.'));
  }

  function zeichne() {
    zahlen = [];
    const pos = depot();
    listeEl.replaceChildren();
    if (pos.length) {
      listeEl.append(h('ul', { class: 'kartenliste' }, pos.map((p, i) => h('li', {}, positionsKarte(p, i)))));
    }
    zeichneForm();
    rechne();
    beobachte(pos);
    ladeKursUrteile();
  }

  function positionsKarte(p, i) {
    const u = urteilVon(p);
    const wertEl = h('span', { class: 'zahl' });
    const anteilEl = h('span', { class: 'zahl' });
    const guvEl = h('span', { class: 'zahl' });
    const stopEl = h('p', { class: 'kasten k-schlecht', hidden: true });
    zahlen.push((summe, werte) => {
      const w = werte[i];
      const kurs = kursVon(p);
      wertEl.textContent = betrag(w);
      anteilEl.textContent = w != null && summe > 0 ? pct(w / summe, 0) : '–';
      if (p.kaufpreis != null && kurs != null) {
        const g = (kurs - p.kaufpreis) * p.stueck;
        guvEl.textContent = `${betrag(g, true)} (${pct(kurs / p.kaufpreis - 1, 1, true)})`;
        guvEl.className = 'zahl ' + (g > 0 ? 'plus' : g < 0 ? 'minus' : '');
      } else {
        guvEl.textContent = '–';
      }
      const erreicht = p.stop != null && kurs != null && kurs <= p.stop;
      stopEl.hidden = !erreicht;
      if (erreicht) stopEl.textContent = `Stop erreicht: Kurs ${eur(kurs)}, dein Stop liegt bei ${eur(p.stop)}.`;
    });
    const gruende = h('div', { class: 'gruende-box' });
    const klappe = h('details', { class: 'klappe' }, h('summary', {}, 'Gründe und Gegenargumente'), gruende);
    klappe.addEventListener('toggle', async () => {
      if (!klappe.open || gruende.dataset.geladen) return;
      gruende.dataset.geladen = '1';
      gruende.textContent = 'Lädt …';
      const d = await ladeWert(p.pid);
      const urteil = d && d.halteurteil ? d.halteurteil : ausKurs.get(p.pid);
      gruende.replaceChildren();
      if (!urteil) {
        gruende.append(h('p', { class: 'leise' }, 'Für diesen Wert gibt es keine Bewertung und zu wenig Kursdaten.'));
        return;
      }
      if (urteil.text) gruende.append(h('p', {}, urteil.text));
      gruende.append(h('div', { class: 'zweispalter' },
        h('div', { class: 'spalte spalte-gut' }, h('h4', {}, 'Fürs Halten'), punkteListe(urteil.gruende) || h('p', { class: 'leise' }, 'Keine Punkte.')),
        h('div', { class: 'spalte spalte-schlecht' }, h('h4', {}, 'Dagegen'), punkteListe(urteil.gegen) || h('p', { class: 'leise' }, 'Keine Punkte.'))));
      const k = kosten({ ...p, kostenklasse: werteUeb[p.pid] ? werteUeb[p.pid].kk : undefined });
      gruende.append(h('p', { class: 'leise' }, `Ein Verkauf kostet etwa ${kostenText(k, k.verkauf + (kursVon(p) ? k.fix / Math.max(1, kursVon(p) * p.stueck) : 0))} (${k.name}).`));
    });
    const loeschen = loeschFrage === p.id
      ? h('span', { class: 'frage' }, 'Wirklich löschen? ',
        h('button', { type: 'button', class: 'gefahr', onclick: () => { loeschePosition(p.id); loeschFrage = null; } }, 'Ja, löschen'),
        h('button', { type: 'button', class: 'leicht', onclick: () => { loeschFrage = null; zeichne(); } }, 'Nein'))
      : h('button', { type: 'button', class: 'leicht', onclick: () => { loeschFrage = p.id; zeichne(); } }, 'Löschen');
    return h('article', { class: 'karte position mit-bild ur-' + ((u && u.urteil) || 'leer'), style: bildStil(p) },
      h('header', { class: 'pos-kopf' },
        h('div', {},
          h('h3', {}, h('a', { href: '#wert/' + p.pid }, p.name || p.sym)),
          h('p', { class: 'unterzeile' }, [p.sym, KLASSEN[p.klasse] || p.klasse, `${zahl(p.stueck, p.stueck % 1 === 0 ? 0 : 4)} Stück`].filter(Boolean).join(' · '))),
        h('div', { class: 'plaketten' },
          u ? urteilPlakette(u.urteil) : plakette('Noch kein Urteil', 'neutral', 'strich'),
          u && u.nurKurs ? h('span', { class: 'marke marke-warn' }, 'nur aus Kursdaten') : null)),
      h('dl', { class: 'raster raster-pos' },
        h('div', {}, h('dt', {}, 'Kurs'), h('dd', {}, preisEl(p, werteUeb[p.pid] ? werteUeb[p.pid].preis : null))),
        h('div', {}, h('dt', {}, 'Wert'), h('dd', {}, wertEl)),
        h('div', {}, h('dt', {}, 'Anteil am Depot'), h('dd', {}, anteilEl)),
        h('div', {}, h('dt', {}, 'Gewinn oder Verlust'), h('dd', {}, guvEl, p.kaufpreis != null ? h('small', {}, `Kauf zu ${eur(p.kaufpreis)}${p.kaufdatum ? ' am ' + datum(p.kaufdatum) : ''}`) : null))),
      stopEl,
      p.stop != null ? h('p', { class: 'leise' }, `Dein Stop: ${eur(p.stop)}`) : null,
      p.notiz ? h('p', { class: 'notiz' }, p.notiz) : null,
      klappe,
      h('div', { class: 'knoepfe' },
        h('button', { type: 'button', class: 'leicht', onclick: () => { bearbeite = p; formOffen = true; zeichneForm(); formEl.scrollIntoView({ block: 'nearest' }); } }, 'Ändern'),
        loeschen));
  }

  function zeichneForm() {
    formEl.replaceChildren();
    if (!formOffen) {
      formEl.append(h('div', { class: 'knoepfe' }, h('button', { type: 'button', class: 'haupt', onclick: () => { formOffen = true; bearbeite = null; zeichneForm(); } }, 'Position hinzufügen')));
      return;
    }
    let gewaehlt = bearbeite ? { pid: bearbeite.pid, sym: bearbeite.sym, name: bearbeite.name, klasse: bearbeite.klasse } : null;
    const wahlEl = h('p', { class: 'gewaehlt' });
    const fehler = h('p', { class: 'meldung schlecht', role: 'alert' });
    const zeigeWahl = () => {
      wahlEl.replaceChildren(gewaehlt
        ? h('span', {}, h('strong', {}, gewaehlt.name), ' ', h('span', { class: 'sym' }, [gewaehlt.sym, KLASSEN[gewaehlt.klasse]].filter(Boolean).join(' · ')))
        : 'Noch kein Wert gewählt.');
    };
    zeigeWahl();
    const feld = (id, name, wert, zusatz, attrs = {}) => h('div', { class: 'feld' },
      h('label', { for: id }, name),
      h('input', { id, type: 'text', inputmode: 'decimal', autocomplete: 'off', value: wert, ...attrs }),
      zusatz ? h('small', {}, zusatz) : null);
    const b = bearbeite || {};
    const form = h('form', { class: 'karte formular', novalidate: true },
      h('h2', {}, bearbeite ? 'Position ändern' : 'Position hinzufügen'),
      h('div', { class: 'feld' }, h('label', { for: 'pos-suche' }, 'Wert'),
        wertSuche({ id: 'pos-suche', onWahl: (w) => { gewaehlt = w; zeigeWahl(); } }), wahlEl),
      h('div', { class: 'felder' },
        feld('pos-stueck', 'Stückzahl', eingabeZahl(b.stueck), 'auch Bruchteile, zum Beispiel 0,0153'),
        feld('pos-kauf', 'Kaufpreis je Stück in €', eingabeZahl(b.kaufpreis), 'freiwillig, für Gewinn und Verlust'),
        feld('pos-datum', 'Kaufdatum', b.kaufdatum || '', 'freiwillig', { type: 'date', inputmode: null }),
        feld('pos-stop', 'Dein Stop in €', eingabeZahl(b.stop), 'freiwillig, die App meldet, wenn der Kurs darunter fällt')),
      h('div', { class: 'feld' }, h('label', { for: 'pos-notiz' }, 'Notiz: Warum hast du gekauft?'),
        h('input', { id: 'pos-notiz', type: 'text', maxlength: '300', value: b.notiz || '' }),
        h('small', {}, 'Hilft später bei der Frage, ob der Grund noch gilt.')),
      fehler,
      h('div', { class: 'knoepfe' },
        h('button', { type: 'submit', class: 'haupt' }, bearbeite ? 'Speichern' : 'Hinzufügen'),
        h('button', { type: 'button', class: 'leicht', onclick: () => { formOffen = depot().length === 0; bearbeite = null; zeichneForm(); } }, 'Abbrechen')));
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const wertVon = (id) => form.querySelector('#' + id).value;
      const stueck = leseZahl(wertVon('pos-stueck'));
      if (!gewaehlt) {
        fehler.textContent = 'Bitte zuerst einen Wert suchen und auswählen.';
        return;
      }
      if (stueck == null || stueck <= 0) {
        fehler.textContent = 'Bitte eine Stückzahl größer als 0 eintragen.';
        return;
      }
      const kauf = leseZahl(wertVon('pos-kauf'));
      const stop = leseZahl(wertVon('pos-stop'));
      if ((wertVon('pos-kauf').trim() && (kauf == null || kauf < 0)) || (wertVon('pos-stop').trim() && (stop == null || stop < 0))) {
        fehler.textContent = 'Kaufpreis und Stop müssen Zahlen sein, zum Beispiel 123,45.';
        return;
      }
      const dat = wertVon('pos-datum');
      const neu = {
        id: bearbeite ? bearbeite.id : undefined,
        pid: gewaehlt.pid, sym: gewaehlt.sym, name: gewaehlt.name, klasse: gewaehlt.klasse,
        stueck, kaufpreis: kauf, kaufdatum: /^\d{4}-\d{2}-\d{2}$/.test(dat) ? dat : null, stop, notiz: wertVon('pos-notiz').trim(),
      };
      // Erst den Zustand der Ansicht setzen: Das Speichern löst sofort das Neuzeichnen aus.
      bearbeite = null;
      formOffen = false;
      setzePosition(neu);
    });
    formEl.append(form);
  }

  // Für Positionen ohne Bewertung: Urteil im Browser aus den Tageskerzen.
  let laedt = false;
  async function ladeKursUrteile() {
    if (laedt) return;
    const offen = depot().filter((p) => !(werteUeb[p.pid] && werteUeb[p.pid].urteil) && !ausKurs.has(p.pid));
    if (!offen.length) return;
    laedt = true;
    try {
      const m = await kerzenViele(offen, 'year', 600000);
      for (const p of offen) {
        const e = m.get(p.pid);
        ausKurs.set(p.pid, technischesUrteil(e ? technik(e.daten, p.klasse) : null));
      }
    } finally {
      laedt = false;
    }
    zeichne();
  }

  const beiPreisen = () => rechne();
  window.addEventListener('ia-preise', beiPreisen);
  zeichne();
  return () => {
    window.removeEventListener('ia-preise', beiPreisen);
    window.removeEventListener('ia-zustand', neuNachImport);
  };
}
