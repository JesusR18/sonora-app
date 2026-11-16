const SHELL = 'sonora-shell-v8';
const ART = 'sonora-art-v2';
const ART_LIMIT = 500;

// Archivos de la app que se guardan al instalar para que abra sin conexión.
// Si agregas o quitas un archivo en public/, actualiza esta lista (o vuelve a generarla).
const FILES = [
  // Página y manifiesto
  './',
  './index.html',
  './manifest.webmanifest',
  // Íconos
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  // Estilos
  './css/base/animations.css',
  './css/base/reset.css',
  './css/base/tokens.css',
  './css/components/blog-ui.css',
  './css/components/install-sheet.css',
  './css/components/kicker.css',
  './css/components/mini-player.css',
  './css/components/nav.css',
  './css/main.css',
  './css/responsive.css',
  './css/sections/artists.css',
  './css/sections/blog.css',
  './css/sections/catalog.css',
  './css/sections/community.css',
  './css/sections/discover.css',
  './css/sections/footer.css',
  './css/sections/hero.css',
  './css/sections/timeline.css',
  './css/sections/turntable.css',
  './css/themes/apple.css',
  './css/themes/oryzo.css',
  './css/themes/shop.css',
  // Módulos de JavaScript
  './js/blog/auth.js',
  './js/blog/community.js',
  './js/blog/editor.js',
  './js/blog/feed.js',
  './js/blog/poll.js',
  './js/blog/reader.js',
  './js/blog/reviews.js',
  './js/blog/util.js',
  './js/core/api.js',
  './js/core/covers.js',
  './js/core/dom.js',
  './js/core/store.js',
  './js/core/supa.js',
  './js/features/artists.js',
  './js/features/catalog.js',
  './js/features/crate.js',
  './js/features/deck.js',
  './js/features/discover.js',
  './js/features/hero.js',
  './js/features/player.js',
  './js/features/portraits.js',
  './js/features/selection.js',
  './js/features/timeline.js',
  './js/main.js',
  './js/pwa/install.js',
  './js/ui/events.js',
  './js/ui/menu.js',
  './js/ui/modal.js',
  './js/ui/nav.js',
  // Datos del catálogo
  './data/albums.json',
  './data/artists.json',
  './data/genres.json'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

// Borra todas las cachés anteriores, incluida la de portadas de Apple (sonora-covers-v1),
// que podía guardar respuestas fallidas sin poder distinguirlas.
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== SHELL && k !== ART).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function trim(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - ART_LIMIT; i++) await cache.delete(keys[i]);
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Página: red primero; sin conexión, la copia guardada
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(res => {
      if (res.ok) {
        const copy = res.clone();
        e.waitUntil(caches.open(SHELL).then(c => c.put('./index.html', copy)));
      }
      return res;
    }).catch(() => caches.match('./index.html')));
    return;
  }

  // API: el catálogo va red primero con copia para abrir sin conexión; lo demás (estadísticas,
  // favoritos) nunca se guarda. Los avances de audio (/audio/) usan rangos y pasan directo.
  if (url.origin === location.origin && url.pathname === '/api/catalog') {
    e.respondWith(fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); e.waitUntil(caches.open(SHELL).then(c => c.put(req, copy))); }
      return res;
    }).catch(() => caches.match(req).then(hit => hit || Response.error())));
    return;
  }
  if (url.origin === location.origin && (url.pathname.startsWith('/api/') || url.pathname.startsWith('/audio/'))) return;

  // Portadas propias (/art/): caché primero, y solo se guardan las que llegaron bien
  if (url.origin === location.origin && url.pathname.startsWith('/art/')) {
    e.respondWith(caches.open(ART).then(c => c.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok) c.put(req, res.clone()).then(() => trim(c)).catch(() => {});
      return res;
    }))));
    return;
  }

  // Fuentes de Google: caché primero si la respuesta fue válida
  if (url.hostname === 'fonts.gstatic.com' || url.hostname === 'fonts.googleapis.com') {
    e.respondWith(caches.open(SHELL).then(c => c.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok) c.put(req, res.clone()).catch(() => {});
      return res;
    }))));
    return;
  }

  // Archivos propios (estilos, módulos, datos, íconos): se entregan desde la caché al instante
  // y se actualizan en segundo plano, así un cambio publicado aparece en la siguiente visita.
  if (url.origin === location.origin) {
    e.respondWith(caches.open(SHELL).then(c => c.match(req).then(hit => {
      const fresh = fetch(req).then(res => {
        if (res.ok) c.put(req, res.clone()).catch(() => {});
        return res;
      });
      if (hit) { e.waitUntil(fresh.catch(() => {})); return hit; }
      return fresh;
    })));
  }
  // Portadas directas de Apple (respaldo) y audio pasan sin intercepción
});
