/**
 * 1st Petaling Jaya Boys' Brigade Portal - Service Worker
 * PWA Manifest & Offline Caching
 *
 * Implements offline caching for static assets, badge requirements catalog,
 * and company parade schedules using Stale-While-Revalidate and Network-First strategies.
 */

const CACHE_VERSION = '20261109e';
const STATIC_CACHE_NAME = 'bb-portal-static-' + CACHE_VERSION;
const DATA_CACHE_NAME = 'bb-portal-data-' + CACHE_VERSION;

// Core static assets required for the offline application shell
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './assets/logo.png',
  './css/variables.css',
  './css/base.css',
  './css/nav.css',
  './css/components.css',
  './css/admin.css',
  './js/config.js',
  './js/core/theme.js',
  './js/core/session.js',
  './js/core/rbac.js',
  './js/core/utils.js',
  './js/core/ui.js',
  './js/core/loading.js',
  './js/api/supabase.js',
  './js/api/sheets.js',
  './js/modules/member.js',
  './js/modules/attendance.js',
  './js/modules/announcements.js',
  './js/modules/gallery.js',
  './js/modules/resources.js',
  './js/modules/calendar.js',
  './js/modules/orders.js',
  './js/modules/forms.js',
  './js/modules/badges.js',
  './js/modules/tasks.js',
  './js/modules/admin.js',
  './js/modules/forum.js',
  './js/modules/arcade.js',
  './assets/Sound%20Effects/Notification%20Sound_PopSound%20(1).wav',
  './assets/emojis/2705.png',
  './assets/emojis/274c.png',
  './assets/emojis/1f64c.png',
  './assets/emojis/1f44d.png',
  './assets/emojis/1f64f.png',
  './assets/emojis/1f525.png',
  './assets/emojis/2764-fe0f.png',
  './assets/emojis/1f973.png',
  './assets/emojis/1f389.png'
];

// Supabase PostgREST query keys prioritized for offline data caching
const OFFLINE_DATA_KEYS = ['bb_badge_defs', 'bb_presidents_reqs', 'bb_company_calendar'];

/**
 * Race a network fetch against a timeout to prevent deadlocks when sockets are starved
 * @param {Function} fetchFn
 * @param {Request} request
 * @param {number} timeoutMs
 * @returns {Promise<Response>}
 */
function fetchWithTimeout(fetchFn, request, timeoutMs) {
  var fetchPromise = fetchFn(request);
  var timeoutPromise = new Promise(function (_, reject) {
    setTimeout(function () {
      reject(new Error('SW network timeout (' + timeoutMs + 'ms)'));
    }, timeoutMs);
  });
  return Promise.race([fetchPromise, timeoutPromise]);
}

/**
 * Handles incoming HTTP fetch requests with tailored caching strategies
 * @param {Request} request
 * @param {CacheStorage} [cachesInterface]
 * @param {Function} [fetchFn]
 * @returns {Promise<Response>|null}
 */
var _lastReloadTimestamp = 0;

