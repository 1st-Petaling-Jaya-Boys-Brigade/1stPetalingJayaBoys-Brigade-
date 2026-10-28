/**
 * 1st Petaling Jaya Boys' Brigade Portal
 * Application Configuration & Constants
 */

var SUPA_URL = 'https://mjfclxcklkbgsivvvlfe.supabase.co';
var SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1qZmNseGNrbGtiZ3NpdnZ2bGZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxODUyMDYsImV4cCI6MjA4OTc2MTIwNn0.ZYsaHnPJ1LXrk4iYP5pYgNKjyksXPsK8ZxkXPFeEcOM';

// Pre-computed cryptographic SHA-256 hash of default admin password (BUG-009)
var ADMIN_PASSWORD_HASH = 'e73d72da113ab72c21c2a07d2a4b72c5d28885ce29bd22abcb6697a8cd79ec7f';

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
  window.ADMIN_PASSWORD_HASH = ADMIN_PASSWORD_HASH;
  window.NCO_RANKS = NCO_RANKS;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SUPA_URL, SUPA_KEY, ADMIN_PASSWORD_HASH, NCO_RANKS };
}
