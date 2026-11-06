import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';

const securityHeaders = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https://*.supabase.co https://*.googleusercontent.com https://drive.google.com https://images.unsplash.com; media-src 'self' blob: https://*.supabase.co https://drive.google.com https://*.googleusercontent.com https://www.youtube.com https://commondatastorage.googleapis.com; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://script.google.com https://script.googleusercontent.com https://challenges.cloudflare.com https://generativelanguage.googleapis.com; frame-src 'self' https://challenges.cloudflare.com https://www.youtube.com https://www.youtube-nocookie.com https://drive.google.com; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self';",
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()'
};

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function copyStaticAssetsPlugin() {
  return {
    name: 'copy-static-production-assets',
    closeBundle() {
      const outDir = path.resolve('dist');
      // 1. Copy js/ directory
      copyDirRecursive(path.resolve('js'), path.join(outDir, 'js'));
      // 2. Copy sw.js
      if (fs.existsSync('sw.js')) {
        fs.copyFileSync('sw.js', path.join(outDir, 'sw.js'));
      }
      // 3. Copy manifest.json
      if (fs.existsSync('manifest.json')) {
        fs.copyFileSync('manifest.json', path.join(outDir, 'manifest.json'));
      }
      // 4. Copy robots.txt
      if (fs.existsSync('robots.txt')) {
        fs.copyFileSync('robots.txt', path.join(outDir, 'robots.txt'));
      }
      // 5. Copy _headers
      if (fs.existsSync('_headers')) {
        fs.copyFileSync('_headers', path.join(outDir, '_headers'));
      }
    }
  };
}

export default defineConfig({
  root: '.',
  publicDir: 'assets',
  server: {
    port: 3000,
    open: false,
    host: true,
    headers: securityHeaders
  },
  preview: {
    port: 3000,
    open: false,
    headers: securityHeaders
  },
  plugins: [
    copyStaticAssetsPlugin()
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false
  }
});
