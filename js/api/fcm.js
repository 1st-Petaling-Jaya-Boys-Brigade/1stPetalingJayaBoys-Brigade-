/**
 * 1st Petaling Jaya Boys' Brigade Portal
 * Firebase Cloud Messaging (FCM) v1 Universal Push Notification Client
 *
 * Implements real-time, WhatsApp-style instant push notifications via Google FCM HTTP v1 API.
 * Uses native Web Crypto API (RS256 JWT) to negotiate Google OAuth2 tokens directly.
 * Zero external dependencies. Zero npm runtime libraries.
 */

/* global supa, sessionGet */

(function (global) {
  'use strict';

  var _fcmCredsCache = null;
  var _fcmCredsExpiry = 0;
  var _fcmTokenCache = null;
  var _fcmTokenExpiry = 0;

  /**
   * Sanitizes any string into a valid Firebase Cloud Messaging topic name.
   * Format allowed by Google FCM: [a-zA-Z0-9-_.~%]+
   * @param {string} input
   * @returns {string}
   */
  function sanitizeTopicName(input) {
    if (!input || typeof input !== 'string') return 'general';
    var sanitized = input
      .toLowerCase()
      .trim()
      .replace(/[^a-zA-Z0-9-_~]/g, '_')
      .replace(/_{2,}/g, '_')
      .replace(/^_+|_+$/g, '');
    if (!sanitized) return 'general';
    return sanitized.length > 100 ? sanitized.slice(0, 100) : sanitized;
  }

  /**
   * Computes the personal user topic for targeted member notifications.
   * @param {string} identifier - Email, IC, or Member ID
   * @returns {string} e.g. "user_jeshuakoh2008_gmail_com" or "user_080116140615"
   */
  function getUserTopic(identifier) {
    if (!identifier) return '';
    return 'user_' + sanitizeTopicName(identifier);
  }

  /**
   * Computes the department topic for team notifications.
   * @param {string} department
   * @returns {string} e.g. "dept_logistics"
   */
  function getDepartmentTopic(department) {
    if (!department) return '';
    return 'dept_' + sanitizeTopicName(department);
  }

  /**
   * Strips HTML tags and collapses whitespace for clean notification snippets.
   * @param {string} html
   * @param {number} maxLen
   * @returns {string}
   */
  function cleanSnippet(html, maxLen) {
    maxLen = maxLen || 120;
    if (!html || typeof html !== 'string') return '';
    var text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (text.length > maxLen) {
      return text.slice(0, maxLen - 3) + '...';
    }
    return text;
  }

  /**
   * Converts a PKCS#8 PEM string to an ArrayBuffer for WebCrypto.
   * @param {string} pem
   * @returns {ArrayBuffer}
   */
  function pemToArrayBuffer(pem) {
    var b64 = pem
      .replace(/-----BEGIN PRIVATE KEY-----/, '')
      .replace(/-----END PRIVATE KEY-----/, '')
      .replace(/[\r\n\s]+/g, '');
    var binary = atob(b64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * Base64URL encoder (RFC 4648 §5).
   * @param {Uint8Array|ArrayBuffer|string} input
   * @returns {string}
   */
  function base64UrlEncode(input) {
    var str = '';
    if (typeof input === 'string') {
      var utf8Bytes = new TextEncoder().encode(input);
      for (var i = 0; i < utf8Bytes.length; i++) {
        str += String.fromCharCode(utf8Bytes[i]);
      }
    } else {
      var uint8 = input instanceof Uint8Array ? input : new Uint8Array(input);
      for (var j = 0; j < uint8.length; j++) {
        str += String.fromCharCode(uint8[j]);
      }
    }
    return btoa(str)
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  }

  /**
   * Fetches the Firebase Service Account credentials from Supabase configuration.
   * In-memory cache valid for 10 minutes.
   * @returns {Promise<Object|null>}
   */
  async function getFcmCredentials() {
    var now = Date.now();
    if (_fcmCredsCache && now < _fcmCredsExpiry) {
      return _fcmCredsCache;
    }

    var client = (typeof supa !== 'undefined' ? supa : (global.supa || null));
    if (!client || typeof client.get !== 'function') {
      return null;
    }

    try {
      var rows = await client.get('bb_config?key=eq.bb_fcm_service_account&select=value');
      if (Array.isArray(rows) && rows.length > 0 && rows[0].value) {
        var parsed = typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value;
        if (parsed && parsed.project_id && parsed.client_email && parsed.private_key) {
          _fcmCredsCache = parsed;
          _fcmCredsExpiry = now + (10 * 60 * 1000);
          return _fcmCredsCache;
        }
      }
    } catch (err) {
      console.warn('getFcmCredentials fetch error:', err);
    }
    return null;
  }

  /**
   * Obtains a valid Google OAuth2 access token for the Firebase Messaging scope.
   * Signs an RS256 JWT using native Web Crypto API.
   * In-memory cache valid for 55 minutes.
   * @param {Object} creds - Service account credentials
   * @returns {Promise<string|null>}
   */
  async function getGoogleOAuthToken(creds) {
    if (!creds || !creds.client_email || !creds.private_key) {
      return null;
    }

    var now = Date.now();
    if (_fcmTokenCache && now < _fcmTokenExpiry) {
      return _fcmTokenCache;
    }

    var cryptoObj = (typeof crypto !== 'undefined' ? crypto : (global.crypto || null));
    if (!cryptoObj || !cryptoObj.subtle) {
      console.warn('Web Crypto API subtle is not available in this environment.');
      return null;
    }

    try {
      var binaryKey = pemToArrayBuffer(creds.private_key);
      var cryptoKey = await cryptoObj.subtle.importKey(
        'pkcs8',
        binaryKey,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['sign']
      );

      var nowSec = Math.floor(now / 1000);
      var headerB64 = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
      var claimB64 = base64UrlEncode(JSON.stringify({
        iss: creds.client_email,
        scope: 'https://www.googleapis.com/auth/firebase.messaging',
        aud: 'https://oauth2.googleapis.com/token',
        exp: nowSec + 3600,
        iat: nowSec
      }));

      var unsignedToken = headerB64 + '.' + claimB64;
      var signature = await cryptoObj.subtle.sign(
        'RSASSA-PKCS1-v1_5',
        cryptoKey,
        new TextEncoder().encode(unsignedToken)
      );

      var assertion = unsignedToken + '.' + base64UrlEncode(signature);
      var postParams = new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: assertion
      }).toString();

      var res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: postParams
      });

      if (!res.ok) {
        var errBody = await res.text();
        console.warn('Google OAuth2 token error:', res.status, errBody);
        return null;
      }

      var json = await res.json();
      if (json && json.access_token) {
        _fcmTokenCache = json.access_token;
        var expiresInSec = typeof json.expires_in === 'number' ? json.expires_in : 3600;
        _fcmTokenExpiry = now + ((expiresInSec - 300) * 1000);
        return _fcmTokenCache;
      }
    } catch (err) {
      console.warn('getGoogleOAuthToken exception:', err);
    }
    return null;
  }

  /**
   * Dispatches a push notification to a specific Firebase Cloud Messaging topic via FCM HTTP v1.
   * @param {string} topic - Target FCM topic (e.g. "announcements", "user_...")
   * @param {string} title - Notification title
   * @param {string} body - Notification body text
   * @param {Object} [options] - Additional metadata (category, tab, targetId)
   * @returns {Promise<boolean>}
   */
  async function sendFcmTopicPush(topic, title, body, options) {
    if (!topic || !title) return false;
    options = options || {};

    var sanitizedTopic = sanitizeTopicName(topic);
    var cleanBody = cleanSnippet(body, 160);

    var creds = await getFcmCredentials();
    if (!creds || !creds.project_id) {
      return false;
    }

    var token = await getGoogleOAuthToken(creds);
    if (!token) {
      return false;
    }

    var fcmUrl = 'https://fcm.googleapis.com/v1/projects/' + encodeURIComponent(creds.project_id) + '/messages:send';
    var payload = {
      message: {
        topic: sanitizedTopic,
        notification: {
          title: title,
          body: cleanBody
        },
        data: {
          title: title,
          body: cleanBody,
          snippet: cleanBody,
          category: String(options.category || 'announcements'),
          tab: String(options.tab || 'home'),
          targetId: String(options.targetId || '')
        },
        android: {
          priority: 'HIGH',
          notification: {
            channel_id: 'portal-alerts-v2',
            notification_priority: 'PRIORITY_MAX',
            visibility: 'PUBLIC',
            default_sound: true,
            default_vibrate_timings: true,
            sound: 'portal_chime',
            icon: 'ic_launcher'
          }
        }
      }
    };

    try {
      var res = await fetch(fcmUrl, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        var errText = await res.text();
        console.warn('FCM dispatch failed [' + res.status + ']:', errText);
        return false;
      }
      return true;
    } catch (err) {
      console.warn('sendFcmTopicPush error:', err);
      return false;
    }
  }

  /**
   * Universal Notification Dispatcher
   * Automatically fans out push notifications across topics and targeted member devices.
   *
   * Supported types:
   * - 'announcement': Broadcasts to topic "announcements" + personal mentions
   * - 'task_assigned': Sends to assigned member's personal topics or department topic
   * - 'mention': Sends to mentioned members' personal topics
   * - 'order_status': Sends to customer's personal topic
   * - 'forum_reply': Sends to post author's personal topic
   *
   * @param {Object} params
   * @param {string} params.type - Category of notification
   * @param {string} params.title - Display title
   * @param {string} params.body - Message or description text
   * @param {string} [params.targetTopic] - Explicit target topic
   * @param {Array<string>} [params.targetUsers] - Identifiers (emails/ICs) of target recipients
   * @param {string} [params.targetDept] - Department name (e.g. "logistics")
   * @param {string} [params.tab] - Navigation tab ("home", "tasks", "orders", "forum")
   * @param {string|number} [params.targetId] - Item ID
   * @returns {Promise<boolean>}
   */
  async function sendPortalPushNotification(params) {
    if (!params || !params.title) return false;
    var type = params.type || 'announcement';
    var title = params.title;
    var body = params.body || '';
    var tab = params.tab || 'home';
    var targetId = params.targetId || '';

    var options = {
      category: type,
      tab: tab,
      targetId: targetId
    };

    var promises = [];

    // 1. Explicit topic provided
    if (params.targetTopic) {
      promises.push(sendFcmTopicPush(params.targetTopic, title, body, options));
    }

    // 2. Announcements broadcast
    if (type === 'announcement' && !params.targetTopic) {
      promises.push(sendFcmTopicPush('announcements', title, body, options));
    }

    // 3. Department topic
    if (params.targetDept) {
      var deptTopic = getDepartmentTopic(params.targetDept);
      if (deptTopic) {
        promises.push(sendFcmTopicPush(deptTopic, title, body, options));
      }
    }

    // 4. Targeted Users (Mentions, Task Assignees, Customers)
    if (Array.isArray(params.targetUsers) && params.targetUsers.length > 0) {
      var uniqueTopics = new Set();
      params.targetUsers.forEach(function (userKey) {
        var userTopic = getUserTopic(userKey);
        if (userTopic && userTopic !== 'user_general') {
          uniqueTopics.add(userTopic);
        }
      });

      uniqueTopics.forEach(function (topic) {
        promises.push(sendFcmTopicPush(topic, title, body, options));
      });
    }

    if (promises.length === 0) {
      return false;
    }

    try {
      var results = await Promise.allSettled(promises);
      return results.some(function (r) { return r.status === 'fulfilled' && r.value === true; });
    } catch (_) {
      return false;
    }
  }

  /**
   * Synchronizes mobile device topic subscriptions via AndroidFCM WebView interface.
   * Called on app startup, session login, and profile update.
   */
  function syncMobileDeviceSubscriptions() {
    if (typeof window === 'undefined') return;
    var bridge = window.AndroidFCM;
    if (!bridge || typeof bridge.subscribeTopic !== 'function') return;

    try {
      // 1. All devices subscribe to company-wide announcements
      bridge.subscribeTopic('announcements');

      // 2. Subscribe to personal topics for the active logged-in member
      if (typeof sessionGet === 'function') {
        var email = sessionGet('email');
        var ic = sessionGet('ic');
        var dept = sessionGet('department');

        if (email) {
          bridge.subscribeTopic(getUserTopic(email));
        }
        if (ic) {
          bridge.subscribeTopic(getUserTopic(ic));
        }
        if (dept && dept.toLowerCase() !== 'none') {
          bridge.subscribeTopic(getDepartmentTopic(dept));
        }
      }
    } catch (err) {
      console.warn('syncMobileDeviceSubscriptions error:', err);
    }
  }

  /**
   * Unsubscribes mobile device from personal topics on member sign-out.
   * @param {string} [email]
   * @param {string} [ic]
   * @param {string} [dept]
   */
  function unsubscribeMobileDevice(email, ic, dept) {
    if (typeof window === 'undefined') return;
    var bridge = window.AndroidFCM;
    if (!bridge || typeof bridge.unsubscribeTopic !== 'function') return;

    try {
      if (email) bridge.unsubscribeTopic(getUserTopic(email));
      if (ic) bridge.unsubscribeTopic(getUserTopic(ic));
      if (dept) bridge.unsubscribeTopic(getDepartmentTopic(dept));
    } catch (_) {}
  }

  // Export to window in browser context
  if (typeof window !== 'undefined') {
    window.sanitizeTopicName = sanitizeTopicName;
    window.getUserTopic = getUserTopic;
    window.getDepartmentTopic = getDepartmentTopic;
    window.cleanSnippet = cleanSnippet;
    window.pemToArrayBuffer = pemToArrayBuffer;
    window.base64UrlEncode = base64UrlEncode;
    window.getFcmCredentials = getFcmCredentials;
    window.getGoogleOAuthToken = getGoogleOAuthToken;
    window.sendFcmTopicPush = sendFcmTopicPush;
    window.sendPortalPushNotification = sendPortalPushNotification;
    window.syncMobileDeviceSubscriptions = syncMobileDeviceSubscriptions;
    window.unsubscribeMobileDevice = unsubscribeMobileDevice;

    // Run subscription sync automatically on DOMContentLoaded or immediate load
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      setTimeout(syncMobileDeviceSubscriptions, 100);
    } else {
      document.addEventListener('DOMContentLoaded', function () {
        setTimeout(syncMobileDeviceSubscriptions, 100);
      });
    }
  }

  // Export for Node.js test environment
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      sanitizeTopicName: sanitizeTopicName,
      getUserTopic: getUserTopic,
      getDepartmentTopic: getDepartmentTopic,
      cleanSnippet: cleanSnippet,
      pemToArrayBuffer: pemToArrayBuffer,
      base64UrlEncode: base64UrlEncode,
      getFcmCredentials: getFcmCredentials,
      getGoogleOAuthToken: getGoogleOAuthToken,
      sendFcmTopicPush: sendFcmTopicPush,
      sendPortalPushNotification: sendPortalPushNotification,
      syncMobileDeviceSubscriptions: syncMobileDeviceSubscriptions,
      unsubscribeMobileDevice: unsubscribeMobileDevice
    };
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
