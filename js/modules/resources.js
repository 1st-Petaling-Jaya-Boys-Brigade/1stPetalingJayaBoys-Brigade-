/**
 * 1st Petaling Jaya Boys' Brigade Portal
 * Company Resources Hub
 *
 * Implements a searchable repository for official company documents (BB Handbook,
 * Drill & Ceremonial Manual, Badge Syllabi, Songs & Hymns, Administrative Forms)
 * with role-based visibility (All, NCOs, Officers) and Supabase/Drive integration.
 */

// ── Default Resources (Empty by default; managed via Admin Console) ────────
var DEFAULT_COMPANY_RESOURCES = [];

// ── State ──────────────────────────────────────────────────────────────────
var resources = [];
var _activeResourceCategory = 'All';
var _resourceSearchQuery = '';

// Standard Category List
var RESOURCE_CATEGORIES = [
  'All',
  'Handbooks & Manuals',
  'Badges & Syllabi',
  'Forms & Administration',
  'BB Songs & Hymns',
  'Band & Music'
];

var STANDARD_NCO_RANKS = [
  'Lance Corporal', 'Corporal', 'Sergeant', 'Staff Sergeant',
  'Warrant Officer', 'Lieutenant', 'Captain', 'Honarary Captain', 'Honorary Captain', 'Chaplain', 'Officer', 'Instructor'
];

var STANDARD_OFFICER_RANKS = [
  'Warrant Officer', 'Lieutenant', 'Captain', 'Honarary Captain', 'Honorary Captain', 'Chaplain', 'Officer', 'Instructor', 'Staff Sergeant'
];

// ── Data Ingestion & Persistence ───────────────────────────────────────────
/**
 * Loads resources from Supabase bb_config, filtering out any legacy placeholder docs
 */
async function loadResources() {
  try {
    var client = (typeof supa !== 'undefined') ? supa : (typeof getSupa === 'function' ? getSupa() : null);
    if (client && typeof client.getConfigSnapshot === 'function') {
      var snapRes = client.getConfigSnapshot('bb_resources');
      if (Array.isArray(snapRes)) {
        var LEGACY_PLACEHOLDER_IDS = ['res_handbook', 'res_drill', 'res_founders', 'res_songs', 'res_leave_form'];
        var realDocs = snapRes.filter(function(r) {
          if (!r || !r.url) return false;
          var isPlaceholder = (r.id && LEGACY_PLACEHOLDER_IDS.indexOf(r.id) !== -1) ||
                              (r.url && r.url.indexOf('bbpj1.org/docs/') !== -1) ||
                              (r.url === 'https://docs.google.com/document/d/1BBPJ1LeaveOfAbsenceForm/edit');
          return !isPlaceholder;
        });
        resources.length = 0;
        realDocs.forEach(function(r) { resources.push(r); });
        renderResourcesPage();
        renderAdminResourcesList();
        return;
      }
    }
    if (typeof supa !== 'undefined' && supa.get) {
      var rows = await supa.get('bb_config?key=eq.bb_resources&select=value');
      if (rows && rows.length && rows[0].value) {
        var parsed = JSON.parse(rows[0].value);
        if (Array.isArray(parsed)) {
          // Filter out any legacy non-working placeholder docs
          var LEGACY_PLACEHOLDER_IDS = ['res_handbook', 'res_drill', 'res_founders', 'res_songs', 'res_leave_form'];
          var realDocs = parsed.filter(function(r) {
            if (!r || !r.url) return false;
            var isPlaceholder = (r.id && LEGACY_PLACEHOLDER_IDS.indexOf(r.id) !== -1) ||
                                (r.url && r.url.indexOf('bbpj1.org/docs/') !== -1) ||
                                (r.url === 'https://docs.google.com/document/d/1BBPJ1LeaveOfAbsenceForm/edit');
            return !isPlaceholder;
          });

          resources.length = 0;
          realDocs.forEach(function(r) { resources.push(r); });

        }
      }
    }
  } catch (e) {
    console.warn('loadResources error:', e);
  }

  if (typeof window !== 'undefined') {
    window.resources = resources;
  }

  renderResourcesPage();
  var admPanel = (typeof document !== 'undefined') ? document.getElementById('adm-resources-list') : null;
  if (admPanel) {
    renderAdminResourcesList();
  }
  var syncResFn = (typeof window !== 'undefined' && typeof window.syncResourceNotifications === 'function')
    ? window.syncResourceNotifications
    : ((typeof global !== 'undefined' && typeof global.syncResourceNotifications === 'function') ? global.syncResourceNotifications : null);
  if (syncResFn) syncResFn(resources);
}

var _isUploadingResource = false;
var _lastUploadedFileSize = '';

/**
 * Formats byte size into human-readable format
 * @param {number} bytes
 * @returns {string}
 */
