/**
 * 1st Petaling Jaya Boys' Brigade Portal
 * Supabase REST & Storage API Client with Concurrency Safety
 */

/**
 * In-memory concurrency locks per config key
 */
const _configLocks = {};
const PRIVATE_STORAGE_BUCKETS = ['avatars', 'gallery', 'story_highlights', 'highlights', 'receipts', 'waivers', 'resources'];
const _signedUrlCache = new Map();

/**
 * Cached snapshots tracking known version/timestamp/state of config keys
 */
const _configSnapshots = {};

/**
 * Deep merge utility for array of objects by unique identifier (3-way merge)
 * Mitigates overwrite collisions when multiple clients update the same bb_config blob
 * @param {Array} baseList - The snapshot list when the client last fetched
 * @param {Array} currentRemoteList - The latest live remote state fetched from DB
 * @param {Array} clientUpdatedList - The new list the client intends to persist
 * @param {string} idProp - Identifier property ('id' or 'key')
 * @returns {Array} - Intelligently merged list
 */
function mergeConfigCollections(baseList, currentRemoteList, clientUpdatedList, idProp) {
  idProp = idProp || 'id';
  if (!Array.isArray(currentRemoteList) || !Array.isArray(clientUpdatedList)) {
    return clientUpdatedList;
  }
  if (!Array.isArray(baseList) || baseList.length === 0) {
    const clientMap = new Map();
    clientUpdatedList.forEach(item => {
      const id = item && item[idProp];
      if (id !== undefined && id !== null) clientMap.set(String(id), item);
    });

    const result = [...clientUpdatedList];
    currentRemoteList.forEach(remoteItem => {
      const id = remoteItem && remoteItem[idProp];
      if (id !== undefined && id !== null && !clientMap.has(String(id))) {
        result.push(remoteItem);
      }
    });
    return result;
  }

  const baseMap = new Map(baseList.map(item => [String(item[idProp]), item]));
  const remoteMap = new Map(currentRemoteList.map(item => [String(item[idProp]), item]));

  const merged = [];
  const processedIds = new Set();

  // 1. Process client items (preserves client ordering)
  clientUpdatedList.forEach(clientItem => {
    const id = String(clientItem[idProp]);
    processedIds.add(id);

    if (remoteMap.has(id)) {
      const remoteItem = remoteMap.get(id);
      const baseItem = baseMap.get(id);
      // Check if remote modified it concurrently
      if (
        baseItem &&
        JSON.stringify(baseItem) !== JSON.stringify(remoteItem) &&
        JSON.stringify(clientItem) === JSON.stringify(baseItem)
      ) {
        // Client did not change this item, but remote did -> keep remote version
        merged.push(remoteItem);
      } else {
        // Client updated this item or remote didn't change -> keep client version
        merged.push(clientItem);
      }
    } else {
      // Item was added by client or deleted by remote
      if (baseMap.has(id)) {
        if (JSON.stringify(baseMap.get(id)) !== JSON.stringify(clientItem)) {
          merged.push(clientItem);
        }
      } else {
        merged.push(clientItem);
      }
    }
  });

  // 2. Add remote items that client never knew about (added concurrently by another user)
  currentRemoteList.forEach(remoteItem => {
    const id = String(remoteItem[idProp]);
    if (!processedIds.has(id)) {
      if (!baseMap.has(id)) {
        merged.push(remoteItem);
      }
    }
  });

  return merged;
}

function getSupaClient() {
  if (typeof window !== 'undefined' && window.supa) return window.supa;
  if (typeof global !== 'undefined' && global.supa) return global.supa;
  if (typeof supa !== 'undefined' && supa) return supa;
  return null;
}

/**
 * Request Throttling: Limits maximum concurrent HTTP requests to prevent socket exhaustion
 * Enhanced with 12s AbortController timeout boundaries and queue-abort de-registration.
 */
const MAX_CONCURRENT_REQUESTS = 12;
const DEFAULT_REQUEST_TIMEOUT_MS = 5000;
let _activeRequests = 0;
const _requestQueue = [];

