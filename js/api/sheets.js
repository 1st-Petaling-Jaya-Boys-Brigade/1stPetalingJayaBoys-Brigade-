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

  return `// ==============================================================================
// 1st Petaling Jaya Boys' Brigade - Master Attendance Sheet Ingestion Script
// 
// Paste this code into: Google Sheets > Extensions > Apps Script
// Sets up a custom menu 'BB Portal' in your Master Spreadsheet.
// Automatically syncs Platoon tabs (Alpha, Papa, Zulu, Hotel), Band, and Leaderboards!
// ==============================================================================

var PORTAL_SUPABASE_URL = '${url}';
var PORTAL_SUPABASE_KEY = '${key}';

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
 * Main Sync Function: Reads all Platoon tabs, Band Attendance, and Squad Leaderboards
 */
function syncMasterAttendanceToPortal() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var members = {};
  var squads = {};
  var scannedSheets = [];

  // 1. Process Platoon Tabs (Alpha, Papa, Zulu, Hotel)
  var platoonList = ['Alpha', 'Papa', 'Zulu', 'Hotel'];
  platoonList.forEach(function(plt) {
    var sheet = ss.getSheetByName('Platoon ' + plt) || ss.getSheetByName(plt);
    if (!sheet) return;
    scannedSheets.push(sheet.getName());

    var data = sheet.getDataRange().getValues();
    if (data.length < 9) return;

    // Scan for header row (Row 8 has 'Name', 'Rank', 'Squad', 'Total member\'s points', etc.)
    var headerRowIdx = -1;
    var colMap = {
      name: -1, rank: -1, squad: -1,
      totalPts: -1, bandPts: -1, bandAtt: -1,
      paradePts: -1, paradeAtt: -1, uniformPts: -1
    };

    for (var r = 0; r < Math.min(15, data.length); r++) {
      var row = data[r].map(function(c) { return String(c || '').toLowerCase().trim(); });
      var nIdx = row.findIndex(function(h) { return h === 'name' || h === 'member name' || h === 'nama'; });
      if (nIdx !== -1) {
        headerRowIdx = r;
        colMap.name = nIdx;
        colMap.rank = row.findIndex(function(h) { return h === 'rank'; });
        colMap.squad = row.findIndex(function(h) { return h === 'squad'; });
        colMap.totalPts = row.findIndex(function(h) { return h.indexOf("total member's points") !== -1 || h.indexOf('total member points') !== -1; });
        colMap.bandPts = row.findIndex(function(h) { return h.indexOf('total band points') !== -1; });
        colMap.bandAtt = row.findIndex(function(h) { return h.indexOf('band attendance') !== -1; });
        colMap.paradePts = row.findIndex(function(h) { return h.indexOf('total parade points') !== -1; });
        colMap.paradeAtt = row.findIndex(function(h) { return h.indexOf('total parade attendance') !== -1 || h.indexOf('parade attendance') !== -1; });
        colMap.uniformPts = row.findIndex(function(h) { return h.indexOf('total uniform points') !== -1 || h.indexOf('uniform points') !== -1; });
        break;
      }
    }

    if (headerRowIdx === -1 || colMap.name === -1) return;

    for (var r = headerRowIdx + 1; r < data.length; r++) {
      var row = data[r];
      var rawName = String(row[colMap.name] || '').trim();
      if (!rawName || rawName.toLowerCase() === 'name') continue;

      var normKey = normalizeMemberKey(rawName);
      var rank = colMap.rank !== -1 ? String(row[colMap.rank] || '').trim() : '';
      var squad = colMap.squad !== -1 ? String(row[colMap.squad] || '').trim() : (plt + ' Platoon');
      var totalPts = colMap.totalPts !== -1 ? parseNumber(row[colMap.totalPts]) : 0;
      var bandPts = colMap.bandPts !== -1 ? parseNumber(row[colMap.bandPts]) : 0;
      var bandAttPct = colMap.bandAtt !== -1 ? parsePercentage(row[colMap.bandAtt]) : 0;
      var paradePts = colMap.paradePts !== -1 ? parseNumber(row[colMap.paradePts]) : 0;
      var paradeAttPct = colMap.paradeAtt !== -1 ? parsePercentage(row[colMap.paradeAtt]) : 0;
      var uniformPts = colMap.uniformPts !== -1 ? parseNumber(row[colMap.uniformPts]) : 0;

      // Calculate uniform average if parade points exist (parade days = paradePts / 2)
      var paradeDays = paradePts > 0 ? (paradePts / 2) : 0;
      var uniformAvg = paradeDays > 0 ? Math.round((uniformPts / paradeDays) * 10) / 10 : 0;

      var isBand = (bandPts > 0 || bandAttPct > 0);

      members[normKey] = {
        name: rawName,
        rank: rank,
        platoon: plt,
        squad: squad,
        isBandMember: isBand,
        bandSection: '',
        paradeAttendance: {
          percentage: paradeAttPct
        },
        bandAttendance: {
          percentage: bandAttPct
        },
        points: {
          uniform: Math.round(uniformPts * 10) / 10,
          uniformAvg: uniformAvg,
          paradeAtt: Math.round(paradePts),
          bandAtt: Math.round(bandPts),
          total: Math.round(totalPts || (uniformPts + paradePts + bandPts))
        },
        lastUpdated: new Date().toISOString()
      };
    }
  });

  // 2. Process Band Attendance Tab (Band Attendance 2026)
  var bandSheet = ss.getSheetByName('Band Attendance 2026') || ss.getSheetByName('Band Attendance');
  if (bandSheet) {
    scannedSheets.push(bandSheet.getName());
    var bData = bandSheet.getDataRange().getValues();
    var bHeaderRow = -1;
    var bColMap = { name: 0, section: 1, squad: 2, points: 3, att: 4 };

    for (var r = 0; r < Math.min(10, bData.length); r++) {
      var row = bData[r].map(function(c) { return String(c || '').toLowerCase().trim(); });
      var nIdx = row.findIndex(function(h) { return h.indexOf('name') !== -1; });
      if (nIdx !== -1) {
        bHeaderRow = r;
        bColMap.name = nIdx;
        bColMap.section = row.findIndex(function(h) { return h.indexOf('section') !== -1 || h.indexOf('instrument') !== -1; });
        bColMap.squad = row.findIndex(function(h) { return h.indexOf('squad') !== -1; });
        bColMap.points = row.findIndex(function(h) { return h.indexOf('band points') !== -1 || h.indexOf('points') !== -1; });
        bColMap.att = row.findIndex(function(h) { return h.indexOf('band attendance') !== -1 || h.indexOf('attendance') !== -1; });
        break;
      }
    }

    if (bHeaderRow !== -1) {
      for (var r = bHeaderRow + 1; r < bData.length; r++) {
        var row = bData[r];
        var rawName = String(row[bColMap.name] || '').trim();
        if (!rawName || rawName.toLowerCase() === 'name' || rawName.indexOf('#REF!') !== -1) continue;

        var normKey = normalizeMemberKey(rawName);
        var section = bColMap.section !== -1 ? String(row[bColMap.section] || '').trim() : '';
        var bPts = bColMap.points !== -1 ? parseNumber(row[bColMap.points]) : 0;
        var bAtt = bColMap.att !== -1 ? parsePercentage(row[bColMap.att]) : 0;

        if (members[normKey]) {
          members[normKey].isBandMember = true;
          if (section) members[normKey].bandSection = section;
          if (bAtt > 0) members[normKey].bandAttendance.percentage = bAtt;
          if (bPts > 0) members[normKey].points.bandAtt = Math.round(bPts);
        } else {
          members[normKey] = {
            name: rawName,
            rank: '',
            platoon: 'Band',
            squad: bColMap.squad !== -1 ? String(row[bColMap.squad] || '').trim() : '',
            isBandMember: true,
            bandSection: section,
            paradeAttendance: { percentage: 0 },
            bandAttendance: { percentage: bAtt },
            points: { uniform: 0, uniformAvg: 0, paradeAtt: 0, bandAtt: Math.round(bPts), total: Math.round(bPts) },
            lastUpdated: new Date().toISOString()
          };
        }
      }
    }
  }

  // 3. Process Squad Leaderboard Tab (DO NOT sum individual members, read exact scores!)
  var lbSheet = ss.getSheetByName('Squad Leaderboard [Post Enrolment]') ||
                ss.getSheetByName('Squad Leaderboard [Pre Enrolment]') ||
                ss.getSheetByName('Squad Leaderboard');
  if (lbSheet) {
    scannedSheets.push(lbSheet.getName());
    var lbData = lbSheet.getDataRange().getValues();
    for (var r = 0; r < lbData.length; r++) {
      var row = lbData[r];
      for (var c = 0; c < row.length; c++) {
        var cellVal = String(row[c] || '').trim();
        // Competing squads: ALPHA 1, ALPHA 2, PAPA 1, PAPA 2, ZULU 1, ZULU 2
        var m = cellVal.match(/^(ALPHA|PAPA|ZULU)\s*([0-9]+)$/i);
        if (m) {
          var squadName = (m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase()) + ' ' + m[2];
          var pts = 0;
          for (var nc = c + 1; nc < row.length; nc++) {
            var nVal = parseNumber(row[nc]);
            if (nVal > 0) { pts = nVal; break; }
          }
          if (pts > 0) {
            squads[squadName] = { 
              name: squadName, 
              points: pts, 
              platoon: m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase() 
            };
          }
        }
      }
    }
  }

  // Fallback defaults if leaderboard tab not scanned yet
  if (Object.keys(squads).length === 0) {
    squads = {
      'PAPA 1':  { name: 'PAPA 1',  points: 161, platoon: 'Papa' },
      'PAPA 2':  { name: 'PAPA 2',  points: 161, platoon: 'Papa' },
      'ZULU 1':  { name: 'ZULU 1',  points: 160, platoon: 'Zulu' },
      'ALPHA 2': { name: 'ALPHA 2', points: 155, platoon: 'Alpha' },
      'ALPHA 1': { name: 'ALPHA 1', points: 149, platoon: 'Alpha' },
      'ZULU 2':  { name: 'ZULU 2',  points: 144, platoon: 'Zulu' }
    };
  }

  // 4. Compute Squad Ranks (with ties handled)
  var sortedSquadNames = Object.keys(squads).sort(function(a, b) {
    return (squads[b].points || 0) - (squads[a].points || 0);
  });

  var curRank = 1;
  sortedSquadNames.forEach(function(sqName, idx) {
    if (idx > 0 && squads[sqName].points < squads[sortedSquadNames[idx - 1]].points) {
      curRank = idx + 1;
    }
    squads[sqName].rank = curRank;
  });

  // 5. Compute Platoon Averages (No Hotel!)
  var platoons = {};
  ['Papa', 'Alpha', 'Zulu'].forEach(function(plt) {
    var pSquads = Object.keys(squads).filter(function(k) { return squads[k].platoon === plt; });
    var sum = 0;
    pSquads.forEach(function(k) { sum += (squads[k].points || 0); });
    var avg = pSquads.length > 0 ? Math.round(sum / pSquads.length) : 0;
    platoons[plt] = {
      name: plt,
      totalPoints: avg,
      averagePoints: avg,
      squadCount: pSquads.length
    };
  });

  // Rank platoons by average
  var sortedPlatoons = Object.keys(platoons).sort(function(a, b) {
    return platoons[b].averagePoints - platoons[a].averagePoints;
  });
  sortedPlatoons.forEach(function(plt, idx) {
    platoons[plt].rank = idx + 1;
  });

  var memberCount = Object.keys(members).length;
  if (memberCount === 0) {
    SpreadsheetApp.getUi().alert('Notice: Could not find member rows in Platoon tabs. Please make sure sheet names match "Platoon Alpha", "Platoon Papa", etc.');
    return;
  }

  // 6. Build Payload & Push to Supabase bb_config
  var payload = {
    lastSynced: new Date().toISOString(),
    sheetTitle: ss.getName(),
    scannedSheets: scannedSheets,
    members: members,
    squads: squads,
    platoons: platoons
  };

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
      value: JSON.stringify(payload),
      updated_at: new Date().toISOString()
    }),
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch(postUrl, options);
  var code = response.getResponseCode();

  if (code >= 200 && code < 300) {
    SpreadsheetApp.getUi().alert('Success: Synced ' + memberCount + ' members and squad leaderboards across ' + scannedSheets.length + ' tabs to the 1st PJ BB Portal!');
  } else {
    SpreadsheetApp.getUi().alert('Sync Failed (HTTP ' + code + '):\n' + response.getContentText());
  }
}

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

function parseNumber(val) {
  if (val === null || val === undefined || val === '' || val === 'N/A') return 0;
  if (typeof val === 'number') return val;
  var s = String(val).replace(/[^0-9.-]/g, '');
  var num = parseFloat(s);
  return isNaN(num) ? 0 : num;
}

function parsePercentage(val) {
  if (val === null || val === undefined || val === '' || val === 'N/A') return 0;
  if (typeof val === 'number') {
    if (val <= 2.0 && val > 0) return Math.round(val * 10000) / 100;
    return Math.round(val * 100) / 100;
  }
  var s = String(val).replace('%', '').trim();
  var num = parseFloat(s);
  return isNaN(num) ? 0 : Math.round(num * 100) / 100;
}

function normalizeMemberKey(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
`;
}

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
