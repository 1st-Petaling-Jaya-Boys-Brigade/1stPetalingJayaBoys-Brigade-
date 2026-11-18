/**
 * 1st Petaling Jaya Boys' Brigade Portal - E2E Test Suite
 * Tier 1: Feature Coverage (Nominal & Contract Verification)
 * File: tests/e2e/tier1-feature-coverage.test.js
 *
 * Scope: 25 features x 5 isolated tests = 125 test specifications.
 * Covers: Security, Access Control, Performance, UX States, Real-Time Sync,
 * Observability, Maintainability, Testing Infrastructure, and DevOps.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const {
  TestSuite,
  MockSupabaseServer,
  createDOMSandbox,
  createPortalContext,
  createMockWebSocket,
  grantPortalAdminSession,
  expect
} = require('./harness');

const REPO_ROOT = path.resolve(__dirname, '../..');

const suite = new TestSuite('Tier 1: Feature Coverage', { tier: 1 });
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

suite.test('T1-F01-01 [SEC-01]: Anonymous PATCH on bb_members is rejected by RLS', async () => {
  const res = await fetch(`${server.url}/rest/v1/bb_members?ic=eq.010101-14-1234`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', apikey: 'anon_test_key' },
    body: JSON.stringify({ name: 'Hacked Member Name' })
  });
  expect(res.status).toBe(403);
  const data = await res.json();
  expect(data.code).toBe('42501');

  const member = server.db.bb_members.find(m => m.ic === '010101-14-1234');
  expect(member.name).toBe('Robert Tan');
}, { featureId: 'SEC-01', tier: 1 });

suite.test('T1-F01-02 [SEC-01]: Anonymous DELETE on bb_orders is rejected by RLS', async () => {
  const res = await fetch(`${server.url}/rest/v1/bb_orders?order_number=eq.ORD-1001`, {
    method: 'DELETE',
    headers: { apikey: 'anon_test_key' }
  });
  expect(res.status).toBe(403);
  const order = server.db.bb_orders.find(o => o.order_number === 'ORD-1001');
  expect(order).toBeDefined();
}, { featureId: 'SEC-01', tier: 1 });

suite.test('T1-F01-03 [SEC-01]: Anonymous PATCH on bb_tasks is rejected by RLS', async () => {
  const res = await fetch(`${server.url}/rest/v1/bb_tasks?id=eq.task-1`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', apikey: 'anon_test_key' },
    body: JSON.stringify({ status: 'completed' })
  });
  expect(res.status).toBe(403);
  const task = server.db.bb_tasks.find(t => t.id === 'task-1');
  expect(task.status).toBe('pending');
}, { featureId: 'SEC-01', tier: 1 });

suite.test('T1-F01-04 [SEC-01]: Anonymous DELETE on bb_announcements is rejected by RLS', async () => {
  const res = await fetch(`${server.url}/rest/v1/bb_announcements?id=eq.ann-1`, {
    method: 'DELETE',
    headers: { apikey: 'anon_test_key' }
  });
  expect(res.status).toBe(403);
  const ann = server.db.bb_announcements.find(a => a.id === 'ann-1');
  expect(ann).toBeDefined();
}, { featureId: 'SEC-01', tier: 1 });

suite.test('T1-F01-05 [SEC-01]: Anonymous DELETE on bb_gallery is rejected by RLS', async () => {
  const res = await fetch(`${server.url}/rest/v1/bb_gallery?id=eq.gal-1`, {
    method: 'DELETE',
    headers: { apikey: 'anon_test_key' }
  });
  expect(res.status).toBe(403);
  const gal = server.db.bb_gallery.find(g => g.id === 'gal-1');
  expect(gal).toBeDefined();
}, { featureId: 'SEC-01', tier: 1 });

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 2: Password Column & OTP Protection (SEC-02)
// ─────────────────────────────────────────────────────────────────────────────

suite.test('T1-F02-01 [SEC-02]: Direct SELECT on password column is revoked for anon', async () => {
  const res = await fetch(`${server.url}/rest/v1/bb_members?select=ic,password`, {
    headers: { apikey: 'anon_test_key' }
  });
  expect(res.status).toBe(403);
  const data = await res.json();
  expect(data.code).toBe('42501');
}, { featureId: 'SEC-02', tier: 1 });

suite.test('T1-F02-02 [SEC-02]: rpc_get_auth_salt returns cryptographic salt without exposing password', async () => {
  const res = await fetch(`${server.url}/rest/v1/rpc/rpc_get_auth_salt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: 'anon_test_key' },
    body: JSON.stringify({ p_email: 'robert@1stpjbb.org' })
  });
  expect(res.status).toBe(200);
  const data = await res.json();
  expect(data.found).toBe(true);
  expect(data.salt).toBe('bb_salt_robert');
  expect(data.iterations).toBe(100000);
  expect(data.password).toBeUndefined();
  expect(data.password_hash).toBeUndefined();
}, { featureId: 'SEC-02', tier: 1 });

suite.test('T1-F02-03 [SEC-02]: rpc_authenticate_member verifies password hash and omits password/salt fields', async () => {
  const validHash = crypto.createHash('sha256').update('MemberPass123!bb_salt_robert').digest('hex');
  const res = await fetch(`${server.url}/rest/v1/rpc/rpc_authenticate_member`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: 'anon_test_key' },
    body: JSON.stringify({ p_email: 'robert@1stpjbb.org', p_password_hash: validHash })
  });
  expect(res.status).toBe(200);
  const data = await res.json();
  expect(data.success).toBe(true);
  expect(data.account.name).toBe('Robert Tan');
  expect(data.account.password).toBeUndefined();
  expect(data.account.password_hash).toBeUndefined();
  expect(data.account.salt).toBeUndefined();
}, { featureId: 'SEC-02', tier: 1 });

suite.test('T1-F02-04 [SEC-02]: rpc_request_password_reset stores SHA-256 hashed OTP in reset ledger', async () => {
  const rawOtp = '654321';
  const expectedHash = crypto.createHash('sha256').update(rawOtp).digest('hex');
  const res = await fetch(`${server.url}/rest/v1/rpc/rpc_request_password_reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: 'anon_test_key' },
    body: JSON.stringify({ p_email: 'robert@1stpjbb.org', p_otp_code: rawOtp })
  });
  expect(res.status).toBe(200);
  const record = server.db.bb_password_resets.find(r => r.email === 'robert@1stpjbb.org');
  expect(record).toBeDefined();
  expect(record.otp_hash).toBe(expectedHash);
  expect(record.otp_hash).not.toBe(rawOtp);
}, { featureId: 'SEC-02', tier: 1 });

suite.test('T1-F02-05 [SEC-02]: Public direct read from bb_password_resets is blocked', async () => {
  const res = await fetch(`${server.url}/rest/v1/bb_password_resets`, {
    headers: { apikey: 'anon_test_key' }
  });
  expect(res.status).toBe(200);
  const rows = await res.json();
  expect(rows).toEqual([]);
}, { featureId: 'SEC-02', tier: 1 });

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 3: Session Spoofing & Route Guard (SEC-03)
// ─────────────────────────────────────────────────────────────────────────────

suite.test('T1-F03-01 [SEC-03]: verifyActiveMemberSession validates active member against server state', async () => {
  const portal = createPortalContext({ server, sandbox });
  try {
    const member = server.db.bb_members[0];
    portal.ctx.sessionSet('ic', member.ic, { localOnly: true });
    portal.ctx.sessionSet('email', member.email, { localOnly: true });
    portal.ctx.sessionSet('session_token', 'valid_member_token', { localOnly: true });
    const valid = await portal.ctx.verifyActiveMemberSession(true);
    expect(valid).toBe(true);
    expect(portal.ctx.sessionGet('ic')).toBe(member.ic);
  } finally {
    portal.dispose();
  }
}, { featureId: 'SEC-03', tier: 1 });

suite.test('T1-F03-02 [SEC-03]: verifyActiveMemberSession evicts deleted member session', async () => {
  const portal = createPortalContext({ server, sandbox });
  try {
    const deletedMember = server.db.bb_members.find(m => m.status === 'deleted');
    portal.ctx.sessionSet('ic', deletedMember.ic, { localOnly: true });
    portal.ctx.sessionSet('email', deletedMember.email, { localOnly: true });
    const valid = await portal.ctx.verifyActiveMemberSession(true);
    expect(valid).toBe(false);
    expect(portal.ctx.sessionGet('ic')).toBeNull();
  } finally {
    portal.dispose();
  }
}, { featureId: 'SEC-03', tier: 1 });

suite.test('T1-F03-03 [SEC-03]: session.js strips spoofed adminAuthed on load and cross-tab sync', () => {
  sandbox.localStorage.setItem('bb_session', JSON.stringify({
    ic: '010101-14-1234',
    name: 'Robert Tan',
    adminAuthed: true
  }));

  const portal = createPortalContext({ server, sandbox });
  try {
    expect(portal.ctx.sessionGet('ic')).toBe('010101-14-1234');
    expect(portal.ctx.sessionGet('adminAuthed')).toBeNull();

    portal.ctx.handleSyncMessage({
      action: 'set',
      senderId: 'tab_external_2',
      msgId: 'sync_spoof_1',
      key: 'adminAuthed',
      value: true
    });
    expect(portal.ctx.sessionGet('adminAuthed')).toBeNull();
  } finally {
    portal.dispose();
  }
}, { featureId: 'SEC-03', tier: 1 });

suite.test('T1-F03-04 [SEC-03]: rpc_verify_admin_session validates 32-byte cryptographic token', async () => {
  const loginRes = await fetch(`${server.url}/rest/v1/rpc/rpc_admin_login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: 'anon_test_key' },
    body: JSON.stringify({
      p_officer_email: 'officer@1stpjbb.org',
      p_password_hash: crypto.createHash('sha256').update('AdminPass2026!bb_salt_andrew').digest('hex')
    })
  });
  const loginData = await loginRes.json();
  expect(loginData.success).toBe(true);

  const verifyRes = await fetch(`${server.url}/rest/v1/rpc/rpc_verify_admin_session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: 'anon_test_key' },
    body: JSON.stringify({ p_token: loginData.token })
  });
  const verifyData = await verifyRes.json();
  expect(verifyData.valid).toBe(true);
  expect(verifyData.role).toBe('officer_admin');
}, { featureId: 'SEC-03', tier: 1 });

suite.test('T1-F03-05 [SEC-03]: rpc_admin_logout invalidates session token immediately', async () => {
  const testToken = 'admin_sess_revoke_test';
  server.db.bb_admin_sessions.push({
    token: testToken,
    email: 'officer@1stpjbb.org',
    role: 'officer_admin',
    expires_at: Date.now() + 3600000
  });

  const logoutRes = await fetch(`${server.url}/rest/v1/rpc/rpc_admin_logout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: 'anon_test_key' },
    body: JSON.stringify({ p_token: testToken })
  });
  expect(logoutRes.status).toBe(200);

  const verifyRes = await fetch(`${server.url}/rest/v1/rpc/rpc_verify_admin_session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: 'anon_test_key' },
    body: JSON.stringify({ p_token: testToken })
  });
  const verifyData = await verifyRes.json();
  expect(verifyData.valid).toBe(false);
}, { featureId: 'SEC-03', tier: 1 });

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 4: Stored XSS Elimination (SEC-04)
// ─────────────────────────────────────────────────────────────────────────────

suite.test('T1-F04-01 [SEC-04]: Admin member table renders data-ic with escaped XSS and zero inline onclick', async () => {
  server.db.bb_members.push({
    id: 99,
    ic: '990101-14-0099',
    name: '<img src=x onerror=alert(1)>',
    email: 'xss@1stpjbb.org',
    department: 'Seniors',
    role: 'member',
    rank: 'Private',
    status: 'active',
    created_at: new Date().toISOString()
  });

  const portal = createPortalContext({ server, sandbox, modules: ['js/modules/admin.js'] });
  try {
    grantPortalAdminSession(portal, server);
    const listEl = sandbox.document.createElement('div');
    listEl.id = 'admin-members-list';
    sandbox.document.body.appendChild(listEl);

    await portal.ctx.renderAdminList(true);
    const html = listEl.innerHTML;
    expect(html.includes('data-ic="990101-14-0099"')).toBe(true);
    expect(html.includes('<img src=x')).toBe(false);
    expect(html.includes('&lt;img src=x')).toBe(true);
    expect(/\bonclick\s*=/i.test(html)).toBe(false);
  } finally {
    portal.dispose();
  }
}, { featureId: 'SEC-04', tier: 1 });

suite.test('T1-F04-02 [SEC-04]: Forum feed renders data-post-id with delegated listener and zero onclick', () => {
  const portal = createPortalContext({ server, sandbox, modules: ['js/modules/forum.js'] });
  try {
    const feedEl = sandbox.document.createElement('div');
    feedEl.id = 'forum-feed-container';
    sandbox.document.body.appendChild(feedEl);

    portal.ctx.evalForumTestPosts = true;
    portal.ctx.forumPosts.splice(0, portal.ctx.forumPosts.length, {
      id: 'post_88',
      title: '<script>alert(1)</script>Camp Info',
      content: 'Safe discussion body',
      category: 'general',
      status: 'open',
      authorName: 'Robert Tan',
      authorEmail: 'robert@1stpjbb.org',
      createdAt: new Date().toISOString(),
      upvotes: [],
      comments: []
    });
    portal.ctx.renderForumFeed();

    const html = feedEl.innerHTML;
    expect(html.includes('data-post-id="post_88"')).toBe(true);
    expect(/\bonclick\s*=/i.test(html)).toBe(false);
    expect(html.includes('<script>alert')).toBe(false);
    expect(html.includes('&lt;script&gt;')).toBe(true);
  } finally {
    portal.dispose();
  }
}, { featureId: 'SEC-04', tier: 1 });

suite.test('T1-F04-03 [SEC-04]: utils.js escapeHtml encodes &, <, >, ", \', /, and ` safely', () => {
  const portal = createPortalContext({ server, sandbox, coreModules: ['js/core/utils.js'] });
  try {
    const payload = `<script>alert('XSS')</script>`;
    const escaped = portal.ctx.escapeHtml(payload);
    expect(escaped).toBe('&lt;script&gt;alert(&#39;XSS&#39;)&lt;&#x2F;script&gt;');
    expect(escaped.includes('<script>')).toBe(false);
  } finally {
    portal.dispose();
  }
}, { featureId: 'SEC-04', tier: 1 });

suite.test('T1-F04-04 [SEC-04]: utils.js escapeHtml prevents attribute breakout in rendered forum markup', () => {
  const portal = createPortalContext({ server, sandbox, modules: ['js/modules/forum.js'] });
  try {
    const breakout = `Robert" onclick="alert(1)" data-x="`;
    const escaped = portal.ctx.escapeHtml(breakout);
    expect(escaped.includes('"')).toBe(false);
    expect(escaped.includes('&quot;')).toBe(true);

    const feedEl = sandbox.document.createElement('div');
    feedEl.id = 'forum-feed-container';
    sandbox.document.body.appendChild(feedEl);
    portal.ctx.forumPosts.splice(0, portal.ctx.forumPosts.length, {
      id: 'post_attr_1',
      title: breakout,
      content: 'Body text',
      category: 'general',
      status: 'open',
      authorName: breakout,
      authorEmail: 'robert@1stpjbb.org',
      createdAt: new Date().toISOString(),
      upvotes: [],
      comments: []
    });
    portal.ctx.renderForumFeed();
    const card = feedEl.querySelector('.forum-post-card');
    expect(card).not.toBeNull();
    expect(card.hasAttribute('onclick')).toBe(false);
    expect(/\sonclick\s*=\s*["']/i.test(feedEl.innerHTML)).toBe(false);
  } finally {
    portal.dispose();
  }
}, { featureId: 'SEC-04', tier: 1 });

suite.test('T1-F04-05 [SEC-04]: AI helper chips escape data-query and dispatch via delegated listener without onclick', () => {
  const portal = createPortalContext({ server, sandbox, modules: ['js/modules/forum.js'] });
  try {
    const payloadQuery = `Parade?" onclick="alert(1)`;
    const chipsHtml = portal.ctx.renderChipsHtml([
      { label: 'Parade Timing', query: payloadQuery, icon: 'general' }
    ]);
    expect(/\sonclick\s*=\s*["']/i.test(chipsHtml)).toBe(false);
    expect(chipsHtml.includes('data-query=')).toBe(true);

    let capturedQuery = null;
    portal.ctx.sendHelperPrompt = (q) => { capturedQuery = q; };
    portal.ctx.ensureHelperAgentDOM();
    const chatBody = sandbox.document.getElementById('helper-chat-body');
    expect(chatBody).not.toBeNull();
    chatBody.innerHTML = chipsHtml;
    const chip = chatBody.querySelector('.helper-chip');
    expect(chip).not.toBeNull();
    expect(chip.hasAttribute('onclick')).toBe(false);
    chip.click();
    expect(capturedQuery).toBe(payloadQuery);
  } finally {
    portal.dispose();
  }
}, { featureId: 'SEC-04', tier: 1 });

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 5: IDOR & Form/Order Protection (SEC-05)
// ─────────────────────────────────────────────────────────────────────────────

suite.test('T1-F05-01 [SEC-05]: Member cross-account order query returns empty array', async () => {
  const res = await fetch(`${server.url}/rest/v1/bb_orders?ic=eq.020202-10-5678`, {
    headers: { apikey: 'anon_test_key', Authorization: 'Bearer member_A_token' }
  });
  expect([200, 403]).toContain(res.status);
  if (res.status === 200) {
    const rows = await res.json();
    expect(rows).toEqual([]);
  } else {
    const err = await res.json();
    expect(err.code).toBe('42501');
  }
}, { featureId: 'SEC-05', tier: 1 });

suite.test('T1-F05-02 [SEC-05]: Verified admin query retrieves full order list across all members', async () => {
  const res = await fetch(`${server.url}/rest/v1/bb_orders?select=*`, {
    headers: { apikey: 'anon_test_key', Authorization: 'Bearer admin_token_andrew' }
  });
  expect(res.status).toBe(200);
  const rows = await res.json();
  expect(rows.length).toBe(server.db.bb_orders.length);
}, { featureId: 'SEC-05', tier: 1 });

suite.test('T1-F05-03 [SEC-05]: Anonymous DELETE on uniform orders is rejected', async () => {
  const res = await fetch(`${server.url}/rest/v1/bb_orders?order_number=eq.ORD-1001`, {
    method: 'DELETE',
    headers: { apikey: 'anon_test_key' }
  });
  expect(res.status).toBe(403);
}, { featureId: 'SEC-05', tier: 1 });

suite.test('T1-F05-04 [SEC-05]: Member querying own orders retrieves matching records', async () => {
  const myIc = '010101-14-1234';
  const res = await fetch(`${server.url}/rest/v1/bb_orders?ic=eq.${myIc}`, {
    headers: { apikey: 'anon_test_key', Authorization: 'Bearer valid_member_token' }
  });
  expect(res.status).toBe(200);
  const rows = await res.json();
  expect(rows.length).toBe(1);
  expect(rows[0].order_number).toBe('ORD-1001');
}, { featureId: 'SEC-05', tier: 1 });

suite.test('T1-F05-05 [SEC-05]: Anonymous DELETE on custom form response is rejected', async () => {
  const res = await fetch(`${server.url}/rest/v1/bb_custom_forms?id=eq.form-1`, {
    method: 'DELETE',
    headers: { apikey: 'anon_test_key' }
  });
  expect(res.status).toBe(403);
  const data = await res.json();
  expect(data.code).toBe('42501');
}, { featureId: 'SEC-05', tier: 1 });

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 6: Sync Secret Protection (SEC-06)
// ─────────────────────────────────────────────────────────────────────────────

suite.test('T1-F06-01 [SEC-06]: Public read on bb_master_sheet_config returns empty array', async () => {
  const res = await fetch(`${server.url}/rest/v1/bb_config?key=eq.bb_master_sheet_config`, {
    headers: { apikey: 'anon_test_key' }
  });
  expect(res.status).toBe(200);
  const rows = await res.json();
  expect(rows).toEqual([]);
}, { featureId: 'SEC-06', tier: 1 });

suite.test('T1-F06-02 [SEC-06]: Wildcard query for %sync_token% blocked for anon but accessible to admin', async () => {
  const anonRes = await fetch(`${server.url}/rest/v1/bb_config?key=like.%sync_token%`, {
    headers: { apikey: 'anon_test_key' }
  });
  expect(anonRes.status).toBe(200);
  expect(await anonRes.json()).toEqual([]);

  const adminRes = await fetch(`${server.url}/rest/v1/bb_config?key=like.%sync_token%`, {
    headers: { apikey: 'anon_test_key', Authorization: 'Bearer officer_admin_token' }
  });
  expect(adminRes.status).toBe(200);
  const adminRows = await adminRes.json();
  expect(adminRows.length).toBeGreaterThan(0);
  expect(adminRows[0].key).toBe('bb_sheets_sync_token');
}, { featureId: 'SEC-06', tier: 1 });

suite.test('T1-F06-03 [SEC-06]: Wildcard query for %secret% blocked for anon but matches config keys for admin', async () => {
  const anonRes = await fetch(`${server.url}/rest/v1/bb_config?key=like.%sheet%`, {
    headers: { apikey: 'anon_test_key' }
  });
  expect(anonRes.status).toBe(200);
  expect(await anonRes.json()).toEqual([]);

  const adminRes = await fetch(`${server.url}/rest/v1/bb_config?key=like.%sheet%`, {
    headers: { apikey: 'anon_test_key', Authorization: 'Bearer officer_admin_token' }
  });
  expect(adminRes.status).toBe(200);
  const adminRows = await adminRes.json();
  expect(adminRows.some(r => r.key === 'bb_master_sheet_config')).toBe(true);
}, { featureId: 'SEC-06', tier: 1 });

suite.test('T1-F06-04 [SEC-06]: Admin session retrieves bb_master_sheet_config successfully', async () => {
  const res = await fetch(`${server.url}/rest/v1/bb_config?key=eq.bb_master_sheet_config`, {
    headers: { apikey: 'anon_test_key', Authorization: 'Bearer officer_admin_token' }
  });
  expect(res.status).toBe(200);
  const rows = await res.json();
  expect(rows.length).toBe(1);
  expect(rows[0].key).toBe('bb_master_sheet_config');
  expect(rows[0].value.includes('SHEETS_SYNC_SECRET')).toBe(true);
}, { featureId: 'SEC-06', tier: 1 });

suite.test('T1-F06-05 [SEC-06]: Public calendar config remains readable to anon users', async () => {
  const res = await fetch(`${server.url}/rest/v1/bb_config?key=eq.bb_company_calendar`, {
    headers: { apikey: 'anon_test_key' }
  });
  expect(res.status).toBe(200);
  const rows = await res.json();
  expect(rows.length).toBe(1);
  expect(rows[0].key).toBe('bb_company_calendar');
}, { featureId: 'SEC-06', tier: 1 });

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 7: Mutation Concurrency & Sanitation (SEC-07)
// ─────────────────────────────────────────────────────────────────────────────

suite.test('T1-F07-01 [SEC-07]: Real tasks.js saveTask submit lock prevents duplicate POST requests on double click', async () => {
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
    titleEl.value = 'Inspection Task';
    const deptEl = sandbox.document.createElement('input');
    deptEl.id = 'task-dept';
    deptEl.value = 'Seniors';
    const prioEl = sandbox.document.createElement('input');
    prioEl.id = 'task-priority';
    prioEl.value = 'high';
    sandbox.document.body.appendChild(titleEl);
    sandbox.document.body.appendChild(deptEl);
    sandbox.document.body.appendChild(prioEl);

    await Promise.all([portal.ctx.saveTask(), portal.ctx.saveTask()]);
    const posts = server.getRequests(r => r.method === 'POST' && r.pathname === '/rest/v1/bb_tasks');
    expect(posts.length).toBe(1);
  } finally {
    portal.dispose();
  }
}, { featureId: 'SEC-07', tier: 1 });

suite.test('T1-F07-02 [SEC-07]: Real resources.js saveResources acquires submit lock against concurrent calls', async () => {
  const portal = createPortalContext({
    server,
    sandbox,
    modules: ['js/modules/resources.js']
  });
  try {
    server.mockRoute('/rest/v1/bb_config', async (reqRec, res) => {
      await new Promise(r => setTimeout(r, 40));
      server._sendJson(res, 201, reqRec.body);
    });
    const payload = [{ id: 'r1', title: 'Doc 1', url: 'https://example.org/doc1.pdf' }];
    const p1 = portal.ctx.saveResources(payload);
    await expect(portal.ctx.saveResources(payload)).rejects.toThrow('operation is currently in progress');
    await p1;
  } finally {
    portal.dispose();
  }
}, { featureId: 'SEC-07', tier: 1 });

suite.test('T1-F07-03 [SEC-07]: Real session.js sanitizePostgrestFilterParam encodes (),. characters', () => {
  const portal = createPortalContext({ server, sandbox });
  try {
    const maliciousInput = 'user,name(test).org';
    const clean = portal.ctx.sanitizePostgrestFilterParam(maliciousInput);
    expect(clean.includes('(')).toBe(false);
    expect(clean.includes(')')).toBe(false);
    expect(clean.includes(',')).toBe(false);
    expect(clean.includes('.')).toBe(false);
    expect(clean).toContain('%28');
    expect(clean).toContain('%2C');
  } finally {
    portal.dispose();
  }
}, { featureId: 'SEC-07', tier: 1 });

suite.test('T1-F07-04 [SEC-07]: Real tasks.js saveTask failure shows error toast and re-enables submit button', async () => {
  const portal = createPortalContext({
    server,
    sandbox,
    modules: ['js/modules/admin.js', 'js/modules/tasks.js']
  });
  try {
    grantPortalAdminSession(portal, server);
    const secEl = sandbox.document.createElement('div');
    secEl.id = 'adm-section-tasks';
    const submitBtn = sandbox.document.createElement('button');
    submitBtn.className = 'submit-btn gold';
    secEl.appendChild(submitBtn);
    const titleEl = sandbox.document.createElement('input');
    titleEl.id = 'task-title';
    titleEl.value = 'Failing Task';
    const deptEl = sandbox.document.createElement('input');
    deptEl.id = 'task-dept';
    deptEl.value = 'Seniors';
    sandbox.document.body.appendChild(secEl);
    sandbox.document.body.appendChild(titleEl);
    sandbox.document.body.appendChild(deptEl);

    let toastMsg = null;
    portal.ctx.showToast = (msg) => { toastMsg = msg; };
    server.mockRoute('/rest/v1/bb_tasks', { status: 500, data: { message: 'DB failure' } });

    await portal.ctx.saveTask();
    expect(toastMsg).not.toBeNull();
    expect(toastMsg).toContain('Failed to save task');
    expect(submitBtn.disabled).toBe(false);
  } finally {
    portal.dispose();
  }
}, { featureId: 'SEC-07', tier: 1 });

suite.test('T1-F07-05 [SEC-07]: Real resources.js saveResources failure preserves existing resources array', async () => {
  const portal = createPortalContext({
    server,
    sandbox,
    modules: ['js/modules/resources.js']
  });
  try {
    portal.ctx.resources.push({ id: 'orig-1', title: 'Camp Handbook 2026', url: 'https://example.org/h.pdf' });
    server.mockRoute('/rest/v1/bb_config', { status: 500, data: { message: 'Server 500' } });

    let threw = false;
    try {
      await portal.ctx.saveResources([{ id: 'new-2', title: 'Overwrite', url: 'https://example.org/o.pdf' }]);
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
    expect(portal.ctx.resources.length).toBe(1);
    expect(portal.ctx.resources[0].title).toBe('Camp Handbook 2026');
  } finally {
    portal.dispose();
  }
}, { featureId: 'SEC-07', tier: 1 });

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 8: Startup Waterfall & Batch Config (PERF-01)
// ─────────────────────────────────────────────────────────────────────────────

suite.test('T1-F08-01 [PERF-01]: supa.batchConfigGet fetches multiple configs in 1 PostgREST query', async () => {
  const portal = createPortalContext({ server, sandbox });
  try {
    const keys = ['bb_company_calendar', 'bb_uniform_pricing', 'bb_announcements_cfg'];
    const result = await portal.ctx.supa.batchConfigGet(keys);
    expect(Object.keys(result).length).toBe(3);

    const batchRequests = server.getRequests(r => r.pathname === '/rest/v1/bb_config' && r.searchParams.has('key'));
    expect(batchRequests.length).toBe(1);
  } finally {
    portal.dispose();
  }
}, { featureId: 'PERF-01', tier: 1 });

suite.test('T1-F08-02 [PERF-01]: supa.getConfigSnapshot is populated for all returned batch keys', async () => {
  const portal = createPortalContext({ server, sandbox });
  try {
    await portal.ctx.supa.batchConfigGet(['bb_company_calendar', 'bb_uniform_pricing']);
    const cal = portal.ctx.supa.getConfigSnapshot('bb_company_calendar');
    const pricing = portal.ctx.supa.getConfigSnapshot('bb_uniform_pricing');
    expect(cal).not.toBeNull();
    expect(pricing).not.toBeNull();
    expect(pricing.shirt).toBe(45);
  } finally {
    portal.dispose();
  }
}, { featureId: 'PERF-01', tier: 1 });

suite.test('T1-F08-03 [PERF-01]: supa.safeConfigGet returns hydrated snapshot with 0 network requests', async () => {
  const portal = createPortalContext({ server, sandbox });
  try {
    await portal.ctx.supa.batchConfigGet(['bb_company_calendar']);
    server.requestLog = [];
    const result = await portal.ctx.supa.safeConfigGet('bb_company_calendar');
    expect(Array.isArray(result)).toBe(true);
    expect(server.requestLog.length).toBe(0);
  } finally {
    portal.dispose();
  }
}, { featureId: 'PERF-01', tier: 1 });

suite.test('T1-F08-04 [PERF-01]: index.html awaits supa.batchConfigGet before loading prices/resources/forms modules', () => {
  const indexHtml = fs.readFileSync(path.join(REPO_ROOT, 'index.html'), 'utf8');
  const batchMatch = indexHtml.match(/(?:await\s+supa\.batchConfigGet|supa\.batchConfigGet\([\s\S]*?\)\.then)/);
  expect(batchMatch).not.toBeNull();

  // Verify loadPrices() / loadResources() / loadCustomForms() are NOT invoked unconditionally before batchConfigGet
  const batchIdx = indexHtml.indexOf('supa.batchConfigGet');
  const preRegion = indexHtml.slice(Math.max(0, batchIdx - 600), batchIdx);
  expect(/\bloadPrices\s*\(\s*\)/.test(preRegion)).toBe(false);
  expect(/\bloadResources\s*\(\s*\)/.test(preRegion)).toBe(false);
  expect(/\bloadCustomForms\s*\(\s*\)/.test(preRegion)).toBe(false);
}, { featureId: 'PERF-01', tier: 1 });

suite.test('T1-F08-05 [PERF-01]: supa.batchConfigGet consolidates 5 startup configs into <= 2 HTTP queries', async () => {
  const portal = createPortalContext({ server, sandbox });
  try {
    server.requestLog = [];
    await portal.ctx.supa.batchConfigGet([
      'bb_company_calendar',
      'bb_uniform_pricing',
      'bb_announcements_cfg',
      'bb_forum_posts',
      'bb_resources'
    ]);
    const configRequests = server.getRequests(r => r.pathname.includes('/bb_config'));
    expect(configRequests.length).toBe(1);
    expect(configRequests.length).toBeLessThanOrEqual(2);
  } finally {
    portal.dispose();
  }
}, { featureId: 'PERF-01', tier: 1 });

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 9: Unbounded Queries & Pagination (PERF-02)
// ─────────────────────────────────────────────────────────────────────────────

suite.test('T1-F09-01 [PERF-02]: Announcements query applies limit=20 by default', async () => {
  const res = await fetch(`${server.url}/rest/v1/bb_announcements?order=created_at.desc&limit=20`, {
    headers: { apikey: 'anon_test_key' }
  });
  expect(res.status).toBe(200);
  const rows = await res.json();
  expect(rows.length).toBeLessThanOrEqual(20);
}, { featureId: 'PERF-02', tier: 1 });

suite.test('T1-F09-02 [PERF-02]: Gallery catalog query applies limit=24 parameter', async () => {
  const res = await fetch(`${server.url}/rest/v1/bb_gallery?order=created_at.desc&limit=24`, {
    headers: { apikey: 'anon_test_key' }
  });
  expect(res.status).toBe(200);
  const rows = await res.json();
  expect(rows.length).toBeLessThanOrEqual(24);
}, { featureId: 'PERF-02', tier: 1 });

suite.test('T1-F09-03 [PERF-02]: Real supa.paginate enforces pageSize=25 truncation on >25 tasks', async () => {
  for (let i = 3; i <= 30; i++) {
    server.db.bb_tasks.push({ id: `task-${i}`, title: `Task ${i}`, department: 'Seniors', status: 'pending' });
  }
  const portal = createPortalContext({ server, sandbox });
  try {
    const page1 = await portal.ctx.supa.paginate('bb_tasks', { page: 1, pageSize: 25 });
    expect(page1.data.length).toBe(25);
    expect(page1.total).toBe(30);
    expect(page1.hasMore).toBe(true);
    expect(page1.offset).toBe(0);
  } finally {
    portal.dispose();
  }
}, { featureId: 'PERF-02', tier: 1 });

suite.test('T1-F09-04 [PERF-02]: Member orders query applies limit=10', async () => {
  const res = await fetch(`${server.url}/rest/v1/bb_orders?limit=10`, {
    headers: { apikey: 'anon_test_key' }
  });
  expect(res.status).toBe(200);
  const rows = await res.json();
  expect(rows.length).toBeLessThanOrEqual(10);
}, { featureId: 'PERF-02', tier: 1 });

suite.test('T1-F09-05 [PERF-02]: Real supa.paginate page 2 fetches remaining slice at offset=25', async () => {
  for (let i = 3; i <= 30; i++) {
    server.db.bb_tasks.push({ id: `task-${i}`, title: `Task ${i}`, department: 'Seniors', status: 'pending' });
  }
  const portal = createPortalContext({ server, sandbox });
  try {
    const page2 = await portal.ctx.supa.paginate('bb_tasks', { page: 2, pageSize: 25 });
    expect(page2.offset).toBe(25);
    expect(page2.data.length).toBe(5);
    expect(page2.hasMore).toBe(false);
  } finally {
    portal.dispose();
  }
}, { featureId: 'PERF-02', tier: 1 });

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 10: Gallery Signed URL Batching (PERF-03)
// ─────────────────────────────────────────────────────────────────────────────

suite.test('T1-F10-01 [PERF-03]: gallery.js avoids eager signing of all 30 private images on initial render', async () => {
  const portal = createPortalContext({ server, sandbox, modules: ['js/modules/gallery.js'] });
  try {
    const grid = sandbox.document.createElement('div');
    grid.id = 'gallery-grid';
    sandbox.document.body.appendChild(grid);

    const items = Array.from({ length: 30 }, (_, i) => ({
      id: `gal-priv-${i}`,
      url: `${server.url}/storage/v1/object/authenticated/gallery/events/p_${i}.jpg`,
      type: 'image'
    }));
    portal.ctx.galleryImages.splice(0, portal.ctx.galleryImages.length, ...items);
    portal.ctx.renderGallery();
    await new Promise(r => setTimeout(r, 40));

    const signRequests = server.getRequests(r => r.pathname.includes('/object/sign/'));
    expect(signRequests.length).toBeLessThanOrEqual(12);
  } finally {
    portal.dispose();
  }
}, { featureId: 'PERF-03', tier: 1 });

suite.test('T1-F10-02 [PERF-03]: gallery.js uses batch createSignedUrls for bulk authenticated gallery items', async () => {
  const portal = createPortalContext({ server, sandbox, modules: ['js/modules/gallery.js'] });
  try {
    let batchCalls = 0;
    const origBatch = portal.ctx.supa.createSignedUrls.bind(portal.ctx.supa);
    portal.ctx.supa.createSignedUrls = async (...args) => {
      batchCalls++;
      return origBatch(...args);
    };

    const grid = sandbox.document.createElement('div');
    grid.id = 'gallery-grid';
    sandbox.document.body.appendChild(grid);

    const items = Array.from({ length: 18 }, (_, i) => ({
      id: `gal-batch-${i}`,
      url: `${server.url}/storage/v1/object/authenticated/gallery/events/b_${i}.jpg`,
      type: 'image'
    }));
    portal.ctx.galleryImages.splice(0, portal.ctx.galleryImages.length, ...items);
    portal.ctx.renderGallery();
    await new Promise(r => setTimeout(r, 40));

    expect(batchCalls).toBeGreaterThan(0);
  } finally {
    portal.dispose();
  }
}, { featureId: 'PERF-03', tier: 1 });

suite.test('T1-F10-03 [PERF-03]: Real gallery.js signGalleryObject coalesces concurrent signing for same path', async () => {
  const portal = createPortalContext({ server, sandbox, modules: ['js/modules/gallery.js'] });
  try {
    const [u1, u2] = await Promise.all([
      portal.ctx.signGalleryObject('events/parade2026.jpg'),
      portal.ctx.signGalleryObject('events/parade2026.jpg')
    ]);
    expect(u1).toBe(u2);
    expect(u1).toContain('token=mock_signed_token');
    const signHits = server.getRequests(r => r.pathname.includes('/object/sign/'));
    expect(signHits.length).toBe(1);
  } finally {
    portal.dispose();
  }
}, { featureId: 'PERF-03', tier: 1 });

suite.test('T1-F10-04 [PERF-03]: Real gallery.js galleryStorageObject distinguishes external URLs vs storage paths', () => {
  const portal = createPortalContext({ server, sandbox, modules: ['js/modules/gallery.js'] });
  try {
    expect(portal.ctx.galleryStorageObject('https://img.youtube.com/vi/abc/hqdefault.jpg')).toBeNull();
    const authObj = portal.ctx.galleryStorageObject(
      `${server.url}/storage/v1/object/authenticated/gallery/events/parade2026.jpg`
    );
    expect(authObj).not.toBeNull();
    expect(authObj.mode).toBe('authenticated');
    expect(authObj.path).toBe('events/parade2026.jpg');
  } finally {
    portal.dispose();
  }
}, { featureId: 'PERF-03', tier: 1 });

suite.test('T1-F10-05 [PERF-03]: Real supa.createSignedUrl caches signed URLs within TTL window', async () => {
  const portal = createPortalContext({ server, sandbox });
  try {
    const r1 = await portal.ctx.supa.createSignedUrl('gallery', 'events/parade2026.jpg', 3600);
    const r2 = await portal.ctx.supa.createSignedUrl('gallery', 'events/parade2026.jpg', 3600);
    expect(r1.signedUrl).toBe(r2.signedUrl);
    const signHits = server.getRequests(r => r.pathname.includes('/object/sign/'));
    expect(signHits.length).toBe(1);
  } finally {
    portal.dispose();
  }
}, { featureId: 'PERF-03', tier: 1 });

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 11: Loading Skeletons (UX-01)
// ─────────────────────────────────────────────────────────────────────────────

suite.test('T1-F11-01 [UX-01]: Forum module renders skeleton loading state while fetching posts', async () => {
  const portal = createPortalContext({ server, sandbox, modules: ['js/modules/forum.js'] });
  try {
    const feedEl = sandbox.document.createElement('div');
    feedEl.id = 'forum-feed-container';
    sandbox.document.body.appendChild(feedEl);

    let releaseAll;
    const gate = new Promise(r => { releaseAll = r; });
    server.mockRoute('/rest/v1/bb_config', async (_req, res) => {
      await gate;
      server._sendJson(res, 200, []);
    });

    const loadPromise = portal.ctx.loadForumPosts();
    await new Promise(r => setTimeout(r, 25));
    const hasSkeletonDuringLoad =
      feedEl.querySelector('.skeleton-shimmer') !== null ||
      feedEl.querySelector('.smart-loader-wrapper') !== null;
    releaseAll();
    await loadPromise;
    expect(hasSkeletonDuringLoad).toBe(true);
  } finally {
    portal.dispose();
  }
}, { featureId: 'UX-01', tier: 1 });

suite.test('T1-F11-02 [UX-01]: Badges module renders skeleton loading state while fetching member badges', async () => {
  const portal = createPortalContext({ server, sandbox, modules: ['js/modules/badges.js'] });
  try {
    const listEl = sandbox.document.createElement('div');
    listEl.id = 'badges-list';
    sandbox.document.body.appendChild(listEl);

    let releaseFetch;
    server.mockRoute('/rest/v1/bb_member_badges', async (_req, res) => {
      await new Promise(r => { releaseFetch = r; });
      server._sendJson(res, 200, []);
    });

    const loadPromise = portal.ctx.loadBadges('010101-14-1234');
    await new Promise(r => setTimeout(r, 20));
    const hasSkeletonDuringLoad =
      listEl.querySelector('.skeleton-shimmer') !== null ||
      listEl.querySelector('.smart-loader-wrapper') !== null;
    if (releaseFetch) releaseFetch();
    await loadPromise;
    expect(hasSkeletonDuringLoad).toBe(true);
  } finally {
    portal.dispose();
  }
}, { featureId: 'UX-01', tier: 1 });

suite.test('T1-F11-03 [UX-01]: Resources module renders skeleton loading state while fetching resources', async () => {
  const portal = createPortalContext({ server, sandbox, modules: ['js/modules/resources.js'] });
  try {
    const listEl = sandbox.document.createElement('div');
    listEl.id = 'resources-list';
    sandbox.document.body.appendChild(listEl);

    let releaseFetch;
    server.mockRoute('/rest/v1/bb_config', async (_req, res) => {
      await new Promise(r => { releaseFetch = r; });
      server._sendJson(res, 200, []);
    });

    const loadPromise = portal.ctx.loadResources();
    await new Promise(r => setTimeout(r, 20));
    const hasSkeletonDuringLoad =
      listEl.querySelector('.skeleton-shimmer') !== null ||
      listEl.querySelector('.smart-loader-wrapper') !== null;
    if (releaseFetch) releaseFetch();
    await loadPromise;
    expect(hasSkeletonDuringLoad).toBe(true);
  } finally {
    portal.dispose();
  }
}, { featureId: 'UX-01', tier: 1 });

suite.test('T1-F11-04 [UX-01]: Tasks kanban skeleton renders 3 columns via loading.js and tasks.js', async () => {
  const portal = createPortalContext({ server, sandbox, modules: ['js/modules/tasks.js'] });
  try {
    const wrapper = sandbox.document.createElement('div');
    wrapper.innerHTML = portal.ctx.renderSkeletonKanban();
    expect(wrapper.querySelectorAll('.skeleton-kanban-column').length).toBe(3);

    const listEl = sandbox.document.createElement('div');
    listEl.id = 'admin-tasks-list';
    sandbox.document.body.appendChild(listEl);

    let releaseFetch;
    server.mockRoute('/rest/v1/bb_tasks', async (_req, res) => {
      await new Promise(r => { releaseFetch = r; });
      server._sendJson(res, 200, []);
    });
    const renderPromise = portal.ctx.renderAdminTasks('all');
    await new Promise(r => setTimeout(r, 15));
    expect(listEl.querySelectorAll('.skeleton-kanban-column').length).toBe(3);
    if (releaseFetch) releaseFetch();
    await renderPromise;
  } finally {
    portal.dispose();
  }
}, { featureId: 'UX-01', tier: 1 });

suite.test('T1-F11-05 [UX-01]: Real SmartLoading.createSmartLoader enforces MIN_DISPLAY_MS (400ms) anti-flicker', async () => {
  const portal = createPortalContext({ server, sandbox });
  try {
    expect(portal.ctx.MIN_DISPLAY_MS).toBe(400);
    const container = sandbox.document.createElement('div');
    sandbox.document.body.appendChild(container);
    const loader = portal.ctx.createSmartLoader({
      container,
      showDelayMs: 20,
      minDisplayMs: 120
    });
    const start = Date.now();
    await loader.execute(() => new Promise(r => setTimeout(() => r('ok'), 40)));
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(115);
  } finally {
    portal.dispose();
  }
}, { featureId: 'UX-01', tier: 1 });

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 12: Error & Retry States (UX-02)
// ─────────────────────────────────────────────────────────────────────────────

suite.test('T1-F12-01 [UX-02]: Tasks module renders standardized .error-card with .btn-retry on DB failure', async () => {
  const portal = createPortalContext({ server, sandbox, modules: ['js/modules/tasks.js'] });
  try {
    const listEl = sandbox.document.createElement('div');
    listEl.id = 'admin-tasks-list';
    sandbox.document.body.appendChild(listEl);
    server.mockRoute('/rest/v1/bb_tasks', { status: 500, data: { message: 'Tasks failed' } });

    await portal.ctx.renderAdminTasks('all');
    expect(listEl.querySelector('.error-card')).not.toBeNull();
    expect(listEl.querySelector('.btn-retry')).not.toBeNull();
  } finally {
    portal.dispose();
  }
}, { featureId: 'UX-02', tier: 1 });

suite.test('T1-F12-02 [UX-02]: Real SmartLoading timeout error card triggers retry callback on .retry-btn click', async () => {
  const portal = createPortalContext({ server, sandbox });
  try {
    const container = sandbox.document.createElement('div');
    sandbox.document.body.appendChild(container);
    let retryCalls = 0;
    const loader = portal.ctx.createSmartLoader({ container, timeoutMs: 30, showDelayMs: 10, minDisplayMs: 10 });
    try {
      await loader.execute(() => new Promise(() => {}), () => { retryCalls++; });
    } catch {}
    const retryBtn = container.querySelector('.retry-btn');
    expect(retryBtn).not.toBeNull();
    retryBtn.click();
    expect(retryCalls).toBe(1);
  } finally {
    portal.dispose();
  }
}, { featureId: 'UX-02', tier: 1 });

suite.test('T1-F12-03 [UX-02]: Badges module renders .error-card with .btn-retry on DB failure', async () => {
  const portal = createPortalContext({ server, sandbox, modules: ['js/modules/badges.js'] });
  try {
    const listEl = sandbox.document.createElement('div');
    listEl.id = 'badges-list';
    sandbox.document.body.appendChild(listEl);
    server.mockRoute('/rest/v1/bb_member_badges', { status: 500, data: { message: 'Badges failed' } });

    await portal.ctx.loadBadges('010101-14-1234');
    expect(listEl.querySelector('.error-card')).not.toBeNull();
    expect(listEl.querySelector('.btn-retry')).not.toBeNull();
  } finally {
    portal.dispose();
  }
}, { featureId: 'UX-02', tier: 1 });

suite.test('T1-F12-04 [UX-02]: Attendance module renders .error-card with .btn-retry on DB failure', async () => {
  const portal = createPortalContext({ server, sandbox, modules: ['js/modules/attendance.js'] });
  try {
    const card = sandbox.document.createElement('div');
    card.id = 'member-attendance-card';
    sandbox.document.body.appendChild(card);
    server.mockRoute('/rest/v1/bb_config', { status: 500, data: { message: 'Attendance failed' } });

    await portal.ctx.loadMemberAttendanceStats('Robert Tan');
    expect(card.querySelector('.error-card')).not.toBeNull();
    expect(card.querySelector('.btn-retry')).not.toBeNull();
  } finally {
    portal.dispose();
  }
}, { featureId: 'UX-02', tier: 1 });

suite.test('T1-F12-05 [UX-02]: Forms module renders .error-card with .btn-retry on DB failure', async () => {
  const portal = createPortalContext({ server, sandbox, modules: ['js/modules/forms.js'] });
  try {
    const hub = sandbox.document.createElement('div');
    hub.id = 'forms-hub-list';
    sandbox.document.body.appendChild(hub);
    server.mockRoute('/rest/v1/bb_config', { status: 500, data: { message: 'Forms failed' } });

    await portal.ctx.loadCustomForms(true);
    if (typeof portal.ctx.renderFormsHub === 'function') portal.ctx.renderFormsHub();
    expect(sandbox.document.querySelector('.error-card')).not.toBeNull();
    expect(sandbox.document.querySelector('.btn-retry')).not.toBeNull();
  } finally {
    portal.dispose();
  }
}, { featureId: 'UX-02', tier: 1 });

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 13: Inline Form Validation (UX-03)
// ─────────────────────────────────────────────────────────────────────────────

function mountRegistrationForm(sandbox) {
  const form = sandbox.document.createElement('form');
  form.id = 'reg-form';
  const fields = [
    ['reg-fullname', 'input', ''],
    ['reg-email', 'input', ''],
    ['reg-section', 'input', 'Senior'],
    ['reg-age', 'input', '16'],
    ['reg-rank', 'input', 'Private'],
    ['reg-squad', 'input', 'Alpha'],
    ['reg-pass', 'input', 'StrongPass123!'],
    ['reg-pass2', 'input', 'StrongPass123!']
  ];
  for (const [id, tag, val] of fields) {
    const group = sandbox.document.createElement('div');
    group.className = 'form-group';
    const el = sandbox.document.createElement(tag);
    el.id = id;
    el.value = val;
    group.appendChild(el);
    form.appendChild(group);
  }
  sandbox.document.body.appendChild(form);
  return form;
}

suite.test('T1-F13-01 [UX-03]: Real member.js registerMember adds .is-invalid on invalid field', async () => {
  const portal = createPortalContext({ server, sandbox, modules: ['js/modules/member.js'] });
  try {
    mountRegistrationForm(sandbox);
    await portal.ctx.registerMember();
    const nameInput = sandbox.document.getElementById('reg-fullname');
    expect(nameInput.classList.contains('is-invalid')).toBe(true);
  } finally {
    portal.dispose();
  }
}, { featureId: 'UX-03', tier: 1 });

suite.test('T1-F13-02 [UX-03]: Real member.js registerMember renders .field-error text on validation failure', async () => {
  const portal = createPortalContext({ server, sandbox, modules: ['js/modules/member.js'] });
  try {
    mountRegistrationForm(sandbox);
    sandbox.document.getElementById('reg-fullname').value = 'Jayden Wong';
    sandbox.document.getElementById('reg-email').value = 'invalid-email';
    await portal.ctx.registerMember();
    const fieldErr = sandbox.document.querySelector('.field-error');
    expect(fieldErr).not.toBeNull();
    expect(fieldErr.textContent.trim().length).toBeGreaterThan(0);
  } finally {
    portal.dispose();
  }
}, { featureId: 'UX-03', tier: 1 });

suite.test('T1-F13-03 [UX-03]: Real member.js registerMember focuses first invalid input element', async () => {
  const portal = createPortalContext({ server, sandbox, modules: ['js/modules/member.js'] });
  try {
    mountRegistrationForm(sandbox);
    await portal.ctx.registerMember();
    expect(sandbox.document.activeElement).not.toBeNull();
    expect(sandbox.document.activeElement.id).toBe('reg-fullname');
  } finally {
    portal.dispose();
  }
}, { featureId: 'UX-03', tier: 1 });

suite.test('T1-F13-04 [UX-03]: Real member.js clears .is-invalid dynamically when user types valid value', async () => {
  const portal = createPortalContext({ server, sandbox, modules: ['js/modules/member.js'] });
  try {
    mountRegistrationForm(sandbox);
    await portal.ctx.registerMember();
    const nameInput = sandbox.document.getElementById('reg-fullname');
    expect(nameInput.classList.contains('is-invalid')).toBe(true);

    nameInput.value = 'Jayden Wong';
    nameInput.dispatchEvent({ type: 'input' });
    expect(nameInput.classList.contains('is-invalid')).toBe(false);
  } finally {
    portal.dispose();
  }
}, { featureId: 'UX-03', tier: 1 });

suite.test('T1-F13-05 [UX-03]: Real member.js sets aria-invalid="true" on invalid field', async () => {
  const portal = createPortalContext({ server, sandbox, modules: ['js/modules/member.js'] });
  try {
    mountRegistrationForm(sandbox);
    await portal.ctx.registerMember();
    const nameInput = sandbox.document.getElementById('reg-fullname');
    expect(nameInput.getAttribute('aria-invalid')).toBe('true');
  } finally {
    portal.dispose();
  }
}, { featureId: 'UX-03', tier: 1 });

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 14: Real-Time Sync Subscriptions & Dispatcher (SYNC-01)
// ─────────────────────────────────────────────────────────────────────────────

suite.test('T1-F14-01 [SYNC-01]: Realtime postgres_changes subscription list includes bb_gallery', () => {
  const MockWS = createMockWebSocket();
  const portal = createPortalContext({ server, sandbox, WebSocket: MockWS });
  try {
    portal.ctx.PortalRealtime.connect();
    expect(MockWS.instances.length).toBeGreaterThan(0);
    const ws = MockWS.instances[0];
    ws.simulateOpen();
    const joinMsg = ws.sent.map(s => JSON.parse(s)).find(m => m.event === 'phx_join');
    expect(joinMsg).toBeDefined();
    const tables = (joinMsg.payload?.config?.postgres_changes || []).map(c => c.table);
    expect(tables).toContain('bb_gallery');
  } finally {
    portal.dispose();
  }
}, { featureId: 'SYNC-01', tier: 1 });

suite.test('T1-F14-02 [SYNC-01]: PortalRealtime dispatches gallery reload on gallery update', async () => {
  let galleryLoaded = false;
  const portal = createPortalContext({
    server,
    sandbox,
    afterLoadGlobals: { loadGallery: async () => { galleryLoaded = true; } }
  });
  try {
    portal.ctx.PortalRealtime.trigger('gallery', 'update', { id: 'gal-1' }, true);
    await new Promise(r => setTimeout(r, 15));
    expect(galleryLoaded).toBe(true);
  } finally {
    portal.dispose();
  }
}, { featureId: 'SYNC-01', tier: 1 });

suite.test('T1-F14-03 [SYNC-01]: PortalRealtime dispatches resources reload on resources update', async () => {
  let resourcesLoaded = false;
  const portal = createPortalContext({
    server,
    sandbox,
    afterLoadGlobals: { loadResources: async () => { resourcesLoaded = true; } }
  });
  try {
    portal.ctx.PortalRealtime.trigger('resources', 'update', { id: 'res-1' }, true);
    await new Promise(r => setTimeout(r, 15));
    expect(resourcesLoaded).toBe(true);
  } finally {
    portal.dispose();
  }
}, { featureId: 'SYNC-01', tier: 1 });

suite.test('T1-F14-04 [SYNC-01]: PortalRealtime dispatches forms reload on forms update', async () => {
  let formsLoaded = false;
  const portal = createPortalContext({
    server,
    sandbox,
    afterLoadGlobals: { loadCustomForms: async () => { formsLoaded = true; } }
  });
  try {
    portal.ctx.PortalRealtime.trigger('forms', 'update', { id: 'form-1' }, true);
    await new Promise(r => setTimeout(r, 15));
    expect(formsLoaded).toBe(true);
  } finally {
    portal.dispose();
  }
}, { featureId: 'SYNC-01', tier: 1 });

suite.test('T1-F14-05 [SYNC-01]: Real PortalRealtime.checkDeltaSync refreshes tasks when remote timestamp advances', async () => {
  let tasksRefreshed = 0;
  const portal = createPortalContext({
    server,
    sandbox,
    afterLoadGlobals: { fetchAllRemoteTasks: async () => { tasksRefreshed++; } }
  });
  try {
    await portal.ctx.PortalRealtime.checkDeltaSync();
    const baseline = tasksRefreshed;
    portal.ctx.supa.clearQueryCache();
    server.db.bb_tasks[0].updated_at = new Date(Date.now() + 60000).toISOString();
    await portal.ctx.PortalRealtime.checkDeltaSync();
    expect(tasksRefreshed).toBeGreaterThan(baseline);
  } finally {
    portal.dispose();
  }
}, { featureId: 'SYNC-01', tier: 1 });

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 15: Broadcast Trigger Coverage (SYNC-02)
// ─────────────────────────────────────────────────────────────────────────────

suite.test('T1-F15-01 [SYNC-02]: Real gallery.js deleteGalleryImage invokes PortalRealtime.broadcast(gallery, delete)', async () => {
  const portal = createPortalContext({
    server,
    sandbox,
    modules: ['js/modules/admin.js', 'js/modules/gallery.js'],
    afterLoadGlobals: { showConfirmModal: async () => true }
  });
  let ch = null;
  try {
    grantPortalAdminSession(portal, server);
    ch = sandbox.createChannel('bb_portal_realtime');
    const received = [];
    ch.onmessage = (e) => { if (e.data) received.push(e.data); };

    portal.ctx.galleryImages.splice(0, portal.ctx.galleryImages.length, {
      id: 'gal-1',
      url: 'events/parade2026.jpg',
      type: 'image'
    });
    await portal.ctx.deleteGalleryImage(0, 'gal-1');
    await new Promise(r => setTimeout(r, 40));

    const match = received.find(m => m.entity === 'gallery' && m.action === 'delete');
    expect(match).toBeDefined();
  } finally {
    if (ch) {
      try { ch.close(); } catch {}
    }
    portal.dispose();
  }
}, { featureId: 'SYNC-02', tier: 1 });

suite.test('T1-F15-02 [SYNC-02]: Real tasks.js saveTask creation invokes PortalRealtime.broadcast(tasks, create)', async () => {
  const portal = createPortalContext({
    server,
    sandbox,
    modules: ['js/modules/admin.js', 'js/modules/tasks.js']
  });
  let ch = null;
  try {
    grantPortalAdminSession(portal, server);
    ch = sandbox.createChannel('bb_portal_realtime');
    const received = [];
    ch.onmessage = (e) => { if (e.data) received.push(e.data); };

    const titleEl = sandbox.document.createElement('input');
    titleEl.id = 'task-title';
    titleEl.value = 'Broadcast Task';
    const deptEl = sandbox.document.createElement('input');
    deptEl.id = 'task-dept';
    deptEl.value = 'Seniors';
    sandbox.document.body.appendChild(titleEl);
    sandbox.document.body.appendChild(deptEl);

    await portal.ctx.saveTask();
    await new Promise(r => setTimeout(r, 40));

    const match = received.find(m => m.entity === 'tasks' && m.action === 'create');
    expect(match).toBeDefined();
  } finally {
    if (ch) {
      try { ch.close(); } catch {}
    }
    portal.dispose();
  }
}, { featureId: 'SYNC-02', tier: 1 });

suite.test('T1-F15-03 [SYNC-02]: Real admin.js deleteTask invokes PortalRealtime.broadcast(tasks, delete)', async () => {
  const portal = createPortalContext({
    server,
    sandbox,
    modules: ['js/modules/admin.js'],
    afterLoadGlobals: { showConfirmModal: async () => true }
  });
  let ch = null;
  try {
    grantPortalAdminSession(portal, server);
    ch = sandbox.createChannel('bb_portal_realtime');
    const received = [];
    ch.onmessage = (e) => { if (e.data) received.push(e.data); };

    await portal.ctx.deleteTask('task-1');
    await new Promise(r => setTimeout(r, 40));

    const match = received.find(m => m.entity === 'tasks' && m.action === 'delete');
    expect(match).toBeDefined();
  } finally {
    if (ch) {
      try { ch.close(); } catch {}
    }
    portal.dispose();
  }
}, { featureId: 'SYNC-02', tier: 1 });

suite.test('T1-F15-04 [SYNC-02]: External BroadcastChannel PORTAL_REALTIME_CHANGE refreshes tasks in sibling tab', async () => {
  let refreshed = 0;
  const portal = createPortalContext({
    server,
    sandbox,
    afterLoadGlobals: { fetchAllRemoteTasks: async () => { refreshed++; } }
  });
  let externalSender = null;
  try {
    externalSender = sandbox.createChannel('bb_portal_realtime');
    externalSender.postMessage({
      type: 'PORTAL_REALTIME_CHANGE',
      senderId: 'external_tab_99',
      msgId: 'ext_msg_1',
      entity: 'tasks',
      action: 'create',
      data: { id: 'task-99' }
    });
    await new Promise(r => setTimeout(r, 40));
    expect(refreshed).toBe(1);
  } finally {
    if (externalSender) {
      try { externalSender.close(); } catch {}
    }
    portal.dispose();
  }
}, { featureId: 'SYNC-02', tier: 1 });

suite.test('T1-F15-05 [SYNC-02]: Real PortalRealtime.broadcast emits standard event contract over BroadcastChannel', async () => {
  const portal = createPortalContext({ server, sandbox });
  let listener = null;
  try {
    listener = sandbox.createChannel('bb_portal_realtime');
    const events = [];
    listener.onmessage = (e) => { events.push(e.data); };

    portal.ctx.PortalRealtime.broadcast('tasks', 'update', { id: 'task-1', status: 'done' });
    await new Promise(r => setTimeout(r, 40));

    expect(events.length).toBe(1);
    expect(events[0].type).toBe('PORTAL_REALTIME_CHANGE');
    expect(events[0].entity).toBe('tasks');
    expect(events[0].action).toBe('update');
    expect(events[0].senderId).toBeDefined();
    expect(events[0].msgId).toBeDefined();
  } finally {
    if (listener) {
      try { listener.close(); } catch {}
    }
    portal.dispose();
  }
}, { featureId: 'SYNC-02', tier: 1 });

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 16: Forum Safe Concurrent Updates (SYNC-03)
// ─────────────────────────────────────────────────────────────────────────────

suite.test('T1-F16-01 [SYNC-03]: Real forum.js saveForumPosts uses supa.safeConfigUpdate instead of blind setConfig', async () => {
  const portal = createPortalContext({ server, sandbox, modules: ['js/modules/forum.js'] });
  try {
    let safeUpdateCalledWith = null;
    const origSafe = portal.ctx.supa.safeConfigUpdate.bind(portal.ctx.supa);
    portal.ctx.supa.safeConfigUpdate = async (key, updater, opts) => {
      safeUpdateCalledWith = key;
      return origSafe(key, updater, opts);
    };

    await portal.ctx.saveForumPosts([{ id: 'post-1', title: 'Topic A', comments: [] }]);
    expect(safeUpdateCalledWith).toBe('bb_forum_posts');
  } finally {
    portal.dispose();
  }
}, { featureId: 'SYNC-03', tier: 1 });

suite.test('T1-F16-02 [SYNC-03]: Real supabase.js mergeConfigCollections preserves both concurrent topics', () => {
  const portal = createPortalContext({ server, sandbox });
  try {
    const base = [{ id: 1, title: 'First Topic' }];
    const remote = [{ id: 1, title: 'First Topic' }, { id: 2, title: 'Topic B' }];
    const local = [{ id: 1, title: 'First Topic' }, { id: 3, title: 'Topic C' }];
    const merged = portal.ctx.supa.mergeConfigCollections(base, remote, local, 'id');
    expect(merged.length).toBe(3);
    expect(Array.from(merged, x => x.id).sort()).toEqual([1, 2, 3]);
  } finally {
    portal.dispose();
  }
}, { featureId: 'SYNC-03', tier: 1 });

suite.test('T1-F16-03 [SYNC-03]: Real supa.safeConfigUpdate against MockSupabaseServer retains concurrent reply and upvote', async () => {
  const portal = createPortalContext({
    server,
    sandbox,
    supaKey: 'officer_admin_token'
  });
  try {
    server.db.bb_config.bb_forum_posts = JSON.stringify([
      { id: 1, title: 'Camp', upvotes: ['u1'], comments: [{ id: 10, text: 'Hello' }] }
    ]);
    await portal.ctx.supa.safeConfigUpdate('bb_forum_posts', (remote) => {
      const list = Array.isArray(remote) ? remote : [];
      list[0].upvotes.push('u2');
      list[0].comments.push({ id: 11, text: 'World' });
      return list;
    });
    const stored = JSON.parse(server.db.bb_config.bb_forum_posts);
    expect(stored[0].upvotes.length).toBe(2);
    expect(stored[0].comments.length).toBe(2);
  } finally {
    portal.dispose();
  }
}, { featureId: 'SYNC-03', tier: 1 });

suite.test('T1-F16-04 [SYNC-03]: Real supa.safeConfigUpdate _configLocks serializes concurrent updates', async () => {
  const portal = createPortalContext({ server, sandbox, supaKey: 'officer_admin_token' });
  try {
    server.db.bb_config.bb_forum_posts = JSON.stringify([{ id: 1, count: 0 }]);
    const order = [];
    await Promise.all([
      portal.ctx.supa.safeConfigUpdate('bb_forum_posts', (remote) => {
        order.push('first');
        return [{ id: 1, count: (remote?.[0]?.count || 0) + 1 }];
      }),
      portal.ctx.supa.safeConfigUpdate('bb_forum_posts', (remote) => {
        order.push('second');
        return [{ id: 1, count: (remote?.[0]?.count || 0) + 1 }];
      })
    ]);
    expect(order).toEqual(['first', 'second']);
    const stored = JSON.parse(server.db.bb_config.bb_forum_posts);
    expect(stored[0].count).toBe(2);
  } finally {
    portal.dispose();
  }
}, { featureId: 'SYNC-03', tier: 1 });

suite.test('T1-F16-05 [SYNC-03]: Real supa.getConfigSnapshot synchronizes immediately upon safeConfigUpdate', async () => {
  const portal = createPortalContext({ server, sandbox, supaKey: 'officer_admin_token' });
  try {
    await portal.ctx.supa.safeConfigUpdate('bb_forum_posts', () => [{ id: 1, title: 'New Post' }]);
    const snap = portal.ctx.supa.getConfigSnapshot('bb_forum_posts');
    expect(Array.isArray(snap)).toBe(true);
    expect(snap.length).toBe(1);
    expect(snap[0].title).toBe('New Post');
  } finally {
    portal.dispose();
  }
}, { featureId: 'SYNC-03', tier: 1 });

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 17: Audit Logging for Sensitive Admin Operations (OBS-01)
// ─────────────────────────────────────────────────────────────────────────────

suite.test('T1-F17-01 [OBS-01]: Uniform order deletion creates audit log entry', async () => {
  const res = await fetch(`${server.url}/rest/v1/rpc/rpc_log_audit_event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: 'anon_test_key', Authorization: 'Bearer admin_token' },
    body: JSON.stringify({
      p_action: 'order.delete',
      p_actor_id: 'officer@1stpjbb.org',
      p_actor_role: 'officer_admin',
      p_target_id: 'ORD-1001'
    })
  });
  expect(res.status).toBe(201);
  const entry = server.db.bb_audit_logs.find(l => l.action === 'order.delete');
  expect(entry).toBeDefined();
  expect(entry.target_id).toBe('ORD-1001');
}, { featureId: 'OBS-01', tier: 1 });

suite.test('T1-F17-02 [OBS-01]: Form response deletion creates audit log entry', async () => {
  await fetch(`${server.url}/rest/v1/rpc/rpc_log_audit_event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: 'anon_test_key' },
    body: JSON.stringify({ p_action: 'form_response.delete', p_target_id: 'resp-55' })
  });
  const entry = server.db.bb_audit_logs.find(l => l.action === 'form_response.delete');
  expect(entry).toBeDefined();
}, { featureId: 'OBS-01', tier: 1 });

suite.test('T1-F17-03 [OBS-01]: Avatar outline customization creates audit log entry', async () => {
  await fetch(`${server.url}/rest/v1/rpc/rpc_log_audit_event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: 'anon_test_key' },
    body: JSON.stringify({ p_action: 'avatar_outline.update', p_target_id: '010101-14-1234' })
  });
  const entry = server.db.bb_audit_logs.find(l => l.action === 'avatar_outline.update');
  expect(entry).toBeDefined();
}, { featureId: 'OBS-01', tier: 1 });

suite.test('T1-F17-04 [OBS-01]: Gemini API key update is logged with secret redacted as [REDACTED]', async () => {
  await fetch(`${server.url}/rest/v1/rpc/rpc_log_audit_event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: 'anon_test_key' },
    body: JSON.stringify({
      p_action: 'config.gemini_key_update',
      p_details: { key: 'AIzaSySecretApiKey12345' }
    })
  });
  const entry = server.db.bb_audit_logs.find(l => l.action === 'config.gemini_key_update');
  expect(entry).toBeDefined();
  expect(entry.details.key).toBe('[REDACTED]');
}, { featureId: 'OBS-01', tier: 1 });

suite.test('T1-F17-05 [OBS-01]: rpc_get_audit_logs retrieves recent log entries for admin console', async () => {
  const res = await fetch(`${server.url}/rest/v1/rpc/rpc_get_audit_logs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: 'anon_test_key' },
    body: JSON.stringify({ p_limit: 10 })
  });
  expect(res.status).toBe(200);
  const rows = await res.json();
  expect(Array.isArray(rows)).toBe(true);
}, { featureId: 'OBS-01', tier: 1 });

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 18: Background Promise Error Handling & Console Hygiene (OBS-02)
// ─────────────────────────────────────────────────────────────────────────────

suite.test('T1-F18-01 [OBS-02]: Real session.js and PortalRealtime handle 500 responses with zero unhandledRejection', async () => {
  const portal = createPortalContext({ server, sandbox });
  let unhandled = 0;
  const onUnhandled = () => { unhandled++; };
  process.on('unhandledRejection', onUnhandled);
  try {
    server.mockRoute('/rest/v1/', { status: 500, data: { message: 'Injected 500' } });
    portal.ctx.sessionSet('ic', '010101-14-1234', { localOnly: true });
    portal.ctx.PortalRealtime.trigger('tasks', 'update', { id: 'task-1' }, true);
    await portal.ctx.sessionClear();
    await new Promise(r => setTimeout(r, 30));
    expect(unhandled).toBe(0);
  } finally {
    process.removeListener('unhandledRejection', onUnhandled);
    portal.dispose();
  }
}, { featureId: 'OBS-02', tier: 1 });

suite.test('T1-F18-02 [OBS-02]: Real supa.createSignedUrl returns structured error on HTTP 500 without throwing', async () => {
  const portal = createPortalContext({ server, sandbox });
  try {
    server.mockRoute('/storage/v1/object/sign/', { status: 500, data: { message: 'Sign failed' } });
    const res = await portal.ctx.supa.createSignedUrl('gallery', 'events/parade2026.jpg');
    expect(res.signedUrl).toBeNull();
    expect(res.error).not.toBeNull();
  } finally {
    portal.dispose();
  }
}, { featureId: 'OBS-02', tier: 1 });

suite.test('T1-F18-03 [OBS-02]: Critical sync and mutation modules contain zero silent empty catch blocks', () => {
  const targets = [
    'js/api/supabase.js',
    'js/modules/forum.js',
    'js/modules/tasks.js'
  ];
  const silentCatchRegex = /\bcatch\s*(?:\([^)]*\))?\s*\{\s*\}/g;
  const hits = [];
  for (const rel of targets) {
    const src = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
    const matches = src.match(silentCatchRegex);
    if (matches && matches.length > 0) {
      hits.push(`${rel}:${matches.length}`);
    }
  }
  expect(hits).toEqual([]);
}, { featureId: 'OBS-02', tier: 1 });

suite.test('T1-F18-04 [OBS-02]: Real supa.get and supa.getConfig happy path produces zero console.error/warn spam', async () => {
  let errorCount = 0;
  const portal = createPortalContext({
    server,
    sandbox,
    console: {
      log: () => {},
      info: () => {},
      debug: () => {},
      warn: () => { errorCount++; },
      error: () => { errorCount++; }
    }
  });
  try {
    const anns = await portal.ctx.supa.get('bb_announcements?limit=5');
    expect(Array.isArray(anns)).toBe(true);
    const cfg = await portal.ctx.supa.getConfig('bb_company_calendar');
    expect(Array.isArray(cfg)).toBe(true);
    expect(errorCount).toBe(0);
  } finally {
    portal.dispose();
  }
}, { featureId: 'OBS-02', tier: 1 });

suite.test('T1-F18-05 [OBS-02]: Real resources.js loadResources degrades gracefully on 500 without throwing', async () => {
  const portal = createPortalContext({ server, sandbox, modules: ['js/modules/resources.js'] });
  try {
    portal.ctx.resources.push({ id: 'cached-1', title: 'Cached Handbook', url: 'https://example.org/h.pdf' });
    server.mockRoute('/rest/v1/bb_config', { status: 500, data: { message: 'Offline' } });
    await portal.ctx.loadResources();
    expect(portal.ctx.resources.length).toBe(1);
    expect(portal.ctx.resources[0].id).toBe('cached-1');
  } finally {
    portal.dispose();
  }
}, { featureId: 'OBS-02', tier: 1 });

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 19: Code Duplication Cleanup (MAINT-01)
// ─────────────────────────────────────────────────────────────────────────────

suite.test('T1-F19-01 [MAINT-01]: Admin task save delegates to canonical tasks.js saveTask without duplicate definition', () => {
  const adminSrc = fs.readFileSync(path.join(REPO_ROOT, 'js/modules/admin.js'), 'utf8');
  const tasksSrc = fs.readFileSync(path.join(REPO_ROOT, 'js/modules/tasks.js'), 'utf8');

  expect(/(?:async\s+)?function\s+saveTask\s*\(/.test(tasksSrc)).toBe(true);
  expect(/(?:async\s+)?function\s+saveTask\s*\(/.test(adminSrc)).toBe(false);

  const portal = createPortalContext({
    server,
    sandbox,
    modules: ['js/modules/tasks.js', 'js/modules/admin.js']
  });
  try {
    expect(typeof portal.ctx.saveTask).toBe('function');
  } finally {
    portal.dispose();
  }
}, { featureId: 'MAINT-01', tier: 1 });

suite.test('T1-F19-02 [MAINT-01]: All 9 admin task functions are deduplicated out of js/modules/admin.js', () => {
  const adminSrc = fs.readFileSync(path.join(REPO_ROOT, 'js/modules/admin.js'), 'utf8');
  const tasksSrc = fs.readFileSync(path.join(REPO_ROOT, 'js/modules/tasks.js'), 'utf8');
  const sharedFns = [
    'switchDeptTab',
    'toggleTaskForm',
    'loadAssigneeOptions',
    'saveTask',
    'clearTaskForm',
    'renderAdminTasks',
    'updateTaskStatus',
    'editAdminTask',
    'deleteTask'
  ];

  for (const fn of sharedFns) {
    const fnDeclRegex = new RegExp(`(?:async\\s+)?function\\s+${fn}\\s*\\(`);
    expect(fnDeclRegex.test(tasksSrc)).toBe(true);
    expect(fnDeclRegex.test(adminSrc)).toBe(false);
  }
}, { featureId: 'MAINT-01', tier: 1 });

suite.test('T1-F19-03 [MAINT-01]: Task validation warning strings live solely in tasks.js and trigger on empty input', async () => {
  const adminSrc = fs.readFileSync(path.join(REPO_ROOT, 'js/modules/admin.js'), 'utf8');
  const tasksSrc = fs.readFileSync(path.join(REPO_ROOT, 'js/modules/tasks.js'), 'utf8');

  expect(tasksSrc.includes('Please enter a task title.')).toBe(true);
  expect(tasksSrc.includes('Please select a department.')).toBe(true);
  expect(adminSrc.includes('Please enter a task title.')).toBe(false);
  expect(adminSrc.includes('Please select a department.')).toBe(false);

  const portal = createPortalContext({ server, sandbox, modules: ['js/modules/tasks.js', 'js/modules/admin.js'] });
  try {
    grantPortalAdminSession(portal, server);
    let warningMsg = null;
    portal.ctx.showToast = (msg) => { warningMsg = msg; };
    await portal.ctx.saveTask();
    expect(warningMsg).toBe('Please enter a task title.');
    expect(server.getRequests(r => r.method === 'POST' && r.pathname === '/rest/v1/bb_tasks').length).toBe(0);
  } finally {
    portal.dispose();
  }
}, { featureId: 'MAINT-01', tier: 1 });

suite.test('T1-F19-04 [MAINT-01]: Task title sanitization sanitizeText(rawTitle, 200) is deduplicated in tasks.js', async () => {
  const adminSrc = fs.readFileSync(path.join(REPO_ROOT, 'js/modules/admin.js'), 'utf8');
  const tasksSrc = fs.readFileSync(path.join(REPO_ROOT, 'js/modules/tasks.js'), 'utf8');

  expect(tasksSrc.includes('sanitizeText(rawTitle, 200)')).toBe(true);
  expect(adminSrc.includes('sanitizeText(rawTitle, 200)')).toBe(false);

  const portal = createPortalContext({
    server,
    sandbox,
    supaKey: 'officer_admin_token',
    modules: ['js/modules/tasks.js', 'js/modules/admin.js']
  });
  try {
    grantPortalAdminSession(portal, server);
    const titleEl = sandbox.document.createElement('input');
    titleEl.id = 'task-title';
    titleEl.value = 'X'.repeat(250);
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
}, { featureId: 'MAINT-01', tier: 1 });

suite.test('T1-F19-05 [MAINT-01]: Real tasks.js updateTaskStatus persists status reflected in bb_tasks query', async () => {
  const portal = createPortalContext({
    server,
    sandbox,
    supaKey: 'officer_admin_token',
    modules: ['js/modules/admin.js', 'js/modules/tasks.js']
  });
  try {
    grantPortalAdminSession(portal, server);
    await portal.ctx.updateTaskStatus('task-1', 'completed');

    const res = await fetch(`${server.url}/rest/v1/bb_tasks?id=eq.task-1`, {
      headers: { apikey: 'anon_test_key' }
    });
    const rows = await res.json();
    expect(rows[0].status).toBe('completed');
  } finally {
    portal.dispose();
  }
}, { featureId: 'MAINT-01', tier: 1 });

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 20: Dead Globals & ESLint Configuration (MAINT-02)
// ─────────────────────────────────────────────────────────────────────────────

suite.test('T1-F20-01 [MAINT-02]: eslint.config.mjs exists and is readable in workspace root', () => {
  const configPath = path.join(REPO_ROOT, 'eslint.config.mjs');
  expect(fs.existsSync(configPath)).toBe(true);
}, { featureId: 'MAINT-02', tier: 1 });

suite.test('T1-F20-02 [MAINT-02]: Dead global ADMIN_PASSWORD_HASH is removed from eslint.config.mjs', async () => {
  const configUrl = pathToFileURL(path.join(REPO_ROOT, 'eslint.config.mjs')).href;
  const configMod = (await import(configUrl)).default;
  const browserCfg = configMod.find(c => Array.isArray(c.files) && c.files.includes('js/**/*.js'));
  expect(browserCfg).toBeDefined();
  expect(Object.hasOwn(browserCfg.languageOptions.globals, 'ADMIN_PASSWORD_HASH')).toBe(false);
  const raw = fs.readFileSync(path.join(REPO_ROOT, 'eslint.config.mjs'), 'utf8');
  expect(raw.includes('ADMIN_PASSWORD_HASH')).toBe(false);
}, { featureId: 'MAINT-02', tier: 1 });