function formatFileSize(bytes) {
  if (bytes === 0 || bytes === '0') return '0 B';
  if (!bytes || isNaN(bytes) || bytes < 0) return '';
  var num = Number(bytes);
  if (num < 1024) return num + ' B';
  if (num < 1024 * 1024) return (num / 1024).toFixed(1) + ' KB';
  if (num < 1024 * 1024 * 1024) return (num / (1024 * 1024)).toFixed(1) + ' MB';
  return (num / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}

/**
 * Auto-detects resource type badge when a document URL is entered or pasted
 * @param {string} val
 */
function handleResourceUrlInput(val) {
  var url = (val || '').trim();
  var typeInp = (typeof document !== 'undefined') ? document.getElementById('adm-res-type') : null;
  if (!typeInp || !url) return;
  if (url.indexOf('drive.google.com') !== -1 || url.indexOf('docs.google.com') !== -1) {
    if (url.indexOf('/document/') !== -1) typeInp.value = 'DOC';
    else if (url.indexOf('/spreadsheets/') !== -1) typeInp.value = 'SHEET';
    else typeInp.value = 'DRIVE';
  } else if (url.toLowerCase().endsWith('.pdf')) {
    typeInp.value = 'PDF';
  }
}

/**
 * Persists the current resources list to Supabase bb_config
 * @param {Array} list
 */
async function saveResources(list) {
  var next = Array.isArray(list) ? list : resources;
  var serialized = JSON.stringify(next);

  if (typeof supa === 'undefined') throw new Error('Database unavailable');
  var record = { key: 'bb_resources', value: serialized };
  if (typeof supa.req === 'function') await supa.req('POST', 'bb_config?on_conflict=key', record, {
    Prefer: 'return=representation,resolution=merge-duplicates'
  });
  else await supa.upsert('bb_config', record, 'key');

  resources.splice(0, resources.length, ...JSON.parse(serialized));
  if (typeof supa.recordConfigSnapshot === 'function') supa.recordConfigSnapshot('bb_resources', resources);
  renderResourcesPage();
  renderAdminResourcesList();
}

// ── Role & Permission Checking ─────────────────────────────────────────────
/**
 * Checks whether current logged-in user can access a given resource visibility level
 * @param {string} visibility - 'all' | 'nco' | 'officer'
 * @returns {boolean}
 */
function isPublicResource(visibility) {
  return ['', 'all', 'public'].includes(String(visibility || '').trim().toLowerCase());
}

function hasResourceAccess(visibility) {
  if (isPublicResource(visibility)) return true;
  visibility = String(visibility).trim().toLowerCase();
  if (visibility !== 'nco' && visibility !== 'officer') return false;

  var currentRank = '';
  var isAdmin = false;

  if (typeof sessionGet === 'function') {
    if (!(sessionGet('ic') || sessionGet('email'))) return false;
    currentRank = sessionGet('rank') || '';
    isAdmin = typeof window !== 'undefined' && typeof window.hasAdminModuleAccess === 'function' &&
      window.hasAdminModuleAccess('resources');
  }

  if (isAdmin) return true;

  var isOfficer = STANDARD_OFFICER_RANKS.indexOf(currentRank) !== -1;
  var isNco = isOfficer ||
              STANDARD_NCO_RANKS.indexOf(currentRank) !== -1;

  if (visibility === 'officer') {
    return isOfficer;
  }
  if (visibility === 'nco') {
    return isNco;
  }
  return false;
}

function parseResourceUrl(raw) {
  if (typeof raw !== 'string') return null;
  try {
    var url = new URL(raw);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url : null;
  } catch (_) {
    return null;
  }
}

function getResourceStorageObject(url) {
  var configured = parseResourceUrl(typeof SUPA_URL !== 'undefined' ? SUPA_URL : '');
  if (!url || !configured || url.origin !== configured.origin) return null;
  var match = url.pathname.match(/^\/storage\/v1\/object\/(authenticated|public|sign)\/([^/]+)\/(.+)$/);
  return match ? { mode: match[1], bucket: match[2], path: match[3] } : null;
}
// ── Search & Filter ────────────────────────────────────────────────────────
/**
 * Sets current filter category and re-renders
 * @param {string} category
 */
function setResourceCategory(category) {
  _activeResourceCategory = category || 'All';
  renderResourcesPage();
}

/**
 * Updates search query and re-renders
 * @param {string} query
 */
function searchResources(query) {
  _resourceSearchQuery = (query || '').trim().toLowerCase();
  renderResourcesPage();
}

/**
 * Derives document thumbnail URL from Google Drive, direct image, or stored thumbnail
 * @param {Object} r - Resource document object
 * @returns {string|null}
 */
function getResourceThumbnailUrl(r) {
  if (!r) return null;
  var thumbnail = parseResourceUrl(r.thumbnailUrl || r.thumbnail);
  if (thumbnail) return thumbnail.href;
  var url = parseResourceUrl(r.url);
  if (!url) return null;

  // Direct image files
  if (/\.(png|jpe?g|webp|gif|svg)$/i.test(url.pathname)) {
    return url.href;
  }

  // Google Drive & Google Docs thumbnails
  if (url.protocol !== 'https:' || !['drive.google.com', 'docs.google.com'].includes(url.hostname)) return null;
  var match = url.pathname.match(/\/(?:file|document|spreadsheets|presentation)\/d\/([a-zA-Z0-9_-]+)(?:\/|$)/);
  var id = match ? match[1] : url.searchParams.get('id');
  return id && /^[a-zA-Z0-9_-]+$/.test(id) ? 'https://drive.google.com/thumbnail?id=' + id + '&sz=w400' : null;
}

// ── Public View Rendering ──────────────────────────────────────────────────
/**
 * Renders the Company Resources tab page
 */
function renderResourcesPage() {
  if (typeof document === 'undefined') return;
  var container = document.getElementById('resources-list-container');
  var countEl   = document.getElementById('resources-count');
  var pillsEl   = document.getElementById('resources-category-pills');

  if (!container) return;

  // Render category filter pills
  if (pillsEl) {
    var phtml = '';
    RESOURCE_CATEGORIES.forEach(function(cat) {
      var active = cat === _activeResourceCategory;
      phtml += '<button type="button" class="resource-pill ' + (active ? 'active' : '') + '" onclick="setResourceCategory(\'' + cat.replace(/'/g, "\\'") + '\')">'
        + cat
        + '</button>';
    });
    pillsEl.innerHTML = phtml;
  }

  // 1. Check if total repository is currently empty
  if (!resources.length) {
    if (countEl) countEl.textContent = '0 resources';
        container.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:50px 20px;background:var(--bg-card);border:1px dashed var(--border-card);border-radius:14px;color:var(--text-muted);">'
      + '<div style="font-size:38px;margin-bottom:12px;">📚</div>'
      + '<div style="font-family:var(--font-headline);font-size:20px;font-weight:700;color:var(--text-primary);margin-bottom:6px;">No Company Resources Uploaded Yet</div>'
      + '<div style="font-size:13px;max-width:440px;margin:0 auto;line-height:1.6;">Official handbooks, drill manuals, syllabi, and administrative forms will appear here once uploaded by company administrators.</div>'
            + '</div>';
    return;
  }

  // 2. Filter resources
  var filtered = resources.filter(function(r) {
    // Category match
    if (_activeResourceCategory !== 'All' && r.category !== _activeResourceCategory) {
      return false;
    }
    // Search query match
    if (_resourceSearchQuery) {
      var t = (r.title || '').toLowerCase();
      var d = (r.description || '').toLowerCase();
      var c = (r.category || '').toLowerCase();
      var f = (r.fileType || '').toLowerCase();
      if (t.indexOf(_resourceSearchQuery) === -1 &&
          d.indexOf(_resourceSearchQuery) === -1 &&
          c.indexOf(_resourceSearchQuery) === -1 &&
          f.indexOf(_resourceSearchQuery) === -1) {
        return false;
      }
    }
    return true;
  });

  if (countEl) {
    countEl.textContent = 'Showing ' + filtered.length + ' of ' + resources.length + ' resources';
  }

  // 3. Filtered empty state (search returned 0 results)
  if (!filtered.length) {
    container.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px 20px;background:var(--bg-card);border:1px dashed var(--border-card);border-radius:14px;color:var(--text-muted);">'
      + '<div style="font-size:32px;margin-bottom:8px;">📂</div>'
      + '<div style="font-family:var(--font-headline);font-size:18px;font-weight:600;color:var(--text-primary);margin-bottom:4px;">No matching resources found</div>'
      + '<div style="font-size:13px;">Try selecting a different category or clearing your search keywords.</div>'
      + '<button type="button" onclick="setResourceCategory(\'All\');document.getElementById(\'resource-search-input\').value=\'\';searchResources(\'\');" style="margin-top:14px;background:var(--bg-card-subtle);border:1px solid var(--border-card);color:var(--text-primary);padding:8px 16px;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;">Clear Filters</button>'
      + '</div>';
    return;
  }

  var html = '';
  filtered.forEach(function(r) {
    var accessible = hasResourceAccess(r.visibility);
    var safeTitle  = (typeof escapeHtml === 'function') ? escapeHtml(r.title || '') : r.title;
    var safeCat    = (typeof escapeHtml === 'function') ? escapeHtml(r.category || 'General') : r.category;
    var safeSize   = (typeof escapeHtml === 'function') ? escapeHtml(r.fileSize || '') : r.fileSize;
    var safeId = escapeHtml(String(r.id || ''));

    // Visibility Badge
    var visBadge = '';
    if (r.visibility === 'nco') {
      visBadge = '<span style="font-size:9px;font-weight:700;padding:2px 6px;border-radius:10px;background:rgba(200,150,30,0.2);color:var(--accent);border:1px solid rgba(200,150,30,0.4);backdrop-filter:blur(4px);">🔒 NCO</span>';
    } else if (r.visibility === 'officer') {
      visBadge = '<span style="font-size:9px;font-weight:700;padding:2px 6px;border-radius:10px;background:rgba(239,68,68,0.2);color:var(--red);border:1px solid rgba(239,68,68,0.4);backdrop-filter:blur(4px);">🛡️ Officer</span>';
    } else {
      visBadge = '<span style="font-size:9px;font-weight:700;padding:2px 6px;border-radius:10px;background:rgba(16,185,129,0.18);color:var(--green);border:1px solid rgba(16,185,129,0.4);backdrop-filter:blur(4px);">Public</span>';
    }

    var thumbUrl = accessible && isPublicResource(r.visibility) ? getResourceThumbnailUrl(r) : null;
    var previewAddress = parseResourceUrl(r.url);
    var storageObject = getResourceStorageObject(previewAddress);
    var canCopy = isPublicResource(r.visibility) && (!storageObject || storageObject.mode === 'public');
    var tType = (r.fileType || 'PDF').toUpperCase();
    var docIconCls = tType.indexOf('DOC') !== -1 ? 'doc' : (tType.indexOf('SHEET') !== -1 ? 'sheet' : (tType.indexOf('DRIVE') !== -1 || tType.indexOf('LINK') !== -1 ? 'link' : 'pdf'));
    var docIconColor = docIconCls === 'doc' ? '#3b82f6' : (docIconCls === 'sheet' ? '#10b981' : (docIconCls === 'link' ? '#a855f7' : '#ef4444'));

    var docIconSvg = '<svg class="doc-type-icon ' + docIconCls + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:' + docIconColor + ';"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>';

    var previewImgHtml = thumbUrl
      ? '<img src="' + (typeof escapeHtml === 'function' ? escapeHtml(thumbUrl) : thumbUrl) + '" class="resource-preview-img" alt="' + safeTitle + '" loading="lazy" onerror="this.style.display=\'none\';var s=this.nextElementSibling;if(s)s.style.display=\'flex\';" />'
      : '';

    var mockupDisplay = thumbUrl ? 'none' : 'flex';
    var mockupHtml = '<div class="resource-doc-mockup" style="display:' + mockupDisplay + ';">'
      + '<div class="doc-mockup-page">'
        + '<div class="doc-mockup-header">'
          + '<span class="doc-mockup-icon">' + docIconSvg + '</span>'
          + '<div class="doc-mockup-rule-strong"></div>'
        + '</div>'
        + '<div class="doc-mockup-title-line">' + safeTitle + '</div>'
        + '<div class="doc-mockup-lines">'
          + '<div class="doc-mockup-line" style="width:92%;"></div>'
          + '<div class="doc-mockup-line" style="width:78%;"></div>'
          + '<div class="doc-mockup-line" style="width:85%;"></div>'
          + '<div class="doc-mockup-line" style="width:65%;"></div>'
          + '<div class="doc-mockup-line" style="width:88%;"></div>'
          + '<div class="doc-mockup-line" style="width:72%;"></div>'
        + '</div>'
        + '<div class="doc-mockup-footer">'
          + '<div class="doc-mockup-line" style="width:35%;height:4px;"></div>'
          + '<div class="doc-mockup-seal">1PJ</div>'
        + '</div>'
      + '</div>'
      + '</div>';

    html += '<div class="resource-card" data-resource-open="' + safeId + '" title="' + safeTitle + ' (' + safeCat + ')">'
      + '<div class="resource-card-preview">'
        + previewImgHtml
        + mockupHtml
        + '<div class="resource-preview-badge">' + visBadge + '</div>'
      + '</div>'
      + '<div class="resource-card-footer">'
        + '<div class="resource-card-meta">'
          + '<span class="resource-type-icon">' + docIconSvg + '</span>'
          + '<div style="flex:1;min-width:0;">'
            + '<div class="resource-card-title">' + safeTitle + '</div>'
            + '<div style="font-size:10px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + (safeSize ? safeSize : safeCat) + '</div>'
          + '</div>'
        + '</div>'
        + '<div class="resource-card-actions">'
          + (accessible
            ? ('<button type="button" class="resource-action-btn view" title="View Document" aria-label="View ' + safeTitle + '" data-resource-open="' + safeId + '"><svg class="ui-icon-xs" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></button>'
              + (previewAddress && canCopy ? '<button type="button" class="resource-action-btn copy" title="Copy Direct Link" aria-label="Copy direct link to ' + safeTitle + '" data-resource-copy="' + safeId + '"><svg class="ui-icon-xs" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg></button>' : ''))
            : ('<span title="Login to access" style="font-size:11px;opacity:0.6;">🔒</span>'))
        + '</div>'
      + '</div>'
      + '</div>';
  });

  container.innerHTML = html;
  container.querySelectorAll('[data-resource-open], [data-resource-copy]').forEach(function(control) {
    control.addEventListener('click', function(event) {
      event.stopPropagation();
      var copyId = control.getAttribute('data-resource-copy');
      if (copyId) copyResourceLink(copyId);
      else openResourceDocument(control.getAttribute('data-resource-open'));
    });
  });

}


/**
 * Opens a resource document securely in a new browser tab.
 * Handles Supabase private storage signed URL derivation, Bearer token auth, and standard web links.
 * @param {string} resourceId
 */
async function openResourceDocument(resourceId) {
  var r = resources.find(function(item) { return item.id === resourceId; });
  if (!r) return;

  if (!hasResourceAccess(r.visibility)) {
    if (typeof showToast === 'function') {
      showToast('Please sign in to view this restricted document.', 'warning');
    }
    if (typeof window !== 'undefined' && typeof window.goToMemberTab === 'function') {
      window.goToMemberTab();
    }
    return;
  }

  var url = parseResourceUrl(r.url);
  if (!url) {
    if (typeof showToast === 'function') showToast('This document has no valid web link.', 'warning');
    return;
  }

  var storage = getResourceStorageObject(url);
  if (!storage) {
    window.open(url.href, '_blank', 'noopener,noreferrer');
    return;
  }

  if (isPublicResource(r.visibility) && storage.mode === 'public') {
    window.open(url.href, '_blank', 'noopener,noreferrer');
    return;
  }
  if (storage.mode === 'public') {
    if (typeof showToast === 'function') showToast('This restricted document needs a private storage link.', 'warning');
    return;
  }

  var tab = window.open('about:blank', '_blank');
  if (tab) tab.opener = null;
  try {
    var client = typeof getSupaClient === 'function' ? getSupaClient() : window.supa;
    var signed = client && await client.createSignedUrl(storage.bucket, decodeURIComponent(storage.path), 300);
    var preview = signed && !signed.error && parseResourceUrl(signed.signedUrl);
    if (!preview || preview.origin !== url.origin || !preview.searchParams.get('token') ||
        preview.searchParams.get('token').startsWith('auth_') ||
        resources.find(function(item) { return item.id === resourceId; }) !== r ||
        !hasResourceAccess(r.visibility)) throw new Error('Preview unavailable');
    if (tab && !tab.closed) tab.location.href = preview.href;
    else window.open(preview.href, '_blank', 'noopener,noreferrer');
  } catch (_) {
    if (tab && !tab.closed) tab.close();
    if (typeof showToast === 'function') showToast('Could not securely open this document.', 'error');
  }
}

/**
 * Returns HTML badge string for a given file type
 * @param {string} type
 * @returns {string}
 */
function getFileTypeBadgeHtml(type) {
  var t = (type || 'PDF').toUpperCase();
  if (t === 'PDF') {
    return '<span class="resource-type-badge" style="background:rgba(239,68,68,0.15);color:var(--red);border:1px solid rgba(239,68,68,0.3);"><svg class="ui-icon-xs" width="12" height="12" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> PDF</span>';
  }
  if (t === 'DOC' || t === 'DOCX') {
    return '<span class="resource-type-badge" style="background:rgba(59,130,246,0.15);color:var(--blue);border:1px solid rgba(59,130,246,0.3);"><svg class="ui-icon-xs" width="12" height="12" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> DOC</span>';
  }
  if (t === 'DRIVE' || t === 'GOOGLE DRIVE') {
    return '<span class="resource-type-badge" style="background:rgba(16,185,129,0.14);color:var(--green);border:1px solid rgba(16,185,129,0.3);"><svg class="ui-icon-xs" width="12" height="12" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg> DRIVE</span>';
  }
  return '<span class="resource-type-badge" style="background:rgba(168,85,247,0.14);color:var(--purple);border:1px solid rgba(168,85,247,0.3);"><svg class="ui-icon-xs" width="12" height="12" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/></svg> LINK</span>';
}

/**
 * Copies resource URL to clipboard with UI feedback
 * @param {string} url
 * @param {string} title
 */
async function copyResourceLink(url, title) {
  var resource = resources.find(function(item) { return item.id === url || item.url === url; });
  if (!resource || !hasResourceAccess(resource.visibility) || !isPublicResource(resource.visibility)) return false;
  var target = parseResourceUrl(resource.url);
  if (!target) return false;
  var storage = getResourceStorageObject(target);
  if (storage && storage.mode !== 'public') return false;

  if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(target.href);
      if (typeof showToast === 'function') showToast('Link copied: ' + (title || resource.title || 'Resource'), 'success');
      return true;
    } catch (_) {}
  }
  fallbackCopyText(target.href);
  return true;
}

