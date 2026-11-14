/**
 * 1st Petaling Jaya Boys' Brigade Portal
 * Master Sheet Ingestion & Google Sheets API Client
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

// ── Security Helpers ──────────────────────────────────────────────

/**
 * Generates a cryptographically strong shared-secret sync token
 * @returns {string} e.g. "bb_sec_..."
 */
function generateSecureSyncToken() {
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  var prefix = 'bb_sec_';
  var result = '';
  var buf = new Uint8Array(28);
  while (result.length < 28) {
    crypto.getRandomValues(buf);
    for (var i = 0; i < buf.length && result.length < 28; i++) {
      if (buf[i] < 248) result += chars.charAt(buf[i] % chars.length);
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
    isBandMember: rawMember.isBandMember === true,
    bandSection: typeof rawMember.bandSection === 'string' ? rawMember.bandSection.trim() : '',
    paradeAttendance: {
      percentage: (rawMember.paradeAttendance && Number.isFinite(rawMember.paradeAttendance.percentage))
        ? Math.min(100, Math.max(0, rawMember.paradeAttendance.percentage))
        : 0
    },
    bandAttendance: {
      percentage: (rawMember.bandAttendance && Number.isFinite(rawMember.bandAttendance.percentage))
        ? Math.min(100, Math.max(0, rawMember.bandAttendance.percentage))
        : 0
    },
    points: {
      uniform: (rawMember.points && Number.isFinite(rawMember.points.uniform)) ? rawMember.points.uniform : 0,
      uniformAvg: (rawMember.points && Number.isFinite(rawMember.points.uniformAvg)) ? rawMember.points.uniformAvg : 0,
      paradeAtt: (rawMember.points && Number.isFinite(rawMember.points.paradeAtt)) ? rawMember.points.paradeAtt : 0,
      bandAtt: (rawMember.points && Number.isFinite(rawMember.points.bandAtt)) ? rawMember.points.bandAtt : 0,
      total: (rawMember.points && Number.isFinite(rawMember.points.total)) ? rawMember.points.total : 0
    },
    lastUpdated: typeof rawMember.lastUpdated === 'string' && Number.isFinite(Date.parse(rawMember.lastUpdated))
      ? rawMember.lastUpdated : null
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
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) ||
      !payload.members || typeof payload.members !== 'object' || Array.isArray(payload.members)) return null;

  var cleanMembers = Object.create(null);
  if (payload.members && typeof payload.members === 'object') {
    Object.keys(payload.members).forEach(function(key) {
      // Do not process non-member or suspicious keys
      var cleanRecord = sanitizeMasterMemberRecord(payload.members[key]);
      if (cleanRecord) {
        var nameKey = cleanRecord.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (key.toLowerCase() === nameKey && nameKey && !Object.hasOwn(cleanMembers, nameKey)) {
          cleanMembers[nameKey] = cleanRecord;
        }
      }
    });
  }

  var cleanSquads = Object.create(null);
  if (payload.squads && typeof payload.squads === 'object') {
    Object.keys(payload.squads).forEach(function(sqKey) {
      var sq = payload.squads[sqKey];
      if (sq && typeof sq === 'object' && /^(alpha|papa|zulu|hotel)\s*[0-9]+$/i.test(sqKey.trim())) {
        cleanSquads[sqKey] = {
          name: typeof sq.name === 'string' ? sq.name.trim() : sqKey,
          points: Number.isFinite(sq.points) ? sq.points : 0,
          rank: Number.isInteger(sq.rank) && sq.rank > 0 ? sq.rank : 1,
          platoon: typeof sq.platoon === 'string' ? sq.platoon.trim() : ''
        };
      }
    });
  }

  var cleanPlatoons = Object.create(null);
  if (payload.platoons && typeof payload.platoons === 'object') {
    Object.keys(payload.platoons).forEach(function(pltKey) {
      var plt = payload.platoons[pltKey];
      if (plt && typeof plt === 'object' && /^(alpha|papa|zulu|hotel)$/i.test(pltKey)) {
        cleanPlatoons[pltKey] = {
          name: typeof plt.name === 'string' ? plt.name.trim() : pltKey,
          totalPoints: Number.isFinite(plt.totalPoints) ? plt.totalPoints : 0,
          averagePoints: Number.isFinite(plt.averagePoints) ? plt.averagePoints : 0,
          squadCount: Number.isInteger(plt.squadCount) && plt.squadCount >= 0 ? plt.squadCount : 0,
          rank: Number.isInteger(plt.rank) && plt.rank > 0 ? plt.rank : 1
        };
      }
    });
  }

  return {
    lastSynced: typeof payload.lastSynced === 'string' && Number.isFinite(Date.parse(payload.lastSynced))
      ? payload.lastSynced : null,
    sheetTitle: typeof payload.sheetTitle === 'string' ? payload.sheetTitle : 'Master Attendance',
    scannedSheets: Array.isArray(payload.scannedSheets)
      ? payload.scannedSheets.filter(function(name) { return typeof name === 'string'; }).slice(0, 25) : [],
    members: cleanMembers,
    squads: cleanSquads,
    platoons: cleanPlatoons,
    _security: {
      piiStripped: true,
      dataMinimizationCompliant: true
    }
  };
}

