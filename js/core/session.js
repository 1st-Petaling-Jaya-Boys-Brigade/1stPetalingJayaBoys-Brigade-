/**
 * 1st Petaling Jaya Boys' Brigade Portal
 * Session State Management (sessionStorage) with Cross-Tab Synchronization (TSK-025)
 */

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
 * Handles incoming cross-tab storage sync messages (TSK-025)
 */
function handleSyncMessage(data) {
  if (!data || !data.action) return;
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
      if (typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new CustomEvent('bb:session_sync', { detail: data }));
      }
    }
  } else if (data.action === 'set') {
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
    if (typeof window !== 'undefined') {
      if (typeof window.updateNavUserHeader === 'function') window.updateNavUserHeader();
      if (typeof window.renderDashboard === 'function') window.renderDashboard();
      if (typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new CustomEvent('bb:session_sync', { detail: data }));
      }
    }
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

function sessionSet(key, value) {
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
        localStorage.removeItem('bb_session');
        localStorage.removeItem('bb_remember');
      } else if (isRemember) {
        localStorage.setItem('bb_session', JSON.stringify(_session));
        localStorage.setItem('bb_remember', 'true');
      }
      localStorage.setItem('bb_session_sync', JSON.stringify({
        action: 'set',
        key: key,
        value: value,
        session: _session,
        time: Date.now()
      }));
    }
    if (_syncChannel) {
      _syncChannel.postMessage({
        action: 'set',
        key: key,
        value: value,
        session: _session,
        time: Date.now()
      });
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

function sessionClear() {
  for (var k in _session) {
    if (Object.prototype.hasOwnProperty.call(_session, k)) {
      delete _session[k];
    }
  }
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem('bb_session');
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('bb_session');
      localStorage.removeItem('bb_remember');
      localStorage.setItem('bb_session_sync', JSON.stringify({
        action: 'clear',
        time: Date.now()
      }));
    }
    if (_syncChannel) {
      _syncChannel.postMessage({
        action: 'clear',
        time: Date.now()
      });
    }
  } catch (e) {
    console.warn('Session storage unavailable:', e);
  }
  if (typeof window !== 'undefined') {
    window._session = _session;
  }
}

// Attach to window for global access across the app
if (typeof window !== 'undefined') {
  window._session = _session;
  window.sessionSet = sessionSet;
  window.sessionGet = sessionGet;
  window.sessionClear = sessionClear;
  window.handleSyncMessage = handleSyncMessage;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { _session, sessionSet, sessionGet, sessionClear, handleSyncMessage };
}