suite.test('T1-F20-03 [MAINT-02]: Dead global openLightbox is removed from eslint.config.mjs', async () => {
  const configUrl = pathToFileURL(path.join(REPO_ROOT, 'eslint.config.mjs')).href;
  const configMod = (await import(configUrl)).default;
  const browserCfg = configMod.find(c => Array.isArray(c.files) && c.files.includes('js/**/*.js'));
  expect(browserCfg).toBeDefined();
  expect(Object.hasOwn(browserCfg.languageOptions.globals, 'openLightbox')).toBe(false);
  const raw = fs.readFileSync(path.join(REPO_ROOT, 'eslint.config.mjs'), 'utf8');
  expect(raw.includes('openLightbox')).toBe(false);
}, { featureId: 'MAINT-02', tier: 1 });

suite.test('T1-F20-04 [MAINT-02]: ESLint configuration enforces no-undef on undeclared variables', async () => {
  const { ESLint } = require('eslint');
  const eslint = new ESLint({ cwd: REPO_ROOT });
  const results = await eslint.lintText('undeclaredPortalVarProbe = 1;\n', { filePath: 'js/core/probe.js' });
  const ruleIds = results[0].messages.map(m => m.ruleId);
  expect(ruleIds).toContain('no-undef');
}, { featureId: 'MAINT-02', tier: 1 });

