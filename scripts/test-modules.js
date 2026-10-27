/**
 * Automated Unit & Integration Tests for Core Security Firewall, Announcements, Gallery, and Resources Modules
 */
const assert = require('assert');
const fs = require('fs');

// ── Test Environment Simulation ──
global.window = global;

const mockElements = {};
global.document = {
  getElementById: (id) => {
    if (!mockElements[id]) {
      mockElements[id] = {
        value: '',
        textContent: '',
        innerHTML: '',
        style: {},
        disabled: false,
        files: [],
        setAttribute: (_k, _v) => {},
        removeAttribute: (_k) => {},
        getAttribute: (_k) => null,
        scrollIntoView: () => {},
        querySelectorAll: () => [],
        addEventListener: () => {},
        removeEventListener: () => {}
      };
    }
    return mockElements[id];
  },
  querySelectorAll: () => [],
  addEventListener: () => {},
  removeEventListener: () => {}
};

// ── Load Core Utils & Security Firewall (TSK-031) ──
const utils = require('../js/core/utils.js');
global.escapeHtml     = utils.escapeHtml;
global.safeUrl        = utils.safeUrl;
global.sanitizeInput  = utils.sanitizeInput;
global.sanitizeText   = utils.sanitizeText;
global.sanitizeHtml   = utils.sanitizeHtml;

// Mock localStorage
let mockLocalStorage = {};
global.localStorage = {
  getItem: (k) => mockLocalStorage[k] || null,
  setItem: (k, v) => { mockLocalStorage[k] = String(v); },
  removeItem: (k) => { delete mockLocalStorage[k]; },
  clear: () => { mockLocalStorage = {}; }
};

// Mock Session & UI
let mockUser = 'test@bbpj1.org';
let mockRank = 'Recruit';
let mockAdmin = false;
let mockSession = {};
global.sessionGet = (k) => {
  if (k in mockSession) return mockSession[k];
  if (k === 'rank') return mockRank;
  if (k === 'adminAuthed') return mockAdmin;
  return mockUser;
};
global.sessionSet = (k, v) => { mockSession[k] = v; };
global.location = { hash: '', reload: () => {} };
global.window.location = global.location;
global.alert = (_msg) => {};
global.hashPassword = async (p) => 'hash_' + p;
global.showToast = (_msg, _type) => {};
global.showConfirmModal = async (_msg, _title) => true;
global.isNCO = (rank) => ['Lance Corporal', 'Corporal', 'Sergeant', 'Staff Sergeant'].indexOf(rank) !== -1;

// Mock Supabase
let _lastPatched = null;
let lastPosted = null;
let _lastDeleted = null;

global.supa = {
  get: async (path) => {
    if (path.includes('bb_resources')) {
      return []; // Return empty by default (no placeholder docs)
    }
    return [
      { id: '1', title: 'Test Notice', body: '<b>Meeting on Saturday</b>', date: '25 OCT 2026', reactions: { '👍': ['other@bb.org'] } }
    ];
  },
  req: async (method, path, body, extraHeaders) => {
    if (method === 'POST') {
      lastPosted = { path, body, extraHeaders };
      return [{ id: 'new_id', ...body }];
    }
    return [
      { id: 'g1', url: 'https://example.com/photo1.jpg' },
      { id: 'g2', url: 'https://example.com/photo2.jpg' }
    ];
  },
  post: async (path, body) => {
    lastPosted = { path, body };
    return [{ id: 'new_id', ...body }];
  },
  upsert: async (path, body, onConflict) => {
    lastPosted = { path, body, onConflict };
    return [{ id: 'upserted_id', ...body }];
  },
  patch: async (path, body) => {
    _lastPatched = { path, body };
    return body;
  },
  delete: async (path) => {
    _lastDeleted = path;
    return true;
  },
  uploadFile: async (bucket, fname, _blob) => {
    return { Key: bucket + '/' + fname };
  },
  fileUrl: (bucket, fname) => {
    return 'https://example.com/storage/' + bucket + '/' + fname;
  },
  deleteFile: async (_bucket, _fname) => {
    return true;
  }
};

// ── Core Security Firewall Tests (TSK-031) ──
console.log('Testing Core Security Firewall (TSK-031)...');

// 1. escapeHtml tests
const rawBadHtml = '<script>alert("XSS" & \'test\') / `eval`</script>';
const escaped = utils.escapeHtml(rawBadHtml);
assert.strictEqual(escaped.includes('<'), false, 'escapeHtml must encode <');
assert.strictEqual(escaped.includes('>'), false, 'escapeHtml must encode >');
assert.strictEqual(escaped.includes('"'), false, 'escapeHtml must encode "');
assert.strictEqual(escaped.includes("'"), false, "escapeHtml must encode '");
assert.strictEqual(escaped.includes('&amp;'), true, 'escapeHtml must encode &');
assert.strictEqual(escaped.includes('&#x2F;'), true, 'escapeHtml must encode forward slash');
assert.strictEqual(escaped.includes('&#96;'), true, 'escapeHtml must encode backtick');
assert.strictEqual(utils.escapeHtml(null), '');
assert.strictEqual(utils.escapeHtml(undefined), '');
assert.strictEqual(utils.escapeHtml(123), '123');
console.log('  ✔ escapeHtml properly encodes &, <, >, ", \', /, and ` across types');

