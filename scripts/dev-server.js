/**
 * Lightweight Zero-Dependency Static Development Server
 * Serves the Boys' Brigade Portal locally with proper MIME types and caching headers.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT || '3000', 10);
const ROOT = path.resolve(__dirname, '..');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8'
};

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let pathname = decodeURIComponent(parsedUrl.pathname);

  if (pathname === '/') {
    pathname = '/index.html';
  }

  const safePath = path.normalize(path.join(ROOT, pathname));

  // Security check: prevent directory traversal
  if (!safePath.startsWith(ROOT)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  fs.stat(safePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(safePath).toLowerCase();
    const contentType =
      safePath.endsWith('manifest.json') || ext === '.webmanifest'
        ? 'application/manifest+json; charset=utf-8'
        : MIME_TYPES[ext] || 'application/octet-stream';

    const headers = {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https://*.supabase.co https://*.googleusercontent.com https://drive.google.com https://images.unsplash.com; media-src 'self' blob: https://*.supabase.co https://drive.google.com https://*.googleusercontent.com https://www.youtube.com https://commondatastorage.googleapis.com; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://script.google.com https://script.googleusercontent.com https://challenges.cloudflare.com https://generativelanguage.googleapis.com; frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://drive.google.com; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self';",
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()'
    };
    if (safePath.endsWith('sw.js')) {
      headers['Service-Worker-Allowed'] = '/';
    }
    res.writeHead(200, headers);

    const stream = fs.createReadStream(safePath);
    stream.pipe(res);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 1st PJ Boys' Brigade Portal Dev Server Running!`);
  console.log(`   ➜ Local:   http://localhost:${PORT}/`);
  console.log(`   ➜ Network: http://127.0.0.1:${PORT}/`);
  console.log(`   Press Ctrl+C to stop.\n`);
});

module.exports = server;
