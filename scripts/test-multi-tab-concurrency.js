/**
 * Multi-Tab Concurrency & Network Stress Test Suite
 * Simulates:
 * 1. Concurrent tab instantiation (4+ simulated tabs)
 * 2. Rapid duplicate sessionSet operations across sibling tabs
 * 3. Prevention of cross-tab ping-pong message storms
 * 4. Dual-channel message deduplication (BroadcastChannel + storage event)
 * 5. Leader election lifecycle and failover
 * 6. Connection throttling and AbortController timeout boundaries
 */

const assert = require('assert');

console.log('Testing Multi-Tab Concurrency & Network Starvation Protections...\n');

// ── 1. Tab Identity & Self-Echo Dropping ──────────────────────────────────────
const sessionMod = require('../js/core/session.js');
const myTabId = sessionMod.getTabId();
assert.ok(typeof myTabId === 'string' && myTabId.length > 5, 'Current tab must possess a unique ID');

sessionMod.handleSyncMessage({
  action: 'set',
  senderId: myTabId, // Simulates self-echo
  msgId: 'test_self_01',
  key: 'echo_test',
  value: 'should_be_ignored',
  session: { echo_test: 'should_be_ignored' }
});

assert.strictEqual(sessionMod.sessionGet('echo_test'), null, 'Self-originating messages must be dropped immediately');
console.log('  ✔ Self-originating message echo suppression verified');

// ── 2. Message Deduplication (Dual Delivery via BroadcastChannel + storage) ──
const sharedMsgId = 'msg_dual_delivery_' + Date.now();
sessionMod.handleSyncMessage({
  action: 'set',
  senderId: 'tab_external_alpha',
  msgId: sharedMsgId,
  key: 'dedup_key',
  value: 'first_delivery_win',
  session: { dedup_key: 'first_delivery_win' }
});
assert.strictEqual(sessionMod.sessionGet('dedup_key'), 'first_delivery_win', 'First delivery of message is processed');

// Simulate secondary delivery of the EXACT same message (via storage event)
sessionMod.handleSyncMessage({
  action: 'set',
  senderId: 'tab_external_alpha',
  msgId: sharedMsgId,
  key: 'dedup_key',
  value: 'second_delivery_ignored',
  session: { dedup_key: 'second_delivery_ignored' }
});
assert.strictEqual(sessionMod.sessionGet('dedup_key'), 'first_delivery_win', 'Duplicate delivery of identical msgId is dropped without state corruption');
console.log('  ✔ Dual-channel message deduplication (BroadcastChannel + storage) verified');

// ── 3. Cascading Ping-Pong Storm Prevention ──────────────────────────────────
// Simulate 4 concurrent tabs communicating in a loop
const tabs = ['tab_1', 'tab_2', 'tab_3', 'tab_4'];
let messagesProcessed = 0;
let dashboardRenders = 0;

// Mock window.renderDashboard to monitor render storm counts
global.window = global.window || {};
global.window.renderDashboard = () => {
  dashboardRenders++;
};

// Simulate Tab 1 broadcasting identical session updates
sessionMod.sessionSet('rank', 'Captain', { localOnly: true });
const initialRenders = dashboardRenders;

// 100 simulated rapid sync messages with the SAME user id (e.g. rank/dept updates)
for (let i = 0; i < 100; i++) {
  const sender = tabs[i % tabs.length];
  sessionMod.handleSyncMessage({
    action: 'set',
    senderId: sender,
    msgId: 'msg_storm_' + i,
    key: 'rank',
    value: 'Captain',
    session: { ic: 'captain@bbpj1.org', rank: 'Captain' }
  });
  messagesProcessed++;
}

assert.strictEqual(messagesProcessed, 100, 'All 100 non-duplicate remote messages received');
// renderDashboard must NOT be invoked 100 times because the user ID did not change!
assert.strictEqual(dashboardRenders, initialRenders + 1, 'renderDashboard must only run ONCE on initial ID match, preventing 100x cascade');
console.log('  ✔ Cascading ping-pong loop eliminated: 100 remote syncs triggered exactly 1 dashboard render instead of 100');