// 2. safeUrl tests
assert.strictEqual(utils.safeUrl('javascript:alert(1)'), '#', 'safeUrl must block javascript: URI');
assert.strictEqual(utils.safeUrl('JAVASCRIPT:alert(1)', 'fallback'), 'fallback', 'safeUrl must block case-insensitive javascript:');
assert.strictEqual(utils.safeUrl('vbscript:msgbox(1)'), '#', 'safeUrl must block vbscript: URI');
assert.strictEqual(utils.safeUrl('data:text/html,<script>alert(1)</script>'), '#', 'safeUrl must block data:text/html URI');
assert.strictEqual(utils.safeUrl('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='), '#', 'safeUrl must block data:image/svg+xml with script risks');
assert.strictEqual(utils.safeUrl('https://example.com/handbook.pdf'), 'https://example.com/handbook.pdf', 'safeUrl must allow https URLs');
assert.strictEqual(utils.safeUrl('http://localhost:3000'), 'http://localhost:3000', 'safeUrl must allow http URLs');
assert.strictEqual(utils.safeUrl('mailto:officer@bbpj1.org'), 'mailto:officer@bbpj1.org', 'safeUrl must allow mailto URLs');
assert.strictEqual(utils.safeUrl('tel:+60123456789'), 'tel:+60123456789', 'safeUrl must allow tel URLs');
assert.strictEqual(utils.safeUrl('/assets/logo.png'), '/assets/logo.png', 'safeUrl must allow absolute relative URLs');
assert.strictEqual(utils.safeUrl('./manual.pdf'), './manual.pdf', 'safeUrl must allow dot relative URLs');
assert.strictEqual(utils.safeUrl('#member'), '#member', 'safeUrl must allow anchor hashes');
assert.strictEqual(utils.safeUrl('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='), 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'safeUrl must allow safe raster image base64 URIs');
assert.strictEqual(utils.safeUrl(null, 'default'), 'default');
assert.strictEqual(utils.safeUrl('', 'default'), 'default');
console.log('  ✔ safeUrl strictly validates protocols and blocks javascript:, vbscript:, and SVG data URIs');

// 3. sanitizeInput tests
assert.strictEqual(utils.sanitizeInput('  John \x00Doe \x1F\x08 '), 'John Doe', 'sanitizeInput must strip null bytes and control chars');
assert.strictEqual(utils.sanitizeInput('Super long input text string', 10), 'Super long', 'sanitizeInput must truncate to maxLength');
console.log('  ✔ sanitizeInput cleans unprintable control characters and enforces length limits');

// 4. sanitizeText tests
assert.strictEqual(utils.sanitizeText('<b>Sergeant</b> <script>alert(1)</script>John'), 'Sergeant alert(1)John', 'sanitizeText must strip all HTML markup');
console.log('  ✔ sanitizeText strips all HTML tags for plain-text storage');

// 5. sanitizeHtml tests
const dirtyRichText = '<p>Parade at <b>8:00 AM</b></p><script>evil()</script><iframe src="http://evil.com"></iframe><img src=x onerror=alert(1)><a href="javascript:alert(2)" onclick="steal()">Click</a>';
const cleanRichText = utils.sanitizeHtml(dirtyRichText);
assert.strictEqual(cleanRichText.includes('<script>'), false, 'sanitizeHtml must remove script tags');
assert.strictEqual(cleanRichText.includes('<iframe>'), false, 'sanitizeHtml must remove iframe tags');
assert.strictEqual(cleanRichText.includes('onerror'), false, 'sanitizeHtml must strip onerror event handlers');
assert.strictEqual(cleanRichText.includes('onclick'), false, 'sanitizeHtml must strip onclick event handlers');
assert.strictEqual(cleanRichText.includes('javascript:'), false, 'sanitizeHtml must strip javascript: URIs');
assert.strictEqual(cleanRichText.includes('<b>8:00 AM</b>'), true, 'sanitizeHtml must preserve safe formatting');
console.log('  ✔ sanitizeHtml eliminates dangerous tags and event handlers while preserving safe markup\n');

// ── Load Announcements Module ──
const announcementsModule = require('../js/modules/announcements.js');

console.log('Testing Announcements Module...');

// 1. Sanitizer Test
const cleanSafe = announcementsModule.sanitizeAnnouncementHtml('<b>Hello</b> <script>alert(1)</script><img src=x onerror=alert(2)>');
assert.strictEqual(cleanSafe.includes('<script>'), false, 'Sanitizer should remove <script> tags');
assert.strictEqual(cleanSafe.includes('onerror'), false, 'Sanitizer should remove inline onerror event handlers');
console.log('  ✔ HTML Sanitizer properly strips dangerous script/event tags');

