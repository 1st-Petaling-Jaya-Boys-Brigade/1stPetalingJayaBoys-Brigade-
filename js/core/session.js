/**
 * 1st Petaling Jaya Boys' Brigade Portal
 * Session State Management (sessionStorage)
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
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { _session, sessionSet, sessionGet, sessionClear };
}
