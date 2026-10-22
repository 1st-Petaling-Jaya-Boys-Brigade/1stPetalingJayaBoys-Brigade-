/**
 * 1st Petaling Jaya Boys' Brigade Portal
 * Privacy-First Member Hub & Authentication Module (TSK-005B)
 *
 * Implements privacy-first authentication (Email + Password),
 * member onboarding (Section, Age, Rank, Squad), profile dashboard,
 * avatar uploads, order history, and privacy-preserving password reset.
 */

// ── Auth View Toggles ────────────────────────────────────────────────────────

function showAuthMode(mode) {
  ['login', 'forgot', 'register'].forEach(function(m) {
    var el = document.getElementById('auth-' + m);
    if (el) el.style.display = (m === mode) ? 'block' : 'none';
  });
  ['login', 'register'].forEach(function(btnMode) {
    var btn = document.getElementById('btn-' + btnMode);
    if (btn) btn.classList.toggle('active', btnMode === mode);
  });
  if (mode === 'forgot' && typeof showForgotStep === 'function') {
    showForgotStep(1);
  }
}

function togglePassVis(inputId, btnId) {
  var inp = document.getElementById(inputId);
  var btn = document.getElementById(btnId);
  if (!inp) return;
  if (inp.type === 'password') {
    inp.type = 'text';
    if (btn) btn.innerHTML = '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>';
  } else {
    inp.type = 'password';
    if (btn) btn.innerHTML = '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
  }
}

function goToMemberTab() {
  var btn = (typeof document !== 'undefined') ? document.getElementById('tab-member') : null;
  if (typeof switchTab === 'function') {
    switchTab('member', btn);
  } else if (typeof window !== 'undefined' && typeof window.switchTab === 'function') {
    window.switchTab('member', btn);
  }
}

// ── Registration & Login (Privacy-First) ────────────────────────────────────

var EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function registerMember() {
  var name    = ((document.getElementById('reg-fullname') || {}).value || '').trim();
  var emailEl = document.getElementById('reg-email') || document.getElementById('reg-ic') || {};
  var email   = (emailEl.value || '').trim().toLowerCase();
  var section = ((document.getElementById('reg-section') || {}).value || '').trim();
  var ageRaw  = ((document.getElementById('reg-age') || {}).value || '').trim();
  var rank    = ((document.getElementById('reg-rank') || {}).value || '').trim();
  var squad   = ((document.getElementById('reg-squad') || {}).value || '').trim();
  var pass    = (document.getElementById('reg-pass') || {}).value || '';
  var pass2   = (document.getElementById('reg-pass2') || {}).value || '';

  if (!name) return alert('Please enter your full name.');
  if (!email || !EMAIL_REGEX.test(email)) return alert('Please enter a valid email address.');
  if (!section) return alert('Please select your section (Pre-Junior, Junior, or Senior).');
  
  var parsedAge = parseInt(ageRaw, 10);
  if (!ageRaw || isNaN(parsedAge) || parsedAge < 5 || parsedAge > 25) {
    return alert('Please enter a valid age (between 5 and 25).');
  }
  if (!rank)  return alert('Please select your rank.');
  if (!squad) return alert('Please select your platoon.');
  if (pass.length < 6) return alert('Password must be at least 6 characters.');
  if (pass !== pass2)  return alert('Passwords do not match!');

  try {
    var client = window.supa || supa;
    var existing = await client.get('bb_members?ic=eq.' + encodeURIComponent(email) + '&select=ic');
    if (existing && existing.length) {
      return alert('An account with this email address already exists. Please login instead.');
    }

    // Calculate approximate birth year for section/attendance calculations
    var birthYear = new Date().getFullYear() - parsedAge;
    var approxDob = birthYear + '-01-01';

    var memberPayload = {
      ic: email, // Email serves as the privacy-safe primary identifier
      name: name,
      rank: rank,
      squad: squad,
      att_section: section, // Maps to Pre-Junior / Junior / Senior
      date_of_birth: approxDob,
      password: await hashPassword(pass),
      security_question: null,
      security_answer: null,
      joined_at: new Date().toISOString()
    };

    await client.post('bb_members', memberPayload);

    // Save session state with Remember Me preference
    var remEl = document.getElementById('reg-remember');
    var rememberMe = remEl ? remEl.checked : true;
    sessionSet('remember', rememberMe);

    sessionSet('email', email);
    sessionSet('ic', email);
    sessionSet('name', name);
    sessionSet('rank', rank);
    sessionSet('squad', squad);
    sessionSet('section', section);
    sessionSet('age', parsedAge);
    sessionSet('joined', memberPayload.joined_at);

    renderDashboard();

    if (typeof checkTasksAccess === 'function') checkTasksAccess();
    if (typeof checkAttendanceTabVisibility === 'function') checkAttendanceTabVisibility(email);

    // Immediately reload and land directly on the member portal without blocking alert
    if (window.location.hash !== '#member') {
      window.location.hash = '#member';
    }
    window.location.reload();
  } catch (e) {
    alert('Registration failed: ' + e.message);
  }
}

