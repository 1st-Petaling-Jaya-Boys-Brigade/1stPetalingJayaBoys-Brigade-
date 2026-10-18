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
    return 'dark'; // Default to modern BB dark grey theme
  }

  function applyTheme(theme) {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('bb_theme', theme);
    } catch (e) {}

    // Update theme toggle buttons if present
    var toggles = document.querySelectorAll('.theme-toggle-btn');
    toggles.forEach(function(btn) {
      var isDark = theme === 'dark';
      btn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
      var icon = btn.querySelector('.theme-toggle-icon');
      if (icon) {
        icon.innerHTML = isDark ? SUN_ICON : MOON_ICON;
      }
      var text = btn.querySelector('.theme-toggle-text');
      if (text) {
        text.textContent = isDark ? 'Light' : 'Dark';
      }
    });
  }

  function toggleTheme() {
    var current = document.documentElement.getAttribute('data-theme') || 'dark';
    var next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    return next;
  }

  // Apply immediately on script execution to prevent flash of wrong theme
  var initialTheme = getPreferredTheme();
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', initialTheme);
    document.addEventListener('DOMContentLoaded', function() {
      applyTheme(initialTheme);
    });
  }

  // Expose to window
  if (typeof window !== 'undefined') {
    window.themeGet = getPreferredTheme;
    window.themeApply = applyTheme;
    window.toggleTheme = toggleTheme;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getPreferredTheme, applyTheme, toggleTheme };
  }
})();