function fallbackCopyText(text) {
  var ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
    if (typeof showToast === 'function') {
      showToast('Link copied to clipboard!', 'success');
    }
  } catch (e) {
    prompt('Copy link manually:', text);
  }
  document.body.removeChild(ta);
}

// ── Admin Management Panel ──────────────────────────────────────────────────
function getResourceIconSvg(type) {
  var t = (type || 'PDF').toUpperCase();
  if (t === 'DOC') {
    return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M6 6h10"/><path d="M6 10h10"/><path d="M6 14h6"/></svg>';
  }
  if (t === 'DRIVE') {
    return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';
  }
  if (t === 'LINK') {
    return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
  }
  return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>';
}

/**
 * Renders the Admin Panel Resources section
 */
function renderAdminResourcesPanel() {
  if (typeof document === 'undefined') return;
  var mainView = document.querySelector('.adm-resources-main-view');
  var formCard = document.getElementById('adm-res-form-card');
  if (mainView) mainView.style.display = 'block';
  if (formCard) formCard.style.display = 'none';
  renderAdminResourcesList();
}

/**
 * Renders the existing resources table/list inside the Admin Console
 */
function renderAdminResourcesList() {
  if (typeof document === 'undefined') return;
  var container = document.getElementById('adm-resources-list');
  if (!container) return;

  var headerLabel = document.querySelector('.adm-resources-header-label');
  if (headerLabel) {
    headerLabel.textContent = 'EXISTING COMPANY RESOURCES (' + resources.length + ')';
  }

  if (!resources.length) {
    container.innerHTML = '<div style="color:var(--text-muted);font-size:12px;text-align:center;padding:24px;background:var(--bg-card);border:1px dashed var(--border-card);border-radius:10px;margin-bottom:12px;">No company resources uploaded yet. Click "+ Upload / Add New Resource" below to get started.</div>';
    return;
  }

  var html = '';

  resources.forEach(function(r) {
    var safeTitle = (typeof escapeHtml === 'function') ? escapeHtml(r.title || '') : r.title;
    var safeCat   = (typeof escapeHtml === 'function') ? escapeHtml(r.category || '') : r.category;
    var safeType  = (typeof escapeHtml === 'function') ? escapeHtml(r.fileType || '') : r.fileType;
    var safeVis   = (typeof escapeHtml === 'function') ? escapeHtml(r.visibility || 'all') : r.visibility;
    var safeId = escapeHtml(String(r.id || ''));

    var iconSvg = getResourceIconSvg(safeType);

    html += '<div class="adm-resource-card" data-open-res-card="' + safeId + '" role="button" tabindex="0" title="Click to edit or delete ' + safeTitle + '">'
      + '<div style="width:40px;height:40px;border-radius:10px;background:rgba(59,130,246,0.12);display:flex;align-items:center;justify-content:center;color:var(--brand-blue);flex-shrink:0;">'
        + iconSvg
      + '</div>'
      + '<div style="flex:1;min-width:0;">'
        + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:3px;">'
          + '<span style="font-family:var(--font-headline);font-size:14px;font-weight:600;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + safeTitle + '</span>'
          + '<span style="font-size:10px;padding:2px 8px;border-radius:12px;background:var(--bg-card-subtle);color:var(--text-secondary);border:1px solid var(--border-card);">' + safeType + '</span>'
          + '<span style="font-size:10px;padding:2px 8px;border-radius:12px;background:rgba(200,150,30,0.15);color:var(--accent);border:1px solid rgba(200,150,30,0.3);">' + safeVis.toUpperCase() + '</span>'
        + '</div>'
        + '<div style="font-size:12px;color:var(--text-secondary);">' + safeCat + ' &bull; <button type="button" class="portal-btn" data-admin-resource-preview="' + safeId + '">Open document &rarr;</button></div>'
      + '</div>'
      + '<div style="display:flex;align-items:center;color:var(--text-muted);font-size:18px;margin-left:auto;flex-shrink:0;">'
        + '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>'
      + '</div>'
      + '</div>';
  });

  container.innerHTML = html;
  container.querySelectorAll('[data-admin-resource-preview]').forEach(function(button) {
    button.addEventListener('click', function(event) {
      event.stopPropagation();
      openResourceDocument(button.getAttribute('data-admin-resource-preview'));
    });
  });

  container.querySelectorAll('[data-open-res-card]').forEach(function(card) {
    card.addEventListener('click', function() {
      var id = card.getAttribute('data-open-res-card');
      openEditResource(id);
    });
  });
}

