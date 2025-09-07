const CACHE_NAME = 'parts-inventory-v2.0';
const DATA_CACHE_NAME = 'parts-data-v2.0';

const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-72x72.png',
  '/icon-96x96.png',
  '/icon-128x128.png',
  '/icon-144x144.png',
  '/icon-152x152.png',
  '/icon-192x192.png',
  '/icon-384x384.png',
  '/icon-512x512.png'
];

// インストールイベント - アプリシェルをキャッシュ
self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] Install');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[ServiceWorker] Caching app shell');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('[ServiceWorker] Skip waiting');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[ServiceWorker] Caching failed:', error);
      })
  );
});

// アクティベートイベント - 古いキャッシュを削除
self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] Activate');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== DATA_CACHE_NAME) {
            console.log('[ServiceWorker] Removing old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[ServiceWorker] Claiming clients');
      return self.clients.claim();
    })
  );
});

// フェッチイベント - ネットワークリクエストを処理
self.addEventListener('fetch', (event) => {
  console.log('[ServiceWorker] Fetch:', event.request.url);
  
  // データAPIリクエストの場合（将来の拡張用）
  if (event.request.url.includes('/api/')) {
    event.respondWith(
      caches.open(DATA_CACHE_NAME).then((cache) => {
        return fetch(event.request)
          .then((response) => {
            // レスポンスが正常な場合はキャッシュに保存
            if (response.status === 200) {
              cache.put(event.request.url, response.clone());
            }
            return response;
          })
          .catch(() => {
            // ネットワークエラーの場合はキャッシュから返す
            return cache.match(event.request);
          });
      })
    );
    return;
  }

  // アプリシェルリクエストの場合
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // キャッシュにある場合はそれを返す
        if (response) {
          return response;
        }

        return fetch(event.request)
          .then((response) => {
            // レスポンスが無効な場合はそのまま返す
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // レスポンスのクローンを作成してキャッシュに保存
            const responseToCache = response.clone();
            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              });

            return response;
          });
      })
      .catch(() => {
        // ネットワークもキャッシュも利用できない場合のフォールバック
        if (event.request.destination === 'document') {
          return caches.match('/index.html');
        }
      })
  );
});

// バックグラウンド同期（将来の拡張用）
self.addEventListener('sync', (event) => {
  console.log('[ServiceWorker] Background sync:', event.tag);
  
  if (event.tag === 'background-sync') {
    event.waitUntil(doBackgroundSync());
  }
});

// プッシュ通知（オプション機能）
self.addEventListener('push', (event) => {
  console.log('[ServiceWorker] Push received');
  
  const title = '部品在庫管理システム';
  const options = {
    body: event.data ? event.data.text() : '新しい通知があります',
    icon: '/icon-192x192.png',
    badge: '/icon-72x72.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: '部品在庫'
    },
    actions: [
      {
        action: 'explore',
        title: 'アプリを開く',
        icon: '/icon-192x192.png'
      },
      {
        action: 'close',
        title: '閉じる',
        icon: '/icon-192x192.png'
      }
    ],
    requireInteraction: true
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// 通知クリックイベント
self.addEventListener('notificationclick', (event) => {
  console.log('[ServiceWorker] Notification click received');
  
  event.notification.close();

  if (event.action === 'explore') {
    // アプリを開く
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});

// メッセージイベント - メインアプリとの通信
self.addEventListener('message', (event) => {
  console.log('[ServiceWorker] Message received:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({version: CACHE_NAME});
  }
});

// バックグラウンド同期処理（将来の拡張用）
async function doBackgroundSync() {
  try {
    console.log('[ServiceWorker] Performing background sync');
    
    // ここで同期処理を実装
    // 例：オフライン時に蓄積されたデータをサーバーに送信
    
    return Promise.resolve();
  } catch (error) {
    console.error('[ServiceWorker] Background sync failed:', error);
    throw error;
  }
}

// キャッシュサイズ管理
async function cleanupCache() {
  const cache = await caches.open(DATA_CACHE_NAME);
  const requests = await cache.keys();
  
  // 100個を超えるキャッシュエントリがある場合は古いものを削除
  if (requests.length > 100) {
    const sortedRequests = requests.sort((a, b) => {
      // 最後にアクセスした時間でソート（実装は簡略化）
      return a.url.localeCompare(b.url);
    });
    
    const deletePromises = sortedRequests
      .slice(0, requests.length - 100)
      .map(request => cache.delete(request));
    
    await Promise.all(deletePromises);
    console.log('[ServiceWorker] Cache cleanup completed');
  }
}

// 定期的なキャッシュクリーンアップ
self.addEventListener('activate', (event) => {
  event.waitUntil(cleanupCache());
});

// エラーハンドリング
self.addEventListener('error', (event) => {
  console.error('[ServiceWorker] Error:', event.error);
});

self.addEventListener('unhandledrejection', (event) => {
  console.error('[ServiceWorker] Unhandled promise rejection:', event.reason);
});

console.log('[ServiceWorker] SW startup complete');