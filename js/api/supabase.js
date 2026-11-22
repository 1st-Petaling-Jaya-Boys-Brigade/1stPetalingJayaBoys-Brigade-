/**
 * 1st Petaling Jaya Boys' Brigade Portal
 * Supabase REST & Storage API Client with Concurrency Safety
 */

/**
 * In-memory concurrency locks per config key
 */
const _configLocks = Object.create(null);
const PRIVATE_STORAGE_BUCKETS = ['avatars', 'gallery', 'story_highlights', 'highlights', 'receipts', 'waivers', 'resources'];
const _signedUrlCache = new Map();

/**
 * Cached snapshots tracking known version/timestamp/state of config keys
 */
const _configSnapshots = Object.create(null);

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
 * A request holds its slot until its response is consumed or aborted.
 */
const MAX_CONCURRENT_REQUESTS = 12;
const DEFAULT_REQUEST_TIMEOUT_MS = 5000;
let _activeRequests = 0;
const _requestQueue = [];

function acquireRequestSlot(signal) {
  if (signal?.aborted) return Promise.reject(signal.reason || new DOMException('Request cancelled', 'AbortError'));
  if (_activeRequests < MAX_CONCURRENT_REQUESTS) {
    _activeRequests++;
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      const index = _requestQueue.indexOf(resume);
      if (index !== -1) _requestQueue.splice(index, 1);
      reject(signal.reason || new DOMException('Request cancelled', 'AbortError'));
    };
    const resume = () => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    _requestQueue.push(resume);
  });
}

async function throttledFetch(url, fetchOpts, timeoutMs, consumeResponse) {
  fetchOpts = Object.assign({}, fetchOpts);
  const external = fetchOpts.signal;
  const controller = new AbortController();
  const forwardAbort = () => controller.abort(external.reason);
  await acquireRequestSlot(external);
  external?.addEventListener('abort', forwardAbort, { once: true });
  if (external?.aborted) forwardAbort();

  const timeout = setTimeout(() => controller.abort(new DOMException('Database request timed out.', 'TimeoutError')), timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS);
  try {
    if (controller.signal.aborted) throw controller.signal.reason;
    const response = await fetch(url, { ...fetchOpts, signal: controller.signal });
    return consumeResponse ? await consumeResponse(response) : response;
  } catch (error) {
    if (controller.signal.aborted) throw controller.signal.reason || error;
    throw error;
  } finally {
    clearTimeout(timeout);
    external?.removeEventListener('abort', forwardAbort);
    const next = _requestQueue.shift();
    if (next) next();
    else _activeRequests--;
  }
}

function emitDatabaseError(code, method, status) {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
    window.dispatchEvent(new CustomEvent('bb:database-error', { detail: { code, method, status } }));
  }
}

function readDatabaseResponse(response) {
  if (response.ok) {
    if (response.status === 204) return null;
    if (typeof response.json === 'function') {
      return response.json().catch(function() {
        if (typeof response.text === 'function') {
          return response.text().then(function(body) {
            if (!body || !body.trim()) return null;
            try { return JSON.parse(body); } catch (_) { return body; }
          });
        }
        return null;
      });
    }
    if (typeof response.text === 'function') {
      return response.text().then(function(body) {
        if (!body || !body.trim()) return null;
        try { return JSON.parse(body); } catch (_) { return body; }
      });
    }
    return null;
  }
  if (typeof response.text === 'function') {
    return response.text().then(function(body) {
      var error = new Error(response.status >= 500 ? 'Database unavailable (HTTP ' + response.status + ').' : 'Database rejected the request.');
      try {
        var info = JSON.parse(body);
        if (info && typeof info.code === 'string') {
          error.code = info.code;
          // Keep schema compatibility errors recognizable without returning row values.
          if (['PGRST204', '42703'].includes(info.code) && typeof info.message === 'string') error.message = info.code + ': ' + info.message;
          else error.message += ' (' + info.code + ')';
        }
      } catch (_) {}
      error.status = response.status;
      if (response.headers?.get('X-BB-Offline') === 'true') error.code = 'offline';
      error.retryAfter = response.headers?.get('Retry-After');
      throw error;
    });
  }
  var error = new Error(response.status >= 500 ? 'Database unavailable (HTTP ' + response.status + ').' : 'Database rejected the request.');
  error.status = response.status;
  if (response.headers?.get('X-BB-Offline') === 'true') error.code = 'offline';
  error.retryAfter = response.headers?.get('Retry-After');
  return Promise.reject(error);
}

function cloneQueryData(value) {
  return value !== null && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value;
}

