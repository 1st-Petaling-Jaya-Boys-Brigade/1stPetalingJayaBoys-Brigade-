/**
 * Standardized High-UX Loading Architecture & Timing Utility
 * Enforces strict anti-flicker timing and standard patterns:
 *   - Pattern A: No Loader / Optimistic UI
 *   - Pattern B: Skeleton Screen Twins (Zero CLS)
 *   - Pattern C: Localized Inline Spinner
 *   - Pattern D: Determinate or Stepped Progress Bar
 *
 * Core Timing Constants:
 *   - SHOW_DELAY_MS = 200 (Zero loader flash if resolved under 200ms)
 *   - MIN_DISPLAY_MS = 400 (Once shown, remains visible at least 400ms to eliminate flicker)
 *   - LONG_WAIT_THRESHOLD_MS = 5000 (Slow request helper text & cancel/retry action)
 *   - TIMEOUT_MS = 15000 (Graceful inline timeout error with Try Again action)
 */

(function(global) {
  'use strict';

  // 1. Core Timing & Anti-Flicker Constants
  var SHOW_DELAY_MS = 200;
  var MIN_DISPLAY_MS = 400;
  var LONG_WAIT_THRESHOLD_MS = 5000;
  var TIMEOUT_MS = 15000;

  /**
   * Helper: safe HTML escaping for inline labels
   */
  function escapeText(str) {
    if (typeof global.escapeHtml === 'function') {
      return global.escapeHtml(str);
    }
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SKELETON GENERATOR HELPERS (Pattern B: Zero CLS)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Generates component-specific skeleton twins matching outer bounding-box dimensions
   * @param {number} count Number of skeleton items
   * @param {string} type 'announcement' | 'order' | 'badge' | 'form'
   * @returns {string} HTML string
   */
  function renderSkeletonCard(count, type) {
    var n = Math.max(1, count || 3);
    var html = '';

    for (var i = 0; i < n; i++) {
      if (type === 'announcement') {
        html +=
          '<div class="skeleton-announcement-card" aria-hidden="true">' +
            '<div class="skeleton-card-header">' +
              '<div class="skeleton-shimmer skeleton-circle" style="width:40px;height:40px;"></div>' +
              '<div style="flex:1;min-width:0;">' +
                '<div class="skeleton-shimmer skeleton-line medium" style="height:14px;margin-bottom:6px;"></div>' +
                '<div class="skeleton-shimmer skeleton-line short" style="height:11px;margin-bottom:0;"></div>' +
              '</div>' +
            '</div>' +
            '<div class="skeleton-card-body">' +
              '<div class="skeleton-shimmer skeleton-line" style="height:18px;width:75%;margin-bottom:12px;"></div>' +
              '<div class="skeleton-shimmer skeleton-line full" style="height:13px;margin-bottom:8px;"></div>' +
              '<div class="skeleton-shimmer skeleton-line long" style="height:13px;margin-bottom:8px;"></div>' +
              '<div class="skeleton-shimmer skeleton-line medium" style="height:13px;margin-bottom:0;"></div>' +
            '</div>' +
            '<div class="skeleton-card-footer">' +
              '<div class="skeleton-shimmer skeleton-pill" style="width:64px;height:26px;"></div>' +
              '<div class="skeleton-shimmer skeleton-pill" style="width:58px;height:26px;"></div>' +
            '</div>' +
          '</div>';
      } else if (type === 'order') {
        html +=
          '<div class="skeleton-order-card" aria-hidden="true">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
              '<div class="skeleton-shimmer skeleton-line" style="width:110px;height:16px;margin:0;"></div>' +
              '<div class="skeleton-shimmer skeleton-pill" style="width:70px;height:22px;"></div>' +
            '</div>' +
            '<div class="skeleton-shimmer skeleton-line full" style="height:13px;margin-bottom:8px;"></div>' +
            '<div class="skeleton-shimmer skeleton-line medium" style="height:13px;margin-bottom:12px;"></div>' +
            '<div style="display:flex;justify-content:space-between;align-items:center;padding-top:10px;border-top:1px solid var(--border-subtle);">' +
              '<div class="skeleton-shimmer skeleton-line short" style="height:13px;margin:0;"></div>' +
              '<div class="skeleton-shimmer skeleton-line" style="width:80px;height:18px;margin:0;"></div>' +
            '</div>' +
          '</div>';
      } else if (type === 'badge') {
        html +=
          '<div class="skeleton-shimmer" style="height:140px;border-radius:var(--radius-md, 12px);padding:16px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;box-sizing:border-box;" aria-hidden="true">' +
            '<div class="skeleton-shimmer skeleton-circle" style="width:48px;height:48px;"></div>' +
            '<div class="skeleton-shimmer skeleton-line medium" style="height:12px;margin:0;"></div>' +
            '<div class="skeleton-shimmer skeleton-line short" style="height:10px;margin:0;"></div>' +
          '</div>';
      } else if (type === 'form') {
        html +=
          '<div class="skeleton-order-card" style="padding:18px;" aria-hidden="true">' +
            '<div style="display:flex;gap:12px;align-items:center;margin-bottom:12px;">' +
              '<div class="skeleton-shimmer skeleton-circle" style="width:36px;height:36px;"></div>' +
              '<div style="flex:1;">' +
                '<div class="skeleton-shimmer skeleton-line medium" style="height:16px;margin-bottom:6px;"></div>' +
                '<div class="skeleton-shimmer skeleton-line short" style="height:11px;margin:0;"></div>' +
              '</div>' +
            '</div>' +
            '<div class="skeleton-shimmer skeleton-line full" style="height:12px;margin-bottom:6px;"></div>' +
            '<div class="skeleton-shimmer skeleton-line long" style="height:12px;margin:0;"></div>' +
          '</div>';
      }
    }

    return html;
  }

  /**
   * Generates a data table skeleton twin matching table rows and column layout
   * @param {number} rows Number of rows
   * @param {number} cols Number of columns
   * @returns {string} HTML string
   */
  function renderSkeletonTable(rows, cols) {
    var rCount = Math.max(1, rows || 5);
    var cCount = Math.max(1, cols || 4);
    var html = '<div class="skeleton-table-wrapper" aria-hidden="true">';

    // Table Header
    html += '<div class="skeleton-table-header">';
    for (var c = 0; c < cCount; c++) {
      var colW = c === 0 ? '30%' : (c === 1 ? '25%' : '20%');
      html += '<div class="skeleton-shimmer skeleton-line" style="width:' + colW + ';height:14px;margin:0;"></div>';
    }
    html += '</div>';

    // Table Rows
    for (var r = 0; r < rCount; r++) {
      html += '<div class="skeleton-table-row">';
      for (var k = 0; k < cCount; k++) {
        var rowW = k === 0 ? '35%' : (k === 1 ? '20%' : '18%');
        html += '<div class="skeleton-shimmer skeleton-line" style="width:' + rowW + ';height:13px;margin:0;"></div>';
      }
      html += '</div>';
    }

    html += '</div>';
    return html;
  }

  /**
   * Generates a kanban board skeleton twin with 3 columns
   * @returns {string} HTML string
   */
  function renderSkeletonKanban() {
    var html = '<div class="skeleton-kanban-board" aria-hidden="true">';
    var _titles = ['To Do', 'In Progress', 'Done'];

    for (var i = 0; i < 3; i++) {
      html +=
        '<div class="skeleton-kanban-column">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
            '<div class="skeleton-shimmer skeleton-line" style="width:80px;height:16px;margin:0;"></div>' +
            '<div class="skeleton-shimmer skeleton-pill" style="width:28px;height:20px;"></div>' +
          '</div>' +
          '<div class="skeleton-order-card" style="margin-bottom:8px;">' +
            '<div class="skeleton-shimmer skeleton-line medium" style="height:14px;margin-bottom:8px;"></div>' +
            '<div class="skeleton-shimmer skeleton-line full" style="height:11px;margin-bottom:6px;"></div>' +
            '<div class="skeleton-shimmer skeleton-line short" style="height:10px;margin:0;"></div>' +
          '</div>' +
          '<div class="skeleton-order-card" style="margin:0;">' +
            '<div class="skeleton-shimmer skeleton-line long" style="height:14px;margin-bottom:8px;"></div>' +
            '<div class="skeleton-shimmer skeleton-line medium" style="height:11px;margin:0;"></div>' +
          '</div>' +
        '</div>';
    }

    html += '</div>';
    return html;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SMART LOADING CONTROLLER (Core Timing & Anti-Flicker)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Creates a Smart Loader controller adhering to the 4 core timing constants:
   *   1. SHOW_DELAY_MS (200ms): zero flicker if request fast
   *   2. MIN_DISPLAY_MS (400ms): visible for at least 400ms to eliminate sub-second strobe
   *   3. LONG_WAIT_THRESHOLD_MS (5000ms): slow notice & retry helper
   *   4. TIMEOUT_MS (15000ms): timeout inline error with Try Again action
   *
   * @param {Object} options
   *   - container: HTMLElement | string
   *   - renderSkeleton: Function => string (HTML)
   *   - renderError: Function (err, retryFn) => string (HTML)
   *   - srLabel: string
   *   - showDelayMs: number (default 200)
   *   - minDisplayMs: number (default 400)
   *   - longWaitMs: number (default 5000)
   *   - timeoutMs: number (default 15000)
   */
  function createSmartLoader(options) {
    options = options || {};
    var container = typeof options.container === 'string'
      ? (typeof document !== 'undefined' ? document.querySelector(options.container) : null)
      : options.container;

    var showDelayMs = options.showDelayMs || SHOW_DELAY_MS;
    var minDisplayMs = options.minDisplayMs || MIN_DISPLAY_MS;
    var longWaitMs = options.longWaitMs || LONG_WAIT_THRESHOLD_MS;
    var timeoutMs = options.timeoutMs || TIMEOUT_MS;
    var srLabel = options.srLabel || 'Loading content...';

    var showTimer = null;
    var longWaitTimer = null;
    var timeoutTimer = null;
    var isShown = false;
    var shownAt = 0;
    var isCancelled = false;

    function cleanupTimers() {
      if (showTimer) { clearTimeout(showTimer); showTimer = null; }
      if (longWaitTimer) { clearTimeout(longWaitTimer); longWaitTimer = null; }
      if (timeoutTimer) { clearTimeout(timeoutTimer); timeoutTimer = null; }
    }

    function showLoader() {
      if (isCancelled || !container) return;
      isShown = true;
      shownAt = Date.now();

      container.setAttribute('aria-busy', 'true');
      container.setAttribute('aria-label', srLabel);

      var skeletonHtml = typeof options.renderSkeleton === 'function'
        ? options.renderSkeleton()
        : renderSkeletonCard(3, 'announcement');

      container.innerHTML =
        '<div class="smart-loader-wrapper" role="status">' +
          '<span class="sr-only">' + escapeText(srLabel) + '</span>' +
          skeletonHtml +
          '<div id="smart-loader-hint-' + shownAt + '" class="smart-loader-hint-slot"></div>' +
        '</div>';
    }

    function showLongWaitNotice(retryFn) {
      if (isCancelled || !isShown || !container) return;
      var slot = container.querySelector('.smart-loader-hint-slot');
      if (slot) {
        slot.innerHTML =
          '<div class="loading-long-wait-hint">' +
            '<span>Taking longer than usual... Please check your connection.</span>' +
            (typeof retryFn === 'function'
              ? '<button type="button" class="btn-longwait-retry">Refresh</button>'
              : '') +
          '</div>';

        var retryBtn = slot.querySelector('.btn-longwait-retry');
        if (retryBtn && typeof retryFn === 'function') {
          retryBtn.addEventListener('click', function(e) {
            e.preventDefault();
            retryFn();
          });
        }
      }
    }

    function showTimeoutError(err, retryFn) {
      if (isCancelled || !container) return;
      container.removeAttribute('aria-busy');
      container.removeAttribute('aria-label');

      if (typeof options.renderError === 'function') {
        container.innerHTML = options.renderError(err, retryFn);
        return;
      }

      var errMsg = (err && err.message) || 'Request timed out after 15 seconds.';
      container.innerHTML =
        '<div class="loading-timeout-state" role="alert">' +
          '<div style="font-size:32px;margin-bottom:8px;">⚠️</div>' +
          '<div style="font-size:15px;font-weight:700;color:var(--text-primary);margin-bottom:6px;">Unable to load data</div>' +
          '<div style="font-size:13px;color:var(--text-muted);max-width:380px;margin:0 auto 14px;">' +
            escapeText(errMsg) +
          '</div>' +
          (typeof retryFn === 'function'
            ? '<button type="button" class="retry-btn">Try Again</button>'
            : '') +
        '</div>';

      var btn = container.querySelector('.retry-btn');
      if (btn && typeof retryFn === 'function') {
        btn.addEventListener('click', function(e) {
          e.preventDefault();
          retryFn();
        });
      }
    }

    return {
      /**
       * Executes an asynchronous task with full anti-flicker timing guarantees
       * @param {Function} asyncFn () => Promise<any>
       * @param {Function} [retryFn] Optional retry function for long wait and timeout states
       * @returns {Promise<any>}
       */
      execute: async function(asyncFn, retryFn) {
        isCancelled = false;
        isShown = false;
        shownAt = 0;
        cleanupTimers();

        // 1. SHOW_DELAY_MS timer: only display skeleton if operation takes >= 200ms
        showTimer = setTimeout(function() {
          showLoader();

          // 2. LONG_WAIT_THRESHOLD_MS timer (5000ms from start)
          longWaitTimer = setTimeout(function() {
            showLongWaitNotice(retryFn);
          }, Math.max(0, longWaitMs - showDelayMs));
        }, showDelayMs);

        // 3. TIMEOUT_MS timer (15000ms)
        var timeoutPromise = new Promise(function(_, reject) {
          timeoutTimer = setTimeout(function() {
            var timeoutErr = new Error('Request timed out. Please check your network and try again.');
            timeoutErr.isTimeout = true;
            reject(timeoutErr);
          }, timeoutMs);
        });

        try {
          var result = await Promise.race([asyncFn(), timeoutPromise]);
          cleanupTimers();

          // 4. MIN_DISPLAY_MS enforcement: If skeleton was shown, keep visible for at least 400ms
          if (isShown) {
            var elapsed = Date.now() - shownAt;
            if (elapsed < minDisplayMs) {
              await new Promise(function(resolve) {
                setTimeout(resolve, minDisplayMs - elapsed);
              });
            }
          }

          if (container) {
            container.removeAttribute('aria-busy');
            container.removeAttribute('aria-label');
          }

          return result;
        } catch (err) {
          cleanupTimers();
          if (err && err.isTimeout) {
            showTimeoutError(err, retryFn);
          } else {
            if (container) {
              container.removeAttribute('aria-busy');
              container.removeAttribute('aria-label');
            }
          }
          throw err;
        }
      },

      cancel: function() {
        isCancelled = true;
        cleanupTimers();
        if (container) {
          container.removeAttribute('aria-busy');
          container.removeAttribute('aria-label');
        }
      }
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PATTERN C: LOCALIZED INLINE SPINNER (Zero Layout Shift)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Sets localized loading state on an individual button:
   *   - Locks explicit min-width so button never shrinks/resizes (Zero CLS)
   *   - Disables button and marks aria-disabled / aria-busy
   *   - Injects compact 14px spinner with .sr-only accessible text
   *   - On restore, reinstates exact original markup and width
   *
   * @param {HTMLElement} btn
   * @param {boolean} isLoading
   * @param {string} [loadingText] e.g. 'Submitting...'
   * @param {string} [srLabel] e.g. 'Submitting uniform order...'
   */
  function setButtonLoading(btn, isLoading, loadingText, srLabel) {
    if (!btn) return;

    if (isLoading) {
      if (!btn.hasAttribute('data-loading-orig-html')) {
        btn.setAttribute('data-loading-orig-html', btn.innerHTML);
      }

      // Lock current width to guarantee Zero Layout Shift (CLS = 0)
      var currentWidth = btn.offsetWidth;
      if (currentWidth > 0 && !btn.style.minWidth) {
        btn.style.minWidth = currentWidth + 'px';
      }

      btn.disabled = true;
      btn.setAttribute('aria-disabled', 'true');
      btn.setAttribute('aria-busy', 'true');
      btn.classList.add('btn-loading');

      var label = loadingText || 'Processing...';
      var accessibleText = srLabel || label;

      btn.innerHTML =
        '<span class="btn-spinner" aria-hidden="true"></span>' +
        '<span class="sr-only">' + escapeText(accessibleText) + '</span>' +
        '<span>' + escapeText(label) + '</span>';
    } else {
      var origHtml = btn.getAttribute('data-loading-orig-html');
      if (origHtml !== null) {
        btn.innerHTML = origHtml;
        btn.removeAttribute('data-loading-orig-html');
      }

      btn.style.minWidth = '';
      btn.disabled = false;
      btn.removeAttribute('aria-disabled');
      btn.removeAttribute('aria-busy');
      btn.classList.remove('btn-loading');
    }
  }

  /**
   * Async wrapper around setButtonLoading
   * @param {HTMLElement} btn
   * @param {Function} asyncFn
   * @param {Object} [options] { loadingText, srLabel }
   */
  async function withSmartButtonLock(btn, asyncFn, options) {
    if (!btn || typeof asyncFn !== 'function') {
      return typeof asyncFn === 'function' ? asyncFn() : null;
    }
    options = options || {};
    setButtonLoading(btn, true, options.loadingText, options.srLabel);
    try {
      return await asyncFn();
    } finally {
      setButtonLoading(btn, false);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PATTERN D: PROGRESS BARS (Determinate & Stepped)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Top Route / Page-Level Progress Bar
   * Fixed 3px line at top of viewport for page-level navigation
   */
  var TopRouteProgress = {
    _el: null,
    _timer: null,
    _current: 0,

    init: function() {
      if (typeof document === 'undefined') return;
      if (!this._el) {
        this._el = document.getElementById('top-route-progress');
        if (!this._el) {
          this._el = document.createElement('div');
          this._el.id = 'top-route-progress';
          this._el.className = 'top-route-progress';
          this._el.setAttribute('role', 'progressbar');
          this._el.setAttribute('aria-valuemin', '0');
          this._el.setAttribute('aria-valuemax', '100');
          this._el.setAttribute('aria-valuenow', '0');
          document.body.appendChild(this._el);
        }
      }
    },

    start: function() {
      this.init();
      if (!this._el) return;
      if (this._timer) clearInterval(this._timer);

      this._current = 15;
      this._el.style.width = '15%';
      this._el.style.opacity = '1';
      this._el.setAttribute('aria-valuenow', '15');
      this._el.classList.add('active');

      var self = this;
      this._timer = setInterval(function() {
        if (self._current < 85) {
          self._current += (85 - self._current) * 0.15;
          self._el.style.width = self._current + '%';
          self._el.setAttribute('aria-valuenow', String(Math.round(self._current)));
        }
      }, 200);
    },

    set: function(percent) {
      this.init();
      if (!this._el) return;
      var p = Math.max(0, Math.min(100, percent));
      this._current = p;
      this._el.style.width = p + '%';
      this._el.setAttribute('aria-valuenow', String(Math.round(p)));
    },

    complete: function() {
      this.init();
      if (!this._el) return;
      if (this._timer) { clearInterval(this._timer); this._timer = null; }

      this._current = 100;
      this._el.style.width = '100%';
      this._el.setAttribute('aria-valuenow', '100');

      var self = this;
      setTimeout(function() {
        if (self._el) {
          self._el.style.opacity = '0';
          setTimeout(function() {
            if (self._el) {
              self._el.style.width = '0%';
              self._el.classList.remove('active');
            }
          }, 300);
        }
      }, 200);
    }
  };

  /**
   * Determinate / Stepped Task Progress Bar for file uploads & batch syncs
   */
  function createTaskProgressBar(container, options) {
    options = options || {};
    var title = options.title || 'Processing task...';
    var totalSteps = options.totalSteps || 3;

    var wrapper = document.createElement('div');
    wrapper.className = 'task-progress-box';
    wrapper.setAttribute('role', 'progressbar');
    wrapper.setAttribute('aria-valuemin', '0');
    wrapper.setAttribute('aria-valuemax', '100');
    wrapper.setAttribute('aria-valuenow', '0');

    wrapper.innerHTML =
      '<div class="task-progress-header">' +
        '<span class="task-progress-title">' + escapeText(title) + '</span>' +
        '<span class="task-progress-percent">0%</span>' +
      '</div>' +
      '<div class="task-progress-track">' +
        '<div class="task-progress-fill" style="width:0%;"></div>' +
      '</div>' +
      '<div class="task-progress-status">Preparing...</div>';

    if (container) {
      container.appendChild(wrapper);
    }

    var fillEl = wrapper.querySelector('.task-progress-fill');
    var percentEl = wrapper.querySelector('.task-progress-percent');
    var statusEl = wrapper.querySelector('.task-progress-status');

    return {
      element: wrapper,

      update: function(stepIndex, stepLabel, percent) {
        var p = Math.max(0, Math.min(100, Math.round(percent)));
        if (fillEl) fillEl.style.width = p + '%';
        if (percentEl) percentEl.textContent = p + '%';
        if (statusEl) {
          statusEl.textContent = (stepIndex && totalSteps ? stepIndex + '/' + totalSteps + ': ' : '') + (stepLabel || '');
        }
        wrapper.setAttribute('aria-valuenow', String(p));
      },

      complete: function(successMsg) {
        this.update(totalSteps, successMsg || 'Complete!', 100);
        if (fillEl) fillEl.style.background = 'var(--success, #22c55e)';
        setTimeout(function() {
          if (wrapper.parentNode) {
            wrapper.style.transition = 'opacity 0.4s ease';
            wrapper.style.opacity = '0';
            setTimeout(function() {
              if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
            }, 400);
          }
        }, 1200);
      },

      fail: function(errorMsg) {
        if (statusEl) {
          statusEl.innerHTML = '<span style="color:var(--error, #ef4444);">' + escapeText(errorMsg || 'Failed') + '</span>';
        }
        if (fillEl) fillEl.style.background = 'var(--error, #ef4444)';
      },

      remove: function() {
        if (wrapper.parentNode) {
          wrapper.parentNode.removeChild(wrapper);
        }
      }
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // EXPORTS & GLOBAL REGISTRATION
  // ══════════════════════════════════════════════════════════════════════════

  var SmartLoading = {
    SHOW_DELAY_MS: SHOW_DELAY_MS,
    MIN_DISPLAY_MS: MIN_DISPLAY_MS,
    LONG_WAIT_THRESHOLD_MS: LONG_WAIT_THRESHOLD_MS,
    TIMEOUT_MS: TIMEOUT_MS,
    createSmartLoader: createSmartLoader,
    setButtonLoading: setButtonLoading,
    withSmartButtonLock: withSmartButtonLock,
    TopRouteProgress: TopRouteProgress,
    createTaskProgressBar: createTaskProgressBar,
    renderSkeletonCard: renderSkeletonCard,
    renderSkeletonTable: renderSkeletonTable,
    renderSkeletonKanban: renderSkeletonKanban
  };

  // Expose to window / global
  if (typeof global !== 'undefined') {
    global.SHOW_DELAY_MS = SHOW_DELAY_MS;
    global.MIN_DISPLAY_MS = MIN_DISPLAY_MS;
    global.LONG_WAIT_THRESHOLD_MS = LONG_WAIT_THRESHOLD_MS;
    global.TIMEOUT_MS = TIMEOUT_MS;
    global.SmartLoading = SmartLoading;
    global.createSmartLoader = createSmartLoader;
    global.setButtonLoading = setButtonLoading;
    global.withSmartButtonLock = withSmartButtonLock;
    global.TopRouteProgress = TopRouteProgress;
    global.createTaskProgressBar = createTaskProgressBar;
    global.renderSkeletonCard = renderSkeletonCard;
    global.renderSkeletonTable = renderSkeletonTable;
    global.renderSkeletonKanban = renderSkeletonKanban;
  }

  // CommonJS export for Node testing
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = SmartLoading;
  }
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