/**
 * Opens form to create a new resource (matches forms module flow)
 */
function openCreateResourceFlow() {
  cancelEditResource();
  var mainView  = (typeof document !== 'undefined') ? document.querySelector('.adm-resources-main-view') : null;
  var formCard  = (typeof document !== 'undefined') ? document.getElementById('adm-res-form-card') : null;
  var headingEl = (typeof document !== 'undefined') ? document.querySelector('.adm-res-form-heading') : null;
  var delBtn    = (typeof document !== 'undefined') ? document.querySelector('.adm-res-delete-btn') : null;
  var titleInp  = (typeof document !== 'undefined') ? document.getElementById('adm-res-title') : null;

  if (headingEl) headingEl.textContent = 'Add / Upload Company Document';
  if (delBtn) delBtn.style.display = 'none';
  if (mainView) mainView.style.display = 'none';
  if (formCard) {
    formCard.style.display = 'block';
    if (formCard.scrollIntoView) formCard.scrollIntoView({ behavior: 'smooth' });
  }
  if (titleInp && typeof titleInp.focus === 'function') titleInp.focus();
}

/**
 * Closes resource editor and returns to main list view
 */
function closeResourceEditor() {
  cancelEditResource();
  var mainView = (typeof document !== 'undefined') ? document.querySelector('.adm-resources-main-view') : null;
  var formCard = (typeof document !== 'undefined') ? document.getElementById('adm-res-form-card') : null;
  if (formCard) formCard.style.display = 'none';
  if (mainView) mainView.style.display = 'block';
  renderAdminResourcesList();
}