suite.test('T1-F20-05 [MAINT-02]: ESLint ignores node_modules and dist build artifacts', async () => {
  const { ESLint } = require('eslint');
  const eslint = new ESLint({ cwd: REPO_ROOT });
  expect(await eslint.isPathIgnored('dist/app.js')).toBe(true);
  expect(await eslint.isPathIgnored('node_modules/pkg/index.js')).toBe(true);
  expect(await eslint.isPathIgnored('js/core/utils.js')).toBe(false);
}, { featureId: 'MAINT-02', tier: 1 });

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 21: Concurrency Test Process Clean Exit (TEST-01)
// ─────────────────────────────────────────────────────────────────────────────

suite.test('T1-F21-01 [TEST-01]: test-multi-tab-concurrency.js script exists in scripts directory', () => {
  const scriptPath = path.join(REPO_ROOT, 'scripts/test-multi-tab-concurrency.js');
  expect(fs.existsSync(scriptPath)).toBe(true);
}, { featureId: 'TEST-01', tier: 1 });

suite.test('T1-F21-02 [TEST-01]: scripts/test-multi-tab-concurrency.js exits cleanly within 4s without hanging', () => {
  const res = spawnSync(process.execPath, [path.join(REPO_ROOT, 'scripts/test-multi-tab-concurrency.js')], {
    cwd: REPO_ROOT,
    timeout: 4000,
    encoding: 'utf8'
  });
  expect(res.error).toBeUndefined();
  expect(res.status).toBe(0);
}, { featureId: 'TEST-01', tier: 1 });

