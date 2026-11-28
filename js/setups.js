// Trading-Setups: Bewertung mit den gewählten Kosten und Darstellung als Karte.

import { bildStil } from './einfach.js';
import { h, eur, pct, zahl, datum } from './format.js';
import { kosten, hinUndZurueck, crvNetto, crvBrutto, crvMin, kryptoWeg, kostenText, ordergroesse } from './kosten.js';
import { plakette, punkteListe, raster, wertLink, preisEl, KLASSEN } from './bausteine.js';

// Rechnet Chance-Risiko mit den Kosten nach, die der Nutzer gewählt hat (Broker oder Fusion, eigene Sätze, Ordergröße).
export function bewerteSetup(s) {
  const e = s.einstieg || {};
  const einstieg = e.von != null && e.bis != null ? (e.von + e.bis) / 2 : e.von != null ? e.von : e.bis != null ? e.bis : null;
  const ziel = Array.isArray(s.ziele) && s.ziele.length ? s.ziele[0] : null;
  const k = kosten(s);
  const anteil = hinUndZurueck(k);
  const gerechnet = crvNetto(einstieg, s.stop, ziel, anteil);
  const netto = gerechnet != null ? gerechnet : typeof s.crv_netto === 'number' ? s.crv_netto : null;
  const bruttoG = crvBrutto(einstieg, s.stop, ziel);
  const brutto = bruttoG != null ? bruttoG : typeof s.crv_brutto === 'number' ? s.crv_brutto : null;
  const fusion = k.id === 'krypto_fusion' && kryptoWeg() === 'fusion';
  const basis = fusion && s.freigabe_fusion != null ? s.freigabe_fusion : s.freigabe;
  let freigabe = !!basis;
  let grund = '';
  if (!basis) {
    grund = (!fusion && s.hinweis) || 'Dieser Setup-Typ hat in der Rückrechnung für diese Anlageklasse nach Kosten nichts verdient.';
  } else if (netto != null && netto < crvMin()) {
    freigabe = false;
    grund = `Chance-Risiko nach Kosten ${zahl(netto, 1)}. Verlangt sind mindestens ${zahl(crvMin(), 1)}.`;
  }
  const risiko = einstieg && s.stop != null ? Math.abs(einstieg - s.stop) / einstieg : typeof s.risiko_pct === 'number' ? s.risiko_pct : null;
  return { einstieg, ziel, kosten: k, anteil, netto, brutto, freigabe, grund, fusion, risiko };
}

export function rueckFuer(s, typen, bew) {
  const typ = (typen || []).find((t) => t.id === s.typ);
  if (!typ || !typ.rueck) return { typ, rueck: null };
  const schluessel = bew.fusion ? 'krypto_fusion' : s.richtung === 'short' ? s.klasse + '_short' : s.klasse;
  return { typ, rueck: typ.rueck[schluessel] || null };
}

export function rueckText(r) {
  if (!r) return 'Für diese Anlageklasse gibt es keine Rückrechnung.';
  const teile = [];
  if (r.n != null) teile.push(`${zahl(r.n, 0)} Trades`);
  if (r.zeitraum) teile.push(r.zeitraum);
  if (r.treffer != null) teile.push(`Trefferquote ${pct(r.treffer, 0)}`);
  if (r.erw_pct != null) teile.push(`im Schnitt ${pct(r.erw_pct, 1, true)} je Trade nach Kosten`);
  if (r.erw_r != null) teile.push(`${zahl(r.erw_r, 2)} R`);
  if (r.pf != null) teile.push(`Gewinnfaktor ${zahl(r.pf, 1)}`);
  return teile.join(' · ');
}

// Sortierung: freigegebene zuerst, dann nach Chance-Risiko nach Kosten.
export function sortiereSetups(liste) {
  return (liste || [])
    .map((s) => ({ s, bew: bewerteSetup(s) }))
    .sort((a, b) => Number(b.bew.freigabe) - Number(a.bew.freigabe) || (b.bew.netto || 0) - (a.bew.netto || 0));
}

export function setupKarte(s, typen, { bew = bewerteSetup(s), kompakt = false, onRechner = null } = {}) {
  const { typ, rueck } = rueckFuer(s, typen, bew);
  const lang = s.richtung !== 'short';
  const e = s.einstieg || {};
  const zone = e.von != null && e.bis != null && e.von !== e.bis ? `${eur(e.von)} bis ${eur(e.bis)}` : eur(bew.einstieg);
  const ziele = (s.ziele || []).map((z) => eur(z)).join(' · ') || '–';
  const kopf = h('header', { class: 'setup-kopf' },
    h('div', {},
      h('h3', {}, s.pid ? wertLink(s, s.name || s.sym) : (s.name || s.sym || 'Wert'), ' ', h('span', { class: 'sym' }, s.sym || '')),
      h('p', { class: 'unterzeile' }, [typ ? typ.name : s.typ, KLASSEN[s.klasse], s.modus === 'swing' ? 'Swing' : s.modus].filter(Boolean).join(' · '))),
    h('div', { class: 'plaketten' },
      plakette(lang ? 'Long' : 'Short' + (s.instrument ? ' über ' + s.instrument : ''), lang ? 'gut' : 'schlecht', lang ? 'auf' : 'ab'),
      s.zustand === 'vorbereitung' ? plakette('In Vorbereitung', 'neutral', 'strich') : null,
      bew.freigabe ? plakette('Freigegeben', 'akzent', 'kreis') : plakette('Nicht freigegeben', 'neutral', 'strich')));
  const karte = h('article', { class: 'karte setup mit-bild' + (bew.freigabe ? '' : ' gedimmt'), style: bildStil(s) }, kopf);
  karte.append(raster([
    s.pid ? { name: 'Kurs jetzt', wert: preisEl(s, null, { zusatz: true }) } : null,
    { name: 'Einstieg', wert: zone },
    { name: 'Stop', wert: eur(s.stop), zusatz: bew.risiko != null ? pct(bew.risiko, 1) + ' Risiko' : '' },
    { name: 'Ziele', wert: ziele },
    { name: 'Chance-Risiko nach Kosten', wert: bew.netto != null ? zahl(bew.netto, 1) : '–', zusatz: bew.brutto != null ? 'ohne Kosten ' + zahl(bew.brutto, 1) : '' },
    { name: 'Kosten hin und zurück', wert: kostenText(bew.kosten, bew.anteil), zusatz: bew.kosten.name + ', bei ' + eur(ordergroesse()) + ' Einsatz' },
    { name: 'Gültig bis', wert: s.gueltig_bis ? datum(s.gueltig_bis) : '–' },
  ], 'raster-setup'));
  if (e.bedingung) karte.append(h('p', { class: 'bedingung' }, h('strong', {}, s.zustand === 'vorbereitung' ? 'Auslöser fehlt noch: ' : 'Bedingung: '), e.bedingung));
  if (!bew.freigabe && bew.grund) karte.append(h('p', { class: 'kasten k-neutral' }, bew.grund));
  if (!kompakt) {
    const b = punkteListe(s.begruendung);
    if (b) karte.append(h('h4', {}, 'Begründung'), b);
    karte.append(h('p', { class: 'rueck' }, h('strong', {}, 'Rückrechnung dieses Typs: '), rueckText(rueck)));
    if (onRechner) karte.append(h('div', { class: 'knoepfe' }, h('button', { type: 'button', onclick: () => onRechner(s, bew) }, 'In den Rechner übernehmen')));
  }
  return karte;
}
