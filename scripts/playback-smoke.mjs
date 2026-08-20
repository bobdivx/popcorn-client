#!/usr/bin/env node
/**
 * Smoke lecture HLS réutilisable — backend + (optionnel) navigateur.
 *
 * Vérifie : health, choix d’un média, playlist, 3 segments, ETA/status, 1er .ts,
 * puis lecture réelle (hls.js) jusqu’à ~3 s sans erreur fatale.
 *
 * Usage:
 *   node scripts/playback-smoke.mjs
 *   node scripts/playback-smoke.mjs --backend http://127.0.0.1:3000
 *   node scripts/playback-smoke.mjs --no-browser
 *   node scripts/playback-smoke.mjs --path "media/films/foo.mkv"
 *   node scripts/playback-smoke.mjs --timeout 120000
 *
 * Env: PLAYBACK_BACKEND, PLAYBACK_PATH, PLAYBACK_SMOKE_ALLOW_4K=1
 */
const args = process.argv.slice(2);
const getArg = (name) => {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] : undefined;
};
const hasFlag = (name) => args.includes(name);

const allow4k = hasFlag('--allow-4k') || process.env.PLAYBACK_SMOKE_ALLOW_4K === '1';
const timeoutMs = Number(getArg('--timeout') || process.env.PLAYBACK_TIMEOUT_MS || (allow4k ? 120000 : 90000));
const preferHevc = hasFlag('--hevc');
const noBrowser = hasFlag('--no-browser');
const maxHeightRaw = getArg('--max-height');
const maxHeight = maxHeightRaw == null ? (hasFlag('--allow-4k') ? 0 : 720) : Number(maxHeightRaw);
const forcedPath = getArg('--path') || process.env.PLAYBACK_PATH || '';

async function resolveBackend() {
  const explicit = (getArg('--backend') || process.env.PLAYBACK_BACKEND || '').replace(/\/$/, '');
  const candidates = explicit
    ? [explicit]
    : ['http://127.0.0.1:3000', 'https://backend.briseteia.me'];
  for (const url of candidates) {
    try {
      const res = await fetch(`${url}/api/client/health`, { signal: AbortSignal.timeout(6000) });
      if (res.ok) return url;
    } catch {
      /* next */
    }
  }
  return null;
}

const backend = await resolveBackend();
if (!backend) {
  console.error('[playback-smoke] FAIL: aucun backend (local :3000 ni NAS)');
  process.exit(1);
}
console.log(`[playback-smoke] backend ${backend}`);

