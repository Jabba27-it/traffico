// Service worker: tiene una copia del gioco sul telefono, così si gioca anche
// senza internet. Prima la rete (per avere sempre l'ultima versione), poi la
// copia salvata. VERSIONE la scrive la pubblicazione su GitHub Pages: a ogni
// versione nuova la copia sul telefono si rinnova tutta.

const VERSION = '__VERSIONE__';
const CACHE = `traffico-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // L'elenco dei file lo scrive la pubblicazione; in locale non c'è e i file si salvano man mano.
      try {
        const res = await fetch('precache.json', { cache: 'no-store' });
        if (res.ok) await cache.addAll(await res.json());
      } catch {
        // niente elenco: pazienza
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) if (name !== CACHE) await caches.delete(name);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        // "no-cache": il browser chiede sempre al sito se c'è una versione nuova
        // (se non è cambiato nulla la risposta è minima), invece di usare per
        // 10 minuti la sua copia: così una versione pubblicata si vede subito.
        const response = await fetch(request.url, { cache: 'no-cache' });
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch {
        // Senza rete: la copia salvata. La pagina con ?livello=... è la stessa pagina.
        return (await cache.match(request, { ignoreSearch: true })) ?? Response.error();
      }
    })(),
  );
});