async function throttledFetch(url, fetchOpts, timeoutMs) {
  fetchOpts = fetchOpts ? Object.assign({}, fetchOpts) : {};
  timeoutMs = timeoutMs || DEFAULT_REQUEST_TIMEOUT_MS;

  const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  let timeoutId = null;

  if (controller) {
    if (fetchOpts.signal) {
      if (fetchOpts.signal.aborted) {
        const err = new Error('The user aborted a request.');
        err.name = 'AbortError';
        throw err;
      }
      fetchOpts.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
    timeoutId = setTimeout(() => {
      controller.abort();
    }, timeoutMs);
    fetchOpts.signal = controller.signal;
  }

  if (_activeRequests >= MAX_CONCURRENT_REQUESTS) {
    await new Promise((resolve, reject) => {
      const queueItem = { resolve, reject };
      if (fetchOpts.signal) {
        const onAbort = () => {
          const idx = _requestQueue.indexOf(queueItem);
          if (idx !== -1) _requestQueue.splice(idx, 1);
          const err = new Error('The user aborted a request.');
          err.name = 'AbortError';
          reject(err);
        };
        fetchOpts.signal.addEventListener('abort', onAbort, { once: true });
      }
      _requestQueue.push(queueItem);
    });
  }

  _activeRequests++;
  try {
    return await fetch(url, fetchOpts);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    _activeRequests--;
    if (_requestQueue.length > 0) {
      const next = _requestQueue.shift();
      if (next && typeof next.resolve === 'function') {
        next.resolve();
      }
    }
  }
}

/**
 * In-memory TTL Query Cache & Request Coalescing
 */
const _queryCache = new Map();

/**
 * Global Circuit Breaker for Supabase Database Overload Protection
 * Trips when the server returns 544 DatabaseTimeout, 503 Service Unavailable, or AbortError timeouts.
 * Enforces a 60-second cooldown period where GET queries fail-fast (or return cached snapshots)
 * without bombarding the PostgreSQL connection pool on Supabase Nano compute.
 */
let _circuitBreakerOpenUntil = 0;
const CIRCUIT_BREAKER_COOLDOWN_MS = 60000;

function tripCircuitBreaker(reason) {
  _circuitBreakerOpenUntil = Date.now() + CIRCUIT_BREAKER_COOLDOWN_MS;
  if (typeof console !== 'undefined' && console.warn) {
    console.warn('[Supabase Circuit Breaker] Activated 60s cooldown due to: ' + reason);
  }
}

function isCircuitBreakerOpen() {
  return Date.now() < _circuitBreakerOpenUntil;
}

function resetCircuitBreaker() {
  _circuitBreakerOpenUntil = 0;
}

function getCacheKey(method, path, headers) {
  return `${method}:${path}:${headers ? JSON.stringify(headers) : ''}`;
}

function invalidateCache(tablePrefix) {
  if (!tablePrefix) {
    _queryCache.clear();
    return;
  }
  const prefix = tablePrefix.split('?')[0].toLowerCase();
  for (const key of Array.from(_queryCache.keys())) {
    if (key.toLowerCase().includes(prefix)) {
      _queryCache.delete(key);
    }
  }
}

function clearQueryCache() {
  _queryCache.clear();
}

const supa = {
  /**
   * PostgREST HTTP Request helper with Request Throttling, Exponential Backoff on HTTP 429/500,
   * and TTL Query Caching / Single-flight Coalescing
   */
  async req(method, path, body, extraHeaders, options) {
    options = options || {};
    const maxRetries = options.maxRetries !== undefined ? options.maxRetries : 3;
    const baseDelay = options.baseDelay || 150;
    const maxDelay = options.maxDelay || 3000;
    const shouldCache = method === 'GET' && options.cache !== false;
    const ttl = typeof options.ttl === 'number' ? options.ttl : 5000;

    const url =
      (typeof SUPA_URL !== 'undefined'
        ? SUPA_URL
        : typeof window !== 'undefined'
          ? window.SUPA_URL
          : '') +
      '/rest/v1/' +
      path;
    const key =
      typeof SUPA_KEY !== 'undefined'
        ? SUPA_KEY
        : typeof window !== 'undefined'
          ? window.SUPA_KEY
          : '';

    let preferHeader = '';
    if (method === 'POST') {
      preferHeader =
        path.indexOf('on_conflict') !== -1
          ? 'return=representation,resolution=merge-duplicates'
          : 'return=representation';
    }

    const headers = {
      apikey: key,
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json'
    };
    if (preferHeader) {
      headers['Prefer'] = preferHeader;
    }
    if (extraHeaders && typeof extraHeaders === 'object') {
      Object.assign(headers, extraHeaders);
    }

    // Auto-invalidate cache on mutation
    if (method !== 'GET') {
      invalidateCache(path);
    }

        const cKey = getCacheKey(method, path, headers);
    if (method === 'GET' && isCircuitBreakerOpen()) {
      const cached = _queryCache.get(cKey);
      if (cached && cached.data) {
        return cached.data !== null && typeof cached.data === 'object'
          ? JSON.parse(JSON.stringify(cached.data))
          : cached.data;
      }
      return null;
    }
    if (shouldCache) {
      const cached = _queryCache.get(cKey);
      if (cached) {
        if (Date.now() < cached.expiresAt) {
          return cached.data !== null && typeof cached.data === 'object'
            ? JSON.parse(JSON.stringify(cached.data))
            : cached.data;
        }
        if (cached.inFlightPromise) {
          return await cached.inFlightPromise;
        }
      }
    }

    const executeRequest = async () => {
      let attempt = 0;
      while (true) {
        try {
          const r = await throttledFetch(url, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined
          });

          // Handle rate limit (HTTP 429) and server errors (HTTP 500-599) with exponential backoff & jitter
          // Fail fast on HTTP 544 DatabaseTimeout to prevent cascading connection pool exhaustion
          if (r.status === 429 || (r.status >= 500 && r.status <= 599)) {
            if (r.status === 544) {
              tripCircuitBreaker('HTTP 544 DatabaseTimeout');
            }
            if (attempt < maxRetries && r.status !== 544) {
              attempt++;
              let delay = baseDelay * Math.pow(2, attempt) + Math.random() * 50;
              const retryAfter = r.headers && typeof r.headers.get === 'function' ? r.headers.get('Retry-After') : null;
              if (retryAfter) {
                const parsed = parseInt(retryAfter, 10);
                if (!isNaN(parsed)) delay = parsed * 1000;
              }
              await new Promise(res => setTimeout(res, Math.min(maxDelay, delay)));
              continue;
            }
            if (r.status >= 500) {
              tripCircuitBreaker('HTTP ' + r.status);
            }
            const e = await r.text();
            throw new Error(`HTTP ${r.status}: ${e}`);
          }

          if (!r.ok) {
            const e = await r.text();
            throw new Error(e);
          }

          const data = r.status === 204 ? null : await r.json();

          if (shouldCache) {
            _queryCache.set(cKey, {
              data: data !== null && typeof data === 'object' ? JSON.parse(JSON.stringify(data)) : data,
              expiresAt: Date.now() + ttl,
              inFlightPromise: null
            });
          }

          return data;
        } catch (err) {
          const isTimeout = err && (err.name === 'AbortError' || (err.message && (err.message.includes('aborted') || err.message.includes('timeout'))));
          if (isTimeout) {
            tripCircuitBreaker('Request Timeout');
          }
          const isNetworkError = err && (err.name === 'TypeError' || err.message === 'Failed to fetch');
          if (isNetworkError && attempt < maxRetries) {
            attempt++;
            const delay = Math.min(maxDelay, baseDelay * Math.pow(2, attempt) + Math.random() * 50);
            await new Promise(res => setTimeout(res, delay));
            continue;
          }
          if (shouldCache) {
            _queryCache.delete(cKey);
          }
          throw err;
        }
      }
    };

    if (shouldCache) {
      const inFlight = executeRequest();
      _queryCache.set(cKey, {
        data: null,
        expiresAt: 0,
        inFlightPromise: inFlight
      });
      return await inFlight;
    }

    return await executeRequest();
  },

  get(path, options) {
    if (options && typeof options === 'object') {
      return supa.req('GET', path, null, options.extraHeaders, options);
    }
    return supa.req('GET', path);
  },

  /**
   * Supabase query with content-range header parsing for total records
   */
  async queryWithCount(method, path, body, extraHeaders, _options) {
    const url =
      (typeof SUPA_URL !== 'undefined'
        ? SUPA_URL
        : typeof window !== 'undefined'
          ? window.SUPA_URL
          : '') +
      '/rest/v1/' +
      path;
    const key =
      typeof SUPA_KEY !== 'undefined'
        ? SUPA_KEY
        : typeof window !== 'undefined'
          ? window.SUPA_KEY
          : '';

    const headers = {
      apikey: key,
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json',
      Prefer: 'count=exact'
    };
    if (extraHeaders && typeof extraHeaders === 'object') {
      Object.assign(headers, extraHeaders);
    }

    const r = await throttledFetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });

    if (!r.ok) {
      const e = await r.text();
      throw new Error(e);
    }

    const data = r.status === 204 ? null : await r.json();
    let total = null;
    const contentRange = r.headers && typeof r.headers.get === 'function' ? r.headers.get('content-range') : null;
    if (contentRange) {
      const parts = contentRange.split('/');
      if (parts[1]) {
        const parsed = parseInt(parts[1], 10);
        if (!isNaN(parsed)) total = parsed;
      }
    }

    return {
      data,
      total: total !== null ? total : (Array.isArray(data) ? data.length : 0),
      status: r.status
    };
  },

  /**
   * Supabase pagination helper (limit/offset) with count resolution
   * @param {string} table - Table name (e.g. 'bb_members', 'bb_orders')
   * @param {Object} [options]
   * @param {number} [options.page=1] - 1-based page index
   * @param {number} [options.pageSize=20] - Records per page
   * @param {string} [options.select='*'] - PostgREST select expression
   * @param {string} [options.order] - Sorting expression
   * @param {string} [options.filter] - Additional PostgREST filter string
   * @returns {Promise<{data: Array, page: number, pageSize: number, total: number, totalPages: number, hasMore: boolean, offset: number}>}
   */
  async paginate(table, options) {
    options = options || {};
    const page = Math.max(1, parseInt(options.page, 10) || 1);
    const pageSize = Math.max(1, Math.min(100, parseInt(options.pageSize, 10) || 20));
    const offset = (page - 1) * pageSize;
    const select = options.select || '*';
    const order = options.order ? '&order=' + options.order : '';
    const filter = options.filter ? '&' + options.filter.replace(/^&/, '') : '';

    const path = `${table}?select=${select}&limit=${pageSize}&offset=${offset}${order}${filter}`;

    const res = await supa.queryWithCount('GET', path, null, options.extraHeaders, options);
    const data = res.data || [];
    const total = res.total !== null ? res.total : data.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return {
      data,
      page,
      pageSize,
      total,
      totalPages,
      hasMore: page < totalPages,
      offset
    };
  },

  clearQueryCache,
  invalidateCache,
  throttledFetch,
  MAX_CONCURRENT_REQUESTS,

  post(path, body) {
    return supa.req('POST', path, body);
  },

  patch(path, body) {
    return supa.req('PATCH', path, body);
  },

  delete(path) {
    return supa.req('DELETE', path);
  },

  upsert(table, body, onConflict) {
    var conflictParam = onConflict ? '?on_conflict=' + encodeURIComponent(onConflict) : '';
    return supa.req('POST', table + conflictParam, body, {
      Prefer: 'return=representation,resolution=merge-duplicates'
    });
  },

  /**
   * PostgREST Remote Procedure Call (RPC) execution
   * Invokes a PostgreSQL function via /rest/v1/rpc/<funcName>
   * @param {string} funcName - Function name in database schema
   * @param {Object} [params={}] - Parameters passed to the RPC function in JSON body
   * @param {Object} [options={}] - Optional request options
   * @returns {Promise<any>}
   */
  rpc(funcName, params, options) {
    options = options || {};
    var client = this && typeof this.req === 'function' ? this : supa;
    var path = 'rpc/' + encodeURIComponent(funcName);
    var body = params !== undefined && params !== null ? params : {};
    return client.req('POST', path, body, options.extraHeaders, options);
  },

  /**
   * Records a snapshot of a config blob for future concurrency checks
   * @param {string} key
   * @param {any} data
   */
  recordConfigSnapshot(key, data) {
    if (!key) return;
    try {
      _configSnapshots[key] = JSON.parse(JSON.stringify(data));
    } catch (e) {
      _configSnapshots[key] = data;
    }
  },

  /**
   * Retrieves a config snapshot
   * @param {string} key
   * @returns {any}
   */
  /**
   * Retrieves a parsed config value from bb_config table
   * @param {string} key
   * @returns {Promise<any>}
   */
  async getConfig(key) {
    if (!key) return null;
    try {
      const client = (this && typeof this.get === 'function') ? this : supa;
      const rows = await client.get('bb_config?key=eq.' + encodeURIComponent(key) + '&select=value');
      if (Array.isArray(rows) && rows.length > 0 && rows[0] && rows[0].value !== undefined) {
        try {
          return JSON.parse(rows[0].value);
        } catch (_) {
          return rows[0].value;
        }
      }
    } catch (e) {
      console.warn('getConfig error for ' + key + ':', e.message);
    }
    return null;
  },

  /**
   * Upserts a config value to bb_config table
   * @param {string} key
   * @param {any} value
   * @returns {Promise<boolean>}
   */
  async setConfig(key, value) {
    if (!key) return false;
    try {
      const client = (this && typeof this.upsert === 'function') ? this : supa;
      const valStr = typeof value === 'string' ? value : JSON.stringify(value);
      if (typeof client.upsert === 'function') {
        await client.upsert('bb_config', { key: key, value: valStr }, 'key');
        return true;
      }
      if (typeof client.req === 'function') {
        await client.req('POST', 'bb_config?on_conflict=key', { key: key, value: valStr }, {
          headers: { 'Prefer': 'resolution=merge-duplicates' }
        });
        return true;
      }
    } catch (e) {
      console.warn('setConfig error for ' + key + ':', e.message);
    }
    return false;
  },

  getConfigSnapshot(key) {
    return _configSnapshots[key] || null;
  },

  /**
   * Clears in-memory config snapshots (primarily for testing)
   */
  clearConfigSnapshots() {
    Object.keys(_configSnapshots).forEach(k => delete _configSnapshots[k]);
  },

  /**
   * Concurrency-safe retrieval of bb_config record with automatic local snapshot recording
   * @param {string} key
   * @param {any} fallback
   * @returns {Promise<any>}
   */
  getClient() {
    return getSupaClient();
  },

  async batchConfigGet(keys) {
    if (!Array.isArray(keys) || keys.length === 0) return {};
    const client = this && typeof this.get === 'function' ? this : supa;
    const inClause = keys.map(k => encodeURIComponent(k)).join(',');
    const result = {};
    try {
      const rows = await client.get('bb_config?key=in.(' + inClause + ')&select=key,value');
      if (Array.isArray(rows)) {
        rows.forEach(r => {
          if (!r || !r.key) return;
          try {
            result[r.key] = JSON.parse(r.value);
          } catch (_) {
            result[r.key] = r.value;
          }
          supa.recordConfigSnapshot(r.key, result[r.key]);
        });
      }
    } catch (e) {
      console.warn('batchConfigGet error:', e.message);
    }
    return result;
  },

  async safeConfigGet(key, fallback, options) {
    options = options || {};
    // Single-flight in-memory cache hit: If snapshot exists and force !== true, return immediately
    if (options.force !== true && _configSnapshots[key] !== undefined && _configSnapshots[key] !== null) {
      try {
        return JSON.parse(JSON.stringify(_configSnapshots[key]));
      } catch (_) {
        return _configSnapshots[key];
      }
    }

    const client = this && typeof this.get === 'function' ? this : supa;
    try {
      const rows = await client.get(
        'bb_config?key=eq.' + encodeURIComponent(key) + '&select=key,value',
        options
      );
      if (rows && rows.length > 0 && rows[0].value) {
        try {
          const parsed = JSON.parse(rows[0].value);
          supa.recordConfigSnapshot(key, parsed);
          return parsed;
        } catch (e) {
          supa.recordConfigSnapshot(key, rows[0].value);
          return rows[0].value;
        }
      }
    } catch (e) {
      console.warn('safeConfigGet error for ' + key + ':', e.message);
    }
    supa.recordConfigSnapshot(key, fallback || null);
    return fallback !== undefined ? fallback : null;
  },

  /**
   * Concurrency-safe mutator for bb_config JSON blobs with sequential key locking,
   * optimistic 3-way merge conflict resolution, and retry protection
   * @param {string} key - Config key in bb_config (e.g. 'bb_resources', 'bb_custom_forms')
   * @param {Function|Array|Object} updater - Function receiving (currentRemote, baseSnapshot) or direct updated value
   * @param {Object} [options]
   * @param {string} [options.idProp='id'] - Property used as item identifier ('id' or 'key')
   * @param {boolean} [options.enableMerge=true] - Whether to perform 3-way merge on concurrent changes
   * @param {number} [options.maxRetries=3] - Maximum retry attempts upon collision
   * @returns {Promise<any>} The persisted value
   */
  async safeConfigUpdate(key, updater, options) {
    const client = this && typeof this.get === 'function' ? this : supa;
    options = options || {};
    const idProp = options.idProp || 'id';
    const enableMerge = options.enableMerge !== false;
    const maxRetries = options.maxRetries || 3;

    if (!_configLocks[key]) {
      _configLocks[key] = Promise.resolve();
    }

    const runUpdate = async () => {
      let attempt = 0;
      while (attempt < maxRetries) {
        attempt++;
        try {
          let currentRemote = null;
          try {
            const rows = await client.get(
              'bb_config?key=eq.' + encodeURIComponent(key) + '&select=key,value'
            );
            if (rows && rows.length > 0 && rows[0].value) {
              try {
                currentRemote = JSON.parse(rows[0].value);
              } catch (e) {
                currentRemote = rows[0].value;
              }
            }
          } catch (fetchErr) {
            console.warn('safeConfigUpdate read error:', fetchErr.message);
          }

          const baseSnapshot = _configSnapshots[key] || null;

          let nextValue;
          if (typeof updater === 'function') {
            nextValue = updater(currentRemote, baseSnapshot);
          } else if (enableMerge && Array.isArray(updater) && Array.isArray(currentRemote)) {
            nextValue = mergeConfigCollections(baseSnapshot, currentRemote, updater, idProp);
          } else {
            nextValue = updater;
          }

          const serialized = typeof nextValue === 'string' ? nextValue : JSON.stringify(nextValue);

          await client.upsert(
            'bb_config',
            {
              key: key,
              value: serialized
            },
            'key'
          );

          if (client.recordConfigSnapshot) {
            client.recordConfigSnapshot(key, nextValue);
          } else {
            supa.recordConfigSnapshot(key, nextValue);
          }
          return nextValue;
        } catch (err) {
          if (attempt >= maxRetries) {
            throw err;
          }
          await new Promise(r => setTimeout(r, 40 * Math.pow(2, attempt) + Math.random() * 20));
        }
      }
    };

    const currentLock = _configLocks[key];
    const nextLock = currentLock.then(runUpdate, runUpdate);
    _configLocks[key] = nextLock.catch(() => {});
    return nextLock;
  },

  /**
   * 3-way collection merge utility export
   */
  mergeConfigCollections,

  PRIVATE_STORAGE_BUCKETS,

  /**
   * Supabase Storage: Upload a file/blob to a bucket with strict security verification
   */
  async uploadFile(bucket, filePath, blob) {
    if (typeof validateFileSecurity === 'function') {
      await validateFileSecurity(blob, {
        bucket: bucket,
        allowVideo: bucket === 'gallery' || bucket === 'story_highlights',
        allowPdf: bucket === 'resources' || bucket === 'waivers'
      });
    }

    const url =
      (typeof SUPA_URL !== 'undefined'
        ? SUPA_URL
        : typeof window !== 'undefined'
          ? window.SUPA_URL
          : '') +
      '/storage/v1/object/' +
      bucket +
      '/' +
      filePath;
    const key =
      typeof SUPA_KEY !== 'undefined'
        ? SUPA_KEY
        : typeof window !== 'undefined'
          ? window.SUPA_KEY
          : '';

    const contentType = blob && blob.type ? blob.type : 'application/octet-stream';

    // Tier 1: Try POST with x-upsert: true
    let r = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: 'Bearer ' + key,
        'Content-Type': contentType,
        'x-upsert': 'true'
      },
      body: blob
    });

    // Tier 2: If x-upsert fails with 403 or 400 (e.g. missing UPDATE policy on storage.objects),
    // try direct PUT update (updates existing object without compound upsert check)
    if (!r.ok && (r.status === 403 || r.status === 400)) {
      try {
        const putRes = await fetch(url, {
          method: 'PUT',
          headers: {
            apikey: key,
            Authorization: 'Bearer ' + key,
            'Content-Type': contentType
          },
          body: blob
        });
        if (putRes.ok) {
          return putRes.json();
        }
      } catch (_) {}

      // Tier 3: Try standard POST without x-upsert
      try {
        const plainPostRes = await fetch(url, {
          method: 'POST',
          headers: {
            apikey: key,
            Authorization: 'Bearer ' + key,
            'Content-Type': contentType
          },
          body: blob
        });
        if (plainPostRes.ok) {
          return plainPostRes.json();
        }
      } catch (_) {}
    }

    if (!r.ok) {
      const e = await r.text();
      let parsedMsg = e;
      try {
        const parsed = JSON.parse(e);
        parsedMsg = parsed.message || parsed.error || e;
      } catch (_) {}
      throw new Error(parsedMsg);
    }
    return r.json();
  },

  /**
   * Supabase Storage: Get URL for a file (respects Private buckets & signed URL cache)
   */
  fileUrl(bucket, filePath, options) {
    options = options || {};
    const cacheKey = bucket + '/' + filePath;
    if (_signedUrlCache.has(cacheKey)) {
      const entry = _signedUrlCache.get(cacheKey);
      if (entry && entry.expiresAt > Date.now()) {
        return entry.signedUrl;
      }
    }

    const isPrivate =
      options.private !== false &&
      (options.private === true || PRIVATE_STORAGE_BUCKETS.includes(bucket));
    const baseUrl =
      typeof SUPA_URL !== 'undefined'
        ? SUPA_URL
        : typeof window !== 'undefined'
          ? window.SUPA_URL
          : '';

    if (isPrivate) {
      return baseUrl + '/storage/v1/object/authenticated/' + bucket + '/' + filePath;
    }
    return baseUrl + '/storage/v1/object/public/' + bucket + '/' + filePath;
  },

  /**
   * Supabase Storage: Create a signed URL for private bucket objects
   * @param {string} bucket - Target bucket ('avatars', 'gallery', 'receipts', etc.)
   * @param {string} filePath - Object path inside bucket
   * @param {number} [expiresIn=3600] - Expiration duration in seconds (default 1 hour)
   * @returns {Promise<{signedUrl: string, error: any}>}
   */
  async createSignedUrl(bucket, filePath, expiresIn) {
    expiresIn = expiresIn || 3600;
    const cacheKey = bucket + '/' + filePath;
    if (_signedUrlCache.has(cacheKey)) {
      const entry = _signedUrlCache.get(cacheKey);
      if (entry && entry.expiresAt > Date.now()) {
        return { signedUrl: entry.signedUrl, error: null };
      }
    }

    const baseUrl =
      typeof SUPA_URL !== 'undefined'
        ? SUPA_URL
        : typeof window !== 'undefined'
          ? window.SUPA_URL
          : '';
    const key =
      typeof SUPA_KEY !== 'undefined'
        ? SUPA_KEY
        : typeof window !== 'undefined'
          ? window.SUPA_KEY
          : '';

    const url = baseUrl + '/storage/v1/object/sign/' + bucket + '/' + filePath;

    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: {
          apikey: key,
          Authorization: 'Bearer ' + key,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ expiresIn: expiresIn })
      });

      if (!r.ok) {
        return { signedUrl: null, error: new Error('Failed to create signed URL: HTTP ' + r.status) };
      }

      const res = await r.json();
      const signedPath = res.signedURL || res.signedUrl;
      let fullUrl = signedPath;
      if (!signedPath) {
        fullUrl = baseUrl + '/storage/v1/object/sign/' + bucket + '/' + filePath + '?token=auth_' + Date.now();
      } else if (signedPath.startsWith('http://') || signedPath.startsWith('https://')) {
        fullUrl = signedPath;
      } else if (signedPath.startsWith('/storage/v1')) {
        fullUrl = baseUrl + signedPath;
      } else if (signedPath.startsWith('/object')) {
        fullUrl = baseUrl + '/storage/v1' + signedPath;
      } else {
        fullUrl = baseUrl + '/storage/v1/' + signedPath.replace(/^\/+/, '');
      }

      _signedUrlCache.set(cacheKey, {
        signedUrl: fullUrl,
        expiresAt: Date.now() + expiresIn * 1000 - 30000
      });

      return { signedUrl: fullUrl, error: null };
    } catch (err) {
      console.warn('createSignedUrl error:', err.message);
      const fallbackUrl = baseUrl + '/storage/v1/object/authenticated/' + bucket + '/' + filePath;
      return { signedUrl: fallbackUrl, error: err };
    }
  },

  /**
   * Supabase Storage: Batch create signed URLs for multiple private bucket objects
   * @param {string} bucket - Target bucket
   * @param {string[]} filePaths - Array of object paths inside bucket
   * @param {number} [expiresIn=3600]
   * @returns {Promise<Array<{path: string, signedUrl: string, error: any}>>}
   */
  async createSignedUrls(bucket, filePaths, expiresIn) {
    if (!Array.isArray(filePaths) || filePaths.length === 0) return [];
    expiresIn = expiresIn || 3600;
    const baseUrl =
      typeof SUPA_URL !== 'undefined'
        ? SUPA_URL
        : typeof window !== 'undefined'
          ? window.SUPA_URL
          : '';
    const key =
      typeof SUPA_KEY !== 'undefined'
        ? SUPA_KEY
        : typeof window !== 'undefined'
          ? window.SUPA_KEY
          : '';

    const url = baseUrl + '/storage/v1/object/sign/' + bucket;

    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: {
          apikey: key,
          Authorization: 'Bearer ' + key,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ paths: filePaths, expiresIn: expiresIn })
      });

      if (!r.ok) {
        return filePaths.map(p => ({
          path: p,
          signedUrl: null,
          error: new Error('Failed to batch sign URLs: HTTP ' + r.status)
        }));
      }

      const res = await r.json();
      return (Array.isArray(res) ? res : []).map(item => {
        const p = item.path;
        const signedPath = item.signedURL || item.signedUrl;
        let fullUrl = '';
        if (signedPath) {
          if (signedPath.startsWith('http://') || signedPath.startsWith('https://')) {
            fullUrl = signedPath;
          } else if (signedPath.startsWith('/storage/v1')) {
            fullUrl = baseUrl + signedPath;
          } else {
            fullUrl = baseUrl + '/storage/v1/' + signedPath.replace(/^\/+/, '');
          }
          _signedUrlCache.set(bucket + '/' + p, {
            signedUrl: fullUrl,
            expiresAt: Date.now() + expiresIn * 1000 - 30000
          });
        }
        return {
          path: p,
          signedUrl: fullUrl,
          error: item.error || null
        };
      });
    } catch (err) {
      console.warn('createSignedUrls batch error:', err.message);
      return filePaths.map(p => ({
        path: p,
        signedUrl: baseUrl + '/storage/v1/object/authenticated/' + bucket + '/' + p,
        error: err
      }));
    }
  },

  /**
   * Supabase Storage: Resolves a private media URL into a valid signed URL
   */
  async resolveMediaUrl(bucket, filePath, expiresIn) {
    const res = await this.createSignedUrl(bucket, filePath, expiresIn);
    return res.signedUrl;
  },

  clearSignedUrlCache() {
    _signedUrlCache.clear();
  },
  /**
   * Supabase Storage: Delete a file from a bucket
   */
  async deleteFile(bucket, filePath) {
    const url =
      (typeof SUPA_URL !== 'undefined'
        ? SUPA_URL
        : typeof window !== 'undefined'
          ? window.SUPA_URL
          : '') +
      '/storage/v1/object/' +
      bucket;
    const key =
      typeof SUPA_KEY !== 'undefined'
        ? SUPA_KEY
        : typeof window !== 'undefined'
          ? window.SUPA_KEY
          : '';

    const r = await fetch(url, {
      method: 'DELETE',
      headers: {
        apikey: key,
        Authorization: 'Bearer ' + key,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ prefixes: [filePath] })
    });
    return r.ok;
  }
};