/**
 * Handles deleting currently edited resource from inside form
 */
async function handleAdminDeleteCurrentResource() {
  var submitBtn = (typeof document !== 'undefined') ? document.getElementById('adm-res-submit-btn') : null;
  var editId = submitBtn ? submitBtn.getAttribute('data-edit-id') : null;
  if (!editId) return;
  await deleteResource(editId);
  closeResourceEditor();
}

/**
 * Loads resource data into the admin form for editing
 * @param {string} id
 */
function openEditResource(id) {
  var item = resources.find(function(r) { return r.id === id; });
  if (!item) return;

  var titleInp  = (typeof document !== 'undefined') ? document.getElementById('adm-res-title') : null;
  var descInp   = (typeof document !== 'undefined') ? document.getElementById('adm-res-desc') : null;
  var catInp    = (typeof document !== 'undefined') ? document.getElementById('adm-res-cat') : null;
  var urlInp    = (typeof document !== 'undefined') ? document.getElementById('adm-res-url') : null;
  var typeInp   = (typeof document !== 'undefined') ? document.getElementById('adm-res-type') : null;
  var visInp    = (typeof document !== 'undefined') ? document.getElementById('adm-res-vis') : null;
  var statusEl  = (typeof document !== 'undefined') ? document.getElementById('adm-res-upload-status') : null;
  var submitBtn = (typeof document !== 'undefined') ? document.getElementById('adm-res-submit-btn') : null;
  var delBtn    = (typeof document !== 'undefined') ? document.querySelector('.adm-res-delete-btn') : null;
  var headingEl = (typeof document !== 'undefined') ? document.querySelector('.adm-res-form-heading') : null;
  var mainView  = (typeof document !== 'undefined') ? document.querySelector('.adm-resources-main-view') : null;
  var formCard  = (typeof document !== 'undefined') ? document.getElementById('adm-res-form-card') : null;

  if (titleInp) titleInp.value = item.title || '';
  if (descInp)  descInp.value  = item.description || '';
  if (catInp)   catInp.value   = item.category || 'Handbooks & Manuals';
  if (urlInp)   urlInp.value   = item.url || '';
  if (typeInp)  typeInp.value  = item.fileType || 'PDF';
  if (visInp)   visInp.value   = item.visibility || 'all';

  _lastUploadedFileSize = item.fileSize || '';
  if (statusEl) {
    var displaySize = item.fileSize ? item.fileSize : 'Attached Link';
    statusEl.innerHTML = '<span style="color:var(--text-muted);font-size:11px;">Current file: ' + ((typeof escapeHtml === 'function') ? escapeHtml(displaySize) : displaySize) + '</span>';
  }

  if (submitBtn) {
    submitBtn.textContent = 'Update Document';
    submitBtn.disabled = false;
    submitBtn.setAttribute('data-edit-id', id);
  }

  if (delBtn) {
    delBtn.style.display = 'inline-flex';
    delBtn.setAttribute('data-delete-id', id);
  }

  if (headingEl) {
    headingEl.textContent = 'Edit Company Document';
  }

  if (mainView) mainView.style.display = 'none';
  if (formCard) {
    formCard.style.display = 'block';
    if (formCard.scrollIntoView) {
      formCard.scrollIntoView({ behavior: 'smooth' });
    }
  }
}

/**
 * Clears form and restores Add Resource mode
 */
