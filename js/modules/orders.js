/**
 * 1st Petaling Jaya Boys' Brigade Portal
 * Uniform Store & Orders Module (TSK-006A)
 *
 * Handles uniform catalog management, pricing, cart calculations,
 * Touch 'n Go payment screenshot preview, order submission,
 * and admin order/product management.
 */

// ── Default Uniform Catalog ────────────────────────────────────────────────
var DEFAULT_UNIFORM_ITEMS = [
  {
    key: 'shirt',
    name: 'BB Uniform Shirt',
    category: 'apparel',
    hasSize: 'shirt',
    sizes: ['XS', 'S', 'M', 'L', 'XL', '2XL']
  },
  {
    key: 'trousers',
    name: 'BB Uniform Trousers',
    category: 'apparel',
    hasSize: 'trousers',
    sizes: ['24', '26', '28', '30', '32', '34', '36']
  },
  { key: 'belt', name: 'BB Belt', category: 'accessories', hasSize: false, sizes: [] },
  { key: 'cap', name: 'BB Cap', category: 'accessories', hasSize: false, sizes: ['S', 'M', 'L'] },
  { key: 'haversack', name: 'Haversack', category: 'accessories', hasSize: false, sizes: [] },
  { key: 'lanyard', name: 'Lanyard', category: 'accessories', hasSize: false, sizes: [] }
];

// Active uniform catalog (loaded async from Supabase bb_config)
var UNIFORM_ITEMS = DEFAULT_UNIFORM_ITEMS.slice();

// Cart & Pricing State
var prices = {};
var itemQtys = {};
var itemSizes = {};
var DEFAULT_PAYMENT_INFO =
  'Please transfer payment via Touch \'n Go eWallet / DuitNow QR or online bank transfer to 1st Petaling Jaya Boys\' Brigade. Upload your payment screenshot below as proof of payment.';
var _paymentInfo = DEFAULT_PAYMENT_INFO;
var _activeUniformCategory = 'all';
var _isSubmittingOrder = false;
var _tngScreenshotFile = null;
var _isSavingProduct = false;

/**
 * Resolves product category for uniform item
 * @param {Object} item
 * @returns {string}
 */
function getItemCategory(item) {
  if (item && item.category) return String(item.category).toLowerCase();
  var name = (((item && item.name) || '') + ' ' + ((item && item.key) || '')).toLowerCase();
  if (
    name.indexOf('shirt') !== -1 ||
    name.indexOf('trouser') !== -1 ||
    name.indexOf('pant') !== -1 ||
    name.indexOf('t-shirt') !== -1 ||
    name.indexOf('polo') !== -1 ||
    name.indexOf('jacket') !== -1
  ) {
    return 'apparel';
  }
  if (
    name.indexOf('badge') !== -1 ||
    name.indexOf('insignia') !== -1 ||
    name.indexOf('stripe') !== -1 ||
    name.indexOf('star') !== -1 ||
    name.indexOf('chevron') !== -1
  ) {
    return 'insignia';
  }
  return 'accessories';
}

/**
 * Returns available sizes for uniform item with standard fallbacks
 * @param {Object} item
 * @returns {Array<string>}
 */
function getItemSizes(item) {
  if (item && item.sizes && item.sizes.length) return item.sizes;
  if (item && item.hasSize === 'shirt') return ['XS', 'S', 'M', 'L', 'XL', '2XL'];
  if (item && item.hasSize === 'trousers') return ['24', '26', '28', '30', '32', '34', '36'];
  if (item && item.hasSize === 'cap') return ['S', 'M', 'L'];
  return [];
}

/**
 * Returns authentic SVG preview icon for a uniform item
 * @param {Object} item
 * @returns {string}
 */
function getItemIcon(item) {
  var key = ((item && item.key) || '').toLowerCase();
  if (key === 'shirt' || key.indexOf('shirt') !== -1) {
    return '<svg class="product-preview-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M20.38 3.46L16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.5a2 2 0 0 0 1.25 1.57L6 11.4V20a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-8.6l1.89-.64a2 2 0 0 0 1.25-1.57l.58-3.5a2 2 0 0 0-1.34-2.23z"></path></svg>';
  }
  if (key === 'trousers' || key.indexOf('trouser') !== -1 || key.indexOf('pant') !== -1) {
    return '<svg class="product-preview-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M4 2h16v3l-2 17h-4.5L12 11l-1.5 11H6L4 5V2z"></path></svg>';
  }
  if (key === 'belt' || key.indexOf('belt') !== -1) {
    return '<svg class="product-preview-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><rect x="2" y="7" width="20" height="10" rx="2"></rect><circle cx="12" cy="12" r="2.5"></circle><line x1="6" y1="7" x2="6" y2="17"></line></svg>';
  }
  if (key === 'cap' || key.indexOf('cap') !== -1 || key.indexOf('glengarry') !== -1) {
    return '<svg class="product-preview-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M2 17a10 10 0 0 1 20 0v2H2v-2z"></path><path d="M4 17c1-5 4-8 8-8s7 3 8 8"></path><line x1="12" y1="9" x2="12" y2="4"></line></svg>';
  }
  if (key === 'haversack' || key.indexOf('bag') !== -1) {
    return '<svg class="product-preview-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M4 8a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8z"></path><path d="M9 4v4"></path><path d="M15 4v4"></path><path d="M9 13h6"></path></svg>';
  }
  if (key === 'lanyard' || key.indexOf('lanyard') !== -1) {
    return '<svg class="product-preview-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M12 2C8.5 2 6 5 6 9c0 5 6 13 6 13s6-8 6-13c0-4-2.5-7-6-7z"></path><circle cx="12" cy="9" r="2.5"></circle></svg>';
  }
  return '<svg class="product-preview-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>';
}

/**
 * Computes category groups and counts for active uniform catalog
 * @param {Array<Object>} items
 * @returns {Object}
 */
function getUniformCategories(items) {
  var cats = {
    all: { label: 'All Items', count: 0 }
  };
  (items || []).forEach(function (item) {
    var c = getItemCategory(item);
    cats.all.count++;
    if (!cats[c]) {
      var label =
        c === 'apparel'
          ? 'Apparel'
          : c === 'accessories'
            ? 'Accessories'
            : c === 'insignia'
              ? 'Insignia'
              : c.charAt(0).toUpperCase() + c.slice(1);
      cats[c] = { label: label, count: 0 };
    }
    cats[c].count++;
  });
  return cats;
}

/**
 * Filters the product card grid by category
 * @param {string} cat
 */
function filterUniformCategory(cat) {
  _activeUniformCategory = cat || 'all';
  if (typeof document === 'undefined') return;

  var tabs = document.querySelectorAll('.uniform-cat-tab');
  tabs.forEach(function (t) {
    t.classList.toggle('active', t.getAttribute('data-cat') === _activeUniformCategory);
  });

  var cards = document.querySelectorAll('.uniform-product-card');
  var visibleCount = 0;
  cards.forEach(function (card) {
    var cardCat = card.getAttribute('data-category') || 'accessories';
    var match = _activeUniformCategory === 'all' || cardCat === _activeUniformCategory;
    card.style.display = match ? 'flex' : 'none';
    if (match) visibleCount++;
  });

  var emptyEl = document.getElementById('uniform-grid-empty');
  if (emptyEl) {
    emptyEl.style.display = visibleCount === 0 ? 'block' : 'none';
  }
}

// ── Catalog & Pricing Persistence ──────────────────────────────────────────

/**
 * Loads uniform item prices and catalog definitions from Supabase bb_config
 */
async function loadPrices() {
  var client =
    typeof window !== 'undefined' && window.supa
      ? window.supa
      : typeof supa !== 'undefined'
        ? supa
        : null;
  if (client && client.get) {
    try {
      var rows = await client.get('bb_config?key=in.(bb_prices,bb_uniform_items)&select=key,value');
      if (rows && rows.length) {
        rows.forEach(function (row) {
          if (row.key === 'bb_prices') {
            try {
              prices = JSON.parse(row.value || '{}');
            } catch (e) {
              prices = {};
            }
          }
          if (row.key === 'bb_uniform_items') {
            try {
              var it = JSON.parse(row.value);
              if (it && it.length) {
                UNIFORM_ITEMS = it;
                if (client.recordConfigSnapshot)
                  client.recordConfigSnapshot('bb_uniform_items', it);
              }
            } catch (e) {}
          }
        });
      }
    } catch (e) {
      prices = {};
    }
  }

  UNIFORM_ITEMS.forEach(function (item) {
    if (item.price) prices[item.key] = parseFloat(item.price) || 0;
    var p = prices[item.key] || 0;
    if (typeof document !== 'undefined') {
      var el = document.getElementById(item.key + '-price-label');
      if (el) el.textContent = p ? 'RM ' + p.toFixed(2) : 'RM TBA';
    }
  });

  return prices;
}

