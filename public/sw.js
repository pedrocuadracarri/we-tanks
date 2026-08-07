// Service worker de We Tanks. El juego es un unico bundle sin assets externos,
// asi que cachearlo entero es trivial y da partida sin conexion.
const CACHE = "wetanks-v2";
const INDEX = new URL("./", self.registration.scope).href;

/**
 * En install se lee el index y se cachean los recursos que enlaza. Sin esto
 * habria que visitar la pagina dos veces para poder jugar sin conexion: los
 * ficheros de la primera carga no pasan por el worker.
 */
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        const res = await fetch(INDEX, { cache: "reload" });
        await cache.put(INDEX, res.clone());
        const html = await res.text();
        const urls = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
          .map((m) => new URL(m[1], INDEX).href)
          .filter((u) => u.startsWith(INDEX));
        urls.push(new URL("logo.png", INDEX).href); // lo carga Phaser, no el HTML
        await Promise.allSettled([...new Set(urls)].map((u) => cache.add(u)));
      } catch {
        /* sin red al instalar: ya se cacheara al vuelo */
      }
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;

  // el HTML, de la red primero: asi se recoge una version nueva del juego
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          (await caches.open(CACHE)).put(INDEX, res.clone());
          return res;
        } catch {
          return (await caches.match(INDEX)) || Response.error();
        }
      })()
    );
    return;
  }

  // el resto lleva hash en el nombre: cache primero y listo
  event.respondWith(
    (async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
      return res;
    })()
  );
});
