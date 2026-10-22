/**
 * 1st Petaling Jaya Boys' Brigade Portal
 * Master Sheet Ingestion & Google Sheets API Client (TSK-007)
 *
 * Handles communication with the Google Master Attendance Spreadsheet,
 * configuration persistence in Supabase, and provides the Apps Script
 * integration template for automated company sync.
 */

var MASTER_SHEET_CONFIG_KEY = 'bb_master_sheet_config';
var MASTER_ATTENDANCE_KEY   = 'bb_master_attendance';

// ── Configuration Persistence ───────────────────────────────────────────────

/**
 * Load Google Master Sheet connection configuration from Supabase bb_config
 * @returns {Promise<{sheetId: string, scriptUrl: string, autoSync: boolean}>}
 */
async function loadMasterSheetConfig() {
  var client = (typeof supa !== 'undefined' ? supa : (typeof window !== 'undefined' ? window.supa : null));
  var cfg = { sheetId: '', scriptUrl: '', autoSync: true };
  if (client) {
    try {
      var r = await client.get('bb_config?key=eq.' + MASTER_SHEET_CONFIG_KEY + '&select=value');
      if (r && r.length) {
        var parsed = JSON.parse(r[0].value || '{}');
        cfg = Object.assign(cfg, parsed);
      }
    } catch (e) {
      console.warn('loadMasterSheetConfig error:', e);
    }
  }

  // Populate admin UI fields if present
  if (typeof document !== 'undefined') {
    var sid = document.getElementById('master-sheet-id-input');
    var url = document.getElementById('master-script-url-input');
    if (sid) sid.value = cfg.sheetId || '';
    if (url) url.value = cfg.scriptUrl || '';
  }

  return cfg;
}

/**
 * Save Google Master Sheet connection configuration to Supabase bb_config
 * @param {Object} [cfgOverride]
 * @returns {Promise<void>}
 */
async function saveMasterSheetConfig(cfgOverride) {
  var sid = '';
  var url = '';
  if (typeof document !== 'undefined') {
    sid = ((document.getElementById('master-sheet-id-input') || {}).value || '').trim();
    url = ((document.getElementById('master-script-url-input') || {}).value || '').trim();
  }

  var cfg = cfgOverride || { sheetId: sid, scriptUrl: url, lastUpdated: new Date().toISOString() };
  var client = (typeof supa !== 'undefined' ? supa : (typeof window !== 'undefined' ? window.supa : null));
  if (client) {
    try {
      await client.req('POST', 'bb_config?on_conflict=key', { key: MASTER_SHEET_CONFIG_KEY, value: JSON.stringify(cfg) });
    } catch (e) {
      try {
        await client.patch('bb_config?key=eq.' + MASTER_SHEET_CONFIG_KEY, { value: JSON.stringify(cfg) });
      } catch (e2) {
        console.error('saveMasterSheetConfig error:', e2);
      }
    }
  }

  if (typeof alert === 'function') {
    alert('Master Sheet configuration saved!');
  }
}

// ── Ingestion & Data Fetching ───────────────────────────────────────────────

/**
 * Fetch attendance & performance data directly from a deployed Google Apps Script Web App (doGet)
 * @param {string} [scriptUrl]
 * @returns {Promise<Object>}
 */
async function fetchMasterAttendanceFromGAS(scriptUrl) {
  if (!scriptUrl) {
    var cfg = await loadMasterSheetConfig();
    scriptUrl = cfg.scriptUrl;
  }
  if (!scriptUrl) {
    throw new Error('Google Apps Script Web App URL is not configured.');
  }

  var res = await fetch(scriptUrl + (scriptUrl.indexOf('?') === -1 ? '?action=getAttendance' : '&action=getAttendance'), {
    method: 'GET',
    headers: { 'Accept': 'application/json' }
  });

  if (!res.ok) {
    throw new Error('Failed to fetch from Google Apps Script (HTTP ' + res.status + ')');
  }

  var data = await res.json();

  // Cache latest fetched data into Supabase bb_config for fast subsequent loading
  var client = (typeof supa !== 'undefined' ? supa : (typeof window !== 'undefined' ? window.supa : null));
  if (client && data) {
    try {
      await client.req('POST', 'bb_config?on_conflict=key', { key: MASTER_ATTENDANCE_KEY, value: JSON.stringify(data) });
    } catch (e) {
      console.warn('Failed to cache attendance in Supabase:', e);
    }
  }

  return data;
}

