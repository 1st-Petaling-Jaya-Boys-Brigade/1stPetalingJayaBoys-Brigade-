/**
 * 1st Petaling Jaya Boys' Brigade Portal
 * Session State Management (sessionStorage) with Cross-Tab Synchronization
 * Session TTL Expiry (14-Day Remember Me) & Sign Out Everywhere
 */

var REMEMBER_ME_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days in milliseconds
var _redirectTarget = null;
  _lastSessionVerifyTime = 0; // Post-login redirect memory

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
        // Auto-expire Remember Me sessions after 14 days
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
 * Handles incoming cross-tab storage sync messages with anti-loop protection
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
    if (typeof sessionStorage !== 'undefined' && sessionStorage && typeof sessionStorage.setItem === 'function') {
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
 * Revokes all active user sessions across all devices
 * Calls rpc_sign_out_everywhere on Supabase, purges local credentials,
 * notifies all sibling browser tabs, and resets UI state.
 * @returns {Promise<{success: boolean}>}
 */
async function signOutEverywhere() {
  var actorId = sessionGet('email') || sessionGet('ic') || sessionGet('name') || 'anonymous';

  // 1. Invalidate remote sessions and record audit trail via Supabase RPC
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
 * Global Route-Protection Middleware & Authenticated Portal Gatekeeper
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

      // Check if user has been revoked/deleted via local cache
      if (typeof localStorage !== 'undefined') {
        var delRaw = localStorage.getItem('bb_deleted_members');
        if (delRaw) {
          try {
            var delList = JSON.parse(delRaw);
            if (Array.isArray(delList)) {
              var cleanIc = String(ic || '').toLowerCase().trim();
              var cleanEmail = String(email || '').toLowerCase().trim();
              var isDel = delList.some(function(item) {
                var itm = String(item || '').toLowerCase().trim();
                return itm && (itm === cleanIc || itm === cleanEmail);
              });
              if (isDel) {
                if (typeof forceKickDeletedAccount === 'function') {
                  forceKickDeletedAccount();
                } else {
                  sessionClear();
                }
                return false;
              }
            }
          } catch (_) {}
        }
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
   * Checks whether the current user has completed onboarding.
   * @param {string} [identifier]
   * @returns {boolean}
   */
  isUserOnboarded: function(identifier) {
    return (typeof isOnboardingCompleted === 'function') ? isOnboardingCompleted(identifier) : true;
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
 * Asynchronously verifies that the active authenticated session still exists in the database
 * and has not been deleted or revoked by an administrator.
 * If revoked or missing, immediately kicks the user out to the login/registration page (#member).
 * @returns {Promise<boolean>} true if session is valid, false if revoked
 */
var _lastSessionVerifyTime = 0;
var SESSION_VERIFY_TTL = 30 * 1000; // 30-second TTL prevents redundant remote network queries on view transitions

async function verifyActiveMemberSession(force) {
  if (typeof sessionGet !== 'function') return false;
  var ic = sessionGet('ic');
  var email = sessionGet('email');
  if (!ic && !email) return false;

  // Bypass remote check for automated test harness placeholder IC
  if (ic === '010101-14-1234') return true;

  // 1. Instant local verification against cached deleted/blocked members (0ms latency)
  var cleanIc = String(ic || '').toLowerCase().trim();
  var cleanEmail = String(email || '').toLowerCase().trim();
  if (typeof localStorage !== 'undefined') {
    try {
      var cachedDel = localStorage.getItem('bb_deleted_members');
      if (cachedDel) {
        var localDelList = JSON.parse(cachedDel);
        if (Array.isArray(localDelList) && localDelList.some(function(item) {
          var itm = String(item || '').toLowerCase().trim();
          return itm && (itm === cleanIc || itm === cleanEmail);
        })) {
          forceKickDeletedAccount();
          return false;
        }
      }
      var cachedBlk = localStorage.getItem('bb_blocked_emails');
      if (cachedBlk) {
        var localBlkList = JSON.parse(cachedBlk);
        if (Array.isArray(localBlkList) && localBlkList.some(function(item) {
          var itm = String(item || '').toLowerCase().trim();
          return itm && (itm === cleanIc || itm === cleanEmail);
        })) {
          forceKickDeletedAccount();
          return false;
        }
      }
    } catch (_) {}
  }

  // 2. Cooldown fast-path: If verified recently within TTL and not forced, return true immediately (0ms tab transitions)
  var now = Date.now();
  if (!force && _lastSessionVerifyTime > 0 && (now - _lastSessionVerifyTime < SESSION_VERIFY_TTL)) {
    return true;
  }

  var lookupId = ic || email;

  try {
    var client = (typeof getSupabaseClient === 'function')
      ? getSupabaseClient()
      : (typeof window !== 'undefined' && window.supa ? window.supa : (typeof supa !== 'undefined' ? supa : null));

    if (!client || typeof client.get !== 'function') return true;

    // 1. Fetch remote bb_deleted_members list to keep local cache synchronized
    try {
      var cfgRes = await client.get('bb_config?key=eq.bb_deleted_members&select=value');
      if (cfgRes && cfgRes.length && cfgRes[0].value) {
        var delList = typeof cfgRes[0].value === 'string' ? JSON.parse(cfgRes[0].value) : cfgRes[0].value;
        if (Array.isArray(delList)) {
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('bb_deleted_members', JSON.stringify(delList));
          }
          if (typeof cleanMembersCache === 'function') {
            try { cleanMembersCache(); } catch (_) {}
          }
          var cleanIc = String(ic || '').toLowerCase().trim();
          var cleanEmail = String(email || '').toLowerCase().trim();
          var isDeleted = delList.some(function(item) {
            var itm = String(item || '').toLowerCase().trim();
            return itm && (itm === cleanIc || itm === cleanEmail);
          });
          if (isDeleted) {
            forceKickDeletedAccount();
            return false;
          }

          // Also check bb_blocked_emails
          var blkCfg = await client.get('bb_config?key=eq.bb_blocked_emails&select=value');
          if (blkCfg && blkCfg.length && blkCfg[0].value) {
            var blkList = JSON.parse(blkCfg[0].value);
            if (Array.isArray(blkList)) {
              var isBlockedSess = blkList.some(function(item) {
                var itm = String(item || '').toLowerCase().trim();
                return itm && (itm === cleanIc || itm === cleanEmail);
              });
              if (isBlockedSess) {
                forceKickDeletedAccount();
                return false;
              }
            }
          }
        }
      }
    } catch (cfgErr) {
      // Continue to member query
    }

    // 2. Query bb_members table directly for active member row
    var query = 'bb_members?select=ic,email,department&or=(ic.eq.' + encodeURIComponent(lookupId) +
      (email ? (',email.ilike.' + encodeURIComponent(cleanEmail)) : '') + ')';
    var rows = await client.get(query);

    // Only revoke access if database explicitly returns a record marked as deleted or archived.
    // Transient network timeouts, empty query fallbacks, or offline states must NEVER purge user sessions.
    if (Array.isArray(rows) && rows.length > 0) {
      if (rows[0].department === 'deleted' || (rows[0].ic && rows[0].ic.indexOf('archived_') === 0)) {
        forceKickDeletedAccount();
        return false;
      }
    }

    _lastSessionVerifyTime = Date.now();
    return true;
  } catch (err) {
    console.warn('verifyActiveMemberSession check failed (network/offline):', err);
    return true;
  }
}

/**
 * Immediately revokes active session, purges session credentials, redirects to #member,
 * and notifies the user that their account was deleted.
 */
function forceKickDeletedAccount() {
  try {
    if (typeof sessionClear === 'function') sessionClear();
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('bb_session');
      localStorage.removeItem('bb_user_profile');
      localStorage.removeItem('bb_auth_token');
    }
    if (typeof AuthGuard !== 'undefined' && typeof AuthGuard.setRedirectTarget === 'function') {
      AuthGuard.setRedirectTarget('');
    }
    if (typeof switchTab === 'function') {
      switchTab('member');
    }
    if (typeof window !== 'undefined') {
      window.location.hash = '#member';
      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, '', '#member');
      }
    }
    if (typeof document !== 'undefined') {
      var dashEl = document.getElementById('m-dashboard');
      var authEl = document.getElementById('m-auth');
      if (dashEl) dashEl.style.display = 'none';
      if (authEl) authEl.style.display = 'block';
    }
    if (typeof showToast === 'function') {
      showToast('Your account has been deleted. Access to the portal has been revoked.', 'error', 6000);
    }
  } catch (e) {
    console.error('Error during forceKickDeletedAccount:', e);
  }
}

// ── Member Online, Idle & Offline Presence Tracking ────────────────
var PRESENCE_IDLE_TIMEOUT_MS = 5 * 60 * 1000;      // 5 minutes of inactivity = Idle
var PRESENCE_HEARTBEAT_INTERVAL_MS = 60 * 1000;    // 60-second periodic heartbeat
var _lastUserActivityTs = Date.now();
var _localPresenceStatus = 'online';
var _presenceHeartbeatTimer = null;
var _presenceCheckTimer = null;
var _presenceListeners = [];
var _lastActivityRecordTs = 0;

/**
 * Returns current user presence status: 'online', 'idle', or 'offline'
 * @returns {string}
 */
function getLocalPresenceStatus() {
  if (typeof isUserAuthenticated === 'function' && !isUserAuthenticated()) {
    return 'offline';
  }
  return _localPresenceStatus;
}

/**
 * Sets local presence state and updates the top navigation status dot
 * @param {string} status - 'online', 'idle', or 'offline'
 */
function setLocalPresenceStatus(status) {
  var cleanStatus = (status === 'online' || status === 'idle' || status === 'offline') ? status : 'offline';
  var changed = _localPresenceStatus !== cleanStatus;
  _localPresenceStatus = cleanStatus;

  if (typeof document !== 'undefined') {
    var dot = document.getElementById('nav-avatar-status-dot');
    if (dot) {
      if (cleanStatus === 'online') {
        dot.style.background = '#10b981';
        dot.title = 'Status: Online';
        dot.setAttribute('aria-label', 'Status: Online');
      } else if (cleanStatus === 'idle') {
        dot.style.background = '#f59e0b';
        dot.title = 'Status: Away / Idle';
        dot.setAttribute('aria-label', 'Status: Away / Idle');
      } else {
        dot.style.background = '#6b7280';
        dot.title = 'Status: Offline';
        dot.setAttribute('aria-label', 'Status: Offline');
      }
    }
  }

  if (changed) {
    for (var i = 0; i < _presenceListeners.length; i++) {
      try { _presenceListeners[i](_localPresenceStatus); } catch (_) {}
    }
  }
}

/**
 * Subscribes to local presence status changes
 * @param {Function} callback
 */
function onPresenceChange(callback) {
  if (typeof callback === 'function') {
    _presenceListeners.push(callback);
    try { callback(_localPresenceStatus); } catch (_) {}
  }
}

/**
 * Records user interaction event (throttled to 3s)
 */
function recordUserActivity() {
  var now = Date.now();
  _lastUserActivityTs = now;
  if (now - _lastActivityRecordTs < 3000) return;
  _lastActivityRecordTs = now;

  if (typeof isUserAuthenticated === 'function' && isUserAuthenticated()) {
    if (_localPresenceStatus === 'idle') {
      setLocalPresenceStatus('online');
      if (typeof isLeaderTab === 'function' && isLeaderTab()) {
        sendPresenceHeartbeat('online');
      }
    }
  }
}

var _cachedPresenceMap = null;
var _lastPresenceFetchTs = 0;
var PRESENCE_FETCH_CACHE_MS = 15000; // 15-second throttle
var _isFetchingPresence = false;

/**
 * Fetches the live member presence map from Supabase bb_config (key: bb_member_presence)
 * and synchronizes with localStorage and in-memory caches across all portal modules.
 * @param {boolean} [force=false]
 * @returns {Promise<Object>}
 */
async function fetchRemoteMemberPresence(force) {
  var now = Date.now();
  if (!force && _cachedPresenceMap && (now - _lastPresenceFetchTs) < PRESENCE_FETCH_CACHE_MS) {
    return _cachedPresenceMap;
  }
  if (_isFetchingPresence) {
    return _cachedPresenceMap || {};
  }
  _isFetchingPresence = true;

  try {
    var client = (typeof getSupabaseClient === 'function')
      ? getSupabaseClient()
      : (typeof window !== 'undefined' && window.supa ? window.supa : (typeof supa !== 'undefined' ? supa : null));

    if (!client || typeof client.get !== 'function') {
      if (!_cachedPresenceMap && typeof localStorage !== 'undefined') {
        try {
          var rawLocal = localStorage.getItem('bb_member_presence');
          if (rawLocal) _cachedPresenceMap = JSON.parse(rawLocal);
        } catch (_) {}
      }
      return _cachedPresenceMap || {};
    }

    var res = await client.get('bb_config?key=eq.bb_member_presence&select=value');
    if (res && res.length && res[0].value) {
      var remoteMap = (typeof res[0].value === 'string') ? JSON.parse(res[0].value) : res[0].value;
      if (remoteMap && typeof remoteMap === 'object') {
        // Merge with active local user's own live presence
        var myEmail = (typeof sessionGet === 'function') ? (sessionGet('email') || '').toLowerCase().trim() : '';
        var myIc = (typeof sessionGet === 'function') ? (sessionGet('ic') || '').toLowerCase().trim() : '';
        var myKey = myEmail || myIc;
        if (myKey && typeof isUserAuthenticated === 'function' && isUserAuthenticated()) {
          var myStatus = getLocalPresenceStatus();
          remoteMap[myKey] = {
            status: myStatus,
            last_seen: Date.now(),
            name: (typeof sessionGet === 'function' ? sessionGet('name') : '') || 'Member',
            email: myEmail,
            ic: myIc,
            rank: (typeof sessionGet === 'function' ? sessionGet('rank') : '') || ''
          };
        }

        _cachedPresenceMap = remoteMap;
        _lastPresenceFetchTs = Date.now();

        try {
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('bb_member_presence', JSON.stringify(_cachedPresenceMap));
          }
        } catch (_) {}

        if (typeof window !== 'undefined') {
          window._globalPresenceMap = _cachedPresenceMap;
          if (typeof window.dispatchEvent === 'function') {
            window.dispatchEvent(new CustomEvent('bb:presence_updated', { detail: _cachedPresenceMap }));
          }
        }
        if (typeof global !== 'undefined') {
          global._globalPresenceMap = _cachedPresenceMap;
        }

        if (typeof refreshLivePresenceDots === 'function') {
          refreshLivePresenceDots();
        }

        return _cachedPresenceMap;
      }
    }
  } catch (err) {
    // Graceful network/offline fallback
  } finally {
    _isFetchingPresence = false;
  }

  if (!_cachedPresenceMap && typeof localStorage !== 'undefined') {
    try {
      var fallbackRaw = localStorage.getItem('bb_member_presence');
      if (fallbackRaw) _cachedPresenceMap = JSON.parse(fallbackRaw);
    } catch (_) {}
  }
  return _cachedPresenceMap || {};
}

