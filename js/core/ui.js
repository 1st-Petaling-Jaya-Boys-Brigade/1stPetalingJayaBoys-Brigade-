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

  // ── Rich Text Formatting & Color Popover Engine (TSK-010 / TSK-009) ──────
  var RICH_TEXT_COLOR_PALETTE = [
    '#000000', '#262626', '#434343', '#555555', '#737373', '#8c8c8c', '#a6a6a6', '#d9d9d9', '#f2f2f2', '#ffffff',
    '#7f0000', '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#4a86e8', '#0000ff', '#9900ff', '#ff00ff',
    '#e6b8af', '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#c9daf8', '#cfe2f3', '#d9d2e9', '#ead1dc',
    '#dd7e6b', '#ea9999', '#f9cb9c', '#ffe599', '#b6d7a8', '#a2c4c9', '#a4c2f4', '#9fc5e8', '#b4a7d6', '#d5a6bd',
    '#cc4125', '#e06666', '#f6b26b', '#ffd966', '#93c47d', '#76a5af', '#6d9eeb', '#6fa8dc', '#8e7cc3', '#c27ba0',
    '#a61c00', '#cc0000', '#e69138', '#f1c232', '#6aa84f', '#45818e', '#3c78d8', '#3d85c6', '#674ea7', '#a64d79',
    '#85200c', '#990000', '#b45f06', '#bf9000', '#38761d', '#134f5c', '#1155cc', '#0b5394', '#351c75', '#741b47',
    '#5b0f00', '#660000', '#783f04', '#7f6000', '#274e13', '#0c343d', '#1c4587', '#073763', '#20124d', '#4c1130'
  ];

  var _activeRichEditor = null;
  var _activeRichRange = null;

  function saveRichEditorRange(editor) {
    if (typeof window === 'undefined' || !window.getSelection) return;
    var ed = editor || _activeRichEditor;
    if (!ed) return;
    var sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      var r = sel.getRangeAt(0);
      if (ed.contains(r.commonAncestorContainer) || ed === r.commonAncestorContainer) {
        _activeRichEditor = ed;
        _activeRichRange = r.cloneRange();
      }
    }
  }

  function restoreRichEditorRange(editor) {
    var ed = editor || _activeRichEditor;
    if (!ed) return;
    if (typeof ed.focus === 'function') ed.focus();
    if (_activeRichRange && typeof window !== 'undefined' && window.getSelection) {
      try {
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(_activeRichRange);
      } catch (_) {}
    }
  }

  function resolveTargetRichEditor(btnOrEl) {
    if (!btnOrEl || typeof document === 'undefined') {
      return _activeRichEditor || document.querySelector('.task-editable-desc') || document.getElementById('ann-body-input');
    }
    if (typeof btnOrEl === 'string') {
      return document.getElementById(btnOrEl) || document.querySelector(btnOrEl);
    }
    if (btnOrEl.isContentEditable) return btnOrEl;
    var customTarget = btnOrEl.getAttribute('data-target-editor');
    if (customTarget) {
      var found = document.querySelector(customTarget) || document.getElementById(customTarget);
      if (found) return found;
    }
    // Check closest container
    var toolbar = btnOrEl.closest('.task-brief-toolbar, .ann-toolbar, .new-task-desc-toolbar');
    if (toolbar) {
      var nextEd = toolbar.parentElement.querySelector('.task-editable-desc, .new-task-desc-input, #ann-body-input, [contenteditable="true"]');
      if (nextEd) return nextEd;
    }
    return _activeRichEditor || document.getElementById('tdm-desc') || document.getElementById('ann-body-input');
  }

  function executeRichFormat(cmd, value, btnOrEl) {
    if (typeof document === 'undefined') return;
    var editor = resolveTargetRichEditor(btnOrEl);
    if (editor) {
      _activeRichEditor = editor;
      restoreRichEditorRange(editor);
    }

    if (cmd === 'formatBlock') {
      var tag = value || 'p';
      document.execCommand('formatBlock', false, '<' + tag + '>');
    } else if (cmd === 'code') {
      var sel = (typeof window !== 'undefined' && window.getSelection) ? window.getSelection() : null;
      var selectedText = sel ? sel.toString() : '';
      if (selectedText) {
        document.execCommand('insertHTML', false, '<code>' + safeEscapeHtml(selectedText) + '</code>');
      } else {
        document.execCommand('insertHTML', false, '<code>code</code>&nbsp;');
      }
    } else if (cmd === 'link') {
      var url = (typeof prompt === 'function') ? prompt('Enter URL (https://...):') : null;
      if (url && url.trim()) {
        var validUrl = (typeof safeUrl === 'function') ? safeUrl(url.trim(), '#') : url.trim();
        if (validUrl && validUrl !== '#') {
          document.execCommand('createLink', false, validUrl);
        }
      }
    } else if (cmd === 'image') {
      var imgUrl = (typeof prompt === 'function') ? prompt('Enter Image URL (https://...):') : null;
      if (imgUrl && imgUrl.trim()) {
        var validImgUrl = (typeof safeUrl === 'function') ? safeUrl(imgUrl.trim(), '') : imgUrl.trim();
        if (validImgUrl) {
          document.execCommand('insertHTML', false, '<img src="' + safeEscapeHtml(validImgUrl) + '" alt="Embedded image" style="max-width:100%;height:auto;border-radius:8px;margin:8px 0;" /><br/>');
        }
      }
    } else if (cmd === 'checklist') {
      document.execCommand('insertHTML', false, '<div class="tb-checklist-row" style="display:flex;align-items:center;gap:8px;margin:4px 0;"><input type="checkbox" style="cursor:pointer;" /> <span style="outline:none;" contenteditable="true">Checklist item</span></div><div><br></div>');
    } else if (cmd === 'table') {
      var tableHtml = '<table class="tb-table" style="width:100%;border-collapse:collapse;margin:10px 0;border:1px solid var(--border-card);">'
        + '<thead><tr style="background:var(--bg-card-subtle);"><th style="border:1px solid var(--border-card);padding:8px 10px;text-align:left;font-size:12px;color:var(--text-primary);">Header 1</th><th style="border:1px solid var(--border-card);padding:8px 10px;text-align:left;font-size:12px;color:var(--text-primary);">Header 2</th></tr></thead>'
        + '<tbody><tr><td style="border:1px solid var(--border-card);padding:8px 10px;font-size:13px;color:var(--text-secondary);">Item 1</td><td style="border:1px solid var(--border-card);padding:8px 10px;font-size:13px;color:var(--text-secondary);">Details 1</td></tr>'
        + '<tr><td style="border:1px solid var(--border-card);padding:8px 10px;font-size:13px;color:var(--text-secondary);">Item 2</td><td style="border:1px solid var(--border-card);padding:8px 10px;font-size:13px;color:var(--text-secondary);">Details 2</td></tr></tbody>'
        + '</table><div><br></div>';
      document.execCommand('insertHTML', false, tableHtml);
    } else if (cmd === 'divider') {
      document.execCommand('insertHTML', false, '<hr style="border:none;border-top:1px solid var(--border-card);margin:14px 0;"/><div><br></div>');
    } else {
      document.execCommand(cmd, false, value || null);
    }

    if (editor) {
      saveRichEditorRange(editor);
      if (typeof editor.focus === 'function') editor.focus();
    }
  }

  function toggleRichColorPicker(btn, _targetSelector) {
    if (typeof document === 'undefined' || !btn) return;
    var editor = resolveTargetRichEditor(btn);
    if (editor) {
      _activeRichEditor = editor;
      saveRichEditorRange(editor);
    }

    // Close any existing open popovers
    var existing = document.querySelector('.rich-color-popover');
    if (existing) {
      var wasThisBtn = existing._anchorBtn === btn;
      existing.remove();
      if (wasThisBtn) return;
    }

    var popover = document.createElement('div');
    popover.className = 'rich-color-popover';
    popover._anchorBtn = btn;
    popover.style.cssText = 'position:absolute;z-index:9999;background:var(--bg-card);border:1px solid var(--border-card);box-shadow:var(--shadow-elevated);border-radius:12px;padding:12px;width:250px;animation:menuPopIn 0.15s ease-out;';

    // Position popover right below button
    var rect = btn.getBoundingClientRect();
    popover.style.top = (rect.bottom + (typeof window !== 'undefined' ? window.scrollY : 0) + 6) + 'px';
    var leftOffset = (rect.left + (typeof window !== 'undefined' ? window.scrollX : 0) - 60);
    var maxLeft = (typeof window !== 'undefined' ? window.innerWidth : 800) - 260;
    popover.style.left = Math.max(10, Math.min(maxLeft, leftOffset)) + 'px';

    // Build 10x8 grid (Image 5)
    var gridHtml = '<div style="display:grid;grid-template-columns:repeat(10, 1fr);gap:5px;margin-bottom:10px;">';
    RICH_TEXT_COLOR_PALETTE.forEach(function(hex) {
      gridHtml += '<button type="button" class="rcp-swatch" data-hex="' + hex + '" title="' + hex + '" style="width:18px;height:18px;border-radius:50%;background:' + hex + ';border:1px solid rgba(128,128,128,0.3);cursor:pointer;padding:0;transition:transform 0.1s;outline:none;"></button>';
    });
    gridHtml += '</div>';

    // Custom color section (Image 5)
    var customHtml = '<div style="border-top:1px solid var(--border-subtle);padding-top:8px;">'
      + '<div style="font-size:10px;font-weight:700;letter-spacing:1px;color:var(--text-secondary);margin-bottom:6px;">CUSTOM</div>'
      + '<div style="display:flex;align-items:center;gap:8px;">'
      + '<label class="rcp-custom-btn-wrap" style="display:inline-flex;align-items:center;gap:6px;background:var(--bg-card-subtle);border:1px solid var(--border-card);border-radius:6px;padding:4px 8px;cursor:pointer;font-size:12px;color:var(--text-primary);">'
      + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>'
      + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m14 12 3 3m-9-9 9 9-4 4-9-9 4-4Z"/><path d="M18 2l4 4"/><path d="m2 22 5-1-4-4-1 5Z"/></svg>'
      + '<span>Pick Color</span>'
      + '<input type="color" class="rcp-custom-input" style="opacity:0;position:absolute;width:1px;height:1px;pointer-events:none;" />'
      + '</label>'
      + '</div></div>';

    popover.innerHTML = gridHtml + customHtml;
    document.body.appendChild(popover);

    function applyChosenColor(hex) {
      if (editor) {
        restoreRichEditorRange(editor);
        document.execCommand('foreColor', false, hex);
        saveRichEditorRange(editor);
        if (typeof editor.focus === 'function') editor.focus();
      }
      popover.remove();
    }

    popover.querySelectorAll('.rcp-swatch').forEach(function(swatch) {
      swatch.addEventListener('click', function(e) {
        e.preventDefault();
        applyChosenColor(swatch.getAttribute('data-hex'));
      });
    });

    var customInp = popover.querySelector('.rcp-custom-input');
    if (customInp) {
      var customLbl = customInp.parentElement;
      if (customLbl) {
        customLbl.addEventListener('click', function() {
          try { customInp.click(); } catch (_) {}
        });
      }
      customInp.addEventListener('change', function() {
        applyChosenColor(customInp.value);
      });
    }

    setTimeout(function() {
      function closeOnOutside(e) {
        if (!popover.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
          popover.remove();
          document.removeEventListener('click', closeOnOutside);
        }
      }
      document.addEventListener('click', closeOnOutside);
    }, 50);
  }

  function toggleRichDropdownMenu(btn, menuSelector) {
    if (typeof document === 'undefined' || !btn) return;
    var editor = resolveTargetRichEditor(btn);
    if (editor) {
      _activeRichEditor = editor;
      saveRichEditorRange(editor);
    }
    var menu = btn.parentElement.querySelector(menuSelector);
    if (!menu) return;

    var isOpen = menu.style.display === 'flex' || menu.style.display === 'block';
    // Close other dropdown menus
    btn.parentElement.querySelectorAll('.tb-dropdown-menu').forEach(function(m) {
      m.style.display = 'none';
    });

    if (!isOpen) {
      menu.style.display = 'flex';
      setTimeout(function() {
        function closeDropdown(e) {
          if (!menu.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
            menu.style.display = 'none';
            document.removeEventListener('click', closeDropdown);
          }
        }
        document.addEventListener('click', closeDropdown);
      }, 50);
    } else {
      menu.style.display = 'none';
    }
  }

  // ── Announcement Infographic Zoom / Lightbox Modal ───────────────────────
  function openAnnouncementZoomModal(imageUrl, title) {
    if (typeof document === 'undefined' || !imageUrl) return;
    var modal = document.querySelector('.ann-zoom-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.className = 'ann-zoom-modal';
      modal.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.85);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;animation:fadeIn 0.2s ease-out;';
      modal.innerHTML = '<div class="ann-zoom-card" style="position:relative;max-width:92vw;max-height:88vh;display:flex;flex-direction:column;align-items:center;">'
        + '<button type="button" class="ann-zoom-close-btn" style="position:absolute;top:-40px;right:0;background:rgba(255,255,255,0.15);border:none;color:#fff;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center;transition:background 0.15s;" title="Close (Esc)">&times;</button>'
        + '<img class="ann-zoom-img" src="" alt="Announcement Infographic" style="max-width:92vw;max-height:82vh;object-fit:contain;border-radius:10px;box-shadow:0 20px 40px rgba(0,0,0,0.6);" />'
        + '<div class="ann-zoom-caption" style="margin-top:12px;color:rgba(255,255,255,0.9);font-size:14px;font-weight:600;text-align:center;font-family:var(--font-headline);max-width:85vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></div>'
        + '</div>';
      document.body.appendChild(modal);

      modal.addEventListener('click', function(e) {
        if (e.target === modal || e.target.classList.contains('ann-zoom-close-btn')) {
          closeAnnouncementZoomModal();
        }
      });
    }

    var img = modal.querySelector('.ann-zoom-img');
    if (img) img.src = imageUrl;
    var cap = modal.querySelector('.ann-zoom-caption');
    if (cap) cap.textContent = title || 'Announcement Infographic';
    modal.style.display = 'flex';

    document.addEventListener('keydown', function handleEsc(e) {
      if (e.key === 'Escape') {
        closeAnnouncementZoomModal();
        document.removeEventListener('keydown', handleEsc);
      }
    });
  }

  function closeAnnouncementZoomModal() {
    if (typeof document === 'undefined') return;
    var modal = document.querySelector('.ann-zoom-modal');
    if (modal) modal.style.display = 'none';
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('selectionchange', function() {
      var act = document.activeElement;
      if (act && (act.isContentEditable || act.classList.contains('task-editable-desc') || act.id === 'ann-body-input')) {
        saveRichEditorRange(act);
      }
    });
  }

  // Expose to window / global
  if (typeof global !== 'undefined') {
    global.showToast = showToast;
    global.dismissToast = dismissToast;
    global.showConfirmModal = showConfirmModal;
    global.ensureToastContainer = ensureToastContainer;
    global.initGlobalButtonDebounce = initGlobalButtonDebounce;
    global.withButtonLock = withButtonLock;
    global.RICH_TEXT_COLOR_PALETTE = RICH_TEXT_COLOR_PALETTE;
    global.saveRichEditorRange = saveRichEditorRange;
    global.restoreRichEditorRange = restoreRichEditorRange;
    global.resolveTargetRichEditor = resolveTargetRichEditor;
    global.executeRichFormat = executeRichFormat;
    global.toggleRichColorPicker = toggleRichColorPicker;
    global.toggleRichDropdownMenu = toggleRichDropdownMenu;
    global.openAnnouncementZoomModal = openAnnouncementZoomModal;
    global.closeAnnouncementZoomModal = closeAnnouncementZoomModal;
  }

  // CommonJS export for Node testing
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      showToast: showToast,
      dismissToast: dismissToast,
      showConfirmModal: showConfirmModal,
      ensureToastContainer: ensureToastContainer,
      initGlobalButtonDebounce: initGlobalButtonDebounce,
            withButtonLock: withButtonLock,
      RICH_TEXT_COLOR_PALETTE: RICH_TEXT_COLOR_PALETTE,
      saveRichEditorRange: saveRichEditorRange,
      restoreRichEditorRange: restoreRichEditorRange,
      resolveTargetRichEditor: resolveTargetRichEditor,
      executeRichFormat: executeRichFormat,
      toggleRichColorPicker: toggleRichColorPicker,
      toggleRichDropdownMenu: toggleRichDropdownMenu,
      openAnnouncementZoomModal: openAnnouncementZoomModal,
      closeAnnouncementZoomModal: closeAnnouncementZoomModal
    };
  }
})(typeof window !== 'undefined' ? window : this);
