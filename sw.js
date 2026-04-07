// TAF-TECH Service Worker
// Cache-first para recursos estáticos, network-first para navegação

const CACHE_NAME = 'Tropa-pace';
const BASE = '/Time_lapse_count/';

// Recursos para cachear imediatamente na instalação
const PRECACHE_URLS = [
  BASE,
  BASE + 'index.html',
  BASE + 'manifest.json',
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=League+Spartan:wght@400;600;700&display=swap',
  'https://fonts.gstatic.com/s/leaguespartan/v11/kJEnBuEW6A0lliaV_m88ja5Twtx8BWhtkDVmjZvMGIsk.woff2',
];

// ======= INSTALL — pré-cacheia recursos críticos =======
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      // Cacheia um a um para não falhar tudo se um recurso estiver indisponível
      const results = await Promise.allSettled(
        PRECACHE_URLS.map(url =>
          cache.add(url).catch(err => console.warn('[SW] Falha ao cachear:', url, err))
        )
      );
      console.log('[SW] Instalado. Cache concluído.');
    })
  );
  self.skipWaiting();
});

// ======= ACTIVATE — limpa caches antigos =======
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] Removendo cache antigo:', key);
            return caches.delete(key);
          })
      )
    )
  );
  self.clients.claim();
});

// ======= FETCH — estratégia por tipo de recurso =======
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Ignora requisições não-GET
  if (event.request.method !== 'GET') return;

  // Ignora extensões do Chrome e URLs de dados
  if (url.protocol === 'chrome-extension:' || url.protocol === 'data:') return;

  // Navegação principal (HTML) — Network-first com fallback para cache
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Salva cópia fresquinha no cache
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => {
          // Sem internet: serve do cache
          return caches.match(event.request)
            || caches.match(BASE + 'index.html')
            || caches.match(BASE);
        })
    );
    return;
  }

  // Todos os outros recursos — Cache-first com fallback para rede
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      // Não está no cache: busca na rede e guarda
      return fetch(event.request)
        .then(response => {
          if (!response || response.status !== 200 || response.type === 'error') {
            return response;
          }
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(err => {
          console.warn('[SW] Recurso indisponível offline:', event.request.url);
        });
    })
  );
});
