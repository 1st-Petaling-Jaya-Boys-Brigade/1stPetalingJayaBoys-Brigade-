/**
 * 1st Petaling Jaya Boys' Brigade Portal
 * Session State Management (sessionStorage) with Cross-Tab Synchronization (TSK-025)
 * Session TTL Expiry (14-Day Remember Me) & Sign Out Everywhere (TSK-041)
 */

var REMEMBER_ME_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days in milliseconds (TSK-041)
var _redirectTarget = null; // Post-login redirect memory (TSK-045)

/**
 * Checks whether a saved Remember Me session timestamp has exceeded 14 days
 * @param {number} savedTime
 * @returns {boolean}
 */
function isRememberMeExpired(savedTime) {
  if (!savedTime || typeof savedTime !== 'number') return false;
  return (Date.now() - savedTime) > REMEMBER_ME_TTL_MS;
}

var _session = (function() {
  try {
    if (typeof sessionStorage !== 'undefined') {
      var s = sessionStorage.getItem('bb_session');
      if (s) return JSON.parse(s);
    }
    if (typeof localStorage !== 'undefined') {
      var l = localStorage.getItem('bb_session');
      if (l) {
        var parsed = JSON.parse(l);
        // TSK-041: Auto-expire Remember Me sessions after 14 days
        var savedAt = parsed._session_saved_at || (parsed.expires_at ? (parsed.expires_at - REMEMBER_ME_TTL_MS) : null);
        if (savedAt && isRememberMeExpired(savedAt)) {
          localStorage.removeItem('bb_session');
          localStorage.removeItem('bb_remember');
          if (typeof sessionStorage !== 'undefined') {
            sessionStorage.removeItem('bb_session');
          }
          return {};
        }
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.setItem('bb_session', l);
        }
        return parsed;
      }
    }
    return {};
  } catch (e) {
    return {};
  }
})();

// ── Tab Identity & Message Deduplication ────────────────────────────────────
var _tabId = 'tab_' + Math.random().toString(36).slice(2, 9) + '_' + Date.now();
var _msgSeq = 0;
var _seenMsgIds = new Set();
var _seenMsgIdList = [];
var MAX_SEEN_MSG_IDS = 128;
var _isApplyingRemoteSync = false;

function getTabId() {
  return _tabId;
}

function isDuplicateMessage(msgId) {
  if (!msgId) return false;
  if (_seenMsgIds.has(msgId)) return true;
  _seenMsgIds.add(msgId);
  _seenMsgIdList.push(msgId);
  if (_seenMsgIdList.length > MAX_SEEN_MSG_IDS) {
    var oldest = _seenMsgIdList.shift();
    _seenMsgIds.delete(oldest);
  }
  return false;
}

// ── Tab Leader Election (Web Locks API + Heartbeat Fallback) ─────────────────
var _isLeader = false;
var _leaderHeartbeatTimer = null;
var _leaderListeners = [];
var LEADER_HEARTBEAT_INTERVAL_MS = 2000;
var LEADER_HEARTBEAT_TIMEOUT_MS = 5000;

function isLeaderTab() {
  return _isLeader;
}

function onLeaderChange(callback) {
  if (typeof callback === 'function') {
    _leaderListeners.push(callback);
    try { callback(_isLeader); } catch (_) {}
  }
}

function _setLeaderState(newState) {
  if (_isLeader !== newState) {
    _isLeader = newState;
    for (var i = 0; i < _leaderListeners.length; i++) {
      try { _leaderListeners[i](_isLeader); } catch (_) {}
    }
  }
}

function initLeaderElection() {
  if (typeof window === 'undefined') {
    _setLeaderState(true);
    return;
  }

  // Tier 1: Web Locks API (automatic unlock on tab crash/close, zero collision)
  if (typeof navigator !== 'undefined' && navigator.locks && typeof navigator.locks.request === 'function') {
    try {
      navigator.locks.request('bb_tab_leader', function() {
        _setLeaderState(true);
        return new Promise(function() {
          // Lock held until tab is closed or navigated away
        });
      }).catch(function() {
        initHeartbeatLeaderElection();
      });
      return;
    } catch (_) {}
  }

  // Tier 2: localStorage Heartbeat fallback
  initHeartbeatLeaderElection();
}

