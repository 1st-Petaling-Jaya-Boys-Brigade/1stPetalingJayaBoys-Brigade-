/**
 * 1st Petaling Jaya Boys' Brigade Portal
 * Company Resources Hub (TSK-034)
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
  'Warrant Officer', 'Lieutenant', 'Captain', 'Chaplain', 'Officer'
];

var STANDARD_OFFICER_RANKS = [
  'Warrant Officer', 'Lieutenant', 'Captain', 'Chaplain', 'Officer'
];

// ── Data Ingestion & Persistence ───────────────────────────────────────────
/**
 * Loads resources from Supabase bb_config, filtering out any legacy placeholder docs
 */
async function loadResources() {
  try {
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

          // If legacy placeholders were found in bb_config, automatically purge them
          if (realDocs.length !== parsed.length) {
            saveResources(realDocs);
          }
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
}

var _isUploadingResource = false;
var _lastUploadedFileSize = '';

/**
 * Formats byte size into human-readable format
 * @param {number} bytes
 * @returns {string}
 */
function formatFileSize(bytes) {
  if (!bytes || isNaN(bytes) || bytes <= 0) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
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
  if (Array.isArray(list) && list !== resources) {
    resources.length = 0;
    list.forEach(function(r) { resources.push(r); });
  }

  if (typeof window !== 'undefined') {
    window.resources = resources;
  }

  var serialized = JSON.stringify(resources);

  try {
    if (typeof supa !== 'undefined') {
      var saved = false;
      if (supa.req) {
        try {
          await supa.req('POST', 'bb_config?on_conflict=key', { key: 'bb_resources', value: serialized }, {
            Prefer: 'return=representation,resolution=merge-duplicates'
          });
          saved = true;
        } catch (postErr) {
          console.warn('saveResources POST error, trying PATCH fallback:', postErr);
        }
      }
      if (!saved && supa.patch) {
        try {
          var patchRes = await supa.patch('bb_config?key=eq.bb_resources', { value: serialized });
          if (Array.isArray(patchRes) && patchRes.length === 0 && supa.post) {
            await supa.post('bb_config', { key: 'bb_resources', value: serialized });
          }
          saved = true;
        } catch (patchErr) {
          console.error('saveResources PATCH error:', patchErr);
        }
      }
      if (!saved) {
        throw new Error('Could not persist resources to Supabase bb_config');
      }
    }
  } catch (e) {
    console.error('saveResources error:', e);
    throw e;
  }

  renderResourcesPage();
  renderAdminResourcesList();
}

// ── Role & Permission Checking ─────────────────────────────────────────────
/**
 * Checks whether current logged-in user can access a given resource visibility level
 * @param {string} visibility - 'all' | 'nco' | 'officer'
 * @returns {boolean}
 */
function hasResourceAccess(visibility) {
  if (!visibility || visibility === 'all') return true;

  var currentRank = '';
  var isAdmin = false;

  if (typeof sessionGet === 'function') {
    currentRank = sessionGet('rank') || '';
    isAdmin = sessionGet('adminAuthed') === true;
  }

  if (isAdmin) return true;

  var isOfficer = STANDARD_OFFICER_RANKS.indexOf(currentRank) !== -1;
  var isNco = isOfficer ||
              STANDARD_NCO_RANKS.indexOf(currentRank) !== -1 ||
              (typeof isNCO === 'function' && isNCO(currentRank));

  if (visibility === 'officer') {
    return isOfficer;
  }
  if (visibility === 'nco') {
    return isNco;
  }
  return true;
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
    var safeDesc   = (typeof escapeHtml === 'function') ? escapeHtml(r.description || '') : r.description;
    var safeCat    = (typeof escapeHtml === 'function') ? escapeHtml(r.category || 'General') : r.category;
    var safeSize   = (typeof escapeHtml === 'function') ? escapeHtml(r.fileSize || '') : r.fileSize;
    var safeDate   = (typeof escapeHtml === 'function') ? escapeHtml(r.updatedAt || '') : r.updatedAt;
    var rawUrl     = r.url || '#';
    var validatedUrl = (typeof safeUrl === 'function') ? safeUrl(rawUrl, '#') : rawUrl;
    var safeDocUrl   = (typeof escapeHtml === 'function') ? escapeHtml(validatedUrl) : validatedUrl;

    // File Type Styling & Icon
    var typeBadge = getFileTypeBadgeHtml(r.fileType);

    // Visibility Badge
    var visBadge = '';
    if (r.visibility === 'nco') {
      visBadge = '<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:12px;background:rgba(200,150,30,0.15);color:var(--accent);border:1px solid rgba(200,150,30,0.3);">🔒 NCOs Only</span>';
    } else if (r.visibility === 'officer') {
      visBadge = '<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:12px;background:rgba(239,68,68,0.15);color:var(--red);border:1px solid rgba(239,68,68,0.3);">🛡️ Officers Only</span>';
    } else {
      visBadge = '<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:12px;background:rgba(16,185,129,0.12);color:#10b981;border:1px solid rgba(16,185,129,0.3);">Public</span>';
    }

    // Action button
    var actionBtnHtml = '';
    if (accessible) {
      actionBtnHtml = '<div style="display:flex;gap:8px;margin-top:16px;">'
        + '<a href="' + safeDocUrl + '" target="_blank" rel="noopener noreferrer" '
        + 'class="portal-btn portal-btn-primary" '
        + 'style="flex:1;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;gap:6px;text-align:center;">'
        + '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>'
        + 'View Document'
        + '</a>'
        + '<button type="button" class="portal-btn portal-btn-secondary" title="Copy Direct Link" onclick="copyResourceLink(\'' + safeDocUrl.replace(/'/g, "\\'") + '\', \'' + safeTitle.replace(/'/g, "\\'") + '\')" style="padding:8px 12px;display:inline-flex;align-items:center;justify-content:center;">'
        + '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>'
        + '</button>'
        + '</div>';
    } else {
      actionBtnHtml = '<div style="margin-top:16px;">'
        + '<button type="button" class="portal-btn portal-btn-secondary" onclick="goToMemberTab()" style="width:100%;text-align:center;color:var(--text-muted);cursor:pointer;">'
        + '🔒 Login as ' + (r.visibility === 'officer' ? 'Officer' : 'NCO') + ' to Access'
        + '</button>'
        + '</div>';
    }

    html += '<div class="resource-card">'
      + '<div>'
        + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">'
          + '<span style="font-size:11px;font-weight:700;color:var(--accent);letter-spacing:0.5px;text-transform:uppercase;">' + safeCat + '</span>'
          + '<div style="display:flex;align-items:center;gap:6px;">' + typeBadge + visBadge + '</div>'
        + '</div>'
        + '<div style="font-family:var(--font-headline);font-size:17px;font-weight:700;color:var(--text-primary);line-height:1.3;margin-bottom:8px;">' + safeTitle + '</div>'
        + '<div style="font-size:12px;color:var(--text-secondary);line-height:1.6;margin-bottom:12px;">' + safeDesc + '</div>'
      + '</div>'
      + '<div>'
        + '<div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;color:var(--text-muted);border-top:1px solid var(--border-subtle);padding-top:10px;margin-top:6px;">'
          + '<span>' + (safeSize ? 'Size: ' + safeSize : 'Online Document') + '</span>'
          + '<span>' + (safeDate ? 'Updated: ' + safeDate : '') + '</span>'
        + '</div>'
        + actionBtnHtml
      + '</div>'
      + '</div>';
  });

  container.innerHTML = html;
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
    return '<span class="resource-type-badge" style="background:rgba(16,185,129,0.15);color:#10b981;border:1px solid rgba(16,185,129,0.3);"><svg class="ui-icon-xs" width="12" height="12" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg> DRIVE</span>';
  }
  return '<span class="resource-type-badge" style="background:rgba(168,85,247,0.15);color:#a855f7;border:1px solid rgba(168,85,247,0.3);"><svg class="ui-icon-xs" width="12" height="12" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/></svg> LINK</span>';
}

