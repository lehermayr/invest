// Anmeldung: Konto auf diesem Gerät einrichten, anmelden, Einladungscode erneuern.
// Solange niemand angemeldet ist, zeigt die App nur diese Ansicht.

import { h } from './format.js';
import { ladeRoh } from './daten.js';
import * as tresor from './tresor.js';

function feld(id, name, attrs, hilfe) {
  return h('div', { class: 'feld' },
    h('label', { for: id }, name),
    h('input', { id, name: id, ...attrs }),
    hilfe ? h('small', {}, hilfe) : null);
}

// Block „Konto" für die Einstellungen: wer angemeldet ist, abmelden, Passwort ändern, Konto löschen.
export function kontoBlock() {
  const wer = tresor.angemeldet();
  if (!wer) return null;
  const meldung = h('p', { class: 'meldung', role: 'status' });
  const sag = (text, gut = true) => {
    meldung.textContent = text;
    meldung.className = 'meldung ' + (gut ? 'gut' : 'schlecht');
  };
  const pwForm = h('form', { class: 'anmeldeform', novalidate: true, hidden: true },
    feld('k-alt', 'Bisheriges Passwort', { type: 'password', autocomplete: 'current-password' }),
    feld('k-neu', 'Neues Passwort', { type: 'password', autocomplete: 'new-password' }, 'Mindestens 8 Zeichen.'),
    feld('k-neu2', 'Neues Passwort wiederholen', { type: 'password', autocomplete: 'new-password' }),
    h('div', { class: 'knoepfe' }, h('button', { type: 'submit', class: 'haupt' }, 'Passwort ändern')));
  pwForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const w = (id) => pwForm.querySelector('#' + id).value;
    if (w('k-neu') !== w('k-neu2')) return sag('Die beiden neuen Passwörter sind nicht gleich.', false);
    try {
      await tresor.aenderePasswort({ alt: w('k-alt'), neu: w('k-neu') });
      pwForm.reset();
      pwForm.hidden = true;
      sag('Passwort geändert.');
    } catch (e) {
      sag(e.message || 'Das hat nicht geklappt.', false);
    }
  });
  const loeschFrage = h('p', { class: 'frage', hidden: true }, 'Konto und Depot wirklich von diesem Gerät löschen?',
    h('button', { type: 'button', class: 'gefahr', onclick: () => { tresor.loescheKonto(); location.reload(); } }, 'Ja, löschen'),
    h('button', { type: 'button', class: 'leicht', onclick: () => { loeschFrage.hidden = true; } }, 'Nein'));
  return h('div', {},
    h('p', {}, 'Angemeldet als ', h('strong', {}, wer.name), '. Dein Depot, deine Merkliste und deine Einstellungen sind mit deinem Passwort verschlüsselt und nur auf diesem Gerät gespeichert.'),
    h('div', { class: 'knoepfe' },
      h('button', { type: 'button', class: 'haupt', onclick: () => { tresor.abmelden(); location.reload(); } }, 'Abmelden'),
      h('button', { type: 'button', class: 'leicht', onclick: () => { pwForm.hidden = !pwForm.hidden; } }, 'Passwort ändern'),
      h('button', { type: 'button', class: 'leicht', onclick: () => { loeschFrage.hidden = false; } }, 'Konto löschen')),
    pwForm, loeschFrage, meldung,
    h('p', { class: 'leise' }, 'Weitere Personen legen mit dem Einladungscode ein eigenes Konto an: abmelden, dann „Neues Konto anlegen". Auf einem anderen Gerät öffnen sie einfach die Adresse der App. Niemand sieht das Depot eines anderen.'));
}