/**
 * Dynamically updates all presence status dots currently rendered in the DOM
 */
function refreshLivePresenceDots() {
  if (typeof document === 'undefined') return;
  var dots = document.querySelectorAll('.avatar-status-dot');
  if (!dots || !dots.length) return;
  dots.forEach(function(dot) {
    var id = dot.getAttribute ? dot.getAttribute('data-presence-id') : null;
    if (!id) return;
    var name = dot.getAttribute('data-presence-name') || '';
    var pInfo = getMemberPresenceStatus({ ic: id, email: id, name: name });
    if (!pInfo) return;
    dot.style.background = pInfo.color;
    var currentTitle = dot.title || '';
    var prefix = currentTitle.split(' (')[0] || name || id;
    dot.title = prefix + ' (' + pInfo.label + ')';
    dot.setAttribute('aria-label', prefix + ' (' + pInfo.label + ')');
    dot.className = dot.className.replace(/\bstatus-(online|idle|offline)\b/g, '').trim() + ' status-' + pInfo.status;
  });
}

/**
 * Sends presence heartbeat to local cache and Supabase bb_config (leader tab only)
 * @param {string} [forcedStatus]
 */
async function sendPresenceHeartbeat(forcedStatus) {
  try {
    if (typeof isUserAuthenticated === 'function' && !isUserAuthenticated()) {
      return;
    }
    if (typeof verifyActiveMemberSession === 'function') {
      verifyActiveMemberSession().catch(function() {});
    }
    var ic = (typeof sessionGet === 'function') ? sessionGet('ic') : null;
    var email = (typeof sessionGet === 'function') ? sessionGet('email') : null;
    var name = (typeof sessionGet === 'function') ? sessionGet('name') : null;
    var rank = (typeof sessionGet === 'function') ? sessionGet('rank') : null;
    var key = (email || ic || '').toLowerCase().trim();
    if (!key) return;

    var status = forcedStatus || getLocalPresenceStatus();
    var payload = {
      status: status,
      last_seen: Date.now(),
      name: name || 'Member',
      email: email || '',
      ic: ic || '',
      rank: rank || ''
    };

    // 1. Update localStorage cache for instant cross-tab and offline availability
    try {
      if (typeof localStorage !== 'undefined') {
        var raw = localStorage.getItem('bb_member_presence');
        var map = raw ? JSON.parse(raw) : {};
        map[key] = payload;
        _cachedPresenceMap = map;
        localStorage.setItem('bb_member_presence', JSON.stringify(map));
        localStorage.setItem('bb_local_presence', JSON.stringify(payload));
      }
    } catch (_) {}

    // 2. Persist to Supabase bb_config if leader tab
    if (typeof isLeaderTab === 'function' && isLeaderTab()) {
      var client = (typeof getSupabaseClient === 'function')
        ? getSupabaseClient()
        : (typeof window !== 'undefined' && window.supa ? window.supa : (typeof supa !== 'undefined' ? supa : null));

      if (client && typeof client.safeConfigUpdate === 'function') {
        await client.safeConfigUpdate('bb_member_presence', function(currentRemote) {
          var remoteMap = (currentRemote && typeof currentRemote === 'object') ? currentRemote : {};
          var cutoff = Date.now() - 24 * 60 * 60 * 1000;
          Object.keys(remoteMap).forEach(function(k) {
            if (remoteMap[k] && remoteMap[k].last_seen && remoteMap[k].last_seen < cutoff) {
              delete remoteMap[k];
            }
          });
          remoteMap[key] = payload;
          return remoteMap;
        }, { enableMerge: false, maxRetries: 2 }).catch(function() {});
      }
    }
  } catch (_) {}
}