/**
 * Validates uniform cart selections against catalog rules
 * @param {Array<Object>} [catalog]
 * @param {Object} [qtys]
 * @param {Object} [sizes]
 * @returns {{ valid: boolean, error: string|null }}
 */
function validateOrderCart(catalog, qtys, sizes) {
  var cat = catalog && Array.isArray(catalog) ? catalog : UNIFORM_ITEMS;
  var q = qtys || itemQtys;
  var s = sizes || itemSizes;

  var totalQty = 0;
  for (var i = 0; i < cat.length; i++) {
    var item = cat[i];
    var qty = q && q[item.key] ? parseInt(q[item.key], 10) : 0;
    if (isNaN(qty) || qty < 0) qty = 0;
    totalQty += qty;

    if (qty > 0) {
      var itemAvailableSizes = getItemSizes(item);
      if (itemAvailableSizes && itemAvailableSizes.length > 0) {
        var selectedSize = s && s[item.key] ? String(s[item.key]).trim() : '';
        if (!selectedSize) {
          return { valid: false, error: 'Please select a size for ' + item.name };
        }
        if (itemAvailableSizes.indexOf(selectedSize) === -1) {
          return { valid: false, error: 'Invalid size selected for ' + item.name };
        }
      }
    }
  }

  if (totalQty === 0) {
    return { valid: false, error: 'Please add at least one item.' };
  }

  return { valid: true, error: null };
}

/**
 * Calculates current cart estimated total and updates the DOM label
 * @returns {number}
 */
function updateTotal() {
  var total = 0;
  var totalCount = 0;
  UNIFORM_ITEMS.forEach(function (item) {
    var qty = itemQtys[item.key] || 0;
    var unitPrice = parseFloat(item.price) || prices[item.key] || 0;
    total += qty * unitPrice;
    totalCount += qty;
  });

  if (typeof document !== 'undefined') {
    var el = document.getElementById('order-total');
    if (el) el.textContent = 'RM ' + total.toFixed(2);

    var stickyEl = document.getElementById('order-total-sticky');
    if (stickyEl) stickyEl.textContent = 'RM ' + total.toFixed(2);

    var countEl = document.getElementById('checkout-items-count');
    if (countEl) countEl.textContent = totalCount + (totalCount === 1 ? ' item' : ' items');

    var ctaBtn = document.getElementById('checkout-cta-btn');
    if (ctaBtn) {
      ctaBtn.disabled = totalCount === 0;
      ctaBtn.classList.toggle('active', totalCount > 0);
    }
  }
  return total;
}

/**
 * Adjusts quantity for a given uniform item key
 * @param {string} key
 * @param {number} delta
 */
function changeQty(key, delta) {
  var current = itemQtys[key] || 0;
  var next = Math.max(0, current + delta);
  itemQtys[key] = next;

  if (typeof document !== 'undefined') {
    var qtyEl = document.getElementById(key + '-qty');
    if (qtyEl) qtyEl.textContent = next;

    var item = UNIFORM_ITEMS.find(function (i) {
      return i.key === key;
    });
    var sizes = getItemSizes(item);
    var wrap = document.getElementById(key + '-size-wrap');
    var card = document.getElementById('ui-' + key);

    if (wrap) wrap.style.display = next > 0 && sizes.length ? 'block' : 'none';
    if (card) card.classList.toggle('has-qty', next > 0);
  }

  if (next === 0) delete itemSizes[key];
  updateTotal();
}

/**
 * Selects a size for an item and updates button selected states
 * @param {string} item
 * @param {string} size
 * @param {HTMLElement} btn
 */
function selectSize(item, size, btn) {
  itemSizes[item] = size;
  if (typeof document !== 'undefined') {
    var grid = document.getElementById(item + '-size-grid');
    if (grid) {
      grid.querySelectorAll('.size-btn, .size-pill').forEach(function (b) {
        b.classList.remove('selected');
      });
    }
    if (btn && btn.classList) {
      btn.classList.add('selected');
    }
    var lbl = document.getElementById(item + '-selected-size-label');
    if (lbl) lbl.textContent = size;
  }
}

/**
 * Persists uniform item catalog definitions to Supabase bb_config
 */
async function saveUniformItems() {
  var client =
    typeof window !== 'undefined' && window.supa
      ? window.supa
      : typeof supa !== 'undefined'
        ? supa
        : null;
  if (!client) return;

  if (typeof client.safeConfigUpdate === 'function') {
    try {
      var updated = await client.safeConfigUpdate('bb_uniform_items', UNIFORM_ITEMS, {
        idProp: 'key'
      });
      if (updated && Array.isArray(updated) && updated.length) {
        UNIFORM_ITEMS = updated;
      }
      return;
    } catch (eSafe) {
      console.warn('safeConfigUpdate fallback in saveUniformItems:', eSafe);
    }
  }

  try {
    await client.req('POST', 'bb_config?on_conflict=key', {
      key: 'bb_uniform_items',
      value: JSON.stringify(UNIFORM_ITEMS)
    });
  } catch (e) {
    try {
      await client.patch('bb_config?key=eq.bb_uniform_items', {
        value: JSON.stringify(UNIFORM_ITEMS)
      });
    } catch (e2) {
      console.error('saveUniformItems:', e2);
    }
  }
}

/**
 * Loads Touch 'n Go / bank payment instructions from Supabase bb_config
 */
async function loadPaymentInfo() {
  var client =
    typeof window !== 'undefined' && window.supa
      ? window.supa
      : typeof supa !== 'undefined'
        ? supa
        : null;
  if (client && client.get) {
    try {
      var rows = await client.get('bb_config?key=eq.bb_payment_info&select=value');
      if (rows && rows.length && rows[0].value && rows[0].value.trim()) {
        _paymentInfo = rows[0].value.trim();
        if (client.recordConfigSnapshot)
          client.recordConfigSnapshot('bb_payment_info', _paymentInfo);
      } else {
        // Fallback to default payment instructions when bb_payment_info is empty (BUG-012)
        _paymentInfo = DEFAULT_PAYMENT_INFO;
      }
    } catch (e) {
      _paymentInfo = DEFAULT_PAYMENT_INFO;
    }
  } else {
    _paymentInfo = DEFAULT_PAYMENT_INFO;
  }
  return _paymentInfo;
}

/**
 * Persists payment instructions text to Supabase bb_config
 * @param {string} text
 */
async function savePaymentInfo(text) {
  var client =
    typeof window !== 'undefined' && window.supa
      ? window.supa
      : typeof supa !== 'undefined'
        ? supa
        : null;
  if (!client) return;

  if (typeof client.safeConfigUpdate === 'function') {
    try {
      await client.safeConfigUpdate('bb_payment_info', text, { enableMerge: false });
      return;
    } catch (eSafe) {
      console.warn('safeConfigUpdate fallback in savePaymentInfo:', eSafe);
    }
  }

  try {
    await client.req('POST', 'bb_config?on_conflict=key', {
      key: 'bb_payment_info',
      value: text
    });
  } catch (e) {
    try {
      await client.patch('bb_config?key=eq.bb_payment_info', {
        value: text
      });
    } catch (e2) {}
  }
}

// ── Order Flow & Member Access ─────────────────────────────────────────────

/**
 * Helper to check if a member rank qualifies as NCO
 * @param {string} rank
 * @returns {boolean}
 */
function isNCO(rank) {
  var ncoRanks =
    typeof window !== 'undefined' && window.NCO_RANKS
      ? window.NCO_RANKS
      : ['Lance Corporal', 'Corporal', 'Sergeant', 'Staff Sergeant', 'Warrant Officer'];
  return ncoRanks.indexOf(rank) !== -1;
}

/**
 * Verifies logged-in member session and displays order page or login gate
 */
