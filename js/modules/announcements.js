/**
 * 1st Petaling Jaya Boys' Brigade Portal
 * Announcements Module
 *
 * Implements public announcement feed, rich text formatting bar,
 * emoji reactions, and admin post/edit/delete operations.
 */

/* global supa, sessionGet, escapeHtml, safeUrl, sanitizeHtml, sanitizeInput, showToast, showConfirmModal, createSmartLoader, renderSkeletonCard, syncAnnouncementNotifications, uploadSingleMediaFile, openAnnouncementZoomModal, _cachedDepartmentMembers, isSuperAdmin, isAdmin, isPortalCreator */

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
    var formattedBody = formatAnnouncementMentions(sanitizedBody);
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

    var safeTitle = formatAnnouncementMentions((typeof escapeHtml === 'function') ? escapeHtml(a.title || '') : (a.title || ''));
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
      + '<div class="ann-body">' + formattedBody + '</div>'
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
// ── Announcements Mentions Engine (@Mentions) ──────────────────────────────
var _currentAnnMentionCandidates = [];
var _activeAnnMentionIndex = 0;
var _activeAnnMentionTarget = null;

/**
 * Retrieves mention candidate list for announcements
 * @param {string} query
 * @returns {Array<Object>}
 */
function getAnnouncementMentionCandidates(query) {
  var q = (query || '').toLowerCase().trim();
  var candidates = [];

  var presetGroups = [
    { name: 'all', label: '@all', role: 'Group', desc: 'All Company Members' },
    // Departments
    { name: 'Secretariat', label: '@Secretariat', role: 'Department', desc: 'Secretariat Department' },
    { name: 'Logistics', label: '@Logistics', role: 'Department', desc: 'Logistics Department' },
    { name: 'Media', label: '@Media', role: 'Department', desc: 'Media Department' },
    { name: 'HQ', label: '@HQ', role: 'Department', desc: 'HQ Management' },
    { name: 'Officers', label: '@Officers', role: 'Department', desc: 'Company Officers' },
    // Admins & Super Admins
    { name: 'admins', label: '@admins', role: 'Role', desc: 'Portal Administrators' },
    { name: 'super admins', label: '@super admins', role: 'Role', desc: 'Super Administrators' },
    // Squads
    { name: 'P1', label: '@P1', role: 'Squad', desc: 'Papa 1 Squad' },
    { name: 'P2', label: '@P2', role: 'Squad', desc: 'Papa 2 Squad' },
    { name: 'A1', label: '@A1', role: 'Squad', desc: 'Alpha 1 Squad' },
    { name: 'A2', label: '@A2', role: 'Squad', desc: 'Alpha 2 Squad' },
    { name: 'Z1', label: '@Z1', role: 'Squad', desc: 'Zulu 1 Squad' },
    { name: 'Z2', label: '@Z2', role: 'Squad', desc: 'Zulu 2 Squad' },
    // Platoons
    { name: 'Papa', label: '@Papa', role: 'Platoon', desc: 'Papa Platoon' },
    { name: 'Alpha', label: '@Alpha', role: 'Platoon', desc: 'Alpha Platoon' },
    { name: 'Zulu', label: '@Zulu', role: 'Platoon', desc: 'Zulu Platoon' },
    // Sections & Creator
    { name: 'creator', label: '@creator', role: 'Role', desc: 'Portal Creator (Jeshua Koh)' },
    { name: 'seniors', label: '@seniors', role: 'Section', desc: 'Senior Section Members' },
    { name: 'juniors', label: '@juniors', role: 'Section', desc: 'Junior Section Members' }
  ];

  presetGroups.forEach(function(g) {
    if (!q || g.name.toLowerCase().indexOf(q) !== -1 || g.label.toLowerCase().indexOf(q) !== -1) {
      candidates.push(g);
    }
  });

  // Members
  var memberMap = {};
  var myName = (typeof sessionGet === 'function' ? sessionGet('name') : '') || '';
  if (myName) {
    memberMap[myName] = {
      name: myName,
      label: '@' + myName,
      role: (typeof sessionGet === 'function' ? sessionGet('rank') : '') || 'Member',
      desc: ((typeof sessionGet === 'function' ? sessionGet('rank') : '') || 'Member') + ' (You)'
    };
  }

  try {
    if (typeof localStorage !== 'undefined') {
      var cached = JSON.parse(localStorage.getItem('bb_cached_members') || '[]');
      if (Array.isArray(cached)) {
        cached.forEach(function(m) {
          if (m && m.name && m.name.trim() && !memberMap[m.name.trim()]) {
            memberMap[m.name.trim()] = {
              name: m.name.trim(),
              label: '@' + m.name.trim(),
              role: m.rank || 'Member',
              desc: (m.rank || 'Member') + (m.department ? (' · ' + m.department) : '')
            };
          }
        });
      }
    }
  } catch (_) {}

  if (typeof _cachedDepartmentMembers !== 'undefined' && Array.isArray(_cachedDepartmentMembers)) {
    _cachedDepartmentMembers.forEach(function(m) {
      if (m && m.name && m.name.trim() && !memberMap[m.name.trim()]) {
        memberMap[m.name.trim()] = {
          name: m.name.trim(),
          label: '@' + m.name.trim(),
          role: m.department || m.rank || 'Member',
          desc: (m.rank || 'Member') + (m.department ? (' · ' + m.department) : '')
        };
      }
    });
  }

  Object.keys(memberMap).sort().forEach(function(k) {
    var m = memberMap[k];
    if (!q || m.name.toLowerCase().indexOf(q) !== -1 || m.label.toLowerCase().indexOf(q) !== -1) {
      candidates.push(m);
    }
  });

  return candidates;
}

