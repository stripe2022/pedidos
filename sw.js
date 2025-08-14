// ==== Config ====
const CACHE_NAME = 'pedidos-a4-v3';

// Detecta el path base según el scope con el que se registró el SW
// Si lo registras con { scope: '/pedidos/' }, BASE será '/pedidos/'
const BASE = new URL(self.registration.scope).pathname;

// Archivos de tu app dentro del scope
const ASSETS = [
  `${BASE}`,
  `${BASE}index.html`,
  `${BASE}manifest.json`,
  `${BASE}icons/icon-192.png`,
  `${BASE}icons/icon-512.png`,
  // Ajusta estos nombres si tus archivos reales son otros
  `${BASE}styles.css`
  
];

// ==== Actualización bajo demanda (desde la página) ====
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ==== Install: precache ====
self.addEventListener('install', (event) => {
  // Instalación rápida: precache y queda listo
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// ==== Activate: limpia caches viejas y toma control ====
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ==== Fetch: cache-first para assets del scope, network-first para lo demás ====
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Solo manejamos peticiones del mismo origen y dentro del scope
  const isSameOrigin = url.origin === self.location.origin;
  const inScope = url.pathname.startsWith(BASE);
  if (!isSameOrigin || !inScope) return;

  // Navegación (SPA / HTML) → devolver index.html desde caché si falla la red
  const isNavigation =
    req.mode === 'navigate' ||
    (req.method === 'GET' &&
      req.headers.get('accept') &&
      req.headers.get('accept').includes('text/html'));

  if (isNavigation) {
    event.respondWith(
      fetch(req).catch(() => caches.match(`${BASE}index.html`))
    );
    return;
  }

  // Solo gestionamos métodos GET
  if (req.method !== 'GET') return;

  // Para assets del scope: estrategia cache-first con actualización en segundo plano
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchAndUpdate = fetch(req)
        .then((res) => {
          // Evita cachear respuestas no válidas
          if (!res || res.status !== 200 || res.type === 'opaque') return res;
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => cached); // si la red falla, usa lo que haya en caché

      // Si hay caché, responde al instante y refresca en BG; si no, espera a la red
      return cached || fetchAndUpdate;
    })
  );
});
