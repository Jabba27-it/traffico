// Service worker: tiene una copia del gioco sul telefono, così si gioca anche
// senza internet. Prima la rete (per avere sempre l'ultima versione), poi la
// copia salvata. VERSIONE la scrive la pubblicazione su GitHub Pages: a ogni
// versione nuova la copia sul telefono si rinnova tutta.

const VERSION = '__VERSIONE__';
const CACHE = `traffico-${VERSION}`;
// In locale (server.py) la versione non c'è: niente elenco, i file si salvano man mano.
const PUBLISHED = !VERSION.startsWith('__');
// Con una rete lenta o che non risponde (Wi-Fi senza internet, una sola tacca)
// dopo questo tempo si usa la copia salvata invece di aspettare per sempre.
const NETWORK_WAIT = 3000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      if (PUBLISHED) {
        // La copia nuova deve essere completa: se anche un solo file non arriva
        // l'installazione fallisce, resta la versione di prima con la sua copia
        // intera e il telefono riprova alla prossima apertura. Prima un errore
        // veniva ignorato e la versione nuova, con la copia vuota o a metà,
        // cancellava quella vecchia: senza rete il gioco non partiva.
        try {
          const res = await fetch('precache.json', { cache: 'no-store' });
          if (!res.ok) throw new Error(`precache.json: ${res.status}`);
          const cache = await caches.open(CACHE);
          await Promise.all((await res.json()).map((file) => saveFile(cache, file)));
        } catch (error) {
          await caches.delete(CACHE);
          throw error;
        }
      }
      await self.skipWaiting();
    })(),
  );
});

/**
 * Scarica un file dal sito (non dalla copia del browser, che può essere di una
 * versione vecchia) e lo salva; tre tentativi.
 * @param {Cache} cache
 * @param {string} file
 */
async function saveFile(cache, file) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(file, { cache: 'reload' });
      if (!res.ok) throw new Error(`${file}: ${res.status}`);
      return await cache.put(file, res);
    } catch (error) {
      if (attempt === 3) throw error;
    }
  }
}

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
  // "no-cache": il browser chiede sempre al sito se c'è una versione nuova
  // (se non è cambiato nulla la risposta è minima), invece di usare per
  // 10 minuti la sua copia: così una versione pubblicata si vede subito.
  const network = fetch(request.url, { cache: 'no-cache' }).then(async (response) => {
    if (response.ok) await (await caches.open(CACHE)).put(request, response.clone());
    return response;
  });
  // anche se si risponde con la copia, la risposta della rete aggiorna la copia
  event.waitUntil(network.catch(() => {}));
  event.respondWith(answer(request, network));
});

/**
 * La risposta della rete se arriva in tempo, se no la copia salvata; senza
 * copia si aspetta comunque la rete.
 * @param {Request} request
 * @param {Promise<Response>} network
 */
async function answer(request, network) {
  const first = await Promise.race([
    network.catch(() => null),
    new Promise((resolve) => setTimeout(() => resolve(null), NETWORK_WAIT)),
  ]);
  if (first?.ok) return first;
  return (await saved(request)) ?? first ?? (await network.catch(() => Response.error()));
}

/**
 * La copia salvata. La pagina con ?livello=... è la stessa pagina, e ogni
 * indirizzo del gioco aperto senza rete (anche senza la barra finale) apre la pagina.
 * @param {Request} request
 */
async function saved(request) {
  const cache = await caches.open(CACHE);
  return (
    (await cache.match(request, { ignoreSearch: true })) ??
    (request.mode === 'navigate' ? await cache.match('./') : undefined)
  );
}
