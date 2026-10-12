/**
 * 1st Petaling Jaya Boys' Brigade Portal
 * Member Hub & Authentication Module (TSK-005A)
 *
 * Handles member registration, login, dashboard view,
 * avatar uploads, password reset, and member order history.
 */

// ── Auth View Toggles ────────────────────────────────────────────────────────

function showAuthMode(mode) {
  ['login', 'forgot', 'register'].forEach(function(m) {
    var el = document.getElementById('auth-' + m);
    if (el) el.style.display = (m === mode) ? 'block' : 'none';
  });
  ['login', 'register'].forEach(function(m) {
    var btn = document.getElementById('btn-' + m);
    if (btn) btn.classList.toggle('active', m === mode);
  });
}

function togglePassVis(inputId, btnId) {
  var inp = document.getElementById(inputId);
  var btn = document.getElementById(btnId);
  if (!inp) return;
  if (inp.type === 'password') {
    inp.type = 'text';
    if (btn) btn.textContent = '🙈';
  } else {
    inp.type = 'password';
    if (btn) btn.textContent = '👁️';
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

// ── Registration & Login ────────────────────────────────────────────────────

async function registerMember() {
  var name     = (document.getElementById('reg-fullname') || {}).value || '';
  var ic       = ((document.getElementById('reg-ic') || {}).value || '').trim().replace(/\s/g, '');
  var dob      = (document.getElementById('reg-dob') || {}).value || '';
  var rank     = (document.getElementById('reg-rank') || {}).value || '';
  var squad    = (document.getElementById('reg-squad') || {}).value || '';
  var pass     = (document.getElementById('reg-pass') || {}).value || '';
  var pass2    = (document.getElementById('reg-pass2') || {}).value || '';
  var question = (document.getElementById('reg-question') || {}).value || '';
  var answer   = ((document.getElementById('reg-answer') || {}).value || '').trim().toLowerCase();

  name = name.trim();
  if (!name)           return alert('Please enter your full name.');
  if (!ic)             return alert('Please enter your IC number.');
  if (!dob)            return alert('Please enter your date of birth.');
  if (!rank)           return alert('Please select your rank.');
  if (!squad)          return alert('Please select your squad.');
  if (pass.length < 6) return alert('Password must be at least 6 characters.');
  if (pass !== pass2)  return alert('Passwords do not match!');
  if (!question)       return alert('Please select a security question.');
  if (!answer)         return alert('Please answer the security question.');

  try {
    var client = window.supa || supa;
    var existing = await client.get('bb_members?ic=eq.' + encodeURIComponent(ic) + '&select=ic');
    if (existing && existing.length) return alert('An account with this IC already exists.');

    await client.post('bb_members', {
      ic: ic,
      name: name,
      rank: rank,
      squad: squad,
      date_of_birth: dob,
      password: btoa(pass),
      security_question: question,
      security_answer: answer,
      joined_at: new Date().toISOString()
    });

    sessionSet('ic', ic);
    renderDashboard();

    if (typeof checkTasksAccess === 'function') checkTasksAccess();
    if (typeof checkAttendanceTabVisibility === 'function') checkAttendanceTabVisibility(ic);

    alert('✅ Account created! Welcome, ' + name + '!');
  } catch (e) {
    alert('Registration failed: ' + e.message);
  }
}

async function loginMember() {
  var ic   = ((document.getElementById('login-ic') || {}).value || '').trim().replace(/\s/g, '');
  var pass = (document.getElementById('login-pass') || {}).value || '';
  if (!ic || !pass) return alert('Please fill in all fields.');

  try {
    var client = window.supa || supa;
    var data = await client.get('bb_members?ic=eq.' + encodeURIComponent(ic) + '&select=*');
    if (!data || !data.length) return alert('No account found with this IC number.');

    var m = data[0];
    if (atob(m.password || '') !== pass) return alert('Incorrect password!');

    sessionSet('ic', ic);
    renderDashboard();

    if (typeof checkTasksAccess === 'function') checkTasksAccess();
    if (typeof checkAttendanceTabVisibility === 'function') checkAttendanceTabVisibility(ic);
  } catch (e) {
    alert('Login failed: ' + e.message);
  }
}

// ── Member Dashboard & Profile ──────────────────────────────────────────────

async function renderDashboard() {
  var ic = sessionGet('ic');
  if (!ic) return;

  var authBox = document.getElementById('m-auth');
  var dashBox = document.getElementById('m-dashboard');
  if (authBox) authBox.style.display = 'none';
  if (dashBox) dashBox.style.display = 'block';

  try {
    var client = window.supa || supa;
    var data = await client.get('bb_members?ic=eq.' + encodeURIComponent(ic) + '&select=*');
    if (!data || !data.length) return;

    var m = data[0];
    var set = function(id, val) {
      var el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    set('m-display-name', m.name);
    set('m-display-ic',   'IC: ' + m.ic);
    set('m-rank-val',     m.rank  || '—');
    sessionSet('rank',   m.rank || '');
    sessionSet('joined', m.joined_at || '');
    set('m-squad-val',    m.squad ? 'Squad ' + m.squad : '—');
    set('m-since-val',    m.joined_at ? new Date(m.joined_at).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

    // Load profile picture from Supabase Storage
    try {
      var pfpUrl = client.fileUrl('avatars', ic + '.jpg');
      var testImg = new Image();
      testImg.onload = function() {
        var img = document.getElementById('m-pfp-img');
        var ph  = document.getElementById('m-pfp-ph');
        if (img) { img.src = pfpUrl; img.style.display = 'block'; }
        if (ph)  ph.style.display = 'none';
      };
      testImg.src = pfpUrl + '?t=' + Date.now();
    } catch (e) {}

    loadMemberOrders();

    var bt = document.getElementById('tab-badges'); if (bt) bt.style.display = 'block';
    var sb = document.getElementById('snav-badges'); if (sb) sb.style.display = 'flex';

    if (typeof checkAttendanceTabVisibility === 'function') checkAttendanceTabVisibility(ic);
  } catch (e) {
    console.error('Failed to render dashboard:', e);
  }
}

async function loadMemberOrders() {
  var ic        = sessionGet('ic');
  var container = document.getElementById('member-orders-list');
  if (!ic || !container) return;

  container.innerHTML = '<div style="color:#556;font-size:13px;text-align:center;padding:16px;"><span class="spinner"></span> Loading...</div>';
  try {
    var client = window.supa || supa;
    var orders = await client.get('bb_orders?ic=eq.' + encodeURIComponent(ic) + '&order=created_at.desc');
    if (!orders || !orders.length) {
      container.innerHTML = '<div style="color:#556;font-size:13px;text-align:center;padding:16px;">No orders yet.</div>';
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
          itemLines = '<div style="font-size:12px;color:#8898bb;">' + items.form_name + '</div>';
        } else {
          Object.entries(items).forEach(function(kv) {
            var prod = itemsList.find(function(i) { return i.key === kv[0]; });
            var v    = kv[1];
            var subtotal = v.price && v.qty ? ' — RM ' + (v.price * v.qty).toFixed(2) : '';
            itemLines += '<div style="display:flex;justify-content:space-between;font-size:12px;color:#8898bb;padding:3px 0;">'
              + '<span>' + (prod ? prod.name : kv[0]) + (v.size ? ' (' + v.size + ')' : '') + '</span>'
              + '<span>x' + v.qty + subtotal + '</span></div>';
          });
        }
      } catch (e) {}

      var ssHtml = o.payment_screenshot
        ? '<div style="display:flex;align-items:center;gap:6px;margin-top:8px;font-size:11px;color:#66bb6a;">✓ Payment screenshot uploaded</div>'
        : '<div style="display:flex;align-items:center;gap:6px;margin-top:8px;font-size:11px;color:#e8b830;">⚠ No payment screenshot</div>';

      html += '<div style="background:#122040;border-radius:12px;padding:14px;margin-bottom:10px;border:1px solid rgba(255,255,255,0.06);">'
        + '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">'
        + '<div>'
        + '<div style="font-family:\'Oswald\',sans-serif;font-size:14px;font-weight:700;color:#fff;">' + o.order_number + '</div>'
        + '<div style="font-size:11px;color:#556;margin-top:1px;">' + created + '</div>'
        + '</div>'
        + '<div style="font-size:11px;font-weight:700;padding:4px 10px;border-radius:20px;background:' + sc + '22;color:' + sc + ';border:1px solid ' + sc + '44;font-family:\'Oswald\',sans-serif;text-align:center;">' + sl + '</div>'
        + '</div>'
        + '<div style="border-top:1px solid rgba(255,255,255,0.05);padding-top:8px;">' + itemLines + '</div>'
        + ssHtml
        + (o.notes ? '<div style="font-size:11px;color:#556;margin-top:6px;">Note: ' + o.notes + '</div>' : '')
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
    sessionSet('ic', null);
    sessionSet('rank', '');
    sessionSet('joined', '');
  }

  var tt = document.getElementById('tab-tasks');       if (tt) tt.style.display = 'none';
  var bt = document.getElementById('tab-badges');      if (bt) bt.style.display = 'none';
  var at = document.getElementById('tab-attendance');  if (at) at.style.display = 'none';
  var sat = document.getElementById('snav-attendance'); if (sat) sat.style.display = 'none';
  var sba = document.getElementById('snav-badges');     if (sba) sba.style.display = 'none';
  var sta = document.getElementById('snav-tasks');      if (sta) sta.style.display = 'none';

  var authBox = document.getElementById('m-auth');
  var dashBox = document.getElementById('m-dashboard');
  if (authBox) authBox.style.display = 'block';
  if (dashBox) dashBox.style.display = 'none';

  showAuthMode('login');
}

async function uploadPfp(input) {
  var file = input.files[0];
  if (!file) return;
  var ic = sessionGet('ic');
  if (!ic) return;

  try {
    var client = window.supa || supa;
    var blob = new Blob([await file.arrayBuffer()], { type: file.type });
    await client.uploadFile('avatars', ic + '.jpg', blob);
    var pfpUrl = client.fileUrl('avatars', ic + '.jpg') + '?t=' + Date.now();
    var img = document.getElementById('m-pfp-img');
    var ph  = document.getElementById('m-pfp-ph');
    if (img) { img.src = pfpUrl; img.style.display = 'block'; }
    if (ph)  ph.style.display = 'none';
  } catch (e) {
    alert('Failed to upload photo: ' + e.message);
  }
}

// ── Password Reset & Security Questions ─────────────────────────────────────

async function loadSecurityQuestion() {
  var ic = ((document.getElementById('forgot-ic') || {}).value || '').trim().replace(/\s/g, '');
  if (!ic) return alert('Please enter your IC number.');

  try {
    var client = window.supa || supa;
    var data = await client.get('bb_members?ic=eq.' + encodeURIComponent(ic) + '&select=security_question');
    if (!data || !data.length) return alert('No account found with this IC.');

    var box = document.getElementById('forgot-question-box');
    if (box) box.textContent = '❓ ' + data[0].security_question;
    var s2 = document.getElementById('forgot-step2');
    if (s2) s2.style.display = 'block';
  } catch (e) {
    alert('Failed: ' + e.message);
  }
}

async function resetPassword() {
  var ic  = ((document.getElementById('forgot-ic') || {}).value || '').trim().replace(/\s/g, '');
  var ans = ((document.getElementById('forgot-answer') || {}).value || '').trim().toLowerCase();
  var p1  = (document.getElementById('forgot-newpass') || {}).value || '';
  var p2  = (document.getElementById('forgot-newpass2') || {}).value || '';

  if (p1.length < 6) return alert('Password must be at least 6 characters.');
  if (p1 !== p2)     return alert('Passwords do not match!');

  try {
    var client = window.supa || supa;
    var data = await client.get('bb_members?ic=eq.' + encodeURIComponent(ic) + '&select=security_answer');
    if (!data || !data.length) return alert('Account not found.');
    if (data[0].security_answer !== ans) return alert('Incorrect answer!');

    await client.patch('bb_members?ic=eq.' + encodeURIComponent(ic), { password: btoa(p1) });
    alert('✅ Password reset! Please login.');
    showAuthMode('login');
  } catch (e) {
    alert('Failed: ' + e.message);
  }
}

// ── Global Window Exports (HTML inline handler compatibility) ────────────────

if (typeof window !== 'undefined') {
  window.showAuthMode         = showAuthMode;
  window.togglePassVis        = togglePassVis;
  window.goToMemberTab        = goToMemberTab;
  window.registerMember       = registerMember;
  window.loginMember          = loginMember;
  window.renderDashboard      = renderDashboard;
  window.loadMemberOrders     = loadMemberOrders;
  window.logoutMember         = logoutMember;
  window.uploadPfp            = uploadPfp;
  window.loadSecurityQuestion = loadSecurityQuestion;
  window.resetPassword        = resetPassword;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    showAuthMode,
    togglePassVis,
    goToMemberTab,
    registerMember,
    loginMember,
    renderDashboard,
    loadMemberOrders,
    logoutMember,
    uploadPfp,
    loadSecurityQuestion,
    resetPassword
  };
}
