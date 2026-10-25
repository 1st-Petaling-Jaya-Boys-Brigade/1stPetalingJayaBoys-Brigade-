/**
 * Automated Syntax & Integrity Verification
 * Validates all modular JavaScript files and inline scripts in index.html
 */
const fs = require('fs');
const path = require('path');

const jsFiles = [
  'js/config.js',
  'js/core/theme.js',
  'js/core/session.js',
  'js/core/utils.js',
  'js/api/supabase.js',
  'js/api/sheets.js',
  'js/modules/member.js',
  'js/modules/attendance.js',
  'js/modules/announcements.js',
  'js/modules/gallery.js',
  'js/modules/resources.js'
];

let failed = false;

console.log('Verifying modular JS files...');
jsFiles.forEach(relPath => {
  const fullPath = path.resolve(__dirname, '..', relPath);
  try {
    const code = fs.readFileSync(fullPath, 'utf8');
    new Function(code);
    console.log('  ✔ ' + relPath);
  } catch (err) {
    console.error('  ✖ ' + relPath + ':', err.message);
    failed = true;
  }
});

console.log('Verifying index.html embedded scripts...');
try {
  const htmlPath = path.resolve(__dirname, '..', 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const scriptMatches = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/gi)];

  scriptMatches.forEach((m, idx) => {
    try {
      new Function(m[1]);
      console.log('  ✔ embedded script block #' + idx + ' (' + m[1].split('\n').length + ' lines)');
    } catch (err) {
      console.error('  ✖ embedded script block #' + idx + ':', err.message);
      failed = true;
    }
  });
} catch (err) {
  console.error('Failed to read index.html:', err.message);
  failed = true;
}

if (failed) {
  console.error('\nSyntax verification failed.');
  process.exit(1);
} else {
  console.log('\nAll scripts passed syntax validation successfully!');
}