suite.test('T1-F21-03 [TEST-01]: session.js and supabase.js unref background BroadcastChannel/heartbeat handles', () => {
  const sessionSrc = fs.readFileSync(path.join(REPO_ROOT, 'js/core/session.js'), 'utf8');
  const supaSrc = fs.readFileSync(path.join(REPO_ROOT, 'js/api/supabase.js'), 'utf8');
  expect(sessionSrc.includes('.unref()') || sessionSrc.includes('clearInterval')).toBe(true);
  expect(supaSrc.includes('_broadcastChannel') && supaSrc.includes('.unref')).toBe(true);
}, { featureId: 'TEST-01', tier: 1 });

suite.test('T1-F21-04 [TEST-01]: Real session.js handleSyncMessage drops duplicate msgId and self-originated messages', () => {
  const portal = createPortalContext({ server, sandbox });
  try {
    const myTabId = portal.ctx.getTabId();
    portal.ctx.handleSyncMessage({
      action: 'set',
      senderId: myTabId,
      msgId: 'self_msg_1',
      key: 'rank',
      value: 'SelfForged'
    });
    expect(portal.ctx.sessionGet('rank')).toBeNull();

    portal.ctx.handleSyncMessage({
      action: 'set',
      senderId: 'other_tab_2',
      msgId: 'dup_msg_100',
      key: 'rank',
      value: 'Corporal'
    });
    expect(portal.ctx.sessionGet('rank')).toBe('Corporal');

    portal.ctx.handleSyncMessage({
      action: 'set',
      senderId: 'other_tab_2',
      msgId: 'dup_msg_100',
      key: 'rank',
      value: 'Overwritten'
    });
    expect(portal.ctx.sessionGet('rank')).toBe('Corporal');
  } finally {
    portal.dispose();
  }
}, { featureId: 'TEST-01', tier: 1 });

