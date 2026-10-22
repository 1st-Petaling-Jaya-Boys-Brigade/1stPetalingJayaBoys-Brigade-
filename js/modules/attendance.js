/**
 * 1st Petaling Jaya Boys' Brigade Portal
 * Attendance Engine & Roles Module (TSK-007)
 *
 * Roles:
 *   - Section Leader (Band only: Brass / Woodwind / Percussion)
 *   - Platoon Leader (Parade & Band for Platoon: Alpha, Papa, Zulu, Hotel)
 *
 * Scoring Rules:
 *   - Band Parade: Max 2 pts (1 opening + 1 dismissal). Valid leave = 1 pt only.
 *   - Afternoon Parade: Max 8 pts (1 opening + 1 dismissal + 0-6 uniform). Valid leave = 1 pt only.
 */

// ── State & Constants ───────────────────────────────────────────────────────

var _attWeeks        = [];
var _attCurrentWeek  = null;
var _attRecords      = {};
var _attMembers      = [];   // All members from Supabase, enriched with .section
var _attSheetId      = '';
var _attScriptUrl    = '';
var _attUserRole     = null; // 'section_leader' | 'squad_leader'
var _attUserGroup    = '';   // Section name (Brass/Woodwind/Percussion) OR Platoon name
var _attParadeConfig = {};

var ATT_WEEKS_KEY    = 'bb_att_weeks';
var ATT_ROLES_KEY    = 'bb_att_roles';          // { ic: { role, group } }
var ATT_DATA_KEY     = 'bb_att_data';
var ATT_SHEET_KEY    = 'bb_att_sheet';
var ATT_PARADE_KEY   = 'bb_att_parade_config';
var ATT_SECTIONS_KEY = 'bb_att_sections';       // { ic: 'Brass' | 'Woodwind' | 'Percussion' }

var BAND_SECTIONS    = ['Brass', 'Woodwind', 'Percussion'];

// ── Configuration Persistence Helpers ───────────────────────────────────────

async function attGetConfig(key) {
  var client = (typeof supa !== 'undefined' ? supa : (typeof window !== 'undefined' ? window.supa : null));
  if (!client) return null;
  try {
    var r = await client.get('bb_config?key=eq.' + key + '&select=value');
    if (r && r.length) return JSON.parse(r[0].value || 'null');
  } catch (e) {
    console.warn('attGetConfig error:', e);
  }
  return null;
}

async function attSaveConfig(key, value) {
  var client = (typeof supa !== 'undefined' ? supa : (typeof window !== 'undefined' ? window.supa : null));
  if (!client) return;
  try {
    await client.req('POST', 'bb_config?on_conflict=key', { key: key, value: JSON.stringify(value) });
  } catch (e) {
    try {
      await client.patch('bb_config?key=eq.' + key, { value: JSON.stringify(value) });
    } catch (e2) {
      console.error('attSaveConfig error:', e2);
    }
  }
}

// ── Point Calculation Engines ───────────────────────────────────────────────

/**
 * Calculate Band attendance points (0 to 2 pts)
 * 1 pt opening + 1 pt dismissal. If on valid leave, awarded 1 pt.
 * @param {Object} rec
 * @returns {number}
 */
function calcBandPts(rec) {
  rec = rec || {};
  if (rec.bandLeave === 1) return 1;
  return (rec.bandOpen === 1 ? 1 : 0) + (rec.bandDismiss === 1 ? 1 : 0);
}

/**
 * Calculate Parade attendance points (0 to 8 pts)
 * 1 pt opening + 1 pt dismissal + 0-6 uniform. If on valid leave, awarded 1 pt.
 * @param {Object} rec
 * @returns {number}
 */
function calcParadePts(rec) {
  rec = rec || {};
  if (rec.paradeLeave === 1) return 1;
  var att = (rec.paradeOpen === 1 ? 1 : 0) + (rec.paradeDismiss === 1 ? 1 : 0);
  var uni = att > 0 ? Math.min(6, Math.max(0, rec.uniform || 0)) : 0;
  return att + uni;
}

// ── Tab Visibility & Access Control ─────────────────────────────────────────

async function checkAttendanceTabVisibility(ic) {
  if (!ic) return;
  try {
    var roles = await attGetConfig(ATT_ROLES_KEY) || {};
    var t  = document.getElementById('tab-attendance');
    var st = document.getElementById('snav-attendance');
    if (roles[ic] && roles[ic].role) {
      if (t)  t.style.display  = 'block';
      if (st) st.style.display = 'flex';
    } else {
      if (t)  t.style.display  = 'none';
      if (st) st.style.display = 'none';
    }
  } catch (e) {
    console.warn('checkAttendanceTabVisibility error:', e);
  }
}

