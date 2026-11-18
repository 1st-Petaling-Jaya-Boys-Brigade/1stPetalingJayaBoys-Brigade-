/**
 * 1st Petaling Jaya Boys' Brigade Portal - E2E Test Suite
 * Tier 2: Boundary Value Analysis & Corner Cases
 * File: tests/e2e/tier2-boundary-corner.test.js
 *
 * Scope: 25 features x 5 boundary tests = 125 test specifications.
 * Covers: Boundary inputs, extreme values, injection attacks, network failures,
 * concurrency races, malformed payloads, timeout limits, and responsive constraints.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const {
  TestSuite,
  MockSupabaseServer,
  createDOMSandbox,
  createPortalContext,
  grantPortalAdminSession,
  expect
} = require('./harness');

const REPO_ROOT = path.resolve(__dirname, '../..');

const suite = new TestSuite('Tier 2: Boundary & Corner Cases', { tier: 2 });
const server = new MockSupabaseServer();
const sandbox = createDOMSandbox();

suite.before(async () => {
  await server.start();
  process.env.VITE_SUPABASE_URL = server.url;
});

suite.after(async () => {
  sandbox.reset();
  await server.stop();
});

suite.beforeEach(() => {
  server.resetDatabase();
  sandbox.reset();
});

suite.afterEach(() => {
  sandbox.reset();
});

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 1: RLS Policy Hardening (SEC-01)
// ─────────────────────────────────────────────────────────────────────────────

suite.test('T2-F01-01 [SEC-01]: Mass deletion injection with neq/not.is.null filter rejected for anon', async () => {
  const res = await fetch(`${server.url}/rest/v1/bb_members?id=neq.0`, {
    method: 'DELETE',
    headers: { apikey: 'anon_test_key' }
  });
  expect(res.status).toBe(403);
  expect(server.db.bb_members.length).toBeGreaterThan(0);
}, { featureId: 'SEC-01', tier: 2 });

suite.test('T2-F01-02 [SEC-01]: Forged authorization header with invalid JWT format rejected with 401/403', async () => {
  const res = await fetch(`${server.url}/rest/v1/bb_orders?id=eq.101`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      apikey: 'anon_test_key',
      Authorization: 'Bearer eyJhbGciOiJub25lIn0.eyJzdWIiOiIxIn0.'
    },
    body: JSON.stringify({ status: 'cancelled' })
  });
  expect([401, 403]).toContain(res.status);
}, { featureId: 'SEC-01', tier: 2 });

suite.test('T2-F01-03 [SEC-01]: Empty string ID deletion fails safely without cascading', async () => {
  const res = await fetch(`${server.url}/rest/v1/bb_tasks?id=eq.`, {
    method: 'DELETE',
    headers: { apikey: 'anon_test_key' }
  });
  expect(res.status).toBe(403);
  expect(server.db.bb_tasks.length).toBe(2);
}, { featureId: 'SEC-01', tier: 2 });

suite.test('T2-F01-04 [SEC-01]: SQL injection string in query filter rejected cleanly', async () => {
  const res = await fetch(`${server.url}/rest/v1/bb_announcements?id=eq.1;DROP%20TABLE%20bb_announcements;--`, {
    headers: { apikey: 'anon_test_key' }
  });
  expect(res.status).toBe(200);
  const rows = await res.json();
  expect(rows.length).toBe(0);
  expect(server.db.bb_announcements.length).toBe(2);
}, { featureId: 'SEC-01', tier: 2 });

suite.test('T2-F01-05 [SEC-01]: Direct DELETE on private storage bucket files rejected for anon', async () => {
  const res = await fetch(`${server.url}/storage/v1/object/private-docs/manual.pdf`, {
    method: 'DELETE',
    headers: { apikey: 'anon_test_key' }
  });
  expect(res.status).toBe(403);
}, { featureId: 'SEC-01', tier: 2 });

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 2: Password Column & OTP Protection (SEC-02)
// ─────────────────────────────────────────────────────────────────────────────

suite.test('T2-F02-01 [SEC-02]: Empty credentials in rpc_authenticate_member returns 400 Bad Request', async () => {
  const res = await fetch(`${server.url}/rest/v1/rpc/rpc_authenticate_member`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: 'anon_test_key' },
    body: JSON.stringify({ p_email: '', p_password_hash: '' })
  });
  expect(res.status).toBe(400);
  const data = await res.json();
  expect(data.success).toBe(false);
}, { featureId: 'SEC-02', tier: 2 });

suite.test('T2-F02-02 [SEC-02]: Non-existent email to rpc_get_auth_salt returns consistent pseudo-salt', async () => {
  const res = await fetch(`${server.url}/rest/v1/rpc/rpc_get_auth_salt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: 'anon_test_key' },
    body: JSON.stringify({ p_email: 'nonexistent_account@domain.test' })
  });
  expect(res.status).toBe(200);
  const data = await res.json();
  expect(data.found).toBe(false);
  expect(data.salt.length).toBe(64);
}, { featureId: 'SEC-02', tier: 2 });

suite.test('T2-F02-03 [SEC-02]: OTP brute force 5-attempt limit locks out token', async () => {
  await fetch(`${server.url}/rest/v1/rpc/rpc_request_password_reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: 'anon_test_key' },
    body: JSON.stringify({ p_email: 'robert@1stpjbb.org', p_otp_code: '112233' })
  });

  for (let i = 0; i < 5; i++) {
    await fetch(`${server.url}/rest/v1/rpc/rpc_verify_otp_and_reset_password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: 'anon_test_key' },
      body: JSON.stringify({ p_email: 'robert@1stpjbb.org', p_otp_code: '000000', p_new_password_hash: 'new_hash' })
    });
  }

  const res = await fetch(`${server.url}/rest/v1/rpc/rpc_verify_otp_and_reset_password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: 'anon_test_key' },
    body: JSON.stringify({ p_email: 'robert@1stpjbb.org', p_otp_code: '112233', p_new_password_hash: 'new_hash' })
  });
  expect(res.status).toBe(400);
  const data = await res.json();
  expect(data.success).toBe(false);
}, { featureId: 'SEC-02', tier: 2 });

suite.test('T2-F02-04 [SEC-02]: Expired OTP token boundary (>15 minutes) rejected on verification', async () => {
  const expiredEmail = 'lucas@1stpjbb.org';
  server.db.bb_password_resets.push({
    email: expiredEmail,
    otp_hash: crypto.createHash('sha256').update('999888').digest('hex'),
    attempts: 0,
    max_attempts: 5,
    used: false,
    expires_at: Date.now() - 1000
  });

  const res = await fetch(`${server.url}/rest/v1/rpc/rpc_verify_otp_and_reset_password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: 'anon_test_key' },
    body: JSON.stringify({ p_email: expiredEmail, p_otp_code: '999888', p_new_password_hash: 'new_hash' })
  });
  expect(res.status).toBe(400);
  const data = await res.json();
  expect(data.error.includes('expired')).toBe(true);
}, { featureId: 'SEC-02', tier: 2 });

suite.test('T2-F02-05 [SEC-02]: Anonymous query for bb_reset_otp_% returns empty while admin can inspect', async () => {
  const anonRes = await fetch(`${server.url}/rest/v1/bb_config?key=like.bb_reset_otp_%`, {
    headers: { apikey: 'anon_test_key' }
  });
  expect(anonRes.status).toBe(200);
  expect(await anonRes.json()).toEqual([]);

  const adminRes = await fetch(`${server.url}/rest/v1/bb_config?key=like.bb_reset_otp_%`, {
    headers: { apikey: 'anon_test_key', Authorization: 'Bearer officer_admin_token' }
  });
  expect(adminRes.status).toBe(200);
  const adminRows = await adminRes.json();
  expect(adminRows.some(r => r.key.startsWith('bb_reset_otp_'))).toBe(true);
}, { featureId: 'SEC-02', tier: 2 });

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 3: Session Spoofing & Route Guard (SEC-03)
// ─────────────────────────────────────────────────────────────────────────────

suite.test('T2-F03-01 [SEC-03]: Null token passed to rpc_verify_admin_session returns 400 Bad Request', async () => {
  const res = await fetch(`${server.url}/rest/v1/rpc/rpc_verify_admin_session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: 'anon_test_key' },
    body: JSON.stringify({ p_token: null })
  });
  expect(res.status).toBe(400);
  const data = await res.json();
  expect(data.valid).toBe(false);
}, { featureId: 'SEC-03', tier: 2 });

suite.test('T2-F03-02 [SEC-03]: Admin session token expired at 2 hours and 1ms is rejected', async () => {
  const expiredToken = 'admin_sess_expired_123';
  server.db.bb_admin_sessions.push({
    token: expiredToken,
    email: 'officer@1stpjbb.org',
    role: 'officer_admin',
    expires_at: Date.now() - 10
  });

  const res = await fetch(`${server.url}/rest/v1/rpc/rpc_verify_admin_session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: 'anon_test_key' },
    body: JSON.stringify({ p_token: expiredToken })
  });
  expect(res.status).toBe(200);
  const data = await res.json();
  expect(data.valid).toBe(false);
}, { featureId: 'SEC-03', tier: 2 });

suite.test('T2-F03-03 [SEC-03]: Real session.js verifyActiveMemberSession preserves offline grace state on 500 error', async () => {
  const portal = createPortalContext({ server, sandbox });
  try {
    portal.ctx.sessionSet('ic', '010101-14-1234', { localOnly: true });
    portal.ctx.sessionSet('email', 'robert@1stpjbb.org', { localOnly: true });
    portal.ctx.sessionSet('session_token', 'valid_member_token', { localOnly: true });
    server.mockRoute('/rest/v1/bb_members', { status: 500, data: { message: 'Gateway down' } });

    const valid = await portal.ctx.verifyActiveMemberSession(true);
    expect(valid).toBe(true);
    expect(portal.ctx.sessionGet('ic')).toBe('010101-14-1234');
  } finally {
    portal.dispose();
  }
}, { featureId: 'SEC-03', tier: 2 });

suite.test('T2-F03-04 [SEC-03]: Real session.js auto-purges Remember Me session older than 14 days on load', () => {
  const fourteenDaysMs = 14 * 24 * 3600 * 1000;
  sandbox.localStorage.setItem(
    'bb_session',
    JSON.stringify({
      ic: '010101-14-1234',
      _session_saved_at: Date.now() - (fourteenDaysMs + 5000)
    })
  );

  const portal = createPortalContext({ server, sandbox });
  try {
    expect(portal.ctx.isRememberMeExpired(Date.now() - (fourteenDaysMs + 5000))).toBe(true);
    expect(sandbox.localStorage.getItem('bb_session')).toBeNull();
    expect(portal.ctx.sessionGet('ic')).toBeNull();
  } finally {
    portal.dispose();
  }
}, { featureId: 'SEC-03', tier: 2 });

suite.test('T2-F03-05 [SEC-03]: Real session.js signOutEverywhere revokes remote sessions and clears storage', async () => {
  const portal = createPortalContext({ server, sandbox });
  try {
    server.memberSessions.set('tok_user_1', { ic: '010101-14-1234', email: 'robert@1stpjbb.org', role: 'member' });
    portal.ctx.sessionSet('ic', '010101-14-1234', { localOnly: true });
    portal.ctx.sessionSet('email', 'robert@1stpjbb.org', { localOnly: true });
    portal.ctx.sessionSet('session_token', 'tok_user_1', { localOnly: true });

    const res = await portal.ctx.signOutEverywhere();
    expect(res.success).toBe(true);
    expect(portal.ctx.sessionGet('ic')).toBeNull();
    expect(sandbox.localStorage.getItem('bb_session')).toBeNull();
    const rpcHits = server.getRequests(r => r.pathname.includes('rpc_sign_out_everywhere'));
    expect(rpcHits.length).toBeGreaterThan(0);
  } finally {
    portal.dispose();
  }
}, { featureId: 'SEC-03', tier: 2 });

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 4: Stored XSS Elimination (SEC-04)
// ─────────────────────────────────────────────────────────────────────────────

suite.test('T2-F04-01 [SEC-04]: Real utils.js escapeHtml neutralizes polyglot XSS payload', () => {
  const portal = createPortalContext({ server, sandbox, coreModules: ['js/core/utils.js'] });
  try {
    const polyglot = `"><script>alert('XSS')</script><svg onload=alert(1)>`;
    const sanitized = portal.ctx.escapeHtml(polyglot);
    expect(sanitized.includes('<script>')).toBe(false);
    expect(sanitized.includes('<svg')).toBe(false);
    expect(sanitized.includes('&lt;script&gt;')).toBe(true);
  } finally {
    portal.dispose();
  }
}, { featureId: 'SEC-04', tier: 2 });

suite.test('T2-F04-02 [SEC-04]: Real utils.js sanitizeHtml strips script/onerror while preserving safe <b>', () => {
  const portal = createPortalContext({ server, sandbox, coreModules: ['js/core/utils.js'] });
  try {
    const dirty = '<script>x()</script><b>bold</b><img src=x onerror=alert(1)>';
    const clean = portal.ctx.sanitizeHtml(dirty);
    expect(clean.includes('<script>')).toBe(false);
    expect(clean.includes('<img')).toBe(false);
    expect(clean.includes('<b>bold</b>')).toBe(true);
  } finally {
    portal.dispose();
  }
}, { featureId: 'SEC-04', tier: 2 });

suite.test('T2-F04-03 [SEC-04]: Real utils.js safeUrl blocks javascript: pseudo-protocol case-insensitively', () => {
  const portal = createPortalContext({ server, sandbox, coreModules: ['js/core/utils.js'] });
  try {
    expect(portal.ctx.safeUrl('javascript:alert(document.cookie)')).toBe('#');
    expect(portal.ctx.safeUrl('JAVASCRIPT:void(0)')).toBe('#');
    expect(portal.ctx.safeUrl('https://1stpjbb.org/docs/manual.pdf')).toBe('https://1stpjbb.org/docs/manual.pdf');
  } finally {
    portal.dispose();
  }
}, { featureId: 'SEC-04', tier: 2 });

suite.test('T2-F04-04 [SEC-04]: Real utils.js safeUrl blocks SVG data URI with script and returns #', () => {
  const portal = createPortalContext({ server, sandbox, coreModules: ['js/core/utils.js'] });
  try {
    expect(portal.ctx.safeUrl('data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+')).toBe('#');
    expect(portal.ctx.safeUrl('data:text/html,<script>alert(1)</script>')).toBe('#');
  } finally {
    portal.dispose();
  }
}, { featureId: 'SEC-04', tier: 2 });

suite.test('T2-F04-05 [SEC-04]: Real utils.js sanitizeInput strips null bytes, control chars, and enforces maxLength', () => {
  const portal = createPortalContext({ server, sandbox, coreModules: ['js/core/utils.js'] });
  try {
    expect(portal.ctx.sanitizeInput('  John\x00Doe\x1F  ')).toBe('JohnDoe');
    expect(portal.ctx.sanitizeInput('abcdef', 3)).toBe('abc');
  } finally {
    portal.dispose();
  }
}, { featureId: 'SEC-04', tier: 2 });

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 5: IDOR & Form/Order Protection (SEC-05)
// ─────────────────────────────────────────────────────────────────────────────

suite.test('T2-F05-01 [SEC-05]: session.js sanitizePostgrestFilterParam + MockSupabaseServer blocks filter injection IDOR', async () => {
  const portal = createPortalContext({ server, sandbox });
  try {
    const injected = '010101-14-1234),ic.eq.(020202-10-5678';
    const clean = portal.ctx.sanitizePostgrestFilterParam(injected);
    expect(clean.includes('(')).toBe(false);
    expect(clean.includes(')')).toBe(false);
    expect(clean.includes(',')).toBe(false);

    const res = await fetch(`${server.url}/rest/v1/bb_orders?ic=eq.${clean}`, {
      headers: { apikey: 'anon_test_key', Authorization: 'Bearer member_A_token' }
    });
    expect(res.status).toBe(200);
    const rows = await res.json();
    expect(rows.some(r => r.ic === '020202-10-5678')).toBe(false);
  } finally {
    portal.dispose();
  }
}, { featureId: 'SEC-05', tier: 2 });

suite.test('T2-F05-02 [SEC-05]: Empty order_number query parameter returns empty array', async () => {
  const res = await fetch(`${server.url}/rest/v1/bb_orders?order_number=eq.`, {
    headers: { apikey: 'anon_test_key' }
  });
  expect(res.status).toBe(200);
  const rows = await res.json();
  expect(rows).toEqual([]);
}, { featureId: 'SEC-05', tier: 2 });

suite.test('T2-F05-03 [SEC-05]: Real orders.js validateOrderCart rejects zero/negative quantities and invalid sizes', () => {
  const portal = createPortalContext({ server, sandbox, modules: ['js/modules/orders.js'] });
  try {
    expect(portal.ctx.validateOrderCart(null, { shirt: 0 }, {}).valid).toBe(false);
    expect(portal.ctx.validateOrderCart(null, { shirt: -2 }, { shirt: 'M' }).valid).toBe(false);
    expect(portal.ctx.validateOrderCart(null, { shirt: 1 }, { shirt: 'NONEXISTENT_SIZE' }).valid).toBe(false);
    expect(portal.ctx.validateOrderCart(null, { shirt: 1 }, { shirt: 'M' }).valid).toBe(true);
  } finally {
    portal.dispose();
  }
}, { featureId: 'SEC-05', tier: 2 });

suite.test('T2-F05-04 [SEC-05]: Deleting non-existent order number handles safely without crash', async () => {
  const res = await fetch(`${server.url}/rest/v1/bb_orders?order_number=eq.ORD-999999`, {
    method: 'DELETE',
    headers: { apikey: 'anon_test_key', Authorization: 'Bearer admin_token' }
  });
  expect(res.status).toBe(200);
  const data = await res.json();
  expect(data).toEqual([]);
}, { featureId: 'SEC-05', tier: 2 });

suite.test('T2-F05-05 [SEC-05]: Duplicate order_number POST to MockSupabaseServer returns 409 unique violation', async () => {
  const res = await fetch(`${server.url}/rest/v1/bb_orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: 'anon_test_key' },
    body: JSON.stringify({ order_number: 'ORD-1001', ic: '010101-14-1234', total_amount: 45.0 })
  });
  expect(res.status).toBe(409);
  const err = await res.json();
  expect(err.code).toBe('23505');
}, { featureId: 'SEC-05', tier: 2 });

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 6: Sync Secret Protection (SEC-06)
// ─────────────────────────────────────────────────────────────────────────────

suite.test('T2-F06-01 [SEC-06]: Case-insensitive query ilike.%SECRET% blocked for anon and visible to admin', async () => {
  const anonRes = await fetch(`${server.url}/rest/v1/bb_config?key=ilike.%SECRET%`, {
    headers: { apikey: 'anon_test_key' }
  });
  expect(anonRes.status).toBe(200);
  expect(await anonRes.json()).toEqual([]);

  const adminRes = await fetch(`${server.url}/rest/v1/bb_config?key=ilike.%SHEET%`, {
    headers: { apikey: 'anon_test_key', Authorization: 'Bearer officer_admin_token' }
  });
  expect(adminRes.status).toBe(200);
  const adminRows = await adminRes.json();
  expect(adminRows.some(r => r.key === 'bb_master_sheet_config')).toBe(true);
}, { featureId: 'SEC-06', tier: 2 });

suite.test('T2-F06-02 [SEC-06]: URL-encoded key query evaluated safely and blocked for anon', async () => {
  const res = await fetch(`${server.url}/rest/v1/bb_config?key=eq.bb_master_sheet_%63onfig`, {
    headers: { apikey: 'anon_test_key' }
  });
  expect(res.status).toBe(200);
  const rows = await res.json();
  expect(rows).toEqual([]);
}, { featureId: 'SEC-06', tier: 2 });

suite.test('T2-F06-03 [SEC-06]: Anonymous POST write to sync config row is rejected with 403', async () => {
  const res = await fetch(`${server.url}/rest/v1/bb_config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: 'anon_test_key' },
    body: JSON.stringify({ key: 'bb_master_sheet_config', value: '{}' })
  });
  expect(res.status).toBe(403);
}, { featureId: 'SEC-06', tier: 2 });

suite.test('T2-F06-04 [SEC-06]: Blank key parameter query returns empty array safely', async () => {
  const res = await fetch(`${server.url}/rest/v1/bb_config?key=eq.`, {
    headers: { apikey: 'anon_test_key' }
  });
  expect(res.status).toBe(200);
  const rows = await res.json();
  expect(rows).toEqual([]);
}, { featureId: 'SEC-06', tier: 2 });

suite.test('T2-F06-05 [SEC-06]: Real sheets.js loadMasterSheetConfig as anon never leaks server sync secrets', async () => {
  const portal = createPortalContext({ server, sandbox, modules: ['js/api/sheets.js'] });
  try {
    portal.ctx.sessionSet('ic', '010101-14-1234', { localOnly: true });
    const cfg = await portal.ctx.loadMasterSheetConfig();
    expect(JSON.stringify(cfg).includes('SHEETS_SYNC_SECRET')).toBe(false);
    expect((sandbox.localStorage.getItem('bb_session') || '').includes('SHEETS_SYNC_SECRET')).toBe(false);
  } finally {
    portal.dispose();
  }
}, { featureId: 'SEC-06', tier: 2 });

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 7: Mutation Concurrency & Sanitation (SEC-07)
// ─────────────────────────────────────────────────────────────────────────────

suite.test('T2-F07-01 [SEC-07]: Real session.js sanitizePostgrestFilterParam escapes complex email punctuation', () => {
  const portal = createPortalContext({ server, sandbox });
  try {
    const input = 'test.user+alias@bb(pj1),org';
    const clean = portal.ctx.sanitizePostgrestFilterParam(input);
    expect(clean.includes('(')).toBe(false);
    expect(clean.includes(')')).toBe(false);
    expect(clean.includes(',')).toBe(false);
    expect(clean.includes('.')).toBe(false);
  } finally {
    portal.dispose();
  }
}, { featureId: 'SEC-07', tier: 2 });

suite.test('T2-F07-02 [SEC-07]: Rapid 10-click stress test on real tasks.js saveTask dispatches exactly 1 POST', async () => {
  const portal = createPortalContext({
    server,
    sandbox,
    supaKey: 'officer_admin_token',
    modules: ['js/modules/admin.js', 'js/modules/tasks.js']
  });
  try {
    grantPortalAdminSession(portal, server);
    const titleEl = sandbox.document.createElement('input');
    titleEl.id = 'task-title';
    titleEl.value = 'Stress Burst Task';
    const deptEl = sandbox.document.createElement('input');
    deptEl.id = 'task-dept';
    deptEl.value = 'Seniors';
    sandbox.document.body.appendChild(titleEl);
    sandbox.document.body.appendChild(deptEl);

    await Promise.all(Array.from({ length: 10 }, () => portal.ctx.saveTask()));
    const posts = server.getRequests(r => r.method === 'POST' && r.pathname === '/rest/v1/bb_tasks');
    expect(posts.length).toBe(1);
  } finally {
    portal.dispose();
  }
}, { featureId: 'SEC-07', tier: 2 });

suite.test('T2-F07-03 [SEC-07]: Real supabase.js throttledFetch rejects aborted request and frees concurrency slot', async () => {
  const portal = createPortalContext({ server, sandbox });
  try {
    const ac = new AbortController();
    ac.abort();
    await expect(
      portal.ctx.supa.throttledFetch(`${server.url}/rest/v1/bb_tasks`, { signal: ac.signal })
    ).rejects.toThrow();

    // Confirm subsequent fetch succeeds (slot freed)
    const rows = await portal.ctx.supa.get('bb_tasks');
    expect(Array.isArray(rows)).toBe(true);
  } finally {
    portal.dispose();
  }
}, { featureId: 'SEC-07', tier: 2 });

suite.test('T2-F07-04 [SEC-07]: Real tasks.js saveTask rejects whitespace-only task title before network dispatch', async () => {
  const portal = createPortalContext({
    server,
    sandbox,
    supaKey: 'officer_admin_token',
    modules: ['js/modules/admin.js', 'js/modules/tasks.js']
  });
  try {
    grantPortalAdminSession(portal, server);
    const titleEl = sandbox.document.createElement('input');
    titleEl.id = 'task-title';
    titleEl.value = '    ';
    const deptEl = sandbox.document.createElement('input');
    deptEl.id = 'task-dept';
    deptEl.value = 'Seniors';
    sandbox.document.body.appendChild(titleEl);
    sandbox.document.body.appendChild(deptEl);

    await portal.ctx.saveTask();
    const posts = server.getRequests(r => r.method === 'POST' && r.pathname === '/rest/v1/bb_tasks');
    expect(posts.length).toBe(0);
  } finally {
    portal.dispose();
  }
}, { featureId: 'SEC-07', tier: 2 });

suite.test('T2-F07-05 [SEC-07]: Real tasks.js saveTask truncates >200 char task title via sanitizeText', async () => {
  const portal = createPortalContext({
    server,
    sandbox,
    supaKey: 'officer_admin_token',
    modules: ['js/modules/admin.js', 'js/modules/tasks.js']
  });
  try {
    grantPortalAdminSession(portal, server);
    const titleEl = sandbox.document.createElement('input');
    titleEl.id = 'task-title';
    titleEl.value = 'Inspection Meeting '.repeat(20);
    const deptEl = sandbox.document.createElement('input');
    deptEl.id = 'task-dept';
    deptEl.value = 'Seniors';
    sandbox.document.body.appendChild(titleEl);
    sandbox.document.body.appendChild(deptEl);

    await portal.ctx.saveTask();
    const posts = server.getRequests(r => r.method === 'POST' && r.pathname === '/rest/v1/bb_tasks');
    expect(posts.length).toBe(1);
    expect(posts[0].body.title.length).toBe(200);
  } finally {
    portal.dispose();
  }
}, { featureId: 'SEC-07', tier: 2 });

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 8: Startup Waterfall & Batch Config (PERF-01)
// ─────────────────────────────────────────────────────────────────────────────

suite.test('T2-F08-01 [PERF-01]: Real supa.batchConfigGet([]) returns empty object with 0 HTTP calls', async () => {
  const portal = createPortalContext({ server, sandbox });
  try {
    server.requestLog = [];
    const res = await portal.ctx.supa.batchConfigGet([]);
    expect(JSON.stringify(res)).toBe('{}');
    expect(server.requestLog.length).toBe(0);
  } finally {
    portal.dispose();
  }
}, { featureId: 'PERF-01', tier: 2 });

suite.test('T2-F08-02 [PERF-01]: Real supa.batchConfigGet hydrates snapshot in 1 query even with large key array', async () => {
  const portal = createPortalContext({ server, sandbox });
  try {
    const keys = Array.from({ length: 20 }, () => 'bb_company_calendar');
    const res = await portal.ctx.supa.batchConfigGet(keys);
    expect(Array.isArray(res.bb_company_calendar)).toBe(true);
    expect(Array.isArray(portal.ctx.supa.getConfigSnapshot('bb_company_calendar'))).toBe(true);
    expect(server.getRequests(r => r.pathname === '/rest/v1/bb_config').length).toBe(1);
  } finally {
    portal.dispose();
  }
}, { featureId: 'PERF-01', tier: 2 });

suite.test('T2-F08-03 [PERF-01]: Real supa.safeConfigGet returns cached snapshot when network fails with 500', async () => {
  const portal = createPortalContext({ server, sandbox });
  try {
    await portal.ctx.supa.batchConfigGet(['bb_company_calendar']);
    server.mockRoute('/rest/v1/bb_config', { status: 500, data: { message: 'DB error' } });
    const cached = await portal.ctx.supa.safeConfigGet('bb_company_calendar');
    expect(Array.isArray(cached)).toBe(true);
    expect(cached[0].title).toBe('Parade');
  } finally {
    portal.dispose();
  }
}, { featureId: 'PERF-01', tier: 2 });

suite.test('T2-F08-04 [PERF-01]: Real supa.batchConfigGet URL-encodes keys with spaces and punctuation', async () => {
  const portal = createPortalContext({ server, sandbox });
  try {
    await portal.ctx.supa.batchConfigGet(['key with space', 'key.dot']);
    const reqs = server.getRequests(r => r.pathname === '/rest/v1/bb_config');
    expect(reqs.length).toBe(1);
    expect(reqs[0].url.includes('key%20with%20space')).toBe(true);
  } finally {
    portal.dispose();
  }
}, { featureId: 'PERF-01', tier: 2 });

suite.test('T2-F08-05 [PERF-01]: Real supa.getConfig handles plain non-JSON string value without throwing', async () => {
  server.db.bb_config.plain_test_key = 'plain_string_value';
  const portal = createPortalContext({ server, sandbox });
  try {
    const val = await portal.ctx.supa.getConfig('plain_test_key');
    expect(val).toBe('plain_string_value');
  } finally {
    portal.dispose();
  }
}, { featureId: 'PERF-01', tier: 2 });

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 9: Unbounded Queries & Pagination (PERF-02)
// ─────────────────────────────────────────────────────────────────────────────

suite.test('T2-F09-01 [PERF-02]: Pagination offset overflow (page 10000) returns clean empty array', async () => {
  const res = await fetch(`${server.url}/rest/v1/bb_tasks?limit=20&offset=200000`, {
    headers: { apikey: 'anon_test_key' }
  });
  expect(res.status).toBe(200);
  const rows = await res.json();
  expect(rows).toEqual([]);
}, { featureId: 'PERF-02', tier: 2 });

suite.test('T2-F09-02 [PERF-02]: Real supa.paginate clamps negative/zero page and pageSize safely', async () => {
  const portal = createPortalContext({ server, sandbox });
  try {
    const resNeg = await portal.ctx.supa.paginate('bb_tasks', { page: -5, pageSize: -10 });
    expect(resNeg.page).toBe(1);
    expect(resNeg.pageSize).toBe(1);
    expect(resNeg.offset).toBe(0);

    const resZero = await portal.ctx.supa.paginate('bb_tasks', { page: 0, pageSize: 0 });
    expect(resZero.page).toBe(1);
    expect(resZero.pageSize).toBe(20);
  } finally {
    portal.dispose();
  }
}, { featureId: 'PERF-02', tier: 2 });

suite.test('T2-F09-03 [PERF-02]: Sequential supa.paginate pages send distinct offset=0 and offset=2 queries', async () => {
  for (let i = 3; i <= 5; i++) {
    server.db.bb_tasks.push({ id: `task-${i}`, title: `T${i}`, department: 'Seniors', status: 'pending' });
  }
  const portal = createPortalContext({ server, sandbox });
  try {
    const p1 = await portal.ctx.supa.paginate('bb_tasks', { page: 1, pageSize: 2 });
    const p2 = await portal.ctx.supa.paginate('bb_tasks', { page: 2, pageSize: 2 });
    expect(p1.offset).toBe(0);
    expect(p2.offset).toBe(2);
    expect(p1.data[0].id).not.toBe(p2.data[0].id);
  } finally {
    portal.dispose();
  }
}, { featureId: 'PERF-02', tier: 2 });

suite.test('T2-F09-04 [PERF-02]: Real supa.paginate at exact page multiple boundary (20/20) sets hasMore=false', async () => {
  for (let i = 3; i <= 20; i++) {
    server.db.bb_tasks.push({ id: `task-${i}`, title: `T${i}`, department: 'Seniors', status: 'pending' });
  }
  const portal = createPortalContext({ server, sandbox });
  try {
    const res = await portal.ctx.supa.paginate('bb_tasks', { page: 1, pageSize: 20 });
    expect(res.data.length).toBe(20);
    expect(res.total).toBe(20);
    expect(res.hasMore).toBe(false);
  } finally {
    portal.dispose();
  }
}, { featureId: 'PERF-02', tier: 2 });

suite.test('T2-F09-05 [PERF-02]: Real supa.paginate clamps excessive pageSize=5000 to max 100', async () => {
  const portal = createPortalContext({ server, sandbox });
  try {
    const res = await portal.ctx.supa.paginate('bb_tasks', { page: 1, pageSize: 5000 });
    expect(res.pageSize).toBe(100);
    const reqs = server.getRequests(r => r.pathname === '/rest/v1/bb_tasks');
    expect(reqs[0].searchParams.get('limit')).toBe('100');
  } finally {
    portal.dispose();
  }
}, { featureId: 'PERF-02', tier: 2 });

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 10: Gallery Signed URL Batching (PERF-03)
// ─────────────────────────────────────────────────────────────────────────────

suite.test('T2-F10-01 [PERF-03]: Real throttledFetch processes 25 parallel requests within MAX_CONCURRENT_REQUESTS=12', async () => {
  const portal = createPortalContext({ server, sandbox });
  try {
    expect(portal.ctx.supa.MAX_CONCURRENT_REQUESTS).toBe(12);
    let inFlight = 0;
    let maxSeen = 0;
    server.mockRoute('/rest/v1/bb_gallery', async (_req, res) => {
      inFlight++;
      if (inFlight > maxSeen) maxSeen = inFlight;
      await new Promise(r => setTimeout(r, 15));
      inFlight--;
      server._sendJson(res, 200, []);
    });

    const results = await Promise.all(
      Array.from({ length: 25 }, () => portal.ctx.supa.throttledFetch(`${server.url}/rest/v1/bb_gallery`))
    );
    expect(results.length).toBe(25);
    expect(maxSeen).toBeLessThanOrEqual(12);
  } finally {
    portal.dispose();
  }
}, { featureId: 'PERF-03', tier: 2 });

suite.test('T2-F10-02 [PERF-03]: Real supa.createSignedUrls returns graceful fallback objects on HTTP 500', async () => {
  const portal = createPortalContext({ server, sandbox });
  try {
    server.mockRoute('/storage/v1/object/sign/gallery', { status: 500, data: { message: 'Sign fail' } });
    const items = await portal.ctx.supa.createSignedUrls('gallery', ['a.jpg', 'b.jpg']);
    expect(items.length).toBe(2);
    expect(items[0].signedUrl).toBeNull();
    expect(items[0].error).not.toBeNull();
  } finally {
    portal.dispose();
  }
}, { featureId: 'PERF-03', tier: 2 });

suite.test('T2-F10-03 [PERF-03]: Real throttledFetch rejects immediately with AbortError on pre-aborted signal', async () => {
  const portal = createPortalContext({ server, sandbox });
  try {
    const ac = new AbortController();
    ac.abort();
    let errName = '';
    try {
      await portal.ctx.supa.throttledFetch(`${server.url}/rest/v1/bb_gallery`, { signal: ac.signal });
    } catch (e) {
      errName = e.name || '';
    }
    expect(errName).toBe('AbortError');
  } finally {
    portal.dispose();
  }
}, { featureId: 'PERF-03', tier: 2 });

suite.test('T2-F10-04 [PERF-03]: Real gallery.js normalizeMediaUrl rejects null/undefined/javascript: URLs', () => {
  const portal = createPortalContext({ server, sandbox, modules: ['js/modules/gallery.js'] });
  try {
    expect(portal.ctx.normalizeMediaUrl(null)).toBe('');
    expect(portal.ctx.normalizeMediaUrl(undefined)).toBe('');
    expect(portal.ctx.normalizeMediaUrl('javascript:alert(1)')).toBe('');
  } finally {
    portal.dispose();
  }
}, { featureId: 'PERF-03', tier: 2 });

suite.test('T2-F10-05 [PERF-03]: Offline navigator.onLine=false causes supa.post to fail fast without network call', async () => {
  const portal = createPortalContext({
    server,
    sandbox,
    navigator: { onLine: false }
  });
  try {
    let errCode = null;
    try {
      await portal.ctx.supa.post('bb_tasks', { title: 'Offline Task' });
    } catch (e) {
      errCode = e.code;
    }
    expect(errCode).toBe('offline');
    expect(server.getRequests(r => r.pathname === '/rest/v1/bb_tasks').length).toBe(0);
  } finally {
    portal.dispose();
  }
}, { featureId: 'PERF-03', tier: 2 });

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 11: Loading Skeletons (UX-01)
// ─────────────────────────────────────────────────────────────────────────────

suite.test('T2-F11-01 [UX-01]: Real loading.js renderSkeletonCard(0, order) safely clamps count', () => {
  const portal = createPortalContext({ server, sandbox, coreModules: ['js/core/utils.js', 'js/core/loading.js'] });
  try {
    const html = portal.ctx.renderSkeletonCard(0, 'order');
    const wrapper = sandbox.document.createElement('div');
    wrapper.innerHTML = html;
    expect(wrapper.querySelectorAll('.skeleton-order-card').length).toBeGreaterThanOrEqual(1);
  } finally {
    portal.dispose();
  }
}, { featureId: 'UX-01', tier: 2 });

suite.test('T2-F11-02 [UX-01]: Real loading.js renderSkeletonCard(-10, badge) renders >= 1 card cleanly', () => {
  const portal = createPortalContext({ server, sandbox, coreModules: ['js/core/utils.js', 'js/core/loading.js'] });
  try {
    const html = portal.ctx.renderSkeletonCard(-10, 'badge');
    const wrapper = sandbox.document.createElement('div');
    wrapper.innerHTML = html;
    expect(wrapper.querySelectorAll('.skeleton-shimmer').length).toBeGreaterThanOrEqual(1);
  } finally {
    portal.dispose();
  }
}, { featureId: 'UX-01', tier: 2 });

suite.test('T2-F11-03 [UX-01]: Real loading.js renderSkeletonCard handles unknown type without throwing', () => {
  const portal = createPortalContext({ server, sandbox, coreModules: ['js/core/utils.js', 'js/core/loading.js'] });
  try {
    const html = portal.ctx.renderSkeletonCard(1, 'unknown_custom_widget');
    expect(typeof html).toBe('string');
  } finally {
    portal.dispose();
  }
}, { featureId: 'UX-01', tier: 2 });

suite.test('T2-F11-04 [UX-01]: Real createSmartLoader suppresses skeleton flash for fast <50ms response via SHOW_DELAY_MS', async () => {
  const portal = createPortalContext({ server, sandbox, coreModules: ['js/core/utils.js', 'js/core/loading.js'] });
  try {
    expect(portal.ctx.SHOW_DELAY_MS).toBe(200);
    const container = sandbox.document.createElement('div');
    sandbox.document.body.appendChild(container);
    const loader = portal.ctx.createSmartLoader({ container });
    const res = await loader.execute(async () => 'fast');
    expect(res).toBe('fast');
    expect(container.querySelector('.smart-loader-wrapper')).toBeNull();
  } finally {
    portal.dispose();
  }
}, { featureId: 'UX-01', tier: 2 });

suite.test('T2-F11-05 [UX-01]: Real createSmartLoader cancel() clears aria-busy and leaves 0 leaked Timeout handles', async () => {
  const portal = createPortalContext({ server, sandbox, coreModules: ['js/core/utils.js', 'js/core/loading.js'] });
  try {
    const container = sandbox.document.createElement('div');
    sandbox.document.body.appendChild(container);
    const loader = portal.ctx.createSmartLoader({ container, showDelayMs: 10, timeoutMs: 5000 });
    const pending = loader.execute(() => new Promise(() => {}));
    await new Promise(r => setTimeout(r, 25));
    expect(container.getAttribute('aria-busy')).toBe('true');
    loader.cancel();
    await pending;
    expect(container.getAttribute('aria-busy')).toBeNull();
    expect(container.querySelector('.smart-loader-wrapper')).toBeNull();
  } finally {
    portal.dispose();
  }
}, { featureId: 'UX-01', tier: 2 });

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 12: Error & Retry States (UX-02)
// ─────────────────────────────────────────────────────────────────────────────

suite.test('T2-F12-01 [UX-02]: Real utils.escapeHtml + SmartLoading escapes script tag in error/retry state', () => {
  const portal = createPortalContext({ server, sandbox, coreModules: ['js/core/utils.js', 'js/core/loading.js'] });
  try {
    const container = sandbox.document.createElement('div');
    const rawMsg = `<script>alert('err')</script>`;
    container.innerHTML = `<div class="state-card error-card"><p>${portal.ctx.escapeHtml(rawMsg)}</p><button type="button" class="btn-retry">Retry</button></div>`;
    expect(container.innerHTML.includes('<script>')).toBe(false);
    expect(container.querySelector('.btn-retry')).not.toBeNull();
  } finally {
    portal.dispose();
  }
}, { featureId: 'UX-02', tier: 2 });

suite.test('T2-F12-02 [UX-02]: Real supabase.js emits offline code when navigator.onLine is false', async () => {
  const portal = createPortalContext({
    server,
    sandbox,
    navigator: { onLine: false }
  });
  try {
    let caught = null;
    try {
      await portal.ctx.supa.post('bb_tasks', { title: 'Test' });
    } catch (e) {
      caught = e;
    }
    expect(caught).not.toBeNull();
    expect(caught.code).toBe('offline');
  } finally {
    portal.dispose();
  }
}, { featureId: 'UX-02', tier: 2 });

suite.test('T2-F12-03 [UX-02]: Real loading.js withSmartButtonLock serializes consecutive button clicks', async () => {
  const portal = createPortalContext({ server, sandbox, coreModules: ['js/core/utils.js', 'js/core/loading.js'] });
  try {
    const btn = sandbox.document.createElement('button');
    sandbox.document.body.appendChild(btn);
    let runs = 0;
    const op = async () => {
      runs++;
      await new Promise(r => setTimeout(r, 30));
      return 'done';
    };

    const [r1, r2] = await Promise.all([
      portal.ctx.withSmartButtonLock(btn, op),
      portal.ctx.withSmartButtonLock(btn, op)
    ]);
    expect(runs).toBe(1);
    expect(r1).toBe('done');
    expect(r2).toBeNull();
    expect(btn.disabled).toBe(false);
  } finally {
    portal.dispose();
  }
}, { featureId: 'UX-02', tier: 2 });

suite.test('T2-F12-04 [UX-02]: Real SmartLoading enforces TIMEOUT_MS=15000 constant and renders timeout card', async () => {
  const portal = createPortalContext({ server, sandbox, coreModules: ['js/core/utils.js', 'js/core/loading.js'] });
  try {
    expect(portal.ctx.SmartLoading.TIMEOUT_MS).toBe(15000);
    const container = sandbox.document.createElement('div');
    sandbox.document.body.appendChild(container);
    const loader = portal.ctx.createSmartLoader({ container, timeoutMs: 25, showDelayMs: 5, minDisplayMs: 5 });
    await expect(loader.execute(() => new Promise(() => {}), () => {})).rejects.toThrow('timed out');
    expect(container.querySelector('.loading-timeout-state')).not.toBeNull();
    expect(container.querySelector('.retry-btn')).not.toBeNull();
  } finally {
    portal.dispose();
  }
}, { featureId: 'UX-02', tier: 2 });

suite.test('T2-F12-05 [UX-02]: Real SmartLoading timeout .retry-btn click invokes retry handler', async () => {
  const portal = createPortalContext({ server, sandbox, coreModules: ['js/core/utils.js', 'js/core/loading.js'] });
  try {
    const container = sandbox.document.createElement('div');
    sandbox.document.body.appendChild(container);
    let retried = 0;
    const loader = portal.ctx.createSmartLoader({ container, timeoutMs: 25, showDelayMs: 5, minDisplayMs: 5 });
    try {
      await loader.execute(() => new Promise(() => {}), () => { retried++; });
    } catch {}
    const retryBtn = container.querySelector('.retry-btn');
    expect(retryBtn).not.toBeNull();
    retryBtn.click();
    expect(retried).toBe(1);
  } finally {
    portal.dispose();
  }
}, { featureId: 'UX-02', tier: 2 });

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 13: Inline Form Validation (UX-03)
// ─────────────────────────────────────────────────────────────────────────────

function mountRegFormForBoundary(sandbox) {
  const form = sandbox.document.createElement('form');
  form.id = 'reg-form';
  const defs = [
    ['reg-fullname', 'Jayden Wong'],
    ['reg-email', 'jayden@1stpjbb.org'],
    ['reg-section', 'Senior'],
    ['reg-age', '16'],
    ['reg-rank', 'Private'],
    ['reg-squad', 'Alpha'],
    ['reg-pass', 'StrongPass123!'],
    ['reg-pass2', 'StrongPass123!']
  ];
  for (const [id, val] of defs) {
    const g = sandbox.document.createElement('div');
    g.className = 'form-group';
    const inp = sandbox.document.createElement('input');
    inp.id = id;
    inp.value = val;
    g.appendChild(inp);
    form.appendChild(g);
  }
  sandbox.document.body.appendChild(form);
}

suite.test('T2-F13-01 [UX-03]: Real member.js registerMember flags whitespace-only name with .is-invalid', async () => {
  const portal = createPortalContext({ server, sandbox, modules: ['js/modules/member.js'] });
  try {
    mountRegFormForBoundary(sandbox);
    const nameEl = sandbox.document.getElementById('reg-fullname');
    nameEl.value = '     ';
    await portal.ctx.registerMember();
    expect(server.getRequests(r => r.pathname.includes('bb_members')).length).toBe(0);
    expect(nameEl.classList.contains('is-invalid')).toBe(true);
  } finally {
    portal.dispose();
  }
}, { featureId: 'UX-03', tier: 2 });

suite.test('T2-F13-02 [UX-03]: Real member.js registerMember flags malformed email without TLD as .is-invalid', async () => {
  const portal = createPortalContext({ server, sandbox, modules: ['js/modules/member.js'] });
  try {
    mountRegFormForBoundary(sandbox);
    const emailEl = sandbox.document.getElementById('reg-email');
    emailEl.value = 'test@domain';
    await portal.ctx.registerMember();
    expect(emailEl.classList.contains('is-invalid')).toBe(true);
    expect(sandbox.document.querySelector('.field-error')).not.toBeNull();
  } finally {
    portal.dispose();
  }
}, { featureId: 'UX-03', tier: 2 });

suite.test('T2-F13-03 [UX-03]: Real member.js registerMember flags password <6 chars as .is-invalid', async () => {
  const portal = createPortalContext({ server, sandbox, modules: ['js/modules/member.js'] });
  try {
    mountRegFormForBoundary(sandbox);
    const passEl = sandbox.document.getElementById('reg-pass');
    passEl.value = '12345';
    await portal.ctx.registerMember();
    expect(passEl.classList.contains('is-invalid')).toBe(true);
  } finally {
    portal.dispose();
  }
}, { featureId: 'UX-03', tier: 2 });

suite.test('T2-F13-04 [UX-03]: Real utils.js sanitizeText caps 1000-character member name to <= 100 chars', () => {
  const portal = createPortalContext({ server, sandbox, coreModules: ['js/core/utils.js'] });
  try {
    const huge = 'x'.repeat(1000);
    const cleaned = portal.ctx.sanitizeText(huge, 100);
    expect(cleaned.length).toBe(100);
  } finally {
    portal.dispose();
  }
}, { featureId: 'UX-03', tier: 2 });

suite.test('T2-F13-05 [UX-03]: Real member.js clears .is-invalid immediately on input event after correction', async () => {
  const portal = createPortalContext({ server, sandbox, modules: ['js/modules/member.js'] });
  try {
    mountRegFormForBoundary(sandbox);
    const emailEl = sandbox.document.getElementById('reg-email');
    emailEl.value = 'bad-email';
    await portal.ctx.registerMember();
    expect(emailEl.classList.contains('is-invalid')).toBe(true);

    emailEl.value = 'valid@1stpjbb.org';
    emailEl.dispatchEvent({ type: 'input' });
    expect(emailEl.classList.contains('is-invalid')).toBe(false);
  } finally {
    portal.dispose();
  }
}, { featureId: 'UX-03', tier: 2 });

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 14: Real-Time Sync Subscriptions & Dispatcher (SYNC-01)
// ─────────────────────────────────────────────────────────────────────────────

suite.test('T2-F14-01 [SYNC-01]: Real PortalRealtime.trigger discards unknown entity safely without throwing', () => {
  const portal = createPortalContext({ server, sandbox });
  try {
    portal.ctx.PortalRealtime.trigger('unknown_alien_table', 'update', {}, true);
    expect(true).toBe(true);
  } finally {
    portal.dispose();
  }
}, { featureId: 'SYNC-01', tier: 2 });

suite.test('T2-F14-02 [SYNC-01]: Real session.js handleSyncMessage and PortalRealtime ignore null payloads cleanly', () => {
  const portal = createPortalContext({ server, sandbox });
  try {
    portal.ctx.handleSyncMessage(null);
    portal.ctx.PortalRealtime.trigger('tasks', 'update', null, true);
    expect(portal.ctx.sessionGet('ic')).toBeNull();
  } finally {
    portal.dispose();
  }
}, { featureId: 'SYNC-01', tier: 2 });

suite.test('T2-F14-03 [SYNC-01]: supabase.js subscribes to bb_gallery and dispatches gallery/resources/forms/prices', () => {
  const supaSrc = fs.readFileSync(path.join(REPO_ROOT, 'js/api/supabase.js'), 'utf8');
  expect(supaSrc.includes("table: 'bb_gallery'")).toBe(true);
  expect(/entity\s*===\s*'gallery'/.test(supaSrc)).toBe(true);
  expect(/entity\s*===\s*'resources'/.test(supaSrc)).toBe(true);
  expect(/entity\s*===\s*'forms'/.test(supaSrc)).toBe(true);
}, { featureId: 'SYNC-01', tier: 2 });

suite.test('T2-F14-04 [SYNC-01]: Real leader tab executes checkDeltaSync queries against MockSupabaseServer', async () => {
  const portal = createPortalContext({ server, sandbox });
  try {
    expect(portal.ctx.isLeaderTab()).toBe(true);
    server.requestLog = [];
    await portal.ctx.PortalRealtime.checkDeltaSync();
    expect(server.getRequests(r => r.pathname.includes('bb_config') || r.pathname.includes('bb_tasks')).length).toBeGreaterThan(0);
  } finally {
    portal.dispose();
  }
}, { featureId: 'SYNC-01', tier: 2 });

suite.test('T2-F14-05 [SYNC-01]: Real non-leader tab suppresses redundant delta queries in checkDeltaSync', async () => {
  sandbox.localStorage.setItem(
    'bb_leader_heartbeat',
    JSON.stringify({ tabId: 'existing_leader_tab', ts: Date.now() })
  );
  const portal = createPortalContext({ server, sandbox });
  try {
    expect(portal.ctx.isLeaderTab()).toBe(false);
    server.requestLog = [];
    await portal.ctx.PortalRealtime.checkDeltaSync();
    expect(server.requestLog.length).toBe(0);
  } finally {
    portal.dispose();
  }
}, { featureId: 'SYNC-01', tier: 2 });

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 15: Broadcast Trigger Coverage (SYNC-02)
// ─────────────────────────────────────────────────────────────────────────────

suite.test('T2-F15-01 [SYNC-02]: Real session.js degrades gracefully when BroadcastChannel is undefined', () => {
  const portal = createPortalContext({ server, sandbox, disableBroadcastChannel: true });
  try {
    portal.ctx.sessionSet('rank', 'Sergeant');
    expect(portal.ctx.sessionGet('rank')).toBe('Sergeant');
  } finally {
    portal.dispose();
  }
}, { featureId: 'SYNC-02', tier: 2 });

suite.test('T2-F15-02 [SYNC-02]: Real session.js handleSyncMessage drops self-originating senderId', () => {
  const portal = createPortalContext({ server, sandbox });
  try {
    const tabId = portal.ctx.getTabId();
    portal.ctx.handleSyncMessage({
      action: 'set',
      senderId: tabId,
      msgId: 'self_1',
      key: 'rank',
      value: 'Forged'
    });
    expect(portal.ctx.sessionGet('rank')).toBeNull();
  } finally {
    portal.dispose();
  }
}, { featureId: 'SYNC-02', tier: 2 });

suite.test('T2-F15-03 [SYNC-02]: Real session.js handleSyncMessage drops duplicate msgId from external tab', () => {
  const portal = createPortalContext({ server, sandbox });
  try {
    portal.ctx.handleSyncMessage({
      action: 'set',
      senderId: 'tab_beta',
      msgId: 'evt_loop_101',
      key: 'rank',
      value: 'Corporal'
    });
    expect(portal.ctx.sessionGet('rank')).toBe('Corporal');

    portal.ctx.handleSyncMessage({
      action: 'set',
      senderId: 'tab_beta',
      msgId: 'evt_loop_101',
      key: 'rank',
      value: 'Recruit'
    });
    expect(portal.ctx.sessionGet('rank')).toBe('Corporal');
  } finally {
    portal.dispose();
  }
}, { featureId: 'SYNC-02', tier: 2 });

suite.test('T2-F15-04 [SYNC-02]: Real gallery.js deleteGalleryImage broadcasts gallery deletion event', async () => {
  const portal = createPortalContext({
    server,
    sandbox,
    supaKey: 'officer_admin_token',
    modules: ['js/modules/admin.js', 'js/modules/gallery.js'],
    afterLoadGlobals: { showConfirmModal: async () => true }
  });
  let listener = null;
  try {
    grantPortalAdminSession(portal, server);
    listener = sandbox.createChannel('bb_portal_realtime');
    const events = [];
    listener.onmessage = (e) => { if (e.data) events.push(e.data); };

    portal.ctx.galleryImages.splice(0, portal.ctx.galleryImages.length, {
      id: 'gal-1',
      url: 'events/parade2026.jpg',
      type: 'image'
    });
    await portal.ctx.deleteGalleryImage(0, 'gal-1');
    await new Promise(r => setTimeout(r, 40));

    expect(events.some(e => e.entity === 'gallery' && e.action === 'delete')).toBe(true);
  } finally {
    if (listener) {
      try { listener.close(); } catch {}
    }
    portal.dispose();
  }
}, { featureId: 'SYNC-02', tier: 2 });

suite.test('T2-F15-05 [SYNC-02]: Real PortalRealtime.broadcast while navigator.onLine=false completes without blocking', () => {
  const portal = createPortalContext({
    server,
    sandbox,
    navigator: { onLine: false }
  });
  try {
    portal.ctx.PortalRealtime.broadcast('tasks', 'update', { id: 't1' });
    expect(true).toBe(true);
  } finally {
    portal.dispose();
  }
}, { featureId: 'SYNC-02', tier: 2 });

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 16: Forum Safe Concurrent Updates (SYNC-03)
// ─────────────────────────────────────────────────────────────────────────────

suite.test('T2-F16-01 [SYNC-03]: Real supa.safeConfigUpdate merges simultaneous replies without losing either', async () => {
  const portal = createPortalContext({ server, sandbox, supaKey: 'officer_admin_token' });
  try {
    const base = [{ id: 10, title: 'Camp', comments: [] }];
    server.db.bb_config.bb_forum_posts = JSON.stringify(base);
    portal.ctx.supa.recordConfigSnapshot('bb_forum_posts', base);

    await Promise.all([
      portal.ctx.supa.safeConfigUpdate('bb_forum_posts', (remote) => {
        const list = Array.isArray(remote) ? remote : [];
        list[0].comments.push({ id: 2, text: 'User A reply' });
        return list;
      }),
      portal.ctx.supa.safeConfigUpdate('bb_forum_posts', (remote) => {
        const list = Array.isArray(remote) ? remote : [];
        list[0].comments.push({ id: 3, text: 'User B reply' });
        return list;
      })
    ]);

    const stored = JSON.parse(server.db.bb_config.bb_forum_posts);
    expect(stored[0].comments.length).toBe(2);
  } finally {
    portal.dispose();
  }
}, { featureId: 'SYNC-03', tier: 2 });

suite.test('T2-F16-02 [SYNC-03]: Real supa.safeConfigUpdate retries transient 500 collision and succeeds', async () => {
  const portal = createPortalContext({ server, sandbox, supaKey: 'officer_admin_token' });
  try {
    let postAttempt = 0;
    server.mockRoute('/rest/v1/bb_config', (reqRec, res) => {
      if (reqRec.method === 'GET') {
        return server._sendJson(res, 200, [{ key: 'bb_forum_posts', value: '[]' }]);
      }
      postAttempt++;
      if (postAttempt === 1) {
        return server._sendError(res, 500, '500', 'Transient collision');
      }
      server.db.bb_config.bb_forum_posts = JSON.stringify([{ id: 99, title: 'Retried' }]);
      return server._sendJson(res, 201, [reqRec.body]);
    });

    const result = await portal.ctx.supa.safeConfigUpdate('bb_forum_posts', () => [{ id: 99, title: 'Retried' }]);
    expect(postAttempt).toBe(2);
    expect(result[0].id).toBe(99);
  } finally {
    portal.dispose();
  }
}, { featureId: 'SYNC-03', tier: 2 });

suite.test('T2-F16-03 [SYNC-03]: Real supa.mergeConfigCollections preserves remote deletion alongside new local item', () => {
  const portal = createPortalContext({ server, sandbox });
  try {
    const base = [{ id: 10, title: 'To Delete' }];
    const remote = [];
    const local = [{ id: 10, title: 'To Delete' }, { id: 11, title: 'New Topic' }];
    const merged = portal.ctx.supa.mergeConfigCollections(base, remote, local, 'id');
    expect(merged.some(p => p.id === 10)).toBe(false);
    expect(merged.some(p => p.id === 11)).toBe(true);
  } finally {
    portal.dispose();
  }
}, { featureId: 'SYNC-03', tier: 2 });

suite.test('T2-F16-04 [SYNC-03]: Real forum.js loadForumPosts recovers cleanly from corrupt JSON in bb_config', async () => {
  server.db.bb_config.bb_forum_posts = 'INVALID_JSON_BLOB';
  const portal = createPortalContext({ server, sandbox, modules: ['js/modules/forum.js'] });
  try {
    const feedEl = sandbox.document.createElement('div');
    feedEl.id = 'forum-feed-container';
    sandbox.document.body.appendChild(feedEl);
    await portal.ctx.loadForumPosts();
    expect(Array.isArray(portal.ctx.forumPosts)).toBe(true);
  } finally {
    portal.dispose();
  }
}, { featureId: 'SYNC-03', tier: 2 });

suite.test('T2-F16-05 [SYNC-03]: Real forum.js saveForumPosts persists via safeConfigUpdate rather than blind setConfig', async () => {
  const portal = createPortalContext({ server, sandbox, modules: ['js/modules/forum.js'] });
  try {
    let safeUsed = false;
    const origSafe = portal.ctx.supa.safeConfigUpdate.bind(portal.ctx.supa);
    portal.ctx.supa.safeConfigUpdate = async (k, u, o) => {
      safeUsed = true;
      return origSafe(k, u, o);
    };
    await portal.ctx.saveForumPosts([{ id: 1, title: 'Safe Post', comments: [] }]);
    expect(safeUsed).toBe(true);
  } finally {
    portal.dispose();
  }
}, { featureId: 'SYNC-03', tier: 2 });

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 17: Audit Logging for Sensitive Admin Operations (OBS-01)
// ─────────────────────────────────────────────────────────────────────────────

suite.test('T2-F17-01 [OBS-01]: Real utils.js sanitizeAuditDetails redacts passwords, tokens, and masks IC', () => {
  const portal = createPortalContext({ server, sandbox, coreModules: ['js/core/utils.js'] });
  try {
    const sanitized = portal.ctx.sanitizeAuditDetails({
      email: 'officer@1stpj.org',
      new_password: 'SecretPassword123!',
      token: 'Bearer abc.def.ghi',
      ic: '010101-14-1234'
    });
    expect(sanitized.new_password).toBe('[REDACTED]');
    expect(sanitized.token).toBe('[REDACTED]');
    expect(sanitized.ic.includes('010101')).toBe(false);
    expect(sanitized.ic.endsWith('1234')).toBe(true);
  } finally {
    portal.dispose();
  }
}, { featureId: 'OBS-01', tier: 2 });

suite.test('T2-F17-02 [OBS-01]: Audit logs table is append-only ledger rejecting modifications', async () => {
  const patchRes = await fetch(`${server.url}/rest/v1/bb_audit_logs?id=eq.1`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', apikey: 'anon_test_key' },
    body: JSON.stringify({ action: 'tampered_action' })
  });
  expect(patchRes.status).toBe(403);
  const patchData = await patchRes.json();
  expect(patchData.code).toBe('42501');

  const deleteRes = await fetch(`${server.url}/rest/v1/bb_audit_logs?id=eq.1`, {
    method: 'DELETE',
    headers: { apikey: 'anon_test_key', Authorization: 'Bearer admin_token' }
  });
  expect(deleteRes.status).toBe(403);
  const deleteData = await deleteRes.json();
  expect(deleteData.code).toBe('42501');
}, { featureId: 'OBS-01', tier: 2 });

suite.test('T2-F17-03 [OBS-01]: Real utils.js logAuditEvent resolves cleanly when audit RPC returns 500', async () => {
  const portal = createPortalContext({ server, sandbox });
  try {
    server.mockRoute('/rest/v1/rpc/rpc_log_audit_event', { status: 500, data: { message: 'Audit timeout' } });
    const res = await portal.ctx.logAuditEvent({
      action: 'order.delete',
      targetType: 'order',
      targetId: 'ORD-1001'
    });
    expect(res.success).toBe(true);
    expect(res.durable).toBe(false);
  } finally {
    portal.dispose();
  }
}, { featureId: 'OBS-01', tier: 2 });

suite.test('T2-F17-04 [OBS-01]: Real utils.js logAuditEvent defaults missing actor to anonymous', async () => {
  const portal = createPortalContext({ server, sandbox });
  try {
    const res = await portal.ctx.logAuditEvent({ action: 'test.anon', targetType: 'auth' });
    expect(res.success).toBe(true);
    expect(res.entry.actor_id).toBe('anonymous');
  } finally {
    portal.dispose();
  }
}, { featureId: 'OBS-01', tier: 2 });

suite.test('T2-F17-05 [OBS-01]: Real utils.js logAuditEvent persists sanitized details to server bb_audit_logs', async () => {
  const portal = createPortalContext({ server, sandbox, supaKey: 'officer_admin_token' });
  try {
    const res = await portal.ctx.logAuditEvent({
      action: 'config.gemini_key_update',
      targetType: 'config',
      targetId: 'bb_gemini_api_key',
      details: { api_key: 'AIzaSySecretKey999', note: 'Updated key' }
    });
    expect(res.success).toBe(true);
    expect(res.durable).toBe(true);
    const stored = server.db.bb_audit_logs.find(l => l.action === 'config.gemini_key_update');
    expect(stored).toBeDefined();
    expect(stored.details.api_key).toBe('[REDACTED]');
  } finally {
    portal.dispose();
  }
}, { featureId: 'OBS-01', tier: 2 });

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 18: Background Promise Error Handling & Console Hygiene (OBS-02)
// ─────────────────────────────────────────────────────────────────────────────

suite.test('T2-F18-01 [OBS-02]: Real supa.post on 500 non-JSON text response rejects with Error instance', async () => {
  const portal = createPortalContext({ server, sandbox });
  try {
    server.mockRoute('/rest/v1/bb_tasks', (_req, res) => {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Gateway Error Text');
    });
    let caught = null;
    try {
      await portal.ctx.supa.post('bb_tasks', { title: 'Test' });
    } catch (e) {
      caught = e;
    }
    expect(caught).not.toBeNull();
    expect(typeof caught.message).toBe('string');
    expect(caught.status).toBe(500);
  } finally {
    portal.dispose();
  }
}, { featureId: 'OBS-02', tier: 2 });

suite.test('T2-F18-02 [OBS-02]: Promise.allSettled on supa.get handles mixed 404/200 without crashing sibling', async () => {
  const portal = createPortalContext({ server, sandbox });
  try {
    const results = await Promise.allSettled([
      portal.ctx.supa.get('nonexistent_table_xyz'),
      portal.ctx.supa.get('bb_tasks')
    ]);
    expect(results[0].status).toBe('rejected');
    expect(results[1].status).toBe('fulfilled');
  } finally {
    portal.dispose();
  }
}, { featureId: 'OBS-02', tier: 2 });

suite.test('T2-F18-03 [OBS-02]: Real session.js sessionSet handles localStorage QuotaExceededError gracefully', () => {
  const portal = createPortalContext({ server, sandbox });
  const origSetItem = sandbox.localStorage.setItem;
  try {
    sandbox.localStorage.setItem = () => {
      const err = new Error('QuotaExceededError');
      err.name = 'QuotaExceededError';
      throw err;
    };
    portal.ctx.sessionSet('rank', 'Sergeant');
    expect(portal.ctx.sessionGet('rank')).toBe('Sergeant');
  } finally {
    sandbox.localStorage.setItem = origSetItem;
    portal.dispose();
  }
}, { featureId: 'OBS-02', tier: 2 });

suite.test('T2-F18-04 [OBS-02]: Real supa.get with AbortController signal rejects cleanly with AbortError', async () => {
  const portal = createPortalContext({ server, sandbox });
  try {
    const ac = new AbortController();
    ac.abort();
    let errName = '';
    try {
      await portal.ctx.supa.get('bb_tasks', { signal: ac.signal });
    } catch (e) {
      errName = e.name || '';
    }
    expect(errName).toBe('AbortError');
  } finally {
    portal.dispose();
  }
}, { featureId: 'OBS-02', tier: 2 });

suite.test('T2-F18-05 [OBS-02]: js/modules/ and js/api/ contain zero silent bare catch blocks in async paths', () => {
  const files = ['js/api/supabase.js', 'js/api/sheets.js', 'js/modules/forum.js', 'js/modules/tasks.js'];
  const bareCatchRegex = /\bcatch\s*(?:\([^)]*\))?\s*\{\s*\}/g;
  const badFiles = files.filter(rel => {
    const src = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
    return bareCatchRegex.test(src);
  });
  expect(badFiles).toEqual([]);
}, { featureId: 'OBS-02', tier: 2 });

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 19: Code Duplication Cleanup (MAINT-01)
// ─────────────────────────────────────────────────────────────────────────────

suite.test('T2-F19-01 [MAINT-01]: Real tasks.js saveTask exits safely when form elements are absent', async () => {
  const portal = createPortalContext({ server, sandbox, modules: ['js/modules/admin.js', 'js/modules/tasks.js'] });
  try {
    grantPortalAdminSession(portal, server);
    await portal.ctx.saveTask();
    expect(server.getRequests(r => r.method === 'POST' && r.pathname === '/rest/v1/bb_tasks').length).toBe(0);
  } finally {
    portal.dispose();
  }
}, { featureId: 'MAINT-01', tier: 2 });

suite.test('T2-F19-02 [MAINT-01]: Real tasks.js normalizeTaskStatus defaults null/undefined safely to todo', () => {
  const portal = createPortalContext({ server, sandbox, modules: ['js/modules/tasks.js'] });
  try {
    expect(portal.ctx.normalizeTaskStatus(null)).toBe('todo');
    expect(portal.ctx.normalizeTaskStatus(undefined)).toBe('todo');
  } finally {
    portal.dispose();
  }
}, { featureId: 'MAINT-01', tier: 2 });

suite.test('T2-F19-03 [MAINT-01]: Real tasks.js updateTaskStatus blocks invalid status before network PATCH', async () => {
  const portal = createPortalContext({
    server,
    sandbox,
    supaKey: 'officer_admin_token',
    modules: ['js/modules/admin.js', 'js/modules/tasks.js']
  });
  try {
    grantPortalAdminSession(portal, server);
    await portal.ctx.updateTaskStatus('task-1', 'invalid_hack_status');
    expect(server.getRequests(r => r.method === 'PATCH' && r.pathname === '/rest/v1/bb_tasks').length).toBe(0);
  } finally {
    portal.dispose();
  }
}, { featureId: 'MAINT-01', tier: 2 });

suite.test('T2-F19-04 [MAINT-01]: admin.js defines zero duplicate task management functions', () => {
  const adminSrc = fs.readFileSync(path.join(REPO_ROOT, 'js/modules/admin.js'), 'utf8');
  const dupFns = ['toggleTaskForm', 'saveTask', 'clearTaskForm', 'updateTaskStatus', 'deleteTask'];
  for (const fn of dupFns) {
    const rx = new RegExp(`(?:async\\s+)?function\\s+${fn}\\s*\\(`);
    expect(rx.test(adminSrc)).toBe(false);
  }
}, { featureId: 'MAINT-01', tier: 2 });

suite.test('T2-F19-05 [MAINT-01]: Real tasks.js updateTaskStatus patches valid status inprogress on MockSupabaseServer', async () => {
  const portal = createPortalContext({
    server,
    sandbox,
    supaKey: 'officer_admin_token',
    modules: ['js/modules/admin.js', 'js/modules/tasks.js']
  });
  try {
    grantPortalAdminSession(portal, server);
    await portal.ctx.updateTaskStatus('task-1', 'inprogress');
    expect(server.db.bb_tasks[0].status).toBe('inprogress');
  } finally {
    portal.dispose();
  }
}, { featureId: 'MAINT-01', tier: 2 });

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 20: Dead Globals & ESLint Configuration (MAINT-02)
// ─────────────────────────────────────────────────────────────────────────────

suite.test('T2-F20-01 [MAINT-02]: Undeclared global identifier flagged by ESLint no-undef rule', async () => {
  const configContent = fs.readFileSync(path.join(REPO_ROOT, 'eslint.config.mjs'), 'utf8');
  expect(configContent.includes("'no-undef':") || configContent.includes('"no-undef":')).toBe(true);

  const { ESLint } = require('eslint');
  const eslint = new ESLint({ cwd: REPO_ROOT });
  const results = await eslint.lintText('const a = undeclaredGlobalVariableIdentifier;', { filePath: 'js/test-undef.js' });
  expect(results[0].messages.some(m => m.ruleId === 'no-undef')).toBe(true);
}, { featureId: 'MAINT-02', tier: 2 });

suite.test('T2-F20-02 [MAINT-02]: Underscore-prefixed unused variable tolerated by ESLint pattern', async () => {
  const { ESLint } = require('eslint');
  const eslint = new ESLint({ cwd: REPO_ROOT });
  const results = await eslint.lintText('const _unusedVar = 42;\n', { filePath: 'js/test-unused.js' });
  const unusedMsg = results[0].messages.find(m => m.ruleId === 'no-unused-vars');
  expect(unusedMsg).toBeUndefined();
}, { featureId: 'MAINT-02', tier: 2 });

suite.test('T2-F20-03 [MAINT-02]: ESLint validates sw.js with 0 errors and 0 no-undef violations', async () => {
  const { ESLint } = require('eslint');
  const eslint = new ESLint({ cwd: REPO_ROOT });
  const results = await eslint.lintFiles(['sw.js']);
  expect(results[0].errorCount).toBe(0);
  expect(results[0].messages.some(m => m.ruleId === 'no-undef')).toBe(false);
}, { featureId: 'MAINT-02', tier: 2 });

suite.test('T2-F20-04 [MAINT-02]: ESLint validates scripts/ files with Node globals and 0 errors', async () => {
  const { ESLint } = require('eslint');
  const eslint = new ESLint({ cwd: REPO_ROOT });
  const results = await eslint.lintFiles([
    'scripts/verify-syntax.js',
    'scripts/test-modules.js',
    'scripts/test-multi-tab-concurrency.js'
  ]);
  for (const r of results) {
    expect(r.errorCount).toBe(0);
  }
}, { featureId: 'MAINT-02', tier: 2 });

suite.test('T2-F20-05 [MAINT-02]: Duplicate object keys flagged as error by ESLint', async () => {
  const { ESLint } = require('eslint');
  const eslint = new ESLint({ cwd: REPO_ROOT });
  const results = await eslint.lintText('const obj = { duplicateKey: 1, duplicateKey: 2 };', { filePath: 'js/test-dupe.js' });
  const dupeMsg = results[0].messages.find(m => m.ruleId === 'no-dupe-keys');
  expect(dupeMsg).toBeDefined();
  expect(dupeMsg.severity).toBe(2);
}, { featureId: 'MAINT-02', tier: 2 });

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 21: Concurrency Test Process Clean Exit (TEST-01)
// ─────────────────────────────────────────────────────────────────────────────

suite.test('T2-F21-01 [TEST-01]: scripts/verify-syntax.js exits 0 on valid repo', () => {
  const res = spawnSync(process.execPath, [path.join(REPO_ROOT, 'scripts/verify-syntax.js')], {
    cwd: REPO_ROOT,
    timeout: 10000,
    encoding: 'utf8'
  });
  expect(res.error).toBeUndefined();
  expect(res.status).toBe(0);
}, { featureId: 'TEST-01', tier: 2 });

suite.test('T2-F21-02 [TEST-01]: scripts/test-multi-tab-concurrency.js exits 0 within 4s and portal.dispose leaves 0 Timers', () => {
  const res = spawnSync(process.execPath, [path.join(REPO_ROOT, 'scripts/test-multi-tab-concurrency.js')], {
    cwd: REPO_ROOT,
    timeout: 4000,
    encoding: 'utf8'
  });
  expect(res.error).toBeUndefined();
  expect(res.status).toBe(0);

  const portal = createPortalContext({ server, sandbox });
  portal.dispose();
  const active = process.getActiveResourcesInfo();
  expect(active.includes('Timeout')).toBe(false);
}, { featureId: 'TEST-01', tier: 2 });

suite.test('T2-F21-03 [TEST-01]: Message storm of 500 broadcast events processed without hanging event loop', async () => {
  const ch1 = new BroadcastChannel('storm_channel');
  const ch2 = new BroadcastChannel('storm_channel');
  let received = 0;
  ch2.onmessage = () => { received++; };

  for (let i = 0; i < 500; i++) {
    ch1.postMessage({ seq: i, payload: 'storm' });
  }

  await new Promise(resolve => setTimeout(resolve, 60));
  ch1.close();
  ch2.close();

  expect(received).toBe(500);
}, { featureId: 'TEST-01', tier: 2 });

suite.test('T2-F21-04 [TEST-01]: Real session.js initLeaderElection fails over when heartbeat is stale', () => {
  sandbox.localStorage.setItem(
    'bb_leader_heartbeat',
    JSON.stringify({ tabId: 'crashed_tab', ts: Date.now() - 10000 })
  );
  const portal = createPortalContext({ server, sandbox });
  try {
    expect(portal.ctx.isLeaderTab()).toBe(true);
  } finally {
    portal.dispose();
  }
}, { featureId: 'TEST-01', tier: 2 });

suite.test('T2-F21-05 [TEST-01]: Real session.js seenMsgIds cache evicts oldest entries beyond MAX_SEEN_MSG_IDS=128', () => {
  const portal = createPortalContext({ server, sandbox });
  try {
    for (let i = 0; i < 140; i++) {
      portal.ctx.handleSyncMessage({
        action: 'set',
        senderId: 'other_tab',
        msgId: `msg_${i}`,
        key: 'ping',
        value: i
      });
    }
    // msg_0 should have been evicted from the 128-entry window
    portal.ctx.handleSyncMessage({
      action: 'set',
      senderId: 'other_tab',
      msgId: 'msg_0',
      key: 'ping',
      value: 'reaccepted'
    });
    expect(portal.ctx.sessionGet('ping')).toBe('reaccepted');
  } finally {
    portal.dispose();
  }
}, { featureId: 'TEST-01', tier: 2 });

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 22: Headless Browser Layout Assertion Fix (TEST-02)
// ─────────────────────────────────────────────────────────────────────────────

suite.test('T2-F22-01 [TEST-02]: Real utils.js getMemberAvatarInitial extracts initial from hyphenated name', () => {
  const portal = createPortalContext({ server, sandbox, coreModules: ['js/core/utils.js'] });
  try {
    expect(portal.ctx.getMemberAvatarInitial('Jayden-Wong', 'jayden@1stpjbb.org')).toBe('J');
  } finally {
    portal.dispose();
  }
}, { featureId: 'TEST-02', tier: 2 });

suite.test('T2-F22-02 [TEST-02]: Real utils.js getMemberAvatarInitial trims leading whitespace before extraction', () => {
  const portal = createPortalContext({ server, sandbox, coreModules: ['js/core/utils.js'] });
  try {
    expect(portal.ctx.getMemberAvatarInitial('   Lucas Tan', 'lucas@1stpjbb.org')).toBe('L');
  } finally {
    portal.dispose();
  }
}, { featureId: 'TEST-02', tier: 2 });

suite.test('T2-F22-03 [TEST-02]: Real utils.js getMemberAvatarInitial handles Unicode multi-byte name', () => {
  const portal = createPortalContext({ server, sandbox, coreModules: ['js/core/utils.js'] });
  try {
    expect(portal.ctx.getMemberAvatarInitial('張伟', 'wei@1stpjbb.org')).toBe('張');
  } finally {
    portal.dispose();
  }
}, { featureId: 'TEST-02', tier: 2 });

suite.test('T2-F22-04 [TEST-02]: Real utils.js getUniversalMemberAvatarHtml renders 40x40 dimensions and CSS has responsive rules', () => {
  const portal = createPortalContext({ server, sandbox, coreModules: ['js/core/utils.js'] });
  try {
    const html = portal.ctx.getUniversalMemberAvatarHtml('Lucas Tan', 'lucas@1stpjbb.org', 40);
    expect(html.includes('width:40px')).toBe(true);
    expect(html.includes('height:40px')).toBe(true);
    const css = fs.readFileSync(path.join(REPO_ROOT, 'css/components.css'), 'utf8');
    expect(css.includes('@media')).toBe(true);
  } finally {
    portal.dispose();
  }
}, { featureId: 'TEST-02', tier: 2 });

suite.test('T2-F22-05 [TEST-02]: Real member.js setRemovePfpButtonVisible toggles .m-pfp-remove-btn flex/none', () => {
  const portal = createPortalContext({ server, sandbox, modules: ['js/modules/member.js'] });
  try {
    const btn = sandbox.document.createElement('button');
    btn.className = 'm-pfp-remove-btn';
    sandbox.document.body.appendChild(btn);

    portal.ctx.setRemovePfpButtonVisible(true);
    expect(btn.style.display).toBe('flex');
    portal.ctx.setRemovePfpButtonVisible(false);
    expect(btn.style.display).toBe('none');
  } finally {
    portal.dispose();
  }
}, { featureId: 'TEST-02', tier: 2 });

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 23: Prettier Code Formatting (MAINT-03)
// ─────────────────────────────────────────────────────────────────────────────

suite.test('T2-F23-01 [MAINT-03]: Large 5000-line js/modules/admin.js passes prettier.check without formatting violations', async () => {
  const prettier = require('prettier');
  const cfg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, '.prettierrc.json'), 'utf8'));
  const adminPath = path.join(REPO_ROOT, 'js/modules/admin.js');
  const rawCode = fs.readFileSync(adminPath, 'utf8');
  expect(rawCode.split('\n').length).toBeGreaterThanOrEqual(5000);
  const ok = await prettier.check(rawCode, { ...cfg, filepath: adminPath });
  expect(ok).toBe(true);
}, { featureId: 'MAINT-03', tier: 2 });

suite.test('T2-F23-02 [MAINT-03]: js/core/utils.js and scripts/verify-syntax.js pass prettier.check', async () => {
  const prettier = require('prettier');
  const cfg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, '.prettierrc.json'), 'utf8'));
  for (const rel of ['js/core/utils.js', 'scripts/verify-syntax.js']) {
    const abs = path.join(REPO_ROOT, rel);
    const code = fs.readFileSync(abs, 'utf8');
    const ok = await prettier.check(code, { ...cfg, filepath: abs });
    expect(ok).toBe(true);
  }
}, { featureId: 'MAINT-03', tier: 2 });

suite.test('T2-F23-03 [MAINT-03]: Multi-line HTML template literals in js/core/loading.js conform to Prettier', async () => {
  const prettier = require('prettier');
  const cfg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, '.prettierrc.json'), 'utf8'));
  const abs = path.join(REPO_ROOT, 'js/core/loading.js');
  const code = fs.readFileSync(abs, 'utf8');
  const ok = await prettier.check(code, { ...cfg, filepath: abs });
  expect(ok).toBe(true);
}, { featureId: 'MAINT-03', tier: 2 });

suite.test('T2-F23-04 [MAINT-03]: .prettierrc.json trailingComma=none rule strips trailing commas via Prettier', async () => {
  const prettier = require('prettier');
  const cfg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, '.prettierrc.json'), 'utf8'));
  expect(cfg.trailingComma).toBe('none');
  const formatted = await prettier.format('const obj = { a: 1, b: 2, };', { ...cfg, parser: 'babel' });
  expect(formatted.trim()).toBe('const obj = { a: 1, b: 2 };');
}, { featureId: 'MAINT-03', tier: 2 });

suite.test('T2-F23-05 [MAINT-03]: Comment blocks and inline comments preserved by Prettier formatter', async () => {
  const prettier = require('prettier');
  const cfg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, '.prettierrc.json'), 'utf8'));
  const codeWithComments = '// Important security barrier\nconst safe = true; /* inline comment */\n';
  const formatted = await prettier.format(codeWithComments, { ...cfg, parser: 'babel' });
  expect(formatted.includes('// Important security barrier')).toBe(true);
  expect(formatted.includes('/* inline comment */')).toBe(true);
}, { featureId: 'MAINT-03', tier: 2 });

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 24: Config & Secret Externalization (OPS-01)
// ─────────────────────────────────────────────────────────────────────────────

