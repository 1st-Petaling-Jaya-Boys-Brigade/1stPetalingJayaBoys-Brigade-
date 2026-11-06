/**
 * 1st Petaling Jaya Boys' Brigade Portal - Admin Console Master Controller
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
    'Pre-Junior',
    'Junior',
    'Assistance Junior Leader',
    'Assistant Junior Leader',
    'Junior Leader',
    'Chief Junior Leader',
    'Recruit',
    'Private',
    'Lance Corporal',
    'Corporal',
    'Sergeant',
    'Staff Sergeant',
    'Instructor',
    'Warrant Officer',
    'Lieutenant',
    'Honarary Captain',
    'Honorary Captain',
    'Captain'
  ];

  var DEFAULT_DEPT_CONFIG = {
    secretariat: { label: 'Secretariat', color: '#ce93d8', cls: 'dept-secretariat', prefix: 'SEC' },
    logistics:   { label: 'Logistics',   color: '#42a5f5', cls: 'dept-logistics',   prefix: 'LOG' },
    media:       { label: 'Media',       color: '#ffb74d', cls: 'dept-media',       prefix: 'MED' },
    hq:          { label: 'HQ',          color: '#10b981', cls: 'dept-hq',          prefix: 'HQ'  },
    officers:    { label: 'Officers',    color: '#f59e0b', cls: 'dept-officers',    prefix: 'OFF' }
  };

  // ── Internal State ────────────────────────────────────────────────────────
  var _adminSortBy     = 'name';
  var _adminMembers       = {};
  var _adminPresenceMap   = {};
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

  // ── Cryptographic Session & Gate Hardening ──────────────────────
  var SESSION_MAX_LIFETIME_MS = 8 * 60 * 60 * 1000; // 8 hours absolute lifetime
  var SESSION_IDLE_TIMEOUT_MS = 60 * 60 * 1000;     // 60 minutes idle timeout
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
    // Server-issued tokens do not use dot notation; verified asynchronously
    if (token.indexOf('.') === -1) {
      return true;
    }
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
    var token = getAdminSessionToken();
    if (!token) return false;

    var client = getSupabaseClient();
    if (client && typeof client.rpc === 'function') {
      try {
        var verifyRes = await client.rpc('rpc_verify_admin_session', { p_token: token });
        if (verifyRes && verifyRes.valid === true) {
          return true;
        } else if (verifyRes && verifyRes.valid === false) {
          revokeAdminSession('Server rejected admin session.');
          return false;
        }
      } catch (rpcErr) {
        console.warn('RPC session verify fallback:', rpcErr);
      }
    }

    if (!verifyAdminSessionSync()) return false;
    var parts = token.split('.');
    if (parts.length !== 2) {
      revokeAdminSession('Malformed session token.');
      return false;
    }
    if (!_adminSessionData) return false;

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

  async function openAdmin(skipPush) {
    if (typeof document === 'undefined') return;

    if (!skipPush && typeof history !== 'undefined' && history.pushState && typeof window !== 'undefined' && window.location.hash !== '#admin') {
      var activePg = document.querySelector('.page.active');
      var curTab = activePg ? activePg.id.replace('page-', '') : 'home';
      history.pushState({ tab: curTab, admin: true }, '', '#admin');
    }
    if (typeof document !== 'undefined') {
      document.title = 'Admin Console — 1st PJ Boys\' Brigade';
    }

    if (typeof RBAC !== 'undefined' && typeof RBAC.loadRolesConfig === 'function') {
      try {
        await Promise.race([
          RBAC.loadRolesConfig(),
          new Promise(function(resolve) { setTimeout(resolve, 600); })
        ]);
      } catch (_) {}
    }

    // RBAC Gatekeeper: Block standard members from accessing admin routes/console
    var isMemberSession = false;
    var sessEmail = null;
    var currentRole = 'member';

    if (typeof sessionGet === 'function') {
      sessEmail = sessionGet('email') || sessionGet('ic');
      if (sessEmail) {
        currentRole = (typeof RBAC !== 'undefined' && typeof RBAC.getUserRole === 'function')
          ? RBAC.getUserRole(sessEmail)
          : (sessionGet('role') || 'member');
        // STRICT SECURITY GATE: Officers and Captains without explicit Admin/Super Admin role are strictly blocked
        if (currentRole === 'member' && !verifyAdminSessionSync()) {
          isMemberSession = true;
        }
      }
    }

    if (isMemberSession) {
      if (typeof showToast === 'function') {
        showToast('Access Denied: Administrative privileges required. Only designated Admins and Super Admins may access the Admin Console.', 'error');
      }
      return;
    }

    var overlay = document.getElementById('admin-overlay');
    if (overlay) overlay.style.display = 'block';
    if (document.body) document.body.style.overflow = 'hidden';

    // Passwordless Access for Authenticated Admins & Super Admins
    if (sessEmail && (currentRole === 'admin' || currentRole === 'super_admin')) {
      if (!verifyAdminSessionSync()) {
        await createAdminSessionToken(sessEmail, currentRole === 'super_admin' ? 'Super Admin' : 'Admin');
      }
      if (typeof sessionSet === 'function') {
        sessionSet('adminAuthed', true);
      }

      var loginBoxEl = document.getElementById('admin-login-box');
      if (loginBoxEl) loginBoxEl.style.display = 'none';

      var panelEl = document.getElementById('admin-panel');
      if (panelEl) panelEl.style.display = 'block';

      initAdminDomGuard();
      backToAdminHome();

      if (typeof renderGallery === 'function') renderGallery();
      if (typeof renderAnnouncements === 'function') renderAnnouncements();
      if (typeof loadResources === 'function') loadResources();
      if (typeof initCalendarModule === 'function') initCalendarModule();
      return;
    }

    // Fallback: If no authenticated member session, show password prompt
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

  function closeAdmin(skipHistory) {
    if (typeof document === 'undefined') return;
    var overlay = document.getElementById('admin-overlay');
    if (overlay) overlay.style.display = 'none';
    if (document.body) document.body.style.overflow = '';
    var creatorSec = document.getElementById('adm-section-creator-outlines');
    if (creatorSec) creatorSec.style.display = 'none';
    if (!skipHistory && typeof window !== 'undefined' && window.location.hash === '#admin') {
      if (typeof history !== 'undefined' && typeof history.back === 'function') {
        history.back();
      }
    }
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
    var token = getAdminSessionToken();
    var client = getSupabaseClient();
    if (token && client && typeof client.rpc === 'function') {
      try {
        client.rpc('rpc_admin_logout', { p_token: token }).catch(function() {});
      } catch (_) {}
    }
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

    var client = getSupabaseClient();
    var officerEmail = typeof sessionGet === 'function' ? sessionGet('email') : '';
    var officerRank = typeof sessionGet === 'function' ? sessionGet('rank') : '';

    // Calculate input SHA-256 hash
    var inputHash = '';
    if (typeof computeSha256 === 'function') {
      inputHash = await computeSha256(pass);
    } else if (typeof window !== 'undefined' && typeof window.computeSha256 === 'function') {
      inputHash = await window.computeSha256(pass);
    } else if (typeof crypto !== 'undefined') {
      var cryptoObj = typeof window !== 'undefined' && window.crypto ? window.crypto : (crypto.webcrypto || crypto);
      if (cryptoObj && cryptoObj.subtle && typeof TextEncoder !== 'undefined') {
        var enc = new TextEncoder();
        var buf = await cryptoObj.subtle.digest('SHA-256', enc.encode(pass));
        var bytes = new Uint8Array(buf);
        for (var i = 0; i < bytes.length; i++) {
          var b = bytes[i].toString(16);
          inputHash += b.length === 1 ? '0' + b : b;
        }
      }
    }

    // Try server-side RPC authentication
    if (client && typeof client.rpc === 'function') {
      try {
        var rpcAuth = await client.rpc('rpc_admin_login', {
          p_password_hash: inputHash,
          p_officer_email: officerEmail,
          p_officer_rank: officerRank
        });

        if (rpcAuth && rpcAuth.token) {
          _adminLoginFailures = 0;
          _adminLockoutUntil = 0;
          _adminSessionToken = rpcAuth.token;
          _adminSessionData = {
            role: rpcAuth.role || 'officer_admin',
            officerEmail: officerEmail,
            officerRank: officerRank,
            issuedAt: Date.now(),
            expiresAt: rpcAuth.expires_at ? new Date(rpcAuth.expires_at).getTime() : Date.now() + SESSION_MAX_LIFETIME_MS,
            lastActiveAt: Date.now()
          };

          if (typeof sessionStorage !== 'undefined') {
            try {
              sessionStorage.setItem('bb_admin_session_token', rpcAuth.token);
              sessionStorage.setItem('bb_admin_session_data', JSON.stringify(_adminSessionData));
            } catch (_) {}
          }

          if (typeof sessionSet === 'function') {
            sessionSet('adminAuthed', true);
          }

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
        } else if (rpcAuth && rpcAuth.success === false) {
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
      } catch (rpcErr) {
        console.warn('RPC admin login fallback:', rpcErr);
      }
    }

    var valid = await verifyAdminPassword(pass);
    if (!valid) {
      _adminLoginFailures++;
      if (_adminLoginFailures >= MAX_LOGIN_FAILURES) {
        var lockoutMs2 = Math.min(
          BASE_LOCKOUT_MS * Math.pow(2, _adminLoginFailures - MAX_LOGIN_FAILURES),
          MAX_LOCKOUT_MS
        );
        _adminLockoutUntil = Date.now() + lockoutMs2;
        if (typeof showToast === 'function') {
          showToast('Security Alert: Multiple failed attempts. Locked for ' + Math.round(lockoutMs2 / 1000) + 's.', 'error');
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
    await createAdminSessionToken(officerEmail, officerRank);

    if (passEl) passEl.value = '';

    var loginBoxFallback = document.getElementById('admin-login-box');
    if (loginBoxFallback) loginBoxFallback.style.display = 'none';

    var panelFallback = document.getElementById('admin-panel');
    if (panelFallback) panelFallback.style.display = 'block';

    initAdminDomGuard();
    backToAdminHome();

    if (typeof renderGallery === 'function') renderGallery();
    if (typeof renderAnnouncements === 'function') renderAnnouncements();
    if (typeof loadResources === 'function') loadResources();
    if (typeof initCalendarModule === 'function') initCalendarModule();
    return true;
  }

  function setAdminViewMode(mode) {
    if (typeof document === 'undefined') return;
    var nav = document.querySelector('.adm-section-nav');
    var isGrid = (mode === 'grid');

    if (nav) {
      nav.classList.toggle('adm-view-grid', isGrid);
      nav.classList.toggle('adm-view-list', !isGrid);
    }

    var listBtn = document.querySelector('.adm-view-btn-list');
    var gridBtn = document.querySelector('.adm-view-btn-grid');
    if (listBtn) {
      listBtn.classList.toggle('active', !isGrid);
      listBtn.setAttribute('aria-pressed', !isGrid ? 'true' : 'false');
    }
    if (gridBtn) {
      gridBtn.classList.toggle('active', isGrid);
      gridBtn.setAttribute('aria-pressed', isGrid ? 'true' : 'false');
    }

    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('bb_admin_view_mode', isGrid ? 'grid' : 'list');
      }
    } catch (_) {}
  }

  function getAdminViewMode() {
    try {
      if (typeof localStorage !== 'undefined') {
        return localStorage.getItem('bb_admin_view_mode') || 'list';
      }
    } catch (_) {}
    return 'list';
  }

  function backToAdminHome() {
    if (typeof document === 'undefined') return;
    var backBar = document.getElementById('adm-back-bar');
    if (backBar) backBar.style.display = 'none';

    var toolbar = document.querySelector('.adm-toolbar-row');
    if (toolbar) toolbar.style.display = 'flex';

    ADMIN_SECTIONS.forEach(function(s) {
      var el = document.getElementById('adm-section-' + s);
      if (el) el.style.display = 'none';
    });
    var rolesSec = document.getElementById('adm-section-roles');
    if (rolesSec) rolesSec.style.display = 'none';
    var creatorSec = document.getElementById('adm-section-creator-outlines');
    if (creatorSec) creatorSec.style.display = 'none';

    // Scoped Admin UI Filtering
    var isSuper = (typeof RBAC !== 'undefined' && typeof RBAC.isSuperAdmin === 'function') ? RBAC.isSuperAdmin() : false;

    // Dynamically inject Super Admin Roles & Permissions button if missing
    var rolesBtn = document.getElementById('sec-btn-roles');
    if (!rolesBtn) {
      var calBtn = document.getElementById('sec-btn-calendar');
      if (calBtn && calBtn.parentNode) {
        rolesBtn = document.createElement('div');
        rolesBtn.className = 'adm-section-btn';
        rolesBtn.id = 'sec-btn-roles';
        rolesBtn.onclick = function() { switchAdminSection('roles'); };
        rolesBtn.innerHTML = '<div style="display:flex;align-items:center;gap:12px;"><div class="adm-sec-icon" style="background:rgba(217,163,35,0.15);color:var(--gold);"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg></div><div><div class="adm-sec-title">Roles &amp; Permissions</div><div class="adm-sec-sub">Manage Admin Privileges</div></div></div><div class="adm-sec-arrow">›</div>';
        calBtn.parentNode.appendChild(rolesBtn);
      }
    }

    // Dynamically inject Creator Avatar Outlines button for Jeshua Koh
    var isCreator = (typeof isCreatorSession === 'function') ? isCreatorSession() : false;
    var creatorBtn = document.getElementById('sec-btn-creator-outlines');
    if (!creatorBtn) {
      var calBtnEl = document.getElementById('sec-btn-calendar');
      if (calBtnEl && calBtnEl.parentNode) {
        creatorBtn = document.createElement('div');
        creatorBtn.className = 'adm-section-btn';
        creatorBtn.id = 'sec-btn-creator-outlines';
        creatorBtn.onclick = function() { switchAdminSection('creator_outlines'); };
        creatorBtn.innerHTML = '<div style="display:flex;align-items:center;gap:12px;"><div class="adm-sec-icon" style="background:rgba(139,92,246,0.15);color:#a855f7;"><svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 4.24 4.24"/><path d="m14.83 9.17 4.24-4.24"/><path d="m14.83 14.83 4.24 4.24"/><path d="m9.17 14.83-4.24 4.24"/></svg></div><div><div class="adm-sec-title">Creator Avatar Outlines</div><div class="adm-sec-sub">Assign Custom Outlines &amp; Animations</div></div></div><div class="adm-sec-arrow">›</div>';
        calBtnEl.parentNode.appendChild(creatorBtn);
      }
    }

    var visibleCount = 0;
    document.querySelectorAll('.adm-section-btn').forEach(function(b) {
      var secId = b.id.replace('sec-btn-', '');
      var isVisible = true;
      if (secId === 'roles') {
        isVisible = isSuper;
      } else if (secId === 'creator-outlines' || secId === 'creator_outlines') {
        isVisible = isCreator;
      } else if (typeof RBAC !== 'undefined' && typeof RBAC.hasModulePermission === 'function') {
        isVisible = RBAC.hasModulePermission(secId);
      }
      b.style.display = isVisible ? 'flex' : 'none';
      if (isVisible) visibleCount++;
    });

    var countEl = document.querySelector('.adm-modules-count');
    if (countEl) countEl.textContent = visibleCount + ' Modules';

    setAdminViewMode(getAdminViewMode());
  }

  function switchAdminSection(section) {
    if (typeof document === 'undefined') return;

    var toolbar = document.querySelector('.adm-toolbar-row');
    if (toolbar) toolbar.style.display = 'none';

    if (!verifyAdminSessionSync()) {
      if (typeof showToast === 'function') showToast('Unauthorized: Valid officer session token required.', 'error');
      logoutAdmin();
      return;
    }

    // Scoped Admin Permission Gate
    if (typeof RBAC !== 'undefined' && typeof RBAC.hasModulePermission === 'function') {
      if (!RBAC.hasModulePermission(section)) {
        if (typeof showToast === 'function') {
          showToast('Access Denied: You do not have permission to access the ' + section + ' module.', 'error');
        }
        if (typeof logAuditEvent === 'function') {
          logAuditEvent({
            action: 'admin.unauthorized_section_attempt',
            targetType: 'admin_module',
            targetId: section,
            details: { attempted_section: section }
          });
        }
        return;
      }
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

    var rolesSec = document.getElementById('adm-section-roles');
    if (rolesSec && section !== 'roles') rolesSec.style.display = 'none';
    var creatorSec = document.getElementById('adm-section-creator-outlines');
    if (creatorSec && section !== 'creator_outlines' && section !== 'creator-outlines') creatorSec.style.display = 'none';
    var target = document.getElementById('adm-section-' + section);
    if (target) target.style.display = 'block';

    if (section === 'creator_outlines' || section === 'creator-outlines') {
      var isCreatorUser = (typeof isCreatorSession === 'function') ? isCreatorSession() : false;
      if (!isCreatorUser) {
        if (typeof showToast === 'function') showToast('Access Denied: Only jeshuakoh2008@gmail.com has access to the Creator Avatar Outlines module.', 'error');
        backToAdminHome();
        return;
      }
      renderCreatorAvatarOutlinesStudio();
      return;
    }

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

    if (section === 'roles') {
      renderAdminRoles();
    }
  }

  function switchDeptTab(dept) {
    if (typeof document === 'undefined') return;
    var dConfig = getDeptConfig();

    ['all', 'secretariat', 'logistics', 'media', 'hq', 'officers'].forEach(function(d) {
      var btn = document.getElementById('dtab-' + d) || document.querySelector('[data-dept="' + d + '"]');
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
      var statusBtn = document.querySelector('.adm-sort-btn[data-sort="status"]');
      if (statusBtn) statusBtn.classList.toggle('active-sort', by === 'status');
    }
    renderAdminList();
  }

  function getAdminMemberAvatarHtml(name, emailOrIc, size, presence) {
    var sz = size || 38;
    var fs = Math.max(12, Math.round(sz * 0.42));
    var cleanNm = name || 'Member';
    var isCreator = false;
    if (typeof isPortalCreator === 'function') {
      isCreator = isPortalCreator(cleanNm, emailOrIc);
    } else {
      isCreator = (emailOrIc && emailOrIc.toLowerCase().indexOf('jeshuakoh2008@gmail.com') !== -1);
    }
    var safeName = (typeof escapeHtml === 'function') ? escapeHtml(cleanNm) : cleanNm;
    var tooltip = safeName + (isCreator ? ' (Portal Creator)' : '');

    // Resolve presence status and dot indicator (matching top nav bar)
    var pInfo = presence;
    if (!pInfo) {
      if (typeof getMemberPresenceStatus === 'function') {
        var presMap = (_adminPresenceMap && Object.keys(_adminPresenceMap).length > 0) ? _adminPresenceMap : undefined;
        pInfo = getMemberPresenceStatus({ name: cleanNm, email: emailOrIc, ic: emailOrIc }, presMap);
      } else {
        pInfo = { status: 'offline', label: 'Offline', color: '#6b7280' };
      }
    }
    var dotColor = (pInfo && pInfo.color) ? pInfo.color : '#6b7280';
    var dotLabel = (pInfo && pInfo.label) ? pInfo.label : 'Offline';
    var pStatus = (pInfo && pInfo.status) ? pInfo.status : 'offline';
    var dotTitle = safeName + ' (' + dotLabel + ')';
    var presId = (emailOrIc && emailOrIc.indexOf('@') !== -1) ? emailOrIc : (emailOrIc || cleanNm);
    var dotHtml = '<span class="nav-avatar-status-dot admin-avatar-status-dot avatar-status-dot status-' + pStatus + '" data-presence-id="' + (typeof escapeHtml === 'function' ? escapeHtml(presId) : presId) + '" data-presence-name="' + (typeof escapeHtml === 'function' ? escapeHtml(cleanNm) : cleanNm) + '" style="position:absolute;bottom:-1px;right:-1px;width:10px;height:10px;border-radius:50%;background:' + dotColor + ';border:2px solid var(--bg-card,#1e293b);z-index:10;box-sizing:border-box;" title="' + (typeof escapeHtml === 'function' ? escapeHtml(dotTitle) : dotTitle) + '" aria-label="' + (typeof escapeHtml === 'function' ? escapeHtml(dotLabel) : dotLabel) + '"></span>';

    // Creator Avatar Outline Layering
    var outlineInfo = (typeof getMemberAvatarOutline === 'function')
      ? getMemberAvatarOutline(emailOrIc, cleanNm)
      : (isCreator ? { style: 'rgb', config: { className: 'avatar-outline-rgb' } } : null);

    var outlineHtml = '';
    var hasOutlineCls = '';
    if (outlineInfo && outlineInfo.style && outlineInfo.style !== 'none' && outlineInfo.config && outlineInfo.config.className) {
      hasOutlineCls = ' has-custom-outline avatar-outline-container';
      outlineHtml = '<span class="avatar-outline-overlay ' + outlineInfo.config.className + '" style="position:absolute;inset:0;border-radius:50%;pointer-events:none;z-index:2;box-sizing:border-box;" aria-hidden="true"></span>';
    }

    // Profile Cosmetic Layering
    var cosmeticInfo = (typeof getMemberCosmetic === 'function')
      ? getMemberCosmetic(emailOrIc, cleanNm)
      : null;
    var cosmeticHtml = '';
    if (cosmeticInfo && cosmeticInfo.id && cosmeticInfo.id !== 'none' && (cosmeticInfo.svg || (cosmeticInfo.config && cosmeticInfo.config.badgeHtml))) {
      var cosSvg = cosmeticInfo.svg || cosmeticInfo.config.badgeHtml;
      var cosName = cosmeticInfo.name || (cosmeticInfo.config && cosmeticInfo.config.name) || '';
      var isHeadwear = (cosmeticInfo.category === 'headwear' || (cosmeticInfo.config && cosmeticInfo.config.category === 'headwear'));
      var headwearCls = isHeadwear ? ' is-headwear' : '';
      var cosCls = sz >= 40 ? 'cosmetic-lg' : (sz >= 28 ? 'cosmetic-md' : (sz >= 22 ? 'cosmetic-sm' : 'cosmetic-xs'));
      cosmeticHtml = '<span class="avatar-cosmetic-badge ' + cosCls + headwearCls + '" data-cosmetic-id="' + (typeof escapeHtml === 'function' ? escapeHtml(cosmeticInfo.id) : cosmeticInfo.id) + '" title="' + (typeof escapeHtml === 'function' ? escapeHtml(cosName) : cosName) + '" aria-hidden="true">' + cosSvg + '</span>';
    }

    var photoUrl = null;
    if (typeof getMemberAvatarUrl === 'function') {
      photoUrl = getMemberAvatarUrl(cleanNm, emailOrIc);
    }

    if (photoUrl) {
      return '<span class="admin-member-avatar' + hasOutlineCls + '" style="width:' + sz + 'px;height:' + sz + 'px;border-radius:50%;position:relative;overflow:visible;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;" title="' + tooltip + '" aria-label="' + tooltip + '">' +
        '<img src="' + (typeof escapeHtml === 'function' ? escapeHtml(photoUrl) : photoUrl) + '" style="width:100%;height:100%;object-fit:cover;display:block;border-radius:50%;" alt="' + safeName + '"/>' +
        outlineHtml +
        cosmeticHtml +
        dotHtml +
      '</span>';
    }

    if (isCreator) {
      var isRgb = (outlineInfo && outlineInfo.style === 'rgb');
      var creatorCls = isRgb ? 'creator-outline-avatar creator-rgb-avatar' : '';
      return '<span class="admin-member-avatar' + hasOutlineCls + '" style="width:' + sz + 'px;height:' + sz + 'px;border-radius:50%;position:relative;overflow:visible;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;" title="' + tooltip + '" aria-label="' + tooltip + '">' +
        '<span class="' + creatorCls + '" style="width:100%;height:100%;border-radius:50%;background:#083830;color:#ffffff;font-size:' + fs + 'px;display:flex;align-items:center;justify-content:center;line-height:1;font-weight:700;">J</span>' +
        outlineHtml +
        cosmeticHtml +
        dotHtml +
      '</span>';
    }

    var initial = (typeof getMemberAvatarInitial === 'function')
      ? getMemberAvatarInitial(cleanNm, emailOrIc)
      : (cleanNm.trim().charAt(0).toUpperCase() || '?');

    var color = (typeof getMemberAvatarColor === 'function')
      ? getMemberAvatarColor(cleanNm)
      : '#0284c7';

    return '<span class="admin-member-avatar' + hasOutlineCls + '" style="width:' + sz + 'px;height:' + sz + 'px;border-radius:50%;position:relative;overflow:visible;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;" title="' + tooltip + '" aria-label="' + tooltip + '">' +
      '<span style="width:100%;height:100%;border-radius:50%;background:' + color + ';color:#ffffff;font-size:' + fs + 'px;display:flex;align-items:center;justify-content:center;line-height:1;font-weight:700;">' + (typeof escapeHtml === 'function' ? escapeHtml(initial) : initial) + '</span>' +
      outlineHtml +
      cosmeticHtml +
      dotHtml +
    '</span>';
  }

var _adminMembersCache = null;
  var _adminMembersCacheTime = 0;
  var ADMIN_MEMBERS_CACHE_TTL = 30000;

  async function renderAdminList(forceRefresh) {
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
      // 1. Fetch live member presence map and synchronize across all modules
      _adminPresenceMap = {};
      if (typeof fetchRemoteMemberPresence === 'function') {
        try {
          _adminPresenceMap = await fetchRemoteMemberPresence(true) || {};
        } catch (_) {}
      } else {
        try {
          var pRes = await client.get('bb_config?key=eq.bb_member_presence&select=value');
          if (pRes && pRes.length && pRes[0].value) {
            _adminPresenceMap = (typeof pRes[0].value === 'string') ? JSON.parse(pRes[0].value) : pRes[0].value;
          }
        } catch (_) {}
      }
      if (!_adminPresenceMap && typeof localStorage !== 'undefined') {
        try {
          var localPresenceRaw = localStorage.getItem('bb_member_presence');
          if (localPresenceRaw) _adminPresenceMap = JSON.parse(localPresenceRaw);
        } catch (_) {}
      }
      _adminPresenceMap = _adminPresenceMap || {};
      if (typeof localStorage !== 'undefined') {
        try { localStorage.setItem('bb_member_presence', JSON.stringify(_adminPresenceMap)); } catch (_) {}
      }
      if (typeof window !== 'undefined') window._globalPresenceMap = _adminPresenceMap;
      if (typeof global !== 'undefined') global._adminPresenceMap = _adminPresenceMap;

      // 1b. Fetch deleted members blacklist from bb_config
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

      var now = Date.now();
      var members;
      if (!forceRefresh && _adminMembersCache && (now - _adminMembersCacheTime < ADMIN_MEMBERS_CACHE_TTL)) {
        members = _adminMembersCache;
      } else {
        try {
          members = await client.get('bb_members?select=ic,email,name,rank,squad,section,att_section,department,date_of_birth,joined_at&order=name.asc');
        } catch (selectErr) {
          console.warn('Detailed bb_members query failed, retrying with select all:', selectErr);
          members = await client.get('bb_members?order=name.asc');
        }
        if (!Array.isArray(members)) members = [];
        _adminMembersCache = members;
        _adminMembersCacheTime = now;
      }
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
        if (_adminSortBy === 'status') {
          var pOrder = { online: 0, idle: 1, offline: 2 };
          var pResolver = (typeof getMemberPresenceStatus === 'function')
            ? getMemberPresenceStatus
            : function() { return { status: 'offline' }; };
          var stA = pResolver(a, _adminPresenceMap).status;
          var stB = pResolver(b, _adminPresenceMap).status;
          var ordA = pOrder[stA] !== undefined ? pOrder[stA] : 2;
          var ordB = pOrder[stB] !== undefined ? pOrder[stB] : 2;
          if (ordA !== ordB) return ordA - ordB;
          return (a.name || '').localeCompare(b.name || '');
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
      if (!filtered.length) {
        list.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:36px 20px;background:var(--bg-card);border:1px dashed var(--border-card);border-radius:12px;">'
          + '<div style="font-size:24px;margin-bottom:6px;">🔍</div>'
          + '<div style="font-weight:600;color:var(--text-primary);margin-bottom:4px;">No members found</div>'
          + '<div style="font-size:12px;color:var(--text-muted);">Try adjusting your search query or section filter.</div>'
          + '</div>';
        return;
      }
      if (typeof global !== 'undefined') global._adminMembers = _adminMembers;
      global._adminPresenceMap = _adminPresenceMap;
      if (typeof localStorage !== 'undefined') {
        try { localStorage.setItem('bb_members_cache', JSON.stringify(filtered)); } catch (_) {}
      }

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
          var sq = m.squad || 'No Platoon/Squad';
          if (sq !== lastSquad) {
            var fmtSquadFn = (typeof formatPlatoonOrSquad === 'function') ? formatPlatoonOrSquad : (typeof global !== 'undefined' && typeof global.formatPlatoonOrSquad === 'function' ? global.formatPlatoonOrSquad : null);
            var groupHeading = (fmtSquadFn ? fmtSquadFn(m.squad, m.section || m.att_section) : '') || (((m.section || m.att_section || '').toLowerCase() === 'officer') ? 'Officer' : 'No Platoon/Squad');
            html += '<div style="font-family:var(--font-headline);font-size:11px;font-weight:700;color:var(--gold);letter-spacing:1px;text-transform:uppercase;padding:10px 4px 4px;">' + groupHeading + '</div>';
            lastSquad = sq;
          }
        }
        if (_adminSortBy === 'dept') {
          var currentDeptKey = (m.department || '').trim().toLowerCase();
          var depLabel = (currentDeptKey === 'department nco' || currentDeptKey === 'dept nco') ? 'Department NCO' : ((DEFAULT_DEPT_CONFIG[currentDeptKey] && DEFAULT_DEPT_CONFIG[currentDeptKey].label) || (m.department ? m.department : 'No Department NCO Role (No Tasks Access)'));
          if (depLabel !== lastDept) {
            html += '<div style="font-family:var(--font-headline);font-size:11px;font-weight:700;color:var(--gold);letter-spacing:1px;text-transform:uppercase;padding:12px 4px 6px;">' + ((typeof escapeHtml === 'function') ? escapeHtml(depLabel) : depLabel) + '</div>';
            lastDept = depLabel;
          }
        }

        var safeName = (typeof escapeHtml === 'function') ? escapeHtml(m.name) : m.name;
        var safeIc   = (typeof escapeHtml === 'function') ? escapeHtml(m.ic) : m.ic;
        var rawDisplaySquad = (typeof formatPlatoonOrSquad === 'function' ? formatPlatoonOrSquad(m.squad, m.section || m.att_section) : '') || (((m.section || m.att_section || '').toLowerCase() === 'officer') ? 'Officer' : 'No platoon/squad');
        var safeSquad= (typeof escapeHtml === 'function') ? escapeHtml(rawDisplaySquad) : rawDisplaySquad;
        var safeRank = (typeof escapeHtml === 'function') ? escapeHtml(m.rank || 'No rank') : (m.rank || 'No rank');

        var deptConfig = DEFAULT_DEPT_CONFIG[(m.department || '').toLowerCase()];
        var deptBadge = '';
        if (deptConfig) {
          deptBadge = ' <span class="dept-badge ' + (deptConfig.cls || '') + '" title="Department NCO: Has Projects & Tasks Access" style="display:inline-flex;align-items:center;font-size:10px;padding:2px 7px;border-radius:10px;background:' + (deptConfig.color ? deptConfig.color + '26' : 'rgba(217,163,35,0.15)') + ';color:' + (deptConfig.color || 'var(--accent)') + ';font-weight:700;letter-spacing:0.3px;margin-left:4px;border:1px solid ' + (deptConfig.color ? deptConfig.color + '55' : 'rgba(217,163,35,0.3)') + ';vertical-align:middle;">' + ((typeof escapeHtml === 'function') ? escapeHtml(deptConfig.label) : deptConfig.label) + '</span>';
        } else {
          deptBadge = ' <span title="No Department: Cannot access Projects & Tasks" style="display:inline-flex;align-items:center;font-size:10px;padding:2px 6px;border-radius:10px;background:var(--bg-card-subtle);color:var(--text-muted);font-weight:600;margin-left:4px;border:1px solid var(--border-subtle);vertical-align:middle;">No Dept</span>';
        }

        var pResolver = (typeof getMemberPresenceStatus === 'function')
          ? getMemberPresenceStatus
          : function() { return { status: 'offline', label: 'Offline', color: '#6b7280' }; };
        var pInfo = pResolver(m, _adminPresenceMap);
        var avatarHtml = getAdminMemberAvatarHtml(m.name, m.email || m.ic, 38, pInfo);
        var presenceBadge = ' <span class="admin-presence-badge" style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;color:' + pInfo.color + ';vertical-align:middle;margin-left:4px;" title="' + ((typeof escapeHtml === 'function') ? escapeHtml(pInfo.label) : pInfo.label) + '"><span style="width:7px;height:7px;border-radius:50%;background:' + pInfo.color + ';display:inline-block;"></span> ' + ((typeof escapeHtml === 'function') ? escapeHtml(pInfo.label) : pInfo.label) + '</span>';

        html += '<div class="admin-row" data-edit-ic="' + safeIc + '" style="cursor:pointer;display:flex;align-items:center;gap:12px;">'
          + avatarHtml
          + '<div style="flex:1;min-width:0;">'
            + '<div class="admin-name" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + safeName + consentBadge + deptBadge + '</div>'
            + '<div class="admin-sub" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + (m.ic.indexOf('@') !== -1 ? safeIc : ('ID: ' + safeIc)) + ' \xb7 ' + safeSquad + ' \xb7 ' + safeRank + (m.department ? (' \xb7 ' + ((typeof escapeHtml === 'function') ? escapeHtml((deptConfig && deptConfig.label) || m.department) : m.department)) : '') + ' \xb7 ' + presenceBadge + '</div>'
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
      console.error('renderAdminList error:', e);
      list.innerHTML = '<div class="admin-error-card" style="text-align:center;padding:32px 20px;background:var(--bg-card);border:1px solid var(--border-card);border-radius:12px;color:var(--text-secondary);">'
        + '<div style="font-size:24px;margin-bottom:6px;">⚠️</div>'
        + '<div style="font-weight:600;color:var(--text-primary);margin-bottom:4px;">Failed to load members roster</div>'
        + '<div style="font-size:12px;color:var(--text-muted);margin-bottom:12px;">Database request timed out or network was interrupted.</div>'
        + '<button type="button" class="portal-btn portal-btn-secondary" onclick="renderAdminList()" style="display:inline-flex;align-items:center;gap:6px;margin:0 auto;padding:6px 14px;font-size:12px;cursor:pointer;">'
        + '<svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>'
        + 'Retry</button></div>';
    }
  }

  function handleAdminRankChange() {
    if (typeof document === 'undefined') return;
    var rankEl = document.getElementById('em-rank');
    var secEl = document.getElementById('em-section');
    if (!rankEl || !secEl) return;
    var r = rankEl.value;
    if (!r) return;
    var secRankFn = (typeof getSectionForRank === 'function')
      ? getSectionForRank
      : (typeof global !== 'undefined' && typeof global.getSectionForRank === 'function'
          ? global.getSectionForRank
          : (typeof window !== 'undefined' && typeof window.getSectionForRank === 'function' ? window.getSectionForRank : null));
    if (typeof secRankFn === 'function') {
      var inferred = secRankFn(r);
      if (inferred && secEl.value !== inferred) {
        secEl.value = inferred;
        handleAdminSectionChange(true);
      }
    }
  }

  function handleAdminSectionChange(preserveRank) {
    if (typeof document === 'undefined') return;
    var sec = (document.getElementById('em-section') || {}).value || '';
    var dob = (document.getElementById('em-dob') || {}).value || '';
    var age = (typeof calcAge === 'function') ? calcAge(dob) : null;
    var isMinor = (typeof isMinorSection === 'function')
      ? isMinorSection(sec, age)
      : (sec === 'Pre-Junior' || sec === 'Junior' || (sec !== 'Officer' && age !== null && age <= 11));

    var rankEl = document.getElementById('em-rank');
    var popRank = (typeof populateRankOptions === 'function')
      ? populateRankOptions
      : (typeof global !== 'undefined' && typeof global.populateRankOptions === 'function'
          ? global.populateRankOptions
          : (typeof window !== 'undefined' && typeof window.populateRankOptions === 'function' ? window.populateRankOptions : null));
    if (rankEl && typeof popRank === 'function') {
      var curRank = rankEl.value;
      popRank(rankEl, sec, curRank, sec ? null : 'Select section first...', !!preserveRank);
    }

    var squadEl = document.getElementById('em-squad');
    var popSquad = (typeof populateSquadOptions === 'function')
      ? populateSquadOptions
      : (typeof global !== 'undefined' && typeof global.populateSquadOptions === 'function'
          ? global.populateSquadOptions
          : (typeof window !== 'undefined' && typeof window.populateSquadOptions === 'function' ? window.populateSquadOptions : null));
    if (squadEl && typeof popSquad === 'function') {
      var curSquad = squadEl.value;
      var isOff = (typeof normalizeSection === 'function' ? normalizeSection(sec) : String(sec).toLowerCase()) === 'officer';
      var plHolder = isOff ? 'No platoon/squad (Officer)' : (sec ? (sec === 'Junior' ? 'No squad' : 'No platoon') : 'Select section first...');
      popSquad(squadEl, sec, curSquad, plHolder, !!preserveRank);
      squadEl.disabled = isOff;
    }

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
    var emRankAdd = document.getElementById('em-rank');
    var popRank = (typeof populateRankOptions === 'function')
      ? populateRankOptions
      : (typeof global !== 'undefined' && typeof global.populateRankOptions === 'function'
          ? global.populateRankOptions
          : (typeof window !== 'undefined' && typeof window.populateRankOptions === 'function' ? window.populateRankOptions : null));
    if (emRankAdd && typeof popRank === 'function') {
      popRank(emRankAdd, '', '', 'Select section first...', false);
    }
    var emSquadAdd = document.getElementById('em-squad');
    var popSquad = (typeof populateSquadOptions === 'function')
      ? populateSquadOptions
      : (typeof global !== 'undefined' && typeof global.populateSquadOptions === 'function'
          ? global.populateSquadOptions
          : (typeof window !== 'undefined' && typeof window.populateSquadOptions === 'function' ? window.populateSquadOptions : null));
    if (emSquadAdd && typeof popSquad === 'function') {
      popSquad(emSquadAdd, '', '', 'Select section first...', false);
      emSquadAdd.disabled = false;
    }

    var pc = document.getElementById('em-parent-consent');
    if (pc) pc.checked = false;
    var existingPresCard = document.querySelector('.em-profile-presence-card');
    if (existingPresCard) existingPresCard.style.display = 'none';

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
    if (modal) {
      modal.setAttribute('data-original-name', '');
      modal.style.display = 'block';
    }
  }

  function openEditMember(ic) {
    if (typeof document === 'undefined') return;
    var m = (_adminMembers && _adminMembers[ic]) || { ic: ic };
    // Dynamically inject/update member profile presence card header
    var modalContainer = document.querySelector('#edit-member-modal > div');
    if (modalContainer) {
      var presCard = modalContainer.querySelector('.em-profile-presence-card');
      if (!presCard) {
        presCard = document.createElement('div');
        presCard.className = 'em-profile-presence-card';
        var titleRow = modalContainer.firstElementChild;
        if (titleRow && titleRow.nextElementSibling) {
          modalContainer.insertBefore(presCard, titleRow.nextElementSibling);
        } else {
          modalContainer.appendChild(presCard);
        }
      }
      presCard.style.display = 'flex';
      var pResolver = (typeof getMemberPresenceStatus === 'function')
        ? getMemberPresenceStatus
        : function() { return { status: 'offline', label: 'Offline', color: '#6b7280' }; };
      var pInfo = pResolver(m, _adminPresenceMap);
      var presAvatar = getAdminMemberAvatarHtml(m.name, m.email || m.ic, 44, pInfo);
      var safeName = (typeof escapeHtml === 'function') ? escapeHtml(m.name || 'Member') : (m.name || 'Member');
      var safeRank = (typeof escapeHtml === 'function') ? escapeHtml(m.rank || 'Member') : (m.rank || 'Member');
      var safeId   = (typeof escapeHtml === 'function') ? escapeHtml(m.ic || m.email || '') : (m.ic || m.email || '');

      presCard.innerHTML = presAvatar +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-weight:700;font-size:15px;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + safeName + '</div>' +
          '<div style="font-size:12px;color:var(--text-muted);display:flex;align-items:center;gap:6px;margin-top:2px;flex-wrap:wrap;">' +
            '<span>' + safeId + '</span>' +
            '<span>&bull;</span>' +
            '<span>' + safeRank + '</span>' +
            '<span>&bull;</span>' +
            '<span style="display:inline-flex;align-items:center;gap:4px;font-weight:700;color:' + pInfo.color + ';">' +
              '<span style="width:8px;height:8px;border-radius:50%;background:' + pInfo.color + ';display:inline-block;"></span> ' +
              ((typeof escapeHtml === 'function') ? escapeHtml(pInfo.label) : pInfo.label) +
            '</span>' +
          '</div>' +
        '</div>';
    }


    // Creator Outline Studio Section in Member Edit Modal
    var isCreatorUser = (typeof isCreatorSession === 'function') ? isCreatorSession() : false;
    var existingOutlineBox = modalContainer ? modalContainer.querySelector('.em-creator-outline-box') : null;
    if (modalContainer && isCreatorUser) {
      if (!existingOutlineBox) {
        existingOutlineBox = document.createElement('div');
        existingOutlineBox.className = 'em-creator-outline-box';
        existingOutlineBox.style.cssText = 'margin-top:14px;padding:14px;background:rgba(217,163,35,0.06);border:1px solid rgba(217,163,35,0.3);border-radius:12px;';
        var saveBtn = modalContainer.querySelector('button[type="submit"]') || modalContainer.querySelector('.modal-footer') || modalContainer.lastElementChild;
        if (saveBtn && saveBtn.parentNode) {
          saveBtn.parentNode.insertBefore(existingOutlineBox, saveBtn);
        } else {
          modalContainer.appendChild(existingOutlineBox);
        }
      }
      existingOutlineBox.style.display = 'block';

      var curMemOutline = (typeof getMemberAvatarOutline === 'function')
        ? getMemberAvatarOutline(m.email || m.ic, m.name)
        : { style: 'none', config: { label: 'Standard (None)' } };

      var stylesCatalog = (typeof AVATAR_OUTLINE_STYLES !== 'undefined') ? AVATAR_OUTLINE_STYLES : {};
      var swatchesHtml = '';
      Object.keys(stylesCatalog).forEach(function(k) {
        var st = stylesCatalog[k];
        var isAct = (st.id === curMemOutline.style);
        var swatchBg = st.swatch || (st.id === 'rgb' ? 'conic-gradient(from -45deg, #ff4b4b, #3b82f6, #22c55e, #facc15)' : 'var(--border-card)');
        swatchesHtml +=
          '<button type="button" class="creator-swatch-btn' + (isAct ? ' active' : '') + '" data-outline-id="' + st.id + '" style="margin:2px;">' +
            '<span class="creator-swatch-dot" style="background:' + swatchBg + ';"></span>' +
            '<span>' + ((typeof escapeHtml === 'function') ? escapeHtml(st.label) : st.label) + '</span>' +
          '</button>';
      });

      existingOutlineBox.innerHTML =
        '<div style="font-weight:700;font-size:13px;color:var(--gold);display:flex;align-items:center;gap:6px;margin-bottom:6px;">' +
          '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 4.24 4.24"/><path d="m14.83 9.17 4.24-4.24"/><path d="m14.83 14.83 4.24 4.24"/><path d="m9.17 14.83-4.24 4.24"/></svg>' +
          'Creator Avatar Outline Studio (Creator Exclusive)' +
        '</div>' +
        '<div style="font-size:11px;color:var(--text-muted);margin-bottom:10px;">Select custom outline, multi-stop gradient, or rotating RGB animation for this member:</div>' +
        '<input type="hidden" id="em-chosen-outline" value="' + curMemOutline.style + '" />' +
        '<div class="creator-swatches-wrap" style="display:flex;flex-wrap:wrap;gap:6px;">' +
          swatchesHtml +
        '</div>';

      existingOutlineBox.querySelectorAll('.creator-swatch-btn').forEach(function(sBtn) {
        sBtn.addEventListener('click', function() {
          existingOutlineBox.querySelectorAll('.creator-swatch-btn').forEach(function(b) { b.classList.remove('active'); });
          sBtn.classList.add('active');
          var chosenStyle = sBtn.getAttribute('data-outline-id');
          var hiddenInput = document.getElementById('em-chosen-outline');
          if (hiddenInput) hiddenInput.value = chosenStyle;

          if (_customAvatarOutlinesMap) {
            _customAvatarOutlinesMap[(m.email || m.ic).toLowerCase()] = { style: chosenStyle };
          }
          if (presCard) {
            var updatedAvatar = getAdminMemberAvatarHtml(m.name, m.email || m.ic, 44, pInfo);
            var avWrap = presCard.firstElementChild;
            if (avWrap) presCard.replaceChild(document.createRange().createContextualFragment(updatedAvatar).firstElementChild, avWrap);
          }
        });
      });
    } else if (existingOutlineBox) {
      existingOutlineBox.style.display = 'none';
    }

    var set = function(id, val) {
      var el = document.getElementById(id);
      if (el) el.value = val || '';
    };

    set('em-name',    m.name);
    set('em-ic',      m.ic);
    var secRankFn = (typeof getSectionForRank === 'function')
      ? getSectionForRank
      : (typeof global !== 'undefined' && typeof global.getSectionForRank === 'function'
          ? global.getSectionForRank
          : (typeof window !== 'undefined' && typeof window.getSectionForRank === 'function' ? window.getSectionForRank : null));
    var editSec = m.att_section || m.section || '';
    var rankInferredSec = (m.rank && typeof secRankFn === 'function') ? secRankFn(m.rank) : '';
    if (!editSec || (rankInferredSec && editSec !== rankInferredSec)) {
      if (rankInferredSec) editSec = rankInferredSec;
    }
    set('em-section', editSec);
    var emRankEdit = document.getElementById('em-rank');
    var popRank = (typeof populateRankOptions === 'function')
      ? populateRankOptions
      : (typeof global !== 'undefined' && typeof global.populateRankOptions === 'function'
          ? global.populateRankOptions
          : (typeof window !== 'undefined' && typeof window.populateRankOptions === 'function' ? window.populateRankOptions : null));
    if (emRankEdit && typeof popRank === 'function') {
      popRank(emRankEdit, editSec, m.rank, editSec ? null : 'Select section first...', true);
    } else {
      set('em-rank', m.rank);
    }
    var emSquadEdit = document.getElementById('em-squad');
    var popSquad = (typeof populateSquadOptions === 'function')
      ? populateSquadOptions
      : (typeof global !== 'undefined' && typeof global.populateSquadOptions === 'function'
          ? global.populateSquadOptions
          : (typeof window !== 'undefined' && typeof window.populateSquadOptions === 'function' ? window.populateSquadOptions : null));
    if (emSquadEdit && typeof popSquad === 'function') {
      var isOfficerEdit = (typeof normalizeSection === 'function' ? normalizeSection(editSec) : String(editSec).toLowerCase()) === 'officer';
      var plHolder = isOfficerEdit ? 'No platoon/squad (Officer)' : (editSec === 'Junior' ? 'No squad' : 'No platoon');
      popSquad(emSquadEdit, editSec, m.squad, plHolder, true);
      emSquadEdit.disabled = isOfficerEdit;
    } else {
      set('em-squad',   m.squad);
    }
    set('em-dept',    m.department);

    handleAdminSectionChange(true);

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
    if (modal) {
      modal.setAttribute('data-original-name', m.name || '');
      modal.style.display = 'block';
    }
  }

  function closeEditMember() {
    if (typeof document === 'undefined') return;
    var modal = document.getElementById('edit-member-modal');
    if (modal) modal.style.display = 'none';
  }

  var _isSavingEditMember = false;

  async function saveEditMember() {
    if (typeof document === 'undefined') return;
    if (_isSavingEditMember) return;
    var editModal = document.getElementById('edit-member-modal');
    var saveBtn = editModal ? editModal.querySelector('.submit-btn.gold') : null;
    var origSaveHtml = saveBtn ? saveBtn.innerHTML : '';
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = 'Saving...';
    }
    _isSavingEditMember = true;
    var originalIc = (document.getElementById('em-original-ic') || {}).value || '';
    var oldName = (editModal && editModal.getAttribute('data-original-name')) || (_adminMembers && _adminMembers[originalIc] && _adminMembers[originalIc].name) || '';
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
    var secRankFn = (typeof getSectionForRank === 'function')
      ? getSectionForRank
      : (typeof global !== 'undefined' && typeof global.getSectionForRank === 'function'
          ? global.getSectionForRank
          : (typeof window !== 'undefined' && typeof window.getSectionForRank === 'function' ? window.getSectionForRank : null));
    if (!att_section && rank && typeof secRankFn === 'function') {
      att_section = secRankFn(rank);
    }
    var isOfficerSec = (typeof normalizeSection === 'function' ? normalizeSection(att_section) : String(att_section).toLowerCase()) === 'officer';
    if (isOfficerSec) {
      squad = '';
    }

    var rawPName      = ((document.getElementById('em-parent-name') || {}).value || '').trim();
    var rawPContact   = ((document.getElementById('em-parent-contact') || {}).value || '').trim();
    var parent_name   = (typeof sanitizeText === 'function') ? sanitizeText(rawPName, 100) : rawPName;
    var parent_contact= (typeof sanitizeInput === 'function') ? sanitizeInput(rawPContact, 100) : rawPContact;

    var chosenOutlineInput = document.getElementById('em-chosen-outline');
    if (chosenOutlineInput && typeof saveMemberAvatarOutline === 'function' && typeof isCreatorSession === 'function' && isCreatorSession()) {
      var outlineToSave = chosenOutlineInput.value;
      var actorEm = (typeof sessionGet === 'function' ? (sessionGet('email') || sessionGet('ic')) : '') || 'jeshuakoh2008@gmail.com';
      await saveMemberAvatarOutline(ic || originalIc, outlineToSave, actorEm);
    }

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
    if (!rank || rank === 'No rank') {
      if (typeof showToast === 'function') showToast('Please select a valid rank for this member.', 'warning');
      return;
    }

    var client = getSupabaseClient();
    if (!client) {
      if (typeof showToast === 'function') showToast('Database client unavailable.', 'error');
      return;
    }

    try {
      var consentTimestamp = parental_consent_signed ? new Date().toISOString() : null;

      // Name collision validation: Ensure candidate name does not conflict with another existing member
      var conflictFn = (typeof isNameConflict === 'function')
        ? isNameConflict
        : (typeof window !== 'undefined' && typeof window.isNameConflict === 'function'
            ? window.isNameConflict
            : (typeof global !== 'undefined' && typeof global.isNameConflict === 'function' ? global.isNameConflict : null));

      if (conflictFn) {
        var existingMembersList = [];
        try {
          var allMems = await client.get('bb_members?select=name,email,ic,department');
          if (Array.isArray(allMems)) {
            existingMembersList = allMems.filter(function(m) {
              if (!m || !m.name) return false;
              var dept = String(m.department || '').toLowerCase();
              if (dept === 'deleted' || dept === 'archived_deleted') return false;
              var mIc = String(m.ic || '').toLowerCase();
              if (mIc.startsWith('archived_')) return false;
              return true;
            });
          }
        } catch (_) {}
        if (existingMembersList.length === 0 && typeof _adminMembers === 'object') {
          existingMembersList = Object.values(_adminMembers);
        }
        var conflictingMem = existingMembersList.find(function(m) {
          if (!m || !m.name) return false;
          var mIc = String(m.ic || m.email || '').trim().toLowerCase();
          // Exclude the member currently being edited
          if (mIc && (mIc === String(originalIc).trim().toLowerCase() || mIc === String(ic).trim().toLowerCase())) return false;
          return conflictFn(m.name, name);
        });
        if (conflictingMem) {
          if (typeof showToast === 'function') {
            showToast('The name "' + name + '" conflicts with an already registered member (' + conflictingMem.name + '). Duplicate names are not permitted.', 'warning', 5000);
          }
          return;
        }
      }

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
          section: att_section || null,
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
          var baseUpdates = {
            name: name,
            rank: rank,
            squad: squad,
            department: department,
            section: att_section || null,
            att_section: att_section || null
          };
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

      var memberTargetKey = originalIc || ic;
      if (_adminMembers && _adminMembers[memberTargetKey]) {
        _adminMembers[memberTargetKey].name = name;
        _adminMembers[memberTargetKey].rank = rank;
        _adminMembers[memberTargetKey].squad = squad;
        _adminMembers[memberTargetKey].department = department;
        _adminMembers[memberTargetKey].section = att_section;
        _adminMembers[memberTargetKey].att_section = att_section;
        _adminMembers[memberTargetKey].parent_name = parent_name;
        _adminMembers[memberTargetKey].parent_contact = parent_contact;
        _adminMembers[memberTargetKey].parental_consent_signed = parental_consent_signed;
        _adminMembers[memberTargetKey].media_consent = media_consent;
      }

      var trimmedOldName = (oldName || '').trim();
      var trimmedNewName = (name || '').trim();
      if (trimmedOldName && trimmedNewName && trimmedOldName.toLowerCase() !== trimmedNewName.toLowerCase()) {
        // 1. Sync tasks assigned to old name across Supabase bb_tasks and in memory
        try {
          await client.patch('bb_tasks?assignee_name=eq.' + encodeURIComponent(trimmedOldName), { assignee_name: trimmedNewName });
        } catch (taskErr) {
          console.warn('Could not update assignee_name on bb_tasks:', taskErr);
        }
        if (typeof _allLoadedTasks !== 'undefined' && Array.isArray(_allLoadedTasks)) {
          _allLoadedTasks.forEach(function(t) {
            if (t.assignee_name === trimmedOldName) t.assignee_name = trimmedNewName;
          });
        }
        if (typeof renderBoardOrListTasks === 'function') {
          try { renderBoardOrListTasks(); } catch (_) {}
        }

        // 2. Sync forum post and reply authors
        if (typeof forumPosts !== 'undefined' && Array.isArray(forumPosts)) {
          var changedForum = false;
          forumPosts.forEach(function(p) {
            if (p.authorEmail === originalIc || (p.authorName && p.authorName.toLowerCase() === trimmedOldName.toLowerCase())) {
              p.authorName = trimmedNewName;
              changedForum = true;
            }
            if (Array.isArray(p.replies)) {
              p.replies.forEach(function(r) {
                if (r.authorEmail === originalIc || (r.authorName && r.authorName.toLowerCase() === trimmedOldName.toLowerCase())) {
                  r.authorName = trimmedNewName;
                  changedForum = true;
                }
              });
            }
          });
          if (changedForum && typeof saveForumPosts === 'function') {
            saveForumPosts(forumPosts);
          }
        }

        // 3. Migrate cosmetics & avatar outlines map
        if (typeof _memberCosmeticsMap !== 'undefined' && _memberCosmeticsMap[trimmedOldName.toLowerCase()]) {
          _memberCosmeticsMap[trimmedNewName.toLowerCase()] = _memberCosmeticsMap[trimmedOldName.toLowerCase()];
        }
        if (typeof _customAvatarOutlinesMap !== 'undefined' && _customAvatarOutlinesMap[trimmedOldName]) {
          _customAvatarOutlinesMap[trimmedNewName] = _customAvatarOutlinesMap[trimmedOldName];
        }
        if (typeof _memberPfpsMap !== 'undefined' && _memberPfpsMap[trimmedOldName.toLowerCase()]) {
          _memberPfpsMap[trimmedNewName.toLowerCase()] = _memberPfpsMap[trimmedOldName.toLowerCase()];
        }

        // 4. Update local members cache
        try {
          var memCache = JSON.parse(localStorage.getItem('bb_members_cache') || '[]');
          if (Array.isArray(memCache)) {
            memCache.forEach(function(m) {
              if (m.ic === originalIc || m.name === trimmedOldName) {
                m.name = trimmedNewName;
                m.rank = rank;
                m.squad = squad;
                m.department = department;
                m.section = att_section;
                m.att_section = att_section;
              }
            });
            localStorage.setItem('bb_members_cache', JSON.stringify(memCache));
          }
        } catch (_) {}

        // 5. If this is the currently logged-in user session, update immediately
        var currentSessIc = (typeof sessionGet === 'function') ? (sessionGet('ic') || sessionGet('email')) : '';
        var currentSessNm = (typeof sessionGet === 'function') ? sessionGet('name') : '';
        if (currentSessIc === originalIc || (currentSessNm && currentSessNm.toLowerCase() === trimmedOldName.toLowerCase())) {
          if (typeof sessionSet === 'function') {
            sessionSet('name', trimmedNewName);
            sessionSet('rank', rank);
            sessionSet('section', att_section);
            sessionSet('department', department);
          }
          var sn = document.getElementById('sidebar-user-name');
          if (sn) sn.textContent = trimmedNewName;
          var sb = document.getElementById('sidebar-user-badge');
          if (sb) sb.textContent = rank || 'Member';
        }
      }

      closeEditMember();
      renderAdminList();
    } catch (e) {
      if (typeof showToast === 'function') showToast('Failed: ' + e.message, 'error');
    } finally {
      _isSavingEditMember = false;
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = origSaveHtml;
      }
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
        if (typeof localStorage !== 'undefined') {
          try { localStorage.setItem('bb_deleted_members', JSON.stringify(delList)); } catch (_) {}
        }

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
      // Archive the IC so the original email/IC is immediately freed for future re-registration
      var archivedIc = 'archived_' + Date.now() + '_' + ic;
      try {
        await client.patch('bb_members?ic=eq.' + encodeURIComponent(ic), {
          ic: archivedIc,
          email: null,
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

      // If the deleted account is currently logged in on this browser, revoke access immediately
      var curIc = (typeof sessionGet === 'function') ? sessionGet('ic') : null;
      var curEmail = (typeof sessionGet === 'function') ? sessionGet('email') : null;
      var matchIc = (curIc && String(curIc).toLowerCase().trim() === String(ic).toLowerCase().trim());
      var matchEmail = (curEmail && String(curEmail).toLowerCase().trim() === String(ic).toLowerCase().trim());
      if (matchIc || matchEmail) {
        if (typeof forceKickDeletedAccount === 'function') {
          forceKickDeletedAccount();
          return;
        }
      }

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
        if (typeof logAuditEvent === 'function') {
          logAuditEvent({
            action: 'task.edit',
            targetType: 'task',
            targetId: editId,
            actorRole: 'officer_admin',
            details: { title: title, department: dept }
          });
        }
      } else {
        var taskRes = await client.post('bb_tasks', payload);
        if (typeof showToast === 'function') showToast('✅ Task added!', 'success');
        if (typeof logAuditEvent === 'function') {
          logAuditEvent({
            action: 'task.create',
            targetType: 'task',
            targetId: (taskRes && taskRes[0] && taskRes[0].id) || title,
            actorRole: 'officer_admin',
            details: { title: title, department: dept }
          });
        }
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
          return '<button data-tid="' + escapeHtml(t.id) + '" data-ts="' + s + '" style="padding:4px 10px;border:1.5px solid ' + (a ? SC[s] : 'var(--border-card)') + ';border-radius:6px;background:' + (a ? 'rgba(59,130,246,0.12)' : 'transparent') + ';color:' + (a ? SC[s] : 'var(--text-secondary)') + ';font-size:11px;font-weight:700;cursor:pointer;font-family:var(--font-headline);">' + SL[s] + '</button>';
        }).join('');

        var safeTitle = (typeof escapeHtml === 'function') ? escapeHtml(t.title) : t.title;
        var safeDesc  = t.description ? ((typeof sanitizeHtml === 'function') ? sanitizeHtml(t.description) : escapeHtml(t.description)) : '';
        var safeAssignee = t.assignee_name ? ((typeof escapeHtml === 'function') ? escapeHtml(t.assignee_name) : t.assignee_name) : '';
        var dateFormatted = t.due_date ? new Date(t.due_date).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

        html += '<div style="background:var(--bg-card);border-radius:12px;padding:14px 16px;margin-bottom:10px;border:1px solid var(--border-card);">'
          + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:8px;">'
          + '<div style="font-family:var(--font-headline);font-size:15px;font-weight:700;color:var(--text-primary);flex:1;">' + safeTitle + '</div>'
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
      console.error('renderAdminTasks error:', e);
      list.innerHTML = '<div class="admin-error-card" style="text-align:center;padding:32px 20px;background:var(--bg-card);border:1px solid var(--border-card);border-radius:12px;color:var(--text-secondary);">'
        + '<div style="font-size:24px;margin-bottom:6px;">⚠️</div>'
        + '<div style="font-weight:600;color:var(--text-primary);margin-bottom:4px;">Failed to load tasks</div>'
        + '<div style="font-size:12px;color:var(--text-muted);margin-bottom:12px;">Database request timed out or network was interrupted.</div>'
        + '<button type="button" class="portal-btn portal-btn-secondary" onclick="renderAdminTasks(_adminTaskFilter)" style="display:inline-flex;align-items:center;gap:6px;margin:0 auto;padding:6px 14px;font-size:12px;cursor:pointer;">'
        + '<svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>'
        + 'Retry</button></div>';
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
      if (typeof logAuditEvent === 'function') {
        logAuditEvent({
          action: 'task.delete',
          targetType: 'task',
          targetId: id,
          actorRole: 'officer_admin'
        });
      }
    } catch (e) {
      if (typeof showToast === 'function') showToast('Failed to delete task.', 'error');
    }
  }

  // ── Audit Logs Viewer ──────────────────────────────────────────
  async function renderAdminAuditLogs(containerId) {
    if (typeof document === 'undefined') return;
    var el = document.getElementById(containerId || 'admin-audit-logs');
    if (!el) return;
    el.innerHTML = '<div style="color:var(--text-muted);font-size:13px;text-align:center;padding:16px;">Loading audit logs...</div>';
    var logsRes = (typeof getAuditLogs === 'function') ? await getAuditLogs({ limit: 50 }) : { logs: [] };
    var logs = (logsRes && logsRes.logs) || [];
    if (!logs.length) {
      el.innerHTML = '<div style="color:var(--text-secondary);font-size:13px;text-align:center;padding:16px;">No audit logs recorded yet.</div>';
      return;
    }
    var html = '<table class="audit-log-table" style="width:100%;border-collapse:collapse;font-size:12px;">' +
      '<thead><tr style="border-bottom:1px solid var(--border-card);color:var(--text-secondary);text-align:left;">' +
      '<th style="padding:8px;">Timestamp</th><th style="padding:8px;">Actor</th><th style="padding:8px;">Role</th><th style="padding:8px;">Action</th><th style="padding:8px;">Target</th>' +
      '</tr></thead><tbody>';
    logs.forEach(function(l) {
      var timeStr = l.timestamp ? new Date(l.timestamp).toLocaleString() : '-';
      var safeActor = typeof escapeHtml === 'function' ? escapeHtml(l.actor_id || '') : (l.actor_id || '');
      var safeRole = typeof escapeHtml === 'function' ? escapeHtml(l.actor_role || '') : (l.actor_role || '');
      var safeAction = typeof escapeHtml === 'function' ? escapeHtml(l.action || '') : (l.action || '');
      var safeTarget = typeof escapeHtml === 'function' ? escapeHtml((l.target_type || '') + (l.target_id ? (':' + l.target_id) : '')) : '';
      html += '<tr style="border-bottom:1px solid var(--border-subtle);">' +
        '<td style="padding:8px;color:var(--text-muted);white-space:nowrap;">' + timeStr + '</td>' +
        '<td style="padding:8px;font-weight:600;">' + safeActor + '</td>' +
        '<td style="padding:8px;"><span class="badge-role">' + safeRole + '</span></td>' +
        '<td style="padding:8px;color:var(--accent);font-family:var(--font-mono);">' + safeAction + '</td>' +
        '<td style="padding:8px;">' + safeTarget + '</td>' +
        '</tr>';
    });
    html += '</tbody></table>';
    el.innerHTML = html;
  }

  // ── Super Admin Roles & Permissions Management Console ─────────
  async function renderAdminRoles() {
    if (typeof document === 'undefined') return;
    var panel = document.getElementById('admin-panel');
    if (!panel) return;

    var rolesSec = document.getElementById('adm-section-roles');
    if (!rolesSec) {
      rolesSec = document.createElement('div');
      rolesSec.id = 'adm-section-roles';
      rolesSec.style.display = 'none';
      panel.appendChild(rolesSec);
    }
    rolesSec.style.display = 'block';

    if (typeof RBAC !== 'undefined' && typeof RBAC.loadRolesConfig === 'function') {
      try {
        await Promise.race([
          RBAC.loadRolesConfig(),
          new Promise(function(resolve) { setTimeout(resolve, 800); })
        ]);
      } catch (_) {}
    }

    var isSuper = (typeof RBAC !== 'undefined' && typeof RBAC.isSuperAdmin === 'function') ? RBAC.isSuperAdmin() : false;
    if (!isSuper) {
      rolesSec.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);"><div style="font-size:32px;margin-bottom:8px;">🔒</div><div style="font-size:16px;font-weight:700;color:var(--text-primary);">Access Denied</div><div>Only Super Admins can manage roles and permissions.</div></div>';
      return;
    }

    var headerHtml = '<div class="adm-section-header">' +
      '<div class="adm-sec-icon" style="background:rgba(217,163,35,0.15);color:var(--gold);">' +
        '<svg class="ui-icon-lg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>' +
      '</div>' +
      '<div>' +
        '<div class="adm-section-title">Roles &amp; Permissions Manager</div>' +
      '</div>' +
    '</div>';

    // Fetch real members asynchronously from Supabase bb_members
    var rawList = [];
    var client = getSupabaseClient();
    if (client && typeof client.get === 'function') {
      try {
        var res = await client.get('bb_members?select=ic,email,name,rank,squad,section,department&order=name.asc');
        if (Array.isArray(res) && res.length > 0) {
          rawList = res.filter(function(m) {
            return m.department !== 'deleted' && m.department !== 'archived_deleted';
          });
        }
      } catch (fetchErr) {
        try {
          var resFallback = await client.get('bb_members?order=name.asc');
          if (Array.isArray(resFallback) && resFallback.length > 0) {
            rawList = resFallback.filter(function(m) {
              return m.department !== 'deleted' && m.department !== 'archived_deleted';
            });
          }
        } catch (_) {}
      }
    }

    if (!rawList.length && _adminMembers && Object.keys(_adminMembers).length) {
      rawList = Object.values(_adminMembers);
    }

    if (!rawList.length && typeof localStorage !== 'undefined') {
      try {
        var cached = localStorage.getItem('bb_members_cache') || localStorage.getItem('bb_all_members');
        if (cached) {
          var parsedCached = JSON.parse(cached);
          if (Array.isArray(parsedCached)) rawList = parsedCached;
        }
      } catch (_) {}
    }

    // Exclude dummy test accounts
    var excludedEmails = new Set([
      'member@1stpjbb.org.my'
    ]);
    rawList = rawList.filter(function(m) {
      if (!m) return false;
      var em = (m.email || '').toLowerCase().trim();
      var ic = (m.ic ? String(m.ic).trim().toLowerCase() : '');
      return !excludedEmails.has(em) && !excludedEmails.has(ic);
    });

    // Deduplicate members list - ensure strictly ONE Jeshua Koh account
    var seenKeys = new Set();
    var membersList = [];

    rawList.forEach(function(m) {
      if (!m) return;
      var em = (m.email || '').toLowerCase().trim();
      var ic = (m.ic ? String(m.ic).trim().toLowerCase() : '');
      var nm = (m.name || '').toLowerCase().trim();

      if (em === 'jeshuakoh2008@gmail.com' || ic === 'jeshuakoh2008@gmail.com' || nm === 'jeshua koh') {
        if (seenKeys.has('jeshua_koh')) return;
        seenKeys.add('jeshua_koh');
        m.email = 'jeshuakoh2008@gmail.com';
        m.name = 'Jeshua Koh';
        m.rank = 'Sergeant';
        membersList.push(m);
        return;
      }

      if (!em && ic.indexOf('@') !== -1) {
        em = ic;
        m.email = ic;
      }

      var key = em || ic || nm;
      if (!key) return;
      if (seenKeys.has(key)) return;
      seenKeys.add(key);
      membersList.push(m);
    });

    // Ensure Jeshua Koh is always included as Creator
    if (!seenKeys.has('jeshua_koh')) {
      membersList.unshift({
        email: 'jeshuakoh2008@gmail.com',
        name: 'Jeshua Koh',
        rank: 'Sergeant'
      });
    }

    // Sort: Jeshua Koh first, then alphabetical by name
    membersList.sort(function(a, b) {
      var aIsJeshua = (a.email || '').toLowerCase().trim() === 'jeshuakoh2008@gmail.com';
      var bIsJeshua = (b.email || '').toLowerCase().trim() === 'jeshuakoh2008@gmail.com';
      if (aIsJeshua) return -1;
      if (bIsJeshua) return 1;
      return (a.name || '').localeCompare(b.name || '');
    });

    var listHtml = '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:14px;padding:2px 4px;">' +
      '<div style="font-weight:700;color:var(--text-primary);font-size:15px;letter-spacing:0.2px;">Configured Accounts &amp; Permissions (<span id="rbac-count">' + membersList.length + '</span>)</div>' +
      '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">' +
        '<select id="rbac-role-filter" class="form-select rbac-role-select" onchange="filterRbacMembers()" style="padding:7px 12px;font-size:12px;min-width:130px;">' +
          '<option value="all">All Roles</option>' +
          '<option value="members">Members</option>' +
          '<option value="admins">Admins</option>' +
          '<option value="super_admins">Super Admins</option>' +
        '</select>' +
        '<input type="text" id="rbac-search-input" placeholder="Search by name or email..." oninput="filterRbacMembers()" style="background:var(--bg-input);border:1px solid var(--border-card);color:var(--text-primary);border-radius:var(--radius-sm);padding:7px 14px;font-size:12px;width:220px;outline:none;" />' +
      '</div>' +
    '</div>' +
    '<div id="rbac-members-container" style="display:flex;flex-direction:column;gap:10px;">';

    var modules = (typeof RBAC !== 'undefined') ? RBAC.MODULES.filter(function(m) { return m.id !== 'roles'; }) : [];

    membersList.forEach(function(m, idx) {
      var email = m.email || m.ic || '';
      var currentRole = (typeof RBAC !== 'undefined') ? RBAC.getUserRole(email) : 'member';
      var currentPerms = (typeof RBAC !== 'undefined') ? RBAC.getUserPermissions(email) : [];
      var isAdminUser = currentRole === 'admin';
      var isJeshua = (email.toLowerCase().trim() === 'jeshuakoh2008@gmail.com');
      var memberRank = isJeshua ? 'Sergeant' : (m.rank || 'Recruit');

      var subtitleParts = [];
      subtitleParts.push(typeof escapeHtml === 'function' ? escapeHtml(email) : email);
      subtitleParts.push(typeof escapeHtml === 'function' ? escapeHtml(memberRank) : memberRank);
      if (isJeshua) {
        subtitleParts.push('<span style="color:var(--gold);font-weight:700;">Creator</span>');
      }
      var rankSubtitle = subtitleParts.join(' • ');

      var rbacPresence = (typeof getMemberPresenceStatus === 'function')
        ? getMemberPresenceStatus(m, _adminPresenceMap)
        : null;
      var avatarHtml = getAdminMemberAvatarHtml(m.name, email, 38, rbacPresence);

      listHtml += '<div class="rbac-member-row admin-row" data-name="' + (typeof escapeHtml === 'function' ? escapeHtml((m.name || '').toLowerCase()) : '') + '" data-email="' + (typeof escapeHtml === 'function' ? escapeHtml(email.toLowerCase()) : '') + '" data-role="' + currentRole + '" style="cursor:default;margin-bottom:0;display:flex;flex-direction:column;gap:12px;">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;width:100%;">' +
          '<div style="display:flex;align-items:center;gap:12px;flex:1;min-width:180px;">' +
            avatarHtml +
            '<div style="flex:1;min-width:0;">' +
              '<div class="admin-name" style="font-size:15px;font-weight:700;">' + (typeof escapeHtml === 'function' ? escapeHtml(m.name || 'Unnamed Member') : m.name) + '</div>' +
              '<div class="admin-sub" style="font-size:12px;margin-top:3px;color:var(--text-muted);">' + rankSubtitle + '</div>' +
            '</div>' +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:10px;flex-shrink:0;">' +
            '<select class="form-select rbac-role-select" data-user-email="' + (typeof escapeHtml === 'function' ? escapeHtml(email) : email) + '" onchange="handleRbacRoleChange(this.getAttribute(&quot;data-user-email&quot;), this.value)">' +
              '<option value="member"' + (currentRole === 'member' ? ' selected' : '') + '>Member</option>' +
              '<option value="admin"' + (currentRole === 'admin' ? ' selected' : '') + '>Admin</option>' +
              '<option value="super_admin"' + (currentRole === 'super_admin' ? ' selected' : '') + '>Super Admin</option>' +
            '</select>' +
          '</div>' +
        '</div>' +
        '<div class="rbac-perms-box" id="rbac-perms-' + idx + '" style="margin-top:4px;padding:14px 16px;background:rgba(0,0,0,0.18);border-radius:10px;border:1px solid var(--border-subtle);display:' + (isAdminUser ? 'block' : 'none') + ';width:100%;box-sizing:border-box;">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:8px;">' +
            '<div style="font-size:11px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;">Scoped Admin Permissions:</div>' +
            '<div style="display:flex;align-items:center;gap:10px;">' +
              '<button type="button" data-user="' + (typeof escapeHtml === 'function' ? escapeHtml(email) : email) + '" onclick="selectAllRbacPerms(this.getAttribute(&quot;data-user&quot;), true)" style="background:transparent;border:none;color:var(--accent);font-size:11px;font-weight:700;cursor:pointer;padding:0;">Select All</button>' +
              '<span style="color:var(--border-card);font-size:11px;">|</span>' +
              '<button type="button" data-user="' + (typeof escapeHtml === 'function' ? escapeHtml(email) : email) + '" onclick="selectAllRbacPerms(this.getAttribute(&quot;data-user&quot;), false)" style="background:transparent;border:none;color:var(--text-muted);font-size:11px;font-weight:600;cursor:pointer;padding:0;">Clear All</button>' +
            '</div>' +
          '</div>' +
          '<div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(200px, 1fr));gap:8px;">';

      modules.forEach(function(mod) {
        var isChecked = currentPerms.includes(mod.id);
        listHtml += '<label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text-primary);padding:6px 10px;background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:6px;cursor:pointer;user-select:none;">' +
          '<input type="checkbox" class="rbac-mod-checkbox" data-user="' + (typeof escapeHtml === 'function' ? escapeHtml(email) : email) + '" value="' + mod.id + '"' + (isChecked ? ' checked' : '') + ' onchange="saveMemberRbacPermissions(this.getAttribute(&quot;data-user&quot;), &quot;admin&quot;)" style="accent-color:var(--accent);cursor:pointer;" />' +
          '<span>' + (typeof escapeHtml === 'function' ? escapeHtml(mod.label) : mod.label) + '</span>' +
        '</label>';
      });

      listHtml += '</div></div></div>';
    });

    listHtml += '</div>';

    rolesSec.innerHTML = headerHtml + listHtml;
  }

  async function handleRbacRoleChange(email, newRole) {
    var rows = document.querySelectorAll('.rbac-member-row');
    rows.forEach(function(row) {
      var rowEmail = row.getAttribute('data-email');
      if (rowEmail === email.toLowerCase()) {
        row.setAttribute('data-role', newRole);
        var permsBox = row.querySelector('.rbac-perms-box');
        if (permsBox) {
          permsBox.style.display = (newRole === 'admin') ? 'block' : 'none';
        }
      }
    });

    await saveMemberRbacPermissions(email, newRole);
  }

  function selectAllRbacPerms(email, selectAll) {
    var row = document.querySelector('.rbac-member-row[data-email="' + email.toLowerCase() + '"]');
    if (!row) return;
    row.querySelectorAll('.rbac-mod-checkbox').forEach(function(cb) {
      cb.checked = !!selectAll;
    });
    saveMemberRbacPermissions(email, 'admin');
  }

  function filterRbacMembers(query) {
    var searchInp = document.getElementById('rbac-search-input');
    var q = (typeof query === 'string' ? query : (searchInp ? searchInp.value : '')).toLowerCase().trim();
    var filterEl = document.getElementById('rbac-role-filter');
    var roleFilter = filterEl ? filterEl.value : 'all';

    var rows = document.querySelectorAll('.rbac-member-row');
    var visibleCount = 0;

    rows.forEach(function(r) {
      var n = r.getAttribute('data-name') || '';
      var e = r.getAttribute('data-email') || '';
      var userRole = r.getAttribute('data-role') || 'member';

      var matchesSearch = !q || n.includes(q) || e.includes(q);
      var matchesRole = true;

      if (roleFilter === 'members') {
        matchesRole = (userRole === 'member');
      } else if (roleFilter === 'admins') {
        matchesRole = (userRole === 'admin' || userRole === 'super_admin');
      } else if (roleFilter === 'super_admins') {
        matchesRole = (userRole === 'super_admin');
      }

      if (matchesSearch && matchesRole) {
        r.style.display = 'flex';
        visibleCount++;
      } else {
        r.style.display = 'none';
      }
    });

    var countEl = document.getElementById('rbac-count');
    if (countEl) countEl.textContent = visibleCount;
  }

  async function saveMemberRbacPermissions(email, overrideRole) {
    if (!email) return;
    var row = document.querySelector('.rbac-member-row[data-email="' + email.toLowerCase() + '"]');
    if (!row) return;

    var roleSelect = row.querySelector('.rbac-role-select');
    var newRole = overrideRole || (roleSelect ? roleSelect.value : 'member');

    var checkedPerms = [];
    row.querySelectorAll('.rbac-mod-checkbox:checked').forEach(function(cb) {
      checkedPerms.push(cb.value);
    });

    if (newRole === 'admin' && checkedPerms.length === 0) {
      row.querySelectorAll('.rbac-mod-checkbox').forEach(function(cb) {
        cb.checked = true;
        checkedPerms.push(cb.value);
      });
    }

    try {
      if (typeof RBAC !== 'undefined' && typeof RBAC.assignUserRole === 'function') {
        await RBAC.assignUserRole(email, newRole, checkedPerms);
        row.setAttribute('data-role', newRole);
        if (typeof showToast === 'function') {
          showToast('Updated role to ' + (newRole === 'super_admin' ? 'Super Admin' : (newRole === 'admin' ? 'Admin' : 'Member')) + ' for ' + email, 'success');
        }
      }
    } catch (err) {
      if (typeof showToast === 'function') {
        showToast('Failed to update role: ' + err.message, 'error');
      }
      // Revert select value if failed
      if (roleSelect && typeof RBAC !== 'undefined') {
        roleSelect.value = RBAC.getUserRole(email);
      }
    }
  }


  // ── Creator Avatar Outlines Studio ───────────────────────────────
  async function renderCreatorAvatarOutlinesStudio() {
    if (typeof document === 'undefined') return;

    var isCreatorUser = (typeof isCreatorSession === 'function') ? isCreatorSession() : false;
    if (!isCreatorUser) {
      if (typeof showToast === 'function') {
        showToast('Access Denied: Only jeshuakoh2008@gmail.com has access to the Creator Avatar Outlines module.', 'error');
      }
      backToAdminHome();
      return;
    }

    var panel = document.getElementById('admin-panel');
    if (!panel) return;

    var sec = document.getElementById('adm-section-creator-outlines');
    if (!sec) {
      sec = document.createElement('div');
      sec.id = 'adm-section-creator-outlines';
      panel.appendChild(sec);
    }
    sec.style.display = 'block';

    var backBar = document.getElementById('adm-back-bar');
    if (backBar) {
      backBar.style.display = 'block';
      var titleSpan = backBar.querySelector('.adm-back-title') || backBar.querySelector('span');
      if (titleSpan) titleSpan.textContent = 'Creator Avatar Outlines &amp; Cosmetics Studio';
    }

    sec.innerHTML = (typeof renderSkeletonTable === 'function')
      ? renderSkeletonTable(4, 5)
      : '<div class="skeleton-shimmer" style="height:200px;border-radius:12px;"></div>';

    if (typeof loadCustomAvatarOutlines === 'function') {
      await loadCustomAvatarOutlines();
    }

    var client = getSupabaseClient();
    var members = [];

    // 1. Check in-memory admin members first
    if (_adminMembers && Object.keys(_adminMembers).length > 0) {
      members = Object.values(_adminMembers);
    }

    // 2. Fetch fresh members directly from Supabase
    if (client && typeof client.get === 'function') {
      try {
        var remoteMembers = await client.get('bb_members?order=name.asc');
        if (Array.isArray(remoteMembers) && remoteMembers.length > 0) {
          members = remoteMembers;
        }
      } catch (fetchErr) {
        try {
          var fallbackMembers = await client.get('bb_members?select=ic,email,name,rank,squad,section&order=name.asc');
          if (Array.isArray(fallbackMembers) && fallbackMembers.length > 0) {
            members = fallbackMembers;
          }
        } catch (_) {}
      }
    }

    // 3. Fallback to localStorage member caches
    if (!members.length && typeof localStorage !== 'undefined') {
      try {
        var rawCache = localStorage.getItem('bb_members_cache') || localStorage.getItem('bb_all_members');
        if (rawCache) {
          var parsed = JSON.parse(rawCache);
          if (Array.isArray(parsed) && parsed.length > 0) members = parsed;
        }
      } catch (_) {}
    }

    // 4. Fallback to cached department members
    if (!members.length && typeof window !== 'undefined' && Array.isArray(window._cachedDepartmentMembers) && window._cachedDepartmentMembers.length > 0) {
      members = window._cachedDepartmentMembers.slice();
    }

    // 5. Exclude deleted members from blacklist
    var deletedSet = new Set();
    if (client && typeof client.get === 'function') {
      try {
        var cfgRes = await client.get('bb_config?key=eq.bb_deleted_members&select=value');
        if (cfgRes && cfgRes.length && cfgRes[0].value) {
          var arr = JSON.parse(cfgRes[0].value);
          if (Array.isArray(arr)) {
            arr.forEach(function(id) { deletedSet.add(id); });
          }
        }
      } catch (_) {}
    }

    if (!Array.isArray(members)) members = [];

    members = members.filter(function(m) {
      if (!m) return false;
      if (m.ic && deletedSet.has(m.ic)) return false;
      return m.department !== 'deleted' && m.department !== 'archived_deleted';
    });

    // Populate _adminMembers & localStorage cache so all modules immediately share data
    if (members.length > 0) {
      _adminMembers = _adminMembers || {};
      members.forEach(function(m) {
        if (m && m.ic) {
          _adminMembers[m.ic] = m;
        }
      });
      if (typeof global !== 'undefined') global._adminMembers = _adminMembers;
      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem('bb_members_cache', JSON.stringify(members));
        } catch (_) {}
      }
    }

    var stylesCatalog = (typeof AVATAR_OUTLINE_STYLES !== 'undefined') ? AVATAR_OUTLINE_STYLES : {};
    var stylesList = Object.keys(stylesCatalog).map(function(k) { return stylesCatalog[k]; });

    var customCount = 0;
    members.forEach(function(m) {
      var out = (typeof getMemberAvatarOutline === 'function')
        ? getMemberAvatarOutline(m.email || m.ic, m.name)
        : null;
      if (out && out.style && out.style !== 'none') customCount++;
    });

    var html =
      '<div style="margin-bottom:16px;">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:14px;">' +
          '<div>' +
            '<div style="font-family:var(--font-headline);font-size:20px;font-weight:700;color:var(--text-primary);display:flex;align-items:center;gap:8px;">' +
              '<span style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:8px;background:rgba(139,92,246,0.15);color:#a855f7;">' +
                '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 4.24 4.24"/><path d="m14.83 9.17 4.24-4.24"/><path d="m14.83 14.83 4.24 4.24"/><path d="m9.17 14.83-4.24 4.24"/></svg>' +
              '</span>' +
              'Creator Avatar Outlines Studio' +
            '</div>' +
            '<div style="font-size:12px;color:var(--text-muted);margin-top:2px;">Exclusive Creator Studio &middot; Assign custom animated RGB, gradients, and solid outline accents to member profiles.</div>' +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:8px;">' +
            '<span style="font-size:11px;font-weight:700;padding:4px 10px;border-radius:12px;background:rgba(139,92,246,0.15);color:#a855f7;border:1px solid rgba(139,92,246,0.3);">' + customCount + ' Active Outlines</span>' +
            '<span style="font-size:11px;font-weight:700;padding:4px 10px;border-radius:12px;background:var(--bg-card-subtle);color:var(--text-secondary);border:1px solid var(--border-card);">' + members.length + ' Total Members</span>' +
          '</div>' +
        '</div>' +

        '<div style="margin-bottom:14px;position:relative;">' +
          '<input type="text" id="creator-outlines-search" class="form-input" placeholder="Search members by name, squad, rank, or outline style..." style="padding-left:36px;width:100%;box-sizing:border-box;" />' +
          '<span style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--text-muted);pointer-events:none;">' +
            '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' +
          '</span>' +
        '</div>' +

        '<div id="creator-outlines-grid" style="display:grid;grid-template-columns:repeat(auto-fill, minmax(320px, 1fr));gap:12px;"></div>' +
      '</div>';

    sec.innerHTML = html;

    function renderGrid(query) {
      var q = String(query || '').toLowerCase().trim();
      var grid = document.getElementById('creator-outlines-grid');
      if (!grid) return;

      var filtered = members.filter(function(m) {
        if (!q) return true;
        var curOut = (typeof getMemberAvatarOutline === 'function')
          ? getMemberAvatarOutline(m.email || m.ic, m.name)
          : null;
        var outLabel = (curOut && curOut.config && curOut.config.label) ? curOut.config.label.toLowerCase() : '';
        return (m.name || '').toLowerCase().includes(q) ||
               (m.ic || '').toLowerCase().includes(q) ||
               (m.rank || '').toLowerCase().includes(q) ||
               (m.squad || '').toLowerCase().includes(q) ||
               outLabel.includes(q);
      });

      if (!filtered.length) {
        grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:36px 20px;color:var(--text-muted);background:var(--bg-card-subtle);border:1px dashed var(--border-card);border-radius:12px;">No matching members found.</div>';
        return;
      }

      var cardsHtml = '';
      filtered.forEach(function(m) {
        var cleanTarget = m.email || m.ic;
        var curOut = (typeof getMemberAvatarOutline === 'function')
          ? getMemberAvatarOutline(cleanTarget, m.name)
          : { style: 'none', config: { label: 'Standard (None)' } };

        var safeName = (typeof escapeHtml === 'function') ? escapeHtml(m.name || 'Member') : (m.name || 'Member');
        var safeRank = (typeof escapeHtml === 'function') ? escapeHtml(m.rank || 'Member') : (m.rank || 'Member');
        var safeSquad = (typeof escapeHtml === 'function') ? escapeHtml(m.squad || 'No Platoon') : (m.squad || 'No Platoon');
        var safeTarget = (typeof escapeHtml === 'function') ? escapeHtml(cleanTarget) : cleanTarget;

        var avatarHtml = getAdminMemberAvatarHtml(m.name, cleanTarget, 48);

        var curCosmetic = (typeof getMemberCosmetic === 'function')
          ? getMemberCosmetic(cleanTarget, m.name)
          : { id: 'none' };

        var cosmeticsCatalog = (typeof PROFILE_COSMETICS !== 'undefined') ? PROFILE_COSMETICS : {};
        var cosmeticsOptionsHtml = '<option value="none"' + (curCosmetic.id === 'none' ? ' selected' : '') + '>None (No cosmetic)</option>';
        var cats = ['headwear', 'badges'];
        cats.forEach(function(cKey) {
          var matching = Object.values(cosmeticsCatalog).filter(function(it) { return it.category === cKey; });
          if (matching.length) {
            cosmeticsOptionsHtml += '<optgroup label="' + matching[0].categoryLabel + '">';
            matching.forEach(function(it) {
              var sel = (it.id === curCosmetic.id) ? ' selected' : '';
              cosmeticsOptionsHtml += '<option value="' + it.id + '"' + sel + '>' + it.name + ' (' + it.price + ' 🪙)' + '</option>';
            });
            cosmeticsOptionsHtml += '</optgroup>';
          }
        });

        var optionsHtml = '';
        stylesList.forEach(function(st) {
          var selected = (st.id === curOut.style) ? ' selected' : '';
          optionsHtml += '<option value="' + st.id + '"' + selected + '>' + ((typeof escapeHtml === 'function') ? escapeHtml(st.label) : st.label) + ' (' + st.badge + ')' + '</option>';
        });

        cardsHtml +=
          '<div class="creator-member-card" data-member-target="' + safeTarget + '" style="background:var(--bg-card);border:1px solid var(--border-card);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:12px;">' +
            '<div style="display:flex;align-items:center;gap:12px;">' +
              '<div class="creator-card-avatar-wrap" style="flex-shrink:0;">' + avatarHtml + '</div>' +
              '<div style="flex:1;min-width:0;">' +
                '<div style="font-weight:700;font-size:14px;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + safeName + '</div>' +
                '<div style="font-size:11px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + safeRank + ' &middot; ' + safeSquad + '</div>' +
                '<div style="font-size:10px;color:var(--accent);margin-top:2px;font-family:monospace;">' + safeTarget + '</div>' +
              '</div>' +
            '</div>' +
            '<div style="display:flex;flex-direction:column;gap:8px;margin-top:auto;">' +
              '<div style="display:flex;flex-direction:column;gap:4px;">' +
                '<label style="font-size:10px;text-transform:uppercase;letter-spacing:0.04em;font-weight:700;color:var(--text-muted);">Avatar Outline</label>' +
                '<div style="display:flex;align-items:center;gap:8px;">' +
                  '<select class="form-input creator-outline-select" style="font-size:12px;padding:6px 10px;flex:1;">' +
                    optionsHtml +
                  '</select>' +
                  '<button type="button" class="creator-apply-btn" style="background:var(--accent);color:var(--btn-on-accent,#121418);border:none;border-radius:8px;padding:6px 12px;font-size:11px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:4px;flex-shrink:0;">' +
                    'Apply' +
                  '</button>' +
                '</div>' +
              '</div>' +
              '<div style="display:flex;flex-direction:column;gap:4px;">' +
                '<label style="font-size:10px;text-transform:uppercase;letter-spacing:0.04em;font-weight:700;color:var(--text-muted);">Profile Cosmetic</label>' +
                '<div style="display:flex;align-items:center;gap:8px;">' +
                  '<select class="form-input creator-cosmetic-select" style="font-size:12px;padding:6px 10px;flex:1;">' +
                    cosmeticsOptionsHtml +
                  '</select>' +
                  '<button type="button" class="creator-apply-cosmetic-btn" style="background:var(--secondary,#1e3a8a);color:#ffffff;border:none;border-radius:8px;padding:6px 12px;font-size:11px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:4px;flex-shrink:0;">' +
                    'Give / Set' +
                  '</button>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>';
      });

      grid.innerHTML = cardsHtml;

      grid.querySelectorAll('.creator-member-card').forEach(function(card) {
        var targetId = card.getAttribute('data-member-target');
        var select = card.querySelector('.creator-outline-select');
        var applyBtn = card.querySelector('.creator-apply-btn');
        var avatarWrap = card.querySelector('.creator-card-avatar-wrap');

        if (select && avatarWrap) {
          select.addEventListener('change', function() {
            var newStyle = select.value;
            if (_customAvatarOutlinesMap) {
              _customAvatarOutlinesMap[targetId.toLowerCase()] = { style: newStyle };
            }
            var mem = members.find(function(m) { return (m.email || m.ic) === targetId; }) || { name: targetId };
            avatarWrap.innerHTML = getAdminMemberAvatarHtml(mem.name, targetId, 48);
          });
        }

        if (applyBtn && select) {
          applyBtn.addEventListener('click', async function() {
            var newStyle = select.value;
            applyBtn.disabled = true;
            applyBtn.textContent = 'Saving...';
            try {
              var mem = members.find(function(m) { return (m.email || m.ic) === targetId; }) || { name: targetId };
              var actorEmail = (typeof sessionGet === 'function' ? (sessionGet('email') || sessionGet('ic')) : '') || 'jeshuakoh2008@gmail.com';
              var res = await saveMemberAvatarOutline(targetId, newStyle, actorEmail, mem.name);
              if (res.success) {
                if (typeof showToast === 'function') {
                  showToast('Custom avatar outline applied successfully!', 'success');
                }
                avatarWrap.innerHTML = getAdminMemberAvatarHtml(mem.name, targetId, 48);
              } else {
                if (typeof showToast === 'function') {
                  showToast(res.error || 'Failed to save outline.', 'error');
                }
              }
            } catch (err) {
              if (typeof showToast === 'function') showToast('Error saving: ' + (err.message || err), 'error');
            } finally {
              applyBtn.disabled = false;
              applyBtn.textContent = 'Apply';
            }
          });
        }

        var cosmeticSelect = card.querySelector('.creator-cosmetic-select');
        var applyCosmeticBtn = card.querySelector('.creator-apply-cosmetic-btn');

        if (cosmeticSelect && avatarWrap) {
          cosmeticSelect.addEventListener('change', function() {
            var newCosId = cosmeticSelect.value;
            if (typeof _memberCosmeticsMap !== 'undefined' && _memberCosmeticsMap) {
              var existing = _memberCosmeticsMap[targetId.toLowerCase()] || {};
              _memberCosmeticsMap[targetId.toLowerCase()] = Object.assign({}, existing, { equipped: newCosId, activeId: newCosId });
            }
            var mem = members.find(function(m) { return (m.email || m.ic) === targetId; }) || { name: targetId };
            avatarWrap.innerHTML = getAdminMemberAvatarHtml(mem.name, targetId, 48);
          });
        }

        if (applyCosmeticBtn && cosmeticSelect) {
          applyCosmeticBtn.addEventListener('click', async function() {
            var newCosId = cosmeticSelect.value;
            applyCosmeticBtn.disabled = true;
            applyCosmeticBtn.textContent = 'Saving...';
            try {
              var mem = members.find(function(m) { return (m.email || m.ic) === targetId; }) || { name: targetId };
              var actorEmail = (typeof sessionGet === 'function' ? (sessionGet('email') || sessionGet('ic')) : '') || 'jeshuakoh2008@gmail.com';
              var res = await saveMemberCosmetic(targetId, newCosId, actorEmail, mem.name);
              if (res.success) {
                if (typeof showToast === 'function') {
                  showToast('Profile cosmetic granted to ' + (mem.name || targetId) + '!', 'success');
                }
                avatarWrap.innerHTML = getAdminMemberAvatarHtml(mem.name, targetId, 48);
              } else {
                if (typeof showToast === 'function') {
                  showToast(res.error || 'Failed to grant cosmetic.', 'error');
                }
              }
            } catch (err) {
              if (typeof showToast === 'function') showToast('Error saving: ' + (err.message || err), 'error');
            } finally {
              applyCosmeticBtn.disabled = false;
              applyCosmeticBtn.textContent = 'Give / Set';
            }
          });
        }
      });
    }

    renderGrid('');

    var searchInput = document.getElementById('creator-outlines-search');
    if (searchInput) {
      searchInput.addEventListener('input', function() {
        renderGrid(searchInput.value);
      });
    }
  }

  // ── Admin Blocked Emails Management (bb_blocked_emails) ─────────────────
  var _blockedEmails = [];

  async function loadBlockedEmails() {
    var client = getSupabaseClient();
    if (client) {
      try {
        var res = await client.get('bb_config?key=eq.bb_blocked_emails&select=value');
        if (res && res.length && res[0].value) {
          var parsed = typeof res[0].value === 'string' ? JSON.parse(res[0].value) : res[0].value;
          if (Array.isArray(parsed)) {
            _blockedEmails = parsed.map(function(x) { return String(x).toLowerCase().trim(); });
            try {
              if (typeof localStorage !== 'undefined') {
                localStorage.setItem('bb_blocked_emails', JSON.stringify(_blockedEmails));
              }
            } catch (_) {}
            updateBlockedEmailsCountBadge();
            return _blockedEmails;
          }
        }
      } catch (err) {
        console.warn('loadBlockedEmails note:', err);
      }
    }
    if (typeof localStorage !== 'undefined') {
      try {
        var cached = localStorage.getItem('bb_blocked_emails');
        if (cached) {
          var parsedCached = JSON.parse(cached);
          if (Array.isArray(parsedCached)) _blockedEmails = parsedCached;
        }
      } catch (_) {}
    }
    updateBlockedEmailsCountBadge();
    return _blockedEmails;
  }

  async function saveBlockedEmails(list) {
    _blockedEmails = list.map(function(x) { return String(x).toLowerCase().trim(); }).filter(Boolean);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('bb_blocked_emails', JSON.stringify(_blockedEmails));
      }
    } catch (_) {}

    var client = getSupabaseClient();
    if (client) {
      try {
        await client.req('POST', 'bb_config?on_conflict=key', {
          key: 'bb_blocked_emails',
          value: JSON.stringify(_blockedEmails),
          updated_at: new Date().toISOString()
        });
      } catch (postErr) {
        try {
          await client.patch('bb_config?key=eq.bb_blocked_emails', {
            value: JSON.stringify(_blockedEmails),
            updated_at: new Date().toISOString()
          });
        } catch (patchErr) {
          console.warn('saveBlockedEmails db sync note:', patchErr);
        }
      }
    }
    updateBlockedEmailsCountBadge();
    return _blockedEmails;
  }

  function updateBlockedEmailsCountBadge() {
    if (typeof document === 'undefined') return;
    var badge = document.querySelector('.blocked-emails-count');
    if (badge) badge.textContent = _blockedEmails.length;
  }

  async function addBlockedEmail(email) {
    var em = String(email || '').trim().toLowerCase();
    if (!em || em.indexOf('@') === -1) {
      if (typeof showToast === 'function') showToast('Please enter a valid email address.', 'warning');
      return false;
    }
    if (em === 'jeshuakoh2008@gmail.com') {
      if (typeof showToast === 'function') showToast('Portal Creator email cannot be blocked.', 'error');
      return false;
    }
    await loadBlockedEmails();
    if (_blockedEmails.includes(em)) {
      if (typeof showToast === 'function') showToast('This email is already in the blocklist.', 'warning');
      return false;
    }
    _blockedEmails.push(em);
    await saveBlockedEmails(_blockedEmails);
    if (typeof showToast === 'function') showToast('Email ' + em + ' has been blocked.', 'success');
    renderBlockedEmailsList();
    return true;
  }

  async function removeBlockedEmail(email) {
    var em = String(email || '').trim().toLowerCase();
    await loadBlockedEmails();
    _blockedEmails = _blockedEmails.filter(function(x) { return x !== em; });
    await saveBlockedEmails(_blockedEmails);
    if (typeof showToast === 'function') showToast('Email ' + em + ' has been unblocked.', 'info');
    renderBlockedEmailsList();
    return true;
  }

  function renderBlockedEmailsList() {
    if (typeof document === 'undefined') return;
    var listContainer = document.querySelector('.blocked-emails-list');
    if (!listContainer) return;

    if (!_blockedEmails || _blockedEmails.length === 0) {
      listContainer.innerHTML = '<div style="padding:28px 16px;text-align:center;color:var(--text-muted);font-size:13px;"><svg class="ui-icon" style="opacity:0.5;margin-bottom:6px;width:28px;height:28px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg><div style="font-weight:600;color:var(--text-secondary);">No Blocked Emails</div><div>All registered and prospective email addresses are currently allowed.</div></div>';
      return;
    }

    var html = '';
    _blockedEmails.forEach(function(em) {
      var safeEm = (typeof escapeHtml === 'function') ? escapeHtml(em) : em;
      html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--bg-card);border:1px solid var(--border-card);border-radius:10px;margin-bottom:8px;font-size:13px;">' +
        '<div style="display:flex;align-items:center;gap:10px;overflow:hidden;">' +
          '<span style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;background:rgba(239,68,68,0.15);color:#ef4444;flex-shrink:0;">' +
            '<svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>' +
          '</span>' +
          '<span style="font-family:var(--font-mono,monospace);font-weight:600;color:var(--text-primary);text-overflow:ellipsis;overflow:hidden;white-space:nowrap;">' + safeEm + '</span>' +
        '</div>' +
        '<button type="button" onclick="removeBlockedEmail(\'' + safeEm + '\')" style="background:none;border:1px solid rgba(239,68,68,0.3);color:#ef4444;padding:4px 10px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;display:inline-flex;align-items:center;gap:4px;white-space:nowrap;" title="Unblock this email address">' +
          'Unblock' +
        '</button>' +
      '</div>';
    });
    listContainer.innerHTML = html;
  }

  async function openBlockedEmailsModal() {
    if (typeof document === 'undefined') return;
    await loadBlockedEmails();

    var existingOverlay = document.querySelector('.blocked-emails-modal-overlay');
    if (existingOverlay) {
      existingOverlay.style.display = 'flex';
      renderBlockedEmailsList();
      return;
    }

    var overlay = document.createElement('div');
    overlay.className = 'modal-backdrop blocked-emails-modal-overlay';
    overlay.style.cssText = 'display:flex;position:fixed;inset:0;background:rgba(0,0,0,0.72);backdrop-filter:blur(6px);z-index:99999;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Blocked Emails & Account Restrictions');

    overlay.innerHTML =
      '<div class="modal-card" style="background:var(--bg-card);border:1px solid var(--border-card);border-radius:16px;max-width:520px;width:100%;box-shadow:var(--shadow-modal,0 20px 40px rgba(0,0,0,0.5));overflow:hidden;display:flex;flex-direction:column;max-height:85vh;">' +
        '<div style="padding:18px 22px;border-bottom:1px solid var(--border-card);display:flex;align-items:center;justify-content:space-between;background:var(--bg-card-subtle);">' +
          '<div style="display:flex;align-items:center;gap:10px;">' +
            '<div style="width:36px;height:36px;border-radius:10px;background:rgba(239,68,68,0.15);color:#ef4444;display:flex;align-items:center;justify-content:center;">' +
              '<svg style="width:20px;height:20px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>' +
            '</div>' +
            '<div>' +
              '<div style="font-family:var(--font-headline);font-size:16px;font-weight:700;color:var(--text-primary);">Blocked Emails & Restrictions</div>' +
              '<div style="font-size:11px;color:var(--text-secondary);">Block email addresses from registering accounts or logging in</div>' +
            '</div>' +
          '</div>' +
          '<button type="button" onclick="closeBlockedEmailsModal()" style="background:none;border:none;color:var(--text-muted);font-size:20px;cursor:pointer;padding:4px 8px;border-radius:6px;line-height:1;" aria-label="Close dialog">✕</button>' +
        '</div>' +
        '<div style="padding:18px 22px;display:flex;gap:8px;border-bottom:1px solid var(--border-card);">' +
          '<input type="email" class="form-input new-blocked-email-input" placeholder="Enter email to block (e.g. spam@test.com)" style="flex:1;font-size:13px;" onkeydown="if(event.key===\'Enter\'){event.preventDefault();submitAddBlockedEmail();}"/>' +
          '<button type="button" class="submit-btn" onclick="submitAddBlockedEmail()" style="width:auto;margin:0;padding:8px 16px;font-size:13px;background:#b91c1c;color:#ffffff;border:none;white-space:nowrap;font-weight:600;">Block Email</button>' +
        '</div>' +
        '<div class="blocked-emails-list" style="padding:18px 22px;overflow-y:auto;flex:1;max-height:380px;">' +
        '</div>' +
        '<div style="padding:12px 22px;background:var(--bg-card-subtle);border-top:1px solid var(--border-card);display:flex;justify-content:flex-end;">' +
          '<button type="button" onclick="closeBlockedEmailsModal()" class="submit-btn" style="width:auto;margin:0;padding:6px 16px;font-size:13px;background:var(--bg-card);border:1px solid var(--border-card);color:var(--text-secondary);">Done</button>' +
        '</div>' +
      '</div>';

    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) closeBlockedEmailsModal();
    });

    document.body.appendChild(overlay);
    renderBlockedEmailsList();
  }

  function closeBlockedEmailsModal() {
    if (typeof document === 'undefined') return;
    var overlay = document.querySelector('.blocked-emails-modal-overlay');
    if (overlay) {
      overlay.style.display = 'none';
    }
  }

  async function submitAddBlockedEmail() {
    if (typeof document === 'undefined') return;
    var input = document.querySelector('.new-blocked-email-input');
    if (!input) return;
    var ok = await addBlockedEmail(input.value);
    if (ok) {
      input.value = '';
      input.focus();
    }
  }

    // ── Window & Global Attachment ─────────────────────────────────────────────
  if (typeof global !== 'undefined') {
    global.renderAdminAuditLogs    = renderAdminAuditLogs;
    global.SESSION_IDLE_TIMEOUT_MS = SESSION_IDLE_TIMEOUT_MS;
    global.ADMIN_SECTIONS           = ADMIN_SECTIONS;
    global.RANK_ORDER               = RANK_ORDER;
    global.MEMBERS_JUNIORS_RANKS    = typeof MEMBERS_JUNIORS_RANKS !== 'undefined' ? MEMBERS_JUNIORS_RANKS : [];
    global.MEMBERS_SENIOR_RANKS     = typeof MEMBERS_SENIOR_RANKS !== 'undefined' ? MEMBERS_SENIOR_RANKS : [];
    global.OFFICER_RANKS            = typeof OFFICER_RANKS !== 'undefined' ? OFFICER_RANKS : [];
    global.populateRankOptions      = typeof populateRankOptions === 'function' ? populateRankOptions : null;
    global.getRanksForSection       = typeof getRanksForSection === 'function' ? getRanksForSection : null;
    global.openAdmin                = openAdmin;
    global.getAdminMemberAvatarHtml = getAdminMemberAvatarHtml;
    global.renderCreatorAvatarOutlinesStudio = renderCreatorAvatarOutlinesStudio;
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
    global.handleAdminRankChange    = handleAdminRankChange;
    global.populateSquadOptions     = typeof populateSquadOptions === 'function' ? populateSquadOptions : (typeof window !== 'undefined' ? window.populateSquadOptions : null);
    global.formatPlatoonOrSquad     = typeof formatPlatoonOrSquad === 'function' ? formatPlatoonOrSquad : (typeof window !== 'undefined' ? window.formatPlatoonOrSquad : null);
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
    global.renderAdminRoles          = renderAdminRoles;
    global.handleRbacRoleChange      = handleRbacRoleChange;
    global.filterRbacMembers         = filterRbacMembers;
    global.selectAllRbacPerms        = selectAllRbacPerms;
    global.saveMemberRbacPermissions = saveMemberRbacPermissions;
    global.loadBlockedEmails         = loadBlockedEmails;
    global.saveBlockedEmails         = saveBlockedEmails;
    global.addBlockedEmail           = addBlockedEmail;
    global.removeBlockedEmail        = removeBlockedEmail;
    global.openBlockedEmailsModal    = openBlockedEmailsModal;
    global.closeBlockedEmailsModal   = closeBlockedEmailsModal;
    global.submitAddBlockedEmail     = submitAddBlockedEmail;
    global.setAdminViewMode          = setAdminViewMode;
    global.getAdminViewMode          = getAdminViewMode;
    global._adminMembers            = _adminMembers;
    global._allAdminTasks           = _allAdminTasks;
  }

  // ── CommonJS Export for Node.js Testing ───────────────────────────────────
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      ADMIN_SECTIONS: ADMIN_SECTIONS,
      RANK_ORDER: RANK_ORDER,
      MEMBERS_JUNIORS_RANKS: typeof MEMBERS_JUNIORS_RANKS !== 'undefined' ? MEMBERS_JUNIORS_RANKS : [],
      MEMBERS_SENIOR_RANKS: typeof MEMBERS_SENIOR_RANKS !== 'undefined' ? MEMBERS_SENIOR_RANKS : [],
      OFFICER_RANKS: typeof OFFICER_RANKS !== 'undefined' ? OFFICER_RANKS : [],
      populateRankOptions: typeof populateRankOptions === 'function' ? populateRankOptions : null,
      getRanksForSection: typeof getRanksForSection === 'function' ? getRanksForSection : null,
    DEFAULT_DEPT_CONFIG,
      openAdmin: openAdmin,
      getAdminMemberAvatarHtml: getAdminMemberAvatarHtml,
      renderCreatorAvatarOutlinesStudio: renderCreatorAvatarOutlinesStudio,
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
    _adminPresenceMap: _adminPresenceMap,
      handleAdminSectionChange: handleAdminSectionChange,
      handleAdminRankChange: handleAdminRankChange,
      populateSquadOptions: typeof populateSquadOptions === 'function' ? populateSquadOptions : (typeof window !== 'undefined' ? window.populateSquadOptions : null),
      formatPlatoonOrSquad: typeof formatPlatoonOrSquad === 'function' ? formatPlatoonOrSquad : (typeof window !== 'undefined' ? window.formatPlatoonOrSquad : null),
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
      renderAdminRoles: renderAdminRoles,
      handleRbacRoleChange: handleRbacRoleChange,
      filterRbacMembers: filterRbacMembers,
      selectAllRbacPerms: selectAllRbacPerms,
      saveMemberRbacPermissions: saveMemberRbacPermissions,
      loadBlockedEmails: loadBlockedEmails,
      saveBlockedEmails: saveBlockedEmails,
      addBlockedEmail: addBlockedEmail,
      removeBlockedEmail: removeBlockedEmail,
      openBlockedEmailsModal: openBlockedEmailsModal,
      closeBlockedEmailsModal: closeBlockedEmailsModal,
      setAdminViewMode: setAdminViewMode,
      getAdminViewMode: getAdminViewMode,
      renderAdminAuditLogs: renderAdminAuditLogs,
      SESSION_IDLE_TIMEOUT_MS: SESSION_IDLE_TIMEOUT_MS,
      getAdminMembers: function() { return _adminMembers; },
      getAdminTasks: function() { return _allAdminTasks; },
      getAdminSortBy: function() { return _adminSortBy; },
      getAdminTaskFilter: function() { return _adminTaskFilter; }
    };
  }
})(typeof window !== 'undefined' ? window : this);