async function checkAttendanceAccess() {
  var ic = typeof sessionGet === 'function' ? sessionGet('ic') : null;
  var gate  = document.getElementById('att-gate');
  var panel = document.getElementById('att-panel');
  if (!ic) {
    if (gate)  gate.style.display  = 'block';
    if (panel) panel.style.display = 'none';
    return;
  }
  var roles = await attGetConfig(ATT_ROLES_KEY) || {};
  var info  = roles[ic];
  if (!info || !info.role) {
    if (gate)  gate.style.display  = 'block';
    if (panel) panel.style.display = 'none';
    return;
  }
  _attUserRole  = info.role;
  _attUserGroup = info.group || '';
  if (gate)  gate.style.display  = 'none';
  if (panel) panel.style.display = 'block';

  // Role label display
  var roleName = { section_leader: 'Section Leader', squad_leader: 'Platoon Leader' };
  var lbl = document.getElementById('att-role-label');
  var dsc = document.getElementById('att-role-desc');
  if (lbl) lbl.textContent = roleName[_attUserRole] || _attUserRole;
  if (dsc) dsc.textContent = _attUserGroup ? 'Group: ' + _attUserGroup : '';

  // Section leaders see band only; Platoon leaders see both morning & afternoon
  var morning   = document.getElementById('att-morning-section');
  var afternoon = document.getElementById('att-afternoon-section');
  if (_attUserRole === 'section_leader') {
    if (morning)   morning.style.display   = 'block';
    if (afternoon) afternoon.style.display = 'none';
  } else {
    if (morning)   morning.style.display   = 'block';
    if (afternoon) afternoon.style.display = 'block';
  }

  var cfg = await attGetConfig(ATT_SHEET_KEY) || {};
  _attSheetId   = cfg.sheetId   || '';
  _attScriptUrl = cfg.scriptUrl || '';
  var disp = document.getElementById('att-sheet-id-display');
  if (disp) disp.textContent = _attSheetId ? 'Sheet connected' : 'Not configured — see admin';

  _attParadeConfig = await attGetConfig(ATT_PARADE_KEY) || {};
  await loadAttWeeks();

  // Load members + their assigned band sections
  var client = (typeof supa !== 'undefined' ? supa : (typeof window !== 'undefined' ? window.supa : null));
  if (client) {
    try {
      _attMembers = await client.get('bb_members?select=ic,name,squad,rank&order=name.asc') || [];
    } catch (e) {
      _attMembers = [];
    }
  }
  var sections = await attGetConfig(ATT_SECTIONS_KEY) || {};
  _attMembers.forEach(function(m) {
    m.section = sections[m.ic] || '';
  });
}

// ── Weeks Management ────────────────────────────────────────────────────────

async function loadAttWeeks() {
  _attWeeks = await attGetConfig(ATT_WEEKS_KEY) || [];
  renderAttWeekChips();
}

function renderAttWeekChips() {
  var c = document.getElementById('att-week-chips');
  if (!c) return;
  if (!_attWeeks.length) {
    c.innerHTML = '<div style="color:var(--text-muted);font-size:12px;padding:8px;">No weeks set — admin must add parade dates.</div>';
    return;
  }
  c.innerHTML = _attWeeks.map(function(w, i) {
    var active = _attCurrentWeek && _attCurrentWeek.label === w.label ? ' active' : '';
    return '<button class="att-week-chip' + active + '" onclick="selectAttWeek(' + i + ')">'
      + w.label + '<br><span style="font-size:10px;font-weight:400;opacity:0.7;">' + (w.date || '') + '</span></button>';
  }).join('');
}

async function selectAttWeek(idx) {
  _attCurrentWeek = _attWeeks[idx];
  renderAttWeekChips();
  var allData  = await attGetConfig(ATT_DATA_KEY) || {};
  var weekData = allData[_attCurrentWeek.label] || {};
  _attRecords  = {};
  Object.keys(weekData).forEach(function(ic) {
    _attRecords[ic] = weekData[ic];
  });
  if (_attUserRole === 'squad_leader') renderAttParadeInfo();
  renderAttMorningList();
  renderAttAfternoonList();
  updateAttSummary('morning');
  updateAttSummary('afternoon');
}

function renderAttParadeInfo() {
  var el = document.getElementById('att-parade-info');
  if (!el || !_attCurrentWeek) return;
  var cfg = _attParadeConfig[_attCurrentWeek.label] || {};
  el.innerHTML = '<div style="background:rgba(245,197,66,0.08);border:1px solid rgba(245,197,66,0.25);border-radius:10px;padding:10px 14px;margin-bottom:14px;">'
    + '<div style="font-size:11px;font-weight:700;color:var(--brand-gold);letter-spacing:1px;text-transform:uppercase;margin-bottom:4px;display:flex;align-items:center;gap:6px;"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg> This Week\'s Parade</div>'
    + '<div style="font-size:13px;color:var(--text-primary);font-weight:600;">Uniform: ' + (cfg.uniformType || 'Not set') + '</div>'
    + (cfg.notes ? '<div style="font-size:12px;color:var(--text-secondary);margin-top:3px;">' + cfg.notes + '</div>' : '')
    + '</div>';
}

// ── Member Filtering ────────────────────────────────────────────────────────

function getFilteredMembers(session) {
  return _attMembers.filter(function(m) {
    var grp = (_attUserGroup || '').toLowerCase();
    if (!grp) return true;
    if (session === 'morning' && _attUserRole === 'section_leader') {
      return (m.section || '').toLowerCase() === grp;
    }
    if (session === 'morning' && _attUserRole === 'squad_leader') {
      return (m.squad || '').toLowerCase() === grp;
    }
    if (session === 'afternoon' && _attUserRole === 'squad_leader') {
      return (m.squad || '').toLowerCase() === grp;
    }
    return true;
  });
}

// ── Render Attendance Lists ─────────────────────────────────────────────────

function renderAttMorningList() {
  var c = document.getElementById('att-morning-list');
  if (!c) return;
  if (!_attCurrentWeek) {
    c.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:13px;">Select a week above.</div>';
    return;
  }
  var members = getFilteredMembers('morning');
  if (!members.length) {
    c.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:13px;">No members in your group.</div>';
    return;
  }
  c.innerHTML = members.map(function(m) {
    return buildBandRow(m, _attRecords[m.ic] || {});
  }).join('');
  attachBandListeners();
}

function renderAttAfternoonList() {
  var c = document.getElementById('att-afternoon-list');
  if (!c) return;
  if (!_attCurrentWeek) {
    c.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:13px;">Select a week above.</div>';
    return;
  }
  var members = getFilteredMembers('afternoon');
  if (!members.length) {
    c.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:13px;">No members in your platoon.</div>';
    return;
  }
  c.innerHTML = members.map(function(m) {
    return buildParadeRow(m, _attRecords[m.ic] || {});
  }).join('');
  attachParadeListeners();
}

