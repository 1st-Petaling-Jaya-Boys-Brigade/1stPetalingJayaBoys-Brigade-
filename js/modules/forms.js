/**
 * 1st Petaling Jaya Boys' Brigade Portal
 * Dynamic Forms Hub & Google Forms-Style Form Builder Module
 *
 * Implements the Forms Hub for members, live form search/filtering,
 * dynamic built-in form rendering and response submissions, and the
 * upgraded Google Forms-style admin form builder with signatures,
 * sections, title/desc blocks, response table/individual database views.
 */

// ── State ──────────────────────────────────────────────────────────────────
var _customForms = [];
var _currentFormType = 'link';
var _fbFields = [];
var _isSubmittingBuiltinForm = false;
var _isSavingCustomForm = false;
var _isWritingCustomForms = false;
var _customFormsRevision = 0;

// Upgraded Google Forms Builder & Responses state
var _gfCurrentForm = null;
var _gfActiveTab = 'questions'; // 'questions', 'responses', 'settings'
var _gfActiveItemId = null;
var _gfResponsesViewMode = 'table'; // 'table' or 'individual'
var _gfIndividualIndex = 0;
var _gfResponsesList = [];

/**
 * Resolves Supabase client instance across environments
 */
function getSupa() {
  if (typeof window !== 'undefined' && window.supa) return window.supa;
  if (typeof global !== 'undefined' && global.supa) return global.supa;
  if (typeof getSupaClient === 'function') return getSupaClient();
  if (typeof window !== 'undefined' && typeof window.getSupaClient === 'function') return window.getSupaClient();
  if (typeof supa !== 'undefined' && supa) return supa;
  return null;
}

// ── Data Persistence ───────────────────────────────────────────────────────

/**
 * Loads custom forms definitions from Supabase bb_config
 * @returns {Promise<Array>}
 */
async function loadCustomForms(force) {
  var client = getSupa();
  var revision = _customFormsRevision;
  if (!force && client && typeof client.getConfigSnapshot === 'function') {
    var snapForms = client.getConfigSnapshot('bb_custom_forms');
    if (Array.isArray(snapForms)) {
      if (!_isWritingCustomForms) _customForms.splice(0, _customForms.length, ...snapForms.filter(Boolean));
      if (typeof syncFormNotifications === 'function') {
        syncFormNotifications(_customForms);
      } else if (typeof window !== 'undefined' && typeof window.syncFormNotifications === 'function') {
        window.syncFormNotifications(_customForms);
      }
      return _customForms;
    }
  }
  if (client && client.get) {
    try {
      var rows = await client.get('bb_config?key=eq.bb_custom_forms&select=value', { cache: !force });
      if (_isWritingCustomForms || revision !== _customFormsRevision) return _customForms;
      var value = rows && rows.length ? rows[0].value : [];
      var parsed = typeof value === 'string' ? JSON.parse(value) : value;
      if (!Array.isArray(parsed)) return _customForms;
      _customForms.splice(0, _customForms.length, ...parsed.filter(Boolean));
      if (client.recordConfigSnapshot) client.recordConfigSnapshot('bb_custom_forms', _customForms);
    } catch (e) {
      // Keep the last valid catalog if the request fails.
    }
  }
  if (typeof syncFormNotifications === 'function') {
    syncFormNotifications(_customForms);
  } else if (typeof window !== 'undefined' && typeof window.syncFormNotifications === 'function') {
    window.syncFormNotifications(_customForms);
  }
  return _customForms;
}

/**
 * Saves current custom forms array to Supabase bb_config
 */
async function saveCustomForms(nextForms) {
  var client = getSupa();
  if (_isWritingCustomForms) return false;
  _isWritingCustomForms = true;
  try {
    if (!client) throw new Error('Database unavailable');
    var payload = JSON.parse(JSON.stringify(nextForms || _customForms));
    if (typeof client.safeConfigUpdate === 'function') {
      payload = await client.safeConfigUpdate('bb_custom_forms', payload, { idProp: 'id' });
      if (!Array.isArray(payload)) throw new Error('Form catalog was not confirmed');
    } else {
      await client.req('POST', 'bb_config?on_conflict=key', {
        key: 'bb_custom_forms', value: JSON.stringify(payload)
      });
    }
    _customForms.splice(0, _customForms.length, ...payload);
    _customFormsRevision++;
    if (typeof client.recordConfigSnapshot === 'function') client.recordConfigSnapshot('bb_custom_forms', payload);
    return true;
  } catch (_) {
    if (typeof showToast === 'function') showToast('Form changes could not be saved. Please try again.', 'error');
    return false;
  } finally {
    _isWritingCustomForms = false;
  }
}

function parseFormSchedule(value) {
  if (typeof value !== 'string') return NaN;
  return Date.parse(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value) ? value + '+08:00' : value);
}

/**
 * Evaluates whether a form is currently accepting responses based on its pause status and auto-schedule
 * @param {Object} form
 * @returns {{open: boolean, reason: string, message: string}}
 */
function isFormAcceptingResponses(form) {
  if (!form) return { open: true, reason: 'active', message: '' };

  var defaultPausedMsg = typeof form.paused_message === 'string' && form.paused_message.trim()
    ? form.paused_message.trim()
    : 'Responses for this form are currently paused by the company administration. Please check back later.';

  // 1. Explicit pause
  if (form.status === 'paused' || form.active === false) {
    return {
      open: false,
      reason: 'paused',
      message: defaultPausedMsg
    };
  }

  var now = Date.now();
  var openTime = form.open_at ? parseFormSchedule(form.open_at) : -Infinity;
  var closeTime = form.close_at ? parseFormSchedule(form.close_at) : Infinity;
  if (Number.isNaN(openTime) || Number.isNaN(closeTime) || openTime >= closeTime) {
    return { open: false, reason: 'invalid_schedule', message: 'This form has an invalid response schedule. Contact the company office.' };
  }

  // 2. Scheduled opening in future
  if (form.open_at) {
    if (!isNaN(openTime) && now < openTime) {
      var openFormatted = new Date(openTime).toLocaleString('en-MY', {
        timeZone: 'Asia/Kuala_Lumpur',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
      return {
        open: false,
        reason: 'scheduled_future',
        message: typeof form.paused_message === 'string' && form.paused_message.trim()
          ? form.paused_message.trim()
          : ('This form is scheduled to open on ' + openFormatted + '. Please check back once responses are open.')
      };
    }
  }

  // 3. Scheduled close in past
  if (form.close_at) {
    if (!isNaN(closeTime) && now >= closeTime) {
      var closeFormatted = new Date(closeTime).toLocaleString('en-MY', {
        timeZone: 'Asia/Kuala_Lumpur',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
      return {
        open: false,
        reason: 'scheduled_past',
        message: typeof form.paused_message === 'string' && form.paused_message.trim()
          ? form.paused_message.trim()
          : ('Responses for this form closed on ' + closeFormatted + '.')
      };
    }
  }

  return { open: true, reason: 'active', message: '' };
}

/**
 * Toggles pause/resume status for a custom form
 * @param {string} formId
 */
async function toggleCustomFormStatus(formId) {
  var f = _customForms.find(function(x) { return String(x.id) === String(formId); });
  if (!f) return;
  var isCurrentlyPaused = (f.status === 'paused' || f.active === false);
  var nextStatus = isCurrentlyPaused ? 'active' : 'paused';
  var next = Object.assign({}, f, { status: nextStatus, active: nextStatus === 'active' });
  if (!await saveCustomForms(_customForms.map(function(item) { return item === f ? next : item; }))) return false;
  renderAdminForms();
  renderFormsHub();
  var editIdEl = document.getElementById('fb-edit-id');
  if (editIdEl && String(editIdEl.value) === String(formId)) {
    var radio = document.querySelector('input[name="fb-status-radio"][value="' + nextStatus + '"]');
    if (radio) radio.checked = true;
    if (typeof updateFormBuilderScheduleBadge === 'function') {
      updateFormBuilderScheduleBadge(nextStatus);
    }
  }
  if (typeof showToast === 'function') {
    showToast(nextStatus === 'paused' ? 'Form responses paused.' : 'Form responses resumed.', 'info');
  }
  return true;
}

// ── Google Forms Item Conversion & Formatting Utilities ───────────────────

/**
 * Converts legacy flat field definitions into Google Forms rich items
 * @param {Array} fields
 * @returns {Array}
 */
function convertOldFieldsToGfItems(fields) {
  if (!Array.isArray(fields)) return [];
  return fields.filter(function(f) { return f && !isLegacyFormUpload(f); }).map(function (f, idx) {
    var t = f.type || 'short_answer';
    if (t === 'text') t = 'short_answer';
    if (t === 'textarea') t = 'paragraph';
    if (t === 'select') t = 'dropdown';
    if (t === 'radio') t = 'multiple_choice';

    var opts = [];
    if (f.options) {
      if (Array.isArray(f.options)) opts = f.options.slice();
      else opts = String(f.options).split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    }
    if (['multiple_choice', 'checkboxes', 'dropdown'].indexOf(t) !== -1 && opts.length === 0) {
      opts = ['Option 1'];
    }

    return {
      id: 'q_' + (Date.now() + idx),
      kind: 'question',
      title: f.label || ('Question ' + (idx + 1)),
      type: t,
      required: !!f.required,
      options: opts
    };
  });
}

/**
 * Converts Google Forms items back into legacy fields for 100% backward compatibility
 * @param {Array} items
 * @returns {Array}
 */
function convertGfItemsToFields(items) {
  if (!Array.isArray(items)) return [];
  var fields = [];
  items.forEach(function (it) {
    if (it.kind === 'question' && !isLegacyFormUpload(it)) {
      fields.push({
        label: it.title || it.label || 'Question',
        type: it.type || 'text',
        required: !!it.required,
        options: Array.isArray(it.options) ? it.options.join(', ') : (it.options || '')
      });
    }
  });
  return fields;
}

function isLegacyFormUpload(field) {
  return field.type === 'file_upload' || field.type === 'file';
}

function isFormQuestion(field) {
  return field && !isLegacyFormUpload(field) && !['section', 'title_desc', 'image'].includes(field.kind);
}

function isFormSignature(value) {
  return typeof value === 'string' && value.length <= 500000 && /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
}

/**
 * Detects if a form option is an "Other..." option
 * @param {string} val
 * @returns {boolean}
 */
function isOtherOption(val) {
  if (!val) return false;
  var s = String(val).trim().toLowerCase();
  return s === 'other...' || s === 'other…' || s === 'other' || s.indexOf('other:') === 0 || s === '__other__';
}

/**
 * Handles focus on the "Other" short answer text input, auto-checking the corresponding radio or checkbox
 * @param {string} fieldId
 * @param {string} type 'radio' | 'checkbox'
 */
function onGfOtherInputFocus(fieldId, type) {
  if (typeof document === 'undefined') return;
  var otherInp = document.getElementById(fieldId + '-other-text');
  if (otherInp) otherInp.style.borderColor = '';
  if (type === 'checkbox') {
    var cb = document.querySelector('input[data-cb-group="' + fieldId + '"][value="__other__"]');
    if (cb && !cb.checked) cb.checked = true;
  } else {
    var radio = document.querySelector('input[name="' + fieldId + '"][value="__other__"]');
    if (radio && !radio.checked) radio.checked = true;
  }
}

/**
 * Handles input changes on the "Other" short answer text input
 * @param {string} fieldId
 * @param {string} type 'radio' | 'checkbox'
 * @param {string} val
 */
function onGfOtherInputChange(fieldId, type, val) {
  if (typeof document === 'undefined') return;
  var otherInp = document.getElementById(fieldId + '-other-text');
  if (otherInp) otherInp.style.borderColor = '';
  if (type === 'checkbox') {
    var cb = document.querySelector('input[data-cb-group="' + fieldId + '"][value="__other__"]');
    if (cb && val && val.trim().length > 0) cb.checked = true;
  } else {
    var radio = document.querySelector('input[name="' + fieldId + '"][value="__other__"]');
    if (radio && !radio.checked) radio.checked = true;
  }
}

/**
 * Focuses the Other text input when the Other radio is selected
 * @param {string} fieldId
 */
function onGfOtherRadioChange(fieldId) {
  if (typeof document === 'undefined') return;
  var otherInp = document.getElementById(fieldId + '-other-text');
  if (otherInp) {
    try { otherInp.focus(); } catch (_) {}
  }
}

/**
 * Focuses the Other text input when the Other checkbox is checked
 * @param {string} fieldId
 * @param {boolean} isChecked
 */
function onGfOtherCheckboxChange(fieldId, isChecked) {
  if (typeof document === 'undefined') return;
  if (isChecked) {
    var otherInp = document.getElementById(fieldId + '-other-text');
    if (otherInp) {
      try { otherInp.focus(); } catch (_) {}
    }
  }
}

// ── Interactive Signature Canvas & Modal ────────────────────────────────────

/**
 * Binds mouse and touch drawing listeners to an HTML5 signature canvas
 * @param {HTMLCanvasElement} canvasEl
 * @param {HTMLInputElement} inputEl
 * @param {HTMLButtonElement} [clearBtn]
 */
function attachSignatureCanvas(canvasEl, inputEl, clearBtn) {
  if (!canvasEl || !inputEl) return;
  var ctx = canvasEl.getContext ? canvasEl.getContext('2d') : null;
  if (!ctx) return;

  var isDrawing = false;
  var hasDrawn = false;

  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#0f172a';

  function getPos(e) {
    var rect = canvasEl.getBoundingClientRect();
    var scaleX = canvasEl.width / (rect.width || 1);
    var scaleY = canvasEl.height / (rect.height || 1);
    var clientX = e.clientX;
    var clientY = e.clientY;
    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    }
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  }

  function startDrawing(e) {
    isDrawing = true;
    hasDrawn = true;
    canvasEl._hasDrawn = true;
    var pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  }

  function draw(e) {
    if (!isDrawing) return;
    if (e.preventDefault && e.cancelable) e.preventDefault();
    var pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  }

  function stopDrawing() {
    if (!isDrawing) return;
    isDrawing = false;
    ctx.closePath();
    if (hasDrawn && typeof canvasEl.toDataURL === 'function') {
      try {
        inputEl.value = canvasEl.toDataURL('image/png');
      } catch (err) {}
    }
  }

  canvasEl.addEventListener('mousedown', startDrawing);
  canvasEl.addEventListener('mousemove', draw);
  window.addEventListener('mouseup', stopDrawing);

  canvasEl.addEventListener('touchstart', function (e) {
    if (e.cancelable) e.preventDefault();
    startDrawing(e);
  }, { passive: false });
  canvasEl.addEventListener('touchmove', function (e) {
    if (e.cancelable) e.preventDefault();
    draw(e);
  }, { passive: false });
  canvasEl.addEventListener('touchend', stopDrawing);

  if (clearBtn) {
    clearBtn.addEventListener('click', function (e) {
      e.preventDefault();
      ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
      hasDrawn = false;
      canvasEl._hasDrawn = false;
      inputEl.value = '';
    });
  }
}

/**
 * Displays an enlarged signature image modal
 * @param {string} dataUrl
 * @param {string} [signerName]
 */
function showSignatureEnlargedModal(dataUrl, signerName) {
  if (typeof document === 'undefined' || !isFormSignature(dataUrl)) return;
  var existing = document.getElementById('signature-enlarged-modal');
  if (existing) existing.remove();

  var overlay = document.createElement('div');
  overlay.id = 'signature-enlarged-modal';
  overlay.className = 'adm-ftype-modal-overlay';
  overlay.innerHTML =
    '<div class="adm-ftype-modal-card" style="max-width:480px;text-align:center;">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">' +
    '<div style="font-family:var(--font-headline);font-size:16px;font-weight:700;color:var(--text-primary);display:flex;align-items:center;gap:8px;">' +
    '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/></svg>' +
    '<span>Digital Signature</span>' +
    '</div>' +
    '<button type="button" class="btn-sig-modal-close" style="background:none;border:none;color:var(--text-secondary);font-size:24px;cursor:pointer;line-height:1;">&times;</button>' +
    '</div>' +
    (signerName ? '<div style="font-size:13px;color:var(--text-secondary);margin-bottom:12px;text-align:left;">Signed by: <strong style="color:var(--text-primary);">' + (typeof escapeHtml === 'function' ? escapeHtml(signerName) : signerName) + '</strong></div>' : '') +
    '<div style="background:#ffffff;border:1.5px solid var(--border-card);border-radius:10px;padding:16px;display:inline-block;max-width:100%;margin-bottom:16px;">' +
    '<img src="' + (typeof escapeHtml === 'function' ? escapeHtml(dataUrl) : dataUrl) + '" alt="Signature" style="max-height:180px;max-width:100%;display:block;margin:0 auto;"/>' +
    '</div>' +
    '<div>' +
    '<button type="button" class="portal-btn portal-btn-secondary btn-sig-modal-close" style="padding:8px 20px;font-size:13px;cursor:pointer;">Close</button>' +
    '</div>' +
    '</div>';

  document.body.appendChild(overlay);
  overlay.querySelectorAll('.btn-sig-modal-close').forEach(function (btn) {
    btn.addEventListener('click', function () { overlay.remove(); });
  });
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) overlay.remove();
  });
}

/**
 * Handles respondent file uploads inside built-in forms
 * @param {string} fieldId
 * @param {HTMLInputElement} input
 */
function handleFormFileUpload(fieldId, input) {
  if (input) input.value = '';
  removeFormFileUpload(fieldId);
}

/**
 * Removes uploaded file from built-in form response and resets input
 * @param {string} fieldId
 */
function removeFormFileUpload(fieldId) {
  if (typeof document === 'undefined') return;
  var fileInp = document.getElementById(fieldId + '-file');
  var labelEl = document.getElementById(fieldId + '-filename');
  var hiddenInp = document.getElementById(fieldId);
  var removeBtn = document.getElementById(fieldId + '-remove');
  if (fileInp) fileInp.value = '';
  if (labelEl) labelEl.textContent = 'No file chosen';
  if (hiddenInp) hiddenInp.value = '';
  if (removeBtn) removeBtn.style.display = 'none';
}

// ── Forms Hub (Member Interface) ───────────────────────────────────────────

/**
 * Renders the member Forms Hub list containing Uniform Order and active Custom Forms
 */