function checkOrderAccess() {
  if (typeof document === 'undefined') return;
  var ic = typeof sessionGet === 'function' ? sessionGet('ic') : '';
  var gate = document.getElementById('order-gate');
  var loggedIn = document.getElementById('order-logged-in');

  if (!ic) {
    if (gate) gate.style.display = 'block';
    if (loggedIn) loggedIn.style.display = 'none';
    return;
  }

  if (gate) gate.style.display = 'none';
  if (loggedIn) loggedIn.style.display = 'block';

  var hub = document.getElementById('forms-hub');
  var inline = document.getElementById('inline-form-view');
  if (hub) hub.style.display = 'block';
  if (inline) inline.style.display = 'none';

  populateOrderBar(ic);

  if (typeof renderFormsHub === 'function') renderFormsHub();
  if (typeof loadCustomForms === 'function') {
    loadCustomForms().then(function () {
      if (typeof renderFormsHub === 'function') renderFormsHub();
    });
  }

  var currentRank = typeof sessionGet === 'function' ? sessionGet('rank') || '' : '';
  renderOrderItems(currentRank);
}

/**
 * Populates logged-in member identity information into the order bar
 * @param {string} ic
 */
async function populateOrderBar(ic) {
  var client =
    typeof window !== 'undefined' && window.supa
      ? window.supa
      : typeof supa !== 'undefined'
        ? supa
        : null;
  if (!client || !client.get) return;

  try {
    var data = await client.get('bb_members?ic=eq.' + encodeURIComponent(ic) + '&select=*');
    if (!data || !data.length) return;
    var m = data[0];

    if (typeof document !== 'undefined') {
      var nameEl = document.getElementById('order-member-name');
      var rankEl = document.getElementById('order-member-rank');
      var squadIl = document.getElementById('order-member-squad-inline');
      var squadEl = document.getElementById('order-member-squad');

      if (nameEl) nameEl.textContent = m.name;
      if (rankEl) rankEl.textContent = m.rank || '';
      if (typeof sessionSet === 'function') sessionSet('rank', m.rank || '');
      if (squadIl) squadIl.textContent = m.squad ? m.squad + ' Platoon \xb7' : '';
      if (squadEl) squadEl.textContent = m.squad ? m.squad + ' Platoon' : '\u2014';

      // Load profile picture from Supabase Storage
      try {
        if (typeof client.fileUrl === 'function') {
          var pfpUrl = client.fileUrl('avatars', ic + '.jpg');
          var testImg = new Image();
          testImg.onload = function () {
            var img = document.getElementById('order-pfp-img');
            var ph = document.getElementById('order-pfp-ph');
            if (img) {
              img.src = pfpUrl;
              img.style.display = 'block';
            }
            if (ph) ph.style.display = 'none';
          };
          testImg.src = pfpUrl + '?t=' + Date.now();
        }
      } catch (ePfp) {}
    }
  } catch (e) {
    console.error('populateOrderBar error:', e);
  }
}

/**
 * Renders uniform products list in the order form with size grids and quantity counters
 * @param {string} [memberRank]
 */
function renderOrderItems(memberRank) {
  if (typeof document === 'undefined') return;
  var container = document.getElementById('uniform-items');
  if (!container) return;

  var rank = memberRank || (typeof sessionGet === 'function' ? sessionGet('rank') || '' : '');
  var nco = isNCO(rank);
  var visible = UNIFORM_ITEMS.filter(function (item) {
    return !item.ncoOnly || nco;
  });

  if (!visible.length) {
    container.innerHTML =
      '<div style="color:var(--text-muted);text-align:center;padding:24px;font-size:13px;grid-column:1/-1;">No products available yet.</div>';
    return;
  }

  var html = '';
  visible.forEach(function (item) {
    var sizes = getItemSizes(item);
    var sizeButtons = '';
    sizes.forEach(function (s) {
      var isSel = itemSizes[item.key] === s;
      sizeButtons +=
        '<button type="button" class="size-pill size-btn' +
        (isSel ? ' selected' : '') +
        '" onclick="selectSize(\'' +
        escapeHtml(item.key) +
        "','" +
        escapeHtml(s) +
        '\',this)">' +
        escapeHtml(s) +
        '</button>';
    });

    var safeProdImg = item.image
      ? typeof safeUrl === 'function'
        ? safeUrl(item.image, '')
        : item.image
      : '';
    var imgHtml = safeProdImg
      ? '<img src="' +
        escapeHtml(safeProdImg) +
        '" alt="' +
        escapeHtml(item.name) +
        '" loading="lazy"/>'
      : getItemIcon(item);

    var priceNum = parseFloat(item.price) || prices[item.key] || 0;
    var priceLabel = priceNum ? 'RM ' + priceNum.toFixed(2) : 'RM TBA';
    var cat = getItemCategory(item);
    var catLabel =
      cat === 'apparel'
        ? 'Apparel'
        : cat === 'accessories'
          ? 'Accessories'
          : cat === 'insignia'
            ? 'Insignia'
            : cat.charAt(0).toUpperCase() + cat.slice(1);

    var ncoBadge = item.ncoOnly
      ? '<span class="product-card-badge nco">NCO Only</span>'
      : '<span class="product-card-badge cat">' + escapeHtml(catLabel) + '</span>';

    var currentQty = itemQtys[item.key] || 0;
    var currentSize = itemSizes[item.key] || '';
    var sizeWrap = sizes.length
      ? '<div class="product-size-section" id="' +
        escapeHtml(item.key) +
        '-size-wrap" style="display:' +
        (currentQty > 0 ? 'block' : 'none') +
        ';">' +
        '<div class="size-pills-label"><span>Select Size:</span><span class="selected-size-text" id="' +
        escapeHtml(item.key) +
        '-selected-size-label">' +
        escapeHtml(currentSize) +
        '</span></div>' +
        '<div class="size-pills-row size-grid" id="' +
        escapeHtml(item.key) +
        '-size-grid">' +
        sizeButtons +
        '</div>' +
        '</div>'
      : '';

    var matchCat = _activeUniformCategory === 'all' || cat === _activeUniformCategory;

    html +=
      '<div class="uniform-product-card uniform-item' +
      (currentQty > 0 ? ' has-qty' : '') +
      '" id="ui-' +
      escapeHtml(item.key) +
      '" data-category="' +
      escapeHtml(cat) +
      '" style="display:' +
      (matchCat ? 'flex' : 'none') +
      ';">' +
      '<div class="product-card-media">' +
      ncoBadge +
      imgHtml +
      '</div>' +
      '<div class="product-card-body">' +
      '<div class="product-card-cat-label">' +
      escapeHtml(catLabel) +
      '</div>' +
      '<div class="product-card-name uniform-name">' +
      escapeHtml(item.name) +
      '</div>' +
      '<div class="product-card-price uniform-price" id="' +
      escapeHtml(item.key) +
      '-price-label">' +
      priceLabel +
      '</div>' +
      sizeWrap +
      '</div>' +
      '<div class="product-card-stepper qty-ctrl">' +
      '<button type="button" class="stepper-btn qty-btn" onclick="changeQty(\'' +
      escapeHtml(item.key) +
      '\',-1)" aria-label="Decrease quantity">&#8722;</button>' +
      '<div class="stepper-count qty-display" id="' +
      escapeHtml(item.key) +
      '-qty">' +
      currentQty +
      '</div>' +
      '<button type="button" class="stepper-btn qty-btn" onclick="changeQty(\'' +
      escapeHtml(item.key) +
      '\',1)" aria-label="Increase quantity">+</button>' +
      '</div>' +
      '</div>';
  });

  container.innerHTML = html;
  updateTotal();

  // Initialize order notes rich text editor if available
  setTimeout(function () {
    if (
      typeof createRichEditor === 'function' &&
      document.getElementById('order-notes-container')
    ) {
      createRichEditor(
        'order-notes-container',
        'order-notes',
        'Any special requests or notes...',
        60
      );
    }
  }, 30);
}

/**
 * Validates selected items and transitions user to the order review screen
 */
