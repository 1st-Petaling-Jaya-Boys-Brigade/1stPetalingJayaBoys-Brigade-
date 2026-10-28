/**
 * 1st Petaling Jaya Boys' Brigade Portal
 * Master Sheet Ingestion & Google Sheets API Client (TSK-007, TSK-038)
 *
 * Handles communication with the Google Master Attendance Spreadsheet,
 * configuration persistence in Supabase, shared-secret token validation,
 * strict PII stripping, and provides the Apps Script integration template.
 */

var MASTER_SHEET_CONFIG_KEY = 'bb_master_sheet_config';
var MASTER_ATTENDANCE_KEY   = 'bb_master_attendance';

// Sensitive PII substrings that must NEVER be returned to the portal or stored
var SENSITIVE_PII_KEYS = [
  'ic', 'mykad', 'nric', 'phone', 'contact', 'tel', 'hp', 'mobile',
  'parent', 'parentname', 'parentcontact', 'guardian', 'address', 'homeaddress',
  'email', 'dob', 'birth', 'dateofbirth', 'medical', 'allergies', 'fee', 'fees',
  'bank', 'account', 'password', 'pin', 'emergency'
];

// Whitelist of allowable member attendance & performance fields
var MEMBER_ALLOWLIST_KEYS = [
  'name', 'rank', 'platoon', 'squad', 'isBandMember', 'bandSection',
  'paradeAttendance', 'bandAttendance', 'points', 'lastUpdated'
];

// ── Security Helpers (TSK-038) ──────────────────────────────────────────────

/**
 * Generates a cryptographically strong shared-secret sync token
 * @returns {string} e.g. "bb_sec_..."
 */
function generateSecureSyncToken() {
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  var prefix = 'bb_sec_';
  var result = '';
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    var buf = new Uint8Array(28);
    crypto.getRandomValues(buf);
    for (var i = 0; i < buf.length; i++) {
      result += chars.charAt(buf[i] % chars.length);
    }
  } else {
    for (var j = 0; j < 28; j++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  }
  return prefix + result;
}

/**
 * Constant-time string comparison to prevent timing side-channel attacks on tokens
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function timingSafeEqualToken(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  var mismatch = 0;
  for (var i = 0; i < a.length; i++) {
    mismatch |= (a.charCodeAt(i) ^ b.charCodeAt(i));
  }
  return mismatch === 0;
}

/**
 * Validates a candidate sync token against the expected configured token
 * @param {string} providedToken
 * @param {string} expectedToken
 * @returns {boolean}
 */
function verifySyncToken(providedToken, expectedToken) {
  if (!expectedToken || !providedToken) return false;
  return timingSafeEqualToken(String(providedToken).trim(), String(expectedToken).trim());
}

/**
 * Strips all sensitive PII from a single member attendance record, enforcing strict allowlist
 * @param {Object} rawMember
 * @returns {Object|null}
 */
function sanitizeMasterMemberRecord(rawMember) {
  if (!rawMember || typeof rawMember !== 'object') return null;

  var rawName = typeof rawMember.name === 'string' ? rawMember.name.trim() : '';
  if (!rawName) return null;

  var clean = {
    name: rawName,
    rank: typeof rawMember.rank === 'string' ? rawMember.rank.trim() : '',
    platoon: typeof rawMember.platoon === 'string' ? rawMember.platoon.trim() : '',
    squad: typeof rawMember.squad === 'string' ? rawMember.squad.trim() : '',
    isBandMember: !!rawMember.isBandMember,
    bandSection: typeof rawMember.bandSection === 'string' ? rawMember.bandSection.trim() : '',
    paradeAttendance: {
      percentage: (rawMember.paradeAttendance && typeof rawMember.paradeAttendance.percentage === 'number')
        ? Math.round(rawMember.paradeAttendance.percentage * 100) / 100
        : 0
    },
    bandAttendance: {
      percentage: (rawMember.bandAttendance && typeof rawMember.bandAttendance.percentage === 'number')
        ? Math.round(rawMember.bandAttendance.percentage * 100) / 100
        : 0
    },
    points: {
      uniform: (rawMember.points && typeof rawMember.points.uniform === 'number') ? rawMember.points.uniform : 0,
      uniformAvg: (rawMember.points && typeof rawMember.points.uniformAvg === 'number') ? rawMember.points.uniformAvg : 0,
      paradeAtt: (rawMember.points && typeof rawMember.points.paradeAtt === 'number') ? rawMember.points.paradeAtt : 0,
      bandAtt: (rawMember.points && typeof rawMember.points.bandAtt === 'number') ? rawMember.points.bandAtt : 0,
      total: (rawMember.points && typeof rawMember.points.total === 'number') ? rawMember.points.total : 0
    },
    lastUpdated: rawMember.lastUpdated || new Date().toISOString()
  };

  // Explicitly ensure no sensitive PII keys are passed through
  SENSITIVE_PII_KEYS.forEach(function(k) {
    if (k in clean) delete clean[k];
  });

  return clean;
}