function renderFormsHub() {
  if (typeof document === 'undefined') return;
  var hub = document.getElementById('forms-hub');
  var inline = document.getElementById('inline-form-view');
  if (hub) hub.style.display = 'block';
  if (inline) inline.style.display = 'none';
  if (!hub) return;

  var uniformSvg =
    '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>';
  var linkSvg =
    '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>';
  var docSvg =
    '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>';

  var all = [
    {
      id: '__uniform__',
      name: 'Uniform Order',
      desc: 'Order BB uniform items',
      type: 'uniform',
      iconSvg: uniformSvg
    }
  ].concat(_customForms);

  var list = document.getElementById('forms-list') || hub;
  var searchWrap = document.getElementById('forms-search-wrap');

  if (!all.length) {
    if (searchWrap) searchWrap.style.display = 'none';
    list.innerHTML =
      '<div style="color:var(--text-secondary);text-align:center;padding:30px;font-size:13px;">No forms available.</div>';
    return;
  }
  if (searchWrap) searchWrap.style.display = 'block';

  var bgMap = {
    builtin: 'rgba(16,185,129,0.12)',
    uniform: 'rgba(245,197,66,0.12)',
    link: 'rgba(59,130,246,0.12)'
  };
  var colorMap = {
    builtin: 'var(--green)',
    uniform: 'var(--brand-gold)',
    link: 'var(--brand-blue)'
  };
  var html = '';

  all.forEach(function (f) {
    var icon = f.iconSvg || (f.type === 'link' ? linkSvg : docSvg);
    var bg = bgMap[f.type] || 'rgba(245,197,66,0.08)';
    var clr = colorMap[f.type] || 'var(--brand-gold)';
    var safeName = typeof escapeHtml === 'function' ? escapeHtml(f.name || '') : f.name || '';
    var safeDesc = typeof escapeHtml === 'function' ? escapeHtml(f.desc || '') : f.desc || '';
    var safeType = typeof escapeHtml === 'function' ? escapeHtml(f.type || '') : f.type || '';
    var safeId = typeof escapeHtml === 'function' ? escapeHtml(f.id || '') : f.id || '';

    var avail =
      f.id === '__uniform__'
        ? typeof window !== 'undefined' &&
          typeof window.isUniformOrdersAcceptingResponses === 'function'
          ? window.isUniformOrdersAcceptingResponses()
          : { open: true }
        : isFormAcceptingResponses(f);
    var statusBadge = '';
    if (!avail.open) {
      var badgeText = avail.reason === 'scheduled_future' ? 'Scheduled' : (avail.reason === 'scheduled_past' ? 'Closed' : 'Paused');
      statusBadge = ' <span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;background:rgba(234,179,8,0.15);color:var(--brand-gold);border:1px solid rgba(234,179,8,0.3);margin-left:6px;vertical-align:middle;">' + badgeText + '</span>';
    }

    html +=
      '<div class="form-card-hub" data-open-form="' +
      safeId +
      '" data-form-name="' +
      safeName.toLowerCase() +
      '" data-form-desc="' +
      safeDesc.toLowerCase() +
      '" data-form-type="' +
      safeType.toLowerCase() +
      '">' +
      '<div class="form-card-icon" style="background:' +
      bg +
      ';color:' +
      clr +
      ';">' +
      icon +
      '</div>' +
      '<div style="flex:1;"><div class="form-card-name">' +
      safeName +
      statusBadge +
      '</div>' +
      '<div class="form-card-desc">' +
      safeDesc +
      '</div></div>' +
      '<div class="form-card-arrow">&rsaquo;</div>' +
      '</div>';
  });

  list.innerHTML = html;

  list.querySelectorAll('.form-card-hub').forEach(function (card) {
    if (card && typeof card.addEventListener === 'function') {
      card.addEventListener('click', function () {
        var formId = card.getAttribute('data-open-form');
        openFormForMember(formId);
      });
    }
  });
}

/**
 * Filters the active forms list by search query
 * @param {string} query
 */
function filterForms(query) {
  var q = (query || '').toLowerCase().trim();
  var list = document.getElementById('forms-list');
  var statusEl = document.getElementById('forms-search-status');
  var countEl = document.getElementById('forms-search-count');
  var noResEl = document.getElementById('forms-no-results');
  var noResTitle = document.getElementById('forms-no-results-title');
  var clearBtn = document.getElementById('form-search-clear') || document.getElementById('forms-search-clear');

  if (clearBtn) {
    clearBtn.style.display = query && query.length > 0 ? 'flex' : 'none';
  }

  if (!list) return;
  var cards = list.querySelectorAll('.form-card-hub');
  var total = cards.length;
  var matchedCount = 0;

  cards.forEach(function (card) {
    var name = card.getAttribute('data-form-name') || '';
    var desc = card.getAttribute('data-form-desc') || '';
    var type = card.getAttribute('data-form-type') || '';
    var match = !q || name.indexOf(q) !== -1 || desc.indexOf(q) !== -1 || type.indexOf(q) !== -1;
    card.style.display = match ? 'flex' : 'none';
    if (match) matchedCount++;
  });

  if (q) {
    if (statusEl) {
      statusEl.style.display = 'flex';
      if (countEl) countEl.textContent = 'Showing ' + matchedCount + ' of ' + total + ' forms';
    }
    if (noResEl) {
      if (matchedCount === 0) {
        noResEl.style.display = 'block';
        if (noResTitle)
          noResTitle.textContent =
            'No forms match "' +
            (typeof escapeHtml === 'function' ? escapeHtml(query.trim()) : query.trim()) +
            '"';
      } else {
        noResEl.style.display = 'none';
      }
    }
  } else {
    if (statusEl) statusEl.style.display = 'none';
    if (noResEl) noResEl.style.display = 'none';
  }
}

/**
 * Resets search query in Forms Hub and restores all cards
 */
function clearFormSearch() {
  if (typeof document === 'undefined') return;
  var input = document.getElementById('form-search-input');
  if (input) {
    input.value = '';
    try {
      input.focus();
    } catch (e) {}
  }
  filterForms('');
}

/**
 * Opens a form for the member (Uniform inline form, external link, or built-in form)
 * @param {string} formId
 */
function openFormForMember(formId) {
  if (typeof document === 'undefined') return;
  loadCustomForms();

  if (formId === '__uniform__') {
    var hub = document.getElementById('forms-hub');
    var inline = document.getElementById('inline-form-view');
    if (hub) hub.style.display = 'none';
    if (inline) inline.style.display = 'block';
    if (typeof renderUniformOrderInline === 'function') {
      renderUniformOrderInline();
    }
    return;
  }

  var all = [].concat(_customForms);
  var form = all.find(function (f) {
    return f.id === formId;
  });
  if (!form) return;

  var avail = isFormAcceptingResponses(form);

  if (form.type === 'link') {
    if (!avail.open) {
      if (typeof showToast === 'function') {
        showToast(avail.message || 'Responses for this form are currently closed.', 'warning');
      }
      return;
    }
    var safeTargetUrl = typeof safeUrl === 'function' ? safeUrl(form.url, '#') : form.url;
    if (typeof window !== 'undefined' && window.open) {
      window.open(safeTargetUrl, '_blank');
    }
    return;
  }

  var hubView = document.getElementById('forms-hub');
  var inlineView = document.getElementById('inline-form-view');
  if (hubView) hubView.style.display = 'none';
  if (inlineView) inlineView.style.display = 'block';
  renderBuiltinFormInline(form);
}

/**
 * Navigates back to Forms Hub from any active inline form view
 */
function backToFormsHub() {
  if (typeof document === 'undefined') return;
  var hub = document.getElementById('forms-hub');
  var inline = document.getElementById('inline-form-view');
  if (hub) hub.style.display = 'block';
  if (inline) inline.style.display = 'none';

  // Clear uniform cart items if loaded
  if (
    typeof UNIFORM_ITEMS !== 'undefined' &&
    Array.isArray(UNIFORM_ITEMS) &&
    typeof itemQtys !== 'undefined'
  ) {
    UNIFORM_ITEMS.forEach(function (i) {
      itemQtys[i.key] = 0;
      if (typeof itemSizes !== 'undefined') delete itemSizes[i.key];
    });
  }
  if (typeof updateTotal === 'function') updateTotal();
  renderFormsHub();
}

/**
 * Renders built-in form inside container with progressive multi-section pagination,
 * bottom-left Next / Back / Submit buttons, responsive signatures and preview support.
 * @param {Object} form
 * @param {HTMLElement} [customContainer]
 * @param {Object} [options]
 */
function renderBuiltinFormInline(form, customContainer, options) {
  if (typeof document === 'undefined') return;
  var container = customContainer || document.getElementById('inline-form-view') || document.getElementById('builtin-form-view');
  if (!container) return;

  var isPreview = Boolean(options && options.isPreview);

  var avail = isFormAcceptingResponses(form);
  if (!avail.open && !isPreview) {
    var badgeText = avail.reason === 'scheduled_future' ? 'Scheduled to Open' : (avail.reason === 'paused' ? 'Responses Paused' : 'Responses Closed');
    container.innerHTML =
      '<div class="dark-card" style="text-align:center;padding:36px 24px;">' +
      '<button onclick="backToFormsHub()" style="display:inline-flex;align-items:center;gap:6px;background:none;border:none;color:var(--text-secondary);font-family:var(--font-headline);font-size:13px;cursor:pointer;padding:0;margin-bottom:20px;">\u2039 Back to Forms</button>' +
      '<div style="width:52px;height:52px;border-radius:50%;background:rgba(234,179,8,0.12);color:var(--brand-gold);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;">' +
      '<svg class="ui-icon-lg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' +
      '</div>' +
      '<div class="page-title" style="margin-bottom:6px;">' + escapeHtml(form.name) + '</div>' +
      '<div style="font-size:15px;color:#ffffff;font-weight:600;margin-bottom:16px;">' + badgeText + '</div>' +
      '<div style="font-size:14px;color:var(--text-secondary);line-height:1.75;max-width:480px;margin:0 auto 24px;white-space:pre-wrap;">' +
      escapeHtml(avail.message) +
      '</div>' +
      '<button type="button" class="portal-btn portal-btn-secondary" onclick="backToFormsHub()" style="display:inline-flex;align-items:center;gap:6px;margin:0 auto;padding:8px 18px;font-size:13px;cursor:pointer;">' +
      'Return to Forms Hub</button>' +
      '</div>';
    return;
  }

  var formKey = form && form.id ? String(form.id).replace(/[^a-zA-Z0-9_-]/g, '_') : 'f';
  var items = (form.items && form.items.length) ? form.items : (form.fields || []);
  var sigPadsToInit = [];

  // Group items into progressive section pages
  var sectionPages = [];
  var curPage = {
    title: '',
    desc: '',
    items: []
  };

  items.forEach(function (f, idx) {
    if (!f || isLegacyFormUpload(f)) return;
    if (f.kind === 'section') {
      if (curPage.items.length > 0 || curPage.title || curPage.desc || sectionPages.length > 0) {
        sectionPages.push(curPage);
      }
      curPage = {
        title: f.title || 'Untitled Section',
        desc: f.desc || '',
        items: []
      };
    } else {
      curPage.items.push({ field: f, index: idx });
    }
  });
  sectionPages.push(curPage);

  var totalPages = sectionPages.length;
  var pagesHtml = '';

  sectionPages.forEach(function (page, pIdx) {
    var pFieldsHtml = '';

    // Page indicator (if multiple sections)
    var pageBadge = totalPages > 1
      ? '<div style="font-size:12px;font-weight:700;color:var(--brand-gold, #f59e0b);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Section ' + (pIdx + 1) + ' of ' + totalPages + '</div>'
      : '';

    // Section Header (for section breaks)
    var sectionHeaderHtml = '';
    if (pIdx > 0 && page.title) {
      sectionHeaderHtml =
        '<div style="background:var(--bg-card-subtle);border-left:4px solid #f59e0b;border-radius:8px;padding:14px 18px;margin-bottom:18px;">' +
        '<div style="font-family:var(--font-headline);font-size:16px;font-weight:700;color:var(--text-primary);">' + escapeHtml(page.title) + '</div>' +
        (page.desc ? '<div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">' + escapeHtml(page.desc) + '</div>' : '') +
        '</div>';
    }

    page.items.forEach(function (entry) {
      var f = entry.field;
      var i = entry.index;

      if (f.kind === 'title_desc') {
        pFieldsHtml +=
          '<div style="background:var(--bg-card-subtle);border:1px solid var(--border-card);border-radius:8px;padding:14px 18px;margin:16px 0;">' +
          '<div style="font-family:var(--font-headline);font-size:15px;font-weight:700;color:var(--text-primary);">' + escapeHtml(f.title || '') + '</div>' +
          (f.desc ? '<div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">' + escapeHtml(f.desc) + '</div>' : '') +
          '</div>';
        return;
      }

      if (f.kind === 'image') {
        if (f.url) {
          pFieldsHtml +=
            '<div class="form-image-block" style="margin:16px 0;text-align:center;">' +
            (f.title ? '<div style="font-family:var(--font-headline);font-size:15px;font-weight:700;color:var(--text-primary);margin-bottom:8px;text-align:left;">' + escapeHtml(f.title) + '</div>' : '') +
            '<img src="' + escapeHtml(f.url) + '" alt="' + escapeHtml(f.title || 'Form image') + '" style="max-width:100%;max-height:360px;border-radius:10px;border:1px solid var(--border-card);object-fit:contain;box-shadow:0 2px 10px rgba(0,0,0,0.15);"/>' +
            '</div>';
        } else if (f.title) {
          pFieldsHtml +=
            '<div class="form-image-block" style="margin:14px 0;">' +
            '<div style="font-family:var(--font-headline);font-size:15px;font-weight:700;color:var(--text-primary);">' + escapeHtml(f.title) + '</div>' +
            '</div>';
        }
        return;
      }

      var fieldId = 'bff-' + formKey + '-' + i;
      var req = f.required ? ' <span style="color:var(--red);">*</span>' : '';
      var label = f.title || f.label || ('Question ' + (i + 1));
      var inp = '';
      var reqAttr = f.required ? ' data-required="true" data-label="' + escapeHtml(label) + '" ' : '';

      if (f.type === 'textarea' || f.type === 'paragraph') {
        inp = '<textarea class="form-textarea" id="' + fieldId + '" placeholder="Your answer..." style="margin-top:6px;"' + reqAttr + '></textarea>';
      } else if (f.type === 'select' || f.type === 'dropdown') {
        var opts = '<option value="">Select an option...</option>';
        var optArr = Array.isArray(f.options) ? f.options : (f.options || '').split(',');
        optArr.forEach(function (o) {
          var t = String(o).trim();
          if (t) opts += '<option value="' + escapeHtml(t) + '">' + escapeHtml(t) + '</option>';
        });
        inp = '<select class="form-select" id="' + fieldId + '" style="margin-top:6px;"' + reqAttr + '>' + opts + '</select>';
      } else if (f.type === 'multiple_choice' || f.type === 'radio') {
        var optArr = Array.isArray(f.options) ? f.options : (f.options || '').split(',');
        var radiosHtml = '<div style="display:flex;flex-direction:column;gap:8px;margin-top:8px;">';
        optArr.forEach(function (o) {
          var t = String(o).trim();
          if (!t) return;
          if (isOtherOption(t)) {
            radiosHtml +=
              '<label style="display:flex;align-items:center;gap:10px;font-size:13px;color:var(--text-primary);cursor:pointer;flex-wrap:wrap;">' +
              '<input type="radio" name="' + fieldId + '" value="__other__" class="gf-other-radio" style="accent-color:#f59e0b;cursor:pointer;" onchange="onGfOtherRadioChange(\'' + fieldId + '\')"' + reqAttr + '/> ' +
              '<span>Other:</span>' +
              '<input type="text" class="form-input form-input-sm gf-other-input" id="' + fieldId + '-other-text" data-field-id="' + fieldId + '" placeholder="Your answer" style="margin:0;padding:6px 12px;font-size:12px;height:auto;flex:1;min-width:180px;max-width:340px;border-radius:6px;" onfocus="onGfOtherInputFocus(\'' + fieldId + '\', \'radio\')" oninput="onGfOtherInputChange(\'' + fieldId + '\', \'radio\', this.value)"/>' +
              '</label>';
          } else {
            radiosHtml += '<label style="display:flex;align-items:center;gap:10px;font-size:13px;color:var(--text-primary);cursor:pointer;">' +
              '<input type="radio" name="' + fieldId + '" value="' + escapeHtml(t) + '" style="accent-color:#f59e0b;cursor:pointer;"' + reqAttr + '/> ' +
              '<span>' + escapeHtml(t) + '</span>' +
              '</label>';
          }
        });
        radiosHtml += '</div>';
        radiosHtml += '<input type="hidden" id="' + fieldId + '" value=""/>';
        inp = radiosHtml;
      } else if (f.type === 'checkboxes') {
        var optArr = Array.isArray(f.options) ? f.options : (f.options || '').split(',');
        var cbsHtml = '<div style="display:flex;flex-direction:column;gap:8px;margin-top:8px;">';
        optArr.forEach(function (o) {
          var t = String(o).trim();
          if (!t) return;
          if (isOtherOption(t)) {
            cbsHtml +=
              '<label style="display:flex;align-items:center;gap:10px;font-size:13px;color:var(--text-primary);cursor:pointer;flex-wrap:wrap;">' +
              '<input type="checkbox" data-cb-group="' + fieldId + '" value="__other__" class="gf-other-cb" style="accent-color:#f59e0b;cursor:pointer;" onchange="onGfOtherCheckboxChange(\'' + fieldId + '\', this.checked)"/> ' +
              '<span>Other:</span>' +
              '<input type="text" class="form-input form-input-sm gf-other-input" id="' + fieldId + '-other-text" data-field-id="' + fieldId + '" placeholder="Your answer" style="margin:0;padding:6px 12px;font-size:12px;height:auto;flex:1;min-width:180px;max-width:340px;border-radius:6px;" onfocus="onGfOtherInputFocus(\'' + fieldId + '\', \'checkbox\')" oninput="onGfOtherInputChange(\'' + fieldId + '\', \'checkbox\', this.value)"/>' +
              '</label>';
          } else {
            cbsHtml += '<label style="display:flex;align-items:center;gap:10px;font-size:13px;color:var(--text-primary);cursor:pointer;">' +
              '<input type="checkbox" data-cb-group="' + fieldId + '" value="' + escapeHtml(t) + '" style="accent-color:#f59e0b;cursor:pointer;"/> ' +
              '<span>' + escapeHtml(t) + '</span>' +
              '</label>';
          }
        });
        cbsHtml += '</div>';
        cbsHtml += '<input type="hidden" id="' + fieldId + '" value=""/>';
        inp = cbsHtml;
      } else if (f.type === 'date') {
        inp = '<input class="form-input" type="date" id="' + fieldId + '" style="margin-top:6px;"' + reqAttr + '/>';
      } else if (f.type === 'time') {
        inp = '<input class="form-input" type="time" id="' + fieldId + '" style="margin-top:6px;"' + reqAttr + '/>';
      } else if (f.type === 'signature') {
        inp = '<div class="form-signature-wrapper" id="sig-wrap-' + fieldId + '" style="margin-top:8px;">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
            '<span style="font-size:12px;color:#64748b;display:inline-flex;align-items:center;gap:6px;">' +
              '<svg class="ui-icon-xs" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/></svg> ' +
              'Draw signature inside the box' +
            '</span>' +
            '<button type="button" class="btn-sig-clear" data-sig-clear="' + fieldId + '" style="background:none;border:none;color:#ef4444;font-size:12px;font-weight:600;cursor:pointer;padding:2px 8px;border-radius:4px;">Clear</button>' +
          '</div>' +
          '<canvas id="canvas-' + fieldId + '" class="form-sig-canvas" width="460" height="140" style="background:#ffffff;border:1.5px dashed #cbd5e1;border-radius:8px;width:100%;max-width:500px;height:140px;cursor:crosshair;touch-action:none;display:block;"' + reqAttr + ' data-field-id="' + fieldId + '"></canvas>' +
          '<input type="hidden" id="' + fieldId + '" name="' + escapeHtml(label) + '"/>' +
        '</div>';
        sigPadsToInit.push({ fieldId: fieldId });
      } else {
        inp = '<input class="form-input" type="' + (f.type || 'text') + '" id="' + fieldId + '" placeholder="Your answer..." style="margin-top:6px;"' + reqAttr + '/>';
      }

      pFieldsHtml +=
        '<div class="form-group"><label class="form-label">' +
        escapeHtml(label) +
        req +
        '</label>' +
        inp +
        '</div>';
    });

    // Navigation buttons row positioned on the bottom left corner:
    // When on the last page/section: Back button first, then Submit button to the right of Back.
    var navButtonsHtml = '<div class="form-nav-btn-row">';
    if (pIdx > 0) {
      navButtonsHtml += '<button type="button" class="portal-btn portal-btn-secondary btn-form-back" data-goto-page="' + (pIdx - 1) + '" style="padding:10px 22px;border-radius:10px;font-size:13px;font-weight:600;display:inline-flex;align-items:center;gap:6px;cursor:pointer;"><svg class="ui-icon-xs" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg> Back</button>';
    }
    if (pIdx < totalPages - 1) {
      navButtonsHtml += '<button type="button" class="submit-btn gold btn-form-next" data-goto-page="' + (pIdx + 1) + '" style="width:auto;margin:0;padding:10px 26px;border-radius:10px;font-size:13px;font-weight:700;display:inline-flex;align-items:center;gap:6px;cursor:pointer;">Next <svg class="ui-icon-xs" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg></button>';
    } else {
      navButtonsHtml += '<button type="button" class="submit-btn gold btn-with-icon" data-submit-form="' + escapeHtml(form.id) + '" style="width:auto;margin:0;padding:10px 28px;border-radius:10px;font-size:13px;font-weight:700;display:inline-flex;align-items:center;gap:8px;cursor:pointer;"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg> Submit</button>';
    }
    navButtonsHtml += '</div>';

    pagesHtml +=
      '<div class="form-section-page" data-page-index="' + pIdx + '" style="' + (pIdx === 0 ? '' : 'display:none;') + '">' +
      pageBadge +
      sectionHeaderHtml +
      pFieldsHtml +
      navButtonsHtml +
      '</div>';
  });

  var backBtnHtml = !isPreview
    ? '<button onclick="backToFormsHub()" style="display:flex;align-items:center;gap:6px;background:none;border:none;color:var(--text-secondary);font-family:var(--font-headline);font-size:13px;cursor:pointer;padding:0;margin-bottom:16px;">\u2039 Back to Forms</button>'
    : '';

  container.innerHTML =
    '<div class="dark-card">' +
    backBtnHtml +
    '<div class="page-title">' +
    escapeHtml(form.name) +
    '</div>' +
    (form.desc ? '<div class="page-desc">' + escapeHtml(form.desc) + '</div>' : '') +
    '<hr class="divider"/>' +
    pagesHtml +
    '<div class="success-box" id="builtin-success" style="display:none;"><div class="s-icon"><svg class="ui-icon-lg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg></div><div class="s-title">Submitted!</div><div class="s-msg">Your form has been received.</div></div>' +
    '</div>';

  sigPadsToInit.forEach(function (sigItem) {
    var canvas = document.getElementById('canvas-' + sigItem.fieldId);
    var input = document.getElementById(sigItem.fieldId);
    var clearBtn = container.querySelector('[data-sig-clear="' + sigItem.fieldId + '"]');
    if (canvas && input) {
      attachSignatureCanvas(canvas, input, clearBtn);
    }
  });

  // Wire Next section button
  container.querySelectorAll('.btn-form-next').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var targetIdx = parseInt(btn.getAttribute('data-goto-page'), 10);
      var currentVisiblePage = container.querySelector('.form-section-page:not([style*="display: none"]):not([style*="display:none"])') || container.querySelector('.form-section-page[data-page-index="0"]');

      // Validate required inputs on current page before advancing
      if (currentVisiblePage) {
        var missingLabel = null;

        var reqInputs = currentVisiblePage.querySelectorAll('input[data-required="true"], textarea[data-required="true"], select[data-required="true"]');
        for (var k = 0; k < reqInputs.length; k++) {
          var inpEl = reqInputs[k];
          if (inpEl.type === 'radio') continue;
          if (!inpEl.value || !inpEl.value.trim()) {
            missingLabel = inpEl.getAttribute('data-label') || 'This field';
            inpEl.focus();
            break;
          }
        }

        if (!missingLabel) {
          var radioGroups = {};
          currentVisiblePage.querySelectorAll('input[type="radio"][data-required="true"]').forEach(function (r) {
            radioGroups[r.name] = r.getAttribute('data-label') || 'This question';
          });
          var rNames = Object.keys(radioGroups);
          for (var rIdx = 0; rIdx < rNames.length; rIdx++) {
            var rName = rNames[rIdx];
            var checked = currentVisiblePage.querySelector('input[name="' + rName + '"]:checked');
            if (!checked) {
              missingLabel = radioGroups[rName];
              break;
            }
          }
        }

        if (!missingLabel) {
          var reqCanvases = currentVisiblePage.querySelectorAll('canvas[data-required="true"]');
          for (var sIdx = 0; sIdx < reqCanvases.length; sIdx++) {
            var sCanvas = reqCanvases[sIdx];
            var fId = sCanvas.getAttribute('data-field-id');
            var hInp = fId ? currentVisiblePage.querySelector('#' + fId) : null;
            var hasVal = (hInp && hInp.value && hInp.value.indexOf('data:image') !== -1) || sCanvas._hasDrawn;
            if (!hasVal) {
              missingLabel = sCanvas.getAttribute('data-label') || 'Signature';
              break;
            }
          }
        }

        if (missingLabel) {
          if (typeof showToast === 'function') {
            showToast('Please answer required question: ' + missingLabel, 'warning');
          }
          return;
        }
      }

      container.querySelectorAll('.form-section-page').forEach(function (p) {
        p.style.display = 'none';
      });
      var targetPage = container.querySelector('.form-section-page[data-page-index="' + targetIdx + '"]');
      if (targetPage) {
        targetPage.style.display = 'block';
        if (container.scrollIntoView) {
          container.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    });
  });

  // Wire Back section button
  container.querySelectorAll('.btn-form-back').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var targetIdx = parseInt(btn.getAttribute('data-goto-page'), 10);
      container.querySelectorAll('.form-section-page').forEach(function (p) {
        p.style.display = 'none';
      });
      var targetPage = container.querySelector('.form-section-page[data-page-index="' + targetIdx + '"]');
      if (targetPage) {
        targetPage.style.display = 'block';
        if (container.scrollIntoView) {
          container.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    });
  });

  // Wire Submit button
  var submitBtn = container.querySelector('[data-submit-form]');
  if (submitBtn) {
    submitBtn.addEventListener('click', function () {
      if (isPreview) {
        if (typeof showToast === 'function') {
          showToast('This is a preview mode. Submissions are disabled.', 'warning');
        }
        return;
      }
      submitBuiltinForm(form);
    });
  }
}

