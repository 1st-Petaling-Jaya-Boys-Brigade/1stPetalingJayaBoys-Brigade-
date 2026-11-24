const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');

const source = readFileSync(resolve(__dirname, '../js/core/ui.js'), 'utf8');

function launch(options = {}) {
  const preferences = options.preferences || new Map();
  const elements = [];
  const gestures = [];
  const audioStarts = [];
  let clicked = false;
  function element() {
    const handlers = {};
    const buttons = new Map();
    return {
      classList: { add() {} },
      style: {},
      focus() {},
      setAttribute() {},
      appendChild(child) { this.child = child; child.parentNode = this; },
      addEventListener(type, fn) { handlers[type] = fn; },
      click() {
        clicked = true;
        try { handlers.click?.({ target: this }); } finally { clicked = false; }
      },
      querySelector(selector) {
        if (!buttons.has(selector)) buttons.set(selector, element());
        return buttons.get(selector);
      }
    };
  }
  const document = {
    body: {
      appendChild(node) { elements.push(node); node.parentNode = this; },
      removeChild(node) { elements.splice(elements.indexOf(node), 1); }
    },
    getElementById(id) { return elements.find(node => node.id === id); },
    querySelector: selector => options.onboarding && selector === '.portal-onboarding-overlay' ? {} : null,
    querySelectorAll() { return []; },
    createElement: element,
    addEventListener() {},
    removeEventListener() {}
  };
  function Notification() {}
  Notification.permission = options.permission || 'default';
  Notification.requestPermission = () => {
    gestures.push(['browser', clicked]);
    return Promise.resolve(Notification.permission = 'granted');
  };
  class Audio {
    play() {
      audioStarts.push(clicked);
      return Promise.resolve();
    }
    pause() {}
  }
  const window = {
    Notification,
    isSecureContext: true,
    location: { protocol: 'https:' },
    matchMedia: () => ({ matches: Boolean(options.installed) }),
    Capacitor: options.native ? { isNativePlatform: () => true, getPlatform: () => 'android' } : undefined,
    PortalWebPush: options.ios ? {
      isIOS: () => true,
      isEnabled: () => Boolean(options.enabled),
      readyForSetup: () => Promise.resolve(Boolean(options.installed) && options.ready !== false),
      enable: () => {
        gestures.push(['ios', clicked]);
        return Promise.resolve();
      }
    } : undefined
  };
  runInNewContext(source, {
    window, document, Notification, Audio, navigator: {}, module: { exports: {} },
    localStorage: {
      getItem: key => preferences.get(key) ?? null,
      setItem: (key, value) => preferences.set(key, value)
    },
    sessionGet: key => key === 'ic' && !options.guest ? 'member' : null,
    setTimeout: (fn, delay) => { if (delay === 200) queueMicrotask(fn); }
  });
  const dialog = () => elements.find(node => node.className === 'portal-modal-overlay');
  const click = selector => {
    assert.ok(dialog(), 'Expected the first-launch permission dialog');
    dialog().child.querySelector(selector).click();
  };
  return { window, dialog, click, gestures, preferences, audioStarts };
}

test('iOS Home Screen setup requests permission synchronously from Enable and only once', async () => {
  const portal = launch({ ios: true, installed: true, permission: 'granted' });
  const offered = portal.window.maybeOfferNotificationSetup();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(portal.gestures, []);
  portal.click('#portal-modal-ok');
  assert.deepEqual(portal.gestures, [['ios', true]]);
  assert.deepEqual(portal.audioStarts, [true]);
  await offered;
  await portal.window.maybeOfferNotificationSetup();
  assert.equal(portal.dialog(), undefined);
});

test('desktop consent opens the OS/browser permission request on click and preserves mute', async () => {
  const portal = launch({
    installed: true,
    permission: 'granted',
    preferences: new Map([['bb_notif_sound_enabled', 'false'], ['bb_notif_system_enabled', 'true']])
  });
  const offered = portal.window.maybeOfferNotificationSetup();
  assert.deepEqual(portal.gestures, []);
  portal.click('#portal-modal-ok');
  assert.deepEqual(portal.gestures, [['browser', true]]);
  await offered;
  assert.equal(portal.preferences.get('bb_notif_system_enabled'), 'true');
  assert.equal(portal.preferences.get('bb_notif_sound_enabled'), 'false');
  assert.deepEqual(portal.audioStarts, []);
});

test('Not now persists on relaunch, and guests, installed Android, and Safari tabs skip the offer', async () => {
  const portal = launch();
  const offered = portal.window.maybeOfferNotificationSetup();
  portal.click('#portal-modal-cancel');
  await offered;
  assert.deepEqual(portal.gestures, []);

  for (const options of [
    { preferences: portal.preferences }, { guest: true }, { ios: true }, { native: true },
    { onboarding: true }, { ios: true, installed: true, enabled: true },
    { ios: true, installed: true, ready: false }, { permission: 'denied' },
    { preferences: new Map([['bb_notif_system_enabled', 'false']]) }
  ]) {
    const next = launch(options);
    await next.window.maybeOfferNotificationSetup();
    assert.equal(next.dialog(), undefined);
    assert.deepEqual(next.gestures, []);
  }
});

test('installing after a browser deferral gives the app its own setup opportunity', async () => {
  const portal = launch();
  const browserOffer = portal.window.maybeOfferNotificationSetup();
  portal.click('#portal-modal-cancel');
  await browserOffer;

  const app = launch({ installed: true, preferences: portal.preferences });
  const appOffer = app.window.maybeOfferNotificationSetup();
  await app.window.maybeOfferNotificationSetup();
  app.click('#portal-modal-ok');
  await appOffer;
  assert.deepEqual(app.gestures, [['browser', true]]);
});
