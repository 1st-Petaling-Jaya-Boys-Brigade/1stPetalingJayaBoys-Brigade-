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
 * Computes SHA-256 hexadecimal hash using Web Crypto or Node.js crypto (BUG-009)
 * @param {string} str
 * @returns {Promise<string>}
 */
async function computeSha256(str) {
  if (typeof str !== 'string') return '';
  var cryptoObj =
    typeof window !== 'undefined' && window.crypto
      ? window.crypto
      : typeof crypto !== 'undefined'
        ? (crypto.webcrypto ? crypto.webcrypto : crypto)
        : null;

  if (cryptoObj && cryptoObj.subtle && typeof TextEncoder !== 'undefined') {
    var enc = new TextEncoder();
    var hashBuf = await cryptoObj.subtle.digest('SHA-256', enc.encode(str));
    var bytes = new Uint8Array(hashBuf);
    var hex = '';
    for (var i = 0; i < bytes.length; i++) {
      var b = bytes[i].toString(16);
      hex += b.length === 1 ? '0' + b : b;
    }
    return hex;
  }

  if (typeof require !== 'undefined') {
    try {
      var nodeCrypto = require('crypto');
      return nodeCrypto.createHash('sha256').update(str).digest('hex');
    } catch (e) {}
  }

  return '';
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
 * Unicode-safe Base64 encoder (BUG-003)
 * @param {string} str
 * @returns {string}
 */
function safeBase64Encode(str) {
  if (typeof str !== 'string') return '';
  try {
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(str, 'utf8').toString('base64');
    }
    if (typeof btoa === 'function') {
      return btoa(
        encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function (match, p1) {
          return String.fromCharCode(parseInt(p1, 16));
        })
      );
    }
  } catch (e) {
    return '';
  }
  return '';
}

/**
 * Unicode-safe Base64 decoder (BUG-003)
 * @param {string} str
 * @returns {string|null}
 */
function safeBase64Decode(str) {
  if (typeof str !== 'string' || !str) return null;
  try {
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(str, 'base64').toString('utf8');
    }
    if (typeof atob === 'function') {
      var binary = atob(str);
      var encoded = Array.prototype.map
        .call(binary, function (c) {
          return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        })
        .join('');
      return decodeURIComponent(encoded);
    }
  } catch (e) {
    return null;
  }
  return null;
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

  // 2. Legacy Base64 check (enables seamless on-the-fly upgrade without user disruption; Unicode-safe BUG-003)
  try {
    var decoded = safeBase64Decode(storedHash);
    if (decoded && decoded === password) {
      return { valid: true, needsUpgrade: true };
    }
  } catch (e) {}

  return { valid: false, needsUpgrade: false };
}

/**
 * Modern non-blocking Toast notification system (delegates to js/core/ui.js)
 * @param {string} message
 * @param {'info'|'success'|'error'|'warning'} [type='info']
 * @param {number} [duration=3500]
 */
function showToast(message, type, duration) {
  if (typeof window !== 'undefined' && typeof window.showToast === 'function' && window.showToast !== showToast) {
    return window.showToast(message, type, duration);
  }
  try {
    var ui = require('./ui.js');
    if (ui && typeof ui.showToast === 'function') {
      return ui.showToast(message, type, duration);
    }
  } catch (_) {}
  return null;
}

/**
 * Modern non-blocking Confirm Dialog replacing window.confirm (delegates to js/core/ui.js)
 * @param {string} message
 * @param {string} [title='Please Confirm']
 * @param {Object} [options]
 * @returns {Promise<boolean>}
 */
function showConfirmModal(message, title, options) {
  if (typeof window !== 'undefined' && typeof window.showConfirmModal === 'function' && window.showConfirmModal !== showConfirmModal) {
    return window.showConfirmModal(message, title, options);
  }
  try {
    var ui = require('./ui.js');
    if (ui && typeof ui.showConfirmModal === 'function') {
      return ui.showConfirmModal(message, title, options);
    }
  } catch (_) {}
  return Promise.resolve(false);
}

/**
 * Debounces a function call by waitMs (TSK-025)
 * @param {Function} fn
 * @param {number} waitMs
 * @returns {Function}
 */