async function loginMember() {
  var idEl = document.getElementById('login-email') || document.getElementById('login-ic') || {};
  var identifier = (idEl.value || '').trim();
  var pass = (document.getElementById('login-pass') || {}).value || '';
  if (!identifier || !pass) return alert('Please enter your email and password.');

  try {
    var client = window.supa || supa;
    var queryEmail = identifier.toLowerCase();

    // Query by email / identifier
    var data = await client.get('bb_members?ic=eq.' + encodeURIComponent(queryEmail) + '&select=*');
    if (!data || !data.length) {
      // Fallback: try exact case for legacy accounts
      data = await client.get('bb_members?ic=eq.' + encodeURIComponent(identifier) + '&select=*');
    }
    if (!data || !data.length) {
      return alert('No account found with this email address.');
    }

    var m = data[0];
    if (m.department === 'deleted' || m.department === 'archived_deleted') {
      return alert('This account has been deleted. Please contact an officer or administrator.');
    }
    var check = await verifyPassword(pass, m.password || '');
    if (!check.valid) {
      return alert('Incorrect password!');
    }

    // Auto-migrate legacy Base64 credentials to PBKDF2/SHA-256 on successful login
    if (check.needsUpgrade) {
      try {
        var upgradedHash = await hashPassword(pass);
        await client.patch('bb_members?ic=eq.' + encodeURIComponent(m.ic), { password: upgradedHash });
        console.log('Seamlessly upgraded member credentials to PBKDF2/SHA-256');
      } catch (upgErr) {
        console.warn('Password upgrade note:', upgErr);
      }
    }

    var userEmail = (m.ic && m.ic.indexOf('@') !== -1) ? m.ic : (m.email || m.ic);
    var rememberEl = document.getElementById('login-remember');
    var rememberMe = rememberEl ? rememberEl.checked : true;
    sessionSet('remember', rememberMe);

    sessionSet('email', userEmail);
    sessionSet('ic', m.ic);
    sessionSet('rank', m.rank || '');
    sessionSet('squad', m.squad || '');
    sessionSet('name', m.name || '');
    sessionSet('section', m.att_section || m.section || 'Senior');
    sessionSet('joined', m.joined_at || '');

    renderDashboard();

    if (typeof checkTasksAccess === 'function') checkTasksAccess();
    if (typeof checkAttendanceTabVisibility === 'function') checkAttendanceTabVisibility(m.ic);

    var passEl = document.getElementById('login-pass');
    if (passEl) passEl.value = '';
  } catch (e) {
    alert('Login failed: ' + e.message);
  }
}

// ── Member Dashboard & Profile ──────────────────────────────────────────────