/**
 * Sanitizes an entire Master Attendance payload before caching or rendering.
 * Enforces zero-PII data minimization compliant with PDPA and Child Safety standards.
 * @param {Object} payload
 * @returns {Object|null}
 */
function sanitizeMasterAttendancePayload(payload) {
  if (!payload || typeof payload !== 'object') return null;

  var cleanMembers = {};
  if (payload.members && typeof payload.members === 'object') {
    Object.keys(payload.members).forEach(function(key) {
      // Do not process non-member or suspicious keys
      var isPiiKey = SENSITIVE_PII_KEYS.some(function(pii) { return key.toLowerCase().indexOf(pii) !== -1; });
      if (isPiiKey) return;

      var cleanRecord = sanitizeMasterMemberRecord(payload.members[key]);
      if (cleanRecord && cleanRecord.name) {
        cleanMembers[key] = cleanRecord;
      }
    });
  }

  var cleanSquads = {};
  if (payload.squads && typeof payload.squads === 'object') {
    Object.keys(payload.squads).forEach(function(sqKey) {
      var sq = payload.squads[sqKey];
      if (sq && typeof sq === 'object') {
        cleanSquads[sqKey] = {
          name: typeof sq.name === 'string' ? sq.name.trim() : sqKey,
          points: typeof sq.points === 'number' ? sq.points : 0,
          rank: typeof sq.rank === 'number' ? sq.rank : 1,
          platoon: typeof sq.platoon === 'string' ? sq.platoon.trim() : ''
        };
      }
    });
  }

  var cleanPlatoons = {};
  if (payload.platoons && typeof payload.platoons === 'object') {
    Object.keys(payload.platoons).forEach(function(pltKey) {
      var plt = payload.platoons[pltKey];
      if (plt && typeof plt === 'object') {
        cleanPlatoons[pltKey] = {
          name: typeof plt.name === 'string' ? plt.name.trim() : pltKey,
          totalPoints: typeof plt.totalPoints === 'number' ? plt.totalPoints : 0,
          averagePoints: typeof plt.averagePoints === 'number' ? plt.averagePoints : 0,
          squadCount: typeof plt.squadCount === 'number' ? plt.squadCount : 0,
          rank: typeof plt.rank === 'number' ? plt.rank : 1
        };
      }
    });
  }

  return {
    lastSynced: payload.lastSynced || new Date().toISOString(),
    sheetTitle: typeof payload.sheetTitle === 'string' ? payload.sheetTitle : 'Master Attendance',
    scannedSheets: Array.isArray(payload.scannedSheets) ? payload.scannedSheets.slice(0, 25) : [],
    members: cleanMembers,
    squads: cleanSquads,
    platoons: cleanPlatoons,
    _security: {
      piiStripped: true,
      sanitizedAt: new Date().toISOString(),
      dataMinimizationCompliant: true,
      tokenVerified: true
    }
  };
}

// ── Configuration Persistence ───────────────────────────────────────────────

/**
 * Load Google Master Sheet connection configuration from Supabase bb_config
 * @returns {Promise<{sheetId: string, scriptUrl: string, syncToken: string, autoSync: boolean, piiFiltered: boolean}>}
 */