/**
 * Copies resource URL to clipboard with UI feedback
 * @param {string} url
 * @param {string} title
 */
function copyResourceLink(url, title) {
  if (!url) return;
  if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(function() {
      if (typeof showToast === 'function') {
        showToast('Link copied: ' + (title || 'Resource'), 'success');
      }
    }).catch(function() {
      fallbackCopyText(url);
    });
  } else {
    fallbackCopyText(url);
  }
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
/**
 * Renders the Admin Panel Resources section
 */
function renderAdminResourcesPanel() {
  if (typeof document === 'undefined') return;
  var container = document.getElementById('adm-resources-list');
  if (!container) return;
  renderAdminResourcesList();
}

/**
 * Renders the existing resources table/list inside the Admin Console
 */
function renderAdminResourcesList() {
  if (typeof document === 'undefined') return;
  var container = document.getElementById('adm-resources-list');
  if (!container) return;

  if (!resources.length) {
    container.innerHTML = '<div style="color:var(--text-muted);font-size:12px;text-align:center;padding:24px;background:var(--bg-card);border:1px dashed var(--border-card);border-radius:10px;">No company resources uploaded yet. Use the form above to add PDF documents or link Google Drive files.</div>';
    return;
  }

  var html = '<div style="font-family:var(--font-headline);font-size:13px;font-weight:600;color:var(--text-muted);margin-bottom:10px;letter-spacing:1px;">EXISTING COMPANY RESOURCES (' + resources.length + ')</div>';

  resources.forEach(function(r) {
    var safeTitle = (typeof escapeHtml === 'function') ? escapeHtml(r.title || '') : r.title;
    var safeCat   = (typeof escapeHtml === 'function') ? escapeHtml(r.category || '') : r.category;
    var safeType  = (typeof escapeHtml === 'function') ? escapeHtml(r.fileType || '') : r.fileType;
    var safeVis   = (typeof escapeHtml === 'function') ? escapeHtml(r.visibility || 'all') : r.visibility;
    var rawAdminUrl = r.url || '#';
    var validAdminUrl = (typeof safeUrl === 'function') ? safeUrl(rawAdminUrl, '#') : rawAdminUrl;
    var safeAdminUrl = (typeof escapeHtml === 'function') ? escapeHtml(validAdminUrl) : validAdminUrl;

    html += '<div style="background:var(--bg-card);border:1px solid var(--border-card);border-radius:10px;padding:12px 14px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;gap:12px;">'
      + '<div style="flex:1;min-width:0;">'
        + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:3px;">'
          + '<span style="font-family:var(--font-headline);font-size:14px;font-weight:600;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + safeTitle + '</span>'
          + '<span style="font-size:10px;padding:1px 6px;border-radius:4px;background:var(--bg-card-subtle);color:var(--text-secondary);">' + safeType + '</span>'
          + '<span style="font-size:10px;padding:1px 6px;border-radius:4px;background:rgba(200,150,30,0.15);color:var(--accent);">' + safeVis.toUpperCase() + '</span>'
        + '</div>'
        + '<div style="font-size:11px;color:var(--text-secondary);">' + safeCat + ' &bull; <a href="' + safeAdminUrl + '" target="_blank" rel="noopener noreferrer" style="color:var(--brand-blue);text-decoration:none;">Open link &rarr;</a></div>'
      + '</div>'
      + '<div style="display:flex;gap:6px;flex-shrink:0;">'
        + '<button type="button" data-edit-res="' + r.id + '" title="Edit Resource" style="background:var(--bg-card-subtle);border:1px solid var(--border-card);color:var(--text-primary);padding:5px 10px;border-radius:6px;cursor:pointer;font-size:11px;">Edit</button>'
        + '<button type="button" data-del-res="' + r.id + '" title="Delete Resource" style="background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);color:var(--red);padding:5px 8px;border-radius:6px;cursor:pointer;font-size:11px;">&times;</button>'
      + '</div>'
      + '</div>';
  });

  container.innerHTML = html;

  container.querySelectorAll('[data-edit-res]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var id = btn.getAttribute('data-edit-res');
      openEditResource(id);
    });
  });

  container.querySelectorAll('[data-del-res]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var id = btn.getAttribute('data-del-res');
      deleteResource(id);
    });
  });
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

  if (titleInp) titleInp.value = item.title || '';
  if (descInp)  descInp.value  = item.description || '';
  if (catInp)   catInp.value   = item.category || 'Handbooks & Manuals';
  if (urlInp)   urlInp.value   = item.url || '';
  if (typeInp)  typeInp.value  = item.fileType || 'PDF';
  if (visInp)   visInp.value   = item.visibility || 'all';

  _lastUploadedFileSize = item.fileSize || '';
  if (statusEl) {
    statusEl.innerHTML = '<span style="color:var(--text-muted);font-size:11px;">Current file: ' + (item.fileSize ? item.fileSize : 'Attached Link') + '</span>';
  }

  if (submitBtn) {
    submitBtn.textContent = 'Update Document';
    submitBtn.disabled = false;
    submitBtn.setAttribute('data-edit-id', id);
  }

  var formCard = (typeof document !== 'undefined') ? document.getElementById('adm-res-form-card') : null;
  if (formCard && formCard.scrollIntoView) {
    formCard.scrollIntoView({ behavior: 'smooth' });
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

  if (titleInp) titleInp.value = '';
  if (descInp)  descInp.value  = '';
  if (urlInp)   urlInp.value   = '';
  if (fileInp)  fileInp.value  = '';
  if (statusEl) statusEl.innerHTML = '';
  _lastUploadedFileSize = '';

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
  var url      = (urlInp ? urlInp.value : '').trim();
  if (url && typeof safeUrl === 'function') {
    url = safeUrl(url, url);
  }
  var type  = (typeInp ? typeInp.value : 'PDF').trim().toUpperCase();
  var vis   = (visInp ? visInp.value : 'all').trim().toLowerCase();

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
      if (typeof showToast === 'function') showToast('✓ Document uploaded and published successfully!', 'success');
    }

    cancelEditResource();
  } catch (e) {
    console.error('addOrUpdateResource error:', e);
    if (typeof showToast === 'function') showToast('Failed to save resource: ' + (e.message || 'Database error'), 'error');
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

    // Strict file security validation (TSK-035)
    if (typeof validateFileSecurity === 'function') {
      await validateFileSecurity(file, { allowPdf: true, allowImages: true, bucket: 'resources' });
    }

    var blob = (typeof Blob !== 'undefined' && file instanceof Blob)
      ? file
      : new Blob([await file.arrayBuffer()], { type: mimeType });

    var uploadedUrl = '';

    if (typeof supa !== 'undefined' && supa.uploadFile) {
      try {
        await supa.uploadFile('gallery', 'resources/' + fname, blob);
        uploadedUrl = supa.fileUrl('gallery', 'resources/' + fname);
      } catch (galleryErr) {
        try {
          await supa.uploadFile('gallery', fname, blob);
          uploadedUrl = supa.fileUrl('gallery', fname);
        } catch (galleryRootErr) {
          await supa.uploadFile('resources', fname, blob);
          uploadedUrl = supa.fileUrl('resources', fname);
        }
      }
    }

    if (!uploadedUrl) {
      throw new Error('Supabase Storage is unavailable.');
    }

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

  try {
    var updated = resources.filter(function(r) { return r.id !== id; });
    await saveResources(updated);
    if (typeof showToast === 'function') showToast('Resource deleted.', 'success');
  } catch (err) {
    console.error('deleteResource error:', err);
    if (typeof showToast === 'function') showToast('Failed to delete resource: ' + (err.message || 'Database error'), 'error');
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
  window.copyResourceLink          = copyResourceLink;
  window.renderAdminResourcesPanel = renderAdminResourcesPanel;
  window.renderAdminResourcesList  = renderAdminResourcesList;
  window.openEditResource          = openEditResource;
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
    copyResourceLink: copyResourceLink,
    renderAdminResourcesPanel: renderAdminResourcesPanel,
    renderAdminResourcesList: renderAdminResourcesList,
    openEditResource: openEditResource,
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