// ── Google Apps Script Template Generator ───────────────────────────────────

/**
 * Generates the Google Apps Script code for the Master Attendance Google Sheet.
 * Includes custom menu 'BB Portal', auto-detection of Master Summary columns,
 * platoon calculations, and direct Supabase sync.
 * @param {string} supaUrl
 * @param {string} supaKey
 * @returns {string}
 */
function getGoogleAppsScriptTemplate(supaUrl, supaKey) {
  var url = supaUrl || 'YOUR_SUPABASE_PROJECT_URL';
  var key = supaKey || 'YOUR_SUPABASE_ANON_KEY';

  return `// ══════════════════════════════════════════════════════════════════════════════
// 1st Petaling Jaya Boys' Brigade — Master Attendance Sheet Ingestion Script
// 
// Paste this code into: Google Sheets > Extensions > Apps Script
// Sets up a custom menu 'BB Portal' in your Master Spreadsheet.
// Automatically syncs Attendance %, Uniform Points & Platoon Scores to the Web Portal!
// ══════════════════════════════════════════════════════════════════════════════

var PORTAL_SUPABASE_URL = '${url}';
var PORTAL_SUPABASE_KEY = '${key}';
var MASTER_SUMMARY_TAB  = 'Master Summary'; // Change if your summary tab has a different name

/**
 * Adds custom menu when the Google Sheet opens
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('BB Portal')
    .addItem('Sync Attendance to Portal Now', 'syncMasterAttendanceToPortal')
    .addItem('Test Portal Connection', 'testPortalConnection')
    .addToUi();
}

/**
 * Main Sync Function: Reads Master Summary tab and uploads records to Portal
 */
function syncMasterAttendanceToPortal() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(MASTER_SUMMARY_TAB);
  
  if (!sheet) {
    // Try to find any sheet containing 'summary' or 'master'
    var sheets = ss.getSheets();
    for (var i = 0; i < sheets.length; i++) {
      var sname = sheets[i].getName().toLowerCase();
      if (sname.indexOf('summary') !== -1 || sname.indexOf('master') !== -1) {
        sheet = sheets[i];
        break;
      }
    }
  }
  
  if (!sheet) {
    SpreadsheetApp.getUi().alert('Error: Could not find tab "' + MASTER_SUMMARY_TAB + '". Please verify the tab name in Apps Script.');
    return;
  }

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) {
    SpreadsheetApp.getUi().alert('The sheet has no rows to sync.');
    return;
  }

  // 1. Map Header Column Positions
  var headers = data[0].map(function(h) { return String(h).trim().toLowerCase(); });
  var colMap = findColumnIndices(headers);

  if (colMap.name === -1) {
    SpreadsheetApp.getUi().alert('Error: Could not locate a "Member Name" or "Name" column in Row 1.');
    return;
  }

  // 2. Process Member Rows
  var members = {};
  var platoons = {
    'Alpha': { totalPoints: 0, memberCount: 0 },
    'Papa':  { totalPoints: 0, memberCount: 0 },
    'Zulu':  { totalPoints: 0, memberCount: 0 },
    'Hotel': { totalPoints: 0, memberCount: 0 }
  };

  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    var rawName = String(row[colMap.name] || '').trim();
    if (!rawName) continue;

    var normKey = normalizeMemberKey(rawName);
    var platoon = standardizePlatoon(String(row[colMap.platoon] || ''));
    var section = String(row[colMap.section] || 'Senior').trim();

    // Attendance % and counts
    var paradeAttPct = parsePercentage(row[colMap.paradeAttPct]);
    var paradeAttCount = parseInt(row[colMap.paradeAttCount], 10) || 0;
    var paradeTotal = parseInt(row[colMap.paradeTotal], 10) || 0;

    var bandAttPct = parsePercentage(row[colMap.bandAttPct]);
    var bandAttCount = parseInt(row[colMap.bandAttCount], 10) || 0;
    var bandTotal = parseInt(row[colMap.bandTotal], 10) || 0;

    // Points
    var uniformPts = parseFloat(row[colMap.uniformPts]) || 0;
    var uniformAvg = parseFloat(row[colMap.uniformAvg]) || (paradeAttCount > 0 ? (uniformPts / paradeAttCount) : 0);
    var paradePts  = parseFloat(row[colMap.paradePts])  || (paradeAttCount * 2);
    var bandPts    = parseFloat(row[colMap.bandPts])    || (bandAttCount * 2);
    var totalPts   = parseFloat(row[colMap.totalPts])   || (uniformPts + paradePts + bandPts);

    // Aggregate into Platoon totals
    if (platoons[platoon]) {
      platoons[platoon].totalPoints += totalPts;
      platoons[platoon].memberCount += 1;
    }

    members[normKey] = {
      name: rawName,
      platoon: platoon,
      section: section,
      paradeAttendance: {
        percentage: paradeAttPct,
        presentCount: paradeAttCount,
        totalParades: paradeTotal
      },
      bandAttendance: {
        percentage: bandAttPct,
        presentCount: bandAttCount,
        totalSessions: bandTotal
      },
      points: {
        uniform: Math.round(uniformPts * 10) / 10,
        uniformAvg: Math.round(uniformAvg * 10) / 10,
        paradeAtt: Math.round(paradePts),
        bandAtt: Math.round(bandPts),
        total: Math.round(totalPts)
      },
      lastUpdated: new Date().toISOString()
    };
  }

  // 3. Compute Platoon Rankings
  var sortedPlatoons = Object.keys(platoons).sort(function(a, b) {
    return platoons[b].totalPoints - platoons[a].totalPoints;
  });

  sortedPlatoons.forEach(function(pltName, rankIdx) {
    platoons[pltName].rank = rankIdx + 1;
  });

  var payload = {
    lastSynced: new Date().toISOString(),
    sheetTitle: ss.getName(),
    tabName: sheet.getName(),
    totalMembers: Object.keys(members).length,
    platoons: platoons,
    members: members
  };

  // 4. POST payload to Supabase
  var postUrl = PORTAL_SUPABASE_URL + '/rest/v1/bb_config?on_conflict=key';
  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'apikey': PORTAL_SUPABASE_KEY,
      'Authorization': 'Bearer ' + PORTAL_SUPABASE_KEY,
      'Prefer': 'resolution=merge-duplicates'
    },
    payload: JSON.stringify({
      key: 'bb_master_attendance',
      value: JSON.stringify(payload)
    }),
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch(postUrl, options);
  var code = response.getResponseCode();

  if (code >= 200 && code < 300) {
    SpreadsheetApp.getUi().alert('Success: Synced ' + Object.keys(members).length + ' members & platoon standings to the 1st PJ BB Portal.');
  } else {
    SpreadsheetApp.getUi().alert('Sync Failed (HTTP ' + code + '):\\n' + response.getContentText());
  }
}

/**
 * Test portal connection
 */
function testPortalConnection() {
  try {
    var res = UrlFetchApp.fetch(PORTAL_SUPABASE_URL + '/rest/v1/bb_config?key=eq.bb_master_attendance&select=key', {
      headers: { 'apikey': PORTAL_SUPABASE_KEY, 'Authorization': 'Bearer ' + PORTAL_SUPABASE_KEY },
      muteHttpExceptions: true
    });
    if (res.getResponseCode() === 200) {
      SpreadsheetApp.getUi().alert('Connection Successful: Google Sheets is connected to the 1st PJ BB Portal database.');
    } else {
      SpreadsheetApp.getUi().alert('Connection returned code ' + res.getResponseCode() + '. Check Supabase URL & Key.');
    }
  } catch(e) {
    SpreadsheetApp.getUi().alert('Connection failed: ' + e.message);
  }
}

// ── Web App GET Endpoint (Allows Portal to fetch data anytime) ──────────────

function doGet(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(MASTER_SUMMARY_TAB);
  if (!sheet) {
    return ContentService.createTextOutput(JSON.stringify({ error: 'Summary tab not found' }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  // Runs sync and returns JSON output
  syncMasterAttendanceToPortal();
  return ContentService.createTextOutput(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Internal Parsing Utilities ──────────────────────────────────────────────

function findColumnIndices(headers) {
  function matchCol(patterns) {
    for (var i = 0; i < headers.length; i++) {
      for (var p = 0; p < patterns.length; p++) {
        if (headers[i].indexOf(patterns[p]) !== -1) return i;
      }
    }
    return -1;
  }

  return {
    name:           matchCol(['name', 'member', 'nama', 'member name']),
    platoon:        matchCol(['platoon', 'squad', 'group']),
    section:        matchCol(['section', 'division']),
    paradeAttPct:   matchCol(['parade %', 'parade att %', 'att %', 'attendance %', 'overall att']),
    paradeAttCount: matchCol(['parade present', 'parade count', 'parades attended', 'attended']),
    paradeTotal:    matchCol(['total parades', 'parade total', 'total weeks']),
    bandAttPct:     matchCol(['band %', 'band att %', 'band attendance %']),
    bandAttCount:   matchCol(['band present', 'band count', 'band attended']),
    bandTotal:      matchCol(['total band', 'band total']),
    uniformPts:     matchCol(['uniform pts', 'uniform points', 'total uniform', 'uniform']),
    uniformAvg:     matchCol(['uniform avg', 'avg uniform']),
    paradePts:      matchCol(['parade pts', 'parade points']),
    bandPts:        matchCol(['band pts', 'band points']),
    totalPts:       matchCol(['total pts', 'total points', 'total score', 'points'])
  };
}

function normalizeMemberKey(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function standardizePlatoon(val) {
  var s = String(val || '').toLowerCase();
  if (s.indexOf('alpha') !== -1) return 'Alpha';
  if (s.indexOf('papa')  !== -1) return 'Papa';
  if (s.indexOf('zulu')  !== -1) return 'Zulu';
  if (s.indexOf('hotel') !== -1) return 'Hotel';
  return 'Alpha'; // Default fallback
}

function parsePercentage(val) {
  if (typeof val === 'number') {
    return val <= 1.0 ? Math.round(val * 1000) / 10 : Math.round(val * 10) / 10;
  }
  var str = String(val || '').replace('%', '').trim();
  var num = parseFloat(str) || 0;
  return Math.round(num * 10) / 10;
}
`;
}

// ── Global Exports ──────────────────────────────────────────────────────────

if (typeof window !== 'undefined') {
  window.loadMasterSheetConfig = loadMasterSheetConfig;
  window.saveMasterSheetConfig = saveMasterSheetConfig;
  window.fetchMasterAttendanceFromGAS = fetchMasterAttendanceFromGAS;
  window.getGoogleAppsScriptTemplate = getGoogleAppsScriptTemplate;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    loadMasterSheetConfig: loadMasterSheetConfig,
    saveMasterSheetConfig: saveMasterSheetConfig,
    fetchMasterAttendanceFromGAS: fetchMasterAttendanceFromGAS,
    getGoogleAppsScriptTemplate: getGoogleAppsScriptTemplate
  };
}