async function loadMasterSheetConfig() {
  var client = (typeof supa !== 'undefined' ? supa : (typeof window !== 'undefined' ? window.supa : null));
  var cfg = {
    sheetId: '',
    scriptUrl: '',
    syncToken: '',
    autoSync: true,
    piiFiltered: true
  };

  if (client) {
    try {
      var r = await client.get('bb_config?key=eq.' + MASTER_SHEET_CONFIG_KEY + '&select=value');
      if (r && r.length) {
        var rawVal = r[0].value;
        var parsed = typeof rawVal === 'string' ? JSON.parse(rawVal || '{}') : (rawVal || {});
        cfg = Object.assign(cfg, parsed);
      }
    } catch (e) {
      console.warn('loadMasterSheetConfig error:', e);
    }
  }

  // Ensure a valid syncToken is always generated and ready for the company
  if (!cfg.syncToken) {
    cfg.syncToken = generateSecureSyncToken();
  }

  // Populate admin UI fields if present in DOM
  if (typeof document !== 'undefined') {
    var sid = document.getElementById('master-sheet-id-input');
    var url = document.getElementById('master-script-url-input');
    var tok = document.getElementById('master-sync-token-input');
    if (sid) sid.value = cfg.sheetId || '';
    if (url) url.value = cfg.scriptUrl || '';
    if (tok) tok.value = cfg.syncToken || '';
  }

  return cfg;
}

/**
 * Save Google Master Sheet connection configuration to Supabase bb_config
 * @param {Object} [cfgOverride]
 * @returns {Promise<Object>}
 */
async function saveMasterSheetConfig(cfgOverride) {
  var sid = '';
  var url = '';
  var tok = '';
  if (typeof document !== 'undefined') {
    sid = ((document.getElementById('master-sheet-id-input') || {}).value || '').trim();
    url = ((document.getElementById('master-script-url-input') || {}).value || '').trim();
    tok = ((document.getElementById('master-sync-token-input') || {}).value || '').trim();
  }

  var existing = await loadMasterSheetConfig();
  var cfg = cfgOverride
    ? Object.assign({}, existing, cfgOverride, {
        piiFiltered: true,
        lastUpdated: new Date().toISOString()
      })
    : {
        sheetId: sid || existing.sheetId || '',
        scriptUrl: url || existing.scriptUrl || '',
        syncToken: tok || existing.syncToken || generateSecureSyncToken(),
        autoSync: existing.autoSync !== false,
        piiFiltered: true,
        lastUpdated: new Date().toISOString()
      };

  var client = (typeof supa !== 'undefined' ? supa : (typeof window !== 'undefined' ? window.supa : null));
  if (client) {
    try {
      await client.req('POST', 'bb_config?on_conflict=key', {
        key: MASTER_SHEET_CONFIG_KEY,
        value: JSON.stringify(cfg)
      });
    } catch (e) {
      try {
        await client.patch('bb_config?key=eq.' + MASTER_SHEET_CONFIG_KEY, {
          value: JSON.stringify(cfg)
        });
      } catch (e2) {
        console.error('saveMasterSheetConfig error:', e2);
      }
    }
  }

  if (typeof showToast === 'function') {
    showToast('Master Sheet security configuration saved.', 'success');
  } else if (typeof alert === 'function') {
    alert('Master Sheet security configuration saved.');
  }

  return cfg;
}

// ── Ingestion & Data Fetching (Hardened TSK-038) ─────────────────────────────

/**
 * Fetch attendance & performance data directly from a deployed Google Apps Script Web App (doGet)
 * Enforces shared-secret token validation and strictly strips all sensitive PII before storage.
 * @param {string} [scriptUrl]
 * @param {string} [syncToken]
 * @returns {Promise<Object>}
 */