async function handleFetchRequest(request, cachesInterface, fetchFn) {
  var cachesApi = cachesInterface || (typeof caches !== 'undefined' ? caches : null);
  var networkFetch = fetchFn || (typeof fetch !== 'undefined' ? fetch : null);

  if (!request || request.method !== 'GET') {
    return null;
  }

  var urlString = request.url || '';
  if (!urlString.startsWith('http://') && !urlString.startsWith('https://')) {
    return null;
  }

  var url = new URL(urlString);

  // 1. Dynamic Network-First with Cache Fallback for Badge Criteria & Parade Schedules
  var isOfflineDataQuery = OFFLINE_DATA_KEYS.some(function (key) {
    return url.href.includes(key);
  });

  if (isOfflineDataQuery) {
    try {
      var netRes = await fetchWithTimeout(networkFetch, request, 3500);
      if (netRes && netRes.status === 200 && cachesApi) {
        var cloneForCache = netRes.clone();
        cachesApi
          .open(DATA_CACHE_NAME)
          .then(function (cache) {
            cache.put(request, cloneForCache);
          })
          .catch(function () {});
      }
      return netRes;
    } catch (_netErr) {
      if (cachesApi) {
        var cachedData = await cachesApi.match(request);
        if (cachedData) {
          return cachedData;
        }
      }
      // Return empty array fallback so client-side modules use embedded DEFAULT sets
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-BB-Offline-Fallback': 'true'
        }
      });
    }
  }

  // 2. Navigation / App Shell Requests (Network-First with Offline Cache Fallback)
  // Ensures online users ALWAYS receive the latest HTML app shell on reload or navigation,
  // preventing stale cached DOM shells from masking updates while retaining full offline PWA support.
  var isLocalAsset = (typeof self !== 'undefined' && self.location)
    ? (url.origin === self.location.origin)
    : (!url.hostname.includes('supabase.co') && (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.pathname.endsWith('.html') || url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname.endsWith('.png') || url.pathname.endsWith('.json')));

  var isNavigation =
    request.mode === 'navigate' ||
    (request.headers && typeof request.headers.get === 'function' && (request.headers.get('accept') || '').includes('text/html')) ||
    url.pathname.endsWith('.html') ||
    (isLocalAsset && (url.pathname === '/' || url.pathname === ''));

  if (isNavigation && isLocalAsset) {
    // Record page open/reload timestamp so all subresources loaded by this session automatically fetch fresh from network
    _lastReloadTimestamp = Date.now();

    try {
      var netNavRes = await fetchWithTimeout(networkFetch, request, 4000);
      if (netNavRes && netNavRes.status === 200 && cachesApi) {
        var navClone = netNavRes.clone();
        cachesApi
          .open(STATIC_CACHE_NAME)
          .then(function (cache) {
            cache.put('./index.html', navClone);
          })
          .catch(function () {});
      }
      return netNavRes;
    } catch (_navErr) {
      if (cachesApi) {
        var cachedNav = await cachesApi.match('./index.html', { ignoreSearch: true });
        if (!cachedNav) {
          cachedNav = await cachesApi.match(request, { ignoreSearch: true });
        }
        if (cachedNav) {
          return cachedNav;
        }
      }
      return null;
    }
  }

  // 3. Static Assets & App Shell Caching (Auto-Update Network-First on Page Open with Cache Fallback)
  // Ensures online users ALWAYS receive the latest JavaScript and CSS immediately without requiring
  // manual browser reloads, while falling back to offline cache when disconnected.
  var isGoogleFont =
    url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com');

  if (isLocalAsset || isGoogleFont) {
    var cachedAsset = cachesApi ? await cachesApi.match(request, { ignoreSearch: true }) : null;

    // Detect page navigation / open within past 10 seconds or explicit reload headers
    var isRecentPageReload = (Date.now() - _lastReloadTimestamp) < 10000;

    var isExplicitReload =
      request.cache === 'reload' ||
      request.cache === 'no-cache' ||
      isRecentPageReload ||
      (request.headers && typeof request.headers.get === 'function' && (
        (request.headers.get('cache-control') || '').includes('no-cache') ||
        (request.headers.get('cache-control') || '').includes('max-age=0') ||
        (request.headers.get('pragma') || '').includes('no-cache')
      ));

    if (isExplicitReload && isLocalAsset) {
      try {
        var freshNetRes = await fetchWithTimeout(networkFetch, request, 3500);
        if (freshNetRes && freshNetRes.status === 200 && cachesApi) {
          var freshClone = freshNetRes.clone();
          cachesApi
            .open(STATIC_CACHE_NAME)
            .then(function (cache) {
              cache.put(request, freshClone);
            })
            .catch(function () {});
        }
        return freshNetRes;
      } catch (_reloadErr) {
        if (cachedAsset) {
          return cachedAsset;
        }
      }
    }

    // Background revalidation
    var bgFetch = networkFetch(request)
      .then(function (liveRes) {
        if (liveRes && liveRes.status === 200 && cachesApi) {
          var clone = liveRes.clone();
          cachesApi
            .open(STATIC_CACHE_NAME)
            .then(function (cache) {
              cache.put(request, clone);
            })
            .catch(function () {});
        }
        return liveRes;
      })
      .catch(function () {
        if (request.mode === 'navigate' && cachesApi) {
          return cachesApi.match('./index.html', { ignoreSearch: true });
        }
        return null;
      });

    if (cachedAsset) {
      return cachedAsset;
    }
    return (await bgFetch) || cachedAsset;
  }

  return null;
}

