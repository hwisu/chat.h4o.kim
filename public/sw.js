const CACHE_NAME = 'terminal-chat-v1ffa7fd';
const STATIC_CACHE_NAME = 'terminal-chat-static-v1ffa7fd';
const API_CACHE_NAME = 'terminal-chat-api-v1ffa7fd';
const CURRENT_VERSION = '1ffa7fd'; // Git hash version

// Files to cache for offline functionality
const STATIC_FILES = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/icon-180x180.png',
  '/icons/icon-152x152.png',
  '/icons/icon-144x144.png',
  '/icons/icon-128x128.png',
  '/icons/icon-96x96.png',
  'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap',
  'https://fonts.gstatic.com/s/jetbrainsmono/v18/tDbY2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8yKxTN1OVgHWV4zPyDKzUC.woff2'
];

// API endpoints to cache (with limited cache time)
const API_ENDPOINTS = [
  '/api/chat'
];

// Install event - cache static files
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing');

  event.waitUntil(
    Promise.all([
      // Cache static files
      caches.open(STATIC_CACHE_NAME).then((cache) => {
        console.log('Service Worker: Caching static files');
        return cache.addAll(STATIC_FILES);
      }),
      // Cache API responses (empty initially)
      caches.open(API_CACHE_NAME).then((cache) => {
        console.log('Service Worker: API cache initialized');
        return Promise.resolve();
      })
    ]).then(() => {
      console.log('Service Worker: Installation complete');
      // Force activation of new service worker
      return self.skipWaiting();
    })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating');

  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== STATIC_CACHE_NAME &&
              cacheName !== API_CACHE_NAME &&
              cacheName !== CACHE_NAME) {
            console.log('Service Worker: Deleting old cache', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('Service Worker: Activation complete');
      // Take control of all clients immediately
      return self.clients.claim();
    }).then(() => {
      // Check for updates after activation
      return checkForUpdates();
    }).then(() => {
      // Set up periodic version checking (every 30 minutes)
      setInterval(() => {
        console.log('Service Worker: Periodic version check');
        checkForUpdates();
      }, 30 * 60 * 1000);
    })
  );
});

// Fetch event - serve from cache or network
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Handle different types of requests
  if (request.method === 'GET') {
    if (url.pathname === '/' || url.pathname === '/index.html') {
      // Serve main page with cache-first strategy
      event.respondWith(handleMainPage(request));
    } else if (url.pathname.startsWith('/api/')) {
      // Handle API requests with network-first strategy
      event.respondWith(handleApiRequest(request));
    } else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
      // Handle font requests with cache-first strategy
      event.respondWith(handleFontRequest(request));
    } else {
      // Handle other static resources
      event.respondWith(handleStaticResource(request));
    }
  } else if (request.method === 'POST' && url.pathname.startsWith('/api/')) {
    // Handle POST API requests
    event.respondWith(handleApiPost(request));
  }
});

// Handle main page requests
async function handleMainPage(request) {
  try {
    // Try cache first
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      // Return cached version and update in background
      updateMainPageCache(request);
      return cachedResponse;
    }

    // If not in cache, fetch from network
    const response = await fetch(request);
    if (response.ok) {
      // Cache the response
      const cache = await caches.open(STATIC_CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    console.error('Service Worker: Failed to fetch main page', error);
    // Return cached version as fallback
    const cachedResponse = await caches.match('/');
    if (cachedResponse) {
      return cachedResponse;
    }
    // If no cache available, return a minimal offline page
    return new Response(createOfflinePage(), {
      headers: { 'Content-Type': 'text/html' }
    });
  }
}

// Update main page cache in background
async function updateMainPageCache(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE_NAME);
      cache.put(request, response.clone());
    }
  } catch (error) {
    console.log('Service Worker: Background update failed', error);
  }
}

// Handle GET API requests
async function handleApiRequest(request) {
  const url = new URL(request.url);

  // For non-POST requests, try network first
  try {
    const response = await fetch(request);
    if (response.ok) {
      // Cache successful responses for a short time
      const cache = await caches.open(API_CACHE_NAME);
      const clonedResponse = response.clone();

      // Add timestamp to track cache age
      const responseWithTimestamp = new Response(clonedResponse.body, {
        status: clonedResponse.status,
        statusText: clonedResponse.statusText,
        headers: {
          ...Object.fromEntries(clonedResponse.headers.entries()),
          'sw-cached-at': Date.now().toString()
        }
      });

      cache.put(request, responseWithTimestamp);
    }
    return response;
  } catch (error) {
    console.log('Service Worker: API request failed, trying cache', error);

    // Try to serve from cache
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      const cachedAt = cachedResponse.headers.get('sw-cached-at');
      const isStale = cachedAt && (Date.now() - parseInt(cachedAt)) > 5 * 60 * 1000; // 5 minutes

      if (!isStale) {
        return cachedResponse;
      }
    }

    // Return offline response for chat requests
    if (url.pathname === '/api/chat') {
      return new Response(JSON.stringify({
        response: '❌ You are currently offline. Please check your internet connection and try again.',
        model: 'system',
        korean_optimized: false,
        offline: true
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      });
    }

    throw error;
  }
}