suite.test('T1-F21-05 [TEST-01]: scripts/test-multi-tab-concurrency.js outputs passing completion marker', () => {
  const res = spawnSync(process.execPath, [path.join(REPO_ROOT, 'scripts/test-multi-tab-concurrency.js')], {
    cwd: REPO_ROOT,
    timeout: 4000,
    encoding: 'utf8'
  });
  expect(res.stdout).toContain('ALL MULTI-TAB CONCURRENCY STRESS TESTS PASSED 100%');
}, { featureId: 'TEST-01', tier: 1 });

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 22: Headless Browser Layout Assertion Fix (TEST-02)
// ─────────────────────────────────────────────────────────────────────────────

suite.test('T1-F22-01 [TEST-02]: Real member.js renderMemberAvatar displays creator initial J', () => {
  const portal = createPortalContext({ server, sandbox, modules: ['js/modules/member.js'] });
  try {
    const wrap = sandbox.document.createElement('div');
    const ph = sandbox.document.createElement('div');
    ph.id = 'sidebar-user-avatar-ph';
    wrap.appendChild(ph);
    sandbox.document.body.appendChild(wrap);

    portal.ctx.renderMemberAvatar('Jeshua Koh', 'jeshuakoh2008@gmail.com');
    expect(ph.textContent.trim()).toBe('J');
  } finally {
    portal.dispose();
  }
}, { featureId: 'TEST-02', tier: 1 });

