const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');
const { join } = require('node:path');

const source = readFileSync(join(__dirname, '../js/api/web-push.js'), 'utf8');
const url = 'https://example.supabase.co/functions/v1/portal-web-push';
const subscriptionUrl = 'https://web.push.apple.com/TEST';
const applicationServerKey = Buffer.alloc(65, 4).toString('base64url');
const token = 'f'.repeat(64);

function storage() {
  const records = new Map();
  return {
    getItem: key => records.get(key) || null,
    setItem: (key, value) => records.set(key, value),
    removeItem: key => records.delete(key)
  };
}

async function browser(options = {}) {
  const requests = [];
  const sequence = [];
  const account = { ic: 'member-1', email: 'member@example.org', remember: false };
  const window = { SUPA_URL: 'https://example.supabase.co', Notification: { permission: 'granted' }, PushManager: {} };
  const subscription = {
    endpoint: subscriptionUrl,
    unsubscribe: async () => { sequence.push('unsubscribe'); },
    toJSON: () => ({ endpoint: subscriptionUrl, keys: { p256dh: 'key', auth: 'auth' } })
  };
  const navigator = {
    userAgent: 'iPhone',
    standalone: options.standalone ?? true,
    serviceWorker: {
      ready: Promise.resolve({
        pushManager: {
          subscribe: args => {
            sequence.push('subscribe');
            assert.equal(args.userVisibleOnly, true);
            assert.equal(args.applicationServerKey.length, 65);
            return Promise.resolve(subscription);
          },
          getSubscription: async () => subscription
        }
      })
    }
  };
  const localStorage = storage();
  const sessionStorage = storage();
  runInNewContext(source, {
    window, navigator, localStorage, sessionStorage, AbortSignal, atob, crypto,
    sessionGet: key => account[key],
    showPromptModal: async (title, placeholder, value, promptOptions) => {
      sequence.push('prompt');
      assert.equal(promptOptions.password, true);
      return 'example-password';
    },
    fetch: async (endpoint, request) => {
      assert.equal(endpoint, url);
      if (!request.method) return Response.json({ applicationServerKey });
      const body = JSON.parse(request.body);
      requests.push(body);
      sequence.push(body.action);
      if (body.action === 'session') return Response.json({ token, expiresAt: new Date(Date.now() + 10000).toISOString() });
      return Response.json({ sent: 1 });
    }
  });
  await new Promise(resolve => setImmediate(resolve));
  return { push: window.PortalWebPush, account, requests, sequence, localStorage, sessionStorage };
}

test('iPhone registration starts with the click gesture, even when account verification is required', async () => {
  const { push, requests, sequence, localStorage, sessionStorage } = await browser();
  assert.equal(await push.readyForSetup(), true);
  const enabling = push.enable();
  assert.deepEqual(sequence, ['subscribe']);
  await enabling;
  assert.deepEqual(sequence, ['subscribe', 'prompt', 'session', 'register']);
  assert.equal(push.isEnabled(), true);
  assert.equal(requests[1].token, token);
  assert.equal(requests[1].member, 'member-1');
  assert.match(requests[1].deviceKey, /^[a-f\d]{64}$/);
  assert.equal(localStorage.getItem('bb_web_push_signin'), null);
  assert.doesNotMatch(sessionStorage.getItem('bb_web_push_signin'), /example-password/);
});

test('iPhone test sends a real backend request and logout removes the device and token', async () => {
  const { push, requests, sequence } = await browser();
  await push.authorize('member@example.org', 'example-password', true);
  await push.test();
  assert.deepEqual(sequence, ['session', 'subscribe', 'register', 'test']);
  assert.equal(requests[2].endpoint, subscriptionUrl);
  await push.signOut();
  assert.equal(push.isEnabled(), false);
  assert.equal(await push.notify('announcement', ['announcements'], '1'), false);
  assert.ok(sequence.includes('unsubscribe'));
  const revoked = requests.find(request => request.action === 'unregister');
  assert.equal(revoked.deviceKey, requests[1].deviceKey);
  assert.equal(requests.find(request => request.action === 'signout').token, token);
});

test('Safari tab instructs the user to open the Home Screen app without triggering a permission prompt', async () => {
  const { push, requests, sequence } = await browser({ standalone: false });
  assert.equal(push.readyForSetup(), false);
  await assert.rejects(push.enable(), /Home Screen icon/);
  assert.deepEqual(requests, []);
  assert.deepEqual(sequence, []);
});

test('an account change cannot send alerts with the previous account token', async () => {
  const { push, account, requests } = await browser();
  await push.authorize('member@example.org', 'example-password', true);
  assert.equal(await push.notify('task_assigned', ['user_another_member'], '7'), true);
  assert.deepEqual(requests[1].topics, ['user_another_member']);
  account.email = 'someone-else@example.org';
  assert.equal(await push.notify('announcement', ['announcements'], '8'), false);
  assert.equal(requests.length, 2);
});