function cancelEditResource() {
  var titleInp  = (typeof document !== 'undefined') ? document.getElementById('adm-res-title') : null;
  var descInp   = (typeof document !== 'undefined') ? document.getElementById('adm-res-desc') : null;
  var urlInp    = (typeof document !== 'undefined') ? document.getElementById('adm-res-url') : null;
  var fileInp   = (typeof document !== 'undefined') ? document.getElementById('adm-res-file') : null;
  var statusEl  = (typeof document !== 'undefined') ? document.getElementById('adm-res-upload-status') : null;
  var submitBtn = (typeof document !== 'undefined') ? document.getElementById('adm-res-submit-btn') : null;
  var delBtn    = (typeof document !== 'undefined') ? document.querySelector('.adm-res-delete-btn') : null;
  var headingEl = (typeof document !== 'undefined') ? document.querySelector('.adm-res-form-heading') : null;

  if (titleInp) titleInp.value = '';
  if (descInp)  descInp.value  = '';
  if (urlInp)   urlInp.value   = '';
  if (fileInp)  fileInp.value  = '';
  if (statusEl) statusEl.innerHTML = '';
  _lastUploadedFileSize = '';

  if (delBtn) delBtn.style.display = 'none';
  if (headingEl) headingEl.textContent = 'Add / Upload Company Document';

  if (submitBtn) {
    submitBtn.textContent = 'Upload Document';
    submitBtn.disabled = false;
    submitBtn.removeAttribute('data-edit-id');
  }
}

/**
 * Stages and previews a selected file from the file input without uploading immediately.
 * Upload only occurs when the user clicks the "Upload Document" button.
 * @param {HTMLInputElement} input
 */
function handleResourceFileSelect(input) {
  if (!input || !input.files || !input.files.length) return;
  var file = input.files[0];
  var titleInp = (typeof document !== 'undefined') ? document.getElementById('adm-res-title') : null;
  var catInp   = (typeof document !== 'undefined') ? document.getElementById('adm-res-cat') : null;
  var typeInp  = (typeof document !== 'undefined') ? document.getElementById('adm-res-type') : null;
  var statusEl = (typeof document !== 'undefined') ? document.getElementById('adm-res-upload-status') : null;

  var ext = (file.name.split('.').pop() || 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '');
  var cleanName = file.name.replace(/\.[^/.]+$/, "");
  var autoTitle = cleanName.replace(/[_-]/g, ' ');
  var formattedSize = formatFileSize(file.size);
  _lastUploadedFileSize = formattedSize;

  var detectedType = 'PDF';
  if (ext === 'doc' || ext === 'docx') detectedType = 'DOC';
  else if (ext === 'xls' || ext === 'xlsx') detectedType = 'SHEET';
  else if (ext !== 'pdf') detectedType = 'LINK';

  // Auto-populate title if currently empty
  if (titleInp && !titleInp.value.trim()) {
    titleInp.value = autoTitle;
  }

  // Auto-detect type
  if (typeInp) {
    typeInp.value = detectedType;
  }

  // Auto-detect category if default or empty
  if (catInp && (!catInp.value || catInp.value === 'Handbooks & Manuals' || catInp.value === 'All')) {
    catInp.value = autoDetectCategory(titleInp && titleInp.value ? titleInp.value : autoTitle);
  }

  if (statusEl) {
    var safeName = (typeof escapeHtml === 'function') ? escapeHtml(file.name) : file.name;
    statusEl.innerHTML = '<span style="color:#10b981;font-size:11px;display:inline-flex;align-items:center;gap:4px;">'
      + '&#128196; Selected: <b>' + safeName + '</b>' + (formattedSize ? ' (' + formattedSize + ')' : '') + ' &mdash; Click &quot;Upload Document&quot; below to publish.</span>';
  }
}

/**
 * Adds or updates a resource from the Admin form
 */