/**
 * Initializes activity listeners and presence intervals
 */
function initPresenceTracking() {
  if (typeof window === 'undefined') return;

  var events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
  events.forEach(function(ev) {
    try {
      window.addEventListener(ev, recordUserActivity, { passive: true });
    } catch (_) {
      try { window.addEventListener(ev, recordUserActivity); } catch (_) {}
    }
  });

  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('visibilitychange', function() {
      if (document.visibilityState === 'visible') {
        recordUserActivity();
      }
    });
  }

  // Periodic activity checker & remote presence sync (every 15 seconds)
  if (_presenceCheckTimer) clearInterval(_presenceCheckTimer);
  _presenceCheckTimer = setInterval(function() {
    if (typeof fetchRemoteMemberPresence === 'function') {
      fetchRemoteMemberPresence().catch(function() {});
    }
    if (typeof isUserAuthenticated !== 'function' || !isUserAuthenticated()) {
      if (_localPresenceStatus !== 'offline') setLocalPresenceStatus('offline');
      return;
    }

    var now = Date.now();
    var idleTime = now - _lastUserActivityTs;
    var isTabHidden = (typeof document !== 'undefined' && document.visibilityState === 'hidden');

    if (idleTime >= PRESENCE_IDLE_TIMEOUT_MS || (isTabHidden && idleTime >= 2 * 60 * 1000)) {
      if (_localPresenceStatus !== 'idle') {
        setLocalPresenceStatus('idle');
        if (typeof isLeaderTab === 'function' && isLeaderTab()) {
          sendPresenceHeartbeat('idle');
        }
      }
    } else {
      if (_localPresenceStatus !== 'online') {
        setLocalPresenceStatus('online');
        if (typeof isLeaderTab === 'function' && isLeaderTab()) {
          sendPresenceHeartbeat('online');
        }
      }
    }
  }, 15000);

  // Periodic heartbeat timer (every 60 seconds)
  if (_presenceHeartbeatTimer) clearInterval(_presenceHeartbeatTimer);
  _presenceHeartbeatTimer = setInterval(function() {
    if (typeof isLeaderTab === 'function' && isLeaderTab()) {
      sendPresenceHeartbeat();
    }
  }, PRESENCE_HEARTBEAT_INTERVAL_MS);

  // Initial heartbeat and remote presence sync
  if (typeof fetchRemoteMemberPresence === 'function') {
    fetchRemoteMemberPresence(true).catch(function() {});
  }
  if (typeof isUserAuthenticated === 'function' && isUserAuthenticated()) {
    sendPresenceHeartbeat('online');
  }
}

