/**
 * 1st Petaling Jaya Boys' Brigade Portal
 * Announcements Module
 *
 * Implements public announcement feed, rich text formatting bar,
 * emoji reactions, and admin post/edit/delete operations.
 */

/* global supa, sessionGet, escapeHtml, safeUrl, sanitizeHtml, sanitizeInput, showToast, showConfirmModal, createSmartLoader, renderSkeletonCard, syncAnnouncementNotifications, uploadSingleMediaFile, openAnnouncementZoomModal */

// ── State ──────────────────────────────────────────────────────────────────
var announcements = [];

// ── Curated Positive Reaction Allowlist ───────────────────────────
// Restricts reactions exclusively to positive/affirming emojis to prevent peer shaming
var SAFE_REACTION_EMOJIS = ['👍', '🫡', '🎉', '❤️', '🔥', '🙏'];
var REACT_EMOJIS = SAFE_REACTION_EMOJIS;

var ANN_EMOJIS = [
  '📢', '📌', '✅', '❌', '⚠️', '🎉', '🏆', '📅', '🕐', '📝', '👥', '🎖️',
  '⭐', '🔴', '🟡', '🟢', '🔵', '💡', '🔔', '📋', '🏅', '👔', '🛒', '📦',
  '🙏', '💪', '🔥', '❤️', '👍', '👎', '✊', '🫡', '😊', '😄', '🥳', '🤝'
];

var _annSavedRange = null;

// ── Announcement Infographic / Poster State ────────────────────────────────
var _stagedAnnouncementImage = null;

function handleAnnouncementImageSelect(event) {
  if (!event || !event.target || !event.target.files || !event.target.files[0]) return;
  var file = event.target.files[0];
  if (!file.type.startsWith('image/')) {
    if (typeof showToast === 'function') showToast('Please select a valid image file (PNG, JPG, WebP, GIF).', 'warning');
    return;
  }
  if (file.size > 15 * 1024 * 1024) {
    if (typeof showToast === 'function') showToast('Image file size exceeds 15MB limit.', 'warning');
    return;
  }

  var reader = new FileReader();
  reader.onload = function(e) {
    var dataUrl = e.target.result;
    var sizeStr = (file.size < 1024 * 1024) ? Math.round(file.size / 1024) + ' KB' : (file.size / (1024 * 1024)).toFixed(1) + ' MB';
    _stagedAnnouncementImage = {
      file: file,
      dataUrl: dataUrl,
      url: dataUrl,
      filename: file.name,
      sizeStr: sizeStr
    };
    updateAnnouncementInfographicPreview();
  };
  reader.readAsDataURL(file);
}

function handleAnnouncementImageUrlInput(val) {
  var raw = (val || '').trim();
  if (!raw) {
    clearAnnouncementInfographic();
    return;
  }
  var valid = (typeof safeUrl === 'function') ? safeUrl(raw, '') : raw;
  if (!valid) {
    if (typeof showToast === 'function') showToast('Please enter a valid HTTP/HTTPS image URL.', 'warning');
    return;
  }
  _stagedAnnouncementImage = {
    file: null,
    dataUrl: '',
    url: valid,
    filename: valid.split('/').pop().split('?')[0] || 'Image URL',
    sizeStr: 'External URL'
  };
  updateAnnouncementInfographicPreview();
}

function updateAnnouncementInfographicPreview() {
  if (typeof document === 'undefined') return;
  var wrap = document.querySelector('.ann-infographic-preview-wrap');
  if (!wrap) return;
  if (!_stagedAnnouncementImage || !_stagedAnnouncementImage.url) {
    wrap.style.display = 'none';
    return;
  }
  var thumb = wrap.querySelector('.ann-infographic-preview-thumb');
  if (thumb) thumb.src = _stagedAnnouncementImage.url;
  var nameEl = wrap.querySelector('.ann-infographic-preview-name');
  if (nameEl) nameEl.textContent = _stagedAnnouncementImage.filename || 'Infographic';
  var sizeEl = wrap.querySelector('.ann-infographic-preview-size');
  if (sizeEl) sizeEl.textContent = _stagedAnnouncementImage.sizeStr || '';
  wrap.style.display = 'flex';
}

async function syncAnnouncementImageConfig(annId, imgUrl) {
  if (!annId || !imgUrl) return;
  try {
    var client = (typeof supa !== 'undefined') ? supa : (typeof window !== 'undefined' ? window.supa : null);
    if (client && typeof client.get === 'function') {
      var rows = await client.get('bb_config?key=eq.bb_announcements_images&select=value');
      var map = (rows && rows.length && rows[0].value) ? (typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value) : {};
      map[annId] = imgUrl;
      if (typeof client.upsert === 'function') {
        await client.upsert('bb_config', { key: 'bb_announcements_images', value: JSON.stringify(map) }, 'key');
      }
    }
  } catch (_) {}
}