// ── Realtime Synchronization Engine (Zero-Dependency) ──────────────────────
var PortalRealtime = (function() {
  var _ws = null;
  var _broadcastChannel = null;
  var _heartbeatTimer = null;
  var _deltaSyncTimer = null;
  var _reconnectAttempts = 0;
  var _refCounter = 1;
  var _lastEntityTimestamps = {};

  // 1. Cross-Tab Instant BroadcastChannel (0ms latency on same machine)
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      _broadcastChannel = new BroadcastChannel('bb_portal_realtime');
      _broadcastChannel.onmessage = function(ev) {
        if (!ev || !ev.data) return;
        var msg = ev.data;
        if (msg.type === 'PORTAL_REALTIME_CHANGE') {
          triggerEntityUpdate(msg.entity, msg.action, msg.data, true);
        }
      };
    } catch (_) {}
  }

  function broadcastLocalChange(entity, action, data) {
    if (_broadcastChannel) {
      try {
        _broadcastChannel.postMessage({
          type: 'PORTAL_REALTIME_CHANGE',
          entity: entity,
          action: action || 'update',
          data: data || null
        });
      } catch (_) {}
    }
  }

  // 2. Supabase Realtime WebSocket Connection (Instant cross-device push)
  function connectWebSocket() {
    if (typeof WebSocket === 'undefined') return;
    if (_ws && (_ws.readyState === WebSocket.OPEN || _ws.readyState === WebSocket.CONNECTING)) return;

    try {
      var sUrl = (typeof SUPA_URL !== 'undefined') ? SUPA_URL : (typeof window !== 'undefined' ? window.SUPA_URL : '');
      var sKey = (typeof SUPA_KEY !== 'undefined') ? SUPA_KEY : (typeof window !== 'undefined' ? window.SUPA_KEY : '');
      if (!sUrl || !sKey) return;

      var wsUrl = sUrl.replace(/^https?:\/\//, function(m) {
        return m.startsWith('https') ? 'wss://' : 'ws://';
      }) + '/realtime/v1/websocket?apikey=' + encodeURIComponent(sKey) + '&vsn=1.0.0';

      _ws = new WebSocket(wsUrl);

      _ws.onopen = function() {
        _reconnectAttempts = 0;
        // Join realtime:public channel to receive postgres change events
        var joinMsg = {
          topic: 'realtime:public',
          event: 'phx_join',
          payload: {
            config: {
              broadcast: { self: false },
              postgres_changes: [
                { event: '*', schema: 'public', table: 'bb_config' },
                { event: '*', schema: 'public', table: 'bb_tasks' },
                { event: '*', schema: 'public', table: 'bb_announcements' },
                { event: '*', schema: 'public', table: 'bb_members' }
              ]
            }
          },
          ref: String(_refCounter++)
        };
        _ws.send(JSON.stringify(joinMsg));

        // Phoenix WebSocket heartbeat every 25s
        if (_heartbeatTimer) clearInterval(_heartbeatTimer);
        _heartbeatTimer = setInterval(function() {
          if (_ws && _ws.readyState === WebSocket.OPEN) {
            _ws.send(JSON.stringify({
              topic: 'phoenix',
              event: 'heartbeat',
              payload: {},
              ref: String(_refCounter++)
            }));
          }
        }, 25000);
      };

      _ws.onmessage = function(event) {
        if (!event || !event.data) return;
        try {
          var data = JSON.parse(event.data);
          if (data.event === 'postgres_changes' && data.payload) {
            var payload = data.payload.data || data.payload;
            var table = payload.table;
            var record = payload.record || {};
            var oldRecord = payload.old_record || {};
            var evType = payload.type || payload.eventType || '';

            if (table === 'bb_config') {
              var key = record.key || oldRecord.key || '';
              if (key === 'bb_forum_posts') {
                triggerEntityUpdate('forum', 'update', record);
              } else if (key === 'bb_company_calendar') {
                triggerEntityUpdate('calendar', 'update', record);
              } else if (key.startsWith('bb_task_comments_')) {
                triggerEntityUpdate('comments', 'update', { key: key });
              } else if (key === 'bb_announcements') {
                triggerEntityUpdate('announcements', 'update', record);
              } else if (key === 'bb_admin_roles') {
                triggerEntityUpdate('roles', 'update', record);
              } else {
                triggerEntityUpdate('config', 'update', { key: key });
              }
            } else if (table === 'bb_tasks') {
              triggerEntityUpdate('tasks', evType || 'update', record);
            } else if (table === 'bb_announcements') {
              triggerEntityUpdate('announcements', evType || 'update', record);
            } else if (table === 'bb_members') {
              triggerEntityUpdate('members', evType || 'update', record);
            }
          }
        } catch (_) {}
      };

      _ws.onclose = function() {
        if (_heartbeatTimer) clearInterval(_heartbeatTimer);
        var delay = Math.min(10000, 1000 * Math.pow(2, _reconnectAttempts++));
        setTimeout(connectWebSocket, delay);
      };

      _ws.onerror = function() {
        try { _ws.close(); } catch (_) {}
      };
    } catch (_) {}
  }

  // 3. Smart Adaptive Delta Poller (25s interval, backoff on error, paused when hidden or WebSocket active)
  var _deltaSyncBackoff = 25000;

  async function checkDeltaSync() {
    if (typeof document !== 'undefined' && document.hidden) {
      scheduleNextDeltaSync(30000);
      return;
    }
    // If WebSocket is alive and receiving live events, skip polling
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      scheduleNextDeltaSync(120000);
      return;
    }
    if (_ws && _ws.readyState === 1) {
      scheduleNextDeltaSync(180000);
      return;
    }
    if (isCircuitBreakerOpen()) {
      scheduleNextDeltaSync(60000);
      return;
    }
    var client = (typeof getSupaClient === 'function') ? getSupaClient() : null;
    if (!client || typeof client.get !== 'function') {
      scheduleNextDeltaSync(30000);
      return;
    }

    try {
      var rows = await client.get('bb_config?key=in.(bb_company_calendar,bb_forum_posts,bb_announcements,bb_company_projects)&select=key,updated_at');
      if (Array.isArray(rows)) {
        rows.forEach(function(r) {
          if (!r.key) return;
          var ts = r.updated_at || '';
          if (_lastEntityTimestamps[r.key] && _lastEntityTimestamps[r.key] !== ts) {
            if (r.key === 'bb_company_calendar') triggerEntityUpdate('calendar', 'update');
            else if (r.key === 'bb_forum_posts') triggerEntityUpdate('forum', 'update');
            else if (r.key === 'bb_announcements') triggerEntityUpdate('announcements', 'update');
            else if (r.key === 'bb_company_projects') triggerEntityUpdate('projects', 'update');
          }
          _lastEntityTimestamps[r.key] = ts;
        });
      }

      var taskRows = await client.get('bb_tasks?select=id,updated_at&order=updated_at.desc&limit=1');
      if (Array.isArray(taskRows) && taskRows.length) {
        var tId = taskRows[0].id + ':' + (taskRows[0].updated_at || '');
        if (_lastEntityTimestamps['bb_tasks_latest'] && _lastEntityTimestamps['bb_tasks_latest'] !== tId) {
          triggerEntityUpdate('tasks', 'update');
        }
        _lastEntityTimestamps['bb_tasks_latest'] = tId;
      }

      var memberRows = await client.get('bb_members?select=ic,updated_at&order=updated_at.desc&limit=1');
      if (Array.isArray(memberRows) && memberRows.length) {
        var mKey = (memberRows[0].ic || '') + ':' + (memberRows[0].updated_at || '');
        if (_lastEntityTimestamps['bb_members_latest'] && _lastEntityTimestamps['bb_members_latest'] !== mKey) {
          triggerEntityUpdate('members', 'update', memberRows[0]);
        }
        _lastEntityTimestamps['bb_members_latest'] = mKey;
      }
      _deltaSyncBackoff = 90000;
    } catch (_) {
      // Back off on error to prevent database saturation
      _deltaSyncBackoff = Math.min(300000, _deltaSyncBackoff * 2);
    }
    scheduleNextDeltaSync(_deltaSyncBackoff);
  }

  function scheduleNextDeltaSync(delayMs) {
    if (_deltaSyncTimer) clearTimeout(_deltaSyncTimer);
    _deltaSyncTimer = setTimeout(checkDeltaSync, delayMs || 90000);
  }

  function startDeltaSync() {
    if (_deltaSyncTimer) clearTimeout(_deltaSyncTimer);
    _deltaSyncBackoff = 90000;
    scheduleNextDeltaSync(90000);
  }

  // 4. Central Realtime Dispatcher
  function triggerEntityUpdate(entity, action, data, fromBroadcast) {
    if (!fromBroadcast) {
      broadcastLocalChange(entity, action, data);
    }

    if (entity === 'calendar') {
      if (typeof window !== 'undefined' && typeof window.loadCalendarEvents === 'function') {
        window.loadCalendarEvents().then(function() {
          if (typeof window.renderCalendarWidget === 'function') window.renderCalendarWidget();
          if (typeof window.renderAdminCalendarGrid === 'function') window.renderAdminCalendarGrid();
          var pParade = document.getElementById('page-parade');
          if (pParade && pParade.style.display !== 'none' && typeof window.renderCalendarTab === 'function') {
            window.renderCalendarTab();
          }
        }).catch(function() {});
      }
    } else if (entity === 'forum') {
      if (typeof window !== 'undefined' && typeof window.loadForumPosts === 'function') {
        window.loadForumPosts().then(function() {
          var pForum = document.getElementById('page-forum');
          if (pForum && pForum.style.display !== 'none' && typeof window.renderForumFeed === 'function') {
            window.renderForumFeed();
          }
          if (typeof window.syncForumNotifications === 'function') {
            window.syncForumNotifications();
          }
          if (typeof window.renderNotifications === 'function') {
            window.renderNotifications();
          }
        }).catch(function() {});
      }
    } else if (entity === 'tasks' || entity === 'comments') {
      if (typeof window !== 'undefined' && typeof window.fetchAllRemoteTasks === 'function') {
        window.fetchAllRemoteTasks(true).catch(function() {});
      }
      if (typeof window !== 'undefined' && typeof window.fetchAllRemoteTaskComments === 'function') {
        window.fetchAllRemoteTaskComments().catch(function() {});
      }
    } else if (entity === 'announcements') {
      if (typeof window !== 'undefined' && typeof window.loadAnnouncements === 'function') {
        window.loadAnnouncements().then(function() {
          if (typeof window.renderAnnouncements === 'function') window.renderAnnouncements();
          if (typeof window.renderAdminAnnList === 'function') window.renderAdminAnnList();
          if (typeof window.syncAnnouncementNotifications === 'function') window.syncAnnouncementNotifications();
        }).catch(function() {});
      }
    } else if (entity === 'projects') {
      if (typeof window !== 'undefined' && typeof window.loadProjectsCatalog === 'function') {
        window.loadProjectsCatalog();
        if (typeof window.renderProjectsView === 'function') window.renderProjectsView();
      }
    } else if (entity === 'members') {
      var sessGetFn = (typeof sessionGet === 'function')
        ? sessionGet
        : (typeof window !== 'undefined' && typeof window.sessionGet === 'function')
          ? window.sessionGet
          : (typeof global !== 'undefined' && typeof global.sessionGet === 'function')
            ? global.sessionGet
            : null;

      var sessSetFn = (typeof sessionSet === 'function')
        ? sessionSet
        : (typeof window !== 'undefined' && typeof window.sessionSet === 'function')
          ? window.sessionSet
          : (typeof global !== 'undefined' && typeof global.sessionSet === 'function')
            ? global.sessionSet
            : null;

      if (data && data.ic) {
        try {
          var memCache = JSON.parse(localStorage.getItem('bb_members_cache') || '[]');
          if (Array.isArray(memCache)) {
            var updatedCache = false;
            memCache.forEach(function(m) {
              if (m.ic === data.ic || (data.name && m.name === data.name)) {
                if (data.name !== undefined) m.name = data.name;
                if (data.rank !== undefined) m.rank = data.rank;
                if (data.squad !== undefined) m.squad = data.squad;
                if (data.department !== undefined) m.department = data.department;
                if (data.section !== undefined) m.section = data.section;
                if (data.att_section !== undefined) m.att_section = data.att_section;
                updatedCache = true;
              }
            });
            if (updatedCache) localStorage.setItem('bb_members_cache', JSON.stringify(memCache));
          }
        } catch (_) {}
      }

      var currentIc = sessGetFn ? (sessGetFn('ic') || sessGetFn('email')) : '';
      var currentName = sessGetFn ? sessGetFn('name') : '';
      var isMe = (data && data.ic && currentIc && data.ic.toLowerCase() === currentIc.toLowerCase()) ||
                 (data && data.name && currentName && data.name.toLowerCase() === currentName.toLowerCase()) ||
                 !data || !data.ic;

      if (isMe) {
        if (data && data.ic) {
          if (data.name && sessSetFn) sessSetFn('name', data.name);
          if (data.rank !== undefined && sessSetFn) sessSetFn('rank', data.rank);
          if (data.squad !== undefined && sessSetFn) sessSetFn('squad', data.squad);
          if (data.department !== undefined && sessSetFn) sessSetFn('department', data.department);
          if ((data.att_section || data.section) && sessSetFn) sessSetFn('section', data.att_section || data.section);

          var sn = (typeof document !== 'undefined') ? document.getElementById('sidebar-user-name') : null;
          if (sn && data.name) sn.textContent = data.name;

          var effRank = data.rank !== undefined ? data.rank : (sessGetFn ? sessGetFn('rank') : '');
          var effSec = data.att_section || data.section || (sessGetFn ? sessGetFn('section') : '');
          var effSquad = data.squad !== undefined ? data.squad : (sessGetFn ? sessGetFn('squad') : '');
          var fmtSquadFn = (typeof formatPlatoonOrSquad === 'function')
            ? formatPlatoonOrSquad
            : (typeof window !== 'undefined' && typeof window.formatPlatoonOrSquad === 'function')
              ? window.formatPlatoonOrSquad
              : (typeof global !== 'undefined' && typeof global.formatPlatoonOrSquad === 'function')
                ? global.formatPlatoonOrSquad
                : null;
          var sqFmt = fmtSquadFn ? fmtSquadFn(effSquad, effSec) : (effSquad ? effSquad + ' Sq' : '');
          var badgeStr = (effRank ? effRank + (sqFmt || effSec ? ' · ' : '') : '') + (sqFmt || effSec || 'Member');
          var sb = (typeof document !== 'undefined') ? document.getElementById('sidebar-user-badge') : null;
          if (sb) sb.textContent = badgeStr;

          var rbacObj = (typeof RBAC !== 'undefined') ? RBAC : (typeof window !== 'undefined' && typeof window.RBAC !== 'undefined') ? window.RBAC : (typeof global !== 'undefined' ? global.RBAC : null);
          if (rbacObj && typeof rbacObj.renderHeaderRoleBadge === 'function') {
            try { rbacObj.renderHeaderRoleBadge(); } catch (_) {}
          }
          var checkTasksFn = (typeof checkTasksAccess === 'function')
            ? checkTasksAccess
            : (typeof window !== 'undefined' && typeof window.checkTasksAccess === 'function')
              ? window.checkTasksAccess
              : (typeof global !== 'undefined' && typeof global.checkTasksAccess === 'function')
                ? global.checkTasksAccess
                : null;
          if (checkTasksFn) {
            try { checkTasksFn(); } catch (_) {}
          }
        }

        if (!data || !data.department || !data.ic) {
          var refreshProfileFn = (typeof refreshLoggedInUserProfile === 'function')
            ? refreshLoggedInUserProfile
            : (typeof window !== 'undefined' && typeof window.refreshLoggedInUserProfile === 'function')
              ? window.refreshLoggedInUserProfile
              : (typeof global !== 'undefined' && typeof global.refreshLoggedInUserProfile === 'function')
                ? global.refreshLoggedInUserProfile
                : null;
          if (refreshProfileFn) {
            refreshProfileFn().catch(function() {});
          }
        }
      }

      if (typeof document !== 'undefined') {
        var admP = document.getElementById('page-admin');
        if (admP && admP.style.display !== 'none') {
          var loadAdminFn = (typeof window !== 'undefined' && typeof window.loadAdminMembers === 'function') ? window.loadAdminMembers : (typeof global !== 'undefined' && typeof global.loadAdminMembers === 'function' ? global.loadAdminMembers : null);
          var renderAdminFn = (typeof renderAdminList === 'function') ? renderAdminList : (typeof window !== 'undefined' ? window.renderAdminList : null);
          if (loadAdminFn && renderAdminFn) {
            loadAdminFn().then(function() {
              renderAdminFn();
            }).catch(function() {});
          }
        }
      }
    }

    if (typeof window !== 'undefined' && typeof window.syncAllPortalNotifications === 'function') {
      window.syncAllPortalNotifications();
    }
  }

  return {
    connect: function() {
      connectWebSocket();
      startDeltaSync();
    },
    broadcast: broadcastLocalChange,
    trigger: triggerEntityUpdate,
    checkDeltaSync: checkDeltaSync
  };
})();

