const CACHE = 'labqcpro-v1'

// Cache the app shell on install
self.addEventListener('install', event => {
  self.skipWaiting()
  event.waitUntil(
    caches.open(CACHE).then(cache =>
      cache.addAll(['/', '/index.html'])
    ).catch(() => {})
  )
})

// Clean old caches on activate
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// Network-first for API, cache-first for static assets
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)

  // Never intercept API calls or non-GET requests
  if (
    event.request.method !== 'GET' ||
    url.hostname.includes('workers.dev') ||
    url.hostname.includes('cloudflare') ||
    url.hostname.includes('anthropic') ||
    url.pathname.startsWith('/api')
  ) return

  event.respondWith(
    caches.match(event.request).then(cached => {
      const network = fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone()
          caches.open(CACHE).then(cache => cache.put(event.request, clone))
        }
        return response
      })
      return cached || network
    }).catch(() =>
      caches.match('/index.html')
    )
  )
})