// ── Row & Toggle Button Builders ────────────────────────────────────────────

function makePtBtn(ic, field, val, disabled) {
  return '<div class="att-toggle"' + (disabled ? ' style="opacity:0.35;pointer-events:none;"' : '') + '>'
    + '<button class="att-btn' + (val === 1 ? ' present' : '') + '" data-ic="' + ic + '" data-field="' + field + '" data-val="1"' + (disabled ? ' disabled' : '') + '>✓</button>'
    + '<button class="att-btn' + (val === 0 && val !== '' ? ' absent' : '') + '" data-ic="' + ic + '" data-field="' + field + '" data-val="0"' + (disabled ? ' disabled' : '') + '>✗</button>'
    + '</div>';
}

function makeLeaveBtn(ic, field, val) {
  return '<div class="att-toggle">'
    + '<button class="att-btn' + (val === 1 ? ' present' : '') + '" data-ic="' + ic + '" data-field="' + field + '" data-val="1">Yes</button>'
    + '<button class="att-btn' + (val === 0 && val !== '' ? ' absent' : '') + '" data-ic="' + ic + '" data-field="' + field + '" data-val="0">No</button>'
    + '</div>';
}

function buildBandRow(m, rec) {
  var onLeave  = rec.bandLeave === 1;
  var pts      = calcBandPts(rec);
  var ptColor  = pts === 2 ? '#10b981' : pts === 1 ? '#f59e0b' : '#ef4444';
  var subText  = (m.rank || '') + (m.section ? ' · ' + m.section : '') + (m.squad ? ' · ' + m.squad + ' Platoon' : '');
  return '<div class="att-member-row" style="align-items:flex-start;gap:8px;padding:12px 0;">'
    + '<div style="flex:1;min-width:0;">'
    +   '<div class="att-member-name">' + m.name + '</div>'
    +   '<div class="att-member-sub">' + subText + '</div>'
    +   '<div style="margin-top:5px;display:inline-block;background:' + ptColor + '22;border:1px solid ' + ptColor + '55;border-radius:20px;padding:2px 10px;">'
    +     '<span style="font-family:\'Oswald\',sans-serif;font-size:13px;font-weight:700;color:' + ptColor + ';">' + pts + ' / 2 pts</span>'
    +   '</div>'
    + '</div>'
    + '<div style="display:flex;flex-direction:column;gap:5px;align-items:flex-end;flex-shrink:0;">'
    +   '<div style="display:flex;align-items:center;gap:6px;"><span style="font-size:10px;color:var(--text-muted);white-space:nowrap;">Opening</span>' + makePtBtn(m.ic, 'bandOpen', rec.bandOpen, onLeave) + '</div>'
    +   '<div style="display:flex;align-items:center;gap:6px;"><span style="font-size:10px;color:var(--text-muted);white-space:nowrap;">Dismissal</span>' + makePtBtn(m.ic, 'bandDismiss', rec.bandDismiss, onLeave) + '</div>'
    +   '<div style="display:flex;align-items:center;gap:6px;"><span style="font-size:10px;color:var(--brand-gold);white-space:nowrap;">Valid Leave</span>' + makeLeaveBtn(m.ic, 'bandLeave', rec.bandLeave) + '</div>'
    + '</div>'
    + '</div>';
}

function buildParadeRow(m, rec) {
  var onLeave  = rec.paradeLeave === 1;
  var present  = rec.paradeOpen === 1 || rec.paradeDismiss === 1;
  var pts      = calcParadePts(rec);
  var ptColor  = pts >= 7 ? '#10b981' : pts >= 4 ? '#f59e0b' : '#ef4444';
  var uniVal   = (!onLeave && present) ? Math.min(6, Math.max(0, rec.uniform || 0)) : 0;
  var uniDis   = onLeave || !present;
  var rmk      = (rec.remarks || '').replace(/"/g, '&quot;');
  return '<div class="att-member-row" style="align-items:flex-start;gap:8px;padding:12px 0;flex-wrap:wrap;">'
    + '<div style="flex:1;min-width:140px;">'
    +   '<div class="att-member-name">' + m.name + '</div>'
    +   '<div class="att-member-sub">' + (m.rank || '') + (m.squad ? ' · ' + m.squad + ' Platoon' : '') + '</div>'
    +   '<div style="margin-top:5px;display:inline-block;background:' + ptColor + '22;border:1px solid ' + ptColor + '55;border-radius:20px;padding:2px 10px;">'
    +     '<span data-pts-badge style="font-family:\'Oswald\',sans-serif;font-size:13px;font-weight:700;color:' + ptColor + ';">' + pts + ' / 8 pts</span>'
    +   '</div>'
    +   '<div style="margin-top:7px;">'
    +     '<input type="text" class="att-remarks-input" data-ic="' + m.ic + '" value="' + rmk + '" placeholder="Remarks..." '
    +     'style="width:100%;background:var(--bg-input);border:1px solid var(--border-card);border-radius:6px;color:var(--text-primary);padding:5px 9px;font-size:11px;font-family:\'Roboto\',sans-serif;box-sizing:border-box;"/>'
    +   '</div>'
    + '</div>'
    + '<div style="display:flex;flex-direction:column;gap:5px;align-items:flex-end;flex-shrink:0;">'
    +   '<div style="display:flex;align-items:center;gap:6px;"><span style="font-size:10px;color:var(--text-muted);white-space:nowrap;">Opening</span>' + makePtBtn(m.ic, 'paradeOpen', rec.paradeOpen, onLeave) + '</div>'
    +   '<div style="display:flex;align-items:center;gap:6px;"><span style="font-size:10px;color:var(--text-muted);white-space:nowrap;">Dismissal</span>' + makePtBtn(m.ic, 'paradeDismiss', rec.paradeDismiss, onLeave) + '</div>'
    +   '<div style="display:flex;align-items:center;gap:6px;"><span style="font-size:10px;color:var(--brand-gold);white-space:nowrap;">Valid Leave</span>' + makeLeaveBtn(m.ic, 'paradeLeave', rec.paradeLeave) + '</div>'
    +   '<div style="display:flex;align-items:center;gap:6px;">'
    +     '<span style="font-size:10px;color:#3b82f6;white-space:nowrap;">Uniform (0-6)</span>'
    +     '<input class="att-pts-input" type="number" min="0" max="6" value="' + uniVal + '" data-ic="' + m.ic + '" data-field="uniform"'
    +     (uniDis ? ' disabled style="opacity:0.35;width:52px;"' : ' style="width:52px;"') + '/>'
    +   '</div>'
    + '</div>'
    + '</div>';
}

// ── Event Listeners ─────────────────────────────────────────────────────────

function attachBandListeners() {
  var c = document.getElementById('att-morning-list');
  if (!c) return;
  c.querySelectorAll('.att-btn[data-field]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var ic    = btn.getAttribute('data-ic');
      var field = btn.getAttribute('data-field');
      var val   = parseInt(btn.getAttribute('data-val'), 10);
      if (!_attRecords[ic]) _attRecords[ic] = {};
      var rec = _attRecords[ic];

      // Toggle: clicking same value again clears it
      var newVal = rec[field] === val ? '' : val;
      rec[field] = newVal;

      // Mutual exclusion — leave vs opening/dismissal
      if (field === 'bandLeave') {
        if (newVal === 1) {
          rec.bandOpen    = '';
          rec.bandDismiss = '';
        }
      } else if (field === 'bandOpen' || field === 'bandDismiss') {
        if (newVal === 1) {
          rec.bandLeave = '';
        }
      }

      renderAttMorningList();
      updateAttSummary('morning');
    });
  });
}

