/**
 * 1st Petaling Jaya Boys' Brigade Portal - E2E Test Suite Harness
 * File: tests/e2e/harness.js
 *
 * Zero-dependency, requirement-driven, opaque-box E2E testing framework.
 * Provides:
 * 1. Assertion primitives (expect) with Error-constructor & async rejection tracking
 * 2. Test runner primitives (TestSuite) with leak-free timers & try/finally hooks
 * 3. MockSupabaseServer (in-memory HTTP PostgREST, Auth RPCs, Storage, RLS/IDOR)
 * 4. createDOMSandbox (deterministic browser DOM, nested HTML parser & storage environment)
 * 5. createPortalContext (isolated node:vm loader executing real js/ portal modules)
 */

'use strict';

const http = require('http');
const assert = require('assert');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const vm = require('vm');

const REPO_ROOT = path.resolve(__dirname, '../..');

const FEATURES = [
  { code: 'SEC-01', id: 'F01', desc: 'RLS Policy Hardening' },
  { code: 'SEC-02', id: 'F02', desc: 'Password Column & OTP Protection' },
  { code: 'SEC-03', id: 'F03', desc: 'Session Spoofing & Route Guard' },
  { code: 'SEC-04', id: 'F04', desc: 'Stored XSS Elimination' },
  { code: 'SEC-05', id: 'F05', desc: 'IDOR & Form/Order Protection' },
  { code: 'SEC-06', id: 'F06', desc: 'Sync Secret Protection' },
  { code: 'SEC-07', id: 'F07', desc: 'Mutation Concurrency & Sanitation' },
  { code: 'PERF-01', id: 'F08', desc: 'Startup Waterfall & Batch Config' },
  { code: 'PERF-02', id: 'F09', desc: 'Unbounded Queries & Pagination' },
  { code: 'PERF-03', id: 'F10', desc: 'Gallery Signed URL Batching' },
  { code: 'UX-01', id: 'F11', desc: 'UX State: Loading Skeletons' },
  { code: 'UX-02', id: 'F12', desc: 'UX State: Error & Retry States' },
  { code: 'UX-03', id: 'F13', desc: 'UX State: Inline Form Validation' },
  { code: 'SYNC-01', id: 'F14', desc: 'Real-Time Sync Subscriptions' },
  { code: 'SYNC-02', id: 'F15', desc: 'Broadcast Trigger Coverage' },
  { code: 'SYNC-03', id: 'F16', desc: 'Forum Safe Concurrent Updates' },
  { code: 'OBS-01', id: 'F17', desc: 'Audit Logging for Admin Ops' },
  { code: 'OBS-02', id: 'F18', desc: 'Background Promise Error Handling' },
  { code: 'MAINT-01', id: 'F19', desc: 'Code Duplication Cleanup' },
  { code: 'MAINT-02', id: 'F20', desc: 'Dead Globals & ESLint Config' },
  { code: 'TEST-01', id: 'F21', desc: 'Concurrency Test Clean Exit' },
  { code: 'TEST-02', id: 'F22', desc: 'Headless Browser Layout Assert' },
  { code: 'MAINT-03', id: 'F23', desc: 'Prettier Code Formatting' },
  { code: 'OPS-01', id: 'F24', desc: 'Config & Secret Externalization' },
  { code: 'DEVOPS-01', id: 'F25', desc: 'CI Automation Workflow' }
];

const FEATURE_ALIAS_MAP = new Map();
for (const f of FEATURES) {
  FEATURE_ALIAS_MAP.set(f.code.toUpperCase(), f.code);
  FEATURE_ALIAS_MAP.set(f.id.toUpperCase(), f.code);
  const shortF = 'F' + String(parseInt(f.id.slice(1), 10));
  FEATURE_ALIAS_MAP.set(shortF, f.code);
}

function normalizeFeatureCode(token) {
  if (!token) return null;
  const upper = String(token).trim().toUpperCase();
  if (FEATURE_ALIAS_MAP.has(upper)) return FEATURE_ALIAS_MAP.get(upper);
  const fMatch = upper.match(/^F0?(\d{1,2})$/);
  if (fMatch) {
    const padded = 'F' + fMatch[1].padStart(2, '0');
    return FEATURE_ALIAS_MAP.get(padded) || null;
  }
  return null;
}

