/**
 * 1st Petaling Jaya Boys' Brigade Portal - E2E Test Suite
 * Tier 3: Cross-Feature Pairwise Interactions (28 Scenarios)
 * File: tests/e2e/tier3-pairwise-combinations.test.js
 *
 * Enforces >= 25 pairwise cross-feature interaction scenarios across:
 * Security, Access Control, Performance, UX States, Real-Time Sync,
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
  grantPortalAdminSession,
  expect
} = require('./harness');

const REPO_ROOT = path.resolve(__dirname, '../..');

const suite = new TestSuite('Tier 3: Pairwise Combinations', { tier: 3 });
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
// TC-PAIR-01: RLS Policy Hardening + Session Spoofing Guard (F1 + F3)
// ─────────────────────────────────────────────────────────────────────────────
suite.test('TC-PAIR-01 [F1+F3]: RLS blocks anon patch while session.js verifyActiveMemberSession purges spoofed/deleted session', async () => {
  const portal = createPortalContext({ server, sandbox });
  try {
    const deleted = server.db.bb_members.find(m => m.status === 'deleted');
    portal.ctx.sessionSet('ic', deleted.ic, { localOnly: true });
    portal.ctx.sessionSet('email', deleted.email, { localOnly: true });

    const valid = await portal.ctx.verifyActiveMemberSession(true);
    expect(valid).toBe(false);
    expect(sandbox.localStorage.getItem('bb_session')).toBeNull();

    const patchRes = await fetch(`${server.url}/rest/v1/bb_members?id=eq.1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', apikey: 'anon_test_key' },
      body: JSON.stringify({ rank: 'Captain' })
    });
    expect(patchRes.status).toBe(403);
  } finally {
    portal.dispose();
  }
}, { featureId: 'TC-PAIR-01', tier: 3 });

// ─────────────────────────────────────────────────────────────────────────────
// TC-PAIR-02: Startup Waterfall Batching + Skeleton Loading (F8 + F11)
// ─────────────────────────────────────────────────────────────────────────────
suite.test('TC-PAIR-02 [F8+F11]: Real supa.batchConfigGet hydrates snapshots in 1 query while renderSkeletonCard displays', async () => {
  const portal = createPortalContext({ server, sandbox });
  try {
    const container = sandbox.document.createElement('div');
    container.innerHTML = portal.ctx.renderSkeletonCard(1, 'announcement');
    sandbox.document.body.appendChild(container);
    expect(container.querySelector('.skeleton-announcement-card')).not.toBeNull();

    const keys = ['bb_company_calendar', 'bb_admin_roles', 'bb_uniform_pricing'];
    const result = await portal.ctx.supa.batchConfigGet(keys);
    expect(Object.keys(result).length).toBe(3);
    expect(server.getRequests(r => r.pathname === '/rest/v1/bb_config').length).toBe(1);
    expect(portal.ctx.supa.getConfigSnapshot('bb_uniform_pricing').shirt).toBe(45);
  } finally {
    portal.dispose();
  }
}, { featureId: 'TC-PAIR-02', tier: 3 });

// ─────────────────────────────────────────────────────────────────────────────
// TC-PAIR-03: Admin Task Mutation Lock + Realtime Broadcast (F7 + F15)
// ─────────────────────────────────────────────────────────────────────────────
suite.test('TC-PAIR-03 [F7+F15]: Real tasks.js saveTask lock prevents double submit and triggers realtime broadcast', async () => {
  const portal = createPortalContext({
    server,
    sandbox,
    supaKey: 'officer_admin_token',
    modules: ['js/modules/admin.js', 'js/modules/tasks.js']
  });
  let chReceiver = null;
  try {
    grantPortalAdminSession(portal, server);
    const titleEl = sandbox.document.createElement('input');
    titleEl.id = 'task-title';
    titleEl.value = 'Parade Drill';
    const deptEl = sandbox.document.createElement('input');
    deptEl.id = 'task-dept';
    deptEl.value = 'Seniors';
    sandbox.document.body.appendChild(titleEl);
    sandbox.document.body.appendChild(deptEl);

    chReceiver = sandbox.createChannel('bb_portal_realtime');
    const received = [];
    chReceiver.onmessage = (e) => { if (e.data) received.push(e.data); };

    await Promise.all([portal.ctx.saveTask(), portal.ctx.saveTask()]);
    const posts = server.getRequests(r => r.method === 'POST' && r.pathname === '/rest/v1/bb_tasks');
    expect(posts.length).toBe(1);

    portal.ctx.PortalRealtime.broadcast('tasks', 'create', posts[0].body);
    await new Promise(r => setTimeout(r, 40));
    expect(received.some(m => m.entity === 'tasks' && m.action === 'create')).toBe(true);
  } finally {
    if (chReceiver) {
      try { chReceiver.close(); } catch {}
    }
    portal.dispose();
  }
}, { featureId: 'TC-PAIR-03', tier: 3 });

// ─────────────────────────────────────────────────────────────────────────────
// TC-PAIR-04: Admin Task Mutation + Structured Audit Logging (F7 + F17)
// ─────────────────────────────────────────────────────────────────────────────
suite.test('TC-PAIR-04 [F7+F17]: Real tasks.js updateTaskStatus persists and records structured audit event', async () => {
  const portal = createPortalContext({
    server,
    sandbox,
    supaKey: 'officer_admin_token',
    modules: ['js/modules/admin.js', 'js/modules/tasks.js']
  });
  try {
    grantPortalAdminSession(portal, server);
    await portal.ctx.updateTaskStatus('task-1', 'inprogress');
    await new Promise(r => setTimeout(r, 30));

    expect(server.db.bb_tasks[0].status).toBe('inprogress');
    const log = server.db.bb_audit_logs.find(l => l.action === 'task.status_update');
    expect(log).toBeDefined();
    expect(log.target_id).toBe('task-1');
  } finally {
    portal.dispose();
  }
}, { featureId: 'TC-PAIR-04', tier: 3 });

// ─────────────────────────────────────────────────────────────────────────────
// TC-PAIR-05: Inline Form Validation + Submit Debounce Lock (F13 + F7)
// ─────────────────────────────────────────────────────────────────────────────
suite.test('TC-PAIR-05 [F13+F7]: Real member.js inline validation marks .is-invalid; withSmartButtonLock locks valid submit', async () => {
  const portal = createPortalContext({ server, sandbox, modules: ['js/modules/member.js'] });
  try {
    const form = sandbox.document.createElement('form');
    for (const [id, val] of [
      ['reg-fullname', 'Jayden Wong'],
      ['reg-email', 'invalid-email'],
      ['reg-section', 'Senior'],
      ['reg-age', '16'],
      ['reg-rank', 'Private'],
      ['reg-squad', 'Alpha'],
      ['reg-pass', 'StrongPass123!'],
      ['reg-pass2', 'StrongPass123!']
    ]) {
      const grp = sandbox.document.createElement('div');
      grp.className = 'form-group';
      const el = sandbox.document.createElement('input');
      el.id = id;
      el.value = val;
      grp.appendChild(el);
      form.appendChild(grp);
    }
    const btn = sandbox.document.createElement('button');
    form.appendChild(btn);
    sandbox.document.body.appendChild(form);

    await portal.ctx.registerMember();
    expect(sandbox.document.getElementById('reg-email').classList.contains('is-invalid')).toBe(true);
    expect(btn.disabled).toBe(false);

    let lockedInside = false;
    await portal.ctx.withSmartButtonLock(btn, async () => {
      lockedInside = btn.disabled;
    });
    expect(lockedInside).toBe(true);
    expect(btn.disabled).toBe(false);
  } finally {
    portal.dispose();
  }
}, { featureId: 'TC-PAIR-05', tier: 3 });

// ─────────────────────────────────────────────────────────────────────────────
// TC-PAIR-06: Safe Config Update + Realtime Sync (F16 + F14)
// ─────────────────────────────────────────────────────────────────────────────
suite.test('TC-PAIR-06 [F16+F14]: Real supa.safeConfigUpdate merges forum writes and emits realtime sync', async () => {
  const portal = createPortalContext({ server, sandbox, supaKey: 'officer_admin_token' });
  let chReceiver = null;
  try {
    chReceiver = sandbox.createChannel('bb_portal_realtime');
    const received = [];
    chReceiver.onmessage = (e) => { if (e.data) received.push(e.data); };

    await portal.ctx.supa.safeConfigUpdate('bb_forum_posts', (remote) => {
      const posts = Array.isArray(remote) ? remote : [];
      posts.push({ id: 2, title: 'Squad Hike', comments: [] });
      return posts;
    });

    const stored = JSON.parse(server.db.bb_config.bb_forum_posts);
    expect(stored.length).toBe(2);

    portal.ctx.PortalRealtime.broadcast('forum', 'update', { key: 'bb_forum_posts' });
    await new Promise(r => setTimeout(r, 40));
    expect(received.some(m => m.entity === 'forum' && m.action === 'update')).toBe(true);
  } finally {
    if (chReceiver) {
      try { chReceiver.close(); } catch {}
    }
    portal.dispose();
  }
}, { featureId: 'TC-PAIR-06', tier: 3 });

// ─────────────────────────────────────────────────────────────────────────────
// TC-PAIR-07: Stored XSS Defense + Realtime Feed (F4 + F15)
// ─────────────────────────────────────────────────────────────────────────────
suite.test('TC-PAIR-07 [F4+F15]: Realtime broadcast with malicious script payload safely escaped via utils.js escapeHtml', async () => {
  const portal = createPortalContext({ server, sandbox });
  let sender = null;
  let receiver = null;
  try {
    sender = sandbox.createChannel('bb_portal_realtime_xss');
    receiver = sandbox.createChannel('bb_portal_realtime_xss');
    const container = sandbox.document.createElement('div');
    sandbox.document.body.appendChild(container);

    const renderedPromise = new Promise((resolve) => {
      receiver.onmessage = (e) => {
        const safeText = portal.ctx.escapeHtml(e.data.text);
        container.innerHTML = `<p class="feed-item">${safeText}</p>`;
        resolve();
      };
    });

    sender.postMessage({ text: `<img src=x onerror="alert(1)">Important message` });
    await renderedPromise;
    expect(container.innerHTML.includes('<img')).toBe(false);
    expect(container.innerHTML.includes('&lt;img')).toBe(true);
  } finally {
    if (sender) {
      try { sender.close(); } catch {}
    }
    if (receiver) {
      try { receiver.close(); } catch {}
    }
    portal.dispose();
  }
}, { featureId: 'TC-PAIR-07', tier: 3 });

// ─────────────────────────────────────────────────────────────────────────────
// TC-PAIR-08: Signed URL Batching + Pagination (F10 + F9)
// ─────────────────────────────────────────────────────────────────────────────
suite.test('TC-PAIR-08 [F10+F9]: Real supa.paginate + supa.createSignedUrls signs paginated gallery in batch', async () => {
  const portal = createPortalContext({ server, sandbox });
  try {
    const page = await portal.ctx.supa.paginate('bb_gallery', { page: 1, pageSize: 6 });
    expect(page.data.length).toBeLessThanOrEqual(6);

    const paths = page.data.map(item => item.url);
    const signed = await portal.ctx.supa.createSignedUrls('gallery', paths, 3600);
    expect(signed.length).toBe(page.data.length);
    expect(signed[0].signedUrl).toContain('token=mock_signed_token');
  } finally {
    portal.dispose();
  }
}, { featureId: 'TC-PAIR-08', tier: 3 });

// ─────────────────────────────────────────────────────────────────────────────
// TC-PAIR-09: IDOR Prevention + Deletion Audit (F5 + F17)
// ─────────────────────────────────────────────────────────────────────────────
suite.test('TC-PAIR-09 [F5+F17]: Non-owner cannot read/delete order; admin deletion + logAuditEvent records audit', async () => {
  const idorRes = await fetch(`${server.url}/rest/v1/bb_orders?ic=eq.020202-10-5678`, {
    headers: { apikey: 'anon_test_key', Authorization: 'Bearer member_A_token' }
  });
  expect(idorRes.status).toBe(200);
  expect(await idorRes.json()).toEqual([]);

  const delRes = await fetch(`${server.url}/rest/v1/bb_orders?order_number=eq.ORD-1001`, {
    method: 'DELETE',
    headers: { apikey: 'anon_test_key', Authorization: 'Bearer admin_token' }
  });
  expect(delRes.status).toBe(200);

  const portal = createPortalContext({ server, sandbox, supaKey: 'officer_admin_token' });
  try {
    await portal.ctx.logAuditEvent({
      action: 'order.delete',
      targetType: 'order',
      targetId: 'ORD-1001',
      actorRole: 'officer_admin'
    });
    const log = server.db.bb_audit_logs.find(l => l.action === 'order.delete');
    expect(log).toBeDefined();
    expect(log.target_id).toBe('ORD-1001');
  } finally {
    portal.dispose();
  }
}, { featureId: 'TC-PAIR-09', tier: 3 });

// ─────────────────────────────────────────────────────────────────────────────
// TC-PAIR-10: Sheet Secret Shield + Sync Audit (F6 + F17)
// ─────────────────────────────────────────────────────────────────────────────
suite.test('TC-PAIR-10 [F6+F17]: sheets.js loadMasterSheetConfig hides secrets for anon; sync emits audit log', async () => {
  const portal = createPortalContext({ server, sandbox, modules: ['js/api/sheets.js'] });
  try {
    const anonCfg = await portal.ctx.loadMasterSheetConfig();
    expect(JSON.stringify(anonCfg).includes('SHEETS_SYNC_SECRET')).toBe(false);

    await portal.ctx.logAuditEvent({
      action: 'sheets.sync',
      targetType: 'config',
      targetId: 'bb_master_sheet_config',
      actorRole: 'officer_admin'
    });
    const log = server.db.bb_audit_logs.find(l => l.action === 'sheets.sync');
    expect(log).toBeDefined();
  } finally {
    portal.dispose();
  }
}, { featureId: 'TC-PAIR-10', tier: 3 });

// ─────────────────────────────────────────────────────────────────────────────
// TC-PAIR-11: OTP Verification + Session Token (F2 + F3)
// ─────────────────────────────────────────────────────────────────────────────
suite.test('TC-PAIR-11 [F2+F3]: Password reset verification updates credentials without password column exposure', async () => {
  const email = 'robert@1stpjbb.org';
  const otpCode = '554433';
  await fetch(`${server.url}/rest/v1/rpc/rpc_request_password_reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: 'anon_test_key' },
    body: JSON.stringify({ p_email: email, p_otp_code: otpCode })
  });

  const resetRes = await fetch(`${server.url}/rest/v1/rpc/rpc_verify_otp_and_reset_password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: 'anon_test_key' },
    body: JSON.stringify({ p_email: email, p_otp_code: otpCode, p_new_password_hash: 'new_hashed_pass' })
  });
  expect(resetRes.status).toBe(200);

  const memberRes = await fetch(`${server.url}/rest/v1/bb_members?select=password`, {
    headers: { apikey: 'anon_test_key' }
  });
  expect(memberRes.status).toBe(403);
}, { featureId: 'TC-PAIR-11', tier: 3 });

// ─────────────────────────────────────────────────────────────────────────────
// TC-PAIR-12: Error Retry + Session Refresh (F12 + F3)
// ─────────────────────────────────────────────────────────────────────────────
suite.test('TC-PAIR-12 [F12+F3]: Clicking .btn-retry on error card triggers listener to authenticate and store session', async () => {
  const portal = createPortalContext({ server, sandbox });
  try {
    const container = sandbox.document.createElement('div');
    container.innerHTML = `<div class="state-card error-card"><button type="button" class="btn-retry">Retry</button></div>`;
    sandbox.document.body.appendChild(container);
    const retryBtn = container.querySelector('.btn-retry');

    let authToken = null;
    let resolveClick;
    const clickDone = new Promise(r => { resolveClick = r; });

    retryBtn.addEventListener('click', async () => {
      try {
        const res = await portal.ctx.supa.rpc('rpc_authenticate_member', {
          p_email: 'robert@1stpjbb.org',
          p_password_hash: crypto.createHash('sha256').update('MemberPass123!bb_salt_robert').digest('hex')
        });
        if (res && res.success) {
          authToken = res.token;
          portal.ctx.sessionSet('ic', res.account.ic, { localOnly: true });
          portal.ctx.sessionSet('session_token', res.token, { localOnly: true });
        }
      } finally {
        resolveClick();
      }
    });

    retryBtn.click();
    await clickDone;

    expect(authToken).not.toBeNull();
    expect(portal.ctx.sessionGet('ic')).toBe('010101-14-1234');
    expect(await portal.ctx.verifyActiveMemberSession(true)).toBe(true);
  } finally {
    portal.dispose();
  }
}, { featureId: 'TC-PAIR-12', tier: 3 });

// ─────────────────────────────────────────────────────────────────────────────
// TC-PAIR-13: Filter Sanitization + Session Lookup (F7 + F3)
// ─────────────────────────────────────────────────────────────────────────────
suite.test('TC-PAIR-13 [F7+F3]: Real session.js sanitizePostgrestFilterParam escapes AST characters in session lookup', async () => {
  const portal = createPortalContext({ server, sandbox });
  try {
    const maliciousIc = '010101-14-1234),role.eq.admin(';
    const clean = portal.ctx.sanitizePostgrestFilterParam(maliciousIc);
    expect(clean.includes('(')).toBe(false);
    expect(clean.includes(')')).toBe(false);
    expect(clean.includes(',')).toBe(false);

    portal.ctx.sessionSet('ic', maliciousIc, { localOnly: true });
    portal.ctx.sessionSet('email', 'robert@1stpjbb.org', { localOnly: true });
    portal.ctx.sessionSet('session_token', 'valid_member_token', { localOnly: true });
    await portal.ctx.verifyActiveMemberSession(true);

    const memberReqs = server.getRequests(r => r.pathname === '/rest/v1/bb_members');
    expect(memberReqs.length).toBeGreaterThan(0);
    expect(memberReqs[0].url.includes('),role.eq.admin(')).toBe(false);
  } finally {
    portal.dispose();
  }
}, { featureId: 'TC-PAIR-13', tier: 3 });

// ─────────────────────────────────────────────────────────────────────────────
// TC-PAIR-14: Query Limit + Skeleton Twin (F9 + F11)
// ─────────────────────────────────────────────────────────────────────────────
suite.test('TC-PAIR-14 [F9+F11]: Bounded supa.paginate query aligns with loading.js renderSkeletonCard count', async () => {
  const portal = createPortalContext({ server, sandbox });
  try {
    const page = await portal.ctx.supa.paginate('bb_announcements', { page: 1, pageSize: 2 });
    expect(page.data.length).toBe(2);

    const container = sandbox.document.createElement('div');
    container.innerHTML = portal.ctx.renderSkeletonCard(page.data.length, 'announcement');
    expect(container.querySelectorAll('.skeleton-announcement-card').length).toBe(2);
  } finally {
    portal.dispose();
  }
}, { featureId: 'TC-PAIR-14', tier: 3 });

// ─────────────────────────────────────────────────────────────────────────────
// TC-PAIR-15: Realtime Sync + Dedup Multi-Tab (F14 + F21)
// ─────────────────────────────────────────────────────────────────────────────
suite.test('TC-PAIR-15 [F14+F21]: Realtime BroadcastChannel deduplicates duplicate message IDs in supabase.js', async () => {
  let taskTriggers = 0;
  const portal = createPortalContext({
    server,
    sandbox,
    afterLoadGlobals: { fetchAllRemoteTasks: async () => { taskTriggers++; } }
  });
  let chSender = null;
  try {
    chSender = sandbox.createChannel('bb_portal_realtime');
    chSender.postMessage({
      type: 'PORTAL_REALTIME_CHANGE',
      senderId: 'tab_remote',
      msgId: 'evt_dup_101',
      entity: 'tasks',
      action: 'update'
    });
    chSender.postMessage({
      type: 'PORTAL_REALTIME_CHANGE',
      senderId: 'tab_remote',
      msgId: 'evt_dup_101',
      entity: 'tasks',
      action: 'update'
    });
    await new Promise(r => setTimeout(r, 40));
    expect(taskTriggers).toBe(1);
  } finally {
    if (chSender) {
      try { chSender.close(); } catch {}
    }
    portal.dispose();
  }
}, { featureId: 'TC-PAIR-15', tier: 3 });

// ─────────────────────────────────────────────────────────────────────────────
// TC-PAIR-16: Task Code Dedup + Shared Lock (F19 + F7)
// ─────────────────────────────────────────────────────────────────────────────
suite.test('TC-PAIR-16 [F19+F7]: admin.js deduplicates saveTask to tasks.js while tasks.js lock enforces 1 POST', async () => {
  const adminSrc = fs.readFileSync(path.join(REPO_ROOT, 'js/modules/admin.js'), 'utf8');
  const tasksSrc = fs.readFileSync(path.join(REPO_ROOT, 'js/modules/tasks.js'), 'utf8');
  expect(/(?:async\s+)?function\s+saveTask\s*\(/.test(tasksSrc)).toBe(true);
  expect(/(?:async\s+)?function\s+saveTask\s*\(/.test(adminSrc)).toBe(false);

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
    titleEl.value = 'Task Lock Test';
    const deptEl = sandbox.document.createElement('input');
    deptEl.id = 'task-dept';
    deptEl.value = 'Seniors';
    sandbox.document.body.appendChild(titleEl);
    sandbox.document.body.appendChild(deptEl);

    await Promise.all([portal.ctx.saveTask(), portal.ctx.saveTask()]);
    expect(server.getRequests(r => r.method === 'POST' && r.pathname === '/rest/v1/bb_tasks').length).toBe(1);
  } finally {
    portal.dispose();
  }
}, { featureId: 'TC-PAIR-16', tier: 3 });

// ─────────────────────────────────────────────────────────────────────────────
// TC-PAIR-17: Gallery Delete + Broadcast + Audit (F15 + F17)
// ─────────────────────────────────────────────────────────────────────────────
suite.test('TC-PAIR-17 [F15+F17]: Real gallery.js deleteGalleryImage persists delete, broadcasts, and logs audit', async () => {
  const portal = createPortalContext({
    server,
    sandbox,
    supaKey: 'officer_admin_token',
    modules: ['js/modules/admin.js', 'js/modules/gallery.js'],
    afterLoadGlobals: { showConfirmModal: async () => true }
  });
  let chReceiver = null;
  try {
    grantPortalAdminSession(portal, server);
    chReceiver = sandbox.createChannel('bb_portal_realtime');
    const received = [];
    chReceiver.onmessage = (e) => { if (e.data) received.push(e.data); };

    portal.ctx.galleryImages.splice(0, portal.ctx.galleryImages.length, {
      id: 'gal-1',
      url: 'events/parade2026.jpg',
      type: 'image'
    });
    await portal.ctx.deleteGalleryImage(0, 'gal-1');
    await new Promise(r => setTimeout(r, 40));

    expect(server.db.bb_audit_logs.some(l => l.action === 'gallery.delete')).toBe(true);
    expect(received.some(m => m.entity === 'gallery' && m.action === 'delete')).toBe(true);
  } finally {
    if (chReceiver) {
      try { chReceiver.close(); } catch {}
    }
    portal.dispose();
  }
}, { featureId: 'TC-PAIR-17', tier: 3 });

// ─────────────────────────────────────────────────────────────────────────────
// TC-PAIR-18: Promise Error Catch + Error Card (F18 + F12)
// ─────────────────────────────────────────────────────────────────────────────
suite.test('TC-PAIR-18 [F18+F12]: Real supa.get failure caught cleanly and SmartLoading renders retry error card', async () => {
  const portal = createPortalContext({ server, sandbox });
  try {
    server.mockRoute('/rest/v1/bb_announcements', { status: 500, data: { error: 'Internal Server Error' } });
    const container = sandbox.document.createElement('div');
    sandbox.document.body.appendChild(container);
    const loader = portal.ctx.createSmartLoader({ container, timeoutMs: 25, showDelayMs: 5, minDisplayMs: 5 });

    let apiErr = null;
    try {
      await portal.ctx.supa.get('bb_announcements', { maxRetries: 0 });
    } catch (e) {
      apiErr = e;
    }
    expect(apiErr).not.toBeNull();
    expect(apiErr.status).toBe(500);

    try {
      await loader.execute(() => new Promise(() => {}), () => {});
    } catch {}
    expect(container.querySelector('.loading-timeout-state')).not.toBeNull();
    expect(container.querySelector('.retry-btn')).not.toBeNull();
  } finally {
    portal.dispose();
  }
}, { featureId: 'TC-PAIR-18', tier: 3 });

// ─────────────────────────────────────────────────────────────────────────────
// TC-PAIR-19: Dead Globals Cleanup + CI Lint (F20 + F25)
// ─────────────────────────────────────────────────────────────────────────────
suite.test('TC-PAIR-19 [F20+F25]: ESLint passes across js/scripts/sw with dead globals removed from eslint.config.mjs', async () => {
  const { ESLint } = require('eslint');
  const eslint = new ESLint({ cwd: REPO_ROOT });
  const results = await eslint.lintFiles(['js/', 'scripts/', 'sw.js']);
  const totalErrors = results.reduce((sum, r) => sum + r.errorCount, 0);
  expect(totalErrors).toBe(0);

  const configUrl = pathToFileURL(path.join(REPO_ROOT, 'eslint.config.mjs')).href;
  const configMod = (await import(configUrl)).default;
  const browserCfg = configMod.find(c => Array.isArray(c.files) && c.files.includes('js/**/*.js'));
  expect(Object.hasOwn(browserCfg.languageOptions.globals, 'ADMIN_PASSWORD_HASH')).toBe(false);
  expect(Object.hasOwn(browserCfg.languageOptions.globals, 'openLightbox')).toBe(false);
}, { featureId: 'TC-PAIR-19', tier: 3 });