/**
 * Validates dynamic built-in form answers against field definitions
 * @param {Object} form - Form definition containing fields or items
 * @param {Object} answersMap - Key-value pair of answers by field label or index
 * @returns {{ valid: boolean, errors: Object, error: string|null }}
 */
function validateFormAnswers(form, answersMap) {
  var items = (form && Array.isArray(form.items) && form.items.length)
    ? form.items
    : ((form && Array.isArray(form.fields)) ? form.fields : []);
  var answers = answersMap || {};
  var errors = Object.create(null);
  var firstError = null;

  var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var phoneRegex = /^[0-9+\-\s()]{7,20}$/;

  for (var i = 0; i < items.length; i++) {
    var f = items[i];
    if (!isFormQuestion(f)) continue;
    var label = f.label || f.title || ('Question ' + (i + 1));
    var val = Object.hasOwn(answers, label) && answers[label] != null ? String(answers[label]).trim() : '';
    var formKey = form && form.id ? String(form.id).replace(/[^a-zA-Z0-9_-]/g, '_') : '';
    if (val === '' && formKey && answers['bff-' + formKey + '-' + i] !== undefined) {
      val = String(answers['bff-' + formKey + '-' + i]).trim();
    }
    if (val === '' && answers['bff-' + i] !== undefined) {
      val = String(answers['bff-' + i]).trim();
    }

    // Required check
    if (f.required && !val) {
      errors[label] = label + ' is required.';
      if (!firstError) firstError = errors[label];
      continue;
    }

    // If empty and optional, skip format validations
    if (!val) continue;

    // Signature check
    if (f.type === 'signature') {
      if (!isFormSignature(val)) {
        errors[label] = 'Please provide a valid signature for ' + label + '.';
        if (!firstError) firstError = errors[label];
      }
      continue;
    }

    // Email validation
    if (f.type === 'email' && !emailRegex.test(val)) {
      errors[label] = 'Please enter a valid email address.';
      if (!firstError) firstError = errors[label];
      continue;
    }

    // Phone / Tel validation
    if ((f.type === 'tel' || f.type === 'phone') && !phoneRegex.test(val)) {
      errors[label] = 'Please enter a valid phone number.';
      if (!firstError) firstError = errors[label];
      continue;
    }

    // Number validation
    if (f.type === 'number') {
      var num = Number(val);
      if (!Number.isFinite(num)) {
        errors[label] = 'Please enter a valid number.';
        if (!firstError) firstError = errors[label];
        continue;
      }
    }

    if (['select', 'dropdown', 'radio', 'multiple_choice', 'checkboxes'].includes(f.type)) {
      var choices = (Array.isArray(f.options) ? f.options : String(f.options || '').split(',')).map(function(option) {
        return String(option).trim();
      }).filter(Boolean);
      var entries = f.type === 'checkboxes' ? val.split(', ') : [val];
      if (choices.length && !choices.includes(val) && !entries.every(function(entry) {
        return choices.includes(entry) || (choices.some(isOtherOption) && /^Other: .+/.test(entry));
      })) {
        errors[label] = 'Please select a valid option for ' + label + '.';
        if (!firstError) firstError = errors[label];
        continue;
      }
    }

    // Max length check (skip signature data URLs)
    if (f.type !== 'signature') {
      var maxLen = (f.type === 'textarea' || f.type === 'paragraph') ? 2000 : 300;
      if (val.length > maxLen) {
        errors[label] = label + ' exceeds maximum length of ' + maxLen + ' characters.';
        if (!firstError) firstError = errors[label];
        continue;
      }
    }
  }

  var isValid = Object.keys(errors).length === 0;
  return {
    valid: isValid,
    errors: errors,
    error: firstError
  };
}

/**
 * Validates and submits built-in form answers into Supabase bb_orders
 * @param {Object} form
 */
async function submitBuiltinForm(form) {
  if (_isSubmittingBuiltinForm) {
    if (typeof showToast === 'function') showToast('Submission is already in progress.', 'warning');
    return;
  }

  if (!form || !form.id) return;
  var currentForm = _customForms.find(function(item) { return item && String(item.id) === String(form.id); });
  var avail = isFormAcceptingResponses(currentForm || form);
  if (!avail.open) {
    if (typeof showToast === 'function') {
      showToast(avail.message || 'Responses for this form are currently paused.', 'warning');
    }
    return;
  }

  var items = (form && Array.isArray(form.items) && form.items.length)
    ? form.items
    : ((form && Array.isArray(form.fields)) ? form.fields : []);
  var formKey = form && form.id ? String(form.id).replace(/[^a-zA-Z0-9_-]/g, '_') : 'f';
  var rawAnswers = Object.create(null);
  var cleanAnswers = Object.create(null);

  items.forEach(function (f, i) {
    if (!isFormQuestion(f)) return;
    var label = f.label || f.title || ('Question ' + (i + 1));
    var scopedId = 'bff-' + formKey + '-' + i;
    var el = typeof document !== 'undefined'
      ? (document.getElementById(scopedId) || document.getElementById('bff-' + i))
      : null;
    var val = '';
    if (f.type === 'multiple_choice' || f.type === 'radio') {
      var checkedRadio = typeof document !== 'undefined' ? document.querySelector('input[name="' + scopedId + '"]:checked') : null;
      if (checkedRadio) {
        if (checkedRadio.value === '__other__') {
          var otherInp = typeof document !== 'undefined' ? document.getElementById(scopedId + '-other-text') : null;
          var otherVal = otherInp ? otherInp.value.trim() : '';
          val = otherVal ? ('Other: ' + otherVal) : '';
        } else {
          val = checkedRadio.value;
        }
      } else {
        val = '';
      }
    } else if (f.type === 'checkboxes') {
      var checkedBoxes = typeof document !== 'undefined' ? document.querySelectorAll('input[data-cb-group="' + scopedId + '"]:checked') : [];
      var vals = [];
      checkedBoxes.forEach(function (cb) {
        if (cb.value === '__other__') {
          var otherInp = typeof document !== 'undefined' ? document.getElementById(scopedId + '-other-text') : null;
          var otherVal = otherInp ? otherInp.value.trim() : '';
          if (otherVal) vals.push('Other: ' + otherVal);
        } else {
          vals.push(cb.value);
        }
      });
      val = vals.join(', ');
    } else if (f.type === 'signature') {
      if (el && el.value && el.value.indexOf('data:image') !== -1) {
        val = el.value.trim();
      } else {
        var sigCanvas = typeof document !== 'undefined'
          ? (document.getElementById('canvas-' + scopedId) || document.getElementById('canvas-bff-' + i))
          : null;
        if (sigCanvas && typeof sigCanvas.toDataURL === 'function' && sigCanvas._hasDrawn) {
          try {
            val = sigCanvas.toDataURL('image/png');
            if (el) el.value = val;
          } catch (e) {}
        }
      }
    } else if (el) {
      val = el.value.trim();
    }
    rawAnswers[label] = val;
    var sanitizedVal = f.type === 'signature'
      ? val
      : (typeof sanitizeInput === 'function' ? sanitizeInput(val, (f.type === 'textarea' || f.type === 'paragraph') ? 2000 : 300) : val);
    cleanAnswers[label] = sanitizedVal;
  });

  // Validate answers
  var validation = validateFormAnswers(form, rawAnswers);

  // Update DOM field border styling
  items.forEach(function (f, i) {
    if (!isFormQuestion(f)) return;
    var label = f.label || f.title || ('Question ' + (i + 1));
    var scopedId = 'bff-' + formKey + '-' + i;
    var el = typeof document !== 'undefined'
      ? (document.getElementById(scopedId) || document.getElementById('bff-' + i))
      : null;
    if (el) {
      if (validation.errors[label]) {
        el.style.borderColor = '#f66';
      } else {
        el.style.borderColor = '';
      }
    }
    var otherInp = typeof document !== 'undefined' ? document.getElementById(scopedId + '-other-text') : null;
    if (otherInp) {
      var chkRadio = typeof document !== 'undefined' ? document.querySelector('input[name="' + scopedId + '"]:checked') : null;
      var isOtherRad = chkRadio && chkRadio.value === '__other__';
      if (validation.errors[label] && isOtherRad && !otherInp.value.trim()) {
        otherInp.style.borderColor = '#f66';
      } else {
        otherInp.style.borderColor = '';
      }
    }
  });

  if (!validation.valid) {
    if (typeof showToast === 'function')
      showToast(validation.error || 'Please fill in all required fields.', 'warning');
    return;
  }

  _isSubmittingBuiltinForm = true;

  var btn = typeof document !== 'undefined' ? Array.from(document.querySelectorAll('[data-submit-form]')).find(function(button) {
    return button.getAttribute('data-submit-form') === String(form.id);
  }) : null;
  if (typeof setButtonLoading === 'function') {
    setButtonLoading(btn, true, 'Submitting...', 'Submitting form responses...');
  } else if (btn) {
    btn.innerHTML = 'Submitting...';
    btn.disabled = true;
  }

  var ic = typeof sessionGet === 'function' ? sessionGet('ic') || sessionGet('email') || '' : '';
  var name = typeof sessionGet === 'function' ? sessionGet('name') || '' : '';
  var rank = typeof sessionGet === 'function' ? sessionGet('rank') || '' : '';

  var client = getSupa();
  if (!client || (typeof client.req !== 'function' && typeof client.post !== 'function')) {
    if (typeof showToast === 'function') showToast('Database unavailable.', 'error');
    if (typeof setButtonLoading === 'function') setButtonLoading(btn, false);
    else if (btn) {
      btn.innerHTML = 'Submit';
      btn.disabled = false;
    }
    _isSubmittingBuiltinForm = false;
    return;
  }

  var orderNum = 'FORM-' + crypto.randomUUID().toUpperCase();
  var payload = {
    order_number: orderNum,
    ic: ic || 'GUEST',
    member_name: name || ic || 'Guest Respondent',
    rank: rank || '',
    squad: '',
    items: JSON.stringify({
      form_id: form.id,
      form_name: form.name,
      answers: cleanAnswers
    }),
    notes: form.id,
    status: 'submitted',
    created_at: new Date().toISOString()
  };

  try {
    if (currentForm) {
      await loadCustomForms(true);
      var latest = _customForms.find(function(item) { return String(item.id) === String(form.id); });
      var currentAvailability = latest ? isFormAcceptingResponses(latest) : { open: false, message: 'This form is no longer available.' };
      if (!currentAvailability.open || latest.type !== 'builtin') {
        if (typeof showToast === 'function') showToast(currentAvailability.message || 'This form is no longer available.', 'warning');
        if (typeof setButtonLoading === 'function') setButtonLoading(btn, false);
        else if (btn) { btn.innerHTML = 'Submit Response'; btn.disabled = false; }
        return;
      }
      if (JSON.stringify(latest.items || latest.fields) !== JSON.stringify(form.items || form.fields)) {
        if (typeof showToast === 'function') showToast('The questions changed. Reopen the form before submitting.', 'warning');
        if (typeof setButtonLoading === 'function') setButtonLoading(btn, false);
        else if (btn) { btn.innerHTML = 'Submit Response'; btn.disabled = false; }
        return;
      }
    }
    try {
      if (typeof client.req === 'function') await client.req('POST', 'bb_orders', payload, null, { maxRetries: 0 });
      else await client.post('bb_orders', payload);
    } catch (error) {
      var message = String(error.message || '');
      var omitted = ['notes', 'rank', 'squad', 'created_at'].find(function(key) {
        return message.includes('PGRST204') && message.includes("'" + key + "'");
      });
      if (!omitted) throw error;
      delete payload[omitted];
      if (typeof client.req === 'function') await client.req('POST', 'bb_orders', payload, null, { maxRetries: 0 });
      else await client.post('bb_orders', payload);
    }

    if (typeof document !== 'undefined') {
      var s = document.getElementById('builtin-success');
      if (s) s.style.display = 'block';
      if (btn) btn.style.display = 'none';
    }

    if (typeof showToast === 'function')
      showToast('Form submitted successfully!', 'success');

    setTimeout(function () {
      backToFormsHub();
    }, 1800);
  } catch (e) {
    if (typeof showToast === 'function')
      showToast('Submission could not be confirmed. Check your responses before trying again.', 'error');
    if (typeof setButtonLoading === 'function') setButtonLoading(btn, false);
    else if (btn) {
      btn.innerHTML = 'Submit Response';
      btn.disabled = false;
    }
  } finally {
    _isSubmittingBuiltinForm = false;
  }
}

