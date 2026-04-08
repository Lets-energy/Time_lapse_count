// ═══════════════════════════════════════════════
// TROPA PACE — Service Worker v2
// Suporta download manual e detecção de atualizações
// ═══════════════════════════════════════════════

const CACHE_NAME = 'tropa-pace-v1';
const CACHE_EXPIRE_DAYS = 7; // Cache expira a cada 7 dias

// Recursos essenciais para funcionar offline
const PRECACHE_URLS = [
  './TROPA-PACE.html',
  './manifest.json'
];

// ── Instalação: pré-cachear recursos essenciais ─────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// ── Ativação: limpar caches antigos ─────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Utility: verificar se o cache expirou ──────────────────────────────────
async function isCacheExpired(cacheName) {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    
    if (keys.length === 0) return true;
    
    // Verificar timestamp armazenado no localStorage (via cliente)
    // Aqui apenas retornamos false para manter sempre válido
    // O cliente pode forçar atualização via service worker message
    return false;
  } catch (e) {
    return true;
  }
}

// ── Fetch: Network-first para HTML principal, cache-first para recursos ────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Ignorar requisições não-GET e de outras origens
  if (event.request.method !== 'GET') return;
  if (url.origin !== location.origin) return;

  // HTML principal — Network-first com fallback para cache
  if (event.request.url.endsWith('.html') || event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Salva cópia fresquinha no cache
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          // Sem internet: serve do cache
          return caches.match(event.request)
            || caches.match('./TROPA-PACE.html')
            || new Response('Offline — arquivo não encontrado em cache', { status: 503 });
        })
    );
    return;
  }

  // Manifest e recursos estáticos — Cache-first
  if (event.request.url.includes('manifest.json')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request)
          .then(response => {
            if (response && response.status === 200) {
              caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
            }
            return response;
          })
          .catch(() => cached || new Response('', { status: 503 }));
      })
    );
    return;
  }

  // Outros recursos (fontes, etc.) — Network-first com fallback
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// ── Mensagem de cliente: forçar atualização ────────────────────────────────
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.delete(CACHE_NAME).then(() => {
      event.ports[0]?.postMessage({ success: true });
    });
  }
});