function goToOrderReview() {
  if (typeof document === 'undefined') return;
  var validation = validateOrderCart(UNIFORM_ITEMS, itemQtys, itemSizes);
  if (!validation.valid) {
    if (typeof showToast === 'function') showToast(validation.error, 'warning');
    return;
  }

  var lines = [];
  UNIFORM_ITEMS.forEach(function (item) {
    var qty = itemQtys[item.key] || 0;
    if (qty > 0) {
      var size = itemSizes[item.key] || '';
      var p = parseFloat(item.price) || prices[item.key] || 0;
      lines.push({ name: item.name, qty: qty, size: size, subtotal: qty * p });
    }
  });

  var html = '';
  lines.forEach(function (l) {
    html +=
      '<div class="review-row"><span class="review-label">' +
      escapeHtml(l.name) +
      '</span><span class="review-value">x' +
      escapeHtml(l.qty) +
      (l.size ? ' (' + escapeHtml(l.size) + ')' : '') +
      (l.subtotal ? ' \u2014 RM ' + l.subtotal.toFixed(2) : '') +
      '</span></div>';
  });

  var total = lines.reduce(function (s, l) {
    return s + l.subtotal;
  }, 0);
  html +=
    '<hr style="border:none;border-top:1px dashed #eee;margin:10px 0;"><div class="review-row"><span class="review-label">Total</span><span class="review-value" style="color:var(--accent);font-size:16px;">RM ' +
    total.toFixed(2) +
    '</span></div>';

  var notes = typeof reGetValue === 'function' ? reGetValue('order-notes') || '' : '';
  if (notes.trim()) {
    html +=
      '<div class="review-row"><span class="review-label">Notes</span><span class="review-value">' +
      (typeof sanitizeHtml === 'function' ? sanitizeHtml(notes.trim()) : escapeHtml(notes.trim())) +
      '</span></div>';
  }

  var rc = document.getElementById('review-content');
  if (rc) rc.innerHTML = html;

  // Show payment instructions with fallback (BUG-012)
  var pib = document.getElementById('payment-info-box');
  var pit = document.getElementById('payment-info-text');
  var activeInstructions = (_paymentInfo && _paymentInfo.trim()) ? _paymentInfo : DEFAULT_PAYMENT_INFO;
  if (pib && pit) {
    pit.textContent = activeInstructions;
    pib.style.display = 'block';
  }

  var sf = document.getElementById('step-form');
  if (sf) sf.style.display = 'none';
  var sr = document.getElementById('step-review');
  if (sr) sr.style.display = 'block';
  var scb = document.getElementById('sticky-checkout-bar');
  if (scb) scb.style.display = 'none';
  if (typeof window !== 'undefined' && window.scrollTo) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

/**
 * Returns user back to the uniform order configuration view from review
 */
function goBackOrder() {
  if (typeof document === 'undefined') return;
  var sf = document.getElementById('step-form');
  if (sf) sf.style.display = 'block';
  var sr = document.getElementById('step-review');
  if (sr) sr.style.display = 'none';
  var scb = document.getElementById('sticky-checkout-bar');
  if (scb) scb.style.display = 'flex';
}

// ── Touch 'n Go Payment Screenshot Helpers ─────────────────────────────────

/**
 * Compresses an image File, Blob, or base64 data URL using HTML Canvas downscaling.
 * Mitigates database bloat by constraining dimensions and encoding as compact JPEG.
 * @param {File|Blob|string} source
 * @param {number} [maxDimension=1200]
 * @param {number} [quality=0.75]
 * @returns {Promise<{blob: Blob|null, dataUrl: string}>}
 */
async function compressReceiptImage(source, maxDimension, quality) {
  maxDimension = maxDimension || 1200;
  quality = quality || 0.75;

  if (!source) return { blob: null, dataUrl: '' };

  // Headless / non-browser fallback
  if (typeof Image === 'undefined' || typeof document === 'undefined' || !document.createElement) {
    if (typeof source === 'string') {
      return { blob: null, dataUrl: source };
    }
    return { blob: source, dataUrl: '' };
  }

  return new Promise(function (resolve) {
    var img = new Image();
    var objectUrl = null;

    function cleanup() {
      if (objectUrl && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
        try {
          URL.revokeObjectURL(objectUrl);
        } catch (e) {}
      }
    }

    img.onload = function () {
      cleanup();
      try {
        var width = img.naturalWidth || img.width || 800;
        var height = img.naturalHeight || img.height || 600;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        var canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        var ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
        }

        var compressedDataUrl = canvas.toDataURL('image/jpeg', quality);

        if (typeof canvas.toBlob === 'function') {
          canvas.toBlob(
            function (blob) {
              resolve({ blob: blob, dataUrl: compressedDataUrl });
            },
            'image/jpeg',
            quality
          );
        } else {
          resolve({ blob: null, dataUrl: compressedDataUrl });
        }
      } catch (err) {
        resolve({
          blob: typeof source !== 'string' ? source : null,
          dataUrl: typeof source === 'string' ? source : ''
        });
      }
    };

    img.onerror = function () {
      cleanup();
      resolve({
        blob: typeof source !== 'string' ? source : null,
        dataUrl: typeof source === 'string' ? source : ''
      });
    };

    if (typeof source === 'string') {
      img.src = source;
    } else if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      try {
        objectUrl = URL.createObjectURL(source);
        img.src = objectUrl;
      } catch (err) {
        var reader = new FileReader();
        reader.onload = function (e) {
          img.src = e.target.result;
        };
        reader.onerror = function () {
          resolve({ blob: source, dataUrl: '' });
        };
        reader.readAsDataURL(source);
      }
    } else {
      var reader2 = new FileReader();
      reader2.onload = function (e) {
        img.src = e.target.result;
      };
      reader2.onerror = function () {
        resolve({ blob: source, dataUrl: '' });
      };
      reader2.readAsDataURL(source);
    }
  });
}

/**
 * Reads local image file and displays Touch 'n Go preview in the order review card
 * @param {HTMLInputElement} input
 */
function previewTngScreenshot(input) {
  if (!input || !input.files || !input.files[0]) {
    _tngScreenshotFile = null;
    return;
  }
  var file = input.files[0];
  _tngScreenshotFile = file;

  // Validation: MIME type check
  var allowedTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif'
  ];
  var isImage = file.type
    ? file.type.indexOf('image/') === 0 || allowedTypes.indexOf(file.type.toLowerCase()) !== -1
    : true;
  if (!isImage) {
    if (typeof showToast === 'function')
      showToast('Please upload a valid image file (PNG, JPG, WEBP).', 'warning');
    input.value = '';
    return;
  }

  // Validation: Size check (max 10MB)
  var maxSizeBytes = 10 * 1024 * 1024;
  if (file.size && file.size > maxSizeBytes) {
    if (typeof showToast === 'function')
      showToast('Screenshot file size must be less than 10MB.', 'warning');
    input.value = '';
    return;
  }

  if (typeof FileReader === 'undefined') return;
  var reader = new FileReader();
  reader.onload = function (e) {
    var img = document.getElementById('tng-preview-img');
    var pre = document.getElementById('tng-preview');
    var ph = document.getElementById('tng-placeholder');
    if (img) img.src = e.target.result;
    if (pre) pre.style.display = 'block';
    if (ph) ph.style.display = 'none';
  };
  reader.readAsDataURL(file);
}

/**
 * Clears current Touch 'n Go payment receipt image preview
 */
function clearTngScreenshot() {
  _tngScreenshotFile = null;
  if (typeof document === 'undefined') return;
  var input = document.getElementById('tng-screenshot-input');
  var img = document.getElementById('tng-preview-img');
  var pre = document.getElementById('tng-preview');
  var ph = document.getElementById('tng-placeholder');
  if (input) input.value = '';
  if (img) img.src = '';
  if (pre) pre.style.display = 'none';
  if (ph) ph.style.display = 'block';
}

/**
 * Returns active Touch 'n Go screenshot Base64 data URI if uploaded
 * @returns {string|null}
 */
function getTngScreenshot() {
  if (typeof document === 'undefined') return null;
  var img = document.getElementById('tng-preview-img');
  return img && img.src && img.src.startsWith('data:') ? img.src : null;
}

// ── Order Submission ───────────────────────────────────────────────────────

/**
 * Submits finalized uniform order to Supabase bb_orders table
 */
