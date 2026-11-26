/**
 * 1st Petaling Jaya Boys' Brigade Portal
 * Uniform Store & Orders Module
 *
 * Handles uniform catalog management, pricing, cart calculations,
 * order submission, legacy receipt helpers,
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
  {
    key: 'boots',
    name: 'Boots',
    category: 'accessories',
    hasSize: 'boots',
    sizes: ['UK 5', 'UK 6', 'UK 7', 'UK 8', 'UK 9', 'UK 10', 'UK 11']
  },
  { key: 'haversack', name: 'Haversack', category: 'accessories', hasSize: false, sizes: [] },
  { key: 'lanyard', name: 'Lanyard', category: 'accessories', hasSize: false, sizes: [] }
];

// Active uniform catalog (loaded async from Supabase bb_config)
var UNIFORM_ITEMS = DEFAULT_UNIFORM_ITEMS.slice();

// Cart & Pricing State
var prices = {};
var itemQtys = {};
var itemSizes = {};
var itemSelectedSizes = {};
var itemStagedQtys = {};
var itemCustomTexts = {};
var uniformCart = [];
var DEFAULT_PAYMENT_INFO =
  'Please attach proof of payment that shows the amount and the transaction reference. Thank you.';
var LEGACY_PAYMENT_INFO = [
  'Payment must be completed in-person during the 3rd parade of the month before collecting your ordered uniform items. Please provide your name and order number to the logistics NCOs and officers upon payment.',
  'Contact the logistics NCOs or officers for the current payment instructions. After payment, attach a screenshot that shows the amount and transaction reference.'
];
var _paymentInfo = DEFAULT_PAYMENT_INFO;
var DEFAULT_UNIFORM_SCHEDULE = {
  status: 'active',
  open_at: '',
  close_at: '',
  paused_message: 'Uniform orders are currently paused by the company administration. Please check back later.'
};
var _uniformOrdersSchedule = {
  status: 'active',
  open_at: '',
  close_at: '',
  paused_message: ''
};
var _activeUniformCategory = 'all';
var _isSubmittingOrder = false;
var _isPromptingUniformProof = false;
// shortcut: retries reuse the order ID on this page, move the key to durable checkout storage for reload recovery.
var _pendingUniformOrder = null;
var _pendingUniformProof = null;
var _uniformPaymentProof = null;
var UNIFORM_PROOF_MAX_BYTES = 256 * 1024;
var UNIFORM_PROOF_FILE_MAX_BYTES = 10 * 1024 * 1024;
var UNIFORM_PROOF_REQUIRED = 'Upload proof of payment before you can submit your order.';
var MAX_UNIFORM_QUANTITY = 99;
var UNIFORM_ORDER_TRANSITIONS = {
  pending: ['paid', 'processing', 'cancelled'],
  paid: ['processing', 'ready'],
  processing: ['ready'],
  ready: ['collected', 'completed'],
  completed: [],
  collected: [],
  cancelled: []
};
var _tngScreenshotFile = null;
var _stagedProductImgFile = null;
var _isSavingProduct = false;

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

/**
 * Resolves product category for uniform item
 * @param {Object} item
 * @returns {string}
 */
function getItemCategory(item) {
  var category = item && typeof item.category === 'string' ? item.category.trim().toLowerCase() : '';
  if (/^[a-z][a-z0-9_-]*$/.test(category) && category !== 'all' && !Object.hasOwn(Object.prototype, category)) return category;
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
  if (item && Array.isArray(item.sizes) && item.sizes.length) {
    return Array.from(new Set(item.sizes.filter(function(size) { return typeof size === 'string' && size.trim(); })));
  }
  if (item && item.hasSize === 'shirt') return ['XS', 'S', 'M', 'L', 'XL', '2XL'];
  if (item && item.hasSize === 'trousers') return ['24', '26', '28', '30', '32', '34', '36'];
  if (item && item.hasSize === 'cap') return ['S', 'M', 'L'];
  if (item && (item.hasSize === 'boots' || (item.name && item.name.toLowerCase().includes('boot')))) {
    return ['UK 5', 'UK 6', 'UK 7', 'UK 8', 'UK 9', 'UK 10', 'UK 11'];
  }
  return [];
}

function uniformPriceInSen(item) {
  var value = item.price ?? prices[item.key];
  if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '') return null;
  var price = Number(value);
  var sen = Math.round(price * 100);
  return price >= 0 && Number.isSafeInteger(sen) && sen <= 9999999999 && Math.abs(price * 100 - sen) < 0.000001 ? sen : null;
}

function uniformQuantityLimit(item) {
  if (item.outOfStock === true) return 0;
  return Number.isInteger(item.stock) ? Math.max(0, Math.min(item.stock, MAX_UNIFORM_QUANTITY)) : MAX_UNIFORM_QUANTITY;
}

function canOrderUniformItem(item) {
  return item && (!item.ncoOnly || (typeof sessionGet === 'function' && isNCO(sessionGet('rank'))));
}

function getUniformCartLines() {
  return uniformCart.length ? uniformCart : UNIFORM_ITEMS.filter(function(item) {
    return itemQtys[item.key];
  }).map(function(item) {
    return { key: item.key, size: itemSizes[item.key], qty: Number(itemQtys[item.key]), customText: itemCustomTexts[item.key] };
  });
}

function uniformLineError(item, line, quantity) {
  if (!canOrderUniformItem(item)) return 'This product is no longer available to order.';
  var sizes = getItemSizes(item);
  if (sizes.length && !line.size) return 'Please select a size for ' + item.name;
  if (sizes.length && !sizes.includes(line.size)) return 'Invalid size selected for ' + item.name;
  var limit = uniformQuantityLimit(item);
  if (!limit) return item.name + ' is out of stock.';
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > limit) return 'Only ' + limit + ' units of ' + item.name + ' can be ordered.';
  if (item.hasCustomText && !line.customText) return 'Please enter the custom details for ' + item.name + '.';
  if (uniformPriceInSen(item) === null) return 'A price has not been set for ' + item.name + '.';
  return null;
}