async function addOrUpdateResource() {
  var titleInp  = (typeof document !== 'undefined') ? document.getElementById('adm-res-title') : null;
  var descInp   = (typeof document !== 'undefined') ? document.getElementById('adm-res-desc') : null;
  var catInp    = (typeof document !== 'undefined') ? document.getElementById('adm-res-cat') : null;
  var urlInp    = (typeof document !== 'undefined') ? document.getElementById('adm-res-url') : null;
  var typeInp   = (typeof document !== 'undefined') ? document.getElementById('adm-res-type') : null;
  var visInp    = (typeof document !== 'undefined') ? document.getElementById('adm-res-vis') : null;
  var fileInp   = (typeof document !== 'undefined') ? document.getElementById('adm-res-file') : null;
  var submitBtn = (typeof document !== 'undefined') ? document.getElementById('adm-res-submit-btn') : null;

  if (_isUploadingResource) {
    if (typeof showToast === 'function') showToast('Please wait for document upload to finish.', 'warning');
    return;
  }

  var editId = submitBtn ? submitBtn.getAttribute('data-edit-id') : null;
  var rawTitle = (titleInp ? titleInp.value : '').trim();
  var rawDesc  = (descInp ? descInp.value : '').trim();
  var rawCat   = (catInp ? catInp.value : 'Handbooks & Manuals').trim();
  var title    = (typeof sanitizeText === 'function') ? sanitizeText(rawTitle, 150) : rawTitle;
  var desc     = (typeof sanitizeText === 'function') ? sanitizeText(rawDesc, 300) : rawDesc;
  var cat      = (typeof sanitizeText === 'function') ? sanitizeText(rawCat, 60) : rawCat;
  var url      = parseResourceUrl(urlInp && urlInp.value)?.href || '';
  var type  = (typeInp ? typeInp.value : 'PDF').trim().toUpperCase();
  var vis   = (visInp ? visInp.value : 'all').trim().toLowerCase();
  if (!isPublicResource(vis) && !['nco', 'officer'].includes(vis)) return;

  // If title is empty, check if a file was selected to derive title
  if (!title && fileInp && fileInp.files && fileInp.files.length > 0) {
    var fName = fileInp.files[0].name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, ' ');
    title = fName;
    if (titleInp) titleInp.value = fName;
  }

  if (!title) {
    if (typeof showToast === 'function') showToast('Please enter a document title.', 'warning');
    return;
  }

  // If user selected a file in the file input, upload it now upon pressing the button
  if (fileInp && fileInp.files && fileInp.files.length > 0) {
    try {
      url = await handleResourceFileUpload(fileInp);
    } catch (uploadErr) {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = editId ? 'Update Document' : 'Upload Document';
      }
      return;
    }
  }

  if (!url) {
    if (typeof showToast === 'function') showToast('Please select a file to upload or enter a document URL.', 'warning');
    return;
  }
  var storage = getResourceStorageObject(parseResourceUrl(url));
  if (!isPublicResource(vis) && storage && storage.mode === 'public') {
    if (typeof showToast === 'function') showToast('Use a private link for restricted documents.', 'warning');
    return;
  }
  if (storage && storage.mode === 'sign') {
    var stableUrl = parseResourceUrl(url);
    stableUrl.pathname = stableUrl.pathname.replace('/object/sign/', '/object/authenticated/');
    stableUrl.search = '';
    url = stableUrl.href;
  }

  // Compute file size label
  var finalFileSize = _lastUploadedFileSize;
  if (!finalFileSize) {
    if (type === 'DRIVE') finalFileSize = 'Google Drive';
    else if (type === 'DOC') finalFileSize = 'Word Document';
    else if (type === 'PDF') finalFileSize = 'PDF Document';
    else finalFileSize = 'Online Document';
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = editId ? 'Updating...' : 'Publishing...';
  }

  var originalResourcesSnapshot = resources.map(function(r) { return Object.assign({}, r); });

  try {
    if (editId) {
      var item = resources.find(function(r) { return r.id === editId; });
      if (item) {
        item.title = title;
        item.description = desc;
        item.category = cat;
        item.url = url;
        item.fileType = type;
        item.visibility = vis;
        if (_lastUploadedFileSize) {
          item.fileSize = _lastUploadedFileSize;
        }
        item.updatedAt = new Date().toISOString().split('T')[0];
      }
      await saveResources(resources);
      if (typeof logAuditEvent === 'function') {
        logAuditEvent({
          action: 'resource.update',
          targetType: 'resource',
          targetId: editId,
          actorRole: 'officer_admin',
          details: { title: title, category: cat, visibility: vis }
        });
      }
      if (typeof showToast === 'function') showToast('Document updated successfully!', 'success');
    } else {
      var newRes = {
        id: 'res_' + Date.now(),
        title: title,
        description: desc || ('Official company document for ' + title + '.'),
        category: cat,
        fileType: type,
        url: url,
        visibility: vis,
        fileSize: finalFileSize,
        updatedAt: new Date().toISOString().split('T')[0]
      };
      resources.unshift(newRes);
      await saveResources(resources);
      if (typeof logAuditEvent === 'function') {
        logAuditEvent({
          action: 'resource.upload',
          targetType: 'resource',
          targetId: newRes.id,
          actorRole: 'officer_admin',
          details: { title: title, category: cat, visibility: vis }
        });
      }
      if (typeof showToast === 'function') showToast('✓ Document uploaded and published successfully!', 'success');
    }

    closeResourceEditor();
  } catch (e) {
    console.error('addOrUpdateResource error:', e);
    // Rollback optimistic in-memory mutation
    resources.length = 0;
    originalResourcesSnapshot.forEach(function(r) { resources.push(r); });
    renderResourcesPage();
    renderAdminResourcesList();
    if (typeof showToast === 'function') showToast('Failed to save resource: ' + (e.message || 'Database error') + '. Changes rolled back.', 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      var curEdit = submitBtn.getAttribute('data-edit-id');
      submitBtn.textContent = curEdit ? 'Update Document' : 'Upload Document';
    }
  }
}

/**
 * Auto-detects category based on document title / filename
 * @param {string} title
 * @returns {string}
 */
function autoDetectCategory(title) {
  var t = (title || '').toLowerCase();
  if (t.indexOf('target') !== -1 || t.indexOf('badge') !== -1 || t.indexOf('syllabus') !== -1 || t.indexOf('syllabi') !== -1 || t.indexOf('award') !== -1) {
    return 'Badges & Syllabi';
  }
  if (t.indexOf('drill') !== -1 || t.indexOf('manual') !== -1 || t.indexOf('handbook') !== -1 || t.indexOf('rule') !== -1 || t.indexOf('regulation') !== -1) {
    return 'Handbooks & Manuals';
  }
  if (t.indexOf('form') !== -1 || t.indexOf('leave') !== -1 || t.indexOf('admin') !== -1 || t.indexOf('consent') !== -1 || t.indexOf('waiver') !== -1) {
    return 'Forms & Administration';
  }
  if (t.indexOf('song') !== -1 || t.indexOf('hymn') !== -1 || t.indexOf('anchor') !== -1 || t.indexOf('praise') !== -1) {
    return 'BB Songs & Hymns';
  }
  if (t.indexOf('band') !== -1 || t.indexOf('drum') !== -1 || t.indexOf('bugle') !== -1 || t.indexOf('music') !== -1) {
    return 'Band & Music';
  }
  return 'Handbooks & Manuals';
}

/**
 * Uploads a selected PDF or document file to Supabase Storage
 * @param {HTMLInputElement|{files: File[]}} input
 * @returns {Promise<string>} Uploaded public URL
 */
async function handleResourceFileUpload(input) {
  if (!input || !input.files || !input.files.length) return '';
  var file = input.files[0];
  var urlInp    = (typeof document !== 'undefined') ? document.getElementById('adm-res-url') : null;
  var statusEl  = (typeof document !== 'undefined') ? document.getElementById('adm-res-upload-status') : null;
  var submitBtn = (typeof document !== 'undefined') ? document.getElementById('adm-res-submit-btn') : null;

  var ext = (file.name.split('.').pop() || 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '');
  var formattedSize = formatFileSize(file.size);
  _lastUploadedFileSize = formattedSize;

  _isUploadingResource = true;
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Uploading Document...';
  }
  if (statusEl) {
    var safeName = (typeof escapeHtml === 'function') ? escapeHtml(file.name) : file.name;
    statusEl.innerHTML = '<span style="color:var(--accent);display:inline-flex;align-items:center;gap:6px;">'
      + '<span style="display:inline-block;width:11px;height:11px;border:2px solid var(--accent);border-top-color:transparent;border-radius:50%;animation:spin 1s linear infinite;"></span> '
      + 'Uploading "' + safeName + '"' + (formattedSize ? ' (' + formattedSize + ')' : '') + '...</span>';
  }

  if (typeof showToast === 'function') showToast('Uploading ' + file.name + ' to Storage...', 'info');

  try {
    var fname = 'doc_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6) + '.' + ext;
    var mimeType = file.type;
    if (!mimeType) {
      if (ext === 'pdf') mimeType = 'application/pdf';
      else if (ext === 'doc') mimeType = 'application/msword';
      else if (ext === 'docx') mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      else if (ext === 'xls') mimeType = 'application/vnd.ms-excel';
      else if (ext === 'xlsx') mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      else mimeType = 'application/octet-stream';
    }

    // Strict file security validation
    if (typeof validateFileSecurity === 'function') {
      await validateFileSecurity(file, { allowPdf: true, allowImages: true, bucket: 'resources' });
    }

    var blob = (typeof Blob !== 'undefined' && file instanceof Blob)
      ? file
      : new Blob([await file.arrayBuffer()], { type: mimeType });

    if (typeof supa === 'undefined' || !supa.uploadFile || !supa.fileUrl) {
      throw new Error('Supabase Storage is unavailable.');
    }
    await supa.uploadFile('resources', fname, blob);
    var uploadedUrl = supa.fileUrl('resources', fname, { private: true });

    if (urlInp) urlInp.value = uploadedUrl;
    return uploadedUrl;
  } catch (err) {
    console.error('handleResourceFileUpload error:', err);
    if (statusEl) {
      var errMsg = (typeof escapeHtml === 'function') ? escapeHtml(err.message || 'Upload failed') : (err.message || 'Upload failed');
      statusEl.innerHTML = '<span style="color:var(--red);display:inline-flex;align-items:center;gap:4px;">'
        + '&#10007; Upload failed: ' + errMsg + '.</span>';
    }
    if (typeof showToast === 'function') showToast('Upload failed: ' + (err.message || 'Storage error'), 'error');
    throw err;
  } finally {
    _isUploadingResource = false;
  }
}