/**
 * Wraps @mentions in announcement text with styled mention badges
 * @param {string} text
 * @returns {string}
 */
function formatAnnouncementMentions(text) {
  if (!text) return '';
  var groups = [
    'Secretariat', 'Logistics', 'Media', 'HQ', 'Officers',
    'super admins', 'super admin', 'admins', 'admin',
    'P1', 'P2', 'A1', 'A2', 'Z1', 'Z2',
    'Papa', 'Alpha', 'Zulu',
    'seniors', 'juniors', 'creator', 'all'
  ];
  var candidates = groups.slice();

  var myName = (typeof sessionGet === 'function' ? sessionGet('name') : '') || '';
  if (myName && myName.trim()) candidates.push(myName.trim());
  try {
    if (typeof localStorage !== 'undefined') {
      var cached = JSON.parse(localStorage.getItem('bb_cached_members') || '[]');
      if (Array.isArray(cached)) {
        cached.forEach(function(m) {
          if (m && m.name && m.name.trim()) candidates.push(m.name.trim());
        });
      }
    }
  } catch (_) {}

  if (typeof _cachedDepartmentMembers !== 'undefined' && Array.isArray(_cachedDepartmentMembers)) {
    _cachedDepartmentMembers.forEach(function(m) {
      if (m && m.name && m.name.trim()) candidates.push(m.name.trim());
    });
  }

  var seen = {};
  var unique = [];
  candidates.forEach(function(name) {
    var k = name.toLowerCase();
    if (!seen[k]) {
      seen[k] = true;
      unique.push(name);
    }
  });
  unique.sort(function(a, b) { return b.length - a.length; });

  var out = text;
  unique.forEach(function(name) {
    if (!name) return;
    var esc = name.replace(/[.*+?^${}()|[\]\\]/g, function(ch) { return '\\' + ch; });
    var rx = new RegExp('(^|[^a-zA-Z0-9_>])@(' + esc + ')(?=[^a-zA-Z0-9_]|$)', 'gi');
    out = out.replace(rx, function(match, prefix, matchedName) {
      return prefix + '<span class="tb-mention-pill">@' + matchedName + '</span>';
    });
  });

  // Fallback for uppercase multi-word member names (e.g. OLIVER LING CHEE SHENG) if not in candidate list
  out = out.replace(/(^|[^a-zA-Z0-9_>])@([A-Z0-9_]+(?:\s+[A-Z0-9_]+){1,5})(?=[^a-zA-Z0-9_]|$)/g, function(match, prefix, mName) {
    return prefix + '<span class="tb-mention-pill">@' + mName + '</span>';
  });

  // Fallback for 2-word names (e.g. Jeshua Koh) if not in candidate list
  out = out.replace(/(^|[^a-zA-Z0-9_>])@([a-zA-Z0-9_]+(?:\s+[a-zA-Z0-9_]+)?)(?=[^a-zA-Z0-9_]|$)/g, function(match, prefix, mName) {
    return prefix + '<span class="tb-mention-pill">@' + mName + '</span>';
  });

  // Fallback for single-word mentions (e.g. @group)
  out = out.replace(/(^|[^a-zA-Z0-9_>])@([a-zA-Z0-9_-]+)(?=[^a-zA-Z0-9_]|$)/g, function(match, prefix, mName) {
    return prefix + '<span class="tb-mention-pill">@' + mName + '</span>';
  });

  return out;
}