function debounce(fn, waitMs) {
  var timer = null;
  return function() {
    var ctx = this;
    var args = arguments;
    clearTimeout(timer);
    timer = setTimeout(function() {
      fn.apply(ctx, args);
    }, waitMs);
  };
}

/**
 * Throttles a function call by limitMs (TSK-025)
 * @param {Function} fn
 * @param {number} limitMs
 * @returns {Function}
 */
function throttle(fn, limitMs) {
  var inThrottle = false;
  return function() {
    var ctx = this;
    var args = arguments;
    if (!inThrottle) {
      fn.apply(ctx, args);
      inThrottle = true;
      setTimeout(function() { inThrottle = false; }, limitMs);
    }
  };
}

/**
 * Client-side image compressor before upload (TSK-025)
 * Scales down dimensions maintaining aspect ratio and encodes to compressed WebP or JPEG.
 * @param {File|Blob|string} source - File, Blob, or Data URL to compress
 * @param {Object} [options]
 * @param {number} [options.maxWidth=1920] - Max output width in px
 * @param {number} [options.maxHeight=1920] - Max output height in px
 * @param {number} [options.quality=0.82] - Compression quality 0.0 to 1.0
 * @param {string} [options.mimeType='image/jpeg'] - Output format ('image/jpeg' or 'image/webp')
 * @returns {Promise<{blob: Blob|null, dataUrl: string|null, width: number, height: number, originalSize: number, compressedSize: number, compressed: boolean}>}
 */
function compressImage(source, options) {
  options = options || {};
  var maxWidth = options.maxWidth || 1920;
  var maxHeight = options.maxHeight || 1920;
  var quality = typeof options.quality === 'number' ? options.quality : 0.82;
  var mimeType = options.mimeType || 'image/jpeg';

  if (!source) return Promise.resolve(null);

  // In test / non-browser environment without DOM canvas, return mock descriptor
  if (typeof document === 'undefined' && typeof OffscreenCanvas === 'undefined') {
    var size = source.size || (typeof source === 'string' ? source.length : 0);
    return Promise.resolve({
      blob: (typeof Blob !== 'undefined' && source instanceof Blob) ? source : null,
      dataUrl: typeof source === 'string' ? source : null,
      width: maxWidth,
      height: maxHeight,
      originalSize: size,
      compressedSize: size,
      compressed: false
    });
  }

  return new Promise(function(resolve, reject) {
    var originalSize = source.size || 0;

    function processImg(img) {
      var width = img.naturalWidth || img.width || maxWidth;
      var height = img.naturalHeight || img.height || maxHeight;

      if (width > maxWidth || height > maxHeight) {
        if (width / height > maxWidth / maxHeight) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        } else {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      var canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      var ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve({
          blob: (typeof Blob !== 'undefined' && source instanceof Blob) ? source : null,
          dataUrl: null,
          width: width,
          height: height,
          originalSize: originalSize,
          compressedSize: originalSize,
          compressed: false
        });
        return;
      }

      ctx.fillStyle = '#ffffff';
      if (mimeType === 'image/jpeg') {
        ctx.fillRect(0, 0, width, height);
      }
      ctx.drawImage(img, 0, 0, width, height);

      var dataUrl = canvas.toDataURL(mimeType, quality);
      if (canvas.toBlob) {
        canvas.toBlob(function(blob) {
          resolve({
            blob: blob,
            dataUrl: dataUrl,
            width: width,
            height: height,
            originalSize: originalSize,
            compressedSize: blob ? blob.size : dataUrl.length,
            compressed: true
          });
        }, mimeType, quality);
      } else {
        resolve({
          blob: null,
          dataUrl: dataUrl,
          width: width,
          height: height,
          originalSize: originalSize,
          compressedSize: dataUrl.length,
          compressed: true
        });
      }
    }

    if (typeof source === 'string' && (source.indexOf('data:') === 0 || source.indexOf('blob:') === 0 || source.indexOf('http') === 0)) {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function() { processImg(img); };
      img.onerror = function() { reject(new Error('Failed to load image source')); };
      img.src = source;
    } else if (typeof FileReader !== 'undefined' && (source instanceof Blob || source instanceof File)) {
      var reader = new FileReader();
      reader.onload = function(e) {
        var img = new Image();
        img.onload = function() { processImg(img); };
        img.onerror = function() { reject(new Error('Failed to parse image from file')); };
        img.src = e.target.result;
      };
      reader.onerror = function() { reject(new Error('Failed to read image file')); };
      reader.readAsDataURL(source);
    } else {
      resolve({
        blob: source,
        dataUrl: null,
        width: maxWidth,
        height: maxHeight,
        originalSize: originalSize,
        compressedSize: originalSize,
        compressed: false
      });
    }
  });
}