function readUniformCart() {
  var totals = new Map();
  var totalSen = 0;
  var lines = getUniformCartLines().map(function(line) {
    totals.set(line.key, (totals.get(line.key) || 0) + line.qty);
    return line;
  }).map(function(line) {
    var item = UNIFORM_ITEMS.find(function(product) { return product.key === line.key; });
    var customText = line.customText ? sanitizeText(line.customText, 120) : '';
    var error = uniformLineError(item, { size: line.size, customText: customText }, totals.get(line.key));
    if (!Number.isSafeInteger(line.qty) || line.qty < 1) error = 'Please enter a whole quantity of at least one.';
    if (error) throw new Error(error);
    var sen = uniformPriceInSen(item);
    totalSen += sen * line.qty;
    return { key: item.key, name: item.name, size: line.size || null, qty: line.qty, custom_text: customText || null, price: sen / 100 };
  });
  if (!lines.length) throw new Error('Please add at least one item.');
  if (totalSen > 9999999999) throw new Error('The order total exceeds the allowed maximum.');
  return { lines: lines, total: totalSen / 100 };
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
  var client = getSupa();
  var snapshotsLoaded = false;
  if (client && typeof client.getConfigSnapshot === 'function') {
    var snapPrices = client.getConfigSnapshot('bb_prices');
    var snapItems = client.getConfigSnapshot('bb_uniform_items');
    if (snapPrices || snapItems) {
      if (snapPrices) prices = snapPrices;
      if (Array.isArray(snapItems)) UNIFORM_ITEMS = snapItems;
      snapshotsLoaded = true;
    }
  }
  if (!snapshotsLoaded && client && client.get) {
    try {
      var rows = await client.get('bb_config?key=in.(bb_prices,bb_uniform_items)&select=key,value');
      if (rows && rows.length) {
        rows.forEach(function (row) {
          if (row.key === 'bb_prices') {
            try {
              prices = (typeof row.value === 'string' ? JSON.parse(row.value) : row.value) || {};
            } catch (e) {
              prices = {};
            }
          }
          if (row.key === 'bb_uniform_items') {
            try {
              var it = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
              if (Array.isArray(it)) {
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

  if (typeof window !== 'undefined') window.UNIFORM_ITEMS = UNIFORM_ITEMS;
  if (typeof document !== 'undefined' && document.getElementById('uniform-items')) renderOrderItems();

  return prices;
}

/**
 * Validates uniform cart selections against catalog rules
 * @param {Array<Object>} [catalog]
 * @param {Object} [qtys]
 * @param {Object} [sizes]
 * @returns {{ valid: boolean, error: string|null }}
 */

/**
 * Returns formatted summary of how many variants of an item are in the cart
 * @param {string} key
 * @returns {string}
 */
function getProductInCartSummary(key) {
  var matching = uniformCart.filter(function (ci) { return ci.key === key; });
  if (!matching.length) return '';
  var total = matching.reduce(function (s, ci) { return s + ci.qty; }, 0);
  var sizeBreakdown = matching.map(function (ci) {
    var parts = [];
    if (ci.size) parts.push(ci.size);
    if (ci.customText) parts.push('"' + ci.customText + '"');
    var detail = parts.join(' · ');
    return detail ? (ci.qty + '× ' + detail) : ci.qty;
  }).join(', ');
  return '🛒 In Cart: ' + total + (sizeBreakdown ? ' (' + sizeBreakdown + ')' : '');
}

/**
 * Handles custom text specification changes on product cards (e.g. name tags, badges)
 * @param {string} key
 * @param {string} val
 */
function onCustomTextChange(key, val) {
  itemCustomTexts[key] = val;
}

/**
 * Toggles visibility of custom input prompt settings in Admin Add/Edit Product modal
 * @param {boolean} checked
 */
function toggleProdCustomPrompt(checked) {
  if (typeof document === 'undefined') return;
  var wrap = document.querySelector('.prod-custom-prompt-wrap');
  if (wrap) wrap.style.display = checked ? 'block' : 'none';
}

/**
 * Selects a size on a product card without immediately changing quantities
 * @param {string} itemKey
 * @param {string} size
 * @param {HTMLElement} btn
 */
/**
 * Adjusts staged quantity for an item card without immediately adding to cart.
 * The 'Add to Cart' button only appears when staged quantity > 0.
 * @param {string} key
 * @param {number} delta
 * @returns {number}
 */
function stepCardQty(key, delta) {
  var current = itemStagedQtys[key] || 0;
  var item = UNIFORM_ITEMS.find(function(product) { return product.key === key; });
  if (_isSubmittingOrder || !canOrderUniformItem(item) || !Number.isSafeInteger(delta)) return current;
  var next = Math.min(uniformQuantityLimit(item), Math.max(0, current + delta));
  itemStagedQtys[key] = next;

  if (typeof document !== 'undefined') {
    var qtyDisplay = document.getElementById(key + '-qty');
    if (qtyDisplay) {
      qtyDisplay.textContent = String(next);
    }

    var minusBtn = document.getElementById(key + '-minus-btn');
    if (minusBtn) {
      minusBtn.disabled = next === 0;
      minusBtn.style.opacity = next === 0 ? '0.4' : '1';
    }

    var addBtn = document.getElementById(key + '-add-btn');
    var addLabel = document.getElementById(key + '-add-label');
    var card = document.getElementById('ui-' + key);

    if (next > 0) {
      if (addBtn) addBtn.style.display = 'inline-flex';
      if (addLabel) addLabel.textContent = 'Add ' + next + ' to Cart';
      if (card) card.classList.add('has-staged-qty');
    } else {
      if (addBtn) addBtn.style.display = 'none';
      if (card) card.classList.remove('has-staged-qty');
    }
  }
  return next;
}

/**
 * Confirms adding the staged quantity of an item card into the uniform cart.
 * Adds the exact quantity staged via the stepper, then resets staged quantity to 0.
 * @param {string} key
 */
function confirmAddToCart(key) {
  var staged = itemStagedQtys[key] || 0;
  if (!staged || _isSubmittingOrder) return;
  var item = UNIFORM_ITEMS.find(function (i) { return i.key === key; });
  if (!item) return;

  var sizes = getItemSizes(item);
  var size = itemSelectedSizes[key] || itemSizes[key] || '';
  if (sizes.length && !size) {
    if (typeof showToast === 'function') showToast('Please select a size first!', 'warning');
    return;
  }

  var customText = '';
  if (item.hasCustomText) {
    var rawText = (itemCustomTexts[key] || '');
    if (typeof document !== 'undefined') {
      var inp = document.getElementById(key + '-custom-text');
      if (inp && inp.value) rawText = inp.value;
    }
    customText = (typeof sanitizeText === 'function' ? sanitizeText(rawText.trim(), 120) : rawText.trim());
    if (!customText) {
      var fieldPrompt = item.customPrompt || 'custom details (e.g. Name or Badge)';
      if (typeof showToast === 'function') showToast('Please enter ' + fieldPrompt + ' first!', 'warning');
      if (typeof document !== 'undefined') {
        var inpEl = document.getElementById(key + '-custom-text');
        if (inpEl && typeof inpEl.focus === 'function') inpEl.focus();
      }
      return;
    }
  }

  if (!addUniformToCart(key, size, staged, customText)) return;

  // Reset staged quantity and custom text for this card
  itemStagedQtys[key] = 0;
  itemCustomTexts[key] = '';
  if (typeof document !== 'undefined') {
    var customInp = document.getElementById(key + '-custom-text');
    if (customInp) customInp.value = '';

    var qtyDisplay = document.getElementById(key + '-qty');
    if (qtyDisplay) qtyDisplay.textContent = '0';

    var minusBtn = document.getElementById(key + '-minus-btn');
    if (minusBtn) {
      minusBtn.disabled = true;
      minusBtn.style.opacity = '0.4';
    }

    var addBtn = document.getElementById(key + '-add-btn');
    if (addBtn) addBtn.style.display = 'none';

    var card = document.getElementById('ui-' + key);
    if (card) {
      card.classList.remove('has-staged-qty');
      card.classList.add('has-qty');
    }

    var inCartEl = document.getElementById(key + '-in-cart');
    if (inCartEl) {
      inCartEl.textContent = getProductInCartSummary(key);
      inCartEl.style.display = 'block';
    }
  }
}

function selectUniformCardSize(itemKey, size, btn) {
  var item = UNIFORM_ITEMS.find(function(product) { return product.key === itemKey; });
  if (_isSubmittingOrder || !getItemSizes(item).includes(size)) return;
  itemSelectedSizes[itemKey] = size;
  itemSizes[itemKey] = size;

  if (typeof document !== 'undefined') {
    var grid = document.getElementById(itemKey + '-size-grid');
    if (grid) {
      grid.querySelectorAll('.size-btn, .size-pill').forEach(function (b) {
        b.classList.remove('selected');
        b.setAttribute('aria-pressed', 'false');
      });
    }
    if (btn && btn.classList) {
      btn.classList.add('selected');
      btn.setAttribute('aria-pressed', 'true');
    }
    var lbl = document.getElementById(itemKey + '-selected-size-label');
    if (lbl) lbl.textContent = size;
  }
}

/**
 * Adds an item variant (with selected size and optional custom text specification) into the shopping cart
 * @param {string} key
 * @param {string} [customSize]
 * @param {number} [quantity=1]
 * @param {string} [customText='']
 */
function addUniformToCart(key, customSize, quantity, customText) {
  if (_isSubmittingOrder) return;
  var item = UNIFORM_ITEMS.find(function (i) { return i.key === key; });
  if (!item) return;

  var sizes = getItemSizes(item);
  var size = sizes.length ? (customSize || itemSelectedSizes[key] || itemSizes[key] || '') : '';
  var qtyToAdd = quantity === undefined ? 1 : Number(quantity);
  if (!Number.isSafeInteger(qtyToAdd) || qtyToAdd < 1) return;
  customText = item.hasCustomText && typeof customText === 'string' ? sanitizeText(customText, 120) : '';
  var currentQty = uniformCart.filter(function(line) { return line.key === key; })
    .reduce(function(sum, line) { return sum + line.qty; }, 0);
  var error = uniformLineError(item, { size: size, customText: customText }, currentQty + qtyToAdd);
  if (error) {
    if (typeof showToast === 'function') showToast(error, 'warning');
    return;
  }

  var priceNum = uniformPriceInSen(item) / 100;
  var existing = uniformCart.find(function (ci) { return ci.key === key && ci.size === size && ci.customText === customText; });
  if (existing) {
    existing.qty += qtyToAdd;
  } else {
    uniformCart.push({
      id: crypto.randomUUID(),
      key: key,
      name: item.name,
      size: size || '',
      customText: customText || '',
      qty: qtyToAdd,
      price: priceNum
    });
  }

  // Synchronize legacy itemQtys and itemSizes for backward compatibility
  itemQtys[key] = uniformCart.filter(function (ci) { return ci.key === key; }).reduce(function (s, ci) { return s + ci.qty; }, 0);
  itemSizes[key] = size;

  // Visual button animation feedback
  if (typeof document !== 'undefined') {
    var btn = document.getElementById(key + '-add-btn');
    if (btn) {
      var origHtml = btn.innerHTML;
      btn.classList.add('added');
      btn.innerHTML = '✓ Added!';
      setTimeout(function () {
        if (btn) {
          btn.classList.remove('added');
          btn.innerHTML = origHtml;
        }
      }, 900);
    }
    var card = document.getElementById('ui-' + key);
    if (card) card.classList.add('has-qty');

    var inCartEl = document.getElementById(key + '-in-cart');
    if (inCartEl) {
      inCartEl.textContent = getProductInCartSummary(key);
      inCartEl.style.display = 'block';
    }
  }

  updateTotal();
  if (typeof showToast === 'function') {
    showToast('Added ' + item.name + (size ? ' (' + size + ')' : '') + ' to cart!', 'success', 1800);
  }
  return true;
}

/**
 * Updates quantity of a specific cart item
 * @param {string} cartId
 * @param {number} delta
 */
function updateCartItemQty(cartId, delta) {
  if (_isSubmittingOrder || !Number.isSafeInteger(delta)) return;
  var itemIndex = uniformCart.findIndex(function (ci) { return ci.id === cartId; });
  if (itemIndex === -1) return;

  var ci = uniformCart[itemIndex];
  if (delta > 0) {
    var product = UNIFORM_ITEMS.find(function(item) { return item.key === ci.key; });
    var total = uniformCart.filter(function(line) { return line.key === ci.key; })
      .reduce(function(sum, line) { return sum + line.qty; }, 0);
    var error = uniformLineError(product, ci, total + delta);
    if (error) {
      if (typeof showToast === 'function') showToast(error, 'warning');
      return;
    }
  }
  ci.qty += delta;

  if (ci.qty <= 0) {
    var removedKey = ci.key;
    uniformCart.splice(itemIndex, 1);
    // Sync legacy itemQtys
    itemQtys[removedKey] = uniformCart.filter(function (x) { return x.key === removedKey; }).reduce(function (s, x) { return s + x.qty; }, 0);
    if (itemQtys[removedKey] === 0) {
      delete itemSizes[removedKey];
      if (typeof document !== 'undefined') {
        var card = document.getElementById('ui-' + removedKey);
        if (card) card.classList.remove('has-qty');
        var inCartEl = document.getElementById(removedKey + '-in-cart');
        if (inCartEl) inCartEl.style.display = 'none';
      }
    } else if (typeof document !== 'undefined') {
      var inCartEl2 = document.getElementById(removedKey + '-in-cart');
      if (inCartEl2) inCartEl2.textContent = getProductInCartSummary(removedKey);
    }
  } else {
    itemQtys[ci.key] = uniformCart.filter(function (x) { return x.key === ci.key; }).reduce(function (s, x) { return s + x.qty; }, 0);
    if (typeof document !== 'undefined') {
      var inCartEl3 = document.getElementById(ci.key + '-in-cart');
      if (inCartEl3) inCartEl3.textContent = getProductInCartSummary(ci.key);
    }
  }

  updateTotal();
}

/**
 * Removes a specific item variant entirely from the cart
 * @param {string} cartId
 */
function removeUniformCartItem(cartId) {
  var item = uniformCart.find(function (ci) { return ci.id === cartId; });
  if (!item) return;
  updateCartItemQty(cartId, -item.qty);
}

/**
 * Clears all items from the uniform cart
 */
function clearUniformCart() {
  if (_isSubmittingOrder) return;
  uniformCart.length = 0;
  Object.keys(itemStagedQtys).forEach(function (k) { delete itemStagedQtys[k]; });
      UNIFORM_ITEMS.forEach(function (i) {
        itemQtys[i.key] = 0;
        delete itemSizes[i.key];
    if (typeof document !== 'undefined') {
      var el = document.getElementById(i.key + '-qty');
      if (el) el.textContent = '0';
      var card = document.getElementById('ui-' + i.key);
      if (card) card.classList.remove('has-qty');
      var inCartEl = document.getElementById(i.key + '-in-cart');
      if (inCartEl) inCartEl.style.display = 'none';
    }
  });
  updateTotal();
  if (typeof showToast === 'function') showToast('Cart cleared', 'info', 1200);
}

/**
 * Scrolls smoothly to the Cart section
 */
function scrollToCartSection() {
  if (typeof document === 'undefined') return;
  var el = document.getElementById('uniform-cart-section');
  if (el && el.scrollIntoView) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

/**
 * Renders the active cart section in the DOM
 */
function renderCartSection() {
  if (typeof document === 'undefined') return;
  var container = document.getElementById('uniform-cart-section');
  if (!container) return;

  if (!uniformCart.length) {
    container.style.display = 'none';
    container.innerHTML = '';
    return;
  }

  var totalCount = uniformCart.reduce(function (s, ci) { return s + ci.qty; }, 0);
  var rowsHtml = '';
  uniformCart.forEach(function (ci) {
    var product = UNIFORM_ITEMS.find(function(item) { return item.key === ci.key; });
    var price = product ? uniformPriceInSen(product) : null;
    var subtotal = price === null ? null : ci.qty * price / 100;
    rowsHtml += '<div class="cart-row" data-cart-id="' + escapeHtml(ci.id) + '">' +
      '<div class="cart-row-main">' +
      '<div class="cart-row-title">' + escapeHtml(ci.name) + '</div>' +
      '<div class="cart-row-details">' +
      (ci.size ? '<span class="cart-row-size-pill">Size: ' + escapeHtml(ci.size) + '</span>' : '') +
      (ci.customText ? '<span class="cart-row-size-pill" style="background:rgba(234,179,8,0.15);color:#f59e0b;border-color:rgba(234,179,8,0.3);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + escapeHtml(ci.customText) + '">Custom: ' + escapeHtml(ci.customText) + '</span>' : '') +
      '<span class="cart-row-price">' + (price === null ? 'Price unavailable' : 'RM ' + (price / 100).toFixed(2) + ' each') + '</span>' +
      '</div>' +
      '</div>' +
      '<div class="cart-row-actions">' +
      '<div class="cart-row-stepper">' +
      '<button type="button" class="cart-step-btn" onclick="updateCartItemQty(\'' + escapeHtml(ci.id) + '\', -1)" aria-label="Decrease quantity">&#8722;</button>' +
      '<span class="cart-step-qty">' + ci.qty + '</span>' +
      '<button type="button" class="cart-step-btn" onclick="updateCartItemQty(\'' + escapeHtml(ci.id) + '\', 1)" aria-label="Increase quantity">+</button>' +
      '</div>' +
      '<div class="cart-row-subtotal">' + (subtotal === null ? '—' : 'RM ' + subtotal.toFixed(2)) + '</div>' +
      '<button type="button" class="cart-row-remove-btn" onclick="removeUniformCartItem(\'' + escapeHtml(ci.id) + '\')" title="Remove item" aria-label="Remove item">' +
      '<svg class="ui-icon-xs" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
      '</button>' +
      '</div>' +
      '</div>';
  });

  container.innerHTML = '<div class="uniform-cart-card">' +
    '<div class="uniform-cart-header">' +
    '<div class="uniform-cart-title">' +
    '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>' +
    '<span>Your Cart</span>' +
    '<span class="cart-pill-count">' + totalCount + (totalCount === 1 ? ' item' : ' items') + '</span>' +
    '</div>' +
    '<button type="button" class="uniform-cart-clear-btn" onclick="clearUniformCart()">Clear All</button>' +
    '</div>' +
    '<div class="uniform-cart-table">' + rowsHtml + '</div>' +
    '</div>';
  container.style.display = 'block';
}

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
  var totalSen = 0;
  var totalCount = 0;
  getUniformCartLines().forEach(function(line) {
    if (!Number.isSafeInteger(line.qty) || line.qty < 1) return;
    var item = UNIFORM_ITEMS.find(function(product) { return product.key === line.key; });
    var sen = item ? uniformPriceInSen(item) : null;
    if (sen !== null) totalSen += line.qty * sen;
    totalCount += line.qty;
  });
  var total = totalSen / 100;

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

    renderCartSection();
  }
  return total;
}

/**
 * Adjusts quantity for a given uniform item key
 * @param {string} key
 * @param {number} delta
 */
function changeQty(key, delta) {
  if (_isSubmittingOrder || !Number.isSafeInteger(delta)) return;
  var item = UNIFORM_ITEMS.find(function(product) { return product.key === key; });
  if (!item) return;
  var current = itemQtys[key] || 0;
  if (delta > 0) {
    var increment = Math.min(delta, uniformQuantityLimit(item) - current);
    if (increment > 0) addUniformToCart(key, itemSizes[key], increment);
  } else {
    var remaining = Math.min(-delta, current);
    for (var i = uniformCart.length - 1; i >= 0 && remaining > 0; i--) {
      var line = uniformCart[i];
      if (line.key !== key) continue;
      var removed = Math.min(remaining, line.qty);
      updateCartItemQty(line.id, -removed);
      remaining -= removed;
    }
    if (!uniformCart.some(function(line) { return line.key === key; })) itemQtys[key] = 0;
    updateTotal();
  }
  if (typeof document !== 'undefined') {
    var qtyEl = document.getElementById(key + '-qty');
    if (qtyEl) qtyEl.textContent = itemQtys[key] || 0;
  }
}

/**
 * Selects a size for an item and updates button selected states
 * @param {string} item
 * @param {string} size
 * @param {HTMLElement} btn
 */
function selectSize(item, size, btn) {
  selectUniformCardSize(item, size, btn);
}

/**
 * Persists uniform item catalog definitions to Supabase bb_config
 */
async function saveUniformItems() {
  var client = getSupa();
  if (!client) return;

  if (client.recordConfigSnapshot) {
    client.recordConfigSnapshot('bb_uniform_items', UNIFORM_ITEMS);
  }
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem('bb_uniform_items_cache', JSON.stringify(UNIFORM_ITEMS));
    } catch (_) {}
  }

  if (typeof client.safeConfigUpdate === 'function') {
    try {
      var updated = await client.safeConfigUpdate('bb_uniform_items', UNIFORM_ITEMS, {
        idProp: 'key',
        enableMerge: false
      });
      if (updated && Array.isArray(updated) && updated.length === UNIFORM_ITEMS.length) {
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
  var client = getSupa();
  if (client && typeof client.getConfigSnapshot === 'function') {
    var snapPay = client.getConfigSnapshot('bb_payment_info');
    if (snapPay && typeof snapPay === 'string' && snapPay.trim()) {
      _paymentInfo = snapPay.trim();
      return _paymentInfo;
    }
  }
  if (client && client.get) {
    try {
      var rows = await client.get('bb_config?key=eq.bb_payment_info&select=value');
      if (rows && rows.length && rows[0].value && rows[0].value.trim()) {
        _paymentInfo = rows[0].value.trim();
        if (client.recordConfigSnapshot)
          client.recordConfigSnapshot('bb_payment_info', _paymentInfo);
      } else {
        // Fallback to default payment instructions when bb_payment_info is empty
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
  if (!await canWriteUniformAdmin()) return false;
  return saveUniformSetting('bb_payment_info', text);
}

async function saveUniformSetting(key, value) {
  var client = getSupa();
  if (!client) return false;
  try {
    if (typeof client.upsert === 'function') await client.upsert('bb_config', { key: key, value: value }, 'key');
    else await client.req('POST', 'bb_config?on_conflict=key', { key: key, value: value });
    if (typeof logAuditEvent === 'function') await logAuditEvent({
      action: 'config.uniform_update', targetType: 'config', targetId: key, actorRole: 'officer_admin'
    });
    return true;
  } catch (_) {
    if (typeof showToast === 'function') showToast('The uniform settings could not be saved.', 'error');
    return false;
  }
}

// ── Uniform Orders Schedule & Response Availability ─────────────────────────

/**
 * Loads uniform orders response availability and auto-schedule config from Supabase bb_config
 */
async function loadUniformOrdersSchedule() {
  var client = getSupa();
  if (client && typeof client.getConfigSnapshot === 'function') {
    var snap = client.getConfigSnapshot('bb_uniform_schedule');
    if (snap) {
      try {
        var parsed = typeof snap === 'string' ? JSON.parse(snap) : snap;
        if (parsed && typeof parsed === 'object') {
          _uniformOrdersSchedule = Object.assign({}, DEFAULT_UNIFORM_SCHEDULE, parsed);
          return _uniformOrdersSchedule;
        }
      } catch (e) {}
    }
  }
  if (client && client.get) {
    try {
      var rows = await client.get('bb_config?key=eq.bb_uniform_schedule&select=value');
      if (rows && rows.length && rows[0].value) {
        var val = rows[0].value;
        var parsedVal = typeof val === 'string' ? JSON.parse(val) : val;
        _uniformOrdersSchedule = Object.assign({}, DEFAULT_UNIFORM_SCHEDULE, parsedVal);
        if (client.recordConfigSnapshot) {
          client.recordConfigSnapshot('bb_uniform_schedule', _uniformOrdersSchedule);
        }
      } else {
        _uniformOrdersSchedule = Object.assign({}, DEFAULT_UNIFORM_SCHEDULE);
      }
    } catch (e) {
      _uniformOrdersSchedule = Object.assign({}, DEFAULT_UNIFORM_SCHEDULE);
    }
  } else {
    _uniformOrdersSchedule = Object.assign({}, DEFAULT_UNIFORM_SCHEDULE);
  }
  return _uniformOrdersSchedule;
}

/**
 * Persists uniform orders availability and schedule configuration to Supabase bb_config
 * @param {object} [scheduleData]
 */
async function saveUniformOrdersSchedule(scheduleData) {
  if (!await canWriteUniformAdmin()) return false;
  var payload = scheduleData || _uniformOrdersSchedule;
  if (!await saveUniformSetting('bb_uniform_schedule', JSON.stringify(payload))) return false;
  _uniformOrdersSchedule = Object.assign({}, payload);
  var client = getSupa();
  if (client && client.recordConfigSnapshot) client.recordConfigSnapshot('bb_uniform_schedule', payload);
  return true;
}

/**
 * Evaluates whether uniform orders are currently open, paused, or scheduled
 * @returns {{ open: boolean, reason: string, message: string }}
 */
function isUniformOrdersAcceptingResponses() {
  var s = _uniformOrdersSchedule || DEFAULT_UNIFORM_SCHEDULE;
  if (s.status === 'paused') {
    return {
      open: false,
      reason: 'paused',
      message: s.paused_message || 'Uniform orders are currently paused by the company administration. Please check back later.'
    };
  }
  var now = Date.now();
  if (s.open_at) {
    var openTime = new Date(s.open_at).getTime();
    if (!isNaN(openTime) && now < openTime) {
      var openFormatted = new Date(s.open_at).toLocaleString('en-MY', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      });
      return {
        open: false,
        reason: 'scheduled_future',
        message: s.paused_message || ('Uniform orders are scheduled to open on ' + openFormatted + '. Please check back then.')
      };
    }
  }
  if (s.close_at) {
    var closeTime = new Date(s.close_at).getTime();
    if (!isNaN(closeTime) && now > closeTime) {
      return {
        open: false,
        reason: 'scheduled_past',
        message: s.paused_message || 'Uniform orders are now closed. Please check back next term or contact the logistics officer.'
      };
    }
  }
  return { open: true, reason: 'active', message: '' };
}

/**
 * Saves availability schedule from the admin console input controls
 */
async function saveAdminUniformOrdersSchedule() {
  if (typeof document === 'undefined') return;
  var box = document.querySelector('.uo-schedule-box');
  if (!box) return;

  var activeRadio = box.querySelector('.uo-status-active-radio');
  var status = activeRadio && activeRadio.checked ? 'active' : 'paused';
  var openInput = box.querySelector('.uo-open-at-input');
  var closeInput = box.querySelector('.uo-close-at-input');
  var msgInput = box.querySelector('.uo-paused-msg-input');

  var openAt = openInput ? openInput.value.trim() : '';
  var closeAt = closeInput ? closeInput.value.trim() : '';
  var pausedMsg = msgInput ? (typeof sanitizeText === 'function' ? sanitizeText(msgInput.value, 500) : msgInput.value.trim()) : '';

  if (openAt && closeAt && new Date(openAt).getTime() >= new Date(closeAt).getTime()) {
    if (typeof showToast === 'function') {
      showToast('Auto-Open time must be before Auto-Close time.', 'warning');
    }
    return;
  }

  var updatedSchedule = {
    status: status,
    open_at: openAt,
    close_at: closeAt,
    paused_message: pausedMsg
  };

  if (!await saveUniformOrdersSchedule(updatedSchedule)) return;
  await renderUniformOrdersScheduleControls();

  if (typeof closeUniformScheduleModal === 'function') {
    closeUniformScheduleModal();
  }

  if (typeof showToast === 'function') {
    showToast('Uniform orders availability schedule saved!', 'success');
  }
}

/**
 * Toggles uniform ordering status between active and paused immediately
 */
async function toggleUniformOrdersStatus() {
  await loadUniformOrdersSchedule();
  var newStatus = _uniformOrdersSchedule.status === 'paused' ? 'active' : 'paused';
  if (!await saveUniformOrdersSchedule(Object.assign({}, _uniformOrdersSchedule, { status: newStatus }))) return;
  await renderUniformOrdersScheduleControls();

  if (typeof showToast === 'function') {
    showToast(
      'Uniform ordering is now ' + (newStatus === 'active' ? 'active (accepting orders)' : 'paused (closed to orders)'),
      newStatus === 'active' ? 'success' : 'warning'
    );
  }
}

/**
 * Populates admin schedule controls with current uniform orders schedule
 */
async function renderUniformOrdersScheduleControls() {
  if (typeof document === 'undefined') return;
  var box = document.querySelector('.uo-schedule-box');
  if (!box) return;

  await loadUniformOrdersSchedule();
  var s = _uniformOrdersSchedule || DEFAULT_UNIFORM_SCHEDULE;

  var activeRadio = box.querySelector('.uo-status-active-radio');
  var pausedRadio = box.querySelector('.uo-status-paused-radio');
  if (activeRadio && pausedRadio) {
    activeRadio.checked = s.status !== 'paused';
    pausedRadio.checked = s.status === 'paused';
  }

  var openInput = box.querySelector('.uo-open-at-input');
  var closeInput = box.querySelector('.uo-close-at-input');
  if (openInput) openInput.value = s.open_at || '';
  if (closeInput) closeInput.value = s.close_at || '';

  var msgInput = box.querySelector('.uo-paused-msg-input');
  if (msgInput) msgInput.value = s.paused_message || '';

  var avail = isUniformOrdersAcceptingResponses();
  var badge = box.querySelector('.uo-schedule-badge');
  var toggleBtn = box.querySelector('.uo-schedule-toggle-btn');

  if (badge) {
    if (!avail.open) {
      if (avail.reason === 'scheduled_future') {
        badge.textContent = 'SCHEDULED';
        badge.style.background = 'rgba(234,179,8,0.15)';
        badge.style.color = 'var(--brand-gold, #f5c542)';
        badge.style.border = '1px solid rgba(234,179,8,0.3)';
      } else if (avail.reason === 'scheduled_past') {
        badge.textContent = 'CLOSED';
        badge.style.background = 'rgba(239,68,68,0.15)';
        badge.style.color = '#ef4444';
        badge.style.border = '1px solid rgba(239,68,68,0.3)';
      } else {
        badge.textContent = 'PAUSED';
        badge.style.background = 'rgba(234,179,8,0.15)';
        badge.style.color = 'var(--brand-gold, #f5c542)';
        badge.style.border = '1px solid rgba(234,179,8,0.3)';
      }
    } else {
      badge.textContent = 'ACTIVE';
      badge.style.background = 'rgba(34,197,94,0.15)';
      badge.style.color = '#22c55e';
      badge.style.border = '1px solid rgba(34,197,94,0.3)';
    }
  }

  if (toggleBtn) {
    toggleBtn.textContent = s.status === 'paused' ? 'Resume Ordering' : 'Pause Ordering';
  }
}

// ── Order Flow & Member Access ─────────────────────────────────────────────

/**
 * Helper to check if a member rank qualifies as NCO
 * @param {string} rank
 * @returns {boolean}
 */
function isNCO(rank) {
  if (typeof isNcoRank === 'function') return isNcoRank(rank);
  if (typeof window !== 'undefined' && typeof window.isNcoRank === 'function') {
    return window.isNcoRank(rank);
  }
  var ncoRanks = ['Lance Corporal', 'Corporal', 'Sergeant', 'Staff Sergeant', 'Warrant Officer'];
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
  loadPrices();
  loadPaymentInfo();

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
  var client = getSupa();
  if (!client || !client.get) return;

  try {
    var data = await client.get('bb_members?or=(ic.eq.' + encodeURIComponent(ic) + ',email.eq.' + encodeURIComponent(ic) + ')&select=name,rank,squad');
    if (!data || !data.length) return;
    var m = data[0];

    if (typeof document !== 'undefined') {
      var nameEl = document.getElementById('order-member-name');
      var rankEl = document.getElementById('order-member-rank');
      var squadIl = document.getElementById('order-member-squad-inline');
      var squadEl = document.getElementById('order-member-squad');

      if (nameEl) nameEl.textContent = m.name;
      if (rankEl) rankEl.textContent = m.rank || '';
      if (typeof sessionSet === 'function' && sessionGet('rank') !== (m.rank || '')) sessionSet('rank', m.rank || '', { localOnly: true });
      if (squadIl) squadIl.textContent = m.squad ? m.squad + ' Platoon \xb7' : '';
      if (squadEl) squadEl.textContent = m.squad ? m.squad + ' Platoon' : '\u2014';

      // Load profile picture from Supabase Storage / member record
      try {
        var pfpUrl = (m && m.photo_url)
          ? ((typeof normalizeAvatarUrl === 'function') ? normalizeAvatarUrl(m.photo_url) : m.photo_url)
          : ((typeof getMemberAvatarUrl === 'function') ? getMemberAvatarUrl(m.name, ic) : null);
        if (!pfpUrl && typeof client.fileUrl === 'function') {
          pfpUrl = client.fileUrl('avatars', ic.replace(/[^a-zA-Z0-9@._-]/g, '_') + '.jpg', { private: false });
        }
        if (pfpUrl) {
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
          testImg.src = pfpUrl.includes('?') ? pfpUrl : (pfpUrl + '?t=' + Date.now());
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
    if (!/^[\w-]+$/.test(item.key)) return;
    var sizes = getItemSizes(item);
    var currentSize = itemSelectedSizes[item.key] || itemSizes[item.key] || '';
    if (!sizes.includes(currentSize)) currentSize = '';
    itemSelectedSizes[item.key] = currentSize;

    var sizeButtons = '';
    sizes.forEach(function (s) {
      var isSel = currentSize === s;
      sizeButtons +=
        '<button type="button" class="size-pill size-btn' +
        (isSel ? ' selected' : '') +
        '" data-size="' +
        escapeHtml(s) +
        '" aria-pressed="' + isSel + '" onclick="selectUniformCardSize(\'' +
        escapeHtml(item.key) + '\',this.dataset.size,this)">' +
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

    var price = uniformPriceInSen(item);
    var limit = uniformQuantityLimit(item);
    var staged = Math.min(itemStagedQtys[item.key] || 0, limit);
    itemStagedQtys[item.key] = staged;
    var priceLabel = !limit ? 'Out of stock' : price === null ? 'RM TBA' : 'RM ' + (price / 100).toFixed(2);
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
    var sizeWrap = sizes.length
      ? '<div class="product-size-section" id="' +
        escapeHtml(item.key) +
        '-size-wrap" style="display:block;">' +
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

    var customWrap = item.hasCustomText
      ? '<div class="product-custom-text-section" id="' +
        escapeHtml(item.key) +
        '-custom-text-wrap" style="display:block;margin-top:8px;">' +
        '<div class="size-pills-label" style="display:flex;align-items:center;gap:4px;font-size:11px;font-weight:600;color:var(--text-secondary);margin-bottom:4px;">' +
        '<span>' + escapeHtml(item.customPrompt || 'Specify details (e.g. Name, Badge):') + '</span>' +
        '<span style="color:var(--red);">*</span>' +
        '</div>' +
        '<input type="text" class="form-input form-input-sm product-custom-text-input" id="' +
        escapeHtml(item.key) +
        '-custom-text" placeholder="' +
        escapeHtml(item.customPrompt || 'Type name on tag or badge name...') +
        '" value="' +
        escapeHtml(itemCustomTexts[item.key] || '') +
        '" style="font-size:12px;padding:6px 10px;height:auto;width:100%;box-sizing:border-box;" oninput="onCustomTextChange(\'' +
        escapeHtml(item.key) +
        '\', this.value)"/>' +
        '</div>'
      : '';

    var matchCat = _activeUniformCategory === 'all' || cat === _activeUniformCategory;
    var inCartText = getProductInCartSummary(item.key);

    html +=
      '<div class="uniform-product-card uniform-item' +
      (currentQty > 0 ? ' has-qty' : '') + (staged > 0 ? ' has-staged-qty' : '') +
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
      customWrap +
      '</div>' +
      '<div class="product-card-footer">' +
      '<div class="product-card-in-cart" id="' + escapeHtml(item.key) + '-in-cart" style="display:' + (inCartText ? 'block' : 'none') + ';">' + escapeHtml(inCartText) + '</div>' +
      '<div class="product-card-action-row">' +
      '<div class="product-card-stepper qty-ctrl">' +
      '<button type="button" class="stepper-btn qty-btn" id="' + escapeHtml(item.key) + '-minus-btn" onclick="stepCardQty(\'' + escapeHtml(item.key) + '\',-1)" aria-label="Decrease quantity"' + (staged ? '' : ' disabled style="opacity:0.4;"') + '>&#8722;</button>' +
      '<div class="stepper-count qty-display" id="' + escapeHtml(item.key) + '-qty">' + staged + '</div>' +
      '<button type="button" class="stepper-btn qty-btn" id="' + escapeHtml(item.key) + '-plus-btn" onclick="stepCardQty(\'' + escapeHtml(item.key) + '\',1)" aria-label="Increase quantity"' + (!limit || price === null ? ' disabled' : '') + '>+</button>' +
      '</div>' +
      '<button type="button" class="add-to-cart-btn" id="' + escapeHtml(item.key) + '-add-btn" onclick="confirmAddToCart(\'' + escapeHtml(item.key) + '\')" style="display:' + (staged && price !== null ? 'inline-flex' : 'none') + ';">' +
      '<svg class="ui-icon-xs" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>' +
      '<span id="' + escapeHtml(item.key) + '-add-label">' + (staged ? 'Add ' + staged + ' to Cart' : 'Add to Cart') + '</span>' +
      '</button>' +
      '</div>' +
      '</div>' +
      '</div>';
  });

  container.innerHTML = html;
  updateTotal();
}

/**
 * Validates selected items and transitions user to the order review screen
 */
function goToOrderReview() {
  if (typeof document === 'undefined') return;
  if (_isSubmittingOrder) return;
  var cart;
  try {
    cart = readUniformCart();
  } catch (err) {
    if (typeof showToast === 'function') showToast(err.message, 'warning');
    return;
  }

  var html = '';
  cart.lines.forEach(function (l) {
    var customLabel = l.custom_text ? ' · "' + escapeHtml(l.custom_text) + '"' : '';
    html +=
      '<div class="review-row"><span class="review-label">' +
      escapeHtml(l.name) +
      '</span><span class="review-value">x' +
      escapeHtml(l.qty) +
      (l.size ? ' (' + escapeHtml(l.size) + ')' : '') +
      customLabel +
      ' — RM ' + (Math.round(l.price * 100) * l.qty / 100).toFixed(2) +
      '</span></div>';
  });

  html +=
    '<hr style="border:none;border-top:1px dashed #eee;margin:10px 0;"><div class="review-row"><span class="review-label">Total</span><span class="review-value" style="color:var(--accent);font-size:16px;">RM ' +
    cart.total.toFixed(2) +
    '</span></div>';

  var rc = document.getElementById('review-content');
  if (rc) {
    if (rc.dataset.orderItems !== JSON.stringify(cart.lines)) clearUniformPaymentProof();
    rc.innerHTML = html;
    rc.dataset.orderItems = JSON.stringify(cart.lines);
  }

  // Show payment instructions with fallback
  var pib = document.getElementById('payment-info-box');
  var pit = document.getElementById('payment-info-text');
  var instructions = _paymentInfo?.trim();
  var activeInstructions = instructions && !LEGACY_PAYMENT_INFO.includes(instructions) ? instructions : DEFAULT_PAYMENT_INFO;
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
  if (_isSubmittingOrder) return;
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
 * @param {number} [maxBytes] - Request a size-limited JPEG blob only
 * @returns {Promise<{blob: Blob|null, dataUrl: string}>}
 */
async function compressReceiptImage(source, maxDimension, quality, maxBytes) {
  maxDimension = maxDimension || 1200;
  quality = quality || 0.75;

  if (!source) return { blob: null, dataUrl: '' };

  // Validate security (blocks SVG, HTML)
  if (typeof validateFileSecurity === 'function' && typeof source !== 'string') {
    await validateFileSecurity(source, { allowedTypes: ['image/jpeg', 'image/png', 'image/webp'], bucket: 'receipts' });
  }

  // Headless / non-browser fallback
  if (typeof Image === 'undefined' || typeof document === 'undefined' || !document.createElement) {
    if (maxBytes) return { blob: null, dataUrl: '' };
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

        if (maxBytes) {
          if (!ctx || typeof canvas.toBlob !== 'function') {
            resolve({ blob: null, dataUrl: '' });
            return;
          }
          var qualities = [quality, 0.68, 0.55];
          var attempt = 0;
          var encode = function() {
            canvas.toBlob(function(blob) {
              if (blob && blob.type === 'image/jpeg' && blob.size > 0 && blob.size <= maxBytes) {
                resolve({ blob: blob, dataUrl: '' });
              } else if (++attempt < qualities.length) {
                encode();
              } else {
                resolve({ blob: null, dataUrl: '' });
              }
            }, 'image/jpeg', qualities[attempt]);
          };
          encode();
          return;
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
        if (maxBytes) {
          resolve({ blob: null, dataUrl: '' });
          return;
        }
        resolve({
          blob: typeof source !== 'string' ? source : null,
          dataUrl: typeof source === 'string' ? source : ''
        });
      }
    };

    img.onerror = function () {
      cleanup();
      resolve({
        blob: !maxBytes && typeof source !== 'string' ? source : null,
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
          resolve({ blob: maxBytes ? null : source, dataUrl: '' });
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
  if (!input || !input.files || !input.files[0]) return;
  var file = input.files[0];

  // Pre-validate file security
  if (typeof validateFileSecurity === 'function') {
    try {
      var ext = (file.name || '').split('.').pop().toLowerCase();
      if (ext === 'svg' || ext === 'html' || ext === 'htm') {
        if (typeof showToast === 'function') {
          showToast('Payment receipt must be a JPG, PNG, or WebP image. SVG and HTML are prohibited.', 'error');
        }
        input.value = '';
        return;
      }
    } catch (_) {}
  }
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

function renderUniformPaymentProof(status, state) {
  if (typeof document === 'undefined') return;
  var button = document.getElementById('confirm-btn');
  var label = document.getElementById('uniform-proof-status');
  if (button) button.disabled = _isSubmittingOrder || state === 'preparing';
  if (label) {
    label.textContent = status || '';
    label.dataset.state = state || '';
  }
}

function clearUniformPaymentProof() {
  _uniformPaymentProof = null;
  if (typeof document !== 'undefined') {
    var input = document.getElementById('uniform-proof-input');
    if (input) input.value = '';
  }
  renderUniformPaymentProof();
}

async function prepareUniformProofPdf(file) {
  if (file.size > UNIFORM_PROOF_FILE_MAX_BYTES) throw new Error('Choose a PDF receipt that is 10 MB or smaller.');
  var bytes = await Promise.all([file.slice(0, 5).text(), file.slice(-1024).text()]);
  if (bytes[0] !== '%PDF-' || !/%%EOF\s*$/.test(bytes[1])) throw new Error('Choose a valid PDF receipt from your bank.');
  return file.type === 'application/pdf' ? file : file.slice(0, file.size, 'application/pdf');
}

async function stageUniformPaymentProof(file) {
  if (_isSubmittingOrder) return false;
  if (!file) {
    clearUniformPaymentProof();
    return false;
  }
  var selection = { blob: null, member: sessionGet('ic') || sessionGet('email') };
  _uniformPaymentProof = selection;
  renderUniformPaymentProof('Preparing proof of payment…', 'preparing');
  var pdf = file.type === 'application/pdf' || (!file.type && /\.pdf$/i.test(file.name || ''));
  try {
    var blob;
    if (pdf) {
      blob = await prepareUniformProofPdf(file);
    } else if (file.size <= UNIFORM_PROOF_FILE_MAX_BYTES) {
      blob = (await compressReceiptImage(file, 1600, 0.82, UNIFORM_PROOF_MAX_BYTES)).blob;
    }
    if (_uniformPaymentProof !== selection) return false;
    if (!blob) throw new Error('Image could not be prepared.');
    selection.blob = blob;
    renderUniformPaymentProof((pdf ? 'PDF receipt ready' : 'Screenshot ready') + ' · ' + Math.ceil(blob.size / 1024) + ' KB', 'ready');
    return true;
  } catch (error) {
    if (_uniformPaymentProof === selection) {
      var message = pdf && error instanceof Error && error.message.startsWith('Choose')
        ? error.message : 'Choose a readable JPG, PNG, WebP or PDF file up to 10 MB.';
      renderUniformPaymentProof(message, 'error');
    }
    return false;
  }
}

/**
 * Submits finalized uniform order to Supabase bb_orders table
 */
async function submitOrder() {
  if (_isSubmittingOrder || _isPromptingUniformProof) return null;
  var availability = isUniformOrdersAcceptingResponses();
  if (!availability.open) {
    if (typeof showToast === 'function') showToast(availability.message || 'Uniform ordering is currently closed.', 'warning');
    return null;
  }

  var memberId = typeof sessionGet === 'function' ? (sessionGet('ic') || sessionGet('email')) : '';
  if (typeof memberId !== 'string' || !memberId.trim()) {
    if (typeof showToast === 'function') showToast('Please log in to submit an order.', 'warning');
    return null;
  }

  var cart;
  try {
    cart = readUniformCart();
  } catch (err) {
    if (typeof showToast === 'function') showToast(err.message, 'warning');
    return null;
  }
  var reviewed = typeof document !== 'undefined' ? document.getElementById('review-content') : null;
  if (reviewed && reviewed.dataset.orderItems && reviewed.dataset.orderItems !== JSON.stringify(cart.lines)) {
    goToOrderReview();
    if (typeof showToast === 'function') showToast('Your cart has changed. Review the updated order before confirming.', 'warning');
    return null;
  }

  var proof = _uniformPaymentProof;
  var proofInput = typeof document !== 'undefined' ? document.getElementById('uniform-proof-input') : null;
  if (!proof?.blob || proof.member !== memberId) {
    if (typeof showConfirmModal === 'function') {
      _isPromptingUniformProof = true;
      try {
        await showConfirmModal(UNIFORM_PROOF_REQUIRED, 'Proof of payment required', {
          confirmText: 'Choose file',
          cancelText: 'Back to review',
          onConfirm: function() { proofInput?.click?.(); }
        });
      } finally {
        _isPromptingUniformProof = false;
      }
    } else if (typeof showToast === 'function') {
      showToast(UNIFORM_PROOF_REQUIRED, 'warning');
    }
    return null;
  }
  var btn = typeof document !== 'undefined' ? document.getElementById('confirm-btn') : null;
  var lockButton = typeof withSmartButtonLock === 'function' ? withSmartButtonLock : require('../core/loading.js').withSmartButtonLock;
  _isSubmittingOrder = true;
  if (proofInput) proofInput.disabled = true;
  try {
    return await lockButton(btn, async function() {
      var client = getSupa();
      if (!client) throw new Error('Database client unavailable');
      var items = JSON.stringify(cart.lines);
      if (_pendingUniformOrder && _pendingUniformOrder.ic !== memberId) _pendingUniformOrder = null;
      if (_pendingUniformOrder && (_pendingUniformOrder.items !== items || _pendingUniformProof?.selection !== proof)) {
        var previousLookup = 'bb_orders?order_number=eq.' + encodeURIComponent(_pendingUniformOrder.order_number) + '&select=order_number';
        var previous = await client.get(previousLookup, { cache: false });
        if (!Array.isArray(previous)) throw new Error('Order could not be confirmed');
        var previousOrderNumber = _pendingUniformOrder.order_number;
        _pendingUniformOrder = null;
        if (previous.some(function(row) { return row.order_number === previousOrderNumber; })) {
          if (typeof showToast === 'function') showToast('Order ' + previousOrderNumber + ' was already saved. Review your current cart before confirming another order.', 'warning');
          if (typeof loadMemberOrders === 'function') loadMemberOrders();
          return null;
        }
      }

      if ((sessionGet('ic') || sessionGet('email')) !== memberId) return null;
      if (!isUniformOrdersAcceptingResponses().open) {
        if (typeof showToast === 'function') showToast('Uniform ordering has closed. Your cart is still available.', 'warning');
        return null;
      }
      var currentCart = readUniformCart();
      if (JSON.stringify(currentCart.lines) !== items) {
        if (typeof showToast === 'function') showToast('The catalog changed. Edit and review your order again.', 'warning');
        return null;
      }

      var wasPending = !!_pendingUniformOrder;
      var orderCode = wasPending && _pendingUniformOrder.order_number
        ? _pendingUniformOrder.order_number
        : 'BB-' + crypto.randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase();
      var orderRecord = _pendingUniformOrder || {
        order_number: orderCode,
        ic: memberId,
        email: (typeof sessionGet === 'function' ? sessionGet('email') : null) || (memberId.includes('@') ? memberId : null),
        member_name: (typeof sessionGet === 'function' ? sessionGet('name') : null) || memberId,
        rank: (typeof sessionGet === 'function' ? sessionGet('rank') : null) || '',
        squad: (typeof sessionGet === 'function' ? sessionGet('squad') : null) || '',
        items: items,
        total_amount: cart.total,
        notes: '',
        status: 'pending',
        created_at: new Date().toISOString()
      };
      _pendingUniformOrder = orderRecord;
      if (!wasPending) _pendingUniformProof = { selection: proof, uploaded: false };
      var lookup = 'bb_orders?order_number=eq.' + encodeURIComponent(orderRecord.order_number) + '&select=order_number';
      var saved = wasPending ? await client.get(lookup, { cache: false }) : [];
      if (!Array.isArray(saved)) throw new Error('Order could not be confirmed');
      if (!saved.some(function(row) { return row.order_number === orderRecord.order_number; })) {
        if (!_pendingUniformProof.uploaded) {
          try {
            await window.PortalWebPush.uploadPaymentProof(orderCode, memberId, proof.blob);
            _pendingUniformProof.uploaded = true;
          } catch (_) {
            renderUniformPaymentProof('Proof of payment could not be uploaded. Try submitting again.', 'error');
            if (typeof showToast === 'function') showToast('Your order is still in review.', 'warning');
            return null;
          }
        }
        if ((sessionGet('ic') || sessionGet('email')) !== memberId) return null;
        if (!isUniformOrdersAcceptingResponses().open || JSON.stringify(readUniformCart().lines) !== items) {
          if (typeof showToast === 'function') showToast('Order availability or the catalog has changed. Review your order again.', 'warning');
          return null;
        }
        var payload = Object.assign({}, orderRecord);
        delete payload.id;
        try {
          saved = typeof client.req === 'function'
            ? await client.req('POST', 'bb_orders', payload, null, { maxRetries: 0 })
            : await client.post('bb_orders', payload);
        } catch (postErr) {
          var postErrMsg = String(postErr && (postErr.message || postErr.code) || '');
          if (postErrMsg.includes('PGRST204') || postErrMsg.includes('42703') || postErrMsg.includes('total_amount')) {
            delete payload.total_amount;
            saved = typeof client.req === 'function'
              ? await client.req('POST', 'bb_orders', payload, null, { maxRetries: 0 })
              : await client.post('bb_orders', payload);
          } else {
            saved = await client.get(lookup, { cache: false });
          }
        }
        if (!Array.isArray(saved) || !saved.some(function(row) { return row.order_number === orderRecord.order_number; })) {
          saved = await client.get(lookup, { cache: false });
        }
        if (!Array.isArray(saved) || !saved.some(function(row) { return row.order_number === orderRecord.order_number; })) {
          throw new Error('Order could not be confirmed');
        }
        syncOrderToGoogleSheetsArchive(orderRecord, proof && proof.blob ? proof.blob : null);
      }
      _pendingUniformOrder = null;
      _pendingUniformProof = null;
      if ((sessionGet('ic') || sessionGet('email')) !== memberId) return orderRecord.order_number;

      clearUniformPaymentProof();
      uniformCart.length = 0;
      [itemQtys, itemSizes, itemSelectedSizes, itemStagedQtys, itemCustomTexts].forEach(function(values) {
        Object.keys(values).forEach(function(key) { delete values[key]; });
      });
      if (typeof document !== 'undefined') {
        var review = document.getElementById('step-review');
        if (review) review.style.display = 'none';
        var number = document.getElementById('s-ordernum');
        if (number) number.textContent = orderRecord.order_number;
        var sticky = document.getElementById('sticky-checkout-bar');
        if (sticky) sticky.style.display = 'none';
        var success = document.getElementById('order-success');
        if (success) {
          success.style.display = 'block';
          if (success.scrollIntoView) success.scrollIntoView({ behavior: 'smooth' });
        }
        renderOrderItems();
        updateTotal();
      }
      if (typeof loadMemberOrders === 'function') loadMemberOrders();
      if (typeof window !== 'undefined' && window.PortalRealtime && typeof window.PortalRealtime.broadcast === 'function') {
        window.PortalRealtime.broadcast('orders', 'insert', orderRecord);
      }
      return orderRecord.order_number;
    }, { loadingText: 'Submitting...', srLabel: 'Submitting uniform order...' });
  } catch (_) {
    if (typeof showToast === 'function') {
      showToast('The order could not be confirmed. Your cart is still available. Retry on this page or check your order history.', 'error');
    }
    return null;
  } finally {
    _isSubmittingOrder = false;
    if (proofInput) proofInput.disabled = false;
    var confirm = typeof document !== 'undefined' ? document.getElementById('confirm-btn') : null;
    if (confirm) confirm.disabled = false;
  }
}

/**
 * Renders uniform order forms inline inside the #inline-form-view container
 */
function renderUniformOrderInline() {
  if (typeof document === 'undefined') return;
  var container = document.getElementById('inline-form-view');
  if (!container) return;
  clearUniformPaymentProof();

  var avail = typeof isUniformOrdersAcceptingResponses === 'function'
    ? isUniformOrdersAcceptingResponses()
    : { open: true };

  if (!avail.open) {
    var badgeText = avail.reason === 'scheduled_future'
      ? 'Scheduled to Open'
      : (avail.reason === 'scheduled_past' ? 'Orders Closed' : 'Orders Paused');
    container.innerHTML =
      '<div class="dark-card" style="text-align:center;padding:40px 24px;">' +
      '<button onclick="backToFormsHub()" style="display:inline-flex;align-items:center;gap:6px;background:none;border:none;color:var(--text-secondary);font-family:var(--font-headline);font-size:13px;cursor:pointer;padding:0;margin-bottom:20px;">\u2039 Back to Forms</button>' +
      '<div style="width:56px;height:56px;border-radius:50%;background:rgba(234,179,8,0.12);color:var(--brand-gold);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;">' +
      '<svg class="ui-icon-lg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' +
      '</div>' +
      '<div class="page-title" style="margin-bottom:6px;">Uniform Order Form</div>' +
      '<div style="font-size:15px;color:#ffffff;font-weight:600;margin-bottom:16px;">' + badgeText + '</div>' +
      '<div style="font-size:14px;color:var(--text-secondary);line-height:1.75;max-width:480px;margin:0 auto 24px;white-space:pre-wrap;">' +
      (typeof escapeHtml === 'function' ? escapeHtml(avail.message) : avail.message) +
      '</div>' +
      '<button type="button" class="portal-btn portal-btn-secondary" onclick="backToFormsHub()" style="display:inline-flex;align-items:center;gap:6px;margin:0 auto;padding:8px 18px;font-size:13px;cursor:pointer;">' +
      'Return to Forms Hub</button>' +
      '</div>';
    return;
  }

  var categories = getUniformCategories(UNIFORM_ITEMS.filter(canOrderUniformItem));
  if (!Object.hasOwn(categories, _activeUniformCategory)) _activeUniformCategory = 'all';
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
    '<button onclick="backToFormsHub()" style="display:flex;align-items:center;gap:6px;background:none;border:none;color:var(--text-secondary);font-family:var(--font-headline);font-size:13px;cursor:pointer;padding:0;margin-bottom:16px;">\u2039 Back to Forms</button>' +
    '<div id="step-form">' +
    '<div class="dark-card" style="margin-bottom:14px;">' +
    '<div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">' +
    '<div style="width:40px;height:40px;border-radius:10px;background:rgba(217,163,35,0.15);color:var(--brand-gold, #f5c542);display:flex;align-items:center;justify-content:center;flex-shrink:0;">' +
    '<svg class="ui-icon-lg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>' +
    '</div>' +
    '<div>' +
    '<div class="page-title" style="margin:0;">Uniform Order Form</div>' +
    '<div class="page-subtitle" style="margin:0;">Store &amp; Order Form</div>' +
    '</div>' +
    '</div>' +
    '<div class="page-desc">Select products, customize sizes, and review your order</div>' +
    '<div class="note-box"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:-2px;margin-right:6px;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg> Orders are confirmed by the officer in charge. You will be contacted when ready.</div>' +
    catTabsHtml +
    '<div id="uniform-items" class="uniform-product-grid"></div>' +
    '<div id="uniform-grid-empty" style="display:none;text-align:center;padding:32px 16px;color:var(--text-muted);font-size:13px;background:var(--bg-card-subtle);border-radius:12px;margin-bottom:16px;">No products in this category.</div>' +
    '<div id="uniform-cart-section" class="uniform-cart-section" style="display:none;"></div>' +
    '<div class="total-row" style="margin-top:16px;display:none;"><div class="total-label">Estimated Total</div><div class="total-val" id="order-total">RM 0.00</div></div>' +
    '<div style="height:36px;"></div>' +
    '</div>' +
    '<div class="sticky-checkout-bar" id="sticky-checkout-bar">' +
    '<div class="checkout-bar-left">' +
    '<div class="checkout-summary-badge" id="checkout-summary-badge" onclick="scrollToCartSection()" style="cursor:pointer;" title="Click to view cart"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg><span id="checkout-items-count">0 items</span></div>' +
    '<div class="checkout-total-wrap"><span class="checkout-total-label">Total</span><span class="checkout-total-val" id="order-total-sticky">RM 0.00</span></div>' +
    '</div>' +
    '<button type="button" class="checkout-cta-btn" id="checkout-cta-btn" onclick="goToOrderReview()" disabled><span>Review Order</span><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg></button>' +
    '</div>' +
    '</div>' +
    '<div id="step-review" style="display:none;"><div class="dark-card">' +
    '<div class="page-title">Review</div><div class="page-subtitle">Your Order</div><div class="page-desc">Confirm details before submitting</div>' +
    '<div style="background:var(--bg-card-subtle);border:1px solid var(--border-card);border-radius:14px;padding:20px;margin-bottom:18px;" id="review-content"></div>' +
    '<div id="payment-info-box" style="display:none;background:rgba(245,197,66,0.08);border:1.5px solid rgba(245,197,66,0.3);border-radius:14px;padding:16px;margin-bottom:16px;">' +
    '<div style="font-family:var(--font-headline);font-size:14px;font-weight:600;color:var(--brand-gold);margin-bottom:8px;display:flex;align-items:center;gap:6px;"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg> Payment Instructions</div>' +
    '<div id="payment-info-text" style="font-size:13px;color:var(--text-secondary);line-height:1.75;white-space:pre-wrap;"></div>' +
    '</div>' +
    '<div class="uniform-payment-proof">' +
      '<label for="uniform-proof-input">Proof of payment <span>(required)</span></label>' +
      '<p id="uniform-proof-hint">JPG, PNG, WebP or PDF up to 10 MB.</p>' +
      '<input type="file" id="uniform-proof-input" accept="image/jpeg,image/png,image/webp,application/pdf,.pdf" aria-describedby="uniform-proof-hint uniform-proof-status" required>' +
      '<div id="uniform-proof-status" role="status"></div>' +
    '</div>' +
    '<div style="display:flex;gap:10px;"><button class="submit-btn danger btn-with-icon" style="flex:1;margin-top:0;justify-content:center;" onclick="goBackOrder()"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg> Edit</button><button type="button" class="submit-btn btn-with-icon" style="flex:2;margin-top:0;justify-content:center;" onclick="submitOrder()" id="confirm-btn"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg> Confirm &amp; Submit</button></div>' +
    '</div></div>' +
    '<div class="success-box" id="order-success" style="display:none;"><div class="s-icon"><svg class="ui-icon-lg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg></div><div class="s-title">Order Submitted!</div><div class="s-msg">Order <strong id="s-ordernum" style="color:var(--accent);"></strong> received! The officer will contact you when ready.</div></div>';

  container.querySelector?.('#uniform-proof-input')?.addEventListener('change', function(event) {
    stageUniformPaymentProof(event.target.files[0]);
  });
  renderOrderItems();
}

var _uniformProofPreviewCache = new Map();
var UNIFORM_PROOF_CACHE_TTL_MS = 95000;

function getCachedUniformProof(orderNumber, token) {
  if (!orderNumber || !token) return null;
  var entry = _uniformProofPreviewCache.get(orderNumber);
  if (!entry) return null;
  if (entry.token !== token || entry.expiresAt <= Date.now()) {
    _uniformProofPreviewCache.delete(orderNumber);
    return null;
  }
  return entry;
}

async function fetchUniformProofSigned(orderNumber, forceFresh) {
  if (!orderNumber || typeof window === 'undefined' || !window.PortalWebPush || typeof window.PortalWebPush.viewPaymentProof !== 'function') {
    return null;
  }
  var token = window.getAdminSessionToken?.();
  if (!token) return null;
  if (!forceFresh) {
    var cached = getCachedUniformProof(orderNumber, token);
    if (cached) return { url: cached.url, contentType: cached.contentType };
  }
  var result = await window.PortalWebPush.viewPaymentProof(orderNumber, token);
  if (result && typeof result.url === 'string') {
    _uniformProofPreviewCache.set(orderNumber, {
      url: result.url,
      contentType: result.contentType || 'image/jpeg',
      token: token,
      expiresAt: Date.now() + UNIFORM_PROOF_CACHE_TTL_MS
    });
    return result;
  }
  return null;
}

function getReceiptIconSvg() {
  return '<svg class="ui-icon-sm" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>';
}

function getZoomOverlayIconSvg() {
  return '<svg class="ui-icon-xs" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>';
}

function paymentProofButton(order, variant, totalFormatted) {
  var mode = variant === 'card' ? 'card' : 'table';
  if (!order || order.has_payment_proof !== true) {
    return mode === 'table' ? '<span class="uniform-proof-empty">—</span>' : '';
  }
  var orderNum = escapeHtml(order.order_number || '');
  var memberName = escapeHtml(order.member_name || order.ic || '');
  var totalStr = escapeHtml(totalFormatted || '');
  var cached = (typeof window !== 'undefined' && typeof window.getAdminSessionToken === 'function')
    ? getCachedUniformProof(order.order_number, window.getAdminSessionToken())
    : null;
  var isPdf = cached && cached.contentType === 'application/pdf';
  var isImg = cached && !isPdf && cached.url;
  var frameClass = 'uniform-proof-thumb-frame' + (isPdf ? ' is-pdf' : '');
  var frameInner = isImg
    ? '<img class="uniform-proof-thumb-img" src="' + escapeHtml(cached.url) + '" alt="Payment receipt for ' + orderNum + '" referrerpolicy="no-referrer" loading="lazy">' +
      '<span class="uniform-proof-thumb-zoom">' + getZoomOverlayIconSvg() + '</span>'
    : (isPdf
      ? getReceiptIconSvg() + '<span class="uniform-proof-pdf-tag">PDF</span>'
      : getReceiptIconSvg());
  var typeLabel = isPdf ? 'PDF' : (isImg ? 'Image' : 'Receipt');

  if (mode === 'card') {
    return (
      '<button type="button" class="uniform-proof-view uniform-proof-card-btn" data-uniform-proof="' + orderNum + '"' +
      ' data-proof-member="' + memberName + '" data-proof-total="' + totalStr + '" data-proof-variant="card"' +
      ' aria-label="View proof of payment for ' + orderNum + '">' +
        '<span class="' + frameClass + '" data-proof-preview-slot>' + frameInner + '</span>' +
        '<span class="uniform-proof-card-info">' +
          '<span class="uniform-proof-card-title-row">' +
            '<span class="uniform-proof-card-title">Proof of Payment</span>' +
            '<span class="uniform-proof-type-pill' + (isPdf ? ' is-pdf' : '') + '" data-proof-type-label>' + typeLabel + '</span>' +
          '</span>' +
          '<span class="uniform-proof-card-sub" data-proof-hint>' + (isPdf ? 'Click to open enlarged PDF viewer' : 'Click to enlarge and inspect receipt') + '</span>' +
        '</span>' +
        '<span class="uniform-proof-card-expand">' + getZoomOverlayIconSvg() + '<span>Enlarge</span></span>' +
      '</button>'
    );
  }

  return (
    '<button type="button" class="uniform-proof-view uniform-proof-thumb-btn" data-uniform-proof="' + orderNum + '"' +
    ' data-proof-member="' + memberName + '" data-proof-total="' + totalStr + '" data-proof-variant="table"' +
    ' aria-label="View proof of payment for ' + orderNum + '">' +
      '<span class="' + frameClass + '" data-proof-preview-slot>' + frameInner + '</span>' +
      '<span class="uniform-proof-thumb-meta">' +
        '<span class="uniform-proof-thumb-label" data-proof-type-label>' + typeLabel + '</span>' +
        '<span class="uniform-proof-thumb-hint" data-proof-hint>' + (isPdf ? 'View PDF' : 'Enlarge') + '</span>' +
      '</span>' +
    '</button>'
  );
}

function applyProofPreviewToButton(button, proofResult) {
  if (!button || !proofResult || !proofResult.url) return;
  var slot = button.querySelector('[data-proof-preview-slot]');
  var typeLabelEl = button.querySelector('[data-proof-type-label]');
  var hintEl = button.querySelector('[data-proof-hint]');
  var orderNum = button.getAttribute('data-uniform-proof') || '';
  var variant = button.getAttribute('data-proof-variant') || 'table';
  var isPdf = proofResult.contentType === 'application/pdf';
  button.setAttribute('data-proof-type', isPdf ? 'pdf' : 'image');

  if (slot) {
    slot.classList.toggle('is-pdf', isPdf);
    if (isPdf) {
      slot.innerHTML = getReceiptIconSvg() + '<span class="uniform-proof-pdf-tag">PDF</span>';
    } else {
      slot.innerHTML =
        '<img class="uniform-proof-thumb-img" alt="Payment receipt for ' + escapeHtml(orderNum) + '" referrerpolicy="no-referrer" loading="lazy">' +
        '<span class="uniform-proof-thumb-zoom">' + getZoomOverlayIconSvg() + '</span>';
      var img = slot.querySelector('img');
      if (img) {
        img.src = proofResult.url;
        img.addEventListener('error', function() {
          slot.innerHTML = getReceiptIconSvg();
        }, { once: true });
      }
    }
  }
  if (typeLabelEl) {
    typeLabelEl.textContent = isPdf ? 'PDF' : 'Image';
    if (typeLabelEl.classList) typeLabelEl.classList.toggle('is-pdf', isPdf);
  }
  if (hintEl) {
    if (variant === 'card') {
      hintEl.textContent = isPdf ? 'Click to open enlarged PDF viewer' : 'Click to enlarge and inspect receipt';
    } else {
      hintEl.textContent = isPdf ? 'View PDF' : 'Enlarge';
    }
  }
}

function hydrateUniformProofPreviews(container) {
  if (!container || typeof window === 'undefined' || !window.PortalWebPush || typeof window.PortalWebPush.viewPaymentProof !== 'function') {
    return;
  }
  var token = window.getAdminSessionToken?.();
  if (!token) return;
  var buttons = Array.from(container.querySelectorAll('[data-uniform-proof]'));
  if (!buttons.length) return;

  var pendingQueue = [];
  var activeCount = 0;
  var MAX_CONCURRENT = 3;
  var queuedButtons = new Set();

  function drainQueue() {
    while (activeCount < MAX_CONCURRENT && pendingQueue.length > 0) {
      var nextBtn = pendingQueue.shift();
      if (!nextBtn || !nextBtn.isConnected) continue;
      if (window.getAdminSessionToken?.() !== token) return;
      var orderNum = nextBtn.getAttribute('data-uniform-proof');
      if (!orderNum) continue;
      activeCount++;
      fetchUniformProofSigned(orderNum, false)
        .then(function(res) {
          if (res && nextBtn.isConnected && window.getAdminSessionToken?.() === token) {
            applyProofPreviewToButton(nextBtn, res);
          }
        })
        .catch(function() {})
        .finally(function() {
          activeCount--;
          drainQueue();
        });
    }
  }

  function enqueue(btn) {
    if (!btn || queuedButtons.has(btn)) return;
    queuedButtons.add(btn);
    var orderNum = btn.getAttribute('data-uniform-proof');
    var cached = getCachedUniformProof(orderNum, token);
    if (cached) {
      applyProofPreviewToButton(btn, cached);
      return;
    }
    pendingQueue.push(btn);
    drainQueue();
  }

  if (typeof IntersectionObserver === 'function' && buttons.length > 6) {
    var io = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          io.unobserve(entry.target);
          enqueue(entry.target);
        }
      });
    }, { rootMargin: '120px' });
    buttons.forEach(function(btn, idx) {
      var cached = getCachedUniformProof(btn.getAttribute('data-uniform-proof'), token);
      if (cached) applyProofPreviewToButton(btn, cached);
      else if (idx < 6) enqueue(btn);
      else io.observe(btn);
    });
  } else {
    buttons.forEach(enqueue);
  }
}

function attachDialogBackdropFallback(dialog) {
  if (!dialog || typeof HTMLDialogElement === 'undefined' || ('closedBy' in HTMLDialogElement.prototype)) return;
  var isOutside = function(e) {
    var r = dialog.getBoundingClientRect();
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  };
  var pressedOutside = false;
  dialog.addEventListener('pointerdown', function(e) { pressedOutside = isOutside(e); });
  dialog.addEventListener('pointerup', function(e) {
    if (pressedOutside && isOutside(e)) dialog.close();
  });
}

async function viewUniformPaymentProof(button) {
  var loadedResult = null;
  try {
    await withSmartButtonLock(button, async function() {
      var order = button.getAttribute('data-uniform-proof');
      var memberName = button.getAttribute('data-proof-member') || '';
      var totalLabel = button.getAttribute('data-proof-total') || '';
      var token = window.getAdminSessionToken?.();
      var result = await fetchUniformProofSigned(order, false);
      if (!result || !result.url) {
        result = await window.PortalWebPush.viewPaymentProof(order, token);
      }
      if (window.getAdminSessionToken?.() !== token || !button.isConnected) return;
      loadedResult = result;

      var isPdf = result.contentType === 'application/pdf';
      var safeFileName = String(order || 'payment-proof').replace(/[^A-Za-z0-9_-]/g, '_') + (isPdf ? '_receipt.pdf' : '_receipt.jpg');
      var pdfBlobUrl = null;
      var revokeDelayTimer = null;

      if (isPdf && typeof fetch === 'function' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
        try {
          var pdfResp = await fetch(result.url, { referrerPolicy: 'no-referrer' });
          if (pdfResp && pdfResp.ok) {
            var pdfBuf = await pdfResp.arrayBuffer();
            pdfBlobUrl = URL.createObjectURL(new Blob([pdfBuf], { type: 'application/pdf' }));
          }
        } catch (_) {
          pdfBlobUrl = null;
        }
      }

      var openUrl = pdfBlobUrl || result.url;
      var subParts = [];
      if (memberName) subParts.push(memberName);
      if (totalLabel) subParts.push(totalLabel);
      subParts.push(isPdf ? 'PDF Receipt' : 'Image Receipt');

      var dialog = document.createElement('dialog');
      dialog.className = 'uniform-proof-dialog';
      dialog.setAttribute('closedby', 'any');
      dialog.setAttribute('aria-labelledby', 'uniform-proof-dialog-title');

      var zoomControlsHtml = isPdf
        ? ''
        : '<button type="button" class="uniform-proof-tool-btn" data-proof-zoom-out aria-label="Zoom out">−</button>' +
          '<span class="uniform-proof-zoom-readout" data-proof-zoom-label>100%</span>' +
          '<button type="button" class="uniform-proof-tool-btn" data-proof-zoom-in aria-label="Zoom in">+</button>' +
          '<button type="button" class="uniform-proof-tool-btn" data-proof-zoom-reset aria-label="Reset zoom">Fit</button>';

      dialog.innerHTML =
        '<div class="uniform-proof-dialog-header">' +
          '<div class="uniform-proof-dialog-heading">' +
            '<h1 id="uniform-proof-dialog-title">Proof of Payment · ' + escapeHtml(order || '') + '</h1>' +
            '<div class="uniform-proof-dialog-sub">' + escapeHtml(subParts.join(' · ')) + '</div>' +
          '</div>' +
          '<div class="uniform-proof-dialog-actions">' +
            zoomControlsHtml +
            '<a class="uniform-proof-tool-btn" data-proof-open-tab target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">Open Tab</a>' +
            '<a class="uniform-proof-tool-btn" data-proof-download referrerpolicy="no-referrer">Download</a>' +
            '<form method="dialog"><button type="submit" class="portal-btn portal-btn-secondary" autofocus>Close</button></form>' +
          '</div>' +
        '</div>' +
        '<div class="uniform-proof-dialog-body">' +
          (isPdf
            ? (pdfBlobUrl
              ? '<iframe class="uniform-proof-pdf-frame" title="Payment receipt PDF for ' + escapeHtml(order || '') + '"></iframe>'
              : '<div class="uniform-proof-pdf-fallback">' +
                  getReceiptIconSvg() +
                  '<div><strong>PDF Receipt Ready</strong></div>' +
                  '<div>Click <strong>Download</strong> or <strong>Open Tab</strong> above to view this PDF receipt in full screen.</div>' +
                '</div>')
            : '<div class="uniform-proof-image-stage"><img class="uniform-proof-full-img" alt="Payment screenshot for ' + escapeHtml(order || '') + '" referrerpolicy="no-referrer"></div>') +
        '</div>' +
        '<div class="uniform-proof-dialog-footer">' +
          '<span>' + (isPdf ? 'Scroll or use the PDF toolbar to zoom and inspect transaction details.' : 'Click image or use + / − controls to zoom in on transaction details.') + '</span>' +
          '<span>Press Esc or click outside to close</span>' +
        '</div>';

      var openTabLink = dialog.querySelector('[data-proof-open-tab]');
      if (openTabLink) {
        openTabLink.href = openUrl;
        if (pdfBlobUrl) {
          openTabLink.addEventListener('click', function() {
            if (revokeDelayTimer) clearTimeout(revokeDelayTimer);
            revokeDelayTimer = setTimeout(function() {
              try { URL.revokeObjectURL(pdfBlobUrl); } catch (_) {}
              pdfBlobUrl = null;
            }, 60000);
          });
        }
      }
      var dlLink = dialog.querySelector('[data-proof-download]');
      if (dlLink) {
        dlLink.href = pdfBlobUrl || result.url;
        dlLink.download = safeFileName;
      }

      if (isPdf) {
        var iframe = dialog.querySelector('.uniform-proof-pdf-frame');
        if (iframe && pdfBlobUrl) {
          iframe.src = pdfBlobUrl;
        }
      } else {
        var image = dialog.querySelector('.uniform-proof-full-img');
        var zoomLabel = dialog.querySelector('[data-proof-zoom-label]');
        var zoomScale = 100;
        var applyZoom = function(nextZoom) {
          zoomScale = Math.max(100, Math.min(300, nextZoom));
          if (zoomLabel) zoomLabel.textContent = zoomScale + '%';
          if (image) {
            if (zoomScale === 100) {
              image.classList.remove('is-zoomed');
              image.style.width = '';
            } else {
              image.classList.add('is-zoomed');
              image.style.width = zoomScale + '%';
            }
          }
        };
        if (image) {
          image.src = result.url;
          image.addEventListener('click', function() {
            applyZoom(zoomScale > 100 ? 100 : 200);
          });
          image.addEventListener('error', function() {
            _uniformProofPreviewCache.delete(order);
            dialog.close();
            showToast('The payment screenshot could not be opened.', 'error');
          }, { once: true });
        }
        var zIn = dialog.querySelector('[data-proof-zoom-in]');
        var zOut = dialog.querySelector('[data-proof-zoom-out]');
        var zReset = dialog.querySelector('[data-proof-zoom-reset]');
        if (zIn) zIn.addEventListener('click', function() { applyZoom(zoomScale + 50); });
        if (zOut) zOut.addEventListener('click', function() { applyZoom(zoomScale - 50); });
        if (zReset) zReset.addEventListener('click', function() { applyZoom(100); });
      }

      attachDialogBackdropFallback(dialog);
      dialog.addEventListener('close', function() {
        dialog.returnValue = '';
        if (pdfBlobUrl && !revokeDelayTimer) {
          try { URL.revokeObjectURL(pdfBlobUrl); } catch (_) {}
          pdfBlobUrl = null;
        }
        dialog.remove();
      }, { once: true });
      document.body.appendChild(dialog);
      dialog.showModal();
    }, { loadingText: 'Opening…' });
    if (loadedResult && button && button.isConnected) {
      applyProofPreviewToButton(button, loadedResult);
    }
  } catch (_) {
    showToast('The proof of payment could not be opened. Check your admin session and try again.', 'error');
  }
}

// ── Admin Orders & Products Management ─────────────────────────────────────

/**
 * Handles tab switching in the Admin Uniform section (Products, Orders, Payment)
 * @param {string} sub
 */
function switchUniformSubtab(sub) {
  if (typeof document === 'undefined') return;
  if (typeof renderUniformOrdersScheduleControls === 'function') {
    renderUniformOrdersScheduleControls();
  }
  if (sub === 'payment') loadAndRenderPaymentEditor();
  ['products', 'orders', 'payment'].forEach(function (s) {
    var p = document.getElementById('subpanel-' + s);
    var b = document.getElementById('subtab-' + s);
    if (p) p.style.display = s === sub ? 'block' : 'none';
    if (b) b.classList.toggle('active-subtab', s === sub);
  });
  if (sub === 'products') {
    renderAdminProducts();
    loadPrices().then(renderAdminProducts);
  }
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
  if (!await savePaymentInfo(text)) return;
  _paymentInfo = text;
  if (typeof showToast === 'function') {
    showToast('Payment info saved! Members will see it on the order review page.', 'success');
  }
}

/**
 * Renders list of uniform orders in Admin console with search and status updater
 */
var _cachedAdminOrders = null;
var _cachedAdminOrdersTime = 0;
var ADMIN_ORDERS_CACHE_TTL = 30000;
var _adminOrdersViewMode = 'table';
var _adminOrdersMonthFilter = '';
var _cachedAdminOrdersList = [];
var _ordersSheetsArchiveUrl = '';
var _ordersReceiptsDriveFolder = '';
var ORDERS_RECEIPTS_DRIVE_FOLDER_KEY = 'bb_orders_receipts_drive_folder';

function parseUniformOrderItems(value) {
  return (typeof value === 'string' ? JSON.parse(value || '{}') : value) || {};
}

function storedUniformOrderLines(value) {
  return Object.entries(parseUniformOrderItems(value)).flatMap(function(entry) {
    var line = entry[1];
    if (!line || line.qty === undefined) return [];
    var qty = Number(line.qty);
    if (!Number.isSafeInteger(qty) || qty < 1) return [];
    var key = line.key || entry[0].split('__')[0];
    var product = UNIFORM_ITEMS.find(function(item) { return item.key === key; });
    var price = uniformPriceInSen({ key: key, price: line.price ?? product?.price });
    return [{ key: key, name: line.name || product?.name || key, qty: qty, size: line.size, custom_text: line.custom_text || line.customText, price: (price ?? 0) / 100 }];
  });
}

function orderArchiveRecord(order) {
  var lines = [];
  try {
    lines = storedUniformOrderLines(order.items);
  } catch (_) {}
  return {
    order_number: order.order_number,
    member_name: order.member_name,
    rank: order.rank,
    squad: order.squad,
    items: lines,
    total_price: order.total_amount ?? order.total_price ?? lines.reduce(function(sum, line) { return sum + Math.round(line.price * 100) * line.qty; }, 0) / 100,
    notes: order.notes,
    status: order.status,
    created_at: order.created_at
  };
}

function isUniformOrder(order) {
  if ((order.order_number || '').startsWith('FORM-') || order.payment_method === 'form_submission') return false;
  try {
    var items = parseUniformOrderItems(order.items);
    return !items.form_name && !items.form_id && !items.answers;
  } catch (_) {
    return false;
  }
}

function getUniformStatusOptions(status) {
  return Object.hasOwn(UNIFORM_ORDER_TRANSITIONS, status) ? [status].concat(UNIFORM_ORDER_TRANSITIONS[status]) : [];
}

/**
 * Loads configured Google Sheets permanent archive webhook URL from Supabase bb_config
 */
async function loadOrdersSheetsArchiveUrl() {
  if (_ordersSheetsArchiveUrl) return _ordersSheetsArchiveUrl;
  var client = getSupa();
  if (!client || !client.get) return '';
  try {
    var snap = (typeof client.getConfigSnapshot === 'function') ? client.getConfigSnapshot('bb_orders_sheets_url') : null;
    if (snap && typeof snap === 'string') {
      _ordersSheetsArchiveUrl = snap;
      return snap;
    }
    var rows = await client.get('bb_config?key=eq.bb_orders_sheets_url&select=value');
    if (Array.isArray(rows) && rows[0] && rows[0].value) {
      _ordersSheetsArchiveUrl = String(rows[0].value).trim();
      if (typeof client.recordConfigSnapshot === 'function') {
        client.recordConfigSnapshot('bb_orders_sheets_url', _ordersSheetsArchiveUrl);
      }
      return _ordersSheetsArchiveUrl;
    }
  } catch (e) {
    console.warn('loadOrdersSheetsArchiveUrl error:', e.message);
  }
  return '';
}

/**
 * Persists the Google Sheets permanent archive webhook URL to Supabase bb_config
 * @param {string} url
 */
async function saveOrdersSheetsArchiveUrl(url) {
  if (!await canWriteUniformAdmin()) return false;
  var cleanUrl = typeof url === 'string' ? url.trim() : '';
  if (!await saveUniformSetting('bb_orders_sheets_url', cleanUrl)) return false;
  _ordersSheetsArchiveUrl = cleanUrl;
  var client = getSupa();
  if (client && client.recordConfigSnapshot) client.recordConfigSnapshot('bb_orders_sheets_url', cleanUrl);
  return true;
}

/**
 * Extracts a Google Drive folder ID from a Drive folder URL or bare folder ID.
 * Supports /drive/folders/<id>, /drive/u/0/folders/<id>, /open?id=<id>, or bare IDs.
 * @param {string} rawInput
 * @returns {string}
 */
function extractGoogleDriveFolderId(rawInput) {
  var val = typeof rawInput === 'string' ? rawInput.trim() : '';
  if (!val) return '';
  if (/^[A-Za-z0-9_-]{10,80}$/.test(val)) return val;
  try {
    var parsed = new URL(val);
    if (!/(^|\.)drive\.google\.com$/i.test(parsed.hostname)) return '';
    var folderMatch = parsed.pathname.match(/\/folders\/([A-Za-z0-9_-]{10,80})/);
    if (folderMatch && folderMatch[1]) return folderMatch[1];
    var idParam = parsed.searchParams.get('id');
    if (idParam && /^[A-Za-z0-9_-]{10,80}$/.test(idParam)) return idParam;
  } catch (_) {}
  return '';
}

/**
 * Loads configured private Google Drive folder link/ID for uniform payment receipts from Supabase bb_config
 * @returns {Promise<string>}
 */
async function loadOrdersReceiptsDriveFolder() {
  if (_ordersReceiptsDriveFolder) return _ordersReceiptsDriveFolder;
  var client = getSupa();
  if (!client || !client.get) return '';
  try {
    var snap = (typeof client.getConfigSnapshot === 'function') ? client.getConfigSnapshot(ORDERS_RECEIPTS_DRIVE_FOLDER_KEY) : null;
    if (snap && typeof snap === 'string') {
      _ordersReceiptsDriveFolder = snap.trim();
      return _ordersReceiptsDriveFolder;
    }
    var rows = await client.get('bb_config?key=eq.' + ORDERS_RECEIPTS_DRIVE_FOLDER_KEY + '&select=value');
    if (Array.isArray(rows) && rows[0] && rows[0].value) {
      _ordersReceiptsDriveFolder = String(rows[0].value).trim();
      if (typeof client.recordConfigSnapshot === 'function') {
        client.recordConfigSnapshot(ORDERS_RECEIPTS_DRIVE_FOLDER_KEY, _ordersReceiptsDriveFolder);
      }
      return _ordersReceiptsDriveFolder;
    }
  } catch (e) {
    console.warn('loadOrdersReceiptsDriveFolder error:', e.message);
  }
  return '';
}

/**
 * Persists the private Google Drive folder link for uniform payment receipts to Supabase bb_config
 * @param {string} folderUrlOrId
 * @returns {Promise<boolean>}
 */
async function saveOrdersReceiptsDriveFolder(folderUrlOrId) {
  if (!await canWriteUniformAdmin()) return false;
  var raw = typeof folderUrlOrId === 'string' ? folderUrlOrId.trim() : '';
  var normalized = '';
  if (raw) {
    var folderId = extractGoogleDriveFolderId(raw);
    if (!folderId) {
      if (typeof showToast === 'function') {
        showToast('Please enter a valid Google Drive folder link (https://drive.google.com/drive/folders/...) or Folder ID.', 'warning');
      }
      return false;
    }
    normalized = 'https://drive.google.com/drive/folders/' + folderId;
  }
  if (!await saveUniformSetting(ORDERS_RECEIPTS_DRIVE_FOLDER_KEY, normalized)) return false;
  _ordersReceiptsDriveFolder = normalized;
  var client = getSupa();
  if (client && client.recordConfigSnapshot) client.recordConfigSnapshot(ORDERS_RECEIPTS_DRIVE_FOLDER_KEY, normalized);
  return true;
}

/**
 * Converts a payment proof Blob/File to a base64 JSON payload suitable for Apps Script Drive upload
 * @param {Blob} blob
 * @param {string} orderNum
 * @param {string} memberName
 * @returns {Promise<{base64: string, mimeType: string, fileName: string}|null>}
 */
async function blobToBase64Payload(blob, orderNum, memberName) {
  if (!blob) return null;
  var mimeType = (blob.type || 'image/jpeg').toLowerCase();
  var ext = mimeType === 'application/pdf' ? 'pdf' : (mimeType === 'image/png' ? 'png' : (mimeType === 'image/webp' ? 'webp' : 'jpg'));
  var safeOrder = String(orderNum || 'ORDER').replace(/[^A-Za-z0-9_-]/g, '_');
  var safeMember = String(memberName || 'Member').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'Member';
  var fileName = safeOrder + '_' + safeMember + '.' + ext;

  try {
    if (typeof FileReader !== 'undefined') {
      var dataUrl = await new Promise(function(resolve, reject) {
        var reader = new FileReader();
        reader.onload = function() { resolve(String(reader.result || '')); };
        reader.onerror = function() { reject(new Error('Failed to encode proof file')); };
        reader.readAsDataURL(blob);
      });
      var commaIdx = dataUrl.indexOf(',');
      if (commaIdx !== -1) {
        return { base64: dataUrl.slice(commaIdx + 1), mimeType: mimeType, fileName: fileName };
      }
    }
    if (typeof blob.arrayBuffer === 'function') {
      var bytes = new Uint8Array(await blob.arrayBuffer());
      var base64 = '';
      if (typeof Buffer !== 'undefined') {
        base64 = Buffer.from(bytes).toString('base64');
      } else if (typeof btoa === 'function') {
        var chunkSize = 0x8000;
        var chunks = [];
        for (var i = 0; i < bytes.length; i += chunkSize) {
          chunks.push(String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize)));
        }
        base64 = btoa(chunks.join(''));
      }
      if (base64) return { base64: base64, mimeType: mimeType, fileName: fileName };
    }
  } catch (e) {
    console.warn('blobToBase64Payload error:', e);
  }
  return null;
}

/**
 * Builds the production-ready Google Apps Script code with optional pre-filled private Drive folder ID
 * @param {string} [folderUrlOrId]
 * @returns {string}
 */
function buildUniformOrdersAppsScriptCode(folderUrlOrId) {
  var defaultFolderId = extractGoogleDriveFolderId(folderUrlOrId || '');
  return [
    '/**',
    ' * 1st Petaling Jaya Boys\' Brigade - Uniform Orders Google Sheets Sync & Private Drive Receipts',
    ' *',
    ' * Manages two sheets automatically and saves all proof-of-payment files (Images & PDFs)',
    ' * into your configured private Google Drive folder with clickable links in both sheets:',
    ' * 1. "Order Tracker": Live tracking sheet updated on status updates and cancellations.',
    ' * 2. "Order Archives": Permanent record of every order placed (all fields except Status).',
    ' *',
    ' * Setup Instructions:',
    ' * 1. In your Google Sheet, click Extensions > Apps Script.',
    ' * 2. Delete any code in the editor and paste this entire script.',
    ' * 3. Click "Deploy" > "New deployment".',
    ' * 4. Select type: "Web app".',
    ' * 5. Configuration:',
    ' *    - Description: "1st PJ BB Uniform Orders Sync"',
    ' *    - Execute as: "Me (your email)"',
    ' *    - Who has access: "Anyone"',
    ' * 6. Click "Deploy", authorize both Google Sheets and Google Drive permissions, and copy the Web App URL.',
    ' * 7. In the portal Admin Console > Uniform Orders > Settings, paste your Web App URL and Private Google Drive Folder link.',
    ' */',
    '',
    'var DEFAULT_RECEIPTS_DRIVE_FOLDER_ID = "' + defaultFolderId + '";',
    'var FALLBACK_RECEIPTS_FOLDER_NAME = "1st PJ BB Uniform Payment Receipts";',
    '',
    'function doPost(e) {',
    '  var lock = LockService.getScriptLock();',
    '  try {',
    '    lock.waitLock(30000);',
    '    var raw = e && e.postData ? e.postData.contents : "";',
    '    var data = JSON.parse(raw);',
    '    var ss = SpreadsheetApp.getActiveSpreadsheet();',
    '',
    '    var trackerHeaders = [',
    '      "Order Number", "Member Name", "Rank", "Squad", "Items Ordered", "Total Price (RM)", "Status", "Order Date", "Notes", "Proof of Payment"',
    '    ];',
    '    var archiveHeaders = [',
    '      "Order Number", "Member Name", "Rank", "Squad", "Items Ordered", "Total Price (RM)", "Order Date", "Notes", "Proof of Payment"',
    '    ];',
    '',
    '    var trackerSheet = getOrCreateSheet(ss, "Order Tracker", trackerHeaders);',
    '    var archiveSheet = getOrCreateSheet(ss, "Order Archives", archiveHeaders);',
    '',
    '    var action = data.action || "archive_order";',
    '    var driveFolderId = extractDriveFolderId(data.driveFolderId || data.driveFolderUrl || DEFAULT_RECEIPTS_DRIVE_FOLDER_ID);',
    '',
    '    if (action === "update_status" && data.orderNumber) {',
    '      updateOrderStatusInTracker(trackerSheet, data.orderNumber, data.status || "CANCELLED");',
    '    } else if (action === "archive_order" && data.order) {',
    '      recordSingleOrder(trackerSheet, archiveSheet, data.order, driveFolderId);',
    '    } else if (action === "sync_all_orders" && Array.isArray(data.orders)) {',
    '      data.orders.forEach(function(order) {',
    '        recordSingleOrder(trackerSheet, archiveSheet, order, driveFolderId);',
    '      });',
    '    }',
    '',
    '    return ContentService.createTextOutput(JSON.stringify({ status: "success", action: action }))',
    '      .setMimeType(ContentService.MimeType.JSON);',
    '  } catch (err) {',
    '    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))',
    '      .setMimeType(ContentService.MimeType.JSON);',
    '  } finally {',
    '    try { lock.releaseLock(); } catch (_) {}',
    '  }',
    '}',
    '',
    'function getOrCreateSheet(ss, name, headers) {',
    '  var sheet = ss.getSheetByName(name);',
    '  if (!sheet) {',
    '    sheet = ss.insertSheet(name);',
    '    sheet.appendRow(headers);',
    '    var range = sheet.getRange(1, 1, 1, headers.length);',
    '    range.setFontWeight("bold").setBackground("#1e293b").setFontColor("#ffffff");',
    '    sheet.setFrozenRows(1);',
    '    return sheet;',
    '  }',
    '  var lastCol = Math.max(sheet.getLastColumn(), 1);',
    '  var existing = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h) { return String(h || "").trim(); });',
    '  headers.forEach(function(h) {',
    '    if (existing.indexOf(h) === -1) {',
    '      var nextCol = existing.length + 1;',
    '      existing.push(h);',
    '      var cell = sheet.getRange(1, nextCol);',
    '      cell.setValue(h).setFontWeight("bold").setBackground("#1e293b").setFontColor("#ffffff");',
    '    }',
    '  });',
    '  return sheet;',
    '}',
    '',
    'function findColumnIndex(sheet, headerName, fallbackIndex) {',
    '  var lastCol = Math.max(sheet.getLastColumn(), 1);',
    '  var row1 = sheet.getRange(1, 1, 1, lastCol).getValues()[0];',
    '  for (var c = 0; c < row1.length; c++) {',
    '    if (String(row1[c] || "").trim().toLowerCase() === headerName.toLowerCase()) {',
    '      return c + 1;',
    '    }',
    '  }',
    '  return fallbackIndex;',
    '}',
    '',
    'function extractDriveFolderId(input) {',
    '  var val = String(input || "").trim();',
    '  if (!val) return "";',
    '  if (/^[A-Za-z0-9_-]{10,80}$/.test(val)) return val;',
    '  var m = val.match(/\\/folders\\/([A-Za-z0-9_-]{10,80})/) || val.match(/[?&]id=([A-Za-z0-9_-]{10,80})/);',
    '  return m ? m[1] : "";',
    '}',
    '',
    'function getOrCreateReceiptsFolder(driveFolderId) {',
    '  if (driveFolderId) {',
    '    try {',
    '      return DriveApp.getFolderById(driveFolderId);',
    '    } catch (_) {}',
    '  }',
    '  var it = DriveApp.getFoldersByName(FALLBACK_RECEIPTS_FOLDER_NAME);',
    '  if (it.hasNext()) return it.next();',
    '  return DriveApp.createFolder(FALLBACK_RECEIPTS_FOLDER_NAME);',
    '}',
    '',
    'function savePaymentProofToDrive(order, driveFolderId) {',
    '  var orderNum = String(order.order_number || "").trim();',
    '  if (!orderNum) return null;',
    '  if (order.payment_proof_url && /^https:\\/\\/drive\\.google\\.com\\//i.test(String(order.payment_proof_url))) {',
    '    return { url: String(order.payment_proof_url), label: "View Receipt" };',
    '  }',
    '  var proof = order.payment_proof;',
    '  if (!proof || !proof.base64) return null;',
    '  try {',
    '    var folder = getOrCreateReceiptsFolder(driveFolderId);',
    '    var mimeType = String(proof.mimeType || "image/jpeg").toLowerCase();',
    '    var isPdf = mimeType === "application/pdf";',
    '    var ext = isPdf ? "pdf" : (mimeType === "image/png" ? "png" : (mimeType === "image/webp" ? "webp" : "jpg"));',
    '    var safeMember = String(order.member_name || "Member").replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "Member";',
    '    var fileName = String(proof.fileName || (orderNum + "_" + safeMember + "." + ext)).replace(/[^A-Za-z0-9._-]/g, "_");',
    '    var existingFiles = folder.getFilesByName(fileName);',
    '    if (existingFiles.hasNext()) {',
    '      var existing = existingFiles.next();',
    '      return { url: existing.getUrl(), label: isPdf ? "View PDF Receipt" : "View Image Receipt" };',
    '    }',
    '    var bytes = Utilities.base64Decode(String(proof.base64));',
    '    var blob = Utilities.newBlob(bytes, mimeType, fileName);',
    '    var savedFile = folder.createFile(blob);',
    '    // Keeps file private — inherits the private Google Drive folder permissions (never public).',
    '    return { url: savedFile.getUrl(), label: isPdf ? "View PDF Receipt" : "View Image Receipt" };',
    '  } catch (_) {',
    '    return null;',
    '  }',
    '}',
    '',
    'function writeProofLinkCell(sheet, rowIndex, colIndex, proofLink) {',
    '  if (!proofLink || !proofLink.url || !rowIndex || !colIndex) return;',
    '  var rich = SpreadsheetApp.newRichTextValue()',
    '    .setText(proofLink.label || "View Receipt")',
    '    .setLinkUrl(proofLink.url)',
    '    .build();',
    '  sheet.getRange(rowIndex, colIndex).setRichTextValue(rich);',
    '}',
    '',
    'function formatItemsForSheet(rawItems) {',
    '  if (!rawItems) return "";',
    '  try {',
    '    var items = typeof rawItems === "string" ? JSON.parse(rawItems) : rawItems;',
    '    var list = [];',
    '    for (var k in items) {',
    '      var it = items[k];',
    '      var name = it.name || k.split("__")[0];',
    '      var qty = it.qty || 1;',
    '      var sz = it.size ? " (" + it.size + ")" : "";',
    '      list.push(name + " x" + qty + sz);',
    '    }',
    '    return list.join("; ");',
    '  } catch (_) {',
    '    return String(rawItems);',
    '  }',
    '}',
    '',
    'function formatPriceForSheet(order) {',
    '  if (order.total_price !== undefined && order.total_price !== null) {',
    '    return Number(order.total_price).toFixed(2);',
    '  }',
    '  var sum = 0;',
    '  try {',
    '    var items = typeof order.items === "string" ? JSON.parse(order.items) : (order.items || {});',
    '    for (var k in items) {',
    '      var it = items[k];',
    '      var qty = Number(it.qty) || 1;',
    '      var p = Number(it.price) || 0;',
    '      sum += qty * p;',
    '    }',
    '  } catch (_) {}',
    '  return sum.toFixed(2);',
    '}',
    '',
    'function recordSingleOrder(trackerSheet, archiveSheet, order, driveFolderId) {',
    '  var orderNum = String(order.order_number || "").trim();',
    '  if (!orderNum) return;',
    '  var member = order.member_name || order.ic || "";',
    '  var rank = order.rank || "";',
    '  var squad = order.squad ? (order.squad + " Platoon") : "";',
    '  var itemsStr = formatItemsForSheet(order.items);',
    '  var priceStr = formatPriceForSheet(order);',
    '  var status = String(order.status || "PENDING").toUpperCase();',
    '  var dateStr = order.created_at',
    '    ? new Date(order.created_at).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur" })',
    '    : new Date().toLocaleString("en-MY");',
    '  var notes = order.notes || "";',
    '  var proofLink = savePaymentProofToDrive(order, driveFolderId);',
    '',
    '  var archiveProofCol = findColumnIndex(archiveSheet, "Proof of Payment", 9);',
    '  var trackerStatusCol = findColumnIndex(trackerSheet, "Status", 7);',
    '  var trackerProofCol = findColumnIndex(trackerSheet, "Proof of Payment", 10);',
    '',
    '  // 1. Permanent Archive (Order Archives) - Append if new, backfill Drive link if previously empty',
    '  var archData = archiveSheet.getDataRange().getValues();',
    '  var archiveRow = -1;',
    '  for (var j = 1; j < archData.length; j++) {',
    '    if (String(archData[j][0]).trim().toUpperCase() === orderNum.toUpperCase()) {',
    '      archiveRow = j + 1;',
    '      break;',
    '    }',
    '  }',
    '  if (archiveRow < 0) {',
    '    archiveSheet.appendRow([orderNum, member, rank, squad, itemsStr, priceStr, dateStr, notes, ""]);',
    '    archiveRow = archiveSheet.getLastRow();',
    '  }',
    '  if (proofLink) {',
    '    var existingArchVal = String(archiveSheet.getRange(archiveRow, archiveProofCol).getValue() || "").trim();',
    '    if (!existingArchVal || existingArchVal === "—") {',
    '      writeProofLinkCell(archiveSheet, archiveRow, archiveProofCol, proofLink);',
    '    }',
    '  }',
    '',
    '  // 2. Live Tracker (Order Tracker) - Update status if existing, append if new, backfill Drive link',
    '  var trackerData = trackerSheet.getDataRange().getValues();',
    '  var trackerRow = -1;',
    '  for (var i = 1; i < trackerData.length; i++) {',
    '    if (String(trackerData[i][0]).trim().toUpperCase() === orderNum.toUpperCase()) {',
    '      trackerRow = i + 1;',
    '      break;',
    '    }',
    '  }',
    '  if (trackerRow > 0) {',
    '    trackerSheet.getRange(trackerRow, trackerStatusCol).setValue(status);',
    '  } else {',
    '    trackerSheet.appendRow([orderNum, member, rank, squad, itemsStr, priceStr, status, dateStr, notes, ""]);',
    '    trackerRow = trackerSheet.getLastRow();',
    '  }',
    '  if (proofLink) {',
    '    var existingTrackerVal = String(trackerSheet.getRange(trackerRow, trackerProofCol).getValue() || "").trim();',
    '    if (!existingTrackerVal || existingTrackerVal === "—") {',
    '      writeProofLinkCell(trackerSheet, trackerRow, trackerProofCol, proofLink);',
    '    }',
    '  }',
    '}',
    '',
    'function updateOrderStatusInTracker(trackerSheet, orderNumber, newStatus) {',
    '  var targetNum = String(orderNumber).trim().toUpperCase();',
    '  var statusCol = findColumnIndex(trackerSheet, "Status", 7);',
    '  var data = trackerSheet.getDataRange().getValues();',
    '  for (var i = 1; i < data.length; i++) {',
    '    if (String(data[i][0]).trim().toUpperCase() === targetNum) {',
    '      trackerSheet.getRange(i + 1, statusCol).setValue(String(newStatus).toUpperCase());',
    '      return true;',
    '    }',
    '  }',
    '  return false;',
    '}'
  ].join('\n');
}

/**
 * Production-ready Google Apps Script template for uniform orders synchronization
 */
var UNIFORM_ORDERS_APPS_SCRIPT_CODE = buildUniformOrdersAppsScriptCode('');

/**
 * Asynchronously synchronizes an individual order (and optional payment proof file) to Google Sheets + private Drive
 * @param {Object} orderRecord
 * @param {Blob} [proofBlob]
 */
async function syncOrderToGoogleSheetsArchive(orderRecord, proofBlob) {
  try {
    var url = await loadOrdersSheetsArchiveUrl();
    if (!url || !/^https?:\/\//i.test(url)) return;

    var driveFolderUrl = await loadOrdersReceiptsDriveFolder();
    var driveFolderId = extractGoogleDriveFolderId(driveFolderUrl);
    var archivedOrder = orderArchiveRecord(orderRecord);
    if (proofBlob) {
      var encodedProof = await blobToBase64Payload(proofBlob, orderRecord.order_number, orderRecord.member_name || orderRecord.ic);
      if (encodedProof) {
        archivedOrder.payment_proof = encodedProof;
      }
    }

    var payload = {
      action: 'archive_order',
      driveFolderId: driveFolderId || '',
      timestamp: new Date().toISOString(),
      order: archivedOrder
    };

    if (typeof fetch !== 'undefined') {
      fetch(url, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(function(err) {
        console.warn('Google Sheets archive sync fetch warning:', err);
      });
    }
  } catch (err) {
    console.warn('syncOrderToGoogleSheetsArchive error:', err);
  }
}

/**
 * Automatically notifies Google Sheet to update an order status or mark as cancelled
 * @param {string} orderNum
 * @param {string} status
 */
async function syncOrderStatusToGoogleSheet(orderNum, status) {
  try {
    var url = await loadOrdersSheetsArchiveUrl();
    if (!url || !/^https?:\/\//i.test(url)) return;

    var payload = {
      action: 'update_status',
      orderNumber: orderNum,
      status: (status || 'CANCELLED').toUpperCase(),
      timestamp: new Date().toISOString()
    };

    if (typeof fetch !== 'undefined') {
      fetch(url, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(function(err) {
        console.warn('Google Sheets status sync network warning:', err);
      });
    }
  } catch (err) {
    console.warn('syncOrderStatusToGoogleSheet error:', err);
  }
}

/**
 * Opens rich modal with setup instructions, Webhook URL & Private Google Drive Folder inputs, manual sync, and copyable Apps Script code
 */
async function configureAdminOrdersSheetUrl() {
  if (typeof document === 'undefined') return;
  var currentUrl = await loadOrdersSheetsArchiveUrl();
  var currentDriveFolder = await loadOrdersReceiptsDriveFolder();
  var currentDriveFolderId = extractGoogleDriveFolderId(currentDriveFolder);
  var generatedScriptCode = buildUniformOrdersAppsScriptCode(currentDriveFolderId);

  var overlay = document.createElement('div');
  overlay.className = 'portal-modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.style.zIndex = '9999';

  var isConfigured = Boolean(currentUrl && /^https?:\/\//i.test(currentUrl));
  var statusBadge = isConfigured
    ? '<span style="display:inline-flex;align-items:center;gap:5px;padding:3px 8px;border-radius:12px;font-size:11px;font-weight:700;background:rgba(16,185,129,0.15);color:var(--green,#10b981);border:1px solid rgba(16,185,129,0.3);"><span style="width:6px;height:6px;border-radius:50%;background:currentColor;"></span> Connected & Active</span>'
    : '<span style="display:inline-flex;align-items:center;gap:5px;padding:3px 8px;border-radius:12px;font-size:11px;font-weight:700;background:rgba(234,179,8,0.15);color:var(--brand-gold,#eab308);border:1px solid rgba(234,179,8,0.3);"><span style="width:6px;height:6px;border-radius:50%;background:currentColor;"></span> Not Configured</span>';

  var driveFolderStatusHtml = currentDriveFolderId
    ? '<span id="admin-orders-drive-status" style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;color:var(--green,#10b981);">✓ Private Drive Folder ID: <code>' + escapeHtml(currentDriveFolderId) + '</code></span>'
    : '<span id="admin-orders-drive-status" style="font-size:11px;color:var(--text-muted);">Using auto-created private folder: <strong>1st PJ BB Uniform Payment Receipts</strong></span>';

  var modal = document.createElement('div');
  modal.className = 'portal-modal-card';
  modal.style.maxWidth = '680px';
  modal.style.width = '95%';
  modal.style.maxHeight = '90vh';
  modal.style.overflowY = 'auto';

  modal.innerHTML =
    '<div class="portal-modal-header" style="display:flex;align-items:center;justify-content:space-between;padding-bottom:12px;border-bottom:1px solid var(--border-subtle);">' +
      '<div style="display:flex;align-items:center;gap:10px;">' +
        '<div style="width:36px;height:36px;border-radius:8px;background:var(--accent-soft, rgba(217,119,6,0.15));border:1px solid var(--accent-border, rgba(217,119,6,0.3));display:flex;align-items:center;justify-content:center;color:var(--brand-gold);">' +
          '<svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>' +
        '</div>' +
        '<div>' +
          '<h3 style="font-family:var(--font-headline);font-size:16px;margin:0;color:var(--text-primary);">Uniform Orders Google Sheets Sync &amp; Drive Receipts</h3>' +
          '<div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">Live sync for Order Tracker, Order Archives, and private Google Drive receipt links</div>' +
        '</div>' +
      '</div>' +
      statusBadge +
    '</div>' +
    '<div class="portal-modal-body" style="padding:14px 0;display:flex;flex-direction:column;gap:16px;">' +
      '<div>' +
        '<label for="admin-orders-sheet-url-input" style="display:block;font-size:12px;font-weight:700;color:var(--text-primary);margin-bottom:6px;">Google Sheets Web App URL (Webhook)</label>' +
        '<input type="url" id="admin-orders-sheet-url-input" class="form-input" value="' + (typeof escapeHtml === 'function' ? escapeHtml(currentUrl || '') : (currentUrl || '')) + '" placeholder="https://script.google.com/macros/s/.../exec" style="width:100%;font-size:12px;padding:8px 10px;height:38px;box-sizing:border-box;">' +
        '<div style="font-size:11px;color:var(--text-muted);margin-top:4px;">When configured, new orders, proof-of-payment links, status updates, and cancellations sync automatically to your Google Sheet.</div>' +
      '</div>' +

      '<div>' +
        '<label for="admin-orders-drive-folder-input" style="display:block;font-size:12px;font-weight:700;color:var(--text-primary);margin-bottom:6px;">Private Google Drive Folder Link (for Payment Receipts)</label>' +
        '<div style="display:flex;gap:8px;">' +
          '<input type="url" id="admin-orders-drive-folder-input" class="form-input" value="' + (typeof escapeHtml === 'function' ? escapeHtml(currentDriveFolder || '') : (currentDriveFolder || '')) + '" placeholder="https://drive.google.com/drive/folders/..." style="flex:1;font-size:12px;padding:8px 10px;height:38px;">' +
          '<button type="button" id="admin-orders-save-url-btn" class="portal-btn portal-btn-primary" style="font-size:12px;padding:8px 14px;height:38px;white-space:nowrap;">Save Settings</button>' +
        '</div>' +
        '<div style="margin-top:5px;">' + driveFolderStatusHtml + '</div>' +
        '<div style="font-size:11px;color:var(--text-muted);margin-top:3px;">Paste the link (or Folder ID) of the private Google Drive folder where image &amp; PDF proofs of payment will be saved. Receipts inherit your folder&rsquo;s private permissions (never shared publicly) and are linked in the <strong>Proof of Payment</strong> column of Google Sheets.</div>' +
      '</div>' +

      '<div style="background:var(--bg-card-subtle);border:1px solid var(--border-card);border-radius:10px;padding:12px 14px;">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:8px;">' +
          '<div style="font-weight:700;font-size:12px;color:var(--text-primary);">Manual Sync &amp; Receipt Backfill</div>' +
          '<button type="button" id="admin-orders-manual-sync-btn" class="portal-btn portal-btn-secondary" style="font-size:11px;padding:5px 10px;height:30px;display:inline-flex;align-items:center;gap:5px;">' +
            '<svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg> Sync All Current Records Now' +
          '</button>' +
        '</div>' +
        '<div style="font-size:11px;color:var(--text-secondary);line-height:1.5;">' +
          'Populates both <strong>Order Tracker</strong> and <strong>Order Archives</strong>, uploads any missing image/PDF proofs to your private Google Drive folder, and writes permanent clickable Drive links into the <strong>Proof of Payment</strong> column.' +
        '</div>' +
      '</div>' +

      '<div>' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">' +
          '<label style="font-size:12px;font-weight:700;color:var(--text-primary);">Google Apps Script Code</label>' +
          '<button type="button" id="admin-orders-copy-script-btn" class="portal-btn portal-btn-secondary" style="font-size:11px;padding:4px 10px;height:28px;display:inline-flex;align-items:center;gap:4px;">' +
            '<svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy Script Code' +
          '</button>' +
        '</div>' +
        '<div id="admin-orders-script-code-box" style="background:#0f172a;color:#f8fafc;border:1px solid var(--border-card);border-radius:8px;padding:12px;font-family:var(--font-body);font-variant-numeric:tabular-nums;font-size:11px;max-height:180px;overflow-y:auto;white-space:pre;line-height:1.4;">' +
          (typeof escapeHtml === 'function' ? escapeHtml(generatedScriptCode) : generatedScriptCode) +
        '</div>' +
      '</div>' +

      '<div style="font-size:11px;color:var(--text-secondary);line-height:1.6;background:var(--bg-card);border:1px solid var(--border-card);border-radius:8px;padding:10px 12px;">' +
        '<strong style="color:var(--text-primary);">Setup Instructions:</strong><br>' +
        '1. Open your target Google Sheet.<br>' +
        '2. In the menu, go to <strong>Extensions &gt; Apps Script</strong>.<br>' +
        '3. Replace the existing code with the script above (includes private Google Drive receipt upload).<br>' +
        '4. Click <strong>Deploy &gt; New deployment</strong> (or Manage deployments &rarr; New version), select <strong>Web app</strong>.<br>' +
        '5. Set <em>Execute as:</em> <strong>Me</strong> and <em>Who has access:</em> <strong>Anyone</strong>.<br>' +
        '6. Authorize both <strong>Google Sheets</strong> and <strong>Google Drive</strong> permissions when prompted.<br>' +
        '7. Paste the Web App URL and your Private Google Drive Folder link above, then click <strong>Save Settings</strong>.' +
      '</div>' +
    '</div>' +
    '<div class="portal-modal-actions" style="display:flex;justify-content:flex-end;gap:8px;padding-top:12px;border-top:1px solid var(--border-subtle);">' +
      '<button type="button" class="portal-btn portal-btn-secondary" id="admin-orders-close-modal-btn">Close</button>' +
    '</div>';

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  function closeModal() {
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
  }
  var closeBtn = modal.querySelector('#admin-orders-close-modal-btn');
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) closeModal();
  });

  var saveBtn = modal.querySelector('#admin-orders-save-url-btn');
  var urlInput = modal.querySelector('#admin-orders-sheet-url-input');
  var driveInput = modal.querySelector('#admin-orders-drive-folder-input');
  var driveStatusEl = modal.querySelector('#admin-orders-drive-status');
  var codeBox = modal.querySelector('#admin-orders-script-code-box');

  function getActiveScriptCode() {
    var folderVal = driveInput ? driveInput.value.trim() : currentDriveFolder;
    return buildUniformOrdersAppsScriptCode(folderVal);
  }

  if (driveInput) {
    driveInput.addEventListener('input', function() {
      var val = driveInput.value.trim();
      var parsedId = extractGoogleDriveFolderId(val);
      if (driveStatusEl) {
        if (!val) {
          driveStatusEl.style.color = 'var(--text-muted)';
          driveStatusEl.innerHTML = 'Using auto-created private folder: <strong>1st PJ BB Uniform Payment Receipts</strong>';
        } else if (parsedId) {
          driveStatusEl.style.color = 'var(--green,#10b981)';
          driveStatusEl.innerHTML = '✓ Private Drive Folder ID: <code>' + escapeHtml(parsedId) + '</code>';
        } else {
          driveStatusEl.style.color = 'var(--red,#ef4444)';
          driveStatusEl.textContent = 'Enter a valid Google Drive folder link (https://drive.google.com/drive/folders/...) or Folder ID.';
        }
      }
      if (codeBox) {
        codeBox.textContent = getActiveScriptCode();
      }
    });
  }

  if (saveBtn && urlInput) {
    saveBtn.addEventListener('click', async function() {
      await withSmartButtonLock(saveBtn, async function() {
        var val = (urlInput.value || '').trim();
        var driveVal = driveInput ? (driveInput.value || '').trim() : '';
        if (driveVal && !extractGoogleDriveFolderId(driveVal)) {
          if (typeof showToast === 'function') {
            showToast('Please enter a valid Google Drive folder link (https://drive.google.com/drive/folders/...) or Folder ID.', 'warning');
          }
          return;
        }
        var okUrl = await saveOrdersSheetsArchiveUrl(val);
        if (!okUrl) {
          if (typeof showToast === 'function') showToast('Failed to save Google Sheets URL to database.', 'error');
          return;
        }
        var okDrive = await saveOrdersReceiptsDriveFolder(driveVal);
        if (!okDrive) return;
        if (typeof showToast === 'function') {
          showToast('Google Sheets & private Google Drive receipt folder settings saved!', 'success');
        }
        closeModal();
      }, { loadingText: 'Saving…' });
    });
  }

  var copyBtn = modal.querySelector('#admin-orders-copy-script-btn');
  if (copyBtn) {
    copyBtn.addEventListener('click', function() {
      var scriptText = getActiveScriptCode();
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(scriptText).then(function() {
          copyBtn.innerHTML = '✓ Copied!';
          if (typeof showToast === 'function') showToast('Google Apps Script code copied to clipboard!', 'success');
          setTimeout(function() {
            copyBtn.innerHTML = '<svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy Script Code';
          }, 3000);
        }).catch(function() {
          if (typeof showToast === 'function') showToast('Could not copy automatically. Please select and copy manually.', 'warning');
        });
      }
    });
  }

  var manualSyncBtn = modal.querySelector('#admin-orders-manual-sync-btn');
  if (manualSyncBtn) {
    manualSyncBtn.addEventListener('click', function() {
      withSmartButtonLock(manualSyncBtn, function() {
        return syncAdminOrdersToGoogleSheet();
      }, { loadingText: 'Syncing…' });
    });
  }
}

/**
 * Synchronizes all currently loaded uniform orders (and their payment proof files) to Google Sheets + private Drive
 */
async function syncAdminOrdersToGoogleSheet() {
  var url = await loadOrdersSheetsArchiveUrl();
  if (!url || !/^https?:\/\//i.test(url)) {
    await configureAdminOrdersSheetUrl();
    url = await loadOrdersSheetsArchiveUrl();
    if (!url || !/^https?:\/\//i.test(url)) return;
  }

  if (!_cachedAdminOrdersList || !_cachedAdminOrdersList.length) {
    if (typeof showToast === 'function') showToast('No orders found to sync.', 'info');
    return;
  }

  var driveFolderUrl = await loadOrdersReceiptsDriveFolder();
  var driveFolderId = extractGoogleDriveFolderId(driveFolderUrl);

  if (typeof showToast === 'function') showToast('Syncing orders and payment proofs to Google Sheets & Drive...', 'info');

  try {
    var enrichedOrders = [];
    var proofAttachedCount = 0;
    for (var idx = 0; idx < _cachedAdminOrdersList.length; idx++) {
      var rawOrder = _cachedAdminOrdersList[idx];
      var record = orderArchiveRecord(rawOrder);
      if (rawOrder && rawOrder.has_payment_proof === true) {
        try {
          var signed = await fetchUniformProofSigned(rawOrder.order_number, false);
          if (signed && signed.url && typeof fetch === 'function') {
            var proofRes = await fetch(signed.url, { referrerPolicy: 'no-referrer' });
            if (proofRes && proofRes.ok) {
              var proofBlob = await proofRes.blob();
              var typedBlob = signed.contentType && proofBlob.type !== signed.contentType
                ? new Blob([proofBlob], { type: signed.contentType })
                : proofBlob;
              var encoded = await blobToBase64Payload(typedBlob, rawOrder.order_number, rawOrder.member_name || rawOrder.ic);
              if (encoded) {
                record.payment_proof = encoded;
                proofAttachedCount++;
              }
            }
          }
        } catch (proofErr) {
          console.warn('Could not attach proof for order ' + rawOrder.order_number + ':', proofErr);
        }
      }
      enrichedOrders.push(record);
    }

    // Batch requests to keep each POST comfortably within Apps Script payload & execution limits
    var MAX_BATCH_BYTES = 5 * 1024 * 1024;
    var MAX_BATCH_ORDERS = 5;
    var currentBatch = [];
    var currentBatchBytes = 0;

    async function flushBatch() {
      if (!currentBatch.length) return;
      var payload = {
        action: 'sync_all_orders',
        driveFolderId: driveFolderId || '',
        timestamp: new Date().toISOString(),
        orders: currentBatch
      };
      await fetch(url, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      currentBatch = [];
      currentBatchBytes = 0;
    }

    for (var b = 0; b < enrichedOrders.length; b++) {
      var item = enrichedOrders[b];
      var estBytes = item.payment_proof && item.payment_proof.base64 ? item.payment_proof.base64.length + 1024 : 1024;
      if (currentBatch.length > 0 && (currentBatch.length >= MAX_BATCH_ORDERS || (currentBatchBytes + estBytes) > MAX_BATCH_BYTES)) {
        await flushBatch();
      }
      currentBatch.push(item);
      currentBatchBytes += estBytes;
    }
    await flushBatch();

    if (typeof showToast === 'function') {
      var proofSuffix = proofAttachedCount > 0 ? (' (' + proofAttachedCount + ' receipt' + (proofAttachedCount === 1 ? '' : 's') + ' sent to Google Drive)') : '';
      showToast('Sync request sent for ' + enrichedOrders.length + ' order' + (enrichedOrders.length === 1 ? '' : 's') + proofSuffix + '. Confirm the result in Google Sheets.', 'success');
    }
  } catch (err) {
    console.error('syncAdminOrdersToGoogleSheet error:', err);
    if (typeof showToast === 'function') {
      showToast('The Google Sheets sync request could not be sent. Try again.', 'error');
    }
  }
}

/**
 * Exports currently filtered uniform orders to a 2-sheet workbook (Items Ordered & Items to Prepare)
 * Compatible with Google Sheets and Microsoft Excel
 * @param {Array} [ordersToExport]
 */
function exportAdminOrdersToCsv(ordersToExport) {
  var list = ordersToExport || _cachedAdminOrdersList || [];
  if (!list.length) {
    if (typeof showToast === 'function') showToast('No order records available to export.', 'warning');
    return;
  }

  var monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  var filterMonthLabel = _adminOrdersMonthFilter !== '' ? monthNames[parseInt(_adminOrdersMonthFilter, 10)] : 'All Months';

  function escapeXml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  // Aggregate items to prepare for Sheet 2
  var prepRows = [];
  var prepMergedList = [];
  var totalPrepItems = 0;
  var totalPrepValue = 0;

  var itemMap = {};
  list.forEach(function (o) {
    try {
      storedUniformOrderLines(o.items).forEach(function (v) {
        var displayName = v.name;
        var qty = v.qty;
        var sz = v.size || 'Standard';
        var val = qty * v.price;

        if (!itemMap[displayName]) itemMap[displayName] = {};
        if (!itemMap[displayName][sz]) itemMap[displayName][sz] = { count: 0, value: 0 };
        itemMap[displayName][sz].count += qty;
        itemMap[displayName][sz].value += val;

        totalPrepItems += qty;
        totalPrepValue += val;
      });
    } catch (_) {}
  });

  Object.entries(itemMap).forEach(function(entry) {
    var name = entry[0];
    var sizes = entry[1];
    Object.entries(sizes).forEach(function(sEntry) {
      var sz = sEntry[0];
      var data = sEntry[1];
      prepRows.push({
        item: name,
        size: sz === 'Standard' ? '—' : sz,
        count: data.count,
        value: data.value
      });
      prepMergedList.push(name + (sz !== 'Standard' ? ' (' + sz + ')' : ''));
    });
  });

  // Sheet 1: Items Ordered (<Month>)
  var sheet1Title = ('Items Ordered (' + filterMonthLabel + ')').slice(0, 31).replace(/[:\\\/\?\*\[\]]/g, '');

  var sheet1Headers = [
    'Order Number', 'Member Name', 'Rank', 'Squad', 'Items Ordered', 'Total Price (RM)', 'Status', 'Order Date', 'Notes', 'Proof of Payment'
  ];

  var s1RowsXml = '<Row ss:StyleID="Header">' +
    sheet1Headers.map(function(h) { return '<Cell><Data ss:Type="String">' + escapeXml(h) + '</Data></Cell>'; }).join('') +
  '</Row>';

  list.forEach(function(o) {
    var itemsFormatted = [];
    var totalPrice = 0;
    try {
      storedUniformOrderLines(o.items).forEach(function (v) {
        totalPrice += v.qty * v.price;
        itemsFormatted.push(v.name + ' x' + v.qty + (v.size ? ' (' + v.size + ')' : ''));
      });
    } catch (_) {}

    var dateStr = o.created_at ? new Date(o.created_at).toLocaleDateString('en-MY', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }) : '';

    s1RowsXml += '<Row>' +
      '<Cell><Data ss:Type="String">' + escapeXml(o.order_number || '') + '</Data></Cell>' +
      '<Cell><Data ss:Type="String">' + escapeXml(o.member_name || o.ic || '') + '</Data></Cell>' +
      '<Cell><Data ss:Type="String">' + escapeXml(o.rank || '') + '</Data></Cell>' +
      '<Cell><Data ss:Type="String">' + escapeXml(o.squad ? (o.squad + ' Platoon') : '') + '</Data></Cell>' +
      '<Cell><Data ss:Type="String">' + escapeXml(itemsFormatted.join('; ')) + '</Data></Cell>' +
      '<Cell><Data ss:Type="Number">' + totalPrice.toFixed(2) + '</Data></Cell>' +
      '<Cell><Data ss:Type="String">' + escapeXml((o.status || 'pending').toUpperCase()) + '</Data></Cell>' +
      '<Cell><Data ss:Type="String">' + escapeXml(dateStr) + '</Data></Cell>' +
      '<Cell><Data ss:Type="String">' + escapeXml(o.notes || '') + '</Data></Cell>' +
      '<Cell><Data ss:Type="String">' + (o.has_payment_proof === true ? 'Uploaded (see Google Drive / Portal)' : '—') + '</Data></Cell>' +
    '</Row>';
  });

  // Sheet 2: Items to Prepare
  var s2Headers = ['Item', 'Size', 'Count', 'Value'];
  var s2RowsXml = '<Row ss:StyleID="Header">' +
    s2Headers.map(function(h) { return '<Cell><Data ss:Type="String">' + escapeXml(h) + '</Data></Cell>'; }).join('') +
  '</Row>';

  prepRows.forEach(function(r) {
    s2RowsXml += '<Row>' +
      '<Cell><Data ss:Type="String">' + escapeXml(r.item) + '</Data></Cell>' +
      '<Cell><Data ss:Type="String">' + escapeXml(r.size) + '</Data></Cell>' +
      '<Cell><Data ss:Type="Number">' + r.count + '</Data></Cell>' +
      '<Cell><Data ss:Type="String">RM ' + r.value.toFixed(2) + '</Data></Cell>' +
    '</Row>';
  });

  // Footer row without merging: Column A has items list, Column B is empty, Column C has Total Items, Column D has Total Value
  s2RowsXml += '<Row ss:StyleID="Footer">' +
    '<Cell><Data ss:Type="String">' + escapeXml(prepMergedList.join(', ')) + '</Data></Cell>' +
    '<Cell><Data ss:Type="String"></Data></Cell>' +
    '<Cell><Data ss:Type="String">Total Items: ' + totalPrepItems + ' items</Data></Cell>' +
    '<Cell><Data ss:Type="String">Total Value: RM ' + totalPrepValue.toFixed(2) + '</Data></Cell>' +
  '</Row>';

  // Build full 2-sheet SpreadsheetML XML
  var xmlContent = '<?xml version="1.0"?>\r\n' +
    '<?mso-application progid="Excel.Sheet"?>\r\n' +
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"\r\n' +
    ' xmlns:o="urn:schemas-microsoft-com:office:office"\r\n' +
    ' xmlns:x="urn:schemas-microsoft-com:office:excel"\r\n' +
    ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"\r\n' +
    ' xmlns:html="http://www.w3.org/TR/REC-html40">\r\n' +
    ' <Styles>\r\n' +
    '  <Style ss:ID="Default" ss:Name="Normal">\r\n' +
    '   <Alignment ss:Vertical="Center"/>\r\n' +
    '   <Borders/>\r\n' +
    '   <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#000000"/>\r\n' +
    '   <Interior/>\r\n' +
    '   <NumberFormat/>\r\n' +
    '   <Protection/>\r\n' +
    '  </Style>\r\n' +
    '  <Style ss:ID="Header">\r\n' +
    '   <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#FFFFFF" ss:Bold="1"/>\r\n' +
    '   <Interior ss:Color="#1E293B" ss:Pattern="Solid"/>\r\n' +
    '   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>\r\n' +
    '  </Style>\r\n' +
    '  <Style ss:ID="Footer">\r\n' +
    '   <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#0F172A" ss:Bold="1"/>\r\n' +
    '   <Interior ss:Color="#F1F5F9" ss:Pattern="Solid"/>\r\n' +
    '   <Alignment ss:Vertical="Center"/>\r\n' +
    '  </Style>\r\n' +
    ' </Styles>\r\n' +
    ' <Worksheet ss:Name="' + escapeXml(sheet1Title) + '">\r\n' +
    '  <Table ss:DefaultColumnWidth="120">\r\n' +
    s1RowsXml + '\r\n' +
    '  </Table>\r\n' +
    ' </Worksheet>\r\n' +
    ' <Worksheet ss:Name="Items to Prepare">\r\n' +
    '  <Table ss:DefaultColumnWidth="120">\r\n' +
    s2RowsXml + '\r\n' +
    '  </Table>\r\n' +
    ' </Worksheet>\r\n' +
    '</Workbook>';

  var blob = new Blob([xmlContent], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  var fileMonthLabel = _adminOrdersMonthFilter !== '' ? ('_' + filterMonthLabel) : '_All';
  a.href = url;
  a.download = 'BB_Uniform_Orders' + fileMonthLabel + '_' + new Date().toISOString().slice(0, 10) + '.xls';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function() { URL.revokeObjectURL(url); }, 1000);

  if (typeof logAuditEvent === 'function') {
    logAuditEvent({
      action: 'order.export_csv',
      targetType: 'order',
      targetId: 'multiple',
      actorRole: 'officer_admin',
      details: { count: list.length, filter_month: filterMonthLabel }
    });
  }

  if (typeof showToast === 'function') {
    showToast('✓ Exported 2-sheet workbook (Items Ordered & Items to Prepare) for Google Sheets / Excel!', 'success');
  }
}

/**
 * Renders the aggregated Items to Prepare summary card or table at the bottom of uniform orders view
 * @param {Object} itemCounts - Key-value pair of uniform product name to count
 * @param {Object} sizeBreakdown - Breakdown of sizes per product
 * @param {number} totalItems - Sum of all item quantities
 * @param {number} totalRevenue - Sum of all order prices
 * @param {string} filterLabel - Current active filter label (e.g. 'November' or 'All Months')
 * @param {number} orderCount - Number of orders matching current filter
 * @param {string} [viewMode='cards'] - 'cards' or 'table'
 * @param {Object} [sizeValues] - Per-size monetary value breakdown
 * @returns {string} HTML string
 */
function renderOrdersPreparationSummaryHtml(itemCounts, sizeBreakdown, totalItems, totalRevenue, filterLabel, orderCount, viewMode, sizeValues) {
  var mode = viewMode || 'cards';
  var itemEntries = Object.entries(itemCounts || {}).sort(function(a, b) { return b[1] - a[1]; });

  var bodyHtml = '';

  if (!itemEntries.length) {
    bodyHtml = '<div style="font-size:12px;color:var(--text-muted);margin-top:8px;">No uniform items to prepare for this period.</div>';
  } else if (mode === 'table') {
    var tableRows = '';
    itemEntries.forEach(function(entry) {
      var name = entry[0];
      var sizes = (sizeBreakdown && sizeBreakdown[name]) ? sizeBreakdown[name] : null;
      var vals = (sizeValues && sizeValues[name]) ? sizeValues[name] : null;

      if (sizes && Object.keys(sizes).length > 0) {
        Object.entries(sizes).forEach(function(s) {
          var sz = s[0];
          var count = s[1];
          var val = vals && vals[sz] !== undefined ? vals[sz] : 0;
          tableRows +=
            '<tr>' +
              '<td style="font-weight:600;color:var(--text-primary);padding:8px 12px;">' + (typeof escapeHtml === 'function' ? escapeHtml(name) : name) + '</td>' +
              '<td style="color:var(--text-secondary);padding:8px 12px;">' + (sz === 'Standard' ? '—' : (typeof escapeHtml === 'function' ? escapeHtml(sz) : sz)) + '</td>' +
              '<td style="text-align:center;font-weight:600;color:var(--text-primary);padding:8px 12px;">' + count + '</td>' +
              '<td style="text-align:right;font-weight:700;color:var(--brand-gold);padding:8px 12px;white-space:nowrap;">RM ' + Number(val).toFixed(2) + '</td>' +
            '</tr>';
        });
      } else {
        var countSingle = entry[1];
        var valSingle = (vals && vals['Standard'] !== undefined) ? vals['Standard'] : 0;
        tableRows +=
          '<tr>' +
            '<td style="font-weight:600;color:var(--text-primary);padding:8px 12px;">' + (typeof escapeHtml === 'function' ? escapeHtml(name) : name) + '</td>' +
            '<td style="color:var(--text-secondary);padding:8px 12px;">—</td>' +
            '<td style="text-align:center;font-weight:600;color:var(--text-primary);padding:8px 12px;">' + countSingle + '</td>' +
            '<td style="text-align:right;font-weight:700;color:var(--brand-gold);padding:8px 12px;white-space:nowrap;">RM ' + Number(valSingle).toFixed(2) + '</td>' +
          '</tr>';
      }
    });

    bodyHtml =
      '<div class="table-wrapper" style="margin-top:12px;border:1px solid var(--border-card);border-radius:8px;overflow:hidden;">' +
        '<table class="orders-spreadsheet-table" style="margin:0;width:100%;">' +
          '<thead>' +
            '<tr style="background:var(--bg-card-subtle);">' +
              '<th style="padding:8px 12px;font-size:12px;text-align:left;">Item</th>' +
              '<th style="padding:8px 12px;font-size:12px;text-align:left;">Size</th>' +
              '<th style="padding:8px 12px;font-size:12px;text-align:center;">Count</th>' +
              '<th style="padding:8px 12px;font-size:12px;text-align:right;">Value</th>' +
            '</tr>' +
          '</thead>' +
          '<tbody>' +
            tableRows +
          '</tbody>' +
          '<tfoot>' +
            '<tr style="font-weight:700;background:var(--bg-card-subtle);border-top:2px solid var(--border-card);">' +
              '<td style="padding:10px 12px;"></td>' +
              '<td style="padding:10px 12px;"></td>' +
              '<td style="padding:10px 12px;text-align:center;color:var(--brand-gold);white-space:nowrap;">Total Items: ' + totalItems + ' items</td>' +
              '<td style="padding:10px 12px;text-align:right;color:var(--brand-gold);white-space:nowrap;">Total Value: RM ' + (typeof totalRevenue === 'number' ? totalRevenue.toFixed(2) : '0.00') + '</td>' +
            '</tr>' +
          '</tfoot>' +
        '</table>' +
      '</div>';
  } else {
    // Card view: same layout and ui, but no pill box (e.g. Boots: 6 items (UK 9: 4 | UK 8: 1, etc))
    bodyHtml = '<div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:12px;">' +
      itemEntries.map(function(entry) {
        var name = entry[0];
        var count = entry[1];
        var sizes = (sizeBreakdown && sizeBreakdown[name]) ? sizeBreakdown[name] : null;
        var sizeDetail = '';
        if (sizes) {
          var sizeParts = Object.entries(sizes).map(function(s) {
            return s[0] + ': ' + s[1];
          });
          if (sizeParts.length) {
            sizeDetail = ' <span style="font-weight:400;color:var(--text-secondary);font-size:12px;">(' + (typeof escapeHtml === 'function' ? escapeHtml(sizeParts.join(' | ')) : sizeParts.join(' | ')) + ')</span>';
          }
        }
        return '<div class="uniform-prep-chip" style="background:var(--bg-card-subtle);border:1px solid var(--border-card);border-radius:8px;padding:8px 12px;font-size:13px;display:inline-flex;align-items:center;gap:6px;">' +
          '<strong style="color:var(--text-primary);">' + (typeof escapeHtml === 'function' ? escapeHtml(name) : name) + ': ' + count + ' item' + (count === 1 ? '' : 's') + '</strong>' +
          sizeDetail +
        '</div>';
      }).join('') +
    '</div>';
  }

  return '<div class="uniform-preparation-summary-card">' +
    '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;border-bottom:1px solid var(--border-subtle);padding-bottom:10px;">' +
      '<div style="display:flex;align-items:center;gap:8px;">' +
        '<div style="width:32px;height:32px;border-radius:8px;background:var(--accent-soft, rgba(217,119,6,0.15));border:1px solid var(--accent-border, rgba(217,119,6,0.3));display:flex;align-items:center;justify-content:center;color:var(--brand-gold);">' +
          '<svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>' +
        '</div>' +
        '<div>' +
          '<div style="font-family:var(--font-headline);font-size:14px;font-weight:700;color:var(--text-primary);">' +
            'Items to Prepare Summary (' + (typeof escapeHtml === 'function' ? escapeHtml(filterLabel) : filterLabel) + ')' +
          '</div>' +
          '<div style="font-size:11px;color:var(--text-secondary);margin-top:1px;">' +
            'Aggregated totals across ' + orderCount + ' order' + (orderCount === 1 ? '' : 's') +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;">' +
        '<div style="font-size:12px;color:var(--text-secondary);">' +
          'Total Quantity: <strong style="color:var(--text-primary);font-size:14px;">' + totalItems + ' items</strong>' +
        '</div>' +
        '<div style="font-size:12px;color:var(--text-secondary);">' +
          'Total Value: <strong style="color:var(--brand-gold);font-size:14px;">RM ' + (typeof totalRevenue === 'number' ? totalRevenue.toFixed(2) : '0.00') + '</strong>' +
        '</div>' +
      '</div>' +
    '</div>' +
    bodyHtml +
  '</div>';
}

async function renderAdminOrders(forceRefresh) {
  if (typeof window !== 'undefined' && typeof window.hasAdminModuleAccess === 'function' && !window.hasAdminModuleAccess('uniform')) return;
  if (typeof document === 'undefined') return;
  var search = ((document.getElementById('admin-order-search') || {}).value || '').toLowerCase();
  var statusFilter = ((document.getElementById('admin-order-form-filter') || {}).value || '').toLowerCase();
  var list = document.getElementById('admin-orders-list');
  if (!list) return;

  list.innerHTML = (typeof renderSkeletonTable === 'function') ? renderSkeletonTable(6, 6) : '<div class="skeleton-shimmer" style="height:180px;border-radius:8px;"></div>';
  var client = getSupa();

  try {
    if (!client || !client.get) throw new Error('Database client unavailable');
    var now = Date.now();
    var orders;
    if (!forceRefresh && _cachedAdminOrders && (now - _cachedAdminOrdersTime < ADMIN_ORDERS_CACHE_TTL)) {
      orders = _cachedAdminOrders;
    } else {
      try {
        orders = await client.get('bb_orders?select=order_number,member_name,ic,rank,squad,created_at,status,items,notes,total_amount,has_payment_proof&order=created_at.desc', { cache: !forceRefresh });
      } catch (getErr) {
        var getErrMsg = String(getErr && (getErr.message || getErr.code) || '');
        if (getErrMsg.includes('42703') || getErrMsg.includes('PGRST204') || getErrMsg.includes('total_amount') || getErrMsg.includes('has_payment_proof')) {
          try {
            orders = await client.get('bb_orders?select=order_number,member_name,ic,rank,squad,created_at,status,items,notes,has_payment_proof&order=created_at.desc', { cache: !forceRefresh });
          } catch (getErr2) {
            var getErrMsg2 = String(getErr2 && (getErr2.message || getErr2.code) || '');
            if (getErrMsg2.includes('42703') || getErrMsg2.includes('PGRST204') || getErrMsg2.includes('has_payment_proof')) {
              orders = await client.get('bb_orders?select=order_number,member_name,ic,rank,squad,created_at,status,items,notes&order=created_at.desc', { cache: !forceRefresh });
            } else {
              throw getErr2;
            }
          }
        } else {
          throw getErr;
        }
      }
      if (Array.isArray(orders)) {
        _cachedAdminOrders = orders;
        _cachedAdminOrdersTime = now;
      } else {
        orders = [];
      }
    }

    // Only show uniform orders (filter out custom form submissions)
    var uniformOrders = orders.filter(isUniformOrder);

    var filtered = uniformOrders.filter(function (o) {
      var matchesSearch =
        (o.order_number || '').toLowerCase().includes(search) ||
        (o.member_name || '').toLowerCase().includes(search);
      var matchesStatus = !statusFilter || (o.status || '').toLowerCase() === statusFilter;
      var matchesMonth = true;
      if (_adminOrdersMonthFilter !== '' && o.created_at) {
        var d = new Date(o.created_at);
        matchesMonth = String(d.getMonth()) === String(_adminOrdersMonthFilter);
      }
      return matchesSearch && matchesStatus && matchesMonth;
    });

    _cachedAdminOrdersList = filtered;

    var SC = {
      pending: '#eab308',
      paid: '#34d399',
      processing: '#3b82f6',
      ready: '#10b981',
      completed: '#6b7280',
      collected: '#6b7280',
      cancelled: '#ef4444'
    };
    var monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    // Build the Admin Orders Control Toolbar (View Switcher, Month Filter, CSV Export, Sheets Sync)
    var monthOptionsHtml = '<option value="">All Months</option>' +
      monthNames.map(function(m, idx) {
        return '<option value="' + idx + '"' + (_adminOrdersMonthFilter === String(idx) ? ' selected' : '') + '>' + m + '</option>';
      }).join('');

    var toolbarHtml =
      '<div class="admin-orders-toolbar" style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px;flex-wrap:wrap;background:var(--bg-card);border:1px solid var(--border-card);border-radius:12px;padding:12px 14px;">' +
      '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
      '<div style="display:inline-flex;border-radius:8px;overflow:hidden;border:1px solid var(--border-card);background:var(--bg-card-subtle);">' +
      '<button type="button" class="orders-view-btn' + (_adminOrdersViewMode === 'table' ? ' active-view-btn' : '') + '" data-set-view="table" title="Spreadsheet Table View" style="border:none;border-radius:0;">' +
      '<svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/></svg> Table View' +
      '</button>' +
      '<button type="button" class="orders-view-btn' + (_adminOrdersViewMode === 'cards' ? ' active-view-btn' : '') + '" data-set-view="cards" title="Cards View" style="border:none;border-radius:0;">' +
      '<svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg> Cards View' +
      '</button>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:6px;">' +
      '<svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--text-secondary);"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' +
      '<select class="form-select admin-month-select" style="min-width:130px;font-size:12px;padding:6px 10px;height:34px;">' +
      monthOptionsHtml +
      '</select>' +
      '</div>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
      '<button type="button" class="portal-btn portal-btn-secondary" data-export-csv title="Export current orders to Google Sheets / Excel" style="display:inline-flex;align-items:center;gap:6px;font-size:12px;padding:6px 12px;height:34px;">' +
      '<svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Export to Sheets / CSV' +
      '</button>' +
      '<button type="button" class="portal-btn portal-btn-secondary" data-config-sheets title="Google Sheets Auto-Sync Settings & Apps Script Code" style="display:inline-flex;align-items:center;gap:6px;font-size:12px;padding:6px 10px;height:34px;">' +
      '<svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg> Settings' +
      '</button>' +
      '</div>' +
      '</div>';

    // Compute total items and per-item preparation summary
    var itemPreparationCounts = {};
    var itemSizeBreakdown = {};
    var itemSizeValues = {};
    var totalPreparationItems = 0;
    var totalOrderRevenue = 0;

    filtered.forEach(function (o) {
      if (['cancelled', 'collected', 'completed'].includes(o.status)) return;
      try {
        storedUniformOrderLines(o.items).forEach(function (v) {
          var displayName = v.name;
          var qty = v.qty;
          var val = qty * v.price;
          totalOrderRevenue += val;
          totalPreparationItems += qty;
          itemPreparationCounts[displayName] = (itemPreparationCounts[displayName] || 0) + qty;
          var sz = v.size || 'Standard';
          if (!itemSizeBreakdown[displayName]) itemSizeBreakdown[displayName] = {};
          itemSizeBreakdown[displayName][sz] = (itemSizeBreakdown[displayName][sz] || 0) + qty;
          if (!itemSizeValues[displayName]) itemSizeValues[displayName] = {};
          itemSizeValues[displayName][sz] = (itemSizeValues[displayName][sz] || 0) + val;
        });
      } catch (_) {}
    });

    var filterMonthLabel = _adminOrdersMonthFilter !== '' ? monthNames[parseInt(_adminOrdersMonthFilter, 10)] : 'All Months';

    var summaryHtml = renderOrdersPreparationSummaryHtml(
      itemPreparationCounts,
      itemSizeBreakdown,
      totalPreparationItems,
      totalOrderRevenue,
      filterMonthLabel,
      filtered.length,
      _adminOrdersViewMode,
      itemSizeValues
    );

    if (!filtered.length) {
      list.innerHTML = toolbarHtml +
        '<div style="color:var(--text-muted);text-align:center;padding:32px 20px;background:var(--bg-card);border:1px solid var(--border-card);border-radius:12px;">No uniform order records found for the selected month or search filter.</div>' +
        summaryHtml;
      attachToolbarEvents(list);
      return;
    }

    var contentHtml = '';

    // ── 1. SPREADSHEET / TABLE VIEW (Default) ─────────────────────────────
    if (_adminOrdersViewMode === 'table') {
      var rowsHtml = '';
      filtered.forEach(function (o) {
        var itemsDisplay = '';
        var total = 0;
        try {
          var itemParts = [];
          storedUniformOrderLines(o.items).forEach(function (v) {
            total += v.qty * v.price;
            var customBadge = v.custom_text ? ' <span style="display:inline-block;background:rgba(234,179,8,0.15);color:#f59e0b;border:1px solid rgba(234,179,8,0.3);padding:1px 6px;border-radius:4px;font-size:10px;font-weight:600;">Custom: ' + escapeHtml(v.custom_text) + '</span>' : '';
            itemParts.push(escapeHtml(v.name) + ' ×' + escapeHtml(v.qty) + (v.size ? ' (' + escapeHtml(v.size) + ')' : '') + customBadge);
          });
          itemsDisplay = itemParts.join('<br>');
        } catch (_) {}

        var status = o.status || 'pending';
        var sc = SC[status] || '#888';
        var created = o.created_at
          ? new Date(o.created_at).toLocaleDateString('en-MY', {
              day: 'numeric',
              month: 'short',
              year: 'numeric'
            })
          : '—';

        var statusOptions = getUniformStatusOptions(status);
        var statusSelectOptions = (statusOptions.length ? statusOptions : ['']).map(function(s) {
          return '<option value="' + s + '"' + (s === status ? ' selected' : '') + '>' + s.toUpperCase() + '</option>';
        }).join('');

        var formattedTotal = 'RM ' + total.toFixed(2);
        rowsHtml +=
          '<tr>' +
          '<td style="font-weight:700;font-family:var(--font-headline);color:var(--brand-gold);white-space:nowrap;">' +
          escapeHtml(o.order_number) +
          '</td>' +
          '<td>' +
          '<div style="font-weight:600;color:var(--text-primary);">' + escapeHtml(o.member_name || o.ic) + '</div>' +
          '<div style="font-size:11px;color:var(--text-secondary);">' + escapeHtml(o.rank || '') + (o.squad ? ' · ' + escapeHtml(o.squad) + ' Platoon' : '') + '</div>' +
          '</td>' +
          '<td style="font-size:12px;line-height:1.6;color:var(--text-secondary);">' + (itemsDisplay || '—') + '</td>' +
          '<td style="font-weight:700;color:var(--brand-gold);white-space:nowrap;">' + formattedTotal + '</td>' +
          '<td style="font-size:12px;color:var(--text-secondary);white-space:nowrap;">' + created + '</td>' +
          '<td style="white-space:nowrap;">' + paymentProofButton(o, 'table', formattedTotal) + '</td>' +
          '<td>' +
          '<select data-order-num="' + escapeHtml(o.order_number) + '" aria-label="Order status" class="admin-table-status-select"' + (statusOptions.length < 2 ? ' disabled' : '') + ' style="font-size:11px;font-weight:700;padding:4px 8px;border-radius:6px;border:1px solid ' + sc + '66;background:' + sc + '22;color:' + sc + ';cursor:pointer;font-family:var(--font-headline);">' +
          statusSelectOptions +
          '</select>' +
          '</td>' +
          '<td style="text-align:right;white-space:nowrap;">' +
          '<button data-del-sub="' + escapeHtml(o.order_number) + '" title="Delete this order record" style="background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.25);color:var(--red);padding:5px 9px;border-radius:6px;cursor:pointer;font-size:11px;font-weight:600;display:inline-flex;align-items:center;gap:4px;">' +
          '<svg class="ui-icon-xs" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg> Delete' +
          '</button>' +
          '</td>' +
          '</tr>';
      });

      var tfootHtml =
        '<tfoot>' +
        '<tr style="font-weight:700;background:var(--bg-card-subtle);border-top:2px solid var(--border-card);">' +
        '<td colspan="2" style="color:var(--text-primary);padding:10px 12px;">Total Items to Prepare (' + escapeHtml(filterMonthLabel) + '):</td>' +
        '<td style="color:var(--brand-gold);padding:10px 12px;font-weight:700;">' + totalPreparationItems + ' item' + (totalPreparationItems === 1 ? '' : 's') + '</td>' +
        '<td style="color:var(--brand-gold);padding:10px 12px;white-space:nowrap;font-weight:700;">RM ' + totalOrderRevenue.toFixed(2) + '</td>' +
        '<td colspan="4" style="color:var(--text-muted);font-size:11px;padding:10px 12px;">Across ' + filtered.length + ' order' + (filtered.length === 1 ? '' : 's') + '</td>' +
        '</tr>' +
        '</tfoot>';

      contentHtml =
        '<div tabindex="0" role="region" aria-label="Uniform Orders Table" class="table-wrapper orders-table-wrapper">' +
        '<table class="orders-spreadsheet-table">' +
        '<thead>' +
        '<tr>' +
        '<th scope="col">Order #</th>' +
        '<th scope="col">Member</th>' +
        '<th scope="col">Items Ordered</th>' +
        '<th scope="col">Total</th>' +
        '<th scope="col">Date</th>' +
        '<th scope="col">Receipt</th>' +
        '<th scope="col">Status</th>' +
        '<th scope="col" style="text-align:right;">Actions</th>' +
        '</tr>' +
        '</thead>' +
        '<tbody>' +
        rowsHtml +
        '</tbody>' +
        tfootHtml +
        '</table>' +
        '</div>';
    } else {
      // ── 2. CARDS VIEW ───────────────────────────────────────────────────
      var cardsHtml = '';
      filtered.forEach(function (o) {
        var itemsDisplay = '';
        var total = 0;
        try {
          storedUniformOrderLines(o.items).forEach(function (v) {
            total += v.qty * v.price;
            var customBadge = v.custom_text ? ' <span style="display:inline-block;background:rgba(234,179,8,0.15);color:#f59e0b;border:1px solid rgba(234,179,8,0.3);padding:1px 6px;border-radius:4px;font-size:10px;font-weight:600;">Custom: ' + escapeHtml(v.custom_text) + '</span>' : '';
            itemsDisplay +=
              '<div style="font-size:12px;color:var(--text-secondary);">' +
              escapeHtml(v.name) +
              ' ×' +
              escapeHtml(v.qty) +
              (v.size ? ' (' + escapeHtml(v.size) + ')' : '') +
              customBadge +
              '</div>';
          });
        } catch (_) {}

        var status = o.status || 'pending';
        var sc = SC[status] || '#888';
        var created = o.created_at
          ? new Date(o.created_at).toLocaleDateString('en-MY', {
              day: 'numeric',
              month: 'short',
              year: 'numeric'
            })
          : '';

        var btns = getUniformStatusOptions(status).map(function (s) {
          var active = s === status;
          return (
            '<button data-order-num="' +
            escapeHtml(o.order_number) +
            '" data-order-status="' +
            s +
            '"' + (active ? ' disabled' : '') + ' style="padding:3px 10px;border:1.5px solid ' +
            (active ? SC[s] : 'var(--border-card)') +
            ';border-radius:6px;background:' +
            (active ? SC[s] + '22' : 'transparent') +
            ';color:' +
            (active ? SC[s] : 'var(--text-secondary)') +
            ";font-size:11px;font-weight:700;cursor:pointer;font-family:var(--font-headline);\">" +
            s +
            '</button>'
          );
        }).join('');

        var cardTotalFormatted = 'RM ' + total.toFixed(2);
        cardsHtml +=
          '<div style="background:var(--bg-card);border-radius:12px;padding:14px 16px;margin-bottom:10px;border:1px solid var(--border-card);">' +
          '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">' +
          '<div><div style="font-family:var(--font-headline);font-size:15px;font-weight:700;color:var(--text-primary);">' +
          escapeHtml(o.order_number) +
          '</div>' +
          '<div style="font-size:11px;color:var(--text-secondary);">' +
          escapeHtml(o.member_name || o.ic) +
          ' · ' +
          escapeHtml(o.rank || '') +
          ' · ' +
          created +
          '</div></div>' +
          '<div style="text-align:right;">' +
          '<div style="font-size:11px;font-weight:600;padding:3px 10px;border-radius:20px;background:' +
          sc +
          '22;color:' +
          sc +
          ';border:1px solid ' +
          sc +
          "44;font-family:var(--font-headline);margin-bottom:4px;\">" +
          escapeHtml(status.toUpperCase()) +
          '</div>' +
          '<div style="font-size:12px;font-weight:700;color:var(--brand-gold);">' + cardTotalFormatted + '</div>' +
          '</div></div>' +
          '<div style="margin-bottom:4px;">' +
          itemsDisplay +
          '</div>' +
          (o.notes
            ? '<div style="font-size:11px;color:var(--text-muted);margin:6px 0;"><strong>Notes:</strong> ' +
              (typeof sanitizeHtml === 'function' ? sanitizeHtml(o.notes) : escapeHtml(o.notes)) +
              '</div>'
            : '') +
          paymentProofButton(o, 'card', cardTotalFormatted) +
          '<div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:10px;">' +
          btns +
          '<button data-del-sub="' +
          escapeHtml(o.order_number) +
          '" title="Delete submission" style="margin-left:auto;background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);color:var(--red);padding:3px 10px;border-radius:6px;cursor:pointer;font-size:11px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>' +
          '</div></div>';
      });
      contentHtml = cardsHtml;
    }

    list.innerHTML = toolbarHtml + contentHtml + summaryHtml;
    attachToolbarEvents(list);
    list.querySelectorAll('[data-uniform-proof]').forEach(function(button) {
      button.addEventListener('click', function() { viewUniformPaymentProof(button); });
    });
    hydrateUniformProofPreviews(list);

    // Bind status button clicks
    list.querySelectorAll('[data-order-status]').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        await withSmartButtonLock(btn, function() {
          return updateOrderStatus(btn.getAttribute('data-order-num'), btn.getAttribute('data-order-status'));
        });
        await renderAdminOrders(true);
      });
    });

    // Bind table status select changes
    list.querySelectorAll('.admin-table-status-select').forEach(function (sel) {
      sel.addEventListener('change', async function () {
        sel.disabled = true;
        await updateOrderStatus(sel.getAttribute('data-order-num'), sel.value);
        await renderAdminOrders(true);
      });
    });

    // Bind delete order buttons
    list.querySelectorAll('[data-del-sub]').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        var orderNum = btn.getAttribute('data-del-sub');
        var ok =
          typeof showConfirmModal === 'function'
            ? await showConfirmModal('Delete order ' + orderNum + '? In Google Sheets, this order will be automatically marked as CANCELLED in Order Tracker, while permanently preserved in Order Archives.', 'Delete Uniform Order', { isDestructive: true, confirmText: 'Delete' })
            : true;
        if (!ok || !await canWriteUniformAdmin()) return;

        client
          .delete(
            'bb_orders?order_number=eq.' + encodeURIComponent(orderNum)
          )
          .then(function () {
            syncOrderStatusToGoogleSheet(orderNum, 'CANCELLED');
            _cachedAdminOrders = null;
            renderAdminOrders(true);
            if (typeof showToast === 'function') showToast('Order record deleted.', 'info');
          })
          .catch(function (e) {
            if (typeof showToast === 'function') showToast('Failed: ' + e.message, 'error');
          });
      });
    });
  } catch (e) {
    console.error('renderAdminOrders error:', e);
    list.innerHTML =
      '<div class="admin-error-card" style="text-align:center;padding:32px 20px;background:var(--bg-card);border:1px solid var(--border-card);border-radius:12px;color:var(--text-secondary);">' +
      '<div style="font-size:24px;margin-bottom:6px;">⚠️</div>' +
      '<div style="font-weight:600;color:var(--text-primary);margin-bottom:4px;">Failed to load order submissions</div>' +
      '<div style="font-size:12px;color:var(--text-muted);margin-bottom:12px;">Database request timed out or network was interrupted.</div>' +
      '<button type="button" class="portal-btn portal-btn-secondary" onclick="renderAdminOrders()" style="display:inline-flex;align-items:center;gap:6px;margin:0 auto;padding:6px 14px;font-size:12px;cursor:pointer;">' +
      '<svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>' +
      'Retry</button></div>';
  }
}

/**
 * Attaches event listeners to the Admin Orders toolbar controls
 * @param {HTMLElement} container
 */
function attachToolbarEvents(container) {
  if (!container) return;

  // View Mode toggles
  container.querySelectorAll('[data-set-view]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var view = btn.getAttribute('data-set-view');
      _adminOrdersViewMode = view;
      renderAdminOrders();
    });
  });

  // Month filter dropdown
  var monthSelect = container.querySelector('.admin-month-select');
  if (monthSelect) {
    monthSelect.addEventListener('change', function() {
      _adminOrdersMonthFilter = monthSelect.value;
      renderAdminOrders();
    });
  }

  // Export to CSV button
  var exportBtn = container.querySelector('[data-export-csv]');
  if (exportBtn) {
    exportBtn.addEventListener('click', function() {
      exportAdminOrdersToCsv(_cachedAdminOrdersList);
    });
  }

  // Configure Google Sheet URL & View Apps Script Code button
  var configBtn = container.querySelector('[data-config-sheets]');
  if (configBtn) {
    configBtn.addEventListener('click', function() {
      configureAdminOrdersSheetUrl();
    });
  }
}

/**
 * Updates status of a submitted order in Supabase
 * @param {string} orderNum
 * @param {string} status
 */
async function updateOrderStatus(orderNum, status) {
  if (!await canWriteUniformAdmin()) return false;
  return changeUniformOrderStatus(orderNum, status, null);
}

async function canWriteUniformAdmin() {
  return typeof window !== 'undefined' && typeof window.authorizeAdminMutation === 'function' && await window.authorizeAdminMutation('uniform');
}

async function cancelUniformOrder(orderNum) {
  var memberId = typeof sessionGet === 'function' ? (sessionGet('ic') || sessionGet('email')) : null;
  if (!memberId) return false;
  return changeUniformOrderStatus(orderNum, 'cancelled', memberId);
}

async function changeUniformOrderStatus(orderNum, status, memberId) {
  if (typeof orderNum !== 'string' || !orderNum || !Object.hasOwn(UNIFORM_ORDER_TRANSITIONS, status)) return false;
  var client = getSupa();
  if (!client) return false;
  var path = 'bb_orders?order_number=eq.' + encodeURIComponent(orderNum);
  if (memberId) path += '&ic=eq.' + encodeURIComponent(memberId);

  try {
    var rows = await client.get(path + '&select=order_number,status,items,ic,email', { cache: false });
    var order = Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
    var current = order && order.status;
    if (!order || !isUniformOrder(order) || (memberId && current !== 'pending') || !getUniformStatusOptions(current).includes(status) || current === status) {
      if (typeof showToast === 'function') showToast('This order cannot move to that status.', 'warning');
      return false;
    }
    if (memberId && (sessionGet('ic') || sessionGet('email')) !== memberId) return false;
    if (!memberId && typeof window.hasAdminModuleAccess === 'function' && !window.hasAdminModuleAccess('uniform')) return false;
    var updatePath = path + '&status=eq.' + encodeURIComponent(current);
    var changed = typeof client.req === 'function'
      ? await client.req('PATCH', updatePath, { status: status }, { Prefer: 'return=representation' }, { maxRetries: 0 })
      : await client.patch(updatePath, { status: status });
    if (!Array.isArray(changed) || changed.length !== 1) {
      if (typeof showToast === 'function') showToast('The order changed. Refresh and try again.', 'warning');
      return false;
    }
    _cachedAdminOrders = null;
    // Auto-sync updated status to Google Sheets Order Tracker
    syncOrderStatusToGoogleSheet(orderNum, status);
    if (typeof showToast === 'function') showToast('Order status updated to ' + status + '.', 'success');

    if (typeof window !== 'undefined' && window.PortalRealtime && typeof window.PortalRealtime.broadcast === 'function') {
      window.PortalRealtime.broadcast('orders', 'update', { order_number: orderNum, status: status });
    } else if (typeof global !== 'undefined' && global.PortalRealtime && typeof global.PortalRealtime.broadcast === 'function') {
      global.PortalRealtime.broadcast('orders', 'update', { order_number: orderNum, status: status });
    }

    // Real-time WhatsApp-style FCM push notification for order updates
    var orderDispatcher = (typeof sendPortalPushNotification === 'function')
      ? sendPortalPushNotification
      : (typeof window !== 'undefined' && typeof window.sendPortalPushNotification === 'function' ? window.sendPortalPushNotification : null);
    if (orderDispatcher && order) {
      var targetUsers = [order.ic, order.email, order.name].filter(Boolean);
      if (targetUsers.length > 0) {
        orderDispatcher({
          type: 'order_status',
          title: 'Uniform Order Update',
          body: 'Order #' + orderNum + ' status updated to ' + status.toUpperCase() + '.',
          targetUsers: targetUsers,
          tab: 'member',
          targetId: orderNum
        }).catch(function(err) {
          console.warn('Order FCM push error:', err);
        });
      }
    }
    if (typeof logAuditEvent === 'function') {
      await logAuditEvent({
        action: 'order.status_update',
        targetType: 'order',
        targetId: orderNum,
        actorRole: memberId ? 'member' : 'officer_admin',
        details: { previous_status: current, status: status }
      });
    }
    return true;
  } catch (e) {
    if (typeof showToast === 'function') showToast('Failed to update status.', 'error');
    return false;
  }
}

var _adminProductsViewMode = 'grid';
var _draggedProdIndex = null;

/**
 * Toggles Admin uniform products view mode between 'grid' and 'list'
 * @param {'grid'|'list'} mode
 */
function setAdminProductsViewMode(mode) {
  _adminProductsViewMode = mode === 'list' ? 'list' : 'grid';
  if (typeof document !== 'undefined') {
    var gridBtn = document.querySelector('.adm-view-grid');
    var listBtn = document.querySelector('.adm-view-list');
    if (gridBtn) gridBtn.classList.toggle('active', _adminProductsViewMode === 'grid');
    if (listBtn) listBtn.classList.toggle('active', _adminProductsViewMode === 'list');
  }
  renderAdminProducts();
}

/**
 * Renders uniform products list in the Admin management panel (Grid View or List View with Drag & Drop)
 */
function renderAdminProducts() {
  if (typeof document === 'undefined') return;
  var list = document.getElementById('admin-products-list');
  if (!list) return;

  var countBadge = document.querySelector('.adm-products-count-badge');
  if (countBadge) {
    countBadge.textContent = UNIFORM_ITEMS.length + (UNIFORM_ITEMS.length === 1 ? ' item' : ' items');
  }

  if (!UNIFORM_ITEMS.length) {
    list.innerHTML =
      '<div style="color:var(--text-secondary);text-align:center;padding:32px;font-size:13px;background:var(--bg-card);border:1px dashed var(--border-card);border-radius:14px;">No products yet. Click "Add New Product" below to add one.</div>';
    return;
  }

  var html = '';

  if (_adminProductsViewMode === 'grid') {
    html += '<div class="uniform-product-grid admin-product-grid">';
    UNIFORM_ITEMS.forEach(function (item, idx) {
      var sizes = getItemSizes(item);
      var sizeButtons = '';
      sizes.forEach(function (s) {
        sizeButtons += '<span class="size-pill" style="pointer-events:none;">' + escapeHtml(s) + '</span>';
      });

      var safeProdImg = item.image
        ? (typeof safeUrl === 'function' ? safeUrl(item.image, '') : item.image)
        : '';
      var imgHtml = safeProdImg
        ? '<img src="' + escapeHtml(safeProdImg) + '" alt="' + escapeHtml(item.name) + '" loading="lazy"/>'
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

      var sizeWrap = sizes.length
        ? '<div class="product-size-section" style="display:block;margin-top:8px;">' +
          '<div class="size-pills-label" style="font-size:11px;">Sizes:</div>' +
          '<div class="size-pills-row" style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px;">' +
          sizeButtons +
          '</div></div>'
        : '';

      html +=
        '<div class="uniform-product-card admin-drag-item" draggable="true" data-prod-key="' +
        escapeHtml(item.key) +
        '" data-prod-index="' +
        idx +
        '" title="Drag and drop to change product position">' +
        '<button type="button" class="adm-prod-edit-btn" data-edit-prod="' +
        escapeHtml(item.key) +
        '" title="Edit ' +
        escapeHtml(item.name) +
        '">' +
        '<svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>' +
        '</button>' +
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
        '<div class="product-card-price uniform-price">' +
        priceLabel +
        '</div>' +
        sizeWrap +
        '</div>' +
        '</div>';
    });
    html += '</div>';
  } else {
    // List View
    html += '<div class="admin-products-list-view">';
    UNIFORM_ITEMS.forEach(function (item, idx) {
      var safeProdImg = item.image
        ? (typeof safeUrl === 'function' ? safeUrl(item.image, '') : item.image)
        : '';
      var imgHtml = safeProdImg
        ? '<img src="' +
          escapeHtml(safeProdImg) +
          '" style="width:48px;height:48px;object-fit:cover;border-radius:8px;flex-shrink:0;" alt="' +
          escapeHtml(item.name) +
          '"/>'
        : '<div style="width:48px;height:48px;border-radius:8px;background:var(--bg-card-subtle);border:1px solid var(--border-card);display:flex;align-items:center;justify-content:center;color:var(--text-secondary);flex-shrink:0;"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg></div>';

      var ncoBadge = item.ncoOnly
        ? ' <span style="font-size:9px;font-weight:700;background:rgba(245,197,66,0.2);color:var(--brand-gold);border:1px solid rgba(245,197,66,0.4);padding:2px 7px;border-radius:20px;letter-spacing:0.5px;">NCO ONLY</span>'
        : '';

      html +=
        '<div class="admin-product-row admin-drag-item" draggable="true" data-prod-key="' +
        escapeHtml(item.key) +
        '" data-prod-index="' +
        idx +
        '" title="Drag and drop to change product position">' +
        '<div class="adm-drag-handle" title="Drag to reorder"><svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg></div>' +
        imgHtml +
        '<div style="flex:1;min-width:0;">' +
        '<div style="font-size:13.5px;color:var(--text-primary);font-weight:600;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
        escapeHtml(item.name) +
        ncoBadge +
        '</div>' +
        '<div style="font-size:11.5px;color:var(--text-secondary);margin-top:2px;">RM ' +
        (item.price ? parseFloat(item.price).toFixed(2) : 'TBA') +
        (item.sizes && item.sizes.length
          ? ' &middot; ' + item.sizes.map(escapeHtml).join(', ')
          : '') +
        '</div>' +
        '</div>' +
        '<button type="button" class="adm-prod-edit-btn" data-edit-prod="' +
        escapeHtml(item.key) +
        '" title="Edit ' +
        escapeHtml(item.name) +
        '">' +
        '<svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>' +
        '</button>' +
        '</div>';
    });
    html += '</div>';
  }

  list.innerHTML = html;

  // Bind drag & drop reordering
  var dragItems = list.querySelectorAll('.admin-drag-item');
  dragItems.forEach(function (card) {
    if (!card || typeof card.addEventListener !== 'function') return;

    card.addEventListener('dragstart', function (e) {
      _draggedProdIndex = parseInt(card.getAttribute('data-prod-index'), 10);
      card.classList.add('dragging');
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(_draggedProdIndex));
      }
    });

    card.addEventListener('dragend', function () {
      card.classList.remove('dragging');
      dragItems.forEach(function (c) { c.classList.remove('drag-over'); });
      _draggedProdIndex = null;
    });

    card.addEventListener('dragover', function (e) {
      if (e.preventDefault) e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      if (!card.classList.contains('dragging')) {
        card.classList.add('drag-over');
      }
    });

    card.addEventListener('dragleave', function () {
      card.classList.remove('drag-over');
    });

    card.addEventListener('drop', function (e) {
      if (e.preventDefault) e.preventDefault();
      card.classList.remove('drag-over');
      var targetIndex = parseInt(card.getAttribute('data-prod-index'), 10);
      var sourceIndex = _draggedProdIndex;
      if (sourceIndex === null || isNaN(sourceIndex)) {
        var dt = e.dataTransfer ? e.dataTransfer.getData('text/plain') : '';
        sourceIndex = parseInt(dt, 10);
      }
      if (!isNaN(sourceIndex) && !isNaN(targetIndex) && sourceIndex !== targetIndex) {
        reorderUniformProducts(sourceIndex, targetIndex);
      }
    });
  });

  // Bind edit buttons
  list.querySelectorAll('[data-edit-prod]').forEach(function (btn) {
    if (btn && typeof btn.addEventListener === 'function') {
      btn.addEventListener('click', function (e) {
        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
        editProduct(btn.getAttribute('data-edit-prod'));
      });
    }
  });
}

/**
 * Reorders product positions in the catalog and syncs across views and storage
 * @param {number} fromIndex
 * @param {number} toIndex
 */
async function reorderUniformProducts(fromIndex, toIndex) {
  if (!await canWriteUniformAdmin()) return false;
  if (
    fromIndex < 0 ||
    fromIndex >= UNIFORM_ITEMS.length ||
    toIndex < 0 ||
    toIndex >= UNIFORM_ITEMS.length ||
    fromIndex === toIndex
  ) {
    return;
  }

  var movedItem = UNIFORM_ITEMS.splice(fromIndex, 1)[0];
  UNIFORM_ITEMS.splice(toIndex, 0, movedItem);

  // Instantly update DOM views so admin sees immediate zero-lag reordering
  renderAdminProducts();
  renderOrderItems();

  saveUniformItems();
  if (typeof showToast === 'function') {
    showToast('Product order updated!', 'success');
  }
}

/**
 * Opens pop-up modal to add a new product
 */
function openProductModal() {
  if (typeof document === 'undefined') return;
  clearProductForm();
  var delBtn = document.querySelector('.prod-modal-del-btn');
  if (delBtn) delBtn.style.display = 'none';

  var ft = document.getElementById('prod-form-title');
  if (ft) {
    ft.innerHTML =
      '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg><span>Add New Product</span>';
  }

  var saveLabel = document.querySelector('.prod-modal-save-label');
  if (saveLabel) saveLabel.textContent = 'Save Product';

  var overlay = document.querySelector('.adm-product-modal-overlay');
  if (overlay) overlay.style.display = 'flex';
}

/**
 * Closes product creation/edit pop-up modal
 */
function closeProductModal() {
  if (typeof document === 'undefined') return;
  var overlay = document.querySelector('.adm-product-modal-overlay');
  if (overlay) overlay.style.display = 'none';
  clearProductForm();
}

/**
 * Opens uniform orders response availability & auto-schedule modal
 */
function openUniformScheduleModal() {
  if (typeof document === 'undefined') return;
  var overlay = document.querySelector('.uo-schedule-modal-overlay');
  if (overlay) overlay.style.display = 'flex';
}

/**
 * Closes uniform orders response availability & auto-schedule modal
 */
function closeUniformScheduleModal() {
  if (typeof document === 'undefined') return;
  var overlay = document.querySelector('.uo-schedule-modal-overlay');
  if (overlay) overlay.style.display = 'none';
}

/**
 * Previews uploaded product photo in Admin console and stages the file
 * for Supabase Storage CDN upload on saveProduct().
 * @param {HTMLInputElement} input
 */
function previewProductImg(input) {
  if (!input || !input.files || !input.files[0]) return;
  var file = input.files[0];
  var ext = (file.name || '').split('.').pop().toLowerCase();
  if (ext === 'svg' || ext === 'html' || ext === 'htm' || file.type === 'image/svg+xml') {
    if (typeof showToast === 'function') {
      showToast('Please upload a JPG, PNG, or WebP product image.', 'warning');
    }
    input.value = '';
    return;
  }
  _stagedProductImgFile = file;
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
  _stagedProductImgFile = null;
  if (typeof document === 'undefined') return;
  ['prod-name', 'prod-price', 'prod-sizes', 'prod-img-data', 'prod-edit-key'].forEach(
    function (id) {
      var el = document.getElementById(id);
      if (el) el.value = '';
    }
  );
  var nc = document.getElementById('prod-nco-only');
  if (nc) nc.checked = false;
  var customCb = document.querySelector('.prod-custom-text-cb');
  if (customCb) customCb.checked = false;
  var customPrompt = document.querySelector('.prod-custom-prompt-input');
  if (customPrompt) customPrompt.value = '';
  var promptWrap = document.querySelector('.prod-custom-prompt-wrap');
  if (promptWrap) promptWrap.style.display = 'none';

  var pi = document.getElementById('prod-img-prev-img');
  if (pi) pi.src = '';
  var pv = document.getElementById('prod-img-preview');
  if (pv) pv.style.display = 'none';
  var ph = document.getElementById('prod-img-placeholder');
  if (ph) ph.style.display = 'block';
  var ft = document.getElementById('prod-form-title');
  if (ft) {
    ft.innerHTML =
      '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg><span>Add New Product</span>';
  }
  var delBtn = document.querySelector('.prod-modal-del-btn');
  if (delBtn) delBtn.style.display = 'none';
  var saveLabel = document.querySelector('.prod-modal-save-label');
  if (saveLabel) saveLabel.textContent = 'Save Product';
}

/**
 * Saves new or edited uniform product definition and syncs with Supabase
 */
async function saveProduct() {
  if (typeof document === 'undefined') return;
  if (_isSavingProduct) return;
  _isSavingProduct = true;

  try {
    if (!await canWriteUniformAdmin()) return false;
    var rawName = ((document.getElementById('prod-name') || {}).value || '').trim();
    var name = typeof sanitizeText === 'function' ? sanitizeText(rawName, 100) : rawName;
    var priceVal = (document.getElementById('prod-price') || {}).value;
    var priceInSen = uniformPriceInSen({ price: priceVal });
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

    var customCb = document.querySelector('.prod-custom-text-cb');
    var hasCustomText = customCb ? !!customCb.checked : false;
    var customPromptEl = document.querySelector('.prod-custom-prompt-input');
    var rawCustomPrompt = customPromptEl ? customPromptEl.value.trim() : '';
    var customPrompt = typeof sanitizeText === 'function' ? sanitizeText(rawCustomPrompt, 80) : rawCustomPrompt;

    if (!name) {
      if (typeof showToast === 'function') showToast('Please enter a product name.', 'warning');
      return;
    }
    if (name.length > 100) {
      if (typeof showToast === 'function')
        showToast('Product name cannot exceed 100 characters.', 'warning');
      return;
    }
    if (priceInSen === null) {
      if (typeof showToast === 'function')
        showToast('Enter a non-negative price with up to two decimal places.', 'warning');
      return;
    }
    var price = priceInSen / 100;

    var key = editKey || name.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now();

    // Offload newly selected or inline base64 product photos to CDN-cached Supabase Storage
    var client = getSupa();
    if (
      client &&
      typeof client.uploadFile === 'function' &&
      typeof client.fileUrl === 'function' &&
      (_stagedProductImgFile || (typeof image === 'string' && image.indexOf('data:image/') === 0))
    ) {
      try {
        var uploadBlob = null;
        var uploadExt = 'jpg';
        if (_stagedProductImgFile) {
          var stagedExt = (_stagedProductImgFile.name || '').split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '');
          var isPng = _stagedProductImgFile.type === 'image/png' || stagedExt === 'png';
          if (isPng) {
            uploadBlob = _stagedProductImgFile;
            uploadExt = 'png';
          } else {
            var compressedProd = await compressReceiptImage(_stagedProductImgFile, 800, 0.82);
            uploadBlob = (compressedProd && compressedProd.blob) || _stagedProductImgFile;
            uploadExt = uploadBlob && uploadBlob.type === 'image/webp' ? 'webp' : 'jpg';
          }
        } else if (typeof image === 'string' && image.indexOf('data:image/') === 0) {
          var compressedData = await compressReceiptImage(image, 800, 0.82);
          if (compressedData && compressedData.blob) {
            uploadBlob = compressedData.blob;
            uploadExt = 'jpg';
          }
        }
        if (uploadBlob) {
          var safeProdKey = String(key).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48);
          var prodPath = 'catalog/uniforms/item_' + safeProdKey + '_' + Date.now() + '.' + uploadExt;
          await client.uploadFile('gallery', prodPath, uploadBlob);
          image = client.fileUrl('gallery', prodPath, { private: false });
          _stagedProductImgFile = null;
        }
      } catch (prodUploadErr) {
        console.warn('Uniform product image storage upload fallback:', prodUploadErr);
      }
    }

    var item = {
      key: key,
      name: name,
      price: price,
      sizes: sizes,
      image: image,
      ncoOnly: ncoOnly,
      hasCustomText: hasCustomText,
      customPrompt: customPrompt
    };
    var idx = UNIFORM_ITEMS.findIndex(function (i) {
      return i.key === key;
    });

    if (idx >= 0) UNIFORM_ITEMS[idx] = Object.assign({}, UNIFORM_ITEMS[idx], item);
    else UNIFORM_ITEMS.push(item);

    saveUniformItems();
    loadPrices();
    renderOrderItems();
    closeProductModal();
    renderAdminProducts();

    if (typeof logAuditEvent === 'function') {
      logAuditEvent({
        action: idx >= 0 ? 'order.product_update' : 'order.product_create',
        targetType: 'uniform_product',
        targetId: key,
        actorRole: 'officer_admin',
        details: { name: name, price: price, ncoOnly: ncoOnly }
      });
    }

    if (typeof showToast === 'function') showToast('Product saved successfully!', 'success');
  } finally {
    _isSavingProduct = false;
  }
}

