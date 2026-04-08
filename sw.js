// ═══════════════════════════════════════════════
// TROPA PACE — Service Worker v3
// Com suporte a atualização automática
// ═══════════════════════════════════════════════

const CACHE_NAME = 'tropa-pace-v2'; // Incrementar versão para forçar limpeza
const CACHE_EXPIRE_DAYS = 7; // Cache expira a cada 7 dias

// Recursos essenciais para funcionar offline
const PRECACHE_URLS = [
  './index.html',
  './manifest.json'
];

// ── Instalação: pré-cachear recursos essenciais ─────────────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Instalando Service Worker...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Cacheando recursos essenciais');
        return cache.addAll(PRECACHE_URLS);
      })
      .then(() => {
        console.log('[SW] Recursos cacheados com sucesso');
        self.skipWaiting(); // Forçar ativação imediata
      })
  );
});

// ── Ativação: limpar caches antigos ─────────────────────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Ativando Service Worker...');
  event.waitUntil(
    caches.keys().then(keys => {
      console.log('[SW] Caches encontrados:', keys);
      return Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] Removendo cache antigo:', key);
            return caches.delete(key);
          })
      );
    }).then(() => {
      console.log('[SW] Todos os caches antigos foram removidos');
      self.clients.claim(); // Assumir controle de todos os clientes
    })
  );
});

// ── Fetch: Network-first para HTML principal, cache-first para recursos ────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Ignorar requisições não-GET e de outras origens
  if (event.request.method !== 'GET') return;
  if (url.origin !== location.origin) return;

  // HTML principal e manifest — Network-first com fallback para cache
  if (event.request.url.includes('.html') || event.request.url.includes('manifest.json') || event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Validar resposta
          if (!response || response.status !== 200 || response.type === 'error') {
            return response;
          }
          
          // Salvar cópia fresquinha no cache
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, clone);
            console.log('[SW] Cacheado (atualizado):', event.request.url);
          });
          return response;
        })
        .catch(err => {
          console.warn('[SW] Fetch falhou, usando cache:', event.request.url);
          // Sem internet: serve do cache
          return caches.match(event.request)
            || caches.match('./index.html')
            || new Response('Offline — arquivo não encontrado em cache', { status: 503 });
        })
    );
    return;
  }

  // Outros recursos — Cache-first com fallback para rede
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        console.log('[SW] Servido do cache:', event.request.url);
        return cached;
      }

      // Não está no cache: busca na rede e guarda
      console.log('[SW] Buscando na rede:', event.request.url);
      return fetch(event.request)
        .then(response => {
          if (!response || response.status !== 200 || response.type === 'error') {
            return response;
          }
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, clone);
            console.log('[SW] Cacheado (novo):', event.request.url);
          });
          return response;
        })
        .catch(err => {
          console.warn('[SW] Recurso indisponível offline:', event.request.url);
          return new Response('Offline', { status: 503 });
        });
    })
  );
});

// ── Mensagem do cliente: forçar atualização ────────────────────────────────
self.addEventListener('message', event => {
  console.log('[SW] Mensagem recebida:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] Pulando espera, ativando nova versão...');
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    console.log('[SW] Limpando cache...');
    caches.delete(CACHE_NAME).then(() => {
      console.log('[SW] Cache removido');
      event.ports[0]?.postMessage({ success: true });
    });
  }
});