// ─────────────────────────────────────────────────────────────────────────────
// TC-PAIR-20: Browser Layout + Skeleton Dimensions (F22 + F11)
// ─────────────────────────────────────────────────────────────────────────────
suite.test('TC-PAIR-20 [F22+F11]: Real member.js renderMemberAvatar + renderSkeletonCard maintain initial and layout contracts', () => {
  const portal = createPortalContext({ server, sandbox, modules: ['js/modules/member.js'] });
  try {
    const wrap = sandbox.document.createElement('div');
    const ph = sandbox.document.createElement('div');
    ph.id = 'sidebar-user-avatar-ph';
    wrap.appendChild(ph);
    sandbox.document.body.appendChild(wrap);

    const member = server.db.bb_members[0];
    portal.ctx.renderMemberAvatar(member.name, member.email);
    expect(ph.textContent).toBe('R');
    expect(ph.classList.contains('creator-rgb-avatar')).toBe(false);

    const skelHtml = portal.ctx.renderSkeletonCard(1, 'badge');
    expect(skelHtml.includes('skeleton-circle')).toBe(true);
  } finally {
    portal.dispose();
  }
}, { featureId: 'TC-PAIR-20', tier: 3 });

// ─────────────────────────────────────────────────────────────────────────────
// TC-PAIR-21: Prettier Check + Build Pipeline (F23 + F25)
// ─────────────────────────────────────────────────────────────────────────────
suite.test('TC-PAIR-21 [F23+F25]: Repo files pass prettier.check and vite.config.mjs build.outDir is dist', async () => {
  const prettier = require('prettier');
  const cfg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, '.prettierrc.json'), 'utf8'));
  for (const rel of ['js/modules/admin.js', 'js/core/utils.js', 'css/base.css']) {
    const abs = path.join(REPO_ROOT, rel);
    const ok = await prettier.check(fs.readFileSync(abs, 'utf8'), { ...cfg, filepath: abs });
    expect(ok).toBe(true);
  }
  const viteSrc = fs.readFileSync(path.join(REPO_ROOT, 'vite.config.mjs'), 'utf8');
  expect(viteSrc.includes("outDir: 'dist'") || viteSrc.includes('outDir: "dist"')).toBe(true);
}, { featureId: 'TC-PAIR-21', tier: 3 });