(async () => {
  // 2. Load Announcements
  await announcementsModule.loadAnnouncements();
  assert.strictEqual(announcementsModule.announcements.length, 1, 'Should load 1 announcement');
  assert.strictEqual(announcementsModule.announcements[0].title, 'Test Notice');
  console.log('  ✔ loadAnnouncements loads and formats data correctly');

  // 3. Toggle Reaction (Add)
  mockUser = 'test@bbpj1.org';
  await announcementsModule.toggleReaction(0, '👍');
  assert.strictEqual(announcementsModule.announcements[0].reactions['👍'].includes('test@bbpj1.org'), true);
  console.log('  ✔ toggleReaction adds reaction for logged-in user');

  // 4. Toggle Reaction (Remove)
  await announcementsModule.toggleReaction(0, '👍');
  assert.strictEqual(announcementsModule.announcements[0].reactions['👍'].includes('test@bbpj1.org'), false);
  console.log('  ✔ toggleReaction removes reaction when clicked again');

  // 5. Unauthenticated reaction check
  mockUser = null;
  let toastTriggered = false;
  global.showToast = (msg, type) => {
    if (type === 'warning') toastTriggered = true;
  };
  await announcementsModule.toggleReaction(0, '🔥');
  assert.strictEqual(toastTriggered, true, 'Unauthenticated reaction should be blocked with toast');
  console.log('  ✔ toggleReaction blocks unauthenticated users with warning toast');

  // ── Load Gallery Module ──
  console.log('\nTesting Gallery Module...');
  const galleryModule = require('../js/modules/gallery.js');

  await galleryModule.loadGallery();
  assert.strictEqual(galleryModule.galleryImages.length, 2, 'Should load 2 gallery images');
  console.log('  ✔ loadGallery loads photo array correctly');

  await galleryModule.deleteGalleryImage(0, 'g1');
  assert.strictEqual(galleryModule.galleryImages.length, 1, 'Should delete 1 image');
  console.log('  ✔ deleteGalleryImage removes photo and deletes from Supabase');

  const mockFile = {
    name: 'event.png',
    type: 'image/png',
    arrayBuffer: async () => new ArrayBuffer(8)
  };
  await galleryModule.uploadGalleryFiles([mockFile]);
  assert.strictEqual(galleryModule.galleryImages.length, 2, 'Should add newly uploaded photo to array');
  assert.strictEqual(lastPosted.path, 'bb_gallery', 'Should insert into bb_gallery table');
  console.log('  ✔ uploadGalleryFiles uploads to storage and inserts database record');

  // ── Load Resources Module (TSK-034) ──
  console.log('\nTesting Resources Module (TSK-034)...');
  const resourcesModule = require('../js/modules/resources.js');

  // 1. Load Resources (Empty by default, zero non-working placeholders)
  await resourcesModule.loadResources();
  assert.strictEqual(resourcesModule.resources.length, 0, 'Should start with 0 placeholder resources');
  console.log('  ✔ loadResources initializes empty clean catalog without placeholder documents');

  // 2. Format File Size Helper
  assert.strictEqual(resourcesModule.formatFileSize(500), '500 B');
  assert.strictEqual(resourcesModule.formatFileSize(1024 * 150), '150.0 KB');
  assert.strictEqual(resourcesModule.formatFileSize(1024 * 1024 * 2.4), '2.4 MB');
  console.log('  ✔ formatFileSize correctly formats bytes, KB, and MB');

  // 3. Handle Resource URL Auto-detection
  document.getElementById('adm-res-type').value = 'PDF';
  resourcesModule.handleResourceUrlInput('https://drive.google.com/drive/folders/1A2B3C');
  assert.strictEqual(document.getElementById('adm-res-type').value, 'DRIVE', 'Detects Google Drive URL');
  resourcesModule.handleResourceUrlInput('https://docs.google.com/document/d/1A2B3C/edit');
  assert.strictEqual(document.getElementById('adm-res-type').value, 'DOC', 'Detects Google Doc URL');
  console.log('  ✔ handleResourceUrlInput auto-detects Drive and Doc badges from URLs');

  // 4. File Selection & Upload Button Flow
  const mockDocFile = {
    name: 'Drill_Manual_2026.pdf',
    size: 1.8 * 1024 * 1024,
    type: 'application/pdf',
    arrayBuffer: async () => new ArrayBuffer(16)
  };

  // Step A: User chooses a file - stages file and auto-populates metadata WITHOUT uploading yet
  const fileInputEl = document.getElementById('adm-res-file');
  fileInputEl.files = [mockDocFile];
  document.getElementById('adm-res-title').value = '';
  resourcesModule.handleResourceFileSelect(fileInputEl);

  assert.strictEqual(document.getElementById('adm-res-title').value, 'Drill Manual 2026', 'Auto-populates title from filename');
  assert.strictEqual(document.getElementById('adm-res-type').value, 'PDF', 'Auto-detects PDF type badge');
  assert.strictEqual(document.getElementById('adm-res-cat').value, 'Handbooks & Manuals', 'Auto-detects category from filename');
  assert.strictEqual(resourcesModule.autoDetectCategory('Target Workbook 2026.pdf'), 'Badges & Syllabi', 'Detects target workbook category');
  assert.ok(document.getElementById('adm-res-upload-status').innerHTML.includes('Selected:'), 'Shows staged file preview status');
  assert.strictEqual(resourcesModule.resources.length, 0, 'Does NOT upload or publish yet before user presses upload button');
  console.log('  ✔ handleResourceFileSelect stages file, auto-detects title/category, and does not upload before button press');

  // Step B: User presses "Upload Document" button - uploads to storage and publishes to catalog
  await resourcesModule.addOrUpdateResource();
  assert.strictEqual(resourcesModule.resources.length, 1, 'Publishes resource after user presses Upload Document');
  assert.strictEqual(resourcesModule.resources[0].title, 'Drill Manual 2026');
  assert.strictEqual(resourcesModule.resources[0].fileType, 'PDF');
  assert.strictEqual(resourcesModule.resources[0].category, 'Handbooks & Manuals');
  assert.strictEqual(resourcesModule.resources[0].fileSize, '1.8 MB');
  assert.ok(resourcesModule.resources[0].url.includes('gallery'), 'Uploaded URL is generated from Supabase Storage');
  assert.strictEqual(document.getElementById('adm-res-submit-btn').textContent, 'Upload Document', 'Button resets to Upload Document');
  console.log('  ✔ addOrUpdateResource uploads file, publishes document, and resets button to Upload Document');

  // 5. Admin adds real company resource
  const realDocument = {
    id: 'res_123',
    title: 'BB Official Parade Rules 2026',
    description: 'Parade regulations uploaded by company officers.',
    category: 'Handbooks & Manuals',
    fileType: 'PDF',
    url: 'https://storage.supabase.com/resources/parade_rules.pdf',
    visibility: 'all',
    fileSize: '1.2 MB',
    updatedAt: '2026-10-25'
  };
  await resourcesModule.saveResources([realDocument]);
  assert.strictEqual(resourcesModule.resources.length, 1, 'Should have 1 resource after saving');
  assert.strictEqual(resourcesModule.resources[0].title, 'BB Official Parade Rules 2026');
  assert.strictEqual(lastPosted.extraHeaders && lastPosted.extraHeaders.Prefer, 'return=representation,resolution=merge-duplicates', 'POST includes resolution=merge-duplicates');
  console.log('  ✔ saveResources successfully stores documents in bb_config with upsert resolution');

  // 6. Role-Based Visibility Checks
  mockRank = 'Recruit';
  mockAdmin = false;
  assert.strictEqual(resourcesModule.hasResourceAccess('all'), true, 'Recruit can access public resources');
  assert.strictEqual(resourcesModule.hasResourceAccess('nco'), false, 'Recruit cannot access NCO resources');
  assert.strictEqual(resourcesModule.hasResourceAccess('officer'), false, 'Recruit cannot access Officer resources');

  mockRank = 'Corporal';
  assert.strictEqual(resourcesModule.hasResourceAccess('nco'), true, 'Corporal can access NCO resources');
  assert.strictEqual(resourcesModule.hasResourceAccess('officer'), false, 'Corporal cannot access Officer resources');

  mockRank = 'Lieutenant';
  assert.strictEqual(resourcesModule.hasResourceAccess('nco'), true, 'Lieutenant can access NCO resources');
  assert.strictEqual(resourcesModule.hasResourceAccess('officer'), true, 'Lieutenant can access Officer resources');

  mockRank = 'Recruit';
  mockAdmin = true;
  assert.strictEqual(resourcesModule.hasResourceAccess('officer'), true, 'Admin can access Officer resources regardless of rank');
  console.log('  ✔ hasResourceAccess correctly enforces Public / NCO / Officer role restrictions');

  // 7. Empty State Verification (Confirm NO "Open Admin Upload Console" button)
  resourcesModule.resources.length = 0;
  mockAdmin = true; // Even if admin is logged in
  resourcesModule.renderResourcesPage();
  const emptyHtml = document.getElementById('resources-list-container').innerHTML;
  assert.strictEqual(emptyHtml.includes('Open Admin Upload Console'), false, 'Empty state must never contain Open Admin Upload Console button');
  console.log('  ✔ renderResourcesPage empty state does NOT contain Open Admin Upload Console button');

  // 8. Delete Resource
  resourcesModule.resources.push(realDocument);
  await resourcesModule.deleteResource('res_123');
  assert.strictEqual(resourcesModule.resources.length, 0, 'Resource should be deleted from active list');
  console.log('  ✔ deleteResource removes resource from list and saves update');

  // 9. Clear All Resources
  await resourcesModule.saveResources([realDocument]);
  assert.strictEqual(resourcesModule.resources.length, 1);
  await resourcesModule.clearAllResources();
  assert.strictEqual(resourcesModule.resources.length, 0, 'clearAllResources should empty the catalog');
  console.log('  ✔ clearAllResources empties the document repository');

  // ── Child Safety (COPPA/PDPA) & Parental Consent Governance Tests (TSK-032) ──
  console.log('\nTesting Child Safety (COPPA/PDPA) & Parental Consent Governance (TSK-032)...');

  const memberModule = require('../js/modules/member.js');

  // 1. isMinorSection classification
  assert.strictEqual(memberModule.isMinorSection('Pre-Junior', 7), true, 'Pre-Junior (age 7) must be identified as minor');
  assert.strictEqual(memberModule.isMinorSection('pre-junior', 6), true, 'Case-insensitive Pre-Junior must be identified as minor');
  assert.strictEqual(memberModule.isMinorSection('Junior', 10), true, 'Junior (age 10) must be identified as minor');
  assert.strictEqual(memberModule.isMinorSection('junior', 11), true, 'Junior (age 11) must be identified as minor');
  assert.strictEqual(memberModule.isMinorSection('Senior', 12), false, 'Senior (age 12) must not be minor');
  assert.strictEqual(memberModule.isMinorSection('Senior', 16), false, 'Senior (age 16) must not be minor');
  assert.strictEqual(memberModule.isMinorSection('Senior', 10), true, 'Any member under 12 must be identified as minor');
  assert.strictEqual(memberModule.isMinorSection('', 15), false, 'Age 15 with empty section is not minor');
  console.log('  ✔ isMinorSection correctly classifies Pre-Junior, Junior, and underage members as minors');

  // 2. handleSectionChange UI toggling
  const mockBox = document.getElementById('parent-consent-box');
  const mockPName = document.getElementById('reg-parent-name');
  const mockPContact = document.getElementById('reg-parent-contact');
  const mockPConsent = document.getElementById('reg-parent-consent');
  const mockSection = document.getElementById('reg-section');
  const mockAge = document.getElementById('reg-age');

  // Simulate selecting Pre-Junior
  mockSection.value = 'Pre-Junior';
  mockAge.value = '7';
  memberModule.handleSectionChange();
  assert.strictEqual(mockBox.style.display, 'block', 'parent-consent-box must be revealed for Pre-Junior');

  // Simulate selecting Senior
  mockSection.value = 'Senior';
  mockAge.value = '15';
  memberModule.handleSectionChange();
  assert.strictEqual(mockBox.style.display, 'none', 'parent-consent-box must be hidden for Senior');
  console.log('  ✔ handleSectionChange dynamically toggles parent-consent-box based on section and age');

  // 3. Parental Consent & Data Minimization Validation during Registration
  let lastAlertMsg = null;
  global.alert = (msg) => { lastAlertMsg = msg; };

  const mockFullname = document.getElementById('reg-fullname');
  const mockEmail = document.getElementById('reg-email');
  const mockRankInp = document.getElementById('reg-rank');
  const mockSquadInp = document.getElementById('reg-squad');
  const mockPass = document.getElementById('reg-pass');
  const mockPass2 = document.getElementById('reg-pass2');
  const mockMediaConsent = document.getElementById('reg-media-consent');

  mockFullname.value = 'Junior Member';
  mockEmail.value = 'junior@test.com';
  mockSection.value = 'Junior';
  mockAge.value = '10';
  mockRankInp.value = 'Recruit';
  mockSquadInp.value = 'Alpha';
  mockPass.value = 'secret123';
  mockPass2.value = 'secret123';

  // Case A: Missing parent name
  mockPName.value = '';
  mockPContact.value = '+6012-3456789';
  mockPConsent.checked = true;
  await memberModule.registerMember();
  assert.ok(lastAlertMsg && lastAlertMsg.includes('Parent or Legal Guardian Name is required'), 'Registration must block if parent name is missing');

  // Case B: Missing parent contact
  mockPName.value = 'Sarah Tan';
  mockPContact.value = '';
  mockPConsent.checked = true;
  await memberModule.registerMember();
  assert.ok(lastAlertMsg && lastAlertMsg.includes('Parent or Legal Guardian Contact'), 'Registration must block if parent contact is missing');

  // Case C: Unchecked parental consent e-signature
  mockPName.value = 'Sarah Tan';
  mockPContact.value = '+6012-3456789';
  mockPConsent.checked = false;
  await memberModule.registerMember();
  assert.ok(lastAlertMsg && lastAlertMsg.includes('Verified Parental or Legal Guardian Consent is strictly required'), 'Registration must block if consent checkbox is unchecked');
  console.log('  ✔ registerMember strictly enforces verifiable parental consent for minor sections');

  // Case D: Valid Pre-Junior / Junior Registration
  mockPConsent.checked = true;
  mockMediaConsent.checked = false; // Privacy-first default
  lastPosted = null;
  let lastUpsertedAudit = null;
  global.supa.upsert = async (path, body, onConflict) => {
    lastUpsertedAudit = { path, body, onConflict };
    return [{ id: 'upsert_1', ...body }];
  };
  global.supa.get = async (path) => {
    if (path.includes('bb_members?ic=')) return []; // No existing user
    if (path.includes('bb_config?key=')) return [];
    return [];
  };

  await memberModule.registerMember();

  assert.ok(lastPosted && lastPosted.body, 'Registration payload must be posted to bb_members');
  const payload = lastPosted.body;
  assert.strictEqual(payload.name, 'Junior Member');
  assert.strictEqual(payload.parent_name, 'Sarah Tan');
  assert.strictEqual(payload.parent_contact, '+6012-3456789');
  assert.strictEqual(payload.parental_consent_signed, true);
  assert.ok(payload.parental_consent_date, 'Consent timestamp must be recorded');
  assert.strictEqual(payload.media_consent, false, 'Media release must be false by default (privacy-first)');

  // Verify strict data minimization: no IC/MyKad/MyKid field exists
  assert.strictEqual(payload.nric, undefined, 'NRIC must never be collected or stored');
  assert.strictEqual(payload.mykad, undefined, 'MyKad must never be collected or stored');
  assert.strictEqual(payload.mykid, undefined, 'MyKid must never be collected or stored');
  assert.strictEqual(payload.address, undefined, 'Home address must never be collected or stored');
  console.log('  ✔ registerMember adheres to strict data minimization (No IC/MyKad/address) and privacy-first default media permission');

  // Verify durable consent audit trail stored in bb_config
  assert.ok(lastUpsertedAudit, 'Consent audit trail must be persisted to bb_config');
  assert.strictEqual(lastUpsertedAudit.path, 'bb_config');
  assert.ok(lastUpsertedAudit.body.key.startsWith('bb_consent_'), 'Audit key must start with bb_consent_');
  const parsedAudit = JSON.parse(lastUpsertedAudit.body.value);
  assert.strictEqual(parsedAudit.parent_name, 'Sarah Tan');
  assert.strictEqual(parsedAudit.governance, 'COPPA/PDPA-2010');
  console.log('  ✔ Verifiable parental consent audit trail persisted durably in bb_config');

  // 4. fetchMemberConsent retrieval
  global.supa.get = async (path) => {
    if (path.includes('bb_config?key=')) {
      return [{ value: JSON.stringify(parsedAudit) }];
    }
    return [];
  };
  const retrievedConsent = await memberModule.fetchMemberConsent('junior@test.com', null);
  assert.ok(retrievedConsent, 'fetchMemberConsent must retrieve consent from bb_config');
  assert.strictEqual(retrievedConsent.parent_name, 'Sarah Tan');
  assert.strictEqual(retrievedConsent.parental_consent_signed, true);
  console.log('  ✔ fetchMemberConsent retrieves consent records across storage fallbacks');

  // 5. Senior Registration without requiring parental consent
  mockFullname.value = 'Senior Member';
  mockEmail.value = 'senior@test.com';
  mockSection.value = 'Senior';
  mockAge.value = '15';
  mockPName.value = '';
  mockPContact.value = '';
  mockPConsent.checked = false;
  lastPosted = null;

  await memberModule.registerMember();
  assert.ok(lastPosted && lastPosted.body, 'Senior member should register without blocking');
  assert.strictEqual(lastPosted.body.parent_name, undefined, 'Senior member does not require parent fields');
  console.log('  ✔ Senior section registration proceeds without parental consent roadblock');

  // 6. Child Safety Policy Modal
  const mockModal = document.getElementById('child-safety-modal');
  memberModule.openChildSafetyModal();
  assert.strictEqual(mockModal.style.display, 'block', 'openChildSafetyModal must reveal policy modal');
  memberModule.closeChildSafetyModal();
  assert.strictEqual(mockModal.style.display, 'none', 'closeChildSafetyModal must hide policy modal');
  console.log('  ✔ openChildSafetyModal and closeChildSafetyModal properly manage modal visibility');

  // 7. updateMemberMediaConsent: Parental Right to Opt-In / Withdraw Media Consent (PDPA 2010)
  mockSession['email'] = 'junior@test.com';
  mockSession['ic'] = 'junior@test.com';
  let patchedMedia = null;
  global.supa.patch = async (path, body) => {
    patchedMedia = { path, body };
    return body;
  };

  // Opt-in to photo release
  await memberModule.updateMemberMediaConsent(true);
  assert.strictEqual(mockSession['media_consent'], true, 'Session media_consent must be true after opt-in');
  assert.ok(patchedMedia && patchedMedia.body.media_consent === true, 'Supabase patch must update media_consent to true');

  // Withdraw photo release (privacy-first opt-out)
  await memberModule.updateMemberMediaConsent(false);
  assert.strictEqual(mockSession['media_consent'], false, 'Session media_consent must be false after withdrawal');
  assert.ok(patchedMedia && patchedMedia.body.media_consent === false, 'Supabase patch must update media_consent to false');
  console.log('  ✔ updateMemberMediaConsent empowers parents to dynamically opt-in or withdraw media release');

  // 8. Migration schema verification (004_child_safety_parental_consent.sql)
  const migrationPath = 'supabase/migrations/004_child_safety_parental_consent.sql';
  assert.ok(fs.existsSync(migrationPath), 'Migration 004 must exist');
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');
  assert.ok(migrationSql.includes('parent_name'), 'Migration must declare parent_name');
  assert.ok(migrationSql.includes('parent_contact'), 'Migration must declare parent_contact');
  assert.ok(migrationSql.includes('parental_consent_signed'), 'Migration must declare parental_consent_signed');
  assert.ok(migrationSql.includes('media_consent'), 'Migration must declare media_consent');
  assert.ok(migrationSql.includes('att_section'), 'Migration must declare att_section');
  console.log('  ✔ Child Safety & Parental Consent database migration schema verified');

  // ── Calendar Module Tests (TSK-CALENDAR) ──
  console.log('Testing Company Calendar & Member Personal Schedule...');
  const calendarModule = require('../js/modules/calendar.js');

  // 1. Verify default 2026 calendar data
  assert.ok(Array.isArray(calendarModule.DEFAULT_2026_CALENDAR), 'DEFAULT_2026_CALENDAR must be an array');
  assert.ok(calendarModule.DEFAULT_2026_CALENDAR.length >= 48, 'Must contain at least 48 parade/event days');
  const sampleEv = calendarModule.DEFAULT_2026_CALENDAR.find(x => x.date === '2026-06-28');
  assert.ok(sampleEv, 'Must contain Enrolment Sunday (2026-06-28)');
  assert.strictEqual(sampleEv.kit, 'Ceremonial', 'Enrolment Sunday must have Ceremonial kit');
  assert.strictEqual(sampleEv.type, 'ceremonial');
  console.log('  ✔ DEFAULT_2026_CALENDAR accurately pre-populated with official dates and kits');

  // 2. Month matrix generation
  const oct2026 = calendarModule.getMonthMatrix(2026, 9); // October (0-indexed: 9)
  assert.ok(oct2026.length === 35 || oct2026.length === 42, 'Month matrix must contain 35 or 42 cells');
  const oct1 = oct2026.find(c => c.dateKey === '2026-10-01');
  assert.ok(oct1 && oct1.isCurrentMonth, 'Oct 1 must be present in current month');
  console.log('  ✔ getMonthMatrix correctly generates calendar grid with overflow days');

  // 3. Load & Save Calendar Events with Supabase
  let loaded = await calendarModule.loadCalendarEvents();
  assert.ok(Array.isArray(loaded) && loaded.length > 0, 'loadCalendarEvents should return events array');
  
  const testNewEvent = {
    id: 'cal-test-1',
    date: '2026-12-12',
    title: 'Test Post-Christmas Gathering',
    type: 'special',
    kit: 'PT Kit',
    time: '2:00 PM – 5:00 PM',
    location: 'Church Hall',
    srDetails: 'Fellowship games',
    jrDetails: 'Party games',
    notes: 'Optional event'
  };
  loaded.push(testNewEvent);
  const saved = await calendarModule.saveCalendarEvents(loaded);
  assert.strictEqual(saved, true, 'saveCalendarEvents should succeed');
  assert.strictEqual(calendarModule.getCompanyEventsForDate('2026-12-12').length, 1);
  console.log('  ✔ loadCalendarEvents and saveCalendarEvents persist company events with Supabase');

  // 4. Personal Member Events & Reminders
  mockSession['email'] = 'member@bbpj1.org';
  const memRem = calendarModule.addPersonalEvent('2026-10-24', 'Submit Target Badge Workbook <script>', '2:00 PM', 'Check page 15-20');
  assert.ok(memRem && memRem.id, 'addPersonalEvent should create reminder');
  assert.strictEqual(memRem.title.includes('<script>'), false, 'addPersonalEvent must sanitize user input');
  const memList = calendarModule.getMemberEventsForDate('2026-10-24');
  assert.strictEqual(memList.length, 1, 'getMemberEventsForDate should return member reminder');
  assert.strictEqual(memList[0].title, 'Submit Target Badge Workbook');

  const delResult = calendarModule.deletePersonalEvent(memRem.id);
  assert.strictEqual(delResult, true, 'deletePersonalEvent should return true');
  assert.strictEqual(calendarModule.getMemberEventsForDate('2026-10-24').length, 0);
  console.log('  ✔ addPersonalEvent and deletePersonalEvent manage member reminders with XSS protection');

  // 5. Next Upcoming Parade
  const nextParade = calendarModule.getNextUpcomingParade('2026-10-01');
  assert.ok(nextParade, 'getNextUpcomingParade should find next scheduled parade');
  assert.strictEqual(nextParade.date, '2026-10-03', 'Next parade from Oct 1 should be Founder Day Oct 3');
  console.log('  ✔ getNextUpcomingParade accurately identifies upcoming parade dates');

  // 6. Widget DOM rendering
  const calWidgetContainer = document.getElementById('company-calendar-widget');
  calendarModule.renderCalendarWidget('company-calendar-widget');
  assert.ok(calWidgetContainer.innerHTML.includes('cal-widget-month-title'), 'renderCalendarWidget must render header');
  assert.ok(calWidgetContainer.innerHTML.includes('cal-days-grid'), 'renderCalendarWidget must render days grid');
  assert.ok(calWidgetContainer.innerHTML.includes('cal-preview-card'), 'renderCalendarWidget must render preview card');
  console.log('  ✔ renderCalendarWidget generates complete interactive calendar widget DOM');

  // ── Quick Access Cards Carousel Tests (TSK-CAROUSEL) ──
  console.log('\nTesting Quick Access Cards Carousel...');
  const fsMod = require('fs');
  const pathMod = require('path');
  const indexHtml = fsMod.readFileSync(pathMod.resolve(__dirname, '../index.html'), 'utf8');
  assert.ok(indexHtml.includes('hq-carousel-wrapper'), 'index.html must contain hq-carousel-wrapper');
  assert.ok(indexHtml.includes('hq-carousel-track'), 'index.html must contain hq-carousel-track');
  assert.ok(indexHtml.includes('cycleQuickCards'), 'index.html must implement cycleQuickCards');
  assert.ok(indexHtml.includes('setQuickCardsPage'), 'index.html must implement setQuickCardsPage');

  // Verify carousel logic
  const carouselScriptMatch = indexHtml.match(/\/\/ ── Quick Access Carousel Controller[\s\S]*?window\.getHqTotalPages = getHqTotalPages;\s*}/);
  assert.ok(carouselScriptMatch, 'Carousel controller script block found in index.html');
  eval(carouselScriptMatch[0]);

  // 1. Desktop mode: 2 cards per page, 2 total pages
  global.window.innerWidth = 1024;
  assert.strictEqual(getHqCardsPerPage(), 2, 'Desktop must display 2 cards per view');
  assert.strictEqual(getHqTotalPages(), 2, 'Desktop must have 2 total pages for 4 cards');

  // 2. Mobile mode: 1 card per page, 4 total pages
  global.window.innerWidth = 480;
  assert.strictEqual(getHqCardsPerPage(), 1, 'Mobile must display 1 card per view');
  assert.strictEqual(getHqTotalPages(), 4, 'Mobile must have 4 total pages for 4 cards');

  // Reset to desktop for navigation tests
  global.window.innerWidth = 1024;
  _hqCurrentPage = 0;

  // Track DOM mock
  const mockTrack = document.getElementById('hq-carousel-track');
  const mockDotsContainer = document.getElementById('hq-carousel-dots');
  const mockDot0 = document.getElementById('hq-dot-0');
  const mockDot1 = document.getElementById('hq-dot-1');

  mockDotsContainer.querySelectorAll = () => [mockDot0, mockDot1];
  mockDot0.classList = { add: () => {}, remove: () => {} };
  mockDot1.classList = { add: () => {}, remove: () => {} };

  // Page 0 initial state
  updateQuickCardsCarousel();
  assert.strictEqual(mockTrack.style.transform, 'translateX(calc(-0% - 0px))', 'Page 0 must translate by 0%');

  // Cycle forward to Page 1
  cycleQuickCards(1);
  assert.strictEqual(_hqCurrentPage, 1, 'cycleQuickCards(1) must advance to page 1');
  assert.strictEqual(mockTrack.style.transform, 'translateX(calc(-100% - 14px))', 'Page 1 must translate by -100% - 14px');

  // Cycle forward from Page 1 should wrap around to Page 0
  cycleQuickCards(1);
  assert.strictEqual(_hqCurrentPage, 0, 'cycleQuickCards(1) from page 1 must wrap around to page 0');
  assert.strictEqual(mockTrack.style.transform, 'translateX(calc(-0% - 0px))', 'Page 0 wrap-around transform');

  // Cycle backward from Page 0 should wrap around to Page 1
  cycleQuickCards(-1);
  assert.strictEqual(_hqCurrentPage, 1, 'cycleQuickCards(-1) from page 0 must wrap around to page 1');
  assert.strictEqual(mockTrack.style.transform, 'translateX(calc(-100% - 14px))');

  // Direct page setter
  setQuickCardsPage(0);
  assert.strictEqual(_hqCurrentPage, 0, 'setQuickCardsPage(0) sets page to 0');
  setQuickCardsPage(1);
  assert.strictEqual(_hqCurrentPage, 1, 'setQuickCardsPage(1) sets page to 1');
  setQuickCardsPage(99); // out of bounds should be ignored
  assert.strictEqual(_hqCurrentPage, 1, 'Out-of-bounds page index must be ignored');

  console.log('  ✔ getHqCardsPerPage and getHqTotalPages accurately calculate responsive page distribution');
  console.log('  ✔ cycleQuickCards smoothly navigates and wraps around card pages');
  console.log('  ✔ setQuickCardsPage bounds checks and directly navigates to valid card tabs');
  console.log('  ✔ updateQuickCardsCarousel applies exact pixel-aligned translateX transform to card track');

  // ── Testing Forms Hub Search Bar ──────────────────────────────────────────
  console.log('Testing Forms Hub Search Bar...');
  const htmlSrc = fs.readFileSync('index.html', 'utf8');
  const filterFormsMatch = htmlSrc.match(/function filterForms\(query\) \{[\s\S]*?\n\}/);
  const clearFormSearchMatch = htmlSrc.match(/function clearFormSearch\(\) \{[\s\S]*?\n\}/);
  assert(filterFormsMatch, 'filterForms function must be defined in index.html');
  assert(clearFormSearchMatch, 'clearFormSearch function must be defined in index.html');

  eval(filterFormsMatch[0]);
  eval(clearFormSearchMatch[0]);

  const mockFormCards = [
    {
      style: { display: 'flex' },
      getAttribute: (attr) => {
        if (attr === 'data-form-name') return 'uniform order';
        if (attr === 'data-form-desc') return 'order bb uniform items';
        if (attr === 'data-form-type') return 'uniform';
        return null;
      }
    },
    {
      style: { display: 'flex' },
      getAttribute: (attr) => {
        if (attr === 'data-form-name') return 'leave form';
        if (attr === 'data-form-desc') return '';
        if (attr === 'data-form-type') return 'builtin';
        return null;
      }
    },
    {
      style: { display: 'flex' },
      getAttribute: (attr) => {
        if (attr === 'data-form-name') return 'test form';
        if (attr === 'data-form-desc') return 'this is a test form';
        if (attr === 'data-form-type') return 'builtin';
        return null;
      }
    }
  ];

  const mockFormsList = document.getElementById('forms-list');
  mockFormsList.querySelectorAll = (sel) => {
    if (sel === '.form-card-hub') return mockFormCards;
    return [];
  };

  const mockSearchInput = document.getElementById('form-search-input');
  const mockClearBtn = document.getElementById('form-search-clear');
  const mockStatusEl = document.getElementById('forms-search-status');
  const mockCountEl = document.getElementById('forms-search-count');
  const mockNoResEl = document.getElementById('forms-no-results');
  const mockNoResTitle = document.getElementById('forms-no-results-title');

  // Test 1: Empty search query shows all forms
  filterForms('');
  assert.strictEqual(mockFormCards[0].style.display, 'flex');
  assert.strictEqual(mockFormCards[1].style.display, 'flex');
  assert.strictEqual(mockFormCards[2].style.display, 'flex');
  assert.strictEqual(mockClearBtn.style.display, 'none');
  assert.strictEqual(mockNoResEl.style.display, 'none');
  console.log('  ✔ Empty query displays all active forms with clear button hidden');

  // Test 2: Search by form title ('Leave')
  filterForms('Leave');
  assert.strictEqual(mockFormCards[0].style.display, 'none');
  assert.strictEqual(mockFormCards[1].style.display, 'flex');
  assert.strictEqual(mockFormCards[2].style.display, 'none');
  assert.strictEqual(mockClearBtn.style.display, 'flex');
  assert.strictEqual(mockStatusEl.style.display, 'flex');
  assert.strictEqual(mockCountEl.textContent, 'Showing 1 of 3 forms');
  console.log('  ✔ Search query filters by form title accurately');

  // Test 3: Search by description keyword ('items')
  filterForms('items');
  assert.strictEqual(mockFormCards[0].style.display, 'flex');
  assert.strictEqual(mockFormCards[1].style.display, 'none');
  assert.strictEqual(mockFormCards[2].style.display, 'none');
  console.log('  ✔ Search query filters by form description accurately');

  // Test 4: Search query matching 0 forms shows empty state
  filterForms('nonexistentform');
  assert.strictEqual(mockFormCards[0].style.display, 'none');
  assert.strictEqual(mockFormCards[1].style.display, 'none');
  assert.strictEqual(mockFormCards[2].style.display, 'none');
  assert.strictEqual(mockNoResEl.style.display, 'block');
  assert.strictEqual(mockNoResTitle.textContent, 'No forms match "nonexistentform"');
  console.log('  ✔ Zero match query properly displays empty state feedback');

  // Test 5: clearFormSearch resets input and displays all forms
  mockSearchInput.value = 'nonexistentform';
  clearFormSearch();
  assert.strictEqual(mockSearchInput.value, '');
  assert.strictEqual(mockFormCards[0].style.display, 'flex');
  assert.strictEqual(mockFormCards[1].style.display, 'flex');
  assert.strictEqual(mockFormCards[2].style.display, 'flex');
  assert.strictEqual(mockNoResEl.style.display, 'none');
  console.log('  ✔ clearFormSearch resets search input, clears state, and restores all forms');

  // ── Testing Developer Tooling & Linting (TSK-015) ──────────────────────────
  console.log('\nTesting Developer Tooling & Linting (TSK-015)...');
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  assert(pkg.scripts, 'package.json must contain scripts');
  assert(pkg.scripts.dev, 'package.json must contain dev script');
  assert(pkg.scripts['serve:static'], 'package.json must contain serve:static script');
  assert(pkg.scripts.lint, 'package.json must contain lint script');
  assert(pkg.scripts.format, 'package.json must contain format script');
  assert(pkg.devDependencies, 'package.json must contain devDependencies');
  assert(pkg.devDependencies.eslint, 'package.json must contain eslint devDependency');
  assert(pkg.devDependencies.prettier, 'package.json must contain prettier devDependency');
  assert(pkg.devDependencies.vite, 'package.json must contain vite devDependency');
  console.log('  ✔ package.json properly configured with dev, lint, format, test, and devDependencies');

  assert(fs.existsSync('.gitignore'), '.gitignore file must exist');
  const gitignore = fs.readFileSync('.gitignore', 'utf8');
  assert(gitignore.includes('node_modules/'), '.gitignore must ignore node_modules/');
  assert(gitignore.includes('dist/'), '.gitignore must ignore dist/');
  assert(gitignore.includes('.vite/'), '.gitignore must ignore .vite/');
  console.log('  ✔ .gitignore properly protects repo from node_modules, build outputs, and caches');

  assert(fs.existsSync('.prettierrc.json'), '.prettierrc.json configuration must exist');
  assert(fs.existsSync('.prettierignore'), '.prettierignore must exist');
  const prettierrc = JSON.parse(fs.readFileSync('.prettierrc.json', 'utf8'));
  assert.strictEqual(prettierrc.semi, true, 'Prettier semi rule must be true');
  assert.strictEqual(prettierrc.singleQuote, true, 'Prettier singleQuote rule must be true');
  console.log('  ✔ Prettier configuration and ignore rules verified');

  assert(fs.existsSync('eslint.config.mjs'), 'eslint.config.mjs configuration must exist');
  console.log('  ✔ ESLint flat config verified');
  const { execSync } = require('child_process');
  const lintOutput = execSync('npx eslint js/ scripts/', { encoding: 'utf8' });
  assert.strictEqual(lintOutput.trim(), '', 'ESLint must pass with 0 errors and 0 warnings');
  console.log('  ✔ ESLint verified: 0 errors and 0 warnings across all js/ and scripts/');

  assert(fs.existsSync('vite.config.mjs'), 'vite.config.mjs must exist');
  assert(fs.existsSync('scripts/dev-server.js'), 'scripts/dev-server.js must exist');
  console.log('  ✔ Vite and static development server entry points verified');

  console.log('\n🎉 ALL MODULE UNIT & INTEGRATION TESTS PASSED 100%!\n');
})().catch(err => {
  console.error('\n✖ Test failed:', err);
  process.exit(1);
});
