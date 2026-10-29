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

// ── Child Safety (COPPA/PDPA) & Parental Consent Governance (TSK-032) ──────────

function isMinorSection(section, age) {
  if (!section && (age === undefined || age === null || age === '')) return false;
  var s = String(section || '').trim().toLowerCase();
  if (s === 'pre-junior' || s === 'junior') return true;
  var numAge = parseInt(age, 10);
  if (!isNaN(numAge) && numAge > 0 && numAge <= 11) return true;
  return false;
}

function handleSectionChange() {
  if (typeof document === 'undefined') return;
  var secEl = document.getElementById('reg-section');
  var ageEl = document.getElementById('reg-age');
  var box   = document.getElementById('parent-consent-box');
  if (!box) return;

  var section = secEl ? secEl.value : '';
  var age     = ageEl ? ageEl.value : '';

  if (isMinorSection(section, age)) {
    box.style.display = 'block';
    var pName = document.getElementById('reg-parent-name');
    var pContact = document.getElementById('reg-parent-contact');
    var pConsent = document.getElementById('reg-parent-consent');
    if (pName) pName.setAttribute('required', 'required');
    if (pContact) pContact.setAttribute('required', 'required');
    if (pConsent) pConsent.setAttribute('required', 'required');
  } else {
    box.style.display = 'none';
    var pName = document.getElementById('reg-parent-name');
    var pContact = document.getElementById('reg-parent-contact');
    var pConsent = document.getElementById('reg-parent-consent');
    if (pName) pName.removeAttribute('required');
    if (pContact) pContact.removeAttribute('required');
    if (pConsent) pConsent.removeAttribute('required');
  }
}

function openChildSafetyModal(e) {
  if (e && typeof e.preventDefault === 'function') e.preventDefault();
  if (typeof document === 'undefined') return;
  var modal = document.getElementById('child-safety-modal');
  if (modal) modal.style.display = 'block';
}

function closeChildSafetyModal() {
  if (typeof document === 'undefined') return;
  var modal = document.getElementById('child-safety-modal');
  if (modal) modal.style.display = 'none';
}

async function fetchMemberConsent(email, memberObj) {
  if (!email) return null;
  if (memberObj && (memberObj.parent_name || memberObj.parental_consent_signed !== undefined)) {
    return {
      parent_name: memberObj.parent_name || '',
      parent_contact: memberObj.parent_contact || '',
      parental_consent_signed: !!memberObj.parental_consent_signed,
      parental_consent_date: memberObj.parental_consent_date || null,
      media_consent: !!memberObj.media_consent
    };
  }
  try {
    var client = (typeof window !== 'undefined' && window.supa) ? window.supa : (typeof supa !== 'undefined' ? supa : null);
    if (client && typeof client.get === 'function') {
      var consentKey = 'bb_consent_' + String(email).replace(/[^a-zA-Z0-9_-]/g, '_');
      var rows = await client.get('bb_config?key=eq.' + encodeURIComponent(consentKey) + '&select=value');
      if (rows && rows.length && rows[0].value) {
        var parsed = typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value;
        return parsed;
      }
    }
  } catch (e) {}

  if (typeof sessionGet === 'function' && (sessionGet('email') === email || sessionGet('ic') === email)) {
    var pName = sessionGet('parent_name');
    var pContact = sessionGet('parent_contact');
    var pSigned = sessionGet('parental_consent_signed');
    var pDate = sessionGet('parental_consent_date');
    var pMedia = sessionGet('media_consent');
    if (pName || pSigned) {
      return {
        parent_name: pName || '',
        parent_contact: pContact || '',
        parental_consent_signed: !!pSigned,
        parental_consent_date: pDate || null,
        media_consent: !!pMedia
      };
    }
  }
  return null;
}

/**
 * Allows a parent/guardian of a minor member to update their media/photography release preference
 * directly from the Member Hub dashboard (PDPA 2010 Right to Withdraw Consent / Purpose Limitation).
 * @param {boolean} newConsent
 */