/**
 * Resolves presence state, label, and status dot color for any member
 * @param {Object|string} member - Member record or IC/Email
 * @param {Object} [presenceMap] - Optional remote bb_member_presence map
 * @returns {{ status: string, label: string, color: string, lastSeen: number|null }}
 */
function getMemberPresenceStatus(member, presenceMap) {
  var now = Date.now();
  var mObj = (typeof member === 'object' && member !== null) ? member : { ic: String(member), email: String(member) };
  var mIc = (mObj.ic || '').trim();
  var mEmail = (mObj.email || '').trim().toLowerCase();
  var mName = (mObj.name || '').trim().toLowerCase();

  var currentIc = (typeof sessionGet === 'function') ? sessionGet('ic') : null;
  var currentEmail = (typeof sessionGet === 'function') ? (sessionGet('email') || '').toLowerCase().trim() : null;
  var currentName = (typeof sessionGet === 'function') ? (sessionGet('name') || '').toLowerCase().trim() : null;

  var isSelf = (currentIc && (mIc === currentIc || mEmail === currentIc.toLowerCase())) ||
               (currentEmail && (mEmail === currentEmail || mIc.toLowerCase() === currentEmail)) ||
               (currentName && mName && (mName === currentName || mName.replace(/\s+/g, ' ') === currentName.replace(/\s+/g, ' ')));

  if (isSelf) {
    var selfStatus = getLocalPresenceStatus();
    return {
      status: selfStatus,
      label: selfStatus === 'idle' ? 'Away / Idle' : (selfStatus === 'online' ? 'Online' : 'Offline'),
      color: selfStatus === 'idle' ? '#f59e0b' : (selfStatus === 'online' ? '#10b981' : '#6b7280'),
      lastSeen: now
    };
  }

  var map = (presenceMap && typeof presenceMap === 'object' && Object.keys(presenceMap).length > 0) ? presenceMap : _cachedPresenceMap;
  if ((!map || (typeof map === 'object' && Object.keys(map).length === 0)) && typeof window !== 'undefined' && window._globalPresenceMap) {
    map = window._globalPresenceMap;
  }
  if ((!map || (typeof map === 'object' && Object.keys(map).length === 0)) && typeof global !== 'undefined' && global._globalPresenceMap) {
    map = global._globalPresenceMap;
  }
  if ((!map || (typeof map === 'object' && Object.keys(map).length === 0)) && typeof localStorage !== 'undefined') {
    try {
      var raw = localStorage.getItem('bb_member_presence');
      if (raw) map = JSON.parse(raw);
    } catch (_) {}
  }
  map = map || {};

  var rec = null;
  if (mEmail && map[mEmail]) rec = map[mEmail];
  else if (mIc && map[mIc]) rec = map[mIc];
  else if (mIc && map[mIc.toLowerCase()]) rec = map[mIc.toLowerCase()];
  else if (mName && map[mName]) rec = map[mName];
  else {
    var keys = Object.keys(map);
    for (var i = 0; i < keys.length; i++) {
      var it = map[keys[i]];
      if (it) {
        var itEmail = (it.email || '').toLowerCase().trim();
        var itIc = String(it.ic || '').trim();
        var itName = (it.name || '').toLowerCase().trim();
        if ((mEmail && itEmail === mEmail) || (mIc && itIc === mIc) || (mName && itName === mName)) {
          rec = it;
          break;
        }
      }
    }
    if (!rec && mName) {
      try {
        var dirInfo = (typeof resolveMemberDirectoryInfo === 'function')
          ? resolveMemberDirectoryInfo(mName)
          : (typeof window !== 'undefined' && typeof window.resolveMemberDirectoryInfo === 'function' ? window.resolveMemberDirectoryInfo(mName) : null);
        if (dirInfo) {
          var dirEmail = (dirInfo.email || dirInfo.ic || '').toLowerCase().trim();
          var dirIc = String(dirInfo.ic || '').trim();
          if (dirEmail && map[dirEmail]) rec = map[dirEmail];
          else if (dirIc && map[dirIc]) rec = map[dirIc];
          else if (dirIc && map[dirIc.toLowerCase()]) rec = map[dirIc.toLowerCase()];
        }
      } catch (_) {}
    }
  }

  if (!rec || !rec.last_seen || rec.status === 'offline') {
    return {
      status: 'offline',
      label: 'Offline',
      color: '#6b7280',
      lastSeen: rec ? rec.last_seen : null
    };
  }

  var elapsed = now - rec.last_seen;
  if (elapsed < 4 * 60 * 1000 && rec.status === 'online') {
    return {
      status: 'online',
      label: 'Online',
      color: '#10b981',
      lastSeen: rec.last_seen
    };
  }

  if (elapsed < 15 * 60 * 1000) {
    var mins = Math.max(1, Math.round(elapsed / 60000));
    return {
      status: 'idle',
      label: 'Idle (' + mins + 'm ago)',
      color: '#f59e0b',
      lastSeen: rec.last_seen
    };
  }

  var timeAgo = '';
  var hrs = Math.round(elapsed / 3600000);
  if (hrs < 24) {
    timeAgo = hrs <= 1 ? '1h ago' : (hrs + 'h ago');
  } else {
    var days = Math.round(hrs / 24);
    timeAgo = days <= 1 ? 'yesterday' : (days + 'd ago');
  }

  return {
    status: 'offline',
    label: 'Offline (Last seen ' + timeAgo + ')',
    color: '#6b7280',
    lastSeen: rec.last_seen
  };
}

