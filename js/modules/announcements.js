/**
 * 1st Petaling Jaya Boys' Brigade Portal
 * Announcements Module (TSK-010)
 *
 * Implements public announcement feed, rich text formatting bar,
 * emoji reactions, and admin post/edit/delete operations.
 */

// ── State ──────────────────────────────────────────────────────────────────
var announcements = [];

var REACT_EMOJIS = ['👍', '❤️', '😂', '😮', '🙏', '🔥'];

var ANN_EMOJIS = [
  '📢', '📌', '✅', '❌', '⚠️', '🎉', '🏆', '📅', '🕐', '📝', '👥', '🎖️',
  '⭐', '🔴', '🟡', '🟢', '🔵', '💡', '🔔', '📋', '🏅', '👔', '🛒', '📦',
  '🙏', '💪', '🔥', '❤️', '👍', '👎', '✊', '🫡', '😊', '😄', '🥳', '🤝'
];

var _annSavedRange = null;

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
    'DIV', 'A', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE'
  ];
  var ALLOWED_ATTRS = ['style', 'color', 'size', 'href', 'target', 'rel'];

  function clean(node) {
    var children = Array.from(node.childNodes);
    for (var i = 0; i < children.length; i++) {
      var child = children[i];
      if (child.nodeType === 1) { // Element node
        var tagName = child.tagName.toUpperCase();
        if (ALLOWED_TAGS.indexOf(tagName) === -1) {
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
  try {
    if (typeof supa !== 'undefined' && supa.get) {
      var rows = await supa.get('bb_announcements?order=created_at.asc&select=*');
      announcements.length = 0;
      if (rows && rows.length) {
        rows.forEach(function(r) {
          if (!r.reactions || typeof r.reactions !== 'object') r.reactions = {};
          announcements.push(r);
        });
      }
    }
  } catch (e) {
    console.warn('loadAnnouncements error:', e);
  }

  if (typeof window !== 'undefined') {
    window.announcements = announcements;
  }
  renderAnnouncements();
  var adminList = (typeof document !== 'undefined') ? document.getElementById('admin-ann-list') : null;
  if (adminList) {
    renderAdminAnnList();
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
    list.innerHTML = '<div style="color:var(--text-muted);font-size:13px;text-align:center;padding:20px;">No announcements yet.</div>';
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

    html += '<div class="announcement-item" id="ann-item-' + realIdx + '">'
      + '<div class="ann-date">' + safeDate + '</div>'
      + '<div class="ann-title">' + safeTitle + '</div>'
      + '<div class="ann-body">' + sanitizedBody + '</div>'
      + reactHtml
      + '</div>';
  });

  list.innerHTML = html;

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

  var html = '<div style="font-family:\'Oswald\',sans-serif;font-size:13px;font-weight:600;color:var(--text-muted);margin-bottom:8px;letter-spacing:1px;">EXISTING ANNOUNCEMENTS</div>';
  var rev = announcements.slice().reverse();

  rev.forEach(function(a, ri) {
    var i = announcements.length - 1 - ri;
    var safeTitle = (typeof escapeHtml === 'function') ? escapeHtml(a.title || '') : (a.title || '');
    var safeDate = (typeof escapeHtml === 'function') ? escapeHtml(a.date || '') : (a.date || '');

    html += '<div style="background:var(--bg-card);border:1px solid var(--border-card);border-radius:10px;padding:12px;margin-bottom:8px;border-left:3px solid var(--accent);">'
      + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">'
      + '<div style="flex:1;"><div style="font-family:\'Oswald\',sans-serif;font-size:14px;color:var(--text-primary);font-weight:600;">' + safeTitle + '</div><div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">' + safeDate + '</div></div>'
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
    if (editIdx >= 0) {
      var a = announcements[editIdx];
      if (a) {
        a.title = title;
        a.body  = sanitizedBody;
        if (typeof supa !== 'undefined' && supa.patch && a.id) {
          await supa.patch('bb_announcements?id=eq.' + a.id, { title: title, body: sanitizedBody });
        }
      }
      if (btn) {
        btn.innerHTML = '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Post Announcement';
        btn.removeAttribute('data-edit-idx');
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
      if (typeof supa !== 'undefined' && supa.post) {
        var row = await supa.post('bb_announcements', newRecord);
        if (row && row[0]) {
          announcements.push(row[0]);
        }
      }
      if (typeof showToast === 'function') {
        showToast('Announcement posted successfully!', 'success');
      }
    }

    if (titleEl) titleEl.value = '';
    if (bodyEl)  bodyEl.innerHTML = '';
    renderAnnouncements();
    renderAdminAnnList();
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
    document.execCommand('insertHTML', false, '<hr style="border:none;border-top:1px solid rgba(255,255,255,0.15);margin:10px 0;"/>');
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
  document.addEventListener('keyup', function(e) {
    var editor = document.getElementById('ann-body-input');
    if (editor && editor.contains(e.target)) annSaveRange();
  });
}

// ── Global Window Exports (HTML inline handler compatibility) ────────────────
if (typeof window !== 'undefined') {
  window.announcements            = announcements;
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
  window.annSaveRange             = annSaveRange;
  window.annRestoreRange          = annRestoreRange;
  window.annFmt                   = annFmt;
  window.annFontSize              = annFontSize;
  window.annColor                 = annColor;
  window.annInsertLine            = annInsertLine;
  window.toggleAnnEmoji           = toggleAnnEmoji;
}

// ── Node.js Module Exports ──────────────────────────────────────────────────
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    announcements: announcements,
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
    annSaveRange: annSaveRange,
    annRestoreRange: annRestoreRange,
    annFmt: annFmt,
    annFontSize: annFontSize,
    annColor: annColor,
    annInsertLine: annInsertLine,
    toggleAnnEmoji: toggleAnnEmoji
  };
}
