/**
 * 1st Petaling Jaya Boys' Brigade Portal
 * Core Utilities, Data Normalization & UI Notification System
 */

/**
 * Escapes unsafe characters for HTML rendering to prevent XSS vulnerabilities
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
    .replace(/'/g, '&#39;');
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

// Export for module systems if present
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    escapeHtml: escapeHtml,
    formatDate: formatDate,
    migrateEntry: migrateEntry,
    migrateBadgeEntry: migrateBadgeEntry,
    showToast: showToast,
    showConfirmModal: showConfirmModal
  };
}