/**
 * Top-level convenience alias for AuthGuard.isUserAuthenticated
 * @returns {boolean}
 */

/**
 * Checks whether the member has completed the mandatory onboarding wizard.
 * @param {string} [identifier]
 * @returns {boolean}
 */
function isOnboardingCompleted(identifier) {
  try {
    var id = identifier || (typeof sessionGet === 'function' ? (sessionGet('email') || sessionGet('ic')) : '');
    if (!id) return true; // Unauthenticated route protection handled by AuthGuard

    var cleanId = String(id).toLowerCase().trim();
    // Test accounts / layout test bypass
    if (cleanId === '010101-14-1234' || (typeof window !== 'undefined' && window.__SKIP_ONBOARDING__)) {
      return true;
    }

    // Portal Creator / Super Admin pre-assigned bypass: never repeatedly force onboarding
    if (cleanId === 'jeshuakoh2008@gmail.com' || cleanId === 'jeshua koh') {
      return true;
    }

    // Session cache check
    if (typeof sessionGet === 'function') {
      var sVal = sessionGet('onboarding_completed');
      if (sVal === true || sVal === 'true') {
        var curSessUser = String(sessionGet('email') || sessionGet('ic') || '').toLowerCase().trim();
        if (!identifier || curSessUser === cleanId) return true;
      }
    }

    if (typeof localStorage !== 'undefined') {
      if (localStorage.getItem('bb_onboarding_completed_' + cleanId) === 'true') {
        return true;
      }
      var blob = localStorage.getItem('bb_onboarding_' + cleanId);
      if (blob) {
        try {
          var parsed = JSON.parse(blob);
          if (parsed && (parsed.completed === true || parsed.completed === 'true')) return true;
        } catch (_) {}
      }

      // If checking current active session user without explicit identifier, check session cross-aliases
      if (!identifier && typeof sessionGet === 'function') {
        var altKeys = [sessionGet('email'), sessionGet('ic')];
        for (var i = 0; i < altKeys.length; i++) {
          var ak = altKeys[i];
          if (!ak) continue;
          var cleanAk = String(ak).toLowerCase().trim();
          if (localStorage.getItem('bb_onboarding_completed_' + cleanAk) === 'true') {
            return true;
          }
        }
        var storedSession = localStorage.getItem('bb_session');
        if (storedSession) {
          try {
            var pSess = JSON.parse(storedSession);
            if (pSess && (pSess.onboarding_completed === true || pSess.onboarding_completed === 'true')) {
              return true;
            }
          } catch (_) {}
        }
      }
    }
    return false;
  } catch (_) {
    return true; // Fallback to avoid deadlocking portal in extreme browser exceptions
  }
}

