/**
 * 1st Petaling Jaya Boys' Brigade Portal
 * Uniform Store & Orders Module
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
  'Payment must be completed in-person during the 3rd parade of the month before collecting your ordered uniform items. Please provide your name and order number to the logistics NCOs and officers upon payment.';
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
var _tngScreenshotFile = null;
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
  if (item && (item.hasSize === 'boots' || (item.name && item.name.toLowerCase().includes('boot')))) {
    return ['UK 5', 'UK 6', 'UK 7', 'UK 8', 'UK 9', 'UK 10', 'UK 11'];
  }
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
  var client = getSupa();
  if (client && typeof client.getConfigSnapshot === 'function') {
    var snapPrices = client.getConfigSnapshot('bb_prices');
    var snapItems = client.getConfigSnapshot('bb_uniform_items');
    if (snapPrices || snapItems) {
      if (snapPrices) prices = snapPrices;
      if (snapItems && snapItems.length) UNIFORM_ITEMS = snapItems;
      return;
    }
  }
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
  var next = Math.max(0, current + delta);
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
  var staged = itemStagedQtys[key] || 1;
  var item = UNIFORM_ITEMS.find(function (i) { return i.key === key; });
  if (!item) return;

  var sizes = getItemSizes(item);
  var size = itemSelectedSizes[key] || itemSizes[key] || (sizes.length ? sizes[0] : '');
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

  addUniformToCart(key, size, staged, customText);

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
  itemSelectedSizes[itemKey] = size;
  itemSizes[itemKey] = size;

  if (typeof document !== 'undefined') {
    var grid = document.getElementById(itemKey + '-size-grid');
    if (grid) {
      grid.querySelectorAll('.size-btn, .size-pill').forEach(function (b) {
        b.classList.remove('selected');
      });
    }
    if (btn && btn.classList) {
      btn.classList.add('selected');
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
  var item = UNIFORM_ITEMS.find(function (i) { return i.key === key; });
  if (!item) return;

  var sizes = getItemSizes(item);
  var size = customSize || itemSelectedSizes[key] || itemSizes[key] || (sizes.length ? sizes[0] : '');
  if (sizes.length && !size) {
    if (typeof showToast === 'function') showToast('Please select a size first!', 'warning');
    return;
  }

  var qtyToAdd = Math.max(1, parseInt(quantity, 10) || 1);
  var priceNum = parseFloat(item.price) || prices[key] || 0;
  var safeSizeId = size ? size.replace(/[^a-zA-Z0-9_-]/g, '_') : 'std';
  var safeCustomId = customText ? customText.toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 20) : '';
  var cartId = key + '__' + safeSizeId + (safeCustomId ? '__' + safeCustomId : '');

  var existing = uniformCart.find(function (ci) { return ci.id === cartId; });
  if (existing) {
    existing.qty += qtyToAdd;
  } else {
    uniformCart.push({
      id: cartId,
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
}

/**
 * Updates quantity of a specific cart item
 * @param {string} cartId
 * @param {number} delta
 */