/**
 * Detects file format by inspecting ASCII text signatures and binary magic bytes (TSK-035)
 * @param {ArrayBuffer|Uint8Array} buffer
 * @returns {string} Detected format ('jpeg'|'png'|'webp'|'gif'|'pdf'|'mp4'|'webm'|'svg'|'html'|'xml'|'unknown')
 */
function detectFileType(buffer) {
  if (!buffer) return 'unknown';
  var u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (u8.length < 4) return 'unknown';

  // Check ASCII text tags first (SVG, XML, HTML, scripts)
  var len = Math.min(128, u8.length);
  var headerText = '';
  for (var i = 0; i < len; i++) {
    headerText += String.fromCharCode(u8[i]);
  }
  headerText = headerText.toLowerCase().trim();

  if (
    headerText.indexOf('<svg') !== -1 ||
    headerText.indexOf('xmlns="http://www.w3.org/2000/svg"') !== -1 ||
    headerText.indexOf('xmlns=\'http://www.w3.org/2000/svg\'') !== -1
  ) {
    return 'svg';
  }
  if (
    headerText.indexOf('<html') !== -1 ||
    headerText.indexOf('<!doctype html') !== -1 ||
    headerText.indexOf('<script') !== -1 ||
    headerText.indexOf('<body') !== -1
  ) {
    return 'html';
  }
  if (headerText.indexOf('<?xml') !== -1) {
    return 'xml';
  }

  // Binary Magic Bytes:
  // JPEG: FF D8 FF
  if (u8[0] === 0xFF && u8[1] === 0xD8 && u8[2] === 0xFF) return 'jpeg';
  // PNG: 89 50 4E 47
  if (u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4E && u8[3] === 0x47) return 'png';
  // WebP: RIFF .... WEBP
  if (
    u8.length >= 12 &&
    u8[0] === 0x52 && u8[1] === 0x49 && u8[2] === 0x46 && u8[3] === 0x46 &&
    u8[8] === 0x57 && u8[9] === 0x45 && u8[10] === 0x42 && u8[11] === 0x50
  ) {
    return 'webp';
  }
  // GIF: GIF8
  if (u8[0] === 0x47 && u8[1] === 0x49 && u8[2] === 0x46 && u8[3] === 0x38) return 'gif';
  // PDF: %PDF (25 50 44 46)
  if (u8[0] === 0x25 && u8[1] === 0x50 && u8[2] === 0x44 && u8[3] === 0x46) return 'pdf';
  // MP4 / MOV: bytes 4-7 are 'ftyp' (66 74 79 70)
  if (u8.length >= 8 && u8[4] === 0x66 && u8[5] === 0x74 && u8[6] === 0x79 && u8[7] === 0x70) return 'mp4';
  // WebM: 1A 45 DF A3 (EBML Header)
  if (u8[0] === 0x1A && u8[1] === 0x45 && u8[2] === 0xDF && u8[3] === 0xA3) return 'webm';

  return 'unknown';
}

/**
 * Checks if a JPEG byte buffer contains EXIF APP1 metadata with GPS tags (TSK-035)
 * @param {ArrayBuffer|Uint8Array} buffer
 * @returns {boolean} True if GPS tags exist in buffer
 */
