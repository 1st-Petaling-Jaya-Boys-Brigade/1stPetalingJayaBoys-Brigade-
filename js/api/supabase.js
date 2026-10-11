/**
 * 1st Petaling Jaya Boys' Brigade Portal
 * Supabase REST & Storage API Client
 */

const supa = {
  /**
   * Generic PostgREST HTTP Request helper
   */
  async req(method, path, body) {
    const url = (typeof SUPA_URL !== 'undefined' ? SUPA_URL : (typeof window !== 'undefined' ? window.SUPA_URL : '')) + '/rest/v1/' + path;
    const key = (typeof SUPA_KEY !== 'undefined' ? SUPA_KEY : (typeof window !== 'undefined' ? window.SUPA_KEY : ''));

    const r = await fetch(url, {
      method,
      headers: {
        apikey: key,
        Authorization: 'Bearer ' + key,
        'Content-Type': 'application/json',
        Prefer: method === 'POST' ? 'return=representation' : ''
      },
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

  /**
   * Supabase Storage: Upload a file/blob to a bucket
   */
  async uploadFile(bucket, filePath, blob) {
    const url = (typeof SUPA_URL !== 'undefined' ? SUPA_URL : (typeof window !== 'undefined' ? window.SUPA_URL : '')) + '/storage/v1/object/' + bucket + '/' + filePath;
    const key = (typeof SUPA_KEY !== 'undefined' ? SUPA_KEY : (typeof window !== 'undefined' ? window.SUPA_KEY : ''));

    const r = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: 'Bearer ' + key,
        'Content-Type': blob.type || 'image/jpeg',
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
    const url = (typeof SUPA_URL !== 'undefined' ? SUPA_URL : (typeof window !== 'undefined' ? window.SUPA_URL : ''));
    return url + '/storage/v1/object/public/' + bucket + '/' + filePath;
  },

  /**
   * Supabase Storage: Delete a file from a bucket
   */
  async deleteFile(bucket, filePath) {
    const url = (typeof SUPA_URL !== 'undefined' ? SUPA_URL : (typeof window !== 'undefined' ? window.SUPA_URL : '')) + '/storage/v1/object/' + bucket;
    const key = (typeof SUPA_KEY !== 'undefined' ? SUPA_KEY : (typeof window !== 'undefined' ? window.SUPA_KEY : ''));

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
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { supa };
}
