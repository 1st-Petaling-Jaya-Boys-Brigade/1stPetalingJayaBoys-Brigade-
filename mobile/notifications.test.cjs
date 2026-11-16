const assert = require('node:assert/strict');
const { test } = require('node:test');

const preferences = new Map();
const notifications = [];
const channels = [];
let permission = 'denied';

test('native alerts honor opt-in and sound preferences with portal content', async ({ mock }) => {
  let now = Date.now();
  let platform = 'android';
  mock.method(Date, 'now', () => now);
  global.localStorage = {
    getItem: key => preferences.get(key) ?? null,
    setItem: (key, value) => preferences.set(key, value)
  };
  global.window = {
    Capacitor: {
      isNativePlatform: () => true,
      getPlatform: () => platform,
      Plugins: {
        LocalNotifications: {
          requestPermissions: async () => ({ display: permission }),
          checkPermissions: async () => ({ display: permission }),
          createChannel: async channel => channels.push(channel),
          schedule: async batch => notifications.push(...batch.notifications)
        }
      }
    }
  };

  try {
    const ui = require('../js/core/ui.js');
    const send = () => ui.triggerPortalSystemNotification('Member name', 'Private message', { force: true });

    assert.equal(send(), null);
    assert.equal(await ui.requestNotificationPermission(), 'denied');
    assert.equal(preferences.get('bb_notif_system_enabled'), 'false');
    assert.equal(send(), null);
    assert.equal(notifications.length, 0);

    permission = 'granted';
    assert.equal(await ui.requestNotificationPermission(), 'granted');
    assert.equal(await send(), true);
    assert.equal(channels[0].sound, 'portal_chime.wav');
    assert.equal(notifications[0].sound, 'portal_chime.wav');
    assert.equal(notifications[0].isExactNotification, false);
    assert.equal(notifications[0].title, 'Member name');
    assert.equal(notifications[0].body, 'Private message');
    assert.equal(notifications[0].smallIcon, 'ic_launcher');

    now += 1000;
    preferences.set('bb_notif_system_enabled', 'false');
    assert.equal(send(), null);
    assert.equal(notifications.length, 1);

    preferences.set('bb_notif_system_enabled', 'true');
    permission = 'denied';
    assert.equal(await send(), false);
    assert.equal(notifications.length, 1);

    now += 1000;
    platform = 'ios';
    permission = 'granted';
    preferences.set('bb_notif_sound_enabled', 'false');
    assert.equal(await send(), true);
    assert.equal(notifications[1].sound, undefined);
    assert.equal(channels.length, 1);
  } finally {
    delete global.window;
    delete global.localStorage;
  }
});