function updateCartItemQty(cartId, delta) {
  var itemIndex = uniformCart.findIndex(function (ci) { return ci.id === cartId; });
  if (itemIndex === -1) return;

  var ci = uniformCart[itemIndex];
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
    var subtotal = ci.qty * ci.price;
    rowsHtml += '<div class="cart-row" data-cart-id="' + escapeHtml(ci.id) + '">' +
      '<div class="cart-row-main">' +
      '<div class="cart-row-title">' + escapeHtml(ci.name) + '</div>' +
      '<div class="cart-row-details">' +
      (ci.size ? '<span class="cart-row-size-pill">Size: ' + escapeHtml(ci.size) + '</span>' : '') +
      (ci.customText ? '<span class="cart-row-size-pill" style="background:rgba(234,179,8,0.15);color:#f59e0b;border-color:rgba(234,179,8,0.3);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + escapeHtml(ci.customText) + '">Custom: ' + escapeHtml(ci.customText) + '</span>' : '') +
      '<span class="cart-row-price">RM ' + ci.price.toFixed(2) + ' each</span>' +
      '</div>' +
      '</div>' +
      '<div class="cart-row-actions">' +
      '<div class="cart-row-stepper">' +
      '<button type="button" class="cart-step-btn" onclick="updateCartItemQty(\'' + escapeHtml(ci.id) + '\', -1)" aria-label="Decrease quantity">&#8722;</button>' +
      '<span class="cart-step-qty">' + ci.qty + '</span>' +
      '<button type="button" class="cart-step-btn" onclick="updateCartItemQty(\'' + escapeHtml(ci.id) + '\', 1)" aria-label="Increase quantity">+</button>' +
      '</div>' +
      '<div class="cart-row-subtotal">RM ' + subtotal.toFixed(2) + '</div>' +
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
  var total = 0;
  var totalCount = 0;

  if (uniformCart && uniformCart.length > 0) {
    uniformCart.forEach(function (ci) {
      var prod = UNIFORM_ITEMS.find(function (i) { return i.key === ci.key; });
      var unitPrice = (prod && !isNaN(parseFloat(prod.price))) ? parseFloat(prod.price) : (ci.price || prices[ci.key] || 0);
      total += ci.qty * unitPrice;
      totalCount += ci.qty;
    });
  } else {
    UNIFORM_ITEMS.forEach(function (item) {
      var qty = itemQtys[item.key] || 0;
      var unitPrice = parseFloat(item.price) || prices[item.key] || 0;
      total += qty * unitPrice;
      totalCount += qty;
    });
  }

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
  var current = itemQtys[key] || 0;
  var next = Math.min(99, Math.max(0, current + delta));
  itemQtys[key] = next;

  // Sync with uniformCart
  var item = UNIFORM_ITEMS.find(function (i) { return i.key === key; });
  var sizes = getItemSizes(item);
  var size = itemSizes[key] || (sizes.length ? sizes[0] : '');

  if (delta > 0) {
    var safeSizeId = size ? size.replace(/[^a-zA-Z0-9_-]/g, '_') : 'std';
    var cartId = key + '__' + safeSizeId;
    var existing = uniformCart.find(function (ci) { return ci.id === cartId; });
    if (existing) {
      existing.qty += delta;
      if (item && !isNaN(parseFloat(item.price))) existing.price = parseFloat(item.price);
    } else if (item) {
      uniformCart.push({
        id: cartId,
        key: key,
        name: item.name,
        size: size || '',
        qty: delta,
        price: parseFloat(item.price) || prices[key] || 0
      });
    }
  } else if (delta < 0) {
    if (next === 0) {
      for (var ciIdx = uniformCart.length - 1; ciIdx >= 0; ciIdx--) {
        if (uniformCart[ciIdx].key === key) {
          uniformCart.splice(ciIdx, 1);
        }
      }
    } else {
      for (var i = uniformCart.length - 1; i >= 0; i--) {
        if (uniformCart[i].key === key) {
          uniformCart[i].qty += delta;
          if (uniformCart[i].qty <= 0) {
            uniformCart.splice(i, 1);
          }
          break;
        }
      }
    }
  }

  if (typeof document !== 'undefined') {
    var qtyEl = document.getElementById(key + '-qty');
    if (qtyEl) qtyEl.textContent = next;

    var wrap = document.getElementById(key + '-size-wrap');
    var card = document.getElementById('ui-' + key);

    if (wrap) wrap.style.display = sizes.length ? 'block' : 'none';
    if (card) card.classList.toggle('has-qty', next > 0);

    var inCartEl = document.getElementById(key + '-in-cart');
    if (inCartEl) {
      var summary = getProductInCartSummary(key);
      inCartEl.textContent = summary;
      inCartEl.style.display = summary ? 'block' : 'none';
    }
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
  var client = getSupa();
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
  var client = getSupa();
  var payload = scheduleData || _uniformOrdersSchedule;
  var jsonStr = JSON.stringify(payload);
  _uniformOrdersSchedule = Object.assign({}, payload);

  if (client) {
    if (typeof client.recordConfigSnapshot === 'function') {
      client.recordConfigSnapshot('bb_uniform_schedule', _uniformOrdersSchedule);
    }
    if (typeof client.safeConfigUpdate === 'function') {
      try {
        await client.safeConfigUpdate('bb_uniform_schedule', jsonStr, { enableMerge: false });
        return;
      } catch (eSafe) {
        console.warn('safeConfigUpdate fallback in saveUniformOrdersSchedule:', eSafe);
      }
    }
    try {
      await client.req('POST', 'bb_config?on_conflict=key', {
        key: 'bb_uniform_schedule',
        value: jsonStr
      });
    } catch (e) {
      try {
        await client.patch('bb_config?key=eq.bb_uniform_schedule', {
          value: jsonStr
        });
      } catch (e2) {}
    }
  }
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

  await saveUniformOrdersSchedule(updatedSchedule);
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
  _uniformOrdersSchedule.status = newStatus;
  await saveUniformOrdersSchedule(_uniformOrdersSchedule);
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
    var data = await client.get('bb_members?ic=eq.' + encodeURIComponent(ic) + '&select=name,rank,squad');
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
    var currentSize = itemSelectedSizes[item.key] || itemSizes[item.key] || (sizes.length ? sizes[0] : '');
    itemSelectedSizes[item.key] = currentSize;

    var sizeButtons = '';
    sizes.forEach(function (s) {
      var isSel = currentSize === s;
      sizeButtons +=
        '<button type="button" class="size-pill size-btn' +
        (isSel ? ' selected' : '') +
        '" onclick="selectUniformCardSize(\'' +
        escapeHtml(item.key) +
        "\',\'" +
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
      customWrap +
      '</div>' +
      '<div class="product-card-footer">' +
      '<div class="product-card-in-cart" id="' + escapeHtml(item.key) + '-in-cart" style="display:' + (inCartText ? 'block' : 'none') + ';">' + inCartText + '</div>' +
      '<div class="product-card-action-row">' +
      '<div class="product-card-stepper qty-ctrl">' +
      '<button type="button" class="stepper-btn qty-btn" id="' + escapeHtml(item.key) + '-minus-btn" onclick="stepCardQty(\'' + escapeHtml(item.key) + '\',-1)" aria-label="Decrease quantity" disabled style="opacity:0.4;">&#8722;</button>' +
      '<div class="stepper-count qty-display" id="' + escapeHtml(item.key) + '-qty">0</div>' +
      '<button type="button" class="stepper-btn qty-btn" id="' + escapeHtml(item.key) + '-plus-btn" onclick="stepCardQty(\'' + escapeHtml(item.key) + '\',1)" aria-label="Increase quantity">+</button>' +
      '</div>' +
      '<button type="button" class="add-to-cart-btn" id="' + escapeHtml(item.key) + '-add-btn" onclick="confirmAddToCart(\'' + escapeHtml(item.key) + '\')" style="display:none;">' +
      '<svg class="ui-icon-xs" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>' +
      '<span id="' + escapeHtml(item.key) + '-add-label">Add to Cart</span>' +
      '</button>' +
      '</div>' +
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
  if (uniformCart && uniformCart.length > 0) {
    uniformCart.forEach(function (ci) {
      lines.push({
        name: ci.name,
        qty: ci.qty,
        size: ci.size,
        customText: ci.customText || '',
        subtotal: ci.qty * ci.price
      });
    });
  } else {
    UNIFORM_ITEMS.forEach(function (item) {
      var qty = itemQtys[item.key] || 0;
      if (qty > 0) {
        var size = itemSizes[item.key] || '';
        var p = parseFloat(item.price) || prices[item.key] || 0;
        lines.push({ name: item.name, qty: qty, size: size, customText: itemCustomTexts[item.key] || '', subtotal: qty * p });
      }
    });
  }

  var html = '';
  lines.forEach(function (l) {
    var customLabel = l.customText ? ' · "' + escapeHtml(l.customText) + '"' : '';
    html +=
      '<div class="review-row"><span class="review-label">' +
      escapeHtml(l.name) +
      '</span><span class="review-value">x' +
      escapeHtml(l.qty) +
      (l.size ? ' (' + escapeHtml(l.size) + ')' : '') +
      customLabel +
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

  // Show payment instructions with fallback
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
  if (typeof renderTurnstileWidget === 'function') {
    setTimeout(function () {
      renderTurnstileWidget('.cf-turnstile-container[data-action="order"]', 'order');
    }, 50);
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

  // Validate security (blocks SVG, HTML)
  if (typeof validateFileSecurity === 'function' && typeof source !== 'string') {
    await validateFileSecurity(source, { allowedTypes: ['image/jpeg', 'image/png', 'image/webp'], bucket: 'receipts' });
  }

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

/**
 * Submits finalized uniform order to Supabase bb_orders table
 */
async function submitOrder() {
  if (_isSubmittingOrder) {
    if (typeof showToast === 'function')
      showToast('Order submission is already in progress.', 'warning');
    return null;
  }

  var avail = typeof isUniformOrdersAcceptingResponses === 'function'
    ? isUniformOrdersAcceptingResponses()
    : { open: true };
  if (!avail.open) {
    if (typeof showToast === 'function') {
      showToast(avail.message || 'Uniform ordering is currently closed.', 'warning');
    }
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

  // Cloudflare Turnstile CAPTCHA Verification
  var captchaToken = (typeof getTurnstileToken === 'function')
    ? getTurnstileToken('order')
    : '';
  if (!captchaToken && typeof window !== 'undefined' && !window.__SKIP_CAPTCHA__ && !window.__IS_TEST__) {
    if (typeof showToast === 'function') {
      showToast('Please complete the security check before confirming your order.', 'warning');
    }
    return null;
  }
  if (captchaToken && typeof verifyTurnstileTokenServerSide === 'function') {
    var captchaResult = await verifyTurnstileTokenServerSide(captchaToken, 'order');
    if (!captchaResult || !captchaResult.success) {
      if (typeof resetTurnstileWidget === 'function') {
        resetTurnstileWidget('order');
      }
      if (typeof showToast === 'function') {
        showToast(captchaResult && captchaResult.error ? captchaResult.error : 'Security verification failed. Please try again.', 'error');
      }
      return null;
    }
  }

  _isSubmittingOrder = true;
  if (typeof setButtonLoading === 'function') {
    setButtonLoading(btn, true, 'Submitting...', 'Submitting uniform order...');
  } else if (btn) {
    btn.innerHTML = 'Submitting...';
    btn.disabled = true;
  }

  var client = getSupa();
  var memberData = {};

  try {
    if (client && client.get) {
      try {
        var d = await client.get('bb_members?ic=eq.' + encodeURIComponent(ic) + '&select=name,rank,squad');
        memberData = d && d[0] ? d[0] : {};
      } catch (e) {}
    }

    var items = {};
    if (uniformCart && uniformCart.length > 0) {
      uniformCart.forEach(function (ci) {
        items[ci.id] = {
          key: ci.key,
          name: ci.name,
          qty: ci.qty,
          size: ci.size || null,
          custom_text: ci.customText || null,
          price: ci.price
        };
      });
    } else {
      UNIFORM_ITEMS.forEach(function (item) {
        var qty = itemQtys[item.key] || 0;
        if (qty > 0) {
          items[item.key] = {
            qty: qty,
            size: itemSizes[item.key] || null,
            custom_text: itemCustomTexts[item.key] || null,
            price: parseFloat(item.price) || prices[item.key] || 0
          };
        }
      });
    }

    var orderNum = 'BB-' + Date.now().toString(36).toUpperCase();
    var notesRaw = typeof reGetValue === 'function' ? reGetValue('order-notes') || '' : '';
    var notesClean = typeof sanitizeHtml === 'function' ? sanitizeHtml(notesRaw) : notesRaw;

    // Mitigate PostgreSQL text bloat:
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
            var signedReceipt = (typeof client.createSignedUrl === 'function')
              ? await client.createSignedUrl('receipts', receiptPath, 604800)
              : null;
            finalScreenshot = (signedReceipt && signedReceipt.signedUrl) ? signedReceipt.signedUrl : client.fileUrl('receipts', receiptPath);
          } catch (storageErr) {
            try {
              var galleryPath = 'orders/' + cleanCode + '_' + Date.now() + '.jpg';
              await client.uploadFile('gallery', galleryPath, uploadBlob);
              var signedGal = (typeof client.createSignedUrl === 'function')
                ? await client.createSignedUrl('gallery', galleryPath, 604800)
                : null;
              finalScreenshot = (signedGal && signedGal.signedUrl) ? signedGal.signedUrl : client.fileUrl('gallery', galleryPath);
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
    var orderRecord = {
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
    };
    await client.post('bb_orders', orderRecord);
    syncOrderToGoogleSheetsArchive(orderRecord);
    _tngScreenshotFile = null;
    uniformCart.length = 0;

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
    if (typeof resetTurnstileWidget === 'function') {
      resetTurnstileWidget('order');
    }
  }
}

/**
 * Renders uniform order forms inline inside the #inline-form-view container
 */
function renderUniformOrderInline() {
  if (typeof document === 'undefined') return;
  var container = document.getElementById('inline-form-view');
  if (!container) return;

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
    '<div class="form-group" style="margin-top:12px;"><label class="form-label">Additional Notes (optional)</label><div id="order-notes-container" style="min-height:0;"></div></div>' +
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
    '<div class="cf-turnstile-container" data-action="order" style="margin-bottom:14px;min-height:65px;display:flex;justify-content:center;"></div>' +
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
var _cachedAdminOrders = null;
var _cachedAdminOrdersTime = 0;
var ADMIN_ORDERS_CACHE_TTL = 30000;
var _adminOrdersViewMode = 'table';
var _adminOrdersMonthFilter = '';
var _cachedAdminOrdersList = [];
var _ordersSheetsArchiveUrl = '';

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
  var client = getSupa();
  var cleanUrl = (typeof url === 'string') ? url.trim() : '';
  _ordersSheetsArchiveUrl = cleanUrl;
  if (!client) return false;
  try {
    if (typeof client.safeConfigUpdate === 'function') {
      await client.safeConfigUpdate('bb_orders_sheets_url', cleanUrl);
    } else {
      await client.post('bb_config', { key: 'bb_orders_sheets_url', value: cleanUrl, updated_at: new Date().toISOString() });
    }
    if (typeof client.recordConfigSnapshot === 'function') {
      client.recordConfigSnapshot('bb_orders_sheets_url', cleanUrl);
    }
    return true;
  } catch (e) {
    console.warn('saveOrdersSheetsArchiveUrl error:', e.message);
    return false;
  }
}

/**
 * Production-ready Google Apps Script template for uniform orders synchronization
 */
var UNIFORM_ORDERS_APPS_SCRIPT_CODE = [
  '/**',
  ' * 1st Petaling Jaya Boys\' Brigade - Uniform Orders Google Sheets Sync & Archive',
  ' *',
  ' * Manages two sheets automatically:',
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
  ' * 6. Click "Deploy", grant permissions, and copy the Web App URL.',
  ' * 7. In the portal Admin Console > Uniform Orders, click the Settings button and paste your Web App URL.',
  ' */',
  '',
  'function doPost(e) {',
  '  var lock = LockService.getScriptLock();',
  '  try {',
  '    lock.tryLock(30000);',
  '    var raw = e && e.postData ? e.postData.contents : "";',
  '    var data = JSON.parse(raw);',
  '    var ss = SpreadsheetApp.getActiveSpreadsheet();',
  '',
  '    var trackerHeaders = [',
  '      "Order Number", "Member Name", "Rank", "Squad", "Items Ordered", "Total Price (RM)", "Status", "Order Date", "Notes"',
  '    ];',
  '    var archiveHeaders = [',
  '      "Order Number", "Member Name", "Rank", "Squad", "Items Ordered", "Total Price (RM)", "Order Date", "Notes"',
  '    ];',
  '',
  '    var trackerSheet = getOrCreateSheet(ss, "Order Tracker", trackerHeaders);',
  '    var archiveSheet = getOrCreateSheet(ss, "Order Archives", archiveHeaders);',
  '',
  '    var action = data.action || "archive_order";',
  '',
  '    if (action === "update_status" && data.orderNumber) {',
  '      updateOrderStatusInTracker(trackerSheet, data.orderNumber, data.status || "CANCELLED");',
  '    } else if (action === "archive_order" && data.order) {',
  '      recordSingleOrder(trackerSheet, archiveSheet, data.order);',
  '    } else if (action === "sync_all_orders" && Array.isArray(data.orders)) {',
  '      data.orders.forEach(function(order) {',
  '        recordSingleOrder(trackerSheet, archiveSheet, order);',
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
  '  }',
  '  return sheet;',
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
  'function recordSingleOrder(trackerSheet, archiveSheet, order) {',
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
  '',
  '  // 1. Permanent Archive (Order Archives) - Only append if not already archived',
  '  var archData = archiveSheet.getDataRange().getValues();',
  '  var alreadyArchived = false;',
  '  for (var j = 1; j < archData.length; j++) {',
  '    if (String(archData[j][0]).trim().toUpperCase() === orderNum.toUpperCase()) {',
  '      alreadyArchived = true;',
  '      break;',
  '    }',
  '  }',
  '  if (!alreadyArchived) {',
  '    archiveSheet.appendRow([orderNum, member, rank, squad, itemsStr, priceStr, dateStr, notes]);',
  '  }',
  '',
  '  // 2. Live Tracker (Order Tracker) - Update if existing, append if new',
  '  var trackerData = trackerSheet.getDataRange().getValues();',
  '  var trackerRow = -1;',
  '  for (var i = 1; i < trackerData.length; i++) {',
  '    if (String(trackerData[i][0]).trim().toUpperCase() === orderNum.toUpperCase()) {',
  '      trackerRow = i + 1;',
  '      break;',
  '    }',
  '  }',
  '  if (trackerRow > 0) {',
  '    trackerSheet.getRange(trackerRow, 7).setValue(status);',
  '  } else {',
  '    trackerSheet.appendRow([orderNum, member, rank, squad, itemsStr, priceStr, status, dateStr, notes]);',
  '  }',
  '}',
  '',
  'function updateOrderStatusInTracker(trackerSheet, orderNumber, newStatus) {',
  '  var targetNum = String(orderNumber).trim().toUpperCase();',
  '  var data = trackerSheet.getDataRange().getValues();',
  '  for (var i = 1; i < data.length; i++) {',
  '    if (String(data[i][0]).trim().toUpperCase() === targetNum) {',
  '      trackerSheet.getRange(i + 1, 7).setValue(String(newStatus).toUpperCase());',
  '      return true;',
  '    }',
  '  }',
  '  return false;',
  '}'
].join('\n');

/**
 * Asynchronously synchronizes an individual order to the secondary Google Sheets archive
 * @param {Object} orderRecord
 */
async function syncOrderToGoogleSheetsArchive(orderRecord) {
  try {
    var url = await loadOrdersSheetsArchiveUrl();
    if (!url || !/^https?:\/\//i.test(url)) return;

    var sum = 0;
    try {
      var items = typeof orderRecord.items === 'string' ? JSON.parse(orderRecord.items) : (orderRecord.items || {});
      Object.entries(items).forEach(function(kv) {
        var v = kv[1];
        var baseKey = kv[0].split('__')[0];
        var prod = UNIFORM_ITEMS.find(function(i) {
          return i.key === kv[0] || (v && v.key && i.key === v.key) || i.key === baseKey;
        });
        var qty = parseInt(v.qty, 10) || 1;
        var p = parseFloat(v.price) || (prod ? parseFloat(prod.price) : 0) || prices[baseKey] || 0;
        sum += qty * p;
      });
    } catch (_) {}

    var enrichedRecord = Object.assign({}, orderRecord, {
      total_price: (orderRecord && orderRecord.total_price !== undefined) ? orderRecord.total_price : sum
    });

    var payload = {
      action: 'archive_order',
      timestamp: new Date().toISOString(),
      order: enrichedRecord
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
 * Opens rich modal with setup instructions, Webhook URL input, manual sync, and copyable Apps Script code
 */
async function configureAdminOrdersSheetUrl() {
  if (typeof document === 'undefined') return;
  var currentUrl = await loadOrdersSheetsArchiveUrl();

  var overlay = document.createElement('div');
  overlay.className = 'portal-modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.style.zIndex = '9999';

  var isConfigured = Boolean(currentUrl && /^https?:\/\//i.test(currentUrl));
  var statusBadge = isConfigured
    ? '<span style="display:inline-flex;align-items:center;gap:5px;padding:3px 8px;border-radius:12px;font-size:11px;font-weight:700;background:rgba(16,185,129,0.15);color:var(--green,#10b981);border:1px solid rgba(16,185,129,0.3);"><span style="width:6px;height:6px;border-radius:50%;background:currentColor;"></span> Connected & Active</span>'
    : '<span style="display:inline-flex;align-items:center;gap:5px;padding:3px 8px;border-radius:12px;font-size:11px;font-weight:700;background:rgba(234,179,8,0.15);color:var(--brand-gold,#eab308);border:1px solid rgba(234,179,8,0.3);"><span style="width:6px;height:6px;border-radius:50%;background:currentColor;"></span> Not Configured</span>';

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
          '<h3 style="font-family:var(--font-headline);font-size:16px;margin:0;color:var(--text-primary);">Uniform Orders Google Sheets Sync & Backup</h3>' +
          '<div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">Automatic live synchronization for Order Tracker and Order Archives</div>' +
        '</div>' +
      '</div>' +
      statusBadge +
    '</div>' +
    '<div class="portal-modal-body" style="padding:14px 0;display:flex;flex-direction:column;gap:16px;">' +
      '<div>' +
        '<label style="display:block;font-size:12px;font-weight:700;color:var(--text-primary);margin-bottom:6px;">Google Sheets Web App URL (Webhook)</label>' +
        '<div style="display:flex;gap:8px;">' +
          '<input type="url" id="admin-orders-sheet-url-input" class="form-input" value="' + (typeof escapeHtml === 'function' ? escapeHtml(currentUrl || '') : (currentUrl || '')) + '" placeholder="https://script.google.com/macros/s/.../exec" style="flex:1;font-size:12px;padding:8px 10px;height:38px;">' +
          '<button type="button" id="admin-orders-save-url-btn" class="portal-btn portal-btn-primary" style="font-size:12px;padding:8px 14px;height:38px;white-space:nowrap;">Save</button>' +
        '</div>' +
        '<div style="font-size:11px;color:var(--text-muted);margin-top:4px;">When configured, any order status updates or deletions in the portal will sync automatically to your Google Sheet in real time.</div>' +
      '</div>' +

      '<div style="background:var(--bg-card-subtle);border:1px solid var(--border-card);border-radius:10px;padding:12px 14px;">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:8px;">' +
          '<div style="font-weight:700;font-size:12px;color:var(--text-primary);">Manual Sync Test</div>' +
          '<button type="button" id="admin-orders-manual-sync-btn" class="portal-btn portal-btn-secondary" style="font-size:11px;padding:5px 10px;height:30px;display:inline-flex;align-items:center;gap:5px;">' +
            '<svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg> Sync All Current Records Now' +
          '</button>' +
        '</div>' +
        '<div style="font-size:11px;color:var(--text-secondary);line-height:1.5;">' +
          'Automatically populates both sheets: <strong>Order Tracker</strong> (live status changes) and <strong>Order Archives</strong> (permanent append-only backup without status).' +
        '</div>' +
      '</div>' +

      '<div>' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">' +
          '<label style="font-size:12px;font-weight:700;color:var(--text-primary);">📋 Google Apps Script Code</label>' +
          '<button type="button" id="admin-orders-copy-script-btn" class="portal-btn portal-btn-secondary" style="font-size:11px;padding:4px 10px;height:28px;display:inline-flex;align-items:center;gap:4px;">' +
            '<svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy Script Code' +
          '</button>' +
        '</div>' +
        '<div style="background:#0f172a;color:#f8fafc;border:1px solid var(--border-card);border-radius:8px;padding:12px;font-family:monospace;font-size:11px;max-height:180px;overflow-y:auto;white-space:pre;line-height:1.4;">' +
          (typeof escapeHtml === 'function' ? escapeHtml(UNIFORM_ORDERS_APPS_SCRIPT_CODE) : UNIFORM_ORDERS_APPS_SCRIPT_CODE) +
        '</div>' +
      '</div>' +

      '<div style="font-size:11px;color:var(--text-secondary);line-height:1.6;background:var(--bg-card);border:1px solid var(--border-card);border-radius:8px;padding:10px 12px;">' +
        '<strong style="color:var(--text-primary);">Setup Instructions:</strong><br>' +
        '1. Open your target Google Sheet.<br>' +
        '2. In the menu, go to <strong>Extensions > Apps Script</strong>.<br>' +
        '3. Delete any placeholder code and paste the code above.<br>' +
        '4. Click <strong>Deploy > New deployment</strong>, select type <strong>Web app</strong>.<br>' +
        '5. Set <em>Execute as:</em> <strong>Me</strong> and <em>Who has access:</em> <strong>Anyone</strong>.<br>' +
        '6. Click Deploy, authorize access, copy the <strong>Web App URL</strong> and paste it into the field above.' +
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
  if (saveBtn && urlInput) {
    saveBtn.addEventListener('click', async function() {
      var val = (urlInput.value || '').trim();
      var ok = await saveOrdersSheetsArchiveUrl(val);
      if (ok) {
        if (typeof showToast === 'function') showToast('Google Sheets sync URL saved successfully!', 'success');
        closeModal();
      } else {
        if (typeof showToast === 'function') showToast('Failed to save URL to database.', 'error');
      }
    });
  }

  var copyBtn = modal.querySelector('#admin-orders-copy-script-btn');
  if (copyBtn) {
    copyBtn.addEventListener('click', function() {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(UNIFORM_ORDERS_APPS_SCRIPT_CODE).then(function() {
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
      syncAdminOrdersToGoogleSheet();
    });
  }
}

/**
 * Synchronizes all currently loaded uniform orders to the permanent Google Sheet
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

  if (typeof showToast === 'function') showToast('Syncing orders to Google Sheet...', 'info');

  try {
    var payload = {
      action: 'sync_all_orders',
      timestamp: new Date().toISOString(),
      orders: _cachedAdminOrdersList
    };

    await fetch(url, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (typeof showToast === 'function') {
      showToast('✓ Permanent Google Sheet sync sent (' + _cachedAdminOrdersList.length + ' orders)!', 'success');
    }
  } catch (err) {
    console.error('syncAdminOrdersToGoogleSheet error:', err);
    if (typeof showToast === 'function') {
      showToast('Sync request completed (cross-origin mode). Check your Google Sheet.', 'info');
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
      var items = JSON.parse(o.items || '{}');
      Object.entries(items).forEach(function (kv) {
        var v = kv[1];
        var baseKey = kv[0].split('__')[0];
        var prod = UNIFORM_ITEMS.find(function (i) {
          return i.key === kv[0] || (v && v.key && i.key === v.key) || i.key === baseKey;
        });
        var displayName = prod ? prod.name : ((v && v.name) || baseKey);
        var qty = parseInt(v.qty, 10) || 1;
        var p = parseFloat(v.price) || (prod ? parseFloat(prod.price) : 0) || prices[baseKey] || 0;
        var sz = (v && v.size) ? v.size : 'Standard';
        var val = qty * p;

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
    'Order Number', 'Member Name', 'Rank', 'Squad', 'Items Ordered', 'Total Price (RM)', 'Status', 'Order Date', 'Notes'
  ];

  var s1RowsXml = '<Row ss:StyleID="Header">' +
    sheet1Headers.map(function(h) { return '<Cell><Data ss:Type="String">' + escapeXml(h) + '</Data></Cell>'; }).join('') +
  '</Row>';

  list.forEach(function(o) {
    var itemsFormatted = [];
    var totalPrice = 0;
    try {
      var items = JSON.parse(o.items || '{}');
      Object.entries(items).forEach(function (kv) {
        var v = kv[1];
        var baseKey = kv[0].split('__')[0];
        var prod = UNIFORM_ITEMS.find(function (i) {
          return i.key === kv[0] || (v && v.key && i.key === v.key) || i.key === baseKey;
        });
        var displayName = prod ? prod.name : ((v && v.name) || baseKey);
        var qty = parseInt(v.qty, 10) || 1;
        var p = parseFloat(v.price) || (prod ? parseFloat(prod.price) : 0) || prices[baseKey] || 0;
        totalPrice += qty * p;
        itemsFormatted.push(displayName + ' x' + qty + (v.size ? ' (' + v.size + ')' : ''));
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
      orders = await client.get('bb_orders?select=*&order=created_at.desc');
      if (Array.isArray(orders)) {
        _cachedAdminOrders = orders;
        _cachedAdminOrdersTime = now;
      } else {
        orders = [];
      }
    }

    // Only show uniform orders (filter out custom form submissions)
    var uniformOrders = orders.filter(function (o) {
      try {
        var items = JSON.parse(o.items || '{}');
        return items.form_name === undefined;
      } catch (e) {
        return true;
      }
    });

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
      processing: '#3b82f6',
      ready: '#10b981',
      collected: '#6b7280',
      cancelled: '#ef4444'
    };
    var SL = ['pending', 'processing', 'ready', 'collected', 'cancelled'];
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
      try {
        var items = JSON.parse(o.items || '{}');
        Object.entries(items).forEach(function (kv) {
          var v = kv[1];
          var baseKey = kv[0].split('__')[0];
          var prod = UNIFORM_ITEMS.find(function (i) {
            return i.key === kv[0] || (v && v.key && i.key === v.key) || i.key === baseKey;
          });
          var displayName = prod ? prod.name : ((v && v.name) || baseKey);
          var qty = parseInt(v.qty, 10) || 1;
          var p = parseFloat(v.price) || (prod ? parseFloat(prod.price) : 0) || prices[baseKey] || 0;
          var val = qty * p;
          totalOrderRevenue += val;
          totalPreparationItems += qty;
          itemPreparationCounts[displayName] = (itemPreparationCounts[displayName] || 0) + qty;
          var sz = (v && v.size) ? v.size : 'Standard';
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
          var items = JSON.parse(o.items || '{}');
          var itemParts = [];
          Object.entries(items).forEach(function (kv) {
            var v = kv[1];
            var baseKey = kv[0].split('__')[0];
            var prod = UNIFORM_ITEMS.find(function (i) {
              return i.key === kv[0] || (v && v.key && i.key === v.key) || i.key === baseKey;
            });
            var displayName = prod ? prod.name : ((v && v.name) || baseKey);
            var qty = parseInt(v.qty, 10) || 1;
            var p = parseFloat(v.price) || (prod ? parseFloat(prod.price) : 0) || prices[baseKey] || 0;
            total += qty * p;
            var customBadge = (v && (v.custom_text || v.customText)) ? ' <span style="display:inline-block;background:rgba(234,179,8,0.15);color:#f59e0b;border:1px solid rgba(234,179,8,0.3);padding:1px 6px;border-radius:4px;font-size:10px;font-weight:600;">Custom: ' + escapeHtml(v.custom_text || v.customText) + '</span>' : '';
            itemParts.push(escapeHtml(displayName) + ' ×' + escapeHtml(qty) + (v.size ? ' (' + escapeHtml(v.size) + ')' : '') + customBadge);
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

        var statusSelectOptions = SL.map(function(s) {
          return '<option value="' + s + '"' + (s === status ? ' selected' : '') + '>' + s.toUpperCase() + '</option>';
        }).join('');

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
          '<td style="font-weight:700;color:var(--brand-gold);white-space:nowrap;">RM ' + total.toFixed(2) + '</td>' +
          '<td style="font-size:12px;color:var(--text-secondary);white-space:nowrap;">' + created + '</td>' +
          '<td>' +
          '<select data-order-num="' + escapeHtml(o.order_number) + '" class="admin-table-status-select" style="font-size:11px;font-weight:700;padding:4px 8px;border-radius:6px;border:1px solid ' + sc + '66;background:' + sc + '22;color:' + sc + ';cursor:pointer;font-family:var(--font-headline);">' +
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
        '<td colspan="3" style="color:var(--text-muted);font-size:11px;padding:10px 12px;">Across ' + filtered.length + ' order' + (filtered.length === 1 ? '' : 's') + '</td>' +
        '</tr>' +
        '</tfoot>';

      contentHtml =
        '<div tabindex="0" role="region" aria-label="Uniform Orders Table" class="table-wrapper orders-table-wrapper">' +
        '<table class="orders-spreadsheet-table">' +
        '<thead>' +
        '<tr>' +
        '<th>Order #</th>' +
        '<th>Member</th>' +
        '<th>Items Ordered</th>' +
        '<th>Total</th>' +
        '<th>Date</th>' +
        '<th>Status</th>' +
        '<th style="text-align:right;">Actions</th>' +
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
          var items = JSON.parse(o.items || '{}');
          Object.entries(items).forEach(function (kv) {
            var v = kv[1];
            var baseKey = kv[0].split('__')[0];
            var prod = UNIFORM_ITEMS.find(function (i) {
              return i.key === kv[0] || (v && v.key && i.key === v.key) || i.key === baseKey;
            });
            var displayName = prod ? prod.name : ((v && v.name) || baseKey);
            var qty = parseInt(v.qty, 10) || 1;
            var p = parseFloat(v.price) || (prod ? parseFloat(prod.price) : 0) || prices[baseKey] || 0;
            total += qty * p;
            var customBadge = (v && (v.custom_text || v.customText)) ? ' <span style="display:inline-block;background:rgba(234,179,8,0.15);color:#f59e0b;border:1px solid rgba(234,179,8,0.3);padding:1px 6px;border-radius:4px;font-size:10px;font-weight:600;">Custom: ' + escapeHtml(v.custom_text || v.customText) + '</span>' : '';
            itemsDisplay +=
              '<div style="font-size:12px;color:var(--text-secondary);">' +
              escapeHtml(displayName) +
              ' ×' +
              escapeHtml(qty) +
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
            ";font-size:11px;font-weight:700;cursor:pointer;font-family:var(--font-headline);\">" +
            s +
            '</button>'
          );
        }).join('');

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
          status.toUpperCase() +
          '</div>' +
          '<div style="font-size:12px;font-weight:700;color:var(--brand-gold);">RM ' + total.toFixed(2) + '</div>' +
          '</div></div>' +
          '<div style="margin-bottom:4px;">' +
          itemsDisplay +
          '</div>' +
          (o.notes
            ? '<div style="font-size:11px;color:var(--text-muted);margin:6px 0;"><strong>Notes:</strong> ' +
              (typeof sanitizeHtml === 'function' ? sanitizeHtml(o.notes) : escapeHtml(o.notes)) +
              '</div>'
            : '') +
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

    // Bind status button clicks
    list.querySelectorAll('[data-order-status]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        updateOrderStatus(
          btn.getAttribute('data-order-num'),
          btn.getAttribute('data-order-status')
        );
      });
    });

    // Bind table status select changes
    list.querySelectorAll('.admin-table-status-select').forEach(function (sel) {
      sel.addEventListener('change', function () {
        updateOrderStatus(sel.getAttribute('data-order-num'), sel.value);
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
        if (!ok) return;

        // Auto-sync status cancellation to Google Sheets Order Tracker
        syncOrderStatusToGoogleSheet(orderNum, 'CANCELLED');

        client
          .delete(
            'bb_orders?order_number=eq.' + encodeURIComponent(orderNum)
          )
          .then(function () {
            _cachedAdminOrders = null;
            renderAdminOrders(true);
            if (typeof showToast === 'function') showToast('Order record deleted and marked CANCELLED in Google Sheets.', 'info');
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
  _cachedAdminOrders = null;
  var client = getSupa();
  if (!client || !client.patch) return;

  try {
    await client.patch('bb_orders?order_number=eq.' + encodeURIComponent(orderNum), {
      status: status
    });
    // Auto-sync updated status to Google Sheets Order Tracker
    syncOrderStatusToGoogleSheet(orderNum, status);
    renderAdminOrders();
    if (typeof showToast === 'function') showToast('Order status updated to ' + status + ' (synced to Google Sheet).', 'success');
    if (typeof logAuditEvent === 'function') {
      logAuditEvent({
        action: 'order.status_update',
        targetType: 'order',
        targetId: orderNum,
        actorRole: 'officer_admin',
        details: { status: status }
      });
    }
  } catch (e) {
    if (typeof showToast === 'function') showToast('Failed to update status.', 'error');
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
function reorderUniformProducts(fromIndex, toIndex) {
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
    if (isNaN(price) || price < 0) {
      if (typeof showToast === 'function')
        showToast('Product price must be a valid non-negative number.', 'warning');
      return;
    }

    var key = editKey || name.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now();
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

    if (idx >= 0) UNIFORM_ITEMS[idx] = item;
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
  window.updateOrderStatus = updateOrderStatus;
  window.exportAdminOrdersToCsv = exportAdminOrdersToCsv;
  window.syncAdminOrdersToGoogleSheet = syncAdminOrdersToGoogleSheet;
  window.configureAdminOrdersSheetUrl = configureAdminOrdersSheetUrl;
  window.syncOrderToGoogleSheetsArchive = syncOrderToGoogleSheetsArchive;
  window.syncOrderStatusToGoogleSheet = syncOrderStatusToGoogleSheet;
  window.UNIFORM_ORDERS_APPS_SCRIPT_CODE = UNIFORM_ORDERS_APPS_SCRIPT_CODE;
  window.loadOrdersSheetsArchiveUrl = loadOrdersSheetsArchiveUrl;
  window.saveOrdersSheetsArchiveUrl = saveOrdersSheetsArchiveUrl;
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
    updateOrderStatus: updateOrderStatus,
    exportAdminOrdersToCsv: exportAdminOrdersToCsv,
    syncAdminOrdersToGoogleSheet: syncAdminOrdersToGoogleSheet,
    configureAdminOrdersSheetUrl: configureAdminOrdersSheetUrl,
    syncOrderToGoogleSheetsArchive: syncOrderToGoogleSheetsArchive,
    syncOrderStatusToGoogleSheet: syncOrderStatusToGoogleSheet,
    UNIFORM_ORDERS_APPS_SCRIPT_CODE: UNIFORM_ORDERS_APPS_SCRIPT_CODE,
    loadOrdersSheetsArchiveUrl: loadOrdersSheetsArchiveUrl,
    saveOrdersSheetsArchiveUrl: saveOrdersSheetsArchiveUrl,
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