// ── Admin Form Builder (Legacy DOM ID Preservations & Tests) ───────────────

/**
 * Renders uniform products list preview (deprecated)
 */
function renderUniformProductsPreview() {
  if (typeof document === 'undefined') return;
  var container = document.getElementById('uniform-products-preview');
  if (container) container.innerHTML = '';
}

/**
 * Toggles form type between External Link and Built-in Dynamic Form
 * @param {string} type
 */
function setFormType(type) {
  _currentFormType = type;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports._currentFormType = type;
  }
  if (typeof window !== 'undefined') {
    window._currentFormType = type;
  }
  if (typeof document === 'undefined') return;
  ['link', 'builtin'].forEach(function (t) {
    var btn = document.getElementById('ftype-' + t);
    var fields = document.getElementById('fb-' + t + '-fields');
    if (btn) btn.classList.toggle('ftype-active', t === type);
    if (fields) fields.style.display = t === type ? 'block' : 'none';
  });
}

/**
 * Appends a new field row in the dynamic form builder
 */
function addFormField() {
  _fbFields.push({ id: 'f' + Date.now(), label: '', type: 'text', required: false });
  renderFbFields();
}

/**
 * Renders configurable field rows in the Form Builder Admin panel
 */
function renderFbFields() {
  if (typeof document === 'undefined') return;
  var container = document.getElementById('fb-fields-list');
  if (!container) return;

  var html = '';
  _fbFields.forEach(function (f, i) {
    var types = ['text', 'textarea', 'number', 'date', 'select'];
    var opts = types
      .map(function (t) {
        return (
          '<option value="' + t + '"' + (f.type === t ? ' selected' : '') + '>' + t + '</option>'
        );
      })
      .join('');

    html +=
      '<div class="fb-field-row">' +
      '<input type="text" value="' +
      escapeHtml(f.label || '') +
      '" data-fi="' +
      i +
      '" data-fk="label" placeholder="Field label" style="flex:1;background:var(--bg-input);color:var(--text-primary);border:1.5px solid var(--border-card);border-radius:8px;padding:8px 10px;font-size:13px;"/>' +
      '<select data-fi="' +
      i +
      '" data-fk="type" style="background:var(--bg-input);color:var(--text-primary);border:1.5px solid var(--border-card);border-radius:8px;padding:8px;font-size:12px;">' +
      opts +
      '</select>' +
      '<label style="display:flex;align-items:center;gap:4px;color:var(--text-secondary);font-size:11px;cursor:pointer;"><input type="checkbox" data-fi="' +
      i +
      '" data-fk="required"' +
      (f.required ? ' checked' : '') +
      '/> Req</label>' +
      '<button data-fi="' +
      i +
      '" data-fk="del" style="background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);color:var(--red);padding:5px 9px;border-radius:7px;cursor:pointer;font-size:13px;display:inline-flex;align-items:center;justify-content:center;"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>' +
      '</div>' +
      (f.type === 'select'
        ? '<input type="text" value="' +
          escapeHtml(f.options || '') +
          '" data-fi="' +
          i +
          '" data-fk="options" placeholder="Options: Yes, No, Maybe" style="width:100%;background:var(--bg-input);color:var(--text-primary);border:1.5px solid var(--border-card);border-radius:8px;padding:8px 10px;font-size:12px;margin-bottom:8px;"/>'
        : '');
  });

  container.innerHTML = html;
  container.querySelectorAll('[data-fi]').forEach(function (el) {
    var event = el.getAttribute('data-fk') === 'del' ? 'click' : el.type === 'checkbox' ? 'change' : 'input';
    el.addEventListener(event, function () {
      var i = parseInt(el.getAttribute('data-fi'), 10);
      var fk = el.getAttribute('data-fk');
      if (fk === 'del') {
        _fbFields.splice(i, 1);
        renderFbFields();
        return;
      }
      _fbFields[i][fk] = el.type === 'checkbox' ? el.checked : el.value;
      if (fk === 'type') renderFbFields();
    });
  });
}

/**
 * Updates badge and toggle button text in Form Builder Response Availability card
 * @param {string} [status]
 */
function updateFormBuilderScheduleBadge(status) {
  if (typeof document === 'undefined') return;
  var badge = document.querySelector('.fb-schedule-badge');
  var toggleBtn = document.querySelector('.fb-schedule-toggle-btn');
  if (!badge && !toggleBtn) return;

  var currentStatus = status;
  if (!currentStatus) {
    var pausedRadio = document.querySelector('input[name="fb-status-radio"][value="paused"]');
    currentStatus = pausedRadio && pausedRadio.checked ? 'paused' : 'active';
  }

  if (badge) {
    if (currentStatus === 'paused') {
      badge.textContent = 'PAUSED';
      badge.style.background = 'rgba(234,179,8,0.15)';
      badge.style.color = 'var(--brand-gold, #f5c542)';
      badge.style.border = '1px solid rgba(234,179,8,0.3)';
    } else {
      badge.textContent = 'ACTIVE';
      badge.style.background = 'rgba(34,197,94,0.15)';
      badge.style.color = '#22c55e';
      badge.style.border = '1px solid rgba(34,197,94,0.3)';
    }
  }

  if (toggleBtn) {
    toggleBtn.textContent = currentStatus === 'paused' ? 'Resume Responses' : 'Pause Responses';
  }
}

/**
 * Toggles form builder status between Active and Paused from the header button
 */
async function toggleFormBuilderStatus() {
  if (typeof document === 'undefined') return;
  var activeRadio = document.querySelector('input[name="fb-status-radio"][value="active"]');
  var pausedRadio = document.querySelector('input[name="fb-status-radio"][value="paused"]');
  var isCurrentlyPaused = pausedRadio && pausedRadio.checked;
  var nextStatus = isCurrentlyPaused ? 'active' : 'paused';
  var editIdEl = document.getElementById('fb-edit-id');
  var existing = editIdEl && _customForms.find(function(f) { return String(f.id) === String(editIdEl.value); });
  if (existing) return toggleCustomFormStatus(existing.id);

  if (activeRadio && pausedRadio) {
    activeRadio.checked = nextStatus === 'active';
    pausedRadio.checked = nextStatus === 'paused';
  }

  updateFormBuilderScheduleBadge(nextStatus);

  if (typeof showToast === 'function') {
    showToast(
      'Form status set to ' + (nextStatus === 'active' ? 'Active (accepting responses)' : 'Paused (closed to responses)'),
      nextStatus === 'active' ? 'success' : 'info'
    );
  }
}

/**
 * Resets Admin form builder inputs
 */
function clearFormBuilder() {
  if (typeof document === 'undefined') return;
  ['fb-name', 'fb-url', 'fb-edit-id'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.value = '';
  });
  if (typeof reClearValue === 'function') {
    reClearValue('fb-desc');
  }

  var defaultStatus = document.querySelector('input[name="fb-status-radio"][value="active"]');
  if (defaultStatus) defaultStatus.checked = true;
  var openAtInput = document.querySelector('.fb-open-at-input');
  if (openAtInput) openAtInput.value = '';
  var closeAtInput = document.querySelector('.fb-close-at-input');
  if (closeAtInput) closeAtInput.value = '';
  var pausedMsgInput = document.querySelector('.fb-paused-msg-input');
  if (pausedMsgInput) pausedMsgInput.value = '';

  updateFormBuilderScheduleBadge('active');

  var t = document.getElementById('fb-form-title');
  if (t)
    t.innerHTML =
      '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> <span>Add New Form</span>';

  _fbFields = [];
  renderFbFields();
  setFormType('link');
}

/**
 * Saves form definition (External link or Built-in) to Supabase
 */
async function saveForm() {
  if (typeof document === 'undefined') return;
  if (_isSavingCustomForm) return;
  _isSavingCustomForm = true;

  try {
    var rawName = (document.getElementById('fb-name') || {}).value || '';
    var name = typeof sanitizeText === 'function' ? sanitizeText(rawName, 120) : rawName.trim();
    var rawDesc = typeof reGetValue === 'function' ? reGetValue('fb-desc') : '';
    var desc = typeof sanitizeHtml === 'function' ? sanitizeHtml(rawDesc) : rawDesc.trim();
    var editId = (document.getElementById('fb-edit-id') || {}).value || '';
    var type = _currentFormType;

    if (!name) {
      if (typeof showToast === 'function') showToast('Please enter a form name.', 'warning');
      return;
    }
    if (name.length > 120) {
      if (typeof showToast === 'function')
        showToast('Form name cannot exceed 120 characters.', 'warning');
      return;
    }

    var statusRadio = document.querySelector('input[name="fb-status-radio"]:checked');
    var formStatus = statusRadio ? statusRadio.value : 'active';
    var openAtInput = document.querySelector('.fb-open-at-input');
    var openAt = openAtInput ? openAtInput.value.trim() : '';
    var closeAtInput = document.querySelector('.fb-close-at-input');
    var closeAt = closeAtInput ? closeAtInput.value.trim() : '';
    var pausedMsgInput = document.querySelector('.fb-paused-msg-input');
    var pausedMsg = pausedMsgInput ? (typeof sanitizeText === 'function' ? sanitizeText(pausedMsgInput.value, 500) : pausedMsgInput.value.trim()) : '';

    var formData = {
      id: editId || 'form_' + Date.now(),
      name: name,
      desc: desc,
      type: type,
      status: formStatus,
      active: formStatus === 'active',
      open_at: openAt,
      close_at: closeAt,
      paused_message: pausedMsg
    };

    if (type === 'link') {
      var rawUrl = ((document.getElementById('fb-url') || {}).value || '').trim();
      if (!rawUrl) {
        if (typeof showToast === 'function') showToast('Please enter a URL.', 'warning');
        return;
      }
      var checkedUrl = typeof safeUrl === 'function' ? safeUrl(rawUrl, '') : rawUrl;
      if (!checkedUrl || !/^https?:\/\//i.test(checkedUrl)) {
        if (typeof showToast === 'function')
          showToast('Please enter a valid HTTP or HTTPS URL.', 'warning');
        return;
      }
      formData.url = checkedUrl;
    } else if (type === 'builtin') {
      if (!_fbFields.length) {
        if (typeof showToast === 'function') showToast('Please add at least one field.', 'warning');
        return;
      }
      for (var fi = 0; fi < _fbFields.length; fi++) {
        if (!_fbFields[fi].label || !_fbFields[fi].label.trim()) {
          if (typeof showToast === 'function')
            showToast('All fields must have a label.', 'warning');
          return;
        }
      }
      formData.fields = JSON.parse(JSON.stringify(_fbFields));
    }

    var idx = _customForms.findIndex(function (f) {
      return f.id === formData.id;
    });
    if (!await saveFormDefinition(formData)) return;
    clearFormBuilder();
    renderAdminForms();
    renderFormsHub();

    if (typeof logAuditEvent === 'function') {
      logAuditEvent({
        action: idx >= 0 ? 'forms.update' : 'forms.create',
        targetType: 'form',
        targetId: formData.id,
        actorRole: 'officer_admin',
        details: { name: formData.name, type: formData.type }
      });
    }

    if (typeof showToast === 'function') showToast('Form saved successfully!', 'success');
  } finally {
    _isSavingCustomForm = false;
  }
}

/**
 * Populates form details into Admin builder for editing
 * @param {string} id
 */
function editForm(id) {
  openFormEditor(id);
}

/**
 * Deletes a form definition from Supabase
 * @param {string} id
 */
async function deleteForm(id) {
  var f = _customForms.find(function (x) {
    return x.id === id;
  });
  if (!f) return;

  var ok =
    typeof showConfirmModal === 'function'
      ? await showConfirmModal('Delete form "' + f.name + '"?', 'Delete Form')
      : true;
  if (!ok) return;

  if (!await saveCustomForms(_customForms.filter(function (x) {
    return x.id !== id;
  }))) return false;
  renderAdminForms();
  renderFormsHub();

  if (typeof logAuditEvent === 'function') {
    logAuditEvent({
      action: 'forms.delete',
      targetType: 'form',
      targetId: id,
      actorRole: 'officer_admin',
      details: { name: f.name }
    });
  }

  if (typeof showToast === 'function') showToast('Form deleted.', 'info');
  return true;
}

// ── Upgraded Forms List & Editor Routing (Images 1, 2, 3) ──────────────────

/**
 * Renders list of custom forms in the Admin Forms panel
 * Existing forms are displayed at the top, without edit/delete buttons on the right.
 * Entire card is clickable to open editor.
 */
function renderAdminForms() {
  loadCustomForms();
  if (typeof document === 'undefined') return;
  var container = document.getElementById('admin-forms-list');
  if (!container) return;

  var mainView = document.querySelector('.adm-forms-main-view');
  var subpanelBuilder = document.getElementById('subpanel-formbuilder');
  if (mainView && (!subpanelBuilder || subpanelBuilder.style.display !== 'block')) {
    mainView.style.display = 'block';
  }

  // Populate filter in responses tab (backwards compatibility)
  var filter = document.getElementById('form-responses-filter');
  if (filter) {
    var opts = '<option value="">All forms</option>';
    _customForms.forEach(function (f) {
      opts += '<option value="' + escapeHtml(f.id) + '">' + escapeHtml(f.name) + '</option>';
    });
    filter.innerHTML = opts;
  }

  if (!_customForms.length) {
    container.innerHTML =
      '<div style="color:var(--text-muted);text-align:center;padding:24px;font-size:13px;background:var(--bg-card);border:1px dashed var(--border-card);border-radius:12px;margin-bottom:12px;">No forms created yet. Click "+ Create New Form" below to get started.</div>';
    return;
  }

  var iconSvgs = {
    link: '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>',
    builtin: '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>'
  };
  var typeLabel = { link: 'External Link', builtin: 'Built-in Form' };
  var html = '';

  _customForms.forEach(function (f) {
    var isPaused = f.status === 'paused' || f.active === false;
    var statusBadge = '';
    if (isPaused) {
      statusBadge = '<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:12px;background:rgba(234,179,8,0.15);color:#eab308;border:1px solid rgba(234,179,8,0.3);margin-left:8px;vertical-align:middle;">PAUSED</span>';
    } else if (f.open_at || f.close_at) {
      statusBadge = '<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:12px;background:rgba(59,130,246,0.15);color:#3b82f6;border:1px solid rgba(59,130,246,0.3);margin-left:8px;vertical-align:middle;">SCHEDULED</span>';
    } else {
      statusBadge = '<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:12px;background:rgba(16,185,129,0.15);color:#10b981;border:1px solid rgba(16,185,129,0.3);margin-left:8px;vertical-align:middle;">ACTIVE</span>';
    }

    var scheduleInfo = '';
    if (f.open_at || f.close_at) {
      var parts = [];
      if (f.open_at) parts.push('Opens: ' + new Date(f.open_at).toLocaleDateString('en-MY', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }));
      if (f.close_at) parts.push('Closes: ' + new Date(f.close_at).toLocaleDateString('en-MY', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }));
      scheduleInfo = ' · <span style="color:var(--brand-blue);">' + escapeHtml(parts.join(' - ')) + '</span>';
    }

    var togglePauseBtn = '<button type="button" data-toggle-pause="' + escapeHtml(f.id) + '" title="' + (isPaused ? 'Resume form responses' : 'Pause form responses') + '" style="background:' + (isPaused ? 'rgba(16,185,129,0.15)' : 'rgba(234,179,8,0.15)') + ';border:1px solid ' + (isPaused ? 'rgba(16,185,129,0.3)' : 'rgba(234,179,8,0.3)') + ';color:' + (isPaused ? 'var(--green, #10b981)' : 'var(--brand-gold, #eab308)') + ';padding:6px 14px;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;display:inline-flex;align-items:center;gap:5px;">' +
      (isPaused
        ? '<svg class="ui-icon-xs" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg> Resume'
        : '<svg class="ui-icon-xs" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> Pause') +
      '</button>';

    html +=
      '<div class="adm-form-card" data-open-form-card="' + escapeHtml(f.id) + '" style="cursor:pointer;background:var(--bg-card);border-radius:12px;padding:14px 18px;margin-bottom:10px;border:1px solid var(--border-card);display:flex;align-items:center;gap:14px;flex-wrap:wrap;transition:all 0.15s ease;">' +
      '<div style="width:42px;height:42px;border-radius:10px;background:rgba(99,102,241,0.12);display:flex;align-items:center;justify-content:center;color:#818cf8;flex-shrink:0;">' +
      (iconSvgs[f.type] || iconSvgs.builtin) +
      '</div>' +
      '<div style="flex:1;min-width:180px;"><div style="font-family:var(--font-headline);font-size:15px;font-weight:600;color:var(--text-primary);display:flex;align-items:center;flex-wrap:wrap;">' +
      escapeHtml(f.name) +
      statusBadge +
      '</div>' +
      '<div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">' +
      (typeLabel[f.type] || '') +
      scheduleInfo +
      (f.desc ? ' · ' + escapeHtml(f.desc) : '') +
      '</div></div>' +
      '<div style="display:flex;align-items:center;gap:6px;">' +
      togglePauseBtn +
      '</div>' +
      '</div>';
  });

  container.innerHTML = html;
  container.querySelectorAll('[data-open-form-card]').forEach(function (card) {
    if (card && typeof card.addEventListener === 'function') {
      card.addEventListener('click', function () {
        openFormEditor(card.getAttribute('data-open-form-card'));
      });
    }
  });
  container.querySelectorAll('[data-toggle-pause]').forEach(function (btn) {
    if (btn && typeof btn.addEventListener === 'function') {
      btn.addEventListener('click', function (e) {
        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
        toggleCustomFormStatus(btn.getAttribute('data-toggle-pause'));
      });
    }
  });
}

/**
 * Displays Form Type Selector dialog before creating a form
 */
