/**
 * 1st Petaling Jaya Boys' Brigade Portal
 * Application Configuration & Constants
 */

var SUPA_URL = 'https://mjfclxcklkbgsivvvlfe.supabase.co';
var SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1qZmNseGNrbGtiZ3NpdnZ2bGZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxODUyMDYsImV4cCI6MjA4OTc2MTIwNn0.ZYsaHnPJ1LXrk4iYP5pYgNKjyksXPsK8ZxkXPFeEcOM';

// Pre-computed cryptographic SHA-256 hash of default admin password
var ADMIN_PASSWORD_HASH = 'e73d72da113ab72c21c2a07d2a4b72c5d28885ce29bd22abcb6697a8cd79ec7f';

// Cloudflare Turnstile CAPTCHA
// 1x00000000000000000000AA: Cloudflare testing sitekey (Always passes)
// 2x00000000000000000000AB: Cloudflare testing sitekey (Always blocks)
var TURNSTILE_SITE_KEY = '1x00000000000000000000AA';

var MEMBERS_JUNIORS_RANKS = [
  'Pre-Junior',
  'Junior',
  'Assistance Junior Leader',
  'Junior Leader',
  'Chief Junior Leader'
];

var MEMBERS_SENIOR_RANKS = [
  'Recruit',
  'Private'
];

var NCO_RANKS = [
  'Lance Corporal',
  'Corporal',
  'Sergeant'
];

var OFFICER_RANKS = [
  'Captain',
  'Honarary Captain',
  'Lieutenant',
  'Warrant Officer',
  'Instructor',
  'Staff Sergeant'
];


/**
 * Canonical helper to check if a member rank qualifies as NCO / Leader
 * @param {string} rank
 * @returns {boolean}
 */
function isNcoRank(rank) {
  if (!rank || typeof rank !== 'string') return false;
  var r = rank.trim();
  var ranks = typeof NCO_RANKS !== 'undefined' ? NCO_RANKS : (typeof window !== 'undefined' && window.NCO_RANKS ? window.NCO_RANKS : []);
  var offRanks = typeof OFFICER_RANKS !== 'undefined' ? OFFICER_RANKS : (typeof window !== 'undefined' && window.OFFICER_RANKS ? window.OFFICER_RANKS : []);
  return ranks.indexOf(r) !== -1 || offRanks.indexOf(r) !== -1;
}

// Attach to global window for browser compatibility
if (typeof window !== 'undefined') {
  window.SUPA_URL = SUPA_URL;
  window.SUPA_KEY = SUPA_KEY;
  window.ADMIN_PASSWORD_HASH = ADMIN_PASSWORD_HASH;
  window.TURNSTILE_SITE_KEY = TURNSTILE_SITE_KEY;
  window.MEMBERS_JUNIORS_RANKS = MEMBERS_JUNIORS_RANKS;
  window.MEMBERS_SENIOR_RANKS = MEMBERS_SENIOR_RANKS;
  window.NCO_RANKS = NCO_RANKS;
  window.OFFICER_RANKS = OFFICER_RANKS;
  window.isNcoRank = isNcoRank;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SUPA_URL, SUPA_KEY, ADMIN_PASSWORD_HASH, TURNSTILE_SITE_KEY, MEMBERS_JUNIORS_RANKS, MEMBERS_SENIOR_RANKS, NCO_RANKS, OFFICER_RANKS, isNcoRank };
}