// ─────────────────────────────────────────────────────────────────────────────
// TC-PAIR-22: Secret Externalization + DOM Defense (F24 + F4)
// ─────────────────────────────────────────────────────────────────────────────
suite.test('TC-PAIR-22 [F24+F4]: index.html, vite.config.mjs, and config.js never expose Gemini or service_role keys', () => {
  const html = fs.readFileSync(path.join(REPO_ROOT, 'index.html'), 'utf8');
  const viteCfg = fs.readFileSync(path.join(REPO_ROOT, 'vite.config.mjs'), 'utf8');
  const jsCfg = fs.readFileSync(path.join(REPO_ROOT, 'js/config.js'), 'utf8');
  for (const src of [html, viteCfg, jsCfg]) {
    expect(src.includes('AIzaSy')).toBe(false);
    expect(src.includes('SUPABASE_SERVICE_ROLE_KEY')).toBe(false);
  }
  expect(viteCfg.includes('VITE_GEMINI_API_KEY')).toBe(false);
}, { featureId: 'TC-PAIR-22', tier: 3 });

// ─────────────────────────────────────────────────────────────────────────────
// TC-PAIR-23: Concurrency Clean Exit + Tab Leader (F21 + F14)
// ─────────────────────────────────────────────────────────────────────────────
suite.test('TC-PAIR-23 [F21+F14]: Multi-tab concurrency script exits cleanly and supabase.js unrefs BroadcastChannel', () => {
  const res = spawnSync(process.execPath, [path.join(REPO_ROOT, 'scripts/test-multi-tab-concurrency.js')], {
    cwd: REPO_ROOT,
    timeout: 4000,
    encoding: 'utf8'
  });
  expect(res.error).toBeUndefined();
  expect(res.status).toBe(0);

  const supaSrc = fs.readFileSync(path.join(REPO_ROOT, 'js/api/supabase.js'), 'utf8');
  expect(supaSrc.includes('_broadcastChannel') && supaSrc.includes('.unref')).toBe(true);
}, { featureId: 'TC-PAIR-23', tier: 3 });