// ── Configuration Persistence ───────────────────────────────────────────────

/**
 * Load Google Master Sheet connection configuration from Supabase bb_config
 * @returns {Promise<{sheetId: string, scriptUrl: string, syncToken: string, autoSync: boolean, piiFiltered: boolean}>}
 */
async function loadMasterSheetConfig() {
  var client = (typeof getSupaClient === 'function') ? getSupaClient() : ((typeof window !== 'undefined' && window.getSupaClient) ? window.getSupaClient() : (typeof supa !== 'undefined' ? supa : (typeof window !== 'undefined' ? window.supa : null)));
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

  var client = (typeof getSupaClient === 'function') ? getSupaClient() : ((typeof window !== 'undefined' && window.getSupaClient) ? window.getSupaClient() : (typeof supa !== 'undefined' ? supa : (typeof window !== 'undefined' ? window.supa : null)));
  if (!client) throw new Error('Master Sheet configuration service is unavailable.');
  if (cfg.scriptUrl) cfg.scriptUrl = attendanceWebhookUrl(cfg.scriptUrl);
  try {
    await client.req('POST', 'bb_config?on_conflict=key', {
      key: MASTER_SHEET_CONFIG_KEY,
      value: JSON.stringify(cfg)
    });
  } catch (_) {
    throw new Error('Master Sheet configuration could not be saved.');
  }

  if (typeof logAuditEvent === 'function') {
    logAuditEvent({
      action: 'sheets.config_update',
      targetType: 'config',
      targetId: 'bb_master_sheet_config',
      actorRole: 'officer_admin',
      details: { sheetId: (cfg && cfg.sheetId) ? '[CONFIGURED]' : 'default' }
    });
  }
  if (typeof showToast === 'function') {
    showToast('Master Sheet security configuration saved.', 'success');
  }

  return cfg;
}

// ── Ingestion & Data Fetching (Hardened ) ─────────────────────────────

function attendanceWebhookUrl(value) {
  var url;
  try { url = new URL(value); } catch (_) {
    throw new Error('Use the deployed HTTPS Google Apps Script Web App URL.');
  }
  if (url.protocol !== 'https:' || url.hostname !== 'script.google.com' ||
      url.port || url.username || url.password || url.search || url.hash ||
      !/^\/macros\/s\/[\w-]+\/exec$/.test(url.pathname)) {
    throw new Error('Use the deployed HTTPS Google Apps Script Web App URL.');
  }
  return url.href;
}

async function requestAttendanceWebhook(url, token, payload, retryRead) {
  var endpoint = attendanceWebhookUrl(url);
  if (typeof token !== 'string' || !token.trim()) throw new Error('Master Sheet sync token is required.');

  for (var attempt = 0; ; attempt++) {
    var signal = AbortSignal.timeout(4000);
    var res;
    var data;
    try {
      res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8', Accept: 'application/json' },
        body: JSON.stringify({ ...payload, token: token.trim() }),
        referrerPolicy: 'no-referrer',
        signal: signal
      });
      if (res.ok) {
        data = await res.json();
      }
    } catch (_) {
      if (res && !signal.aborted) throw new Error('Google Sheets returned an unreadable response.');
    }

    var status = res && (res.ok ? Number(data && data.status) : res.status);
    var temporary = !res || signal.aborted || status === 429 || [500, 502, 503, 504].includes(status);
    if (retryRead && temporary && attempt < 2) {
      await new Promise(function(resolve) { setTimeout(resolve, 250 * Math.pow(2, attempt)); });
      continue;
    }
    if (status === 401 || status === 403) throw new Error('Google Sheets sync rejected: Unauthorized or invalid sync token.');
    if (!res || signal.aborted) throw new Error('Google Sheets sync failed: Network connection error or timeout.');
    if (!res.ok || status >= 400) throw new Error('Google Sheets sync failed with HTTP status ' + status + '.');
    if (!data || typeof data !== 'object' || data.error) throw new Error('Google Sheets rejected the attendance request.');
    return data;
  }
}

