// Einstellungen und Methodik: Kapital, Risiko, Kostenmodell, Datenquellen, Sicherung, Erklärungen.

import { h, pct, datumZeit, leseZahl, eingabeZahl, eur } from './format.js';
import { lade, BEISPIEL } from './daten.js';
import { einstellungen, setzeEinstellungen } from './speicher.js';
import { kosten, kostenDaten, ordergroesse, risikoJeTrade, hinUndZurueck } from './kosten.js';
import { abschnitt, sicherungBlock, punkteListe, plakette, hinweisKasten, raster, STATUS, URTEIL } from './bausteine.js';
import { kontoBlock } from './ansicht-anmeldung.js';

const ZAEHLER = { aktien: 'Aktien', krypto: 'Kryptowerte', sonstige: 'sonstige Werte' };

function zaehlerText(z) {
  if (!z) return '';
  const zahlDe = (v) => new Intl.NumberFormat('de-DE').format(v);
  const bewertet = Object.entries(ZAEHLER).filter(([k]) => typeof z[k] === 'number').map(([k, name]) => `${zahlDe(z[k])} ${name}`);
  return (typeof z.universum === 'number' ? ` Handelbar bei Bitpanda: ${zahlDe(z.universum)} Werte.` : '') + (bewertet.length ? ` Bewertet: ${bewertet.join(', ')}.` : '');
}

