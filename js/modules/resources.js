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
          var realDocs = parsed.filter(function(r) {
            if (!r || !r.url) return false;
            var isPlaceholder = r.url.indexOf('bbpj1.org/docs/') !== -1 ||
                                r.url === 'https://docs.google.com/document/d/1BBPJ1LeaveOfAbsenceForm/edit' ||
                                (r.id && r.id.startsWith('res_') && !r.id.startsWith('res_upload_') && isNaN(r.id.replace('res_', '')));
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

/**
 * Persists the current resources list to Supabase bb_config
 * @param {Array} list
 */
async function saveResources(list) {
  if (Array.isArray(list)) {
    resources.length = 0;
    list.forEach(function(r) { resources.push(r); });
  }

  if (typeof window !== 'undefined') {
    window.resources = resources;
  }

  var serialized = JSON.stringify(resources);

  try {
    if (typeof supa !== 'undefined') {
      if (supa.req) {
        await supa.req('POST', 'bb_config?on_conflict=key', { key: 'bb_resources', value: serialized });
      } else if (supa.patch) {
        await supa.patch('bb_config?key=eq.bb_resources', { value: serialized });
      }
    }
  } catch (e) {
    console.error('saveResources error:', e);
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
    var isAdmin = (typeof sessionGet === 'function' && sessionGet('adminAuthed') === true);
    container.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:50px 20px;background:var(--bg-card);border:1px dashed var(--border-card);border-radius:14px;color:var(--text-muted);">'
      + '<div style="font-size:38px;margin-bottom:12px;">📚</div>'
      + '<div style="font-family:\'Oswald\',sans-serif;font-size:20px;font-weight:700;color:var(--text-primary);margin-bottom:6px;">No Company Resources Uploaded Yet</div>'
      + '<div style="font-size:13px;max-width:440px;margin:0 auto;line-height:1.6;">Official handbooks, drill manuals, syllabi, and administrative forms will appear here once uploaded by company administrators.</div>'
      + (isAdmin ? '<button type="button" onclick="switchAdminSection(\'resources\')" class="portal-btn portal-btn-primary" style="margin-top:16px;">Open Admin Upload Console &rarr;</button>' : '')
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
      + '<div style="font-family:\'Oswald\',sans-serif;font-size:18px;font-weight:600;color:var(--text-primary);margin-bottom:4px;">No matching resources found</div>'
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
    var safeUrl    = (typeof escapeHtml === 'function') ? escapeHtml(rawUrl) : rawUrl;

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
        + '<a href="' + safeUrl + '" target="_blank" rel="noopener noreferrer" '
        + 'class="portal-btn portal-btn-primary" '
        + 'style="flex:1;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;gap:6px;text-align:center;">'
        + '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>'
        + 'View Document'
        + '</a>'
        + '<button type="button" class="portal-btn portal-btn-secondary" title="Copy Direct Link" onclick="copyResourceLink(\'' + safeUrl.replace(/'/g, "\\'") + '\', \'' + safeTitle.replace(/'/g, "\\'") + '\')" style="padding:8px 12px;display:inline-flex;align-items:center;justify-content:center;">'
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
        + '<div style="font-family:\'Oswald\',sans-serif;font-size:17px;font-weight:700;color:var(--text-primary);line-height:1.3;margin-bottom:8px;">' + safeTitle + '</div>'
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
    return '<span class="resource-type-badge" style="background:rgba(239,68,68,0.15);color:var(--red);border:1px solid rgba(239,68,68,0.3);"><svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> PDF</span>';
  }
  if (t === 'DOC' || t === 'DOCX') {
    return '<span class="resource-type-badge" style="background:rgba(59,130,246,0.15);color:var(--blue);border:1px solid rgba(59,130,246,0.3);"><svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> DOC</span>';
  }
  if (t === 'DRIVE' || t === 'GOOGLE DRIVE') {
    return '<span class="resource-type-badge" style="background:rgba(16,185,129,0.15);color:#10b981;border:1px solid rgba(16,185,129,0.3);"><svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg> DRIVE</span>';
  }
  return '<span class="resource-type-badge" style="background:rgba(168,85,247,0.15);color:#a855f7;border:1px solid rgba(168,85,247,0.3);"><svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/></svg> LINK</span>';
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

  var html = '<div style="font-family:\'Oswald\',sans-serif;font-size:13px;font-weight:600;color:var(--text-muted);margin-bottom:10px;letter-spacing:1px;">EXISTING COMPANY RESOURCES (' + resources.length + ')</div>';

  resources.forEach(function(r) {
    var safeTitle = (typeof escapeHtml === 'function') ? escapeHtml(r.title || '') : r.title;
    var safeCat   = (typeof escapeHtml === 'function') ? escapeHtml(r.category || '') : r.category;
    var safeType  = (typeof escapeHtml === 'function') ? escapeHtml(r.fileType || '') : r.fileType;
    var safeVis   = (typeof escapeHtml === 'function') ? escapeHtml(r.visibility || 'all') : r.visibility;
    var safeUrl   = (typeof escapeHtml === 'function') ? escapeHtml(r.url || '#') : r.url;

    html += '<div style="background:var(--bg-card);border:1px solid var(--border-card);border-radius:10px;padding:12px 14px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;gap:12px;">'
      + '<div style="flex:1;min-width:0;">'
        + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:3px;">'
          + '<span style="font-family:\'Oswald\',sans-serif;font-size:14px;font-weight:600;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + safeTitle + '</span>'
          + '<span style="font-size:10px;padding:1px 6px;border-radius:4px;background:var(--bg-card-subtle);color:var(--text-secondary);">' + safeType + '</span>'
          + '<span style="font-size:10px;padding:1px 6px;border-radius:4px;background:rgba(200,150,30,0.15);color:var(--accent);">' + safeVis.toUpperCase() + '</span>'
        + '</div>'
        + '<div style="font-size:11px;color:var(--text-secondary);">' + safeCat + ' &bull; <a href="' + safeUrl + '" target="_blank" rel="noopener noreferrer" style="color:var(--brand-blue);text-decoration:none;">Open link &rarr;</a></div>'
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

  var titleInp = document.getElementById('adm-res-title');
  var descInp  = document.getElementById('adm-res-desc');
  var catInp   = document.getElementById('adm-res-cat');
  var urlInp   = document.getElementById('adm-res-url');
  var typeInp  = document.getElementById('adm-res-type');
  var visInp   = document.getElementById('adm-res-vis');
  var submitBtn = document.getElementById('adm-res-submit-btn');

  if (titleInp) titleInp.value = item.title || '';
  if (descInp)  descInp.value  = item.description || '';
  if (catInp)   catInp.value   = item.category || 'Handbooks & Manuals';
  if (urlInp)   urlInp.value   = item.url || '';
  if (typeInp)  typeInp.value  = item.fileType || 'PDF';
  if (visInp)   visInp.value   = item.visibility || 'all';

  if (submitBtn) {
    submitBtn.textContent = 'Save Changes';
    submitBtn.setAttribute('data-edit-id', id);
  }

  var formCard = document.getElementById('adm-res-form-card');
  if (formCard) formCard.scrollIntoView({ behavior: 'smooth' });
}

/**
 * Clears form and restores Add Resource mode
 */
function cancelEditResource() {
  var titleInp = document.getElementById('adm-res-title');
  var descInp  = document.getElementById('adm-res-desc');
  var urlInp   = document.getElementById('adm-res-url');
  var fileInp  = document.getElementById('adm-res-file');
  var submitBtn = document.getElementById('adm-res-submit-btn');

  if (titleInp) titleInp.value = '';
  if (descInp)  descInp.value  = '';
  if (urlInp)   urlInp.value   = '';
  if (fileInp)  fileInp.value  = '';

  if (submitBtn) {
    submitBtn.textContent = 'Save Resource';
    submitBtn.removeAttribute('data-edit-id');
  }
}

/**
 * Adds or updates a resource from the Admin form
 */
async function addOrUpdateResource() {
  var titleInp  = document.getElementById('adm-res-title');
  var descInp   = document.getElementById('adm-res-desc');
  var catInp    = document.getElementById('adm-res-cat');
  var urlInp    = document.getElementById('adm-res-url');
  var typeInp   = document.getElementById('adm-res-type');
  var visInp    = document.getElementById('adm-res-vis');
  var submitBtn = document.getElementById('adm-res-submit-btn');

  var title = (titleInp ? titleInp.value : '').trim();
  var desc  = (descInp ? descInp.value : '').trim();
  var cat   = (catInp ? catInp.value : 'Handbooks & Manuals').trim();
  var url   = (urlInp ? urlInp.value : '').trim();
  var type  = (typeInp ? typeInp.value : 'PDF').trim().toUpperCase();
  var vis   = (visInp ? visInp.value : 'all').trim().toLowerCase();

  var editId = submitBtn ? submitBtn.getAttribute('data-edit-id') : null;

  if (!title) {
    if (typeof showToast === 'function') showToast('Please enter a resource title.', 'warning');
    else alert('Please enter a title.');
    return;
  }
  if (!url) {
    if (typeof showToast === 'function') showToast('Please enter a document URL or upload a file.', 'warning');
    else alert('Please enter a document URL.');
    return;
  }

  if (submitBtn) submitBtn.disabled = true;

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
        item.updatedAt = new Date().toISOString().split('T')[0];
      }
      if (typeof showToast === 'function') showToast('Resource updated successfully!', 'success');
    } else {
      var newRes = {
        id: 'res_' + Date.now(),
        title: title,
        description: desc,
        category: cat,
        fileType: type,
        url: url,
        visibility: vis,
        fileSize: type === 'PDF' ? 'PDF File' : 'Document Link',
        updatedAt: new Date().toISOString().split('T')[0]
      };
      resources.push(newRes);
      if (typeof showToast === 'function') showToast('Resource added successfully!', 'success');
    }

    await saveResources(resources);
    cancelEditResource();
  } catch (e) {
    console.error('addOrUpdateResource error:', e);
    if (typeof showToast === 'function') showToast('Failed to save resource.', 'error');
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

/**
 * Handles uploading a PDF or document file to Supabase Storage
 * @param {HTMLInputElement} input
 */
async function handleResourceFileUpload(input) {
  if (!input || !input.files || !input.files.length) return;
  var file = input.files[0];
  var urlInp = document.getElementById('adm-res-url');
  var typeInp = document.getElementById('adm-res-type');
  var titleInp = document.getElementById('adm-res-title');

  var ext = (file.name.split('.').pop() || 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '');
  var cleanName = file.name.replace(/\.[^/.]+$/, "");

  // Auto-populate title if empty
  if (titleInp && !titleInp.value) {
    titleInp.value = cleanName.replace(/[_-]/g, ' ');
  }

  // Auto-detect type
  if (typeInp) {
    if (ext === 'pdf') typeInp.value = 'PDF';
    else if (ext === 'doc' || ext === 'docx') typeInp.value = 'DOC';
    else if (ext === 'xls' || ext === 'xlsx') typeInp.value = 'SHEET';
    else typeInp.value = 'LINK';
  }

  if (typeof showToast === 'function') showToast('Uploading document...', 'info');

  try {
    var fname = 'doc_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6) + '.' + ext;
    var blob  = new Blob([await file.arrayBuffer()], { type: file.type || 'application/pdf' });

    var bucketName = 'resources';
    var uploadedUrl = '';

    if (typeof supa !== 'undefined' && supa.uploadFile) {
      try {
        await supa.uploadFile(bucketName, fname, blob);
        uploadedUrl = supa.fileUrl(bucketName, fname);
      } catch (uploadErr) {
        // Fallback to 'gallery' bucket if 'resources' bucket is not created
        await supa.uploadFile('gallery', fname, blob);
        uploadedUrl = supa.fileUrl('gallery', fname);
      }
    }

    if (uploadedUrl && urlInp) {
      urlInp.value = uploadedUrl;
      if (typeof showToast === 'function') showToast('File uploaded successfully!', 'success');
    }
  } catch (err) {
    console.error('handleResourceFileUpload error:', err);
    if (typeof showToast === 'function') showToast('Upload failed: ' + err.message, 'error');
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
  } else if (typeof window !== 'undefined' && window.confirm) {
    confirmed = window.confirm(msg);
  } else {
    confirmed = true;
  }
  if (!confirmed) return;

  var updated = resources.filter(function(r) { return r.id !== id; });
  await saveResources(updated);
  if (typeof showToast === 'function') showToast('Resource deleted.', 'success');
}

/**
 * Clears all resources from the repository
 */
async function clearAllResources() {
  var confirmed = false;
  var msg = 'Are you sure you want to remove all company resources? This action cannot be undone.';
  if (typeof showConfirmModal === 'function') {
    confirmed = await showConfirmModal(msg, 'Clear All Resources');
  } else if (typeof window !== 'undefined' && window.confirm) {
    confirmed = window.confirm(msg);
  } else {
    confirmed = true;
  }
  if (!confirmed) return;

  await saveResources([]);
  if (typeof showToast === 'function') showToast('All resources cleared.', 'info');
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
  window.handleResourceFileUpload  = handleResourceFileUpload;
  window.deleteResource            = deleteResource;
  window.clearAllResources         = clearAllResources;
  window.resetResourcesToDefaults  = resetResourcesToDefaults;
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
    handleResourceFileUpload: handleResourceFileUpload,
    deleteResource: deleteResource,
    clearAllResources: clearAllResources,
    resetResourcesToDefaults: resetResourcesToDefaults
  };
}