/**
 * Pushes attendance records to Google Apps Script / Google Sheets with real CORS response validation
 * Eliminates mode: 'no-cors' so that errors, authentication failures, and network drops are properly caught
 * instead of giving false-positive success toasts.
 * @param {Object|Array} recordsOrOptions
 * @param {string} [scriptUrl]
 * @param {string} [syncToken]
 * @returns {Promise<{success: boolean, data: Object|null}>}
 */
async function syncToSheets(recordsOrOptions, scriptUrl, syncToken) {
  var options = {};
  if (Array.isArray(recordsOrOptions)) {
    options = { records: recordsOrOptions };
  } else if (recordsOrOptions && typeof recordsOrOptions === 'object') {
    options = recordsOrOptions;
  }

  var targetUrl = scriptUrl || options.scriptUrl;
  var token = syncToken || options.syncToken;

  if (!targetUrl || !token) {
    var cfg = await loadMasterSheetConfig();
    if (!targetUrl) targetUrl = cfg.scriptUrl;
    if (!token) token = cfg.syncToken;
  }

  if (!targetUrl) {
    var errNoUrl = new Error('Google Sheets Web App URL is not configured.');
    if (typeof showToast === 'function') {
      showToast(errNoUrl.message, 'warning');
    }
    throw errNoUrl;
  }

  if (!Array.isArray(options.records) || !options.records.length) {
    throw new Error('At least one attendance record is required.');
  }
  var records = options.records.map(function(record) {
    if (!record || typeof record.name !== 'string' || !record.name.trim() || record.name.length > 100) {
      throw new Error('Every attendance record requires a member name.');
    }
    var clean = { name: record.name.trim() };
    if (typeof record.present === 'boolean' || record.present === 0 || record.present === 1) clean.present = record.present;
    if (typeof record.late === 'boolean') clean.late = record.late;
    if (typeof record.excused === 'boolean') clean.excused = record.excused;
    return clean;
  });
  var payload = { action: 'syncAttendance', records: records };
  if (typeof options.sheetId === 'string' && /^[\w-]+$/.test(options.sheetId)) payload.sheetId = options.sheetId;
  if (options.weekDate) {
    var weekDate = new Date(options.weekDate);
    if (typeof options.weekDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(options.weekDate) ||
        !Number.isFinite(weekDate.getTime()) || weekDate.toISOString().slice(0, 10) !== options.weekDate) {
      throw new Error('Invalid attendance week date.');
    }
    payload.weekDate = options.weekDate;
  }
  if (typeof options.weekLabel === 'string' && /^Week \d{1,2}$/i.test(options.weekLabel)) payload.weekLabel = options.weekLabel;

  // A failed write response may arrive after the sheet was updated.
  var responseData = await requestAttendanceWebhook(targetUrl, token, payload, false);
  if (responseData.success !== true) throw new Error('Google Sheets did not confirm the attendance write.');

  if (typeof logAuditEvent === 'function') {
    logAuditEvent({
      action: 'sheets.export_sync',
      targetType: 'attendance',
      targetId: 'master_attendance',
      actorRole: 'officer_admin',
      details: { records_count: records.length }
    });
  }
  if (typeof showToast === 'function') {
    showToast('Attendance successfully synced to Google Sheets!', 'success');
  }

  return { success: true, data: responseData };
}

var syncAttendanceToSheets = syncToSheets;