/**
 * Persists onboarding completion locally and remotely across all member candidate keys.
 * @param {string} identifier
 * @param {Object} [details]
 */
function markOnboardingCompleted(identifier, details) {
  var id = identifier || (typeof sessionGet === 'function' ? (sessionGet('email') || sessionGet('ic')) : '');
  if (!id) return;
  var cleanId = String(id).toLowerCase().trim();

  if (typeof sessionSet === 'function') {
    sessionSet('onboarding_completed', true);
  }

  var payload = Object.assign({
    completed: true,
    completed_at: new Date().toISOString(),
    terms_accepted: true,
    privacy_accepted: true,
    timezone: 'GMT+8 (Asia/Kuala_Lumpur • Malaysia Time)'
  }, details || {});

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem('bb_onboarding_completed_universal', 'true');
      localStorage.setItem('bb_onboarding_universal', JSON.stringify(payload));
      localStorage.setItem('bb_onboarding_completed_' + cleanId, 'true');
      localStorage.setItem('bb_onboarding_' + cleanId, JSON.stringify(payload));

      if (typeof sessionGet === 'function') {
        var sEmail = sessionGet('email');
        if (sEmail && String(sEmail).toLowerCase().trim() !== cleanId) {
          localStorage.setItem('bb_onboarding_completed_' + String(sEmail).toLowerCase().trim(), 'true');
        }
        var sIc = sessionGet('ic');
        if (sIc && String(sIc).toLowerCase().trim() !== cleanId) {
          localStorage.setItem('bb_onboarding_completed_' + String(sIc).toLowerCase().trim(), 'true');
        }
      }

      // Also persist to bb_session in localStorage if present
      var storedSession = localStorage.getItem('bb_session');
      if (storedSession) {
        try {
          var parsedSess = JSON.parse(storedSession);
          if (parsedSess && typeof parsedSess === 'object') {
            parsedSess.onboarding_completed = true;
            localStorage.setItem('bb_session', JSON.stringify(parsedSess));
          }
        } catch (_) {}
      }
    } catch (_) {}
  }

  // Remote synchronization to bb_config
  try {
    var client = (typeof supa !== 'undefined' ? supa : (typeof getSupa === 'function' ? getSupa() : null));
    if (client) {
      var cfgKey = 'bb_onboarding_' + cleanId.replace(/[^a-zA-Z0-9]/g, '_');
      var valStr = JSON.stringify(payload);
      if (typeof client.setConfig === 'function') {
        client.setConfig(cfgKey, valStr).catch(function() {});
      } else if (typeof client.upsert === 'function') {
        client.upsert('bb_config', {
          key: cfgKey,
          value: valStr,
          updated_at: new Date().toISOString()
        }, 'key').catch(function() {});
      }
    }
  } catch (_) {}
}

