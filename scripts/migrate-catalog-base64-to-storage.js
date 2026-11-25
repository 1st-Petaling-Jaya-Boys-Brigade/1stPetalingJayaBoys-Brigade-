#!/usr/bin/env node
/**
 * Safe One-Time Migration: Offload inline base64 catalog images from Postgres
 * (`bb_badge_defs` and `bb_uniform_items`) into CDN-cached Supabase Storage.
 *
 * STRICT SCOPE:
 *   - ONLY inspects `bb_badge_defs` and `bb_uniform_items` inside `bb_config`.
 *   - NEVER touches `avatars`, `bb_members`, or any user profile photos.
 *   - Dry-run by default. Pass `--apply` to execute uploads & CAS DB updates.
 *
 * Usage:
 *   node scripts/migrate-catalog-base64-to-storage.js           # Dry run (read-only)
 *   node scripts/migrate-catalog-base64-to-storage.js --apply   # Upload & migrate
 */

const fs = require('fs');
const path = require('path');

function loadSupabaseConfig() {
  const configJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'config.js'), 'utf8');
  const urlMatch = configJs.match(/['"](https:\/\/[a-z0-9]+\.supabase\.co)['"]/);
  const keyMatch = configJs.match(/['"](eyJhbGciOi[A-Za-z0-9._-]+)['"]/);
  const url = process.env.SUPA_URL || (urlMatch && urlMatch[1]) || '';
  const key = process.env.SUPA_KEY || (keyMatch && keyMatch[1]) || '';
  if (!url || !key) {
    throw new Error('Could not resolve SUPA_URL / SUPA_KEY from environment or js/config.js.');
  }
  return { url, key };
}

function parseDataImageUri(value) {
  if (typeof value !== 'string') return null;
  const m = value.match(/^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!m) return null;
  const rawType = m[1].toLowerCase();
  const ext = rawType === 'jpeg' ? 'jpg' : rawType;
  const mime = rawType === 'jpg' ? 'image/jpeg' : 'image/' + rawType;
  const buffer = Buffer.from(m[2].replace(/\s+/g, ''), 'base64');
  return { ext, mime, buffer };
}

async function migrateConfigKey({ url, key, configKey, folder, idProp, apply }) {
  const headers = {
    apikey: key,
    Authorization: 'Bearer ' + key,
    'Content-Type': 'application/json'
  };

  const res = await fetch(`${url}/rest/v1/bb_config?key=eq.${encodeURIComponent(configKey)}&select=key,value,updated_at`, { headers });
  if (!res.ok) throw new Error(`Failed to fetch ${configKey}: HTTP ${res.status}`);
  const rows = await res.json();
  if (!Array.isArray(rows) || !rows.length || !rows[0].value) {
    console.log(`[${configKey}] No data found — skipping.`);
    return;
  }

  const expectedUpdatedAt = rows[0].updated_at || null;
  const items = typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value;
  if (!Array.isArray(items)) {
    console.log(`[${configKey}] Unexpected non-array payload — skipping.`);
    return;
  }

  const beforeBytes = Buffer.byteLength(JSON.stringify(items), 'utf8');
  let migratedCount = 0;

  for (const item of items) {
    if (!item || typeof item.image !== 'string') continue;
    const parsed = parseDataImageUri(item.image);
    if (!parsed) continue;

    const itemId = String(item[idProp] || 'item').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48);
    const storagePath = `catalog/${folder}/${itemId}.${parsed.ext}`;
    const publicUrl = `${url}/storage/v1/object/public/gallery/${storagePath}`;
    const kb = (parsed.buffer.length / 1024).toFixed(1);

    if (!apply) {
      console.log(`  [DRY RUN] ${configKey} -> ${itemId} (${kb} KB ${parsed.mime}) => ${publicUrl}`);
      item.image = publicUrl;
      migratedCount++;
      continue;
    }

    const uploadRes = await fetch(`${url}/storage/v1/object/gallery/${storagePath}`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: 'Bearer ' + key,
        'Content-Type': parsed.mime,
        'cache-control': 'max-age=31536000, public',
        'x-upsert': 'true'
      },
      body: parsed.buffer
    });
    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      throw new Error(`Upload failed for ${storagePath}: HTTP ${uploadRes.status} ${errText}`);
    }

    // Verify public CDN URL responds HTTP 200 before mutating Postgres
    const verifyRes = await fetch(publicUrl, { method: 'HEAD' });
    if (!verifyRes.ok) {
      throw new Error(`Verification HEAD failed for ${publicUrl}: HTTP ${verifyRes.status}`);
    }

    item.image = publicUrl;
    migratedCount++;
    console.log(`  [UPLOADED] ${configKey} -> ${itemId} (${kb} KB ${parsed.mime}) => ${publicUrl}`);
  }

  const afterBytes = Buffer.byteLength(JSON.stringify(items), 'utf8');
  console.log(`[${configKey}] ${migratedCount} inline base64 image(s). Payload: ${(beforeBytes / 1024).toFixed(1)} KB -> ${(afterBytes / 1024).toFixed(1)} KB`);

  if (!apply || migratedCount === 0) return;

  // Optimistic CAS update so concurrent edits are never overwritten
  let patchUrl = `${url}/rest/v1/bb_config?key=eq.${encodeURIComponent(configKey)}`;
  if (expectedUpdatedAt) {
    patchUrl += `&updated_at=eq.${encodeURIComponent(expectedUpdatedAt)}`;
  }
  const patchRes = await fetch(patchUrl, {
    method: 'PATCH',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify({
      value: JSON.stringify(items),
      updated_at: new Date().toISOString()
    })
  });
  if (!patchRes.ok) {
    throw new Error(`CAS update failed for ${configKey}: HTTP ${patchRes.status} ${await patchRes.text()}`);
  }
  const updatedRows = await patchRes.json();
  if (!Array.isArray(updatedRows) || !updatedRows.length) {
    throw new Error(`CAS conflict on ${configKey} (updated concurrently). Re-run script safely.`);
  }
  console.log(`  [SAVED] ${configKey} updated safely via CAS.`);
}

async function main() {
  const apply = process.argv.includes('--apply');
  console.log('=== Catalog Base64 -> Supabase Storage Migration ===');
  console.log('Scope: bb_badge_defs and bb_uniform_items ONLY. User profile photos are NEVER touched.');
  console.log('Mode:', apply ? 'APPLY (writing to Storage + bb_config)' : 'DRY RUN (read-only preview; pass --apply to execute)');

  const cfg = loadSupabaseConfig();
  await migrateConfigKey({ ...cfg, configKey: 'bb_badge_defs', folder: 'badges', idProp: 'id', apply });
  await migrateConfigKey({ ...cfg, configKey: 'bb_uniform_items', folder: 'uniforms', idProp: 'key', apply });
  console.log('Done.');
}

main().catch(err => {
  console.error('Migration error:', err.message || err);
  process.exit(1);
});