/**
 * Fetch attendance & performance data directly from a deployed Google Apps Script Web App
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

  var rawData = await requestAttendanceWebhook(scriptUrl, syncToken, { action: 'getAttendance' }, true);
  var sanitizedData = sanitizeMasterAttendancePayload(rawData);
  if (!sanitizedData || !sanitizedData.lastSynced || !Object.keys(sanitizedData.members).length) {
    throw new Error('The Master Sheet returned no valid attendance records.');
  }

  // Publish only a complete snapshot. Keep the previous snapshot if saving fails.
  var client = (typeof getSupaClient === 'function') ? getSupaClient() : ((typeof window !== 'undefined' && window.getSupaClient) ? window.getSupaClient() : (typeof supa !== 'undefined' ? supa : (typeof window !== 'undefined' ? window.supa : null)));
  if (!client) throw new Error('The attendance database is unavailable.');
  try {
    await client.req('POST', 'bb_config?on_conflict=key', {
      key: MASTER_ATTENDANCE_KEY,
      value: JSON.stringify(sanitizedData),
      updated_at: new Date().toISOString()
    });
  } catch (_) {
    throw new Error('Master Sheet data was read but could not be saved. Please try again.');
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
  function scriptString(value) {
    return String(value).replace(/['\\\u0000-\u001f\u2028\u2029]/g, function(character) {
      return '\\u' + character.charCodeAt(0).toString(16).padStart(4, '0');
    });
  }

  return String.raw`// ==============================================================================
// 1st Petaling Jaya Boys' Brigade - Master Attendance Sheet Ingestion Script
// Hardened Security Edition
// 
// Paste this code into: Google Sheets > Extensions > Apps Script
// Sets up custom menu 'BB Portal' in your Master Attendance Spreadsheet.
// ==============================================================================

var PORTAL_SUPABASE_URL = '${scriptString(url)}';
var PORTAL_SUPABASE_KEY = '${scriptString(key)}';
var SYNC_TOKEN          = '${scriptString(token)}';

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

function handleIncomingRequest(e) {
  return handleIncomingApiRequest(e);
}

function handleIncomingApiRequest(e) {
  var p = Object.assign(Object.create(null), e && e.parameter);
  if (e && e.postData && e.postData.contents) {
    try {
      var bodyObj = JSON.parse(e.postData.contents);
      if (bodyObj && typeof bodyObj === 'object') {
        Object.assign(p, bodyObj);
      }
    } catch (_) {}
  }
  var reqToken = String(p.token || p.key || p.secret || '').trim();
  var expectedToken = PropertiesService.getScriptProperties().getProperty('SYNC_TOKEN') || SYNC_TOKEN;

  // 1. Enforce Shared-Secret / Proxy Token Authentication (safe check)
  if (!expectedToken || reqToken !== expectedToken.trim()) {
      return ContentService.createTextOutput(JSON.stringify({
        error: 'Unauthorized: Invalid or missing sync token. Update token in Google Sheet under BB Portal > Configure Sync Token.',
        status: 401
      })).setMimeType(ContentService.MimeType.JSON);
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
  } else if (action === 'sendVerificationEmail') {
    var recipient = (p.email || '').trim();
    var code = (p.code || '').trim();
    var memberName = (p.name || 'Member').trim();
    if (!recipient || !code) {
      return ContentService.createTextOutput(JSON.stringify({
        error: 'Missing email or verification code',
        status: 400
      })).setMimeType(ContentService.MimeType.JSON);
    }
    try {
      var subject = "1st PJ Boys' Brigade - Registration Verification Code: " + code;
      var htmlBody = '<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px;background:#ffffff;">' +
        '<div style="text-align:center;margin-bottom:20px;">' +
        '<h2 style="color:#0f172a;margin:0 0 6px;">1st Petaling Jaya Boys\' Brigade</h2>' +
        '<p style="color:#64748b;font-size:14px;margin:0;">Web Portal Account Verification</p>' +
        '</div>' +
        '<p style="font-size:15px;color:#334155;line-height:1.5;">Hello <strong>' + memberName + '</strong>,</p>' +
        '<p style="font-size:14px;color:#475569;line-height:1.5;">Use the following 6-digit verification code to complete your registration:</p>' +
        '<div style="background:#f1f5f9;border-radius:8px;padding:16px;text-align:center;margin:24px 0;">' +
        '<span style="font-family:monospace;font-size:32px;font-weight:700;letter-spacing:8px;color:#0f172a;">' + code + '</span>' +
        '</div>' +
        '<p style="font-size:12px;color:#94a3b8;line-height:1.4;">This code is valid for 15 minutes. If you did not attempt to register on the 1st PJ BB Web Portal, you can safely ignore this email.</p>' +
        '<hr style="border:none;border-top:1px solid #f1f5f9;margin:20px 0;" />' +
        '<p style="font-size:11px;color:#94a3b8;text-align:center;margin:0;">Sure &amp; Stedfast &bull; 1st Petaling Jaya Company</p>' +
        '</div>';
      MailApp.sendEmail({
        to: recipient,
        subject: subject,
        htmlBody: htmlBody
      });
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        message: 'Verification email dispatched to ' + recipient
      })).setMimeType(ContentService.MimeType.JSON);
    } catch (mailErr) {
      return ContentService.createTextOutput(JSON.stringify({
        error: 'Failed to send email: ' + mailErr.message,
        status: 500
      })).setMimeType(ContentService.MimeType.JSON);
    }
  } else if (action === 'broadcastAnnouncement') {
    var title = (p.title || 'Company Announcement').trim();
    var date = (p.date || '').trim();
    var summary = (p.summary || '').trim();
    var bodyHtml = (p.body || p.html || summary).trim();
    var portalUrl = (p.portalUrl || 'https://1st-petaling-jaya-boys-brigade.github.io/1stPetalingJayaBoys-Brigade-/').trim();
    var recipientsRaw = p.recipients || '';
    var recipientList = [];
    if (Array.isArray(recipientsRaw)) {
      recipientList = recipientsRaw;
    } else if (typeof recipientsRaw === 'string') {
      recipientList = recipientsRaw.split(',').map(function(s) { return s.trim(); }).filter(function(s) { return s.indexOf('@') !== -1; });
    }

    if (!recipientList.length) {
      return ContentService.createTextOutput(JSON.stringify({
        error: 'Missing recipient email list for announcement broadcast',
        status: 400
      })).setMimeType(ContentService.MimeType.JSON);
    }

    try {
      var subject = '📢 [1st PJ BB Announcement] ' + title;
      var htmlBody = '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:28px 24px;border:1px solid #e2e8f0;border-radius:14px;background:#ffffff;color:#1e293b;">' +
        '<div style="text-align:center;margin-bottom:20px;">' +
        '<div style="display:inline-block;padding:6px 14px;background:#fef3c7;border-radius:50px;color:#b45309;font-weight:700;font-size:12px;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:10px;">' +
        '📢 Company Announcement' +
        '</div>' +
        '<h2 style="color:#0f172a;margin:0 0 6px;font-size:22px;font-weight:700;">1st Petaling Jaya Boys\' Brigade</h2>' +
        '<p style="color:#64748b;font-size:13px;margin:0;">Web Portal Announcement Update' + (date ? ' &bull; ' + date : '') + '</p>' +
        '</div>' +
        '<div style="background:#0f172a;color:#ffffff;border-radius:10px;padding:18px 20px;margin-bottom:20px;">' +
        '<h3 style="margin:0;font-size:18px;font-weight:700;color:#facc15;">' + title + '</h3>' +
        '</div>' +
        '<div style="font-size:14.5px;color:#334155;line-height:1.7;margin-bottom:24px;">' +
        (bodyHtml ? bodyHtml : summary) +
        '</div>' +
        '<div style="text-align:center;margin:28px 0 16px;">' +
        '<a href="' + portalUrl + '" target="_blank" style="display:inline-block;background:#eab308;color:#0f172a;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:700;font-size:14px;">' +
        'View on BB Web Portal &rarr;' +
        '</a>' +
        '</div>' +
        '<hr style="border:none;border-top:1px solid #f1f5f9;margin:24px 0 16px;" />' +
        '<p style="font-size:11px;color:#94a3b8;text-align:center;margin:0;line-height:1.5;">' +
        'You are receiving this notification because you are a registered member or parent of 1st Petaling Jaya Boys\' Brigade.<br/>' +
        'Sure &amp; Stedfast &bull; 1st Petaling Jaya Company' +
        '</p>' +
        '</div>';

      if (recipientList.length === 1) {
        MailApp.sendEmail({
          to: recipientList[0],
          subject: subject,
          htmlBody: htmlBody
        });
      } else {
        MailApp.sendEmail({
          to: '1stpjbb.mailer@gmail.com',
          bcc: recipientList.join(','),
          subject: subject,
          htmlBody: htmlBody
        });
      }

      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        count: recipientList.length,
        message: 'Announcement email broadcast to ' + recipientList.length + ' members'
      })).setMimeType(ContentService.MimeType.JSON);
    } catch (mailErr) {
      return ContentService.createTextOutput(JSON.stringify({
        error: 'Failed to broadcast announcement: ' + mailErr.message,
        status: 500
      })).setMimeType(ContentService.MimeType.JSON);
    }
  } else if (action === 'sendSecurityAlertEmail') {
    var recipient = (p.email || '').trim();
    var memberName = (p.name || 'Member').trim();
    var device = (p.device || 'New Device').trim();
    var browser = (p.browser || 'Web Browser').trim();
    var time = (p.time || new Date().toLocaleString()).trim();
    var portalUrl = (p.portalUrl || 'https://1st-petaling-jaya-boys-brigade.github.io/1stPetalingJayaBoys-Brigade-/').trim();

    if (!recipient) {
      return ContentService.createTextOutput(JSON.stringify({
        error: 'Missing recipient email for security alert',
        status: 400
      })).setMimeType(ContentService.MimeType.JSON);
    }

    try {
      var subject = 'Security alert - A new sign-in on ' + device + ' device';
      var htmlBody = '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;max-width:540px;margin:0 auto;padding:28px 24px;border:1px solid #e2e8f0;border-radius:14px;background:#ffffff;color:#1e293b;">' +
        '<div style="text-align:center;margin-bottom:24px;">' +
        '<div style="display:inline-block;padding:8px 14px;background:#fef3c7;border-radius:50px;color:#b45309;font-weight:700;font-size:12px;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:12px;">' +
        '🛡️ Security Alert' +
        '</div>' +
        '<h2 style="color:#0f172a;margin:0 0 6px;font-size:22px;font-weight:700;">1st Petaling Jaya Boys\' Brigade</h2>' +
        '<p style="color:#64748b;font-size:14px;margin:0;">Web Portal Security &amp; Sign-In Notice</p>' +
        '</div>' +
        '<p style="font-size:15px;color:#334155;line-height:1.6;margin-top:0;">' +
        'Hello <strong>' + memberName + '</strong>,' +
        '</p>' +
        '<p style="font-size:15px;color:#334155;line-height:1.6;">' +
        'We noticed a new sign-in to your 1stPJBB Portal account on a <strong>' + device + '</strong> device.' +
        '</p>' +
        '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin:20px 0;">' +
        '<table style="width:100%;font-size:13px;border-collapse:collapse;color:#334155;">' +
        '<tr><td style="padding:6px 0;color:#64748b;width:90px;"><strong>Device:</strong></td><td style="padding:6px 0;font-weight:600;color:#0f172a;">' + device + '</td></tr>' +
        '<tr><td style="padding:6px 0;color:#64748b;"><strong>Browser:</strong></td><td style="padding:6px 0;font-weight:600;color:#0f172a;">' + browser + '</td></tr>' +
        '<tr><td style="padding:6px 0;color:#64748b;"><strong>Time:</strong></td><td style="padding:6px 0;font-weight:600;color:#0f172a;">' + time + ' (Malaysia Time)</td></tr>' +
        '</table>' +
        '</div>' +
        '<p style="font-size:14px;color:#475569;line-height:1.6;">' +
        'If this was you, you don&rsquo;t need to do anything.' +
        '</p>' +
        '<p style="font-size:14px;color:#475569;line-height:1.6;">' +
        'If not, we&rsquo;ll help you secure your account. Please reset your password immediately or inform a Section Officer.' +
        '</p>' +
        '<div style="text-align:center;margin:26px 0 16px;">' +
        '<a href="' + portalUrl + '" target="_blank" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:14px;">' +
        'Review Account Security' +
        '</a>' +
        '</div>' +
        '<hr style="border:none;border-top:1px solid #f1f5f9;margin:24px 0 16px;" />' +
        '<p style="font-size:11px;color:#94a3b8;text-align:center;margin:0;line-height:1.5;">' +
        'Sure &amp; Stedfast &bull; 1st Petaling Jaya Company<br/>' +
        'Trinity Methodist Church Petaling Jaya' +
        '</p>' +
        '</div>';

      MailApp.sendEmail({
        to: recipient,
        subject: subject,
        htmlBody: htmlBody
      });

      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        message: 'Security alert dispatched to ' + recipient
      })).setMimeType(ContentService.MimeType.JSON);
    } catch (mailErr) {
      return ContentService.createTextOutput(JSON.stringify({
        error: 'Failed to send security alert: ' + mailErr.message,
        status: 500
      })).setMimeType(ContentService.MimeType.JSON);
    }
  } else if (action === 'verifyTurnstile') {
    var turnstileToken = (p.token || '').trim();
    if (!turnstileToken) {
      return ContentService.createTextOutput(JSON.stringify({
        error: 'Missing Turnstile verification token',
        status: 400
      })).setMimeType(ContentService.MimeType.JSON);
    }
    try {
      var turnstileSecret = (typeof SCRIPT_PROP !== 'undefined' && SCRIPT_PROP.getProperty('TURNSTILE_SECRET_KEY'))
        ? SCRIPT_PROP.getProperty('TURNSTILE_SECRET_KEY')
        : '1x0000000000000000000000000000000AA';
      var cfResponse = UrlFetchApp.fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'post',
        payload: {
          secret: turnstileSecret,
          response: turnstileToken
        },
        muteHttpExceptions: true
      });
      var cfData = JSON.parse(cfResponse.getContentText());
      return ContentService.createTextOutput(JSON.stringify(cfData))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (cfErr) {
      return ContentService.createTextOutput(JSON.stringify({
        error: 'Cloudflare Turnstile verification failed: ' + cfErr.message,
        status: 502
      })).setMimeType(ContentService.MimeType.JSON);
    }
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
      var warnMsg = '⚠️ CRITICAL PRIVACY ALERT:\n\n' +
        'This Google Sheet is currently shared as "Anyone with the link can ' + 
        (permission === DriveApp.Permission.EDIT ? 'EDIT' : 'VIEW') + '"!\n\n' +
        'Anyone who gets this link could access the entire Master Sheet. To protect member data under BB Child Safety & PDPA rules, please change sharing to "Restricted" (Specific officers and NCOs only).';
      notifyUser(warnMsg);
      return { secure: false, access: String(access), permission: String(permission), warning: warnMsg };
    }
    notifyUser('Sharing Security Verified: This Master Sheet is RESTRICTED to specific officers. It is not publicly accessible via link.');
    return { secure: true, access: 'Restricted' };
  } catch (err) {
    Logger.log('auditSheetSharingSecurity note: ' + err.message);
    return { secure: false, access: 'Sharing could not be verified' };
  }
}

/**
 * UI to view or update the active sync token
 */
