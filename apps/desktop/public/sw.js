/* BudgetOS service worker — an app-shell cache so the UI opens instantly and
   works offline for reads. Live data still comes from Supabase when online.
   Network-first for navigations (so deploys are picked up), cache-first for
   hashed static assets (immutable). */
const CACHE = 'budgetos-shell-v1';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/pwa-192.png', '/pwa-512.png', '/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Never touch Supabase / cross-origin API calls — always go to network.
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then((res) => {
        caches.open(CACHE).then((c) => c.put('/index.html', res.clone()));
        return res;
      }).catch(() => caches.match('/index.html')),
    );
    return;
  }
  event.respondWith(
    caches.match(request).then((cached) =>
      cached || fetch(request).then((res) => {
        if (res.ok && (url.pathname.startsWith('/assets/') || SHELL.includes(url.pathname))) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(request, clone));
        }
        return res;
      }),
    ),
  );
});