/**
 * Checks if user is mentioned in an announcement
 */
function isUserMentionedInAnnouncement(text, myName, myEmail, myDept, myRank, mySquad, myPlatoon, mySection) {
  if (!text) return false;
  var cleanText = String(text)
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]+>/g, ' ');
  var lower = cleanText.toLowerCase();

  // 1. @all
  if (/(?:^|\W)@(all|everyone|everybody)\b/i.test(lower)) return true;

  // 2. Individual @Name
  if (myName) {
    var myNameLower = myName.toLowerCase().trim();
    if (lower.indexOf('@' + myNameLower) !== -1) return true;
    var nameParts = myNameLower.split(/\s+/).filter(function(p) { return p.length >= 3; });
    for (var i = 0; i < nameParts.length; i++) {
      var rx = new RegExp('(?:^|\\W)@' + nameParts[i] + '\\b', 'i');
      if (rx.test(lower)) return true;
    }
  }

  // Also check email user prefix
  if (myEmail) {
    var myEmailLower = myEmail.toLowerCase().trim();
    if (lower.indexOf('@' + myEmailLower) !== -1) return true;
    var emailPrefix = myEmailLower.split('@')[0];
    if (emailPrefix && emailPrefix.length >= 3) {
      var erx = new RegExp('(?:^|\\W)@' + emailPrefix + '\\b', 'i');
      if (erx.test(lower)) return true;
    }
  }

  // 3. Departments: Secretariat, Logistics, Media, HQ, Officers
  var deptStr = (myDept || (typeof sessionGet === 'function' ? sessionGet('department') : '') || '').toLowerCase().trim();
  if (deptStr) {
    if (lower.indexOf('@' + deptStr) !== -1) return true;
    if (deptStr.indexOf('secretariat') !== -1 && lower.indexOf('@secretariat') !== -1) return true;
    if (deptStr.indexOf('logistics') !== -1 && lower.indexOf('@logistics') !== -1) return true;
    if (deptStr.indexOf('media') !== -1 && lower.indexOf('@media') !== -1) return true;
    if (deptStr.indexOf('hq') !== -1 && lower.indexOf('@hq') !== -1) return true;
    if ((deptStr === 'officers' || deptStr === 'officer') && /(?:^|\W)@officers?\b/i.test(lower)) return true;
  }
  var rankStr = (myRank || (typeof sessionGet === 'function' ? sessionGet('rank') : '') || '');
  var isOfficerRank = rankStr && ['Officer', 'Lieutenant', 'Captain', 'Honarary Captain', 'Honorary Captain', 'Chaplain', 'Warrant Officer', 'Instructor', 'Staff Sergeant'].indexOf(rankStr) !== -1;
  if (isOfficerRank && /(?:^|\W)@officers?\b/i.test(lower)) return true;

  // 4. Squads: P1, P2, A1, A2, Z1, Z2
  var squadStr = (mySquad || (typeof sessionGet === 'function' ? sessionGet('squad') : '') || '').toLowerCase().trim();
  if (squadStr) {
    if (lower.indexOf('@' + squadStr) !== -1) return true;
    var normSquad = squadStr.replace(/[^a-z0-9]/g, '');
    if (normSquad === 'p1' || normSquad === 'papa1' || (squadStr.indexOf('papa') !== -1 && squadStr.indexOf('1') !== -1)) {
      if (/(?:^|\W)@p1\b/i.test(lower)) return true;
    }
    if (normSquad === 'p2' || normSquad === 'papa2' || (squadStr.indexOf('papa') !== -1 && squadStr.indexOf('2') !== -1)) {
      if (/(?:^|\W)@p2\b/i.test(lower)) return true;
    }
    if (normSquad === 'a1' || normSquad === 'alpha1' || (squadStr.indexOf('alpha') !== -1 && squadStr.indexOf('1') !== -1)) {
      if (/(?:^|\W)@a1\b/i.test(lower)) return true;
    }
    if (normSquad === 'a2' || normSquad === 'alpha2' || (squadStr.indexOf('alpha') !== -1 && squadStr.indexOf('2') !== -1)) {
      if (/(?:^|\W)@a2\b/i.test(lower)) return true;
    }
    if (normSquad === 'z1' || normSquad === 'zulu1' || (squadStr.indexOf('zulu') !== -1 && squadStr.indexOf('1') !== -1)) {
      if (/(?:^|\W)@z1\b/i.test(lower)) return true;
    }
    if (normSquad === 'z2' || normSquad === 'zulu2' || (squadStr.indexOf('zulu') !== -1 && squadStr.indexOf('2') !== -1)) {
      if (/(?:^|\W)@z2\b/i.test(lower)) return true;
    }
  }

  // 5. Platoons: Papa, Alpha, Zulu
  var platoonStr = (myPlatoon || (typeof sessionGet === 'function' ? sessionGet('platoon') : '') || squadStr || '').toLowerCase().trim();
  if (platoonStr) {
    if (platoonStr.indexOf('papa') !== -1 && /(?:^|\W)@papa\b/i.test(lower)) return true;
    if (platoonStr.indexOf('alpha') !== -1 && /(?:^|\W)@alpha\b/i.test(lower)) return true;
    if (platoonStr.indexOf('zulu') !== -1 && /(?:^|\W)@zulu\b/i.test(lower)) return true;
  }

  // 6. Section groups: seniors, juniors
  var secStr = (mySection || (typeof sessionGet === 'function' ? sessionGet('section') : '') || '').toLowerCase().trim();
  if (secStr.indexOf('senior') !== -1 || isOfficerRank) {
    if (/(?:^|\W)@seniors?\b/i.test(lower)) return true;
  }
  if (secStr.indexOf('junior') !== -1 || secStr.indexOf('pre-junior') !== -1) {
    if (/(?:^|\W)@juniors?\b/i.test(lower)) return true;
  }

  // 7. Creator: @creator
  var isCreator = (typeof isPortalCreator === 'function')
    ? isPortalCreator(myName, myEmail)
    : (/jeshua\s+koh/i.test(myName) || (myEmail && myEmail.toLowerCase().indexOf('jeshuakoh2008@gmail.com') !== -1));
  if (isCreator && /(?:^|\W)@creator\b/i.test(lower)) return true;

  // 8. Super Admins: @super admins / @super admin
  var isSuper = (typeof isSuperAdmin === 'function' && isSuperAdmin())
    || (typeof window !== 'undefined' && typeof window.isSuperAdmin === 'function' && window.isSuperAdmin());
  if (!isSuper && typeof sessionGet === 'function') {
    var sRole = (sessionGet('role') || '').toLowerCase();
    if (sRole === 'superadmin' || sRole === 'super admin') isSuper = true;
  }
  if (isSuper && /(?:^|\W)@(super\s*admins?)\b/i.test(lower)) return true;

  // 9. Admins: @admins / @admin
  var isAdminUser = isSuper || (typeof isAdmin === 'function' && isAdmin())
    || (typeof window !== 'undefined' && typeof window.isAdmin === 'function' && window.isAdmin());
  if (!isAdminUser && typeof sessionGet === 'function') {
    var aRole = (sessionGet('role') || '').toLowerCase();
    if (aRole === 'admin' || aRole === 'superadmin') isAdminUser = true;
  }
  if (isAdminUser && /(?:^|\W)@(admins?|administrators?)\b/i.test(lower)) return true;

  return false;
}

