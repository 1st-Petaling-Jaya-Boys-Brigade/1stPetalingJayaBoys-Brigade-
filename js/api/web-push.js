/* global sessionGet, showPromptModal */

(function () {
  'use strict';

  if (typeof window === 'undefined') return;
  const signInKey = 'bb_web_push_signin';
  const deviceRecordKey = 'bb_web_push_device';
  const endpoint = window.SUPA_URL ? window.SUPA_URL + '/functions/v1/portal-web-push' : '';
  let registration;
  let applicationKey;
  let pendingKey;
  let changeInProgress;
  let sessionVersion = 0;

  function isIOS() {
    return !window.Capacitor?.isNativePlatform?.() && (/iPhone|iPad|iPod/i.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
  }

  function isInstalled() {
    return isIOS() && (navigator.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches);
  }

  function read(storage, key) {
    try { return JSON.parse(storage.getItem(key)); } catch (_) { return null; }
  }

  function member() {
    return typeof sessionGet === 'function' ? String(sessionGet('ic') || '') : '';
  }

  function email() {
    return typeof sessionGet === 'function' ? String(sessionGet('email') || '').trim().toLowerCase() : '';
  }

  function savedSignIn() {
    return read(sessionStorage, signInKey) || read(localStorage, signInKey);
  }

  function activeToken() {
    const signedIn = savedSignIn();
    return signedIn?.email === email() && Date.parse(signedIn.expiresAt) > Date.now() ? signedIn.token : '';
  }

  async function request(action, values = {}, timeout = 8000) {
    if (!endpoint) throw new Error('Push service is unavailable.');
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...values, action }),
      credentials: 'omit',
      keepalive: action !== 'session',
      signal: AbortSignal.timeout(timeout)
    });
    if (!response.ok) {
      const error = new Error('The push service could not complete this request.');
      error.status = response.status;
      throw error;
    }
    return response.json();
  }

  async function authorize(memberEmail, password, remember, timeout = 3500) {
    if (!memberEmail || !password) return '';
    const version = sessionVersion;
    const result = await request('session', { email: memberEmail, password, remember }, timeout);
    if (version !== sessionVersion) return '';
    sessionStorage.removeItem(signInKey);
    localStorage.removeItem(signInKey);
    (remember ? localStorage : sessionStorage).setItem(signInKey, JSON.stringify({
      ...result,
      email: memberEmail.trim().toLowerCase()
    }));
    return result.token;
  }

  function prepare() {
    if (!pendingKey && endpoint && isInstalled() && 'PushManager' in window && 'serviceWorker' in navigator) {
      pendingKey = Promise.all([
        navigator.serviceWorker.ready,
        fetch(endpoint, { credentials: 'omit', signal: AbortSignal.timeout(8000) }).then(response => {
          if (!response.ok) throw new Error('Push service is unavailable.');
          return response.json();
        })
      ]).then(([ready, settings]) => {
        const key = settings.applicationServerKey;
        if (typeof key !== 'string' || !/^[\w-]{87}$/.test(key)) throw new Error('Invalid application server key.');
        applicationKey = Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/') + '='), char => char.charCodeAt(0));
        registration = ready;
        return true;
      }).catch(() => {
        pendingKey = null;
        return false;
      });
    }
    return pendingKey;
  }

  function readyForSetup() {
    if (!isInstalled() || !window.Notification || window.Notification.permission === 'denied') return false;
    return prepare() || false;
  }

  function isEnabled() {
    const device = read(localStorage, deviceRecordKey);
    return Boolean(isInstalled() && member() && device?.member === member() && window.Notification?.permission === 'granted');
  }

  async function subscribe() {
    if (!isInstalled()) throw new Error('Open the portal from its Home Screen icon to enable notifications.');
    if (!('PushManager' in window) || !window.Notification) throw new Error('Home Screen notifications require iOS or iPadOS 16.4 or newer.');
    if (!member() || !email()) throw new Error('Sign in to the portal to enable notifications.');
    if (window.Notification.permission === 'denied') throw new Error('Allow notifications for the portal in iPhone or iPad Settings.');
    if (!registration || !applicationKey) {
      prepare();
      throw new Error('Notifications are getting ready. Try again in a moment.');
    }

    const currentMember = member();
    const currentEmail = email();
    const version = sessionVersion;
    // Call subscribe during the actual button gesture, before waiting for sign-in or any network response.
    let subscription;
    try {
      subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationKey });
    } catch (error) {
      if (error.name === 'NotAllowedError') throw new Error('Allow notifications for the portal in iPhone or iPad Settings, then try again.');
      throw new Error('This device could not subscribe. Open the portal from the Home Screen and try again.');
    }
    if (version !== sessionVersion || currentMember !== member()) {
      await subscription.unsubscribe();
      throw new Error('Sign in again to enable notifications.');
    }

    const previous = read(localStorage, deviceRecordKey);
    const deviceKey = previous?.endpoint === subscription.endpoint ? previous.deviceKey :
      Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
    let token = activeToken();
    try {
      if (!token && typeof showPromptModal === 'function') {
        const password = await showPromptModal('Confirm your portal password', 'Password', '', {
          password: true,
          subtitle: 'Verify your member account to receive notifications on this device.',
          confirmText: 'Enable notifications'
        });
        if (!password) throw new Error('Notification setup cancelled.');
        if (version !== sessionVersion || currentMember !== member()) throw new Error('Sign in again to enable notifications.');
        token = await authorize(currentEmail, password, sessionGet('remember') !== false, 8000);
      }
      if (!token || version !== sessionVersion || currentMember !== member()) throw new Error('Sign in again to enable notifications.');
      await request('register', { token, member: currentMember, deviceKey, subscription: subscription.toJSON() });
      if (version !== sessionVersion || currentMember !== member()) {
        await request('unregister', { endpoint: subscription.endpoint, deviceKey });
        throw new Error('Sign in again to enable notifications.');
      }
      localStorage.setItem(deviceRecordKey, JSON.stringify({ endpoint: subscription.endpoint, deviceKey, member: currentMember }));
      localStorage.setItem('bb_notif_system_enabled', 'true');
    } catch (error) {
      if (previous?.endpoint !== subscription.endpoint) await subscription.unsubscribe().catch(() => {});
      if (error.status === 401 || error.status === 403) throw new Error('Your notification sign-in could not be verified. Check your password and try again.');
      throw error;
    }
  }

  function enable() {
    if (!changeInProgress) changeInProgress = subscribe().finally(() => { changeInProgress = null; });
    return changeInProgress;
  }

  async function disable() {
    const version = ++sessionVersion;
    const device = read(localStorage, deviceRecordKey);
    localStorage.removeItem(deviceRecordKey);
    if (isInstalled()) localStorage.setItem('bb_notif_system_enabled', 'false');
    if (!device) return;
    const remove = request('unregister', { endpoint: device.endpoint, deviceKey: device.deviceKey });
    const unsubscribe = (async () => {
      const worker = registration || await navigator.serviceWorker.getRegistration();
      if (!worker) throw new Error('No portal service worker registration.');
      const subscription = await worker.pushManager.getSubscription();
      if (subscription) await subscription.unsubscribe();
    })();
    const results = await Promise.allSettled([remove, unsubscribe]);
    if (results.every(result => result.status === 'rejected')) {
      if (version === sessionVersion && device.member === member() && !read(localStorage, deviceRecordKey)) {
        localStorage.setItem(deviceRecordKey, JSON.stringify(device));
        localStorage.setItem('bb_notif_system_enabled', 'true');
      }
      throw new Error('Could not disable device notifications. Try again when connected.');
    }
  }

  async function signOut() {
    const token = savedSignIn()?.token;
    sessionStorage.removeItem(signInKey);
    localStorage.removeItem(signInKey);
    return Promise.allSettled([disable(), token && request('signout', { token })]);
  }

  async function test() {
    if (!isEnabled() || !activeToken()) await enable();
    const device = read(localStorage, deviceRecordKey);
    await request('test', { endpoint: device?.endpoint, deviceKey: device?.deviceKey, member: member(), token: activeToken() });
  }

  async function notify(category, topics, target, meta) {
    const token = activeToken();
    if (!token || !member() || !topics.length) return false;
    const payload = { token, member: member(), category, topics, target };
    if (meta && typeof meta === 'object') {
      if (typeof meta.title === 'string' && meta.title) payload.title = meta.title.slice(0, 80);
      if (typeof meta.body === 'string' && meta.body) payload.body = meta.body.slice(0, 160);
      if (typeof meta.tab === 'string' && meta.tab) payload.tab = meta.tab.slice(0, 32);
    }
    return request('notify', payload, 25000)
      .then(result => Boolean(result && ((result.sent || 0) > 0 || (result.fcmSent || 0) > 0))).catch(() => false);
  }

  async function uploadPaymentProof(order, memberId, proof) {
    const checkoutMember = () => member() || email();
    let token = activeToken();
    if (!token && typeof showPromptModal === 'function') {
      const password = await showPromptModal('Confirm your portal password', 'Password', '', {
        password: true,
        subtitle: 'Verify your account to submit your proof of payment.',
        confirmText: 'Continue'
      });
      if (password && checkoutMember() === memberId) {
        token = await authorize(email(), password, false, 8000);
      }
    }
    if (!token || checkoutMember() !== memberId) throw new Error('Portal verification is required.');
    const pdf = proof.type === 'application/pdf';
    const form = new FormData();
    form.set('token', token);
    form.set('member', memberId);
    form.set('order', order);
    form.set('proof', proof, pdf ? 'payment.pdf' : 'payment.jpg');
    const response = await fetch(endpoint, {
      method: 'POST',
      body: form,
      credentials: 'omit',
      signal: AbortSignal.timeout(pdf ? 120000 : 20000)
    });
    if (!response.ok) {
      if (response.status === 401) {
        sessionStorage.removeItem(signInKey);
        localStorage.removeItem(signInKey);
      }
      throw new Error('Proof of payment could not be uploaded.');
    }
  }

  function viewPaymentProof(order, adminToken) {
    return request('payment_proof_view', { order, token: adminToken });
  }

  window.PortalWebPush = { isIOS, isEnabled, readyForSetup, authorize, enable, disable, signOut, test, notify, uploadPaymentProof, viewPaymentProof };
  prepare();
})();
