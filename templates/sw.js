const CACHE_NAME = 'zorvex-erp-cache-v1';

self.addEventListener('install', event => {
    // Basic install event - we don't need to aggressively cache everything
    // just enough to satisfy PWA requirements.
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cache => {
                    if (cache !== CACHE_NAME) {
                        return caches.delete(cache);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', event => {
    // Ignore Chrome DevTools 'only-if-cached' bug
    if (event.request.cache === 'only-if-cached' && event.request.mode !== 'same-origin') {
        return;
    }
    
    // To strictly pass PWA audits, we should have a fetch handler.
    // For now, we'll just fall back to network.
    event.respondWith(
        fetch(event.request).catch(() => {
            return caches.match(event.request);
        })
    );
});