/**
 * Floating mention dropdown UI for Announcements (#ann-body-input)
 */
function showAnnouncementMentionDropdown(el, query) {
  if (typeof document === 'undefined') return;
  _activeAnnMentionTarget = el;
  var container = el.parentNode;
  var dropdown = container ? container.querySelector('.ann-mentions-dropdown') : null;
  if (!dropdown && container) {
    dropdown = document.createElement('div');
    dropdown.className = 'tb-mentions-dropdown ann-mentions-dropdown';
    dropdown.setAttribute('role', 'listbox');
    dropdown.setAttribute('aria-label', 'Announcement mentions');
    dropdown.style.display = 'none';
    dropdown.style.position = 'absolute';
    dropdown.style.bottom = 'calc(100% + 4px)';
    dropdown.style.left = '0';
    dropdown.style.right = '0';
    container.style.position = 'relative';
    container.appendChild(dropdown);
  }
  if (!dropdown) return;

  var candidates = getAnnouncementMentionCandidates(query);
  _currentAnnMentionCandidates = candidates;
  _activeAnnMentionIndex = 0;

  if (!candidates.length) {
    dropdown.innerHTML = '<div style="padding:10px 14px;font-size:12px;color:var(--text-muted);font-style:italic;">No matching announcement groups or members</div>';
    dropdown.style.display = 'block';
    return;
  }

  var html = '';
  candidates.slice(0, 8).forEach(function(c, i) {
    var iconHtml = '<span style="width:24px;height:24px;border-radius:6px;background:rgba(217,163,35,0.2);color:var(--brand-gold,#f5c542);display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;">@</span>';
    if (c.role !== 'Group' && c.role !== 'Department' && c.role !== 'Squad' && c.role !== 'Platoon' && c.role !== 'Role' && c.role !== 'Section') {
      iconHtml = '<span style="width:24px;height:24px;border-radius:50%;background:#047857;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">' + (c.name ? c.name.charAt(0).toUpperCase() : 'M') + '</span>';
    }

    html += '<div class="tb-mention-item' + (i === 0 ? ' active' : '') + '" data-idx="' + i + '" onpointerdown="selectAnnouncementMentionCandidate(' + i + ', event)" ontouchstart="selectAnnouncementMentionCandidate(' + i + ', event)" onmousedown="selectAnnouncementMentionCandidate(' + i + ', event)">'
      + iconHtml
      + '<div style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;">'
        + '<div class="tb-mention-name">' + (typeof escapeHtml === 'function' ? escapeHtml(c.name) : c.name) + '</div>'
        + '<div style="font-size:10.5px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + (typeof escapeHtml === 'function' ? escapeHtml(c.desc || '') : (c.desc || '')) + '</div>'
      + '</div>'
      + '<span class="tb-mention-type">' + (typeof escapeHtml === 'function' ? escapeHtml(c.role || 'Member') : (c.role || 'Member')) + '</span>'
      + '</div>';
  });

  dropdown.innerHTML = html;
  dropdown.style.display = 'block';
}