async function submitOrder() {
  if (_isSubmittingOrder) {
    if (typeof showToast === 'function')
      showToast('Order submission is already in progress.', 'warning');
    return null;
  }

  var btn = typeof document !== 'undefined' ? document.getElementById('confirm-btn') : null;
  var ic = typeof sessionGet === 'function' ? sessionGet('ic') || '' : '';

  if (!ic || !ic.trim()) {
    if (typeof showToast === 'function') showToast('Please log in to submit an order.', 'warning');
    return null;
  }

  var validation = validateOrderCart(UNIFORM_ITEMS, itemQtys, itemSizes);
  if (!validation.valid) {
    if (typeof showToast === 'function') showToast(validation.error, 'warning');
    return null;
  }

  var screenshot = getTngScreenshot();
  if (screenshot && typeof screenshot === 'string' && screenshot.length > 14 * 1024 * 1024) {
    if (typeof showToast === 'function')
      showToast('Payment screenshot payload is too large (max 10MB).', 'warning');
    return null;
  }

  _isSubmittingOrder = true;
  if (btn) {
    btn.innerHTML = '<span class="spinner"></span> Submitting...';
    btn.disabled = true;
  }

  var client =
    typeof window !== 'undefined' && window.supa
      ? window.supa
      : typeof supa !== 'undefined'
        ? supa
        : null;
  var memberData = {};

  try {
    if (client && client.get) {
      try {
        var d = await client.get('bb_members?ic=eq.' + encodeURIComponent(ic) + '&select=*');
        memberData = d && d[0] ? d[0] : {};
      } catch (e) {}
    }

    var items = {};
    UNIFORM_ITEMS.forEach(function (item) {
      var qty = itemQtys[item.key] || 0;
      if (qty > 0) {
        items[item.key] = {
          qty: qty,
          size: itemSizes[item.key] || null,
          price: parseFloat(item.price) || prices[item.key] || 0
        };
      }
    });

    var orderNum = 'BB-' + Date.now().toString(36).toUpperCase();
    var notesRaw = typeof reGetValue === 'function' ? reGetValue('order-notes') || '' : '';
    var notesClean = typeof sanitizeHtml === 'function' ? sanitizeHtml(notesRaw) : notesRaw;

    // Mitigate PostgreSQL text bloat (BUG-002):
    // Compress receipt image and upload to Supabase Storage; fallback to compressed data URL (<100KB)
    var finalScreenshot = null;
    var rawScreenshot = getTngScreenshot();
    if (_tngScreenshotFile || rawScreenshot) {
      try {
        var comp = await compressReceiptImage(_tngScreenshotFile || rawScreenshot, 1200, 0.75);
        var uploadBlob = comp.blob;
        var compDataUrl = comp.dataUrl;

        if (client && typeof client.uploadFile === 'function' && uploadBlob) {
          var cleanCode = orderNum.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
          var receiptPath = 'receipts/' + cleanCode + '_' + Date.now() + '.jpg';
          try {
            await client.uploadFile('receipts', receiptPath, uploadBlob);
            finalScreenshot = client.fileUrl('receipts', receiptPath);
          } catch (storageErr) {
            try {
              var galleryPath = 'orders/' + cleanCode + '_' + Date.now() + '.jpg';
              await client.uploadFile('gallery', galleryPath, uploadBlob);
              finalScreenshot = client.fileUrl('gallery', galleryPath);
            } catch (galleryErr) {
              // Storage bucket unavailable; fall back to compressed data URL
            }
          }
        }

        if (!finalScreenshot) {
          finalScreenshot = compDataUrl || rawScreenshot;
        }
      } catch (compErr) {
        finalScreenshot = rawScreenshot;
      }
    }

    if (!client || !client.post) throw new Error('Database client unavailable');
    await client.post('bb_orders', {
      order_number: orderNum,
      ic: ic,
      member_name: memberData.name || ic,
      rank: memberData.rank || '',
      squad: memberData.squad || '',
      items: JSON.stringify(items),
      notes: notesClean,
      status: 'pending',
      created_at: new Date().toISOString(),
      payment_screenshot: finalScreenshot || null
    });
    _tngScreenshotFile = null;

    if (typeof document !== 'undefined') {
      var sf = document.getElementById('step-review');
      if (sf) sf.style.display = 'none';
      var sn = document.getElementById('s-ordernum');
      if (sn) sn.textContent = orderNum;
      var scb = document.getElementById('sticky-checkout-bar');
      if (scb) scb.style.display = 'none';
      var sb = document.getElementById('order-success');
      if (sb) {
        sb.style.display = 'block';
        if (sb.scrollIntoView) sb.scrollIntoView({ behavior: 'smooth' });
      }

      UNIFORM_ITEMS.forEach(function (i) {
        itemQtys[i.key] = 0;
        delete itemSizes[i.key];
        var el = document.getElementById(i.key + '-qty');
        if (el) el.textContent = '0';
        var w = document.getElementById(i.key + '-size-wrap');
        if (w) w.style.display = 'none';
        var c = document.getElementById('ui-' + i.key);
        if (c) c.classList.remove('has-qty');
      });

      if (typeof reClearValue === 'function') reClearValue('order-notes');
      clearTngScreenshot();
      updateTotal();
    }

    if (typeof loadMemberOrders === 'function') {
      loadMemberOrders();
    }
    return orderNum;
  } catch (e) {
    if (typeof showToast === 'function') showToast('Failed to submit order: ' + e.message, 'error');

    if (btn) {
      btn.innerHTML = '\u2705 Confirm &amp; Submit';
      btn.disabled = false;
    }
    throw e;
  } finally {
    _isSubmittingOrder = false;
  }
}

/**
 * Renders uniform order forms inline inside the #inline-form-view container
 */
function renderUniformOrderInline() {
  if (typeof document === 'undefined') return;
  var container = document.getElementById('inline-form-view');
  if (!container) return;

  var categories = getUniformCategories(UNIFORM_ITEMS);
  var catTabsHtml = '<div class="uniform-cat-tabs" id="uniform-cat-tabs">';
  Object.keys(categories).forEach(function (catKey) {
    var c = categories[catKey];
    var active = catKey === _activeUniformCategory ? ' active' : '';
    catTabsHtml +=
      '<button type="button" class="uniform-cat-tab' +
      active +
      '" data-cat="' +
      catKey +
      '" onclick="filterUniformCategory(\'' +
      catKey +
      '\')">' +
      escapeHtml(c.label) +
      ' <span class="cat-tab-count" id="cat-count-' +
      catKey +
      '">' +
      c.count +
      '</span></button>';
  });
  catTabsHtml += '</div>';

  container.innerHTML =
    '<button onclick="backToFormsHub()" style="display:flex;align-items:center;gap:6px;background:none;border:none;color:var(--text-secondary);font-family:\'Oswald\',sans-serif;font-size:13px;cursor:pointer;padding:0;margin-bottom:16px;">\u2039 Back to Forms</button>' +
    '<div id="step-form">' +
    '<div class="dark-card" style="margin-bottom:14px;">' +
    '<div class="page-title">Uniform</div><div class="page-subtitle">Store &amp; Order Form</div><div class="page-desc">Select products, customize sizes, and review your order</div>' +
    '<div class="note-box"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:-2px;margin-right:6px;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg> Orders are confirmed by the officer in charge. You will be contacted when ready.</div>' +
    catTabsHtml +
    '<div id="uniform-items" class="uniform-product-grid"></div>' +
    '<div id="uniform-grid-empty" style="display:none;text-align:center;padding:32px 16px;color:var(--text-muted);font-size:13px;background:var(--bg-card-subtle);border-radius:12px;margin-bottom:16px;">No products in this category.</div>' +
    '<div class="form-group" style="margin-top:12px;"><label class="form-label">Additional Notes (optional)</label><div id="order-notes-container" style="min-height:0;"></div></div>' +
    '<div class="total-row" style="margin-top:16px;"><div class="total-label">Estimated Total</div><div class="total-val" id="order-total">RM 0.00</div></div>' +
    '<button class="submit-btn btn-with-icon" style="margin-top:14px;justify-content:center;" onclick="goToOrderReview()"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg> Review Order</button>' +
    '</div>' +
    '<div class="sticky-checkout-bar" id="sticky-checkout-bar">' +
    '<div class="checkout-bar-left">' +
    '<div class="checkout-summary-badge" id="checkout-summary-badge"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg><span id="checkout-items-count">0 items</span></div>' +
    '<div class="checkout-total-wrap"><span class="checkout-total-label">Total</span><span class="checkout-total-val" id="order-total-sticky">RM 0.00</span></div>' +
    '</div>' +
    '<button type="button" class="checkout-cta-btn" id="checkout-cta-btn" onclick="goToOrderReview()" disabled><span>Review Order</span><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg></button>' +
    '</div>' +
    '</div>' +
    '<div id="step-review" style="display:none;"><div class="dark-card">' +
    '<div class="page-title">Review</div><div class="page-subtitle">Your Order</div><div class="page-desc">Confirm details before submitting</div>' +
    '<div style="background:var(--bg-card-subtle);border:1px solid var(--border-card);border-radius:14px;padding:20px;margin-bottom:18px;" id="review-content"></div>' +
    '<div id="payment-info-box" style="display:none;background:rgba(245,197,66,0.08);border:1.5px solid rgba(245,197,66,0.3);border-radius:14px;padding:16px;margin-bottom:16px;">' +
    '<div style="font-family:\'Oswald\',sans-serif;font-size:14px;font-weight:600;color:var(--brand-gold);margin-bottom:8px;display:flex;align-items:center;gap:6px;"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg> Payment Instructions</div>' +
    '<div id="payment-info-text" style="font-size:13px;color:var(--text-secondary);line-height:1.75;white-space:pre-wrap;"></div>' +
    '</div>' +
    '<div style="background:var(--bg-card);border:2px dashed var(--border-card);border-radius:14px;padding:16px;margin-bottom:16px;">' +
    '<div style="font-family:\'Oswald\',sans-serif;font-size:14px;font-weight:600;color:var(--brand-gold);margin-bottom:6px;display:flex;align-items:center;gap:6px;"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg> TNG Payment Screenshot</div>' +
    '<div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px;">Please make payment via TNG and upload your payment screenshot before confirming.</div>' +
    '<div style="position:relative;border-radius:10px;background:var(--bg-card-subtle);border:1px solid var(--border-card);overflow:hidden;" id="tng-upload-area">' +
    '<input type="file" id="tng-screenshot-input" accept="image/*" style="position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%;z-index:2;" onchange="previewTngScreenshot(this)"/>' +
    '<div id="tng-placeholder" style="padding:20px;text-align:center;color:var(--text-secondary);font-size:13px;"><svg class="ui-icon-lg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin:0 auto 6px;display:block;"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>Tap to upload screenshot</div>' +
    '<div id="tng-preview" style="display:none;"><img id="tng-preview-img" style="width:100%;max-height:240px;object-fit:contain;display:block;border-radius:10px;" alt="TNG Screenshot"/><button type="button" onclick="clearTngScreenshot()" style="position:absolute;top:8px;right:8px;background:rgba(0,0,0,0.6);border:none;color:#fff;width:28px;height:28px;border-radius:50%;cursor:pointer;font-size:14px;z-index:3;">&#10005;</button></div>' +
    '</div></div>' +
    '<div style="display:flex;gap:10px;"><button class="submit-btn danger btn-with-icon" style="flex:1;margin-top:0;justify-content:center;" onclick="goBackOrder()"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg> Edit</button><button class="submit-btn btn-with-icon" style="flex:2;margin-top:0;justify-content:center;" onclick="submitOrder()" id="confirm-btn"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg> Confirm &amp; Submit</button></div>' +
    '</div></div>' +
    '<div class="success-box" id="order-success" style="display:none;"><div class="s-icon"><svg class="ui-icon-lg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg></div><div class="s-title">Order Submitted!</div><div class="s-msg">Order <strong id="s-ordernum" style="color:var(--accent);"></strong> received! The officer will contact you when ready.</div></div>';

  renderOrderItems();
}

