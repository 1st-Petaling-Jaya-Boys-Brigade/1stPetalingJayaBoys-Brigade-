/**
 * 1st Petaling Jaya Boys' Brigade Portal
 * Dynamic Forms Hub & Form Builder Module (TSK-006A)
 *
 * Implements the Forms Hub for members, live form search/filtering,
 * dynamic built-in form rendering and response submissions, and the
 * admin drag-and-drop form builder.
 */

// ── State ──────────────────────────────────────────────────────────────────
var _customForms = [];
var _currentFormType = 'link';
var _fbFields = [];
var _isSubmittingBuiltinForm = false;
var _isSavingCustomForm = false;

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
async function loadCustomForms() {
  var client = getSupa();
  if (client && client.get) {
    try {
      var rows = await client.get('bb_config?key=eq.bb_custom_forms&select=value');
      if (rows && rows.length) {
        _customForms = JSON.parse(rows[0].value || '[]');
        if (client.recordConfigSnapshot)
          client.recordConfigSnapshot('bb_custom_forms', _customForms);
      } else {
        _customForms = [];
        if (client.recordConfigSnapshot) client.recordConfigSnapshot('bb_custom_forms', []);
      }
    } catch (e) {
      _customForms = [];
    }
  }
  return _customForms;
}

/**
 * Saves current custom forms array to Supabase bb_config
 */
async function saveCustomForms() {
  var client = getSupa();
  if (!client) return;

  if (typeof client.safeConfigUpdate === 'function') {
    try {
      var updated = await client.safeConfigUpdate('bb_custom_forms', _customForms, {
        idProp: 'id'
      });
      if (updated && Array.isArray(updated)) {
        _customForms = updated;
      }
      return;
    } catch (eSafe) {
      console.warn('safeConfigUpdate fallback in saveCustomForms:', eSafe);
    }
  }

  try {
    await client.req('POST', 'bb_config?on_conflict=key', {
      key: 'bb_custom_forms',
      value: JSON.stringify(_customForms)
    });
  } catch (e) {
    try {
      await client.patch('bb_config?key=eq.bb_custom_forms', {
        value: JSON.stringify(_customForms)
      });
    } catch (e2) {}
  }
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
  ].concat(
    _customForms.filter(function (f) {
      return f.active !== false;
    })
  );

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
      '</div><div class="form-card-desc">' +
      safeDesc +
      '</div></div>' +
      '<div class="form-card-arrow">\u203a</div></div>';
  });

  list.innerHTML = html;
  list.querySelectorAll('[data-open-form]').forEach(function (el) {
    el.addEventListener('click', function () {
      openFormForMember(el.getAttribute('data-open-form'));
    });
  });

  // Re-apply current search filter if any
  var searchInput = document.getElementById('form-search-input');
  if (searchInput && searchInput.value) {
    filterForms(searchInput.value);
  } else {
    var clearBtn = document.getElementById('form-search-clear');
    var statusEl = document.getElementById('forms-search-status');
    var noResEl = document.getElementById('forms-no-results');
    if (clearBtn) clearBtn.style.display = 'none';
    if (statusEl) statusEl.style.display = 'none';
    if (noResEl) noResEl.style.display = 'none';
  }
}

/**
 * Filters visible form cards in Forms Hub by user query string
 * @param {string} query
 */
