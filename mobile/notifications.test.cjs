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

    // Verify tag deduplication prevents duplicate notifications within 5 minutes
    now += 2000;
    const sendTagged = () => ui.triggerPortalSystemNotification('Announcement', 'Content', { tag: 'ann-123' });
    assert.equal(await sendTagged(), true);
    assert.equal(notifications.length, 3);
    assert.equal(notifications[2].title, 'Announcement');

    // Immediate second send with same tag must be deduplicated
    now += 2000;
    assert.equal(sendTagged(), null);
    assert.equal(notifications.length, 3);
  } finally {
    delete global.window;
    delete global.localStorage;
  }
});

test('Firebase Cloud Messaging (FCM) universal push notification engine', async () => {
  const fcm = require('../js/api/fcm.js');

  // 1. Topic name sanitization conforming to FCM rules [a-zA-Z0-9-_.~%]+
  assert.equal(fcm.sanitizeTopicName('announcements'), 'announcements');
  assert.equal(fcm.sanitizeTopicName('Jeshua Koh'), 'jeshua_koh');
  assert.equal(fcm.sanitizeTopicName('jeshuakoh2008@gmail.com'), 'jeshuakoh2008_gmail_com');
  assert.equal(fcm.sanitizeTopicName('080116-14-0615'), '080116-14-0615');
  assert.equal(fcm.sanitizeTopicName('special!@#$%^&*()chars'), 'special_chars');
  assert.equal(fcm.sanitizeTopicName(''), 'general');
  assert.equal(fcm.sanitizeTopicName(null), 'general');

  // 2. Personal and Department topic formatting
  assert.equal(fcm.getUserTopic('jeshuakoh2008@gmail.com'), 'user_jeshuakoh2008_gmail_com');
  assert.equal(fcm.getUserTopic('080116-14-0615'), 'user_080116-14-0615');
  assert.equal(fcm.getUserTopic(''), '');
  assert.equal(fcm.getDepartmentTopic('logistics'), 'dept_logistics');
  assert.equal(fcm.getDepartmentTopic('Secretariat & HQ'), 'dept_secretariat_hq');

  // 3. HTML snippet cleaning, emoji stripping, and entity decoding
  assert.equal(fcm.stripEmojis('📢 Company Announcement 🎉'), 'Company Announcement');
  assert.equal(fcm.stripEmojis('🎯 Task: Setup BB Portal 📦'), 'Task: Setup BB Portal');
  assert.equal(fcm.stripEmojis('💬 Jeshua commented 👍'), 'Jeshua commented');
  assert.equal(fcm.decodeHtmlEntities('test&nbsp;&nbsp;'), 'test  ');
  assert.equal(fcm.decodeHtmlEntities('Band &amp; Drill &quot;Manual&quot; &#39;2026&#39; &lt;v1&gt;'), 'Band & Drill "Manual" \'2026\' <v1>');
  assert.equal(fcm.cleanSnippet('📢 test&nbsp;&nbsp;'), 'test');
  assert.equal(fcm.cleanSnippet('<b>📢 Parade Notice</b>&nbsp;&nbsp;<i>Bring full kit</i>'), 'Parade Notice Bring full kit');
  assert.equal(fcm.cleanSnippet('<b>Parade</b> at <i>9:30 AM</i>'), 'Parade at 9:30 AM');
  assert.equal(fcm.cleanSnippet('A'.repeat(200), 20), 'AAAAAAAAAAAAAAAAA...');

  // 4. AndroidFCM JavaScript interface bridge synchronization
  const subscribedTopics = [];
  const unsubscribedTopics = [];
  global.window = {
    AndroidFCM: {
      subscribeTopic: topic => subscribedTopics.push(topic),
      unsubscribeTopic: topic => unsubscribedTopics.push(topic)
    }
  };
  global.sessionGet = key => {
    if (key === 'email') return 'jeshuakoh2008@gmail.com';
    if (key === 'ic') return '080116-14-0615';
    if (key === 'name') return 'Jeshua Koh';
    if (key === 'department') return 'logistics';
    return '';
  };

  try {
    fcm.syncMobileDeviceSubscriptions();
    assert.ok(subscribedTopics.includes('announcements'));
    assert.ok(subscribedTopics.includes('user_jeshuakoh2008_gmail_com'));
    assert.ok(subscribedTopics.includes('user_080116-14-0615'));
    assert.ok(subscribedTopics.includes('user_jeshua_koh'));
    assert.ok(subscribedTopics.includes('user_jeshuakoh'));
    assert.ok(subscribedTopics.includes('dept_logistics'));

    fcm.unsubscribeMobileDevice('jeshuakoh2008@gmail.com', '080116-14-0615', 'logistics', 'Jeshua Koh');
    assert.ok(unsubscribedTopics.includes('user_jeshuakoh2008_gmail_com'));
    assert.ok(unsubscribedTopics.includes('user_080116-14-0615'));
    assert.ok(unsubscribedTopics.includes('user_jeshua_koh'));
    assert.ok(unsubscribedTopics.includes('user_jeshuakoh'));
    assert.ok(unsubscribedTopics.includes('dept_logistics'));
  } finally {
    delete global.window;
    delete global.sessionGet;
  }
});