// ── Admin Orders & Products Management ─────────────────────────────────────

/**
 * Handles tab switching in the Admin Uniform section (Products, Orders, Payment)
 * @param {string} sub
 */
function switchUniformSubtab(sub) {
  if (typeof document === 'undefined') return;
  if (sub === 'payment') loadAndRenderPaymentEditor();
  ['products', 'orders', 'payment'].forEach(function (s) {
    var p = document.getElementById('subpanel-' + s);
    var b = document.getElementById('subtab-' + s);
    if (p) p.style.display = s === sub ? 'block' : 'none';
    if (b) b.classList.toggle('active-subtab', s === sub);
  });
  if (sub === 'products') renderAdminProducts();
  if (sub === 'orders') renderAdminOrders();
}

/**
 * Loads and populates current payment info text in Admin editor
 */
async function loadAndRenderPaymentEditor() {
  await loadPaymentInfo();
  if (typeof document !== 'undefined') {
    var el = document.getElementById('payment-info-editor');
    if (el) el.value = _paymentInfo || '';
  }
}

/**
 * Saves payment info entered in Admin console to Supabase
 */
async function adminSavePaymentInfo() {
  if (typeof document === 'undefined') return;
  var el = document.getElementById('payment-info-editor');
  var text = el ? el.value.trim() : '';
  await savePaymentInfo(text);
  _paymentInfo = text;
  if (typeof showToast === 'function') {
    showToast('Payment info saved! Members will see it on the order review page.', 'success');
  }
}

/**
 * Renders list of uniform orders in Admin console with search and status updater
 */