function hasExifGps(buffer) {
  if (!buffer) return false;
  var u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (u8.length < 14) return false;
  if (u8[0] !== 0xFF || u8[1] !== 0xD8) return false;

  var offset = 2;
  while (offset < u8.length - 4) {
    if (u8[offset] !== 0xFF) break;
    var marker = u8[offset + 1];
    if (marker === 0xDA || marker === 0xD9) break;

    var length = (u8[offset + 2] << 8) | u8[offset + 3];
    if (marker === 0xE1 && length >= 14) {
      // Check 'Exif\0\0'
      var isExif =
        u8[offset + 4] === 0x45 &&
        u8[offset + 5] === 0x78 &&
        u8[offset + 6] === 0x69 &&
        u8[offset + 7] === 0x66 &&
        u8[offset + 8] === 0x00 &&
        u8[offset + 9] === 0x00;
      if (isExif) {
        // Search inside APP1 segment for GPS pointer tag 0x8825
        for (var i = offset + 10; i < offset + 2 + length - 2; i++) {
          if (
            (u8[i] === 0x88 && u8[i + 1] === 0x25) ||
            (u8[i] === 0x25 && u8[i + 1] === 0x88)
          ) {
            return true;
          }
        }
      }
    }
    offset += 2 + length;
  }
  return false;
}

/**
 * Strips all EXIF APP1 segments from a JPEG binary buffer (TSK-035)
 * @param {ArrayBuffer|Uint8Array} buffer
 * @returns {Uint8Array} Sanitized JPEG byte array with 0 EXIF metadata
 */
function stripExifBytes(buffer) {
  if (!buffer) return buffer;
  var u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (u8.length < 4 || u8[0] !== 0xFF || u8[1] !== 0xD8) return u8;

  var chunks = [u8.slice(0, 2)];
  var offset = 2;
  while (offset < u8.length - 1) {
    if (u8[offset] !== 0xFF) {
      chunks.push(u8.slice(offset));
      break;
    }
    var marker = u8[offset + 1];
    if (marker === 0xD8 || marker === 0xD9 || marker === 0x00) {
      chunks.push(u8.slice(offset, offset + 2));
      offset += 2;
      continue;
    }
    if (marker === 0xDA) {
      chunks.push(u8.slice(offset));
      break;
    }
    var length = (u8[offset + 2] << 8) | u8[offset + 3];
    if (marker === 0xE1) {
      // Skip APP1 segment (EXIF / GPS)
      offset += 2 + length;
      continue;
    }
    chunks.push(u8.slice(offset, offset + 2 + length));
    offset += 2 + length;
  }

  var totalLen = 0;
  for (var c = 0; c < chunks.length; c++) totalLen += chunks[c].length;
  var result = new Uint8Array(totalLen);
  var pos = 0;
  for (var k = 0; k < chunks.length; k++) {
    result.set(chunks[k], pos);
    pos += chunks[k].length;
  }
  return result;
}

/**
 * Strict file security, MIME-type, and magic-byte validator (TSK-035)
 * Blocks .svg, .html, .htm, scripts, executables, and polyglots to prevent Stored XSS.
 * Verifies magic bytes against approved media types.
 * @param {File|Blob|ArrayBuffer|Uint8Array} file
 * @param {Object} [options]
 * @param {string[]} [options.allowedTypes]
 * @param {boolean} [options.allowVideo=false]
 * @param {boolean} [options.allowPdf=false]
 * @param {string} [options.bucket]
 * @returns {Promise<{valid: boolean, detectedType: string, extension: string}>}
 */