function attachParadeListeners() {
  var c = document.getElementById('att-afternoon-list');
  if (!c) return;
  c.querySelectorAll('.att-btn[data-field]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var ic    = btn.getAttribute('data-ic');
      var field = btn.getAttribute('data-field');
      var val   = parseInt(btn.getAttribute('data-val'), 10);
      if (!_attRecords[ic]) _attRecords[ic] = {};
      var rec = _attRecords[ic];

      // Toggle: clicking same value again clears it
      var newVal = rec[field] === val ? '' : val;
      rec[field] = newVal;

      // Mutual exclusion — leave vs opening/dismissal
      if (field === 'paradeLeave') {
        if (newVal === 1) {
          rec.paradeOpen    = '';
          rec.paradeDismiss = '';
          rec.uniform       = 0;
        }
      } else if (field === 'paradeOpen' || field === 'paradeDismiss') {
        if (newVal === 1) {
          rec.paradeLeave = '';
        } else {
          if (rec.paradeOpen !== 1 && rec.paradeDismiss !== 1) {
            rec.uniform = 0;
          }
        }
      }

      renderAttAfternoonList();
      updateAttSummary('afternoon');
    });
  });

  c.querySelectorAll('.att-pts-input[data-field="uniform"]').forEach(function(inp) {
    inp.addEventListener('input', function() {
      var ic = inp.getAttribute('data-ic');
      if (!_attRecords[ic]) _attRecords[ic] = {};
      var v = Math.min(6, Math.max(0, parseInt(inp.value, 10) || 0));
      inp.value = v;
      _attRecords[ic].uniform = v;

      // Update the pts badge in-place without triggering full re-render (maintains focus)
      var row = inp.closest('.att-member-row');
      if (row) {
        var rec = _attRecords[ic] || {};
        var pts = calcParadePts(rec);
        var ptColor = pts >= 7 ? '#10b981' : pts >= 4 ? '#f59e0b' : '#ef4444';
        var badge = row.querySelector('[data-pts-badge]');
        if (badge) {
          badge.textContent = pts + ' / 8 pts';
          badge.style.color = ptColor;
          badge.parentElement.style.background = ptColor + '22';
          badge.parentElement.style.borderColor = ptColor + '55';
        }
      }
      updateAttSummary('afternoon');
    });
  });

  c.querySelectorAll('.att-remarks-input').forEach(function(inp) {
    inp.addEventListener('input', function() {
      var ic = inp.getAttribute('data-ic');
      if (!_attRecords[ic]) _attRecords[ic] = {};
      _attRecords[ic].remarks = inp.value;
    });
  });
}

// ── Summary Counters ────────────────────────────────────────────────────────

function updateAttSummary(session) {
  var el = document.getElementById(session === 'morning' ? 'att-morning-summary' : 'att-afternoon-summary');
  if (!el) return;
  var members = getFilteredMembers(session);
  var present = 0, absent = 0, leave = 0, totalPts = 0;
  var maxPts = session === 'morning' ? 2 : 8;

  members.forEach(function(m) {
    var rec = _attRecords[m.ic] || {};
    if (session === 'morning') {
      totalPts += calcBandPts(rec);
      if (rec.bandLeave === 1) leave++;
      else if (rec.bandOpen === 1 || rec.bandDismiss === 1) present++;
      else if (rec.bandOpen === 0 && rec.bandDismiss === 0) absent++;
    } else {
      totalPts += calcParadePts(rec);
      if (rec.paradeLeave === 1) leave++;
      else if (rec.paradeOpen === 1 || rec.paradeDismiss === 1) present++;
      else if (rec.paradeOpen === 0 && rec.paradeDismiss === 0) absent++;
    }
  });

  el.innerHTML =
    '<div class="att-summary-chip" style="color:var(--green);border-color:rgba(16,185,129,0.3);display:inline-flex;align-items:center;gap:4px;"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg> Present: ' + present + '</div>' +
    '<div class="att-summary-chip" style="color:var(--red);border-color:rgba(239,68,68,0.3);display:inline-flex;align-items:center;gap:4px;"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg> Absent: ' + absent + '</div>' +
    '<div class="att-summary-chip" style="color:var(--brand-gold);border-color:rgba(245,197,66,0.3);display:inline-flex;align-items:center;gap:4px;"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg> Leave: ' + leave + '</div>' +
    '<div class="att-summary-chip" style="color:var(--brand-blue);border-color:rgba(59,130,246,0.3);display:inline-flex;align-items:center;gap:4px;"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="7"></circle><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"></polyline></svg> Pts: ' + totalPts + ' / ' + (members.length * maxPts) + '</div>';
}

