/**
 * 1st Petaling Jaya Boys' Brigade Portal
 * Supabase REST & Storage API Client with Concurrency Safety (TSK-014)
 */

/**
 * In-memory concurrency locks per config key
 */
const _configLocks = {};

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

const supa = {
  /**
   * Generic PostgREST HTTP Request helper
   */
  async req(method, path, body, extraHeaders) {
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

    const r = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });

    if (!r.ok) {
      const e = await r.text();
      throw new Error(e);
    }
    return r.status === 204 ? null : r.json();
  },

  get(path) {
    return supa.req('GET', path);
  },

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

  async safeConfigGet(key, fallback) {
    const client = this && typeof this.get === 'function' ? this : supa;
    try {
      const rows = await client.get(
        'bb_config?key=eq.' + encodeURIComponent(key) + '&select=key,value'
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
   * optimistic 3-way merge conflict resolution, and retry protection (TSK-014)
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

  /**
   * Supabase Storage: Upload a file/blob to a bucket
   */
  async uploadFile(bucket, filePath, blob) {
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

    const r = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: 'Bearer ' + key,
        'Content-Type': contentType,
        'x-upsert': 'true'
      },
      body: blob
    });

    if (!r.ok) {
      const e = await r.text();
      throw new Error(e);
    }
    return r.json();
  },

  /**
   * Supabase Storage: Get public URL for a file
   */
  fileUrl(bucket, filePath) {
    const url =
      typeof SUPA_URL !== 'undefined'
        ? SUPA_URL
        : typeof window !== 'undefined'
          ? window.SUPA_URL
          : '';
    return url + '/storage/v1/object/public/' + bucket + '/' + filePath;
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

// Attach to window for global access across the app
if (typeof window !== 'undefined') {
  window.supa = supa;
  window.getSupaClient = getSupaClient;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    supa,
    getSupaClient,
    mergeConfigCollections,
    recordConfigSnapshot: supa.recordConfigSnapshot,
    getConfigSnapshot: supa.getConfigSnapshot,
    clearConfigSnapshots: supa.clearConfigSnapshots
  };
}