suite.test('T2-F24-01 [OPS-01]: Real js/config.js resolves clean origin URL for APP_CONFIG.SUPABASE_URL', () => {
  const portal = createPortalContext({ server, sandbox, coreModules: ['js/config.js'] });
  try {
    expect(portal.ctx.APP_CONFIG.SUPABASE_URL.startsWith('http')).toBe(true);
    expect(portal.ctx.APP_CONFIG.SUPABASE_URL.endsWith('/')).toBe(false);
  } finally {
    portal.dispose();
  }
}, { featureId: 'OPS-01', tier: 2 });

suite.test('T2-F24-02 [OPS-01]: Real utils.js safeUrl rejects malformed HTTP URLs and credential-bearing origins', () => {
  const portal = createPortalContext({ server, sandbox, coreModules: ['js/core/utils.js'] });
  try {
    expect(portal.ctx.safeUrl('https://[invalid-host', '')).toBe('');
    expect(portal.ctx.safeUrl('https://user:pass@evil.example.com', '')).toBe('');
  } finally {
    portal.dispose();
  }
}, { featureId: 'OPS-01', tier: 2 });

suite.test('T2-F24-03 [OPS-01]: Real js/config.js defaults TURNSTILE_SITE_KEY safely and leaves GEMINI_API_KEY empty', () => {
  const portal = createPortalContext({
    server,
    sandbox,
    coreModules: ['js/config.js'],
    env: { VITE_TURNSTILE_SITE_KEY: '', VITE_GEMINI_API_KEY: '' }
  });
  try {
    expect(portal.ctx.TURNSTILE_SITE_KEY).toBe('1x00000000000000000000AA');
    expect(portal.ctx.GEMINI_API_KEY).toBe('');
  } finally {
    portal.dispose();
  }
}, { featureId: 'OPS-01', tier: 2 });

