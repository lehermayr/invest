// Zugang und Verschlüsselung im Browser.
//
// So ist es aufgebaut:
// - Die Analyse-Daten liegen verschlüsselt im Netz. Der Datenschlüssel entsteht aus dem Einladungscode.
// - Jede Person legt auf ihrem Gerät ein Konto mit eigenem Benutzernamen und Passwort an. Aus dem Passwort entstehen
//   zwei Schlüssel: einer verpackt den Datenschlüssel, der andere verschlüsselt das eigene Depot.
// - Passwörter werden nirgends gespeichert und nirgends hochgeladen. Gespeichert wird nur Verschlüsseltes (localStorage).
// - Wer „angemeldet bleiben" wählt, lässt die Schlüssel auf dem Gerät liegen, bis er sich abmeldet.

const KONTEN = 'ia-konten-v1';
const NUTZER = 'ia-nutzer-v1-';
const SITZUNG = 'ia-sitzung-v1';
const ALT = 'investment-analyst-v1';        // unverschlüsselter Speicher aus der Zeit vor der Anmeldung
const RUNDEN_PASSWORT = 400000;

let aktiv = null;       // { id, name, dk: CryptoKey (Daten), pk: CryptoKey (persönlich) }

function b64(bytes) {
  const b = new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192));   // in Stücken, sonst zu viele Argumente
  return btoa(s);
}
const von64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
const text = (s) => new TextEncoder().encode(s);

export function verfuegbar() {
  return !!(globalThis.crypto && crypto.subtle && typeof DecompressionStream === 'function');
}

function lies(speicher, schluessel) {
  try {
    const roh = speicher.getItem(schluessel);
    return roh ? JSON.parse(roh) : null;
  } catch (e) {
    return null;
  }
}

function schreib(speicher, schluessel, wert) {
  try {
    speicher.setItem(schluessel, JSON.stringify(wert));
    return true;
  } catch (e) {
    return false;
  }
}

function entferne(speicher, schluessel) {
  try {
    speicher.removeItem(schluessel);
  } catch (e) {
    /* nichts zu tun */
  }
}

const kontoId = (name) => String(name || '').trim().toLowerCase();
const codeNormal = (code) => String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

async function pbkdf2(geheim, salz, runden, bits) {
  const basis = await crypto.subtle.importKey('raw', text(geheim), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salz, iterations: runden }, basis, bits));
}

const aes = (roh) => crypto.subtle.importKey('raw', roh, 'AES-GCM', false, ['encrypt', 'decrypt']);

async function verpacke(schluessel, bytes) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, schluessel, bytes);
  return { iv: b64(iv), ct: b64(ct) };
}

async function entpacke(schluessel, paket) {
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: von64(paket.iv) }, schluessel, von64(paket.ct)));
}

// Datendatei der Analyse: 12 Byte Nonce, dann AES-GCM über gzip-gepacktes JSON.
async function oeffneDatei(schluessel, puffer) {
  const bytes = new Uint8Array(puffer);
  const gepackt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, schluessel, bytes.slice(12));
  const strom = new Blob([gepackt]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(strom).text());
}

export async function entschluessleDaten(puffer) {
  if (!aktiv) throw new Error('nicht angemeldet');
  return oeffneDatei(aktiv.dk, puffer);
}

async function schluesselAusPasswort(passwort, salz, runden) {
  const bits = await pbkdf2(passwort, salz, runden, 512);
  return { kek: await aes(bits.slice(0, 32)), pkRoh: bits.slice(32) };
}

async function datenschluesselAusCode(code, info) {
  const salz = von64(info.salz);
  return pbkdf2(codeNormal(code), salz, info.runden, 256);
}

export const angemeldet = () => (aktiv ? { id: aktiv.id, name: aktiv.name } : null);
export const hatKonten = () => Object.keys(lies(localStorage, KONTEN) || {}).length > 0;