async function handleAnnouncementImageError(imgEl, optUrl) {
  if (!imgEl || imgEl._hasRetried) return;
  imgEl._hasRetried = true;
  var targetUrl = optUrl || imgEl.getAttribute('data-original-url') || imgEl.src;
  if (!targetUrl) return;

  if (targetUrl.includes('/storage/v1/object/')) {
    var sm = targetUrl.match(/\/storage\/v1\/object\/(?:sign|public|authenticated)\/([^/]+)\/([^?#]+)/i);
    if (sm) {
      var sBucket = sm[1];
      var sPath = decodeURIComponent(sm[2]);
      var client = (typeof supa !== 'undefined' ? supa : (typeof window !== 'undefined' ? window.supa : null));
      var base = (client && (client.SUPA_URL || client.baseUrl)) || (typeof window !== 'undefined' && window.SUPA_URL) || '';

      // 1. Try permanent public storage endpoint
      if (base) {
        var pubUrl = base + '/storage/v1/object/public/' + sBucket + '/' + sPath;
        if (imgEl.src !== pubUrl) {
          imgEl.src = pubUrl;
          return;
        }
      }

      // 2. Try re-signing with Supabase client
      if (client && typeof client.createSignedUrl === 'function') {
        try {
          var res = await client.createSignedUrl(sBucket, sPath, 86400 * 7);
          if (res && res.signedUrl && imgEl.src !== res.signedUrl) {
            imgEl.src = res.signedUrl;
            return;
          }
        } catch (_) {}
      }
    }
  }

  // Graceful fallback notice if media file is genuinely missing
  imgEl.style.display = 'none';
  if (imgEl.parentElement && imgEl.parentElement.classList.contains('ann-infographic-container')) {
    var placeholder = document.createElement('div');
    placeholder.style.cssText = 'padding:14px;background:var(--surface-tint);border-radius:8px;font-size:12px;color:var(--text-muted);text-align:center;display:flex;align-items:center;justify-content:center;gap:6px;';
    placeholder.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><span>Attachment preview unavailable</span>';
    imgEl.parentElement.appendChild(placeholder);
  }
}

function clearAnnouncementInfographic() {
  _stagedAnnouncementImage = null;
  if (typeof document === 'undefined') return;
  var wrap = document.querySelector('.ann-infographic-preview-wrap');
  if (wrap) wrap.style.display = 'none';
  var fileInput = document.querySelector('.ann-infographic-file-input');
  if (fileInput) fileInput.value = '';
  var urlInput = document.querySelector('.ann-infographic-url-input');
  if (urlInput) urlInput.value = '';
}


// ── Security: HTML Sanitizer for Announcements ──────────────────────────────
/**
 * Sanitizes rich text HTML for announcement bodies, preventing XSS injections
 * while allowing safe formatting tags, colors, and lists.
 * @param {string} dirtyHtml
 * @returns {string}
 */
function sanitizeAnnouncementHtml(dirtyHtml) {
  if (typeof window !== 'undefined' && typeof window.sanitizeHtml === 'function') {
    return window.sanitizeHtml(dirtyHtml);
  }
  if (typeof sanitizeHtml === 'function') {
    return sanitizeHtml(dirtyHtml);
  }
  if (!dirtyHtml || typeof dirtyHtml !== 'string') return '';
  if (typeof DOMParser === 'undefined') {
    // Regex fallback if DOMParser is unavailable (e.g. Node tests/environments)
    return dirtyHtml
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/on\w+\s*=\s*(['"]).*?\1/gi, '')
      .replace(/on\w+\s*=\s*[^>\s]+/gi, '')
      .replace(/javascript:/gi, '');
  }

  var parser = new DOMParser();
  var doc = parser.parseFromString(dirtyHtml, 'text/html');
  var ALLOWED_TAGS = [
    'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE',
    'P', 'BR', 'HR', 'UL', 'OL', 'LI', 'SPAN', 'FONT',
    'DIV', 'A', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE',
    'CODE', 'PRE', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'IMG'
  ];
  var ALLOWED_ATTRS = ['style', 'color', 'size', 'href', 'target', 'rel', 'class', 'align', 'src', 'alt', 'title', 'width', 'height', 'loading', 'type', 'checked', 'disabled'];

  function clean(node) {
    var children = Array.from(node.childNodes);
    for (var i = 0; i < children.length; i++) {
      var child = children[i];
      if (child.nodeType === 1) { // Element node
        var tagName = child.tagName.toUpperCase();
        var isChecklistInput = tagName === 'INPUT' && (child.getAttribute('type') || '').toLowerCase() === 'checkbox';
        if (ALLOWED_TAGS.indexOf(tagName) === -1 && !isChecklistInput) {
          if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'FORM', 'INPUT', 'BUTTON', 'SVG', 'LINK', 'META', 'BASE'].indexOf(tagName) !== -1) {
            node.removeChild(child);
            continue;
          } else {
            var text = document.createTextNode(child.textContent || '');
            node.replaceChild(text, child);
            continue;
          }
        }

        // Clean attributes
        var attrs = Array.from(child.attributes);
        for (var a = 0; a < attrs.length; a++) {
          var attr = attrs[a];
          var attrName = attr.name.toLowerCase();
          if (ALLOWED_ATTRS.indexOf(attrName) === -1 || attrName.startsWith('on')) {
            child.removeAttribute(attr.name);
          } else if (attrName === 'href') {
            var val = (attr.value || '').trim().toLowerCase();
            if (val.startsWith('javascript:') || val.startsWith('data:') || val.startsWith('vbscript:')) {
              child.removeAttribute(attr.name);
            } else {
              child.setAttribute('target', '_blank');
              child.setAttribute('rel', 'noopener noreferrer');
            }
          } else if (attrName === 'src') {
            var srcVal = (attr.value || '').trim();
            if (typeof safeUrl === 'function') {
              var validSrc = safeUrl(srcVal, '');
              if (!validSrc || validSrc === '#') {
                child.removeAttribute(attr.name);
              } else {
                child.setAttribute('src', validSrc);
              }
            } else if (/^(https?:|\/|\.\/|data:image\/)/i.test(srcVal)) {
              child.setAttribute('src', srcVal);
            } else {
              child.removeAttribute(attr.name);
            }
          } else if (attrName === 'style') {
            var styleVal = attr.value || '';
            if (/expression|javascript:|url\(/i.test(styleVal)) {
              child.removeAttribute('style');
            }
          }
        }

        clean(child);
      }
    }
  }

  clean(doc.body);
  return doc.body.innerHTML;
}

// ── Data Fetching ──────────────────────────────────────────────────────────
/**
 * Loads all announcements from Supabase ordered by creation date ascending
 */
async function loadAnnouncements() {
  var list = (typeof document !== 'undefined') ? document.getElementById('announcements-list') : null;
  var loader = (list && typeof createSmartLoader === 'function' && announcements.length === 0)
    ? createSmartLoader({
        container: list,
        renderSkeleton: function() {
          return typeof renderSkeletonCard === 'function' ? renderSkeletonCard(2, 'announcement') : '';
        },
        srLabel: 'Loading announcements...'
      })
    : null;

  var fetchFn = async function() {
    if (typeof supa !== 'undefined' && supa.get) {
      var annImageMap = {};
      var cfgPromise = (typeof supa !== 'undefined' && typeof supa.safeConfigGet === 'function')
        ? supa.safeConfigGet('bb_announcements_images', {})
        : supa.get('bb_config?key=eq.bb_announcements_images&select=value');
      var annPromise = supa.get('bb_announcements?order=created_at.asc&select=*');

      var results = await Promise.allSettled([cfgPromise, annPromise]);
      if (results[0].status === 'fulfilled' && results[0].value) {
        var cfgVal = results[0].value;
        if (Array.isArray(cfgVal) && cfgVal.length && cfgVal[0].value) {
          try {
            annImageMap = typeof cfgVal[0].value === 'string' ? JSON.parse(cfgVal[0].value) : cfgVal[0].value;
          } catch (_) {}
        } else if (typeof cfgVal === 'object') {
          annImageMap = cfgVal;
        }
      }

      var rows = (results[1].status === 'fulfilled' && Array.isArray(results[1].value)) ? results[1].value : [];
      announcements.length = 0;
      if (rows && rows.length) {
        for (var rIdx = 0; rIdx < rows.length; rIdx++) {
          var r = rows[rIdx];
          if (!r.reactions || typeof r.reactions !== 'object') r.reactions = {};
          // Resilient 3-tier infographic recovery: column -> bb_config map -> embedded body marker
          var cfgImg = (annImageMap && r.id && annImageMap[r.id]) ? annImageMap[r.id] : null;
          var bodyMatch = (r.body || '').match(/data-infographic-url=["']([^"']+)["']/i) || (r.body || '').match(/<img[^>]+(?:class=["'][^"']*ann-embedded-infographic[^"']*["'])[^>]*src=["']([^"']+)["']/i);
          var resolvedImg = r.image_url || cfgImg || (bodyMatch ? (bodyMatch[1] || bodyMatch[2]) : null);
          if (resolvedImg) {
            // Live signed URL refresh if image is stored in Supabase storage
            if (resolvedImg.includes('/storage/v1/object/')) {
              var sm = resolvedImg.match(/\/storage\/v1\/object\/(?:sign|public|authenticated)\/([^/]+)\/([^?#]+)/i);
              if (sm) {
                var sBucket = sm[1];
                var sPath = decodeURIComponent(sm[2]);
                try {
                  if (typeof supa.createSignedUrl === 'function') {
                    var sRes = await supa.createSignedUrl(sBucket, sPath, 86400 * 7);
                    if (sRes && sRes.signedUrl) {
                      resolvedImg = sRes.signedUrl;
                    }
                  }
                } catch (_) {}
              }
            }
            r.image_url = resolvedImg;
          }
          announcements.push(r);
        }
      }
    }
  };

  try {
    if (loader) {
      await loader.execute(fetchFn, loadAnnouncements);
    } else {
      await fetchFn();
    }
  } catch (e) {
    console.warn('loadAnnouncements error:', e);
  }

  if (typeof window !== 'undefined') {
    window.announcements = announcements;
  }
  renderAnnouncements();
  if (typeof syncAnnouncementNotifications === 'function') {
    syncAnnouncementNotifications(announcements);
  } else if (typeof window !== 'undefined' && typeof window.syncAnnouncementNotifications === 'function') {
    window.syncAnnouncementNotifications(announcements);
  }
  var adminList = (typeof document !== 'undefined') ? document.getElementById('admin-ann-list') : null;
  if (adminList) {
    renderAdminAnnList();
    if (typeof window !== 'undefined' && window.PortalRealtime && typeof window.PortalRealtime.broadcast === 'function') {
      window.PortalRealtime.broadcast('announcements', 'save');
    }
  }
}

// ── Public Feed Rendering ──────────────────────────────────────────────────
/**
 * Renders the announcements feed on the home page with reaction buttons
 */
function renderAnnouncements() {
  if (typeof document === 'undefined') return;
  var list = document.getElementById('announcements-list');
  if (!list) return;

  if (!announcements.length) {
    list.innerHTML = '<div class="empty-state-card" style="text-align:center;padding:36px 20px;background:var(--bg-card);border:1px dashed var(--border-card);border-radius:14px;color:var(--text-muted);">'
      + '<div style="font-size:28px;margin-bottom:8px;">📢</div>'
      + '<div style="font-family:var(--font-headline);font-size:16px;font-weight:600;color:var(--text-primary);margin-bottom:4px;">No Company Announcements</div>'
      + '<div style="font-size:13px;max-width:340px;margin:0 auto;line-height:1.5;">Check back soon for upcoming parade notices, badge classes, and company news.</div>'
      + '</div>';
    return;
  }

  var currentUserId = '';
  if (typeof sessionGet === 'function') {
    currentUserId = sessionGet('ic') || sessionGet('email') || '';
  }

  var html = '';
  announcements.slice().reverse().forEach(function(a, ri) {
    var realIdx = announcements.length - 1 - ri;
    var sanitizedBody = sanitizeAnnouncementHtml(a.body || '');
    var reactions = a.reactions || {};

    // Build reaction buttons
    var reactHtml = '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:12px;padding-top:10px;border-top:1px solid var(--border-subtle);">';
    REACT_EMOJIS.forEach(function(emoji) {
      var who = Array.isArray(reactions[emoji]) ? reactions[emoji] : [];
      var count = who.length;
      var mine = currentUserId && who.indexOf(currentUserId) !== -1;

      reactHtml += '<button type="button" data-react="' + realIdx + '" data-emoji="' + emoji + '" '
        + 'aria-label="React ' + emoji + '" '
        + 'style="display:flex;align-items:center;gap:5px;padding:5px 10px;border-radius:20px;border:1.5px solid '
        + (mine ? 'var(--gold)' : 'var(--border-subtle)') + ';background:'
        + (mine ? 'rgba(200,150,30,0.15)' : 'var(--bg-card-subtle)') + ';cursor:pointer;transition:all 0.15s;">'
        + '<span style="font-size:16px;">' + emoji + '</span>'
        + (count > 0 ? '<span style="font-size:12px;font-weight:700;color:' + (mine ? 'var(--gold)' : 'var(--text-secondary)') + ';">' + count + '</span>' : '')
        + '</button>';
    });
    reactHtml += '</div>';

    var safeTitle = (typeof escapeHtml === 'function') ? escapeHtml(a.title || '') : (a.title || '');
    var safeDate = (typeof escapeHtml === 'function') ? escapeHtml(a.date || '') : (a.date || '');

    // Prominent large infographic banner ( / Infographics)
    var infographicHtml = '';
    var imgUrl = a.image_url || '';
    if (!imgUrl && sanitizedBody) {
      var imgMatch = sanitizedBody.match(/data-infographic-url=["']([^"']+)["']/i) || sanitizedBody.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (imgMatch && imgMatch[1]) {
        imgUrl = imgMatch[1];
      }
    }
    if (imgUrl) {
      var safeImgUrl = (typeof safeUrl === 'function') ? safeUrl(imgUrl, '') : imgUrl;
      if (safeImgUrl) {
        infographicHtml = '<div class="ann-infographic-container" data-ann-img-idx="' + realIdx + '" title="Click to enlarge infographic">'
          + '<img class="ann-infographic-img" src="' + safeImgUrl + '" alt="' + safeTitle + '" loading="lazy" data-original-url="' + safeImgUrl + '" onerror="handleAnnouncementImageError(this)" />'
          + '<div class="ann-infographic-zoom-overlay">'
          + '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>'
          + '<span>Click to enlarge</span>'
          + '</div></div>';
      }
    }

    html += '<div class="announcement-item" id="ann-item-' + realIdx + '">'
      + '<div class="ann-date">' + safeDate + '</div>'
      + '<div class="ann-title">' + safeTitle + '</div>'
      + infographicHtml
      + '<div class="ann-body">' + sanitizedBody + '</div>'
      + reactHtml
      + '</div>';
  });

  list.innerHTML = html;

  // Click listener for full large infographic zoom lightbox
  list.querySelectorAll('[data-ann-img-idx]').forEach(function(wrap) {
    wrap.addEventListener('click', function() {
      var idx = parseInt(wrap.getAttribute('data-ann-img-idx'), 10);
      var item = announcements[idx];
      var imgEl = wrap.querySelector('.ann-infographic-img');
      var url = (item && item.image_url) || (imgEl ? imgEl.src : '');
      var title = (item && item.title) || '';
      if (typeof openAnnouncementZoomModal === 'function') {
        openAnnouncementZoomModal(url, title);
      }
    });
  });

  // Attach reaction listeners
  list.querySelectorAll('[data-react]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var idx = parseInt(btn.getAttribute('data-react'), 10);
      var emoji = btn.getAttribute('data-emoji');
      toggleReaction(idx, emoji);
    });
  });
}

// ── Reaction Management ────────────────────────────────────────────────────
/**
 * Toggles an emoji reaction on an announcement for the authenticated user
 * @param {number} annIdx - Index in announcements array
 * @param {string} emoji - The emoji string
 */
async function toggleReaction(annIdx, emoji) {
  var currentUserId = '';
  if (typeof sessionGet === 'function') {
    currentUserId = sessionGet('ic') || sessionGet('email') || '';
  }

  if (!currentUserId) {
    if (typeof showToast === 'function') {
      showToast('Please log in to react to announcements.', 'warning');
    }
    return;
  }

  var a = announcements[annIdx];
  if (!a) return;
  // Enforce curated positive reaction allowlist
  if (SAFE_REACTION_EMOJIS.indexOf(emoji) === -1) {
    if (typeof showToast === 'function') {
      showToast('Only approved positive reactions are permitted.', 'warning');
    }
    return;
  }
  if (!a.reactions || typeof a.reactions !== 'object') a.reactions = {};
  if (!Array.isArray(a.reactions[emoji])) a.reactions[emoji] = [];

  var who = a.reactions[emoji];
  var pos = who.indexOf(currentUserId);
  if (pos === -1) {
    who.push(currentUserId);
  } else {
    who.splice(pos, 1);
  }

  // Optimistic UI update
  renderAnnouncements();

  // Persist to Supabase
  try {
    if (typeof supa !== 'undefined' && supa.patch && a.id) {
      await supa.patch('bb_announcements?id=eq.' + a.id, { reactions: a.reactions });
      if (typeof window !== 'undefined' && window.PortalRealtime && typeof window.PortalRealtime.broadcast === 'function') {
        window.PortalRealtime.broadcast('announcements', 'reaction');
      }
    }
  } catch (e) {
    console.error('toggleReaction error:', e);
  }
}

// ── Admin Announcement Management ──────────────────────────────────────────
/**
 * Renders the existing announcements list inside the admin panel
 */
function renderAdminAnnList() {
  if (typeof document === 'undefined') return;
  var container = document.getElementById('admin-ann-list');
  if (!container) return;

  if (!announcements.length) {
    container.innerHTML = '<div style="color:var(--text-muted);font-size:12px;text-align:center;padding:10px;">No announcements yet.</div>';
    return;
  }

  var html = '<div style="font-family:var(--font-headline);font-size:13px;font-weight:600;color:var(--text-muted);margin-bottom:8px;letter-spacing:1px;">EXISTING ANNOUNCEMENTS</div>';
  var rev = announcements.slice().reverse();

  rev.forEach(function(a, ri) {
    var i = announcements.length - 1 - ri;
    var safeTitle = (typeof escapeHtml === 'function') ? escapeHtml(a.title || '') : (a.title || '');
    var safeDate = (typeof escapeHtml === 'function') ? escapeHtml(a.date || '') : (a.date || '');

    html += '<div style="background:var(--bg-card);border:1px solid var(--border-card);border-radius:10px;padding:12px;margin-bottom:8px;border-left:3px solid var(--accent);">'
      + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">'
      + '<div style="flex:1;"><div style="font-family:var(--font-headline);font-size:14px;color:var(--text-primary);font-weight:600;">' + safeTitle + '</div><div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">' + safeDate + '</div></div>'
      + '<div style="display:flex;gap:6px;flex-shrink:0;">'
      + '<button type="button" data-edit-ann="' + i + '" title="Edit Announcement" style="background:var(--bg-card-subtle);border:1px solid var(--border-card);color:var(--text-primary);padding:4px 10px;border-radius:7px;cursor:pointer;font-size:12px;display:inline-flex;align-items:center;justify-content:center;"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>'
      + '<button type="button" data-del-ann="' + i + '" title="Delete Announcement" style="background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);color:var(--red);padding:4px 8px;border-radius:7px;cursor:pointer;font-size:12px;display:inline-flex;align-items:center;justify-content:center;"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>'
      + '</div></div>'
      + '</div>';
  });

  container.innerHTML = html;

  container.querySelectorAll('[data-del-ann]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      deleteAnnouncement(parseInt(btn.getAttribute('data-del-ann'), 10));
    });
  });
  container.querySelectorAll('[data-edit-ann]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      openEditAnnouncement(parseInt(btn.getAttribute('data-edit-ann'), 10));
    });
  });
}