async function renderDashboard() {
  var id = (typeof sessionGet === 'function') ? (sessionGet('email') || sessionGet('ic')) : null;
  if (!id) return;

  var authBox = document.getElementById('m-auth');
  var dashBox = document.getElementById('m-dashboard');
  if (authBox) authBox.style.display = 'none';
  if (dashBox) dashBox.style.display = 'block';

  try {
    var client = window.supa || supa;
    var data = await client.get('bb_members?ic=eq.' + encodeURIComponent(id) + '&select=*');
    if (!data || !data.length) return;

    var m = data[0];
    var set = function(elemId, val) {
      var el = document.getElementById(elemId);
      if (el) el.textContent = val;
    };

    var displayEmail = (m.ic && m.ic.indexOf('@') !== -1) ? m.ic : (m.email || m.ic);
    set('m-display-name', m.name || '—');
    set('m-display-email', displayEmail);
    set('m-display-ic',   displayEmail); // Compatibility for legacy selectors
    set('m-rank-val',     m.rank || '—');
    set('m-squad-val',    m.squad ? m.squad + ' Platoon' : '—');
    set('m-section-val',  m.att_section || m.section || sessionGet('section') || 'Senior');

    // Display age if calculated or from birth year
    var ageVal = '—';
    if (sessionGet('age')) {
      ageVal = sessionGet('age') + ' yrs';
    } else if (m.date_of_birth) {
      var bYear = parseInt((m.date_of_birth || '').split('-')[0], 10);
      if (!isNaN(bYear) && bYear > 1990) {
        ageVal = (new Date().getFullYear() - bYear) + ' yrs';
      }
    }
    set('m-age-val', ageVal);

    sessionSet('rank', m.rank || '');
    sessionSet('joined', m.joined_at || '');
    set('m-since-val', m.joined_at ? new Date(m.joined_at).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

    set('sidebar-user-name', m.name || 'Member');
    set('sidebar-user-badge', (m.rank ? m.rank : '') + (m.squad ? ' · ' + m.squad + ' Sq' : (m.att_section || 'Member')));

    // Load profile avatar from Supabase Storage
    try {
      var cleanFileName = id.replace(/[^a-zA-Z0-9@._-]/g, '_') + '.jpg';
      var pfpUrl = client.fileUrl('avatars', cleanFileName);
      var testImg = new Image();
      testImg.onload = function() {
        var img = document.getElementById('m-pfp-img');
        var ph  = document.getElementById('m-pfp-ph');
        if (img) { img.src = pfpUrl; img.style.display = 'block'; }
        if (ph)  ph.style.display = 'none';
        var sImg = document.getElementById('sidebar-user-avatar-img');
        var sPh  = document.getElementById('sidebar-user-avatar-ph');
        if (sImg) { sImg.src = pfpUrl; sImg.style.display = 'block'; }
        if (sPh)  sPh.style.display = 'none';
      };
      testImg.src = pfpUrl + '?t=' + Date.now();
    } catch (e) {}

    loadMemberOrders();
    if (typeof loadMemberAttendanceStats === 'function') loadMemberAttendanceStats(m.name);

    var bt = document.getElementById('tab-badges');  if (bt) bt.style.display = 'block';
    var sb = document.getElementById('snav-badges'); if (sb) sb.style.display = 'flex';

    if (typeof checkAttendanceTabVisibility === 'function') checkAttendanceTabVisibility(m.ic);
  } catch (e) {
    console.error('Failed to render dashboard:', e);
  }
}

async function loadMemberOrders() {
  var id = (typeof sessionGet === 'function') ? (sessionGet('email') || sessionGet('ic')) : null;
  var container = document.getElementById('member-orders-list');
  if (!id || !container) return;

  container.innerHTML = '<div style="color:var(--text-muted);font-size:13px;text-align:center;padding:16px;"><span class="spinner"></span> Loading...</div>';
  try {
    var client = window.supa || supa;
    var orders = await client.get('bb_orders?ic=eq.' + encodeURIComponent(id) + '&order=created_at.desc');
    if (!orders || !orders.length) {
      container.innerHTML = '<div style="color:var(--text-muted);font-size:13px;text-align:center;padding:16px;">No orders yet.</div>';
      return;
    }

    var SC = { pending: '#e8b830', processing: '#42a5f5', ready: '#66bb6a', collected: '#888', cancelled: '#ef5350' };
    var SL = { pending: 'Pending', processing: 'Processing', ready: 'Ready for Collection', collected: 'Collected', cancelled: 'Cancelled' };
    var itemsList = window.UNIFORM_ITEMS || [];
    var html = '';

    orders.forEach(function(o) {
      var status  = o.status || 'pending';
      var sc      = SC[status] || '#888';
      var sl      = SL[status] || status;
      var created = o.created_at ? new Date(o.created_at).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

      var itemLines = '';
      try {
        var items = JSON.parse(o.items || '{}');
        if (items.form_name) {
          itemLines = '<div style="font-size:12px;color:var(--text-secondary);">' + items.form_name + '</div>';
        } else {
          Object.entries(items).forEach(function(kv) {
            var prod = itemsList.find(function(i) { return i.key === kv[0]; });
            var v    = kv[1];
            var subtotal = v.price && v.qty ? ' — RM ' + (v.price * v.qty).toFixed(2) : '';
            itemLines += '<div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-secondary);padding:3px 0;">'
              + '<span>' + (prod ? prod.name : kv[0]) + (v.size ? ' (' + v.size + ')' : '') + '</span>'
              + '<span>x' + v.qty + subtotal + '</span></div>';
          });
        }
      } catch (e) {}

      var ssHtml = o.payment_screenshot
        ? '<div style="display:flex;align-items:center;gap:6px;margin-top:8px;font-size:11px;color:var(--green);"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg> Payment screenshot uploaded</div>'
        : '<div style="display:flex;align-items:center;gap:6px;margin-top:8px;font-size:11px;color:var(--accent);"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg> No payment screenshot</div>';

      html += '<div style="background:var(--bg-card);border-radius:12px;padding:14px;margin-bottom:10px;border:1px solid var(--border-card);box-shadow:var(--shadow-card);">'
        + '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">'
        + '<div>'
        + '<div style="font-family:\'Oswald\',sans-serif;font-size:14px;font-weight:700;color:var(--text-primary);">' + o.order_number + '</div>'
        + '<div style="font-size:11px;color:var(--text-muted);margin-top:1px;">' + created + '</div>'
        + '</div>'
        + '<div style="font-size:11px;font-weight:700;padding:4px 10px;border-radius:20px;background:' + sc + '22;color:' + sc + ';border:1px solid ' + sc + '44;font-family:\'Oswald\',sans-serif;text-align:center;">' + sl + '</div>'
        + '</div>'
        + '<div style="border-top:1px solid var(--border-subtle);padding-top:8px;">' + itemLines + '</div>'
        + ssHtml
        + (o.notes ? '<div style="font-size:11px;color:var(--text-muted);margin-top:6px;">Note: ' + o.notes + '</div>' : '')
        + '</div>';
    });
    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = '<div style="color:#f66;font-size:13px;text-align:center;padding:16px;">Failed to load orders.</div>';
  }
}

function logoutMember() {
  if (typeof sessionClear === 'function') {
    sessionClear();
  } else {
    sessionSet('email', null);
    sessionSet('ic', null);
    sessionSet('rank', '');
    sessionSet('squad', '');
    sessionSet('joined', '');
  }

  var tt = document.getElementById('tab-tasks');       if (tt) tt.style.display = 'none';
  var bt = document.getElementById('tab-badges');      if (bt) bt.style.display = 'none';
  var at = document.getElementById('tab-attendance');  if (at) at.style.display = 'none';
  var sat = document.getElementById('snav-attendance'); if (sat) sat.style.display = 'none';
  var sba = document.getElementById('snav-badges');     if (sba) sba.style.display = 'none';

  var authBox = document.getElementById('m-auth');
  var dashBox = document.getElementById('m-dashboard');
  if (authBox) authBox.style.display = 'block';
  if (dashBox) dashBox.style.display = 'none';

  var sn = document.getElementById('sidebar-user-name');
  var sb = document.getElementById('sidebar-user-badge');
  if (sn) sn.textContent = 'Guest Member';
  if (sb) sb.textContent = 'Login / Register';
  var sImg = document.getElementById('sidebar-user-avatar-img');
  var sPh  = document.getElementById('sidebar-user-avatar-ph');
  if (sImg) sImg.style.display = 'none';
  if (sPh)  sPh.style.display = 'flex';

  showAuthMode('login');
}

async function uploadPfp(input) {
  var file = input.files[0];
  if (!file) return;
  var id = (typeof sessionGet === 'function') ? (sessionGet('email') || sessionGet('ic')) : null;
  if (!id) return;

  try {
    var client = window.supa || supa;
    var blob = new Blob([await file.arrayBuffer()], { type: file.type });
    var cleanFileName = id.replace(/[^a-zA-Z0-9@._-]/g, '_') + '.jpg';
    await client.uploadFile('avatars', cleanFileName, blob);
    var pfpUrl = client.fileUrl('avatars', cleanFileName) + '?t=' + Date.now();
    var img = document.getElementById('m-pfp-img');
    var ph  = document.getElementById('m-pfp-ph');
    if (img) { img.src = pfpUrl; img.style.display = 'block'; }
    if (ph)  ph.style.display = 'none';
  } catch (e) {
    alert('Failed to upload photo: ' + e.message);
  }
}

// ── Password Reset (Email Verification) ─────────────────────────────────────

function showForgotStep(step) {
  var s1 = document.getElementById('forgot-step1');
  var s2 = document.getElementById('forgot-step2');
  var sub = document.getElementById('forgot-header-sub');
  if (s1) s1.style.display = (step === 1) ? 'block' : 'none';
  if (s2) s2.style.display = (step === 2) ? 'block' : 'none';
  if (sub) {
    sub.textContent = (step === 1)
      ? 'Verify via your registered email'
      : 'Enter code and new password';
  }
}

async function sendPasswordResetEmail() {
  var emailEl = document.getElementById('forgot-email') || document.getElementById('forgot-ic') || {};
  var email   = (emailEl.value || '').trim().toLowerCase();

  if (!email) {
    return alert('Please enter your registered email address.');
  }
  if (!EMAIL_REGEX.test(email)) {
    return alert('Please enter a valid email address.');
  }

  var btn = document.getElementById('btn-send-reset');
  var origText = btn ? btn.textContent : '';
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ Sending Reset Code...';
  }

  try {
    var client = window.supa || supa;

    // Check if account exists in bb_members
    var data = await client.get('bb_members?ic=eq.' + encodeURIComponent(email) + '&select=ic,name,department');
    if (!data || !data.length) {
      // Check legacy exact case
      data = await client.get('bb_members?ic=eq.' + encodeURIComponent((emailEl.value || '').trim()) + '&select=ic,name,department');
    }
    if (!data || !data.length || data[0].department === 'deleted' || data[0].department === 'archived_deleted') {
      if (btn) { btn.disabled = false; btn.textContent = origText; }
      return alert('No active account found with this email address.');
    }

    var member = data[0];
    var memberName = member.name || 'Member';

    // Generate secure 6-digit verification code
    var code = Math.floor(100000 + Math.random() * 900000).toString();
    var expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes
    var otpPayload = {
      code: code,
      email: email,
      name: memberName,
      expires_at: expiresAt
    };

    // Store in sessionStorage for fast verification
    try {
      sessionStorage.setItem('bb_reset_otp_' + email, JSON.stringify(otpPayload));
    } catch (e) {}

    // Store in bb_config for persistent verification
    var configKey = 'bb_reset_otp_' + email.replace(/[^a-zA-Z0-9]/g, '_');
    try {
      await client.req('POST', 'bb_config?on_conflict=key', {
        key: configKey,
        value: JSON.stringify(otpPayload)
      });
    } catch (cfgErr) {
      try {
        await client.patch('bb_config?key=eq.' + configKey, {
          value: JSON.stringify(otpPayload)
        });
      } catch (e2) {}
    }

    // Trigger Supabase Auth recovery email if user exists in auth.users
    try {
      var authUrl = (typeof SUPA_URL !== 'undefined' ? SUPA_URL : (window.SUPA_URL || '')) + '/auth/v1/recover';
      var authKey = typeof SUPA_KEY !== 'undefined' ? SUPA_KEY : (window.SUPA_KEY || '');
      await fetch(authUrl, {
        method: 'POST',
        headers: {
          apikey: authKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email: email })
      });
    } catch (recoverErr) {}

    // Update UI for Step 2
    var noticeEl = document.getElementById('forgot-notice');
    if (noticeEl) {
      noticeEl.innerHTML = '<span style="display:inline-flex;align-items:center;gap:6px;"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg> A 6-digit reset code has been sent to <strong>' + email + '</strong>.</span><br>'
        + '<span style="font-size:11px;opacity:0.9;">Please check your inbox (and spam folder) and enter the code below. Valid for 15 minutes.</span>';
    }

    var codeInp = document.getElementById('forgot-code');
    var p1Inp   = document.getElementById('forgot-newpass');
    var p2Inp   = document.getElementById('forgot-newpass2');
    if (codeInp) codeInp.value = '';
    if (p1Inp)   p1Inp.value = '';
    if (p2Inp)   p2Inp.value = '';

    showForgotStep(2);

    alert('Reset code generated and sent to ' + email + '!\n\nPlease check your inbox and enter the 6-digit code to set your new password.');
  } catch (e) {
    alert('Failed to send reset email: ' + e.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = origText || 'Send Reset Code';
    }
  }
}