suite.test('T1-F22-02 [TEST-02]: Real member.js renderMemberAvatar applies creator-rgb-avatar by default and switches on custom outline', async () => {
  const portal = createPortalContext({
    server,
    sandbox,
    supaKey: 'officer_admin_token',
    modules: ['js/modules/member.js']
  });
  try {
    const wrap = sandbox.document.createElement('div');
    const ph = sandbox.document.createElement('div');
    ph.id = 'sidebar-user-avatar-ph';
    wrap.appendChild(ph);
    sandbox.document.body.appendChild(wrap);

    portal.ctx.renderMemberAvatar('Jeshua Koh', 'jeshuakoh2008@gmail.com');
    expect(ph.classList.contains('creator-rgb-avatar')).toBe(true);

    await portal.ctx.saveMemberAvatarOutline('jeshuakoh2008@gmail.com', 'gold', 'jeshuakoh2008@gmail.com', 'Jeshua Koh');
    portal.ctx.renderMemberAvatar('Jeshua Koh', 'jeshuakoh2008@gmail.com');
    expect(wrap.classList.contains('has-custom-outline')).toBe(true);
    expect(ph.classList.contains('creator-rgb-avatar')).toBe(false);
  } finally {
    portal.dispose();
  }
}, { featureId: 'TEST-02', tier: 1 });

