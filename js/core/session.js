/**
 * 1st Petaling Jaya Boys' Brigade Portal
 * Session State Management (sessionStorage)
 */

var _session = (function() {
  try {
    if (typeof sessionStorage !== 'undefined') {
      return JSON.parse(sessionStorage.getItem('bb_session') || '{}');
    }
    return {};
  } catch (e) {
    return {};
  }
})();

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
  _session = {};
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem('bb_session');
    }
  } catch (e) {
    console.warn('Session storage unavailable:', e);
  }
}

// Attach to window for global access across the app
if (typeof window !== 'undefined') {
  window._session = _session;
  window.sessionSet = sessionSet;
  window.sessionGet = sessionGet;
  window.sessionClear = sessionClear;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { _session, sessionSet, sessionGet, sessionClear };
}
