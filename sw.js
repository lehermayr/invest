// Offline-Stand: Netz zuerst, sonst der zuletzt geladene Stand aus dem Zwischenspeicher.
// Gilt für die App-Hülle und die Daten der Analyse. Abrufe bei Bitpanda und Binance laufen am Service Worker vorbei.

const VERSION = 'investment-analyst-v5';
const HUELLE = [
  './', 'index.html', 'app.css', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/logo-96.png',
  'js/main.js', 'js/format.js', 'js/daten.js', 'js/speicher.js', 'js/live.js', 'js/kosten.js', 'js/kennzahlen.js', 'js/chart.js',
  'js/tresor.js', 'js/ansicht-anmeldung.js', 'js/einfach.js',
  'js/bausteine.js', 'js/beobachtung.js', 'js/setups.js',
  'js/ansicht-heute.js', 'js/ansicht-scanner.js', 'js/ansicht-wert.js', 'js/ansicht-depot.js', 'js/ansicht-trading.js',
  'js/ansicht-strategien.js', 'js/ansicht-einstellungen.js',
];
const FRIST_MS = 6000;

self.addEventListener('install', (ev) => {
  ev.waitUntil(caches.open(VERSION).then((c) => c.addAll(HUELLE)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(
    caches.keys()
      .then((namen) => Promise.all(namen.filter((n) => n !== VERSION).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (ev) => {
  const anfrage = ev.request;
  if (anfrage.method !== 'GET') return;
  if (new URL(anfrage.url).origin !== self.location.origin) return;
  ev.respondWith(netzZuerst(anfrage));
});

async function netzZuerst(anfrage) {
  const cache = await caches.open(VERSION);
  const ausCache = () => cache.match(anfrage, { ignoreSearch: anfrage.mode === 'navigate' });
  const ausNetz = fetch(anfrage).then((antwort) => {
    if (antwort && antwort.ok) cache.put(anfrage, antwort.clone()).catch(() => {});
    return antwort;
  });
  // Ist das Netz langsam, kommt nach der Frist der gespeicherte Stand. Das Netz füllt den Speicher trotzdem nach.
  const frist = new Promise((fertig) => setTimeout(fertig, FRIST_MS, null));
  try {
    const erste = await Promise.race([ausNetz, frist]);
    if (erste) return erste;
    const alt = await ausCache();
    return alt || (await ausNetz);
  } catch (e) {
    const alt = await ausCache();
    if (alt) return alt;
    throw e;
  }
}