// ── Save Handler & Toast Notifications ──────────────────────────────────────

async function saveAttendance() {
  if (!_attCurrentWeek) {
    if (typeof alert === 'function') alert('Please select a week first.');
    return;
  }
  var btn = document.getElementById('att-save-btn');
  if (btn) {
    btn.innerHTML = '<span class="spinner"></span> Saving...';
    btn.disabled = true;
  }
  try {
    var allData = await attGetConfig(ATT_DATA_KEY) || {};
    allData[_attCurrentWeek.label] = allData[_attCurrentWeek.label] || {};
    Object.keys(_attRecords).forEach(function(ic) {
      allData[_attCurrentWeek.label][ic] = _attRecords[ic];
    });
    await attSaveConfig(ATT_DATA_KEY, allData);
    if (_attScriptUrl) {
      syncToSheets(allData);
      showToast('Attendance saved!', '#10b981');
    } else {
      showToast('Attendance saved (no Sheets configured).', '#3b82f6');
    }
  } catch (e) {
    if (typeof alert === 'function') alert('Failed to save: ' + e.message);
  } finally {
    if (btn) {
      btn.innerHTML = '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg> Save Attendance';
      btn.disabled = false;
    }
  }
}

function showToast(msg, bg) {
  var t = document.getElementById('att-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'att-toast';
    t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);color:#fff;padding:12px 22px;border-radius:12px;font-family:Oswald,sans-serif;font-size:15px;font-weight:600;letter-spacing:1px;box-shadow:var(--shadow-dock);z-index:9999;transition:opacity 0.4s;border:1px solid var(--border-card);white-space:nowrap;';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.background = bg || 'var(--bg-card)';
  t.style.color = bg ? '#fff' : 'var(--text-primary)';
  t.style.opacity = '1';
  clearTimeout(t._timer);
  t._timer = setTimeout(function() {
    t.style.opacity = '0';
  }, 3500);
}

// ── Sync to Google Sheets Wrapper ───────────────────────────────────────────