/**
 * Loads an announcement into the admin form for editing
 * @param {number} idx
 */
function openEditAnnouncement(idx) {
  var a = announcements[idx];
  if (!a) return;

  var ti = document.getElementById('ann-title-input');
  if (ti) ti.value = a.title || '';

  var bi = document.getElementById('ann-body-input');
  if (bi) bi.innerHTML = a.body || '';

  var btn = document.getElementById('ann-post-btn');
  if (btn) {
    btn.innerHTML = '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Save Changes';
    btn.setAttribute('data-edit-idx', String(idx));
  }

  if (ti) ti.scrollIntoView({ behavior: 'smooth' });
  var existingImg = a.image_url;
  if (!existingImg && a.body) {
    var editMatch = a.body.match(/data-infographic-url=["']([^"']+)["']/i) || a.body.match(/<img[^>]+(?:class=["'][^"']*ann-embedded-infographic[^"']*["'])[^>]*src=["']([^"']+)["']/i);
    if (editMatch) existingImg = editMatch[1] || editMatch[2];
  }
  if (existingImg) {
    a.image_url = existingImg;
    _stagedAnnouncementImage = {
      file: null,
      dataUrl: '',
      url: existingImg,
      filename: 'Attached Infographic',
      sizeStr: 'Saved Banner'
    };
    updateAnnouncementInfographicPreview();
  } else {
    clearAnnouncementInfographic();
  }
}

/**
 * Cancels editing mode and restores the form to Post Announcement
 */
function cancelEditAnnouncement() {
  var ti = document.getElementById('ann-title-input');
  if (ti) ti.value = '';

  var bi = document.getElementById('ann-body-input');
  if (bi) bi.innerHTML = '';

  var btn = document.getElementById('ann-post-btn');
  if (btn) {
    btn.innerHTML = '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Post Announcement';
    btn.removeAttribute('data-edit-idx');
  }
  clearAnnouncementInfographic();
}


/**
 * Broadcasts an announcement notification email to all active registered members via Google Apps Script Mailer.
 * @param {{ title: string, body: string, date: string }} ann
 * @returns {Promise<boolean>}
 */
async function broadcastAnnouncementEmail(ann) {
  if (!ann || !ann.title) return false;
  try {
    var client = typeof supa !== 'undefined' ? supa : null;
    if (!client) return false;

    // 1. Fetch active registered members from Supabase
    var members = await client.get('bb_members?select=ic,name,email,department');
    if (!members || !members.length) return false;

    var emailMap = {};
    var validEmails = [];
    for (var i = 0; i < members.length; i++) {
      var m = members[i];
      if (m.department === 'deleted' || m.department === 'archived_deleted') continue;
      var em = (m.email || (m.ic && m.ic.indexOf('@') !== -1 ? m.ic.split('__')[0] : '')).trim().toLowerCase();
      if (em && em.indexOf('@') !== -1 && !emailMap[em]) {
        emailMap[em] = true;
        validEmails.push(em);
      }
    }

    if (!validEmails.length) return false;

    // 2. Fetch Google Apps Script Web App URL from configuration
    var scriptUrl = '';
    var syncToken = '';
    if (typeof window !== 'undefined' && window._masterSheetConfig) {
      scriptUrl = window._masterSheetConfig.scriptUrl || '';
      syncToken = window._masterSheetConfig.syncToken || '';
    }
    if (!scriptUrl && client && typeof client.get === 'function') {
      var sheetRows = await client.get('bb_config?key=eq.bb_master_sheet_config&select=value');
      if (!sheetRows || !sheetRows.length) {
        sheetRows = await client.get('bb_config?key=eq.bb_att_sheet&select=value');
      }
      if (sheetRows && sheetRows.length && sheetRows[0].value) {
        var parsed = typeof sheetRows[0].value === 'string' ? JSON.parse(sheetRows[0].value) : sheetRows[0].value;
        scriptUrl = parsed.scriptUrl || '';
        syncToken = parsed.syncToken || syncToken;
      }
    }

    if (!scriptUrl) {
      console.warn('Google Apps Script mailer URL not configured in bb_master_sheet_config.');
      return false;
    }

    var portalUrl = (typeof window !== 'undefined' && window.location && window.location.origin)
      ? (window.location.origin + window.location.pathname)
      : 'https://1st-petaling-jaya-boys-brigade.github.io/1stPetalingJayaBoys-Brigade-/';

    var plainSnippet = (ann.body || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (plainSnippet.length > 280) plainSnippet = plainSnippet.substring(0, 277) + '...';

    var url = scriptUrl + (scriptUrl.indexOf('?') === -1 ? '?' : '&') +
      'action=broadcastAnnouncement' +
      '&title=' + encodeURIComponent(ann.title || 'New Announcement') +
      '&date=' + encodeURIComponent(ann.date || '') +
      '&summary=' + encodeURIComponent(plainSnippet) +
      '&portalUrl=' + encodeURIComponent(portalUrl) +
      '&recipients=' + encodeURIComponent(validEmails.join(',')) +
      (syncToken ? '&token=' + encodeURIComponent(syncToken) : '');

    await fetch(url, { method: 'POST', mode: 'no-cors' }).catch(function(err) {
      console.warn('Announcement email dispatch notice:', err);
    });

    if (typeof showToast === 'function') {
      showToast('Announcement posted & emailed to ' + validEmails.length + ' registered members!', 'success');
    }
    return true;
  } catch (err) {
    console.warn('broadcastAnnouncementEmail error:', err);
    return false;
  }
}

/**
 * Creates or updates an announcement in Supabase
 */
async function addAnnouncement() {
  var titleEl = document.getElementById('ann-title-input');
  var bodyEl  = document.getElementById('ann-body-input');
  var btn     = document.getElementById('ann-post-btn');

  var rawTitle = (titleEl ? titleEl.value : '').trim();
  var title    = (typeof sanitizeInput === 'function') ? sanitizeInput(rawTitle, 200) : rawTitle;
  var rawBody  = (bodyEl ? bodyEl.innerHTML : '').trim();
  var editIdx = btn ? parseInt(btn.getAttribute('data-edit-idx') || '-1', 10) : -1;

  if (!title || !rawBody || rawBody === '<br>' || rawBody === '<div><br></div>') {
    if (typeof showToast === 'function') {
      showToast('Please fill in both title and message.', 'warning');
    }
    return;
  }

  var sanitizedBody = sanitizeAnnouncementHtml(rawBody);
  var dateStr = new Date().toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase();

  if (btn) btn.disabled = true;

  try {
    // Process optional attached infographic image
    var infographicUrl = '';
    if (_stagedAnnouncementImage) {
      if (_stagedAnnouncementImage.file && typeof uploadSingleMediaFile === 'function') {
        try {
          var uploadRes = await uploadSingleMediaFile(_stagedAnnouncementImage.file);
          if (uploadRes && uploadRes.url) {
            infographicUrl = uploadRes.url;
          } else {
            infographicUrl = _stagedAnnouncementImage.url;
          }
        } catch (_) {
          infographicUrl = _stagedAnnouncementImage.url;
        }
      } else {
        infographicUrl = _stagedAnnouncementImage.url || '';
      }
    }

    // Embed resilient hidden marker inside body to survive without migration 017
    if (infographicUrl) {
      var markerTag = '<img src="' + infographicUrl + '" class="ann-embedded-infographic" style="display:none;" data-infographic-url="' + infographicUrl + '" alt="Announcement Infographic" />';
      if (!sanitizedBody.includes('ann-embedded-infographic')) {
        sanitizedBody += markerTag;
      }
    } else if (!_stagedAnnouncementImage) {
      sanitizedBody = sanitizedBody.replace(/<img[^>]*class=["'][^"']*ann-embedded-infographic[^"']*["'][^>]*>/gi, '');
    }

    if (editIdx >= 0) {
      var a = announcements[editIdx];
      if (a) {
        a.title = title;
        a.body  = sanitizedBody;
        if (infographicUrl) a.image_url = infographicUrl;
        else if (!_stagedAnnouncementImage) a.image_url = null;

        if (typeof supa !== 'undefined' && supa.patch && a.id) {
          var patchPayload = { title: title, body: sanitizedBody };
          if (typeof a.image_url !== 'undefined') patchPayload.image_url = a.image_url;
          try {
            await supa.patch('bb_announcements?id=eq.' + a.id, patchPayload);
          } catch (_) {
            await supa.patch('bb_announcements?id=eq.' + a.id, { title: title, body: sanitizedBody });
          }
        }
        if (infographicUrl && a.id) {
          syncAnnouncementImageConfig(a.id, infographicUrl);
        }
      }
      if (btn) {
        btn.innerHTML = '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Post Announcement';
        btn.removeAttribute('data-edit-idx');
      }
      var broadcastCheck = (typeof document !== 'undefined') ? document.querySelector('.ann-email-broadcast-check') : null;
      if (broadcastCheck ? broadcastCheck.checked : false) {
        broadcastAnnouncementEmail({ title: '[Update] ' + title, body: sanitizedBody, date: dateStr });
      }
      if (typeof showToast === 'function') {
        showToast('Announcement updated successfully!', 'success');
      }
    } else {
      var newRecord = {
        title: title,
        body: sanitizedBody,
        date: dateStr,
        reactions: {},
        created_at: new Date().toISOString()
      };
      if (infographicUrl) {
        newRecord.image_url = infographicUrl;
      }
      if (typeof supa !== 'undefined' && supa.post) {
        var createdAnnId = null;
        try {
          var row = await supa.post('bb_announcements', newRecord);
          if (row && row[0]) {
            if (infographicUrl) row[0].image_url = infographicUrl;
            announcements.push(row[0]);
            createdAnnId = row[0].id;
          }
        } catch (err) {
          // Schema fallback if image_url column not yet applied on remote backend
          delete newRecord.image_url;
          var retryRow = await supa.post('bb_announcements', newRecord);
          if (retryRow && retryRow[0]) {
            retryRow[0].image_url = infographicUrl;
            announcements.push(retryRow[0]);
            createdAnnId = retryRow[0].id;
          }
        }
        if (infographicUrl && createdAnnId) {
          syncAnnouncementImageConfig(createdAnnId, infographicUrl);
        }
      }
      var broadcastCheckNew = (typeof document !== 'undefined') ? document.querySelector('.ann-email-broadcast-check') : null;
      if (broadcastCheckNew ? broadcastCheckNew.checked : true) {
        broadcastAnnouncementEmail({ title: title, body: sanitizedBody, date: dateStr });
      }
      if (typeof showToast === 'function') {
        showToast('Announcement posted successfully!', 'success');
      }
    }

    clearAnnouncementInfographic();
    if (titleEl) titleEl.value = '';
    if (bodyEl)  bodyEl.innerHTML = '';
    renderAnnouncements();
    renderAdminAnnList();
    if (typeof window !== 'undefined' && window.PortalRealtime && typeof window.PortalRealtime.broadcast === 'function') {
      window.PortalRealtime.broadcast('announcements', 'save');
    }
    if (typeof syncAnnouncementNotifications === 'function') {
      syncAnnouncementNotifications(announcements);
    } else if (typeof window !== 'undefined' && typeof window.syncAnnouncementNotifications === 'function') {
      window.syncAnnouncementNotifications(announcements);
    }
    if (typeof syncAllPortalNotifications === 'function') {
      syncAllPortalNotifications();
    } else if (typeof window !== 'undefined' && typeof window.syncAllPortalNotifications === 'function') {
      window.syncAllPortalNotifications();
    }
  } catch (e) {
    console.error('addAnnouncement error:', e);
    if (typeof showToast === 'function') {
      showToast('Failed to save announcement: ' + (e.message || e), 'error');
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}

/**
 * Deletes an announcement by index with user confirmation
 * @param {number} idx
 */
async function deleteAnnouncement(idx) {
  var a = announcements[idx];
  if (!a) return;

  var confirmed = false;
  var confirmMsg = 'Are you sure you want to delete "' + (a.title || 'this announcement') + '"?';
  if (typeof showConfirmModal === 'function') {
    confirmed = await showConfirmModal(confirmMsg, 'Delete Announcement');
  } else {
    confirmed = true;
  }
  if (!confirmed) return;

  announcements.splice(idx, 1);
  renderAnnouncements();
  renderAdminAnnList();

  try {
    if (typeof supa !== 'undefined' && supa.delete && a && a.id) {
      await supa.delete('bb_announcements?id=eq.' + a.id);
      if (typeof window !== 'undefined' && window.PortalRealtime && typeof window.PortalRealtime.broadcast === 'function') {
        window.PortalRealtime.broadcast('announcements', 'delete');
      }
    }
    if (typeof showToast === 'function') {
      showToast('Announcement deleted.', 'success');
    }
  } catch (e) {
    console.error('deleteAnnouncement error:', e);
    if (typeof showToast === 'function') {
      showToast('Failed to delete announcement from server.', 'error');
    }
  }
}

// ── Rich Text Toolbar & Formatting ─────────────────────────────────────────

function annSaveRange() {
  if (typeof window === 'undefined' || !window.getSelection) return;
  var editor = document.getElementById('ann-body-input');
  if (!editor) return;

  var sel = window.getSelection();
  if (sel && sel.rangeCount > 0) {
    var range = sel.getRangeAt(0);
    if (editor.contains(range.commonAncestorContainer)) {
      _annSavedRange = range.cloneRange();
    }
  }
}

function annRestoreRange() {
  var editor = document.getElementById('ann-body-input');
  if (!editor) return;
  editor.focus();
  if (_annSavedRange && typeof window !== 'undefined' && window.getSelection) {
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(_annSavedRange);
  }
}

function annFmt(cmd) {
  annRestoreRange();
  if (typeof document !== 'undefined') {
    document.execCommand(cmd, false, null);
  }
}

function annFontSize(size) {
  annRestoreRange();
  if (typeof document !== 'undefined') {
    document.execCommand('fontSize', false, size === 'large' ? '5' : '3');
  }
}

function annColor(col) {
  annRestoreRange();
  if (typeof document !== 'undefined') {
    document.execCommand('foreColor', false, col);
  }
}

function annInsertLine() {
  annRestoreRange();
  if (typeof document !== 'undefined') {
    document.execCommand('insertHTML', false, '<hr style="border:none;border-top:1px solid var(--border-card);margin:10px 0;"/>');
  }
}

function toggleAnnEmoji() {
  var picker = document.getElementById('ann-emoji-picker');
  if (!picker) return;
  annSaveRange();

  if (picker.style.display === 'none' || !picker.style.display) {
    if (!picker.innerHTML) {
      picker.style.display = 'flex';
      var html = '';
      ANN_EMOJIS.forEach(function(e) {
        html += '<button type="button" data-emoji="' + e + '" aria-label="Emoji ' + e + '" style="background:none;border:none;cursor:pointer;font-size:20px;width:32px;height:32px;border-radius:6px;padding:0;line-height:1;transition:background 0.15s;">' + e + '</button>';
      });
      picker.innerHTML = html;
      picker.querySelectorAll('[data-emoji]').forEach(function(btn) {
        btn.addEventListener('click', function() {
          annRestoreRange();
          if (typeof document !== 'undefined') {
            document.execCommand('insertText', false, btn.getAttribute('data-emoji'));
          }
          annSaveRange();
          picker.style.display = 'none';
        });
      });
    } else {
      picker.style.display = 'flex';
    }

    // Dismiss on outside click
    setTimeout(function() {
      if (typeof document === 'undefined') return;
      document.addEventListener('click', function closeEmoji(e) {
        if (!picker.contains(e.target) && e.target.id !== 'ann-emoji-btn' && !e.target.closest('#ann-emoji-btn')) {
          picker.style.display = 'none';
          document.removeEventListener('click', closeEmoji);
        }
      });
    }, 50);
  } else {
    picker.style.display = 'none';
  }
}

// Attach range saving listeners on contenteditable editor
if (typeof document !== 'undefined') {
  document.addEventListener('mouseup', function(e) {
    var editor = document.getElementById('ann-body-input');
    if (editor && editor.contains(e.target)) annSaveRange();
  });
}

// ── Global Window Exports (HTML inline handler compatibility) ────────────────
if (typeof window !== 'undefined') {
  window.announcements            = announcements;
  window.SAFE_REACTION_EMOJIS     = SAFE_REACTION_EMOJIS;
  window.REACT_EMOJIS             = REACT_EMOJIS;
  window.ANN_EMOJIS               = ANN_EMOJIS;
  window.sanitizeAnnouncementHtml = sanitizeAnnouncementHtml;
  window.loadAnnouncements        = loadAnnouncements;
  window.renderAnnouncements      = renderAnnouncements;
  window.toggleReaction           = toggleReaction;
  window.renderAdminAnnList       = renderAdminAnnList;
  window.openEditAnnouncement     = openEditAnnouncement;
  window.cancelEditAnnouncement   = cancelEditAnnouncement;
  window.addAnnouncement          = addAnnouncement;
  window.deleteAnnouncement       = deleteAnnouncement;
  window.broadcastAnnouncementEmail = broadcastAnnouncementEmail;
  window.annSaveRange             = annSaveRange;
  window.annRestoreRange          = annRestoreRange;
  window.annFmt                   = annFmt;
  window.annFontSize              = annFontSize;
  window.annColor                 = annColor;
  window.annInsertLine            = annInsertLine;
  window.toggleAnnEmoji           = toggleAnnEmoji;
  window.handleAnnouncementImageSelect    = handleAnnouncementImageSelect;
  window.handleAnnouncementImageUrlInput  = handleAnnouncementImageUrlInput;
  window.updateAnnouncementInfographicPreview = updateAnnouncementInfographicPreview;
  window.clearAnnouncementInfographic     = clearAnnouncementInfographic;
  window.handleAnnouncementImageError     = handleAnnouncementImageError;
}

// ── Node.js Module Exports ──────────────────────────────────────────────────
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    announcements: announcements,
    SAFE_REACTION_EMOJIS: SAFE_REACTION_EMOJIS,
    REACT_EMOJIS: REACT_EMOJIS,
    ANN_EMOJIS: ANN_EMOJIS,
    sanitizeAnnouncementHtml: sanitizeAnnouncementHtml,
    loadAnnouncements: loadAnnouncements,
    renderAnnouncements: renderAnnouncements,
    toggleReaction: toggleReaction,
    renderAdminAnnList: renderAdminAnnList,
    openEditAnnouncement: openEditAnnouncement,
    cancelEditAnnouncement: cancelEditAnnouncement,
    addAnnouncement: addAnnouncement,
    deleteAnnouncement: deleteAnnouncement,
    broadcastAnnouncementEmail: broadcastAnnouncementEmail,
    annSaveRange: annSaveRange,
    annRestoreRange: annRestoreRange,
    annFmt: annFmt,
    annFontSize: annFontSize,
    annColor: annColor,
    annInsertLine: annInsertLine,
    toggleAnnEmoji: toggleAnnEmoji,
    handleAnnouncementImageSelect: handleAnnouncementImageSelect,
    handleAnnouncementImageUrlInput: handleAnnouncementImageUrlInput,
    updateAnnouncementInfographicPreview: updateAnnouncementInfographicPreview,
    clearAnnouncementInfographic: clearAnnouncementInfographic,
    handleAnnouncementImageError: handleAnnouncementImageError
  };
}