// modus: 'anmelden', 'einrichten' oder 'code' (neuer Einladungscode für ein bestehendes Konto)
export function zeigeAnmeldung(ziel, { info, beiErfolg, modus }) {
  let art = modus || (tresor.hatKonten() ? 'anmelden' : 'einrichten');
  const meldung = h('p', { class: 'meldung', role: 'alert' });
  const sag = (text, gut = false) => {
    meldung.textContent = text;
    meldung.className = 'meldung ' + (gut ? 'gut' : 'schlecht');
  };

  function zeichne() {
    meldung.textContent = '';
    const karte = h('section', { class: 'karte anmeldung' });
    if (!tresor.verfuegbar()) {
      karte.append(h('h1', {}, 'Dieser Browser ist zu alt'),
        h('p', {}, 'Die App braucht einen aktuellen Browser (Chrome, Edge, Firefox oder Safari ab 2023) und eine https-Adresse, damit sie die Daten entschlüsseln kann.'));
      ziel.replaceChildren(karte);
      return;
    }
    const bleiben = h('input', { type: 'checkbox', id: 'an-bleiben', checked: true });
    const bleibenZeile = h('label', { class: 'haken', for: 'an-bleiben' }, bleiben, h('span', {}, 'Auf diesem Gerät angemeldet bleiben'));
    const knopf = h('button', { type: 'submit', class: 'haupt' });
    const sperre = (an, text) => {
      knopf.disabled = an;
      knopf.textContent = an ? 'Einen Moment …' : text;
    };

    if (art === 'einrichten') {
      const alt = !tresor.hatKonten() ? tresor.altesDepot() : null;
      const form = h('form', { class: 'anmeldeform', autocomplete: 'on', novalidate: true },
        feld('an-code', 'Einladungscode', { type: 'text', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', placeholder: 'XXXX-XXXX-XXXX-XXXX-XXXX', required: true },
          'Den Code bekommst du vom Besitzer dieser App. Du brauchst ihn nur einmal je Gerät.'),
        feld('an-name', 'Benutzername', { type: 'text', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', required: true }, 'Frei wählbar, 2 bis 30 Zeichen.'),
        feld('an-pw', 'Passwort', { type: 'password', autocomplete: 'new-password', required: true }, 'Mindestens 8 Zeichen. Nur du kennst es, es wird nirgends hochgeladen.'),
        feld('an-pw2', 'Passwort wiederholen', { type: 'password', autocomplete: 'new-password', required: true }),
        bleibenZeile, meldung, h('div', { class: 'knoepfe' }, knopf));
      sperre(false, 'Konto anlegen');
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const w = (id) => form.querySelector('#' + id).value;
        if (w('an-pw') !== w('an-pw2')) return sag('Die beiden Passwörter sind nicht gleich.');
        sperre(true);
        try {
          const pruefDatei = await ladeRoh('pruef.enc');
          const r = await tresor.einrichten({ code: w('an-code'), name: w('an-name'), passwort: w('an-pw'), bleiben: bleiben.checked, info, pruefDatei });
          beiErfolg(r);
        } catch (e) {
          sag(e.message || 'Das hat nicht geklappt.');
          sperre(false, 'Konto anlegen');
        }
      });
      // append() würde aus null den Text „null" machen, deshalb leere Einträge vorher aussortieren
      karte.append(...[h('h1', {}, 'Zugang einrichten'),
        h('p', {}, 'Lege dein eigenes Konto für dieses Gerät an. Dein Depot wird mit deinem Passwort verschlüsselt und ist für andere nicht lesbar.'),
        alt && alt.depot.length ? h('p', { class: 'kasten k-neutral' }, `Das bisher auf diesem Gerät gespeicherte Depot (${alt.depot.length} ${alt.depot.length === 1 ? 'Position' : 'Positionen'}) wird in dein Konto übernommen.`) : null,
        form,
        h('p', { class: 'kasten k-warn' }, h('strong', {}, 'Passwort gut merken. '), 'Es gibt keine Funktion „Passwort vergessen". Ohne Passwort ist das Depot auf diesem Gerät verloren. Lege deshalb unter Einstellungen ab und zu eine Sicherung an.'),
        tresor.hatKonten() ? h('p', {}, h('button', { type: 'button', class: 'leicht', onclick: () => { art = 'anmelden'; zeichne(); } }, 'Ich habe schon ein Konto auf diesem Gerät')) : null].filter(Boolean));
    } else if (art === 'code') {
      const wer = tresor.angemeldet();
      const form = h('form', { class: 'anmeldeform', novalidate: true },
        feld('an-code', 'Neuer Einladungscode', { type: 'text', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', placeholder: 'XXXX-XXXX-XXXX-XXXX-XXXX', required: true }),
        feld('an-pw', 'Dein Passwort', { type: 'password', autocomplete: 'current-password', required: true }),
        meldung, h('div', { class: 'knoepfe' }, knopf,
          h('button', { type: 'button', class: 'leicht', onclick: () => { tresor.abmelden(); location.reload(); } }, 'Abmelden')));
      sperre(false, 'Code übernehmen');
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        sperre(true);
        try {
          const pruefDatei = await ladeRoh('pruef.enc');
          await tresor.erneuereCode({ code: form.querySelector('#an-code').value, passwort: form.querySelector('#an-pw').value, info, pruefDatei });
          beiErfolg({});
        } catch (e) {
          sag(e.message || 'Das hat nicht geklappt.');
          sperre(false, 'Code übernehmen');
        }
      });
      karte.append(h('h1', {}, 'Neuer Einladungscode nötig'),
        h('p', {}, `Hallo ${wer ? wer.name : ''}. Der Besitzer der App hat den Einladungscode erneuert. Gib den neuen Code ein, dein Depot bleibt erhalten.`),
        form);
    } else {
      const form = h('form', { class: 'anmeldeform', autocomplete: 'on', novalidate: true },
        feld('an-name', 'Benutzername', { type: 'text', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', required: true }),
        feld('an-pw', 'Passwort', { type: 'password', autocomplete: 'current-password', required: true }),
        bleibenZeile, meldung, h('div', { class: 'knoepfe' }, knopf));
      sperre(false, 'Anmelden');
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        sperre(true);
        try {
          await tresor.anmelden({ name: form.querySelector('#an-name').value, passwort: form.querySelector('#an-pw').value, bleiben: bleiben.checked });
          beiErfolg({});
        } catch (e) {
          sag(e.message || 'Das hat nicht geklappt.');
          sperre(false, 'Anmelden');
        }
      });
      karte.append(h('h1', {}, 'Anmelden'),
        h('p', {}, 'Melde dich mit dem Konto an, das du auf diesem Gerät angelegt hast.'),
        form,
        h('details', { class: 'klappe' }, h('summary', {}, 'Neu hier oder Passwort vergessen?'),
          h('p', {}, 'Neu auf diesem Gerät: Lege mit dem Einladungscode ein eigenes Konto an. Dein Depot ist von den anderen Konten getrennt.'),
          h('p', {}, 'Passwort vergessen: Ein vergessenes Passwort lässt sich nicht zurückholen. Du kannst ein neues Konto mit anderem Benutzernamen anlegen und eine frühere Sicherung einlesen.'),
          h('p', {}, h('button', { type: 'button', class: 'leicht', onclick: () => { art = 'einrichten'; zeichne(); } }, 'Neues Konto anlegen'))));
    }
    karte.append(h('p', { class: 'leise' }, 'Privates Werkzeug. Keine Anlageberatung, keine automatischen Orders.'));
    ziel.replaceChildren(karte);
    const erstes = karte.querySelector('input');
    if (erstes) erstes.focus();
  }

  zeichne();
}
