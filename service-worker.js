// Service Worker for Baby Names Picker
// Provides offline functionality and caching for all assets

const CACHE_NAME = 'baby-names-v3';

// List of essential assets to cache
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/storage.js',
  '/nameData.js',
  '/swipeCard.js',
  '/likesManager.js',
  '/ntfySession.js',
  '/sessionSync.js',
  '/matchesView.js',
  '/sessionModal.js',
  '/utils.js',
  '/matchAnimation.js',
  '/manifest.json',
  // External dependencies
  'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap'
];

const DATA_START_YEAR = 1880;
const DATA_END_YEAR = 2024;

// Data files to cache for offline use
const DATA_FILES = Array.from(
  { length: DATA_END_YEAR - DATA_START_YEAR + 1 },
  (_, i) => `/data/yob${DATA_START_YEAR + i}.txt`
);

const ALL_ASSETS = [...STATIC_ASSETS, ...DATA_FILES];

// Install event - cache all assets
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Caching assets...');
        return cache.addAll(ALL_ASSETS);
      })
      .then(() => {
        console.log('[Service Worker] All assets cached successfully');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[Service Worker] Cache installation failed:', error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');

  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => {
              console.log('[Service Worker] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[Service Worker] Activation complete');
        return self.clients.claim();
      })
  );
});

// Fetch event - serve from cache or network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip chrome-extension and other non-http(s) requests
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // For same-origin requests, use network-first strategy
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          // Optionally update the cache with the latest response
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // If network fails, try to serve from cache
          return caches.match(request);
        })
    );
  } else {
    // For external requests (fonts), use stale-while-revalidate
    event.respondWith(
      caches.match(request)
        .then((cachedResponse) => {
          const fetchPromise = fetch(request)
            .then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME)
                  .then((cache) => {
                    cache.put(request, responseToCache);
                  });
              }
              return networkResponse;
            })
            .catch(() => {
              console.log('[Service Worker] External fetch failed');
            });

          return cachedResponse || fetchPromise;
        })
    );
  }
});

// Handle messages from the main app
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});

// Background sync for future use (if needed for peer connection states)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-likes') {
    console.log('[Service Worker] Background sync triggered');
  }
});