function filterForms(query) {
  var q = (query || '').toLowerCase().trim();
  var list =
    typeof document !== 'undefined'
      ? document.getElementById('forms-list') || document.getElementById('forms-hub')
      : null;
  var clearBtn =
    typeof document !== 'undefined' ? document.getElementById('form-search-clear') : null;
  var statusEl =
    typeof document !== 'undefined' ? document.getElementById('forms-search-status') : null;
  var countEl =
    typeof document !== 'undefined' ? document.getElementById('forms-search-count') : null;
  var noResEl =
    typeof document !== 'undefined' ? document.getElementById('forms-no-results') : null;
  var noResTitle =
    typeof document !== 'undefined' ? document.getElementById('forms-no-results-title') : null;

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

  if (form.type === 'link') {
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
 * Renders built-in form fields dynamically inside #inline-form-view
 * @param {Object} form
 */
function renderBuiltinFormInline(form) {
  if (typeof document === 'undefined') return;
  var container = document.getElementById('inline-form-view');
  if (!container) return;

  // Scope input element IDs to form.id to prevent collision across multiple forms (BUG-010)
  var formKey = form && form.id ? String(form.id).replace(/[^a-zA-Z0-9_-]/g, '_') : 'f';
  var fieldsHtml = '';
  (form.fields || []).forEach(function (f, i) {
    var fieldId = 'bff-' + formKey + '-' + i;
    var req = f.required ? ' <span style="color:var(--red);">*</span>' : '';
    var inp = '';
    if (f.type === 'textarea') {
      inp =
        '<textarea class="form-textarea" id="' +
        fieldId +
        '" placeholder="Your answer..." style="margin-top:6px;"></textarea>';
    } else if (f.type === 'select') {
      var opts = '<option value="">Select...</option>';
      (f.options || '').split(',').forEach(function (o) {
        var t = o.trim();
        if (t) opts += '<option>' + escapeHtml(t) + '</option>';
      });
      inp =
        '<select class="form-select" id="' +
        fieldId +
        '" style="margin-top:6px;">' +
        opts +
        '</select>';
    } else {
      inp =
        '<input class="form-input" type="' +
        (f.type || 'text') +
        '" id="' +
        fieldId +
        '" placeholder="Your answer..." style="margin-top:6px;"/>';
    }
    fieldsHtml +=
      '<div class="form-group"><label class="form-label">' +
      escapeHtml(f.label) +
      req +
      '</label>' +
      inp +
      '</div>';
  });

  container.innerHTML =
    '<div class="dark-card">' +
    '<button onclick="backToFormsHub()" style="display:flex;align-items:center;gap:6px;background:none;border:none;color:var(--text-secondary);font-family:\'Oswald\',sans-serif;font-size:13px;cursor:pointer;padding:0;margin-bottom:16px;">\u2039 Back to Forms</button>' +
    '<div class="page-title">' +
    escapeHtml(form.name) +
    '</div>' +
    (form.desc ? '<div class="page-desc">' + escapeHtml(form.desc) + '</div>' : '') +
    '<hr class="divider"/>' +
    fieldsHtml +
    '<button class="submit-btn gold btn-with-icon" data-submit-form="' +
    form.id +
    '" style="justify-content:center;"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg> Submit</button>' +
    '<div class="success-box" id="builtin-success" style="display:none;"><div class="s-icon"><svg class="ui-icon-lg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg></div><div class="s-title">Submitted!</div><div class="s-msg">Your form has been received.</div></div>' +
    '</div>';

  var submitBtn = container.querySelector('[data-submit-form]');
  if (submitBtn) {
    submitBtn.addEventListener('click', function () {
      submitBuiltinForm(form);
    });
  }
}

/**
 * Validates dynamic built-in form answers against field definitions
 * @param {Object} form - Form definition containing fields
 * @param {Object} answersMap - Key-value pair of answers by field label or index
 * @returns {{ valid: boolean, errors: Object, error: string|null }}
 */
function validateFormAnswers(form, answersMap) {
  var fields = form && Array.isArray(form.fields) ? form.fields : [];
  var answers = answersMap || {};
  var errors = {};
  var firstError = null;

  var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var phoneRegex = /^[0-9+\-\s()]{7,20}$/;

  for (var i = 0; i < fields.length; i++) {
    var f = fields[i];
    var val = answers[f.label] !== undefined ? String(answers[f.label]).trim() : '';
    var formKey = form && form.id ? String(form.id).replace(/[^a-zA-Z0-9_-]/g, '_') : '';
    if (val === '' && formKey && answers['bff-' + formKey + '-' + i] !== undefined) {
      val = String(answers['bff-' + formKey + '-' + i]).trim();
    }
    if (val === '' && answers['bff-' + i] !== undefined) {
      val = String(answers['bff-' + i]).trim();
    }

    // Required check
    if (f.required && !val) {
      errors[f.label] = (f.label || 'Field') + ' is required.';
      if (!firstError) firstError = errors[f.label];
      continue;
    }

    // If empty and optional, skip format validations
    if (!val) continue;

    // Email validation
    if (f.type === 'email' && !emailRegex.test(val)) {
      errors[f.label] = 'Please enter a valid email address.';
      if (!firstError) firstError = errors[f.label];
      continue;
    }

    // Phone / Tel validation
    if ((f.type === 'tel' || f.type === 'phone') && !phoneRegex.test(val)) {
      errors[f.label] = 'Please enter a valid phone number.';
      if (!firstError) firstError = errors[f.label];
      continue;
    }

    // Number validation
    if (f.type === 'number') {
      var num = Number(val);
      if (isNaN(num)) {
        errors[f.label] = 'Please enter a valid number.';
        if (!firstError) firstError = errors[f.label];
        continue;
      }
    }

    // Max length check (prevent oversized payloads)
    var maxLen = f.type === 'textarea' ? 2000 : 300;
    if (val.length > maxLen) {
      errors[f.label] =
        (f.label || 'Field') + ' exceeds maximum length of ' + maxLen + ' characters.';
      if (!firstError) firstError = errors[f.label];
      continue;
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

  var formKey = form && form.id ? String(form.id).replace(/[^a-zA-Z0-9_-]/g, '_') : 'f';
  var rawAnswers = {};
  var cleanAnswers = {};

  (form.fields || []).forEach(function (f, i) {
    var scopedId = 'bff-' + formKey + '-' + i;
    var el = typeof document !== 'undefined'
      ? (document.getElementById(scopedId) || document.getElementById('bff-' + i))
      : null;
    var val = el ? el.value.trim() : '';
    rawAnswers[f.label] = val;
    // Input sanitization
    var sanitizedVal =
      typeof sanitizeInput === 'function'
        ? sanitizeInput(val, f.type === 'textarea' ? 2000 : 300)
        : val;
    cleanAnswers[f.label] = sanitizedVal;
  });

  // Validate answers
  var validation = validateFormAnswers(form, rawAnswers);

  // Update DOM field border styling
  (form.fields || []).forEach(function (f, i) {
    var scopedId = 'bff-' + formKey + '-' + i;
    var el = typeof document !== 'undefined'
      ? (document.getElementById(scopedId) || document.getElementById('bff-' + i))
      : null;
    if (el) {
      if (validation.errors[f.label]) {
        el.style.borderColor = '#f66';
      } else {
        el.style.borderColor = '';
      }
    }
  });

  if (!validation.valid) {
    if (typeof showToast === 'function')
      showToast(validation.error || 'Please fill in all required fields.', 'warning');
    return;
  }

  _isSubmittingBuiltinForm = true;

  var btn = typeof document !== 'undefined' ? document.querySelector('[data-submit-form]') : null;
  if (btn) {
    btn.innerHTML = '<span class="spinner"></span> Submitting...';
    btn.disabled = true;
  }

  var ic = typeof sessionGet === 'function' ? sessionGet('ic') || '' : '';
  var name = '';
  var rank = '';
  if (typeof document !== 'undefined') {
    name = (document.getElementById('order-member-name') || {}).textContent || ic;
    rank = (document.getElementById('order-member-rank') || {}).textContent || '';
  }

  var client = getSupa();
  if (!client || !client.post) {
    _isSubmittingBuiltinForm = false;
    if (btn) {
      btn.innerHTML = 'Submit Response';
      btn.disabled = false;
    }
    throw new Error('Database client unavailable');
  }

  try {
    var orderNum = 'FORM-' + Date.now().toString(36).toUpperCase();
    await client.post('bb_orders', {
      order_number: orderNum,
      ic: ic,
      member_name: name,
      rank: rank,
      items: JSON.stringify({ form_name: form.name, answers: cleanAnswers }),
      notes: form.name,
      status: 'pending',
      created_at: new Date().toISOString()
    });

    if (typeof document !== 'undefined') {
      var sb = document.getElementById('builtin-success');
      if (sb) {
        sb.style.display = 'block';
        if (sb.scrollIntoView) sb.scrollIntoView({ behavior: 'smooth' });
      }
      (form.fields || []).forEach(function (f, i) {
        var scopedId = 'bff-' + formKey + '-' + i;
        var el = typeof document !== 'undefined'
          ? (document.getElementById(scopedId) || document.getElementById('bff-' + i))
          : null;
        if (el) el.value = '';
      });
    }
    if (typeof showToast === 'function') showToast('Form submitted successfully!', 'success');
    return orderNum;
  } catch (e) {
    if (typeof showToast === 'function') showToast('Failed to submit: ' + e.message, 'error');
    if (btn) {
      btn.innerHTML = 'Submit Response';
      btn.disabled = false;
    }
  } finally {
    _isSubmittingBuiltinForm = false;
  }
}

// ── Admin Dynamic Form Builder ─────────────────────────────────────────────

/**
 * Renders uniform products list preview in the Form Builder / Admin Form Hub (BUG-004)
 */
function renderUniformProductsPreview() {
  if (typeof document === 'undefined') return;
  var container = document.getElementById('uniform-products-preview');
  if (!container) return;

  var items =
    typeof UNIFORM_ITEMS !== 'undefined' && Array.isArray(UNIFORM_ITEMS)
      ? UNIFORM_ITEMS
      : typeof window !== 'undefined' && Array.isArray(window.UNIFORM_ITEMS)
        ? window.UNIFORM_ITEMS
        : [];

  if (!items.length) {
    container.innerHTML =
      '<div style="color:var(--text-muted);font-size:13px;text-align:center;padding:16px;">No products yet. Go to Products tab to add items.</div>';
    return;
  }

  var html = '';
  items.forEach(function (item) {
    var priceText = item.price ? 'RM ' + parseFloat(item.price).toFixed(2) : 'TBA';
    var sizesText = item.sizes && item.sizes.length ? ' · ' + item.sizes.join(', ') : '';
    var imgHtml = item.image
      ? '<img src="' +
        (typeof safeUrl === 'function' ? safeUrl(item.image, '') : item.image) +
        '" style="width:40px;height:40px;object-fit:cover;border-radius:8px;flex-shrink:0;" alt="' +
        (typeof escapeHtml === 'function' ? escapeHtml(item.name) : item.name) +
        '"/>'
      : '<div style="width:40px;height:40px;border-radius:8px;background:var(--bg-card-subtle);border:1px solid var(--border-card);display:flex;align-items:center;justify-content:center;color:var(--text-secondary);flex-shrink:0;"><svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.38 3.46L16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/></svg></div>';

    html +=
      '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border-subtle);">' +
      imgHtml +
      '<div style="flex:1;">' +
      '<div style="font-size:13px;color:var(--text-primary);font-weight:600;">' +
      (typeof escapeHtml === 'function' ? escapeHtml(item.name) : item.name) +
      '</div>' +
      '<div style="font-size:11px;color:var(--text-secondary);">' +
      priceText +
      sizesText +
      '</div>' +
      '</div></div>';
  });

  container.innerHTML = html;
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
      (f.label || '') +
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
          (f.options || '') +
          '" data-fi="' +
          i +
          '" data-fk="options" placeholder="Options: Yes, No, Maybe" style="width:100%;background:var(--bg-input);color:var(--text-primary);border:1.5px solid var(--border-card);border-radius:8px;padding:8px 10px;font-size:12px;margin-bottom:8px;"/>'
        : '');
  });

  container.innerHTML = html;
  container.querySelectorAll('[data-fi]').forEach(function (el) {
    var event = el.type === 'checkbox' ? 'change' : 'input';
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
function saveForm() {
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

    var formData = {
      id: editId || 'form_' + Date.now(),
      name: name,
      desc: desc,
      type: type,
      active: true
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
    if (idx >= 0) _customForms[idx] = formData;
    else _customForms.push(formData);

    saveCustomForms();
    clearFormBuilder();
    renderAdminForms();
    renderFormsHub();

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
  if (typeof document === 'undefined') return;
  var f = _customForms.find(function (x) {
    return x.id === id;
  });
  if (!f) return;

  var t = document.getElementById('fb-form-title');
  if (t)
    t.innerHTML =
      '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> <span>Edit: ' +
      escapeHtml(f.name) +
      '</span>';

  var n = document.getElementById('fb-name');
  if (n) n.value = f.name;
  if (typeof reSetValue === 'function') reSetValue('fb-desc', f.desc || '');

  var e = document.getElementById('fb-edit-id');
  if (e) e.value = f.id;
  _fbFields = f.fields ? JSON.parse(JSON.stringify(f.fields)) : [];

  if (f.type === 'link') {
    var u = document.getElementById('fb-url');
    if (u) u.value = f.url || '';
  }

  setFormType(f.type || 'link');
  renderFbFields();
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

  _customForms = _customForms.filter(function (x) {
    return x.id !== id;
  });
  saveCustomForms();
  renderAdminForms();
  renderFormsHub();
  if (typeof showToast === 'function') showToast('Form deleted.', 'info');
}

/**
 * Renders list of custom forms in the Admin Forms panel
 */
function renderAdminForms() {
  loadCustomForms();
  if (typeof document === 'undefined') return;
  var container = document.getElementById('admin-forms-list');
  if (!container) return;

  // Populate filter in responses tab
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
      '<div style="color:var(--text-muted);text-align:center;padding:20px;font-size:13px;">No forms yet.</div>';
    return;
  }

  var iconSvgs = {
    link: '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>',
    builtin:
      '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>'
  };
  var typeLabel = { link: 'External Link', builtin: 'Built-in Form' };
  var html = '';

  _customForms.forEach(function (f) {
    html +=
      '<div style="background:var(--bg-card);border-radius:12px;padding:14px 16px;margin-bottom:10px;border:1px solid var(--border-card);display:flex;align-items:center;gap:12px;">' +
      '<div style="width:42px;height:42px;border-radius:10px;background:rgba(200,150,30,0.1);display:flex;align-items:center;justify-content:center;color:var(--gold);flex-shrink:0;">' +
      (iconSvgs[f.type] || iconSvgs.builtin) +
      '</div>' +
      '<div style="flex:1;"><div style="font-family:\'Oswald\',sans-serif;font-size:15px;font-weight:600;color:var(--text-primary);">' +
      escapeHtml(f.name) +
      '</div>' +
      '<div style="font-size:11px;color:var(--text-secondary);">' +
      (typeLabel[f.type] || '') +
      (f.desc ? ' \xb7 ' + escapeHtml(f.desc) : '') +
      '</div></div>' +
      '<button data-edit-form="' +
      escapeHtml(f.id) +
      '" title="Edit Form" style="background:var(--bg-card-subtle);border:1px solid var(--border-card);color:var(--text-primary);padding:6px 12px;border-radius:8px;cursor:pointer;font-size:12px;display:inline-flex;align-items:center;justify-content:center;"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>' +
      '<button data-del-form="' +
      escapeHtml(f.id) +
      '" title="Delete Form" style="background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);color:var(--red);padding:6px 12px;border-radius:8px;cursor:pointer;font-size:12px;display:inline-flex;align-items:center;justify-content:center;"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>' +
      '</div>';
  });

  container.innerHTML = html;
  container.querySelectorAll('[data-edit-form]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      editForm(btn.getAttribute('data-edit-form'));
    });
  });
  container.querySelectorAll('[data-del-form]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      deleteForm(btn.getAttribute('data-del-form'));
    });
  });

  // Init form description rich editor if container is present
  setTimeout(function () {
    if (typeof createRichEditor === 'function' && document.getElementById('fb-desc-container')) {
      createRichEditor('fb-desc-container', 'fb-desc', 'Brief info about this form', 60);
    }
  }, 30);
}