// Altes, unverschlüsseltes Depot von diesem Gerät (aus der Zeit vor der Anmeldung), falls vorhanden.
export function altesDepot() {
  const alt = lies(localStorage, ALT);
  return alt && Array.isArray(alt.depot) ? alt : null;
}

async function starteSitzung(id, name, dkRoh, pkRoh, bleiben) {
  aktiv = { id, name, dk: await aes(dkRoh), pk: await aes(pkRoh) };
  const paket = { id, name, dk: b64(dkRoh), pk: b64(pkRoh) };
  entferne(localStorage, SITZUNG);
  entferne(sessionStorage, SITZUNG);
  schreib(bleiben ? localStorage : sessionStorage, SITZUNG, paket);
}

// Beim Öffnen der App: eine gespeicherte Sitzung fortsetzen. Rückgabe: true, wenn jemand angemeldet ist.
export async function setzeSitzungFort() {
  const s = lies(sessionStorage, SITZUNG) || lies(localStorage, SITZUNG);
  if (!s || !s.dk || !s.pk) return false;
  try {
    aktiv = { id: s.id, name: s.name, dk: await aes(von64(s.dk)), pk: await aes(von64(s.pk)) };
    return true;
  } catch (e) {
    aktiv = null;
    return false;
  }
}

export function abmelden() {
  aktiv = null;
  entferne(localStorage, SITZUNG);
  entferne(sessionStorage, SITZUNG);
}

// Neues Konto auf diesem Gerät. pruefDatei: Inhalt von pruef.enc, damit der Einladungscode geprüft werden kann.
export async function einrichten({ code, name, passwort, bleiben, info, pruefDatei }) {
  const id = kontoId(name);
  if (id.length < 2 || id.length > 30) throw new Error('Der Benutzername braucht 2 bis 30 Zeichen.');
  if (String(passwort || '').length < 8) throw new Error('Das Passwort braucht mindestens 8 Zeichen.');
  const konten = lies(localStorage, KONTEN) || {};
  if (konten[id]) throw new Error('Diesen Benutzernamen gibt es auf diesem Gerät schon. Melde dich an oder wähle einen anderen Namen.');
  const dkRoh = await datenschluesselAusCode(code, info);
  try {
    await oeffneDatei(await aes(dkRoh), pruefDatei);
  } catch (e) {
    throw new Error('Der Einladungscode stimmt nicht.');
  }
  const salz = crypto.getRandomValues(new Uint8Array(16));
  const { kek, pkRoh } = await schluesselAusPasswort(passwort, salz, RUNDEN_PASSWORT);
  const erstes = Object.keys(konten).length === 0;
  konten[id] = { name: String(name).trim(), salz: b64(salz), runden: RUNDEN_PASSWORT, dk: await verpacke(kek, dkRoh), erstellt: new Date().toISOString() };
  if (!schreib(localStorage, KONTEN, konten)) throw new Error('Dieser Browser erlaubt kein Speichern (privates Fenster?). Das Konto kann hier nicht angelegt werden.');
  await starteSitzung(id, konten[id].name, dkRoh, pkRoh, bleiben);
  // Das erste Konto auf einem Gerät übernimmt das Depot, das vorher offen auf diesem Gerät lag.
  let uebernommen = null;
  if (erstes) {
    uebernommen = altesDepot();
    if (uebernommen) await schreibeNutzerdaten(uebernommen);
  }
  entferne(localStorage, ALT);
  return { uebernommen: uebernommen ? uebernommen.depot.length : 0 };
}

export async function anmelden({ name, passwort, bleiben }) {
  const id = kontoId(name);
  const konto = (lies(localStorage, KONTEN) || {})[id];
  const falsch = new Error('Benutzername oder Passwort stimmt nicht.');
  if (!konto) {
    await pbkdf2(String(passwort || ''), new Uint8Array(16), RUNDEN_PASSWORT, 256);     // gleiche Wartezeit wie bei einem echten Konto
    throw falsch;
  }
  const { kek, pkRoh } = await schluesselAusPasswort(passwort, von64(konto.salz), konto.runden);
  let dkRoh;
  try {
    dkRoh = await entpacke(kek, konto.dk);
  } catch (e) {
    throw falsch;
  }
  await starteSitzung(id, konto.name, dkRoh, pkRoh, bleiben);
}