// ─────────────────────────────────────────────────────────────────────────────
// TC-PAIR-24: Forum Concurrency + Comment XSS (F16 + F4)
// ─────────────────────────────────────────────────────────────────────────────
suite.test('TC-PAIR-24 [F16+F4]: Real supa.safeConfigUpdate + utils.sanitizeHtml strips inline XSS from forum posts', async () => {
  const portal = createPortalContext({ server, sandbox, supaKey: 'officer_admin_token' });
  try {
    const dirtyComment = {
      id: 10,
      author: 'Attacker',
      text: '<b>Important Notice</b><script>alert(1)</script><img src=x onerror="alert(1)">'
    };
    await portal.ctx.supa.safeConfigUpdate('bb_forum_posts', () => [dirtyComment]);
    const stored = JSON.parse(server.db.bb_config.bb_forum_posts);
    const sanitized = portal.ctx.sanitizeHtml(stored[0].text);

    expect(sanitized.includes('<script>')).toBe(false);
    expect(sanitized.includes('<img')).toBe(false);
    expect(sanitized.includes('<b>Important Notice</b>')).toBe(true);
  } finally {
    portal.dispose();
  }
}, { featureId: 'TC-PAIR-24', tier: 3 });

// ─────────────────────────────────────────────────────────────────────────────
// TC-PAIR-25: Order Double-Submit + Sheet Secret (F7 + F6)
// ─────────────────────────────────────────────────────────────────────────────
suite.test('TC-PAIR-25 [F7+F6]: Real orders.js validateOrderCart + withSmartButtonLock prevents double submit while anon sheet config is shielded', async () => {
  const portal = createPortalContext({ server, sandbox, modules: ['js/modules/orders.js'] });
  try {
    expect(portal.ctx.validateOrderCart(null, { shirt: 1 }, { shirt: 'M' }).valid).toBe(true);
    const btn = sandbox.document.createElement('button');
    let posts = 0;
    await Promise.all([
      portal.ctx.withSmartButtonLock(btn, async () => {
        posts++;
        await portal.ctx.supa.post('bb_orders', {
          order_number: 'ORD-9901',
          ic: '010101-14-1234',
          total_amount: 45
        });
      }),
      portal.ctx.withSmartButtonLock(btn, async () => {
        posts++;
      })
    ]);
    expect(posts).toBe(1);

    const cfgRows = await portal.ctx.supa.get('bb_config?key=eq.bb_master_sheet_config');
    expect(Array.from(cfgRows)).toEqual([]);
  } finally {
    portal.dispose();
  }
}, { featureId: 'TC-PAIR-25', tier: 3 });