const MAX_CACHED_QUERIES = 256;

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
  const prefix = '/rest/v1/' + tablePrefix.split('?')[0].toLowerCase();
  for (const key of Array.from(_queryCache.keys())) {
    if (key.toLowerCase().includes(prefix + '?') || key.toLowerCase().includes(prefix + ':')) {
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
    const maxRetries = options.maxRetries ?? (method === 'GET' ? 3 : 0);
    const baseDelay = options.baseDelay ?? 150;
    const maxDelay = options.maxDelay ?? 3000;
    const cacheable = method === 'GET' && options.cache !== false && !options.signal;
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

    const cKey = getCacheKey(method, url, headers);
    if (method === 'GET' && isCircuitBreakerOpen()) {
      emitDatabaseError('circuit-open', method, null);
      return cacheable ? cloneQueryData(_queryCache.get(cKey)?.data ?? null) : null;
    }
    const cached = cacheable && _queryCache.get(cKey);
    if (cached) {
      if (cached.inFlightPromise) return cloneQueryData(await cached.inFlightPromise);
      if (Date.now() < cached.expiresAt) return cloneQueryData(cached.data);
    }

    if (method !== 'GET') invalidateCache(path);

    const serializedBody = body == null ? undefined : JSON.stringify(body);
    const executeRequest = async () => {
      for (let attempt = 0; ; attempt++) {
        try {
          if (options.signal?.aborted) throw options.signal.reason;
          if (method !== 'GET' && typeof navigator !== 'undefined' && navigator.onLine === false) {
            const error = new Error('You are offline. Reconnect and try again.');
            error.code = 'offline';
            throw error;
          }
          return await throttledFetch(url, {
            method,
            headers,
            signal: options.signal,
            body: serializedBody
          }, options.timeoutMs, readDatabaseResponse);
        } catch (error) {
          if (options.signal?.aborted || error?.name === 'AbortError') throw error;
          const status = error?.status;
          const timedOut = error?.name === 'TimeoutError';
          const network = error instanceof TypeError;
          const offline = error?.code === 'offline' || (network && typeof navigator !== 'undefined' && navigator.onLine === false);
          const retryable = timedOut || network || status === 429 || (status >= 500 && status <= 599 && status !== 544);
          if (!offline && retryable && attempt < maxRetries) {
            const retryAfter = error.retryAfter;
            const retryAt = typeof retryAfter === 'string' && /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : Date.parse(retryAfter) - Date.now();
            const delay = Number.isFinite(retryAt) ? Math.max(0, retryAt) : baseDelay * Math.pow(2, attempt) + Math.random() * 50;
            await new Promise(resolve => setTimeout(resolve, Math.min(maxDelay, delay)));
            continue;
          }
          if (!offline && (status === 544 || status === 503 || status === 504 || timedOut)) tripCircuitBreaker('Database temporarily unavailable');
          if (offline || timedOut || network || status === 429 || status >= 500) {
            emitDatabaseError(offline ? 'offline' : timedOut ? 'timeout' : network ? 'network' : 'http', method, status ?? null);
          }
          if (offline) {
            const offlineError = new Error('You are offline. Reconnect and try again.');
            offlineError.code = 'offline';
            throw offlineError;
          }
          throw error;
        }
      }
    };

    if (!cacheable) {
      try {
        return await executeRequest();
      } finally {
        if (method !== 'GET') invalidateCache(path);
      }
    }

    const entry = { data: cached ? cached.data : null, expiresAt: 0, inFlightPromise: executeRequest() };
    if (_queryCache.size >= MAX_CACHED_QUERIES) _queryCache.delete(_queryCache.keys().next().value);
    _queryCache.set(cKey, entry);
    try {
      const data = await entry.inFlightPromise;
      if (_queryCache.get(cKey) === entry) {
        entry.data = cloneQueryData(data);
        entry.expiresAt = Date.now() + ttl;
      }
      return cloneQueryData(data);
    } finally {
      entry.inFlightPromise = null;
      if (entry.expiresAt === 0 && entry.data === null && _queryCache.get(cKey) === entry) _queryCache.delete(cKey);
    }
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
  async queryWithCount(method, path, body, extraHeaders, options) {
    options = options || {};
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

    return throttledFetch(url, {
      method, headers, signal: options.signal,
      body: body == null ? undefined : JSON.stringify(body)
    }, options.timeoutMs, async function(response) {
      const data = await readDatabaseResponse(response);
      const range = response.headers?.get('content-range');
      const count = range ? Number.parseInt(range.split('/')[1], 10) : NaN;
      return { data, total: Number.isFinite(count) ? count : (Array.isArray(data) ? data.length : 0), status: response.status };
    }).catch(function(error) {
      if (error?.name !== 'AbortError' && !options.signal?.aborted) {
        const offline = error?.code === 'offline' || (typeof navigator !== 'undefined' && navigator.onLine === false);
        emitDatabaseError(offline ? 'offline' : error?.name === 'TimeoutError' ? 'timeout' : error?.status ? 'http' : 'network', method, error?.status ?? null);
      }
      throw error;
    });
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

  post(path, body, extraHeaders, options) {
    const headers = Object.assign({ Prefer: 'return=representation' }, extraHeaders);
    return supa.req('POST', path, body, headers, options);
  },

  patch(path, body, extraHeaders, options) {
    const headers = Object.assign({ Prefer: 'return=representation' }, extraHeaders);
    return supa.req('PATCH', path, body, headers, options);
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

  async batchConfigGet(keys, options) {
    if (!Array.isArray(keys) || keys.length === 0) return {};
    const client = this && typeof this.get === 'function' ? this : supa;
    const inClause = keys.map(k => encodeURIComponent(k)).join(',');
    const result = {};
    try {
      const rows = await client.get('bb_config?key=in.(' + inClause + ')&select=key,value', options);
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
    if (options.force === true) {
      options.cache = false;
      delete _configSnapshots[key];
    }
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
      if (options.signal?.aborted) throw e;
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
    const settledLock = nextLock.catch(() => {});
    _configLocks[key] = settledLock;
    try {
      return await nextLock;
    } finally {
      if (_configLocks[key] === settledLock) delete _configLocks[key];
    }
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
        allowPdf: bucket === 'resources' || bucket === 'waivers',
        allowDocs: bucket === 'resources' || bucket === 'waivers',
        allowImages: true
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
      if (entry && entry.expiresAt > Date.now() && entry.lifetime <= expiresIn) {
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
      const res = await throttledFetch(url, {
        method: 'POST',
        headers: {
          apikey: key,
          Authorization: 'Bearer ' + key,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ expiresIn: expiresIn })
      }, undefined, readDatabaseResponse);
      const signedPath = res.signedURL || res.signedUrl;
      let fullUrl = signedPath;
      if (!signedPath) throw new Error('Storage did not provide a signed URL.');
      if (signedPath.startsWith('http://') || signedPath.startsWith('https://')) {
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
        lifetime: expiresIn,
        expiresAt: Date.now() + expiresIn * 1000 - 30000
      });

      return { signedUrl: fullUrl, error: null };
    } catch (err) {
      console.warn('createSignedUrl error:', err.message);
      return { signedUrl: null, error: err };
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
            lifetime: expiresIn,
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
  var _reconnectTimer = null;
  var _broadcastChannel = null;
  var _heartbeatTimer = null;
  var _deltaSyncTimer = null;
  var _reconnectAttempts = 0;
  var _refCounter = 1;
  var _lastEntityTimestamps = {};
  var _realtimeTabId = 'rt_' + Math.random().toString(36).slice(2, 9) + '_' + Date.now();
  var _seenRealtimeMsgIds = new Set();
  var _pendingBroadcastQueue = [];

  // 1. Cross-Tab Instant BroadcastChannel (0ms latency on same machine)
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      _broadcastChannel = new BroadcastChannel('bb_portal_realtime');
      _broadcastChannel.onmessage = function(ev) {
        if (!ev || !ev.data) return;
        var msg = ev.data;
        if (msg.senderId && msg.senderId === _realtimeTabId) return;
        if (msg.msgId) {
          if (_seenRealtimeMsgIds.has(msg.msgId)) return;
          _seenRealtimeMsgIds.add(msg.msgId);
          if (_seenRealtimeMsgIds.size > 128) {
            var firstKey = _seenRealtimeMsgIds.keys().next().value;
            _seenRealtimeMsgIds.delete(firstKey);
          }
        }
        if (msg.type === 'PORTAL_REALTIME_CHANGE') {
          triggerEntityUpdate(msg.entity, msg.action, msg.data, true);
        }
      };
    } catch (_) {}
  }

  var _lastBroadcastTimes = {};
  var _BROADCAST_THROTTLE_MS = 1500;

  function broadcastLocalChange(entity, action, data) {
    var now = Date.now();
    // Flood protection: drop rapid bursts for the same entity
    if (_lastBroadcastTimes[entity] && (now - _lastBroadcastTimes[entity] < _BROADCAST_THROTTLE_MS)) {
      return;
    }
    _lastBroadcastTimes[entity] = now;

    var msgId = _realtimeTabId + ':' + entity + ':' + now + ':' + (++_refCounter);
    _seenRealtimeMsgIds.add(msgId);
    if (_seenRealtimeMsgIds.size > 256) {
      var firstKey = _seenRealtimeMsgIds.keys().next().value;
      _seenRealtimeMsgIds.delete(firstKey);
    }

    // 1. Cross-Tab Local BroadcastChannel (Same Device, 0ms)
    if (_broadcastChannel) {
      try {
        _broadcastChannel.postMessage({
          type: 'PORTAL_REALTIME_CHANGE',
          senderId: _realtimeTabId,
          msgId: msgId,
          entity: entity,
          action: action || 'update',
          data: data || null
        });
      } catch (_) {}
    }

    // 2. Cross-Device Supabase Realtime WebSocket Push (All Devices Worldwide)
    var broadcastMsg = JSON.stringify({
      topic: 'realtime:public',
      event: 'broadcast',
      payload: {
        type: 'broadcast',
        event: 'PORTAL_REALTIME_CHANGE',
        payload: {
          type: 'PORTAL_REALTIME_CHANGE',
          senderId: _realtimeTabId,
          msgId: msgId,
          entity: entity,
          action: action || 'update',
          data: data || null
        }
      },
      ref: String(_refCounter++)
    });

    if (_ws && _ws.readyState === WebSocket.OPEN) {
      try {
        _ws.send(broadcastMsg);
      } catch (_) {}
    } else {
      if (_pendingBroadcastQueue.length < 32) {
        _pendingBroadcastQueue.push(broadcastMsg);
      }
      connectWebSocket();
    }
  }

  function disconnectWebSocket() {
    clearTimeout(_reconnectTimer);
    if (_heartbeatTimer) clearInterval(_heartbeatTimer);
    if (_ws) {
      try {
        _ws.onclose = null;
        _ws.onerror = null;
        _ws.close();
      } catch (_) {}
      _ws = null;
    }
  }

  // 2. Supabase Realtime WebSocket Connection (Instant cross-device push)
  function connectWebSocket() {
    if (typeof WebSocket === 'undefined') return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    if (_ws && (_ws.readyState === WebSocket.OPEN || _ws.readyState === WebSocket.CONNECTING)) return;
    clearTimeout(_reconnectTimer);

    // Multi-Tab Coordination: Non-leader tabs receive updates instantly via BroadcastChannel (0ms latency).
    // Only the elected leader tab maintains an active WebSocket to prevent socket & memory exhaustion.
    var isLeaderFn = (typeof window !== 'undefined' && typeof window.isLeaderTab === 'function')
      ? window.isLeaderTab
      : (typeof global !== 'undefined' && typeof global.isLeaderTab === 'function')
        ? global.isLeaderTab
        : null;
    if (isLeaderFn && !isLeaderFn() && typeof BroadcastChannel !== 'undefined') {
      return;
    }

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
                { event: '*', schema: 'public', table: 'bb_orders' }
              ]
            }
          },
          ref: String(_refCounter++)
        };
        _ws.send(JSON.stringify(joinMsg));

        // Flush any queued broadcasts that were triggered before socket reached OPEN state
        while (_pendingBroadcastQueue.length > 0) {
          var pending = _pendingBroadcastQueue.shift();
          try { _ws.send(pending); } catch (_) {}
        }

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

          // 1. Supabase Cross-Device Broadcast Events
          if (data.event === 'broadcast' && data.payload) {
            var bPayload = (data.payload.payload && typeof data.payload.payload === 'object') ? data.payload.payload : data.payload;
            if (bPayload && bPayload.senderId && bPayload.senderId === _realtimeTabId) {
              return;
            }
            if (bPayload && bPayload.msgId) {
              if (_seenRealtimeMsgIds.has(bPayload.msgId)) return;
              _seenRealtimeMsgIds.add(bPayload.msgId);
              if (_seenRealtimeMsgIds.size > 256) {
                var firstKey = _seenRealtimeMsgIds.keys().next().value;
                _seenRealtimeMsgIds.delete(firstKey);
              }
            }
            if (bPayload && bPayload.entity) {
              triggerEntityUpdate(bPayload.entity, bPayload.action || 'update', bPayload.data || null, true);
              if (_broadcastChannel) {
                try {
                  _broadcastChannel.postMessage({
                    type: 'PORTAL_REALTIME_CHANGE',
                    senderId: bPayload.senderId || _realtimeTabId,
                    msgId: bPayload.msgId || (_realtimeTabId + ':' + bPayload.entity + ':' + Date.now()),
                    entity: bPayload.entity,
                    action: bPayload.action || 'update',
                    data: bPayload.data || null
                  });
                } catch (_) {}
              }
            }
            return;
          }

          // 2. Supabase Postgres Changes Events
          if (data.event === 'postgres_changes' && data.payload) {
            var payload = data.payload.data || data.payload;
            var table = payload.table;
            var record = payload.record || {};
            var oldRecord = payload.old_record || {};
            var evType = payload.type || payload.eventType || '';

            if (table === 'bb_config') {
              var key = record.key || oldRecord.key || '';
              if (key === 'bb_forum_posts') {
                triggerEntityUpdate('forum', 'update', record, true);
              } else if (key === 'bb_company_calendar') {
                triggerEntityUpdate('calendar', 'update', record, true);
              } else if (key.startsWith('bb_task_comments_')) {
                triggerEntityUpdate('comments', 'update', { key: key }, true);
              } else if (key === 'bb_projects') {
                triggerEntityUpdate('projects', 'update', null, true);
              } else if (key === 'bb_announcements' || key.startsWith('bb_announcements_')) {
                triggerEntityUpdate('announcements', 'update', record, true);
              } else if (key === 'bb_admin_roles') {
                triggerEntityUpdate('roles', 'update', record, true);
              } else if (key === 'bb_blocked_emails' || key === 'bb_deleted_members') {
                triggerEntityUpdate('blocklist', 'update', null, true);
              } else if (key === 'bb_master_attendance') {
                triggerEntityUpdate('attendance', 'update', null, true);
              } else if (key === 'bb_member_cosmetics') {
                triggerEntityUpdate('cosmetics', 'update', record, true);
              } else if (key === 'bb_custom_avatar_outlines') {
                triggerEntityUpdate('avatar_outlines', 'update', record, true);
              } else if (key === 'bb_custom_forms' || key.startsWith('bb_form_responses')) {
                triggerEntityUpdate('forms', 'update', record, true);
              } else if (key === 'bb_resources') {
                triggerEntityUpdate('resources', 'update', record, true);
              } else if (key.startsWith('bb_arcade_')) {
                triggerEntityUpdate('arcade', 'update', record, true);
              } else if (key === 'bb_badges' || key === 'bb_member_badges' || key === 'bb_presidents_reqs' || key === 'bb_deleted_badges') {
                triggerEntityUpdate('badges', 'update', record, true);
              } else if (key === 'bb_story_highlights' || key.startsWith('bb_story_')) {
                triggerEntityUpdate('gallery', 'update', record, true);
              } else if (key.startsWith('bb_notif_dismissed_')) {
                triggerEntityUpdate('notifications', 'update', record, true);
              } else if (key === 'bb_member_presence') {
                triggerEntityUpdate('presence', 'update', record, true);
              } else if (key === 'bb_member_pfps') {
                triggerEntityUpdate('pfps', 'update', record, true);
              } else {
                triggerEntityUpdate('config', 'update', { key: key }, true);
              }
            } else if (table === 'bb_tasks') {
              triggerEntityUpdate('tasks', evType || 'update', record, true);
            } else if (table === 'bb_announcements') {
              triggerEntityUpdate('announcements', evType || 'update', record, true);
            } else if (table === 'bb_members') {
              triggerEntityUpdate('members', evType || 'update', record, true);
            } else if (table === 'bb_orders') {
              triggerEntityUpdate('orders', evType || 'update', record, true);
            }
          }
        } catch (_) {}
      };

      var socket = _ws;
      _ws.onclose = function() {
        if (_ws !== socket) return;
        if (_heartbeatTimer) clearInterval(_heartbeatTimer);
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
        var delay = Math.min(10000, 1000 * Math.pow(2, _reconnectAttempts++));
        _reconnectTimer = setTimeout(connectWebSocket, delay);
      };

      _ws.onerror = function() {
        try { _ws.close(); } catch (_) {}
      };
    } catch (_) {}
  }

  // 3. Smart Adaptive Delta Poller (5s interval, backoff on error, paused when hidden or WebSocket active)
  var _deltaSyncBackoff = 5000;
  var _deltaSyncInFlight = false;

  async function checkDeltaSync() {
    if (_deltaSyncInFlight || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
    // Multi-Tab Coordination: Non-leader tabs receive updates via BroadcastChannel; leader runs delta poller
    var isLeaderFn = (typeof window !== 'undefined' && typeof window.isLeaderTab === 'function')
      ? window.isLeaderTab
      : (typeof global !== 'undefined' && typeof global.isLeaderTab === 'function')
        ? global.isLeaderTab
        : null;
    if (isLeaderFn && !isLeaderFn() && typeof BroadcastChannel !== 'undefined') {
      scheduleNextDeltaSync(120000);
      return;
    }
    // If tab is hidden, poll with 15s cadence so background alerts arrive promptly without skipping
    if (typeof document !== 'undefined' && (document.hidden || document.visibilityState === 'hidden')) {
      _deltaSyncBackoff = 15000;
    }
    if (isCircuitBreakerOpen()) {
      scheduleNextDeltaSync(60000);
      return;
    }
    var client = (typeof getSupaClient === 'function') ? getSupaClient() : null;
    if (!client || typeof client.get !== 'function') {
      scheduleNextDeltaSync(5000);
      return;
    }

    _deltaSyncInFlight = true;
    try {
      var rows = await client.get('bb_config?key=in.(bb_company_calendar,bb_forum_posts,bb_announcements,bb_announcements_pinned,bb_announcements_allowed_reactions,bb_announcements_images,bb_projects,bb_master_attendance,bb_member_cosmetics,bb_custom_avatar_outlines,bb_custom_forms,bb_resources,bb_badges,bb_story_highlights,bb_member_presence,bb_member_pfps)&select=key,updated_at', { cache: false });
      if (Array.isArray(rows)) {
        rows.forEach(function(r) {
          if (!r?.key) return;
          var ts = r.updated_at || '';
          if (_lastEntityTimestamps[r.key] && _lastEntityTimestamps[r.key] !== ts) {
            if (r.key === 'bb_company_calendar') triggerEntityUpdate('calendar', 'update', null, true);
            else if (r.key === 'bb_forum_posts') triggerEntityUpdate('forum', 'update', null, true);
            else if (r.key === 'bb_announcements' || r.key.startsWith('bb_announcements_')) triggerEntityUpdate('announcements', 'update', null, true);
            else if (r.key === 'bb_projects') triggerEntityUpdate('projects', 'update', null, true);
            else if (r.key === 'bb_master_attendance') triggerEntityUpdate('attendance', 'update', null, true);
            else if (r.key === 'bb_member_cosmetics') triggerEntityUpdate('cosmetics', 'update', null, true);
            else if (r.key === 'bb_custom_avatar_outlines') triggerEntityUpdate('avatar_outlines', 'update', null, true);
            else if (r.key === 'bb_custom_forms') triggerEntityUpdate('forms', 'update', null, true);
            else if (r.key === 'bb_resources') triggerEntityUpdate('resources', 'update', null, true);
            else if (r.key === 'bb_badges') triggerEntityUpdate('badges', 'update', null, true);
            else if (r.key === 'bb_story_highlights') triggerEntityUpdate('gallery', 'update', null, true);
            else if (r.key === 'bb_member_presence') triggerEntityUpdate('presence', 'update', null, true);
            else if (r.key === 'bb_member_pfps') triggerEntityUpdate('pfps', 'update', null, true);
          }
          _lastEntityTimestamps[r.key] = ts;
        });
      }

      var curUserKey = (typeof sessionGet === 'function') ? (sessionGet('email') || sessionGet('ic')) : null;
      if (curUserKey) {
        var cleanU = String(curUserKey).trim();
        var orderRows = null;
        try {
          orderRows = await client.get('bb_orders?select=id,status,created_at&ic=eq.' + encodeURIComponent(cleanU) + '&order=created_at.desc&limit=5', { cache: false });
        } catch (_) {
          orderRows = null;
        }
        if (Array.isArray(orderRows) && orderRows.length) {
          var ordKey = orderRows.map(function(o) { return o.id + ':' + (o.status || ''); }).join('|');
          if (_lastEntityTimestamps['bb_orders_latest'] && _lastEntityTimestamps['bb_orders_latest'] !== ordKey) {
            triggerEntityUpdate('orders', 'update', null, true);
          }
          _lastEntityTimestamps['bb_orders_latest'] = ordKey;
        }
      }

      var commentRows = await client.get('bb_config?key=like.bb_task_comments_*&select=key,updated_at&order=updated_at.desc&limit=10', { cache: false });
      if (Array.isArray(commentRows)) {
        commentRows.forEach(function(cr) {
          if (!cr?.key) return;
          var cts = cr.updated_at || '';
          if (_lastEntityTimestamps[cr.key] && _lastEntityTimestamps[cr.key] !== cts) {
            var cTid = cr.key.replace('bb_task_comments_', '');
            triggerEntityUpdate('comments', 'update', { taskId: cTid }, true);
          }
          _lastEntityTimestamps[cr.key] = cts;
        });
      }

      var annRows = await client.get('bb_announcements?select=id,created_at' + ',title,body,date&order=created_at.desc&limit=1', { cache: false });
      if (Array.isArray(annRows) && annRows.length) {
        var annKey = (annRows[0].id || '') + ':' + (annRows[0].created_at || '');
        if (_lastEntityTimestamps['bb_announcements_latest'] && _lastEntityTimestamps['bb_announcements_latest'] !== annKey) {
          triggerEntityUpdate('announcements', 'create', annRows[0], true);
        }
        _lastEntityTimestamps['bb_announcements_latest'] = annKey;
      }

      var taskRows = await client.get('bb_tasks?select=id,status,title&order=id.asc', { cache: false });
      if (Array.isArray(taskRows)) {
        var taskFp = taskRows.map(function(t) { return t.id + ':' + (t.status || ''); }).join('|');
        if (_lastEntityTimestamps['bb_tasks_fingerprint'] && _lastEntityTimestamps['bb_tasks_fingerprint'] !== taskFp) {
          triggerEntityUpdate('tasks', 'update', null, true);
        }
        _lastEntityTimestamps['bb_tasks_fingerprint'] = taskFp;
      }

      var memberRows = null;
      try {
        memberRows = await client.get('bb_members?select=ic,email,name,updated_at&order=updated_at.desc&limit=1', { cache: false });
      } catch (_) {
        try {
          memberRows = await client.get('bb_members?select=ic,email,name&limit=1', { cache: false });
        } catch (__) {
          memberRows = null;
        }
      }
      if (Array.isArray(memberRows) && memberRows.length) {
        var mKey = (memberRows[0].ic || '') + ':' + (memberRows[0].updated_at || '');
        if (_lastEntityTimestamps['bb_members_latest'] && _lastEntityTimestamps['bb_members_latest'] !== mKey) {
          triggerEntityUpdate('members', 'update', memberRows[0], true);
        }
        _lastEntityTimestamps['bb_members_latest'] = mKey;
      }

      var activeTid = (typeof window !== 'undefined' && window._activeDetailTaskId)
        ? window._activeDetailTaskId
        : ((typeof global !== 'undefined' && global._activeDetailTaskId) ? global._activeDetailTaskId : null);
      if (activeTid) {
        if (typeof window !== 'undefined' && typeof window.fetchRemoteTaskComments === 'function') {
          window.fetchRemoteTaskComments(activeTid).then(function() {
            if (typeof window.renderTaskComments === 'function') {
              window.renderTaskComments(activeTid);
            }
          }).catch(function() {});
        }
        var activeTaskRow = await client.get('bb_tasks?id=eq.' + encodeURIComponent(activeTid) + '&select=id,title,description,status,priority,due_date,estimate', { cache: false });
        if (Array.isArray(activeTaskRow)) {
          if (activeTaskRow.length === 0) {
            triggerEntityUpdate('tasks', 'delete', { id: activeTid }, true);
          } else {
            var at = activeTaskRow[0];
            var atKey = [at.id, at.title, at.status, at.priority, at.due_date, at.estimate, (at.description || '').length].join(':');
            if (_lastEntityTimestamps['bb_task_active_' + activeTid] && _lastEntityTimestamps['bb_task_active_' + activeTid] !== atKey) {
              triggerEntityUpdate('tasks', 'update', at, true);
            }
            _lastEntityTimestamps['bb_task_active_' + activeTid] = atKey;
          }
        }
      }
      var isWsActive = _ws && _ws.readyState === WebSocket.OPEN;
      _deltaSyncBackoff = isWsActive ? 60000 : 25000;
    } catch (_) {
      // Back off on error to prevent database saturation
      _deltaSyncBackoff = Math.min(120000, _deltaSyncBackoff * 2);
    } finally {
      _deltaSyncInFlight = false;
    }
    scheduleNextDeltaSync(_deltaSyncBackoff);
  }

  function scheduleNextDeltaSync(delayMs) {
    if (_deltaSyncTimer) clearTimeout(_deltaSyncTimer);
    _deltaSyncTimer = setTimeout(checkDeltaSync, delayMs || 25000);
  }

  function startDeltaSync() {
    if (_deltaSyncTimer) clearTimeout(_deltaSyncTimer);
    var isWsActive = _ws && _ws.readyState === WebSocket.OPEN;
    _deltaSyncBackoff = isWsActive ? 60000 : 25000;
    scheduleNextDeltaSync(_deltaSyncBackoff);
  }

  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('visibilitychange', function() {
      if (document.visibilityState === 'visible') {
        if (!_ws || _ws.readyState !== 1) {
          connectWebSocket();
        }
        checkDeltaSync();
        if (typeof window !== 'undefined' && window._activeDetailTaskId && typeof window.fetchRemoteTaskComments === 'function') {
          window.fetchRemoteTaskComments(window._activeDetailTaskId).then(function() {
            if (typeof window.renderTaskComments === 'function') {
              window.renderTaskComments(window._activeDetailTaskId);
            }
          }).catch(function() {});
        }
      }
    });
    document.addEventListener('resume', function() {
      if (!_ws || _ws.readyState !== 1) {
        connectWebSocket();
      }
      checkDeltaSync();
      if (typeof window !== 'undefined' && window._activeDetailTaskId && typeof window.fetchRemoteTaskComments === 'function') {
        window.fetchRemoteTaskComments(window._activeDetailTaskId).then(function() {
          if (typeof window.renderTaskComments === 'function') {
            window.renderTaskComments(window._activeDetailTaskId);
          }
        }).catch(function() {});
      }
    });
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('focus', function() {
        checkDeltaSync();
        if (typeof window !== 'undefined' && window._activeDetailTaskId && typeof window.fetchRemoteTaskComments === 'function') {
          window.fetchRemoteTaskComments(window._activeDetailTaskId).then(function() {
            if (typeof window.renderTaskComments === 'function') {
              window.renderTaskComments(window._activeDetailTaskId);
            }
          }).catch(function() {});
        }
      });
      window.addEventListener('online', function() {
        resetCircuitBreaker();
        connectWebSocket();
        checkDeltaSync();
      });
    }
  }

  // 4. Central Realtime Dispatcher
  function triggerEntityUpdate(entity, action, data, fromBroadcast) {
    if (!fromBroadcast) {
      broadcastLocalChange(entity, action, data);
    }

    if (entity === 'presence') {
      if (data && data.key && data.member) {
        if (typeof window !== 'undefined') {
          if (!window._globalPresenceMap) window._globalPresenceMap = {};
          window._globalPresenceMap[data.key] = data.member;
          try {
            var rawPres = localStorage.getItem('bb_member_presence');
            var mapPres = rawPres ? JSON.parse(rawPres) : {};
            mapPres[data.key] = data.member;
            localStorage.setItem('bb_member_presence', JSON.stringify(mapPres));
          } catch (_) {}
          if (typeof window.dispatchEvent === 'function') {
            window.dispatchEvent(new CustomEvent('bb:presence_updated', { detail: window._globalPresenceMap }));
          }
        }
        if (typeof global !== 'undefined') {
          if (!global._globalPresenceMap) global._globalPresenceMap = {};
          global._globalPresenceMap[data.key] = data.member;
        }
        var refreshDotsFn = (typeof refreshLivePresenceDots === 'function')
          ? refreshLivePresenceDots
          : (typeof window !== 'undefined' && typeof window.refreshLivePresenceDots === 'function' ? window.refreshLivePresenceDots : null);
        if (refreshDotsFn) {
          try { refreshDotsFn(); } catch (_) {}
        }
      } else {
        var fetchPresFn = (typeof fetchRemoteMemberPresence === 'function')
          ? fetchRemoteMemberPresence
          : (typeof window !== 'undefined' && typeof window.fetchRemoteMemberPresence === 'function' ? window.fetchRemoteMemberPresence : null);
        if (fetchPresFn) {
          fetchPresFn(true).catch(function() {});
        }
      }
      return;
    }

    if (entity === 'pfps') {
      if (data && data.photo_url !== undefined && typeof _memberPfpsMap !== 'undefined') {
        var normPhoto = data.photo_url ? ((typeof normalizeAvatarUrl === 'function') ? normalizeAvatarUrl(data.photo_url) : data.photo_url) : null;
        var pfpId = data.ic || data.id || data.email;
        if (normPhoto) {
          if (pfpId) _memberPfpsMap[pfpId.toLowerCase()] = normPhoto;
          if (data.ic) _memberPfpsMap[data.ic.toLowerCase()] = normPhoto;
          if (data.email) _memberPfpsMap[data.email.toLowerCase()] = normPhoto;
          if (data.name) _memberPfpsMap[data.name.trim().toLowerCase()] = normPhoto;
        } else {
          if (pfpId) delete _memberPfpsMap[pfpId.toLowerCase()];
          if (data.ic) delete _memberPfpsMap[data.ic.toLowerCase()];
          if (data.email) delete _memberPfpsMap[data.email.toLowerCase()];
          if (data.name) delete _memberPfpsMap[data.name.trim().toLowerCase()];
        }
        try {
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('bb_member_pfps', JSON.stringify(_memberPfpsMap));
          }
        } catch (_) {}

        var sessGetFn = (typeof sessionGet === 'function')
          ? sessionGet
          : (typeof window !== 'undefined' && typeof window.sessionGet === 'function' ? window.sessionGet : null);
        var curMyEmail = sessGetFn ? String(sessGetFn('email') || '').toLowerCase().trim() : '';
        var curMyIc = sessGetFn ? String(sessGetFn('ic') || '').toLowerCase().trim() : '';
        var isForMe = false;
        if (data.email && curMyEmail && data.email.toLowerCase().trim() === curMyEmail) isForMe = true;
        if (data.ic && curMyIc && data.ic.toLowerCase().trim() === curMyIc) isForMe = true;
        if (pfpId && ((curMyEmail && pfpId.toLowerCase().trim() === curMyEmail) || (curMyIc && pfpId.toLowerCase().trim() === curMyIc))) isForMe = true;

        if (isForMe) {
          var sessSetFn = (typeof sessionSet === 'function')
            ? sessionSet
            : (typeof window !== 'undefined' && typeof window.sessionSet === 'function' ? window.sessionSet : null);
          if (sessSetFn) sessSetFn('photo_url', normPhoto || '', { localOnly: true });
          if (typeof document !== 'undefined') {
            var mImg = document.getElementById('m-pfp-img');
            var mPh = document.getElementById('m-pfp-ph');
            var sImg = document.getElementById('sidebar-user-avatar-img');
            var sPh = document.getElementById('sidebar-user-avatar-ph');
            var nImg = document.getElementById('nav-avatar-img');
            var nPh = document.getElementById('nav-avatar-placeholder');
            var setImg = document.getElementById('settings-pfp-img');
            var setPh = document.getElementById('settings-pfp-ph');
            if (normPhoto) {
              if (mImg) { mImg.src = normPhoto; mImg.style.display = 'block'; }
              if (mPh) mPh.style.display = 'none';
              if (sImg) { sImg.src = normPhoto; sImg.style.display = 'block'; }
              if (sPh) sPh.style.display = 'none';
              if (nImg) { nImg.src = normPhoto; nImg.style.display = 'block'; }
              if (nPh) nPh.style.display = 'none';
              if (setImg) { setImg.src = normPhoto; setImg.style.display = 'block'; }
              if (setPh) setPh.style.display = 'none';
            } else {
              if (mImg) { mImg.src = ''; mImg.style.display = 'none'; }
              if (mPh) mPh.style.display = 'flex';
              if (sImg) { sImg.src = ''; sImg.style.display = 'none'; }
              if (sPh) sPh.style.display = 'flex';
              if (nImg) { nImg.src = ''; nImg.style.display = 'none'; }
              if (nPh) nPh.style.display = 'flex';
              if (setImg) { setImg.src = ''; setImg.style.display = 'none'; }
              if (setPh) setPh.style.display = 'flex';
            }
            if (typeof setRemovePfpButtonVisible === 'function') setRemovePfpButtonVisible(!!normPhoto);
          }
        }
      }
      var loadPfpsFn = (typeof loadMemberProfilePictures === 'function')
        ? loadMemberProfilePictures
        : (typeof window !== 'undefined' && typeof window.loadMemberProfilePictures === 'function' ? window.loadMemberProfilePictures : null);
      if (loadPfpsFn) {
        loadPfpsFn().then(function() {
          if (typeof window !== 'undefined') {
            if (typeof window.updateNavUserHeader === 'function') window.updateNavUserHeader();
            if (typeof window.refreshCurrentTasksView === 'function') window.refreshCurrentTasksView();
            if (typeof window.renderArcadeLeaderboardView === 'function') window.renderArcadeLeaderboardView();
          }
        }).catch(function() {});
      }
      return;
    }

    if (entity === 'orders') {
      var loadOrdersFn = (typeof window !== 'undefined' && typeof window.loadMemberOrders === 'function')
        ? window.loadMemberOrders
        : null;
      if (loadOrdersFn) {
        try { loadOrdersFn(); } catch (_) {}
      }
      if (typeof document !== 'undefined') {
        var admOverlay = document.getElementById('admin-overlay');
        var admPanel = document.getElementById('admin-panel');
        var isAdmOpen = (admOverlay && admOverlay.style.display !== 'none') || (admPanel && admPanel.style.display !== 'none');
        if (isAdmOpen && typeof window !== 'undefined' && typeof window.renderAdminOrders === 'function') {
          try { window.renderAdminOrders(true); } catch (_) {}
        }
      }
      return;
    }

    if (entity === 'forms') {
      if (typeof window !== 'undefined') {
        if (typeof window.loadCustomForms === 'function') {
          window.loadCustomForms(true).then(function() {
            var pForms = document.getElementById('page-forms');
            if (pForms && pForms.style.display !== 'none' && typeof window.renderFormsHub === 'function') {
              window.renderFormsHub();
            }
            var admOverlay = document.getElementById('admin-overlay');
            var admPanel = document.getElementById('admin-panel');
            var isAdmOpen = (admOverlay && admOverlay.style.display !== 'none') || (admPanel && admPanel.style.display !== 'none');
            if (isAdmOpen && typeof window.renderAdminForms === 'function') {
              window.renderAdminForms();
            }
          }).catch(function() {});
        }
        if (typeof window.renderGfResponsesTab === 'function') {
          try { window.renderGfResponsesTab(); } catch (_) {}
        }
        if (typeof window.loadMemberOrders === 'function') {
          try { window.loadMemberOrders(); } catch (_) {}
        }
      }
      return;
    }

    if (entity === 'resources') {
      if (typeof window !== 'undefined' && typeof window.loadResources === 'function') {
        window.loadResources(true).then(function() {
          var pRes = document.getElementById('page-resources');
          if (pRes && pRes.style.display !== 'none' && typeof window.renderResourcesPage === 'function') {
            window.renderResourcesPage();
          }
          var admOverlay = document.getElementById('admin-overlay');
          var admPanel = document.getElementById('admin-panel');
          var isAdmOpen = (admOverlay && admOverlay.style.display !== 'none') || (admPanel && admPanel.style.display !== 'none');
          if (isAdmOpen && typeof window.renderAdminResourcesList === 'function') {
            window.renderAdminResourcesList();
          }
        }).catch(function() {});
      }
      return;
    }

    if (entity === 'arcade') {
      var applyArcadeFn = (typeof window !== 'undefined' && typeof window.applyRealtimeArcadeStats === 'function')
        ? window.applyRealtimeArcadeStats
        : (typeof global !== 'undefined' && typeof global.applyRealtimeArcadeStats === 'function' ? global.applyRealtimeArcadeStats : null);
      if (applyArcadeFn && data) {
        try { applyArcadeFn(data); } catch (_) {}
      }

      var syncArcadeFn = (typeof window !== 'undefined' && typeof window.syncArcadeLeaderboard === 'function')
        ? window.syncArcadeLeaderboard
        : (typeof global !== 'undefined' && typeof global.syncArcadeLeaderboard === 'function' ? global.syncArcadeLeaderboard : null);
      var renderArcadeFn = (typeof window !== 'undefined' && typeof window.renderArcadeLeaderboardView === 'function')
        ? window.renderArcadeLeaderboardView
        : (typeof global !== 'undefined' && typeof global.renderArcadeLeaderboardView === 'function' ? global.renderArcadeLeaderboardView : null);

      if (syncArcadeFn) {
        syncArcadeFn().then(function() {
          if (renderArcadeFn) renderArcadeFn();
        }).catch(function() {});
      } else if (renderArcadeFn) {
        renderArcadeFn();
      }
      return;
    }

    if (entity === 'badges') {
      if (typeof window !== 'undefined') {
        var pBadges = document.getElementById('page-badges');
        if (pBadges && pBadges.style.display !== 'none' && typeof window.renderBadgesHub === 'function') {
          try { window.renderBadgesHub(); } catch (_) {}
        }
        var presModal = document.getElementById('presidents-badge-modal');
        if (presModal && presModal.style.display !== 'none' && typeof window.renderPresidentsTracker === 'function') {
          var curIc = (typeof sessionGet === 'function') ? (sessionGet('ic') || sessionGet('email')) : '';
          if (curIc) window.renderPresidentsTracker(curIc).catch(function() {});
        }
        var admOverlay = document.getElementById('admin-overlay');
        var admPanel = document.getElementById('admin-panel');
        var isAdmOpen = (admOverlay && admOverlay.style.display !== 'none') || (admPanel && admPanel.style.display !== 'none');
        if (isAdmOpen) {
          if (typeof window.renderAdminBadges === 'function') window.renderAdminBadges();
          if (typeof window.renderAdminPresidentsReqs === 'function') window.renderAdminPresidentsReqs();
        }
      }
      return;
    }

    if (entity === 'gallery' || entity === 'gallery_update') {
      if (typeof window !== 'undefined' && typeof window.loadGallery === 'function') {
        window.loadGallery(true).then(function() {
          var pGal = document.getElementById('page-gallery');
          if (pGal && pGal.style.display !== 'none' && typeof window.renderGallery === 'function') {
            window.renderGallery();
          }
          var admOverlay = document.getElementById('admin-overlay');
          var admPanel = document.getElementById('admin-panel');
          var isAdmOpen = (admOverlay && admOverlay.style.display !== 'none') || (admPanel && admPanel.style.display !== 'none');
          if (isAdmOpen) {
            if (typeof window.renderAdminGalleryGrid === 'function') window.renderAdminGalleryGrid();
            if (typeof window.renderAdminStoryHighlightsList === 'function') window.renderAdminStoryHighlightsList();
          }
        }).catch(function() {});
      }
      return;
    }

    if (entity === 'blocklist') {
      if (typeof window !== 'undefined' && typeof window.verifyActiveMemberSession === 'function') {
        window.verifyActiveMemberSession(true).catch(function() {});
      }
      return;
    }

    if (entity === 'attendance') {
      if (typeof window !== 'undefined' && typeof window.onMasterAttendanceChanged === 'function') {
        window.onMasterAttendanceChanged().catch(function() {});
      }
      return;
    }

    if (entity === 'cosmetics') {
      var loadCosmFn = (typeof window !== 'undefined' && typeof window.loadMemberCosmetics === 'function')
        ? window.loadMemberCosmetics
        : (typeof global !== 'undefined' && typeof global.loadMemberCosmetics === 'function' ? global.loadMemberCosmetics : null);
      var refreshCosmFn = (typeof window !== 'undefined' && typeof window.refreshActiveAvatarCosmetics === 'function')
        ? window.refreshActiveAvatarCosmetics
        : (typeof global !== 'undefined' && typeof global.refreshActiveAvatarCosmetics === 'function' ? global.refreshActiveAvatarCosmetics : null);
      if (loadCosmFn) {
        loadCosmFn(true).then(function() {
          if (refreshCosmFn) refreshCosmFn();
          if (typeof window !== 'undefined' && typeof window.updateNavUserHeader === 'function') {
            window.updateNavUserHeader();
          }
        }).catch(function() {});
      }
      return;
    }

    if (entity === 'avatar_outlines') {
      if (data && data.map && typeof data.map === 'object') {
        if (typeof _customAvatarOutlinesMap !== 'undefined') {
          _customAvatarOutlinesMap = data.map;
        }
        if (typeof window !== 'undefined') {
          window._customAvatarOutlinesMap = data.map;
          try { localStorage.setItem('bb_custom_avatar_outlines', JSON.stringify(data.map)); } catch (_) {}
        }
        if (typeof global !== 'undefined') {
          global._customAvatarOutlinesMap = data.map;
        }
      }
      var loadOutFn = (typeof window !== 'undefined' && typeof window.loadCustomAvatarOutlines === 'function')
        ? window.loadCustomAvatarOutlines
        : (typeof global !== 'undefined' && typeof global.loadCustomAvatarOutlines === 'function' ? global.loadCustomAvatarOutlines : null);
      var refreshAllFn = (typeof window !== 'undefined' && typeof window.refreshAllAvatarOutlinesEverywhere === 'function')
        ? window.refreshAllAvatarOutlinesEverywhere
        : (typeof global !== 'undefined' && typeof global.refreshAllAvatarOutlinesEverywhere === 'function' ? global.refreshAllAvatarOutlinesEverywhere : null);
      var refreshOutFn = (typeof window !== 'undefined' && typeof window.refreshActiveAvatarOutlines === 'function')
        ? window.refreshActiveAvatarOutlines
        : (typeof global !== 'undefined' && typeof global.refreshActiveAvatarOutlines === 'function' ? global.refreshActiveAvatarOutlines : null);

      if (refreshAllFn) {
        try { refreshAllFn(data ? data.target : null, data ? data.style : null); } catch (_) {}
      } else if (refreshOutFn) {
        try { refreshOutFn(); } catch (_) {}
      }

      if (loadOutFn) {
        loadOutFn().then(function() {
          if (refreshAllFn) {
            try { refreshAllFn(data ? data.target : null, data ? data.style : null); } catch (_) {}
          } else if (refreshOutFn) {
            try { refreshOutFn(); } catch (_) {}
          }
        }).catch(function() {});
      }
      return;
    }

    if (entity === 'notifications') {
      var uKey = (typeof window !== 'undefined' && typeof window.getCanonicalNotifUserKey === 'function')
        ? window.getCanonicalNotifUserKey()
        : '';
      if (!data || !data.userKey || !uKey || data.userKey.toLowerCase() === uKey.toLowerCase()) {
        if (data && Array.isArray(data.ids) && data.ids.length && typeof localStorage !== 'undefined') {
          var localKey = (typeof window !== 'undefined' && typeof window.getDismissedNotifStorageKey === 'function')
            ? window.getDismissedNotifStorageKey()
            : 'bb_dismissed_notifications';
          try {
            var rawExisting = localStorage.getItem(localKey) || localStorage.getItem('bb_dismissed_notifications');
            var existingIds = rawExisting ? JSON.parse(rawExisting) : [];
            var merged = Array.from(new Set(existingIds.concat(data.ids)));
            localStorage.setItem(localKey, JSON.stringify(merged));
            localStorage.setItem('bb_dismissed_notifications', JSON.stringify(merged));
          } catch (_) {}
        }
        var fetchDismissedFn = (typeof window !== 'undefined' && typeof window.fetchRemoteDismissedNotifs === 'function')
          ? window.fetchRemoteDismissedNotifs
          : (typeof global !== 'undefined' && typeof global.fetchRemoteDismissedNotifs === 'function' ? global.fetchRemoteDismissedNotifs : null);
        if (fetchDismissedFn) {
          fetchDismissedFn().then(function() {
            if (typeof window !== 'undefined' && typeof window.renderNotifications === 'function') {
              window.renderNotifications();
            }
          }).catch(function() {});
        } else if (typeof window !== 'undefined' && typeof window.renderNotifications === 'function') {
          window.renderNotifications();
        }
      }
      return;
    }

    if (entity === 'task_subtasks' || (entity === 'tasks' && action === 'subtasks_update')) {
      var sTid = data ? (data.taskId || data.id) : null;
      if (sTid && data && Array.isArray(data.subtasks)) {
        if (typeof window !== 'undefined') {
          window._taskSubtasksMap = window._taskSubtasksMap || {};
          window._taskSubtasksMap[sTid] = data.subtasks;
          try { localStorage.setItem('bb_task_subtasks_' + sTid, JSON.stringify(data.subtasks)); } catch (_) {}
          var curSubActive = window._activeDetailTaskId;
          if (String(curSubActive) === String(sTid) && typeof window.renderTaskSubtasks === 'function') {
            window.renderTaskSubtasks(sTid);
          }
          try { window.dispatchEvent(new CustomEvent('bb_task_subtasks_changed', { detail: data })); } catch (_) {}
        }
        if (typeof global !== 'undefined' && global._taskSubtasksMap) {
          global._taskSubtasksMap[sTid] = data.subtasks;
        }
      }
      return;
    }

    if (entity === 'task_attachments' || (entity === 'tasks' && action === 'attachments_update')) {
      var aTid = data ? (data.taskId || data.id) : null;
      if (aTid && data && Array.isArray(data.attachments)) {
        if (typeof window !== 'undefined') {
          window._taskAttachmentsMap = window._taskAttachmentsMap || {};
          window._taskAttachmentsMap[aTid] = data.attachments;
          try { localStorage.setItem('bb_task_attachments_' + aTid, JSON.stringify(data.attachments)); } catch (_) {}
          var curAttActive = window._activeDetailTaskId;
          if (String(curAttActive) === String(aTid) && typeof window.renderTaskAttachments === 'function') {
            window.renderTaskAttachments(aTid);
          }
          try { window.dispatchEvent(new CustomEvent('bb_task_attachments_changed', { detail: data })); } catch (_) {}
        }
        if (typeof global !== 'undefined' && global._taskAttachmentsMap) {
          global._taskAttachmentsMap[aTid] = data.attachments;
        }
      }
      return;
    }

    if (entity === 'task_links' || (entity === 'tasks' && action === 'links_update')) {
      var lTid = data ? (data.taskId || data.id) : null;
      if (lTid && data && Array.isArray(data.links)) {
        if (typeof window !== 'undefined') {
          window._taskLinksMap = window._taskLinksMap || {};
          window._taskLinksMap[lTid] = data.links;
          try { localStorage.setItem('bb_task_links_' + lTid, JSON.stringify(data.links)); } catch (_) {}
          var curLnkActive = window._activeDetailTaskId;
          if (String(curLnkActive) === String(lTid) && typeof window.renderTaskLinks === 'function') {
            window.renderTaskLinks(lTid);
          }
          try { window.dispatchEvent(new CustomEvent('bb_task_links_changed', { detail: data })); } catch (_) {}
        }
        if (typeof global !== 'undefined' && global._taskLinksMap) {
          global._taskLinksMap[lTid] = data.links;
        }
      }
      return;
    }

    if (entity === 'task_assigned' || (entity === 'tasks' && action === 'assign')) {
      var assignedData = data || {};
      var aTid = assignedData.taskId || assignedData.id;
      var cleanTargetName = (assignedData.assignee_name || '').trim().toLowerCase();
      var cleanTargetIc = (assignedData.assignee_ic || '').trim().toLowerCase();
      var cleanTargetEmail = (assignedData.assignee_email || '').trim().toLowerCase();

      var sessGetFn = (typeof sessionGet === 'function')
        ? sessionGet
        : (typeof window !== 'undefined' && typeof window.sessionGet === 'function')
          ? window.sessionGet
          : (typeof global !== 'undefined' && typeof global.sessionGet === 'function')
            ? global.sessionGet
            : null;

      var curMyIc = (sessGetFn ? (sessGetFn('ic') || '') : '').trim().toLowerCase();
      var curMyName = (sessGetFn ? (sessGetFn('name') || '') : '').trim().toLowerCase();
      var curMyEmail = (sessGetFn ? (sessGetFn('email') || '') : '').trim().toLowerCase();

      if (typeof window !== 'undefined') {
        if (!curMyName && document.getElementById('sidebar-user-name')) {
          var sbEl = document.getElementById('sidebar-user-name');
          if (sbEl && sbEl.textContent && sbEl.textContent.trim() !== 'Member') {
            curMyName = sbEl.textContent.trim().toLowerCase();
          }
        }
        if ((!curMyName || !curMyIc || !curMyEmail) && typeof localStorage !== 'undefined') {
          try {
            var rawSess = JSON.parse(localStorage.getItem('bb_session') || '{}');
            if (!curMyName && rawSess.name) curMyName = String(rawSess.name).trim().toLowerCase();
            if (!curMyIc && rawSess.ic) curMyIc = String(rawSess.ic).trim().toLowerCase();
            if (!curMyEmail && rawSess.email) curMyEmail = String(rawSess.email).trim().toLowerCase();
          } catch (_) {}
        }
      }

      var isTargetUser = false;
      if (cleanTargetIc && curMyIc && (cleanTargetIc === curMyIc || cleanTargetIc.split(',').map(function(s) { return s.trim(); }).indexOf(curMyIc) !== -1)) {
        isTargetUser = true;
      } else if (cleanTargetName && curMyName && (cleanTargetName === curMyName || curMyName.indexOf(cleanTargetName) !== -1 || cleanTargetName.indexOf(curMyName) !== -1)) {
        isTargetUser = true;
      } else if (cleanTargetEmail && curMyEmail && cleanTargetEmail === curMyEmail) {
        isTargetUser = true;
      }

      // Check not self-assigned
      var cIc = (assignedData.creator_ic || '').trim().toLowerCase();
      var cName = (assignedData.creator_name || '').trim().toLowerCase();
      var cEmail = (assignedData.creator_email || '').trim().toLowerCase();
      var isSelfAssigned = (curMyIc && cIc && curMyIc === cIc)
        || (curMyName && cName && curMyName === cName)
        || (curMyEmail && cEmail && curMyEmail === cEmail);

      if (isTargetUser && !isSelfAssigned && aTid) {
        var notifId = 'notif-task-' + aTid;
        var creatorName = assignedData.creator_name || 'Jeshua Koh';
        var creatorIc = assignedData.creator_ic || '';
        var taskTitle = assignedData.title || 'Task Update';
        var initials = creatorName.split(' ').map(function(w) { return w[0]; }).join('').slice(0, 2).toUpperCase() || 'BB';

        // 1. Un-dismiss / Un-see so new assignment surfaces to inbox
        if (typeof window !== 'undefined') {
          if (Array.isArray(window._allPortalNotifications)) {
            window._allPortalNotifications = window._allPortalNotifications.filter(function(n) { return n && n.id !== notifId; });
          }
          try {
            var sKey = 'bb_seen_notifications';
            var dKey = (typeof window.getDismissedNotifStorageKey === 'function') ? window.getDismissedNotifStorageKey() : 'bb_dismissed_notifications';
            var rawSeen = JSON.parse(localStorage.getItem(sKey) || '[]');
            localStorage.setItem(sKey, JSON.stringify(rawSeen.filter(function(x) { return x !== notifId; })));
            var rawDis = JSON.parse(localStorage.getItem(dKey) || '[]');
            localStorage.setItem(dKey, JSON.stringify(rawDis.filter(function(x) { return x !== notifId; })));
          } catch (_) {}

          // 2. Push notification into inboxes & header notification list
          var notifObj = {
            id: notifId,
            category: 'tasks',
            group: 'Today',
            timestamp: Date.now(),
            avatarInitials: initials,
            avatarMemberName: creatorName,
            avatarMemberIc: creatorIc,
            title: creatorName + ' assigned a task',
            snippet: ((aTid && !String(aTid).toLowerCase().startsWith('temp_')) ? (String(aTid).toUpperCase() + ' - ') : '') + taskTitle,
            time: 'Just now',
            unread: true,
            action: function() {
              if (typeof window.switchTabNav === 'function') window.switchTabNav('tasks');
              if (typeof window.switchTaskSectionView === 'function') window.switchTaskSectionView('board');
              if (typeof window.openTaskDetail === 'function') window.openTaskDetail(aTid);
            }
          };

          if (typeof window.pushPortalNotification === 'function') {
            window.pushPortalNotification(notifObj, false);
          } else if (Array.isArray(window._allPortalNotifications)) {
            window._allPortalNotifications.unshift(notifObj);
          }

          // 3. In-App Pop-up Toast
          if (typeof window.showToast === 'function') {
            window.showToast('📋 ' + creatorName + ' assigned you a task: ' + taskTitle, 'info', 6000);
          }

          // 4. Native OS Desktop Notification (PC / Web / PWA)
          var sysNotifFn = (typeof window.triggerPortalSystemNotification === 'function')
            ? window.triggerPortalSystemNotification
            : ((typeof global !== 'undefined' && typeof global.triggerPortalSystemNotification === 'function') ? global.triggerPortalSystemNotification : null);
          if (sysNotifFn) {
            sysNotifFn(
              '📋 Task Assigned: ' + taskTitle,
              creatorName + ' assigned you a task in Projects & Tasks.',
              {
                tag: notifId,
                silentSound: false,
                force: true
              }
            );
          }

          // 5. Play notification chime
          if (typeof window.playNotificationSound === 'function') {
            try { window.playNotificationSound(); } catch (_) {}
          }

          // 6. Update Notification Bell Badge & Dropdown
          if (typeof window.renderNotifications === 'function') {
            window.renderNotifications();
          }

          // 7. Refresh Task Views
          if (typeof window.fetchAllRemoteTasks === 'function') {
            window.fetchAllRemoteTasks(true).then(function() {
              if (typeof window.refreshCurrentTasksView === 'function') window.refreshCurrentTasksView(aTid);
            }).catch(function() {});
          }
        }
      }
      return;
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
      var tid = (data && (data.taskId || data.id)) || (data && data.key && data.key.startsWith('bb_task_comments_') ? data.key.replace('bb_task_comments_', '') : null);
      if (typeof window !== 'undefined') {
        invalidateCache('bb_config');
        invalidateCache('bb_tasks');

        // Immediate 0ms local update if full comments array is present in payload (instant WhatsApp-style sync)
        if (entity === 'comments' && tid && data && Array.isArray(data.comments)) {
          if (typeof window._taskCommentsMap !== 'undefined') {
            window._taskCommentsMap[tid] = data.comments;
          }
          try { localStorage.setItem('bb_task_comments_' + tid, JSON.stringify(data.comments)); } catch (_) {}
          if (typeof window.syncTaskNotifications === 'function') window.syncTaskNotifications();
          if (typeof window.renderNotifications === 'function') window.renderNotifications();
          if (typeof window.renderTaskComments === 'function') window.renderTaskComments(tid);
        }

        // Immediate 0ms local update for task cards/columns (instant Google Docs-style sync)
        if (entity === 'tasks' && action === 'reconcile' && data && data.tempId && data.task) {
          var rTempId = String(data.tempId);
          var rRealId = String(data.task.id);
          if (window._allLoadedTasks) {
            var replaced = false;
            window._allLoadedTasks = window._allLoadedTasks.map(function(t) {
              if (String(t.id) === rTempId || String(t.id) === rRealId) {
                replaced = true;
                return Object.assign({}, t, data.task);
              }
              return t;
            });
            if (!replaced) window._allLoadedTasks.push(data.task);
          }
          if (window._taskMap) {
            delete window._taskMap[rTempId];
            window._taskMap[rRealId] = data.task;
          }
          if (typeof window.refreshCurrentTasksView === 'function') {
            try { window.refreshCurrentTasksView(rRealId); } catch (_) {}
          }
        } else if (entity === 'tasks' && data && data.id) {
          var tIdStr = String(data.id);
          var allTasks = window._allLoadedTasks || [];
          var existingT = allTasks.find(function(t) { return String(t.id) === tIdStr; });
          if (action === 'delete') {
            if (window._allLoadedTasks) {
              window._allLoadedTasks = window._allLoadedTasks.filter(function(t) { return String(t.id) !== tIdStr; });
            }
            if (window._taskMap) delete window._taskMap[tIdStr];
          } else if (action === 'create' && data.title) {
            var alreadyExists = allTasks.some(function(t) {
              if (String(t.id) === tIdStr) return true;
              if (String(t.id).startsWith('temp_') && String(data.id).startsWith('temp_')) {
                return String(t.title).trim().toLowerCase() === String(data.title).trim().toLowerCase();
              }
              return false;
            });
            if (!alreadyExists && window._allLoadedTasks) {
              window._allLoadedTasks.push(data);
            }
            if (window._taskMap) window._taskMap[tIdStr] = data;
          } else if (existingT) {
            if (data.status) existingT.status = data.status;
            if (data.field && data.value !== undefined) existingT[data.field] = data.value;
            if (data.field === 'estimate' || data.estimate) {
              var estVal = data.estimate || data.value;
              existingT.estimate = estVal;
              if (window._taskMap && window._taskMap[tIdStr]) {
                window._taskMap[tIdStr].estimate = estVal;
              }
              if (String(window._activeDetailTaskId) === tIdStr) {
                var estEl = document.querySelector('.tdm-estimate-val');
                if (estEl) estEl.textContent = estVal || 'Estimate';
              }
            }
            if (data.description) existingT.description = data.description;
            if (data.assignee_name !== undefined || data.field === 'assignee_name') {
              var aName = data.assignee_name !== undefined ? data.assignee_name : data.value;
              existingT.assignee_name = aName;
              if (window._taskMap && window._taskMap[tIdStr]) {
                window._taskMap[tIdStr].assignee_name = aName;
              }
            }
            if (data.assignee_ic !== undefined || data.field === 'assignee_ic') {
              var aIc = data.assignee_ic !== undefined ? data.assignee_ic : data.value;
              existingT.assignee_ic = aIc;
              if (window._taskMap && window._taskMap[tIdStr]) {
                window._taskMap[tIdStr].assignee_ic = aIc;
              }
            }
            if (window._taskMap && window._taskMap[tIdStr]) {
              if (data.status) window._taskMap[tIdStr].status = data.status;
              if (data.field && data.value !== undefined) window._taskMap[tIdStr][data.field] = data.value;
              if (data.description) window._taskMap[tIdStr].description = data.description;
            }
          }
          if (typeof window.refreshCurrentTasksView === 'function') {
            try { window.refreshCurrentTasksView(tIdStr); } catch (_) {}
          }
        }

        var fetchTasksP = (typeof window.fetchAllRemoteTasks === 'function')
          ? window.fetchAllRemoteTasks(true)
          : Promise.resolve();
        var fetchCommentsP = (tid && typeof window.fetchRemoteTaskComments === 'function')
          ? window.fetchRemoteTaskComments(tid)
          : ((typeof window.fetchAllRemoteTaskComments === 'function') ? window.fetchAllRemoteTaskComments(true) : Promise.resolve());

        Promise.all([fetchTasksP, fetchCommentsP]).then(function(results) {
          var tList = results[0] || (window._allLoadedTasks || []);
          if (typeof window.syncTaskNotifications === 'function') window.syncTaskNotifications(tList);
          if (typeof window.renderNotifications === 'function') window.renderNotifications();
          if (tid && typeof window.renderTaskComments === 'function') window.renderTaskComments(tid);
          if (typeof window.refreshCurrentTasksView === 'function') {
            try { window.refreshCurrentTasksView(tid); } catch (_) {}
          }
          if (typeof document !== 'undefined') {
            var admOverlay = document.getElementById('admin-overlay');
            var admPanel = document.getElementById('admin-panel');
            var isAdmOpen = (admOverlay && admOverlay.style.display !== 'none') || (admPanel && admPanel.style.display !== 'none');
            if (isAdmOpen && typeof window.renderAdminTasks === 'function') {
              try { window.renderAdminTasks(); } catch (_) {}
            }
          }
        }).catch(function() {});
      }
    } else if (entity === 'announcements') {
      if (typeof window !== 'undefined') {
        if (data && data.title && (action === 'create' || action === 'save' || action === 'INSERT' || action === 'insert')) {
          var sysNotifFn = (typeof window !== 'undefined' && typeof window.triggerPortalSystemNotification === 'function')
            ? window.triggerPortalSystemNotification
            : ((typeof global !== 'undefined' && typeof global.triggerPortalSystemNotification === 'function') ? global.triggerPortalSystemNotification : null);
          if (sysNotifFn) {
            var annSnippet = data.snippet || (data.body ? String(data.body).replace(/<[^>]+>/g, '').trim().slice(0, 70) : 'A new company announcement was posted.');
            sysNotifFn(
              '📢 ' + (data.title || "New Announcement"),
              annSnippet,
              {
                tag: 'notif-announcement-' + (data.id || Date.now()),
                silentSound: false,
                force: false
              }
            );
          }
        }
        if (typeof window.loadAnnouncements === 'function') {
          // shortcut: reload the feed for each signal, use row deltas when all legacy metadata is on the row.
          window.loadAnnouncements().catch(function() {});
        }
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
            var foundCache = false;
            memCache.forEach(function(m) {
              if (m.ic === data.ic || (data.name && m.name === data.name)) {
                foundCache = true;
                if (data.name !== undefined) m.name = data.name;
                if (data.rank !== undefined) m.rank = data.rank;
                if (data.squad !== undefined) m.squad = data.squad;
                if (data.department !== undefined) m.department = data.department;
                if (data.section !== undefined) m.section = data.section;
                if (data.att_section !== undefined) m.att_section = data.att_section;
                if (data.photo_url !== undefined) m.photo_url = data.photo_url;
                updatedCache = true;
              }
            });
            if (!foundCache) {
              memCache.push(data);
              updatedCache = true;
            }
            if (updatedCache) localStorage.setItem('bb_members_cache', JSON.stringify(memCache));
          }
        } catch (_) {}

        // Update in-memory department members cache if present
        if (typeof window !== 'undefined' && Array.isArray(window._cachedDepartmentMembers)) {
          window._cachedDepartmentMembers.forEach(function(m) {
            if (m.ic === data.ic || (data.name && m.name === data.name)) {
              if (data.name !== undefined) m.name = data.name;
              if (data.rank !== undefined) m.rank = data.rank;
              if (data.squad !== undefined) m.squad = data.squad;
              if (data.department !== undefined) m.department = data.department;
              if (data.section !== undefined) m.section = data.section;
              if (data.att_section !== undefined) m.att_section = data.att_section;
              if (data.photo_url !== undefined) m.photo_url = data.photo_url;
            }
          });
        }

        // Update profile picture cache map if photo_url changed
        if (data.photo_url !== undefined && typeof _memberPfpsMap !== 'undefined') {
          var normPfp = data.photo_url ? ((typeof normalizeAvatarUrl === 'function') ? normalizeAvatarUrl(data.photo_url) : data.photo_url) : null;
          if (normPfp) {
            _memberPfpsMap[data.ic.toLowerCase()] = normPfp;
            if (data.email) _memberPfpsMap[data.email.toLowerCase()] = normPfp;
            if (data.name) _memberPfpsMap[data.name.trim().toLowerCase()] = normPfp;
          } else {
            delete _memberPfpsMap[data.ic.toLowerCase()];
            if (data.email) delete _memberPfpsMap[data.email.toLowerCase()];
            if (data.name) delete _memberPfpsMap[data.name.trim().toLowerCase()];
          }
          try {
            if (typeof localStorage !== 'undefined') {
              localStorage.setItem('bb_member_pfps', JSON.stringify(_memberPfpsMap));
            }
          } catch (_) {}
        }
      }

      var currentIc = sessGetFn ? (sessGetFn('ic') || '') : '';
      var currentEmail = sessGetFn ? (sessGetFn('email') || '') : '';
      var currentName = sessGetFn ? sessGetFn('name') : '';
      var isMe = false;
      if (data) {
        if (data.ic && ((currentIc && data.ic.toLowerCase() === currentIc.toLowerCase()) || (currentEmail && data.ic.toLowerCase() === currentEmail.toLowerCase()))) isMe = true;
        if (data.email && ((currentEmail && data.email.toLowerCase() === currentEmail.toLowerCase()) || (currentIc && data.email.toLowerCase() === currentIc.toLowerCase()))) isMe = true;
        if (data.name && currentName && data.name.trim().toLowerCase() === currentName.trim().toLowerCase()) isMe = true;
        if (!data.ic && !data.email && !data.name) isMe = true;
      } else {
        isMe = true;
      }

      if (isMe) {
        if (data && data.ic) {
          if (data.name && sessSetFn) sessSetFn('name', data.name, { localOnly: true });
          if (data.rank !== undefined && sessSetFn) sessSetFn('rank', data.rank, { localOnly: true });
          if (data.squad !== undefined && sessSetFn) sessSetFn('squad', data.squad, { localOnly: true });
          if (data.department !== undefined && sessSetFn) sessSetFn('department', data.department, { localOnly: true });
          if ((data.att_section || data.section) && sessSetFn) sessSetFn('section', data.att_section || data.section, { localOnly: true });
          if (data.photo_url !== undefined && sessSetFn) {
            var normPhoto = data.photo_url ? ((typeof normalizeAvatarUrl === 'function') ? normalizeAvatarUrl(data.photo_url) : data.photo_url) : '';
            sessSetFn('photo_url', normPhoto, { localOnly: true });
            var cleanFn = (data.ic || currentIc || currentEmail || '').replace(/[^a-zA-Z0-9@._-]/g, '_') + '.jpg';
            if (typeof localStorage !== 'undefined') {
              try {
                if (normPhoto) localStorage.setItem('bb_pfp_' + cleanFn, normPhoto);
                else localStorage.removeItem('bb_pfp_' + cleanFn);
              } catch (_) {}
            }
          }

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

          // Update active member profile view elements
          if (typeof document !== 'undefined') {
            var mNameEl = document.getElementById('m-name');
            if (mNameEl && data.name) mNameEl.textContent = data.name;
            var mRankEl = document.getElementById('m-rank');
            if (mRankEl && effRank) mRankEl.textContent = effRank;
            var mSquadEl = document.getElementById('m-squad');
            if (mSquadEl && effSquad) mSquadEl.textContent = effSquad;
            var mSecEl = document.getElementById('m-section');
            if (mSecEl && effSec) mSecEl.textContent = effSec;

            if (data.photo_url !== undefined) {
              var mImg = document.getElementById('m-pfp-img');
              var mPh = document.getElementById('m-pfp-ph');
              var sImg = document.getElementById('sidebar-user-avatar-img');
              var sPh = document.getElementById('sidebar-user-avatar-ph');
              var nImg = document.getElementById('nav-avatar-img');
              var nPh = document.getElementById('nav-avatar-placeholder');
              var setImg = document.getElementById('settings-pfp-img');
              var setPh = document.getElementById('settings-pfp-ph');
              var activeNormPhoto = data.photo_url ? ((typeof normalizeAvatarUrl === 'function') ? normalizeAvatarUrl(data.photo_url) : data.photo_url) : '';
              if (activeNormPhoto) {
                if (mImg) { mImg.src = activeNormPhoto; mImg.style.display = 'block'; }
                if (mPh) mPh.style.display = 'none';
                if (sImg) { sImg.src = activeNormPhoto; sImg.style.display = 'block'; }
                if (sPh) sPh.style.display = 'none';
                if (nImg) { nImg.src = activeNormPhoto; nImg.style.display = 'block'; }
                if (nPh) nPh.style.display = 'none';
                if (setImg) { setImg.src = activeNormPhoto; setImg.style.display = 'block'; }
                if (setPh) setPh.style.display = 'none';
              } else {
                if (mImg) { mImg.src = ''; mImg.style.display = 'none'; }
                if (mPh) mPh.style.display = 'flex';
                if (sImg) { sImg.src = ''; sImg.style.display = 'none'; }
                if (sPh) sPh.style.display = 'flex';
                if (nImg) { nImg.src = ''; nImg.style.display = 'none'; }
                if (nPh) nPh.style.display = 'flex';
                if (setImg) { setImg.src = ''; setImg.style.display = 'none'; }
                if (setPh) setPh.style.display = 'flex';
              }
              if (typeof setRemovePfpButtonVisible === 'function') setRemovePfpButtonVisible(!!activeNormPhoto);
              if (typeof renderMemberAvatar === 'function' && !activeNormPhoto) renderMemberAvatar(data.name || currentName, currentEmail);
            }
          }

          if (typeof window !== 'undefined') {
            if (typeof window.refreshCurrentTasksView === 'function') window.refreshCurrentTasksView();
            if (typeof window.renderArcadeLeaderboardView === 'function') window.renderArcadeLeaderboardView();
          }

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
          if (typeof window !== 'undefined' && typeof window.syncSidebarAccess === 'function') {
            try { window.syncSidebarAccess(); } catch (_) {}
          }
          if (typeof window !== 'undefined' && typeof window.updateNavUserHeader === 'function') {
            try { window.updateNavUserHeader(); } catch (_) {}
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

      // Re-render task board, presence dots, arcade leaderboard, and forum across all connected devices
      if (typeof window !== 'undefined') {
        if (typeof window.refreshCurrentTasksView === 'function') {
          try { window.refreshCurrentTasksView(); } catch (_) {}
        }
        var refDots = (typeof refreshLivePresenceDots === 'function')
          ? refreshLivePresenceDots
          : (typeof window.refreshLivePresenceDots === 'function' ? window.refreshLivePresenceDots : null);
        if (refDots) {
          try { refDots(); } catch (_) {}
        }
        var pArcadeEl = document.getElementById('page-arcade');
        if (pArcadeEl && (pArcadeEl.classList.contains('active') || pArcadeEl.style.display !== 'none')) {
          if (typeof window.syncArcadeLeaderboard === 'function') {
            window.syncArcadeLeaderboard().then(function() {
              if (typeof window.renderArcadeLeaderboardView === 'function') window.renderArcadeLeaderboardView();
            }).catch(function() {});
          } else if (typeof window.renderArcadeLeaderboardView === 'function') {
            window.renderArcadeLeaderboardView();
          }
        }
      }

      if (typeof document !== 'undefined') {
        var admOverlay = document.getElementById('admin-overlay');
        var admPanel = document.getElementById('admin-panel');
        var isAdmOpen = (admOverlay && admOverlay.style.display !== 'none') || (admPanel && admPanel.style.display !== 'none');
        if (isAdmOpen) {
          var renderAdminFn = (typeof renderAdminList === 'function') ? renderAdminList : (typeof window !== 'undefined' ? window.renderAdminList : null);
          var loadAdminFn = (typeof window !== 'undefined' && typeof window.loadAdminMembers === 'function') ? window.loadAdminMembers : null;
          if (loadAdminFn) {
            loadAdminFn().catch(function() {});
          } else if (renderAdminFn) {
            renderAdminFn(true).catch(function() {});
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
    disconnect: disconnectWebSocket,
    broadcast: broadcastLocalChange,
    trigger: triggerEntityUpdate,
    triggerEntityUpdate: triggerEntityUpdate,
    checkDeltaSync: checkDeltaSync
  };
})();

// Attach to window and export
if (typeof window !== 'undefined') {
  window.PortalRealtime = PortalRealtime;
}
if (typeof global !== 'undefined') {
  global.PortalRealtime = PortalRealtime;
}

// Attach to window for global access across the app
if (typeof window !== 'undefined') {
  window.supa = supa;
  window.getSupaClient = getSupaClient;
  window.getSupa = getSupaClient;
  window.getSupabaseClient = getSupaClient;
  window.isCircuitBreakerOpen = isCircuitBreakerOpen;
  window.resetCircuitBreaker = resetCircuitBreaker;
  window.tripCircuitBreaker = tripCircuitBreaker;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    PortalRealtime,
    broadcastRealtime: PortalRealtime.broadcast,
    triggerRealtime: PortalRealtime.trigger,
    triggerEntityUpdate: PortalRealtime.trigger,
    supa,
    getSupaClient,
    getSupa: getSupaClient,
    getSupabaseClient: getSupaClient,
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
