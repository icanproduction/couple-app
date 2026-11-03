// Bump when the caching rules below change; activate() deletes older caches.
const CACHE_NAME = 'nantikita-v4'
const OFFLINE_URL = '/offline.html'
// Only static, user-independent files. Never pre-cache app pages: they are
// auth-gated (a logged-out install would store the login redirect) and hold
// personal data.
const PRECACHE_URLS = [OFFLINE_URL, '/manifest.json', '/icons/icon-192.png']

// ===== Install =====
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  )
  self.skipWaiting()
})

// ===== Activate =====
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

function cacheIfStatic(request, response) {
  // Redirected or opaque responses must never be replayed from cache.
  if (response.ok && response.type === 'basic' && !response.redirected) {
    const clone = response.clone()
    caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
  }
  return response
}

// ===== Fetch =====
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  if (request.method !== 'GET') return
  if (url.origin !== self.location.origin) return

  // 1. Pages → network only (fresh HTML after every deploy, nothing personal
  //    left on the device after logout); offline page when there's no network.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL))
    )
    return
  }

  // 2. API → network only, never cached (per-user data).
  if (url.pathname.startsWith('/api/')) return

  // 3. Hashed build assets → cache-first (immutable).
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then((cached) =>
        cached || fetch(request).then((response) => cacheIfStatic(request, response))
      )
    )
    return
  }

  // 4. Icons, audio, manifest → cache, refreshed in the background.
  if (url.pathname.startsWith('/icons/') || url.pathname.startsWith('/audio/') || url.pathname === '/manifest.json') {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request).then((response) => cacheIfStatic(request, response))
        return cached || network
      })
    )
  }
  // Everything else goes straight to the network.
})

// ===== Push Notifications =====
self.addEventListener('push', (event) => {
  let data = { title: 'Nanti Kita', body: 'Ada yang baru!', url: '/app/home' }

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() }
    } catch {
      data.body = event.data.text()
    }
  }

  const options = {
    body: data.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    vibrate: [200, 100, 200],
    data: { url: data.url },
    actions: [{ action: 'open', title: 'Buka' }],
  }

  event.waitUntil(self.registration.showNotification(data.title, options))
})

// Only ever open pages of this app, whatever the push payload says.
function safeAppUrl(raw) {
  try {
    const target = new URL(raw || '/app/home', self.location.origin)
    return target.origin === self.location.origin ? target : new URL('/app/home', self.location.origin)
  } catch {
    return new URL('/app/home', self.location.origin)
  }
}

// ===== Notification Click =====
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = safeAppUrl(event.notification.data?.url)

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (new URL(client.url).origin === target.origin && 'focus' in client) {
          return client.focus().then((c) => (c && 'navigate' in c ? c.navigate(target.href) : c))
        }
      }
      return clients.openWindow(target.href)
    })
  )
})
