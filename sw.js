/* =============================================================
   CONTROLE DE ESTOQUE — sw.js (Service Worker) — versão PHP
   App shell 100% offline (libs e fontes locais). Chamadas à API
   (/api/) e dados (/database/) NUNCA são cacheados — vão sempre
   à rede; offline, o app usa o IndexedDB (storage.js).
   ============================================================= */

const VERSION = "ce-php-v1.3.0";
const CACHE = `${VERSION}-app`;

const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/styles.css",
  "./js/utils.js",
  "./js/auth.js",
  "./js/api.js",
  "./js/storage.js",
  "./js/reports.js",
  "./js/app.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./vendor/bootstrap/bootstrap.min.css",
  "./vendor/bootstrap/bootstrap.bundle.min.js",
  "./vendor/bootstrap-icons/bootstrap-icons.min.css",
  "./vendor/bootstrap-icons/fonts/bootstrap-icons.woff2",
  "./vendor/bootstrap-icons/fonts/bootstrap-icons.woff",
  "./vendor/jspdf/jspdf.umd.min.js",
  "./vendor/jspdf/jspdf.plugin.autotable.min.js",
  "./vendor/fonts/fonts.css",
  "./vendor/fonts/barlow-semi-condensed-500-1.woff2",
  "./vendor/fonts/barlow-semi-condensed-600-1.woff2",
  "./vendor/fonts/barlow-semi-condensed-700-1.woff2",
  "./vendor/fonts/ibm-plex-mono-500-1.woff2",
  "./vendor/fonts/ibm-plex-mono-600-1.woff2",
  "./vendor/fonts/ibm-plex-sans-400-1.woff2",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // NUNCA cachear API/dados — sempre rede (offline cai no IndexedDB via app)
  if (url.pathname.includes("/api/") || url.pathname.includes("/database/")) {
    return; // deixa o navegador tratar normalmente
  }

  // navegação -> network-first com fallback ao index
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match("./index.html", { ignoreSearch: true }))
    );
    return;
  }

  // estáticos -> cache-first
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => cached);
    })
  );
});
