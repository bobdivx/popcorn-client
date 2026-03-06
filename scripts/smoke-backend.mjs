#!/usr/bin/env node
/**
 * Smoke-test des routes backend utilisées par l'app (mode Tauri Android/Desktop).
 *
 * Usage:
 *   node scripts/smoke-backend.mjs --backend http://192.168.1.10:3000 [--user-id <id>]
 */
const args = process.argv.slice(2);
const getArg = (name) => {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] : undefined;
};

const backend = (getArg('--backend') || '').replace(/\/$/, '');
const userId = getArg('--user-id');

if (!backend) {
  console.error('Missing --backend (ex: http://192.168.1.10:3000)');
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function check(name, url, init = {}, { critical = false } = {}) {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init.headers || {}),
      },
    });
    const ms = Date.now() - started;
    let json = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    const ok = res.ok;
    return {
      name,
      url,
      ok,
      status: res.status,
      ms,
      critical,
      sample: json && typeof json === 'object' ? Object.keys(json).slice(0, 12) : null,
    };
  } catch (e) {
    const ms = Date.now() - started;
    return {
      name,
      url,
      ok: false,
      status: 0,
      ms,
      critical,
      error: e?.message || String(e),
    };
  }
}

const checks = [];
checks.push(await check('health', `${backend}/api/client/health`, { method: 'GET' }, { critical: true }));
checks.push(await check('torrents FILM', `${backend}/api/torrents/list?category=FILM&sort=popular&limit=5&page=1`, { method: 'GET' }, { critical: true }));
checks.push(await check('torrents SERIES', `${backend}/api/torrents/list?category=SERIES&sort=popular&limit=5&page=1`, { method: 'GET' }, { critical: true }));
checks.push(await check('library', `${backend}/library`, { method: 'GET' }, { critical: true }));
checks.push(await check('indexers list', `${backend}/api/client/admin/indexers`, { method: 'GET' }));
checks.push(await check('sync settings', `${backend}/api/sync/settings`, { method: 'GET' }));

if (userId) {
  checks.push(await check('sync status', `${backend}/api/sync/status?user_id=${encodeURIComponent(userId)}`, { method: 'GET' }));
  checks.push(
    await check(
      'tmdb key',
      `${backend}/api/tmdb/key`,
      { method: 'GET', headers: { 'X-User-ID': userId } }
    )
  );
} else {
  // Laisser une trace informative: sync status et tmdb key demandent un user_id
  checks.push({ name: 'sync status', skipped: true, reason: 'missing --user-id' });
  checks.push({ name: 'tmdb key', skipped: true, reason: 'missing --user-id' });
}

const criticalFailed = checks.some((c) => c && c.critical && c.ok === false);
const failed = checks.some((c) => c && c.ok === false && c.skipped !== true);

console.log(JSON.stringify({ backend, userId: userId || null, checks }, null, 2));

// Petit délai pour que stdout soit flush sur certains shells/windows
await sleep(50);
process.exit(criticalFailed ? 3 : failed ? 1 : 0);

