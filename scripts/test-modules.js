/**
 * Automated Unit & Integration Tests for Core Security Firewall, Announcements, Gallery, and Resources Modules
 */
const assert = require('assert');

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
        setAttribute: (k, v) => {},
        removeAttribute: (k) => {},
        getAttribute: (k) => null,
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

// Mock Session & UI
let mockUser = 'test@bbpj1.org';
let mockRank = 'Recruit';
let mockAdmin = false;
global.sessionGet = (k) => {
  if (k === 'rank') return mockRank;
  if (k === 'adminAuthed') return mockAdmin;
  return mockUser;
};
global.showToast = (msg, type) => {};
global.showConfirmModal = async (msg, title) => true;
global.isNCO = (rank) => ['Lance Corporal', 'Corporal', 'Sergeant', 'Staff Sergeant'].indexOf(rank) !== -1;

// Mock Supabase
let lastPatched = null;
let lastPosted = null;
let lastDeleted = null;

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
  patch: async (path, body) => {
    lastPatched = { path, body };
    return body;
  },
  delete: async (path) => {
    lastDeleted = path;
    return true;
  },
  uploadFile: async (bucket, fname, blob) => {
    return { Key: bucket + '/' + fname };
  },
  fileUrl: (bucket, fname) => {
    return 'https://example.com/storage/' + bucket + '/' + fname;
  },
  deleteFile: async (bucket, fname) => {
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

  console.log('\n🎉 ALL MODULE UNIT & INTEGRATION TESTS PASSED 100%!\n');
})().catch(err => {
  console.error('\n✖ Test failed:', err);
  process.exit(1);
});
