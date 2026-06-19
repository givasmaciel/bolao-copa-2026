/* Service Worker do Bolão Copa 2026 — cache básico para offline-first.
 *
 * Estratégia:
 * - HTML: network-first com fallback pro cache (para pegar updates rápido)
 * - Assets estáticos (CSS/JS/SVG/imagens): cache-first (raramente mudam)
 * - APIs/POST: nunca cachear
 *
 * Incrementar CACHE_NAME (v2, v3...) quando mudar assets pra forçar update.
 */

const CACHE_NAME = 'bolao-v2';
const STATIC_ASSETS = [
  '/',
  '/css/style.css',
  '/icon-192.svg',
  '/icon-512.svg',
  '/manifest.json'
];

self.addEventListener('install', function(event) {
  // pré-cacheia assets críticos na instalação
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(STATIC_ASSETS).catch(function() {
        // ignora erros de assets individuais (ex.: 404 em alguma rota)
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  // limpa caches antigos quando uma nova versão é ativada
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_NAME; })
            .map(function(k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(event) {
  const req = event.request;

  // Só intercepta GET
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Nunca cacheia APIs, admin, login ou POST
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/admin/') ||
    url.pathname.startsWith('/login') ||
    url.pathname.startsWith('/logout') ||
    url.pathname.startsWith('/cadastro') ||
    url.pathname.startsWith('/esqueci-senha')
  ) {
    return;
  }

  // Para o /jogos/db-info (diagnóstico), nunca cacheia
  if (url.pathname === '/jogos/db-info' || url.pathname === '/healthz') {
    return;
  }

  // Cache-first para assets estáticos (CSS/SVG/JS)
  if (
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.woff2')
  ) {
    event.respondWith(
      caches.match(req).then(function(cached) {
        return cached || fetch(req).then(function(res) {
          // só cacheia respostas válidas
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(function(c) { c.put(req, clone); });
          }
          return res;
        });
      })
    );
    return;
  }

  // Network-first para navegação (HTML): tenta rede, fallback pro cache
  if (req.mode === 'navigate' || req.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(req).then(function(res) {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(function(c) { c.put(req, clone); });
        }
        return res;
      }).catch(function() {
        return caches.match(req).then(function(cached) {
          return cached || caches.match('/');
        });
      })
    );
    return;
  }
});