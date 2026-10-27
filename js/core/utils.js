/**
 * 1st Petaling Jaya Boys' Brigade Portal
 * Core Utilities, Data Normalization, Cryptographic Security & UI System
 */

/**
 * Escapes unsafe characters for HTML rendering to prevent XSS vulnerabilities.
 * Encodes &, <, >, ", ', /, and ` per OWASP defense-in-depth guidelines.
 * @param {string|number|null|undefined} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\//g, '&#x2F;')
    .replace(/`/g, '&#96;');
}

/**
 * Validates and sanitizes a URL against malicious protocols (javascript:, vbscript:, data:text/html, etc.).
 * Allows http, https, mailto, tel, relative paths, and safe raster image data URIs.
 * @param {string|null|undefined} url - Target URL to inspect
 * @param {string} [fallback='#'] - Fallback URL if target is unsafe
 * @returns {string} Safe sanitized URL
 */
function safeUrl(url, fallback) {
  var defaultFallback = typeof fallback === 'string' ? fallback : '#';
  if (!url || typeof url !== 'string') return defaultFallback;
  var cleaned = url.replace(/[\x00-\x1F\x7F]/g, '').trim();
  if (!cleaned) return defaultFallback;

  // Safe relative paths and anchor hashes
  if (/^(\/|\.\/|#)/.test(cleaned)) {
    return cleaned;
  }

  // Safe explicit protocols
  if (/^(https?|mailto|tel):/i.test(cleaned)) {
    return cleaned;
  }

  // Safe raster image data URIs (PNG, JPEG, GIF, WebP - SVG excluded due to script execution risks)
  if (/^data:image\/(png|jpeg|jpg|gif|webp);base64,[A-Za-z0-9+/=]+$/i.test(cleaned)) {
    return cleaned;
  }

  return defaultFallback;
}

/**
 * Sanitizes generic user text input by stripping null bytes and unprintable control characters.
 * Enforces optional max length.
 * @param {string|null|undefined} str
 * @param {number} [maxLength]
 * @returns {string}
 */
function sanitizeInput(str, maxLength) {
  if (str === null || str === undefined) return '';
  var cleaned = String(str)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim();
  if (typeof maxLength === 'number' && maxLength > 0 && cleaned.length > maxLength) {
    return cleaned.substring(0, maxLength);
  }
  return cleaned;
}

/**
 * Sanitizes plain text fields by stripping all HTML tags and control characters.
 * Used for names, titles, categories, squad names, rank labels.
 * @param {string|null|undefined} str
 * @param {number} [maxLength]
 * @returns {string}
 */
function sanitizeText(str, maxLength) {
  var cleaned = sanitizeInput(str, maxLength);
  cleaned = cleaned.replace(/<[^>]*>?/gm, '');
  return cleaned;
}

/**
 * Sanitizes rich text HTML for announcement bodies, remarks, notes, and task descriptions.
 * Eliminates XSS injection vectors while preserving safe formatting tags.
 * @param {string} dirtyHtml
 * @param {object} [options]
 * @returns {string}
 */
function sanitizeHtml(dirtyHtml, _options) {
  if (!dirtyHtml || typeof dirtyHtml !== 'string') return '';

  if (typeof DOMParser !== 'undefined') {
    var parser = new DOMParser();
    var doc = parser.parseFromString(dirtyHtml, 'text/html');

    var ALLOWED_TAGS = [
      'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL',
      'P', 'BR', 'HR', 'UL', 'OL', 'LI', 'SPAN', 'FONT',
      'DIV', 'A', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE',
      'CODE', 'PRE', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD'
    ];
    var ALLOWED_ATTRS = ['style', 'color', 'size', 'href', 'target', 'rel', 'class', 'align'];

    function cleanNode(node) {
      var children = Array.from(node.childNodes);
      for (var i = 0; i < children.length; i++) {
        var child = children[i];
        if (child.nodeType === 1) { // ELEMENT_NODE
          var tagName = child.tagName.toUpperCase();

          if (ALLOWED_TAGS.indexOf(tagName) === -1) {
            // Dangerous tags: remove completely with all their content
            if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'FORM', 'INPUT', 'BUTTON', 'SVG', 'LINK', 'META', 'BASE', 'FRAME', 'FRAMESET', 'APPLET', 'AUDIO', 'VIDEO', 'SOURCE', 'NOSCRIPT', 'TEMPLATE'].indexOf(tagName) !== -1) {
              node.removeChild(child);
              continue;
            } else {
              // Unknown tags: replace with their text content
              var textNode = doc.createTextNode(child.textContent || '');
              node.replaceChild(textNode, child);
              continue;
            }
          }

          // Strip disallowed attributes & inline event handlers
          var attrs = Array.from(child.attributes);
          for (var a = 0; a < attrs.length; a++) {
            var attr = attrs[a];
            var attrName = attr.name.toLowerCase();

            // Block any event handlers (on*) or disallowed attributes
            if (attrName.startsWith('on') || ALLOWED_ATTRS.indexOf(attrName) === -1) {
              child.removeAttribute(attr.name);
            } else if (attrName === 'href') {
              var hrefVal = (attr.value || '').trim();
              var validatedHref = safeUrl(hrefVal, '');
              if (!validatedHref || validatedHref === '#') {
                child.removeAttribute(attr.name);
              } else {
                child.setAttribute('href', validatedHref);
                child.setAttribute('target', '_blank');
                child.setAttribute('rel', 'noopener noreferrer');
              }
            } else if (attrName === 'style') {
              var styleVal = attr.value || '';
              // Block expressions, javascript: URLs, behavior, or CSS injections
              if (/expression|javascript:|vbscript:|url\(|behavior|-moz-binding|@import/i.test(styleVal)) {
                child.removeAttribute('style');
              }
            }
          }

          cleanNode(child);
        }
      }
    }

    cleanNode(doc.body);
    return doc.body.innerHTML;
  }

  // Fallback regex sanitization for non-browser/test environments
  var sanitized = dirtyHtml
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
    .replace(/<embed\b[^>]*>/gi, '')
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '')
    .replace(/<link\b[^>]*>/gi, '')
    .replace(/<meta\b[^>]*>/gi, '')
    .replace(/<base\b[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*(['"]).*?\1/gi, '')
    .replace(/\son\w+\s*=\s*[^>\s]+/gi, '')
    .replace(/href\s*=\s*(['"])\s*(?:javascript|vbscript|data):.*?\1/gi, '')
    .replace(/src\s*=\s*(['"])\s*(?:javascript|vbscript):.*?\1/gi, '')
    .replace(/style\s*=\s*(['"])[^'"]*(?:expression|javascript:|url\()[^'"]*\1/gi, '');

  return sanitized;
}

/**
 * Formats an ISO or timestamp date string to en-MY localized string
 * @param {string|Date} dateStr
 * @param {Intl.DateTimeFormatOptions} [options]
 * @returns {string}
 */
function formatDate(dateStr, options) {
  if (!dateStr) return '';
  try {
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    var defaultOpts = { day: 'numeric', month: 'short', year: 'numeric' };
    return d.toLocaleDateString('en-MY', options || defaultOpts);
  } catch (e) {
    return String(dateStr);
  }
}

/**
 * Normalizes badge data entry across legacy formats (boolean, date string, or object)
 * Consolidates migrateE and migrateEntry into a single single-source-of-truth.
 * @param {any} raw
 * @returns {{ basic: boolean, basicDate: string, advanced: boolean, advancedDate: string }}
 */
function migrateEntry(raw) {
  if (!raw) return { basic: false, basicDate: '', advanced: false, advancedDate: '' };
  if (typeof raw === 'boolean') return { basic: raw, basicDate: '', advanced: false, advancedDate: '' };
  if (typeof raw === 'string') return { basic: true, basicDate: raw, advanced: false, advancedDate: '' };
  if (typeof raw.earned !== 'undefined') {
    return { basic: !!raw.earned, basicDate: raw.date || '', advanced: false, advancedDate: '' };
  }
  return {
    basic: !!raw.basic,
    basicDate: raw.basicDate || '',
    advanced: !!raw.advanced,
    advancedDate: raw.advancedDate || ''
  };
}
// Alias for backward compatibility
var migrateBadgeEntry = migrateEntry;

/**
 * Converts a byte array (Uint8Array) into a hex string
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function bytesToHex(bytes) {
  var hex = [];
  for (var i = 0; i < bytes.length; i++) {
    var b = bytes[i].toString(16);
    hex.push(b.length === 1 ? '0' + b : b);
  }
  return hex.join('');
}

/**
 * Converts a hex string into a Uint8Array
 * @param {string} hex
 * @returns {Uint8Array}
 */
function hexToBytes(hex) {
  var bytes = new Uint8Array(hex.length / 2);
  for (var i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

/**
 * Hashes a plaintext password using Web Crypto API PBKDF2-HMAC-SHA-256 (TSK-029)
 * Generates a unique 128-bit cryptographically secure salt per user.
 * Output Format: 'pbkdf2:sha256:100000:<saltHex>:<hashHex>'
 * @param {string} password - Plaintext password to hash
 * @param {string} [saltHex] - Optional 16-byte hex salt (used during verification)
 * @returns {Promise<string>}
 */
async function hashPassword(password, saltHex) {
  var iterations = 100000;
  var cryptoObj = null;

  if (typeof window !== 'undefined' && window.crypto) {
    cryptoObj = window.crypto;
  } else if (typeof crypto !== 'undefined') {
    cryptoObj = crypto.webcrypto ? crypto.webcrypto : crypto;
  }

  if (!cryptoObj || !cryptoObj.subtle) {
    throw new Error('Web Crypto API is not supported in this runtime environment.');
  }

  var salt;
  if (saltHex) {
    salt = hexToBytes(saltHex);
  } else {
    salt = new Uint8Array(16);
    cryptoObj.getRandomValues(salt);
    saltHex = bytesToHex(salt);
  }

  var enc = new TextEncoder();
  var keyMaterial = await cryptoObj.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  var derivedBits = await cryptoObj.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: iterations,
      hash: 'SHA-256'
    },
    keyMaterial,
    256
  );

  var hashHex = bytesToHex(new Uint8Array(derivedBits));
  return 'pbkdf2:sha256:' + iterations + ':' + saltHex + ':' + hashHex;
}

/**
 * Verifies password against stored credentials (supports PBKDF2 and legacy Base64 auto-migration)
 * @param {string} password - User entered plaintext password
 * @param {string} storedHash - Stored string from database
 * @returns {Promise<{ valid: boolean, needsUpgrade: boolean }>}
 */
async function verifyPassword(password, storedHash) {
  if (!storedHash || !password) return { valid: false, needsUpgrade: false };

  // 1. PBKDF2 verification
  if (storedHash.startsWith('pbkdf2:sha256:')) {
    var parts = storedHash.split(':');
    if (parts.length === 5) {
      var saltHex = parts[3];
      var expectedHash = parts[4];
      try {
        var computed = await hashPassword(password, saltHex);
        var computedHash = computed.split(':')[4];
        return {
          valid: computedHash === expectedHash,
          needsUpgrade: false
        };
      } catch (e) {
        console.error('PBKDF2 verification error:', e);
        return { valid: false, needsUpgrade: false };
      }
    }
  }

  // 2. Legacy Base64 check (enables seamless on-the-fly upgrade without user disruption)
  try {
    var decoded = null;
    if (typeof atob === 'function') {
      decoded = atob(storedHash);
    } else if (typeof Buffer !== 'undefined') {
      decoded = Buffer.from(storedHash, 'base64').toString('utf8');
    }
    if (decoded && decoded === password) {
      return { valid: true, needsUpgrade: true };
    }
  } catch (e) {}

  return { valid: false, needsUpgrade: false };
}

/**
 * Modern non-blocking Toast notification system
 * @param {string} message
 * @param {'info'|'success'|'error'|'warning'} [type='info']
 * @param {number} [duration=3500]
 */
function showToast(message, type, duration) {
  if (!message) return;
  type = type || 'info';
  duration = duration || 3500;

  var container = document.getElementById('portal-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'portal-toast-container';
    container.className = 'portal-toast-container';
    document.body.appendChild(container);
  }

  var toast = document.createElement('div');
  toast.className = 'portal-toast portal-toast-' + type;

  var iconSvg = '';
  if (type === 'success') {
    iconSvg = '<svg class="portal-toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>';
  } else if (type === 'error') {
    iconSvg = '<svg class="portal-toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>';
  } else if (type === 'warning') {
    iconSvg = '<svg class="portal-toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>';
  } else {
    iconSvg = '<svg class="portal-toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
  }

  toast.innerHTML = iconSvg + '<div class="portal-toast-body">' + escapeHtml(message) + '</div>' +
    '<button type="button" class="portal-toast-close" aria-label="Close">&times;</button>';

  var closeBtn = toast.querySelector('.portal-toast-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', function() {
      dismissToast(toast);
    });
  }

  container.appendChild(toast);

  // Trigger enter transition
  requestAnimationFrame(function() {
    toast.classList.add('portal-toast-show');
  });

  var timer = setTimeout(function() {
    dismissToast(toast);
  }, duration);

  function dismissToast(el) {
    clearTimeout(timer);
    el.classList.remove('portal-toast-show');
    el.classList.add('portal-toast-hide');
    setTimeout(function() {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 250);
  }
}

/**
 * Modern non-blocking Confirm Dialog replacing window.confirm
 * @param {string} message
 * @param {string} [title='Please Confirm']
 * @returns {Promise<boolean>}
 */
function showConfirmModal(message, title) {
  return new Promise(function(resolve) {
    var overlay = document.createElement('div');
    overlay.className = 'portal-modal-overlay';

    var modal = document.createElement('div');
    modal.className = 'portal-modal-card';
    modal.innerHTML =
      '<div class="portal-modal-header">' +
        '<h3>' + escapeHtml(title || 'Please Confirm') + '</h3>' +
      '</div>' +
      '<div class="portal-modal-body">' +
        '<p>' + escapeHtml(message) + '</p>' +
      '</div>' +
      '<div class="portal-modal-actions">' +
        '<button type="button" class="portal-btn portal-btn-secondary" id="portal-modal-cancel">Cancel</button>' +
        '<button type="button" class="portal-btn portal-btn-primary" id="portal-modal-ok">Confirm</button>' +
      '</div>';

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    function cleanup(result) {
      overlay.classList.add('portal-modal-closing');
      setTimeout(function() {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        resolve(result);
      }, 200);
    }

    modal.querySelector('#portal-modal-cancel').addEventListener('click', function() { cleanup(false); });
    modal.querySelector('#portal-modal-ok').addEventListener('click', function() { cleanup(true); });
    overlay.addEventListener('click', function(e) { if (e.target === overlay) cleanup(false); });
  });
}

// Seamless non-blocking alert wrapper for improved UX across all modules
(function() {
  if (typeof window === 'undefined') return;
  var _origAlert = window.alert;
  window.alert = function(msg) {
    if (typeof showToast === 'function') {
      var str = String(msg || '');
      var isSuccess = str.indexOf('✅') !== -1 || /success|saved|added|updated/i.test(str);
      var isError = str.indexOf('❌') !== -1 || /failed|error|wrong|cannot|invalid/i.test(str);
      var isWarning = /please|warning|at least|select/i.test(str);
      showToast(str, isSuccess ? 'success' : (isError ? 'error' : (isWarning ? 'warning' : 'info')));
    } else if (_origAlert) {
      _origAlert(msg);
    }
  };
})();

// Attach to window if in browser
if (typeof window !== 'undefined') {
  window.escapeHtml     = escapeHtml;
  window.safeUrl        = safeUrl;
  window.sanitizeInput  = sanitizeInput;
  window.sanitizeText   = sanitizeText;
  window.sanitizeHtml   = sanitizeHtml;
  window.formatDate     = formatDate;
  window.migrateEntry   = migrateEntry;
  window.migrateBadgeEntry = migrateBadgeEntry;
  window.bytesToHex     = bytesToHex;
  window.hexToBytes     = hexToBytes;
  window.hashPassword   = hashPassword;
  window.verifyPassword = verifyPassword;
  window.showToast      = showToast;
  window.showConfirmModal = showConfirmModal;
}

// Export for module systems if present
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    escapeHtml: escapeHtml,
    safeUrl: safeUrl,
    sanitizeInput: sanitizeInput,
    sanitizeText: sanitizeText,
    sanitizeHtml: sanitizeHtml,
    formatDate: formatDate,
    migrateEntry: migrateEntry,
    migrateBadgeEntry: migrateBadgeEntry,
    bytesToHex: bytesToHex,
    hexToBytes: hexToBytes,
    hashPassword: hashPassword,
    verifyPassword: verifyPassword,
    showToast: showToast,
    showConfirmModal: showConfirmModal
  };
}