async function renderAdminOrders() {
  if (typeof document === 'undefined') return;
  var search = ((document.getElementById('admin-order-search') || {}).value || '').toLowerCase();
  var statusFilter = ((document.getElementById('admin-order-form-filter') || {}).value || '').toLowerCase();
  var list = document.getElementById('admin-orders-list');
  if (!list) return;

  list.innerHTML =
    '<div style="color:#888;text-align:center;padding:20px;"><span class="spinner"></span> Loading...</div>';
  var client =
    typeof window !== 'undefined' && window.supa
      ? window.supa
      : typeof supa !== 'undefined'
        ? supa
        : null;

  try {
    if (!client || !client.get) throw new Error('Database client unavailable');
    var orders = await client.get('bb_orders?select=*&order=created_at.desc');

    // Only show uniform orders (filter out custom form submissions)
    var filtered = orders.filter(function (o) {
      try {
        var items = JSON.parse(o.items || '{}');
        return items.form_name === undefined;
      } catch (e) {
        return true;
      }
    });

    filtered = filtered.filter(function (o) {
      var matchesSearch =
        (o.order_number || '').toLowerCase().includes(search) ||
        (o.member_name || '').toLowerCase().includes(search);
      var matchesStatus = !statusFilter || (o.status || '').toLowerCase() === statusFilter;
      return matchesSearch && matchesStatus;
    });

    if (!filtered.length) {
      list.innerHTML =
        '<div style="color:var(--text-muted);text-align:center;padding:20px;">No submissions found.</div>';
      return;
    }

    var SC = {
      pending: '#eab308',
      processing: '#3b82f6',
      ready: '#10b981',
      collected: '#6b7280',
      cancelled: '#ef4444'
    };
    var SL = ['pending', 'processing', 'ready', 'collected', 'cancelled'];
    var html = '';

    filtered.forEach(function (o) {
      var itemsDisplay = '';
      try {
        var items = JSON.parse(o.items || '{}');
        Object.entries(items).forEach(function (kv) {
          var prod = UNIFORM_ITEMS.find(function (i) {
            return i.key === kv[0];
          });
          var v = kv[1];
          itemsDisplay +=
            '<div style="font-size:12px;color:var(--text-secondary);">' +
            escapeHtml(prod ? prod.name : kv[0]) +
            ' \xd7' +
            escapeHtml(v.qty) +
            (v.size ? ' (' + escapeHtml(v.size) + ')' : '') +
            '</div>';
        });
      } catch (e) {}

      var status = o.status || 'pending';
      var sc = SC[status] || '#888';
      var created = o.created_at
        ? new Date(o.created_at).toLocaleDateString('en-MY', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
          })
        : '';
      var btns = SL.map(function (s) {
        var active = s === status;
        return (
          '<button data-order-num="' +
          escapeHtml(o.order_number) +
          '" data-order-status="' +
          s +
          '" style="padding:3px 10px;border:1.5px solid ' +
          (active ? SC[s] : 'var(--border-card)') +
          ';border-radius:6px;background:' +
          (active ? SC[s] + '22' : 'transparent') +
          ';color:' +
          (active ? SC[s] : 'var(--text-secondary)') +
          ";font-size:11px;font-weight:700;cursor:pointer;font-family:'Oswald',sans-serif;\">" +
          s +
          '</button>'
        );
      }).join('');

      var safeScreenshot = o.payment_screenshot
        ? typeof safeUrl === 'function'
          ? safeUrl(o.payment_screenshot, '')
          : o.payment_screenshot
        : '';
      var screenshotHtml = safeScreenshot
        ? '<div style="margin:10px 0;"><div style="font-size:10px;color:var(--text-secondary);font-weight:700;letter-spacing:1px;text-transform:uppercase;margin-bottom:6px;display:flex;align-items:center;gap:4px;"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg> Payment Screenshot</div><img src="' +
          escapeHtml(safeScreenshot) +
          '" alt="TNG" style="max-width:100%;max-height:160px;object-fit:contain;border-radius:10px;border:1px solid var(--border-card);cursor:pointer;display:block;" onclick="this.style.maxHeight=this.style.maxHeight===\'none\'?\'160px\':\'none\'"/><div style="font-size:10px;color:var(--text-muted);margin-top:3px;">Tap to expand</div></div>'
        : '<div style="font-size:11px;color:var(--text-muted);margin:6px 0 10px;font-style:italic;">No payment screenshot</div>';

      html +=
        '<div style="background:var(--bg-card);border-radius:12px;padding:14px 16px;margin-bottom:10px;border:1px solid var(--border-card);">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">' +
        '<div><div style="font-family:\'Oswald\',sans-serif;font-size:15px;font-weight:700;color:var(--text-primary);">' +
        escapeHtml(o.order_number) +
        '</div>' +
        '<div style="font-size:11px;color:var(--text-secondary);">' +
        escapeHtml(o.member_name || o.ic) +
        ' \xb7 ' +
        escapeHtml(o.rank || '') +
        ' \xb7 ' +
        created +
        '</div></div>' +
        '<div style="font-size:11px;font-weight:600;padding:3px 10px;border-radius:20px;background:' +
        sc +
        '22;color:' +
        sc +
        ';border:1px solid ' +
        sc +
        "44;font-family:'Oswald',sans-serif;\">" +
        status.toUpperCase() +
        '</div></div>' +
        '<div style="margin-bottom:4px;">' +
        itemsDisplay +
        '</div>' +
        screenshotHtml +
        (o.notes
          ? '<div style="font-size:11px;color:var(--text-muted);margin:6px 0;"><strong>Notes:</strong> ' +
            (typeof sanitizeHtml === 'function' ? sanitizeHtml(o.notes) : escapeHtml(o.notes)) +
            '</div>'
          : '') +
        '<div style="display:flex;gap:5px;flex-wrap:wrap;">' +
        btns +
        '<button data-del-sub="' +
        escapeHtml(o.order_number) +
        '" title="Delete submission" style="margin-left:auto;background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);color:var(--red);padding:3px 10px;border-radius:6px;cursor:pointer;font-size:11px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>' +
        '</div></div>';
    });

    list.innerHTML = html;

    list.querySelectorAll('[data-order-status]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        updateOrderStatus(
          btn.getAttribute('data-order-num'),
          btn.getAttribute('data-order-status')
        );
      });
    });

    list.querySelectorAll('[data-del-sub]').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        var ok =
          typeof showConfirmModal === 'function'
            ? await showConfirmModal('Delete this submission?', 'Delete Order Submission')
            : true;
        if (!ok) return;

        client
          .delete(
            'bb_orders?order_number=eq.' + encodeURIComponent(btn.getAttribute('data-del-sub'))
          )
          .then(function () {
            renderAdminOrders();
            if (typeof showToast === 'function') showToast('Submission deleted.', 'info');
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

/**
 * Updates status of a submitted order in Supabase
 * @param {string} orderNum
 * @param {string} status
 */
async function updateOrderStatus(orderNum, status) {
  var client =
    typeof window !== 'undefined' && window.supa
      ? window.supa
      : typeof supa !== 'undefined'
        ? supa
        : null;
  if (!client || !client.patch) return;

  try {
    await client.patch('bb_orders?order_number=eq.' + encodeURIComponent(orderNum), {
      status: status
    });
    renderAdminOrders();
    if (typeof showToast === 'function') showToast('Order status updated to ' + status, 'success');
  } catch (e) {
    if (typeof showToast === 'function') showToast('Failed to update status.', 'error');
  }
}

/**
 * Renders uniform products list in the Admin management panel
 */
function renderAdminProducts() {
  if (typeof document === 'undefined') return;
  var list = document.getElementById('admin-products-list');
  if (!list) return;

  if (!UNIFORM_ITEMS.length) {
    list.innerHTML =
      '<div style="color:var(--text-secondary);text-align:center;padding:20px;font-size:13px;">No products yet. Add one above.</div>';
    return;
  }

  var html = '';
  UNIFORM_ITEMS.forEach(function (item) {
    var safeProdImg = item.image
      ? typeof safeUrl === 'function'
        ? safeUrl(item.image, '')
        : item.image
      : '';
    var imgHtml = safeProdImg
      ? '<img src="' +
        escapeHtml(safeProdImg) +
        '" style="width:50px;height:50px;object-fit:cover;border-radius:8px;flex-shrink:0;" alt="' +
        escapeHtml(item.name) +
        '"/>'
      : '<div style="width:50px;height:50px;border-radius:8px;background:var(--bg-card-subtle);border:1px solid var(--border-card);display:flex;align-items:center;justify-content:center;color:var(--text-secondary);flex-shrink:0;"><svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg></div>';

    var ncoBadge = item.ncoOnly
      ? ' <span style="font-size:9px;font-weight:700;background:rgba(245,197,66,0.2);color:var(--brand-gold);border:1px solid rgba(245,197,66,0.4);padding:2px 7px;border-radius:20px;letter-spacing:1px;">NCO ONLY</span>'
      : '';

    html +=
      '<div style="background:var(--bg-card);border-radius:12px;padding:12px 14px;margin-bottom:10px;display:flex;align-items:center;gap:12px;border:1px solid var(--border-card);">' +
      imgHtml +
      '<div style="flex:1;">' +
      '<div style="font-size:13px;color:var(--text-primary);font-weight:600;">' +
      escapeHtml(item.name) +
      ncoBadge +
      '</div>' +
      '<div style="font-size:11px;color:var(--text-secondary);">RM ' +
      (item.price ? parseFloat(item.price).toFixed(2) : 'TBA') +
      (item.sizes && item.sizes.length
        ? ' &middot; ' + item.sizes.map(escapeHtml).join(', ')
        : '') +
      '</div>' +
      '</div>' +
      '<button data-edit-prod="' +
      escapeHtml(item.key) +
      '" style="background:var(--bg-card-subtle);border:1px solid var(--border-card);color:var(--text-primary);padding:6px 12px;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;">Edit</button>' +
      '<button data-del-prod="' +
      escapeHtml(item.key) +
      '" style="background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);color:var(--red);padding:6px 12px;border-radius:8px;cursor:pointer;font-size:12px;">Del</button>' +
      '</div>';
  });

  list.innerHTML = html;
  list.querySelectorAll('[data-edit-prod]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      editProduct(btn.getAttribute('data-edit-prod'));
    });
  });
  list.querySelectorAll('[data-del-prod]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      deleteProduct(btn.getAttribute('data-del-prod'));
    });
  });
}

/**
 * Previews uploaded product photo in Admin console
 * @param {HTMLInputElement} input
 */
function previewProductImg(input) {
  if (!input || !input.files || !input.files[0]) return;
  var file = input.files[0];
  var reader = new FileReader();
  reader.onload = function (e) {
    var dataEl = document.getElementById('prod-img-data');
    if (dataEl) dataEl.value = e.target.result;
    var prev = document.getElementById('prod-img-prev-img');
    if (prev) prev.src = e.target.result;
    var pv = document.getElementById('prod-img-preview');
    if (pv) pv.style.display = 'block';
    var ph = document.getElementById('prod-img-placeholder');
    if (ph) ph.style.display = 'none';
  };
  reader.readAsDataURL(file);
}

/**
 * Resets Admin product form to default state
 */
function clearProductForm() {
  if (typeof document === 'undefined') return;
  ['prod-name', 'prod-price', 'prod-sizes', 'prod-img-data', 'prod-edit-key'].forEach(
    function (id) {
      var el = document.getElementById(id);
      if (el) el.value = '';
    }
  );
  var nc = document.getElementById('prod-nco-only');
  if (nc) nc.checked = false;
  var pi = document.getElementById('prod-img-prev-img');
  if (pi) pi.src = '';
  var pv = document.getElementById('prod-img-preview');
  if (pv) pv.style.display = 'none';
  var ph = document.getElementById('prod-img-placeholder');
  if (ph) ph.style.display = 'block';
  var ft = document.getElementById('prod-form-title');
  if (ft) ft.textContent = '\u2795 Add New Product';
}

/**
 * Saves new or edited uniform product definition and syncs with Supabase
 */