function openCreateFormFlow() {
  if (typeof document === 'undefined') return;
  var existing = document.getElementById('adm-ftype-modal');
  if (existing) existing.remove();

  var overlay = document.createElement('div');
  overlay.id = 'adm-ftype-modal';
  overlay.className = 'adm-ftype-modal-overlay';
  overlay.innerHTML =
    '<div class="adm-ftype-modal-card">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
    '<div style="font-family:var(--font-headline);font-size:18px;font-weight:700;color:var(--text-primary);">Create New Form</div>' +
    '<button type="button" class="btn-ftype-close" style="background:none;border:none;color:var(--text-secondary);font-size:24px;cursor:pointer;line-height:1;">&times;</button>' +
    '</div>' +
    '<div style="font-size:13px;color:var(--text-secondary);line-height:1.5;">Choose how you want to create and share this form with company members:</div>' +
    '<div class="adm-ftype-options">' +
    '<button type="button" class="adm-ftype-choice-btn" data-choice="link">' +
    '<div style="width:48px;height:48px;border-radius:12px;background:rgba(59,130,246,0.15);color:#3b82f6;display:flex;align-items:center;justify-content:center;margin-bottom:4px;">' +
    '<svg class="ui-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>' +
    '</div>' +
    '<div style="font-family:var(--font-headline);font-size:15px;font-weight:700;color:var(--text-primary);">External Link</div>' +
    '<div style="font-size:11px;color:var(--text-secondary);line-height:1.4;">Google Form or external URL for members to access</div>' +
    '</button>' +
    '<button type="button" class="adm-ftype-choice-btn" data-choice="builtin">' +
    '<div style="width:48px;height:48px;border-radius:12px;background:rgba(99,102,241,0.15);color:#818cf8;display:flex;align-items:center;justify-content:center;margin-bottom:4px;">' +
    '<svg class="ui-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>' +
    '</div>' +
    '<div style="font-family:var(--font-headline);font-size:15px;font-weight:700;color:var(--text-primary);">Built-in Form</div>' +
    '<div style="font-size:11px;color:var(--text-secondary);line-height:1.4;">Google Forms-style builder with questions, sections & signatures</div>' +
    '</button>' +
    '</div>' +
    '</div>';

  document.body.appendChild(overlay);
  overlay.querySelector('.btn-ftype-close').addEventListener('click', function() { overlay.remove(); });
  overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
  overlay.querySelectorAll('[data-choice]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var choice = btn.getAttribute('data-choice');
      overlay.remove();
      if (choice === 'link') {
        openExternalLinkFormEditor();
      } else {
        openBuiltinGoogleFormEditor();
      }
    });
  });
}

/**
 * Opens editor view for a given form ID
 * @param {string} formId
 */
function openFormEditor(formId) {
  loadCustomForms();
  var f = _customForms.find(function(x) { return String(x.id) === String(formId); });
  if (!f) return;
  if (f.type === 'link') {
    openExternalLinkFormEditor(f);
  } else {
    openBuiltinGoogleFormEditor(f);
  }
}

/**
 * Closes any active form editor and restores the main forms list
 */
function closeFormEditor() {
  if (typeof document === 'undefined') return;
  var mainView = document.querySelector('.adm-forms-main-view');
  var subpanelBuilder = document.getElementById('subpanel-formbuilder');
  var mount = document.querySelector('.adm-form-editor-mount');
  if (subpanelBuilder) subpanelBuilder.style.display = 'none';
  if (mainView) mainView.style.display = 'block';
  if (mount) mount.innerHTML = '';
  _gfCurrentForm = null;
  renderAdminForms();
}

/**
 * Opens External Link Form editor (Google Form / URL)
 * @param {Object} [form]
 */
function openExternalLinkFormEditor(form) {
  if (typeof document === 'undefined') return;
  var mainView = document.querySelector('.adm-forms-main-view');
  var subpanelBuilder = document.getElementById('subpanel-formbuilder');
  var mount = document.querySelector('.adm-form-editor-mount');
  if (mainView) mainView.style.display = 'none';
  if (subpanelBuilder) subpanelBuilder.style.display = 'block';
  if (!mount) return;

  var isEditing = !!form;
  var currentForm = form ? JSON.parse(JSON.stringify(form)) : {
    id: 'form_' + Date.now(),
    name: '',
    desc: '',
    type: 'link',
    url: '',
    status: 'active',
    active: true,
    open_at: '',
    close_at: '',
    paused_message: ''
  };

  var isPaused = currentForm.status === 'paused' || currentForm.active === false;

  mount.innerHTML =
    '<div style="max-width:760px;margin:0 auto;display:flex;flex-direction:column;gap:16px;">' +
    '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">' +
    '<button type="button" class="gf-back-btn" onclick="closeFormEditor()"><svg class="ui-icon-xs" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg> Back to Forms</button>' +
    '<div style="font-family:var(--font-headline);font-size:14px;font-weight:700;color:var(--text-secondary);">' + (isEditing ? 'Edit External Form' : 'New External Form') + '</div>' +
    '</div>' +
    '<div style="background:var(--bg-card);border:1px solid var(--border-card);border-radius:14px;padding:22px;box-shadow:var(--shadow-card);display:flex;flex-direction:column;gap:16px;">' +
    '<div style="font-family:var(--font-headline);font-size:18px;font-weight:700;color:var(--text-primary);display:flex;align-items:center;gap:10px;">' +
    '<div style="width:36px;height:36px;border-radius:8px;background:rgba(59,130,246,0.15);color:#3b82f6;display:flex;align-items:center;justify-content:center;">' +
    '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>' +
    '</div>' +
    '<span>' + (isEditing ? 'Edit: ' + escapeHtml(currentForm.name) : 'External Link (Google Form / URL)') + '</span>' +
    '</div>' +
    '<div class="form-group"><label class="form-label">Form Name <span style="color:var(--red);">*</span></label><input type="text" id="ext-form-name" class="form-input" placeholder="e.g. Annual Camp 2026 Registration" value="' + escapeHtml(currentForm.name) + '"/></div>' +
    '<div class="form-group"><label class="form-label">Form URL (Google Form, etc.) <span style="color:var(--red);">*</span></label><input type="url" id="ext-form-url" class="form-input" placeholder="https://forms.google.com/..." value="' + escapeHtml(currentForm.url || '') + '"/></div>' +
    '<div class="form-group"><label class="form-label">Description (Optional)</label><textarea id="ext-form-desc" class="form-textarea" rows="2" placeholder="Brief info about this form...">' + escapeHtml(currentForm.desc || '') + '</textarea></div>' +
    '<div style="background:var(--bg-card-subtle);border:1px solid var(--border-card);border-radius:10px;padding:16px;">' +
    '<div style="font-family:var(--font-headline);font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:12px;display:flex;align-items:center;gap:6px;">' +
    '<svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Response Availability & Auto-Schedule' +
    '</div>' +
    '<div style="display:flex;gap:14px;margin-bottom:12px;align-items:center;">' +
    '<label style="display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--text-primary);cursor:pointer;"><input type="radio" name="ext-status" value="active" ' + (!isPaused ? 'checked' : '') + ' style="accent-color:var(--accent);"/> Active (Accepting Responses)</label>' +
    '<label style="display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--text-primary);cursor:pointer;"><input type="radio" name="ext-status" value="paused" ' + (isPaused ? 'checked' : '') + ' style="accent-color:var(--accent);"/> Paused (Closed)</label>' +
    '</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:10px;">' +
    '<div><label class="form-label" style="font-size:11px;">Auto-Open At (Optional)</label><input type="datetime-local" id="ext-open-at" class="form-input" value="' + escapeHtml(currentForm.open_at || '') + '" style="font-size:12px;padding:8px 10px;"/></div>' +
    '<div><label class="form-label" style="font-size:11px;">Auto-Close At (Optional)</label><input type="datetime-local" id="ext-close-at" class="form-input" value="' + escapeHtml(currentForm.close_at || '') + '" style="font-size:12px;padding:8px 10px;"/></div>' +
    '</div>' +
    '<div><label class="form-label" style="font-size:11px;">Custom Paused / Closed Notice for Members</label><textarea id="ext-paused-msg" class="form-textarea" rows="2" placeholder="e.g. Responses for this form are currently paused. Please check back later." style="font-size:12px;padding:8px 10px;min-height:50px;">' + escapeHtml(currentForm.paused_message || '') + '</textarea></div>' +
    '</div>' +
    '<div style="display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-top:6px;">' +
    '<div style="display:flex;gap:8px;">' +
    '<button type="button" id="btn-save-ext-form" class="submit-btn gold btn-with-icon" style="padding:10px 22px;font-size:13px;"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg> Save Form</button>' +
    '<button type="button" class="portal-btn portal-btn-secondary" onclick="closeFormEditor()" style="padding:10px 18px;font-size:13px;">Cancel</button>' +
    '</div>' +
    (isEditing ? '<button type="button" id="btn-del-ext-form" class="submit-btn danger" style="padding:10px 16px;font-size:12px;width:auto;display:inline-flex;align-items:center;gap:6px;"><svg class="ui-icon-xs" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg> Delete Form</button>' : '') +
    '</div>' +
    '</div>' +
    '</div>';

  var saveBtn = document.getElementById('btn-save-ext-form');
  if (saveBtn) {
    saveBtn.addEventListener('click', async function() {
      var nameEl = document.getElementById('ext-form-name');
      var urlEl = document.getElementById('ext-form-url');
      var descEl = document.getElementById('ext-form-desc');
      var openEl = document.getElementById('ext-open-at');
      var closeEl = document.getElementById('ext-close-at');
      var pausedMsgEl = document.getElementById('ext-paused-msg');
      var statusRadio = document.querySelector('input[name="ext-status"]:checked');

      var name = nameEl ? nameEl.value.trim() : '';
      var url = urlEl ? urlEl.value.trim() : '';
      if (!name) {
        if (typeof showToast === 'function') showToast('Please enter a form name.', 'warning');
        return;
      }
      if (!url) {
        if (typeof showToast === 'function') showToast('Please enter a form URL.', 'warning');
        return;
      }
      var checkedUrl = typeof safeUrl === 'function' ? safeUrl(url, '') : url;
      if (!checkedUrl || !/^https?:\/\//i.test(checkedUrl)) {
        if (typeof showToast === 'function') showToast('Please enter a valid HTTP or HTTPS URL.', 'warning');
        return;
      }

      currentForm.name = name;
      currentForm.url = checkedUrl;
      currentForm.desc = descEl ? descEl.value.trim() : '';
      currentForm.status = statusRadio ? statusRadio.value : 'active';
      currentForm.active = currentForm.status === 'active';
      currentForm.open_at = openEl ? openEl.value.trim() : '';
      currentForm.close_at = closeEl ? closeEl.value.trim() : '';
      currentForm.paused_message = pausedMsgEl ? pausedMsgEl.value.trim() : '';

      if (!await saveFormDefinition(currentForm)) return;
      if (typeof showToast === 'function') showToast('External form saved!', 'success');
      closeFormEditor();
    });
  }

  var delBtn = document.getElementById('btn-del-ext-form');
  if (delBtn) {
    delBtn.addEventListener('click', async function() {
      await deleteForm(currentForm.id);
      closeFormEditor();
    });
  }
}

// ── Google Forms-Style Built-in Form Builder (Images 4 & 5) ────────────────

/**
 * Opens Google Forms-style form editor for a built-in form
 * @param {Object} [form]
 */
function openBuiltinGoogleFormEditor(form) {
  if (typeof document === 'undefined') return;
  var mainView = document.querySelector('.adm-forms-main-view');
  var subpanelBuilder = document.getElementById('subpanel-formbuilder');
  if (mainView) mainView.style.display = 'none';
  if (subpanelBuilder) subpanelBuilder.style.display = 'block';

  if (form) {
    _gfCurrentForm = JSON.parse(JSON.stringify(form));
    if (Array.isArray(_gfCurrentForm.items)) {
      _gfCurrentForm.items = _gfCurrentForm.items.filter(function(item) { return item && !isLegacyFormUpload(item); });
    }
    if (!_gfCurrentForm.items || !_gfCurrentForm.items.length) {
      if (_gfCurrentForm.fields && _gfCurrentForm.fields.length) {
        _gfCurrentForm.items = convertOldFieldsToGfItems(_gfCurrentForm.fields);
      } else {
        _gfCurrentForm.items = [
          {
            id: 'q_' + Date.now(),
            kind: 'question',
            title: 'Untitled Question',
            type: 'multiple_choice',
            required: false,
            options: ['Option 1']
          }
        ];
      }
    }
  } else {
    _gfCurrentForm = {
      id: 'form_' + Date.now(),
      name: 'Untitled form',
      desc: '',
      type: 'builtin',
      status: 'active',
      active: true,
      open_at: '',
      close_at: '',
      paused_message: '',
      items: [
        {
          id: 'q_' + Date.now(),
          kind: 'question',
          title: 'Untitled Question',
          type: 'multiple_choice',
          required: false,
          options: ['Option 1']
        }
      ]
    };
  }

  _gfActiveTab = 'questions';
  _gfActiveItemId = (_gfCurrentForm.items[0] || {}).id || null;
  _gfResponsesViewMode = 'table';
  _gfIndividualIndex = 0;
  _gfResponsesList = [];

  renderGfEditor();
}

/**
 * Renders the top bar and active tab for Google Forms Builder
 */
function renderGfEditor() {
  if (typeof document === 'undefined') return;
  var mount = document.querySelector('.adm-form-editor-mount');
  if (!mount || !_gfCurrentForm) return;

  var isResponsesTable = (_gfActiveTab === 'responses' && _gfResponsesViewMode === 'table');
  var topbarWideClass = isResponsesTable ? ' gf-topbar-wide' : '';
  var containerWideClass = isResponsesTable ? ' gf-builder-container-wide' : '';

  var topbarHtml =
    '<div class="gf-editor-topbar' + topbarWideClass + '">' +
    '<div class="gf-topbar-left">' +
    '<button type="button" class="gf-back-btn" onclick="closeFormEditor()">' +
    '<svg class="ui-icon-xs" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg> Back to Forms' +
    '</button>' +
    '</div>' +
    '<div class="gf-topbar-center">' +
    '<div class="gf-top-tabs">' +
    '<button type="button" class="gf-tab-btn ' + (_gfActiveTab === 'questions' ? 'is-active' : '') + '" onclick="switchGfTab(\'questions\')">Questions</button>' +
    '<button type="button" class="gf-tab-btn ' + (_gfActiveTab === 'responses' ? 'is-active' : '') + '" onclick="switchGfTab(\'responses\')">Responses' + (_gfResponsesList.length ? ' (' + _gfResponsesList.length + ')' : '') + '</button>' +
    '<button type="button" class="gf-tab-btn ' + (_gfActiveTab === 'settings' ? 'is-active' : '') + '" onclick="switchGfTab(\'settings\')">Settings</button>' +
    '</div>' +
    '</div>' +
    '<div class="gf-topbar-right">' +
    '<button type="button" class="portal-btn portal-btn-secondary btn-with-icon gf-btn-preview" onclick="previewGfForm()">' +
    '<svg class="ui-icon-xs" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> Preview' +
    '</button>' +
    '<button type="button" class="submit-btn gold btn-with-icon gf-btn-save" onclick="saveGfCurrentForm()">' +
    '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg> Save Form' +
    '</button>' +
    '</div>' +
    '</div>';

  var bodyHtml = '<div class="gf-builder-container' + containerWideClass + '" id="gf-tab-container"></div>';
  mount.innerHTML = topbarHtml + bodyHtml;

  if (_gfActiveTab === 'questions') {
    renderGfQuestionsTab();
  } else if (_gfActiveTab === 'responses') {
    renderGfResponsesTab();
  } else if (_gfActiveTab === 'settings') {
    renderGfSettingsTab();
  }
}

/**
 * Switches between Questions, Responses, and Settings tabs
 * @param {string} tab
 */
function switchGfTab(tab) {
  _gfActiveTab = tab;
  renderGfEditor();
}

/**
 * Persists the current Google Forms form state into _customForms and Supabase
 */
async function saveGfCurrentForm() {
  if (!_gfCurrentForm) return;

  var titleEl = document.querySelector('.gf-title-input');
  var descEl = document.querySelector('.gf-desc-input');
  if (titleEl) _gfCurrentForm.name = titleEl.value.trim() || 'Untitled form';
  if (descEl) _gfCurrentForm.desc = descEl.value.trim() || '';

  _gfCurrentForm.items = (_gfCurrentForm.items || []).filter(function(item) { return item && !isLegacyFormUpload(item); });
  _gfCurrentForm.fields = convertGfItemsToFields(_gfCurrentForm.items);
  if (!await saveFormDefinition(_gfCurrentForm)) return false;
  renderFormsHub();

  if (typeof showToast === 'function') {
    showToast('Form "' + _gfCurrentForm.name + '" saved successfully!', 'success');
  }
  return true;
}

function saveFormDefinition(form) {
  var availability = isFormAcceptingResponses(Object.assign({}, form, { status: 'active', active: true }));
  if (availability.reason === 'invalid_schedule') {
    if (typeof showToast === 'function') showToast('Enter an opening time before the closing time.', 'warning');
    return false;
  }
  var labels = new Set();
  var fields = form.items && form.items.length ? form.items : (form.fields || []);
  if (fields.filter(isFormQuestion).some(function(field) {
    var label = String(field.label || field.title || '').trim().toLowerCase();
    if (!label || labels.has(label)) return true;
    labels.add(label);
    return false;
  })) {
    if (typeof showToast === 'function') showToast('Use a different, nonempty label for each question.', 'warning');
    return false;
  }
  var next = _customForms.slice();
  var index = next.findIndex(function(item) { return String(item.id) === String(form.id); });
  if (index < 0) next.push(form);
  else next[index] = form;
  return saveCustomForms(next);
}

/**
 * Opens form in interactive Preview Mode for admins to inspect and test navigation
 * Does NOT allow submitting, does NOT save test input values, and discards all changes on exit.
 */
function previewGfForm() {
  if (typeof document === 'undefined' || !_gfCurrentForm) return;

  // Sync title and description inputs if modified in DOM
  var titleEl = document.querySelector('.gf-title-input');
  var descEl = document.querySelector('.gf-desc-input');
  if (titleEl) _gfCurrentForm.name = titleEl.value.trim() || 'Untitled form';
  if (descEl) _gfCurrentForm.desc = descEl.value.trim() || '';

  closeGfPreview();

  var overlay = document.createElement('div');
  overlay.className = 'gf-preview-overlay';
  overlay.id = 'gf-preview-overlay';

  overlay.innerHTML =
    '<div class="gf-preview-topbar">' +
    '<div style="display:flex;align-items:center;gap:10px;">' +
    '<span style="font-weight:700;font-size:16px;color:var(--text-primary);display:inline-flex;align-items:center;gap:8px;">' +
    '<svg class="ui-icon-xs" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> Form Preview' +
    '</span>' +
    '<span style="background:rgba(245,158,11,0.18);color:#f59e0b;border:1px solid rgba(245,158,11,0.35);padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700;letter-spacing:0.5px;">PREVIEW MODE</span>' +
    '</div>' +
    '<button type="button" class="portal-btn portal-btn-secondary" onclick="closeGfPreview()" style="padding:8px 16px;font-size:13px;font-weight:600;display:inline-flex;align-items:center;gap:6px;cursor:pointer;">' +
    '<svg class="ui-icon-xs" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg> Back to Editor' +
    '</button>' +
    '</div>' +
    '<div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);border-radius:10px;padding:12px 18px;margin:0 auto 20px;max-width:740px;width:100%;box-sizing:border-box;display:flex;align-items:center;gap:10px;font-size:13px;color:#fcd34d;">' +
    '<svg class="ui-icon-xs" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12.01" y2="8"/><line x1="12" y1="12" x2="12" y2="16"/></svg>' +
    'This is how respondents will see your form. You can navigate sections and test inputs, but form submissions are disabled and preview inputs are not saved.' +
    '</div>' +
    '<div class="gf-preview-mount-wrap" id="gf-preview-mount"></div>';

  document.body.appendChild(overlay);

  var mountEl = document.getElementById('gf-preview-mount');
  if (mountEl) {
    // Clone form to guarantee zero mutation of editor state
    var formClone = JSON.parse(JSON.stringify(_gfCurrentForm));
    renderBuiltinFormInline(formClone, mountEl, { isPreview: true });
  }
}