/**
 * Deletes a resource with confirmation
 * @param {string} id
 */
async function deleteResource(id) {
  var item = resources.find(function(r) { return r.id === id; });
  if (!item) return;

  var confirmed = false;
  var msg = 'Delete "' + (item.title || 'this resource') + '"?';
  if (typeof showConfirmModal === 'function') {
    confirmed = await showConfirmModal(msg, 'Delete Resource');
  } else {
    confirmed = true;
  }
  if (!confirmed) return;

  var originalResourcesSnapshot = resources.map(function(r) { return Object.assign({}, r); });
  try {
    var updated = resources.filter(function(r) { return r.id !== id; });
    await saveResources(updated);
    if (typeof logAuditEvent === 'function') {
      logAuditEvent({
        action: 'resource.delete',
        targetType: 'resource',
        targetId: id,
        actorRole: 'officer_admin',
        details: { title: item.title }
      });
    }
    if (typeof showToast === 'function') showToast('Resource deleted.', 'success');
  } catch (err) {
    console.error('deleteResource error:', err);
    // Rollback optimistic deletion
    resources.length = 0;
    originalResourcesSnapshot.forEach(function(r) { resources.push(r); });
    renderResourcesPage();
    renderAdminResourcesList();
    if (typeof showToast === 'function') showToast('Failed to delete resource: ' + (err.message || 'Database error') + '. Restored.', 'error');
  }
}

/**
 * Clears all resources from the repository
 */
async function clearAllResources() {
  var confirmed = false;
  var msg = 'Are you sure you want to remove all company resources? This action cannot be undone.';
  if (typeof showConfirmModal === 'function') {
    confirmed = await showConfirmModal(msg, 'Clear All Resources');
  } else {
    confirmed = true;
  }
  if (!confirmed) return;

  try {
    await saveResources([]);
    if (typeof showToast === 'function') showToast('All resources cleared.', 'info');
  } catch (err) {
    console.error('clearAllResources error:', err);
    if (typeof showToast === 'function') showToast('Failed to clear resources: ' + (err.message || 'Database error'), 'error');
  }
}
// Backwards compatibility alias
var resetResourcesToDefaults = clearAllResources;

// ── Global Window Exports ──────────────────────────────────────────────────
if (typeof window !== 'undefined') {
  window.DEFAULT_COMPANY_RESOURCES = DEFAULT_COMPANY_RESOURCES;
  window.resources                 = resources;
  window.loadResources             = loadResources;
  window.saveResources             = saveResources;
  window.hasResourceAccess         = hasResourceAccess;
  window.setResourceCategory       = setResourceCategory;
  window.searchResources           = searchResources;
  window.renderResourcesPage       = renderResourcesPage;
  window.openResourceDocument      = openResourceDocument;
  window.getResourceThumbnailUrl   = getResourceThumbnailUrl;
  window.getFileTypeBadgeHtml      = getFileTypeBadgeHtml;
  window.copyResourceLink          = copyResourceLink;
  window.renderAdminResourcesPanel = renderAdminResourcesPanel;
  window.renderAdminResourcesList  = renderAdminResourcesList;
  window.openEditResource          = openEditResource;
  window.openCreateResourceFlow    = openCreateResourceFlow;
  window.closeResourceEditor       = closeResourceEditor;
  window.handleAdminDeleteCurrentResource = handleAdminDeleteCurrentResource;
  window.cancelEditResource        = cancelEditResource;
  window.addOrUpdateResource       = addOrUpdateResource;
  window.handleResourceFileSelect  = handleResourceFileSelect;
  window.handleResourceFileUpload  = handleResourceFileUpload;
  window.deleteResource            = deleteResource;
  window.clearAllResources         = clearAllResources;
  window.resetResourcesToDefaults  = resetResourcesToDefaults;
  window.formatFileSize            = formatFileSize;
  window.handleResourceUrlInput    = handleResourceUrlInput;
  window.autoDetectCategory        = autoDetectCategory;
}

// ── Node.js Module Exports ──────────────────────────────────────────────────
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DEFAULT_COMPANY_RESOURCES: DEFAULT_COMPANY_RESOURCES,
    resources: resources,
    loadResources: loadResources,
    saveResources: saveResources,
    hasResourceAccess: hasResourceAccess,
    setResourceCategory: setResourceCategory,
    searchResources: searchResources,
    renderResourcesPage: renderResourcesPage,
    openResourceDocument: openResourceDocument,
    getResourceThumbnailUrl: getResourceThumbnailUrl,
    getFileTypeBadgeHtml: getFileTypeBadgeHtml,
    copyResourceLink: copyResourceLink,
    renderAdminResourcesPanel: renderAdminResourcesPanel,
    renderAdminResourcesList: renderAdminResourcesList,
    openEditResource: openEditResource,
    openCreateResourceFlow: openCreateResourceFlow,
    closeResourceEditor: closeResourceEditor,
    handleAdminDeleteCurrentResource: handleAdminDeleteCurrentResource,
    cancelEditResource: cancelEditResource,
    addOrUpdateResource: addOrUpdateResource,
    handleResourceFileSelect: handleResourceFileSelect,
    handleResourceFileUpload: handleResourceFileUpload,
    deleteResource: deleteResource,
    clearAllResources: clearAllResources,
    resetResourcesToDefaults: resetResourcesToDefaults,
    formatFileSize: formatFileSize,
    handleResourceUrlInput: handleResourceUrlInput,
    autoDetectCategory: autoDetectCategory
  };
}
