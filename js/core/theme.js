/**
 * 1st Petaling Jaya Boys' Brigade Portal
 * Theme Management (Light / Dark Mode)
 */

(function() {
  var SUN_ICON = '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>';
  var MOON_ICON = '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>';

  function getPreferredTheme() {
    try {
      var saved = localStorage.getItem('bb_theme');
      if (saved === 'light' || saved === 'dark') return saved;
    } catch (e) {}
    if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
      return 'light';
    }
    return 'light'; // Default portal to light mode
  }

  function syncThemeMetaTags(theme) {
    if (typeof document === 'undefined' || typeof document.querySelector !== 'function') return;
    var schemeMeta = document.querySelector('meta[name="color-scheme"]');
    if (schemeMeta) {
      schemeMeta.setAttribute('content', theme === 'light' ? 'light' : 'dark');
    }
    var themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if (themeColorMeta) {
      themeColorMeta.setAttribute('content', theme === 'light' ? '#eef1f6' : '#121418');
    }
  }

  function applyTheme(theme, persist) {
    if (typeof document === 'undefined' || !document.documentElement) return;
    var resolved = theme === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', resolved);
    syncThemeMetaTags(resolved);
    if (persist !== false) {
      try {
        localStorage.setItem('bb_theme', resolved);
      } catch (e) {}
    }

    // Update theme toggle buttons if present
    if (typeof document.querySelectorAll !== 'function') return;
    var toggles = document.querySelectorAll('.theme-toggle-btn, .sidebar-theme-toggle');
    toggles.forEach(function(btn) {
      var isDark = resolved === 'dark';
      btn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
      var icon = btn.querySelector('.theme-toggle-icon');
      if (icon) {
        icon.innerHTML = isDark ? SUN_ICON : MOON_ICON;
      }
      var text = btn.querySelector('.theme-toggle-text');
      if (text) {
        text.textContent = isDark ? (btn.classList.contains('sidebar-theme-toggle') ? 'Light Mode' : 'Light') : (btn.classList.contains('sidebar-theme-toggle') ? 'Dark Mode' : 'Dark');
      }
    });
  }

  function toggleTheme() {
    var current = document.documentElement.getAttribute('data-theme') || 'dark';
    var next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next, true);
    return next;
  }

  // Apply immediately on script execution to prevent flash of wrong theme
  var initialTheme = getPreferredTheme();
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.setAttribute('data-theme', initialTheme);
    syncThemeMetaTags(initialTheme);
    if (typeof document.addEventListener === 'function') {
      document.addEventListener('DOMContentLoaded', function() {
        var active = document.documentElement.getAttribute('data-theme') || initialTheme;
        applyTheme(active, false);
      });
    }
  }

  // React to OS color-scheme changes when no explicit manual override is stored, and sync across tabs
  if (typeof window !== 'undefined') {
    if (window.matchMedia) {
      var mql = window.matchMedia('(prefers-color-scheme: light)');
      var onSchemeChange = function(e) {
        try {
          var saved = localStorage.getItem('bb_theme');
          if (saved === 'light' || saved === 'dark') return;
        } catch (err) {}
        applyTheme(e && e.matches ? 'light' : 'dark', false);
      };
      if (typeof mql.addEventListener === 'function') {
        mql.addEventListener('change', onSchemeChange);
      }
    }
    if (typeof window.addEventListener === 'function') {
      window.addEventListener('storage', function(e) {
        if (e && e.key === 'bb_theme' && (e.newValue === 'light' || e.newValue === 'dark')) {
          applyTheme(e.newValue, false);
        }
      });
    }
  }

  // ── Ambient Seasonal Falling Particles (Snow & Leaves) Engine ─────────────
  var LEAF_PALETTE = [
    { color: '#e11d48', vein: 'rgba(90, 10, 25, 0.4)' },   // Crimson
    { color: '#ea580c', vein: 'rgba(120, 35, 5, 0.4)' },   // Orange
    { color: '#d97706', vein: 'rgba(115, 60, 5, 0.4)' },   // Amber
    { color: '#ca8a04', vein: 'rgba(105, 70, 5, 0.4)' },   // Golden Ochre
    { color: '#b45309', vein: 'rgba(85, 35, 5, 0.4)' },    // Russet
    { color: '#a16207', vein: 'rgba(75, 45, 5, 0.4)' }     // Bronze
  ];

  var _particlesState = {
    enabled: true,
    mode: 'both', // 'both' | 'snow' | 'leaves'
    canvas: null,
    ctx: null,
    width: 0,
    height: 0,
    animId: null,
    snowList: [],
    leafList: [],
    isRunning: false,
    initialized: false
  };

  function getAmbientParticlesState() {
    var enabled = true;
    var mode = 'both';
    try {
      if (typeof localStorage !== 'undefined') {
        var savedEn = localStorage.getItem('bb_ambient_particles_enabled');
        if (savedEn !== null) enabled = savedEn !== 'false';
        var savedMode = localStorage.getItem('bb_ambient_particles_mode');
        if (savedMode === 'snow' || savedMode === 'leaves' || savedMode === 'both') {
          mode = savedMode;
        }
      }
    } catch (_) {}
    return { enabled: enabled, mode: mode };
  }

  function createSnowParticle(w, h, randomY) {
    return {
      type: 'snow',
      x: Math.random() * (w || 1000),
      y: randomY ? Math.random() * (h || 800) : -(Math.random() * 20 + 5),
      radius: Math.random() * 2.8 + 1.2,
      speedY: Math.random() * 1.2 + 0.6,
      speedX: (Math.random() - 0.5) * 0.5,
      swing: Math.random() * 1.5 + 0.6,
      swingSpeed: Math.random() * 0.025 + 0.015,
      swingStep: Math.random() * Math.PI * 2,
      opacity: Math.random() * 0.45 + 0.4
    };
  }

  function createLeafParticle(w, h, randomY) {
    var pal = LEAF_PALETTE[Math.floor(Math.random() * LEAF_PALETTE.length)];
    return {
      type: 'leaf',
      x: Math.random() * (w || 1000),
      y: randomY ? Math.random() * (h || 800) : -(Math.random() * 30 + 10),
      size: Math.random() * 9 + 11,
      speedY: Math.random() * 1.3 + 0.8,
      speedX: (Math.random() - 0.5) * 0.8,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.03,
      tiltAngle: Math.random() * Math.PI * 2,
      tiltSpeed: Math.random() * 0.04 + 0.02,
      swing: Math.random() * 2.2 + 0.8,
      swingSpeed: Math.random() * 0.02 + 0.01,
      swingStep: Math.random() * Math.PI * 2,
      color: pal.color,
      veinColor: pal.vein,
      opacity: Math.random() * 0.35 + 0.55
    };
  }

  function setupParticlesList() {
    var w = _particlesState.width || (typeof window !== 'undefined' ? window.innerWidth : 1000) || 1000;
    var h = _particlesState.height || (typeof window !== 'undefined' ? window.innerHeight : 800) || 800;
    var isMobile = w < 768;

    var snowCount = isMobile ? 22 : 44;
    var leafCount = isMobile ? 10 : 20;

    _particlesState.snowList = [];
    _particlesState.leafList = [];

    for (var i = 0; i < snowCount; i++) {
      _particlesState.snowList.push(createSnowParticle(w, h, true));
    }
    for (var j = 0; j < leafCount; j++) {
      _particlesState.leafList.push(createLeafParticle(w, h, true));
    }
  }

  function resizeParticlesCanvas() {
    if (!_particlesState.canvas) return;
    var w = (typeof window !== 'undefined' ? window.innerWidth : 1024) || 1024;
    var h = (typeof window !== 'undefined' ? window.innerHeight : 768) || 768;
    var dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;

    _particlesState.width = w;
    _particlesState.height = h;
    _particlesState.canvas.width = Math.floor(w * dpr);
    _particlesState.canvas.height = Math.floor(h * dpr);

    if (_particlesState.ctx) {
      _particlesState.ctx.setTransform(1, 0, 0, 1, 0, 0);
      _particlesState.ctx.scale(dpr, dpr);
    }
  }

  function drawSnow(ctx, p, isDark) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    if (isDark) {
      ctx.fillStyle = 'rgba(255, 255, 255, ' + p.opacity + ')';
      if (p.radius > 2.6) {
        ctx.shadowBlur = 4;
        ctx.shadowColor = 'rgba(255, 255, 255, 0.55)';
      }
    } else {
      ctx.fillStyle = 'rgba(120, 160, 210, ' + (p.opacity * 0.95) + ')';
      if (p.radius > 2.6) {
        ctx.shadowBlur = 3;
        ctx.shadowColor = 'rgba(90, 140, 200, 0.4)';
      }
    }
    ctx.fill();
    ctx.restore();
  }

  function drawLeaf(ctx, p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rotation);
    var tilt = Math.cos(p.tiltAngle);
    ctx.scale(tilt, 1);

    var s = p.size;
    ctx.beginPath();
    ctx.moveTo(0, s * 0.5);
    ctx.bezierCurveTo(s * 0.55, s * 0.25, s * 0.65, -s * 0.2, 0, -s * 0.55);
    ctx.bezierCurveTo(-s * 0.65, -s * 0.2, -s * 0.55, s * 0.25, 0, s * 0.5);
    ctx.closePath();

    ctx.fillStyle = p.color;
    ctx.globalAlpha = p.opacity;
    ctx.fill();

    // Central leaf vein
    ctx.beginPath();
    ctx.moveTo(0, s * 0.45);
    ctx.lineTo(0, -s * 0.45);
    ctx.strokeStyle = p.veinColor;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.restore();
  }

  function renderParticlesFrame() {
    if (!_particlesState.isRunning) return;

    var ctx = _particlesState.ctx;
    var w = _particlesState.width;
    var h = _particlesState.height;
    if (!ctx || !w || !h) {
      _particlesState.animId = requestAnimationFrame(renderParticlesFrame);
      return;
    }

    ctx.clearRect(0, 0, w, h);

    var isDark = true;
    try {
      if (document.documentElement && document.documentElement.getAttribute) {
        isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      }
    } catch (_) {}

    var mode = _particlesState.mode;

    // 1. Snowflakes
    if (mode === 'both' || mode === 'snow') {
      var snow = _particlesState.snowList;
      for (var i = 0; i < snow.length; i++) {
        var sp = snow[i];
        sp.y += sp.speedY;
        sp.swingStep += sp.swingSpeed;
        sp.x += sp.speedX + Math.sin(sp.swingStep) * sp.swing;

        if (sp.y > h + 10) {
          sp.y = -10;
          sp.x = Math.random() * w;
        }
        if (sp.x > w + 10) sp.x = -10;
        else if (sp.x < -10) sp.x = w + 10;

        drawSnow(ctx, sp, isDark);
      }
    }

    // 2. Autumn Leaves
    if (mode === 'both' || mode === 'leaves') {
      var leaves = _particlesState.leafList;
      for (var j = 0; j < leaves.length; j++) {
        var lp = leaves[j];
        lp.y += lp.speedY;
        lp.swingStep += lp.swingSpeed;
        lp.x += lp.speedX + Math.sin(lp.swingStep) * lp.swing;
        lp.rotation += lp.rotationSpeed;
        lp.tiltAngle += lp.tiltSpeed;

        if (lp.y > h + 25) {
          lp.y = -25;
          lp.x = Math.random() * w;
        }
        if (lp.x > w + 25) lp.x = -25;
        else if (lp.x < -25) lp.x = w + 25;

        drawLeaf(ctx, lp);
      }
    }

    _particlesState.animId = requestAnimationFrame(renderParticlesFrame);
  }

  function startAmbientParticles(mode) {
    if (mode) _particlesState.mode = mode;
    if (_particlesState.isRunning) return;

    if (typeof window !== 'undefined' && window.matchMedia) {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        return;
      }
    }

    if (!_particlesState.canvas && typeof document !== 'undefined' && document.body) {
      initAmbientParticles();
    }

    if (_particlesState.canvas) {
      _particlesState.canvas.style.display = 'block';
      _particlesState.canvas.style.opacity = '1';
    }

    _particlesState.isRunning = true;
    if (typeof requestAnimationFrame === 'function') {
      _particlesState.animId = requestAnimationFrame(renderParticlesFrame);
    }
  }

  function stopAmbientParticles() {
    _particlesState.isRunning = false;
    if (_particlesState.animId) {
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(_particlesState.animId);
      _particlesState.animId = null;
    }
    if (_particlesState.ctx && _particlesState.width && _particlesState.height) {
      _particlesState.ctx.clearRect(0, 0, _particlesState.width, _particlesState.height);
    }
    if (_particlesState.canvas) {
      _particlesState.canvas.style.display = 'none';
    }
  }

  function toggleAmbientParticles(forceState) {
    var next = (typeof forceState === 'boolean') ? forceState : !_particlesState.enabled;
    _particlesState.enabled = next;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('bb_ambient_particles_enabled', next ? 'true' : 'false');
      }
    } catch (_) {}

    if (next) {
      startAmbientParticles();
    } else {
      stopAmbientParticles();
    }
    return next;
  }

  function setAmbientParticlesMode(mode) {
    if (mode !== 'both' && mode !== 'snow' && mode !== 'leaves') {
      mode = 'both';
    }
    _particlesState.mode = mode;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('bb_ambient_particles_mode', mode);
      }
    } catch (_) {}
  }

  function initAmbientParticles() {
    if (typeof document === 'undefined' || !document.body) return;
    if (_particlesState.canvas) return;

    var savedState = getAmbientParticlesState();
    _particlesState.enabled = savedState.enabled;
    _particlesState.mode = savedState.mode;

    var canvas = document.createElement('canvas');
    canvas.className = 'portal-ambient-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.appendChild(canvas);

    _particlesState.canvas = canvas;
    _particlesState.ctx = canvas.getContext ? canvas.getContext('2d') : null;

    resizeParticlesCanvas();
    setupParticlesList();

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('resize', function() {
        resizeParticlesCanvas();
      });

      document.addEventListener('visibilitychange', function() {
        if (document.hidden) {
          if (_particlesState.isRunning && _particlesState.animId) {
            cancelAnimationFrame(_particlesState.animId);
            _particlesState.animId = null;
          }
        } else if (_particlesState.isRunning && _particlesState.enabled) {
          _particlesState.animId = requestAnimationFrame(renderParticlesFrame);
        }
      });
    }

    _particlesState.initialized = true;

    if (_particlesState.enabled) {
      startAmbientParticles();
    } else {
      stopAmbientParticles();
    }
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function() {
        initAmbientParticles();
      });
    } else {
      initAmbientParticles();
    }
  }

  // Expose to window
  if (typeof window !== 'undefined') {
    window.themeGet = getPreferredTheme;
    window.themeApply = applyTheme;
    window.toggleTheme = toggleTheme;
    window.getAmbientParticlesState = getAmbientParticlesState;
    window.startAmbientParticles = startAmbientParticles;
    window.stopAmbientParticles = stopAmbientParticles;
    window.toggleAmbientParticles = toggleAmbientParticles;
    window.setAmbientParticlesMode = setAmbientParticlesMode;
    window.initAmbientParticles = initAmbientParticles;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      getPreferredTheme,
      applyTheme,
      toggleTheme,
      getAmbientParticlesState,
      startAmbientParticles,
      stopAmbientParticles,
      toggleAmbientParticles,
      setAmbientParticlesMode,
      initAmbientParticles
    };
  }
})();
