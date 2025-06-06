const CACHE_NAME = 'chatty-v1.0.17';
const urlsToCache = [
  '/',
  '/svelte/bundle.js',
  '/svelte/main.css',
  '/svelte/components.css',
  '/svelte/modals.css',
  '/svelte/highlight.css',
  'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap',
  'https://fastly.jsdelivr.net/gh/projectnoonnu/noonfonts_Monoplex-nerd@1.0/MonoplexKRNerd-Regular.woff2',
  'https://fastly.jsdelivr.net/gh/projectnoonnu/noonfonts_Monoplex-nerd@1.0/MonoplexKRNerd-Medium.woff2',
  'https://fastly.jsdelivr.net/gh/projectnoonnu/noonfonts_Monoplex-nerd@1.0/MonoplexKRNerd-Bold.woff2'
];

// Install 이벤트 - 캐시 설정
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Caching files');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('Service Worker: All files cached');
        return self.skipWaiting();
      })
  );
});

// Activate 이벤트 - 오래된 캐시 정리
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Clearing old cache');
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('Service Worker: Activated');
      return self.clients.claim();
    })
  );
});

// Fetch 이벤트 - 네트워크 우선, 캐시 폴백 전략
self.addEventListener('fetch', (event) => {
  // 채팅 API 요청은 캐시하지 않음
  if (event.request.url.includes('/api/') || 
      event.request.url.includes('openrouter.ai') ||
      event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // 성공적인 응답을 캐시에 저장
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(event.request, responseClone);
            });
        }
        return response;
      })
      .catch(() => {
        // 네트워크 실패 시 캐시에서 가져오기
        return caches.match(event.request)
          .then((response) => {
            if (response) {
              return response;
            }
            // 오프라인 폴백 페이지 (선택사항)
            if (event.request.mode === 'navigate') {
              return caches.match('/');
            }
          });
      })
  );
});

// 푸시 알림 (선택사항 - 향후 기능)
self.addEventListener('push', (event) => {
  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.body,
      icon: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"%3E%3Crect width="192" height="192" fill="%23000" rx="24"/%3E%3Ctext x="96" y="120" text-anchor="middle" font-size="120" fill="%2300ff00"%3E$%3C/text%3E%3C/svg%3E',
      badge: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"%3E%3Crect width="96" height="96" fill="%23000" rx="12"/%3E%3Ctext x="48" y="60" text-anchor="middle" font-size="60" fill="%2300ff00"%3E$%3C/text%3E%3C/svg%3E',
      vibrate: [100, 50, 100],
      data: {
        dateOfArrival: Date.now(),
        primaryKey: 1
      }
    };
    
    event.waitUntil(
      self.registration.showNotification(data.title, options)
    );
  }
});

// 알림 클릭 처리
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  event.waitUntil(
    clients.matchAll().then((clientList) => {
      for (const client of clientList) {
        if (client.url === '/' && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
}); 