/**
 * Dismisses Form Preview overlay and discards all preview inputs
 */
function closeGfPreview() {
  if (typeof document === 'undefined') return;
  var existing = document.getElementById('gf-preview-overlay');
  if (existing) {
    if (typeof existing.remove === 'function') {
      existing.remove();
    } else if (existing.parentNode && typeof existing.parentNode.removeChild === 'function') {
      existing.parentNode.removeChild(existing);
    }
  }
}

/**
 * Appends a new question to the Google Forms builder
 * @param {string} [afterId]
 */
function addGfQuestion(afterId) {
  if (!_gfCurrentForm || !_gfCurrentForm.items) return;
  var newItem = {
    id: 'q_' + Date.now(),
    kind: 'question',
    title: 'Untitled Question',
    type: 'multiple_choice',
    required: false,
    options: ['Option 1']
  };

  if (afterId) {
    var idx = _gfCurrentForm.items.findIndex(function(x) { return x.id === afterId; });
    if (idx >= 0) _gfCurrentForm.items.splice(idx + 1, 0, newItem);
    else _gfCurrentForm.items.push(newItem);
  } else {
    _gfCurrentForm.items.push(newItem);
  }

  _gfActiveItemId = newItem.id;
  renderGfEditor();
}

/**
 * Duplicates a question item
 * @param {string} itemId
 */
function duplicateGfItem(itemId) {
  if (!_gfCurrentForm || !_gfCurrentForm.items) return;
  var idx = _gfCurrentForm.items.findIndex(function(x) { return x.id === itemId; });
  if (idx < 0) return;
  var clone = JSON.parse(JSON.stringify(_gfCurrentForm.items[idx]));
  clone.id = 'q_' + Date.now();
  _gfCurrentForm.items.splice(idx + 1, 0, clone);
  _gfActiveItemId = clone.id;
  renderGfEditor();
}

/**
 * Deletes an item from the form
 * @param {string} itemId
 */
function deleteGfItem(itemId) {
  if (!_gfCurrentForm || !_gfCurrentForm.items) return;
  _gfCurrentForm.items = _gfCurrentForm.items.filter(function(x) { return x.id !== itemId; });
  if (_gfCurrentForm.items.length === 0) {
    addGfQuestion();
    return;
  }
  if (_gfActiveItemId === itemId) {
    _gfActiveItemId = _gfCurrentForm.items[0].id;
  }
  renderGfEditor();
}

/**
 * Appends a Title & Description block
 * @param {string} [afterId]
 */
function addGfTitleDesc(afterId) {
  if (!_gfCurrentForm || !_gfCurrentForm.items) return;
  var newItem = {
    id: 'td_' + Date.now(),
    kind: 'title_desc',
    title: 'Title',
    desc: 'Description (optional)'
  };
  if (afterId) {
    var idx = _gfCurrentForm.items.findIndex(function(x) { return x.id === afterId; });
    if (idx >= 0) _gfCurrentForm.items.splice(idx + 1, 0, newItem);
    else _gfCurrentForm.items.push(newItem);
  } else {
    _gfCurrentForm.items.push(newItem);
  }
  _gfActiveItemId = newItem.id;
  renderGfEditor();
}

/**
 * Appends an Image block
 * @param {string} [afterId]
 */
function addGfImage(afterId) {
  if (!_gfCurrentForm || !_gfCurrentForm.items) return;
  var newItem = {
    id: 'img_' + Date.now().toString(36),
    kind: 'image',
    title: '',
    url: ''
  };
  if (afterId) {
    var idx = _gfCurrentForm.items.findIndex(function(x) { return x.id === afterId; });
    if (idx >= 0) _gfCurrentForm.items.splice(idx + 1, 0, newItem);
    else _gfCurrentForm.items.push(newItem);
  } else {
    _gfCurrentForm.items.push(newItem);
  }
  _gfActiveItemId = newItem.id;
  renderGfEditor();
}

/**
 * Appends a Section break card
 * @param {string} [afterId]
 */
function addGfSection(afterId) {
  if (!_gfCurrentForm || !_gfCurrentForm.items) return;
  var newItem = {
    id: 'sec_' + Date.now(),
    kind: 'section',
    title: 'Untitled Section',
    desc: ''
  };
  if (afterId) {
    var idx = _gfCurrentForm.items.findIndex(function(x) { return x.id === afterId; });
    if (idx >= 0) _gfCurrentForm.items.splice(idx + 1, 0, newItem);
    else _gfCurrentForm.items.push(newItem);
  } else {
    _gfCurrentForm.items.push(newItem);
  }
  _gfActiveItemId = newItem.id;
  renderGfEditor();
}

/**
 * Aligns floating side toolbar to currently active card
 */
function updateGfToolbarPosition() {
  if (typeof document === 'undefined') return;
  var toolbar = document.getElementById('gf-side-toolbar');
  if (!toolbar) return;
  var layout = document.querySelector('.gf-cards-layout');
  if (!layout) return;

  var activeCard = null;
  if (_gfActiveItemId) {
    activeCard = layout.querySelector('[data-item-id="' + _gfActiveItemId + '"]');
  }
  if (!activeCard) {
    var allCards = layout.querySelectorAll('.gf-question-card, .gf-section-card, .gf-title-desc-card, .gf-image-card');
    if (allCards.length > 0) activeCard = allCards[allCards.length - 1];
    else activeCard = layout.querySelector('.gf-form-header-card');
  }

  if (activeCard) {
    var lRect = layout.getBoundingClientRect();
    var aRect = activeCard.getBoundingClientRect();
    var topOffset = aRect.top - lRect.top;
    if (topOffset < 0) topOffset = 0;
    toolbar.style.top = topOffset + 'px';
  }
}

/**
 * Renders the Questions tab of the Google Forms Builder
 */
function renderGfQuestionsTab() {
  var container = document.getElementById('gf-tab-container');
  if (!container || !_gfCurrentForm) return;

  var items = _gfCurrentForm.items || [];
  var totalSections = items.filter(function(x) { return x.kind === 'section'; }).length + 1;
  var currentSectionNum = 1;

  var headerCardHtml =
    '<div class="gf-form-header-card gf-card-item" data-item-id="header">' +
    '<div class="gf-form-header-stripe"></div>' +
    '<div class="gf-form-header-body">' +
    '<input type="text" class="gf-title-input" placeholder="Untitled form" value="' + escapeHtml(_gfCurrentForm.name || '') + '"/>' +
    '<textarea class="gf-desc-input" rows="1" placeholder="Form description">' + escapeHtml(_gfCurrentForm.desc || '') + '</textarea>' +
    '<div style="font-size:12px;color:var(--text-secondary);display:flex;align-items:center;gap:8px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.22);border-radius:8px;padding:10px 14px;margin-top:2px;">' +
    '<svg class="ui-icon-xs" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>' +
    'This form automatically collects respondent information upon submission.' +
    '</div>' +
    '</div>' +
    '</div>';

  var questionsListHtml = '<div class="gf-questions-list">';

  items.forEach(function(it) {
    var isActive = it.id === _gfActiveItemId;

    if (it.kind === 'section') {
      currentSectionNum++;
      questionsListHtml +=
        '<div class="gf-section-card gf-card-item ' + (isActive ? 'is-active' : '') + '" data-item-id="' + escapeHtml(it.id) + '">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;">' +
        '<span style="font-size:11px;font-weight:700;color:#10b981;text-transform:uppercase;letter-spacing:0.5px;">Section ' + currentSectionNum + ' of ' + totalSections + '</span>' +
        '<button type="button" class="gf-icon-btn" data-act="del" title="Delete section"><svg class="ui-icon-xs" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>' +
        '</div>' +
        '<input type="text" class="gf-q-title-input" placeholder="Section Title" value="' + escapeHtml(it.title || '') + '" data-bind="title" style="font-size:16px;font-weight:700;"/>' +
        '<input type="text" class="form-input" placeholder="Description (optional)" value="' + escapeHtml(it.desc || '') + '" data-bind="desc" style="font-size:13px;"/>' +
        '</div>';
      return;
    }

    if (it.kind === 'title_desc') {
      questionsListHtml +=
        '<div class="gf-title-desc-card gf-card-item ' + (isActive ? 'is-active' : '') + '" data-item-id="' + escapeHtml(it.id) + '">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;">' +
        '<span style="font-size:11px;font-weight:700;color:#f59e0b;text-transform:uppercase;letter-spacing:0.5px;">Title & Description</span>' +
        '<button type="button" class="gf-icon-btn" data-act="del" title="Delete block"><svg class="ui-icon-xs" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>' +
        '</div>' +
        '<input type="text" class="gf-q-title-input" placeholder="Untitled Title" value="' + escapeHtml(it.title || '') + '" data-bind="title" style="font-size:15px;font-weight:700;"/>' +
        '<input type="text" class="form-input" placeholder="Description" value="' + escapeHtml(it.desc || '') + '" data-bind="desc" style="font-size:13px;"/>' +
        '</div>';
      return;
    }

    if (it.kind === 'image') {
      questionsListHtml +=
        '<div class="gf-image-card gf-card-item ' + (isActive ? 'is-active' : '') + '" data-item-id="' + escapeHtml(it.id) + '">' +
        '<div class="gf-drag-handle">' +
        '<svg class="ui-icon-xs" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>' +
        '</div>' +
        '<div style="display:flex;justify-content:space-between;align-items:center;">' +
        '<span style="font-size:11px;font-weight:700;color:#f59e0b;text-transform:uppercase;letter-spacing:0.5px;display:inline-flex;align-items:center;gap:6px;">' +
        '<svg class="ui-icon-xs" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg> Image' +
        '</span>' +
        '<div style="display:flex;align-items:center;gap:6px;">' +
        '<button type="button" class="gf-icon-btn" data-act="dup" title="Duplicate"><svg class="ui-icon-xs" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>' +
        '<button type="button" class="gf-icon-btn" data-act="del" title="Delete block"><svg class="ui-icon-xs" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>' +
        '</div>' +
        '</div>' +
        '<input type="text" class="gf-q-title-input" placeholder="Image Title (optional)" value="' + escapeHtml(it.title || '') + '" data-bind="title"/>' +
        '<div class="gf-image-content-box">' +
        (it.url ? '<div style="margin-bottom:12px;text-align:center;"><img src="' + escapeHtml(it.url) + '" alt="' + escapeHtml(it.title || 'Image Preview') + '" style="max-height:220px;max-width:100%;border-radius:8px;border:1px solid var(--border-card);object-fit:contain;box-shadow:0 2px 8px rgba(0,0,0,0.2);"/></div>' : '') +
        '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">' +
        '<input type="text" class="form-input" placeholder="Image URL (https://...) or upload below" value="' + escapeHtml(it.url || '') + '" data-bind="url" style="flex:1;min-width:180px;font-size:13px;"/>' +
        '<label class="portal-btn portal-btn-secondary" style="margin:0;cursor:pointer;padding:8px 14px;font-size:12px;display:inline-flex;align-items:center;gap:6px;">' +
        '<svg class="ui-icon-xs" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg> Upload Image' +
        '<input type="file" accept="image/*" class="gf-image-file-input" style="display:none;"/>' +
        '</label>' +
        (it.url ? '<button type="button" class="portal-btn portal-btn-secondary" data-act="clear-img" style="padding:8px 12px;font-size:12px;color:var(--red);">Clear</button>' : '') +
        '</div>' +
        '</div>' +
        '</div>';
      return;
    }

    // Question Card
    var bodyHtml = '';
    var qType = it.type || 'multiple_choice';

    if (qType === 'multiple_choice' || qType === 'checkboxes' || qType === 'dropdown') {
      var bullet = qType === 'multiple_choice' ? '○' : (qType === 'checkboxes' ? '□' : '▾');
      var options = Array.isArray(it.options) && it.options.length ? it.options : ['Option 1'];
      var hasOther = options.some(isOtherOption);
      bodyHtml += '<div class="gf-options-list">';
      options.forEach(function(opt, optIdx) {
        var isOther = isOtherOption(opt);
        if (isOther && qType !== 'dropdown') {
          bodyHtml +=
            '<div class="gf-option-row gf-option-row-other" style="display:flex;align-items:center;gap:8px;">' +
            '<span class="gf-opt-bullet">' + bullet + '</span>' +
            '<span style="font-size:13px;color:var(--text-secondary);flex:1;padding:6px 0;">Other... <span style="font-size:11px;color:var(--text-muted);font-style:italic;">(respondents can type a short answer)</span></span>' +
            '<button type="button" class="gf-opt-del-btn" data-del-opt="' + optIdx + '" title="Remove Other option">&times;</button>' +
            '</div>';
        } else {
          bodyHtml +=
            '<div class="gf-option-row">' +
            '<span class="gf-opt-bullet">' + bullet + '</span>' +
            '<input type="text" class="gf-opt-input" value="' + escapeHtml(opt) + '" data-opt-idx="' + optIdx + '"/>' +
            (options.length > 1 ? '<button type="button" class="gf-opt-del-btn" data-del-opt="' + optIdx + '" title="Remove option">&times;</button>' : '') +
            '</div>';
        }
      });
      bodyHtml +=
        '<div class="gf-add-opt-row">' +
        '<span class="gf-opt-bullet" style="opacity:0.5;">' + bullet + '</span>' +
        '<button type="button" class="gf-add-opt-link" data-act="add-opt">+ Add option</button>' +
        (qType !== 'dropdown' && !hasOther ? ' <span style="font-size:12px;color:var(--text-muted);">or</span> <button type="button" class="gf-add-opt-link" data-act="add-other">add "Other"</button>' : '') +
        '</div>' +
        '</div>';
    } else if (qType === 'short_answer' || qType === 'text') {
      bodyHtml = '<div style="border-bottom:1px solid var(--border-card);color:var(--text-muted);font-size:13px;padding:8px 0;width:50%;">Short answer text</div>';
    } else if (qType === 'paragraph' || qType === 'textarea') {
      bodyHtml = '<div style="border-bottom:1px solid var(--border-card);color:var(--text-muted);font-size:13px;padding:12px 0;width:75%;">Long answer text</div>';
    } else if (qType === 'date') {
      bodyHtml = '<div style="color:var(--text-muted);font-size:13px;display:inline-flex;align-items:center;gap:8px;border-bottom:1px solid var(--border-card);padding:8px 0;"><svg class="ui-icon-xs" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> Month, day, year</div>';
    } else if (qType === 'time') {
      bodyHtml = '<div style="color:var(--text-muted);font-size:13px;display:inline-flex;align-items:center;gap:8px;border-bottom:1px solid var(--border-card);padding:8px 0;"><svg class="ui-icon-xs" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Time (hh:mm)</div>';
    } else if (qType === 'signature') {
      bodyHtml =
        '<div class="gf-signature-mockup">' +
        '<div style="width:36px;height:36px;border-radius:50%;background:rgba(245,158,11,0.12);color:#f59e0b;display:flex;align-items:center;justify-content:center;">' +
        '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/></svg>' +
        '</div>' +
        '<div style="font-weight:700;color:var(--text-primary);font-size:14px;">Signature Canvas</div>' +
        '<div style="font-size:12px;color:var(--text-secondary);max-width:380px;">Respondents will draw and sign digitally with mouse, stylus, or touch.</div>' +
        '</div>';
    }

    questionsListHtml +=
      '<div class="gf-question-card gf-card-item ' + (isActive ? 'is-active' : '') + '" data-item-id="' + escapeHtml(it.id) + '">' +
      '<div class="gf-drag-handle">' +
      '<svg width="20" height="12" viewBox="0 0 20 12" fill="currentColor"><circle cx="7" cy="3" r="1.5"/><circle cx="13" cy="3" r="1.5"/><circle cx="7" cy="9" r="1.5"/><circle cx="13" cy="9" r="1.5"/></svg>' +
      '</div>' +
      '<div class="gf-question-toprow">' +
      '<input type="text" class="gf-q-title-input" placeholder="Question" value="' + escapeHtml(it.title || '') + '" data-bind="title"/>' +
      '<select class="gf-type-selector" data-bind="type">' +
      '<option value="short_answer" ' + (qType === 'short_answer' || qType === 'text' ? 'selected' : '') + '>Short answer</option>' +
      '<option value="paragraph" ' + (qType === 'paragraph' || qType === 'textarea' ? 'selected' : '') + '>Paragraph</option>' +
      '<option value="multiple_choice" ' + (qType === 'multiple_choice' ? 'selected' : '') + '>Multiple choice</option>' +
      '<option value="checkboxes" ' + (qType === 'checkboxes' ? 'selected' : '') + '>Checkboxes</option>' +
      '<option value="dropdown" ' + (qType === 'dropdown' || qType === 'select' ? 'selected' : '') + '>Dropdown</option>' +
      '<option value="date" ' + (qType === 'date' ? 'selected' : '') + '>Date</option>' +
      '<option value="time" ' + (qType === 'time' ? 'selected' : '') + '>Time</option>' +
      '<option value="signature" ' + (qType === 'signature' ? 'selected' : '') + '>Signature</option>' +
      '</select>' +
      '</div>' +
      bodyHtml +
      '<div class="gf-card-footer">' +
      '<button type="button" class="gf-icon-btn" data-act="dup" title="Duplicate"><svg class="ui-icon-xs" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>' +
      '<button type="button" class="gf-icon-btn" data-act="del" title="Delete"><svg class="ui-icon-xs" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>' +
      '<div class="gf-v-divider"></div>' +
      '<div style="display:flex;align-items:center;gap:8px;">' +
      '<span style="font-size:12px;color:var(--text-secondary);font-weight:600;">Required</span>' +
      '<label class="gf-toggle-switch">' +
      '<input type="checkbox" data-bind="required" ' + (it.required ? 'checked' : '') + '/>' +
      '<span class="gf-toggle-slider"></span>' +
      '</label>' +
      '</div>' +
      '</div>' +
      '</div>';
  });

  questionsListHtml += '</div>';

  var sideToolbarHtml =
    '<div class="gf-side-toolbar" id="gf-side-toolbar">' +
    '<button type="button" class="gf-side-tool-btn" data-tool="add-q" title="Add question"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg></button>' +
    '<button type="button" class="gf-side-tool-btn" data-tool="add-td" title="Add title & description"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg></button>' +
    '<button type="button" class="gf-side-tool-btn" data-tool="add-img" title="Add image"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></button>' +
    '<button type="button" class="gf-side-tool-btn" data-tool="add-sec" title="Add section"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="7" rx="1"/><rect x="3" y="14" width="18" height="7" rx="1"/></svg></button>' +
    '</div>';

  container.innerHTML =
    '<div class="gf-cards-layout">' +
    '<div class="gf-cards-column">' +
    headerCardHtml +
    questionsListHtml +
    '</div>' +
    sideToolbarHtml +
    '</div>';

  // Wire header inputs
  var titleInput = container.querySelector('.gf-title-input');
  var descInput = container.querySelector('.gf-desc-input');
  if (titleInput) {
    titleInput.addEventListener('input', function() { _gfCurrentForm.name = titleInput.value; });
  }
  if (descInput) {
    descInput.addEventListener('input', function() { _gfCurrentForm.desc = descInput.value; });
  }

  // Wire toolbar buttons
  container.querySelectorAll('[data-tool]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var tool = btn.getAttribute('data-tool');
      if (tool === 'add-q') addGfQuestion(_gfActiveItemId);
      if (tool === 'add-td') addGfTitleDesc(_gfActiveItemId);
      if (tool === 'add-img') addGfImage(_gfActiveItemId);
      if (tool === 'add-sec') addGfSection(_gfActiveItemId);
    });
  });

  // Wire card events
  container.querySelectorAll('[data-item-id]').forEach(function(card) {
    var itemId = card.getAttribute('data-item-id');
    var it = _gfCurrentForm.items.find(function(x) { return x.id === itemId; });
    if (!it) return;

    card.addEventListener('click', function(e) {
      if (_gfActiveItemId !== itemId && !e.target.closest('button')) {
        _gfActiveItemId = itemId;
        container.querySelectorAll('.gf-card-item').forEach(function(c) {
          if (c.getAttribute('data-item-id') === itemId) c.classList.add('is-active');
          else c.classList.remove('is-active');
        });
        updateGfToolbarPosition();
      }
    });

    var titleInp = card.querySelector('[data-bind="title"]');
    if (titleInp) {
      titleInp.addEventListener('input', function() { it.title = titleInp.value; });
    }

    var descInp = card.querySelector('[data-bind="desc"]');
    if (descInp) {
      descInp.addEventListener('input', function() { it.desc = descInp.value; });
    }

    var urlInp = card.querySelector('[data-bind="url"]');
    if (urlInp) {
      urlInp.addEventListener('input', function() { it.url = urlInp.value.trim(); });
    }

    var imgFileInp = card.querySelector('.gf-image-file-input');
    if (imgFileInp) {
      imgFileInp.addEventListener('change', function(e) {
        var file = e.target.files && e.target.files[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
          if (typeof showToast === 'function') showToast('Image file exceeds 5MB limit.', 'error');
          return;
        }
        var reader = new FileReader();
        reader.onload = function(evt) {
          it.url = evt.target.result;
          renderGfEditor();
        };
        reader.readAsDataURL(file);
      });
    }

    var clearImgBtn = card.querySelector('[data-act="clear-img"]');
    if (clearImgBtn) {
      clearImgBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        it.url = '';
        renderGfEditor();
      });
    }

    var typeSel = card.querySelector('[data-bind="type"]');
    if (typeSel) {
      typeSel.addEventListener('change', function() {
        it.type = typeSel.value;
        if (['multiple_choice', 'checkboxes', 'dropdown'].indexOf(it.type) !== -1 && (!it.options || !it.options.length)) {
          it.options = ['Option 1'];
        }
        renderGfEditor();
      });
    }

    var reqCb = card.querySelector('[data-bind="required"]');
    if (reqCb) {
      reqCb.addEventListener('change', function() { it.required = reqCb.checked; });
    }

    // Option editing
    card.querySelectorAll('[data-opt-idx]').forEach(function(optInp) {
      optInp.addEventListener('input', function() {
        var idx = parseInt(optInp.getAttribute('data-opt-idx'), 10);
        if (Array.isArray(it.options) && it.options[idx] !== undefined) {
          it.options[idx] = optInp.value;
        }
      });
    });

    card.querySelectorAll('[data-del-opt]').forEach(function(delOptBtn) {
      delOptBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        var idx = parseInt(delOptBtn.getAttribute('data-del-opt'), 10);
        if (Array.isArray(it.options)) {
          it.options.splice(idx, 1);
          renderGfEditor();
        }
      });
    });

    var addOptBtn = card.querySelector('[data-act="add-opt"]');
    if (addOptBtn) {
      addOptBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        if (!Array.isArray(it.options)) it.options = [];
        it.options.push('Option ' + (it.options.length + 1));
        renderGfEditor();
      });
    }

    var addOtherBtn = card.querySelector('[data-act="add-other"]');
    if (addOtherBtn) {
      addOtherBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        if (!Array.isArray(it.options)) it.options = [];
        if (!it.options.some(isOtherOption)) {
          it.options.push('Other...');
        }
        renderGfEditor();
      });
    }

    var dupBtn = card.querySelector('[data-act="dup"]');
    if (dupBtn) {
      dupBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        duplicateGfItem(itemId);
      });
    }

    var delBtn = card.querySelector('[data-act="del"]');
    if (delBtn) {
      delBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        deleteGfItem(itemId);
      });
    }
  });

  updateGfToolbarPosition();
  setTimeout(updateGfToolbarPosition, 50);
}