async function syncToSheets(allDataOverride) {
  if (!_attScriptUrl) {
    if (typeof alert === 'function') alert('Sheets not configured. Admin -> Attendance & Roles -> Sheets.');
    return;
  }
  var btn = document.getElementById('att-sync-btn');
  var icon = document.getElementById('att-sync-icon');
  if (btn) btn.disabled = true;
  if (icon) icon.textContent = '…';

  try {
    var allData   = allDataOverride || (await attGetConfig(ATT_DATA_KEY) || {});
    var weekLabel = _attCurrentWeek ? _attCurrentWeek.label : null;
    var wk        = _attCurrentWeek || {};
    var weekCfg   = weekLabel ? (_attParadeConfig[weekLabel] || {}) : {};

    var fmtShort = (typeof window.fmtDateShort === 'function') ? window.fmtDateShort : function(d){ return d; };
    var fmtLong  = (typeof window.fmtDateLong === 'function') ? window.fmtDateLong : function(d){ return d; };

    var wDateShort = wk.dateShort || fmtShort(wk.date || '');
    var wDateLong  = wk.dateLong  || fmtLong(wk.date || '');

    var records   = [];
    _attMembers.forEach(function(m) {
      var rec     = (weekLabel && allData[weekLabel]) ? (allData[weekLabel][m.ic] || {}) : {};
      var onLeave = rec.paradeLeave === 1;
      var present = rec.paradeOpen === 1 || rec.paradeDismiss === 1;
      records.push({
        name: m.name,
        ic: m.ic,
        squad: m.squad || '',
        rank: m.rank || '',
        section: m.section || '',
        weekLabel: weekLabel || '',
        weekDate: wk.date || '',
        weekDateShort: wDateShort,
        weekDateLong: wDateLong,
        uniformType: weekCfg.uniformType || '',
        bandOpen: rec.bandOpen !== '' && rec.bandOpen !== undefined ? rec.bandOpen : '',
        bandDismiss: rec.bandDismiss !== '' && rec.bandDismiss !== undefined ? rec.bandDismiss : '',
        bandLeave: rec.bandLeave !== '' && rec.bandLeave !== undefined ? rec.bandLeave : '',
        bandPts: calcBandPts(rec),
        paradeOpen: rec.paradeOpen !== '' && rec.paradeOpen !== undefined ? rec.paradeOpen : '',
        paradeDismiss: rec.paradeDismiss !== '' && rec.paradeDismiss !== undefined ? rec.paradeDismiss : '',
        paradeLeave: rec.paradeLeave !== '' && rec.paradeLeave !== undefined ? rec.paradeLeave : '',
        uniform: (!onLeave && present) ? Math.min(6, Math.max(0, rec.uniform || 0)) : 0,
        paradePts: calcParadePts(rec),
        remarks: rec.remarks || ''
      });
    });

    if (typeof window.syncAttendanceToSheets === 'function') {
      window.syncAttendanceToSheets({
        scriptUrl: _attScriptUrl,
        sheetId: _attSheetId,
        records: records,
        weekLabel: weekLabel,
        weekDate: wk.date || '',
        weekDateShort: wDateShort,
        weekDateLong: wDateLong
      }).catch(function() {});
    }

    if (icon) {
      icon.innerHTML = '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
    }
    setTimeout(function() {
      if (icon) {
        icon.innerHTML = '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 16 4 4 4-4"/><path d="M7 20V4"/><path d="m21 8-4-4-4 4"/><path d="M17 4v16"/></svg>';
      }
    }, 3000);
    showToast('Saved & syncing to Google Sheets!', '#10b981');
  } catch (e) {
    if (icon) {
      icon.innerHTML = '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 16 4 4 4-4"/><path d="M7 20V4"/><path d="m21 8-4-4-4 4"/><path d="M17 4v16"/></svg>';
    }
    showToast('Sync error — data saved to portal.', '#ef4444');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ── Admin: Attendance Subtabs ───────────────────────────────────────────────

function switchAttSubtab(sub) {
  ['roles', 'sheets', 'weeks', 'parade'].forEach(function(s) {
    var p = document.getElementById('subpanel-att-' + s);
    var b = document.getElementById('subtab-att-' + s);
    if (p) p.style.display = (s === sub) ? 'block' : 'none';
    if (b) b.classList.toggle('active-subtab', s === sub);
  });
  if (sub === 'roles')  renderAttRoles();
  if (sub === 'sheets' && typeof window.loadAttSheetConfig === 'function') window.loadAttSheetConfig();
  if (sub === 'weeks')  renderAttWeeksAdmin();
  if (sub === 'parade') renderAttParadeAdmin();
}

// ── Admin: Roles & Section Assignments ──────────────────────────────────────

async function renderAttRoles() {
  var c = document.getElementById('adm-att-roles-list');
  if (!c) return;
  c.innerHTML = '<div style="text-align:center;padding:20px;"><span class="spinner"></span></div>';
  var client = (typeof supa !== 'undefined' ? supa : (typeof window !== 'undefined' ? window.supa : null));
  if (!client) return;

  try {
    var members  = await client.get('bb_members?select=ic,name,rank,squad&order=name.asc') || [];
    var roles    = await attGetConfig(ATT_ROLES_KEY) || {};
    var sections = await attGetConfig(ATT_SECTIONS_KEY) || {};
    var q = ((document.getElementById('adm-att-search') || {}).value || '').toLowerCase();
    var fSquad   = ((document.getElementById('adm-att-filter-squad')   || {}).value || '');
    var fSection = ((document.getElementById('adm-att-filter-section') || {}).value || '');

    var list = members.filter(function(m) {
      if (q && m.name.toLowerCase().indexOf(q) === -1 && (m.ic || '').indexOf(q) === -1) return false;
      if (fSquad && (m.squad || '') !== fSquad) return false;
      if (fSection && (sections[m.ic] || '') !== fSection) return false;
      return true;
    });

    if (!list.length) {
      c.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:13px;">No members found.</div>';
      return;
    }

    c.innerHTML = list.map(function(m) {
      var info = roles[m.ic] || { role: '', group: '' };
      var sec  = sections[m.ic] || '';
      var sid  = (m.ic || '').replace(/[^a-z0-9]/gi, '_');
      return '<div style="background:var(--bg-card);border:1px solid var(--border-card);border-radius:12px;padding:14px 16px;margin-bottom:8px;">'
        + '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">'
        + '<div style="flex:1;min-width:110px;">'
        +   '<div style="font-family:\'Oswald\',sans-serif;font-size:15px;font-weight:600;color:var(--text-primary);">' + m.name + '</div>'
        +   '<div style="font-size:11px;color:var(--text-secondary);">' + (m.rank || '') + (m.squad ? ' · ' + m.squad + ' Platoon' : '') + '</div>'
        + '</div>'
        // Band Section assignment
        + '<select id="attsec-' + sid + '" onchange="setAttSection(\'' + m.ic + '\',this.value)"'
        +   ' style="background:var(--bg-input);color:var(--text-primary);border:1.5px solid var(--border-card);border-radius:8px;padding:7px 9px;font-size:12px;" title="Band Section">'
        +   '<option value=""' + (!sec ? ' selected' : '') + '>No Section</option>'
        +   BAND_SECTIONS.map(function(s) { return '<option value="' + s + '"' + (sec === s ? ' selected' : '') + '>' + s + '</option>'; }).join('')
        + '</select>'
        // Attendance Role assignment
        + '<select id="attrol-' + sid + '" onchange="setAttRole(\'' + m.ic + '\',this.value,document.getElementById(\'attgrp-' + sid + '\').value)"'
        +   ' style="background:var(--bg-input);color:var(--text-primary);border:1.5px solid var(--border-card);border-radius:8px;padding:7px 9px;font-size:12px;" title="Attendance Role">'
        +   '<option value=""' + (!info.role ? ' selected' : '') + '>No Role</option>'
        +   '<option value="section_leader"' + (info.role === 'section_leader' ? ' selected' : '') + '>Section Leader</option>'
        +   '<option value="squad_leader"'   + (info.role === 'squad_leader' ? ' selected' : '') + '>Platoon Leader</option>'
        + '</select>'
        // Group assignment: section for section leaders, platoon for platoon leaders
        + '<select id="attgrp-' + sid + '" onchange="setAttRole(\'' + m.ic + '\',document.getElementById(\'attrol-' + sid + '\').value,this.value)"'
        +   ' style="background:var(--bg-input);color:var(--text-primary);border:1.5px solid var(--border-card);border-radius:8px;padding:7px 9px;font-size:12px;" title="Section or Platoon">'
        +   (info.role === 'squad_leader'
              ? ['','Alpha','Papa','Zulu','Hotel'].map(function(v){ return '<option value="' + v + '"' + ((info.group || '') === v ? ' selected' : '') + '>' + (v || '— Platoon —') + '</option>'; }).join('')
              : ['','Brass','Woodwind','Percussion'].map(function(v){ return '<option value="' + v + '"' + ((info.group || '') === v ? ' selected' : '') + '>' + (v || '— Section —') + '</option>'; }).join('')
            )
        + '</select>'
        + '</div></div>';
    }).join('');
  } catch (e) {
    c.innerHTML = '<div style="color:var(--red);padding:16px;">Error: ' + e.message + '</div>';
  }
}

async function setAttSection(ic, section) {
  try {
    var sections = await attGetConfig(ATT_SECTIONS_KEY) || {};
    if (!section) delete sections[ic];
    else sections[ic] = section;
    await attSaveConfig(ATT_SECTIONS_KEY, sections);
    var m = _attMembers.find(function(x) { return x.ic === ic; });
    if (m) m.section = section;
  } catch (e) {
    if (typeof alert === 'function') alert('Failed: ' + e.message);
  }
}

async function setAttRole(ic, role, group) {
  try {
    var roles = await attGetConfig(ATT_ROLES_KEY) || {};
    if (!role) delete roles[ic];
    else roles[ic] = { role: role, group: group || '' };
    await attSaveConfig(ATT_ROLES_KEY, roles);
  } catch (e) {
    if (typeof alert === 'function') alert('Failed: ' + e.message);
  }
}

// ── Admin: Weeks Management ─────────────────────────────────────────────────

async function renderAttWeeksAdmin() {
  var c = document.getElementById('adm-att-weeks-list');
  if (!c) return;
  var weeks = await attGetConfig(ATT_WEEKS_KEY) || [];
  if (!weeks.length) {
    c.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:13px;">No weeks yet.</div>';
    return;
  }
  c.innerHTML = weeks.map(function(w, i) {
    return '<div style="background:var(--bg-card);border:1px solid var(--border-card);border-radius:10px;padding:12px 16px;margin-bottom:8px;display:flex;align-items:center;gap:12px;">'
      + '<div style="flex:1;">'
      + '<div style="font-family:\'Oswald\',sans-serif;font-size:14px;font-weight:700;color:var(--text-primary);">' + w.label + '</div>'
      + '<div style="font-size:11px;color:var(--text-secondary);">' + (w.date || 'No date') + (w.colIndex ? ' · Col group: ' + w.colIndex : '') + '</div>'
      + '</div>'
      + '<button onclick="deleteAttWeek(' + i + ')" title="Delete Week" style="background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);color:var(--red);padding:6px 12px;border-radius:8px;cursor:pointer;font-size:12px;display:inline-flex;align-items:center;justify-content:center;"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>'
      + '</div>';
  }).join('');
}

async function addAttWeek() {
  var label = ((document.getElementById('att-week-label') || {}).value || '').trim();
  var date  = ((document.getElementById('att-week-date')  || {}).value || '');
  var col   = ((document.getElementById('att-week-col')   || {}).value || '').trim();
  if (!label) {
    if (typeof alert === 'function') alert('Please enter a week label.');
    return;
  }
  var weeks = await attGetConfig(ATT_WEEKS_KEY) || [];
  if (weeks.some(function(w) { return w.label === label; })) {
    if (typeof alert === 'function') alert('Label already exists.');
    return;
  }

  var fmtShort = (typeof window.fmtDateShort === 'function') ? window.fmtDateShort : function(d){ return d; };
  var fmtLong  = (typeof window.fmtDateLong === 'function') ? window.fmtDateLong : function(d){ return d; };

  weeks.push({
    label: label,
    date: date,
    dateShort: fmtShort(date),
    dateLong: fmtLong(date),
    colIndex: col
  });
  await attSaveConfig(ATT_WEEKS_KEY, weeks);
  ['att-week-label', 'att-week-date', 'att-week-col'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.value = '';
  });
  renderAttWeeksAdmin();
}

async function deleteAttWeek(idx) {
  var weeks = await attGetConfig(ATT_WEEKS_KEY) || [];
  if (!weeks[idx]) return;
  var label = weeks[idx].label;
  if (typeof confirm === 'function' && !confirm('Remove "' + label + '"?\n\nAttendance data for this week will be deleted from the portal (sheets are unaffected).')) {
    return;
  }
  weeks.splice(idx, 1);
  await attSaveConfig(ATT_WEEKS_KEY, weeks);

  var allData = await attGetConfig(ATT_DATA_KEY) || {};
  if (allData[label]) {
    delete allData[label];
    await attSaveConfig(ATT_DATA_KEY, allData);
  }

  var pCfg = await attGetConfig(ATT_PARADE_KEY) || {};
  if (pCfg[label]) {
    delete pCfg[label];
    await attSaveConfig(ATT_PARADE_KEY, pCfg);
  }
  renderAttWeeksAdmin();
}

// ── Admin: Parade & Uniform Attire Configuration ────────────────────────────

async function renderAttParadeAdmin() {
  var c = document.getElementById('adm-att-parade-list');
  if (!c) return;
  var weeks = await attGetConfig(ATT_WEEKS_KEY) || [];
  var pCfg  = await attGetConfig(ATT_PARADE_KEY) || {};
  _attParadeConfig = pCfg;
  if (!weeks.length) {
    c.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:13px;">Add weeks first.</div>';
    return;
  }
  c.innerHTML = weeks.map(function(w) {
    var cfg = pCfg[w.label] || { uniformType: '', notes: '' };
    var wid = (w.label || '').replace(/[^a-z0-9]/gi, '_');
    return '<div style="background:var(--bg-card);border:1px solid var(--border-card);border-radius:12px;padding:14px 16px;margin-bottom:10px;">'
      + '<div style="font-family:\'Oswald\',sans-serif;font-size:14px;font-weight:700;color:var(--gold);margin-bottom:10px;">'
      +   w.label + ' <span style="font-size:11px;color:var(--text-muted);font-weight:400;">' + (w.date || '') + '</span>'
      + '</div>'
      + '<div class="form-row">'
      +   '<div class="form-group"><label class="form-label" style="color:var(--text-secondary);">Uniform Type</label>'
      +     '<select id="attuni-' + wid + '" style="width:100%;background:var(--bg-input);color:var(--text-primary);border:1.5px solid var(--border-card);border-radius:8px;padding:8px 10px;font-size:13px;">'
      +       ['','Day Dress','Drill Kit','PT Kit','Casual','No Uniform'].map(function(v) {
                return '<option value="' + v + '"' + (cfg.uniformType === v ? ' selected' : '') + '>' + (v || 'Not set') + '</option>';
              }).join('')
      +     '</select>'
      +   '</div>'
      +   '<div class="form-group"><label class="form-label" style="color:var(--text-secondary);">Notes</label>'
      +     '<input type="text" id="attnote-' + wid + '" value="' + ((cfg.notes || '').replace(/"/g, '&quot;')) + '" placeholder="e.g. Boots required"'
      +     ' style="width:100%;background:var(--bg-input);color:var(--text-primary);border:1.5px solid var(--border-card);border-radius:8px;padding:8px 10px;font-size:13px;"/>'
      +   '</div>'
      + '</div>'
      + '<button onclick="saveParadeCfg(\'' + w.label + '\',\'' + wid + '\')" style="background:rgba(200,150,30,0.1);border:1px solid rgba(200,150,30,0.3);color:var(--gold);padding:7px 16px;border-radius:8px;cursor:pointer;font-family:\'Oswald\',sans-serif;font-size:13px;font-weight:700;display:inline-flex;align-items:center;gap:6px;"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg> Save</button>'
      + '</div>';
  }).join('');
}

async function saveParadeCfg(weekLabel, wid) {
  var uEl = document.getElementById('attuni-' + wid);
  var nEl = document.getElementById('attnote-' + wid);
  var pCfg = await attGetConfig(ATT_PARADE_KEY) || {};
  pCfg[weekLabel] = { uniformType: uEl ? uEl.value : '', notes: nEl ? nEl.value : '' };
  await attSaveConfig(ATT_PARADE_KEY, pCfg);
  _attParadeConfig = pCfg;
  if (typeof alert === 'function') alert('Saved for ' + weekLabel);
}

// ── Global Window Exports ───────────────────────────────────────────────────

if (typeof window !== 'undefined') {
  window.calcBandPts = calcBandPts;
  window.calcParadePts = calcParadePts;
  window.checkAttendanceTabVisibility = checkAttendanceTabVisibility;
  window.checkAttendanceAccess = checkAttendanceAccess;
  window.loadAttWeeks = loadAttWeeks;
  window.renderAttWeekChips = renderAttWeekChips;
  window.selectAttWeek = selectAttWeek;
  window.renderAttParadeInfo = renderAttParadeInfo;
  window.getFilteredMembers = getFilteredMembers;
  window.renderAttMorningList = renderAttMorningList;
  window.renderAttAfternoonList = renderAttAfternoonList;
  window.makePtBtn = makePtBtn;
  window.makeLeaveBtn = makeLeaveBtn;
  window.buildBandRow = buildBandRow;
  window.buildParadeRow = buildParadeRow;
  window.attachBandListeners = attachBandListeners;
  window.attachParadeListeners = attachParadeListeners;
  window.updateAttSummary = updateAttSummary;
  window.saveAttendance = saveAttendance;
  window.showToast = showToast;
  window.syncToSheets = syncToSheets;
  window.switchAttSubtab = switchAttSubtab;
  window.renderAttRoles = renderAttRoles;
  window.setAttSection = setAttSection;
  window.setAttRole = setAttRole;
  window.renderAttWeeksAdmin = renderAttWeeksAdmin;
  window.addAttWeek = addAttWeek;
  window.deleteAttWeek = deleteAttWeek;
  window.renderAttParadeAdmin = renderAttParadeAdmin;
  window.saveParadeCfg = saveParadeCfg;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    calcBandPts: calcBandPts,
    calcParadePts: calcParadePts,
    checkAttendanceTabVisibility: checkAttendanceTabVisibility,
    checkAttendanceAccess: checkAttendanceAccess,
    loadAttWeeks: loadAttWeeks,
    renderAttWeekChips: renderAttWeekChips,
    selectAttWeek: selectAttWeek,
    renderAttParadeInfo: renderAttParadeInfo,
    getFilteredMembers: getFilteredMembers,
    renderAttMorningList: renderAttMorningList,
    renderAttAfternoonList: renderAttAfternoonList,
    updateAttSummary: updateAttSummary,
    saveAttendance: saveAttendance,
    showToast: showToast,
    syncToSheets: syncToSheets,
    switchAttSubtab: switchAttSubtab,
    renderAttRoles: renderAttRoles,
    setAttSection: setAttSection,
    setAttRole: setAttRole,
    renderAttWeeksAdmin: renderAttWeeksAdmin,
    addAttWeek: addAttWeek,
    deleteAttWeek: deleteAttWeek,
    renderAttParadeAdmin: renderAttParadeAdmin,
    saveParadeCfg: saveParadeCfg
  };
}
