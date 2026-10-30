/**
 * 1st Petaling Jaya Boys' Brigade Portal - Service Worker
 * TSK-016: PWA Manifest & Offline Caching
 *
 * Implements offline caching for static assets, badge requirements catalog,
 * and company parade schedules using Stale-While-Revalidate and Network-First strategies.
 */

const CACHE_VERSION = '20261031-v2';
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
  './js/modules/admin.js'
];

// Supabase PostgREST query keys prioritized for offline data caching
const OFFLINE_DATA_KEYS = ['bb_badge_defs', 'bb_presidents_reqs', 'bb_company_calendar'];

/**
 * Handles incoming HTTP fetch requests with tailored caching strategies
 * @param {Request} request
 * @param {CacheStorage} [cachesInterface]
 * @param {Function} [fetchFn]
 * @returns {Promise<Response>|null}
 */
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
      var netRes = await networkFetch(request);
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

  // 2. Static Assets & App Shell Caching (Stale-While-Revalidate)
  var isLocalAsset = (typeof self !== 'undefined' && self.location)
    ? (url.origin === self.location.origin)
    : (!url.hostname.includes('supabase.co') && (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.pathname.endsWith('.html') || url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname.endsWith('.png') || url.pathname.endsWith('.json')));
  var isGoogleFont =
    url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com');

  if (isLocalAsset || isGoogleFont) {
    var cachedAsset = cachesApi ? await cachesApi.match(request, { ignoreSearch: true }) : null;

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