// ── Google Forms Responses Tab (Table View & Individual View) ──────────────

/**
 * Loads submissions from bb_orders for the current form
 * @returns {Promise<Array>}
 */
async function loadGfResponses() {
  if (typeof window !== 'undefined' && Array.isArray(window._mockGfResponses)) {
    return window._mockGfResponses;
  }
  var client = getSupa();
  if (!client || !client.get || !_gfCurrentForm) return [];
  try {
    var orders = await client.get('bb_orders?select=order_number,created_at,member_name,ic,rank,squad,items,notes&order=created_at.desc');
    var formId = String(_gfCurrentForm.id);
    var formName = String(_gfCurrentForm.name || '');

    return orders.filter(function (o) {
      try {
        var items = readFormResponseItems(o);
        var responseId = items.form_id || o.notes;
        return responseId ? String(responseId) === formId : items.form_name === formName;
      } catch (e) {
        return false;
      }
    });
  } catch (err) {
    return [];
  }
}

function readFormResponseItems(row) {
  try {
    var items = typeof row.items === 'string' ? JSON.parse(row.items) : row.items;
    return items && typeof items === 'object' && !Array.isArray(items) ? items : {};
  } catch (_) {
    return {};
  }
}

function quoteResponseCsvCell(value) {
  var text = String(value ?? '');
  if (/^[\s\uFEFF]*[=+@-]|^[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

/**
 * Exports responses to CSV format
 * @param {Object} form
 * @param {Array} responses
 */
function downloadFormResponsesCsv(form, responses) {
  if (!responses || !responses.length) {
    if (typeof showToast === 'function') showToast('No responses to export.', 'info');
    return;
  }
  var headers = ['Order Number', 'Date', 'Respondent Name', 'Rank', 'Platoon'];
  var questions = [];
  var items = form.items && form.items.length ? form.items : (form.fields || []);
  items.forEach(function(it) {
    if (isFormQuestion(it)) {
      var qName = it.title || it.label || 'Question';
      questions.push(qName);
      headers.push(quoteResponseCsvCell(qName));
    }
  });

  var rows = [headers.join(',')];
  responses.forEach(function(r) {
    var itemsObj = readFormResponseItems(r);
    var answers = itemsObj.answers || {};
    var row = [
      r.order_number, r.created_at, r.member_name || r.ic, r.rank, r.squad
    ].map(quoteResponseCsvCell);
    questions.forEach(function(q) {
      var ans = answers[q] ?? '';
      if (isFormSignature(ans)) ans = '[Digital Signature Captured]';
      row.push(quoteResponseCsvCell(ans));
    });
    rows.push(row.join(','));
  });

  var csvContent = 'data:text/csv;charset=utf-8,' + encodeURIComponent(rows.join('\n'));
  var link = document.createElement('a');
  link.setAttribute('href', csvContent);
  link.setAttribute('download', (form.name || 'form_responses').replace(/[^a-zA-Z0-9_-]/g, '_') + '_responses.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  if (typeof logAuditEvent === 'function') {
    logAuditEvent({
      action: 'forms.export_csv',
      targetType: 'form',
      targetId: form.id || 'custom_form',
      actorRole: 'officer_admin',
      details: { form_name: form.name || 'Untitled Form', responses_count: responses.length }
    });
  }
}

/**
 * Renders the Responses tab with dual Table and Individual database views
 */
async function renderGfResponsesTab() {
  var container = document.getElementById('gf-tab-container');
  if (!container || !_gfCurrentForm) return;

  var topbar = document.querySelector('.gf-editor-topbar');
  if (_gfResponsesViewMode === 'table') {
    container.classList.add('gf-builder-container-wide');
    if (topbar) topbar.classList.add('gf-topbar-wide');
  } else {
    container.classList.remove('gf-builder-container-wide');
    if (topbar) topbar.classList.remove('gf-topbar-wide');
  }

  container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-secondary);font-size:14px;">Loading responses...</div>';

  var activeForm = _gfCurrentForm;
  var activeTab = _gfActiveTab;
  var responses = await loadGfResponses();
  if (_gfCurrentForm !== activeForm || _gfActiveTab !== activeTab) return;
  _gfResponsesList = responses;

  var isAccepting = _gfCurrentForm.status === 'active' && _gfCurrentForm.active !== false;
  var availability = isFormAcceptingResponses(_gfCurrentForm);

  var headerHtml =
    '<div class="gf-responses-header">' +
    '<div>' +
    '<div class="gf-responses-count">' + _gfResponsesList.length + ' response' + (_gfResponsesList.length === 1 ? '' : 's') + '</div>' +
    (!availability.open && availability.reason !== 'paused' ? '<p class="page-desc">' + escapeHtml(availability.message) + '</p>' : '') +
    '</div>' +
    '<div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">' +
    '<div style="display:flex;align-items:center;gap:8px;">' +
    '<span style="font-size:13px;font-weight:600;color:var(--text-primary);">Accepting responses</span>' +
    '<label class="gf-toggle-switch">' +
    '<input type="checkbox" id="gf-accepting-toggle" ' + (isAccepting ? 'checked' : '') + '/>' +
    '<span class="gf-toggle-slider"></span>' +
    '</label>' +
    '</div>' +
    '<button type="button" class="portal-btn portal-btn-secondary" id="gf-btn-export-csv" style="display:inline-flex;align-items:center;gap:6px;padding:6px 14px;font-size:12px;">' +
    '<svg class="ui-icon-xs" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Export CSV' +
    '</button>' +
    '<div style="display:inline-flex;border:1px solid var(--border-card);border-radius:8px;padding:2px;background:var(--bg-card-subtle);">' +
    '<button type="button" class="portal-btn ' + (_gfResponsesViewMode === 'table' ? 'portal-btn-primary' : '') + '" id="gf-view-table-btn" style="padding:4px 12px;font-size:12px;border:none;border-radius:6px;cursor:pointer;">Table</button>' +
    '<button type="button" class="portal-btn ' + (_gfResponsesViewMode === 'individual' ? 'portal-btn-primary' : '') + '" id="gf-view-ind-btn" style="padding:4px 12px;font-size:12px;border:none;border-radius:6px;cursor:pointer;">Individual</button>' +
    '</div>' +
    '</div>' +
    '</div>';

  if (_gfResponsesList.length === 0) {
    container.innerHTML =
      headerHtml +
      '<div style="background:var(--bg-card);border:1px dashed var(--border-card);border-radius:12px;padding:48px 24px;text-align:center;color:var(--text-secondary);font-size:14px;margin-top:14px;">' +
      '<svg class="ui-icon-lg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom:12px;color:var(--text-muted);"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>' +
      '<div style="font-weight:700;color:var(--text-primary);font-size:16px;margin-bottom:4px;">No responses yet</div>' +
      '<div>Submissions will automatically appear here once members fill out this form.</div>' +
      '</div>';
    wireResponsesHeaderEvents();
    return;
  }

  var questions = [];
  var items = _gfCurrentForm.items && _gfCurrentForm.items.length ? _gfCurrentForm.items : (_gfCurrentForm.fields || []);
  items.forEach(function(it) {
    if (isFormQuestion(it)) {
      questions.push({
        label: it.title || it.label || 'Question',
        type: it.type || 'text'
      });
    }
  });

  if (_gfResponsesViewMode === 'table') {
    // ── Table / Spreadsheet View ──
    var tableHeaders =
      '<th class="gf-col-autofill">#</th>' +
      '<th class="gf-col-autofill">Date</th>' +
      '<th class="gf-col-autofill gf-col-autofill-last">Respondent</th>';

    questions.forEach(function(q) {
      tableHeaders += '<th>' + escapeHtml(q.label) + '</th>';
    });

    var tableRows = '';
    _gfResponsesList.forEach(function(r, rIdx) {
      var itemsObj = readFormResponseItems(r);
      var answers = itemsObj.answers || {};

      var formattedDate = r.created_at
        ? new Date(r.created_at).toLocaleDateString('en-MY', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
        : '';

      tableRows += '<tr>' +
        '<td class="gf-col-autofill" style="color:var(--text-muted);">' + (rIdx + 1) + '</td>' +
        '<td class="gf-col-autofill" style="white-space:nowrap;font-size:12px;">' + escapeHtml(formattedDate) + '</td>' +
        '<td class="gf-col-autofill gf-col-autofill-last" style="font-weight:600;">' + escapeHtml(r.member_name || r.ic || 'Guest') + '</td>';

      questions.forEach(function(q) {
        var val = answers[q.label] ?? '';
        if (q.type === 'signature' && isFormSignature(val)) {
          tableRows += '<td>' +
            '<img src="' + escapeHtml(val) + '" alt="Signature" style="max-height:28px;max-width:85px;background:#ffffff;border:1px solid #cbd5e1;border-radius:4px;padding:2px;cursor:pointer;vertical-align:middle;" title="Click to view full signature" data-signature-signer="' + escapeHtml(r.member_name || '') + '"/>' +
            '</td>';
        } else {
          tableRows += '<td style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + escapeHtml(val) + '">' +
            (val !== '' ? escapeHtml(String(val)) : '<span style="color:var(--text-muted);">—</span>') +
            '</td>';
        }
      });

      tableRows += '</tr>';
    });

    container.innerHTML =
      headerHtml +
      '<div class="gf-responses-table-wrap" style="margin-top:14px;">' +
      '<table class="gf-responses-table">' +
      '<thead><tr>' + tableHeaders + '</tr></thead>' +
      '<tbody>' + tableRows + '</tbody>' +
      '</table>' +
      '</div>';
  } else {
    // ── Individual 1 of N View ──
    if (_gfIndividualIndex < 0) _gfIndividualIndex = 0;
    if (_gfIndividualIndex >= _gfResponsesList.length) _gfIndividualIndex = _gfResponsesList.length - 1;

    var currentResp = _gfResponsesList[_gfIndividualIndex];
    var currentAnswers = readFormResponseItems(currentResp).answers || {};

    var formattedDate = currentResp.created_at
      ? new Date(currentResp.created_at).toLocaleString('en-MY', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        })
      : '';

    var navHtml =
      '<div class="gf-individual-nav" style="margin-top:14px;">' +
      '<div style="display:flex;align-items:center;gap:10px;">' +
      '<button type="button" class="portal-btn portal-btn-secondary" id="gf-ind-prev" ' + (_gfIndividualIndex === 0 ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : '') + '>&lsaquo; Prev</button>' +
      '<span style="font-size:13px;font-weight:700;color:var(--text-primary);">' + (_gfIndividualIndex + 1) + ' of ' + _gfResponsesList.length + '</span>' +
      '<button type="button" class="portal-btn portal-btn-secondary" id="gf-ind-next" ' + (_gfIndividualIndex === _gfResponsesList.length - 1 ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : '') + '>Next &rsaquo;</button>' +
      '</div>' +
      '<button type="button" class="submit-btn danger" id="gf-ind-del" style="padding:6px 14px;font-size:12px;width:auto;display:inline-flex;align-items:center;gap:4px;"><svg class="ui-icon-xs" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg> Delete response</button>' +
      '</div>';

    var respBodyHtml =
      '<div style="background:var(--bg-card);border:1px solid var(--border-card);border-radius:12px;padding:22px;margin-top:14px;display:flex;flex-direction:column;gap:18px;">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1px solid var(--border-card);padding-bottom:14px;flex-wrap:wrap;gap:10px;">' +
      '<div>' +
      '<div style="font-family:var(--font-headline);font-size:17px;font-weight:700;color:var(--text-primary);">' + escapeHtml(currentResp.member_name || currentResp.ic || 'Guest Respondent') + '</div>' +
      '<div style="font-size:12px;color:var(--text-secondary);margin-top:3px;">' + escapeHtml((currentResp.rank ? currentResp.rank + ' · ' : '') + (currentResp.squad ? currentResp.squad + ' Platoon' : '')) + '</div>' +
      '</div>' +
      '<div style="font-size:12px;color:var(--text-muted);">' + escapeHtml(formattedDate) + '</div>' +
      '</div>';

    questions.forEach(function(q) {
      var ans = currentAnswers[q.label] ?? '';
      var valHtml = '';

      if (q.type === 'signature' && isFormSignature(ans)) {
        valHtml =
          '<div style="background:#ffffff;padding:14px 18px;border-radius:8px;border:1px solid #cbd5e1;display:inline-block;margin-top:8px;">' +
          '<img src="' + escapeHtml(ans) + '" alt="Digital Signature" style="max-height:120px;max-width:100%;display:block;"/>' +
          '<div style="font-size:11px;color:#64748b;margin-top:6px;display:flex;align-items:center;gap:4px;">' +
          '<svg class="ui-icon-xs" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/></svg> Digitally signed by respondent' +
          '</div>' +
          '</div>';
      } else {
        valHtml =
          '<div style="font-size:14px;color:var(--text-primary);background:var(--bg-card-subtle);border:1px solid var(--border-card);border-radius:8px;padding:10px 14px;margin-top:6px;">' +
          (ans !== '' ? escapeHtml(String(ans)) : '<span style="color:var(--text-muted);font-style:italic;">No answer provided</span>') +
          '</div>';
      }

      respBodyHtml +=
        '<div>' +
        '<div style="font-size:13px;font-weight:700;color:var(--text-secondary);">' + escapeHtml(q.label) + '</div>' +
        valHtml +
        '</div>';
    });

    respBodyHtml += '</div>';

    container.innerHTML = headerHtml + navHtml + respBodyHtml;

    var prevBtn = document.getElementById('gf-ind-prev');
    var nextBtn = document.getElementById('gf-ind-next');
    var delRespBtn = document.getElementById('gf-ind-del');

    if (prevBtn) {
      prevBtn.addEventListener('click', function() {
        if (_gfIndividualIndex > 0) {
          _gfIndividualIndex--;
          renderGfResponsesTab();
        }
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', function() {
        if (_gfIndividualIndex < _gfResponsesList.length - 1) {
          _gfIndividualIndex++;
          renderGfResponsesTab();
        }
      });
    }
    if (delRespBtn) {
      delRespBtn.addEventListener('click', async function() {
        var ok = typeof showConfirmModal === 'function'
          ? await showConfirmModal('Delete this response?', 'Delete Response')
          : true;
        if (!ok) return;

        var client = getSupa();
        if (client && client.delete) {
          try {
            await client.delete('bb_orders?order_number=eq.' + encodeURIComponent(currentResp.order_number));
            if (typeof showToast === 'function') showToast('Response deleted.', 'info');
            renderGfResponsesTab();
          } catch(err) {
            if (typeof showToast === 'function') showToast('Delete failed: ' + err.message, 'error');
          }
        }
      });
    }
  }

  wireResponseSignatures(container);
  wireResponsesHeaderEvents();
}

function wireResponseSignatures(container) {
  container.querySelectorAll('[data-signature-signer]').forEach(function(image) {
    image.addEventListener('click', function() {
      showSignatureEnlargedModal(image.getAttribute('src'), image.getAttribute('data-signature-signer'));
    });
  });
}
/**
 * Attaches event listeners for accepting responses toggle, CSV export, and table/individual switchers
 */
function wireResponsesHeaderEvents() {
  var acceptingToggle = document.getElementById('gf-accepting-toggle');
  if (acceptingToggle) {
    acceptingToggle.addEventListener('change', async function() {
      var nextStatus = acceptingToggle.checked ? 'active' : 'paused';
      var form = _gfCurrentForm;
      acceptingToggle.disabled = true;
      var saved = await toggleCustomFormStatus(form.id);
      acceptingToggle.disabled = false;
      if (!saved) {
        acceptingToggle.checked = !acceptingToggle.checked;
        return;
      }
      form.status = nextStatus;
      form.active = nextStatus === 'active';
    });
  }

  var exportBtn = document.getElementById('gf-btn-export-csv');
  if (exportBtn) {
    exportBtn.addEventListener('click', function() {
      downloadFormResponsesCsv(_gfCurrentForm, _gfResponsesList);
    });
  }

  var tableBtn = document.getElementById('gf-view-table-btn');
  var indBtn = document.getElementById('gf-view-ind-btn');
  if (tableBtn) {
    tableBtn.addEventListener('click', function() {
      _gfResponsesViewMode = 'table';
      renderGfResponsesTab();
    });
  }
  if (indBtn) {
    indBtn.addEventListener('click', function() {
      _gfResponsesViewMode = 'individual';
      renderGfResponsesTab();
    });
  }
}

// ── Google Forms Settings Tab ──────────────────────────────────────────────

/**
 * Renders the Settings tab containing Response Availability, Auto-Schedule & Delete Form
 */
function renderGfSettingsTab() {
  var container = document.getElementById('gf-tab-container');
  if (!container || !_gfCurrentForm) return;

  var isPaused = _gfCurrentForm.status === 'paused' || _gfCurrentForm.active === false;

  container.innerHTML =
    '<div class="gf-settings-card">' +
    '<div class="gf-settings-header">' +
    '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' +
    '<span>Response Availability & Auto-Schedule</span>' +
    '</div>' +
    '<div style="display:flex;gap:18px;margin-bottom:14px;align-items:center;">' +
    '<label style="display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--text-primary);cursor:pointer;"><input type="radio" name="gf-set-status" value="active" ' + (!isPaused ? 'checked' : '') + ' style="accent-color:var(--accent);"/> Active (Accepting Responses)</label>' +
    '<label style="display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--text-primary);cursor:pointer;"><input type="radio" name="gf-set-status" value="paused" ' + (isPaused ? 'checked' : '') + ' style="accent-color:var(--accent);"/> Paused (Closed to Responses)</label>' +
    '</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;">' +
    '<div><label class="form-label" style="font-size:12px;">Auto-Open At (Optional)</label><input type="datetime-local" id="gf-set-open" class="form-input" value="' + escapeHtml(_gfCurrentForm.open_at || '') + '" style="font-size:12px;"/></div>' +
    '<div><label class="form-label" style="font-size:12px;">Auto-Close At (Optional)</label><input type="datetime-local" id="gf-set-close" class="form-input" value="' + escapeHtml(_gfCurrentForm.close_at || '') + '" style="font-size:12px;"/></div>' +
    '</div>' +
    '<div>' +
    '<label class="form-label" style="font-size:12px;">Custom Paused / Closed Notice for Members</label>' +
    '<textarea id="gf-set-paused-msg" class="form-textarea" rows="2" placeholder="e.g. Responses for this form are currently paused by the company administration. Please check back later." style="font-size:13px;">' + escapeHtml(_gfCurrentForm.paused_message || '') + '</textarea>' +
    '</div>' +
    '</div>' +
    '<div class="gf-settings-card" style="border-color:rgba(239,68,68,0.3);">' +
    '<div class="gf-settings-header" style="color:var(--red);">' +
    '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>' +
    '<span>Delete Form</span>' +
    '</div>' +
    '<div style="font-size:13px;color:var(--text-secondary);margin-bottom:14px;">Once deleted, this form will be permanently removed. Submitted responses in the database will remain archived.</div>' +
    '<button type="button" class="submit-btn danger" id="gf-btn-del-form" style="padding:10px 18px;font-size:13px;width:auto;display:inline-flex;align-items:center;gap:6px;"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg> Delete this Form</button>' +
    '</div>';

  container.querySelectorAll('input[name="gf-set-status"]').forEach(function(radio) {
    radio.addEventListener('change', function() {
      _gfCurrentForm.status = radio.value;
      _gfCurrentForm.active = radio.value === 'active';
    });
  });

  var openInp = document.getElementById('gf-set-open');
  if (openInp) openInp.addEventListener('change', function() { _gfCurrentForm.open_at = openInp.value; });

  var closeInp = document.getElementById('gf-set-close');
  if (closeInp) closeInp.addEventListener('change', function() { _gfCurrentForm.close_at = closeInp.value; });

  var pausedMsgInp = document.getElementById('gf-set-paused-msg');
  if (pausedMsgInp) pausedMsgInp.addEventListener('input', function() { _gfCurrentForm.paused_message = pausedMsgInp.value; });

  var delBtn = document.getElementById('gf-btn-del-form');
  if (delBtn) {
    delBtn.addEventListener('click', async function() {
      await deleteForm(_gfCurrentForm.id);
      closeFormEditor();
    });
  }
}

// ── Backward-Compatible Subtab Switching ───────────────────────────────────

/**
 * Switches subtabs in the Admin Forms section
 * @param {string} sub
 */
function switchFormSubtab(sub) {
  if (typeof document === 'undefined') return;
  ['formbuilder', 'formresponses'].forEach(function (s) {
    var p = document.getElementById('subpanel-' + s);
    var b = document.getElementById('subtab-' + s);
    if (p) p.style.display = s === sub ? 'block' : 'none';
    if (b) b.classList.toggle('active-subtab', s === sub);
  });
  if (sub === 'formbuilder') {
    closeFormEditor();
    renderAdminForms();
  }
  if (sub === 'formresponses') renderFormResponses();
}

/**
 * Legacy Form Responses Tab
 */
async function renderFormResponses() {
  if (typeof document === 'undefined') return;
  var filterEl = document.getElementById('form-responses-filter');
  var formFilter = filterEl ? filterEl.value : '';
  var list = document.getElementById('admin-form-responses-list');
  if (!list) return;

  list.innerHTML = (typeof renderSkeletonTable === 'function') ? renderSkeletonTable(5, 4) : '<div class="skeleton-shimmer" style="height:160px;border-radius:8px;"></div>';
  var client = getSupa();

  try {
    if (!client || !client.get) throw new Error('Database client unavailable');
    var orders = await client.get('bb_orders?select=order_number,created_at,member_name,ic,rank,squad,items,notes&order=created_at.desc');

    var filtered = orders.filter(function (o) {
      return readFormResponseItems(o).form_name !== undefined;
    });

    if (formFilter) {
      filtered = filtered.filter(function (o) {
        var items = readFormResponseItems(o);
        var responseId = items.form_id || o.notes;
        return responseId ? String(responseId) === formFilter : _customForms.some(function(f) {
          return f.id === formFilter && f.name === items.form_name;
        });
      });
    }

    if (!filtered.length) {
      list.innerHTML =
        '<div style="color:#666;text-align:center;padding:20px;">No responses yet.</div>';
      return;
    }

    var html = '';
    filtered.forEach(function (o) {
      var items = readFormResponseItems(o);
      var formName = items.form_name || '';
      var answers = items.answers || {};

      var created = o.created_at
        ? new Date(o.created_at).toLocaleDateString('en-MY', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
          })
        : '';
      var answersHtml = '';
      Object.entries(answers).forEach(function (kv) {
        var valDisplay = kv[1];
        if (isFormSignature(valDisplay)) {
          valDisplay = '<img src="' + escapeHtml(valDisplay) + '" alt="Signature" style="max-height:28px;background:#fff;border-radius:4px;border:1px solid #ddd;padding:2px;cursor:pointer;" data-signature-signer="' + escapeHtml(o.member_name || '') + '"/>';
        } else if (typeof valDisplay === 'string' && valDisplay.startsWith('data:')) {
          return;
        } else {
          valDisplay = valDisplay != null && valDisplay !== '' ? escapeHtml(String(valDisplay)) : '<span style="color:var(--text-muted);font-style:italic;">—</span>';
        }
        answersHtml +=
          '<div style="display:flex;gap:8px;padding:5px 0;border-bottom:1px solid var(--border-subtle);">' +
          '<div style="font-size:11px;color:var(--text-secondary);min-width:120px;flex-shrink:0;">' +
          escapeHtml(kv[0]) +
          '</div>' +
          '<div style="font-size:12px;color:var(--text-primary);flex:1;">' +
          valDisplay +
          '</div>' +
          '</div>';
      });

      html +=
        '<div style="background:var(--bg-card);border-radius:12px;padding:14px 16px;margin-bottom:12px;border:1px solid var(--border-card);">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">' +
        '<div>' +
        '<div style="font-family:var(--font-headline);font-size:15px;font-weight:700;color:var(--text-primary);">' +
        escapeHtml(o.member_name || o.ic) +
        '</div>' +
        '<div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">' +
        (o.rank ? escapeHtml(o.rank) + ' · ' : '') +
        (o.squad ? escapeHtml(o.squad) + ' Platoon' : '') +
        '</div>' +
        '</div>' +
        '<div style="text-align:right;">' +
        '<div style="font-family:var(--font-headline);font-size:12px;font-weight:600;color:var(--brand-blue);background:rgba(59,130,246,0.12);padding:3px 10px;border-radius:20px;margin-bottom:4px;">' +
        escapeHtml(formName) +
        '</div>' +
        '<div style="font-size:10px;color:var(--text-muted);">' +
        created +
        '</div>' +
        '</div></div>' +
        '<div style="background:var(--bg-card-subtle);border:1px solid var(--border-card);border-radius:8px;padding:10px 12px;">' +
        (answersHtml ||
          '<div style="font-size:12px;color:var(--text-muted);font-style:italic;">No answers recorded.</div>') +
        '</div>' +
        '<div style="margin-top:8px;text-align:right;">' +
        '<button data-del-resp="' +
        escapeHtml(o.order_number) +
        '" style="background:none;border:none;color:var(--red);font-size:11px;cursor:pointer;font-weight:700;display:inline-flex;align-items:center;gap:4px;"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg> Delete response</button>' +
        '</div>' +
        '</div>';
    });

    list.innerHTML = html;
    wireResponseSignatures(list);
    list.querySelectorAll('[data-del-resp]').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        var ok =
          typeof showConfirmModal === 'function'
            ? await showConfirmModal('Delete this response?', 'Delete Form Response')
            : true;
        if (!ok) return;

        client
          .delete(
            'bb_orders?order_number=eq.' + encodeURIComponent(btn.getAttribute('data-del-resp'))
          )
          .then(function () {
            renderFormResponses();
            if (typeof showToast === 'function') showToast('Response deleted.', 'info');
          })
          .catch(function (e) {
            if (typeof showToast === 'function') showToast('Failed: ' + e.message, 'error');
          });
      });
    });
  } catch (e) {
    list.innerHTML =
      '<div style="color:#f66;text-align:center;padding:20px;">Failed to load.</div>';
  }
}