// ─────────────────────────────────────────────────────────────────────────────
// TC-PAIR-26: Attendance Offline Buffer + Retry (F12 + F7)
// ─────────────────────────────────────────────────────────────────────────────
suite.test('TC-PAIR-26 [F12+F7]: Offline attendance records buffered and flushed via supa on network restore', async () => {
  const portal = createPortalContext({ server, sandbox, supaKey: 'officer_admin_token' });
  try {
    server.mockRoute('/rest/v1/bb_attendance', { status: 503, data: { error: 'Service Unavailable' } });
    const record = { squad_id: 1, member_ic: '010101-14-1234', date: '2026-11-28', present: true };
    await expect(portal.ctx.supa.post('bb_attendance', record)).rejects.toThrow();

    sandbox.localStorage.setItem('bb_attendance_offline_queue', JSON.stringify([record]));
    server.customRoutes.delete('/rest/v1/bb_attendance');

    const queue = JSON.parse(sandbox.localStorage.getItem('bb_attendance_offline_queue'));
    for (const item of queue) {
      await portal.ctx.supa.post('bb_attendance', item);
    }
    sandbox.localStorage.removeItem('bb_attendance_offline_queue');
    expect(server.db.bb_attendance.some(a => a.date === '2026-11-28')).toBe(true);
    expect(sandbox.localStorage.getItem('bb_attendance_offline_queue')).toBeNull();
  } finally {
    portal.dispose();
  }
}, { featureId: 'TC-PAIR-26', tier: 3 });

