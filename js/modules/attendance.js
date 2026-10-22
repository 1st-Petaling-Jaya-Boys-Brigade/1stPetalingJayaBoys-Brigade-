/**
 * 1st Petaling Jaya Boys' Brigade Portal
 * Master Attendance & Points Breakdown Module (TSK-007)
 *
 * Connects the Company Master Sheet to the Portal:
 *   1. Reads synced attendance %, uniform inspection points, and platoon scores
 *   2. Displays a personalized performance breakdown card in the Member Tab
 *   3. Shows live Platoon Leaderboard standings and contribution metrics
 */

var MASTER_ATTENDANCE_KEY = 'bb_master_attendance';
var _masterAttendanceCache = null;

// ── Data Ingestion & Caching ────────────────────────────────────────────────

/**
 * Normalizes member name for resilient matching (case-insensitive, trims spaces, removes punctuation)
 * @param {string} name
 * @returns {string}
 */
function normalizeMemberName(name) {
  if (!name) return '';
  return String(name).toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Loads master attendance data from Supabase bb_config with local caching
 * @param {boolean} [forceRefresh=false]
 * @returns {Promise<Object|null>}
 */
async function getMasterAttendanceData(forceRefresh) {
  if (!forceRefresh && _masterAttendanceCache) {
    return _masterAttendanceCache;
  }

  // Check sessionStorage cache
  if (!forceRefresh && typeof sessionStorage !== 'undefined') {
    try {
      var cached = sessionStorage.getItem('bb_master_att_cache');
      if (cached) {
        _masterAttendanceCache = JSON.parse(cached);
        return _masterAttendanceCache;
      }
    } catch (e) {}
  }

  var client = (typeof supa !== 'undefined' ? supa : (typeof window !== 'undefined' ? window.supa : null));
  if (!client) return null;

  try {
    var rows = await client.get('bb_config?key=eq.' + MASTER_ATTENDANCE_KEY + '&select=value');
    if (rows && rows.length && rows[0].value) {
      var parsed = JSON.parse(rows[0].value);
      _masterAttendanceCache = parsed;
      if (typeof sessionStorage !== 'undefined') {
        try { sessionStorage.setItem('bb_master_att_cache', JSON.stringify(parsed)); } catch (e2) {}
      }
      return parsed;
    }
  } catch (err) {
    console.warn('getMasterAttendanceData error:', err);
  }

  return null;
}

/**
 * Retrieves the attendance & performance record for a specific member by Name
 * @param {string} memberName
 * @returns {Promise<Object|null>}
 */
async function getMemberAttendanceRecord(memberName) {
  if (!memberName) return null;
  var data = await getMasterAttendanceData();
  if (!data || !data.members) return null;

  var norm = normalizeMemberName(memberName);
  if (data.members[norm]) {
    return data.members[norm];
  }

  // Secondary fuzzy match: check if first name / last name matches
  var keys = Object.keys(data.members);
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (k.indexOf(norm) !== -1 || norm.indexOf(k) !== -1) {
      return data.members[k];
    }
  }

  return null;
}

// ── Member Tab UI: Performance & Points Breakdown Card ──────────────────────

/**
 * Main renderer: Renders the personalized attendance & points breakdown card
 * inside the Member profile tab (#member-attendance-card).
 * @param {string} [memberName]
 */
async function loadMemberAttendanceStats(memberName) {
  var container = document.getElementById('member-attendance-card');
  if (!container) return;

  var name = memberName;
  if (!name && typeof sessionGet === 'function') {
    name = sessionGet('name') || sessionGet('fullname');
  }

  // Show skeleton loading state
  container.innerHTML = 
    '<div style="text-align:center;padding:24px 16px;color:var(--text-muted);">' +
      '<div class="spinner" style="margin:0 auto 10px;"></div>' +
      '<div style="font-size:12px;font-family:\'Oswald\',sans-serif;letter-spacing:1px;text-transform:uppercase;">Syncing Master Sheet Records...</div>' +
    '</div>';

  var data = await getMasterAttendanceData();
  var record = await getMemberAttendanceRecord(name);
  var platoons = (data && data.platoons) ? data.platoons : {};

  if (!record) {
    // Clean Empty State when not yet synced or member not found
    container.innerHTML = renderEmptyAttendanceState(name, data ? data.lastSynced : null);
    return;
  }

  // Member found — Render full breakdown
  container.innerHTML = renderAttendanceBreakdownHTML(record, platoons, data ? data.lastSynced : null);
}