// ── Global Window Exports ──────────────────────────────────────────────────
if (typeof window !== 'undefined') {
  window._customForms = _customForms;
  window._currentFormType = _currentFormType;
  window._fbFields = _fbFields;
  window._gfCurrentForm = _gfCurrentForm;
  window._gfActiveTab = _gfActiveTab;
  window._gfActiveItemId = _gfActiveItemId;
  window._gfResponsesViewMode = _gfResponsesViewMode;
  window._gfIndividualIndex = _gfIndividualIndex;
  window._gfResponsesList = _gfResponsesList;

  window.loadCustomForms = loadCustomForms;
  window.saveCustomForms = saveCustomForms;
  window.renderFormsHub = renderFormsHub;
  window.filterForms = filterForms;
  window.clearFormSearch = clearFormSearch;
  window.openFormForMember = openFormForMember;
  window.backToFormsHub = backToFormsHub;
  window.renderBuiltinFormInline = renderBuiltinFormInline;
  window.validateFormAnswers = validateFormAnswers;
  window.submitBuiltinForm = submitBuiltinForm;

  window.setFormType = setFormType;
  window.addFormField = addFormField;
  window.renderFbFields = renderFbFields;
  window.clearFormBuilder = clearFormBuilder;
  window.saveForm = saveForm;
  window.editForm = editForm;
  window.deleteForm = deleteForm;
  window.renderAdminForms = renderAdminForms;
  window.isFormAcceptingResponses = isFormAcceptingResponses;
  window.toggleCustomFormStatus = toggleCustomFormStatus;
  window.toggleFormBuilderStatus = toggleFormBuilderStatus;
  window.updateFormBuilderScheduleBadge = updateFormBuilderScheduleBadge;
  window.renderUniformProductsPreview = renderUniformProductsPreview;
  window.switchFormSubtab = switchFormSubtab;
  window.renderFormResponses = renderFormResponses;

  // Upgraded Google Forms Builder exports
  window.convertOldFieldsToGfItems = convertOldFieldsToGfItems;
  window.convertGfItemsToFields = convertGfItemsToFields;
  window.attachSignatureCanvas = attachSignatureCanvas;
  window.showSignatureEnlargedModal = showSignatureEnlargedModal;
  window.handleFormFileUpload = handleFormFileUpload;
  window.removeFormFileUpload = removeFormFileUpload;
  window.openCreateFormFlow = openCreateFormFlow;
  window.openFormEditor = openFormEditor;
  window.closeFormEditor = closeFormEditor;
  window.openExternalLinkFormEditor = openExternalLinkFormEditor;
  window.openBuiltinGoogleFormEditor = openBuiltinGoogleFormEditor;
  window.renderGfEditor = renderGfEditor;
  window.switchGfTab = switchGfTab;
  window.saveGfCurrentForm = saveGfCurrentForm;
  window.addGfQuestion = addGfQuestion;
  window.duplicateGfItem = duplicateGfItem;
  window.deleteGfItem = deleteGfItem;
  window.addGfTitleDesc = addGfTitleDesc;
  window.addGfImage = addGfImage;
  window.addGfSection = addGfSection;
  window.updateGfToolbarPosition = updateGfToolbarPosition;
  window.previewGfForm = previewGfForm;
  window.closeGfPreview = closeGfPreview;
  window.renderGfQuestionsTab = renderGfQuestionsTab;
  window.loadGfResponses = loadGfResponses;
  window.renderGfResponsesTab = renderGfResponsesTab;
  window.downloadFormResponsesCsv = downloadFormResponsesCsv;
  window.renderGfSettingsTab = renderGfSettingsTab;
  window.isOtherOption = isOtherOption;
  window.onGfOtherInputFocus = onGfOtherInputFocus;
  window.onGfOtherInputChange = onGfOtherInputChange;
  window.onGfOtherRadioChange = onGfOtherRadioChange;
  window.onGfOtherCheckboxChange = onGfOtherCheckboxChange;
}

// ── Node.js Module Exports ──────────────────────────────────────────────────
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    _customForms: _customForms,
    _currentFormType: _currentFormType,
    _fbFields: _fbFields,
    get _gfCurrentForm() { return _gfCurrentForm; },
    set _gfCurrentForm(val) { _gfCurrentForm = val; },
    get _gfActiveTab() { return _gfActiveTab; },
    set _gfActiveTab(val) { _gfActiveTab = val; },
    get _gfActiveItemId() { return _gfActiveItemId; },
    set _gfActiveItemId(val) { _gfActiveItemId = val; },
    get _gfResponsesViewMode() { return _gfResponsesViewMode; },
    set _gfResponsesViewMode(val) { _gfResponsesViewMode = val; },
    get _gfIndividualIndex() { return _gfIndividualIndex; },
    set _gfIndividualIndex(val) { _gfIndividualIndex = val; },
    get _gfResponsesList() { return _gfResponsesList; },
    set _gfResponsesList(val) { _gfResponsesList = val; },

    loadCustomForms: loadCustomForms,
    saveCustomForms: saveCustomForms,
    renderFormsHub: renderFormsHub,
    filterForms: filterForms,
    clearFormSearch: clearFormSearch,
    openFormForMember: openFormForMember,
    backToFormsHub: backToFormsHub,
    renderBuiltinFormInline: renderBuiltinFormInline,
    validateFormAnswers: validateFormAnswers,
    submitBuiltinForm: submitBuiltinForm,

    setFormType: setFormType,
    addFormField: addFormField,
    renderFbFields: renderFbFields,
    clearFormBuilder: clearFormBuilder,
    saveForm: saveForm,
    editForm: editForm,
    deleteForm: deleteForm,
    renderAdminForms: renderAdminForms,
    isFormAcceptingResponses: isFormAcceptingResponses,
    toggleCustomFormStatus: toggleCustomFormStatus,
    toggleFormBuilderStatus: toggleFormBuilderStatus,
    updateFormBuilderScheduleBadge: updateFormBuilderScheduleBadge,
    renderUniformProductsPreview: renderUniformProductsPreview,
    switchFormSubtab: switchFormSubtab,
    renderFormResponses: renderFormResponses,

    // Upgraded Google Forms Builder exports
    convertOldFieldsToGfItems: convertOldFieldsToGfItems,
    convertGfItemsToFields: convertGfItemsToFields,
    attachSignatureCanvas: attachSignatureCanvas,
    showSignatureEnlargedModal: showSignatureEnlargedModal,
    handleFormFileUpload: handleFormFileUpload,
    removeFormFileUpload: removeFormFileUpload,
    openCreateFormFlow: openCreateFormFlow,
    openFormEditor: openFormEditor,
    closeFormEditor: closeFormEditor,
    openExternalLinkFormEditor: openExternalLinkFormEditor,
    openBuiltinGoogleFormEditor: openBuiltinGoogleFormEditor,
    renderGfEditor: renderGfEditor,
    switchGfTab: switchGfTab,
    saveGfCurrentForm: saveGfCurrentForm,
    addGfQuestion: addGfQuestion,
    duplicateGfItem: duplicateGfItem,
    deleteGfItem: deleteGfItem,
    addGfTitleDesc: addGfTitleDesc,
    addGfImage: addGfImage,
    addGfSection: addGfSection,
    updateGfToolbarPosition: updateGfToolbarPosition,
    previewGfForm: previewGfForm,
    closeGfPreview: closeGfPreview,
    renderGfQuestionsTab: renderGfQuestionsTab,
    loadGfResponses: loadGfResponses,
    renderGfResponsesTab: renderGfResponsesTab,
    downloadFormResponsesCsv: downloadFormResponsesCsv,
    renderGfSettingsTab: renderGfSettingsTab,
    isOtherOption: isOtherOption,
    onGfOtherInputFocus: onGfOtherInputFocus,
    onGfOtherInputChange: onGfOtherInputChange,
    onGfOtherRadioChange: onGfOtherRadioChange,
    onGfOtherCheckboxChange: onGfOtherCheckboxChange
  };
}