/**
 * Loads a product into Admin pop-up modal for editing
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
  if (ft) {
    ft.innerHTML =
      '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg><span>Edit: ' +
      escapeHtml(item.name) +
      '</span>';
  }
  var nc = document.getElementById('prod-nco-only');
  if (nc) nc.checked = !!item.ncoOnly;

  var customCb = document.querySelector('.prod-custom-text-cb');
  if (customCb) customCb.checked = !!item.hasCustomText;
  var customPrompt = document.querySelector('.prod-custom-prompt-input');
  if (customPrompt) customPrompt.value = item.customPrompt || '';
  var promptWrap = document.querySelector('.prod-custom-prompt-wrap');
  if (promptWrap) promptWrap.style.display = item.hasCustomText ? 'block' : 'none';

  if (item.image) {
    set('prod-img-data', item.image);
    var pi = document.getElementById('prod-img-prev-img');
    if (pi) pi.src = item.image;
    var pv = document.getElementById('prod-img-preview');
    if (pv) pv.style.display = 'block';
    var ph = document.getElementById('prod-img-placeholder');
    if (ph) ph.style.display = 'none';
  } else {
    set('prod-img-data', '');
    var pi2 = document.getElementById('prod-img-prev-img');
    if (pi2) pi2.src = '';
    var pv2 = document.getElementById('prod-img-preview');
    if (pv2) pv2.style.display = 'none';
    var ph2 = document.getElementById('prod-img-placeholder');
    if (ph2) ph2.style.display = 'block';
  }

  var delBtn = document.querySelector('.prod-modal-del-btn');
  if (delBtn) delBtn.style.display = 'inline-flex';

  var saveLabel = document.querySelector('.prod-modal-save-label');
  if (saveLabel) saveLabel.textContent = 'Update Product';

  var overlay = document.querySelector('.adm-product-modal-overlay');
  if (overlay) overlay.style.display = 'flex';
}

/**
 * Deletes the product currently open in the edit modal
 */