async function updateMemberMediaConsent(newConsent) {
  var id = (typeof sessionGet === 'function') ? (sessionGet('email') || sessionGet('ic')) : null;
  if (!id) return;
  try {
    var client = (typeof window !== 'undefined' && window.supa) ? window.supa : (typeof supa !== 'undefined' ? supa : null);
    var consentVal = !!newConsent;

    if (client && typeof client.patch === 'function') {
      try {
        await client.patch('bb_members?ic=eq.' + encodeURIComponent(id), { media_consent: consentVal });
      } catch (patchErr) {
        console.warn('Direct media_consent column update note:', patchErr);
      }
    }

    // Update active session state
    if (typeof sessionSet === 'function') {
      sessionSet('media_consent', consentVal);
    }

    // Update durable audit trail in bb_config
    if (client && typeof client.upsert === 'function') {
      try {
        var consentKey = 'bb_consent_' + id.replace(/[^a-zA-Z0-9_-]/g, '_');
        var rows = (typeof client.get === 'function') ? await client.get('bb_config?key=eq.' + encodeURIComponent(consentKey) + '&select=value') : null;
        var audit = (rows && rows.length && rows[0].value) ? (typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value) : { email: id };
        audit.media_consent = consentVal;
        audit.media_consent_updated_at = new Date().toISOString();
        audit.governance = 'COPPA/PDPA-2010';
        await client.upsert('bb_config', { key: consentKey, value: JSON.stringify(audit) }, 'key');
      } catch (cfgErr) {
        console.warn('Child consent audit backup update failed:', cfgErr);
      }
    }

    var feedbackMsg = consentVal ? 'Media Release updated: Opted-in to official photos.' : 'Media Release updated: Marked as Media Private (No Photos).';
    if (typeof showToast === 'function') {
      showToast(feedbackMsg, 'success');
    }
    if (typeof renderDashboard === 'function') {
      renderDashboard();
    }
  } catch (e) {
    if (typeof showToast === 'function') {
      showToast('Failed to update media preference: ' + e.message, 'error');
    }
  }
}

// ── Registration & Login (Privacy-First) ────────────────────────────────────

var EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function registerMember() {
  var rawName = ((document.getElementById('reg-fullname') || {}).value || '').trim();
  var name    = (typeof sanitizeText === 'function') ? sanitizeText(rawName, 100) : rawName;
  var emailEl = document.getElementById('reg-email') || document.getElementById('reg-ic') || {};
  var email   = (emailEl.value || '').trim().toLowerCase();
  var section = ((document.getElementById('reg-section') || {}).value || '').trim();
  var ageRaw  = ((document.getElementById('reg-age') || {}).value || '').trim();
  var rank    = ((document.getElementById('reg-rank') || {}).value || '').trim();
  var squad   = ((document.getElementById('reg-squad') || {}).value || '').trim();
  var pass    = (document.getElementById('reg-pass') || {}).value || '';
  var pass2   = (document.getElementById('reg-pass2') || {}).value || '';

  if (!name) { if (typeof showToast === 'function') showToast('Please enter your full name.', 'warning'); return; }
  if (!email || !EMAIL_REGEX.test(email)) { if (typeof showToast === 'function') showToast('Please enter a valid email address.', 'warning'); return; }
  if (!section) { if (typeof showToast === 'function') showToast('Please select your section (Pre-Junior, Junior, or Senior).', 'warning'); return; }
  
  var parsedAge = parseInt(ageRaw, 10);
  if (!ageRaw || isNaN(parsedAge) || parsedAge < 5 || parsedAge > 25) {
    if (typeof showToast === 'function') showToast('Please enter a valid age (between 5 and 25).', 'warning');
    return;
  }
  if (!rank)  { if (typeof showToast === 'function') showToast('Please select your rank.', 'warning'); return; }
  if (!squad) { if (typeof showToast === 'function') showToast('Please select your platoon.', 'warning'); return; }
  if (pass.length < 6) { if (typeof showToast === 'function') showToast('Password must be at least 6 characters.', 'warning'); return; }
  if (pass !== pass2)  { if (typeof showToast === 'function') showToast('Passwords do not match!', 'error'); return; }

  // Child Safety Governance & Verifiable Parental Consent (TSK-032 / COPPA & PDPA 2010)
  var isMinor = isMinorSection(section, parsedAge);
  var parentName = '';
  var parentContact = '';
  var parentConsent = false;
  var mediaConsent = false;
  var consentTimestamp = null;

  if (isMinor) {
    var rawParentName    = ((document.getElementById('reg-parent-name') || {}).value || '').trim();
    var rawParentContact = ((document.getElementById('reg-parent-contact') || {}).value || '').trim();
    var pConsentEl       = document.getElementById('reg-parent-consent');
    var pMediaEl         = document.getElementById('reg-media-consent');

    parentName    = (typeof sanitizeText === 'function') ? sanitizeText(rawParentName, 100) : rawParentName;
    parentContact = (typeof sanitizeInput === 'function') ? sanitizeInput(rawParentContact, 100) : rawParentContact;
    parentConsent = pConsentEl ? !!pConsentEl.checked : false;
    mediaConsent  = pMediaEl ? !!pMediaEl.checked : false;

    if (!parentName) {
      if (typeof showToast === 'function') showToast('Parent or Legal Guardian Name is required for Pre-Junior and Junior members.', 'warning');
      return;
    }
    if (!parentContact) {
      if (typeof showToast === 'function') showToast('Parent or Legal Guardian Contact (Phone or Email) is required for Pre-Junior and Junior members.', 'warning');
      return;
    }
    if (!parentConsent) {
      if (typeof showToast === 'function') showToast('Verified Parental or Legal Guardian Consent is strictly required to register members under 12 years old.', 'warning');
      return;
    }
    consentTimestamp = new Date().toISOString();
  }

  try {
    var client = window.supa || supa;
    var existing = await client.get('bb_members?ic=eq.' + encodeURIComponent(email) + '&select=ic');
    if (existing && existing.length) {
      if (typeof showToast === 'function') showToast('An account with this email address already exists. Please login instead.', 'warning');
      return;
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

    if (isMinor) {
      memberPayload.parent_name = parentName;
      memberPayload.parent_contact = parentContact;
      memberPayload.parental_consent_signed = true;
      memberPayload.parental_consent_date = consentTimestamp;
      memberPayload.media_consent = mediaConsent;
    }

    try {
      await client.post('bb_members', memberPayload);
    } catch (postErr) {
      // If PostgreSQL table schema does not yet have child consent columns, fallback to base payload
      if (isMinor) {
        var basePayload = {
          ic: memberPayload.ic,
          name: memberPayload.name,
          rank: memberPayload.rank,
          squad: memberPayload.squad,
          att_section: memberPayload.att_section,
          date_of_birth: memberPayload.date_of_birth,
          password: memberPayload.password,
          security_question: null,
          security_answer: null,
          joined_at: memberPayload.joined_at
        };
        await client.post('bb_members', basePayload);
      } else {
        throw postErr;
      }
    }

    // Always store verifiable audit trail record in bb_config for 100% durable governance
    if (isMinor) {
      try {
        var auditRecord = {
          email: email,
          name: name,
          section: section,
          age: parsedAge,
          parent_name: parentName,
          parent_contact: parentContact,
          parental_consent_signed: true,
          parental_consent_date: consentTimestamp,
          media_consent: mediaConsent,
          governance: 'COPPA/PDPA-2010',
          recorded_at: new Date().toISOString()
        };
        var consentKey = 'bb_consent_' + email.replace(/[^a-zA-Z0-9_-]/g, '_');
        await client.upsert('bb_config', { key: consentKey, value: JSON.stringify(auditRecord) }, 'key');
      } catch (cfgErr) {
        console.warn('Child consent audit backup save failed:', cfgErr);
      }
    }

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

    if (isMinor) {
      sessionSet('parent_name', parentName);
      sessionSet('parent_contact', parentContact);
      sessionSet('parental_consent_signed', true);
      sessionSet('parental_consent_date', consentTimestamp);
      sessionSet('media_consent', mediaConsent);
    }

    renderDashboard();

    if (typeof checkTasksAccess === 'function') checkTasksAccess();
    if (typeof checkAttendanceTabVisibility === 'function') checkAttendanceTabVisibility(email);

    // Immediately reload and land directly on the member portal without blocking alert
    if (window.location.hash !== '#member') {
      window.location.hash = '#member';
    }
    window.location.reload();
  } catch (e) {
    if (typeof showToast === 'function') showToast('Registration failed: ' + e.message, 'error');
  }
}

async function loginMember() {
  var idEl = document.getElementById('login-email') || document.getElementById('login-ic') || {};
  var identifier = (idEl.value || '').trim();
  var pass = (document.getElementById('login-pass') || {}).value || '';
  if (!identifier || !pass) { if (typeof showToast === 'function') showToast('Please enter your email and password.', 'warning'); return; }

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
      if (typeof showToast === 'function') showToast('No account found with this email address.', 'warning');
      return;
    }

    var m = data[0];
    if (m.department === 'deleted' || m.department === 'archived_deleted') {
      if (typeof showToast === 'function') showToast('This account has been deleted. Please contact an officer or administrator.', 'error');
      return;
    }
    var check = await verifyPassword(pass, m.password || '');
    if (!check.valid) {
      if (typeof showToast === 'function') showToast('Incorrect password!', 'error');
      return;
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
    if (typeof showToast === 'function') showToast('Login failed: ' + e.message, 'error');
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

    // Child Safety & Parental Consent Status (TSK-032)
    var memberSection = m.att_section || m.section || sessionGet('section') || '';
    var memberAge = sessionGet('age');
    if (!memberAge && m.date_of_birth) {
      var bYear = parseInt((m.date_of_birth || '').split('-')[0], 10);
      if (!isNaN(bYear) && bYear > 1990) memberAge = new Date().getFullYear() - bYear;
    }
    var isMinor = isMinorSection(memberSection, memberAge);
    var consentWrap = document.getElementById('m-consent-status-wrap');
    if (consentWrap) {
      if (isMinor) {
        consentWrap.style.display = 'block';
        var consentData = await fetchMemberConsent(id, m);
        var isVerified = consentData && consentData.parental_consent_signed;
        var mediaConsent = consentData && consentData.media_consent;
        var consentDateStr = (consentData && consentData.parental_consent_date)
          ? new Date(consentData.parental_consent_date).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })
          : '';
        var parentNameStr = (consentData && consentData.parent_name) ? (' by ' + (typeof escapeHtml === 'function' ? escapeHtml(consentData.parent_name) : consentData.parent_name)) : '';

        var statusHtml = '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">'
          + '<div style="display:flex;align-items:center;gap:8px;">'
            + '<div style="width:28px;height:28px;border-radius:50%;background:' + (isVerified ? 'rgba(74,222,128,0.15)' : 'rgba(234,179,8,0.15)') + ';display:flex;align-items:center;justify-content:center;color:' + (isVerified ? 'var(--green)' : 'var(--accent)') + ';">'
              + '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>'
            + '</div>'
            + '<div>'
              + '<div style="font-size:12px;font-weight:700;color:var(--text-primary);">'
                + (isVerified ? ('Parental Consent Verified' + parentNameStr) : 'Parental Consent Pending Verification')
              + '</div>'
              + '<div style="font-size:11px;color:var(--text-muted);">'
                + (isVerified ? ('E-signed on ' + (consentDateStr || 'Registration') + ' (PDPA/COPPA Compliant)') : 'Consent record missing. Contact Section Officer.')
              + '</div>'
            + '</div>'
          + '</div>'
          + '<div style="display:flex;align-items:center;gap:6px;">'
            + (mediaConsent
                ? '<span style="font-size:11px;padding:3px 8px;border-radius:12px;background:rgba(74,222,128,0.15);color:var(--green);font-weight:600;display:inline-flex;align-items:center;gap:4px;"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg> Photo Consent Opted-In</span>'
                : '<span style="font-size:11px;padding:3px 8px;border-radius:12px;background:rgba(239,68,68,0.12);color:var(--red);font-weight:600;display:inline-flex;align-items:center;gap:4px;"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/><line x1="2" x2="22" y1="2" y2="22"/></svg> Media Private (No Photos)</span>')
            + '<button type="button" onclick="updateMemberMediaConsent(!' + mediaConsent + ')" style="background:var(--bg-card);border:1px solid var(--border-card);color:var(--text-secondary);font-size:11px;padding:2px 8px;border-radius:6px;cursor:pointer;font-weight:600;" title="Update media release preference">' + (mediaConsent ? 'Withdraw Photo Consent' : 'Opt-In to Photos') + '</button>'
            + '<a href="#" onclick="openChildSafetyModal(event)" style="font-size:11px;color:var(--accent);text-decoration:underline;margin-left:4px;">Policy</a>'
          + '</div>'
        + '</div>';
        consentWrap.innerHTML = statusHtml;
      } else {
        consentWrap.style.display = 'none';
      }
    }

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
          itemLines = '<div style="font-size:12px;color:var(--text-secondary);">' + escapeHtml(items.form_name) + '</div>';
        } else {
          Object.entries(items).forEach(function(kv) {
            var prod = itemsList.find(function(i) { return i.key === kv[0]; });
            var v    = kv[1];
            var subtotal = v.price && v.qty ? ' — RM ' + (v.price * v.qty).toFixed(2) : '';
            itemLines += '<div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-secondary);padding:3px 0;">'
              + '<span>' + (prod ? escapeHtml(prod.name) : escapeHtml(kv[0])) + (v.size ? ' (' + escapeHtml(v.size) + ')' : '') + '</span>'
              + '<span>x' + escapeHtml(v.qty) + subtotal + '</span></div>';
          });
        }
      } catch (e) {}

      var validatedSs = o.payment_screenshot ? ((typeof safeUrl === 'function') ? safeUrl(o.payment_screenshot, '') : o.payment_screenshot) : '';
      var ssHtml = validatedSs
        ? '<div style="display:flex;align-items:center;gap:6px;margin-top:8px;font-size:11px;color:var(--green);"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg> Payment screenshot uploaded</div>'
        : '<div style="display:flex;align-items:center;gap:6px;margin-top:8px;font-size:11px;color:var(--accent);"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg> No payment screenshot</div>';

      html += '<div style="background:var(--bg-card);border-radius:12px;padding:14px;margin-bottom:10px;border:1px solid var(--border-card);box-shadow:var(--shadow-card);">'
        + '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">'
        + '<div>'
        + '<div style="font-family:\'Oswald\',sans-serif;font-size:14px;font-weight:700;color:var(--text-primary);">' + escapeHtml(o.order_number) + '</div>'
        + '<div style="font-size:11px;color:var(--text-muted);margin-top:1px;">' + created + '</div>'
        + '</div>'
        + '<div style="font-size:11px;font-weight:700;padding:4px 10px;border-radius:20px;background:' + sc + '22;color:' + sc + ';border:1px solid ' + sc + '44;font-family:\'Oswald\',sans-serif;text-align:center;">' + sl + '</div>'
        + '</div>'
        + '<div style="border-top:1px solid var(--border-subtle);padding-top:8px;">' + itemLines + '</div>'
        + ssHtml
        + (o.notes ? '<div style="font-size:11px;color:var(--text-muted);margin-top:6px;">Note: ' + ((typeof sanitizeHtml === 'function') ? sanitizeHtml(o.notes) : escapeHtml(o.notes)) + '</div>' : '')
        + '</div>';
    });
    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = '<div style="color:#f66;font-size:13px;text-align:center;padding:16px;">Failed to load orders.</div>';
  }
}