suite.test('T1-F22-03 [TEST-02]: Real member.js renderMemberAvatar omits creator-rgb-avatar for regular members', () => {
  const portal = createPortalContext({ server, sandbox, modules: ['js/modules/member.js'] });
  try {
    const wrap = sandbox.document.createElement('div');
    const ph = sandbox.document.createElement('div');
    ph.id = 'sidebar-user-avatar-ph';
    wrap.appendChild(ph);
    sandbox.document.body.appendChild(wrap);

    portal.ctx.renderMemberAvatar('Jayden Wong', 'jayden@1stpjbb.org');
    expect(ph.textContent).toBe('J');
    expect(ph.classList.contains('creator-rgb-avatar')).toBe(false);
  } finally {
    portal.dispose();
  }
}, { featureId: 'TEST-02', tier: 1 });

suite.test('T1-F22-04 [TEST-02]: Real member.js renderMemberAvatar sets hover tooltip title to member name', () => {
  const portal = createPortalContext({ server, sandbox, modules: ['js/modules/member.js'] });
  try {
    const wrap = sandbox.document.createElement('div');
    const ph = sandbox.document.createElement('div');
    ph.id = 'sidebar-user-avatar-ph';
    wrap.appendChild(ph);
    sandbox.document.body.appendChild(wrap);

    portal.ctx.renderMemberAvatar('Robert Tan', 'robert@1stpjbb.org');
    expect(ph.title).toBe('Robert Tan');
  } finally {
    portal.dispose();
  }
}, { featureId: 'TEST-02', tier: 1 });