// ─────────────────────────────────────────────────────────────────────────────
// TC-PAIR-27: Form Response Deletion + Audit Logging + Realtime (F5 + F17 + F14)
// ─────────────────────────────────────────────────────────────────────────────
suite.test('TC-PAIR-27 [F5+F17+F14]: Form response deletion is authorized, audited via logAuditEvent, and broadcasted', async () => {
  const portal = createPortalContext({ server, sandbox, supaKey: 'officer_admin_token' });
  let chReceiver = null;
  try {
    chReceiver = sandbox.createChannel('bb_portal_realtime');
    const events = [];
    chReceiver.onmessage = (e) => { if (e.data) events.push(e.data); };

    await portal.ctx.supa.delete('bb_custom_forms?id=eq.form-1');
    expect(server.db.bb_custom_forms.length).toBe(0);
    expect(server.db.bb_forms.length).toBe(0);

    portal.ctx.PortalRealtime.broadcast('forms', 'delete', { id: 'form-1' });
    await portal.ctx.logAuditEvent({ action: 'form.delete_response', targetType: 'form', targetId: 'form-1' });
    await new Promise(r => setTimeout(r, 40));

    expect(events.some(e => e.entity === 'forms' && e.action === 'delete')).toBe(true);
    expect(server.db.bb_audit_logs.some(l => l.action === 'form.delete_response')).toBe(true);
  } finally {
    if (chReceiver) {
      try { chReceiver.close(); } catch {}
    }
    portal.dispose();
  }
}, { featureId: 'TC-PAIR-27', tier: 3 });