function extractFeatureCodes(description, testOptions = {}) {
  const codes = new Set();
  if (Array.isArray(testOptions.features)) {
    for (const item of testOptions.features) {
      const norm = normalizeFeatureCode(item);
      if (norm) codes.add(norm);
    }
  }
  if (testOptions.featureId) {
    const norm = normalizeFeatureCode(testOptions.featureId);
    if (norm) codes.add(norm);
  }
  const regex = /\b(F\d{1,2}|SEC-\d{2}|PERF-\d{2}|UX-\d{2}|SYNC-\d{2}|OBS-\d{2}|MAINT-\d{2}|TEST-\d{2}|OPS-\d{2}|DEVOPS-\d{2})\b/gi;
  let match;
  while ((match = regex.exec(String(description || ''))) !== null) {
    const norm = normalizeFeatureCode(match[1]);
    if (norm) codes.add(norm);
  }
  return Array.from(codes);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Assertion Primitives (expect)
// ─────────────────────────────────────────────────────────────────────────────

let _activePendingAssertions = null;

function _trackAsyncAssertion(promise) {
  if (_activePendingAssertions) {
    _activePendingAssertions.add(promise);
    // Prevent premature Node unhandledRejection crash before TestSuite awaits pendingAssertions
    promise.catch(() => {});
    promise
      .finally(() => {
        if (_activePendingAssertions) _activePendingAssertions.delete(promise);
      })
      .catch(() => {});
  }
  return promise;
}

function _verifyError(err, exp) {
  const msg = err ? err.message || String(err) : '';
  if (typeof exp === 'string') {
    if (!msg.includes(exp)) {
      throw new Error(
        `Assertion Failed: Expected error message to contain "${exp}", but got "${msg}"`
      );
    }
  } else if (exp instanceof RegExp) {
    if (!exp.test(msg)) {
      throw new Error(
        `Assertion Failed: Expected error message to match ${exp}, but got "${msg}"`
      );
    }
  } else if (typeof exp === 'function') {
    const matches =
      err instanceof exp ||
      (err && err.name === exp.name) ||
      (err && err.constructor && err.constructor.name === exp.name);
    if (!matches) {
      const actualName =
        (err && (err.name || (err.constructor && err.constructor.name))) || typeof err;
      throw new Error(
        `Assertion Failed: Expected error instance of ${exp.name || 'Error'}, but got ${actualName}: "${msg}"`
      );
    }
  }
}

function expect(actual) {
  const matchers = (isNot = false) => ({
    toBe(expected) {
      const pass = actual === expected;
      if (isNot ? pass : !pass) {
        throw new Error(
          `Assertion Failed: Expected ${JSON.stringify(actual)} ${isNot ? 'NOT to be' : 'to be'} ${JSON.stringify(expected)}`
        );
      }
    },
    toEqual(expected) {
      let pass = true;
      try {
        assert.deepStrictEqual(actual, expected);
      } catch {
        pass = false;
      }
      if (isNot ? pass : !pass) {
        throw new Error(
          `Assertion Failed: Expected ${JSON.stringify(actual)} ${isNot ? 'NOT to deeply equal' : 'to deeply equal'} ${JSON.stringify(expected)}`
        );
      }
    },
    toBeTruthy() {
      const pass = Boolean(actual);
      if (isNot ? pass : !pass) {
        throw new Error(
          `Assertion Failed: Expected ${JSON.stringify(actual)} ${isNot ? 'to be falsy' : 'to be truthy'}`
        );
      }
    },
    toBeFalsy() {
      const pass = !actual;
      if (isNot ? pass : !pass) {
        throw new Error(
          `Assertion Failed: Expected ${JSON.stringify(actual)} ${isNot ? 'to be truthy' : 'to be falsy'}`
        );
      }
    },
    toBeNull() {
      const pass = actual === null;
      if (isNot ? pass : !pass) {
        throw new Error(
          `Assertion Failed: Expected ${JSON.stringify(actual)} ${isNot ? 'NOT to be null' : 'to be null'}`
        );
      }
    },
    toBeDefined() {
      const pass = actual !== undefined;
      if (isNot ? pass : !pass) {
        throw new Error(
          `Assertion Failed: Expected ${JSON.stringify(actual)} ${isNot ? 'to be undefined' : 'to be defined'}`
        );
      }
    },
    toBeUndefined() {
      const pass = actual === undefined;
      if (isNot ? pass : !pass) {
        throw new Error(
          `Assertion Failed: Expected ${JSON.stringify(actual)} ${isNot ? 'NOT to be undefined' : 'to be undefined'}`
        );
      }
    },
    toContain(item) {
      let pass = false;
      if (typeof actual === 'string' || Array.isArray(actual)) {
        pass = actual.includes(item);
      } else if (actual && typeof actual === 'object') {
        pass = item in actual || Object.values(actual).includes(item);
      }
      if (isNot ? pass : !pass) {
        throw new Error(
          `Assertion Failed: Expected ${JSON.stringify(actual)} ${isNot ? 'NOT to contain' : 'to contain'} ${JSON.stringify(item)}`
        );
      }
    },
    toMatch(pattern) {
      const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
      const pass = regex.test(String(actual));
      if (isNot ? pass : !pass) {
        throw new Error(
          `Assertion Failed: Expected ${JSON.stringify(actual)} ${isNot ? 'NOT to match' : 'to match'} pattern ${pattern}`
        );
      }
    },
    toBeGreaterThan(val) {
      const pass = actual > val;
      if (isNot ? pass : !pass) {
        throw new Error(
          `Assertion Failed: Expected ${actual} ${isNot ? '<=' : '>'} ${val}`
        );
      }
    },
    toBeGreaterThanOrEqual(val) {
      const pass = actual >= val;
      if (isNot ? pass : !pass) {
        throw new Error(
          `Assertion Failed: Expected ${actual} ${isNot ? '<' : '>='} ${val}`
        );
      }
    },
    toBeLessThan(val) {
      const pass = actual < val;
      if (isNot ? pass : !pass) {
        throw new Error(
          `Assertion Failed: Expected ${actual} ${isNot ? '>=' : '<'} ${val}`
        );
      }
    },
    toBeLessThanOrEqual(val) {
      const pass = actual <= val;
      if (isNot ? pass : !pass) {
        throw new Error(
          `Assertion Failed: Expected ${actual} ${isNot ? '>' : '<='} ${val}`
        );
      }
    },
    toHaveLength(len) {
      const pass = actual && typeof actual.length === 'number' && actual.length === len;
      if (isNot ? pass : !pass) {
        const actualLen = actual ? actual.length : undefined;
        throw new Error(
          `Assertion Failed: Expected length ${isNot ? 'NOT to be' : 'to be'} ${len}, but got ${actualLen}`
        );
      }
    },
    toThrow(expectedError) {
      // Case 1: Target is a Promise directly (e.g. expect(promise).toThrow())
      if (actual && typeof actual.then === 'function') {
        return _trackAsyncAssertion(
          actual.then(
            (val) => {
              if (!isNot) {
                throw new Error(
                  `Assertion Failed: Expected promise to reject, but it resolved with ${JSON.stringify(val)}`
                );
              }
            },
            (err) => {
              if (isNot) {
                throw new Error(
                  `Assertion Failed: Expected promise NOT to reject, but it rejected with "${err ? err.message || err : ''}"`
                );
              }
              if (expectedError) {
                _verifyError(err, expectedError);
              }
            }
          )
        );
      }

      // Case 2: Target is a function
      if (typeof actual === 'function') {
        let res;
        let syncThrew = false;
        let syncError = null;

        try {
          res = actual();
        } catch (err) {
          syncThrew = true;
          syncError = err;
        }

        // Subcase 2a: Function returned a Promise (async function)
        if (!syncThrew && res && typeof res.then === 'function') {
          return _trackAsyncAssertion(
            res.then(
              () => {
                if (!isNot) {
                  throw new Error(
                    `Assertion Failed: Expected async function to throw an error, but it resolved`
                  );
                }
              },
              (err) => {
                if (isNot) {
                  throw new Error(
                    `Assertion Failed: Expected async function NOT to throw, but it rejected with "${err ? err.message || err : ''}"`
                  );
                }
                if (expectedError) {
                  _verifyError(err, expectedError);
                }
              }
            )
          );
        }

        // Subcase 2b: Synchronous function
        if (isNot ? syncThrew : !syncThrew) {
          throw new Error(
            `Assertion Failed: Expected function ${isNot ? 'NOT to throw' : 'to throw an error'}`
          );
        }

        if (syncThrew && expectedError) {
          _verifyError(syncError, expectedError);
        }
        return;
      }

      throw new Error(
        `Assertion Failed: Target must be a function or promise to test for throwing/rejecting`
      );
    }
  });

  const base = matchers(false);
  base.not = matchers(true);
  base.rejects = {
    toThrow: (expected) => matchers(false).toThrow(expected)
  };
  return base;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Test Runner Primitives (TestSuite)
// ─────────────────────────────────────────────────────────────────────────────

class TestSuite {
  constructor(name, options = {}) {
    this.name = name;
    this.options = options;
    this.tests = [];
    this.beforeHooks = [];
    this.afterHooks = [];
    this.beforeEachHooks = [];
    this.afterEachHooks = [];
    this.passed = 0;
    this.failed = 0;
    this.skipped = 0;
    this.errors = [];
    this.duration = 0;
  }

  test(description, fn, testOptions = {}) {
    const featureId = testOptions.featureId || this._extractFeatureId(description);
    const features = extractFeatureCodes(description, { ...testOptions, featureId });
    this.tests.push({
      description,
      fn,
      featureId,
      features,
      tier: testOptions.tier || this.options.tier || null,
      timeoutMs: testOptions.timeoutMs || 10000,
      skip: testOptions.skip || false
    });
  }

  _extractFeatureId(description) {
    const match = description.match(
      /\b(F\d{2}|SEC-\d{2}|PERF-\d{2}|UX-\d{2}|SYNC-\d{2}|OBS-\d{2}|MAINT-\d{2}|TEST-\d{2}|OPS-\d{2}|DEVOPS-\d{2}|TC-PAIR-\d{2}|SCENARIO-\d+)\b/
    );
    return match ? match[1] : null;
  }

  _matchesFeature(t, feature) {
    if (!feature) return true;
    const target = String(feature).trim().toLowerCase();
    const normTarget = normalizeFeatureCode(feature);
    if (normTarget && Array.isArray(t.features) && t.features.includes(normTarget)) {
      return true;
    }
    if (t.featureId && t.featureId.toLowerCase().includes(target)) {
      return true;
    }
    if (t.description.toLowerCase().includes(target)) {
      return true;
    }
    return false;
  }

  before(fn) {
    this.beforeHooks.push(fn);
  }

  after(fn) {
    this.afterHooks.push(fn);
  }

  beforeEach(fn) {
    this.beforeEachHooks.push(fn);
  }

  afterEach(fn) {
    this.afterEachHooks.push(fn);
  }

  async run(runnerOptions = {}) {
    const { grep = null, feature = null, bail = false, verbose = false } = runnerOptions;
    const startTime = Date.now();

    let grepRegex = null;
    if (grep) {
      try {
        grepRegex = new RegExp(grep, 'i');
      } catch (err) {
        throw new Error(`Invalid grep pattern "${grep}": ${err.message}`);
      }
    }

    this.passed = 0;
    this.failed = 0;
    this.skipped = 0;
    this.errors = [];
    const testResults = [];

    try {
      for (const hook of this.beforeHooks) {
        await hook();
      }

      for (const t of this.tests) {
        if (grepRegex && !grepRegex.test(t.description)) {
          this.skipped++;
          testResults.push({
            description: t.description,
            featureId: t.featureId,
            features: t.features,
            status: 'skipped'
          });
          continue;
        }
        if (feature && !this._matchesFeature(t, feature)) {
          this.skipped++;
          testResults.push({
            description: t.description,
            featureId: t.featureId,
            features: t.features,
            status: 'skipped'
          });
          continue;
        }

        if (t.skip) {
          this.skipped++;
          testResults.push({
            description: t.description,
            featureId: t.featureId,
            features: t.features,
            status: 'skipped'
          });
          if (verbose) console.log(`  - [SKIP] ${t.description}`);
          continue;
        }

        const tStart = Date.now();
        const pendingAssertions = new Set();
        _activePendingAssertions = pendingAssertions;
        let timeoutId = null;
        let bailOut = false;

        try {
          for (const hook of this.beforeEachHooks) {
            await hook();
          }

          const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(
              () => reject(new Error(`Test timed out after ${t.timeoutMs}ms`)),
              t.timeoutMs
            );
            if (timeoutId && typeof timeoutId.unref === 'function') {
              timeoutId.unref();
            }
          });

          await Promise.race([
            (async () => {
              await t.fn();
              if (pendingAssertions.size > 0) {
                await Promise.all(Array.from(pendingAssertions));
              }
            })(),
            timeoutPromise
          ]);

          this.passed++;
          testResults.push({
            description: t.description,
            featureId: t.featureId,
            features: t.features,
            status: 'passed'
          });
          const elapsed = Date.now() - tStart;
          if (verbose) {
            console.log(`  \x1b[32m✔ [PASS]\x1b[0m ${t.description} (${elapsed}ms)`);
          }
        } catch (err) {
          this.failed++;
          const elapsed = Date.now() - tStart;
          this.errors.push({
            description: t.description,
            featureId: t.featureId,
            error: err,
            stack: err.stack,
            duration: elapsed
          });
          testResults.push({
            description: t.description,
            featureId: t.featureId,
            features: t.features,
            status: 'failed'
          });

          console.error(`  \x1b[31m✖ [FAIL]\x1b[0m ${t.description}`);
          console.error(`      \x1b[31mError:\x1b[0m ${err.message}`);
          if (verbose && err.stack) {
            console.error(
              `      \x1b[90m${err.stack.split('\n').slice(1, 4).join('\n      ')}\x1b[0m`
            );
          }

          if (bail) {
            console.warn(`  \x1b[33m[BAIL]\x1b[0m Stopping suite execution on first failure.`);
            bailOut = true;
          }
        } finally {
          _activePendingAssertions = null;
          if (timeoutId !== null) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
          for (const hook of this.afterEachHooks) {
            try {
              await hook();
            } catch (hookErr) {
              console.error(`      \x1b[31mError in afterEach hook:\x1b[0m ${hookErr.message}`);
            }
          }
        }

        if (bailOut) break;
      }
    } finally {
      _activePendingAssertions = null;
      for (const hook of this.afterHooks) {
        try {
          await hook();
        } catch (err) {
          console.error(`Error in after hook: ${err.message}`);
        }
      }
    }

    this.duration = Date.now() - startTime;
    return {
      name: this.name,
      total: this.tests.length,
      passed: this.passed,
      failed: this.failed,
      skipped: this.skipped,
      duration: this.duration,
      errors: this.errors,
      results: testResults
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. MockSupabaseServer (In-Memory HTTP PostgREST, Auth, Storage)
// ─────────────────────────────────────────────────────────────────────────────

const ADMIN_FIXTURE_TOKENS = new Set([
  'admin_token',
  'admin_token_andrew',
  'officer_admin_token',
  'officer_token'
]);

const MEMBER_FIXTURE_TOKENS = new Map([
  ['member_A_token', '010101-14-1234'],
  ['valid_member_token', '010101-14-1234'],
  ['member_B_token', '020202-10-5678']
]);

const ANON_TOKENS = new Set(['anon', 'anon_key', 'anon_test_key']);

const PRIVATE_STORAGE_BUCKETS = new Set([
  'private-docs',
  'private',
  'waivers',
  'receipts',
  'avatars',
  'resources'
]);

class MockSupabaseServer {
  constructor(initialData = {}) {
    this.server = null;
    this.port = 0;
    this.url = '';
    this.sockets = new Set();
    this.requestLog = [];
    this.customRoutes = new Map();
    this.memberSessions = new Map();
    this.rlsPoliciesActive = true;
    this.rateLimit = { active: false, status: 429 };
    this._idSeq = 0;

    this.initialData = initialData;
    this.resetDatabase(initialData);
  }

  resetDatabase(seed = {}) {
    this.requestLog = [];
    this.customRoutes.clear();
    this.memberSessions.clear();
    this.rlsPoliciesActive = true;
    this.rateLimit = { active: false, status: 429 };

    const defaultForms = [
      {
        id: 'form-1',
        title: 'Enrolment Service 2026',
        responses: [{ id: 'resp-1', member_ic: '010101-14-1234' }]
      }
    ];

    // Standard database fixtures
    this.db = {
      bb_members: [
        {
          id: 1,
          ic: '010101-14-1234',
          name: 'Robert Tan',
          email: 'robert@1stpjbb.org',
          department: 'Seniors',
          role: 'member',
          rank: 'Staff Sergeant',
          avatar_color: '#1e3a8a',
          avatar_outline: 'solid',
          status: 'active',
          password_hash: crypto
            .createHash('sha256')
            .update('MemberPass123!bb_salt_robert')
            .digest('hex'),
          salt: 'bb_salt_robert',
          created_at: new Date(Date.now() - 86400000).toISOString()
        },
        {
          id: 2,
          ic: '020202-10-5678',
          name: 'Lucas Wong',
          email: 'lucas@1stpjbb.org',
          department: 'Juniors',
          role: 'member',
          rank: 'Corporal',
          avatar_color: '#059669',
          status: 'active',
          password_hash: crypto
            .createHash('sha256')
            .update('Pass456!bb_salt_lucas')
            .digest('hex'),
          salt: 'bb_salt_lucas',
          created_at: new Date(Date.now() - 43200000).toISOString()
        },
        {
          id: 3,
          ic: '030303-14-9999',
          name: 'Deleted User',
          email: 'deleted@1stpjbb.org',
          department: 'deleted',
          role: 'member',
          rank: 'Private',
          status: 'deleted',
          created_at: new Date(Date.now() - 200000).toISOString()
        },
        {
          id: 4,
          ic: '900101-14-0001',
          name: 'Captain Andrew',
          email: 'officer@1stpjbb.org',
          department: 'Officers',
          role: 'officer_admin',
          rank: 'Captain',
          status: 'active',
          password_hash: crypto
            .createHash('sha256')
            .update('AdminPass2026!bb_salt_andrew')
            .digest('hex'),
          salt: 'bb_salt_andrew',
          created_at: new Date(Date.now() - 1000000).toISOString()
        }
      ],
      bb_tasks: [
        {
          id: 'task-1',
          title: 'Prepare Inspection Drill',
          department: 'Seniors',
          status: 'pending',
          priority: 'high',
          created_at: new Date().toISOString()
        },
        {
          id: 'task-2',
          title: 'Verify Badge Rosters',
          department: 'Juniors',
          status: 'in_progress',
          priority: 'medium',
          created_at: new Date().toISOString()
        }
      ],
      bb_orders: [
        {
          id: 101,
          order_number: 'ORD-1001',
          ic: '010101-14-1234',
          total_amount: 45.0,
          status: 'pending',
          items: [{ name: 'Junior Uniform Shirt', qty: 1 }],
          created_at: new Date().toISOString()
        },
        {
          id: 102,
          order_number: 'ORD-1002',
          ic: '020202-10-5678',
          total_amount: 25.0,
          status: 'completed',
          items: [{ name: 'Drill Cap', qty: 1 }],
          created_at: new Date().toISOString()
        }
      ],
      bb_announcements: [
        {
          id: 'ann-1',
          title: 'Annual Parade 2026',
          body: 'Parade details and timings.',
          priority: 'high',
          created_at: new Date().toISOString()
        },
        {
          id: 'ann-2',
          title: 'Camp Briefing',
          body: 'Camp location and gear list.',
          priority: 'normal',
          created_at: new Date().toISOString()
        }
      ],
      bb_gallery: [
        {
          id: 'gal-1',
          url: 'events/parade2026.jpg',
          title: 'Parade Opening',
          type: 'image',
          created_at: new Date().toISOString()
        },
        {
          id: 'gal-2',
          url: 'events/drill.jpg',
          title: 'Squad Drill',
          type: 'image',
          created_at: new Date().toISOString()
        }
      ],
      bb_config: {
        bb_company_calendar: JSON.stringify([{ id: 'c1', title: 'Parade', date: '2026-11-21' }]),
        bb_announcements_cfg: JSON.stringify({ defaultLimit: 20 }),
        bb_uniform_pricing: JSON.stringify({ shirt: 45, cap: 15, belt: 12 }),
        bb_admin_roles: JSON.stringify(['officer_admin', 'super_admin']),
        bb_master_sheet_config: JSON.stringify({
          secret_key: 'SHEETS_SYNC_SECRET_TOP_SECRET',
          sheetId: '1AbCdEfGh'
        }),
        bb_sheets_sync_token: JSON.stringify({ token: 'SYNC_TOKEN_SECRET_VALUE' }),
        bb_reset_otp_test: JSON.stringify({
          otp_hash: 'masked_otp_hash',
          expires_at: Date.now() + 900000
        }),
        bb_gemini_api_key: JSON.stringify({ configured: true, key_hint: 'AIza***' }),
        bb_forum_posts: JSON.stringify([
          {
            id: 1,
            title: 'Camp Discussion',
            comments: [{ id: 1, author: 'Robert', text: 'Excited for camp!' }]
          }
        ]),
        bb_resources: JSON.stringify([
          { id: 'res-1', title: 'Band Score: Anchor Song', type: 'pdf', url: 'docs/anchor.pdf' }
        ]),
        bb_custom_forms: JSON.stringify([
          { id: 'form-1', title: 'Enrolment Service 2026', fields: ['name', 'dietary'] }
        ])
      },
      bb_audit_logs: [],
      bb_resources: [
        {
          id: 'res-1',
          title: 'Band Score: Anchor Song',
          category: 'band',
          url: 'docs/anchor.pdf',
          created_at: new Date().toISOString()
        }
      ],
      bb_password_resets: [],
      bb_admin_sessions: [],
      bb_attendance: [
        { id: 1, squad_id: 1, member_ic: '010101-14-1234', date: '2026-11-14', present: true }
      ],
      bb_custom_forms: defaultForms,
      bb_forms: defaultForms,
      bb_badges: [
        {
          id: 'badge-1',
          member_ic: '010101-14-1234',
          badge_name: 'Target Badge',
          status: 'awarded',
          awarded_date: '2026-05-10'
        },
        {
          id: 'badge-2',
          member_ic: '020202-10-5678',
          badge_name: 'Drill Badge Stage 1',
          status: 'in_progress',
          awarded_date: null
        }
      ],
      bb_member_badges: [
        {
          id: 1,
          ic: '010101-14-1234',
          badge_data: JSON.stringify({
            bb1: { basic: true, basicDate: '2026-05-10' }
          })
        }
      ],
      'storage.objects': [
        { bucket: 'gallery', path: 'events/parade2026.jpg', size: 1048576 },
        { bucket: 'private-docs', path: 'manual.pdf', size: 2048576 }
      ],
      ...seed
    };

    const formsRef = seed.bb_custom_forms || seed.bb_forms || defaultForms;
    this.db.bb_custom_forms = formsRef;
    this.db.bb_forms = formsRef;
  }

  mockRoute(routePrefix, responseConfig) {
    this.customRoutes.set(routePrefix, responseConfig);
  }

  getRequests(filterFn) {
    return filterFn ? this.requestLog.filter(filterFn) : [...this.requestLog];
  }

  async start() {
    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => this._handleRequest(req, res));
      this.server.on('connection', (socket) => {
        this.sockets.add(socket);
        socket.on('close', () => this.sockets.delete(socket));
      });

      this.server.listen(0, '127.0.0.1', () => {
        this.port = this.server.address().port;
        this.url = `http://127.0.0.1:${this.port}`;
        resolve(this.url);
      });
    });
  }

  async stop() {
    if (!this.server) return;
    for (const socket of this.sockets) {
      socket.destroy();
    }
    this.sockets.clear();
    await new Promise((resolve) => this.server.close(resolve));
    this.server = null;
  }

  _sendJson(res, statusCode, data, headers = {}) {
    const body = JSON.stringify(data);
    res.writeHead(statusCode, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, apikey, Authorization, Prefer, Range',
      'Access-Control-Expose-Headers': 'Content-Range',
      ...headers
    });
    res.end(body);
  }

  _sendError(res, statusCode, code, message) {
    this._sendJson(res, statusCode, { code, message, hint: null, details: null });
  }

  _likeToRegex(pattern, caseInsensitive = false) {
    const escaped = String(pattern).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(
      '^' + escaped.replace(/%/g, '.*').replace(/_/g, '.') + '$',
      caseInsensitive ? 'i' : ''
    );
  }

  _isProtectedConfigKey(key) {
    const k = String(key || '').toLowerCase();
    return (
      k === 'bb_master_sheet_config' ||
      k.includes('secret') ||
      k.includes('sync_token') ||
      k.startsWith('bb_reset_otp_') ||
      k === 'bb_gemini_api_key'
    );
  }

  async _handleRequest(req, res) {
    const parsedUrl = new URL(req.url, this.url || `http://127.0.0.1:${this.port}`);
    const pathname = parsedUrl.pathname;
    const searchParams = parsedUrl.searchParams;

    // Collect body
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const rawBody = Buffer.concat(chunks).toString();
    const contentType = String(req.headers['content-type'] || '').toLowerCase();
    let body = null;
    if (rawBody) {
      try {
        body = JSON.parse(rawBody);
      } catch {
        if (
          contentType.includes('application/json') ||
          (pathname.startsWith('/rest/v1/') && (req.method === 'POST' || req.method === 'PATCH'))
        ) {
          return this._sendError(res, 400, 'PGRST102', 'Invalid JSON request body');
        }
        body = rawBody;
      }
    }

    const reqRecord = {
      method: req.method,
      url: req.url,
      pathname,
      searchParams,
      headers: req.headers,
      body,
      timestamp: Date.now()
    };
    this.requestLog.push(reqRecord);

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, apikey, Authorization, Prefer, Range'
      });
      res.end();
      return;
    }

    // Check custom routes / fault injection
    for (const [prefix, customHandler] of this.customRoutes.entries()) {
      if (pathname.startsWith(prefix) || req.url.startsWith(prefix)) {
        if (typeof customHandler === 'function') {
          return customHandler(reqRecord, res);
        } else if (typeof customHandler === 'object') {
          return this._sendJson(
            res,
            customHandler.status || 200,
            customHandler.data !== undefined ? customHandler.data : customHandler,
            customHandler.headers || {}
          );
        }
      }
    }

    // Check rate limit fault
    if (this.rateLimit.active) {
      return this._sendError(res, this.rateLimit.status || 429, 'PGRST429', 'Too Many Requests');
    }

    // Validate caller identity & reject forged/expired Bearer tokens
    const identity = this._getCallerIdentity(req);
    if (identity.invalidToken) {
      return this._sendError(res, 401, 'PGRST301', 'JWT expired or invalid token');
    }

    // Route dispatch
    if (pathname.startsWith('/rest/v1/rpc/')) {
      const rpcName = pathname.replace('/rest/v1/rpc/', '');
      return this._handleRpc(rpcName, body, req, res);
    }

    if (pathname.startsWith('/rest/v1/')) {
      const tableName = pathname.replace('/rest/v1/', '').split('?')[0];
      return this._handlePostgrest(tableName, req, res, searchParams, body);
    }

    if (pathname.startsWith('/storage/v1/')) {
      return this._handleStorage(pathname, req, res, body);
    }

    this._sendError(res, 404, '404', 'Endpoint Not Found');
  }

  _getCallerIdentity(req) {
    const auth = req.headers['authorization'] || '';
    if (!auth) {
      return { isAnon: true, isAdmin: false, ic: null, invalidToken: false };
    }
    if (!auth.startsWith('Bearer ')) {
      return { isAnon: true, isAdmin: false, ic: null, invalidToken: true };
    }
    const token = auth.slice(7).trim();
    if (!token || token.includes('invalid') || token.includes('eyJhbGciOiJub25l')) {
      return { isAnon: true, isAdmin: false, ic: null, invalidToken: true };
    }
    if (ANON_TOKENS.has(token)) {
      return { isAnon: true, isAdmin: false, ic: null, invalidToken: false };
    }
    if (ADMIN_FIXTURE_TOKENS.has(token)) {
      return { isAnon: false, isAdmin: true, ic: '900101-14-0001', invalidToken: false };
    }
    const adminSess = (this.db && this.db.bb_admin_sessions || []).find((s) => s.token === token);
    if (adminSess) {
      if (Date.now() <= adminSess.expires_at) {
        return {
          isAnon: false,
          isAdmin: true,
          ic: '900101-14-0001',
          email: adminSess.email,
          invalidToken: false
        };
      }
      return { isAnon: true, isAdmin: false, ic: null, invalidToken: true };
    }
    if (this.memberSessions && this.memberSessions.has(token)) {
      const sess = this.memberSessions.get(token);
      return {
        isAnon: false,
        isAdmin: false,
        ic: sess.ic,
        email: sess.email,
        invalidToken: false
      };
    }
    if (MEMBER_FIXTURE_TOKENS.has(token)) {
      return {
        isAnon: false,
        isAdmin: false,
        ic: MEMBER_FIXTURE_TOKENS.get(token),
        invalidToken: false
      };
    }
    // Unrecognized Bearer token is rejected with 401
    return { isAnon: true, isAdmin: false, ic: null, invalidToken: true };
  }

  _isAnon(req) {
    return this._getCallerIdentity(req).isAnon;
  }

  _isAdmin(req) {
    return this._getCallerIdentity(req).isAdmin;
  }

  // ── PostgREST Handler ──
  _handlePostgrest(tableName, req, res, searchParams, body) {
    const caller = this._getCallerIdentity(req);
    const isAnon = caller.isAnon;
    const isAdmin = caller.isAdmin;
    const canonicalTable = tableName === 'bb_forms' ? 'bb_custom_forms' : tableName;

    // Feature 17 / OBS-01: bb_audit_logs is an immutable append-only ledger
    if (canonicalTable === 'bb_audit_logs') {
      if (req.method === 'PATCH' || req.method === 'DELETE') {
        return this._sendError(
          res,
          403,
          '42501',
          'audit logs table is an append-only ledger: updates and deletions are forbidden'
        );
      }
      if (isAnon && req.method === 'POST') {
        return this._sendError(res, 403, '42501', 'permission denied for table "bb_audit_logs"');
      }
    }

    // Special table: bb_config key-value map
    if (tableName === 'bb_config') {
      return this._handleConfigTable(req, res, searchParams, body, isAnon, isAdmin);
    }

    // SEC-02: Revoke password column select
    if (
      tableName === 'bb_members' &&
      searchParams.get('select') &&
      searchParams.get('select').includes('password')
    ) {
      return this._sendError(
        res,
        403,
        '42501',
        'permission denied for column "password" of relation "bb_members"'
      );
    }

    // SEC-02: Protect bb_password_resets direct read
    if (tableName === 'bb_password_resets' && this.rlsPoliciesActive && !isAdmin) {
      return this._sendJson(res, 200, []);
    }

    // SEC-01 & SEC-05: Strict RLS checks for mutations when active
    if (this.rlsPoliciesActive) {
      const ADMIN_ONLY_TABLES = [
        'bb_tasks',
        'bb_announcements',
        'bb_gallery',
        'bb_custom_forms',
        'bb_badges',
        'bb_member_badges',
        'bb_resources'
      ];

      if (ADMIN_ONLY_TABLES.includes(canonicalTable) && ['POST', 'PATCH', 'DELETE'].includes(req.method)) {
        if (!isAdmin) {
          return this._sendError(
            res,
            403,
            '42501',
            'new row violates row-level security policy for table "' + canonicalTable + '"'
          );
        }
      }

      if (canonicalTable === 'bb_orders' && (req.method === 'PATCH' || req.method === 'DELETE')) {
        if (!isAdmin) {
          return this._sendError(
            res,
            403,
            '42501',
            'new row violates row-level security policy for table "bb_orders"'
          );
        }
      }

      if (canonicalTable === 'bb_attendance') {
        if (req.method === 'PATCH' || req.method === 'DELETE') {
          if (!isAdmin) {
            return this._sendError(
              res,
              403,
              '42501',
              'new row violates row-level security policy for table "bb_attendance"'
            );
          }
        } else if (req.method === 'POST') {
          const itemIc = Array.isArray(body) ? body[0]?.member_ic : body?.member_ic;
          if (isAnon || (!isAdmin && itemIc && itemIc !== caller.ic)) {
            return this._sendError(
              res,
              403,
              '42501',
              'new row violates row-level security policy for table "bb_attendance"'
            );
          }
        }
      }

      if (canonicalTable === 'bb_members') {
        if (req.method === 'DELETE' && !isAdmin) {
          return this._sendError(
            res,
            403,
            '42501',
            'new row violates row-level security policy for table "bb_members"'
          );
        }
        if (req.method === 'POST') {
          const items = Array.isArray(body) ? body : [body];
          if (!isAdmin && items.some((it) => it && it.role === 'officer_admin')) {
            return this._sendError(
              res,
              403,
              '42501',
              'Privilege escalation blocked for table "bb_members"'
            );
          }
        }
        if (req.method === 'PATCH' && !isAdmin) {
          if (isAnon) {
            return this._sendError(
              res,
              403,
              '42501',
              'new row violates row-level security policy for table "bb_members"'
            );
          }
          const forbiddenFields = ['role', 'status', 'password_hash', 'salt'];
          if (body && typeof body === 'object' && forbiddenFields.some((f) => f in body)) {
            return this._sendError(
              res,
              403,
              '42501',
              'Cannot modify privileged columns on "bb_members"'
            );
          }
        }
      }
    }

    const tableData = this.db[canonicalTable];
    if (!tableData) {
      return this._sendError(res, 404, '42P01', `relation "${tableName}" does not exist`);
    }

    // POST: Insert
    if (req.method === 'POST') {
      if (!body || typeof body !== 'object') {
        return this._sendError(res, 400, 'PGRST102', 'JSON object or array body required');
      }
      const records = Array.isArray(body) ? body : [body];
      if (records.some((r) => !r || typeof r !== 'object' || Array.isArray(r))) {
        return this._sendError(res, 400, 'PGRST102', 'Each record must be a JSON object');
      }

      const inserted = [];
      for (const item of records) {
        if (canonicalTable === 'bb_orders' && item.order_number) {
          const dup = tableData.find((o) => o.order_number === item.order_number);
          if (dup) {
            return this._sendError(
              res,
              409,
              '23505',
              'duplicate key value violates unique constraint "bb_orders_order_number_key"'
            );
          }
        }
        const id =
          item.id !== undefined && item.id !== null
            ? item.id
            : typeof item.order_number !== 'undefined'
              ? 100 + tableData.length + ++this._idSeq
              : `item_${++this._idSeq}_${crypto.randomUUID()}`;
        const newRecord = { id, created_at: new Date().toISOString(), ...item };
        tableData.push(newRecord);
        inserted.push(newRecord);
      }
      return this._sendJson(res, 201, Array.isArray(body) ? inserted : inserted[0]);
    }

    // GET: Query
    if (req.method === 'GET') {
      let filtered = [...tableData];

      // SEC-05: IDOR & Owner-Scoped Access Control on bb_orders
      if (canonicalTable === 'bb_orders' && this.rlsPoliciesActive && !caller.isAdmin) {
        if (caller.isAnon || !caller.ic) {
          return this._sendJson(res, 200, []);
        }
        const icFilter = searchParams.get('ic');
        if (icFilter) {
          const targetIc = icFilter.replace(/^eq\./, '');
          if (targetIc !== caller.ic) {
            return this._sendJson(res, 200, []);
          }
        }
        filtered = filtered.filter((row) => row.ic === caller.ic);
      }

      // Parse filters
      for (const [param, val] of searchParams.entries()) {
        if (['select', 'order', 'limit', 'offset'].includes(param)) continue;

        if (val.startsWith('eq.')) {
          const target = val.slice(3);
          filtered = filtered.filter((row) => String(row[param]) === target);
        } else if (val.startsWith('neq.')) {
          const target = val.slice(4);
          filtered = filtered.filter((row) => String(row[param]) !== target);
        } else if (val.startsWith('in.')) {
          const rawList = val.slice(4, -1);
          const allowed = rawList.split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, ''));
          filtered = filtered.filter((row) => allowed.includes(String(row[param])));
        } else if (val.startsWith('like.')) {
          const pattern = this._likeToRegex(val.slice(5), false);
          filtered = filtered.filter((row) => pattern.test(String(row[param] || '')));
        } else if (val.startsWith('ilike.')) {
          const pattern = this._likeToRegex(val.slice(6), true);
          filtered = filtered.filter((row) => pattern.test(String(row[param] || '')));
        }
      }

      // Handle or=(...) query
      const orClause = searchParams.get('or');
      if (orClause) {
        const inner = orClause.replace(/^\(|\)$/g, '');
        const conditions = inner.split(',');
        filtered = filtered.filter((row) => {
          return conditions.some((cond) => {
            if (cond.includes('.eq.')) {
              const idx = cond.indexOf('.eq.');
              const field = cond.slice(0, idx);
              const value = decodeURIComponent(cond.slice(idx + 4));
              return String(row[field]) === value;
            }
            if (cond.includes('.ilike.')) {
              const idx = cond.indexOf('.ilike.');
              const field = cond.slice(0, idx);
              const value = decodeURIComponent(cond.slice(idx + 7));
              return String(row[field] || '').toLowerCase() === value.toLowerCase();
            }
            return false;
          });
        });
      }

      // Ordering
      const order = searchParams.get('order');
      if (order) {
        const [field, dir] = order.split('.');
        filtered.sort((a, b) => {
          if (a[field] < b[field]) return dir === 'desc' ? 1 : -1;
          if (a[field] > b[field]) return dir === 'desc' ? -1 : 1;
          return 0;
        });
      }

      const totalCount = filtered.length;

      // Pagination
      const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10) || 0);
      const limit = searchParams.has('limit')
        ? Math.max(0, parseInt(searchParams.get('limit'), 10) || 0)
        : filtered.length;
      filtered = filtered.slice(offset, offset + limit);

      // SEC-02: Strip credential fields on bb_members reads
      if (canonicalTable === 'bb_members') {
        filtered = filtered.map((row) => {
          const { password_hash: _ph, password: _pw, salt: _s, ...safe } = row;
          return safe;
        });
      }

      const endRange = filtered.length > 0 ? offset + filtered.length - 1 : offset;
      return this._sendJson(res, 200, filtered, {
        'Content-Range': `${offset}-${endRange}/${totalCount}`
      });
    }

    // PATCH: Update
    if (req.method === 'PATCH') {
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return this._sendError(res, 400, 'PGRST102', 'JSON object body required');
      }
      const idFilter = searchParams.get('id') || searchParams.get('ic');
      const targetVal = idFilter ? idFilter.replace(/^eq\./, '') : null;

      if (canonicalTable === 'bb_members' && this.rlsPoliciesActive && !isAdmin) {
        const matched = tableData.filter(
          (row) => !targetVal || String(row.id) === targetVal || String(row.ic) === targetVal
        );
        if (matched.some((row) => row.ic !== caller.ic)) {
          return this._sendError(
            res,
            403,
            '42501',
            'Cannot update another member record under RLS'
          );
        }
      }

      let matchedCount = 0;
      for (let i = 0; i < tableData.length; i++) {
        if (
          !targetVal ||
          String(tableData[i].id) === targetVal ||
          String(tableData[i].ic) === targetVal
        ) {
          tableData[i] = { ...tableData[i], ...body, updated_at: new Date().toISOString() };
          matchedCount++;
        }
      }
      return this._sendJson(res, 200, matchedCount > 0 ? [{ success: true }] : []);
    }

    // DELETE
    if (req.method === 'DELETE') {
      const idFilter = searchParams.get('id') || searchParams.get('order_number');
      const targetVal = idFilter ? idFilter.replace(/^eq\./, '') : null;

      const kept = tableData.filter((row) => {
        if (targetVal) {
          return String(row.id) !== targetVal && String(row.order_number) !== targetVal;
        }
        return false;
      });
      const removed = tableData.length - kept.length;
      tableData.splice(0, tableData.length, ...kept);
      return this._sendJson(res, 200, removed > 0 ? [{ success: true }] : []);
    }

    this._sendError(res, 405, '405', 'Method Not Allowed');
  }

  _handleConfigTable(req, res, searchParams, body, isAnon, isAdmin) {
    const configMap = this.db.bb_config;
    const enforceShield = this.rlsPoliciesActive && !isAdmin;

    if (req.method === 'GET') {
      const keyParam = searchParams.get('key');
      const results = [];

      if (keyParam) {
        if (keyParam.startsWith('in.')) {
          const raw = keyParam.slice(3).replace(/^\(|\)$/g, '');
          const keys = raw
            .split(',')
            .map((k) => decodeURIComponent(k.trim().replace(/^['"]|['"]$/g, '')));
          for (const k of keys) {
            if (enforceShield && this._isProtectedConfigKey(k)) continue;
            if (Object.hasOwn(configMap, k)) {
              results.push({ key: k, value: configMap[k] });
            }
          }
        } else if (keyParam.startsWith('eq.')) {
          const k = decodeURIComponent(keyParam.slice(3));
          if (!(enforceShield && this._isProtectedConfigKey(k))) {
            if (Object.hasOwn(configMap, k)) {
              results.push({ key: k, value: configMap[k] });
            }
          }
        } else if (keyParam.startsWith('like.')) {
          const rx = this._likeToRegex(keyParam.slice(5), false);
          for (const [k, v] of Object.entries(configMap)) {
            if (enforceShield && this._isProtectedConfigKey(k)) continue;
            if (rx.test(k)) {
              results.push({ key: k, value: v });
            }
          }
        } else if (keyParam.startsWith('ilike.')) {
          const rx = this._likeToRegex(keyParam.slice(6), true);
          for (const [k, v] of Object.entries(configMap)) {
            if (enforceShield && this._isProtectedConfigKey(k)) continue;
            if (rx.test(k)) {
              results.push({ key: k, value: v });
            }
          }
        }
      } else {
        for (const [k, v] of Object.entries(configMap)) {
          if (enforceShield && this._isProtectedConfigKey(k)) continue;
          results.push({ key: k, value: v });
        }
      }

      return this._sendJson(res, 200, results);
    }

    if (req.method === 'POST') {
      if (this.rlsPoliciesActive && !isAdmin) {
        return this._sendError(res, 403, '42501', 'Configuration modification requires admin privileges');
      }
      if (!body || typeof body !== 'object') {
        return this._sendError(res, 400, 'PGRST102', 'JSON object or array body required');
      }
      const records = Array.isArray(body) ? body : [body];
      for (const rec of records) {
        if (rec && rec.key) {
          configMap[rec.key] = typeof rec.value === 'string' ? rec.value : JSON.stringify(rec.value);
        }
      }
      return this._sendJson(res, 201, records);
    }

    this._sendError(res, 405, '405', 'Method Not Allowed');
  }

  // ── Auth & RPC Handler ──
  _handleRpc(rpcName, body = {}, req, res) {
    body = body || {};

    if (rpcName === 'rpc_get_auth_salt') {
      const email = (body.p_email || '').toLowerCase().trim();
      const member = this.db.bb_members.find((m) => m.email.toLowerCase() === email);
      if (member && member.salt) {
        return this._sendJson(res, 200, {
          found: true,
          salt: member.salt,
          iterations: 100000,
          algorithm: 'pbkdf2:sha256'
        });
      }
      const pseudoSalt = crypto
        .createHash('sha256')
        .update(email + '1stpjbb_salt_padding')
        .digest('hex');
      return this._sendJson(res, 200, {
        found: false,
        salt: pseudoSalt,
        iterations: 100000,
        algorithm: 'pbkdf2:sha256'
      });
    }

    if (rpcName === 'rpc_authenticate_member') {
      const email = (body.p_email || '').toLowerCase().trim();
      const passHash = body.p_password_hash || '';

      if (!email || !passHash) {
        return this._sendJson(res, 400, {
          success: false,
          error: 'Email and password credentials are required'
        });
      }

      const member = this.db.bb_members.find(
        (m) => m.email.toLowerCase() === email && m.status !== 'deleted'
      );
      if (member && member.password_hash === passHash) {
        const sanitized = { ...member };
        delete sanitized.password_hash;
        delete sanitized.password;
        delete sanitized.salt;
        const token = 'token_' + crypto.randomBytes(16).toString('hex');
        if (this.memberSessions) {
          this.memberSessions.set(token, {
            ic: member.ic,
            email: member.email,
            role: member.role
          });
        }
        return this._sendJson(res, 200, {
          success: true,
          account: sanitized,
          token
        });
      }

      return this._sendJson(res, 401, {
        success: false,
        error: 'Invalid email or password'
      });
    }

    if (rpcName === 'rpc_verify_member_session') {
      const token = body.p_token;
      const ident = String(body.p_email || '').toLowerCase().trim();
      if (!token) {
        return this._sendJson(res, 200, { valid: false });
      }
      if (this.memberSessions.has(token)) {
        const sess = this.memberSessions.get(token);
        const member = this.db.bb_members.find(
          (m) => m.ic === sess.ic && m.status !== 'deleted' && m.department !== 'deleted'
        );
        if (
          member &&
          (!ident ||
            member.email.toLowerCase() === ident ||
            member.ic.toLowerCase() === ident)
        ) {
          return this._sendJson(res, 200, { valid: true, ic: member.ic, email: member.email });
        }
        return this._sendJson(res, 200, { valid: false });
      }
      if (MEMBER_FIXTURE_TOKENS.has(token)) {
        const ic = MEMBER_FIXTURE_TOKENS.get(token);
        const member = this.db.bb_members.find(
          (m) => m.ic === ic && m.status !== 'deleted' && m.department !== 'deleted'
        );
        return this._sendJson(res, 200, { valid: Boolean(member) });
      }
      return this._sendJson(res, 200, { valid: false });
    }

    if (rpcName === 'rpc_sign_out_everywhere') {
      const token = body.p_token;
      const email = String(body.p_email || '').toLowerCase().trim();
      const ic = String(body.p_ic || '').toLowerCase().trim();
      for (const [tok, sess] of this.memberSessions.entries()) {
        if (
          (token && tok === token) ||
          (email && String(sess.email || '').toLowerCase() === email) ||
          (ic && String(sess.ic || '').toLowerCase() === ic)
        ) {
          this.memberSessions.delete(tok);
        }
      }
      if (token) {
        this.db.bb_admin_sessions = this.db.bb_admin_sessions.filter((s) => s.token !== token);
      }
      return this._sendJson(res, 200, { success: true });
    }

    if (rpcName === 'rpc_request_password_reset') {
      const email = (body.p_email || '').toLowerCase().trim();
      const otpCode = body.p_otp_code || '';
      const otpHash = crypto.createHash('sha256').update(otpCode).digest('hex');

      this.db.bb_password_resets.push({
        email,
        otp_hash: otpHash,
        attempts: 0,
        max_attempts: 5,
        used: false,
        expires_at: Date.now() + 15 * 60 * 1000
      });

      return this._sendJson(res, 200, { success: true });
    }

    if (rpcName === 'rpc_verify_otp_and_reset_password') {
      const email = (body.p_email || '').toLowerCase().trim();
      const otpCode = body.p_otp_code || '';
      const newPassHash = body.p_new_password_hash || '';

      const resetRecord = this.db.bb_password_resets.find((r) => r.email === email && !r.used);
      if (!resetRecord) {
        return this._sendJson(res, 400, {
          success: false,
          error: 'No active password reset request'
        });
      }

      if (Date.now() > resetRecord.expires_at) {
        resetRecord.used = true;
        return this._sendJson(res, 400, {
          success: false,
          error: 'Verification code has expired'
        });
      }

      if (resetRecord.attempts >= resetRecord.max_attempts) {
        resetRecord.used = true;
        return this._sendJson(res, 429, {
          success: false,
          error: 'Too many failed verification attempts'
        });
      }

      const incomingHash = crypto.createHash('sha256').update(otpCode).digest('hex');
      if (incomingHash !== resetRecord.otp_hash) {
        resetRecord.attempts++;
        if (resetRecord.attempts >= resetRecord.max_attempts) {
          resetRecord.used = true;
          return this._sendJson(res, 429, {
            success: false,
            error: 'Too many failed verification attempts'
          });
        }
        return this._sendJson(res, 400, { success: false, error: 'Invalid verification code' });
      }

      resetRecord.used = true;
      const member = this.db.bb_members.find((m) => m.email.toLowerCase() === email);
      if (member) {
        member.password_hash = newPassHash;
      }
      return this._sendJson(res, 200, { success: true, message: 'Password reset successfully' });
    }

    if (rpcName === 'rpc_admin_login') {
      const passHash = body.p_password_hash || '';
      const email = (body.p_officer_email || '').toLowerCase().trim();

      const adminMember = this.db.bb_members.find(
        (m) => m.email.toLowerCase() === email && m.role === 'officer_admin'
      );
      if (adminMember && adminMember.password_hash === passHash) {
        const token = 'admin_sess_' + crypto.randomBytes(16).toString('hex');
        this.db.bb_admin_sessions.push({
          token,
          email,
          role: 'officer_admin',
          expires_at: Date.now() + 2 * 3600 * 1000
        });
        return this._sendJson(res, 200, { success: true, token, role: 'officer_admin' });
      }
      return this._sendJson(res, 401, { success: false, error: 'Invalid admin credentials' });
    }

    if (rpcName === 'rpc_verify_admin_session') {
      const token = body.p_token;
      if (!token) {
        return this._sendJson(res, 400, { valid: false, error: 'Token is required' });
      }
      const sess = this.db.bb_admin_sessions.find((s) => s.token === token);
      if (sess && Date.now() <= sess.expires_at) {
        return this._sendJson(res, 200, {
          valid: true,
          role: sess.role || 'officer_admin',
          email: sess.email,
          officer_email: sess.email,
          scope: sess.scope || 'super_admin',
          permissions: sess.permissions || [
            'members',
            'tasks',
            'orders',
            'gallery',
            'resources',
            'announcements',
            'forms',
            'calendar',
            'badges',
            'attendance',
            'forum',
            'roles'
          ]
        });
      }
      if (ADMIN_FIXTURE_TOKENS.has(token)) {
        return this._sendJson(res, 200, {
          valid: true,
          role: 'officer_admin',
          email: 'officer@1stpjbb.org',
          officer_email: 'officer@1stpjbb.org',
          scope: 'super_admin',
          permissions: [
            'members',
            'tasks',
            'orders',
            'gallery',
            'resources',
            'announcements',
            'forms',
            'calendar',
            'badges',
            'attendance',
            'forum',
            'roles'
          ]
        });
      }
      return this._sendJson(res, 200, { valid: false, error: 'Admin session expired or invalid' });
    }

    if (rpcName === 'rpc_end_admin_member_signin') {
      return this._sendJson(res, 200, { success: true });
    }

    if (rpcName === 'rpc_admin_logout') {
      const token = body.p_token;
      this.db.bb_admin_sessions = this.db.bb_admin_sessions.filter((s) => s.token !== token);
      return this._sendJson(res, 200, { success: true });
    }

    if (rpcName === 'rpc_admin_delete_task') {
      const token = body.p_token;
      const id = String(body.p_id || '');
      const validAdmin =
        ADMIN_FIXTURE_TOKENS.has(token) ||
        this.db.bb_admin_sessions.some((s) => s.token === token && Date.now() <= s.expires_at);
      if (!validAdmin) {
        return this._sendJson(res, 403, { success: false, error: 'Unauthorized' });
      }
      const before = this.db.bb_tasks.length;
      const kept = this.db.bb_tasks.filter((t) => String(t.id) !== id);
      this.db.bb_tasks.splice(0, before, ...kept);
      return this._sendJson(res, 200, { success: true });
    }

    if (rpcName === 'rpc_admin_delete_gallery_item') {
      const token = body.p_token;
      const id = String(body.p_id || '');
      const validAdmin =
        ADMIN_FIXTURE_TOKENS.has(token) ||
        this.db.bb_admin_sessions.some((s) => s.token === token && Date.now() <= s.expires_at);
      if (!validAdmin) {
        return this._sendJson(res, 403, { success: false, error: 'Unauthorized' });
      }
      const before = this.db.bb_gallery.length;
      const kept = this.db.bb_gallery.filter((g) => String(g.id) !== id);
      this.db.bb_gallery.splice(0, before, ...kept);
      return this._sendJson(res, 200, { success: true });
    }

    if (rpcName === 'rpc_get_master_sheet_config') {
      const token = body.p_token;
      const validAdmin =
        ADMIN_FIXTURE_TOKENS.has(token) ||
        this.db.bb_admin_sessions.some((s) => s.token === token && Date.now() <= s.expires_at);
      if (!validAdmin) {
        return this._sendJson(res, 403, { success: false, error: 'Unauthorized' });
      }
      return this._sendJson(res, 200, {
        success: true,
        config: this.db.bb_config.bb_master_sheet_config || '{}'
      });
    }

    if (rpcName === 'rpc_log_audit_event') {
      const action = body.action || body.p_action || 'unknown';
      const actorId = body.actor_id || body.p_actor_id || 'anonymous';
      const actorRole = body.actor_role || body.p_actor_role || 'member';
      const targetType = body.target_type || body.p_target_type || '';
      const targetId = body.target_id || body.p_target_id || '';
      const details = body.details || body.p_details || {};

      const sanitizedDetails = { ...details };
      for (const k of Object.keys(sanitizedDetails)) {
        if (k.includes('password') || k.includes('key') || k.includes('token') || k.includes('secret')) {
          sanitizedDetails[k] = '[REDACTED]';
        }
      }

      const logEntry = {
        id: this.db.bb_audit_logs.length + 1,
        timestamp: new Date().toISOString(),
        action,
        actor_id: actorId,
        actor_role: actorRole,
        target_type: targetType,
        target_id: targetId,
        details: sanitizedDetails
      };
      this.db.bb_audit_logs.push(logEntry);
      return this._sendJson(res, 201, { success: true, entry: logEntry });
    }

    if (rpcName === 'rpc_get_audit_logs') {
      const limit = body.p_limit || 20;
      const recent = [...this.db.bb_audit_logs].reverse().slice(0, limit);
      return this._sendJson(res, 200, recent);
    }

    this._sendError(res, 404, '404', `RPC function "${rpcName}" not found`);
  }

  // ── Storage Handler ──
  _handleStorage(pathname, req, res, body) {
    const caller = this._getCallerIdentity(req);

    if (pathname.includes('/object/sign/')) {
      const pathPart = pathname.replace('/storage/v1/object/sign/', '');
      const [bucket, ...rest] = pathPart.split('/');
      if (this.rlsPoliciesActive && PRIVATE_STORAGE_BUCKETS.has(bucket) && caller.isAnon) {
        return this._sendError(res, 403, '42501', 'Private bucket signing requires authentication');
      }

      // Batch sign endpoint: POST /storage/v1/object/sign/<bucket> with { paths: [...] }
      if (rest.length === 0 && body && Array.isArray(body.paths)) {
        const signedList = body.paths.map((p) => ({
          path: p,
          signedURL: `${this.url}/storage/v1/object/sign/${bucket}/${p}?token=mock_signed_token`,
          error: null
        }));
        return this._sendJson(res, 200, signedList);
      }

      return this._sendJson(res, 200, {
        signedURL: `${this.url}/storage/v1/object/sign/${pathPart}?token=mock_signed_token`
      });
    }

    if (req.method === 'DELETE') {
      const pathPart = pathname.replace('/storage/v1/object/', '');
      const bucket = pathPart.split('/')[0];
      if (
        this.rlsPoliciesActive &&
        (caller.isAnon || (PRIVATE_STORAGE_BUCKETS.has(bucket) && !caller.isAdmin))
      ) {
        return this._sendError(res, 403, '42501', 'Forbidden');
      }
      return this._sendJson(res, 200, { message: 'Object deleted successfully' });
    }

    return this._sendJson(res, 200, { url: `${this.url}${pathname}` });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Deterministic DOM Sandbox
// ─────────────────────────────────────────────────────────────────────────────

const VOID_HTML_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr'
]);

function _decodeHtmlEntities(str) {
  return String(str)
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/gi, '/')
    .replace(/&#96;/g, '`')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function _parseAttributes(attrsStr, node) {
  const attrRegex = /([a-zA-Z0-9_:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let aMatch;
  while ((aMatch = attrRegex.exec(attrsStr)) !== null) {
    const attrKey = aMatch[1];
    const rawVal =
      aMatch[2] !== undefined
        ? aMatch[2]
        : aMatch[3] !== undefined
          ? aMatch[3]
          : aMatch[4] !== undefined
            ? aMatch[4]
            : '';
    node.setAttribute(attrKey, _decodeHtmlEntities(rawVal));
  }
}

function _matchesSingleSelector(node, rawSel) {
  if (!node || node.nodeType === 3 || !node.tagName) return false;
  let sel = rawSel.trim();
  if (!sel) return false;

  // Extract attribute selectors [...]
  const attrChecks = [];
  sel = sel.replace(/\[([^\]]+)\]/g, (_, inner) => {
    attrChecks.push(inner);
    return '';
  });

  // Extract tag name (optional prefix before # or .)
  const tagMatch = sel.match(/^([a-zA-Z0-9_-]+)/);
  if (tagMatch) {
    if (node.tagName.toLowerCase() !== tagMatch[1].toLowerCase()) return false;
    sel = sel.slice(tagMatch[1].length);
  }

  // Extract #id and .class tokens
  const tokenRegex = /([#.])([a-zA-Z0-9_-]+)/g;
  let m;
  let consumedLen = 0;
  while ((m = tokenRegex.exec(sel)) !== null) {
    consumedLen += m[0].length;
    if (m[1] === '#' && node.id !== m[2]) return false;
    if (m[1] === '.' && (!node.classList || !node.classList.contains(m[2]))) return false;
  }
  if (sel.length !== consumedLen) return false;

  for (const attrExpr of attrChecks) {
    const eqMatch = attrExpr.match(/^([a-zA-Z0-9_:-]+)\s*(\*?=)\s*(?:"([^"]*)"|'([^']*)'|(.*))$/);
    if (eqMatch) {
      const attrName = eqMatch[1];
      const op = eqMatch[2];
      const expected = eqMatch[3] ?? eqMatch[4] ?? eqMatch[5] ?? '';
      const actual = node.getAttribute(attrName);
      if (actual === null) return false;
      if (op === '*=' ? !actual.includes(expected) : actual !== expected) return false;
    } else {
      if (!node.hasAttribute(attrExpr.trim())) return false;
    }
  }

  return true;
}

function _splitSelectorParts(sel) {
  const parts = [];
  let current = '';
  let inBracket = false;
  for (let i = 0; i < sel.length; i++) {
    const ch = sel[i];
    if (ch === '[') inBracket = true;
    else if (ch === ']') inBracket = false;
    if (ch === ' ' && !inBracket) {
      if (current.trim()) parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function _matchesSelector(node, selectorList) {
  if (!selectorList || typeof selectorList !== 'string') return false;
  const alternatives = selectorList.split(',').map((s) => s.trim()).filter(Boolean);
  return alternatives.some((alt) => {
    const parts = _splitSelectorParts(alt);
    if (parts.length === 0) return false;
    if (!_matchesSingleSelector(node, parts[parts.length - 1])) return false;
    let cur = node.parentNode;
    for (let i = parts.length - 2; i >= 0; i--) {
      while (cur && !_matchesSingleSelector(cur, parts[i])) {
        cur = cur.parentNode;
      }
      if (!cur) return false;
      cur = cur.parentNode;
    }
    return true;
  });
}

function createDOMSandbox() {
  const docListeners = {};
  const winListeners = {};
  let localStorageStore = {};
  let sessionStorageStore = {};
  const activeChannels = new Set();

  let sandboxDoc = null;
  let documentBody = null;

  class SandboxBroadcastChannel extends BroadcastChannel {
    constructor(name) {
      super(name);
      activeChannels.add(this);
    }
    close() {
      activeChannels.delete(this);
      super.close();
    }
  }

  function parseHtmlInto(parent, htmlStr) {
    const str = String(htmlStr || '');
    let pos = 0;
    let textAccum = '';

    while (pos < str.length) {
      const openIdx = str.indexOf('<', pos);
      if (openIdx === -1) {
        textAccum += str.slice(pos);
        break;
      }
      if (openIdx > pos) {
        textAccum += str.slice(pos, openIdx);
      }

      // Skip comments
      if (str.startsWith('<!--', openIdx)) {
        const endComment = str.indexOf('-->', openIdx + 4);
        pos = endComment === -1 ? str.length : endComment + 3;
        continue;
      }

      const closeBracket = str.indexOf('>', openIdx);
      if (closeBracket === -1) {
        textAccum += str.slice(openIdx);
        break;
      }

      const tagSlice = str.slice(openIdx + 1, closeBracket);
      if (tagSlice.startsWith('/')) {
        pos = closeBracket + 1;
        continue;
      }

      const tagMatch = tagSlice.match(/^([a-zA-Z0-9_-]+)([\s\S]*)$/);
      if (!tagMatch) {
        pos = closeBracket + 1;
        continue;
      }

      // Flush leading or interleaved text before this child element
      if (textAccum && textAccum.trim()) {
        const textNode = sandboxDoc.createTextNode(textAccum);
        parent.appendChild(textNode);
        textAccum = '';
      } else if (textAccum) {
        textAccum = '';
      }

      const tagName = tagMatch[1];
      let attrsStr = tagMatch[2] || '';
      const selfClosing = attrsStr.trimEnd().endsWith('/') || VOID_HTML_TAGS.has(tagName.toLowerCase());
      if (attrsStr.trimEnd().endsWith('/')) {
        attrsStr = attrsStr.trimEnd().slice(0, -1);
      }

      const childNode = createMockNode(tagName);
      _parseAttributes(attrsStr, childNode);

      if (selfClosing) {
        parent.appendChild(childNode);
        pos = closeBracket + 1;
        continue;
      }

      // Depth-aware scan for matching </tagName>
      const lowerTag = tagName.toLowerCase();
      const tagScanner = new RegExp(`<(\\/)?${tagName}(?=[\\s>/])([^>]*)>`, 'gi');
      tagScanner.lastIndex = closeBracket + 1;
      let depth = 1;
      let endTagStart = -1;
      let endTagFinish = -1;
      let m;

      while ((m = tagScanner.exec(str)) !== null) {
        const isClosing = Boolean(m[1]);
        const innerAttrs = m[2] || '';
        const isSelf = innerAttrs.trimEnd().endsWith('/') || VOID_HTML_TAGS.has(lowerTag);
        if (isClosing) {
          depth--;
          if (depth === 0) {
            endTagStart = m.index;
            endTagFinish = tagScanner.lastIndex;
            break;
          }
        } else if (!isSelf) {
          depth++;
        }
      }

      if (endTagStart === -1) {
        const innerContent = str.slice(closeBracket + 1);
        if (innerContent) childNode.innerHTML = innerContent;
        parent.appendChild(childNode);
        pos = str.length;
      } else {
        const innerContent = str.slice(closeBracket + 1, endTagStart);
        childNode._innerHTML = innerContent;
        if (innerContent && !/<[a-zA-Z0-9_-]+/.test(innerContent)) {
          childNode._textContent = innerContent;
        } else if (innerContent) {
          parseHtmlInto(childNode, innerContent);
        }
        parent.appendChild(childNode);
        pos = endTagFinish;
      }
    }

    if (parent.children.length === 0 && textAccum) {
      parent._textContent = textAccum;
    } else if (textAccum && textAccum.trim()) {
      const textNode = sandboxDoc.createTextNode(textAccum);
      parent.appendChild(textNode);
    }
  }

  function createMockNode(tagName = 'div') {
    const el = {
      nodeType: 1,
      tagName: tagName.toUpperCase(),
      id: '',
      _className: '',
      _innerHTML: '',
      _textContent: '',
      value: '',
      type: '',
      name: '',
      title: '',
      hidden: false,
      checked: false,
      selected: false,
      tabIndex: 0,
      offsetWidth: 0,
      offsetHeight: 0,
      dataset: {},
      style: {},
      disabled: false,
      files: [],
      children: [],
      parentNode: null,
      _attrs: {},
      _listeners: {},

      get ownerDocument() {
        return sandboxDoc;
      },
      get parentElement() {
        return this.parentNode;
      },
      get firstElementChild() {
        return this.children.find((c) => c.nodeType === 1) || this.children[0] || null;
      },
      get nextSibling() {
        if (!this.parentNode || !Array.isArray(this.parentNode.children)) return null;
        const idx = this.parentNode.children.indexOf(this);
        return idx !== -1 && idx + 1 < this.parentNode.children.length
          ? this.parentNode.children[idx + 1]
          : null;
      },
      get isConnected() {
        let cur = this;
        while (cur) {
          if (cur === documentBody) return true;
          cur = cur.parentNode;
        }
        return false;
      },
      get options() {
        const opts = [];
        const walk = (node) => {
          if (node.tagName === 'OPTION') opts.push(node);
          (node.children || []).forEach(walk);
        };
        (this.children || []).forEach(walk);
        return opts;
      },
      get selectedOptions() {
        return this.options.filter((o) => o.selected);
      },

      get innerHTML() {
        return this._innerHTML;
      },
      set innerHTML(val) {
        const str = String(val ?? '');
        this._innerHTML = str;
        this._textContent = '';
        this.children = [];
        if (!str) return;
        parseHtmlInto(this, str);
      },

      get textContent() {
        if (this.children.length > 0) {
          return this.children.map((c) => c.textContent).join('');
        }
        return this._textContent;
      },
      set textContent(val) {
        const str = String(val ?? '');
        this._textContent = str;
        this._innerHTML = str
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        this.children = [];
      },
      get text() {
        return this.textContent;
      },

      get className() {
        return this._className;
      },
      set className(val) {
        this._className = String(val || '');
      },

      classList: {
        add(...tokens) {
          const classes = new Set((el._className || '').split(/\s+/).filter(Boolean));
          tokens.forEach((t) => classes.add(t));
          el._className = Array.from(classes).join(' ');
        },
        remove(...tokens) {
          const classes = new Set((el._className || '').split(/\s+/).filter(Boolean));
          tokens.forEach((t) => classes.delete(t));
          el._className = Array.from(classes).join(' ');
        },
        contains(token) {
          const classes = new Set((el._className || '').split(/\s+/).filter(Boolean));
          return classes.has(token);
        },
        toggle(token, force) {
          if (typeof force !== 'undefined') {
            if (force) this.add(token);
            else this.remove(token);
            return Boolean(force);
          }
          if (this.contains(token)) {
            this.remove(token);
            return false;
          }
          this.add(token);
          return true;
        }
      },

      setAttribute(k, v) {
        this._attrs[k] = String(v);
        if (k === 'id') this.id = String(v);
        else if (k === 'class') this.className = String(v);
        else if (k === 'type') this.type = String(v);
        else if (k === 'name') this.name = String(v);
        else if (k === 'value') this.value = String(v);
        else if (k === 'title') this.title = String(v);
        else if (k === 'hidden') this.hidden = true;
        else if (k === 'disabled') this.disabled = true;
        else if (k === 'checked') this.checked = true;
        else if (k === 'selected') this.selected = true;
        if (k.startsWith('data-')) {
          const camel = k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
          this.dataset[camel] = String(v);
        }
      },
      getAttribute(k) {
        if (k === 'id' && this.id) return this.id;
        if (k === 'class' && this._className) return this._className;
        if (k === 'title' && this.title && !Object.hasOwn(this._attrs, 'title')) return this.title;
        return Object.hasOwn(this._attrs, k) ? this._attrs[k] : null;
      },
      hasAttribute(k) {
        return Object.hasOwn(this._attrs, k);
      },
      removeAttribute(k) {
        delete this._attrs[k];
        if (k === 'hidden') this.hidden = false;
        if (k === 'disabled') this.disabled = false;
        if (k === 'checked') this.checked = false;
        if (k === 'selected') this.selected = false;
        if (k.startsWith('data-')) {
          const camel = k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
          delete this.dataset[camel];
        }
      },

      appendChild(child) {
        if (child) {
          if (child.parentNode && child.parentNode !== this) {
            child.parentNode.removeChild(child);
          }
          child.parentNode = this;
          this.children.push(child);
        }
        return child;
      },
      insertBefore(newNode, refNode) {
        if (!newNode) return newNode;
        if (newNode.parentNode) newNode.parentNode.removeChild(newNode);
        newNode.parentNode = this;
        if (!refNode) {
          this.children.push(newNode);
          return newNode;
        }
        const idx = this.children.indexOf(refNode);
        if (idx === -1) this.children.push(newNode);
        else this.children.splice(idx, 0, newNode);
        return newNode;
      },
      removeChild(child) {
        const idx = this.children.indexOf(child);
        if (idx !== -1) {
          this.children.splice(idx, 1);
          child.parentNode = null;
        }
        return child;
      },
      remove() {
        if (this.parentNode) {
          this.parentNode.removeChild(this);
        }
      },

      closest(sel) {
        if (!sel || typeof sel !== 'string') return null;
        let cur = this;
        while (cur) {
          if (_matchesSelector(cur, sel)) return cur;
          cur = cur.parentNode;
        }
        return null;
      },

      querySelector(sel) {
        if (!sel) return null;
        for (const c of this.children) {
          if (_matchesSelector(c, sel)) return c;
          if (c.querySelector) {
            const res = c.querySelector(sel);
            if (res) return res;
          }
        }
        return null;
      },

      querySelectorAll(sel) {
        if (!sel) return [];
        const matches = [];
        const walk = (node) => {
          for (const c of node.children || []) {
            if (_matchesSelector(c, sel)) matches.push(c);
            walk(c);
          }
        };
        walk(this);
        return matches;
      },

      addEventListener(event, handler) {
        if (!this._listeners[event]) this._listeners[event] = [];
        this._listeners[event].push(handler);
      },
      removeEventListener(event, handler) {
        if (!this._listeners[event]) return;
        this._listeners[event] = this._listeners[event].filter((h) => h !== handler);
      },
      dispatchEvent(e) {
        const evt = typeof e === 'string' ? { type: e, target: this } : { target: this, ...e };
        if (typeof evt.preventDefault !== 'function') evt.preventDefault = () => {};
        if (typeof evt.stopPropagation !== 'function') evt.stopPropagation = () => {};
        let cur = this;
        while (cur) {
          const propHandler = cur['on' + evt.type];
          if (typeof propHandler === 'function') propHandler(evt);
          const list = (cur._listeners && cur._listeners[evt.type]) || [];
          list.forEach((h) => h(evt));
          cur = cur.parentNode;
        }
        return true;
      },
      click() {
        this.dispatchEvent({ type: 'click', target: this });
      },
      focus() {
        if (sandboxDoc) sandboxDoc.activeElement = this;
      },
      scrollIntoView() {},
      pause() {},
      play: async () => {}
    };

    return el;
  }

  documentBody = createMockNode('body');
  const documentHead = createMockNode('head');
  const documentHtml = createMockNode('html');
  documentHtml.appendChild(documentHead);
  documentHtml.appendChild(documentBody);

  sandboxDoc = {
    body: documentBody,
    head: documentHead,
    documentElement: documentHtml,
    activeElement: null,
    readyState: 'loading',
    defaultView: null,
    createElement(tag) {
      return createMockNode(tag);
    },
    createTextNode(text) {
      return {
        nodeType: 3,
        _textContent: String(text ?? ''),
        get textContent() {
          return this._textContent;
        },
        set textContent(v) {
          this._textContent = String(v ?? '');
        },
        get nodeValue() {
          return this._textContent;
        },
        parentNode: null,
        ownerDocument: sandboxDoc,
        children: []
      };
    },
    getElementById(id) {
      if (!id) return null;
      if (documentBody.id === id) return documentBody;
      return documentBody.querySelector('#' + id);
    },
    querySelector(sel) {
      return documentBody.querySelector(sel);
    },
    querySelectorAll(sel) {
      return documentBody.querySelectorAll(sel);
    },
    addEventListener(event, handler) {
      if (!docListeners[event]) docListeners[event] = [];
      docListeners[event].push(handler);
    },
    removeEventListener(event, handler) {
      if (!docListeners[event]) return;
      docListeners[event] = docListeners[event].filter((h) => h !== handler);
    },
    dispatchEvent(e) {
      const evt = typeof e === 'string' ? { type: e } : e;
      const list = docListeners[evt.type] || [];
      list.forEach((h) => h(evt));
      return true;
    }
  };

  const defaultLocalStorage = {
    getItem: (k) => (Object.hasOwn(localStorageStore, k) ? localStorageStore[k] : null),
    setItem: (k, v) => {
      localStorageStore[k] = String(v);
    },
    removeItem: (k) => {
      delete localStorageStore[k];
    },
    clear: () => {
      localStorageStore = {};
    }
  };
  const defaultSessionStorage = {
    getItem: (k) => (Object.hasOwn(sessionStorageStore, k) ? sessionStorageStore[k] : null),
    setItem: (k, v) => {
      sessionStorageStore[k] = String(v);
    },
    removeItem: (k) => {
      delete sessionStorageStore[k];
    },
    clear: () => {
      sessionStorageStore = {};
    }
  };

  const sandbox = {
    document: sandboxDoc,
    BroadcastChannel: SandboxBroadcastChannel,
    createChannel(name) {
      return new SandboxBroadcastChannel(name);
    },
    localStorage: { ...defaultLocalStorage },
    sessionStorage: { ...defaultSessionStorage },
    reset() {
      localStorageStore = {};
      sessionStorageStore = {};
      Object.assign(sandbox.localStorage, defaultLocalStorage);
      Object.assign(sandbox.sessionStorage, defaultSessionStorage);
      for (const k of Object.keys(docListeners)) delete docListeners[k];
      for (const k of Object.keys(winListeners)) delete winListeners[k];
      for (const ch of Array.from(activeChannels)) {
        try {
          ch.close();
        } catch {}
      }
      activeChannels.clear();
      documentBody.children = [];
      documentBody._innerHTML = '';
      documentBody._textContent = '';
      sandboxDoc.activeElement = null;
      sandboxDoc.readyState = 'loading';
    }
  };

  return sandbox;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Portal VM Context Loader (createPortalContext)
// ─────────────────────────────────────────────────────────────────────────────

const _scriptCache = new Map();

function _getCompiledScript(absPath) {
  if (!_scriptCache.has(absPath)) {
    const code = fs.readFileSync(absPath, 'utf8');
    _scriptCache.set(absPath, new vm.Script(code, { filename: absPath }));
  }
  return _scriptCache.get(absPath);
}

function createMockWebSocket() {
  const instances = [];
  class MockWebSocket {
    constructor(url) {
      this.url = url;
      this.readyState = MockWebSocket.CONNECTING;
      this.sent = [];
      this.onopen = null;
      this.onmessage = null;
      this.onclose = null;
      this.onerror = null;
      instances.push(this);
    }
    send(data) {
      this.sent.push(data);
    }
    close() {
      this.readyState = MockWebSocket.CLOSED;
      if (typeof this.onclose === 'function') this.onclose({ code: 1000 });
    }
    simulateOpen() {
      this.readyState = MockWebSocket.OPEN;
      if (typeof this.onopen === 'function') this.onopen({});
    }
    simulateMessage(payload) {
      if (typeof this.onmessage === 'function') {
        this.onmessage({
          data: typeof payload === 'string' ? payload : JSON.stringify(payload)
        });
      }
    }
  }
  MockWebSocket.CONNECTING = 0;
  MockWebSocket.OPEN = 1;
  MockWebSocket.CLOSING = 2;
  MockWebSocket.CLOSED = 3;
  MockWebSocket.instances = instances;
  return MockWebSocket;
}

const DEFAULT_CORE_MODULES = [
  'js/config.js',
  'js/core/utils.js',
  'js/core/ui.js',
  'js/core/loading.js',
  'js/api/supabase.js',
  'js/core/session.js',
  'js/core/rbac.js'
];

function createPortalContext(options = {}) {
  const server = options.server || null;
  const sandbox = options.sandbox || createDOMSandbox();
  const ownsSandbox = !options.sandbox;

  if (options.readyState) {
    sandbox.document.readyState = options.readyState;
  }

  const trackedTimers = new Set();
  const trackedIntervals = new Set();
  const trackedChannels = new Set();
  const trackedWs = new Set();
  const loadedFiles = new Map();
  const winListeners = {};

  class TrackedBroadcastChannel extends BroadcastChannel {
    constructor(name) {
      super(name);
      trackedChannels.add(this);
    }
    close() {
      trackedChannels.delete(this);
      super.close();
    }
  }

  const baseWs = options.WebSocket || null;
  let TrackedWebSocket = undefined;
  if (baseWs) {
    TrackedWebSocket = class extends baseWs {
      constructor(url) {
        super(url);
        trackedWs.add(this);
      }
    };
    if (baseWs.instances) TrackedWebSocket.instances = baseWs.instances;
  }

  const trackedSetTimeout = (fn, delay, ...args) => {
    const id = setTimeout((...a) => {
      trackedTimers.delete(id);
      fn(...a);
    }, delay, ...args);
    trackedTimers.add(id);
    return id;
  };
  const trackedClearTimeout = (id) => {
    trackedTimers.delete(id);
    clearTimeout(id);
  };
  const trackedSetInterval = (fn, delay, ...args) => {
    const id = setInterval(fn, delay, ...args);
    trackedIntervals.add(id);
    return id;
  };
  const trackedClearInterval = (id) => {
    trackedIntervals.delete(id);
    clearInterval(id);
  };

  class CustomEventPolyfill {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  }
  class EventPolyfill {
    constructor(type, init = {}) {
      this.type = type;
      Object.assign(this, init);
    }
  }

  const ctx = {
    __ENV__: {
      VITE_SUPABASE_URL: server ? server.url : 'http://127.0.0.1:0',
      VITE_SUPABASE_ANON_KEY: options.supaKey || 'anon_test_key',
      VITE_GEMINI_API_KEY: '',
      ...(options.env || {})
    },
    __IS_TEST__: options.isTest !== undefined ? options.isTest : true,
    __SKIP_REG_OTP__: options.skipRegOtp !== undefined ? options.skipRegOtp : true,
    document: sandbox.document,
    localStorage: sandbox.localStorage,
    sessionStorage: sandbox.sessionStorage,
    fetch: options.fetch || globalThis.fetch,
    crypto: globalThis.crypto,
    URL,
    URLSearchParams,
    AbortController,
    AbortSignal,
    DOMException,
    TextEncoder,
    TextDecoder,
    Buffer,
    btoa: globalThis.btoa,
    atob: globalThis.atob,
    CustomEvent: CustomEventPolyfill,
    Event: EventPolyfill,
    console: options.console || console,
    Math,
    Date,
    JSON,
    RegExp,
    Error,
    TypeError,
    RangeError,
    SyntaxError,
    Promise,
    Map,
    Set,
    WeakMap,
    WeakSet,
    Array,
    Object,
    Number,
    String,
    Boolean,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    encodeURIComponent,
    decodeURIComponent,
    encodeURI,
    decodeURI,
    setTimeout: trackedSetTimeout,
    clearTimeout: trackedClearTimeout,
    setInterval: trackedSetInterval,
    clearInterval: trackedClearInterval,
    requestAnimationFrame: (fn) => trackedSetTimeout(() => fn(Date.now()), 0),
    cancelAnimationFrame: trackedClearTimeout,
    BroadcastChannel: options.disableBroadcastChannel ? undefined : TrackedBroadcastChannel,
    WebSocket: TrackedWebSocket,
    navigator: { onLine: true, userAgent: 'Node-E2E-VM', ...(options.navigator || {}) },
    location: {
      hash: '',
      href: 'https://1stpjbb.org/',
      pathname: '/',
      search: '',
      hostname: '1stpjbb.org',
      protocol: 'https:',
      reload: () => {},
      ...(options.location || {})
    },
    history: { replaceState: () => {}, pushState: () => {} },
    alert: () => {},
    confirm: () => true,
    getComputedStyle: () => ({ width: '', height: '' }),
    addEventListener: (evt, handler) => {
      if (!winListeners[evt]) winListeners[evt] = [];
      winListeners[evt].push(handler);
    },
    removeEventListener: (evt, handler) => {
      if (!winListeners[evt]) return;
      winListeners[evt] = winListeners[evt].filter((h) => h !== handler);
    },
    dispatchEvent: (e) => {
      const evt = typeof e === 'string' ? { type: e } : e;
      (winListeners[evt.type] || []).forEach((h) => h(evt));
      return true;
    },
    process: options.exposeProcess ? process : undefined
  };

  if (options.globals) {
    Object.assign(ctx, options.globals);
  }

  ctx.window = ctx;
  ctx.self = ctx;
  ctx.globalThis = ctx;
  ctx.global = ctx;
  sandbox.document.defaultView = ctx;

  const vmContext = vm.createContext(ctx);

  function loadFile(relOrAbsPath, callerDir = REPO_ROOT) {
    const absPath = path.isAbsolute(relOrAbsPath)
      ? relOrAbsPath
      : path.resolve(callerDir, relOrAbsPath);
    if (loadedFiles.has(absPath)) {
      return loadedFiles.get(absPath);
    }
    const mod = { exports: {} };
    loadedFiles.set(absPath, mod.exports);
    ctx.module = mod;
    ctx.exports = mod.exports;
    ctx.__filename = absPath;
    ctx.__dirname = path.dirname(absPath);
    ctx.require = (specifier) => {
      if (specifier === 'crypto') return crypto;
      if (specifier.startsWith('./') || specifier.startsWith('../')) {
        const resolved = path.resolve(path.dirname(absPath), specifier);
        if (fs.existsSync(resolved)) {
          return loadFile(resolved, path.dirname(resolved));
        }
      }
      return {};
    };
    const script = _getCompiledScript(absPath);
    script.runInContext(vmContext);
    loadedFiles.set(absPath, mod.exports);
    return mod.exports;
  }

  const coreList = Array.isArray(options.coreModules) ? options.coreModules : DEFAULT_CORE_MODULES;
  const extraList = Array.isArray(options.modules) ? options.modules : [];
  const allModules = [...coreList, ...extraList];

  for (const modPath of allModules) {
    loadFile(modPath, REPO_ROOT);
  }

  if (options.afterLoadGlobals) {
    Object.assign(ctx, options.afterLoadGlobals);
  }

  function dispose() {
    for (const id of trackedTimers) clearTimeout(id);
    trackedTimers.clear();
    for (const id of trackedIntervals) clearInterval(id);
    trackedIntervals.clear();
    for (const ch of Array.from(trackedChannels)) {
      try {
        ch.close();
      } catch {}
    }
    trackedChannels.clear();
    for (const ws of Array.from(trackedWs)) {
      try {
        ws.close();
      } catch {}
    }
    trackedWs.clear();
    if (ctx.supa && typeof ctx.supa.clearQueryCache === 'function') {
      try {
        ctx.supa.clearQueryCache();
      } catch {}
    }
    if (ctx.supa && typeof ctx.supa.clearConfigSnapshots === 'function') {
      try {
        ctx.supa.clearConfigSnapshots();
      } catch {}
    }
    if (ownsSandbox) {
      sandbox.reset();
    }
  }

  return {
    ctx,
    sandbox,
    load: (relPath) => loadFile(relPath, REPO_ROOT),
    dispose
  };
}

function grantPortalAdminSession(portal, server, email = 'jeshuakoh2008@gmail.com') {
  const cleanEmail = String(email).toLowerCase().trim();
  const token = 'admin_sess_' + crypto.randomBytes(16).toString('hex');
  const memberProof = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 2 * 3600 * 1000;
  const permissions = [
    'members',
    'tasks',
    'orders',
    'gallery',
    'resources',
    'announcements',
    'forms',
    'calendar',
    'badges',
    'attendance',
    'forum',
    'roles'
  ];

  if (server && server.db && Array.isArray(server.db.bb_admin_sessions)) {
    server.db.bb_admin_sessions.push({
      token,
      email: cleanEmail,
      role: 'officer_admin',
      scope: 'super_admin',
      permissions,
      expires_at: expiresAt
    });
  }

  const { ctx, sandbox } = portal;
  if (typeof ctx.sessionSet === 'function') {
    ctx.sessionSet('email', cleanEmail, { localOnly: true });
    ctx.sessionSet('ic', '900101-14-0001', { localOnly: true });
    ctx.sessionSet('name', 'Captain Andrew', { localOnly: true });
  }
  if (sandbox && sandbox.sessionStorage) {
    sandbox.sessionStorage.setItem(
      'bb_admin_member_signin',
      JSON.stringify({
        email: cleanEmail,
        token: memberProof,
        expires_at: new Date(expiresAt).toISOString()
      })
    );
  }
  if (typeof ctx.setAdminSessionTokenForTesting === 'function') {
    ctx.setAdminSessionTokenForTesting(token, {
      officerEmail: cleanEmail,
      scope: 'super_admin',
      permissions,
      confirmed: true,
      expiresAt
    });
  } else {
    const adminExports = portal.load('js/modules/admin.js');
    if (adminExports && typeof adminExports.setAdminSessionTokenForTesting === 'function') {
      adminExports.setAdminSessionTokenForTesting(token, {
        officerEmail: cleanEmail,
        scope: 'super_admin',
        permissions,
        confirmed: true,
        expiresAt
      });
    }
  }
  return token;
}

// ─────────────────────────────────────────────────────────────────────────────
// Module Exports
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  expect,
  TestSuite,
  MockSupabaseServer,
  createDOMSandbox,
  createPortalContext,
  createMockWebSocket,
  grantPortalAdminSession,
  FEATURES,
  normalizeFeatureCode
};
