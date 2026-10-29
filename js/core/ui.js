/**
 * 1st Petaling Jaya Boys' Brigade Portal - UI Notification & Modal System (TSK-012)
 * File: js/core/ui.js
 *
 * Provides responsive, non-blocking toast notifications and accessible
 * Promise-based custom confirmation dialogs, replacing native browser alert() and confirm().
 */

(function(global) {
  'use strict';

  /**
   * Helper to safely escape HTML characters
   * @param {*} str
   * @returns {string}
   */
  function safeEscapeHtml(str) {
    if (typeof escapeHtml === 'function') {
      return escapeHtml(str);
    }
    if (typeof window !== 'undefined' && typeof window.escapeHtml === 'function') {
      return window.escapeHtml(str);
    }
    if (typeof global !== 'undefined' && typeof global.escapeHtml === 'function') {
      return global.escapeHtml(str);
    }
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Ensure the toast container DOM element exists
   * @returns {HTMLElement|null}
   */
  function ensureToastContainer() {
    if (typeof document === 'undefined') return null;
    var container = document.getElementById('portal-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'portal-toast-container';
      container.className = 'portal-toast-container';
      container.setAttribute('aria-live', 'polite');
      container.setAttribute('aria-atomic', 'true');
      document.body.appendChild(container);
    }
    return container;
  }

  /**
   * Modern non-blocking Toast notification system
   * @param {string} message - Content of the notification
   * @param {'info'|'success'|'error'|'warning'} [type='info'] - Style variant
   * @param {number} [duration=3500] - Display duration before auto-dismiss in milliseconds
   * @returns {HTMLElement|null} The created toast element
   */
  var _lastToastMap = {};
  var MAX_VISIBLE_TOASTS = 3;

  function showToast(message, type, duration) {
    if (!message) return null;
    if (typeof document === 'undefined') return null;

    type = type || 'info';
    duration = duration || 3500;

    // Prevent duplicate rapid-fire identical toasts
    var dedupKey = type + ':' + String(message).trim();
    var now = Date.now();
    if (_lastToastMap[dedupKey] && now - _lastToastMap[dedupKey] < 1200) {
      return null;
    }
    _lastToastMap[dedupKey] = now;

    // Prune stale toast throttling entries
    var toastKeys = Object.keys(_lastToastMap);
    if (toastKeys.length > 40) {
      for (var tk = 0; tk < toastKeys.length; tk++) {
        if (now - _lastToastMap[toastKeys[tk]] > 10000) {
          delete _lastToastMap[toastKeys[tk]];
        }
      }
    }

    var container = ensureToastContainer();
    if (!container) return null;

    // Cap active toast count to MAX_VISIBLE_TOASTS
    while (container.children.length >= MAX_VISIBLE_TOASTS) {
      var oldest = container.firstElementChild;
      if (oldest) {
        if (oldest._dismissTimer) clearTimeout(oldest._dismissTimer);
        container.removeChild(oldest);
      } else {
        break;
      }
    }

    var toast = document.createElement('div');
    toast.className = 'portal-toast portal-toast-' + type;
    toast.setAttribute('role', 'alert');

    var iconSvg = '';
    if (type === 'success') {
      iconSvg = '<svg class="portal-toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>';
    } else if (type === 'error') {
      iconSvg = '<svg class="portal-toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>';
    } else if (type === 'warning') {
      iconSvg = '<svg class="portal-toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>';
    } else {
      iconSvg = '<svg class="portal-toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
    }

    var safeMsg = safeEscapeHtml(message).replace(/\n/g, '<br>');

    toast.innerHTML = iconSvg +
      '<div class="portal-toast-body">' + safeMsg + '</div>' +
      '<button type="button" class="portal-toast-close" aria-label="Close notification">&times;</button>';

    var closeBtn = toast.querySelector('.portal-toast-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', function() {
        dismissToast(toast);
      });
    }

    container.appendChild(toast);

    // Trigger enter transition
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(function() {
        toast.classList.add('portal-toast-show');
      });
    } else {
      toast.classList.add('portal-toast-show');
    }

    var timer = setTimeout(function() {
      dismissToast(toast);
    }, duration);

    toast._dismissTimer = timer;

    return toast;
  }

  /**
   * Dismiss and animate out an existing toast element
   * @param {HTMLElement} el - The toast DOM element to dismiss
   */
  function dismissToast(el) {
    if (!el) return;
    if (el._dismissTimer) {
      clearTimeout(el._dismissTimer);
      el._dismissTimer = null;
    }
    el.classList.remove('portal-toast-show');
    el.classList.add('portal-toast-hide');
    setTimeout(function() {
      if (el && el.parentNode) {
        el.parentNode.removeChild(el);
      }
    }, 250);
  }

  /**
   * Modern non-blocking Confirm Dialog replacing window.confirm
   * @param {string} message - Prompt description
   * @param {string} [title='Please Confirm'] - Header title
   * @param {Object} [options] - Custom button labels & options
   * @param {string} [options.confirmText='Confirm'] - Confirmation button text
   * @param {string} [options.cancelText='Cancel'] - Cancellation button text
   * @param {boolean} [options.isDestructive=false] - Whether this action is destructive
   * @returns {Promise<boolean>} Resolves true on confirm, false on cancel/backdrop/esc
   */
  function showConfirmModal(message, title, options) {
    options = options || {};
    var confirmText = options.confirmText || 'Confirm';
    var cancelText = options.cancelText || 'Cancel';

    return new Promise(function(resolve) {
      if (typeof document === 'undefined') {
        resolve(false);
        return;
      }

      var overlay = document.createElement('div');
      overlay.className = 'portal-modal-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');

      var modal = document.createElement('div');
      modal.className = 'portal-modal-card';

      var safeTitle = safeEscapeHtml(title || 'Please Confirm');
      var safeMsg = safeEscapeHtml(message || '').replace(/\n/g, '<br>');

      modal.innerHTML =
        '<div class="portal-modal-header">' +
          '<h3>' + safeTitle + '</h3>' +
        '</div>' +
        '<div class="portal-modal-body">' +
          '<p>' + safeMsg + '</p>' +
        '</div>' +
        '<div class="portal-modal-actions">' +
          '<button type="button" class="portal-btn portal-btn-secondary" id="portal-modal-cancel">' + safeEscapeHtml(cancelText) + '</button>' +
          '<button type="button" class="portal-btn portal-btn-primary" id="portal-modal-ok">' + safeEscapeHtml(confirmText) + '</button>' +
        '</div>';

      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      var cleanedUp = false;
      function cleanup(result) {
        if (cleanedUp) return;
        cleanedUp = true;
        if (typeof document !== 'undefined') {
          document.removeEventListener('keydown', handleKeyDown);
        }
        overlay.classList.add('portal-modal-closing');
        setTimeout(function() {
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
          resolve(result);
        }, 200);
      }

      function handleKeyDown(e) {
        if (e.key === 'Escape' || e.keyCode === 27) {
          cleanup(false);
        }
      }

      if (typeof document !== 'undefined') {
        document.addEventListener('keydown', handleKeyDown);
      }

      var cancelBtn = modal.querySelector('#portal-modal-cancel');
      var okBtn = modal.querySelector('#portal-modal-ok');

      if (cancelBtn) cancelBtn.addEventListener('click', function() { cleanup(false); });
      if (okBtn) okBtn.addEventListener('click', function() { cleanup(true); });
      overlay.addEventListener('click', function(e) {
        if (e.target === overlay) cleanup(false);
      });

      // Accessible auto-focus
      if (okBtn && typeof okBtn.focus === 'function') {
        setTimeout(function() {
          try { okBtn.focus(); } catch (_) {}
        }, 50);
      }
    });
  }

  /**
   * Initializes global button debouncing (TSK-025)
   * Intercepts rapid button clicks within delayMs to prevent accidental duplicate actions and request floods.
   * @param {number} [delayMs=500]
   */
  function initGlobalButtonDebounce(delayMs) {
    if (typeof document === 'undefined') return;
    var wait = typeof delayMs === 'number' ? delayMs : 500;
    document.addEventListener(
      'click',
      function(e) {
        var btn = e.target && e.target.closest ? e.target.closest('button, [role="button"], input[type="submit"], input[type="button"], .btn') : null;
        if (!btn) return;
        if (
          btn.hasAttribute('data-no-debounce') ||
          btn.classList.contains('no-debounce') ||
          btn.classList.contains('hq-carousel-arrow') ||
          btn.classList.contains('hq-carousel-dot') ||
          btn.classList.contains('nav-link') ||
          btn.classList.contains('tab-btn') ||
          btn.classList.contains('channel-item')
        ) return;

        var now = Date.now();
        var last = parseInt(btn.getAttribute('data-last-click') || '0', 10);
        if (now - last < wait) {
          e.preventDefault();
          e.stopImmediatePropagation();
          return;
        }
        btn.setAttribute('data-last-click', String(now));
      },
      true
    );
  }

  /**
   * Wraps an async button action with busy/disabled state (TSK-025)
   * @param {HTMLElement} btn
   * @param {Function} asyncFn
   * @returns {Promise<any>}
   */
  async function withButtonLock(btn, asyncFn) {
    if (!btn || typeof asyncFn !== 'function') return typeof asyncFn === 'function' ? asyncFn() : null;
    var wasDisabled = btn.disabled;
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    try {
      return await asyncFn();
    } finally {
      btn.disabled = wasDisabled;
      btn.removeAttribute('aria-busy');
    }
  }

  if (typeof document !== 'undefined') {
    initGlobalButtonDebounce(500);
  }

  // Non-blocking alert safety-net wrapper
  if (typeof global !== 'undefined' && global.window) {
    global.window.alert = function(msg) {
      var str = String(msg || '');
      var isSuccess = str.indexOf('✅') !== -1 || /success|saved|added|updated|created|synced/i.test(str);
      var isError = str.indexOf('❌') !== -1 || /failed|error|wrong|cannot|invalid|incorrect|denied/i.test(str);
      var isWarning = /please|warning|at least|select|required|fill|do not/i.test(str);
      var type = isSuccess ? 'success' : (isError ? 'error' : (isWarning ? 'warning' : 'info'));
      showToast(str, type);
    };
  }

  // Expose to window / global
  if (typeof global !== 'undefined') {
    global.showToast = showToast;
    global.dismissToast = dismissToast;
    global.showConfirmModal = showConfirmModal;
    global.ensureToastContainer = ensureToastContainer;
    global.initGlobalButtonDebounce = initGlobalButtonDebounce;
    global.withButtonLock = withButtonLock;
  }

  // CommonJS export for Node testing
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      showToast: showToast,
      dismissToast: dismissToast,
      showConfirmModal: showConfirmModal,
      ensureToastContainer: ensureToastContainer,
      initGlobalButtonDebounce: initGlobalButtonDebounce,
      withButtonLock: withButtonLock
    };
  }
})(typeof window !== 'undefined' ? window : this);