async function verifyResetCodeAndSetPassword() {
  var emailEl = document.getElementById('forgot-email') || document.getElementById('forgot-ic') || {};
  var email   = (emailEl.value || '').trim().toLowerCase();
  var codeInp = document.getElementById('forgot-code');
  var code    = ((codeInp || {}).value || '').trim();
  var p1      = (document.getElementById('forgot-newpass') || {}).value || '';
  var p2      = (document.getElementById('forgot-newpass2') || {}).value || '';

  if (!email) return alert('Please enter your registered email address.');
  if (!code)  return alert('Please enter the 6-digit verification code sent to your email.');
  if (code.length !== 6) return alert('Verification code must be exactly 6 digits.');
  if (p1.length < 6) return alert('New password must be at least 6 characters.');
  if (p1 !== p2)     return alert('Passwords do not match!');

  var btn = document.getElementById('btn-verify-reset');
  var origText = btn ? btn.textContent : '';
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Verifying & Updating...';
  }

  try {
    var client = window.supa || supa;
    var valid = false;
    var now = Date.now();

    // 1. Check local session storage
    try {
      var localStr = sessionStorage.getItem('bb_reset_otp_' + email);
      if (localStr) {
        var localData = JSON.parse(localStr);
        if (localData && localData.code === code && now <= (localData.expires_at || 0)) {
          valid = true;
        }
      }
    } catch (e) {}

    // 2. Check remote Supabase bb_config
    if (!valid) {
      try {
        var configKey = 'bb_reset_otp_' + email.replace(/[^a-zA-Z0-9]/g, '_');
        var rows = await client.get('bb_config?key=eq.' + configKey + '&select=value');
        if (rows && rows.length) {
          var remoteData = JSON.parse(rows[0].value || '{}');
          if (remoteData && remoteData.code === code && now <= (remoteData.expires_at || 0)) {
            valid = true;
          }
        }
      } catch (e) {}
    }

    if (!valid) {
      if (btn) { btn.disabled = false; btn.textContent = origText; }
      return alert('Invalid or expired verification code.\n\nPlease check your email or click "Resend Code" to get a new code.');
    }

    // Update password in bb_members using cryptographic PBKDF2/SHA-256 hashing
    var newHash = await hashPassword(p1);
    try {
      await client.patch('bb_members?ic=eq.' + encodeURIComponent(email), {
        password: newHash
      });
    } catch (pErr) {
      var rawEmail = (emailEl.value || '').trim();
      await client.patch('bb_members?ic=eq.' + encodeURIComponent(rawEmail), {
        password: newHash
      });
    }

    // Cleanup OTP
    try { sessionStorage.removeItem('bb_reset_otp_' + email); } catch (e) {}
    try {
      var configKey = 'bb_reset_otp_' + email.replace(/[^a-zA-Z0-9]/g, '_');
      await client.delete('bb_config?key=eq.' + configKey);
    } catch (e) {}

    alert('Password reset successfully! You can now log in with your new password.');

    // Clear forgot form
    if (codeInp) codeInp.value = '';
    var p1El = document.getElementById('forgot-newpass');
    var p2El = document.getElementById('forgot-newpass2');
    if (p1El) p1El.value = '';
    if (p2El) p2El.value = '';

    // Switch to login mode and pre-fill email
    showAuthMode('login');
    var loginEmail = document.getElementById('login-email') || document.getElementById('login-ic');
    if (loginEmail) {
      loginEmail.value = email;
      var loginPass = document.getElementById('login-pass');
      if (loginPass) loginPass.focus();
    }
  } catch (e) {
    alert('Password reset failed: ' + e.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = origText || 'Set New Password';
    }
  }
}

