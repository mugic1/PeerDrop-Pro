self.addEventListener('install', (e) => {
    console.log('[Service Worker] Install');
});
self.addEventListener('fetch', (e) => {
    // Basic network-first strategy ya cache lagana chaho toh yahan add kar sakte ho.
});

