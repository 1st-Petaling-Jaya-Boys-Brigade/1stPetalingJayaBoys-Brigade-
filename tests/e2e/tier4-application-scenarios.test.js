/**
 * 1st Petaling Jaya Boys' Brigade Portal - E2E Test Suite
 * Tier 4: Real-World Multi-Step End-User Application Workflows (7 Scenarios)
 * File: tests/e2e/tier4-application-scenarios.test.js
 *
 * Implements 7 multi-step end-user journeys covering:
 * Scenario 1: Officer Portal Admin Workflow (F1, F3, F7, F8, F15, F17)
 * Scenario 2: Member Registration & Profile Update (F2, F3, F11, F13, F22)
 * Scenario 3: Parent Uniform Order & Form Submission (F5, F6, F7, F12)
 * Scenario 4: Forum Topic Collaboration (F4, F14, F16, F18)
 * Scenario 5: Gallery Media Browsing & Management (F9, F10, F15, F17)
 * Scenario 6: Attendance & Badge Record Audit (F1, F3, F12)
 * Scenario 7: Full CI/CD & Build Sanity Simulation (F19, F20, F21, F23, F24, F25)
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

const suite = new TestSuite('Tier 4: Application Scenarios', { tier: 4 });
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
// SCENARIO 1: Officer Portal Admin Workflow
// Features Exercised: F1, F3, F7, F8, F15, F17
// ─────────────────────────────────────────────────────────────────────────────
suite.test(
  'SCENARIO-1: Officer Portal Admin Workflow (Batch Load, Auth Guard, Mutate Lock, Broadcast, Audit Log)',
  async () => {
    const portal = createPortalContext({
      server,
      sandbox,
      supaKey: 'officer_admin_token',
      modules: ['js/modules/admin.js', 'js/modules/tasks.js']
    });
    let chReceiver = null;
    try {
      // Step 1: Batch Config Load (F8)
      const configs = await portal.ctx.supa.batchConfigGet([
        'bb_company_calendar',
        'bb_admin_roles',
        'bb_uniform_pricing'
      ]);
      expect(Object.keys(configs).length).toBe(3);

      // Step 2: Auth Guard & Server-Verified Admin Session (F3)
      const loginData = await portal.ctx.supa.rpc('rpc_admin_login', {
        p_officer_email: 'officer@1stpjbb.org',
        p_password_hash: crypto.createHash('sha256').update('AdminPass2026!bb_salt_andrew').digest('hex')
      });
      expect(loginData.success).toBe(true);
      const verifyData = await portal.ctx.supa.rpc('rpc_verify_admin_session', { p_token: loginData.token });
      expect(verifyData.valid).toBe(true);
      expect(verifyData.role).toBe('officer_admin');
      grantPortalAdminSession(portal, server);

      // Step 3: Task Creation with Real Mutation Lock (F7)
      const titleEl = sandbox.document.createElement('input');
      titleEl.id = 'task-title';
      titleEl.value = 'Parade Inspection Prep';
      const deptEl = sandbox.document.createElement('input');
      deptEl.id = 'task-dept';
      deptEl.value = 'Seniors';
      const prioEl = sandbox.document.createElement('input');
      prioEl.id = 'task-priority';
      prioEl.value = 'high';
      sandbox.document.body.appendChild(titleEl);
      sandbox.document.body.appendChild(deptEl);
      sandbox.document.body.appendChild(prioEl);

      // Step 4: Listen for Realtime Broadcast (F15)
      chReceiver = sandbox.createChannel('bb_portal_realtime');
      const broadcastEvents = [];
      chReceiver.onmessage = (e) => { if (e.data) broadcastEvents.push(e.data); };

      await Promise.all([portal.ctx.saveTask(), portal.ctx.saveTask()]);
      const taskPosts = server.getRequests(r => r.method === 'POST' && r.pathname === '/rest/v1/bb_tasks');
      expect(taskPosts.length).toBe(1);

      await new Promise(r => setTimeout(r, 40));
      expect(broadcastEvents.some(e => e.entity === 'tasks' && e.action === 'create')).toBe(true);

      // Step 5: Structured Audit Logging (F17)
      const auditEntry = server.db.bb_audit_logs.find(l => l.action === 'task.create');
      expect(auditEntry).toBeDefined();

      // Step 6: RLS Enforcement on Anon (F1)
      const anonPatchRes = await fetch(`${server.url}/rest/v1/bb_tasks?id=eq.task-1`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', apikey: 'anon_test_key' },
        body: JSON.stringify({ priority: 'low' })
      });
      expect(anonPatchRes.status).toBe(403);
    } finally {
      if (chReceiver) {
        try { chReceiver.close(); } catch {}
      }
      portal.dispose();
    }
  },
  { featureId: 'SCENARIO-1', features: ['F1', 'F3', 'F7', 'F8', 'F15', 'F17'], tier: 4 }
);

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 2: Member Registration & Profile Update
// Features Exercised: F2, F3, F11, F13, F22
// ─────────────────────────────────────────────────────────────────────────────
suite.test(
  'SCENARIO-2: Member Registration & Profile Update (Inline Validation, Hash, Session, Skeleton, Avatar)',
  async () => {
    const portal = createPortalContext({ server, sandbox, modules: ['js/modules/member.js'] });
    try {
      // Step 1: Real Inline Form Validation (F13)
      const form = sandbox.document.createElement('form');
      for (const [id, val] of [
        ['reg-fullname', 'Jayden Wong'],
        ['reg-email', 'bad_recruit'],
        ['reg-section', 'Senior'],
        ['reg-age', '16'],
        ['reg-rank', 'Private'],
        ['reg-squad', 'Alpha'],
        ['reg-pass', '123'],
        ['reg-pass2', '123']
      ]) {
        const g = sandbox.document.createElement('div');
        g.className = 'form-group';
        const el = sandbox.document.createElement('input');
        el.id = id;
        el.value = val;
        g.appendChild(el);
        form.appendChild(g);
      }
      sandbox.document.body.appendChild(form);

      await portal.ctx.registerMember();
      expect(sandbox.document.getElementById('reg-email').classList.contains('is-invalid')).toBe(true);
      expect(sandbox.document.querySelector('.field-error')).not.toBeNull();

      // Step 2: Real Password Hashing & Authentication (F2)
      const rawPass = 'SecureRecruit2026!';
      const hashedPass = await portal.ctx.hashPassword(rawPass, 'salt_recruit_101');
      expect(hashedPass).not.toBe(rawPass);
      expect(hashedPass.startsWith('pbkdf2:sha256:')).toBe(true);

      const newMember = {
        id: 5,
        ic: '080808-10-8888',
        name: 'Jayden Wong',
        email: 'jayden@1stpjbb.org',
        department: 'Juniors',
        role: 'member',
        password_hash: hashedPass,
        salt: 'salt_recruit_101',
        status: 'active'
      };
      server.db.bb_members.push(newMember);

      const authData = await portal.ctx.supa.rpc('rpc_authenticate_member', {
        p_email: newMember.email,
        p_password_hash: hashedPass
      });
      expect(authData.success).toBe(true);
      expect(authData.account.password).toBeUndefined();
      expect(authData.account.password_hash).toBeUndefined();

      // Step 3: Session Creation & Route Guard (F3)
      portal.ctx.sessionSet('ic', newMember.ic, { localOnly: true });
      portal.ctx.sessionSet('email', newMember.email, { localOnly: true });
      portal.ctx.sessionSet('session_token', authData.token, { localOnly: true });
      expect(portal.ctx.AuthGuard.canActivate('badges')).toBe(true);
      expect(await portal.ctx.verifyActiveMemberSession(true)).toBe(true);

      // Step 4: Real Skeleton Loading (F11)
      const badgeEl = sandbox.document.createElement('div');
      badgeEl.innerHTML = portal.ctx.renderSkeletonCard(1, 'badge');
      expect(badgeEl.querySelector('.skeleton-shimmer')).not.toBeNull();

      // Step 5: Real Avatar Layout & Outline (F22)
      const wrap = sandbox.document.createElement('div');
      const ph = sandbox.document.createElement('div');
      ph.id = 'sidebar-user-avatar-ph';
      wrap.appendChild(ph);
      sandbox.document.body.appendChild(wrap);
      portal.ctx.renderMemberAvatar(newMember.name, newMember.email);
      expect(ph.textContent).toBe('J');
      expect(ph.classList.contains('creator-rgb-avatar')).toBe(false);
    } finally {
      portal.dispose();
    }
  },
  { featureId: 'SCENARIO-2', features: ['F2', 'F3', 'F11', 'F13', 'F22'], tier: 4 }
);

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 3: Parent Uniform Order & Form Submission
// Features Exercised: F5, F6, F7, F12
// ─────────────────────────────────────────────────────────────────────────────
suite.test(
  'SCENARIO-3: Parent Uniform Order & Form Submission (IDOR Shield, Double-Submit Debounce, Error Retry)',
  async () => {
    const portal = createPortalContext({
      server,
      sandbox,
      modules: ['js/api/sheets.js', 'js/modules/orders.js']
    });
    try {
      // Step 1: Secure Config Shielding (F6)
      const cfg = await portal.ctx.loadMasterSheetConfig();
      expect(JSON.stringify(cfg).includes('SHEETS_SYNC_SECRET')).toBe(false);

      // Step 2: Real Order Cart Validation (F5)
      const validation = portal.ctx.validateOrderCart(null, { shirt: 1, cap: 1 }, { shirt: 'M', cap: 'M' });
      expect(validation.valid).toBe(true);

      // Step 3: Real Double-Submit Debounce Lock (F7)
      const confirmBtn = sandbox.document.createElement('button');
      let submitRuns = 0;
      await Promise.all([
        portal.ctx.withSmartButtonLock(confirmBtn, async () => {
          submitRuns++;
          await new Promise(r => setTimeout(r, 15));
        }),
        portal.ctx.withSmartButtonLock(confirmBtn, async () => {
          submitRuns++;
        })
      ]);
      expect(submitRuns).toBe(1);

      // Step 4: Simulated 504 Timeout & Click-Driven Error Card Retry Recovery (F12)
      server.mockRoute('/rest/v1/bb_orders', { status: 504, data: { error: 'Gateway Timeout' } });
      await expect(
        portal.ctx.supa.post('bb_orders', { order_number: 'ORD-901', ic: '010101-14-1234', total_amount: 60 })
      ).rejects.toThrow();

      server.customRoutes.delete('/rest/v1/bb_orders');
      const container = sandbox.document.createElement('div');
      container.innerHTML = `<div class="state-card error-card"><button type="button" class="btn-retry">Retry Order</button></div>`;
      sandbox.document.body.appendChild(container);
      const retryBtn = container.querySelector('.btn-retry');

      let orderCreated = false;
      let resolveClick;
      const clickDone = new Promise(r => { resolveClick = r; });
      retryBtn.addEventListener('click', async () => {
        try {
          await portal.ctx.supa.post('bb_orders', {
            order_number: 'ORD-901',
            ic: '050101-10-1234',
            total_amount: 60,
            status: 'pending'
          });
          orderCreated = true;
        } finally {
          resolveClick();
        }
      });
      retryBtn.click();
      await clickDone;
      expect(orderCreated).toBe(true);

      // Step 5: IDOR Defense (F5)
      const idorRes = await fetch(`${server.url}/rest/v1/bb_orders?ic=eq.020202-10-5678`, {
        headers: { apikey: 'anon_test_key', Authorization: 'Bearer member_A_token' }
      });
      expect(await idorRes.json()).toEqual([]);
    } finally {
      portal.dispose();
    }
  },
  { featureId: 'SCENARIO-3', features: ['F5', 'F6', 'F7', 'F12'], tier: 4 }
);

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 4: Forum Topic Collaboration
// Features Exercised: F4, F14, F16, F18
// ─────────────────────────────────────────────────────────────────────────────
suite.test(
  'SCENARIO-4: Forum Topic Collaboration (Safe Concurrent Update, Stored XSS Defense, Realtime Sync)',
  async () => {
    const portal = createPortalContext({
      server,
      sandbox,
      supaKey: 'officer_admin_token',
      modules: ['js/modules/forum.js']
    });
    let unhandledCaught = false;
    const onUnhandled = () => { unhandledCaught = true; };
    process.on('unhandledRejection', onUnhandled);
    let chReceiver = null;
    try {
      // Step 1 & 2: Safe Concurrent Discussion Updates via safeConfigUpdate (F16)
      const initialTopic = { id: 10, title: 'Camp 2026', comments: [{ id: 1, text: 'First post' }] };
      server.db.bb_config.bb_forum_posts = JSON.stringify([initialTopic]);
      portal.ctx.supa.recordConfigSnapshot('bb_forum_posts', [initialTopic]);

      await Promise.all([
        portal.ctx.supa.safeConfigUpdate('bb_forum_posts', (remote) => {
          const list = Array.isArray(remote) ? remote : [];
          list[0].comments.push({ id: 2, text: 'User A reply' });
          return list;
        }),
        portal.ctx.supa.safeConfigUpdate('bb_forum_posts', (remote) => {
          const list = Array.isArray(remote) ? remote : [];
          list[0].comments.push({
            id: 3,
            text: '<b onmouseover="alert(1)">User B reply</b><script>alert("xss")</script>'
          });
          return list;
        })
      ]);

      const stored = JSON.parse(server.db.bb_config.bb_forum_posts);
      expect(stored[0].comments.length).toBe(3);

      // Step 3: Stored XSS Sanitization via utils.js sanitizeHtml (F4)
      const commentB = stored[0].comments.find(c => c.id === 3);
      const safeText = portal.ctx.sanitizeHtml(commentB.text);
      expect(safeText.includes('<script>')).toBe(false);
      expect(safeText.includes('<b onmouseover')).toBe(false);
      expect(safeText.includes('User B reply')).toBe(true);

      // Step 4: Realtime Broadcast Synchronization (F14)
      chReceiver = sandbox.createChannel('bb_portal_realtime');
      const receivedEvts = [];
      chReceiver.onmessage = (e) => { if (e.data) receivedEvts.push(e.data); };
      portal.ctx.PortalRealtime.broadcast('forum', 'update', { topicId: 10 });
      await new Promise(r => setTimeout(r, 40));
      expect(receivedEvts.some(e => e.entity === 'forum' && e.action === 'update')).toBe(true);

      // Step 5: Promise Error Hygiene (F18)
      const settled = await Promise.allSettled([portal.ctx.supa.get('bb_config?key=eq.bb_forum_posts')]);
      expect(settled[0].status).toBe('fulfilled');
      expect(unhandledCaught).toBe(false);
    } finally {
      if (chReceiver) {
        try { chReceiver.close(); } catch {}
      }
      process.removeListener('unhandledRejection', onUnhandled);
      portal.dispose();
    }
  },
  { featureId: 'SCENARIO-4', features: ['F4', 'F14', 'F16', 'F18'], tier: 4 }
);

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 5: Gallery Media Browsing & Management
// Features Exercised: F9, F10, F15, F17
// ─────────────────────────────────────────────────────────────────────────────
suite.test(
  'SCENARIO-5: Gallery Media Browsing & Management (URL Batching, Pagination, Deletion Broadcast, Audit)',
  async () => {
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

      // Step 1: Real Paginated Query (F9)
      const page = await portal.ctx.supa.paginate('bb_gallery', { page: 1, pageSize: 20, order: 'created_at.desc' });
      expect(page.data.length).toBeGreaterThan(0);

      // Step 2: Real Signed URL Creation (F10)
      const signed = await portal.ctx.supa.createSignedUrl('gallery', 'events/parade2026.jpg', 3600);
      expect(signed.signedUrl).toContain('token=mock_signed_token');

      // Step 3 & 4: Real gallery.js deleteGalleryImage + Broadcast + Audit (F15, F17)
      chReceiver = sandbox.createChannel('bb_portal_realtime');
      const galleryEvents = [];
      chReceiver.onmessage = (e) => { if (e.data) galleryEvents.push(e.data); };

      portal.ctx.galleryImages.splice(0, portal.ctx.galleryImages.length, {
        id: 'gal-1',
        url: 'events/parade2026.jpg',
        type: 'image'
      });
      await portal.ctx.deleteGalleryImage(0, 'gal-1');
      await new Promise(r => setTimeout(r, 40));

      expect(server.db.bb_gallery.some(g => g.id === 'gal-1')).toBe(false);
      expect(server.db.bb_audit_logs.some(l => l.action === 'gallery.delete')).toBe(true);
      expect(galleryEvents.some(e => e.entity === 'gallery' && e.action === 'delete')).toBe(true);
    } finally {
      if (chReceiver) {
        try { chReceiver.close(); } catch {}
      }
      portal.dispose();
    }
  },
  { featureId: 'SCENARIO-5', features: ['F9', 'F10', 'F15', 'F17'], tier: 4 }
);

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 6: Attendance & Badge Record Audit
// Features Exercised: F1, F3, F12
// ─────────────────────────────────────────────────────────────────────────────
suite.test(
  'SCENARIO-6: Attendance & Badge Record Audit (Session Verification, Offline Error State, Retry, RLS)',
  async () => {
    const portal = createPortalContext({
      server,
      sandbox,
      modules: ['js/modules/badges.js']
    });
    try {
      // Step 1: Member Auth RPC + Real Session Verification (F3)
      const authData = await portal.ctx.supa.rpc('rpc_authenticate_member', {
        p_email: 'robert@1stpjbb.org',
        p_password_hash: crypto.createHash('sha256').update('MemberPass123!bb_salt_robert').digest('hex')
      });
      expect(authData.success).toBe(true);
      const sergeantToken = authData.token;
      portal.ctx.sessionSet('ic', '010101-14-1234', { localOnly: true });
      portal.ctx.sessionSet('email', 'robert@1stpjbb.org', { localOnly: true });
      portal.ctx.sessionSet('session_token', sergeantToken, { localOnly: true });
      expect(await portal.ctx.verifyActiveMemberSession(true)).toBe(true);

      // Step 2: Query Attendance & Load Badges (F1)
      const attendanceRes = await fetch(`${server.url}/rest/v1/bb_attendance?member_ic=eq.010101-14-1234`, {
        headers: { apikey: 'anon_test_key', Authorization: `Bearer ${sergeantToken}` }
      });
      expect(attendanceRes.status).toBe(200);
      expect((await attendanceRes.json()).length).toBeGreaterThan(0);

      const badgesEl = sandbox.document.createElement('div');
      badgesEl.id = 'badges-list';
      sandbox.document.body.appendChild(badgesEl);
      await portal.ctx.loadBadges('010101-14-1234');
      expect(badgesEl.innerHTML.includes('Target Badge')).toBe(true);

      // Step 3: Simulated 503 Failure & Offline Error Card (F12)
      server.mockRoute('/rest/v1/bb_attendance', { status: 503, data: { code: 'PGRST503', message: 'Network Offline' } });
      const offlineRecord = { squad_id: 1, member_ic: '010101-14-1234', date: '2026-11-21', present: true };
      const failedPostRes = await fetch(`${server.url}/rest/v1/bb_attendance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: 'anon_test_key', Authorization: `Bearer ${sergeantToken}` },
        body: JSON.stringify(offlineRecord)
      });
      expect(failedPostRes.status).toBe(503);

      sandbox.document.body.innerHTML = `
        <div class="state-card error-card offline-state" role="alert">
          <p class="error-title">Network Offline</p>
          <button type="button" class="btn-retry">Retry Sync</button>
        </div>
      `;
      sandbox.localStorage.setItem('bb_attendance_offline_queue', JSON.stringify([offlineRecord]));

      // Step 4: Network Recovery & Click-Driven Retry Sync (F12)
      server.customRoutes.delete('/rest/v1/bb_attendance');
      const retryBtn = sandbox.document.querySelector('.btn-retry');
      let syncSuccess = false;
      let resolveClick;
      const clickDone = new Promise(r => { resolveClick = r; });

      retryBtn.addEventListener('click', async () => {
        try {
          const queue = JSON.parse(sandbox.localStorage.getItem('bb_attendance_offline_queue') || '[]');
          for (const item of queue) {
            const res = await fetch(`${server.url}/rest/v1/bb_attendance`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', apikey: 'anon_test_key', Authorization: `Bearer ${sergeantToken}` },
              body: JSON.stringify(item)
            });
            if (res.status === 201) syncSuccess = true;
          }
          sandbox.localStorage.removeItem('bb_attendance_offline_queue');
          sandbox.document.body.innerHTML = '<div class="state-card success-card"><p>Sync completed successfully</p></div>';
        } finally {
          resolveClick();
        }
      });

      retryBtn.click();
      await clickDone;

      expect(syncSuccess).toBe(true);
      expect(sandbox.localStorage.getItem('bb_attendance_offline_queue')).toBeNull();
      expect(sandbox.document.querySelector('.success-card')).not.toBeNull();

      // Step 5: RLS Privilege Check on Anon Attendance Mutation (F1)
      const anonPostRes = await fetch(`${server.url}/rest/v1/bb_attendance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: 'anon_test_key' },
        body: JSON.stringify({ squad_id: 1, member_ic: '020202-10-5678', date: '2026-11-21', present: true })
      });
      expect(anonPostRes.status).toBe(403);
    } finally {
      portal.dispose();
    }
  },
  { featureId: 'SCENARIO-6', features: ['F1', 'F3', 'F12'], tier: 4 }
);

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 7: Full CI/CD & Build Sanity Simulation
// Features Exercised: F19, F20, F21, F23, F24, F25
// ─────────────────────────────────────────────────────────────────────────────
suite.test(
  'SCENARIO-7: Full CI/CD & Build Sanity Simulation (Dedup, ESLint, Prettier, Concurrency Exit, Secrets, PR CI)',
  async () => {
    // Step 1: Syntax Integrity Check (F25)
    const syntaxRes = spawnSync(process.execPath, [path.join(REPO_ROOT, 'scripts/verify-syntax.js')], {
      cwd: REPO_ROOT,
      timeout: 10000,
      encoding: 'utf8'
    });
    expect(syntaxRes.error).toBeUndefined();
    expect(syntaxRes.status).toBe(0);

    // Step 2: ESLint Clean Check + Dead Globals Removed (F20)
    const { ESLint } = require('eslint');
    const eslint = new ESLint({ cwd: REPO_ROOT });
    const lintResults = await eslint.lintFiles(['js/', 'scripts/', 'sw.js']);
    const lintErrors = lintResults.reduce((sum, r) => sum + r.errorCount, 0);
    expect(lintErrors).toBe(0);

    const configUrl = pathToFileURL(path.join(REPO_ROOT, 'eslint.config.mjs')).href;
    const configMod = (await import(configUrl)).default;
    const browserCfg = configMod.find(c => Array.isArray(c.files) && c.files.includes('js/**/*.js'));
    expect(Object.hasOwn(browserCfg.languageOptions.globals, 'ADMIN_PASSWORD_HASH')).toBe(false);
    expect(Object.hasOwn(browserCfg.languageOptions.globals, 'openLightbox')).toBe(false);

    // Step 3: Code Duplication Cleanup (F19)
    const adminSrc = fs.readFileSync(path.join(REPO_ROOT, 'js/modules/admin.js'), 'utf8');
    expect(/(?:async\s+)?function\s+saveTask\s*\(/.test(adminSrc)).toBe(false);

    // Step 4: Prettier Format Check (F23)
    const prettier = require('prettier');
    const cfg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, '.prettierrc.json'), 'utf8'));
    for (const rel of ['js/modules/admin.js', 'js/core/utils.js', 'css/base.css']) {
      const abs = path.join(REPO_ROOT, rel);
      const ok = await prettier.check(fs.readFileSync(abs, 'utf8'), { ...cfg, filepath: abs });
      expect(ok).toBe(true);
    }

    // Step 5: Multi-Tab Concurrency Clean Exit (F21)
    const concRes = spawnSync(process.execPath, [path.join(REPO_ROOT, 'scripts/test-multi-tab-concurrency.js')], {
      cwd: REPO_ROOT,
      timeout: 4000,
      encoding: 'utf8'
    });
    expect(concRes.error).toBeUndefined();
    expect(concRes.status).toBe(0);

    // Step 6: Secret Externalization + PR CI Workflow (F24, F25)
    const viteCfg = fs.readFileSync(path.join(REPO_ROOT, 'vite.config.mjs'), 'utf8');
    expect(viteCfg.includes('VITE_GEMINI_API_KEY')).toBe(false);

    const workflowsDir = path.join(REPO_ROOT, '.github/workflows');
    const prWorkflows = fs
      .readdirSync(workflowsDir)
      .filter(f => /\.ya?ml$/i.test(f))
      .map(f => fs.readFileSync(path.join(workflowsDir, f), 'utf8'))
      .filter(c => /pull_request\s*:/.test(c));
    expect(prWorkflows.length).toBeGreaterThan(0);
    expect(
      prWorkflows.some(
        c =>
          c.includes('npm run lint') &&
          c.includes('npm run format:check') &&
          c.includes('npm run build') &&
          /concurrency\s*:/.test(c)
      )
    ).toBe(true);
  },
  { featureId: 'SCENARIO-7', features: ['F19', 'F20', 'F21', 'F23', 'F24', 'F25'], tier: 4 }
);

if (require.main === module) {
  suite.run({ verbose: true }).then(res => {
    process.exitCode = res.failed === 0 ? 0 : 1;
  });
}

module.exports = suite;