async function deleteCurrentProduct() {
  if (typeof document === 'undefined') return;
  var keyEl = document.getElementById('prod-edit-key');
  var key = keyEl ? keyEl.value.trim() : '';
  if (!key) return;
  await deleteProduct(key);
  closeProductModal();
}

/**
 * Deletes a product from the uniform catalog
 * @param {string} key
 */
async function deleteProduct(key) {
  if (!await canWriteUniformAdmin()) return false;
  var item = UNIFORM_ITEMS.find(function (i) {
    return i.key === key;
  });
  var ok =
    typeof showConfirmModal === 'function'
      ? await showConfirmModal('Delete "' + (item ? item.name : key) + '"?', 'Delete Product')
      : true;
  if (!ok || !await canWriteUniformAdmin()) return false;

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

  if (typeof logAuditEvent === 'function') {
    logAuditEvent({
      action: 'order.product_delete',
      targetType: 'uniform_product',
      targetId: key,
      actorRole: 'officer_admin',
      details: { name: item ? item.name : key }
    });
  }

  if (typeof showToast === 'function') showToast('Product deleted.', 'info');
}

// ── Global Window Exports ──────────────────────────────────────────────────
if (typeof window !== 'undefined') {
  window.DEFAULT_UNIFORM_ITEMS = DEFAULT_UNIFORM_ITEMS;
  window.UNIFORM_ITEMS        = UNIFORM_ITEMS;
    window.uniformCart          = uniformCart;
    window.addUniformToCart     = addUniformToCart;
    window.updateCartItemQty    = updateCartItemQty;
    window.removeUniformCartItem = removeUniformCartItem;
    window.clearUniformCart     = clearUniformCart;
    window.scrollToCartSection  = scrollToCartSection;
    window.selectUniformCardSize = selectUniformCardSize;
  window.stepCardQty          = stepCardQty;
  window.confirmAddToCart     = confirmAddToCart;
  window.itemStagedQtys       = itemStagedQtys;
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

  window.DEFAULT_UNIFORM_SCHEDULE = DEFAULT_UNIFORM_SCHEDULE;
  window.loadUniformOrdersSchedule = loadUniformOrdersSchedule;
  window.saveUniformOrdersSchedule = saveUniformOrdersSchedule;
  window.saveAdminUniformOrdersSchedule = saveAdminUniformOrdersSchedule;
  window.toggleUniformOrdersStatus = toggleUniformOrdersStatus;
  window.isUniformOrdersAcceptingResponses = isUniformOrdersAcceptingResponses;
  window.renderUniformOrdersScheduleControls = renderUniformOrdersScheduleControls;

  window.switchUniformSubtab = switchUniformSubtab;
  window.loadAndRenderPaymentEditor = loadAndRenderPaymentEditor;
  window.adminSavePaymentInfo = adminSavePaymentInfo;
  window.renderAdminOrders = renderAdminOrders;
  window.loadAdminOrders = function() { return renderAdminOrders(true); };
  window.updateOrderStatus = updateOrderStatus;
  window.cancelUniformOrder = cancelUniformOrder;
  window.exportAdminOrdersToCsv = exportAdminOrdersToCsv;
  window.syncAdminOrdersToGoogleSheet = syncAdminOrdersToGoogleSheet;
  window.configureAdminOrdersSheetUrl = configureAdminOrdersSheetUrl;
  window.syncOrderToGoogleSheetsArchive = syncOrderToGoogleSheetsArchive;
  window.syncOrderStatusToGoogleSheet = syncOrderStatusToGoogleSheet;
  window.UNIFORM_ORDERS_APPS_SCRIPT_CODE = UNIFORM_ORDERS_APPS_SCRIPT_CODE;
  window.buildUniformOrdersAppsScriptCode = buildUniformOrdersAppsScriptCode;
  window.extractGoogleDriveFolderId = extractGoogleDriveFolderId;
  window.loadOrdersSheetsArchiveUrl = loadOrdersSheetsArchiveUrl;
  window.saveOrdersSheetsArchiveUrl = saveOrdersSheetsArchiveUrl;
  window.loadOrdersReceiptsDriveFolder = loadOrdersReceiptsDriveFolder;
  window.saveOrdersReceiptsDriveFolder = saveOrdersReceiptsDriveFolder;
  window.viewUniformPaymentProof = viewUniformPaymentProof;
  window.paymentProofButton = paymentProofButton;
  window.renderAdminProducts = renderAdminProducts;
  window.renderOrdersPreparationSummaryHtml = renderOrdersPreparationSummaryHtml;
  window.previewProductImg = previewProductImg;
  window.clearProductForm = clearProductForm;
  window.saveProduct = saveProduct;
  window.editProduct = editProduct;
  window.deleteProduct = deleteProduct;
  window.setAdminProductsViewMode = setAdminProductsViewMode;
  window.reorderUniformProducts = reorderUniformProducts;
  window.openProductModal = openProductModal;
  window.closeProductModal = closeProductModal;
  window.openUniformScheduleModal = openUniformScheduleModal;
  window.closeUniformScheduleModal = closeUniformScheduleModal;
  window.deleteCurrentProduct = deleteCurrentProduct;
  window.onCustomTextChange = onCustomTextChange;
  window.toggleProdCustomPrompt = toggleProdCustomPrompt;
  window.itemCustomTexts = itemCustomTexts;
}