/**
 * HTML Builder for the populated member attendance & points breakdown
 */
function renderAttendanceBreakdownHTML(rec, platoons, lastSynced) {
  var parade = rec.paradeAttendance || { percentage: 0, presentCount: 0, totalParades: 0 };
  var band   = rec.bandAttendance   || { percentage: 0, presentCount: 0, totalSessions: 0 };
  var points = rec.points           || { uniform: 0, uniformAvg: 0, paradeAtt: 0, bandAtt: 0, total: 0 };
  var pltName = rec.platoon || 'Alpha';
  var pltInfo = platoons[pltName] || { totalPoints: 0, rank: '-' };

  // Attendance rate color badges
  function rateColor(pct) {
    if (pct >= 80) return { bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.3)', text: 'var(--green, #10b981)' };
    if (pct >= 60) return { bg: 'rgba(245,197,66,0.12)', border: 'rgba(245,197,66,0.3)', text: 'var(--brand-gold, #f5c542)' };
    return { bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.3)', text: 'var(--red, #ef4444)' };
  }

  var pColor = rateColor(parade.percentage);
  var bColor = rateColor(band.percentage);

  var syncTimeStr = 'Updated recently';
  if (lastSynced) {
    try {
      var d = new Date(lastSynced);
      syncTimeStr = d.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch(e) {}
  }

  return (
    '<!-- Header -->' +
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px;">' +
      '<div>' +
        '<div style="font-family:\'Oswald\',sans-serif;font-size:18px;font-weight:700;color:var(--text-primary);display:flex;align-items:center;gap:8px;">' +
          '<svg class="ui-icon" style="color:var(--accent);" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>' +
          'Attendance &amp; Points' +
        '</div>' +
        '<div style="font-size:11px;color:var(--text-muted);letter-spacing:0.5px;">Master Sheet Sync &middot; ' + syncTimeStr + '</div>' +
      '</div>' +
      '<button onclick="refreshMemberAttendanceStats()" style="background:var(--bg-card-subtle);border:1px solid var(--border-card);color:var(--accent);padding:5px 12px;border-radius:8px;cursor:pointer;font-family:\'Oswald\',sans-serif;font-size:11px;font-weight:700;display:inline-flex;align-items:center;gap:5px;">' +
        '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>' +
        'Refresh' +
      '</button>' +
    '</div>' +

    '<!-- 1. Hero Attendance Rate Cards -->' +
    '<div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(130px, 1fr));gap:10px;margin-bottom:14px;">' +
      '<!-- Parade Attendance -->' +
      '<div style="background:var(--bg-card-subtle);border:1px solid var(--border-card);border-radius:12px;padding:12px 14px;position:relative;overflow:hidden;">' +
        '<div style="font-size:11px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Parade Attendance</div>' +
        '<div style="display:flex;align-items:baseline;gap:6px;">' +
          '<span style="font-family:\'Oswald\',sans-serif;font-size:26px;font-weight:700;color:' + pColor.text + ';">' + parade.percentage + '%</span>' +
          '<span style="font-size:11px;color:var(--text-muted);">' + (parade.presentCount || 0) + '/' + (parade.totalParades || 0) + '</span>' +
        '</div>' +
        '<div style="margin-top:6px;height:5px;background:rgba(255,255,255,0.08);border-radius:3px;overflow:hidden;">' +
          '<div style="height:100%;width:' + Math.min(100, parade.percentage) + '%;background:' + pColor.text + ';border-radius:3px;"></div>' +
        '</div>' +
      '</div>' +

      '<!-- Band Attendance -->' +
      '<div style="background:var(--bg-card-subtle);border:1px solid var(--border-card);border-radius:12px;padding:12px 14px;position:relative;overflow:hidden;">' +
        '<div style="font-size:11px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Band Attendance</div>' +
        '<div style="display:flex;align-items:baseline;gap:6px;">' +
          '<span style="font-family:\'Oswald\',sans-serif;font-size:26px;font-weight:700;color:' + bColor.text + ';">' + (band.totalSessions > 0 ? band.percentage + '%' : 'N/A') + '</span>' +
          '<span style="font-size:11px;color:var(--text-muted);">' + (band.totalSessions > 0 ? (band.presentCount || 0) + '/' + band.totalSessions : 'Non-band') + '</span>' +
        '</div>' +
        '<div style="margin-top:6px;height:5px;background:rgba(255,255,255,0.08);border-radius:3px;overflow:hidden;">' +
          '<div style="height:100%;width:' + (band.totalSessions > 0 ? Math.min(100, band.percentage) : 0) + '%;background:' + bColor.text + ';border-radius:3px;"></div>' +
        '</div>' +
      '</div>' +
    '</div>' +

    '<!-- 2. Performance Points Breakdown Grid -->' +
    '<div style="background:var(--bg-card-subtle);border:1px solid var(--border-card);border-radius:12px;padding:14px;margin-bottom:14px;">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">' +
        '<span style="font-family:\'Oswald\',sans-serif;font-size:13px;font-weight:700;color:var(--text-primary);letter-spacing:0.5px;text-transform:uppercase;">Points Breakdown</span>' +
        '<span style="font-family:\'Oswald\',sans-serif;font-size:15px;font-weight:700;color:var(--accent);background:rgba(200,150,30,0.12);border:1px solid rgba(200,150,30,0.3);padding:2px 10px;border-radius:20px;">' +
          points.total + ' Total Pts' +
        '</span>' +
      '</div>' +

      '<div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(105px, 1fr));gap:8px;">' +
        '<!-- Uniform Points -->' +
        '<div style="background:var(--bg-card);border:1px solid var(--border-card);border-radius:10px;padding:10px;text-align:center;">' +
          '<div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px;">Uniform Pts</div>' +
          '<div style="font-family:\'Oswald\',sans-serif;font-size:18px;font-weight:700;color:var(--blue, #3b82f6);">' + points.uniform + '</div>' +
          '<div style="font-size:10px;color:var(--text-secondary);margin-top:2px;">Avg ' + points.uniformAvg + ' / 6</div>' +
        '</div>' +

        '<!-- Parade Attendance Points -->' +
        '<div style="background:var(--bg-card);border:1px solid var(--border-card);border-radius:10px;padding:10px;text-align:center;">' +
          '<div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px;">Parade Pts</div>' +
          '<div style="font-family:\'Oswald\',sans-serif;font-size:18px;font-weight:700;color:var(--green, #10b981);">' + points.paradeAtt + '</div>' +
          '<div style="font-size:10px;color:var(--text-secondary);margin-top:2px;">Parade days</div>' +
        '</div>' +

        '<!-- Band Points -->' +
        '<div style="background:var(--bg-card);border:1px solid var(--border-card);border-radius:10px;padding:10px;text-align:center;">' +
          '<div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px;">Band Pts</div>' +
          '<div style="font-family:\'Oswald\',sans-serif;font-size:18px;font-weight:700;color:var(--accent);">' + points.bandAtt + '</div>' +
          '<div style="font-size:10px;color:var(--text-secondary);margin-top:2px;">Morning practices</div>' +
        '</div>' +
      '</div>' +
    '</div>' +

    '<!-- 3. Platoon Standings & Member Contribution -->' +
    '<div style="background:var(--bg-card-subtle);border:1px solid var(--border-card);border-radius:12px;padding:14px;margin-bottom:6px;">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">' +
        '<div style="font-family:\'Oswald\',sans-serif;font-size:13px;font-weight:700;color:var(--text-primary);letter-spacing:0.5px;text-transform:uppercase;display:flex;align-items:center;gap:6px;">' +
          '<svg class="ui-icon-sm" style="color:var(--accent);" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>' +
          pltName + ' Platoon Standing' +
        '</div>' +
        '<div style="font-family:\'Oswald\',sans-serif;font-size:12px;font-weight:700;color:var(--accent);">' +
          'Rank #' + (pltInfo.rank || '-') + ' (' + (pltInfo.totalPoints || 0) + ' pts)' +
        '</div>' +
      '</div>' +
      '<div style="font-size:11px;color:var(--text-secondary);line-height:1.5;">' +
        'Your contribution: <strong>' + points.total + ' pts</strong> towards ' + pltName + ' Platoon\'s total score in the company leaderboard.' +
      '</div>' +
    '</div>'
  );
}

/**
 * Clean Empty State when member data has not yet synced from the Google Sheet
 */
function renderEmptyAttendanceState(name, lastSynced) {
  var syncText = lastSynced ? 'Last sheet sync: ' + new Date(lastSynced).toLocaleDateString() : 'Sheet sync pending';
  return (
    '<div style="padding:20px 16px;text-align:center;">' +
      '<div style="margin:0 auto 12px;width:48px;height:48px;border-radius:50%;background:rgba(200,150,30,0.1);display:flex;align-items:center;justify-content:center;color:var(--accent);border:1px solid rgba(200,150,30,0.25);">' +
        '<svg class="ui-icon-lg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>' +
      '</div>' +
      '<div style="font-family:\'Oswald\',sans-serif;font-size:16px;font-weight:700;color:var(--text-primary);margin-bottom:4px;">' +
        'Attendance &amp; Points Overview' +
      '</div>' +
      '<div style="font-size:12px;color:var(--text-secondary);max-width:360px;margin:0 auto 14px;line-height:1.6;">' +
        (name ? 'Records for <strong>' + name + '</strong> will appear here' : 'Your performance stats will appear here') +
        ' once synced from the Company Master Attendance Sheet.' +
      '</div>' +
      '<div style="display:inline-flex;gap:8px;align-items:center;">' +
        '<button onclick="refreshMemberAttendanceStats()" style="background:var(--bg-card-subtle);border:1px solid var(--border-card);color:var(--accent);padding:7px 16px;border-radius:8px;cursor:pointer;font-family:\'Oswald\',sans-serif;font-size:12px;font-weight:700;display:inline-flex;align-items:center;gap:6px;">' +
          '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>' +
          'Check Again' +
        '</button>' +
      '</div>' +
      '<div style="font-size:10px;color:var(--text-muted);margin-top:10px;">' + syncText + '</div>' +
    '</div>'
  );
}

/**
 * Interactive helper: Triggers a fresh reload of attendance stats
 */
async function refreshMemberAttendanceStats() {
  _masterAttendanceCache = null;
  if (typeof sessionStorage !== 'undefined') {
    try { sessionStorage.removeItem('bb_master_att_cache'); } catch (e) {}
  }
  await loadMemberAttendanceStats();
}

// ── Admin Subtab: Master Sheet Ingestion Management ─────────────────────────

/**
 * Renders the Master Sheet status, live sync trigger, and copyable Apps Script
 * in Admin Console > Attendance & Master Sheet.
 */
async function renderAdminMasterSheetPanel() {
  var container = document.getElementById('adm-master-sheet-panel');
  if (!container) return;

  var data = await getMasterAttendanceData(true);
  var cfg  = (typeof window.loadMasterSheetConfig === 'function') ? await window.loadMasterSheetConfig() : {};

  var memberCount = data && data.totalMembers ? data.totalMembers : (data && data.members ? Object.keys(data.members).length : 0);
  var syncDate = data && data.lastSynced ? new Date(data.lastSynced).toLocaleString() : 'Never synced';
  var sheetName = data && data.sheetTitle ? data.sheetTitle : 'Google Master Sheet';

  var platoons = data && data.platoons ? data.platoons : {};
  var sortedPlatoons = ['Alpha', 'Papa', 'Zulu', 'Hotel'].sort(function(a, b) {
    var pA = platoons[a] ? platoons[a].totalPoints : 0;
    var pB = platoons[b] ? platoons[b].totalPoints : 0;
    return pB - pA;
  });

  var supaUrl = (typeof SUPA_URL !== 'undefined') ? SUPA_URL : (typeof window.SUPA_URL !== 'undefined' ? window.SUPA_URL : 'YOUR_SUPABASE_PROJECT_URL');
  var supaKey = (typeof SUPA_KEY !== 'undefined') ? SUPA_KEY : (typeof window.SUPA_KEY !== 'undefined' ? window.SUPA_KEY : 'YOUR_SUPABASE_ANON_KEY');
  var scriptCode = (typeof window.getGoogleAppsScriptTemplate === 'function') 
    ? window.getGoogleAppsScriptTemplate(supaUrl, supaKey) 
    : '// Copy from js/api/sheets.js';

  container.innerHTML =
    '<!-- Sync Status Card -->' +
    '<div style="background:var(--bg-card);border:1px solid var(--border-card);border-radius:12px;padding:16px;margin-bottom:14px;box-shadow:var(--shadow-card);">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px;">' +
        '<div style="display:flex;align-items:center;gap:10px;">' +
          '<div style="width:38px;height:38px;border-radius:50%;background:rgba(16,185,129,0.12);border:1px solid rgba(16,185,129,0.3);color:var(--green);display:flex;align-items:center;justify-content:center;">' +
            '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>' +
          '</div>' +
          '<div>' +
            '<div style="font-family:\'Oswald\',sans-serif;font-size:16px;font-weight:700;color:var(--text-primary);">' + sheetName + '</div>' +
            '<div style="font-size:11px;color:var(--text-muted);">Last Synced: ' + syncDate + '</div>' +
          '</div>' +
        '</div>' +
        '<button onclick="triggerMasterSheetFetch()" id="btn-adm-sync-sheet" style="background:var(--accent);color:#fff;border:none;padding:7px 16px;border-radius:8px;cursor:pointer;font-family:\'Oswald\',sans-serif;font-size:12px;font-weight:700;display:inline-flex;align-items:center;gap:6px;">' +
          '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>' +
          'Sync Now' +
        '</button>' +
      '</div>' +

      '<!-- Platoon Standings Summary -->' +
      '<div style="font-size:11px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">' +
        'Platoon Leaderboard (' + memberCount + ' Synced Members)' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(110px, 1fr));gap:8px;">' +
        sortedPlatoons.map(function(plt) {
          var pInfo = platoons[plt] || { totalPoints: 0, memberCount: 0, rank: '-' };
          return (
            '<div style="background:var(--bg-card-subtle);border:1px solid var(--border-card);border-radius:8px;padding:8px 10px;">' +
              '<div style="display:flex;justify-content:space-between;align-items:center;">' +
                '<span style="font-size:12px;font-weight:700;color:var(--text-primary);">' + plt + '</span>' +
                '<span style="font-size:10px;font-weight:700;color:var(--accent);">#' + (pInfo.rank || '-') + '</span>' +
              '</div>' +
              '<div style="font-family:\'Oswald\',sans-serif;font-size:16px;font-weight:700;color:var(--green);margin-top:2px;">' +
                (pInfo.totalPoints || 0) + ' pts' +
              '</div>' +
              '<div style="font-size:10px;color:var(--text-muted);">' + (pInfo.memberCount || 0) + ' boys</div>' +
            '</div>'
          );
        }).join('') +
      '</div>' +
    '</div>' +

    '<!-- Configuration & Apps Script Instructions -->' +
    '<div style="background:var(--bg-card);border:1px solid var(--border-card);border-radius:12px;padding:16px;box-shadow:var(--shadow-card);">' +
      '<div style="font-family:\'Oswald\',sans-serif;font-size:15px;font-weight:700;color:var(--text-primary);margin-bottom:6px;display:flex;align-items:center;gap:6px;">' +
        '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' +
        'Google Apps Script Setup (1-Time Setup)' +
      '</div>' +
      '<div style="font-size:12px;color:var(--text-secondary);line-height:1.6;margin-bottom:12px;">' +
        '1. Open your <strong>Master Attendance Google Sheet</strong>.<br>' +
        '2. Click <strong>Extensions &gt; Apps Script</strong>.<br>' +
        '3. Replace any existing code with the snippet below and click <strong>Save</strong>.<br>' +
        '4. Reload your Google Sheet. You will see a new menu: <strong>🎖️ BB Portal &gt; 📤 Sync Attendance to Portal Now</strong>.' +
      '</div>' +

      '<div style="display:flex;justify-content:flex-end;margin-bottom:6px;">' +
        '<button onclick="copyAppsScriptSnippet()" id="btn-copy-gas" style="background:var(--bg-card-subtle);border:1px solid var(--border-card);color:var(--accent);padding:4px 10px;border-radius:6px;cursor:pointer;font-size:11px;font-weight:700;display:inline-flex;align-items:center;gap:4px;">' +
          '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>' +
          'Copy Code' +
        '</button>' +
      '</div>' +

      '<pre id="gas-snippet-pre" style="background:var(--bg-card-subtle);border:1px solid var(--border-card);border-radius:8px;padding:12px;font-size:11px;color:#66bb6a;font-family:monospace;max-height:220px;overflow-y:auto;white-space:pre-wrap;line-height:1.5;margin:0;">' +
        escapeHtml(scriptCode) +
      '</pre>' +
    '</div>';
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function copyAppsScriptSnippet() {
  var pre = document.getElementById('gas-snippet-pre');
  if (!pre) return;
  try {
    await navigator.clipboard.writeText(pre.textContent);
    var btn = document.getElementById('btn-copy-gas');
    if (btn) {
      btn.innerHTML = '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Copied!';
      setTimeout(function() {
        btn.innerHTML = '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy Code';
      }, 2500);
    }
  } catch(e) {
    alert('Please select and copy the code manually.');
  }
}

async function triggerMasterSheetFetch() {
  var btn = document.getElementById('btn-adm-sync-sheet');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" style="width:12px;height:12px;"></span> Syncing...';
  }

  try {
    if (typeof window.fetchMasterAttendanceFromGAS === 'function') {
      await window.fetchMasterAttendanceFromGAS();
    }
    _masterAttendanceCache = null;
    await renderAdminMasterSheetPanel();
    alert('Master Sheet data synced successfully!');
  } catch (err) {
    alert('Sync note: ' + err.message + '\n\nTip: You can click "🎖️ BB Portal > 📤 Sync Attendance to Portal Now" inside your Google Sheet at any time to push updates instantly.');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg> Sync Now';
    }
  }
}

// ── Company Leaderboard Renderer ───────────────────────────────────────────

/**
 * Renders the Company Platoon Leaderboard on page-attendance
 */
async function renderCompanyLeaderboard() {
  var c = document.getElementById('company-platoon-leaderboard');
  if (!c) return;

  var data = await getMasterAttendanceData();
  var platoons = (data && data.platoons) ? data.platoons : {};
  var sorted = ['Alpha', 'Papa', 'Zulu', 'Hotel'].sort(function(a, b) {
    var pA = platoons[a] ? platoons[a].totalPoints : 0;
    var pB = platoons[b] ? platoons[b].totalPoints : 0;
    return pB - pA;
  });

  var maxPts = 1;
  sorted.forEach(function(p) {
    var pts = platoons[p] ? platoons[p].totalPoints : 0;
    if (pts > maxPts) maxPts = pts;
  });

  c.innerHTML = sorted.map(function(pltName, idx) {
    var pInfo = platoons[pltName] || { totalPoints: 0, memberCount: 0, rank: idx + 1 };
    var pts = pInfo.totalPoints || 0;
    var pct = Math.min(100, Math.round((pts / maxPts) * 100));
    var rankColors = ['#ffd700', '#c0c0c0', '#cd7f32', 'var(--text-muted)'];
    var rankColor = rankColors[idx] || 'var(--text-muted)';

    return (
      '<div style="background:var(--bg-card-subtle);border:1px solid var(--border-card);border-radius:10px;padding:12px 14px;margin-bottom:10px;">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">' +
          '<div style="display:flex;align-items:center;gap:10px;">' +
            '<div style="font-family:\'Oswald\',sans-serif;font-size:16px;font-weight:700;color:' + rankColor + ';width:24px;text-align:center;">#' + (idx + 1) + '</div>' +
            '<div>' +
              '<div style="font-family:\'Oswald\',sans-serif;font-size:15px;font-weight:700;color:var(--text-primary);">' + pltName + ' Platoon</div>' +
              '<div style="font-size:11px;color:var(--text-secondary);">' + (pInfo.memberCount || 0) + ' active members</div>' +
            '</div>' +
          '</div>' +
          '<div style="text-align:right;">' +
            '<div style="font-family:\'Oswald\',sans-serif;font-size:18px;font-weight:700;color:var(--green);">' + pts + ' pts</div>' +
          '</div>' +
        '</div>' +
        '<div style="height:6px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden;">' +
          '<div style="height:100%;width:' + pct + '%;background:var(--accent);border-radius:3px;"></div>' +
        '</div>' +
      '</div>'
    );
  }).join('');
}

// ── Global Window Exports ───────────────────────────────────────────────────

if (typeof window !== 'undefined') {
  window.normalizeMemberName = normalizeMemberName;
  window.getMasterAttendanceData = getMasterAttendanceData;
  window.getMemberAttendanceRecord = getMemberAttendanceRecord;
  window.loadMemberAttendanceStats = loadMemberAttendanceStats;
  window.refreshMemberAttendanceStats = refreshMemberAttendanceStats;
  window.renderCompanyLeaderboard = renderCompanyLeaderboard;
  window.renderAdminMasterSheetPanel = renderAdminMasterSheetPanel;
  window.triggerMasterSheetFetch = triggerMasterSheetFetch;
  window.copyAppsScriptSnippet = copyAppsScriptSnippet;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    normalizeMemberName: normalizeMemberName,
    getMasterAttendanceData: getMasterAttendanceData,
    getMemberAttendanceRecord: getMemberAttendanceRecord,
    loadMemberAttendanceStats: loadMemberAttendanceStats,
    refreshMemberAttendanceStats: refreshMemberAttendanceStats,
    renderCompanyLeaderboard: renderCompanyLeaderboard,
    renderAdminMasterSheetPanel: renderAdminMasterSheetPanel,
    triggerMasterSheetFetch: triggerMasterSheetFetch
  };
}
