// Service Worker for Baby Names Picker
// Provides offline functionality and caching for app assets

const CACHE_NAME = 'baby-names-v8';

const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/styles.css',
    '/app.js',
    '/storage.js',
    '/nameData.js',
    '/swipeCard.js',
    '/likesManager.js',
    '/partnerSession.js',
    '/derpTransport.js',
    '/matchesView.js',
    '/pairingView.js',
    '/utils.js',
    '/matchAnimation.js',
    '/manifest.json',
    '/vendor/nacl-fast.min.js',
    '/vendor/tweetnacl.js',
    '/data/names.json'
];

/**
 * Cache each URL independently so one miss does not fail the install.
 * @param {Cache} cache
 * @param {string[]} urls
 */
async function cacheAssets(cache, urls) {
    for (const url of urls) {
        try {
            await cache.add(url);
        } catch (error) {
            console.error('[Service Worker] Failed to cache', url, error);
        }
    }
}

self.addEventListener('install', (event) => {
    console.log('[Service Worker] Installing...');

    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[Service Worker] Caching assets...');
                return cacheAssets(cache, STATIC_ASSETS);
            })
            .then(() => {
                console.log('[Service Worker] Asset cache complete');
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('[Service Worker] Cache installation failed:', error);
            })
    );
});

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

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    if (request.method !== 'GET') {
        return;
    }

    if (!url.protocol.startsWith('http')) {
        return;
    }

    if (url.origin === self.location.origin) {
        event.respondWith(
            fetch(request)
                .then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        const responseToCache = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(request, responseToCache);
                        });
                    }
                    return networkResponse;
                })
                .catch(() => {
                    return caches.match(request, { ignoreSearch: true });
                })
        );
        return;
    }

    event.respondWith(
        caches.match(request)
            .then((cachedResponse) => {
                if (cachedResponse) {
                    return cachedResponse;
                }
                return fetch(request)
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
                        return Response.error();
                    });
            })
    );
});

self.addEventListener('message', (event) => {
    if (event.data === 'skipWaiting') {
        self.skipWaiting();
    }
});
