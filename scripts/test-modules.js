/**
 * Automated Unit & Integration Tests for Announcements & Gallery Modules
 */
const assert = require('assert');

// ── Test Environment Simulation ──
global.window = global;
global.document = {
  getElementById: (id) => null,
  addEventListener: () => {},
  removeEventListener: () => {}
};

// Mock Session & Utils
global.sessionGet = (k) => 'test@bbpj1.org';
global.escapeHtml = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
global.showToast = (msg, type) => {};
global.showConfirmModal = async (msg, title) => true;

// Mock Supabase
let lastPatched = null;
let lastPosted = null;
let lastDeleted = null;

global.supa = {
  get: async (path) => {
    return [
      { id: '1', title: 'Test Notice', body: '<b>Meeting on Saturday</b>', date: '25 OCT 2026', reactions: { '👍': ['other@bb.org'] } }
    ];
  },
  req: async (method, path) => {
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

// ── Load Announcements Module ──
const announcementsModule = require('../js/modules/announcements.js');

console.log('Testing Announcements Module...');

// 1. Sanitizer Test
const cleanSafe = announcementsModule.sanitizeAnnouncementHtml('<b>Hello</b> <script>alert(1)</script><img src=x onerror=alert(2)>');
assert.strictEqual(cleanSafe.includes('<script>'), false, 'Sanitizer should remove <script> tags');
assert.strictEqual(cleanSafe.includes('onerror'), false, 'Sanitizer should remove inline onerror event handlers');
console.log('  ✔ HTML Sanitizer properly strips dangerous script/event tags');

// 2. Load Announcements
(async () => {
  await announcementsModule.loadAnnouncements();
  assert.strictEqual(announcementsModule.announcements.length, 1, 'Should load 1 announcement');
  assert.strictEqual(announcementsModule.announcements[0].title, 'Test Notice');
  console.log('  ✔ loadAnnouncements loads and formats data correctly');

  // 3. Toggle Reaction (Add)
  await announcementsModule.toggleReaction(0, '👍');
  assert.strictEqual(announcementsModule.announcements[0].reactions['👍'].includes('test@bbpj1.org'), true, 'User should be added to 👍 reaction');
  console.log('  ✔ toggleReaction adds reaction for logged-in user');

  // 4. Toggle Reaction (Remove)
  await announcementsModule.toggleReaction(0, '👍');
  assert.strictEqual(announcementsModule.announcements[0].reactions['👍'].includes('test@bbpj1.org'), false, 'User should be removed from 👍 reaction');
  console.log('  ✔ toggleReaction removes reaction when clicked again');

  // 5. Unauthenticated reaction check
  global.sessionGet = () => null;
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

  // 1. Load Gallery
  await galleryModule.loadGallery();
  assert.strictEqual(galleryModule.galleryImages.length, 2, 'Should load 2 photos');
  assert.strictEqual(galleryModule.galleryImages[0].id, 'g1');
  console.log('  ✔ loadGallery loads photo array correctly');

  // 2. Delete Gallery Image
  await galleryModule.deleteGalleryImage(0, 'g1');
  assert.strictEqual(galleryModule.galleryImages.length, 1, 'Should have 1 photo remaining');
  assert.strictEqual(lastDeleted, 'bb_gallery?id=eq.g1', 'Should call Supabase delete on row');
  console.log('  ✔ deleteGalleryImage removes photo and deletes from Supabase');

  // 3. Upload Gallery Files
  const mockFile = {
    name: 'event.png',
    type: 'image/png',
    arrayBuffer: async () => new ArrayBuffer(8)
  };
  await galleryModule.uploadGalleryFiles([mockFile]);
  assert.strictEqual(galleryModule.galleryImages.length, 2, 'Should add newly uploaded photo to array');
  assert.strictEqual(lastPosted.path, 'bb_gallery', 'Should insert into bb_gallery table');
  console.log('  ✔ uploadGalleryFiles uploads to storage and inserts database record');

  console.log('\n🎉 ALL MODULE UNIT & INTEGRATION TESTS PASSED 100%!\n');
})().catch(err => {
  console.error('\n✖ Test failed:', err);
  process.exit(1);
});