// ── Service Worker Lifecycle Events ────────────────────────────────────────

if (typeof self !== 'undefined' && 'addEventListener' in self) {
  // Pre-cache static shell on installation
  self.addEventListener('install', function (event) {
    event.waitUntil(
      caches
        .open(STATIC_CACHE_NAME)
        .then(function (cache) {
          return cache.addAll(PRECACHE_ASSETS);
        })
        .then(function () {
          return self.skipWaiting();
        })
        .catch(function (err) {
          console.warn('Pre-caching offline assets warning:', err);
        })
    );
  });

  // Purge outdated cache versions on activation
    // Message listener for skip waiting and cache clearing
  self.addEventListener('message', function (event) {
    if (!event.data) return;
    if (event.data.action === 'SKIP_WAITING' || event.data.action === 'skipWaiting') {
      self.skipWaiting();
    }
    if (event.data.action === 'CLEAR_CACHES' || event.data.action === 'clearCaches') {
      event.waitUntil(
        caches.keys().then(function (keys) {
          return Promise.all(
            keys.map(function (k) {
              return caches.delete(k);
            })
          );
        })
      );
    }
  });

  self.addEventListener('activate', function (event) {
    event.waitUntil(
      caches
        .keys()
        .then(function (keys) {
          return Promise.all(
            keys.map(function (k) {
              if (k !== STATIC_CACHE_NAME && k !== DATA_CACHE_NAME) {
                return caches.delete(k);
              }
              return null;
            })
          );
        })
        .then(function () {
          return self.clients.claim();
        })
    );
  });

  // Intercept network requests
  self.addEventListener('fetch', function (event) {
    if (event.request.method !== 'GET') {
      return;
    }

    var urlString = event.request.url || '';
    if (!urlString.startsWith('http://') && !urlString.startsWith('https://')) {
      return;
    }

    var url = new URL(urlString);
    var isOfflineDataQuery = OFFLINE_DATA_KEYS.some(function (key) {
      return url.href.includes(key);
    });
    var isLocalAsset = (typeof self !== 'undefined' && self.location)
      ? (url.origin === self.location.origin)
      : (!url.hostname.includes('supabase.co'));
    var isGoogleFont =
      url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com');

    // ONLY intercept requests managed by the service worker
    if (isOfflineDataQuery || isLocalAsset || isGoogleFont) {
      event.respondWith(
        handleFetchRequest(event.request, caches, fetch).then(function (res) {
          return res || fetch(event.request);
        }).catch(function () {
          return fetch(event.request);
        })
      );
    }
  });


  // Handle notification clicks from OS device popups
  self.addEventListener('notificationclick', function (event) {
    if (event.notification) {
      event.notification.close();
    }
    if (event.action === 'dismiss') {
      return;
    }
    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
        for (var i = 0; i < clientList.length; i++) {
          var client = clientList[i];
          if (client.url && 'focus' in client) {
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow('./');
        }
      })
    );
  });
}

// ── Node.js Testing Exports ────────────────────────────────────────────────
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CACHE_VERSION: CACHE_VERSION,
    STATIC_CACHE_NAME: STATIC_CACHE_NAME,
    DATA_CACHE_NAME: DATA_CACHE_NAME,
    PRECACHE_ASSETS: PRECACHE_ASSETS,
    OFFLINE_DATA_KEYS: OFFLINE_DATA_KEYS,
    handleFetchRequest: handleFetchRequest
  };
}