// Attach to window and export
if (typeof window !== 'undefined') {
  window.PortalRealtime = PortalRealtime;
}

// Attach to window for global access across the app
if (typeof window !== 'undefined') {
  window.supa = supa;
  window.getSupaClient = getSupaClient;
  window.isCircuitBreakerOpen = isCircuitBreakerOpen;
  window.resetCircuitBreaker = resetCircuitBreaker;
  window.tripCircuitBreaker = tripCircuitBreaker;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    PortalRealtime,
    broadcastRealtime: PortalRealtime.broadcast,
    triggerRealtime: PortalRealtime.trigger,
    supa,
    getSupaClient,
    rpc: supa.rpc,
    mergeConfigCollections,
    recordConfigSnapshot: supa.recordConfigSnapshot,
    getConfig: supa.getConfig,
    setConfig: supa.setConfig,
    getConfigSnapshot: supa.getConfigSnapshot,
    clearConfigSnapshots: supa.clearConfigSnapshots,
    clearQueryCache: supa.clearQueryCache,
    invalidateCache: supa.invalidateCache,
    paginate: supa.paginate,
    throttledFetch,
    MAX_CONCURRENT_REQUESTS,
    PRIVATE_STORAGE_BUCKETS,
    createSignedUrl: supa.createSignedUrl,
    createSignedUrls: supa.createSignedUrls,
    resolveMediaUrl: supa.resolveMediaUrl,
    clearSignedUrlCache: supa.clearSignedUrlCache,
    isCircuitBreakerOpen,
    resetCircuitBreaker,
    tripCircuitBreaker
  };
}