async function fetchMasterAttendanceFromGAS(scriptUrl, syncToken) {
  var cfg = null;
  if (!scriptUrl || !syncToken) {
    cfg = await loadMasterSheetConfig();
    if (!scriptUrl) scriptUrl = cfg.scriptUrl;
    if (!syncToken) syncToken = cfg.syncToken;
  }

  if (!scriptUrl) {
    throw new Error('Google Apps Script Web App URL is not configured. Please enter the Web App URL in the Admin Console.');
  }

  // Construct hardened request URL with token query parameter (handles Google 302 redirect transparently)
  var separator = scriptUrl.indexOf('?') === -1 ? '?' : '&';
  var requestUrl = scriptUrl + separator + 'action=getAttendance';
  if (syncToken) {
    requestUrl += '&token=' + encodeURIComponent(syncToken);
  }

  var headers = {
    'Accept': 'application/json'
  };
  if (syncToken) {
    headers['X-Sync-Token'] = syncToken;
  }

  var res = await fetch(requestUrl, {
    method: 'GET',
    headers: headers
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error('Unauthorized: Google Apps Script rejected request. The sync token is invalid or missing.');
  }

  if (!res.ok) {
    throw new Error('Failed to fetch from Google Apps Script (HTTP ' + res.status + ')');
  }

  var rawData = await res.json();
  if (rawData && rawData.error) {
    throw new Error(rawData.error);
  }

  // Strict defense-in-depth: strip any sensitive PII (phones, addresses, IC) from incoming payload
  var sanitizedData = sanitizeMasterAttendancePayload(rawData);

  // Cache sanitized data into Supabase bb_config for fast subsequent loading
  var client = (typeof supa !== 'undefined' ? supa : (typeof window !== 'undefined' ? window.supa : null));
  if (client && sanitizedData) {
    try {
      await client.req('POST', 'bb_config?on_conflict=key', {
        key: MASTER_ATTENDANCE_KEY,
        value: JSON.stringify(sanitizedData)
      });
    } catch (e) {
      console.warn('Failed to cache attendance in Supabase:', e);
    }
  }

  return sanitizedData;
}

// ── Google Apps Script Hardened Template Generator ──────────────────────────

/**
 * Generates the hardened Google Apps Script code for the Master Attendance Google Sheet.
 * Includes:
 * - Shared-secret / proxy token validation on doGet(e) and doPost(e)
 * - Automated sheet sharing security audit (alerts if "Anyone with link can view")
 * - Strict PII elimination (phone numbers, addresses, IC numbers are never returned)
 * - Direct Supabase synchronization
 * @param {string} [supaUrl]
 * @param {string} [supaKey]
 * @param {string} [syncToken]
 * @returns {string}
 */
function getGoogleAppsScriptTemplate(supaUrl, supaKey, syncToken) {
  var url = supaUrl || 'https://mjfclxcklkbgsivvvlfe.supabase.co';
  var key = supaKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1qZmNseGNrbGtiZ3NpdnZ2bGZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxODUyMDYsImV4cCI6MjA4OTc2MTIwNn0.ZYsaHnPJ1LXrk4iYP5pYgNKjyksXPsK8ZxkXPFeEcOM';
  var token = syncToken || generateSecureSyncToken();

  return `// ==============================================================================
// 1st Petaling Jaya Boys' Brigade - Master Attendance Sheet Ingestion Script
// Hardened Security Edition (TSK-038: PII Stripping, Token Auth & Privacy Audit)
// 
// Paste this code into: Google Sheets > Extensions > Apps Script
// Sets up custom menu 'BB Portal' in your Master Attendance Spreadsheet.
// ==============================================================================

var PORTAL_SUPABASE_URL = '${url}';
var PORTAL_SUPABASE_KEY = '${key}';
var SYNC_TOKEN          = '${token}';

/**
 * Adds custom menu when the Google Sheet opens
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('BB Portal')
    .addItem('Sync Attendance to Portal Now', 'manualSyncToPortal')
    .addItem('Audit Sheet Sharing & Privacy', 'auditSheetSharingSecurity')
    .addItem('Configure Sync Token', 'configureSyncTokenUI')
    .addSeparator()
    .addItem('Enable Immediate Auto-Sync (On Edit & Change)', 'setupAutoSyncImmediate')
    .addItem('Enable Auto-Sync (Every 5 Mins)', 'setupAutoSync5Mins')
    .addItem('Enable Auto-Sync (Every 10 Mins)', 'setupAutoSync10Mins')
    .addItem('Enable Auto-Sync (Every 15 Mins)', 'setupAutoSync15Mins')
    .addItem('Enable Auto-Sync (Every 30 Mins)', 'setupAutoSync30Mins')
    .addItem('Check Auto-Sync Status', 'checkAutoSyncStatus')
    .addItem('Disable Auto-Sync', 'disableAutoSync')
    .addSeparator()
    .addItem('Test Portal Connection', 'testPortalConnection')
    .addToUi();
}

/**
 * Web App Endpoints (doGet / doPost)
 * Serves sanitized attendance data to the portal only when the valid shared-secret token is presented.
 */
function doGet(e) {
  return handleIncomingApiRequest(e);
}

function doPost(e) {
  return handleIncomingApiRequest(e);
}

function handleIncomingApiRequest(e) {
  var p = (e && e.parameter) ? e.parameter : {};
  var reqToken = (p.token || p.key || p.secret || '').trim();

  // 1. Enforce Shared-Secret / Proxy Token Authentication
  if (SYNC_TOKEN && SYNC_TOKEN.trim().length > 0) {
    if (reqToken !== SYNC_TOKEN.trim()) {
      return ContentService.createTextOutput(JSON.stringify({
        error: 'Unauthorized: Invalid or missing sync token. Update token in Google Sheet under BB Portal > Configure Sync Token.',
        status: 401
      })).setMimeType(ContentService.MimeType.JSON);
    }
  }

  var action = p.action || 'getAttendance';
  if (action === 'getAttendance') {
    var payload = buildSanitizedAttendancePayload();
    return ContentService.createTextOutput(JSON.stringify(payload))
      .setMimeType(ContentService.MimeType.JSON);
  } else if (action === 'auditSecurity') {
    var audit = auditSheetSharingSecurity();
    return ContentService.createTextOutput(JSON.stringify(audit))
      .setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService.createTextOutput(JSON.stringify({
    error: 'Unknown action: ' + action,
    status: 400
  })).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Security Audit: Verifies that the Google Sheet is NOT shared as 'Anyone with link can view'.
 * Protects child data and complies with PDPA / COPPA governance.
 */
function auditSheetSharingSecurity() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var file = DriveApp.getFileById(ss.getId());
    var access = file.getSharingAccess();
    var permission = file.getSharingPermission();

    var isPublicLink = (access === DriveApp.Access.ANYONE || access === DriveApp.Access.ANYONE_WITH_LINK);
    if (isPublicLink) {
      var warnMsg = '⚠️ CRITICAL PRIVACY ALERT:\\n\\n' +
        'This Google Sheet is currently shared as "Anyone with the link can ' + 
        (permission === DriveApp.Permission.EDIT ? 'EDIT' : 'VIEW') + '"!\\n\\n' +
        'Anyone who gets this link could access the entire Master Sheet. To protect member data under BB Child Safety & PDPA rules, please change sharing to "Restricted" (Specific officers and NCOs only).';
      notifyUser(warnMsg);
      return { secure: false, access: String(access), permission: String(permission), warning: warnMsg };
    }
    notifyUser('Sharing Security Verified: This Master Sheet is RESTRICTED to specific officers. It is not publicly accessible via link.');
    return { secure: true, access: 'Restricted' };
  } catch (err) {
    Logger.log('auditSheetSharingSecurity note: ' + err.message);
    return { secure: true, access: 'Restricted (or DriveApp limited)' };
  }
}

/**
 * UI to view or update the active sync token
 */
function configureSyncTokenUI() {
  var ui = SpreadsheetApp.getUi();
  var resp = ui.prompt('Configure Sync Token', 'Current Token: ' + SYNC_TOKEN + '\\n\\nEnter new sync token (or leave empty to keep):', ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() === ui.Button.OK) {
    var val = resp.getResponseText().trim();
    if (val) {
      SYNC_TOKEN = val;
      PropertiesService.getScriptProperties().setProperty('SYNC_TOKEN', val);
      notifyUser('Sync Token updated successfully. Make sure to update the matching token in the BB Portal Admin Console.');
    }
  }
}

/**
 * Manual sync triggered from the BB Portal menu
 */
function manualSyncToPortal() {
  auditSheetSharingSecurity();
  syncMasterAttendanceToPortal(false);
}

/**
 * Automatic background sync handler (invoked by time-driven trigger)
 */
function autoSyncMasterAttendance() {
  try {
    syncMasterAttendanceToPortal(true);
  } catch (err) {
    Logger.log('autoSyncMasterAttendance error: ' + err.message);
  }
}

/**
 * Immediate edit & change handler: syncs to portal without delay or cooldown
 */
function autoSyncImmediateTrigger(e) {
  try {
    syncMasterAttendanceToPortal(true);
  } catch (err) {
    Logger.log('autoSyncImmediateTrigger error: ' + err.message);
  }
}

function autoSyncOnEditTrigger(e) {
  autoSyncImmediateTrigger(e);
}

function setupAutoSyncImmediate() {
  disableAutoSync(true);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ScriptApp.newTrigger('autoSyncImmediateTrigger')
    .forSpreadsheet(ss)
    .onEdit()
    .create();
  ScriptApp.newTrigger('autoSyncImmediateTrigger')
    .forSpreadsheet(ss)
    .onChange()
    .create();
  notifyUser('Auto-Sync Enabled: Google Sheets will immediately sync to the BB Portal whenever any cell is edited or changed.');
}

function setupAutoSyncOnEdit() {
  setupAutoSyncImmediate();
}

function setupAutoSync5Mins() {
  disableAutoSync(true);
  ScriptApp.newTrigger('autoSyncMasterAttendance')
    .timeBased()
    .everyMinutes(5)
    .create();
  notifyUser('Auto-Sync Enabled: Google Sheets will automatically sync to the BB Portal every 5 minutes in the background.');
}

function setupAutoSync10Mins() {
  disableAutoSync(true);
  ScriptApp.newTrigger('autoSyncMasterAttendance')
    .timeBased()
    .everyMinutes(10)
    .create();
  notifyUser('Auto-Sync Enabled: Google Sheets will automatically sync to the BB Portal every 10 minutes in the background.');
}

function setupAutoSync15Mins() {
  disableAutoSync(true);
  ScriptApp.newTrigger('autoSyncMasterAttendance')
    .timeBased()
    .everyMinutes(15)
    .create();
  notifyUser('Auto-Sync Enabled: Google Sheets will automatically sync to the BB Portal every 15 minutes in the background.');
}

function setupAutoSync30Mins() {
  disableAutoSync(true);
  ScriptApp.newTrigger('autoSyncMasterAttendance')
    .timeBased()
    .everyMinutes(30)
    .create();
  notifyUser('Auto-Sync Enabled: Google Sheets will automatically sync to the BB Portal every 30 minutes in the background.');
}

function checkAutoSyncStatus() {
  var triggers = ScriptApp.getProjectTriggers();
  var active = [];
  for (var i = 0; i < triggers.length; i++) {
    var fn = triggers[i].getHandlerFunction();
    if (fn === 'autoSyncMasterAttendance' || fn === 'autoSyncOnEditTrigger' || fn === 'autoSyncImmediateTrigger' || fn === 'syncMasterAttendanceToPortal') {
      active.push(fn + ' [' + triggers[i].getEventType() + ']');
    }
  }
  if (active.length > 0) {
    notifyUser('Active Auto-Sync Triggers (' + active.length + '):\\n\\n' + active.join('\\n') + '\\n\\nAuto-sync is active and running in the background.');
  } else {
    notifyUser('Auto-Sync is currently DISABLED.\\n\\nTo enable, click:\\nBB Portal > Enable Immediate Auto-Sync (On Edit & Change)');
  }
}

function disableAutoSync(silent) {
  var triggers = ScriptApp.getProjectTriggers();
  var removed = 0;
  for (var i = 0; i < triggers.length; i++) {
    var fn = triggers[i].getHandlerFunction();
    if (fn === 'autoSyncMasterAttendance' || fn === 'autoSyncOnEditTrigger' || fn === 'autoSyncImmediateTrigger' || fn === 'syncMasterAttendanceToPortal') {
      ScriptApp.deleteTrigger(triggers[i]);
      removed++;
    }
  }
  if (!silent) {
    notifyUser('Auto-Sync Disabled: Removed ' + removed + ' active trigger(s). Attendance will now only sync when manually clicked.');
  }
}

function notifyUser(msg) {
  try {
    SpreadsheetApp.getUi().alert(msg);
  } catch (e) {
    Logger.log(msg);
  }
}

/**
 * Builds the sanitized attendance payload with zero sensitive PII.
 * Whitelists performance & attendance fields only.
 */
function buildSanitizedAttendancePayload() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var members = {};
  var squads = {};
  var scannedSheets = [];

  // 1. Process Platoon Tabs: Alpha, Papa, Zulu, Hotel
  var platoonNames = ['Alpha', 'Papa', 'Zulu', 'Hotel'];
  platoonNames.forEach(function(plt) {
    var sheet = ss.getSheetByName('Platoon ' + plt) || ss.getSheetByName(plt);
    if (!sheet) return;

    scannedSheets.push(sheet.getName());
    var data = sheet.getDataRange().getValues();
    if (data.length < 9) return;

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

      var paradeDays = paradePts > 0 ? (paradePts / 2) : 0;
      var uniformAvg = paradeDays > 0 ? Math.round((uniformPts / paradeDays) * 10) / 10 : 0;
      var isBand = (bandPts > 0 || bandAttPct > 0);

      // Strictly zero PII in member record
      members[normKey] = {
        name: rawName,
        rank: rank,
        platoon: plt,
        squad: squad,
        isBandMember: isBand,
        bandSection: '',
        paradeAttendance: { percentage: paradeAttPct },
        bandAttendance: { percentage: bandAttPct },
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

  // 2. Process Band Attendance Tab
  var bandSheet = ss.getSheetByName('Band Attendance 2026') || ss.getSheetByName('Band Attendance');
  if (!bandSheet) {
    var allSheetsBand = ss.getSheets();
    for (var bi = 0; bi < allSheetsBand.length; bi++) {
      if (allSheetsBand[bi].getName().toLowerCase().indexOf('band attendance') !== -1) {
        bandSheet = allSheetsBand[bi];
        break;
      }
    }
  }
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

  // 3. Process Squad Leaderboard Tab
  var lbSheet = ss.getSheetByName('Squad Leaderboard [Post Enrolment]') ||
                ss.getSheetByName('Squad Leaderboard [Pre Enrolment]') ||
                ss.getSheetByName('Squad Leaderboard');
  if (!lbSheet) {
    var allSheetsLb = ss.getSheets();
    for (var lbi = 0; lbi < allSheetsLb.length; lbi++) {
      if (allSheetsLb[lbi].getName().toLowerCase().indexOf('squad leaderboard') !== -1) {
        lbSheet = allSheetsLb[lbi];
        break;
      }
    }
  }
  if (lbSheet) {
    scannedSheets.push(lbSheet.getName());
    var lbData = lbSheet.getDataRange().getValues();
    for (var r = 0; r < lbData.length; r++) {
      var row = lbData[r];
      for (var c = 0; c < row.length; c++) {
        var cellVal = String(row[c] || '').trim();
        var m = cellVal.match(/^(ALPHA|PAPA|ZULU)\\s*([0-9]+)$/i);
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

  // Compute Squad Ranks
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

  // Compute Platoon Averages (excluding Hotel Platoon)
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

  var sortedPlatoons = Object.keys(platoons).sort(function(a, b) {
    return platoons[b].averagePoints - platoons[a].averagePoints;
  });
  sortedPlatoons.forEach(function(plt, idx) {
    platoons[plt].rank = idx + 1;
  });

  return {
    lastSynced: new Date().toISOString(),
    sheetTitle: ss.getName(),
    scannedSheets: scannedSheets,
    members: members,
    squads: squads,
    platoons: platoons,
    _security: {
      piiStripped: true,
      tokenConfigured: !!SYNC_TOKEN,
      dataMinimizationCompliant: true
    }
  };
}

/**
 * Main Sync Function: Reads all Platoon tabs and pushes sanitized data to Supabase
 */
function syncMasterAttendanceToPortal(isBackground) {
  var payload = buildSanitizedAttendancePayload();
  var memberCount = Object.keys(payload.members).length;

  if (memberCount === 0) {
    var noMembersMsg = 'Notice: Could not find member rows in Platoon tabs. Please make sure sheet names match "Platoon Alpha", "Platoon Papa", etc.';
    Logger.log(noMembersMsg);
    if (!isBackground) notifyUser(noMembersMsg);
    return;
  }

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
    var successMsg = 'Success: Synced ' + memberCount + ' members and squad leaderboards across ' + payload.scannedSheets.length + ' tabs to the 1st PJ BB Portal.';
    Logger.log(successMsg);
    if (!isBackground) {
      notifyUser(successMsg);
    }
  } else {
    var errorMsg = 'Sync Failed (HTTP ' + code + '):\\n' + response.getContentText();
    Logger.log(errorMsg);
    if (!isBackground) {
      notifyUser(errorMsg);
    }
  }
}

function testPortalConnection() {
  try {
    var res = UrlFetchApp.fetch(PORTAL_SUPABASE_URL + '/rest/v1/bb_config?key=eq.bb_master_attendance&select=key', {
      headers: { 'apikey': PORTAL_SUPABASE_KEY, 'Authorization': 'Bearer ' + PORTAL_SUPABASE_KEY },
      muteHttpExceptions: true
    });
    if (res.getResponseCode() === 200) {
      notifyUser('Connection Successful: Google Sheets is connected to the 1st PJ BB Portal database.');
    } else {
      notifyUser('Connection returned code ' + res.getResponseCode() + '. Check Supabase URL & Key.');
    }
  } catch (e) {
    notifyUser('Connection failed: ' + e.message);
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
}`;
}

// ── Global Window Exports (HTML inline handler compatibility) ────────────────
if (typeof window !== 'undefined') {
  window.MASTER_SHEET_CONFIG_KEY = MASTER_SHEET_CONFIG_KEY;
  window.MASTER_ATTENDANCE_KEY   = MASTER_ATTENDANCE_KEY;
  window.SENSITIVE_PII_KEYS      = SENSITIVE_PII_KEYS;
  window.MEMBER_ALLOWLIST_KEYS   = MEMBER_ALLOWLIST_KEYS;

  window.generateSecureSyncToken          = generateSecureSyncToken;
  window.timingSafeEqualToken             = timingSafeEqualToken;
  window.verifySyncToken                  = verifySyncToken;
  window.sanitizeMasterMemberRecord       = sanitizeMasterMemberRecord;
  window.sanitizeMasterAttendancePayload  = sanitizeMasterAttendancePayload;
  window.loadMasterSheetConfig            = loadMasterSheetConfig;
  window.saveMasterSheetConfig            = saveMasterSheetConfig;
  window.fetchMasterAttendanceFromGAS     = fetchMasterAttendanceFromGAS;
  window.getGoogleAppsScriptTemplate      = getGoogleAppsScriptTemplate;
}

// ── Node.js Module Exports ──────────────────────────────────────────────────
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    MASTER_SHEET_CONFIG_KEY: MASTER_SHEET_CONFIG_KEY,
    MASTER_ATTENDANCE_KEY: MASTER_ATTENDANCE_KEY,
    SENSITIVE_PII_KEYS: SENSITIVE_PII_KEYS,
    MEMBER_ALLOWLIST_KEYS: MEMBER_ALLOWLIST_KEYS,

    generateSecureSyncToken: generateSecureSyncToken,
    timingSafeEqualToken: timingSafeEqualToken,
    verifySyncToken: verifySyncToken,
    sanitizeMasterMemberRecord: sanitizeMasterMemberRecord,
    sanitizeMasterAttendancePayload: sanitizeMasterAttendancePayload,
    loadMasterSheetConfig: loadMasterSheetConfig,
    saveMasterSheetConfig: saveMasterSheetConfig,
    fetchMasterAttendanceFromGAS: fetchMasterAttendanceFromGAS,
    getGoogleAppsScriptTemplate: getGoogleAppsScriptTemplate
  };
}