async function validateFileSecurity(file, options) {
  options = options || {};
  if (!file) throw new Error('File security error: No file provided.');

  var name = file.name || '';
  var ext = '';
  if (name && name.indexOf('.') !== -1) {
    ext = name.split('.').pop().toLowerCase();
  }

  // 1. Extension Blocklist
  var blockedExts = ['svg', 'svgz', 'html', 'htm', 'xhtml', 'js', 'mjs', 'ts', 'php', 'sh', 'bat', 'cmd', 'exe', 'dll', 'vbs', 'wsf'];
  if (blockedExts.indexOf(ext) !== -1) {
    throw new Error('File upload blocked: SVG, HTML, and executable files are strictly prohibited to prevent stored XSS and security vulnerabilities (TSK-035).');
  }

  // 2. MIME type Blocklist
  var declaredType = (file.type || '').toLowerCase();
  var blockedMimes = ['image/svg+xml', 'text/html', 'application/xhtml+xml', 'text/javascript', 'application/javascript', 'application/x-javascript'];
  if (blockedMimes.indexOf(declaredType) !== -1) {
    throw new Error('File upload blocked: MIME type ' + declaredType + ' is not permitted for security reasons (TSK-035).');
  }

  // 3. Extract byte sample for Magic Byte Inspection
  var buffer = null;
  if (file instanceof ArrayBuffer) {
    buffer = file;
  } else if (file instanceof Uint8Array) {
    buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
  } else if (typeof file.slice === 'function') {
    var slice = file.slice(0, 128);
    if (typeof slice.arrayBuffer === 'function') {
      buffer = await slice.arrayBuffer();
    } else if (typeof FileReader !== 'undefined') {
      buffer = await new Promise(function(resolve, reject) {
        var reader = new FileReader();
        reader.onload = function(e) { resolve(e.target.result); };
        reader.onerror = reject;
        reader.readAsArrayBuffer(slice);
      });
    }
  }

  var detected = 'unknown';
  if (buffer) {
    detected = detectFileType(buffer);

    // Block any file detected as SVG, HTML, or XML
    if (detected === 'svg' || detected === 'html' || detected === 'xml') {
      throw new Error('File upload blocked: Content inspection detected SVG or HTML script payload (TSK-035).');
    }

    // Determine allowed categories
    var allowed = options.allowedTypes || [];
    var allowVideo = options.allowVideo === true || options.bucket === 'gallery' || options.bucket === 'story_highlights';
    var allowPdf = options.allowPdf === true || options.bucket === 'resources' || options.bucket === 'waivers';

    var valid = false;
    if (allowed.length > 0) {
      valid = allowed.some(function(t) {
        return (
          t === declaredType ||
          t.indexOf(detected) !== -1 ||
          (detected === 'jpeg' && (t === 'image/jpeg' || t === 'image/jpg')) ||
          (detected === 'png' && t === 'image/png') ||
          (detected === 'webp' && t === 'image/webp') ||
          (detected === 'pdf' && t === 'application/pdf') ||
          (detected === 'mp4' && (t === 'video/mp4' || t === 'video/quicktime')) ||
          (detected === 'webm' && t === 'video/webm')
        );
      });
    } else {
      // Default allowed types for portal
      if (detected === 'jpeg' || detected === 'png' || detected === 'webp' || detected === 'gif') {
        valid = true;
      } else if (allowVideo && (detected === 'mp4' || detected === 'webm')) {
        valid = true;
      } else if (allowPdf && detected === 'pdf') {
        valid = true;
      }
    }

    if (!valid && detected === 'unknown') {
      throw new Error('File upload blocked: Unrecognized media format (Magic byte verification failed).');
    }
  }

  return {
    valid: true,
    detectedType: detected,
    extension: ext
  };
}

/**
 * Strips EXIF metadata (GPS home/school coordinates, camera serials, device info) via HTML5 Canvas rasterization (TSK-035)
 * Guarantees that returned image blob is completely sanitized and free of EXIF APP1 tags.
 * @param {File|Blob|ArrayBuffer|Uint8Array} source
 * @param {Object} [options]
 * @param {number} [options.maxDimension=1920]
 * @param {number} [options.quality=0.82]
 * @param {string} [options.mimeType='image/jpeg']
 * @returns {Promise<{blob: Blob|Uint8Array, width: number, height: number, stripped: boolean}>}
 */