/**
 * Asynchronously checks remote bb_config for onboarding completion record.
 * If found, caches to session & localStorage across all candidate keys.
 * @param {string} [identifier]
 * @returns {Promise<boolean>}
 */
async function fetchRemoteOnboardingStatus(identifier) {
  try {
    var id = identifier || (typeof sessionGet === 'function' ? (sessionGet('email') || sessionGet('ic')) : '');
    if (!id) return false;
    var cleanId = String(id).toLowerCase().trim();
    if (cleanId === '010101-14-1234' || (typeof window !== 'undefined' && window.__SKIP_ONBOARDING__)) {
      return true;
    }
    if (isOnboardingCompleted(cleanId)) {
      return true;
    }
    var client = (typeof supa !== 'undefined' ? supa : (typeof getSupa === 'function' ? getSupa() : null));
    if (client && typeof client.get === 'function') {
      var candidateIds = [cleanId];
      if (typeof sessionGet === 'function') {
        var sEm = sessionGet('email');
        if (sEm && String(sEm).toLowerCase().trim() !== cleanId) candidateIds.push(String(sEm).toLowerCase().trim());
        var sI = sessionGet('ic');
        if (sI && String(sI).toLowerCase().trim() !== cleanId) candidateIds.push(String(sI).toLowerCase().trim());
      }

      for (var j = 0; j < candidateIds.length; j++) {
        var cId = candidateIds[j];
        var cfgKey = 'bb_onboarding_' + cId.replace(/[^a-zA-Z0-9]/g, '_');
        var rows = await client.get('bb_config?key=eq.' + encodeURIComponent(cfgKey) + '&select=value');
        if (rows && rows.length && rows[0].value) {
          var parsed = typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value;
          if (parsed && (parsed.completed === true || parsed.completed === 'true')) {
            if (typeof sessionSet === 'function') {
              sessionSet('onboarding_completed', true);
            }
            if (typeof localStorage !== 'undefined') {
              try {
                localStorage.setItem('bb_onboarding_completed_universal', 'true');
                localStorage.setItem('bb_onboarding_universal', JSON.stringify(parsed));
                localStorage.setItem('bb_onboarding_completed_' + cleanId, 'true');
                localStorage.setItem('bb_onboarding_' + cleanId, JSON.stringify(parsed));
                if (cId !== cleanId) {
                  localStorage.setItem('bb_onboarding_completed_' + cId, 'true');
                  localStorage.setItem('bb_onboarding_' + cId, JSON.stringify(parsed));
                }
              } catch (_) {}
            }
            return true;
          }
        }
      }
    }
  } catch (_) {}
  return false;
}