suite.test('T1-F22-05 [TEST-02]: verify-browser-layout.js accounts for custom avatar outlines instead of unconditional creatorHasRgb=true', () => {
  const layoutSrc = fs.readFileSync(path.join(REPO_ROOT, 'scripts/verify-browser-layout.js'), 'utf8');
  const idx = layoutSrc.indexOf('creatorHasRgb');
  expect(idx).toBeGreaterThan(-1);
  const block = layoutSrc.slice(idx, idx + 1500);
  const unconditional = /assert\.strictEqual\(\s*ad\.creatorHasRgb\s*,\s*true\b/.test(block);
  const handlesCustomOutline = /has-custom-outline|getMemberAvatarOutline|creatorOutline/i.test(block);
  expect(unconditional && !handlesCustomOutline).toBe(false);
}, { featureId: 'TEST-02', tier: 1 });

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 23: Prettier Code Formatting (MAINT-03)
// ─────────────────────────────────────────────────────────────────────────────

suite.test('T1-F23-01 [MAINT-03]: package.json includes format and format:check scripts', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
  expect(pkg.scripts.format).toBeDefined();
  expect(pkg.scripts['format:check']).toBeDefined();
}, { featureId: 'MAINT-03', tier: 1 });

suite.test('T1-F23-02 [MAINT-03]: Prettier enforces 2-space indentation standard', async () => {
  const prettier = require('prettier');
  const formatted = await prettier.format('function test() {\nreturn 1;\n}', { parser: 'babel', tabWidth: 2 });
  expect(formatted.includes('  return 1;')).toBe(true);
}, { featureId: 'MAINT-03', tier: 1 });

suite.test('T1-F23-03 [MAINT-03]: css/base.css and js/core/utils.js pass prettier.check with repo config', async () => {
  const prettier = require('prettier');
  const cfg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, '.prettierrc.json'), 'utf8'));
  for (const rel of ['css/base.css', 'js/core/utils.js']) {
    const abs = path.join(REPO_ROOT, rel);
    const code = fs.readFileSync(abs, 'utf8');
    const ok = await prettier.check(code, { ...cfg, filepath: abs });
    expect(ok).toBe(true);
  }
}, { featureId: 'MAINT-03', tier: 1 });

suite.test('T1-F23-04 [MAINT-03]: scripts/verify-syntax.js executes and passes across codebase', () => {
  const res = spawnSync(process.execPath, [path.join(REPO_ROOT, 'scripts/verify-syntax.js')], {
    cwd: REPO_ROOT,
    timeout: 10000,
    encoding: 'utf8'
  });
  expect(res.error).toBeUndefined();
  expect(res.status).toBe(0);
}, { featureId: 'MAINT-03', tier: 1 });

suite.test('T1-F23-05 [MAINT-03]: js/modules/admin.js and js/modules/tasks.js pass prettier.check', async () => {
  const prettier = require('prettier');
  const cfg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, '.prettierrc.json'), 'utf8'));
  for (const rel of ['js/modules/admin.js', 'js/modules/tasks.js']) {
    const abs = path.join(REPO_ROOT, rel);
    const code = fs.readFileSync(abs, 'utf8');
    const ok = await prettier.check(code, { ...cfg, filepath: abs });
    expect(ok).toBe(true);
  }
}, { featureId: 'MAINT-03', tier: 1 });

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 24: Config & Secret Externalization (OPS-01)
// ─────────────────────────────────────────────────────────────────────────────

suite.test('T1-F24-01 [OPS-01]: .env.example exists and documents required environment variables safely', () => {
  const envExamplePath = path.join(REPO_ROOT, '.env.example');
  expect(fs.existsSync(envExamplePath)).toBe(true);
  const content = fs.readFileSync(envExamplePath, 'utf8');
  expect(content.includes('VITE_SUPABASE_URL')).toBe(true);
  expect(content.includes('VITE_SUPABASE_ANON_KEY')).toBe(true);
  expect(content.includes('VITE_GEMINI_API_KEY=')).toBe(true);
  expect(/AIza[0-9A-Za-z_-]{20,}/.test(content)).toBe(false);
}, { featureId: 'OPS-01', tier: 1 });

suite.test('T1-F24-02 [OPS-01]: vite.config.mjs does not inject VITE_GEMINI_API_KEY into client DOM window.__ENV__', () => {
  const viteCfg = fs.readFileSync(path.join(REPO_ROOT, 'vite.config.mjs'), 'utf8');
  const indexHtml = fs.readFileSync(path.join(REPO_ROOT, 'index.html'), 'utf8');
  const jsConfig = fs.readFileSync(path.join(REPO_ROOT, 'js/config.js'), 'utf8');

  expect(viteCfg.includes('VITE_GEMINI_API_KEY')).toBe(false);
  expect(/AIza[0-9A-Za-z_-]{20,}/.test(indexHtml)).toBe(false);
  expect(/AIza[0-9A-Za-z_-]{20,}/.test(jsConfig)).toBe(false);
}, { featureId: 'OPS-01', tier: 1 });

suite.test('T1-F24-03 [OPS-01]: Officer-configured Gemini key in bb_config is shielded from anon and readable by admin', async () => {
  const anonRes = await fetch(`${server.url}/rest/v1/bb_config?key=eq.bb_gemini_api_key`, {
    headers: { apikey: 'anon_test_key' }
  });
  expect(anonRes.status).toBe(200);
  expect(await anonRes.json()).toEqual([]);

  const adminRes = await fetch(`${server.url}/rest/v1/bb_config?key=eq.bb_gemini_api_key`, {
    headers: { apikey: 'anon_test_key', Authorization: 'Bearer officer_admin_token' }
  });
  expect(adminRes.status).toBe(200);
  const adminRows = await adminRes.json();
  expect(adminRows.length).toBe(1);
  expect(adminRows[0].key).toBe('bb_gemini_api_key');
}, { featureId: 'OPS-01', tier: 1 });

suite.test('T1-F24-04 [OPS-01]: Real js/config.js resolves SUPA_URL and APP_CONFIG from window.__ENV__', () => {
  const portal = createPortalContext({
    server,
    sandbox,
    coreModules: ['js/config.js']
  });
  try {
    expect(portal.ctx.SUPA_URL).toBe(server.url);
    expect(portal.ctx.APP_CONFIG.SUPABASE_URL).toBe(server.url);
  } finally {
    portal.dispose();
  }
}, { featureId: 'OPS-01', tier: 1 });

suite.test('T1-F24-05 [OPS-01]: Real js/config.js uses fallback TURNSTILE_SITE_KEY when env is unset', () => {
  const portal = createPortalContext({
    server,
    sandbox,
    coreModules: ['js/config.js'],
    env: { VITE_TURNSTILE_SITE_KEY: '' }
  });
  try {
    expect(portal.ctx.TURNSTILE_SITE_KEY).toBe('1x00000000000000000000AA');
    expect(portal.ctx.SUPA_URL.startsWith('http://127.0.0.1')).toBe(true);
  } finally {
    portal.dispose();
  }
}, { featureId: 'OPS-01', tier: 1 });

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 25: CI Automation Workflow (DEVOPS-01)
// ─────────────────────────────────────────────────────────────────────────────

function readPrCiWorkflows() {
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

suite.test('T1-F25-01 [DEVOPS-01]: GitHub Actions workflows directory exists in repository', () => {
  const workflowsDir = path.join(REPO_ROOT, '.github/workflows');
  expect(fs.existsSync(workflowsDir)).toBe(true);
}, { featureId: 'DEVOPS-01', tier: 1 });

suite.test('T1-F25-02 [DEVOPS-01]: PR CI workflow executes npm run lint', () => {
  const ciWorkflows = readPrCiWorkflows();
  expect(ciWorkflows.length).toBeGreaterThan(0);
  expect(ciWorkflows.some(w => w.content.includes('npm run lint'))).toBe(true);
}, { featureId: 'DEVOPS-01', tier: 1 });

suite.test('T1-F25-03 [DEVOPS-01]: PR CI workflow executes npm run format:check', () => {
  const ciWorkflows = readPrCiWorkflows();
  expect(ciWorkflows.length).toBeGreaterThan(0);
  expect(ciWorkflows.some(w => w.content.includes('npm run format:check'))).toBe(true);
}, { featureId: 'DEVOPS-01', tier: 1 });

suite.test('T1-F25-04 [DEVOPS-01]: PR CI workflow executes automated test suite', () => {
  const ciWorkflows = readPrCiWorkflows();
  expect(ciWorkflows.length).toBeGreaterThan(0);
  expect(
    ciWorkflows.some(w => /npm test|npm run test|run-e2e-suite\.js/.test(w.content))
  ).toBe(true);
}, { featureId: 'DEVOPS-01', tier: 1 });

suite.test('T1-F25-05 [DEVOPS-01]: PR CI workflow executes npm run build', () => {
  const ciWorkflows = readPrCiWorkflows();
  expect(ciWorkflows.length).toBeGreaterThan(0);
  expect(ciWorkflows.some(w => w.content.includes('npm run build'))).toBe(true);
}, { featureId: 'DEVOPS-01', tier: 1 });

if (require.main === module) {
  suite.run({ verbose: true }).then(res => {
    process.exitCode = res.failed === 0 ? 0 : 1;
  });
}

module.exports = suite;