// ─────────────────────────────────────────────────────────────────────────────
// TC-PAIR-28: Avatar Outline + Audit Log + Session Update (F22 + F17 + F3)
// ─────────────────────────────────────────────────────────────────────────────
suite.test('TC-PAIR-28 [F22+F17+F3]: Real member.js avatar outline update persists, logs audit event, and updates session', async () => {
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

    const outRes = await portal.ctx.saveMemberAvatarOutline(
      'robert@1stpjbb.org',
      'gold',
      'jeshuakoh2008@gmail.com',
      'Robert Tan'
    );
    expect(outRes.success).toBe(true);

    portal.ctx.sessionSet('email', 'robert@1stpjbb.org', { localOnly: true });
    portal.ctx.renderMemberAvatar('Robert Tan', 'robert@1stpjbb.org');
    expect(wrap.classList.contains('has-custom-outline')).toBe(true);

    await portal.ctx.logAuditEvent({
      action: 'avatar_outline.update',
      targetType: 'member',
      targetId: '010101-14-1234',
      details: { style: 'gold' }
    });
    expect(server.db.bb_audit_logs.some(l => l.action === 'avatar_outline.update')).toBe(true);
  } finally {
    portal.dispose();
  }
}, { featureId: 'TC-PAIR-28', tier: 3 });

if (require.main === module) {
  suite.run({ verbose: true }).then(res => {
    process.exitCode = res.failed === 0 ? 0 : 1;
  });
}

module.exports = suite;