// Handle POST API requests
async function handleApiPost(request) {
  const url = new URL(request.url);
  console.log('Service Worker: Handling POST request to', url.pathname);

  try {
    // Always try network first for POST requests - 캐시 없이 직접 전달
    const response = await fetch(request.clone());
    console.log('Service Worker: POST request successful', response.status);
    return response;
  } catch (error) {
    console.log('Service Worker: POST API request failed', error);

    // Return offline response
    return new Response(JSON.stringify({
      response: '❌ You are currently offline. Chat messages cannot be sent without an internet connection.',
      model: 'system',
      korean_optimized: false,
      offline: true
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200
    });
  }
}

// Handle font requests
async function handleFontRequest(request) {
  try {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    console.log('Service Worker: Font request failed', error);
    const cachedResponse = await caches.match(request);
    return cachedResponse || fetch(request);
  }
}

// Handle other static resources
async function handleStaticResource(request) {
  try {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    console.log('Service Worker: Static resource request failed', error);
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    throw error;
  }
}

// Create a minimal offline page
function createOfflinePage() {
  return `
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>AI Chat Terminal - Offline</title>
    <style>
        body {
            font-family: 'Courier New', monospace;
            background: #0a0a0a;
            color: #00ff00;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0;
            text-align: center;
            padding: 20px;
        }
        .offline-message {
            background: #1a1a1a;
            border: 2px solid #333;
            border-radius: 8px;
            padding: 40px;
            max-width: 500px;
        }
        .title {
            color: #ff5555;
            font-size: 24px;
            margin-bottom: 20px;
        }
        .message {
            color: #ffffff;
            line-height: 1.6;
            margin-bottom: 20px;
        }
        .retry-button {
            background: #00ff00;
            color: #000;
            border: none;
            padding: 12px 24px;
            border-radius: 4px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            font-family: inherit;
        }
        .retry-button:hover {
            background: #00dd00;
        }
    </style>
</head>
<body>
    <div class="offline-message">
        <div class="title">🔌 You're Offline</div>
        <div class="message">
            AI Chat Terminal requires an internet connection to function.<br/>
            Please check your network and try again.
        </div>
        <button class="retry-button" onclick="window.location.reload()">
            🔄 Retry Connection
        </button>
    </div>
</body>
</html>
  `;
}

// Handle background sync for when connection is restored
self.addEventListener('sync', (event) => {
  console.log('Service Worker: Background sync triggered', event.tag);

  if (event.tag === 'chat-retry') {
    event.waitUntil(
      // You could implement queued message sending here
      Promise.resolve()
    );
  }
});

// Handle push notifications (if needed in the future)
self.addEventListener('push', (event) => {
  console.log('Service Worker: Push notification received', event);

  const options = {
    body: event.data ? event.data.text() : 'New message from AI Chat Terminal',
    icon: '/icon-192.png',
    badge: '/icon-72.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      {
        action: 'explore',
        title: 'Open Chat',
        icon: '/icon-96.png'
      },
      {
        action: 'close',
        title: 'Close',
        icon: '/icon-96.png'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification('AI Chat Terminal', options)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('Service Worker: Notification clicked', event);

  event.notification.close();

  if (event.action === 'explore') {
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});

// Check for version updates
async function checkForUpdates() {
  try {
    const response = await fetch('/', { cache: 'no-cache' });
    if (response.ok) {
      const html = await response.text();
      const versionMatch = html.match(/<meta name="app-version" content="([^"]+)"/);

      if (versionMatch) {
        const remoteVersion = versionMatch[1];
        console.log('Service Worker: Current version:', CURRENT_VERSION, 'Remote version:', remoteVersion);

        if (remoteVersion !== CURRENT_VERSION) {
          console.log('Service Worker: New version detected, forcing update');
          await forceUpdate();
          return true;
        }
      }
    }
  } catch (error) {
    console.log('Service Worker: Version check failed:', error);
  }
  return false;
}

// Force update by clearing caches and refreshing clients
async function forceUpdate() {
  try {
    // Clear all caches
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map(cacheName => caches.delete(cacheName)));

    // Get all clients and refresh them
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'FORCE_UPDATE',
        version: CURRENT_VERSION
      });
    });

    // Skip waiting and claim clients
    await self.skipWaiting();
    await self.clients.claim();

    console.log('Service Worker: Force update completed');
  } catch (error) {
    console.error('Service Worker: Force update failed:', error);
  }
}

console.log('Service Worker: Script loaded');