export async function zeige(root) {
  const meta = await lade('meta');
  root.append(h('h1', {}, 'Einstellungen und Methodik'));
  if (BEISPIEL) root.append(hinweisKasten('Du siehst Beispieldaten. Sie dienen nur zum Ausprobieren der App.', 'warn'));
  const konto = kontoBlock();
  if (konto) root.append(abschnitt('Konto', konto));

  // Handel
  const meldung = h('p', { class: 'meldung', role: 'status' });
  const gespeichert = () => { meldung.textContent = 'Gespeichert.'; meldung.className = 'meldung gut'; };
  const zahlFeld = (id, name, wert, zusatz, setze) => h('div', { class: 'feld' },
    h('label', { for: id }, name),
    h('input', { id, type: 'text', inputmode: 'decimal', autocomplete: 'off', value: wert,
      onchange: (ev) => { const v = leseZahl(ev.target.value); if (v != null && v > 0) { setze(v); gespeichert(); } else { meldung.textContent = 'Bitte eine Zahl größer als 0 eintragen.'; meldung.className = 'meldung schlecht'; } } }),
    zusatz ? h('small', {}, zusatz) : null);
  const e = einstellungen();
  root.append(abschnitt('Handel',
    h('div', { class: 'felder' },
      zahlFeld('e-kapital', 'Kapital fürs Trading in €', eingabeZahl(e.kapital, 2), 'Grundlage für den Positionsgrößen-Rechner', (v) => setzeEinstellungen({ kapital: v })),
      zahlFeld('e-risiko', 'Risiko je Trade in %', eingabeZahl(risikoJeTrade() * 100, 2), 'üblich sind 0,5 bis 2 %', (v) => setzeEinstellungen({ risiko: v / 100 })),
      zahlFeld('e-order', 'Übliche Ordergröße in €', eingabeZahl(ordergroesse(), 2), 'bestimmt, wie stark feste Gebühren ins Gewicht fallen', (v) => setzeEinstellungen({ ordergroesse: v })),
      h('div', { class: 'feld' }, h('label', { for: 'e-weg' }, 'Krypto handle ich über'),
        h('select', { id: 'e-weg', onchange: (ev) => { setzeEinstellungen({ krypto_weg: ev.target.value === 'fusion' ? 'fusion' : 'broker' }); gespeichert(); zeichneKosten(); } },
          h('option', { value: 'broker', selected: e.krypto_weg !== 'fusion' }, 'Broker (normaler Kauf in der App)'),
          h('option', { value: 'fusion', selected: e.krypto_weg === 'fusion' }, 'Bitpanda Fusion (Orderbuch)')),
        h('small', {}, 'Fusion ist deutlich günstiger, muss aber für dein Konto freigeschaltet sein.')),
      h('div', { class: 'feld' }, h('label', { for: 'e-thema' }, 'Darstellung'),
        h('select', { id: 'e-thema', onchange: (ev) => { setzeEinstellungen({ thema: ev.target.value }); window.dispatchEvent(new CustomEvent('ia-thema')); gespeichert(); } },
          [['system', 'wie das Gerät'], ['hell', 'hell'], ['dunkel', 'dunkel']].map(([v, t]) => h('option', { value: v, selected: e.thema === v }, t))))),
    meldung));

  // Kostenmodell
  const kostenEl = h('div', {});
  root.append(abschnitt('Kostenmodell Bitpanda', kostenEl));
  function zeichneKosten() {
    const kd = kostenDaten();
    const klassen = kd.klassen || {};
    kostenEl.replaceChildren();
    if (!Object.keys(klassen).length) {
      kostenEl.append(hinweisKasten('Das Kostenmodell kommt mit der Analyse. Ohne Analyse rechnet die App ohne Kosten, das ist zu optimistisch.', 'warn'));
      return;
    }
    const eigene = einstellungen().kosten || {};
    const feld = (id, seite, vorgabe) => h('input', {
      type: 'text', inputmode: 'decimal', class: 'schmal', 'aria-label': `Eigener Satz ${seite === 'kauf' ? 'Kauf' : 'Verkauf'} in Prozent für ${klassen[id].name || id}`,
      id: `k-${id}-${seite}`, placeholder: eingabeZahl(vorgabe * 100, 3),
      value: eigene[id] && eigene[id][seite] != null ? eingabeZahl(eigene[id][seite] * 100, 3) : '',
      onchange: (ev) => {
        const text = ev.target.value.trim();
        const v = text === '' ? null : leseZahl(text);
        if (text !== '' && (v == null || v < 0 || v > 20)) { ev.target.value = ''; return; }
        const alle = { ...(einstellungen().kosten || {}) };
        const eintrag = { kauf: null, verkauf: null, ...(alle[id] || {}) };
        eintrag[seite] = v == null ? null : v / 100;
        if (eintrag.kauf == null && eintrag.verkauf == null) delete alle[id];
        else alle[id] = eintrag;
        setzeEinstellungen({ kosten: alle });
        zeichneKosten();
      },
    });
    kostenEl.append(
      h('p', {}, `Stand ${kd.stand ? kd.stand.split('-').reverse().join('.') : '–'}. Kosten für Kauf plus Verkauf bei ${eur(ordergroesse())} Ordergröße. Leere Felder nutzen den Satz aus der Analyse.`),
      h('ul', { class: 'kartenliste kostenliste' }, Object.entries(klassen).map(([id, kl]) => {
        const k = kosten({ klasse: id, kostenklasse: id }, 'broker');
        return h('li', {}, h('article', { class: 'karte kostenkarte' },
          h('header', { class: 'setup-kopf' },
            h('h3', {}, kl.name || id),
            h('div', { class: 'plaketten' },
              kl.belegt === false ? h('span', { class: 'marke marke-warn' }, 'Schätzung') : h('span', { class: 'marke' }, 'belegt'),
              k.eigen ? h('span', { class: 'marke' }, 'eigener Satz') : null)),
          raster([
            { name: 'Kauf', wert: pct(k.kauf, 2) },
            { name: 'Verkauf', wert: pct(k.verkauf, 2) },
            { name: 'fest je Order', wert: k.fix ? eur(k.fix) : 'nichts' },
            { name: 'hin und zurück', wert: pct(hinUndZurueck(k), 2), zusatz: k.pro_tag ? `plus ${pct(k.pro_tag, 2)} pro Tag` : '' },
          ], 'raster-vier'),
          kl.hinweis ? h('p', { class: 'leise' }, kl.hinweis) : null,
          h('p', { class: 'eigen' }, h('span', {}, 'Eigener Satz in %'),
            h('span', { class: 'paar' }, 'Kauf', feld(id, 'kauf', kl.kauf || 0)), h('span', { class: 'paar' }, 'Verkauf', feld(id, 'verkauf', kl.verkauf || 0)))));
      })),
      kd.symbole && Object.keys(kd.symbole).length
        ? h('p', { class: 'leise' }, 'Abweichende Sätze: ' + Object.entries(kd.symbole).map(([s, w]) => `${s} Kauf ${pct(w.kauf, 1)}, Verkauf ${pct(w.verkauf, 1)}`).join(' · ') + '.')
        : null,
      kd.quelle ? h('p', { class: 'stand' }, 'Quelle: ' + kd.quelle) : null);
  }
  zeichneKosten();

  // Steuer
  const steuer = kostenDaten().steuer;
  if (steuer) {
    root.append(abschnitt('Steuer',
      h('p', {}, steuer.kest != null ? `Kapitalertragsteuer ${pct(steuer.kest, 1)}. ` : '', steuer.hinweis || ''),
      punkteListe(steuer.hinweise)));
  }

  // Datenquellen
  const quellen = (meta && meta.quellen) || [];
  root.append(abschnitt('Datenquellen',
    meta ? h('p', {}, `Letzte Analyse: ${datumZeit(meta.erstellt)}${meta.lauf ? ` (${meta.lauf === 'voll' ? 'voller Lauf' : 'Auffrischung'})` : ''}.`, zaehlerText(meta.zaehler)) : hinweisKasten('Noch keine Analyse vorhanden.', 'warn'),
    quellen.length ? h('ul', { class: 'kartenliste' }, quellen.map((q) => h('li', {}, h('article', { class: 'karte quelle' },
      h('header', { class: 'setup-kopf' }, h('h3', {}, q.name), q.ok ? plakette('in Ordnung', 'gut', 'kreis') : plakette('Abruf fehlgeschlagen', 'schlecht', 'quadrat')),
      h('p', {}, q.liefert || ''),
      q.hinweis ? h('p', { class: 'leise' }, q.hinweis) : null,
      h('p', { class: 'stand' }, q.stand ? 'Stand ' + datumZeit(q.stand) : 'Stand unbekannt'))))) : null,
    h('p', { class: 'leise' }, 'Preise und Charts holt die App beim Öffnen direkt von Bitpanda. Fällt Bitpanda aus, kommt für Krypto ein Ersatzpreis von Binance, der leicht abweichen kann. Für Aktien, ETFs und Rohstoffe steht dann der Preis aus der Analyse mit Datum da.')));

  // Benachrichtigungen aufs Handy
  if (meta && meta.meldungen && meta.meldungen.thema) {
    const thema = meta.meldungen.thema;
    const feldThema = h('input', { type: 'text', readonly: true, id: 'e-thema-ntfy', value: thema, 'aria-label': 'Thema für die App ntfy', onfocus: (ev) => ev.target.select() });
    const kopiert = h('span', { class: 'meldung', role: 'status' });
    root.append(abschnitt('Benachrichtigungen aufs Handy',
      h('p', {}, 'Die App meldet sich, wenn sich etwas Wichtiges ändert: Marktlage, Signal einer Strategie, ein neues freigegebenes Setup oder eine erreichte Nachkauf-Stufe. Geprüft wird nach jeder Analyse, also bis zu viermal am Tag, nicht sekundengenau.'),
      h('ol', { class: 'punkte nummern' },
        h('li', {}, 'Lade die kostenlose App „ntfy" aus dem App Store oder von Google Play. Ein Konto brauchst du nicht.'),
        h('li', {}, 'Tippe in ntfy auf das Plus und füge als Thema den Text unten ein.'),
        h('li', {}, 'Erlaube ntfy, Mitteilungen zu senden. Fertig.')),
      h('div', { class: 'feld' }, h('label', { for: 'e-thema-ntfy' }, 'Dein Thema'), feldThema),
      h('div', { class: 'knoepfe' },
        h('button', { type: 'button', class: 'haupt', onclick: async () => {
          try { await navigator.clipboard.writeText(thema); kopiert.textContent = 'Kopiert.'; kopiert.className = 'meldung gut'; } catch (e) { feldThema.select(); kopiert.textContent = 'Bitte von Hand kopieren.'; }
        } }, 'Thema kopieren'),
        h('a', { href: meta.meldungen.adresse, target: '_blank', rel: 'noopener' }, 'Im Browser ansehen'), kopiert),
      h('p', { class: 'leise' }, 'Das Thema ist wie ein Passwort: Wer es kennt, kann die Meldungen mitlesen. Dein Depot kommt in den Meldungen nicht vor, die Cloud kennt es nicht.')));
  }

  // Sicherung
  root.append(abschnitt('Sicherung', sicherungBlock()));

  // Erklärungen
  root.append(abschnitt('So liest du die App',
    h('h3', {}, 'Sechs getrennte Noten, 0 bis 100'),
    punkteListe([
      'Qualität: Wie belastbar ist das Fundament heute (Kapitalrendite, Margen, Schulden, Beständigkeit)?',
      'Wachstum: Wie stark und wie verlässlich wächst der Wert?',
      'Bewertung: Hoch heißt günstig im Vergleich zur eigenen Geschichte und zu ähnlichen Werten.',
      'Risiko: Hoch heißt riskant (Schwankung, Rückgänge, Schulden, Verwässerung).',
      'Datenvertrauen: Wie vollständig und aktuell sind die Daten hinter den Noten?',
      'Technik: Hoch heißt starker, intakter Aufwärtstrend.',
    ]),
    h('p', {}, 'Die Noten werden nicht zu einer Gesamtnote verrechnet. Die Größe eines Werts (Groß, Mittel, Klein) ist kein Qualitätsurteil.'),
    h('h3', {}, 'Status in den Ranglisten'),
    punkteListe([
      `${STATUS.einstieg}: Qualität, Bewertung und Kursbild passen gerade zusammen.`,
      `${STATUS.interessant}: guter Wert, aber kein frisches Einstiegssignal.`,
      `${STATUS.beobachten}: guter Wert, derzeit zu teuer oder im Abwärtstrend.`,
      `${STATUS.unattraktiv}: teuer und schwach zugleich.`,
    ]),
    h('p', {}, 'Ein Platz in den Top 10 heißt nicht „kaufen". Rang und Zeitpunkt sind zwei getrennte Aussagen.'),
    h('h3', {}, 'Urteil im Depot'),
    punkteListe([
      `${URTEIL.halten}: Die Gründe für den Wert gelten weiter.`,
      `${URTEIL.beobachten}: gemischtes Bild, genauer hinsehen.`,
      `${URTEIL.teilverkauf}: sehr teuer oder stark gelaufen, ein Teil des Gewinns lässt sich sichern.`,
      `${URTEIL.verkauf}: Fundament oder Trend sind gebrochen.`,
    ]),
    h('h3', {}, 'Trading'),
    punkteListe([
      'Jedes Setup zeigt Einstieg, Stop, Ziele und das Chance-Risiko-Verhältnis nach Kosten.',
      'Freigegeben wird ein Setup-Typ nur, wenn er in der Rückrechnung nach Kosten verdient hat.',
      'Intraday und Scalping rechnet die App live gegen die Kosten. Meist lautet das Ergebnis: kein Trade.',
    ])));

  root.append(h('p', { class: 'kasten k-neutral' },
    h('strong', {}, 'Keine Anlageberatung, keine automatischen Orders. '),
    (meta && meta.hinweis) || 'Die App informiert. Sie hat keinen Zugriff auf dein Geld und platziert keine Order. Entscheiden und handeln musst du selbst. Vergangene Ergebnisse sichern keine künftigen Gewinne zu.'));
}
