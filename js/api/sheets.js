/**
 * 1st Petaling Jaya Boys' Brigade Portal
 * Google Sheets & Google Apps Script Sync Client (TSK-007)
 *
 * Handles date formatting for sheet headers, Google Apps Script Web App
 * integration, and sheet configuration storage.
 */

// ── Date Format Helpers ─────────────────────────────────────────────────────

/**
 * Format ISO date string "YYYY-MM-DD" to short format "D/M" (e.g. "2026-04-11" -> "11/4")
 * Used by Band Attendance sheet (Row 2 headers).
 * @param {string} iso
 * @returns {string}
 */
function fmtDateShort(iso) {
  if (!iso) return '';
  var p = iso.split('-');
  if (p.length < 3) return iso;
  return parseInt(p[2], 10) + '/' + parseInt(p[1], 10);
}

/**
 * Format ISO date string "YYYY-MM-DD" to long format "Dth Month YYYY" (e.g. "2026-04-11" -> "11th April 2026")
 * Used by Squad/Platoon sheets (Row 6 headers).
 * @param {string} iso
 * @returns {string}
 */
function fmtDateLong(iso) {
  if (!iso) return '';
  var p = iso.split('-');
  if (p.length < 3) return iso;
  var d = parseInt(p[2], 10), m = parseInt(p[1], 10), y = p[0];
  var suf = (d === 1 || d === 21 || d === 31) ? 'st' : (d === 2 || d === 22) ? 'nd' : (d === 3 || d === 23) ? 'rd' : 'th';
  var months = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return d + suf + ' ' + (months[m] || '') + ' ' + y;
}

// ── Google Apps Script Web App Dispatcher ───────────────────────────────────

/**
 * Dispatch attendance records to Google Apps Script Web App endpoint.
 * Uses fire-and-forget fetch with mode: 'no-cors' to prevent CORS blocking from Google Apps Script redirect.
 * @param {Object} options
 * @param {string} options.scriptUrl - Web app deployment URL ending in /exec
 * @param {string} options.sheetId - Target Google Sheet ID
 * @param {Array} options.records - Array of member attendance record objects
 * @param {string} options.weekLabel - Week identifier (e.g. "Week 1")
 * @param {string} [options.weekDate] - Raw ISO date string
 * @param {string} [options.weekDateShort] - Formatted short date (e.g. "11/4")
 * @param {string} [options.weekDateLong] - Formatted long date (e.g. "11th April 2026")
 * @returns {Promise<Response>}
 */
async function syncAttendanceToSheets(options) {
  options = options || {};
  var scriptUrl = options.scriptUrl;
  var sheetId = options.sheetId;
  var records = options.records || [];
  var weekLabel = options.weekLabel || '';
  var weekDate = options.weekDate || '';
  var weekDateShort = options.weekDateShort || fmtDateShort(weekDate);
  var weekDateLong = options.weekDateLong || fmtDateLong(weekDate);

  if (!scriptUrl) {
    throw new Error('Google Apps Script Web App URL is not configured.');
  }

  var payload = {
    sheetId: sheetId,
    records: records,
    weekLabel: weekLabel,
    weekDate: weekDate,
    weekDateShort: weekDateShort,
    weekDateLong: weekDateLong
  };

  // mode: 'no-cors' ensures browser sends POST payload without being blocked by Google's 302 redirect
  return fetch(scriptUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(payload),
    mode: 'no-cors'
  });
}

// ── Sheet Configuration Helpers ─────────────────────────────────────────────

var ATT_SHEET_KEY = 'bb_att_sheet';

/**
 * Load saved Google Sheet ID and Script URL from Supabase bb_config
 * @returns {Promise<{sheetId: string, scriptUrl: string}>}
 */
async function loadAttSheetConfig() {
  var client = (typeof supa !== 'undefined' ? supa : (typeof window !== 'undefined' ? window.supa : null));
  var cfg = {};
  if (client) {
    try {
      var r = await client.get('bb_config?key=eq.' + ATT_SHEET_KEY + '&select=value');
      if (r && r.length) cfg = JSON.parse(r[0].value || '{}');
    } catch (e) {
      console.warn('Failed to load sheet config:', e);
    }
  }

  var sid = (typeof document !== 'undefined') ? document.getElementById('att-sheet-id-input') : null;
  var url = (typeof document !== 'undefined') ? document.getElementById('att-script-url-input') : null;
  if (sid) sid.value = cfg.sheetId || '';
  if (url) url.value = cfg.scriptUrl || '';

  if (typeof window !== 'undefined') {
    window._attSheetId = cfg.sheetId || '';
    window._attScriptUrl = cfg.scriptUrl || '';
  }
  return cfg;
}

/**
 * Save Google Sheet ID and Script URL into Supabase bb_config
 * @returns {Promise<void>}
 */
async function saveAttSheetConfig() {
  var sid = '';
  var url = '';
  if (typeof document !== 'undefined') {
    sid = ((document.getElementById('att-sheet-id-input') || {}).value || '').trim();
    url = ((document.getElementById('att-script-url-input') || {}).value || '').trim();
  }

  var client = (typeof supa !== 'undefined' ? supa : (typeof window !== 'undefined' ? window.supa : null));
  if (client) {
    try {
      var configVal = { sheetId: sid, scriptUrl: url };
      await client.req('POST', 'bb_config?on_conflict=key', { key: ATT_SHEET_KEY, value: JSON.stringify(configVal) });
    } catch (e) {
      try {
        await client.patch('bb_config?key=eq.' + ATT_SHEET_KEY, { value: JSON.stringify({ sheetId: sid, scriptUrl: url }) });
      } catch (e2) {
        console.error('saveAttSheetConfig error:', e2);
      }
    }
  }

  if (typeof window !== 'undefined') {
    window._attSheetId = sid;
    window._attScriptUrl = url;
  }

  var d = (typeof document !== 'undefined') ? document.getElementById('att-sheet-id-display') : null;
  if (d) d.textContent = sid ? 'Sheet connected' : 'Not configured';

  if (typeof alert === 'function') {
    alert('Sheet config saved!');
  }
}

// ── Global Window Exports ───────────────────────────────────────────────────

if (typeof window !== 'undefined') {
  window.fmtDateShort = fmtDateShort;
  window.fmtDateLong = fmtDateLong;
  window.syncAttendanceToSheets = syncAttendanceToSheets;
  window.loadAttSheetConfig = loadAttSheetConfig;
  window.saveAttSheetConfig = saveAttSheetConfig;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    fmtDateShort: fmtDateShort,
    fmtDateLong: fmtDateLong,
    syncAttendanceToSheets: syncAttendanceToSheets,
    loadAttSheetConfig: loadAttSheetConfig,
    saveAttSheetConfig: saveAttSheetConfig
  };
}