// ── Node.js Module Exports ──────────────────────────────────────────────────
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
  uniformCart,
  addUniformToCart,
  updateCartItemQty,
  removeUniformCartItem,
  clearUniformCart,
  selectUniformCardSize,
  stepCardQty,
  confirmAddToCart,
  itemStagedQtys,
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
    stageUniformPaymentProof: stageUniformPaymentProof,
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

    DEFAULT_UNIFORM_SCHEDULE: DEFAULT_UNIFORM_SCHEDULE,
    loadUniformOrdersSchedule: loadUniformOrdersSchedule,
    saveUniformOrdersSchedule: saveUniformOrdersSchedule,
    saveAdminUniformOrdersSchedule: saveAdminUniformOrdersSchedule,
    toggleUniformOrdersStatus: toggleUniformOrdersStatus,
    isUniformOrdersAcceptingResponses: isUniformOrdersAcceptingResponses,
    renderUniformOrdersScheduleControls: renderUniformOrdersScheduleControls,

    switchUniformSubtab: switchUniformSubtab,
    loadAndRenderPaymentEditor: loadAndRenderPaymentEditor,
    adminSavePaymentInfo: adminSavePaymentInfo,
    renderAdminOrders: renderAdminOrders,
    loadAdminOrders: function() { return renderAdminOrders(true); },
    updateOrderStatus: updateOrderStatus,
    cancelUniformOrder: cancelUniformOrder,
    exportAdminOrdersToCsv: exportAdminOrdersToCsv,
    syncAdminOrdersToGoogleSheet: syncAdminOrdersToGoogleSheet,
    configureAdminOrdersSheetUrl: configureAdminOrdersSheetUrl,
    syncOrderToGoogleSheetsArchive: syncOrderToGoogleSheetsArchive,
    syncOrderStatusToGoogleSheet: syncOrderStatusToGoogleSheet,
    UNIFORM_ORDERS_APPS_SCRIPT_CODE: UNIFORM_ORDERS_APPS_SCRIPT_CODE,
    buildUniformOrdersAppsScriptCode: buildUniformOrdersAppsScriptCode,
    extractGoogleDriveFolderId: extractGoogleDriveFolderId,
    blobToBase64Payload: blobToBase64Payload,
    loadOrdersSheetsArchiveUrl: loadOrdersSheetsArchiveUrl,
    saveOrdersSheetsArchiveUrl: saveOrdersSheetsArchiveUrl,
    loadOrdersReceiptsDriveFolder: loadOrdersReceiptsDriveFolder,
    saveOrdersReceiptsDriveFolder: saveOrdersReceiptsDriveFolder,
    paymentProofButton: paymentProofButton,
    viewUniformPaymentProof: viewUniformPaymentProof,
    applyProofPreviewToButton: applyProofPreviewToButton,
    hydrateUniformProofPreviews: hydrateUniformProofPreviews,
    renderAdminProducts: renderAdminProducts,
    renderOrdersPreparationSummaryHtml: renderOrdersPreparationSummaryHtml,
    previewProductImg: previewProductImg,
    clearProductForm: clearProductForm,
    saveProduct: saveProduct,
    editProduct: editProduct,
    deleteProduct: deleteProduct,
    setAdminProductsViewMode: setAdminProductsViewMode,
    reorderUniformProducts: reorderUniformProducts,
    openProductModal: openProductModal,
    closeProductModal: closeProductModal,
    openUniformScheduleModal: openUniformScheduleModal,
    closeUniformScheduleModal: closeUniformScheduleModal,
    deleteCurrentProduct: deleteCurrentProduct,
    onCustomTextChange: onCustomTextChange,
    toggleProdCustomPrompt: toggleProdCustomPrompt,
    itemCustomTexts: itemCustomTexts
  };
}
