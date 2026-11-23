/**
 * 1st Petaling Jaya Boys' Brigade Portal - Service Worker
 * PWA Manifest & Offline Caching
 *
 * Implements offline caching for static assets, badge requirements catalog,
 * and company parade schedules with network-first recovery for the shell and data.
 */

if (typeof importScripts === 'function') {
  try {
    importScripts('./js/config.js');
  } catch (_) {}
}

const CACHE_VERSION = '20261123a';
const STATIC_CACHE_NAME = 'bb-portal-static-' + CACHE_VERSION;
const DATA_CACHE_NAME = 'bb-portal-data-' + CACHE_VERSION;

// Core static assets required for the offline application shell
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './assets/logo.png',
  './assets/portal-icon-192.png',
  './assets/portal-icon-512.png',
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
  './js/core/install.js',
  './assets/vendor/qrcode-generator.js',
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
async function fetchWithTimeout(fetchFn, request, timeoutMs) {
  var controller = new AbortController();
  var timer;
  try {
    return await Promise.race([
      fetchFn(request, { signal: controller.signal, cache: 'no-cache' }),
      new Promise(function(_, reject) {
        timer = setTimeout(function() {
          reject(new Error('Network request timed out.'));
          controller.abort();
        }, timeoutMs);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function resolveFetchStrategy(request) {
  if (!request || request.method !== 'GET') return null;
  var url = new URL(request.url);
  if (!['http:', 'https:'].includes(url.protocol) || request.headers?.get('range')) return null;
  var headers = request.headers;
  var authorization = headers?.get('authorization');
  var apiKey = headers?.get('apikey');
  var key = url.searchParams.get('key');
  if (url.protocol === 'https:' && /^[a-z0-9-]+\.supabase\.co$/.test(url.hostname) &&
      url.pathname === '/rest/v1/bb_config' && key && OFFLINE_DATA_KEYS.includes(key.slice(3)) &&
      key.startsWith('eq.') && url.searchParams.get('select') === 'value' &&
      url.searchParams.size === 2 && (!apiKey || isPublicSupabaseKey(apiKey)) &&
      (!authorization || authorization === 'Bearer ' + apiKey)) {
    return { cache: DATA_CACHE_NAME, key: request, networkFirst: true, timeout: 3500 };
  }

  var scope = typeof self !== 'undefined' && self.registration
    ? new URL(self.registration.scope) : null;
  var isLocal = scope ? url.origin === scope.origin && url.pathname.startsWith(scope.pathname)
    : ['127.0.0.1', 'localhost'].includes(url.hostname);
  if (authorization || apiKey) return null;
  if (isLocal) {
    var relative = './' + url.pathname.slice(scope ? scope.pathname.length : 1);
    if (relative === './' || relative === './index.html') {
      return { cache: STATIC_CACHE_NAME, key: './index.html', networkFirst: true, timeout: 4000, precacheOnly: true };
    }
    if (!PRECACHE_ASSETS.includes(relative) && !(request.destination === 'image' && relative.startsWith('./assets/'))) return null;
    var version = url.searchParams.get('v');
    var code = /\.(?:js|css)$/.test(relative);
    return {
      cache: STATIC_CACHE_NAME, key: request, timeout: 3500,
      networkFirst: code || ['reload', 'no-cache'].includes(request.cache),
      precacheOnly: code && !!version && version !== CACHE_VERSION,
      fallback: PRECACHE_ASSETS.includes(relative) && (!url.search || (version === CACHE_VERSION && url.searchParams.size === 1)) ? relative : null
    };
  }
  if (url.protocol === 'https:' && ['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) {
    return { cache: STATIC_CACHE_NAME, key: request, timeout: 3500 };
  }
  return null;
}

function isPublicSupabaseKey(key) {
  if (!key) return false;
  if (key.startsWith('sb_publishable_')) return true;
  try {
    var payload = key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(payload)).role === 'anon';
  } catch (_) { return false; }
}

async function handleFetchRequest(request, cachesInterface, fetchFn) {
  var strategy = resolveFetchStrategy(request);
  if (!strategy) return null;
  var cachesApi = cachesInterface || (typeof caches !== 'undefined' ? caches : null);
  var networkFetch = fetchFn || (typeof fetch !== 'undefined' ? fetch : null);
  var cache;
  try { cache = cachesApi && await cachesApi.open(strategy.cache); } catch (_) {}

  async function cachedResponse() {
    if (!cache) return null;
    try {
      return await cache.match(strategy.key) || (strategy.fallback ? await cache.match(strategy.fallback) : null);
    } catch (_) { return null; }
  }

  if (!strategy.networkFirst) {
    var cached = await cachedResponse();
    if (cached) return cached;
  }

  var response;
  try {
    response = await fetchWithTimeout(networkFetch, request, strategy.timeout);
    if (response.status === 200 && cache && !strategy.precacheOnly &&
        !/\b(?:private|no-store)\b/i.test(response.headers?.get('cache-control') || '')) {
      try { await cache.put(strategy.key, response.clone()); } catch (_) {}
    }
    if (response.status < 500) return response;
  } catch (_) {}

  var fallback = await cachedResponse();
  if (fallback) return fallback;
  if (response) return response;
  return new Response('Offline. Reconnect and try again.', {
    status: 503,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-BB-Offline': 'true' }
  });
}

function isPortalCache(key) {
  return key.startsWith('bb-portal-static-') || key.startsWith('bb-portal-data-');
}

// ── Service Worker Lifecycle Events ────────────────────────────────────────

if (typeof self !== 'undefined' && 'addEventListener' in self) {
  // Pre-cache static shell on installation
  self.addEventListener('install', function (event) {
    event.waitUntil(
      caches
        .open(STATIC_CACHE_NAME)
        .then(function (cache) {
          return cache.addAll(PRECACHE_ASSETS.map(function(path) { return new Request(new URL(path, self.registration.scope), { cache: 'reload' }); }));
        })
        .then(function () {
          return self.skipWaiting();
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
            keys.filter(isPortalCache).map(function (k) {
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
              if (isPortalCache(k) && k !== STATIC_CACHE_NAME && k !== DATA_CACHE_NAME) {
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
    if (resolveFetchStrategy(event.request)) {
      event.respondWith(handleFetchRequest(event.request, caches, fetch));
    }
  });


  // Handle Web Push notifications when app is closed or in background
  self.addEventListener('push', function (event) {
    var payload = {};
    if (event.data) {
      try {
        payload = event.data.json();
      } catch (_) {
        payload = { title: "1st Petaling Jaya Boys' Brigade", body: event.data.text() };
      }
    }
    var title = payload.title || "1st Petaling Jaya Boys' Brigade";
    var body = payload.body || payload.snippet || 'New company announcement posted.';
    var tag = payload.tag || ('bb-notif-' + Date.now());
    var iconUrl = payload.icon || './assets/portal-icon-192.png';
    var badgeUrl = payload.badge || './assets/logo.png';
    var soundUrl = './assets/Sound%20Effects/Notification%20Sound_PopSound%20(1).wav';

    var notifOptions = {
      body: body,
      icon: iconUrl,
      badge: badgeUrl,
      tag: tag,
      renotify: true,
      requireInteraction: false,
      vibrate: [200, 100, 200, 100, 200],
      sound: soundUrl,
      data: {
        url: (payload.data && payload.data.url) || payload.url || './#page-home',
        tab: (payload.data && payload.data.tab) || payload.tab || 'home'
      },
      actions: [
        { action: 'open', title: 'Open' },
        { action: 'dismiss', title: 'Dismiss' }
      ]
    };

    event.waitUntil(self.registration.showNotification(title, notifOptions));
  });

  // Handle Periodic Background Sync for background announcement polling
  async function checkBackgroundAnnouncements() {
    try {
      var supaBaseUrl = (typeof self !== 'undefined' && self.SUPA_URL) ? self.SUPA_URL : 'https://mjfclxcklkbgsivvvlfe.supabase.co';
      var supaKey = (typeof self !== 'undefined' && self.SUPA_KEY) ? self.SUPA_KEY : '';
      if (!supaKey) return;
      var endpoint = supaBaseUrl + '/rest/v1/bb_announcements?order=created_at.desc&limit=1&select=id,title,body,created_at';
      var res = await fetchWithTimeout(fetch, new Request(endpoint, {
        headers: {
          'apikey': supaKey,
          'Authorization': 'Bearer ' + supaKey,
          'Accept': 'application/json'
        }
      }), 4000);
      if (!res || res.status !== 200) return;
      var rows = await res.json();
      if (!Array.isArray(rows) || !rows.length || !rows[0] || !rows[0].id) return;
      var latest = rows[0];

      // Check against stored latest announcement ID in cache
      var cache = await caches.open(DATA_CACHE_NAME);
      var cacheKey = new Request('./__bb_latest_seen_announcement__');
      var cached = await cache.match(cacheKey);
      var lastSeenId = cached ? await cached.text() : null;

      if (lastSeenId !== String(latest.id)) {
        await cache.put(cacheKey, new Response(String(latest.id), { headers: { 'Content-Type': 'text/plain' } }));
        // If there was a previous seen ID and this is a new one, show notification
        if (lastSeenId) {
          var cleanSnippet = (latest.body || '').replace(/<[^>]+>/g, '').trim().slice(0, 70);
          await self.registration.showNotification(
            '📢 ' + (latest.title || "New Company Announcement"),
            {
              body: cleanSnippet || 'Tap to view announcement.',
              icon: './assets/portal-icon-192.png',
              badge: './assets/logo.png',
              tag: 'bb-announcement-' + latest.id,
              renotify: true,
              vibrate: [200, 100, 200, 100, 200],
              sound: './assets/Sound%20Effects/Notification%20Sound_PopSound%20(1).wav',
              data: { url: './#page-home', tab: 'home' }
            }
          );
        }
      }
    } catch (_) {}
  }

  self.addEventListener('periodicsync', function (event) {
    if (event.tag === 'bb-announcements-sync' || event.tag === 'bb-portal-sync') {
      event.waitUntil(checkBackgroundAnnouncements());
    }
  });

  self.addEventListener('sync', function (event) {
    if (event.tag === 'bb-announcements-sync' || event.tag === 'bb-portal-sync') {
      event.waitUntil(checkBackgroundAnnouncements());
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
    var targetUrl = (event.notification.data && event.notification.data.url) ? event.notification.data.url : './#page-home';
    var targetTab = (event.notification.data && event.notification.data.tab) ? event.notification.data.tab : 'home';

    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
        for (var i = 0; i < clientList.length; i++) {
          var client = clientList[i];
          if (client.url && 'focus' in client) {
            try {
              client.postMessage({ type: 'PORTAL_NAVIGATE_TAB', tab: targetTab });
            } catch (_) {}
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
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
