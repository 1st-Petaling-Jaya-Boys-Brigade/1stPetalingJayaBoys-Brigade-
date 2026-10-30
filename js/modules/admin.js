/**
 * 1st Petaling Jaya Boys' Brigade Portal - Admin Console Master Controller (TSK-011)
 * File: js/modules/admin.js
 *
 * Extracts back-office navigation, subtabs, and admin CRUD handlers across
 * members, orders, tasks, and configs from index.html into a dedicated controller module.
 */

(function(global) {
  'use strict';

  // ── Configuration & Constants ─────────────────────────────────────────────
  var ADMIN_SECTIONS = [
    'members',
    'orders',
    'uniform',
    'tasks',
    'announcements',
    'badges',
    'gallery',
    'attendance',
    'resources',
    'calendar'
  ];

  var RANK_ORDER = [
    'Recruit',
    'Private',
    'Lance Corporal',
    'Corporal',
    'Sergeant',
    'Staff Sergeant'
  ];

  var DEFAULT_DEPT_CONFIG = {
    logistics:   { label: 'Logistics',       color: '#42a5f5', cls: 'dept-logistics'   },
    secretariat: { label: 'Secretariat',     color: '#ce93d8', cls: 'dept-secretariat' },
    media:       { label: 'Media',           color: '#ffb74d', cls: 'dept-media'       },
    band:        { label: 'Band',            color: '#26c6da', cls: 'dept-band'        },
    awards:      { label: 'Awards & Badges', color: '#ab47bc', cls: 'dept-awards'      },
    general:     { label: 'General',         color: '#78909c', cls: 'dept-general'     }
  };

  // ── Internal State ────────────────────────────────────────────────────────
  var _adminSortBy     = 'name';
  var _adminMembers    = {};
  var _adminTaskFilter = 'all';
  var _allAdminTasks   = [];

  function getSupabaseClient() {
    if (typeof window !== 'undefined' && window.supa) return window.supa;
    if (typeof global !== 'undefined' && global.supa) return global.supa;
    if (typeof getSupaClient === 'function') return getSupaClient();
    if (typeof window !== 'undefined' && typeof window.getSupaClient === 'function') return window.getSupaClient();
    if (typeof supa !== 'undefined') return supa;
    return null;
  }

  var DEFAULT_ADMIN_HASH = 'e73d72da113ab72c21c2a07d2a4b72c5d28885ce29bd22abcb6697a8cd79ec7f';

  function getAdminPasswordHash() {
    if (typeof global !== 'undefined' && global.ADMIN_PASSWORD_HASH) return global.ADMIN_PASSWORD_HASH;
    if (typeof ADMIN_PASSWORD_HASH !== 'undefined') return ADMIN_PASSWORD_HASH;
    if (typeof window !== 'undefined' && window.ADMIN_PASSWORD_HASH) return window.ADMIN_PASSWORD_HASH;
    return DEFAULT_ADMIN_HASH;
  }

  async function verifyAdminPassword(inputPass) {
    if (!inputPass) return false;
    var expectedHash = getAdminPasswordHash();
    var inputHash = '';

    if (typeof computeSha256 === 'function') {
      inputHash = await computeSha256(inputPass);
    } else if (typeof window !== 'undefined' && typeof window.computeSha256 === 'function') {
      inputHash = await window.computeSha256(inputPass);
    } else if (typeof crypto !== 'undefined') {
      var cryptoObj = typeof window !== 'undefined' && window.crypto ? window.crypto : (crypto.webcrypto || crypto);
      if (cryptoObj && cryptoObj.subtle && typeof TextEncoder !== 'undefined') {
        var enc = new TextEncoder();
        var buf = await cryptoObj.subtle.digest('SHA-256', enc.encode(inputPass));
        var bytes = new Uint8Array(buf);
        for (var i = 0; i < bytes.length; i++) {
          var b = bytes[i].toString(16);
          inputHash += b.length === 1 ? '0' + b : b;
        }
      }
    }

    if (inputHash && expectedHash) {
      if (typeof window !== 'undefined' && typeof window.timingSafeEqualToken === 'function') {
        return window.timingSafeEqualToken(inputHash, expectedHash);
      }
      if (typeof timingSafeEqualToken === 'function') {
        return timingSafeEqualToken(inputHash, expectedHash);
      }
      return inputHash.toLowerCase() === expectedHash.toLowerCase();
    }
    return false;
  }

  function getDeptConfig() {
    if (typeof global !== 'undefined' && global.DEPT_CONFIG) return global.DEPT_CONFIG;
    if (typeof DEPT_CONFIG !== 'undefined') return DEPT_CONFIG;
    return DEFAULT_DEPT_CONFIG;
  }

  // ── Cryptographic Session & Gate Hardening (TSK-030) ──────────────────────
  var SESSION_MAX_LIFETIME_MS = 60 * 60 * 1000; // 60 minutes absolute lifetime
  var SESSION_IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes idle timeout
  var MAX_LOGIN_FAILURES      = 5;
  var BASE_LOCKOUT_MS         = 30 * 1000;      // 30 seconds
  var MAX_LOCKOUT_MS          = 300 * 1000;     // 5 minutes max

  var _adminSessionToken  = null;
  var _adminSessionData   = null;
  var _adminSessionSalt   = '';
  var _adminLoginFailures = 0;
  var _adminLockoutUntil  = 0;
  var _adminDomObserver   = null;

  function generateSecureHex(len) {
    var bytesCount = len || 16;
    if (typeof crypto !== 'undefined') {
      var cryptoObj = typeof window !== 'undefined' && window.crypto ? window.crypto : (crypto.webcrypto || crypto);
      if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
        var arr = new Uint8Array(bytesCount);
        cryptoObj.getRandomValues(arr);
        var hex = '';
        for (var i = 0; i < arr.length; i++) {
          var b = arr[i].toString(16);
          hex += b.length === 1 ? '0' + b : b;
        }
        return hex;
      }
    }
    var fallback = '';
    for (var j = 0; j < bytesCount; j++) {
      var r = Math.floor(Math.random() * 256).toString(16);
      fallback += r.length === 1 ? '0' + r : r;
    }
    return fallback;
  }

  async function computeHmacSha256(secretKeyHex, messageStr) {
    if (typeof crypto !== 'undefined') {
      var cryptoObj = typeof window !== 'undefined' && window.crypto ? window.crypto : (crypto.webcrypto || crypto);
      if (cryptoObj && cryptoObj.subtle && typeof TextEncoder !== 'undefined') {
        var enc = new TextEncoder();
        var key = await cryptoObj.subtle.importKey(
          'raw',
          enc.encode(secretKeyHex),
          { name: 'HMAC', hash: 'SHA-256' },
          false,
          ['sign']
        );
        var sigBuf = await cryptoObj.subtle.sign('HMAC', key, enc.encode(messageStr));
        var bytes = new Uint8Array(sigBuf);
        var hex = '';
        for (var i = 0; i < bytes.length; i++) {
          var b = bytes[i].toString(16);
          hex += b.length === 1 ? '0' + b : b;
        }
        return hex;
      }
    }
    if (typeof computeSha256 === 'function') {
      var s1 = await computeSha256(secretKeyHex + ':' + messageStr);
      return await computeSha256(s1 + ':' + secretKeyHex);
    }
    return '';
  }

  function getAdminLockoutRemainingSecs() {
    if (_adminLockoutUntil && Date.now() < _adminLockoutUntil) {
      return Math.ceil((_adminLockoutUntil - Date.now()) / 1000);
    }
    return 0;
  }

  function resetAdminLockout() {
    _adminLoginFailures = 0;
    _adminLockoutUntil = 0;
  }

  function getAdminLockoutStatus() {
    var rem = getAdminLockoutRemainingSecs();
    return {
      locked: rem > 0,
      remainingSeconds: rem,
      failures: _adminLoginFailures
    };
  }

  function getAdminSessionToken() {
    return _adminSessionToken || (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('bb_admin_session_token') : null);
  }

  function getAdminSessionData() {
    return _adminSessionData;
  }

  function setAdminSessionTokenForTesting(token, data) {
    _adminSessionToken = token;
    _adminSessionData = data || null;
  }

  async function createAdminSessionToken(officerEmail, officerRank) {
    _adminSessionSalt = generateSecureHex(32);
    var now = Date.now();
    var email = officerEmail || (typeof sessionGet === 'function' ? sessionGet('email') : '') || 'company_officer';
    var rank = officerRank || (typeof sessionGet === 'function' ? sessionGet('rank') : '') || 'Officer';

    var payload = {
      role: 'officer_admin',
      officerEmail: email,
      officerRank: rank,
      issuedAt: now,
      expiresAt: now + SESSION_MAX_LIFETIME_MS,
      lastActiveAt: now,
      nonce: generateSecureHex(16)
    };

    var signPayload = [
      payload.role,
      payload.officerEmail,
      payload.issuedAt,
      payload.expiresAt,
      payload.nonce
    ].join(':');

    var expectedHash = getAdminPasswordHash();
    var secretKey = expectedHash + ':' + _adminSessionSalt;
    var signature = await computeHmacSha256(secretKey, signPayload);

    var payloadStr = typeof btoa === 'function'
      ? btoa(unescape(encodeURIComponent(JSON.stringify(payload))))
      : Buffer.from(JSON.stringify(payload)).toString('base64');

    var token = payloadStr + '.' + signature;

    _adminSessionToken = token;
    _adminSessionData = payload;

    if (typeof sessionStorage !== 'undefined') {
      try {
        sessionStorage.setItem('bb_admin_session_token', token);
        sessionStorage.setItem('bb_admin_session_salt', _adminSessionSalt);
      } catch (_) {}
    }

    if (typeof sessionSet === 'function') {
      sessionSet('adminAuthed', true);
    }

    return token;
  }

  function verifyAdminSessionSync() {
    var token = getAdminSessionToken();
    if (!token) return false;
    if (!_adminSessionData) {
      try {
        var parts = token.split('.');
        if (parts.length !== 2) return false;
        var jsonStr = typeof atob === 'function'
          ? decodeURIComponent(escape(atob(parts[0])))
          : Buffer.from(parts[0], 'base64').toString('utf8');
        _adminSessionData = JSON.parse(jsonStr);
      } catch (_) {
        return false;
      }
    }

    var data = _adminSessionData;
    if (!data || data.role !== 'officer_admin') return false;

    var now = Date.now();
    if (now > data.expiresAt) {
      revokeAdminSession('Session expired. Please re-authenticate.');
      return false;
    }

    if (now - data.lastActiveAt > SESSION_IDLE_TIMEOUT_MS) {
      revokeAdminSession('Session timed out due to inactivity.');
      return false;
    }

    data.lastActiveAt = now;
    return true;
  }

  async function verifyAdminSession() {
    if (!verifyAdminSessionSync()) return false;
    var token = getAdminSessionToken();
    if (!token) return false;
    var parts = token.split('.');
    if (parts.length !== 2) {
      revokeAdminSession('Malformed session token.');
      return false;
    }

    var payload = _adminSessionData;
    var signPayload = [
      payload.role,
      payload.officerEmail,
      payload.issuedAt,
      payload.expiresAt,
      payload.nonce
    ].join(':');

    var salt = _adminSessionSalt || (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('bb_admin_session_salt') : '');
    var expectedHash = getAdminPasswordHash();
    var secretKey = expectedHash + ':' + salt;
    var expectedSig = await computeHmacSha256(secretKey, signPayload);

    var valid = false;
    if (typeof timingSafeEqualToken === 'function') {
      valid = timingSafeEqualToken(parts[1], expectedSig);
    } else if (typeof window !== 'undefined' && typeof window.timingSafeEqualToken === 'function') {
      valid = window.timingSafeEqualToken(parts[1], expectedSig);
    } else {
      valid = parts[1].toLowerCase() === expectedSig.toLowerCase();
    }

    if (!valid) {
      revokeAdminSession('Cryptographic token signature mismatch. Tampering detected.');
      return false;
    }

    return true;
  }

  function revokeAdminSession(reason) {
    _adminSessionToken = null;
    _adminSessionData = null;
    _adminSessionSalt = '';

    if (typeof sessionStorage !== 'undefined') {
      try {
        sessionStorage.removeItem('bb_admin_session_token');
        sessionStorage.removeItem('bb_admin_session_salt');
      } catch (_) {}
    }

    if (typeof sessionSet === 'function') {
      sessionSet('adminAuthed', false);
    }

    if (typeof document !== 'undefined') {
      var panel = document.getElementById('admin-panel');
      if (panel) panel.style.display = 'none';

      var loginBox = document.getElementById('admin-login-box');
      if (loginBox) loginBox.style.display = 'block';
    }

    if (reason && typeof showToast === 'function') {
      showToast('Security Alert: ' + reason, 'error');
    }
  }

  function initAdminDomGuard() {
    if (typeof MutationObserver === 'undefined' || typeof document === 'undefined') return;
    var panel = document.getElementById('admin-panel');
    if (!panel || _adminDomObserver) return;

    _adminDomObserver = new MutationObserver(function() {
      if (panel.style.display !== 'none' && !verifyAdminSessionSync()) {
        panel.style.display = 'none';
        var loginBox = document.getElementById('admin-login-box');
        if (loginBox) loginBox.style.display = 'block';
        revokeAdminSession('Unauthorized DOM display bypass detected.');
      }
    });

    try {
      _adminDomObserver.observe(panel, { attributes: true, attributeFilter: ['style', 'class'] });
    } catch (_) {}
  }

  // ── Admin Authentication & Back-Office Navigation ──────────────────────────

  function openAdmin() {
    if (typeof document === 'undefined') return;
    var overlay = document.getElementById('admin-overlay');
    if (overlay) overlay.style.display = 'block';
    if (document.body) document.body.style.overflow = 'hidden';

    revokeAdminSession();

    var loginBox = document.getElementById('admin-login-box');
    if (loginBox) loginBox.style.display = 'block';

    var panel = document.getElementById('admin-panel');
    if (panel) panel.style.display = 'none';

    initAdminDomGuard();

    var passEl = document.getElementById('admin-pass');
    if (passEl) {
      passEl.value = '';
      passEl.style.webkitTextSecurity = 'disc';
      passEl.style.textSecurity = 'disc';
      if (typeof passEl.focus === 'function') passEl.focus();
    }
    var eyeBtn = document.getElementById('admin-eye');
    if (eyeBtn) {
      eyeBtn.innerHTML = '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
    }
  }

  function closeAdmin() {
    if (typeof document === 'undefined') return;
    var overlay = document.getElementById('admin-overlay');
    if (overlay) overlay.style.display = 'none';
    if (document.body) document.body.style.overflow = '';
  }

  function toggleAdminPassVis() {
    if (typeof document === 'undefined') return;
    var inp = document.getElementById('admin-pass');
    var btn = document.getElementById('admin-eye');
    if (!inp) return;
    var isMasked = inp.style.webkitTextSecurity !== 'none';
    if (isMasked) {
      inp.style.webkitTextSecurity = 'none';
      inp.style.textSecurity = 'none';
      if (btn) btn.innerHTML = '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>';
    } else {
      inp.style.webkitTextSecurity = 'disc';
      inp.style.textSecurity = 'disc';
      if (btn) btn.innerHTML = '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
    }
  }

  function logoutAdmin() {
    revokeAdminSession();
    if (typeof document === 'undefined') return;

    var panel = document.getElementById('admin-panel');
    if (panel) panel.style.display = 'none';

    var loginBox = document.getElementById('admin-login-box');
    if (loginBox) loginBox.style.display = 'block';

    var passEl = document.getElementById('admin-pass');
    if (passEl) {
      passEl.value = '';
      passEl.style.webkitTextSecurity = 'disc';
      passEl.style.textSecurity = 'disc';
      if (typeof passEl.focus === 'function') passEl.focus();
    }
    var eyeBtn = document.getElementById('admin-eye');
    if (eyeBtn) {
      eyeBtn.innerHTML = '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
    }
  }

  async function adminLogin() {
    if (typeof document === 'undefined') return false;

    // 1. Rate limiting lockout check
    var remaining = getAdminLockoutRemainingSecs();
    if (remaining > 0) {
      if (typeof showToast === 'function') {
        showToast('Admin locked due to failed attempts. Try again in ' + remaining + 's.', 'error');
      }
      return false;
    }

    var passEl = document.getElementById('admin-pass');
    var pass = passEl ? passEl.value : '';

    var valid = await verifyAdminPassword(pass);
    if (!valid) {
      _adminLoginFailures++;
      if (_adminLoginFailures >= MAX_LOGIN_FAILURES) {
        var lockoutMs = Math.min(
          BASE_LOCKOUT_MS * Math.pow(2, _adminLoginFailures - MAX_LOGIN_FAILURES),
          MAX_LOCKOUT_MS
        );
        _adminLockoutUntil = Date.now() + lockoutMs;
        if (typeof showToast === 'function') {
          showToast('Security Alert: Multiple failed attempts. Locked for ' + Math.round(lockoutMs / 1000) + 's.', 'error');
        }
      } else {
        if (typeof showToast === 'function') {
          showToast('Wrong password! Attempt ' + _adminLoginFailures + ' of ' + MAX_LOGIN_FAILURES + '.', 'error');
        }
      }
      logoutAdmin();
      return false;
    }

    // 2. Clear failure tracking on success
    _adminLoginFailures = 0;
    _adminLockoutUntil = 0;

    // 3. Issue cryptographic HMAC session token
    var officerEmail = typeof sessionGet === 'function' ? sessionGet('email') : '';
    var officerRank = typeof sessionGet === 'function' ? sessionGet('rank') : '';
    await createAdminSessionToken(officerEmail, officerRank);

    if (passEl) passEl.value = '';

    var loginBox = document.getElementById('admin-login-box');
    if (loginBox) loginBox.style.display = 'none';

    var panel = document.getElementById('admin-panel');
    if (panel) panel.style.display = 'block';

    initAdminDomGuard();
    backToAdminHome();

    if (typeof renderGallery === 'function') renderGallery();
    if (typeof renderAnnouncements === 'function') renderAnnouncements();
    if (typeof loadResources === 'function') loadResources();
    if (typeof initCalendarModule === 'function') initCalendarModule();
    return true;
  }

  function backToAdminHome() {
    if (typeof document === 'undefined') return;
    var backBar = document.getElementById('adm-back-bar');
    if (backBar) backBar.style.display = 'none';

    ADMIN_SECTIONS.forEach(function(s) {
      var el = document.getElementById('adm-section-' + s);
      if (el) el.style.display = 'none';
    });

    document.querySelectorAll('.adm-section-btn').forEach(function(b) {
      b.style.display = 'flex';
    });
  }

  function switchAdminSection(section) {
    if (typeof document === 'undefined') return;
    if (!verifyAdminSessionSync()) {
      if (typeof showToast === 'function') showToast('Unauthorized: Valid officer session token required.', 'error');
      logoutAdmin();
      return;
    }

    document.querySelectorAll('.adm-section-btn').forEach(function(b) {
      b.style.display = 'none';
    });

    var backBar = document.getElementById('adm-back-bar');
    if (backBar) backBar.style.display = 'block';

    ADMIN_SECTIONS.forEach(function(s) {
      var el = document.getElementById('adm-section-' + s);
      if (el) el.style.display = 'none';
    });

    var target = document.getElementById('adm-section-' + section);
    if (target) target.style.display = 'block';

    if (section === 'members') renderAdminList();

    if (section === 'orders') {
      if (typeof switchFormSubtab === 'function') switchFormSubtab('formbuilder');
      setTimeout(function() {
        if (typeof createRichEditor === 'function') {
          createRichEditor('fb-desc-container', 'fb-desc', 'Brief info about this form', 60);
        }
      }, 50);
    }

    if (section === 'uniform') {
      if (typeof switchUniformSubtab === 'function') switchUniformSubtab('products');
    }

    if (section === 'tasks') {
      switchDeptTab('all');
      setTimeout(function() {
        if (typeof createRichEditor === 'function') {
          createRichEditor('task-desc-container', 'task-desc', 'Task details...', 70);
        }
      }, 50);
    }

    if (section === 'announcements') {
      if (typeof renderAdminAnnList === 'function') renderAdminAnnList();
    }

    if (section === 'badges') {
      if (typeof switchBadgeSubtab === 'function') switchBadgeSubtab('badgedefs');
    }

    if (section === 'gallery') {
      if (typeof renderGallery === 'function') renderGallery();
      if (typeof renderAdminStoryHighlights === 'function') renderAdminStoryHighlights();
    }

    if (section === 'attendance') {
      if (typeof renderAdminMasterSheetPanel === 'function') renderAdminMasterSheetPanel();
    }

    if (section === 'resources') {
      if (typeof renderAdminResourcesPanel === 'function') renderAdminResourcesPanel();
    }

    if (section === 'calendar') {
      if (typeof renderAdminCalendarGrid === 'function') renderAdminCalendarGrid();
    }
  }

  function switchDeptTab(dept) {
    if (typeof document === 'undefined') return;
    var dConfig = getDeptConfig();

    ['all', 'logistics', 'secretariat', 'media'].forEach(function(d) {
      var btn = document.getElementById('dtab-' + d);
      if (!btn) return;
      var active = (d === dept);
      btn.classList.toggle('active-dept-tab', active);
      if (d !== 'all') {
        var cfg = dConfig[d];
        btn.style.background = (active && cfg) ? (cfg.color + '33') : 'transparent';
      }
    });

    renderAdminTasks(dept);
  }

  function toggleTaskForm() {
    if (typeof document === 'undefined') return;
    var body    = document.getElementById('task-form-body');
    var chevron = document.getElementById('task-form-chevron');
    var label   = document.getElementById('task-form-toggle-label');
    var open    = body && body.style.display === 'none';

    if (body)    body.style.display      = open ? 'block' : 'none';
    if (chevron) chevron.style.transform = open ? 'rotate(90deg)' : 'rotate(0deg)';
    if (label)   label.textContent       = open ? '\u2715 Close Form' : '\u2795 Add New Task';
  }

  // ── Admin Members Management ──────────────────────────────────────────────

  function calcAge(dob) {
    if (!dob) return null;
    return new Date().getFullYear() - new Date(dob).getFullYear();
  }

  function setAdminSort(by) {
    _adminSortBy = by;
    if (typeof document !== 'undefined') {
      ['name', 'age', 'squad', 'rank', 'joined'].forEach(function(s) {
        var btn = document.getElementById('sort-' + s);
        if (btn) btn.classList.toggle('active-sort', s === by);
      });
      var deptBtn = document.querySelector('.adm-sort-btn[data-sort="dept"]');
      if (!deptBtn) {
        var allSortBtns = document.querySelectorAll('.adm-sort-btn');
        for (var si = 0; si < allSortBtns.length; si++) {
          if (allSortBtns[si].getAttribute && allSortBtns[si].getAttribute('data-sort') === 'dept') {
            deptBtn = allSortBtns[si];
            break;
          }
        }
      }
      if (deptBtn) deptBtn.classList.toggle('active-sort', by === 'dept');
    }
    renderAdminList();
  }

  async function renderAdminList() {
    if (typeof document === 'undefined') return;
    var search = ((document.getElementById('admin-search') || {}).value || '').toLowerCase();
    var list   = document.getElementById('admin-members-list');
    if (!list) return;

    list.innerHTML = (typeof renderSkeletonTable === 'function') ? renderSkeletonTable(6, 6) : '<div class="skeleton-shimmer" style="height:180px;border-radius:8px;"></div>';

    var client = getSupabaseClient();
    if (!client || !client.get) {
      list.innerHTML = '<div style="color:#f66;text-align:center;padding:20px;">Database client unavailable.</div>';
      return;
    }

    try {
      // 1. Fetch deleted members blacklist from bb_config
      var deletedSet = new Set();
      try {
        var cfgRes = await client.get('bb_config?key=eq.bb_deleted_members&select=value');
        if (cfgRes && cfgRes.length && cfgRes[0].value) {
          var arr = JSON.parse(cfgRes[0].value);
          if (Array.isArray(arr)) {
            arr.forEach(function(id) { deletedSet.add(id); });
          }
        }
      } catch (e) {}

      var members = await client.get('bb_members?select=id,ic,email,name,rank,squad,section,att_section,department,date_of_birth,joined_at,parental_consent_verified,parent_name,parent_contact,media_release_consent&order=name.asc');
      var filtered = members.filter(function(m) {
        if (deletedSet.has(m.ic)) return false;
        if (m.department === 'deleted' || m.department === 'archived_deleted') return false;
        return (m.name || '').toLowerCase().includes(search) || (m.ic || '').includes(search);
      });

      if (!filtered.length) {
        list.innerHTML = '<div style="color:#666;text-align:center;padding:20px;">No members found.</div>';
        return;
      }

      // Sort
      filtered.sort(function(a, b) {
        if (_adminSortBy === 'age') {
          var aa = calcAge(a.date_of_birth);
          var ba = calcAge(b.date_of_birth);
          if (aa === null && ba === null) return 0;
          if (aa === null) return 1;
          if (ba === null) return -1;
          return aa - ba;
        }
        if (_adminSortBy === 'squad') {
          var sq = (a.squad || '').localeCompare(b.squad || '');
          return sq !== 0 ? sq : (a.name || '').localeCompare(b.name || '');
        }
        if (_adminSortBy === 'rank') {
          var ri = RANK_ORDER.indexOf(a.rank || '');
          var rj = RANK_ORDER.indexOf(b.rank || '');
          if (ri === -1) ri = 99;
          if (rj === -1) rj = 99;
          return ri - rj;
        }
        if (_adminSortBy === 'joined') {
          return (a.joined_at || '').localeCompare(b.joined_at || '');
        }
        return (a.name || '').localeCompare(b.name || '');
      });

      _adminMembers = {};
      filtered.forEach(function(m) { _adminMembers[m.ic] = m; });
      if (typeof global !== 'undefined') global._adminMembers = _adminMembers;

      // Group headers when sorting by squad
      var lastSquad = null;
      var lastDept = null;
      var html = '';

      filtered.forEach(function(m) {
        var age = calcAge(m.date_of_birth);
        var ageStr = age !== null ? (age + ' years') : '\u2014';
        var isMinor = (typeof isMinorSection === 'function')
          ? isMinorSection(m.att_section || m.section, age)
          : ((age !== null && age <= 11) || (m.att_section === 'Pre-Junior' || m.att_section === 'Junior'));

        var consentBadge = '';
        if (isMinor) {
          var hasConsent = !!m.parental_consent_signed || !!m.parent_name;
          if (hasConsent) {
            consentBadge = ' <span title="Child Safety: Parental Consent Verified" style="display:inline-flex;align-items:center;gap:3px;font-size:10px;padding:2px 6px;border-radius:10px;background:rgba(74,222,128,0.15);color:var(--green);font-weight:700;vertical-align:middle;margin-left:4px;"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px;"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> Consent OK</span>';
          } else {
            consentBadge = ' <span title="Child Safety: Parental Consent Pending" style="display:inline-flex;align-items:center;gap:3px;font-size:10px;padding:2px 6px;border-radius:10px;background:rgba(234,179,8,0.15);color:var(--accent);font-weight:700;vertical-align:middle;margin-left:4px;"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px;"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> Consent Pending</span>';
          }
          if (m.media_consent === false) {
            consentBadge += ' <span title="Privacy: Media release private / no public photos" style="display:inline-flex;align-items:center;gap:2px;font-size:10px;padding:2px 6px;border-radius:10px;background:rgba(239,68,68,0.12);color:var(--red);font-weight:700;vertical-align:middle;margin-left:2px;">No Media</span>';
          }
        }

        if (_adminSortBy === 'squad') {
          var sq = m.squad || 'No Platoon';
          if (sq !== lastSquad) {
            html += '<div style="font-family:\'Oswald\',sans-serif;font-size:11px;font-weight:700;color:var(--gold);letter-spacing:2px;text-transform:uppercase;padding:10px 4px 4px;">' + (m.squad ? sq + ' Platoon' : 'No Platoon') + '</div>';
            lastSquad = sq;
          }
        }
        if (_adminSortBy === 'dept') {
          var currentDeptKey = (m.department || '').trim().toLowerCase();
          var depLabel = (DEFAULT_DEPT_CONFIG[currentDeptKey] && DEFAULT_DEPT_CONFIG[currentDeptKey].label) || (m.department ? m.department : 'No Department Role (No Tasks Access)');
          if (depLabel !== lastDept) {
            html += '<div style="font-family:\'Oswald\',sans-serif;font-size:11px;font-weight:700;color:var(--gold);letter-spacing:2px;text-transform:uppercase;padding:12px 4px 6px;">' + ((typeof escapeHtml === 'function') ? escapeHtml(depLabel) : depLabel) + '</div>';
            lastDept = depLabel;
          }
        }

        var safeName = (typeof escapeHtml === 'function') ? escapeHtml(m.name) : m.name;
        var safeIc   = (typeof escapeHtml === 'function') ? escapeHtml(m.ic) : m.ic;
        var safeSquad= (typeof escapeHtml === 'function') ? escapeHtml(m.squad || '') : (m.squad || '');
        var safeRank = (typeof escapeHtml === 'function') ? escapeHtml(m.rank || 'No rank') : (m.rank || 'No rank');

        var deptConfig = DEFAULT_DEPT_CONFIG[(m.department || '').toLowerCase()];
        var deptBadge = '';
        if (deptConfig) {
          deptBadge = ' <span class="dept-badge ' + (deptConfig.cls || '') + '" title="Department Role: Has Projects & Tasks Access" style="display:inline-flex;align-items:center;font-size:10px;padding:2px 7px;border-radius:10px;background:' + (deptConfig.color ? deptConfig.color + '26' : 'rgba(217,163,35,0.15)') + ';color:' + (deptConfig.color || 'var(--accent)') + ';font-weight:700;letter-spacing:0.3px;margin-left:4px;border:1px solid ' + (deptConfig.color ? deptConfig.color + '55' : 'rgba(217,163,35,0.3)') + ';vertical-align:middle;">' + ((typeof escapeHtml === 'function') ? escapeHtml(deptConfig.label) : deptConfig.label) + '</span>';
        } else {
          deptBadge = ' <span title="No Department: Cannot access Projects & Tasks" style="display:inline-flex;align-items:center;font-size:10px;padding:2px 6px;border-radius:10px;background:var(--bg-card-subtle);color:var(--text-muted);font-weight:600;margin-left:4px;border:1px solid var(--border-subtle);vertical-align:middle;">No Dept</span>';
        }

        html += '<div class="admin-row" data-edit-ic="' + safeIc + '" style="cursor:pointer;display:flex;align-items:center;gap:10px;">'
          + '<div style="flex:1;min-width:0;">'
            + '<div class="admin-name" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + safeName + consentBadge + deptBadge + '</div>'
            + '<div class="admin-sub" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + (m.ic.indexOf('@') !== -1 ? safeIc : ('ID: ' + safeIc)) + ' \xb7 ' + (m.squad ? safeSquad + ' Platoon' : 'No platoon') + ' \xb7 ' + safeRank + (m.department ? (' \xb7 ' + ((typeof escapeHtml === 'function') ? escapeHtml((deptConfig && deptConfig.label) || m.department) : m.department)) : '') + '</div>'
          + '</div>'
          + '<div style="text-align:right;flex-shrink:0;">'
            + '<div class="admin-rank-badge">' + ((typeof escapeHtml === 'function') ? escapeHtml(m.rank || '\u2014') : (m.rank || '\u2014')) + '</div>'
            + '<div style="font-size:11px;color:var(--text-muted);margin-top:3px;">' + ageStr + '</div>'
          + '</div>'
          + '<button class="adm-row-del-btn" data-del-ic="' + safeIc + '" data-del-name="' + ((typeof escapeHtml === 'function') ? escapeHtml(m.name || '') : (m.name || '')) + '" title="Delete Member Account" style="background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.3);color:var(--red);border-radius:8px;padding:7px 10px;margin-left:4px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;">'
            + '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>'
          + '</button>'
          + '<div style="color:var(--text-muted);font-size:18px;margin-left:4px;">\u203a</div></div>';
      });

      list.innerHTML = html;

      list.querySelectorAll('[data-edit-ic]').forEach(function(row) {
        row.addEventListener('click', function(e) {
          if (e.target.closest('.adm-row-del-btn')) return;
          openEditMember(row.getAttribute('data-edit-ic'));
        });
      });

      list.querySelectorAll('.adm-row-del-btn').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          var ic = btn.getAttribute('data-del-ic');
          var name = btn.getAttribute('data-del-name');
          deleteMemberAccount(ic, name, e);
        });
      });
    } catch (e) {
      list.innerHTML = '<div style="color:#f66;text-align:center;padding:20px;">Failed to load.</div>';
    }
  }

  function handleAdminSectionChange() {
    if (typeof document === 'undefined') return;
    var sec = (document.getElementById('em-section') || {}).value || '';
    var dob = (document.getElementById('em-dob') || {}).value || '';
    var age = (typeof calcAge === 'function') ? calcAge(dob) : null;
    var isMinor = (typeof isMinorSection === 'function')
      ? isMinorSection(sec, age)
      : (sec === 'Pre-Junior' || sec === 'Junior' || (age !== null && age <= 11));

    var box = document.getElementById('em-child-safety-box');
    if (box) {
      if (isMinor) {
        box.style.border = '1px solid rgba(217,163,35,0.45)';
        box.style.background = 'rgba(217,163,35,0.08)';
      } else {
        box.style.border = '1px solid var(--border-card)';
        box.style.background = 'var(--bg-card-subtle)';
      }
    }
  }

  function openAddMember() {
    if (typeof document === 'undefined') return;
    if (!verifyAdminSessionSync()) {
      logoutAdmin();
      return;
    }
    [
      'em-name', 'em-ic', 'em-joined', 'em-dob',
      'em-parent-name', 'em-parent-contact'
    ].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.value = '';
    });

    ['em-rank', 'em-squad', 'em-dept', 'em-section'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.value = '';
    });

    var pc = document.getElementById('em-parent-consent');
    if (pc) pc.checked = false;

    var mc = document.getElementById('em-media-consent');
    if (mc) mc.checked = false;

    var cm = document.getElementById('em-consent-meta');
    if (cm) cm.textContent = '';

    var ic = document.getElementById('em-ic');
    if (ic) ic.readOnly = false;

    var ti = document.getElementById('em-modal-title');
    if (ti) ti.textContent = '\u2795 Add New Member';

    var db = document.getElementById('em-delete-btn');
    if (db) db.style.display = 'none';

    var oi = document.getElementById('em-original-ic');
    if (oi) oi.value = '';

    var modal = document.getElementById('edit-member-modal');
    if (modal) modal.style.display = 'block';
  }

  function openEditMember(ic) {
    if (typeof document === 'undefined') return;
    var m = (_adminMembers && _adminMembers[ic]) || { ic: ic };

    var set = function(id, val) {
      var el = document.getElementById(id);
      if (el) el.value = val || '';
    };

    set('em-name',    m.name);
    set('em-ic',      m.ic);
    set('em-rank',    m.rank);
    set('em-squad',   m.squad);
    set('em-dept',    m.department);
    set('em-section', m.att_section || m.section || '');

    handleAdminSectionChange();

    set('em-joined',       m.joined_at ? m.joined_at.slice(0, 10) : '');
    set('em-dob',          m.date_of_birth ? m.date_of_birth.slice(0, 10) : '');
    set('em-original-ic',  m.ic);
    set('em-parent-name',  m.parent_name || '');
    set('em-parent-contact', m.parent_contact || '');

    var pc = document.getElementById('em-parent-consent');
    if (pc) pc.checked = !!m.parental_consent_signed;

    var mc = document.getElementById('em-media-consent');
    if (mc) mc.checked = !!m.media_consent;

    var cm = document.getElementById('em-consent-meta');
    if (cm) {
      if (m.parental_consent_date) {
        cm.textContent = 'Consent recorded on ' + new Date(m.parental_consent_date).toLocaleString('en-MY');
      } else {
        cm.textContent = '';
      }
    }

    if (!m.parent_name && !m.parental_consent_signed && typeof fetchMemberConsent === 'function') {
      fetchMemberConsent(ic, m).then(function(cData) {
        if (cData) {
          var pn = document.getElementById('em-parent-name');
          var pcon = document.getElementById('em-parent-contact');
          if (pn && !pn.value) pn.value = cData.parent_name || '';
          if (pcon && !pcon.value) pcon.value = cData.parent_contact || '';
          if (pc) pc.checked = !!cData.parental_consent_signed;
          if (mc) mc.checked = !!cData.media_consent;
          if (cm && cData.parental_consent_date) {
            cm.textContent = 'Consent recorded on ' + new Date(cData.parental_consent_date).toLocaleString('en-MY');
          }
        }
      }).catch(function() {});
    }

    var icEl = document.getElementById('em-ic');
    if (icEl) icEl.readOnly = true;

    var ti = document.getElementById('em-modal-title');
    if (ti) ti.textContent = '\u270f\ufe0f Edit Member';

    var db = document.getElementById('em-delete-btn');
    if (db) db.style.display = 'inline-flex';

    var modal = document.getElementById('edit-member-modal');
    if (modal) modal.style.display = 'block';
  }

  function closeEditMember() {
    if (typeof document === 'undefined') return;
    var modal = document.getElementById('edit-member-modal');
    if (modal) modal.style.display = 'none';
  }

  async function saveEditMember() {
    if (typeof document === 'undefined') return;
    var originalIc = (document.getElementById('em-original-ic') || {}).value || '';
    var rawIc      = ((document.getElementById('em-ic') || {}).value || '').trim().replace(/\s/g, '');
    var rawName    = ((document.getElementById('em-name') || {}).value || '').trim();
    var rawRank    = (document.getElementById('em-rank') || {}).value || '';
    var rawSquad   = (document.getElementById('em-squad') || {}).value || '';
    var rawDept    = (document.getElementById('em-dept') || {}).value || '';

    var ic         = (typeof sanitizeInput === 'function') ? sanitizeInput(rawIc, 100) : rawIc;
    var name       = (typeof sanitizeText === 'function') ? sanitizeText(rawName, 100) : rawName;
    var rank       = (typeof sanitizeText === 'function') ? sanitizeText(rawRank, 50) : rawRank;
    var squad      = (typeof sanitizeText === 'function') ? sanitizeText(rawSquad, 50) : rawSquad;
    var department = (typeof sanitizeText === 'function') ? sanitizeText(rawDept, 50) : rawDept;

    var joinedRaw     = (document.getElementById('em-joined') || {}).value || '';
    var joined_at     = joinedRaw ? new Date(joinedRaw).toISOString() : null;
    var dobRaw        = (document.getElementById('em-dob') || {}).value || '';
    var date_of_birth = dobRaw || null;
    var rawSec        = ((document.getElementById('em-section') || {}).value || '').trim();
    var att_section   = (typeof sanitizeText === 'function') ? sanitizeText(rawSec, 50) : rawSec;

    var rawPName      = ((document.getElementById('em-parent-name') || {}).value || '').trim();
    var rawPContact   = ((document.getElementById('em-parent-contact') || {}).value || '').trim();
    var parent_name   = (typeof sanitizeText === 'function') ? sanitizeText(rawPName, 100) : rawPName;
    var parent_contact= (typeof sanitizeInput === 'function') ? sanitizeInput(rawPContact, 100) : rawPContact;

    var pConsentCb    = document.getElementById('em-parent-consent');
    var parental_consent_signed = pConsentCb ? !!pConsentCb.checked : false;

    var mConsentCb    = document.getElementById('em-media-consent');
    var media_consent = mConsentCb ? !!mConsentCb.checked : false;

    if (!name) {
      if (typeof showToast === 'function') showToast('Name cannot be empty.', 'warning');
      return;
    }
    if (!ic) {
      if (typeof showToast === 'function') showToast('Account Email / ID cannot be empty.', 'warning');
      return;
    }

    var client = getSupabaseClient();
    if (!client) {
      if (typeof showToast === 'function') showToast('Database client unavailable.', 'error');
      return;
    }

    try {
      var consentTimestamp = parental_consent_signed ? new Date().toISOString() : null;

      if (!originalIc) {
        var existing = await client.get('bb_members?ic=eq.' + encodeURIComponent(ic) + '&select=ic');
        if (existing && existing.length) {
          if (typeof showToast === 'function') showToast('A member with this Account Email / ID already exists.', 'warning');
          return;
        }

        var defaultHash = null;
        if (typeof hashPassword === 'function') {
          defaultHash = await hashPassword(ic);
        } else if (typeof window !== 'undefined' && typeof window.hashPassword === 'function') {
          defaultHash = await window.hashPassword(ic);
        } else if (typeof global !== 'undefined' && typeof global.hashPassword === 'function') {
          defaultHash = await global.hashPassword(ic);
        }
        if (!defaultHash) {
          var safeEncoded = typeof window !== 'undefined' && typeof window.safeBase64Encode === 'function'
            ? window.safeBase64Encode(ic)
            : typeof Buffer !== 'undefined'
              ? Buffer.from(ic, 'utf8').toString('base64')
              : encodeURIComponent(ic);
          defaultHash = 'pbkdf2:sha256:100000:legacy:' + safeEncoded;
        }
        var newPayload = {
          ic: ic,
          name: name,
          rank: rank,
          squad: squad,
          department: department,
          att_section: att_section || null,
          date_of_birth: date_of_birth,
          password: defaultHash,
          joined_at: joined_at || new Date().toISOString()
        };

        if (parent_name) newPayload.parent_name = parent_name;
        if (parent_contact) newPayload.parent_contact = parent_contact;
        if (parental_consent_signed) {
          newPayload.parental_consent_signed = true;
          newPayload.parental_consent_date = consentTimestamp;
        }
        newPayload.media_consent = media_consent;

        try {
          await client.post('bb_members', newPayload);
        } catch (postErr) {
          // Fallback without extended consent columns
          await client.post('bb_members', {
            ic: ic,
            name: name,
            rank: rank,
            squad: squad,
            department: department,
            date_of_birth: date_of_birth,
            password: defaultHash,
            joined_at: joined_at || new Date().toISOString()
          });
        }
        if (typeof showToast === 'function') {
          showToast('✅ Member added! Default password is: ' + ic, 'success', 5000);
        }
      } else {
        var updates = {
          name: name,
          rank: rank,
          squad: squad,
          department: department,
          att_section: att_section || null
        };
        if (joined_at)     updates.joined_at     = joined_at;
        if (date_of_birth) updates.date_of_birth = date_of_birth;
        updates.parent_name = parent_name || null;
        updates.parent_contact = parent_contact || null;
        updates.parental_consent_signed = parental_consent_signed;
        if (parental_consent_signed) updates.parental_consent_date = consentTimestamp;
        updates.media_consent = media_consent;

        try {
          await client.patch('bb_members?ic=eq.' + encodeURIComponent(originalIc), updates);
        } catch (patchErr) {
          var baseUpdates = { name: name, rank: rank, squad: squad, department: department };
          if (joined_at)     baseUpdates.joined_at     = joined_at;
          if (date_of_birth) baseUpdates.date_of_birth = date_of_birth;
          await client.patch('bb_members?ic=eq.' + encodeURIComponent(originalIc), baseUpdates);
        }
        if (typeof showToast === 'function') showToast('Member updated!', 'success');
      }

      // Always persist backup consent audit trail into bb_config
      try {
        var consentRecord = {
          email: ic,
          name: name,
          section: att_section || (_adminMembers && _adminMembers[ic] && (_adminMembers[ic].att_section || _adminMembers[ic].section)) || '',
          parent_name: parent_name,
          parent_contact: parent_contact,
          parental_consent_signed: parental_consent_signed,
          parental_consent_date: consentTimestamp,
          media_consent: media_consent,
          updated_at: new Date().toISOString()
        };
        var consentKey = 'bb_consent_' + ic.replace(/[^a-zA-Z0-9_-]/g, '_');
        await client.upsert('bb_config', { key: consentKey, value: JSON.stringify(consentRecord) }, 'key');
      } catch (cfgErr) {}

      if (_adminMembers && _adminMembers[ic]) {
        _adminMembers[ic].parent_name = parent_name;
        _adminMembers[ic].parent_contact = parent_contact;
        _adminMembers[ic].parental_consent_signed = parental_consent_signed;
        _adminMembers[ic].media_consent = media_consent;
      }

      closeEditMember();
      renderAdminList();
    } catch (e) {
      if (typeof showToast === 'function') showToast('Failed: ' + e.message, 'error');
    }
  }

  async function deleteEditMember() {
    if (typeof document === 'undefined') return;
    var ic   = (document.getElementById('em-original-ic') || {}).value || '';
    var name = (document.getElementById('em-name') || {}).value || '';
    await deleteMemberAccount(ic, name);
  }

  async function deleteMemberAccount(ic, name, e) {
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
    if (!ic) return;

    var display = name ? ('member "' + name + '" (' + ic + ')') : ('member account (' + ic + ')');
    var ok = false;
    if (typeof showConfirmModal === 'function') {
      ok = await showConfirmModal(
        'Are you sure you want to permanently delete ' + display + '? This will delete their account profile and login credentials. This action cannot be undone.',
        'Delete Member Account'
      );
    } else {
      ok = true;
    }
    if (!ok) return;

    // 1. Instant optimistic DOM removal for immediate visual feedback
    if (typeof document !== 'undefined') {
      var rowEl = document.querySelector('.admin-row[data-edit-ic="' + ic + '"]');
      if (rowEl) {
        rowEl.style.transition = 'all 0.3s ease';
        rowEl.style.opacity = '0';
        rowEl.style.transform = 'translateX(20px)';
        setTimeout(function() {
          if (rowEl && rowEl.parentNode) rowEl.parentNode.removeChild(rowEl);
        }, 300);
      }
    }

    var client = getSupabaseClient();
    if (!client) return;

    try {
      // 2. Add IC to bb_deleted_members in bb_config so they are filtered out immediately
      try {
        var cfgRes = await client.get('bb_config?key=eq.bb_deleted_members&select=value');
        var delList = [];
        if (cfgRes && cfgRes.length && cfgRes[0].value) {
          try { delList = JSON.parse(cfgRes[0].value); } catch (err) {}
        }
        if (!Array.isArray(delList)) delList = [];
        if (!delList.includes(ic)) delList.push(ic);

        try {
          var consentKey = 'bb_consent_' + ic.replace(/[^a-zA-Z0-9_-]/g, '_');
          await client.delete('bb_config?key=eq.' + encodeURIComponent(consentKey));
        } catch (e2) {}

        try {
          await client.req('POST', 'bb_config?on_conflict=key', {
            key: 'bb_deleted_members',
            value: JSON.stringify(delList),
            updated_at: new Date().toISOString()
          });
        } catch (err2) {
          await client.patch('bb_config?key=eq.bb_deleted_members', {
            value: JSON.stringify(delList),
            updated_at: new Date().toISOString()
          });
        }
      } catch (cfgErr) {
        console.warn('bb_deleted_members update:', cfgErr);
      }

      // 3. Neutralize account credentials & mark department as deleted
      try {
        await client.patch('bb_members?ic=eq.' + encodeURIComponent(ic), {
          department: 'deleted',
          password: 'DELETED_' + Date.now() + '_' + Math.random().toString(36).substring(2),
          rank: 'Deleted',
          squad: null
        });
      } catch (patchErr) {
        console.warn('Account neutralization patch:', patchErr);
      }

      // 4. Attempt hard delete in Supabase (if RLS delete policy is enabled)
      try {
        await client.delete('bb_members?ic=eq.' + encodeURIComponent(ic));
      } catch (delErr) {}

      // 5. Cascade delete member badges
      try {
        await client.delete('bb_member_badges?ic=eq.' + encodeURIComponent(ic));
      } catch (delBadgeErr) {}

      closeEditMember();
      await renderAdminList();
      if (typeof showToast === 'function') {
        showToast('Account for ' + (name || ic) + ' was permanently deleted.', 'info');
      }
    } catch (err) {
      if (typeof showToast === 'function') {
        showToast('Failed to delete member: ' + err.message, 'error');
      }
    }
  }

  // ── Admin Tasks Management ────────────────────────────────────────────────

  async function loadAssigneeOptions() {
    if (typeof document === 'undefined') return;
    var dept = (document.getElementById('task-dept') || {}).value || '';
    var sel  = document.getElementById('task-assignee');
    if (!sel) return;

    sel.innerHTML = '<option value="">Unassigned</option>';
    if (!dept) return;

    var client = getSupabaseClient();
    if (!client || !client.get) return;

    try {
      var members = await client.get('bb_members?department=eq.' + encodeURIComponent(dept) + '&select=ic,name&order=name');
      members.forEach(function(m) {
        var opt = document.createElement('option');
        opt.value = m.ic;
        opt.textContent = m.name;
        sel.appendChild(opt);
      });
    } catch (e) {
      console.error('loadAssigneeOptions error:', e);
    }
  }

  async function saveTask() {
    if (typeof document === 'undefined') return;
    var rawTitle = ((document.getElementById('task-title') || {}).value || '').trim();
    var rawDesc  = (typeof reGetValue === 'function') ? reGetValue('task-desc') : '';
    var title    = (typeof sanitizeText === 'function') ? sanitizeText(rawTitle, 200) : rawTitle;
    var desc     = (typeof sanitizeHtml === 'function') ? sanitizeHtml(rawDesc) : rawDesc;
    var dept     = (document.getElementById('task-dept') || {}).value || '';
    var priority = (document.getElementById('task-priority') || {}).value || 'medium';
    var due      = (document.getElementById('task-due') || {}).value || '';
    var editId   = (document.getElementById('task-edit-id') || {}).value || '';

    if (!title) {
      if (typeof showToast === 'function') showToast('Please enter a task title.', 'warning');
      return;
    }
    if (!dept) {
      if (typeof showToast === 'function') showToast('Please select a department.', 'warning');
      return;
    }

    var assigneeSel = document.getElementById('task-assignee');
    var selected = [];
    if (assigneeSel) {
      if (assigneeSel.selectedOptions) {
        selected = Array.from(assigneeSel.selectedOptions).filter(function(o) { return o.value; });
      } else if (assigneeSel.options) {
        selected = Array.from(assigneeSel.options).filter(function(o) { return o.selected && o.value; });
      }
    }
    var assigneeName = selected.map(function(o) { return o.text; }).join(', ');

    var payload = {
      title: title,
      description: desc,
      department: dept,
      priority: priority,
      due_date: due || null,
      assignee_name: assigneeName || null
    };

    if (!editId) {
      payload.created_at = new Date().toISOString();
      payload.status = 'todo';
    }

    var client = getSupabaseClient();
    if (!client) return;

    try {
      if (editId) {
        await client.patch('bb_tasks?id=eq.' + encodeURIComponent(editId), payload);
        if (typeof showToast === 'function') showToast('✅ Task updated!', 'success');
      } else {
        await client.post('bb_tasks', payload);
        if (typeof showToast === 'function') showToast('✅ Task added!', 'success');
      }

      clearTaskForm();
      var body = document.getElementById('task-form-body');
      if (body && body.style.display !== 'none') toggleTaskForm();
      renderAdminTasks(_adminTaskFilter);
    } catch (e) {
      if (typeof showToast === 'function') showToast('Failed: ' + e.message, 'error');
    }
  }

  function clearTaskForm() {
    if (typeof document === 'undefined') return;
    ['task-title', 'task-due', 'task-edit-id'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.value = '';
    });

    if (typeof reClearValue === 'function') reClearValue('task-desc');

    var td = document.getElementById('task-dept');
    if (td) td.value = '';

    var tp = document.getElementById('task-priority');
    if (tp) tp.value = 'medium';

    var ta = document.getElementById('task-assignee');
    if (ta) ta.innerHTML = '<option value="" disabled>Select dept first...</option>';

    var tl = document.getElementById('task-form-toggle-label');
    if (tl) tl.textContent = '+ Add New Task';
  }

  async function renderAdminTasks(filter) {
    if (typeof document === 'undefined') return;
    _adminTaskFilter = filter || 'all';

    var SC = { todo: 'var(--text-secondary)', inprogress: 'var(--brand-blue)', done: 'var(--green)' };
    var SL = { todo: 'To Do', inprogress: 'In Progress', done: 'Done' };

    var list = document.getElementById('admin-tasks-list');
    if (!list) return;

    list.innerHTML = (typeof renderSkeletonKanban === 'function') ? renderSkeletonKanban() : '<div class="skeleton-shimmer" style="height:220px;border-radius:8px;"></div>';

    var client = getSupabaseClient();
    if (!client || !client.get) {
      list.innerHTML = '<div style="color:#f66;text-align:center;padding:20px;">Database client unavailable.</div>';
      return;
    }

    try {
      var url = _adminTaskFilter === 'all'
        ? 'bb_tasks?select=*&order=created_at.desc'
        : 'bb_tasks?department=eq.' + encodeURIComponent(_adminTaskFilter) + '&order=created_at.desc';

      _allAdminTasks = await client.get(url);

      if (!_allAdminTasks.length) {
        list.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:20px;">No tasks yet.</div>';
        return;
      }

      var dConfig = getDeptConfig();
      var html = '';

      _allAdminTasks.forEach(function(t) {
        var dept = dConfig[t.department] || { label: t.department || '', cls: '' };
        var pc   = (t.priority === 'high' || t.priority === 'low') ? t.priority : 'medium';

        var statusBtns = Object.keys(SL).map(function(s) {
          var a = s === t.status;
          return '<button data-tid="' + escapeHtml(t.id) + '" data-ts="' + s + '" style="padding:4px 10px;border:1.5px solid ' + (a ? SC[s] : 'var(--border-card)') + ';border-radius:6px;background:' + (a ? 'rgba(59,130,246,0.12)' : 'transparent') + ';color:' + (a ? SC[s] : 'var(--text-secondary)') + ';font-size:11px;font-weight:700;cursor:pointer;font-family:\'Oswald\',sans-serif;">' + SL[s] + '</button>';
        }).join('');

        var safeTitle = (typeof escapeHtml === 'function') ? escapeHtml(t.title) : t.title;
        var safeDesc  = t.description ? ((typeof sanitizeHtml === 'function') ? sanitizeHtml(t.description) : escapeHtml(t.description)) : '';
        var safeAssignee = t.assignee_name ? ((typeof escapeHtml === 'function') ? escapeHtml(t.assignee_name) : t.assignee_name) : '';
        var dateFormatted = t.due_date ? new Date(t.due_date).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

        html += '<div style="background:var(--bg-card);border-radius:12px;padding:14px 16px;margin-bottom:10px;border:1px solid var(--border-card);">'
          + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:8px;">'
          + '<div style="font-family:\'Oswald\',sans-serif;font-size:15px;font-weight:700;color:var(--text-primary);flex:1;">' + safeTitle + '</div>'
          + '<span class="dept-badge ' + dept.cls + '" style="font-size:10px;flex-shrink:0;">' + ((typeof escapeHtml === 'function') ? escapeHtml(dept.label) : dept.label) + '</span></div>'
          + (safeDesc ? '<div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;line-height:1.5;">' + safeDesc + '</div>' : '')
          + '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:10px;">'
          + '<span class="task-pill ' + pc + '">' + (t.priority || 'medium') + '</span>'
          + (safeAssignee ? '<span style="font-size:11px;color:var(--text-secondary);display:inline-flex;align-items:center;gap:3px;"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>' + safeAssignee + '</span>' : '')
          + (dateFormatted ? '<span style="font-size:11px;color:var(--text-secondary);display:inline-flex;align-items:center;gap:3px;"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>' + dateFormatted + '</span>' : '')
          + '</div>'
          + '<div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center;">' + statusBtns
          + '<button data-edit-tid="' + escapeHtml(t.id) + '" title="Edit Task" style="margin-left:auto;background:var(--bg-card-subtle);border:1px solid var(--border-card);color:var(--text-primary);padding:4px 10px;border-radius:6px;cursor:pointer;font-size:11px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>'
          + '<button data-del-tid="' + escapeHtml(t.id) + '" title="Delete Task" style="background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);color:var(--red);padding:4px 10px;border-radius:6px;cursor:pointer;font-size:11px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>'
          + '</div></div>';
      });

      list.innerHTML = html;

      list.querySelectorAll('[data-tid]').forEach(function(btn) {
        btn.addEventListener('click', function() {
          updateTaskStatus(btn.getAttribute('data-tid'), btn.getAttribute('data-ts'));
        });
      });

      list.querySelectorAll('[data-edit-tid]').forEach(function(btn) {
        btn.addEventListener('click', function() {
          editAdminTask(btn.getAttribute('data-edit-tid'));
        });
      });

      list.querySelectorAll('[data-del-tid]').forEach(function(btn) {
        btn.addEventListener('click', function() {
          deleteTask(btn.getAttribute('data-del-tid'));
        });
      });
    } catch (e) {
      list.innerHTML = '<div style="color:#f66;text-align:center;padding:20px;">Failed to load tasks.</div>';
    }
  }

  async function updateTaskStatus(id, status) {
    var client = getSupabaseClient();
    if (!client || !client.patch) return;
    try {
      await client.patch('bb_tasks?id=eq.' + encodeURIComponent(id), { status: status });
      renderAdminTasks(_adminTaskFilter);
    } catch (e) {
      if (typeof showToast === 'function') showToast('Failed to update status.', 'error');
    }
  }

  function editAdminTask(id) {
    if (typeof document === 'undefined') return;
    var t = _allAdminTasks.find(function(x) { return String(x.id) === String(id); });
    if (!t) return;

    var set = function(elId, val) {
      var el = document.getElementById(elId);
      if (el) el.value = val || '';
    };

    set('task-title',    t.title);
    if (typeof reSetValue === 'function') reSetValue('task-desc', t.description || '');
    set('task-priority', t.priority || 'medium');
    set('task-due',      t.due_date ? t.due_date.slice(0, 10) : '');
    set('task-dept',     t.department);
    set('task-edit-id',  t.id);

    var tl = document.getElementById('task-form-toggle-label');
    if (tl) tl.textContent = '\u270f\ufe0f Edit Task';

    loadAssigneeOptions().then(function() {
      if (t.assignee_ic) {
        var sel = document.getElementById('task-assignee');
        if (sel) {
          var ics = t.assignee_ic.split(',');
          Array.from(sel.options).forEach(function(o) {
            o.selected = ics.indexOf(o.value) !== -1;
          });
        }
      }
    });

    var body = document.getElementById('task-form-body');
    if (body && body.style.display === 'none') toggleTaskForm();

    var tt = document.getElementById('task-title');
    if (tt && tt.scrollIntoView) tt.scrollIntoView({ behavior: 'smooth' });
  }

  async function deleteTask(id) {
    var ok = false;
    if (typeof showConfirmModal === 'function') {
      ok = await showConfirmModal('Delete this task?');
    } else {
      ok = true;
    }
    if (!ok) return;

    var client = getSupabaseClient();
    if (!client || !client.delete) return;

    try {
      await client.delete('bb_tasks?id=eq.' + encodeURIComponent(id));
      renderAdminTasks(_adminTaskFilter);
      if (typeof showToast === 'function') showToast('Task deleted successfully.', 'success');
    } catch (e) {
      if (typeof showToast === 'function') showToast('Failed to delete task.', 'error');
    }
  }

  // ── Window & Global Attachment ─────────────────────────────────────────────
  if (typeof global !== 'undefined') {
    global.ADMIN_SECTIONS           = ADMIN_SECTIONS;
    global.RANK_ORDER               = RANK_ORDER;
    global.openAdmin                = openAdmin;
    global.closeAdmin               = closeAdmin;
    global.logoutAdmin              = logoutAdmin;
    global.adminLogin               = adminLogin;
    global.verifyAdminSession       = verifyAdminSession;
    global.verifyAdminSessionSync   = verifyAdminSessionSync;
    global.getAdminSessionToken     = getAdminSessionToken;
    global.getAdminSessionData      = getAdminSessionData;
    global.getAdminLockoutStatus    = getAdminLockoutStatus;
    global.resetAdminLockout        = resetAdminLockout;
    global.toggleAdminPassVis       = toggleAdminPassVis;
    global.backToAdminHome          = backToAdminHome;
    global.switchAdminSection       = switchAdminSection;
    global.switchDeptTab            = switchDeptTab;
    global.toggleTaskForm           = toggleTaskForm;
    global.calcAge                  = calcAge;
    global.setAdminSort             = setAdminSort;
    global.renderAdminList          = renderAdminList;
    global.handleAdminSectionChange = handleAdminSectionChange;
    global.openAddMember            = openAddMember;
    global.openEditMember           = openEditMember;
    global.closeEditMember          = closeEditMember;
    global.saveEditMember           = saveEditMember;
    global.deleteEditMember         = deleteEditMember;
    global.deleteMemberAccount      = deleteMemberAccount;
    global.loadAssigneeOptions      = loadAssigneeOptions;
    global.saveTask                 = saveTask;
    global.clearTaskForm            = clearTaskForm;
    global.renderAdminTasks         = renderAdminTasks;
    global.updateTaskStatus         = updateTaskStatus;
    global.editAdminTask            = editAdminTask;
    global.deleteTask               = deleteTask;
    global._adminMembers            = _adminMembers;
    global._allAdminTasks           = _allAdminTasks;
  }

  // ── CommonJS Export for Node.js Testing ───────────────────────────────────
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      ADMIN_SECTIONS: ADMIN_SECTIONS,
      RANK_ORDER: RANK_ORDER,
    DEFAULT_DEPT_CONFIG,
      openAdmin: openAdmin,
      closeAdmin: closeAdmin,
      logoutAdmin: logoutAdmin,
      getAdminPasswordHash: getAdminPasswordHash,
      verifyAdminPassword: verifyAdminPassword,
      adminLogin: adminLogin,
      verifyAdminSession: verifyAdminSession,
      verifyAdminSessionSync: verifyAdminSessionSync,
      getAdminSessionToken: getAdminSessionToken,
      getAdminSessionData: getAdminSessionData,
      getAdminLockoutStatus: getAdminLockoutStatus,
      resetAdminLockout: resetAdminLockout,
      setAdminSessionTokenForTesting: setAdminSessionTokenForTesting,
      toggleAdminPassVis: toggleAdminPassVis,
      backToAdminHome: backToAdminHome,
      switchAdminSection: switchAdminSection,
      switchDeptTab: switchDeptTab,
      toggleTaskForm: toggleTaskForm,
      calcAge: calcAge,
      setAdminSort: setAdminSort,
      renderAdminList: renderAdminList,
      handleAdminSectionChange: handleAdminSectionChange,
      openAddMember: openAddMember,
      openEditMember: openEditMember,
      closeEditMember: closeEditMember,
      saveEditMember: saveEditMember,
      deleteEditMember: deleteEditMember,
      deleteMemberAccount: deleteMemberAccount,
      loadAssigneeOptions: loadAssigneeOptions,
      saveTask: saveTask,
      clearTaskForm: clearTaskForm,
      renderAdminTasks: renderAdminTasks,
      updateTaskStatus: updateTaskStatus,
      editAdminTask: editAdminTask,
      deleteTask: deleteTask,
      getAdminMembers: function() { return _adminMembers; },
      getAdminTasks: function() { return _allAdminTasks; },
      getAdminSortBy: function() { return _adminSortBy; },
      getAdminTaskFilter: function() { return _adminTaskFilter; }
    };
  }
})(typeof window !== 'undefined' ? window : this);
