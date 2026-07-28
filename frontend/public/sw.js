/**
 * Service Worker — stratégie réseau-d'abord avec fallback cache.
 * Inclut les routes du module IA dans le shell applicatif.
 */
const CACHE_NAME = "palmeraie-v2";
const SHELL_URLS = [
  "/",
  "/index.html",
  "/dashboard",
  "/recoltes",
  "/travaux",
  "/secteurs",
  "/recolteurs",
  "/materiels",
  "/ia",
  "/ia/predictions",
  "/ia/anomalies",
  "/ia/modeles",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Requêtes API : réseau uniquement (pas de cache)
  if (request.url.includes("/api/")) {
    event.respondWith(fetch(request).catch(() => new Response(
      JSON.stringify({ detail: "Hors ligne — données indisponibles." }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    )));
    return;
  }

  // Navigation (HTML) : réseau d'abord, sinon index.html en cache
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match("/index.html").then((r) => r || caches.match("/"))
      )
    );
    return;
  }

  // Assets statiques : cache-first
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((res) => {
      // Mettre en cache les nouvelles ressources statiques
      if (res.ok && (request.url.endsWith(".js") || request.url.endsWith(".css"))) {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(request, clone));
      }
      return res;
    }))
  );
});