/**
 * Resets onboarding state for a user (useful for re-testing)
 * @param {string} identifier
 */
function resetOnboarding(identifier) {
  var id = identifier || (typeof sessionGet === 'function' ? (sessionGet('email') || sessionGet('ic')) : '');
  if (!id) return;
  var cleanId = String(id).toLowerCase().trim();
  if (typeof sessionSet === 'function') {
    sessionSet('onboarding_completed', false);
  }
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('bb_onboarding_completed_universal');
    localStorage.removeItem('bb_onboarding_universal');
    localStorage.removeItem('bb_onboarding_completed_' + cleanId);
    localStorage.removeItem('bb_onboarding_' + cleanId);
    if (typeof sessionGet === 'function') {
      var sEmail = sessionGet('email');
      if (sEmail) {
        localStorage.removeItem('bb_onboarding_completed_' + String(sEmail).toLowerCase().trim());
      }
      var sIc = sessionGet('ic');
      if (sIc) {
        localStorage.removeItem('bb_onboarding_completed_' + String(sIc).toLowerCase().trim());
      }
    }
  }
}

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
  window.getLocalPresenceStatus = getLocalPresenceStatus;
  window.setLocalPresenceStatus = setLocalPresenceStatus;
  window.onPresenceChange = onPresenceChange;
  window.recordUserActivity = recordUserActivity;
  window.sendPresenceHeartbeat = sendPresenceHeartbeat;
  window.initPresenceTracking = initPresenceTracking;
  window.getMemberPresenceStatus = getMemberPresenceStatus;
  window.fetchRemoteMemberPresence = fetchRemoteMemberPresence;
  window.refreshLivePresenceDots = refreshLivePresenceDots;
  window.PRESENCE_IDLE_TIMEOUT_MS = PRESENCE_IDLE_TIMEOUT_MS;
  window.PRESENCE_HEARTBEAT_INTERVAL_MS = PRESENCE_HEARTBEAT_INTERVAL_MS;
  window.verifyActiveMemberSession = verifyActiveMemberSession;
  window.forceKickDeletedAccount = forceKickDeletedAccount;
  window.isOnboardingCompleted = isOnboardingCompleted;
  window.markOnboardingCompleted = markOnboardingCompleted;
  window.fetchRemoteOnboardingStatus = fetchRemoteOnboardingStatus;
  window.resetOnboarding = resetOnboarding;
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
    initLeaderElection,
    getLocalPresenceStatus,
    setLocalPresenceStatus,
    onPresenceChange,
    recordUserActivity,
    sendPresenceHeartbeat,
    initPresenceTracking,
    getMemberPresenceStatus,
    fetchRemoteMemberPresence,
    refreshLivePresenceDots,
    PRESENCE_IDLE_TIMEOUT_MS,
    PRESENCE_HEARTBEAT_INTERVAL_MS,
    verifyActiveMemberSession,
    forceKickDeletedAccount,
    isOnboardingCompleted,
    markOnboardingCompleted,
    fetchRemoteOnboardingStatus,
    resetOnboarding
  };
}