function hideAnnouncementMentionDropdown() {
  if (typeof document === 'undefined') return;
  var dropdowns = document.querySelectorAll('.ann-mentions-dropdown');
  dropdowns.forEach(function(d) { d.style.display = 'none'; });
  _currentAnnMentionCandidates = [];
  _activeAnnMentionIndex = 0;
}

function handleAnnouncementMentionInput(el) {
  if (!el) return;
  _activeAnnMentionTarget = el;

  var text = '';
  var sel = (typeof window !== 'undefined' && window.getSelection) ? window.getSelection() : null;
  if (sel && sel.focusNode) {
    var nodeText = sel.focusNode.textContent || '';
    var offset = sel.focusOffset || 0;
    text = nodeText.slice(0, offset);
  } else {
    text = el.innerText || el.textContent || '';
  }

  var match = text.match(/@([a-zA-Z0-9_\s]*)$/);
  if (match) {
    var query = match[1];
    if (query.split(/\s+/).length <= 6) {
      showAnnouncementMentionDropdown(el, query);
      return;
    }
  }

  hideAnnouncementMentionDropdown();
}

function handleAnnouncementMentionKeyDown(e, el) {
  var dropdown = el && el.parentNode ? el.parentNode.querySelector('.ann-mentions-dropdown') : null;
  var isDropdownOpen = dropdown && dropdown.style.display !== 'none' && _currentAnnMentionCandidates.length > 0;

  if (isDropdownOpen) {
    var items = dropdown.querySelectorAll('.tb-mention-item');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      _activeAnnMentionIndex = (_activeAnnMentionIndex + 1) % items.length;
      items.forEach(function(item, i) { item.classList.toggle('active', i === _activeAnnMentionIndex); });
      return;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      _activeAnnMentionIndex = (_activeAnnMentionIndex - 1 + items.length) % items.length;
      items.forEach(function(item, i) { item.classList.toggle('active', i === _activeAnnMentionIndex); });
      return;
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      selectAnnouncementMentionCandidate(_activeAnnMentionIndex);
      return;
    } else if (e.key === 'Escape') {
      e.preventDefault();
      hideAnnouncementMentionDropdown();
      return;
    }
  }
}