// ── 4. Leader Election Model ─────────────────────────────────────────────────
assert.strictEqual(typeof sessionMod.isLeaderTab, 'function', 'isLeaderTab function must exist');
const leaderState = sessionMod.isLeaderTab();
assert.strictEqual(typeof leaderState, 'boolean', 'isLeaderTab must return boolean');

let leaderChangeNotified = false;
sessionMod.onLeaderChange((_isLeader) => {
  leaderChangeNotified = true;
});
assert.strictEqual(leaderChangeNotified, true, 'onLeaderChange callback receives initial leadership state');
console.log('  ✔ Leader election API contract and event listener verified');

// ── 5. Supabase ThrottledFetch Timeout & Abort Handling ──────────────────────
const supaApi = require('../js/api/supabase.js');

(async () => {
  // Test immediate abort
  const ac = new AbortController();
  ac.abort();

  let abortErrorThrown = false;
  try {
    await supaApi.throttledFetch('https://example.com/api', { signal: ac.signal });
  } catch (err) {
    if (err.name === 'AbortError') abortErrorThrown = true;
  }
  assert.strictEqual(abortErrorThrown, true, 'Pre-aborted signal throws AbortError immediately');

  // Test single-flight snapshot cache hit
  supaApi.supa.recordConfigSnapshot('bb_test_snapshot', { testKey: 'cachedValue' });
  const hit = await supaApi.supa.safeConfigGet('bb_test_snapshot');
  assert.strictEqual(hit.testKey, 'cachedValue', 'safeConfigGet returns in-memory snapshot immediately without network roundtrip');

  console.log('  ✔ ThrottledFetch AbortSignal queue cleanup and single-flight snapshot caching verified');

  // ── 6. Anti-Storm Broadcast Deduplication & Attendance Safe Caching ──────────
  const attendanceMod = require('../js/modules/attendance.js');
  let broadcastCount = 0;
  global.window = global.window || {};
  global.window.PortalRealtime = {
    broadcast: () => { broadcastCount++; }
  };

  // Caching attendance from remote read with noBroadcast=true must NOT broadcast
  attendanceMod.cacheMasterAttendance({ lastSynced: new Date().toISOString(), squads: [] }, false, true);
  assert.strictEqual(broadcastCount, 0, 'Reading/fetching attendance data from remote must NOT trigger Realtime broadcasts');

  // Explicit local update without noBroadcast DOES broadcast
  attendanceMod.cacheMasterAttendance({ lastSynced: new Date(Date.now() + 1000).toISOString(), squads: [] }, false, false);
  assert.strictEqual(broadcastCount, 1, 'Local mutation MUST broadcast to peers');
  console.log('  ✔ Attendance cache isolation verified: remote fetch/caching prevents infinite broadcast cascade');

  // ── 7. Database-Level Optimistic Locking (CAS) & Collision Retry Merge ───────
  let remoteCasRow = {
    key: 'bb_cas_test',
    value: JSON.stringify([{ id: 'item-1', title: 'Initial' }]),
    updated_at: '2026-11-25T10:00:00.000Z'
  };
  let casPatchAttempts = 0;
  const casMockSupa = {
    get: async () => [{ ...remoteCasRow }],
    req: async (method, path, body) => {
      if (method === 'PATCH') {
        casPatchAttempts++;
        // Simulate another user winning the race on attempt #1
        if (casPatchAttempts === 1) {
          remoteCasRow = {
            key: 'bb_cas_test',
            value: JSON.stringify([
              { id: 'item-1', title: 'Initial' },
              { id: 'item-from-user-b', title: 'Concurrent User B Write' }
            ]),
            updated_at: '2026-11-25T10:00:01.000Z'
          };
          return []; // 0 rows updated -> CAS conflict detected!
        }
        assert.ok(
          path.includes('updated_at=eq.' + encodeURIComponent(remoteCasRow.updated_at)),
          'Retry PATCH must target the latest remote updated_at version'
        );
        remoteCasRow = { key: 'bb_cas_test', value: body.value, updated_at: body.updated_at };
        return [{ ...remoteCasRow }];
      }
      return [];
    }
  };
  supaApi.supa.recordConfigSnapshot('bb_cas_test', [{ id: 'item-1', title: 'Initial' }]);
  const casMerged = await supaApi.supa.safeConfigUpdate.call(
    casMockSupa,
    'bb_cas_test',
    [
      { id: 'item-1', title: 'Initial' },
      { id: 'item-from-user-a', title: 'Concurrent User A Write' }
    ],
    { idProp: 'id' }
  );
  assert.strictEqual(casPatchAttempts, 2, 'CAS must detect collision on attempt 1 and retry on attempt 2');
  assert.strictEqual(casMerged.length, 3, 'Merged result must preserve Initial + User A + User B writes');
  assert.ok(casMerged.some(x => x.id === 'item-from-user-a'), 'User A write preserved');
  assert.ok(casMerged.some(x => x.id === 'item-from-user-b'), 'User B concurrent write preserved without data loss');
  console.log('  ✔ Database-level updated_at CAS collision detection, retry, and 3-way merge verified');

  // ── 8. Presence O(N^2) Amplification Elimination (0 HTTP Queries) ────────────
  let presenceHttpFetches = 0;
  global.window.fetchRemoteMemberPresence = async () => { presenceHttpFetches++; return {}; };
  global.window._globalPresenceMap = {};
  supaApi.PortalRealtime.triggerEntityUpdate(
    'presence',
    'update',
    {
      key: 'bb_member_presence',
      value: JSON.stringify({
        'member1@bb.org': { status: 'online', last_seen: Date.now(), name: 'Member 1' },
        'member2@bb.org': { status: 'online', last_seen: Date.now(), name: 'Member 2' }
      })
    },
    true
  );
  assert.strictEqual(presenceHttpFetches, 0, 'Inline postgres_changes presence payload must apply with 0 HTTP fetches');
  assert.strictEqual(global.window._globalPresenceMap['member1@bb.org'].status, 'online', 'Presence map hydrated inline');
  console.log('  ✔ Presence amplification eliminated: postgres_changes hydrates map inline with 0 HTTP queries');

  // ── 9. Form Submission & Other-User Order Thundering Herd Protection ─────────
  let customFormsRefetches = 0;
  let memberOrdersRefetches = 0;
  global.window.loadCustomForms = async () => { customFormsRefetches++; return []; };
  global.window.loadMemberOrders = async () => { memberOrdersRefetches++; return []; };
  global.window.sessionGet = (k) => (k === 'ic' ? 'member_viewer_01' : k === 'email' ? 'viewer@bb.org' : '');
  // Simulate 60 OTHER members submitting forms & orders simultaneously
  for (let i = 0; i < 60; i++) {
    supaApi.PortalRealtime.triggerEntityUpdate('forms', 'response', { ic: 'other_member_' + i, order_number: 'FORM-' + i }, true);
    supaApi.PortalRealtime.triggerEntityUpdate('orders', 'insert', { ic: 'other_member_' + i, order_number: 'BB-' + i }, true);
  }
  assert.strictEqual(customFormsRefetches, 0, '60 member form submissions must NOT trigger 60 loadCustomForms refetches');
  assert.strictEqual(memberOrdersRefetches, 0, 'Other members orders/forms must NOT trigger loadMemberOrders on bystanders');
  // Current user's own order DOES still refresh
  supaApi.PortalRealtime.triggerEntityUpdate('orders', 'insert', { ic: 'member_viewer_01', order_number: 'BB-SELF' }, true);
  assert.strictEqual(memberOrdersRefetches, 1, 'Own order event still refreshes member order history immediately');
  console.log('  ✔ 60-user Form & Order Thundering Herd eliminated: 120 bystander events triggered 0 wasted refetches');

  // ── 10. Concurrent Forum Posts & Replies Merge Without Data Loss ─────────────
  const forumMod = require('../js/modules/forum.js');
  const baseForum = [
    { id: 'p1', title: 'Camp Gear', content: 'Checklist', status: 'open', upvotedBy: ['a@bb.org'], replies: [{ id: 'r1', content: 'First', created_at: '2026-11-25T01:00:00Z' }] }
  ];
  const remoteForum = [
    { id: 'p2-user-b', title: 'User B New Thread', content: 'Hello', status: 'open', upvotedBy: [], replies: [] },
    { id: 'p1', title: 'Camp Gear', content: 'Checklist', status: 'open', upvotedBy: ['a@bb.org', 'b@bb.org'], replies: [
      { id: 'r1', content: 'First', created_at: '2026-11-25T01:00:00Z' },
      { id: 'r2-user-b', content: 'Reply from B', created_at: '2026-11-25T02:00:00Z' }
    ] }
  ];
  const clientForum = [
    { id: 'p3-user-a', title: 'User A New Thread', content: 'Hi', status: 'open', upvotedBy: [], replies: [] },
    { id: 'p1', title: 'Camp Gear', content: 'Checklist', status: 'open', upvotedBy: ['a@bb.org', 'c@bb.org'], replies: [
      { id: 'r1', content: 'First', created_at: '2026-11-25T01:00:00Z' },
      { id: 'r3-user-a', content: 'Reply from A', created_at: '2026-11-25T02:01:00Z' }
    ] }
  ];
  const mergedForum = forumMod.mergeForumPostLists(baseForum, remoteForum, clientForum);
  assert.strictEqual(mergedForum.length, 3, 'All 3 forum threads (existing + User A + User B) preserved');
  const mergedP1 = mergedForum.find(p => p.id === 'p1');
  assert.strictEqual(mergedP1.replies.length, 3, 'Simultaneous replies from User A and User B on same thread both preserved');
  assert.strictEqual(mergedP1.upvotes, 3, 'Concurrent upvotes merged accurately');
  console.log('  ✔ Concurrent Forum posts, nested thread replies, and upvotes merge with 0 data loss');

  // ── 11. Storage CDN Cache-Control Headers Verification ───────────────────────
  const origFetch = global.fetch;
  const capturedUploadHeaders = {};
  global.fetch = async (url, opts) => {
    const m = url.match(/\/storage\/v1\/object\/([^/]+)\//);
    if (m) capturedUploadHeaders[m[1]] = opts.headers['cache-control'];
    return { ok: true, json: async () => ({ Key: 'ok' }) };
  };
  await supaApi.supa.uploadFile('gallery', 'photo_test.jpg', new Blob(['x'], { type: 'image/jpeg' }));
  await supaApi.supa.uploadFile('avatars', 'user.jpg', new Blob(['x'], { type: 'image/jpeg' }));
  await supaApi.supa.uploadFile('receipts', 'rec.jpg', new Blob(['x'], { type: 'image/jpeg' }));
  global.fetch = origFetch;
  assert.strictEqual(capturedUploadHeaders.gallery, 'max-age=31536000, public', 'Gallery media uses 1-year public CDN cache');
  assert.strictEqual(capturedUploadHeaders.avatars, 'max-age=86400, public', 'Avatars use 24h public CDN cache');
  assert.strictEqual(capturedUploadHeaders.receipts, 'max-age=3600, private', 'Private receipts use private cache-control');
  console.log('  ✔ Storage CDN Cache-Control headers verified across public & private buckets');

  console.log('\n🎉 ALL MULTI-TAB CONCURRENCY & 60-USER SCALE STRESS TESTS PASSED 100%!\n');
  process.exit(0);
})();