/**
 * Switches subtabs in the Admin Forms section (Form Builder vs Form Responses)
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
    renderAdminForms();
    renderUniformProductsPreview();
  }
  if (sub === 'formresponses') renderFormResponses();
}

/**
 * Fetches and renders submitted built-in form answers in the Admin Form Responses tab
 */
async function renderFormResponses() {
  if (typeof document === 'undefined') return;
  var filterEl = document.getElementById('form-responses-filter');
  var formFilter = filterEl ? filterEl.value : '';
  var list = document.getElementById('admin-form-responses-list');
  if (!list) return;

  list.innerHTML =
    '<div style="color:#888;text-align:center;padding:20px;"><span class="spinner"></span> Loading...</div>';
  var client = getSupa();

  try {
    if (!client || !client.get) throw new Error('Database client unavailable');
    var orders = await client.get('bb_orders?select=*&order=created_at.desc');

    // Only show built-in form submissions (not uniform orders)
    var filtered = orders.filter(function (o) {
      try {
        var items = JSON.parse(o.items || '{}');
        return items.form_name !== undefined;
      } catch (e) {
        return false;
      }
    });

    if (formFilter) {
      filtered = filtered.filter(function (o) {
        try {
          var items = JSON.parse(o.items || '{}');
          return (
            (o.notes || '') === formFilter ||
            (items.form_name &&
              (items.form_name === formFilter ||
                _customForms.find(function (f) {
                  return f.id === formFilter && f.name === items.form_name;
                }))) ||
            false
          );
        } catch (e) {
          return false;
        }
      });
    }

    if (!filtered.length) {
      list.innerHTML =
        '<div style="color:#666;text-align:center;padding:20px;">No responses yet.</div>';
      return;
    }

    var html = '';
    filtered.forEach(function (o) {
      var formName = '';
      var answers = {};
      try {
        var items = JSON.parse(o.items || '{}');
        formName = items.form_name || '';
        answers = items.answers || {};
      } catch (e) {}

      var created = o.created_at
        ? new Date(o.created_at).toLocaleDateString('en-MY', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
          })
        : '';
      var answersHtml = '';
      Object.entries(answers).forEach(function (kv) {
        answersHtml +=
          '<div style="display:flex;gap:8px;padding:5px 0;border-bottom:1px solid var(--border-subtle);">' +
          '<div style="font-size:11px;color:var(--text-secondary);min-width:120px;flex-shrink:0;">' +
          escapeHtml(kv[0]) +
          '</div>' +
          '<div style="font-size:12px;color:var(--text-primary);flex:1;">' +
          (kv[1]
            ? escapeHtml(kv[1])
            : '<span style="color:var(--text-muted);font-style:italic;">—</span>') +
          '</div>' +
          '</div>';
      });

      html +=
        '<div style="background:var(--bg-card);border-radius:12px;padding:14px 16px;margin-bottom:12px;border:1px solid var(--border-card);">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">' +
        '<div>' +
        '<div style="font-family:\'Oswald\',sans-serif;font-size:15px;font-weight:700;color:var(--text-primary);">' +
        escapeHtml(o.member_name || o.ic) +
        '</div>' +
        '<div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">' +
        (o.rank ? escapeHtml(o.rank) + ' \xb7 ' : '') +
        (o.squad ? escapeHtml(o.squad) + ' Platoon' : '') +
        '</div>' +
        '</div>' +
        '<div style="text-align:right;">' +
        '<div style="font-family:\'Oswald\',sans-serif;font-size:12px;font-weight:600;color:var(--brand-blue);background:rgba(59,130,246,0.12);padding:3px 10px;border-radius:20px;margin-bottom:4px;">' +
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
  window.renderUniformProductsPreview = renderUniformProductsPreview;
  window.switchFormSubtab = switchFormSubtab;
  window.renderFormResponses = renderFormResponses;
}

// ── Node.js Module Exports ──────────────────────────────────────────────────
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    _customForms: _customForms,
    _currentFormType: _currentFormType,
    _fbFields: _fbFields,

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
    renderUniformProductsPreview: renderUniformProductsPreview,
    switchFormSubtab: switchFormSubtab,
    renderFormResponses: renderFormResponses
  };
}