// Der Besitzer hat einen neuen Einladungscode vergeben: Konto behalten, nur den Datenschlüssel erneuern.
export async function erneuereCode({ code, passwort, info, pruefDatei }) {
  if (!aktiv) throw new Error('Bitte zuerst anmelden.');
  const konten = lies(localStorage, KONTEN) || {};
  const konto = konten[aktiv.id];
  if (!konto) throw new Error('Das Konto wurde auf diesem Gerät nicht gefunden.');
  const { kek, pkRoh } = await schluesselAusPasswort(passwort, von64(konto.salz), konto.runden);
  try {
    await entpacke(kek, konto.dk);
  } catch (e) {
    throw new Error('Das Passwort stimmt nicht.');
  }
  const dkRoh = await datenschluesselAusCode(code, info);
  try {
    await oeffneDatei(await aes(dkRoh), pruefDatei);
  } catch (e) {
    throw new Error('Der Einladungscode stimmt nicht.');
  }
  konto.dk = await verpacke(kek, dkRoh);
  schreib(localStorage, KONTEN, konten);
  const bleiben = !!lies(localStorage, SITZUNG);
  await starteSitzung(aktiv.id, aktiv.name, dkRoh, pkRoh, bleiben);
}

export async function aenderePasswort({ alt, neu }) {
  if (!aktiv) throw new Error('Bitte zuerst anmelden.');
  if (String(neu || '').length < 8) throw new Error('Das neue Passwort braucht mindestens 8 Zeichen.');
  const konten = lies(localStorage, KONTEN) || {};
  const konto = konten[aktiv.id];
  const alte = await schluesselAusPasswort(alt, von64(konto.salz), konto.runden);
  let dkRoh;
  try {
    dkRoh = await entpacke(alte.kek, konto.dk);
  } catch (e) {
    throw new Error('Das bisherige Passwort stimmt nicht.');
  }
  const daten = await ladeNutzerdaten();
  const salz = crypto.getRandomValues(new Uint8Array(16));
  const neue = await schluesselAusPasswort(neu, salz, RUNDEN_PASSWORT);
  konten[aktiv.id] = { ...konto, salz: b64(salz), runden: RUNDEN_PASSWORT, dk: await verpacke(neue.kek, dkRoh) };
  const bleiben = !!lies(localStorage, SITZUNG);
  await starteSitzung(aktiv.id, aktiv.name, dkRoh, neue.pkRoh, bleiben);
  if (daten) await schreibeNutzerdaten(daten);
  schreib(localStorage, KONTEN, konten);
}

// Löscht das angemeldete Konto samt Depot von diesem Gerät.
export function loescheKonto() {
  if (!aktiv) return;
  const konten = lies(localStorage, KONTEN) || {};
  delete konten[aktiv.id];
  schreib(localStorage, KONTEN, konten);
  entferne(localStorage, NUTZER + aktiv.id);
  abmelden();
}

// Persönliche Daten (Depot, Merkliste, Einstellungen): nur mit dem eigenen Passwort lesbar.
export async function ladeNutzerdaten() {
  if (!aktiv) return null;
  const paket = lies(localStorage, NUTZER + aktiv.id);
  if (!paket) return null;
  try {
    return JSON.parse(new TextDecoder().decode(await entpacke(aktiv.pk, paket)));
  } catch (e) {
    return null;
  }
}

export async function schreibeNutzerdaten(daten) {
  if (!aktiv) return false;
  return schreib(localStorage, NUTZER + aktiv.id, await verpacke(aktiv.pk, text(JSON.stringify(daten))));
}