function initHeartbeatLeaderElection() {
  function checkOrClaimLeader() {
    try {
      if (typeof localStorage === 'undefined') {
        _setLeaderState(true);
        return;
      }
      var now = Date.now();
      var raw = localStorage.getItem('bb_leader_heartbeat');
      var hb = null;
      if (raw) {
        try { hb = JSON.parse(raw); } catch (_) {}
      }

      if (!hb || !hb.tabId || (now - hb.ts) > LEADER_HEARTBEAT_TIMEOUT_MS || hb.tabId === _tabId) {
        localStorage.setItem('bb_leader_heartbeat', JSON.stringify({ tabId: _tabId, ts: now }));
        _setLeaderState(true);
      } else {
        _setLeaderState(false);
      }
    } catch (_) {
      _setLeaderState(true);
    }
  }

  checkOrClaimLeader();
  if (_leaderHeartbeatTimer) clearInterval(_leaderHeartbeatTimer);
  _leaderHeartbeatTimer = setInterval(checkOrClaimLeader, LEADER_HEARTBEAT_INTERVAL_MS);

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('beforeunload', function() {
      try {
        if (_isLeader && typeof localStorage !== 'undefined') {
          var raw = localStorage.getItem('bb_leader_heartbeat');
          if (raw && raw.indexOf(_tabId) !== -1) {
            localStorage.removeItem('bb_leader_heartbeat');
          }
        }
      } catch (_) {}
    });
  }
}

if (typeof window !== 'undefined') {
  initLeaderElection();
}

// ── Cross-Tab Broadcast Channel ──────────────────────────────────────────────
var _syncChannel = null;
if (typeof BroadcastChannel !== 'undefined') {
  try {
    _syncChannel = new BroadcastChannel('bb_session_channel');
    if (typeof _syncChannel.unref === 'function') {
      _syncChannel.unref();
    }
    _syncChannel.onmessage = function(event) {
      handleSyncMessage(event.data);
    };
  } catch (_) {}
}

/**
 * Handles incoming cross-tab storage sync messages with anti-loop protection (TSK-025)
 */
function handleSyncMessage(data) {
  if (!data || !data.action) return;

  // Drop self-originating messages and duplicate cross-channel deliveries
  if (data.senderId && data.senderId === _tabId) return;
  if (data.msgId && isDuplicateMessage(data.msgId)) return;

  _isApplyingRemoteSync = true;
  try {
    if (data.action === 'clear') {
      for (var k in _session) {
        if (Object.prototype.hasOwnProperty.call(_session, k)) {
          delete _session[k];
        }
      }
      if (typeof sessionStorage !== 'undefined') {
        try { sessionStorage.removeItem('bb_session'); } catch (_) {}
      }
      if (typeof window !== 'undefined') {
        if (typeof window.updateNavUserHeader === 'function') window.updateNavUserHeader();
        if (typeof window.renderDashboard === 'function') window.renderDashboard();
        if (typeof window.switchTab === 'function') window.switchTab('member');
        if (typeof window.dispatchEvent === 'function') {
          window.dispatchEvent(new CustomEvent('bb:session_sync', { detail: data }));
        }
      }
    } else if (data.action === 'set') {
      var prevId = _session['ic'] || _session['email'];

      if (data.session && typeof data.session === 'object') {
        for (var sKey in data.session) {
          if (Object.prototype.hasOwnProperty.call(data.session, sKey)) {
            _session[sKey] = data.session[sKey];
          }
        }
      } else if (data.key) {
        _session[data.key] = data.value;
      }
      if (typeof sessionStorage !== 'undefined') {
        try { sessionStorage.setItem('bb_session', JSON.stringify(_session)); } catch (_) {}
      }

      var newId = _session['ic'] || _session['email'];
      var idChanged = prevId !== newId;

      if (typeof window !== 'undefined') {
        if (typeof window.updateNavUserHeader === 'function') {
          window.updateNavUserHeader();
        }

        // Only invoke heavy async renderDashboard if the active authenticated user actually changed!
        // This stops the cross-tab infinite ping-pong loop when tabs synchronize identical session properties.
        if (idChanged && typeof window.renderDashboard === 'function') {
          window.renderDashboard();
        }

        if (typeof window.dispatchEvent === 'function') {
          window.dispatchEvent(new CustomEvent('bb:session_sync', { detail: data }));
        }
      }
    }
  } finally {
    _isApplyingRemoteSync = false;
  }
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('storage', function(e) {
    if (e.key === 'bb_session_sync' && e.newValue) {
      try {
        var parsed = JSON.parse(e.newValue);
        handleSyncMessage(parsed);
      } catch (_) {}
    }
  });
}

/**
 * Sets a session key-value pair with strict dirty-checking and anti-loop guards
 * @param {string} key
 * @param {any} value
 * @param {Object} [options]
 * @param {boolean} [options.localOnly=false] - When true, skips cross-tab broadcast
 * @param {boolean} [options.silent=false] - Alias for localOnly
 */