function saveProduct() {
  if (typeof document === 'undefined') return;
  if (_isSavingProduct) return;
  _isSavingProduct = true;

  try {
    var rawName = ((document.getElementById('prod-name') || {}).value || '').trim();
    var name = typeof sanitizeText === 'function' ? sanitizeText(rawName, 100) : rawName;
    var priceVal = (document.getElementById('prod-price') || {}).value;
    var price = parseFloat(priceVal);
    var sizesRaw = ((document.getElementById('prod-sizes') || {}).value || '').trim();
    var sizes = sizesRaw
      ? sizesRaw
          .split(',')
          .map(function (s) {
            return s.trim();
          })
          .filter(Boolean)
      : [];
    var rawImage = (document.getElementById('prod-img-data') || {}).value || '';
    var image = typeof safeUrl === 'function' ? safeUrl(rawImage, '') : rawImage;
    var editKey = (document.getElementById('prod-edit-key') || {}).value || '';
    var ncoOnly = !!(document.getElementById('prod-nco-only') || {}).checked;

    if (!name) {
      if (typeof showToast === 'function') showToast('Please enter a product name.', 'warning');
      return;
    }
    if (name.length > 100) {
      if (typeof showToast === 'function')
        showToast('Product name cannot exceed 100 characters.', 'warning');
      return;
    }
    if (isNaN(price) || price < 0) {
      if (typeof showToast === 'function')
        showToast('Product price must be a valid non-negative number.', 'warning');
      return;
    }

    var key = editKey || name.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now();
    var item = { key: key, name: name, price: price, sizes: sizes, image: image, ncoOnly: ncoOnly };
    var idx = UNIFORM_ITEMS.findIndex(function (i) {
      return i.key === key;
    });

    if (idx >= 0) UNIFORM_ITEMS[idx] = item;
    else UNIFORM_ITEMS.push(item);

    saveUniformItems();
    loadPrices();
    renderOrderItems();
    clearProductForm();
    renderAdminProducts();

    if (typeof showToast === 'function') showToast('Product saved successfully!', 'success');
  } finally {
    _isSavingProduct = false;
  }
}

/**
 * Loads a product into Admin form for editing
 * @param {string} key
 */
function editProduct(key) {
  if (typeof document === 'undefined') return;
  var item = UNIFORM_ITEMS.find(function (i) {
    return i.key === key;
  });
  if (!item) return;

  var set = function (id, val) {
    var el = document.getElementById(id);
    if (el) el.value = val || '';
  };
  set('prod-name', item.name);
  set('prod-price', item.price || '');
  set('prod-sizes', (item.sizes || []).join(', '));
  set('prod-edit-key', key);

  var ft = document.getElementById('prod-form-title');
  if (ft) ft.textContent = '\u270f\ufe0f Edit: ' + item.name;
  var nc = document.getElementById('prod-nco-only');
  if (nc) nc.checked = !!item.ncoOnly;

  if (item.image) {
    set('prod-img-data', item.image);
    var pi = document.getElementById('prod-img-prev-img');
    if (pi) pi.src = item.image;
    var pv = document.getElementById('prod-img-preview');
    if (pv) pv.style.display = 'block';
    var ph = document.getElementById('prod-img-placeholder');
    if (ph) ph.style.display = 'none';
  }

  var pn = document.getElementById('prod-name');
  if (pn && pn.scrollIntoView) pn.scrollIntoView({ behavior: 'smooth' });
}

/**
 * Deletes a product from the uniform catalog
 * @param {string} key
 */
async function deleteProduct(key) {
  var item = UNIFORM_ITEMS.find(function (i) {
    return i.key === key;
  });
  var ok =
    typeof showConfirmModal === 'function'
      ? await showConfirmModal('Delete "' + (item ? item.name : key) + '"?', 'Delete Product')
      : true;
  if (!ok) return;

  var idx = UNIFORM_ITEMS.findIndex(function (i) {
    return i.key === key;
  });
  if (idx !== -1) {
    UNIFORM_ITEMS.splice(idx, 1);
  }

  saveUniformItems();
  loadPrices();
  renderOrderItems();
  renderAdminProducts();
  if (typeof showToast === 'function') showToast('Product deleted.', 'info');
}

// ── Global Window Exports ──────────────────────────────────────────────────
if (typeof window !== 'undefined') {
  window.DEFAULT_UNIFORM_ITEMS = DEFAULT_UNIFORM_ITEMS;
  window.UNIFORM_ITEMS = UNIFORM_ITEMS;
  window.DEFAULT_PAYMENT_INFO = DEFAULT_PAYMENT_INFO;
  window.prices = prices;
  window.itemQtys = itemQtys;
  window.itemSizes = itemSizes;

  window.validateOrderCart = validateOrderCart;
  window.loadPrices = loadPrices;
  window.updateTotal = updateTotal;
  window.changeQty = changeQty;
  window.selectSize = selectSize;
  window.saveUniformItems = saveUniformItems;
  window.loadPaymentInfo = loadPaymentInfo;
  window.savePaymentInfo = savePaymentInfo;

  window.isNCO = isNCO;
  window.checkOrderAccess = checkOrderAccess;
  window.populateOrderBar = populateOrderBar;
  window.renderOrderItems = renderOrderItems;
  window.goToOrderReview = goToOrderReview;
  window.goBackOrder = goBackOrder;
  window.compressReceiptImage = compressReceiptImage;
  window.previewTngScreenshot = previewTngScreenshot;
  window.clearTngScreenshot = clearTngScreenshot;
  window.getTngScreenshot = getTngScreenshot;
  window.submitOrder = submitOrder;
  window.renderUniformOrderInline = renderUniformOrderInline;
  window.getItemCategory = getItemCategory;
  window.getItemSizes = getItemSizes;
  window.getItemIcon = getItemIcon;
  window.getUniformCategories = getUniformCategories;
  window.filterUniformCategory = filterUniformCategory;
  window._activeUniformCategory = _activeUniformCategory;
  window.getActiveCategory = function () {
    return _activeUniformCategory;
  };

  window.switchUniformSubtab = switchUniformSubtab;
  window.loadAndRenderPaymentEditor = loadAndRenderPaymentEditor;
  window.adminSavePaymentInfo = adminSavePaymentInfo;
  window.renderAdminOrders = renderAdminOrders;
  window.updateOrderStatus = updateOrderStatus;
  window.renderAdminProducts = renderAdminProducts;
  window.previewProductImg = previewProductImg;
  window.clearProductForm = clearProductForm;
  window.saveProduct = saveProduct;
  window.editProduct = editProduct;
  window.deleteProduct = deleteProduct;
}

// ── Node.js Module Exports ──────────────────────────────────────────────────
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DEFAULT_UNIFORM_ITEMS: DEFAULT_UNIFORM_ITEMS,
    UNIFORM_ITEMS: UNIFORM_ITEMS,
    DEFAULT_PAYMENT_INFO: DEFAULT_PAYMENT_INFO,
    prices: prices,
    itemQtys: itemQtys,
    itemSizes: itemSizes,

    validateOrderCart: validateOrderCart,
    loadPrices: loadPrices,
    updateTotal: updateTotal,
    changeQty: changeQty,
    selectSize: selectSize,
    saveUniformItems: saveUniformItems,
    loadPaymentInfo: loadPaymentInfo,
    savePaymentInfo: savePaymentInfo,

    isNCO: isNCO,
    checkOrderAccess: checkOrderAccess,
    populateOrderBar: populateOrderBar,
    renderOrderItems: renderOrderItems,
    goToOrderReview: goToOrderReview,
    goBackOrder: goBackOrder,
    compressReceiptImage: compressReceiptImage,
    previewTngScreenshot: previewTngScreenshot,
    clearTngScreenshot: clearTngScreenshot,
    getTngScreenshot: getTngScreenshot,
    submitOrder: submitOrder,
    renderUniformOrderInline: renderUniformOrderInline,
    getItemCategory: getItemCategory,
    getItemSizes: getItemSizes,
    getItemIcon: getItemIcon,
    getUniformCategories: getUniformCategories,
    filterUniformCategory: filterUniformCategory,
    getActiveCategory: function () {
      return _activeUniformCategory;
    },
    get _activeUniformCategory() {
      return _activeUniformCategory;
    },

    switchUniformSubtab: switchUniformSubtab,
    loadAndRenderPaymentEditor: loadAndRenderPaymentEditor,
    adminSavePaymentInfo: adminSavePaymentInfo,
    renderAdminOrders: renderAdminOrders,
    updateOrderStatus: updateOrderStatus,
    renderAdminProducts: renderAdminProducts,
    previewProductImg: previewProductImg,
    clearProductForm: clearProductForm,
    saveProduct: saveProduct,
    editProduct: editProduct,
    deleteProduct: deleteProduct
  };
}