function configureSyncTokenUI() {
  var ui = SpreadsheetApp.getUi();
  var resp = ui.prompt('Configure Sync Token', 'Enter a new sync token (or leave empty to keep it):', ui.ButtonSet.OK_CANCEL);
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
    notifyUser('Active Auto-Sync Triggers (' + active.length + '):\n\n' + active.join('\n') + '\n\nAuto-sync is active and running in the background.');
  } else {
    notifyUser('Auto-Sync is currently DISABLED.\n\nTo enable, click:\nBB Portal > Enable Immediate Auto-Sync (On Edit & Change)');
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
  var members = Object.create(null);
  var ambiguousMembers = Object.create(null);
  var missingTotals = Object.create(null);
  var squads = {};
  var scannedSheets = [];

  // 1. Process Platoon Tabs: Alpha, Papa, Zulu, Hotel
  var platoonNames = ['Alpha', 'Papa', 'Zulu', 'Hotel'];
  platoonNames.forEach(function(plt) {
    var sheet = ss.getSheetByName('Platoon ' + plt) || ss.getSheetByName(plt);
    if (!sheet) return;

    scannedSheets.push(sheet.getName());
    var data = sheet.getDataRange().getValues();

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
      if (!normKey || ambiguousMembers[normKey]) continue;
      if (Object.prototype.hasOwnProperty.call(members, normKey)) {
        delete members[normKey];
        ambiguousMembers[normKey] = true;
        continue;
      }
      var rank = colMap.rank !== -1 ? String(row[colMap.rank] || '').trim() : '';
      var squad = colMap.squad !== -1 ? String(row[colMap.squad] || '').trim() : (plt + ' Platoon');
      var totalPts = colMap.totalPts !== -1 ? parseOptionalNumber(row[colMap.totalPts]) : null;
      missingTotals[normKey] = totalPts === null;
      var bandPts = colMap.bandPts !== -1 ? parseNumber(row[colMap.bandPts]) : 0;
      var bandAttPct = colMap.bandAtt !== -1 ? parsePercentage(row[colMap.bandAtt]) : 0;
      var paradePts = colMap.paradePts !== -1 ? parseNumber(row[colMap.paradePts]) : 0;
      var paradeAttPct = colMap.paradeAtt !== -1 ? parsePercentage(row[colMap.paradeAtt]) : 0;
      var uniformPts = colMap.uniformPts !== -1 ? parseNumber(row[colMap.uniformPts]) : 0;

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
        uniform: uniformPts,
          uniformAvg: 0,
          paradeAtt: paradePts,
          bandAtt: bandPts,
          total: totalPts === null ? Math.round((uniformPts + paradePts + bandPts) * 100) / 100 : totalPts
        },
        lastUpdated: new Date().toISOString()
      };
    }
  });

  // 2. Process Band Attendance Tab
  var bandSheet = ss.getSheetByName('Band Attendance') ||
    ss.getSheetByName('Band Attendance ' + Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy'));
  if (bandSheet) {
    scannedSheets.push(bandSheet.getName());
    var bData = bandSheet.getDataRange().getValues();
    var bHeaderRow = -1;
    var bColMap = { name: 0, section: 1, squad: 2, points: 3, att: 4 };

    for (var r = 0; r < Math.min(10, bData.length); r++) {
      var row = bData[r].map(function(c) { return String(c || '').toLowerCase().trim(); });
      var nIdx = row.findIndex(function(h) { return h === 'name' || h === 'member name' || h === 'nama'; });
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
        if (!normKey || ambiguousMembers[normKey]) continue;
        var section = bColMap.section !== -1 ? String(row[bColMap.section] || '').trim() : '';
        var bPts = bColMap.points !== -1 ? parseOptionalNumber(row[bColMap.points]) : null;
        var bAtt = bColMap.att !== -1 && parseOptionalNumber(row[bColMap.att]) !== null
          ? parsePercentage(row[bColMap.att]) : null;

        if (members[normKey]) {
          members[normKey].isBandMember = true;
          if (section) members[normKey].bandSection = section;
          if (bAtt !== null) members[normKey].bandAttendance.percentage = bAtt;
          if (bPts !== null) {
            var points = members[normKey].points;
            if (missingTotals[normKey]) points.total = Math.round((points.total + bPts - points.bandAtt) * 100) / 100;
            points.bandAtt = bPts;
          }
        } else {
          members[normKey] = {
            name: rawName,
            rank: '',
            platoon: 'Band',
            squad: bColMap.squad !== -1 ? String(row[bColMap.squad] || '').trim() : '',
            isBandMember: true,
            bandSection: section,
            paradeAttendance: { percentage: 0 },
            bandAttendance: { percentage: bAtt === null ? 0 : bAtt },
            points: { uniform: 0, uniformAvg: 0, paradeAtt: 0, bandAtt: bPts === null ? 0 : bPts, total: bPts === null ? 0 : bPts },
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
  if (lbSheet) {
    scannedSheets.push(lbSheet.getName());
    var lbData = lbSheet.getDataRange().getValues();
    for (var r = 0; r < lbData.length; r++) {
      var row = lbData[r];
      for (var c = 0; c < row.length; c++) {
        var cellVal = String(row[c] || '').trim();
        var m = cellVal.match(/^(ALPHA|PAPA|ZULU)\s*([0-9]+)$/i);
        if (m) {
          var squadName = (m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase()) + ' ' + m[2];
          var pts = null;
          for (var nc = c + 1; nc < row.length; nc++) {
            if (/^(ALPHA|PAPA|ZULU|HOTEL)\s*[0-9]+$/i.test(String(row[nc]).trim())) break;
            pts = parseOptionalNumber(row[nc]);
            if (pts !== null) break;
          }
          if (pts !== null) {
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
    if (!pSquads.length) return;
    var sum = 0;
    pSquads.forEach(function(k) { sum += (squads[k].points || 0); });
    var avg = pSquads.length > 0 ? Math.round(sum / pSquads.length) : 0;
    platoons[plt] = {
      name: plt,
      totalPoints: sum,
      averagePoints: avg,
      squadCount: pSquads.length
    };
  });

  var sortedPlatoons = Object.keys(platoons).sort(function(a, b) {
    return platoons[b].averagePoints - platoons[a].averagePoints;
  });
  sortedPlatoons.forEach(function(plt, idx) {
    var previous = platoons[sortedPlatoons[idx - 1]];
    platoons[plt].rank = previous && previous.averagePoints === platoons[plt].averagePoints ? previous.rank : idx + 1;
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
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    if (!isBackground) notifyUser('Attendance sync is already running. Please try again.');
    return;
  }
  try {
    publishMasterAttendance(isBackground);
  } finally {
    lock.releaseLock();
  }
}

function publishMasterAttendance(isBackground) {
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
    var errorMsg = 'Attendance sync failed (HTTP ' + code + ').';
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
  var value = parseOptionalNumber(val);
  return value === null ? 0 : value;
}

function parseOptionalNumber(val) {
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  if (typeof val !== 'string' || !/^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?%?$/.test(val.trim())) return null;
  var number = Number(val.trim().replace(/[, %]/g, ''));
  return Number.isFinite(number) ? number : null;
}

function parsePercentage(val) {
  var number = parseNumber(val);
  if (typeof val === 'number' && number > 0 && number <= 1) number *= 100;
  return Math.max(0, Math.min(100, number));
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
  window.syncToSheets                     = syncToSheets;
  window.syncAttendanceToSheets           = syncAttendanceToSheets;
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
    syncToSheets: syncToSheets,
    syncAttendanceToSheets: syncAttendanceToSheets,
    fetchMasterAttendanceFromGAS: fetchMasterAttendanceFromGAS,
    getGoogleAppsScriptTemplate: getGoogleAppsScriptTemplate
  };
}
