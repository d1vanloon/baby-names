// Service Worker for Baby Names Picker
// Provides offline functionality and caching for all assets

const CACHE_NAME = 'baby-names-v2';

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
  '/matchAnimation.js',
  '/manifest.json',
  // External dependencies
  'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap'
];

// Data files to cache for offline use
const DATA_FILES = [
  '/data/yob1880.txt',
  '/data/yob1882.txt',
  '/data/yob1883.txt',
  '/data/yob1884.txt',
  '/data/yob1885.txt',
  '/data/yob1886.txt',
  '/data/yob1887.txt',
  '/data/yob1888.txt',
  '/data/yob1889.txt',
  '/data/yob1890.txt',
  '/data/yob1891.txt',
  '/data/yob1892.txt',
  '/data/yob1893.txt',
  '/data/yob1894.txt',
  '/data/yob1895.txt',
  '/data/yob1896.txt',
  '/data/yob1897.txt',
  '/data/yob1898.txt',
  '/data/yob1899.txt',
  '/data/yob1900.txt',
  '/data/yob1901.txt',
  '/data/yob1902.txt',
  '/data/yob1903.txt',
  '/data/yob1904.txt',
  '/data/yob1905.txt',
  '/data/yob1906.txt',
  '/data/yob1907.txt',
  '/data/yob1908.txt',
  '/data/yob1909.txt',
  '/data/yob1910.txt',
  '/data/yob1911.txt',
  '/data/yob1912.txt',
  '/data/yob1913.txt',
  '/data/yob1914.txt',
  '/data/yob1915.txt',
  '/data/yob1916.txt',
  '/data/yob1917.txt',
  '/data/yob1918.txt',
  '/data/yob1919.txt',
  '/data/yob1920.txt',
  '/data/yob1921.txt',
  '/data/yob1922.txt',
  '/data/yob1923.txt',
  '/data/yob1924.txt',
  '/data/yob1925.txt',
  '/data/yob1926.txt',
  '/data/yob1927.txt',
  '/data/yob1928.txt',
  '/data/yob1929.txt',
  '/data/yob1931.txt',
  '/data/yob1932.txt',
  '/data/yob1933.txt',
  '/data/yob1934.txt',
  '/data/yob1935.txt',
  '/data/yob1936.txt',
  '/data/yob1939.txt',
  '/data/yob1944.txt',
  '/data/yob1945.txt',
  '/data/yob1946.txt',
  '/data/yob1947.txt',
  '/data/yob1948.txt',
  '/data/yob1949.txt',
  '/data/yob1950.txt',
  '/data/yob1951.txt',
  '/data/yob1952.txt',
  '/data/yob1953.txt',
  '/data/yob1954.txt',
  '/data/yob1955.txt',
  '/data/yob1956.txt',
  '/data/yob1957.txt',
  '/data/yob1958.txt',
  '/data/yob1959.txt',
  '/data/yob1960.txt',
  '/data/yob1961.txt',
  '/data/yob1962.txt',
  '/data/yob1963.txt',
  '/data/yob1964.txt',
  '/data/yob1965.txt',
  '/data/yob1966.txt',
  '/data/yob1967.txt',
  '/data/yob1968.txt',
  '/data/yob1970.txt',
  '/data/yob1971.txt',
  '/data/yob1972.txt',
  '/data/yob1973.txt',
  '/data/yob1974.txt'
];

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