function selectAnnouncementMentionCandidate(idx, event) {
  if (event && event.preventDefault) event.preventDefault();
  var candidate = _currentAnnMentionCandidates[idx];
  if (!candidate) { hideAnnouncementMentionDropdown(); return; }

  var input = _activeAnnMentionTarget || (typeof document !== 'undefined' ? document.getElementById('ann-body-input') : null);
  if (!input) { hideAnnouncementMentionDropdown(); return; }

  if (input.isContentEditable || input.getAttribute('contenteditable') === 'true') {
    var sel = (typeof window !== 'undefined' && window.getSelection) ? window.getSelection() : null;
    if (sel && sel.focusNode) {
      var node = sel.focusNode;
      var nodeText = node.textContent || '';
      var offset = sel.focusOffset || nodeText.length;
      var beforeC = nodeText.slice(0, offset);
      var afterC = nodeText.slice(offset);
      var newBeforeC = beforeC.replace(/@([a-zA-Z0-9_\s]*)$/, '');
      node.textContent = newBeforeC;

      var pill = document.createElement('span');
      pill.className = 'tb-mention-pill';
      pill.setAttribute('contenteditable', 'false');
      pill.textContent = '@' + candidate.name;

      var spaceNode = document.createTextNode('\u00A0');
      var parent = node.parentNode;
      if (parent) {
        parent.insertBefore(pill, node.nextSibling);
        parent.insertBefore(spaceNode, pill.nextSibling);
        if (afterC) {
          var afterNode = document.createTextNode(afterC);
          parent.insertBefore(afterNode, spaceNode.nextSibling);
        }
        try {
          var range = document.createRange();
          range.setStartAfter(spaceNode);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
        } catch (_) {}
      }
    } else {
      var curText = input.innerText || input.textContent || '';
      input.innerHTML = formatAnnouncementMentions(curText.replace(/@([a-zA-Z0-9_\s]*)$/, '@' + candidate.name + ' '));
    }
  } else {
    var val = input.value || '';
    var cursor = (typeof input.selectionStart === 'number') ? input.selectionStart : val.length;
    var b = val.slice(0, cursor);
    var a = val.slice(cursor);
    var nb = b.replace(/@([a-zA-Z0-9_\s]*)$/, '@' + candidate.name + ' ');
    input.value = nb + a;
    input.selectionStart = input.selectionEnd = nb.length;
  }

  input.focus();
  hideAnnouncementMentionDropdown();
}


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
  window.getAnnouncementMentionCandidates = getAnnouncementMentionCandidates;
  window.formatAnnouncementMentions       = formatAnnouncementMentions;
  window.isUserMentionedInAnnouncement    = isUserMentionedInAnnouncement;
  window.showAnnouncementMentionDropdown  = showAnnouncementMentionDropdown;
  window.hideAnnouncementMentionDropdown  = hideAnnouncementMentionDropdown;
  window.handleAnnouncementMentionInput   = handleAnnouncementMentionInput;
  window.handleAnnouncementMentionKeyDown = handleAnnouncementMentionKeyDown;
  window.selectAnnouncementMentionCandidate = selectAnnouncementMentionCandidate;
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
    handleAnnouncementImageError: handleAnnouncementImageError,
    getAnnouncementMentionCandidates: getAnnouncementMentionCandidates,
    formatAnnouncementMentions: formatAnnouncementMentions,
    isUserMentionedInAnnouncement: isUserMentionedInAnnouncement,
    showAnnouncementMentionDropdown: showAnnouncementMentionDropdown,
    hideAnnouncementMentionDropdown: hideAnnouncementMentionDropdown,
    handleAnnouncementMentionInput: handleAnnouncementMentionInput,
    handleAnnouncementMentionKeyDown: handleAnnouncementMentionKeyDown,
    selectAnnouncementMentionCandidate: selectAnnouncementMentionCandidate
  };
}