function sessionSet(key, value, options) {
  options = options || {};
  var localOnly = options.localOnly === true || options.silent === true;

  // Strict dirty-check: Avoid broadcasting identical unchanged values
  var existing = _session[key];
  var isPrimitive = typeof value !== 'object' || value === null;
  var isSame = isPrimitive ? (existing === value) : (JSON.stringify(existing) === JSON.stringify(value));
  if (isSame && key !== 'remember' && key !== 'email') {
    return;
  }

  _session[key] = value;
  // If setting email, also alias to 'ic' if ic is not explicitly set, ensuring seamless backward compatibility
  if (key === 'email' && (!_session['ic'] || _session['ic'] === value)) {
    _session['ic'] = value;
  }

  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem('bb_session', JSON.stringify(_session));
    }
    if (typeof localStorage !== 'undefined') {
      var isRemember = _session['remember'] === true || localStorage.getItem('bb_remember') === 'true';
      if (key === 'remember' && value === false) {
        delete _session._session_saved_at;
        localStorage.removeItem('bb_session');
        localStorage.removeItem('bb_remember');
      } else if (isRemember) {
        if (!_session._session_saved_at) {
          _session._session_saved_at = Date.now();
        }
        localStorage.setItem('bb_session', JSON.stringify(_session));
        localStorage.setItem('bb_remember', 'true');
      }
    }

    // Broadcast to other tabs only if NOT local-only and NOT handling an incoming remote sync
    if (!localOnly && !_isApplyingRemoteSync) {
      var msgId = _tabId + ':' + Date.now() + ':' + (++_msgSeq);
      isDuplicateMessage(msgId);

      var syncPayload = {
        action: 'set',
        key: key,
        value: value,
        session: _session,
        senderId: _tabId,
        msgId: msgId,
        time: Date.now()
      };

      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('bb_session_sync', JSON.stringify(syncPayload));
      }
      if (_syncChannel) {
        _syncChannel.postMessage(syncPayload);
      }
    }
  } catch (e) {
    console.warn('Session storage unavailable:', e);
  }
}

function sessionGet(key) {
  // If requesting legacy 'ic', fall back to 'email' if 'ic' is not present
  if (key === 'ic') {
    return _session['ic'] || _session['email'] || null;
  }
  return (_session[key] !== undefined && _session[key] !== null) ? _session[key] : null;
}

function sessionClear(options) {
  options = options || {};
  var localOnly = options.localOnly === true || options.silent === true;

  for (var k in _session) {
    if (Object.prototype.hasOwnProperty.call(_session, k)) {
      delete _session[k];
    }
  }
  delete _session._session_saved_at;
  _redirectTarget = null;
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem('bb_session');
      sessionStorage.removeItem('bb_redirect_target');
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('bb_session');
      localStorage.removeItem('bb_remember');
    }

    if (!localOnly && !_isApplyingRemoteSync) {
      var msgId = _tabId + ':' + Date.now() + ':' + (++_msgSeq);
      isDuplicateMessage(msgId);
      var clearPayload = {
        action: 'clear',
        senderId: _tabId,
        msgId: msgId,
        time: Date.now()
      };
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('bb_session_sync', JSON.stringify(clearPayload));
      }
      if (_syncChannel) {
        _syncChannel.postMessage(clearPayload);
      }
    }
  } catch (e) {
    console.warn('Session storage unavailable:', e);
  }
  if (typeof window !== 'undefined') {
    window._session = _session;
  }
}

/**
 * Revokes all active user sessions across all devices (TSK-041)
 * Calls rpc_sign_out_everywhere on Supabase, purges local credentials,
 * notifies all sibling browser tabs, and resets UI state.
 * @returns {Promise<{success: boolean}>}
 */
async function signOutEverywhere() {
  var actorId = sessionGet('email') || sessionGet('ic') || sessionGet('name') || 'anonymous';

  // 1. Invalidate remote sessions and record audit trail via Supabase RPC (TSK-041)
  try {
    var client = null;
    if (typeof getSupa === 'function') client = getSupa();
    else if (typeof window !== 'undefined' && typeof window.getSupa === 'function') client = window.getSupa();
    else if (typeof window !== 'undefined' && window.supabaseClient) client = window.supabaseClient;

    if (client && typeof client.rpc === 'function') {
      await client.rpc('rpc_sign_out_everywhere', { p_actor_id: actorId });
    } else if (typeof logAuditEvent === 'function') {
      await logAuditEvent({
        action: 'auth.signout_everywhere',
        targetType: 'auth',
        targetId: actorId,
        actorId: actorId,
        details: { message: 'All active sessions invalidated across devices' }
      });
    }
  } catch (err) {
    console.warn('Remote sign out everywhere warning:', err);
  }

  // 2. Revoke Officer Admin session if present
  try {
    if (typeof revokeAdminSession === 'function') {
      revokeAdminSession('Signed out of all devices.');
    } else if (typeof window !== 'undefined' && typeof window.revokeAdminSession === 'function') {
      window.revokeAdminSession('Signed out of all devices.');
    }
  } catch (_) {}

  // 3. Purge local session storage & broadcast clear to other tabs
  sessionClear();

  // 4. Update UI headers and view states
  if (typeof window !== 'undefined') {
    if (typeof window.updateNavUserHeader === 'function') window.updateNavUserHeader();
    if (typeof window.renderDashboard === 'function') window.renderDashboard();
    if (typeof window.showToast === 'function') {
      window.showToast('You have been signed out of all devices.', 'info');
    }
  }

  return { success: true };
}