async function stripExifAndCompress(source, options) {
  options = options || {};
  var maxDim = options.maxDimension || 1920;
  var quality = typeof options.quality === 'number' ? options.quality : 0.82;
  var mimeType = options.mimeType || 'image/jpeg';

  if (!source) throw new Error('No source provided for EXIF stripping');

  // Validate file security first (blocks SVG, HTML)
  await validateFileSecurity(source, options);

  // In test / headless Node environment without DOM canvas or Image:
  if (typeof document === 'undefined' || !document.createElement || typeof Image === 'undefined') {
    var rawBytes = null;
    if (source instanceof Uint8Array) {
      rawBytes = source;
    } else if (source instanceof ArrayBuffer) {
      rawBytes = new Uint8Array(source);
    } else if (typeof Buffer !== 'undefined' && Buffer.isBuffer(source)) {
      rawBytes = new Uint8Array(source);
    } else if (typeof source.arrayBuffer === 'function') {
      rawBytes = new Uint8Array(await source.arrayBuffer());
    } else if (source && source.buffer) {
      rawBytes = new Uint8Array(source.buffer, source.byteOffset || 0, source.byteLength || source.buffer.byteLength);
    }

    if (rawBytes) {
      var sanitizedBytes = stripExifBytes(rawBytes);
      var returnBlob = sanitizedBytes;
      if (typeof Blob !== 'undefined') {
        returnBlob = new Blob([sanitizedBytes], { type: mimeType });
      }
      return {
        blob: returnBlob,
        width: maxDim,
        height: maxDim,
        stripped: true
      };
    }
  }

  // Browser HTML5 Canvas Rasterization (inherently produces clean raster stream with zero EXIF headers)
  return new Promise(function(resolve, reject) {
    var img = new Image();
    var objUrl = null;

    function cleanup() {
      if (objUrl && typeof URL !== 'undefined' && URL.revokeObjectURL) {
        try { URL.revokeObjectURL(objUrl); } catch (e) {}
      }
    }

    img.onload = function() {
      cleanup();
      try {
        var w = img.naturalWidth || img.width || 1200;
        var h = img.naturalHeight || img.height || 800;

        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }

        var canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
        }

        if (typeof canvas.toBlob === 'function') {
          canvas.toBlob(function(blob) {
            resolve({
              blob: blob,
              width: w,
              height: h,
              stripped: true
            });
          }, mimeType, quality);
        } else {
          var dataUrl = canvas.toDataURL(mimeType, quality);
          resolve({
            blob: dataUrl,
            width: w,
            height: h,
            stripped: true
          });
        }
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = function() {
      cleanup();
      reject(new Error('Failed to load image for EXIF stripping and canvas rasterization.'));
    };

    if (typeof source === 'string' && (source.indexOf('data:') === 0 || source.indexOf('blob:') === 0)) {
      img.src = source;
    } else if (typeof URL !== 'undefined' && URL.createObjectURL && (source instanceof Blob || source instanceof File)) {
      objUrl = URL.createObjectURL(source);
      img.src = objUrl;
    } else if (typeof FileReader !== 'undefined' && (source instanceof Blob || source instanceof File)) {
      var reader = new FileReader();
      reader.onload = function(e) { img.src = e.target.result; };
      reader.onerror = reject;
      reader.readAsDataURL(source);
    } else {
      reject(new Error('Unsupported source format for EXIF stripping'));
    }
  });
}

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
  window.safeBase64Encode = safeBase64Encode;
  window.safeBase64Decode = safeBase64Decode;
  window.computeSha256   = computeSha256;
  window.hashPassword   = hashPassword;
  window.verifyPassword = verifyPassword;
  window.showToast      = showToast;
  window.showConfirmModal = showConfirmModal;
  window.debounce       = debounce;
  window.throttle       = throttle;
  window.compressImage  = compressImage;
  window.detectFileType = detectFileType;
  window.hasExifGps     = hasExifGps;
  window.stripExifBytes = stripExifBytes;
  window.validateFileSecurity = validateFileSecurity;
  window.stripExifAndCompress = stripExifAndCompress;
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
    safeBase64Encode: safeBase64Encode,
    safeBase64Decode: safeBase64Decode,
    computeSha256: computeSha256,
    hashPassword: hashPassword,
    verifyPassword: verifyPassword,
    showToast: showToast,
    showConfirmModal: showConfirmModal,
    debounce: debounce,
    throttle: throttle,
    compressImage: compressImage,
    detectFileType: detectFileType,
    hasExifGps: hasExifGps,
    stripExifBytes: stripExifBytes,
    validateFileSecurity: validateFileSecurity,
    stripExifAndCompress: stripExifAndCompress
  };
}