const MIN_SEGMENTS = 3;
const PLAY_SECONDS = 3;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function log(step, extra) {
  const line = extra != null ? `${step} ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : step;
  console.log(`[playback-smoke] ${line}`);
}

function fail(message, extra) {
  console.error(`[playback-smoke] FAIL: ${message}`);
  if (extra) console.error(JSON.stringify(extra, null, 2));
  process.exit(1);
}

function normalizeStreamPath(filePath) {
  let normalizedPath = (filePath || '').replace(/\\/g, '/').trim();
  if (!normalizedPath) return normalizedPath;
  if (normalizedPath.startsWith('//?/')) normalizedPath = normalizedPath.slice(4);
  const downloadRoots = ['/app/downloads/', 'app/downloads/', '/downloads/'];
  for (const root of downloadRoots) {
    if (normalizedPath.toLowerCase().startsWith(root.toLowerCase())) {
      normalizedPath = normalizedPath.slice(root.length);
      break;
    }
  }
  while (normalizedPath.startsWith('/') && !normalizedPath.startsWith('//')) {
    normalizedPath = normalizedPath.slice(1);
  }
  if (normalizedPath.toLowerCase().startsWith('downloads/')) {
    normalizedPath = normalizedPath.slice(10);
  }
  return normalizedPath;
}

function isVideoName(name) {
  return /\.(mkv|mp4|m4v|webm|avi|mov)$/i.test(name || '');
}

function is4kName(name) {
  return /2160|uhd|\b4k\b/i.test(name || '');
}

function scoreMedia(m) {
  const name = `${m.file_path || ''} ${m.file_name || ''}`;
  let score = 0;
  if (/\.mp4$/i.test(name)) score += 30;
  if (/1080/.test(name)) score += 10;
  if (/720/.test(name)) score += 20;
  if (is4kName(name)) score -= 80;
  if (preferHevc && /x265|hevc|h265/i.test(name) && !is4kName(name)) score += 50;
  if (allow4k && is4kName(name) && /x265|hevc|h265/i.test(name)) score += 60;
  if (!preferHevc && !allow4k && /x265|hevc|h265/i.test(name)) score -= 10;
  return score;
}

async function getJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' }, credentials: 'include' });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { res, json, text };
}

async function pickMedia() {
  if (forcedPath) {
    return { file_path: forcedPath, file_name: forcedPath.split('/').pop(), id: null };
  }
  const { res, json } = await getJson(`${backend}/api/library/media`);
  if (!res.ok) {
    fail('GET /api/library/media', { status: res.status, json });
  }
  const list = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
  const videos = list.filter((m) => isVideoName(m.file_path || m.file_name || ''));
  const filtered = allow4k ? videos : videos.filter((m) => !is4kName(m.file_path || m.file_name || ''));
  const pool = filtered.length ? filtered : videos;
  if (!pool.length) fail('Aucun média vidéo dans /api/library/media');
  pool.sort((a, b) => scoreMedia(b) - scoreMedia(a));
  return pool[0];
}

function playlistUrl(path, infoHash) {
  const encoded = encodeURIComponent(path);
  const params = new URLSearchParams();
  if (infoHash) params.set('info_hash', infoHash);
  if (maxHeight > 0) params.set('max_height', String(maxHeight));
  const q = params.toString();
  return `${backend}/api/local/stream/${encoded}/playlist.m3u8${q ? `?${q}` : ''}`;
}

function parseSegmentUrls(m3u8, basePlaylistUrl) {
  const lines = m3u8.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const segs = [];
  const base = new URL(basePlaylistUrl);
  for (const line of lines) {
    if (line.startsWith('#')) continue;
    if (!/\.ts(\?|$)/i.test(line)) continue;
    segs.push(new URL(line, base).href);
  }
  return segs;
}

function variantPlaylistUrls(master, basePlaylistUrl) {
  const lines = master.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const urls = [];
  const base = new URL(basePlaylistUrl);
  for (const line of lines) {
    if (line.startsWith('#')) continue;
    if (/\.m3u8(\?|$)/i.test(line) || !line.includes('.ts')) {
      urls.push(new URL(line, base).href);
    }
  }
  return urls;
}

function isReadyPlaylist(body) {
  if (!body || !body.includes('#EXTM3U')) return false;
  if (body.includes('#EXT-X-STREAM-INF')) return true;
  return /segment/i.test(body) || body.includes('.ts');
}

async function waitForPlaylist(url) {
  const started = Date.now();
  let lastStatus = 0;
  let lastBody = '';
  while (Date.now() - started < timeoutMs) {
    const res = await fetch(url, { credentials: 'include' });
    lastStatus = res.status;
    lastBody = await res.text();
    if (res.ok && isReadyPlaylist(lastBody)) {
      if (lastBody.includes('#EXT-X-STREAM-INF')) {
        const variants = variantPlaylistUrls(lastBody, url);
        let mediaBody = '';
        let mediaUrl = variants[0] || '';
        if (mediaUrl) {
          const vres = await fetch(mediaUrl, { credentials: 'include' });
          mediaBody = await vres.text();
        }
        if (!mediaBody.includes('.ts')) {
          log('master ABR sans segments 720 encore', {
            status: res.status,
            waitMs: Date.now() - started,
            variants: variants.length,
          });
          await sleep(2000);
          continue;
        }
        return { body: lastBody, mediaBody, mediaUrl, ladder: true, variants };
      }
      return { body: lastBody, mediaBody: lastBody, mediaUrl: url, ladder: false, variants: [] };
    }
    log('playlist pas encore prête', { status: res.status, waitMs: Date.now() - started, bytes: lastBody.length });
    await sleep(2000);
  }
  fail(`playlist non prête après ${timeoutMs}ms`, { lastStatus, preview: lastBody.slice(0, 400) });
}

async function pollStatus(path, infoHash) {
  const params = new URLSearchParams();
  params.set('path', path);
  if (infoHash) params.set('info_hash', infoHash);
  if (maxHeight > 0) params.set('max_height', String(maxHeight));
  const url = `${backend}/api/local/playback/status?${params}`;
  const logsUrl = `${backend}/api/local/playback/logs?${params}&limit=40`;
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    const { res, json } = await getJson(url);
    last = json?.data || json;
    const segs = last?.segment_count ?? 0;
    const min = last?.min_playable_segments ?? MIN_SEGMENTS;
    log('status', {
      phase: last?.phase,
      mode: last?.mode,
      ffmpeg: last?.ffmpeg_running,
      segments: segs,
      min,
      eta: last?.eta_playable_seconds,
      elapsed: last?.generation_elapsed_seconds,
      err: last?.last_error || null,
    });
    if (last?.phase === 'error' && last?.last_error) {
      const { json: logs } = await getJson(logsUrl);
      fail('pipeline HLS en erreur', { last, logs: logs?.data?.lines?.slice(-15) });
    }
    if (segs >= min) {
      const { json: logs } = await getJson(logsUrl);
      return { status: last, logs: logs?.data?.lines || [] };
    }
    await sleep(1500);
  }
  fail(`pas assez de segments après ${timeoutMs}ms`, { last });
}

async function fetchSegment(url) {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) fail('segment HLS', { url, status: res.status });
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 188) fail('segment trop petit', { url, bytes: buf.length });
  log('segment ok', { url: url.split('/').pop(), bytes: buf.length });
  return buf.length;
}

async function playInBrowser(m3u8Url) {
  let puppeteer;
  try {
    puppeteer = (await import('puppeteer-core')).default;
  } catch {
    log('navigateur ignoré (puppeteer-core absent)');
    return { skipped: true };
  }
  let browser;
  try {
    browser = await puppeteer.launch({
      channel: 'chrome',
      headless: true,
      args: [
        '--autoplay-policy=no-user-gesture-required',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
      ],
    });
  } catch (e) {
    log('navigateur ignoré (Chrome introuvable)', String(e?.message || e));
    return { skipped: true, error: String(e?.message || e) };
  }

  const page = await browser.newPage();
  const events = [];
  await page.exposeFunction('__smokeEvent', (msg) => {
    events.push({ t: Date.now(), msg });
  });
  await page.setContent(`<!doctype html>
<html><body>
<video id="v" muted autoplay playsinline controls style="width:100%;max-height:240px;background:#000"></video>
<script src="https://cdn.jsdelivr.net/npm/hls.js@1.6.15/dist/hls.min.js"></script>
<script>
  const video = document.getElementById('v');
  const url = ${JSON.stringify(m3u8Url)};
  window.__smoke = { waiting: 0, stalled: 0, error: null, time: 0, playing: false };
  video.addEventListener('waiting', () => { window.__smoke.waiting++; window.__smokeEvent('waiting'); });
  video.addEventListener('stalled', () => { window.__smoke.stalled++; window.__smokeEvent('stalled'); });
  video.addEventListener('playing', () => { window.__smoke.playing = true; window.__smokeEvent('playing'); });
  video.addEventListener('timeupdate', () => { window.__smoke.time = video.currentTime; });
  video.addEventListener('error', () => { window.__smoke.error = video.error && video.error.message || 'video error'; window.__smokeEvent('error'); });
  if (window.Hls && window.Hls.isSupported()) {
    const hls = new Hls({ enableWorker: true, startLevel: 0, capLevelToPlayerSize: true, maxBufferLength: 20, abrBandWidthUpFactor: 0.7 });
    hls.on(Hls.Events.ERROR, (_, data) => {
      if (data && data.fatal) {
        window.__smoke.error = (data.type || '') + ':' + (data.details || 'fatal');
        window.__smokeEvent('hls-fatal ' + window.__smoke.error);
      } else {
        window.__smokeEvent('hls-error ' + ((data && data.details) || ''));
      }
    });
    hls.loadSource(url);
    hls.attachMedia(video);
  } else {
    video.src = url;
  }
</script>
</body></html>`, { waitUntil: 'domcontentloaded' });

  const deadline = Date.now() + timeoutMs;
  let stats = { waiting: 0, stalled: 0, error: null, time: 0, playing: false };
  while (Date.now() < deadline) {
    stats = await page.evaluate(() => window.__smoke);
    if (stats.error) {
      await browser.close();
      fail('erreur lecteur navigateur', { stats, events: events.slice(-12) });
    }
    if (stats.playing && stats.time >= PLAY_SECONDS) break;
    await sleep(500);
  }
  await browser.close();
  if (!(stats.playing && stats.time >= PLAY_SECONDS)) {
    fail(`lecture navigateur incomplète (time=${stats.time}, playing=${stats.playing})`, { stats, events });
  }
  log('navigateur ok', { ...stats, events: events.length });
  if (stats.waiting > 8) {
    fail('trop de waiting (buffer relancé en boucle)', { stats, events });
  }
  return { skipped: false, stats, events };
}

const report = {
  backend,
  startedAt: new Date().toISOString(),
  media: null,
  playlistMs: 0,
  segmentBytes: 0,
  status: null,
  browser: null,
};

try {
  log('health…');
  const health = await getJson(`${backend}/api/client/health`);
  if (!health.res.ok) fail('backend health', { status: health.res.status, body: health.text?.slice(0, 300) });
  log('health ok', { ms: health.res.headers.get('x-response-time'), gpu: health.json?.data || health.json });

  const media = await pickMedia();
  const path = normalizeStreamPath(media.file_path || media.file_name || '');
  const infoHash = media.id ? `local_${media.id}` : undefined;
  report.media = { id: media.id, path, name: media.file_name || path };
  log('média', report.media);

  const url = playlistUrl(path, infoHash);
  log('playlist', url);
  const t0 = Date.now();
  const playlist = await waitForPlaylist(url);
  report.playlistMs = Date.now() - t0;
  report.ladder = playlist.ladder;
  const segs = parseSegmentUrls(playlist.mediaBody, playlist.mediaUrl);
  if (segs.length < 1) fail('playlist sans segments', { preview: playlist.body.slice(0, 400) });
  log('playlist ok', {
    ladder: playlist.ladder,
    variants: playlist.variants?.length || 0,
    segmentsInPlaylist: segs.length,
    ms: report.playlistMs,
  });
  if (report.playlistMs > 25000) {
    log('WARN playlist lente (cible 4K HEVC < 25 s après NVDEC 10-bit)', { playlistMs: report.playlistMs });
  }

  const polled = await pollStatus(path, infoHash);
  report.status = polled.status;
  if ((polled.status?.segment_count ?? 0) < MIN_SEGMENTS) {
    fail('moins de 3 segments serveur', polled.status);
  }

  report.segmentBytes = await fetchSegment(segs[0]);
  if (segs[1]) await fetchSegment(segs[1]);

  if (!noBrowser) {
    report.browser = await playInBrowser(url);
  } else {
    report.browser = { skipped: true, reason: '--no-browser' };
  }

  report.ok = true;
  report.elapsedMs = Date.now() - Date.parse(report.startedAt);
  console.log(JSON.stringify(report, null, 2));
  log('OK lecture');
  process.exit(0);
} catch (e) {
  if (e && e !== 1) {
    fail(e.message || String(e), { stack: e.stack });
  }
  process.exit(1);
}