suite.test('T2-F24-04 [OPS-01]: .gitignore ignores .env, .env.local, and dist', () => {
  const gitignorePath = path.join(REPO_ROOT, '.gitignore');
  expect(fs.existsSync(gitignorePath)).toBe(true);
  const content = fs.readFileSync(gitignorePath, 'utf8');
  expect(content.includes('.env')).toBe(true);
  expect(content.includes('.env.*') || content.includes('*.local')).toBe(true);
  expect(content.includes('dist/') || content.includes('dist')).toBe(true);
}, { featureId: 'OPS-01', tier: 2 });

suite.test('T2-F24-05 [OPS-01]: Codebase js/ and .env.example contain zero private API secrets', () => {
  const forbiddenPatterns = [
    /service_role/i,
    /sk_live_[A-Za-z0-9]+/i,
    /SUPABASE_SERVICE_ROLE_KEY/i,
    /PRIVATE_KEY/i
  ];
  const envExamplePath = path.join(REPO_ROOT, '.env.example');
  expect(fs.existsSync(envExamplePath)).toBe(true);
  const envContent = fs.readFileSync(envExamplePath, 'utf8');
  for (const pattern of forbiddenPatterns) {
    expect(pattern.test(envContent)).toBe(false);
  }

  const distDir = path.join(REPO_ROOT, 'dist');
  const targetDir = fs.existsSync(distDir) ? distDir : path.join(REPO_ROOT, 'js');
  function scan(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) scan(fullPath);
      else if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.html'))) {
        const fileContent = fs.readFileSync(fullPath, 'utf8');
        for (const pattern of forbiddenPatterns) {
          expect(pattern.test(fileContent)).toBe(false);
        }
      }
    }
  }
  scan(targetDir);
}, { featureId: 'OPS-01', tier: 2 });

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 25: CI Automation Workflow (DEVOPS-01)
// ─────────────────────────────────────────────────────────────────────────────