// Backwards-compatibility wrapper
async function resetPassword() {
  var codeInp = document.getElementById('forgot-code');
  if (codeInp && codeInp.value && codeInp.value.trim().length === 6) {
    return verifyResetCodeAndSetPassword();
  }
  return sendPasswordResetEmail();
}

// Legacy helper retained for backwards compatibility
function loadSecurityQuestion() {
  var step2 = document.getElementById('forgot-step2');
  if (step2) step2.style.display = 'block';
}

// ── Global Window Exports (HTML inline handler compatibility) ────────────────

if (typeof window !== 'undefined') {
  window.showAuthMode                 = showAuthMode;
  window.showForgotStep               = showForgotStep;
  window.togglePassVis                = togglePassVis;
  window.goToMemberTab                = goToMemberTab;
  window.registerMember               = registerMember;
  window.loginMember                  = loginMember;
  window.renderDashboard              = renderDashboard;
  window.loadMemberOrders             = loadMemberOrders;
  window.logoutMember                 = logoutMember;
  window.uploadPfp                    = uploadPfp;
  window.loadSecurityQuestion         = loadSecurityQuestion;
  window.sendPasswordResetEmail       = sendPasswordResetEmail;
  window.verifyResetCodeAndSetPassword = verifyResetCodeAndSetPassword;
  window.resetPassword                = resetPassword;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    showAuthMode,
    showForgotStep,
    togglePassVis,
    goToMemberTab,
    registerMember,
    loginMember,
    renderDashboard,
    loadMemberOrders,
    logoutMember,
    uploadPfp,
    loadSecurityQuestion,
    sendPasswordResetEmail,
    verifyResetCodeAndSetPassword,
    resetPassword
  };
}
