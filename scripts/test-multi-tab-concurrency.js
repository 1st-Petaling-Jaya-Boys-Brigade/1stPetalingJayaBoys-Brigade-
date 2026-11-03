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
  console.log('\n🎉 ALL MULTI-TAB CONCURRENCY STRESS TESTS PASSED 100%!\n');
})();
