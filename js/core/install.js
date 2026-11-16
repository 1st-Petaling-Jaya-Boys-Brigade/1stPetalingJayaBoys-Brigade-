(function() {
  'use strict';

  var dialog = document.querySelector('.install-app-dialog');
  if (!dialog) return;

  var tabs = [...dialog.querySelectorAll('[data-install-platform]')];
  var panels = [...dialog.querySelectorAll('[data-install-panel]')];
  var apkLink = dialog.querySelector('[data-install-apk]');
  var portalLink = dialog.querySelector('[data-install-portal]');
  var deployedPortal = 'https://1st-petaling-jaya-boys-brigade.github.io/1stPetalingJayaBoys-Brigade-/';

  function httpsUrl(value) {
    try {
      var url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
    } catch (_) {
      return '';
    }
  }

  function renderQr(panel, url) {
    var figure = panel.querySelector('.install-app-qr');
    figure.hidden = true;
    if (!url || typeof window.qrcode !== 'function') return;

    try {
      var qr = window.qrcode(0, 'M');
      qr.addData(url);
      qr.make();
      var canvas = figure.querySelector('canvas');
      var count = qr.getModuleCount();
      var scale = 5;
      var quietZone = 4;
      canvas.width = canvas.height = (count + quietZone * 2) * scale;
      var context = canvas.getContext('2d');
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = '#000';
      for (var row = 0; row < count; row++) {
        for (var column = 0; column < count; column++) {
          if (qr.isDark(row, column)) {
            context.fillRect((column + quietZone) * scale, (row + quietZone) * scale, scale, scale);
          }
        }
      }
      figure.hidden = false;
    } catch (_) {
      // Keep the direct link available if the URL cannot fit in a QR code.
    }
  }

  function selectPlatform(platform) {
    tabs.forEach(function(tab) {
      tab.setAttribute('aria-pressed', String(tab.dataset.installPlatform === platform));
    });
    panels.forEach(function(panel) {
      panel.hidden = panel.dataset.installPanel !== platform;
    });
  }

  tabs.forEach(function(tab) {
    tab.addEventListener('click', function() { selectPlatform(tab.dataset.installPlatform); });
  });

  window.openInstallApp = function() {
    if (!window.AuthGuard?.isUserAuthenticated() || window.Capacitor?.isNativePlatform?.() || dialog.open) return;

    var apk = httpsUrl(window.ANDROID_APK_URL || '');
    var localHost = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
    var portal = (!localHost && httpsUrl(new URL('./', location.href).href)) || deployedPortal;
    apkLink.removeAttribute('href');
    if (apk) apkLink.href = apk;
    portalLink.href = portal;
    dialog.querySelector('[data-install-unavailable]').hidden = Boolean(apk);
    dialog.querySelector('[data-install-download]').hidden = !apk;
    renderQr(panels[0], apk);
    renderQr(panels[1], portal);
    selectPlatform(/iPhone|iPad|iPod/i.test(navigator.userAgent) || navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1 ? 'ios' : 'android');
    if (typeof window.closeSidebar === 'function') window.closeSidebar();
    dialog.showModal();
  };
})();
