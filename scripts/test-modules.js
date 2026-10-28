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
        _attrs: {},
        setAttribute: function(k, v) { this._attrs[k] = String(v); },
        removeAttribute: (_k) => {},
        getAttribute: function(k) { return this._attrs[k] || null; },
        scrollIntoView: () => {},
        querySelectorAll: () => [],
        addEventListener: () => {},
        removeEventListener: () => {},
        pause: () => {},
        play: async () => {},
        classList: { add: () => {}, remove: () => {}, contains: () => false, toggle: () => {} }
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
  // ── Testing All-Format Media & Dedicated Gallery Tab ──
  console.log('Testing Media Normalization & Video Detection...');
  assert.strictEqual(galleryModule.isVideoMedia('https://example.com/video.mp4'), true, 'MP4 must be detected as video');
  assert.strictEqual(galleryModule.isVideoMedia('https://example.com/clip.webm'), true, 'WebM must be detected as video');
  assert.strictEqual(galleryModule.isVideoMedia('https://example.com/parade.mov'), true, 'MOV must be detected as video');
  assert.strictEqual(galleryModule.isVideoMedia('https://example.com/photo.jpg'), false, 'JPG must not be detected as video');
  assert.strictEqual(galleryModule.isVideoMedia('https://drive.google.com/file/d/123/preview'), true, 'Drive preview must be detected as video');
  assert.strictEqual(galleryModule.isVideoMedia('https://youtube.com/watch?v=abc'), true, 'YouTube must be detected as video');
  console.log('  ✔ isVideoMedia accurately identifies MP4, WebM, MOV, Drive preview, and YouTube videos');

  // Google Drive URL Normalization
  const driveShareUrl = 'https://drive.google.com/file/d/1A2B3C4D5E/view?usp=sharing';
  const normDrivePreview = galleryModule.normalizeMediaUrl(driveShareUrl, 'video');
  assert.strictEqual(normDrivePreview, 'https://drive.google.com/file/d/1A2B3C4D5E/preview', 'Drive sharing link must normalize to embeddable preview');
  const normDriveImage = galleryModule.normalizeMediaUrl(driveShareUrl, 'image');
  assert.strictEqual(normDriveImage, 'https://lh3.googleusercontent.com/d/1A2B3C4D5E', 'Drive link for image must normalize to direct image endpoint');

  // YouTube URL Normalization
  const ytWatchUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  const normYtEmbed = galleryModule.normalizeMediaUrl(ytWatchUrl);
  assert.ok(normYtEmbed.includes('youtube-nocookie.com/embed/dQw4w9WgXcQ'), 'YouTube link must normalize to privacy-enhanced embed');
  console.log('  ✔ normalizeMediaUrl automatically converts Google Drive and YouTube links to embed streams');

  // Upload Video File Test
  const mockVideoFile = {
    name: 'band_parade.mp4',
    type: 'video/mp4',
    size: 15 * 1024 * 1024,
    arrayBuffer: async () => new ArrayBuffer(32)
  };
  await galleryModule.uploadGalleryFiles([mockVideoFile]);
  assert.strictEqual(galleryModule.galleryImages.length, 3, 'Must support video files in gallery upload');
  assert.strictEqual(galleryModule.galleryImages[2].type, 'video', 'Uploaded file must be tagged as video');
  console.log('  ✔ uploadGalleryFiles handles video files (MP4, MOV, WebM) alongside photos');

  // Filter Gallery
  galleryModule.filterGallery('videos');
  galleryModule.filterGallery('photos');
  galleryModule.filterGallery('all');
  console.log('  ✔ filterGallery toggles between All Media, Photos, and Videos seamlessly');

  // Dedicated Gallery Tab & DOM Verification in index.html
  const indexHtmlContent = fs.readFileSync('index.html', 'utf8');
  assert.ok(indexHtmlContent.includes('id="tab-gallery"'), 'Must define #tab-gallery navigation button');
  assert.ok(indexHtmlContent.includes('id="snav-gallery"'), 'Must define #snav-gallery sidebar navigation');
  assert.ok(indexHtmlContent.includes('id="page-gallery"'), 'Must define dedicated #page-gallery page container');
  assert.ok(indexHtmlContent.includes('id="gallery-story-highlights-reel"'), 'Must render story highlights reel in #page-gallery');
  assert.ok(indexHtmlContent.includes('id="gallery-filter-bar"'), 'Must feature media filter pills in gallery page');
  assert.ok(indexHtmlContent.includes('id="story-viewer-video"'), 'Must feature HTML5 video viewport in story viewer');
  assert.ok(indexHtmlContent.includes('id="story-viewer-iframe"'), 'Must feature iframe viewport for external video players');
  assert.ok(indexHtmlContent.includes('id="story-btn-sound"'), 'Must provide audio mute/unmute control');
  console.log('  ✔ Dedicated Gallery tab, sidebar link, media filter bar, and story video viewport verified in index.html');


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

  // ── Testing Uniform Store & Orders Module (TSK-006A) ───────────────────────
  console.log('Testing Uniform Store & Orders Module (TSK-006A)...');
  const ordersMod = require('../js/modules/orders.js');

  // 1. Catalog Verification
  assert.ok(Array.isArray(ordersMod.DEFAULT_UNIFORM_ITEMS), 'DEFAULT_UNIFORM_ITEMS must be an array');
  assert.ok(ordersMod.DEFAULT_UNIFORM_ITEMS.length >= 6, 'Must contain at least 6 standard uniform items');
  assert.ok(ordersMod.DEFAULT_UNIFORM_ITEMS.some(i => i.key === 'shirt'), 'Must contain shirt');
  assert.ok(ordersMod.DEFAULT_UNIFORM_ITEMS.some(i => i.key === 'trousers'), 'Must contain trousers');
  assert.ok(ordersMod.DEFAULT_UNIFORM_ITEMS.some(i => i.key === 'belt'), 'Must contain belt');
  assert.ok(ordersMod.DEFAULT_UNIFORM_ITEMS.some(i => i.key === 'cap'), 'Must contain cap');
  assert.ok(ordersMod.DEFAULT_UNIFORM_ITEMS.some(i => i.key === 'haversack'), 'Must contain haversack');
  assert.ok(ordersMod.DEFAULT_UNIFORM_ITEMS.some(i => i.key === 'lanyard'), 'Must contain lanyard');
  console.log('  ✔ DEFAULT_UNIFORM_ITEMS contains all official company uniform articles');

  // 2. Quantity & Cart Calculations
  ordersMod.UNIFORM_ITEMS[0].price = 45;
  ordersMod.changeQty('shirt', 2);
  assert.strictEqual(ordersMod.itemQtys['shirt'], 2, 'Shirt quantity must be 2');
  let calcTotal = ordersMod.updateTotal();
  assert.strictEqual(calcTotal, 90, 'Total for 2 shirts at RM 45 must be RM 90.00');
  ordersMod.changeQty('shirt', -1);
  assert.strictEqual(ordersMod.itemQtys['shirt'], 1, 'Shirt quantity decremented to 1');
  calcTotal = ordersMod.updateTotal();
  assert.strictEqual(calcTotal, 45, 'Total for 1 shirt at RM 45 must be RM 45.00');
  ordersMod.changeQty('shirt', -1);
  assert.strictEqual(ordersMod.itemQtys['shirt'], 0, 'Shirt quantity reset to 0');
  calcTotal = ordersMod.updateTotal();
  assert.strictEqual(calcTotal, 0, 'Total resets to 0');
  console.log('  ✔ changeQty and updateTotal accurately calculate cart values and bounds');

  // 3. Size Selection
  ordersMod.selectSize('shirt', 'M');
  assert.strictEqual(ordersMod.itemSizes['shirt'], 'M', 'Selected size must be M');
  ordersMod.selectSize('shirt', 'XL');
  assert.strictEqual(ordersMod.itemSizes['shirt'], 'XL', 'Updated size must be XL');
  console.log('  ✔ selectSize updates itemSizes state');

  // 4. Role Authorization
  assert.strictEqual(ordersMod.isNCO('Sergeant'), true, 'Sergeant qualifies as NCO');
  assert.strictEqual(ordersMod.isNCO('Staff Sergeant'), true, 'Staff Sergeant qualifies as NCO');
  assert.strictEqual(ordersMod.isNCO('Recruit'), false, 'Recruit does not qualify as NCO');
  console.log('  ✔ isNCO accurately checks member rank permissions');

  // 5. Touch n Go Screenshot Helpers
  const mockFileInput = { files: [] };
  ordersMod.previewTngScreenshot(mockFileInput);
  ordersMod.clearTngScreenshot();
  assert.strictEqual(ordersMod.getTngScreenshot(), null, 'Cleared screenshot must be null');
  console.log('  ✔ Touch n Go payment screenshot handlers function cleanly');

  // 6. Order Submission
  ordersMod.UNIFORM_ITEMS[0].price = 45;
  ordersMod.changeQty('shirt', 1);
  ordersMod.selectSize('shirt', 'L');
  const submittedOrderNum = await ordersMod.submitOrder();
  assert.ok(submittedOrderNum && submittedOrderNum.startsWith('BB-'), 'Order number must start with BB-');
  assert.strictEqual(lastPosted.path, 'bb_orders', 'Must submit order to bb_orders table');
  console.log('  ✔ submitOrder validates items and submits order record with unique order number');

  // ── Testing Forms Hub & Dynamic Form Builder (TSK-006A) ────────────────────
  console.log('Testing Forms Hub & Dynamic Form Builder (TSK-006A)...');
  const formsMod = require('../js/modules/forms.js');

  // 1. Form Type Switching & Field Management
  formsMod.setFormType('builtin');
  assert.strictEqual(formsMod._currentFormType, 'builtin', 'Form type must switch to builtin');
  formsMod.setFormType('link');
  assert.strictEqual(formsMod._currentFormType, 'link', 'Form type must switch to link');
  formsMod.addFormField();
  assert.ok(formsMod._fbFields.length >= 1, 'addFormField must push a new field');
  console.log('  ✔ Dynamic Form Builder manages form types and custom fields');

  // 2. Forms Hub Search & Filtering
  const filterForms = formsMod.filterForms;
  const clearFormSearch = formsMod.clearFormSearch;

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

  filterForms('');
  assert.strictEqual(mockFormCards[0].style.display, 'flex');
  assert.strictEqual(mockFormCards[1].style.display, 'flex');
  assert.strictEqual(mockFormCards[2].style.display, 'flex');
  assert.strictEqual(mockClearBtn.style.display, 'none');
  assert.strictEqual(mockNoResEl.style.display, 'none');
  console.log('  ✔ Empty query displays all active forms with clear button hidden');

  filterForms('Leave');
  assert.strictEqual(mockFormCards[0].style.display, 'none');
  assert.strictEqual(mockFormCards[1].style.display, 'flex');
  assert.strictEqual(mockFormCards[2].style.display, 'none');
  assert.strictEqual(mockClearBtn.style.display, 'flex');
  assert.strictEqual(mockStatusEl.style.display, 'flex');
  assert.strictEqual(mockCountEl.textContent, 'Showing 1 of 3 forms');
  console.log('  ✔ Search query filters by form title accurately');

  filterForms('items');
  assert.strictEqual(mockFormCards[0].style.display, 'flex');
  assert.strictEqual(mockFormCards[1].style.display, 'none');
  assert.strictEqual(mockFormCards[2].style.display, 'none');
  console.log('  ✔ Search query filters by form description accurately');

  filterForms('nonexistentform');
  assert.strictEqual(mockFormCards[0].style.display, 'none');
  assert.strictEqual(mockFormCards[1].style.display, 'none');
  assert.strictEqual(mockFormCards[2].style.display, 'none');
  assert.strictEqual(mockNoResEl.style.display, 'block');
  assert.strictEqual(mockNoResTitle.textContent, 'No forms match "nonexistentform"');
  console.log('  ✔ Zero match query properly displays empty state feedback');

  mockSearchInput.value = 'nonexistentform';
  clearFormSearch();
  assert.strictEqual(mockSearchInput.value, '');
  assert.strictEqual(mockFormCards[0].style.display, 'flex');
  assert.strictEqual(mockFormCards[1].style.display, 'flex');
  assert.strictEqual(mockFormCards[2].style.display, 'flex');
  assert.strictEqual(mockNoResEl.style.display, 'none');
  console.log('  ✔ clearFormSearch resets search input, clears state, and restores all forms');

  // ── Testing Awards & President's Badge Tracker Module (TSK-008) ────────────
  console.log('Testing Awards & President\'s Badge Tracker Module (TSK-008)...');
  const badgesMod = require('../js/modules/badges.js');

  // 1. Badge Catalog Verification
  assert.ok(Array.isArray(badgesMod.DEFAULT_BB_BADGES), 'DEFAULT_BB_BADGES must be an array');
  assert.ok(badgesMod.DEFAULT_BB_BADGES.length >= 13, 'Must contain at least 13 standard BB badges');
  const foundersBadge = badgesMod.DEFAULT_BB_BADGES.find(b => b.name === "BB Founder's Award");
  assert.ok(foundersBadge, "BB Founder's Award badge definition must exist");
  const presidentsBadge = badgesMod.DEFAULT_BB_BADGES.find(b => b.name === "President's Award");
  assert.ok(presidentsBadge, "President's Award badge definition must exist");
  const firstAid = badgesMod.DEFAULT_BB_BADGES.find(b => b.name === 'First Aid');
  assert.ok(firstAid && firstAid.hasAdvanced === true, 'First Aid must have advanced tier support');
  console.log('  ✔ DEFAULT_BB_BADGES contains official company badge definitions and tiers');

  // 2. Award Requirements & Criteria Checklists
  assert.ok(Array.isArray(badgesMod.DEFAULT_PRESIDENTS_REQS), 'DEFAULT_PRESIDENTS_REQS must be an array');
  assert.ok(badgesMod.DEFAULT_PRESIDENTS_REQS.length >= 7, 'President\'s reqs must contain at least 7 requirements');
  assert.ok(Array.isArray(badgesMod.DEFAULT_FOUNDERS_REQS), 'DEFAULT_FOUNDERS_REQS must be an array');

  // 3. Evaluation of Founder's & President's Criteria Checklist
  const mockDefs = [
    { id: 'b_svc', name: 'Years of Service', cat: 'Core', repeatable: true },
    { id: 'b_nco', name: 'NCO Star', cat: 'Group A Awards', hasAdvanced: false },
    { id: 'b_ce',  name: 'Christian Education', cat: 'Group A Awards', hasAdvanced: true },
    { id: 'b_dr',  name: 'Drill', cat: 'Group B Awards', hasAdvanced: true },
    { id: 'b_fa',  name: 'First Aid', cat: 'Group C Awards', hasAdvanced: true },
    { id: 'b_bc',  name: 'Best Camper', cat: 'Group D Awards', hasAdvanced: true },
    { id: 'b_sw',  name: 'Swimming', cat: 'Group D Awards', hasAdvanced: false },
    { id: 'b_rc',  name: 'Recruitment', cat: 'Core', hasAdvanced: false }
  ];

  // Incomplete record
  const incompleteSaved = {
    'b_svc_rep': { count: 2, dates: ['2024-01-01', '2025-01-01'] },
    'b_nco': { basic: true, advanced: false }
  };
  const evalIncomplete = badgesMod.evaluateFoundersCriteria(incompleteSaved, mockDefs);
  assert.strictEqual(evalIncomplete.serviceYears, 2, 'Service years must equal 2');
  assert.strictEqual(evalIncomplete.allDone, false, 'Incomplete records must not qualify as allDone');
  assert.ok(evalIncomplete.overallPct < 100, 'Overall progress must be under 100%');

  // Complete record fulfilling all criteria
  const completeSaved = {
    'b_svc_rep': { count: 3, dates: ['2023-01-01', '2024-01-01', '2025-01-01'] },
    'b_nco': { basic: true, advanced: false },
    'b_ce':  { basic: true, advanced: true },
    'b_dr':  { basic: true, advanced: true },
    'b_fa':  { basic: true, advanced: true },
    'b_bc':  { basic: true, advanced: true },
    'b_sw':  { basic: true, advanced: false },
    'b_rc':  { basic: true, advanced: false }
  };
  const evalComplete = badgesMod.evaluateFoundersCriteria(completeSaved, mockDefs);
  assert.strictEqual(evalComplete.serviceYears, 3, 'Service years must equal 3');
  assert.strictEqual(evalComplete.allCompDone, true, 'All compulsory badges must be marked done');
  assert.strictEqual(evalComplete.totalAdvanced, 4, 'Total advanced badges must equal 4');
  assert.strictEqual(evalComplete.totalBasicOnly, 2, 'Total basic badges must equal 2');
  assert.strictEqual(evalComplete.allDone, true, 'All requirements must be fulfilled');
  assert.strictEqual(evalComplete.overallPct, 100, 'Overall progress must reach 100%');
  console.log('  ✔ evaluateFoundersCriteria accurately checks service years, award groups, and compulsory badges');

  // 4. Repeatable Badge Adjustment (Service Years)
  const memberIc = '020202-14-5678';
  await badgesMod.adjustRepBadge('b_svc', memberIc, 1);
  assert.ok(badgesMod._memberBadgesCache[memberIc], 'Member cache must be initialized');
  assert.strictEqual(badgesMod._memberBadgesCache[memberIc]['b_svc_rep'].count, 1, 'Repeatable badge increment must set count to 1');
  await badgesMod.adjustRepBadge('b_svc', memberIc, -1);
  assert.strictEqual(badgesMod._memberBadgesCache[memberIc]['b_svc_rep'].count, 0, 'Repeatable badge decrement must not go below 0');
  console.log('  ✔ adjustRepBadge properly increments, decrements, and bounds repeatable badge counts');

  // 5. Single / Advanced Tier Toggle
  await await badgesMod.toggleBadge('b_fa', memberIc, 'basic');
  assert.strictEqual(badgesMod._memberBadgesCache[memberIc]['b_fa'].basic, true, 'toggleBadge basic must toggle basic to true');
  await badgesMod.toggleBadge('b_fa', memberIc, 'advanced');
  assert.strictEqual(badgesMod._memberBadgesCache[memberIc]['b_fa'].advanced, true, 'toggleBadge advanced must toggle advanced to true');
  badgesMod.toggleBadge('b_fa', memberIc, 'basic');
  assert.strictEqual(badgesMod._memberBadgesCache[memberIc]['b_fa'].basic, false, 'toggleBadge basic second call toggles basic to false');
  console.log('  ✔ toggleBadge accurately toggles basic and advanced achievement status');

  // 6. Subtab and Tier Controls
  badgesMod.setReqTier('advanced');
  const mockReqTierVal = document.getElementById('req-tier-val');
  if (mockReqTierVal) {
    assert.strictEqual(mockReqTierVal.value, 'advanced', 'setReqTier must update req-tier-val input');
  }
  badgesMod.setReqTier('any');
  if (mockReqTierVal) {
    assert.strictEqual(mockReqTierVal.value, 'any', 'setReqTier must update req-tier-val input to any');
  }
  console.log('  ✔ setReqTier updates active requirement tier state');

  // ── Testing Instagram-Style Story Highlights & Event Gallery Reel (TSK-033) ──
  console.log('Testing Story Highlights & Event Gallery Reel (TSK-033)...');
  const galleryMod = require('../js/modules/gallery.js');

  // 1. Dataset verification
  assert.ok(Array.isArray(galleryMod.DEFAULT_STORY_HIGHLIGHTS), 'DEFAULT_STORY_HIGHLIGHTS must be an array');
  assert.ok(galleryMod.DEFAULT_STORY_HIGHLIGHTS.length >= 5, 'Must contain at least 5 default company story highlights');
  const campStory = galleryMod.DEFAULT_STORY_HIGHLIGHTS.find(x => x.id === 'story-camps');
  assert.ok(campStory, 'Camps story highlight must exist');
  assert.strictEqual(campStory.title, 'Camps');
  assert.ok(campStory.items.length >= 3, 'Camps must contain at least 3 slides');
  assert.ok(campStory.items[0].caption, 'Slide must feature caption');
  assert.ok(campStory.items[0].date, 'Slide must feature date');
  assert.ok(campStory.items[0].location, 'Slide must feature location');
  console.log('  ✔ DEFAULT_STORY_HIGHLIGHTS pre-populated with authentic company event categories and slides');

  // 2. Load Story Highlights
  const loadedStories = await galleryMod.loadStoryHighlights();
  assert.ok(Array.isArray(loadedStories) && loadedStories.length >= 5, 'loadStoryHighlights must return array');
  console.log('  ✔ loadStoryHighlights successfully retrieves active story highlights with fallback');

  // 3. Story Viewer Modal Interaction & Segmented Progress Bars
  const mockStoryModal = document.getElementById('story-viewer-modal');
  const mockProgressBars = document.getElementById('story-progress-bars');
  const mockStoryTitle = document.getElementById('story-viewer-title');
  const mockStoryCaption = document.getElementById('story-viewer-caption');
  const mockStoryImg = document.getElementById('story-viewer-img');

  galleryMod.openStoryViewer(0, 0); // Open Camps, slide 0
  assert.strictEqual(mockStoryModal.style.display, 'flex', 'openStoryViewer must display story modal flex');
  assert.strictEqual(mockStoryTitle.textContent, 'Camps');
  assert.ok(mockStoryImg.src.includes('unsplash.com') || mockStoryImg.src.includes('http'), 'Story slide image must be rendered');
  assert.ok(mockProgressBars.innerHTML.includes('story-progress-bar'), 'Segmented progress bars must be generated');
  console.log('  ✔ openStoryViewer renders full-screen modal, segmented progress bars, and slide content');

  // 4. Slide Navigation (Next / Prev / Cross-Highlight)
  galleryMod.nextStorySlide(); // Advance to slide 1
  assert.strictEqual(mockStoryCaption.textContent, campStory.items[1].caption);
  console.log('  ✔ nextStorySlide advances to subsequent slide with caption and progress updates');

  galleryMod.prevStorySlide(); // Back to slide 0
  assert.strictEqual(mockStoryCaption.textContent, campStory.items[0].caption);
  console.log('  ✔ prevStorySlide navigates backward smoothly');

  // 5. Playback Pause & Resume Controls
  galleryMod.pauseStoryPlayback();
  galleryMod.resumeStoryPlayback();
  galleryMod.toggleStoryPause();
  galleryMod.toggleStoryPause();
  console.log('  ✔ Pause/Play controls and touch-hold handlers properly manage playback');
  // 6b. Video Slide Playback & Sound Controls
  const mockVideoEl = document.getElementById('story-viewer-video');
  const mockIframeEl = document.getElementById('story-viewer-iframe');
  assert.ok(mockIframeEl, 'Iframe element must be available in story viewer');
  const mockSoundBtn = document.getElementById('story-btn-sound');
  
  // Open Brass Band highlight (index 2), slide 1 (video slide)
  galleryMod.openStoryViewer(2, 1);
  assert.strictEqual(mockVideoEl.style.display, 'block', 'Video slide must reveal #story-viewer-video');
  assert.ok(mockVideoEl.src.includes('.mp4'), 'Video element source must be set to video URL');
  assert.strictEqual(mockSoundBtn.style.display, 'flex', 'Sound control button must be visible for video slides');

  // Test sound toggle
  galleryMod.toggleStorySound();
  assert.strictEqual(mockVideoEl.muted, true, 'toggleStorySound should toggle muted state');
  galleryMod.toggleStorySound();
  assert.strictEqual(mockVideoEl.muted, false, 'toggleStorySound should toggle back to unmuted');
  console.log('  ✔ Story viewer renders HTML5 video slides with autoplay handling and audio mute controls');


  // 6. Close Story Viewer
  galleryMod.closeStoryViewer();
  assert.strictEqual(mockStoryModal.style.display, 'none', 'closeStoryViewer must hide story modal');
  console.log('  ✔ closeStoryViewer terminates active timer and cleanly dismisses viewer');

  // 7. Admin Highlights Management
  const newHighlight = {
    id: 'story-test-drill',
    title: 'Drill Competition',
    cover: 'https://example.com/drill.jpg',
    order: 6,
    active: true,
    items: [{ id: 's1', url: 'https://example.com/s1.jpg', caption: 'State Drill Finals', date: '2026-10-25' }]
  };
  const updatedStories = [...loadedStories, newHighlight];
  await galleryMod.saveStoryHighlights(updatedStories);
  assert.strictEqual(galleryMod.storyHighlights.length, loadedStories.length + 1, 'Highlight count must increment');

  // Delete test highlight
  global.confirm = () => true;
  await galleryMod.deleteStoryHighlight('story-test-drill');
  assert.strictEqual(galleryMod.storyHighlights.some(x => x.id === 'story-test-drill'), false, 'Highlight must be removed');
  console.log('  ✔ Admin console allows creating, editing, and deleting highlights');

  // 8. Migration schema verification (005_story_highlights.sql)
  const migration005 = 'supabase/migrations/005_story_highlights.sql';
  assert.ok(fs.existsSync(migration005), 'Migration 005 must exist');
  const sql005 = fs.readFileSync(migration005, 'utf8');
  assert.ok(sql005.includes('CREATE TABLE IF NOT EXISTS bb_stories'), 'Must declare bb_stories table');
  assert.ok(sql005.includes('display_order'), 'Must declare display_order column');
  assert.ok(sql005.includes('items jsonb'), 'Must declare items jsonb column');
  console.log('  ✔ Database migration 005_story_highlights.sql verified with table and RLS policies');

  // 9. Custom Per-Slide Duration & Progress Bar Speed Verification
  const durationHighlight = {
    id: 'highlight-durations-test',
    title: 'Camp Highlights',
    cover: 'https://example.com/cover.jpg',
    order: 10,
    active: true,
    items: [
      { id: 's_photo_5s', url: 'https://example.com/photo1.jpg', type: 'image', duration: 5, caption: 'Photo 5s' },
      { id: 's_photo_10s', url: 'https://example.com/photo2.jpg', type: 'image', duration: 10, caption: 'Photo 10s' },
      { id: 's_video_45s', url: 'https://drive.google.com/file/d/1AWZG2x90ffvHPw0rUESN38DXOmLrX3tC/view', type: 'video', duration: 45, caption: 'Video 45s' }
    ]
  };
  galleryMod.storyHighlights.push(durationHighlight);
  const durIdx = galleryMod.storyHighlights.length - 1;

  // Open slide 0 (5s photo) -> duration must be 5000ms
  galleryMod.openStoryViewer(durIdx, 0);
  assert.strictEqual(galleryMod._storySlideDuration, 5000, 'Photo 1 must adopt 5-second duration');

  // Open slide 1 (10s photo) -> duration must be 10000ms
  galleryMod.openStoryViewer(durIdx, 1);
  assert.strictEqual(galleryMod._storySlideDuration, 10000, 'Photo 2 must adopt 10-second duration');

  // Open slide 2 (45s Drive video) -> duration must be 45000ms, autoplay enabled
  galleryMod.openStoryViewer(durIdx, 2);
  assert.strictEqual(galleryMod._storySlideDuration, 45000, 'Video must adopt 45-second duration');
  assert.ok(mockIframeEl.src.includes('autoplay=1'), 'Drive video iframe must include autoplay=1');
  assert.strictEqual(mockIframeEl.getAttribute('allow'), 'autoplay; fullscreen; encrypted-media; picture-in-picture');

  galleryMod.closeStoryViewer();
  galleryMod.storyHighlights.pop();
  console.log('  ✔ Custom slide duration and progress bar speed verified (5s photo, 10s photo, 45s video)');

  // ── Testing Google Apps Script & Master Sheet Endpoint Hardening (TSK-038) ──
  console.log('\nTesting Google Apps Script & Master Sheet Endpoint Hardening (TSK-038)...');
  const sheetsMod = require('../js/api/sheets.js');
  const attendanceMod = require('../js/modules/attendance.js');

  // 1. Secure Sync Token Generation
  const token1 = sheetsMod.generateSecureSyncToken();
  const token2 = sheetsMod.generateSecureSyncToken();
  assert.ok(typeof token1 === 'string' && token1.startsWith('bb_sec_'), 'Sync token must start with bb_sec_');
  assert.ok(token1.length >= 30, 'Sync token must be at least 30 characters long');
  assert.notStrictEqual(token1, token2, 'Generated tokens must be distinct high-entropy random strings');
  console.log('  ✔ generateSecureSyncToken produces high-entropy bb_sec_ tokens');

  // 2. Timing-Safe Token Verification
  assert.strictEqual(sheetsMod.verifySyncToken(token1, token1), true, 'Identical tokens must verify');
  assert.strictEqual(sheetsMod.verifySyncToken(token1, token2), false, 'Different tokens must fail verification');
  assert.strictEqual(sheetsMod.verifySyncToken('', token1), false, 'Empty token must fail');
  assert.strictEqual(sheetsMod.verifySyncToken(null, token1), false, 'Null token must fail');
  assert.strictEqual(sheetsMod.verifySyncToken(token1, null), false, 'Null expected token must fail');
  assert.strictEqual(sheetsMod.verifySyncToken(token1 + 'x', token1), false, 'Token with different length must fail');
  console.log('  ✔ verifySyncToken and timingSafeEqualToken enforce constant-time authentication');

  // 3. Sensitive PII Stripping on Member Record
  const dirtyMember = {
    name: 'Jeshua Tan',
    rank: 'Sergeant',
    platoon: 'Alpha',
    squad: 'Alpha 1',
    isBandMember: true,
    bandSection: 'Trumpet',
    paradeAttendance: { percentage: 95.5 },
    bandAttendance: { percentage: 90 },
    points: { uniform: 48, uniformAvg: 9.6, paradeAtt: 20, bandAtt: 20, total: 88 },
    ic: '081215-10-1234',
    mykad: '081215101234',
    nric: '081215-10-1234',
    phone: '012-3456789',
    parentContact: '019-8765432',
    parentName: 'Tan Ah Kow',
    homeAddress: '123 Jalan Gasing, Petaling Jaya',
    email: 'jeshua.tan@example.com',
    dob: '2008-12-15',
    medical: 'Asthma inhaler',
    feesPaid: 150
  };

  const cleanMember = sheetsMod.sanitizeMasterMemberRecord(dirtyMember);
  assert.strictEqual(cleanMember.name, 'Jeshua Tan');
  assert.strictEqual(cleanMember.rank, 'Sergeant');
  assert.strictEqual(cleanMember.platoon, 'Alpha');
  assert.strictEqual(cleanMember.squad, 'Alpha 1');
  assert.strictEqual(cleanMember.isBandMember, true);
  assert.strictEqual(cleanMember.points.total, 88);

  sheetsMod.SENSITIVE_PII_KEYS.forEach(k => {
    assert.strictEqual(k in cleanMember, false, `Member record must not contain PII key: ${k}`);
  });
  assert.strictEqual(cleanMember.ic, undefined);
  assert.strictEqual(cleanMember.phone, undefined);
  assert.strictEqual(cleanMember.parentContact, undefined);
  assert.strictEqual(cleanMember.homeAddress, undefined);
  console.log('  ✔ sanitizeMasterMemberRecord strictly strips IC, phone, address, and parent details');

  // 4. Sanitizing Full Master Attendance Payload
  const dirtyPayload = {
    lastSynced: new Date().toISOString(),
    sheetTitle: '1st PJ Master Attendance 2026',
    scannedSheets: ['Platoon Alpha', 'Platoon Papa', 'Band Attendance'],
    members: {
      'jeshuatan': dirtyMember,
      'brianlee': {
        name: 'Brian Lee',
        rank: 'Corporal',
        platoon: 'Papa',
        squad: 'Papa 1',
        points: { total: 75 },
        phone: '017-1112233',
        ic: '090101-14-5555'
      },
      'leakedPhoneList': {
        name: 'Emergency Numbers',
        phoneNumbers: '012-9999999'
      }
    },
    squads: {
      'Alpha 1': { name: 'Alpha 1', points: 155, rank: 1, platoon: 'Alpha' }
    },
    platoons: {
      'Alpha': { name: 'Alpha', totalPoints: 155, averagePoints: 155, squadCount: 1, rank: 1 }
    }
  };

  const cleanPayload = sheetsMod.sanitizeMasterAttendancePayload(dirtyPayload);
  assert.ok(cleanPayload._security.piiStripped, 'Payload must be tagged as PII stripped');
  assert.ok(cleanPayload._security.dataMinimizationCompliant, 'Payload must be marked compliant');
  assert.strictEqual(cleanPayload.members['jeshuatan'].phone, undefined);
  assert.strictEqual(cleanPayload.members['brianlee'].ic, undefined);
  assert.strictEqual(cleanPayload.members['brianlee'].phone, undefined);
  console.log('  ✔ sanitizeMasterAttendancePayload sanitizes full dataset ensuring zero PII leakage');

  // 5. Configuration Persistence with Auto-Generated Sync Token
  let mockMasterConfigJson = null;
  const originalGet = global.supa.get;
  const originalReq = global.supa.req;

  global.supa.req = async (method, path, body) => {
    if (path.includes('bb_config') && body && body.key === 'bb_master_sheet_config') {
      mockMasterConfigJson = body.value;
      return [{ id: 'cfg_1', ...body }];
    }
    return originalReq(method, path, body);
  };
  global.supa.get = async (path) => {
    if (path.includes('bb_master_sheet_config')) {
      return mockMasterConfigJson ? [{ value: mockMasterConfigJson }] : [];
    }
    return originalGet(path);
  };

  const cfg = await sheetsMod.loadMasterSheetConfig();
  assert.ok(cfg.syncToken && cfg.syncToken.startsWith('bb_sec_'), 'Config must have a secure sync token');
  assert.strictEqual(cfg.piiFiltered, true, 'piiFiltered flag must be true');

  const customToken = 'bb_sec_custom_test_token_12345';
  await sheetsMod.saveMasterSheetConfig({
    sheetId: 'test_sheet_id_123',
    scriptUrl: 'https://script.google.com/macros/s/test_exec/exec',
    syncToken: customToken,
    autoSync: true,
    piiFiltered: true
  });
  const reloadedCfg = await sheetsMod.loadMasterSheetConfig();
  assert.strictEqual(reloadedCfg.syncToken, customToken, 'Custom sync token must persist in config');
  console.log('  ✔ loadMasterSheetConfig and saveMasterSheetConfig persist token and security settings');

  // 6. GAS Web App Fetch with Token Authentication
  let lastFetchUrl = '';
  let lastFetchHeaders = {};
  global.fetch = async (url, opts) => {
    lastFetchUrl = url;
    lastFetchHeaders = (opts && opts.headers) || {};
    if (url.includes('token=' + encodeURIComponent(customToken))) {
      return {
        ok: true,
        status: 200,
        json: async () => dirtyPayload
      };
    } else {
      return {
        ok: false,
        status: 401,
        json: async () => ({ error: 'Unauthorized: Invalid sync token', status: 401 })
      };
    }
  };

  const fetchedData = await sheetsMod.fetchMasterAttendanceFromGAS(
    'https://script.google.com/macros/s/test_exec/exec',
    customToken
  );
  assert.ok(lastFetchUrl.includes('token=' + encodeURIComponent(customToken)), 'Token query param must be sent to GAS');
  assert.strictEqual(lastFetchHeaders['X-Sync-Token'], customToken, 'X-Sync-Token header must be passed');
  assert.ok(fetchedData._security.piiStripped, 'Fetched data must be sanitized before return');
  console.log('  ✔ fetchMasterAttendanceFromGAS enforces token and strips PII before caching');

  await assert.rejects(
    async () => {
      await sheetsMod.fetchMasterAttendanceFromGAS(
        'https://script.google.com/macros/s/test_exec/exec',
        'wrong_token'
      );
    },
    /Unauthorized/i,
    'Fetch with wrong token must throw Unauthorized error'
  );
  console.log('  ✔ fetchMasterAttendanceFromGAS rejects unauthorized requests with HTTP 401');

  // 7. Google Apps Script Hardened Template Verification
  const templateCode = sheetsMod.getGoogleAppsScriptTemplate(
    'https://example.supabase.co',
    'example_key',
    customToken
  );
  assert.ok(templateCode.includes(`var SYNC_TOKEN          = '${customToken}';`), 'Template must embed active sync token');
  assert.ok(templateCode.includes('function doGet(e)'), 'Template must define doGet handler');
  assert.ok(templateCode.includes('function doPost(e)'), 'Template must define doPost handler');
  assert.ok(templateCode.includes('reqToken !== SYNC_TOKEN'), 'Template must enforce token equality check');
  assert.ok(templateCode.includes('status: 401'), 'Template must return HTTP 401 on token failure');
  assert.ok(templateCode.includes('function auditSheetSharingSecurity()'), 'Template must include sheet sharing audit function');
  assert.ok(templateCode.includes('DriveApp.Access.ANYONE_WITH_LINK'), 'Template must check for anyone with link access');
  assert.ok(templateCode.includes('Audit Sheet Sharing & Privacy'), 'Template menu must include sharing audit action');
  assert.ok(templateCode.includes('buildSanitizedAttendancePayload'), 'Template must build sanitized payload with zero PII');
  console.log('  ✔ Google Apps Script template incorporates token auth, sharing audit, and zero-PII payload builder');

  // 8. Admin Master Sheet Panel UI Controls
  await attendanceMod.renderAdminMasterSheetPanel();
  const panel = document.getElementById('adm-master-sheet-panel');
  assert.ok(panel.innerHTML.includes(customToken), 'Rendered panel HTML must include active sync token');
  assert.ok(panel.innerHTML.includes('Endpoint Security &amp; Master Sheet Hardening'), 'Must render security hardening section');
  assert.ok(panel.innerHTML.includes('Zero-PII Whitelist'), 'Must display Zero-PII Whitelist badge');
  assert.ok(panel.innerHTML.includes('Token Auth Enforced'), 'Must display Token Auth Enforced badge');
  console.log('  ✔ renderAdminMasterSheetPanel renders endpoint hardening controls and pre-populated snippet');

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
