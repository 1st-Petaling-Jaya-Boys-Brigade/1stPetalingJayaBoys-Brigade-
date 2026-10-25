/**
 * Automated Unit & Integration Tests for Announcements, Gallery, and Resources Modules
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
let mockUser = 'test@bbpj1.org';
let mockRank = 'Recruit';
let mockAdmin = false;
global.sessionGet = (k) => {
  if (k === 'rank') return mockRank;
  if (k === 'adminAuthed') return mockAdmin;
  return mockUser;
};
global.escapeHtml = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
  req: async (method, path, body) => {
    if (method === 'POST') {
      lastPosted = { path, body };
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
  await announcementsModule.toggleReaction(0, '👍');
  assert.strictEqual(announcementsModule.announcements[0].reactions['👍'].includes('test@bbpj1.org'), true, 'User should be added to 👍 reaction');
  console.log('  ✔ toggleReaction adds reaction for logged-in user');

  // 4. Toggle Reaction (Remove)
  await announcementsModule.toggleReaction(0, '👍');
  assert.strictEqual(announcementsModule.announcements[0].reactions['👍'].includes('test@bbpj1.org'), false, 'User should be removed from 👍 reaction');
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

  // ── Load Resources Module (TSK-034) ──
  console.log('\nTesting Resources Module (TSK-034)...');
  const resourcesModule = require('../js/modules/resources.js');

  // 1. Load Resources (Empty by default, zero non-working placeholders)
  await resourcesModule.loadResources();
  assert.strictEqual(resourcesModule.resources.length, 0, 'Should start with 0 placeholder resources');
  console.log('  ✔ loadResources initializes empty clean catalog without placeholder documents');

  // 2. Admin adds real company resource
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
  console.log('  ✔ saveResources successfully stores documents in bb_config');

  // 3. Role-Based Visibility Checks
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

  // 4. Delete Resource
  await resourcesModule.deleteResource('res_123');
  assert.strictEqual(resourcesModule.resources.length, 0, 'Resource should be deleted from active list');
  console.log('  ✔ deleteResource removes resource from list and saves update');

  // 5. Clear All Resources
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