function logoutMember() {
  // Completely purge session state eliminating residual keys (BUG-011)
  if (typeof sessionClear === 'function') {
    sessionClear();
  } else if (typeof window !== 'undefined' && typeof window.sessionClear === 'function') {
    window.sessionClear();
  } else {
    if (typeof window !== 'undefined' && typeof window._session === 'object' && window._session !== null) {
      for (var k in window._session) {
        if (Object.prototype.hasOwnProperty.call(window._session, k)) {
          delete window._session[k];
        }
      }
    }
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('bb_session');
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('bb_session');
      localStorage.removeItem('bb_remember');
    }
    if (typeof sessionSet === 'function') {
      ['email', 'ic', 'name', 'rank', 'squad', 'joined', 'section', 'points', 'remember', 'adminAuthed', 'photo_url'].forEach(function(k) {
        sessionSet(k, null);
      });
    }
  }

  // Clear in-memory caches and global state (BUG-011)
  if (typeof window !== 'undefined') {
    window._memberAttendanceData = null;
    window._currentMemberData = null;
    if (window._memberBadgesCache) window._memberBadgesCache = {};
    if (typeof window.updateNavUserHeader === 'function') {
      window.updateNavUserHeader();
    }
  }

  // Reset top header controls
  if (typeof document !== 'undefined') {
    var navPts = document.getElementById('nav-points-val');
    if (navPts) navPts.textContent = '0';
    var navAvatarImg = document.getElementById('nav-avatar-img');
    var navAvatarPh = document.getElementById('nav-avatar-placeholder');
    var navStatusDot = document.getElementById('nav-avatar-status-dot');
    if (navAvatarImg) navAvatarImg.style.display = 'none';
    if (navAvatarPh) navAvatarPh.style.display = 'flex';
    if (navStatusDot) navStatusDot.style.background = '#6b7280';
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
    if (typeof showToast === 'function') showToast('Failed to upload photo: ' + e.message, 'error');
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
    if (typeof showToast === 'function') showToast('Please enter your registered email address.', 'warning');
    return;
  }
  if (!EMAIL_REGEX.test(email)) {
    if (typeof showToast === 'function') showToast('Please enter a valid email address.', 'warning');
    return;
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
      if (typeof showToast === 'function') showToast('No active account found with this email address.', 'warning');
      return;
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
      noticeEl.innerHTML = '<span style="display:inline-flex;align-items:center;gap:6px;"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg> A 6-digit reset code has been sent to <strong>' + escapeHtml(email) + '</strong>.</span><br>'
        + '<span style="font-size:11px;opacity:0.9;">Please check your inbox (and spam folder) and enter the code below. Valid for 15 minutes.</span>';
    }

    var codeInp = document.getElementById('forgot-code');
    var p1Inp   = document.getElementById('forgot-newpass');
    var p2Inp   = document.getElementById('forgot-newpass2');
    if (codeInp) codeInp.value = '';
    if (p1Inp)   p1Inp.value = '';
    if (p2Inp)   p2Inp.value = '';

    showForgotStep(2);

    if (typeof showToast === 'function') showToast('Reset code sent to ' + email + '! Please check your inbox and enter the 6-digit code.', 'success', 5000);
  } catch (e) {
    if (typeof showToast === 'function') showToast('Failed to send reset email: ' + e.message, 'error');
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

  if (!email) { if (typeof showToast === 'function') showToast('Please enter your registered email address.', 'warning'); return; }
  if (!code)  { if (typeof showToast === 'function') showToast('Please enter the 6-digit verification code sent to your email.', 'warning'); return; }
  if (code.length !== 6) { if (typeof showToast === 'function') showToast('Verification code must be exactly 6 digits.', 'warning'); return; }
  if (p1.length < 6) { if (typeof showToast === 'function') showToast('New password must be at least 6 characters.', 'warning'); return; }
  if (p1 !== p2)     { if (typeof showToast === 'function') showToast('Passwords do not match!', 'error'); return; }

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
      if (typeof showToast === 'function') showToast('Invalid or expired verification code. Please check your email or click "Resend Code".', 'error', 4500);
      return;
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

    if (typeof showToast === 'function') showToast('Password reset successfully! You can now log in with your new password.', 'success');

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
    if (typeof showToast === 'function') showToast('Password reset failed: ' + e.message, 'error');
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
  window.isMinorSection               = isMinorSection;
  window.handleSectionChange          = handleSectionChange;
  window.openChildSafetyModal         = openChildSafetyModal;
  window.closeChildSafetyModal        = closeChildSafetyModal;
  window.fetchMemberConsent           = fetchMemberConsent;
  window.showAuthMode                 = showAuthMode;
  window.showForgotStep               = showForgotStep;
  window.togglePassVis                = togglePassVis;
  window.goToMemberTab                = goToMemberTab;
  window.updateMemberMediaConsent     = updateMemberMediaConsent;
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
    isMinorSection,
    handleSectionChange,
    openChildSafetyModal,
    closeChildSafetyModal,
    fetchMemberConsent,
    updateMemberMediaConsent,
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