/**
 * Global Route-Protection Middleware & Authenticated Portal Gatekeeper (TSK-045)
 */
var AuthGuard = {
  PROTECTED_ROUTES: ['home', 'order', 'tasks', 'badges', 'attendance', 'resources', 'gallery', 'forum', 'arcade'],
  PUBLIC_ROUTES: ['member', 'admin'],

  /**
   * Checks whether the current user has an active, valid authentication session.
   * @returns {boolean}
   */
  isUserAuthenticated: function() {
    try {
      var ic = sessionGet('ic');
      var email = sessionGet('email');
      if (!ic && !email) return false;

      // Check if session has expired via Remember Me TTL
      var savedAt = _session && _session._session_saved_at;
      if (savedAt && typeof isRememberMeExpired === 'function' && isRememberMeExpired(savedAt)) {
        sessionClear();
        return false;
      }
      return true;
    } catch (_) {
      return false;
    }
  },

  /**
   * Determines whether a route/tab can be activated based on authentication state.
   * @param {string} route
   * @returns {boolean}
   */
  canActivate: function(route) {
    if (!route) return false;
    var cleanRoute = String(route).toLowerCase().trim().replace(/^#/, '');

    // Public routes are always accessible
    if (this.PUBLIC_ROUTES.indexOf(cleanRoute) !== -1) {
      return true;
    }

    // All internal portal routes require authentication
    return this.isUserAuthenticated();
  },

  /**
   * Stores the intended destination route when unauthenticated access is intercepted.
   * @param {string} route
   */
  setRedirectTarget: function(route) {
    if (!route) return;
    var cleanRoute = String(route).toLowerCase().trim().replace(/^#/, '');
    // Do not set 'member' or 'admin' as redirect targets
    if (cleanRoute === 'member' || cleanRoute === 'admin') return;
    _redirectTarget = cleanRoute;
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem('bb_redirect_target', cleanRoute);
      }
    } catch (_) {}
  },

  /**
   * Retrieves the stored post-login redirect destination.
   * @returns {string|null}
   */
  getRedirectTarget: function() {
    if (_redirectTarget) return _redirectTarget;
    try {
      if (typeof sessionStorage !== 'undefined') {
        var saved = sessionStorage.getItem('bb_redirect_target');
        if (saved && saved !== 'member' && saved !== 'admin') {
          return saved;
        }
      }
    } catch (_) {}
    return null;
  },

  /**
   * Clears the stored redirect target after navigation has completed.
   */
  clearRedirectTarget: function() {
    _redirectTarget = null;
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem('bb_redirect_target');
      }
    } catch (_) {}
  },

  /**
   * Checks route authorization and returns a routing decision.
   * @param {string} targetRoute
   * @returns {{ allowed: boolean, redirect?: string, reason?: string }}
   */
  enforceRouteProtection: function(targetRoute) {
    if (this.canActivate(targetRoute)) {
      return { allowed: true };
    }
    this.setRedirectTarget(targetRoute);
    return {
      allowed: false,
      redirect: 'member',
      reason: 'unauthenticated'
    };
  }
};

/**
 * Top-level convenience alias for AuthGuard.isUserAuthenticated
 * @returns {boolean}
 */
function isUserAuthenticated() {
  return AuthGuard.isUserAuthenticated();
}

// Attach to window for global access across the app
if (typeof window !== 'undefined') {
  window._session = _session;
  window.sessionSet = sessionSet;
  window.sessionGet = sessionGet;
  window.sessionClear = sessionClear;
  window.handleSyncMessage = handleSyncMessage;
  window.REMEMBER_ME_TTL_MS = REMEMBER_ME_TTL_MS;
  window.isRememberMeExpired = isRememberMeExpired;
  window.signOutEverywhere = signOutEverywhere;
  window.AuthGuard = AuthGuard;
  window.isUserAuthenticated = isUserAuthenticated;
  window.getTabId = getTabId;
  window.isLeaderTab = isLeaderTab;
  window.onLeaderChange = onLeaderChange;
  window.initLeaderElection = initLeaderElection;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    _session,
    sessionSet,
    sessionGet,
    sessionClear,
    handleSyncMessage,
    REMEMBER_ME_TTL_MS,
    isRememberMeExpired,
    signOutEverywhere,
    AuthGuard,
    isUserAuthenticated,
    getTabId,
    isLeaderTab,
    onLeaderChange,
    initLeaderElection
  };
}
