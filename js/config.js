/**
 * 1st Petaling Jaya Boys' Brigade Portal
 * Application Configuration & Constants
 */

var SUPA_URL = 'https://mjfclxcklkbgsivvvlfe.supabase.co';
var SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1qZmNseGNrbGtiZ3NpdnZ2bGZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxODUyMDYsImV4cCI6MjA4OTc2MTIwNn0.ZYsaHnPJ1LXrk4iYP5pYgNKjyksXPsK8ZxkXPFeEcOM';

var ADMIN_PASSWORD = 'bb2024admin';

var NCO_RANKS = [
  'Lance Corporal',
  'Corporal',
  'Sergeant',
  'Staff Sergeant',
  'Officer Cadet',
  '2nd Lieutenant',
  'Lieutenant'
];

// Attach to global window for browser compatibility
if (typeof window !== 'undefined') {
  window.SUPA_URL = SUPA_URL;
  window.SUPA_KEY = SUPA_KEY;
  window.ADMIN_PASSWORD = ADMIN_PASSWORD;
  window.NCO_RANKS = NCO_RANKS;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SUPA_URL, SUPA_KEY, ADMIN_PASSWORD, NCO_RANKS };
}