function getPrCiWorkflows() {
  const workflowsDir = path.join(REPO_ROOT, '.github/workflows');
  if (!fs.existsSync(workflowsDir)) return [];
  return fs
    .readdirSync(workflowsDir)
    .filter(f => /\.ya?ml$/i.test(f))
    .map(f => ({
      name: f,
      content: fs.readFileSync(path.join(workflowsDir, f), 'utf8')
    }))
    .filter(w => /pull_request\s*:/.test(w.content));
}

suite.test('T2-F25-01 [DEVOPS-01]: PR CI workflow configures Node LTS version (20/22/24)', () => {
  const ci = getPrCiWorkflows();
  expect(ci.length).toBeGreaterThan(0);
  expect(ci.some(w => /node-version\s*:\s*['"\[\s]*(?:20|22|24)/.test(w.content))).toBe(true);
}, { featureId: 'DEVOPS-01', tier: 2 });

suite.test('T2-F25-02 [DEVOPS-01]: PR CI workflow runs lint, format:check, test, and build without continue-on-error', () => {
  const ci = getPrCiWorkflows();
  expect(ci.length).toBeGreaterThan(0);
  const valid = ci.some(
    w =>
      w.content.includes('npm run lint') &&
      w.content.includes('npm run format:check') &&
      /npm test|npm run test|run-e2e-suite\.js/.test(w.content) &&
      w.content.includes('npm run build') &&
      !/continue-on-error\s*:\s*true/.test(w.content)
  );
  expect(valid).toBe(true);
}, { featureId: 'DEVOPS-01', tier: 2 });

suite.test('T2-F25-03 [DEVOPS-01]: PR CI workflow enables concurrency cancellation (cancel-in-progress: true)', () => {
  const ci = getPrCiWorkflows();
  expect(ci.length).toBeGreaterThan(0);
  const hasConcurrency = ci.some(
    w => /concurrency\s*:/.test(w.content) && /cancel-in-progress\s*:\s*true/.test(w.content)
  );
  expect(hasConcurrency).toBe(true);
}, { featureId: 'DEVOPS-01', tier: 2 });

suite.test('T2-F25-04 [DEVOPS-01]: PR CI workflow triggers on pull_request without requiring repository secrets', () => {
  const ci = getPrCiWorkflows();
  expect(ci.length).toBeGreaterThan(0);
  const safeForkPr = ci.some(
    w => /pull_request\s*:/.test(w.content) && !/\$\{\{\s*secrets\./.test(w.content)
  );
  expect(safeForkPr).toBe(true);
}, { featureId: 'DEVOPS-01', tier: 2 });

suite.test('T2-F25-05 [DEVOPS-01]: NPM cache reduces build and dependency restoration duration', () => {
  const workflowsDir = path.join(REPO_ROOT, '.github/workflows');
  const files = fs.readdirSync(workflowsDir);
  const contents = files.map(f => fs.readFileSync(path.join(workflowsDir, f), 'utf8')).join('\n');
  expect(contents.includes("cache: 'npm'") || contents.includes('actions/cache')).toBe(true);
}, { featureId: 'DEVOPS-01', tier: 2 });

if (require.main === module) {
  suite.run({ verbose: true }).then(res => {
    process.exitCode = res.failed === 0 ? 0 : 1;
  });
}

module.exports = suite;
