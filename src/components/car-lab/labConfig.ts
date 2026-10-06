/**
 * PROVISOIRE — Labo lecture Tesla (/car/lab).
 * Configuration des modes testables, persistance localStorage + URL partageable.
 * Supprimable d'un bloc avec src/pages/car/lab et src/components/car-lab.
 */

export type LabEngine =
  | 'img'
  | 'canvas-bitmap'
  | 'canvas-img'
  | 'webgl'
  | 'webcodecs'
  | 'video-canvas'
  | 'mse'
  | 'jsmpeg'
  | 'native';

export type LabQuality = 'low' | 'medium' | 'high';
export type LabBuffer = 'aggressive' | 'cautious';
export type LabPace = 'realtime' | 'burst';
export type LabClock = 'audio' | 'fixed';
export type LabRoute = 'direct' | 'proxy';

export interface LabConfig {
  engine: LabEngine;
  quality: LabQuality;
  adaptive: boolean;
  buffer: LabBuffer;
  pace: LabPace;
  clock: LabClock;
  audio: boolean;
  stats: boolean;
  /** Sous-titres texte (piste du média) dessinés en overlay */
  subs: boolean;
  /** direct = URL serveur ; proxy = même origine que le client (/srv → nginx client → conteneur serveur) */
  route: LabRoute;
}

export interface QualityPreset {
  label: string;
  maxHeight: number;
  fps: number;
  /** FFmpeg -q:v (2 = meilleur/lourd … 31 = pire/léger) */
  q: number;
  audioBitrate: string;
  /** Estimation grossière du débit vidéo MJPEG */
  approx: string;
}

export const QUALITY_PRESETS: Record<LabQuality, QualityPreset> = {
  low: { label: 'Basse', maxHeight: 360, fps: 10, q: 12, audioBitrate: '64k', approx: '≈0,8 Mb/s' },
  medium: { label: 'Moyenne', maxHeight: 480, fps: 12, q: 8, audioBitrate: '96k', approx: '≈2 Mb/s' },
  high: { label: 'Haute', maxHeight: 720, fps: 15, q: 5, audioBitrate: '128k', approx: '≈6 Mb/s' },
};

export const QUALITY_ORDER: LabQuality[] = ['low', 'medium', 'high'];

export interface EngineInfo {
  id: LabEngine;
  label: string;
  short: string;
  description: string;
  /** Utilise le flux MJPEG serveur (sinon MP4 direct) */
  mjpeg: boolean;
}

export const ENGINES: EngineInfo[] = [
  { id: 'canvas-bitmap', label: 'Canvas · ImageBitmap', short: 'Canvas', mjpeg: true,
    description: 'fetch MJPEG → createImageBitmap → canvas 2D, cadence pilotée (rAF + horloge audio), images en retard jetées.' },
  { id: 'webgl', label: 'WebGL texture', short: 'WebGL', mjpeg: true,
    description: 'fetch MJPEG → ImageBitmap → texture WebGL (GPU).' },
  { id: 'webcodecs', label: 'WebCodecs → canvas', short: 'WebCodecs', mjpeg: true,
    description: 'fetch MJPEG → ImageDecoder (WebCodecs) → VideoFrame → canvas.' },
  { id: 'canvas-img', label: 'Canvas · <img> blob', short: 'Canvas img', mjpeg: true,
    description: 'fetch MJPEG → Image(blob).decode() → canvas 2D (pour vieux Chromium).' },
  { id: 'img', label: 'MJPEG <img> natif', short: '<img>', mjpeg: true,
    description: '<img src=multipart> comme la page /car actuelle. Aucune régulation côté client.' },
  { id: 'video-canvas', label: 'Vidéo cachée → canvas', short: 'Video→canvas', mjpeg: false,
    description: '<video> MP4 invisible recopié dans un canvas + audio séparé. Probablement gelé en Drive.' },
  { id: 'mse', label: 'MSE → canvas', short: 'MSE', mjpeg: false,
    description: 'MediaSource → video cachée → canvas. Nécessite un flux fMP4 serveur (absent).' },
  { id: 'jsmpeg', label: 'JSMpeg (MPEG1/WS)', short: 'JSMpeg', mjpeg: false,
    description: 'MPEG1 via WebSocket → WebGL. Nécessite un endpoint serveur (absent).' },
  { id: 'native', label: 'Vidéo native (Park)', short: 'Natif', mjpeg: false,
    description: '<video> MP4 standard, référence en stationnement (bloqué en Drive).' },
];

export function engineInfo(id: LabEngine): EngineInfo {
  return ENGINES.find((e) => e.id === id) || ENGINES[0];
}

export const DEFAULT_CONFIG: LabConfig = {
  engine: 'canvas-bitmap',
  quality: 'medium',
  adaptive: true,
  buffer: 'cautious',
  pace: 'realtime',
  clock: 'audio',
  audio: true,
  stats: true,
  subs: false,
  route: 'direct',
};

const STORAGE_KEY = 'popcorn_car_lab_config_v1';
const LAST_PICK_KEY = 'popcorn_car_lab_last_pick_v1';

const ENGINE_IDS = ENGINES.map((e) => e.id);

function sanitize(raw: Partial<Record<keyof LabConfig, unknown>>): Partial<LabConfig> {
  const out: Partial<LabConfig> = {};
  if (typeof raw.engine === 'string' && (ENGINE_IDS as string[]).includes(raw.engine)) out.engine = raw.engine as LabEngine;
  if (raw.quality === 'low' || raw.quality === 'medium' || raw.quality === 'high') out.quality = raw.quality;
  if (raw.buffer === 'aggressive' || raw.buffer === 'cautious') out.buffer = raw.buffer;
  if (raw.pace === 'realtime' || raw.pace === 'burst') out.pace = raw.pace;
  if (raw.clock === 'audio' || raw.clock === 'fixed') out.clock = raw.clock;
  if (raw.route === 'direct' || raw.route === 'proxy') out.route = raw.route;
  const bool = (v: unknown): boolean | undefined =>
    v === true || v === '1' || v === 'true' ? true : v === false || v === '0' || v === 'false' ? false : undefined;
  const a = bool(raw.adaptive);
  if (a !== undefined) out.adaptive = a;
  const au = bool(raw.audio);
  if (au !== undefined) out.audio = au;
  const st = bool(raw.stats);
  if (st !== undefined) out.stats = st;
  const sb = bool(raw.subs);
  if (sb !== undefined) out.subs = sb;
  return out;
}

const URL_KEYS: Array<[keyof LabConfig, string]> = [
  ['engine', 'engine'],
  ['quality', 'q'],
  ['adaptive', 'adapt'],
  ['buffer', 'buf'],
  ['pace', 'pace'],
  ['clock', 'clock'],
  ['audio', 'audio'],
  ['stats', 'stats'],
  ['subs', 'subs'],
  ['route', 'route'],
];

export function loadConfig(): LabConfig {
  let stored: Partial<LabConfig> = {};
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s) stored = sanitize(JSON.parse(s));
  } catch {
    // ignore
  }
  let fromUrl: Partial<LabConfig> = {};
  try {
    const p = new URLSearchParams(window.location.search);
    const raw: Partial<Record<keyof LabConfig, unknown>> = {};
    for (const [k, q] of URL_KEYS) {
      const v = p.get(q);
      if (v != null) raw[k] = v;
    }
    fromUrl = sanitize(raw);
  } catch {
    // ignore
  }
  return { ...DEFAULT_CONFIG, ...stored, ...fromUrl };
}

export function saveConfig(cfg: LabConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    // ignore
  }
  try {
    const url = new URL(window.location.href);
    for (const [k, q] of URL_KEYS) {
      const v = cfg[k];
      url.searchParams.set(q, typeof v === 'boolean' ? (v ? '1' : '0') : String(v));
    }
    window.history.replaceState(window.history.state, '', url.toString());
  } catch {
    // ignore
  }
}

export interface LabPick {
  slug: string;
  path?: string | null;
  infoHash?: string | null;
  title: string;
  posterUrl?: string | null;
  position?: number;
}

export function loadLastPick(): LabPick | null {
  try {
    const s = localStorage.getItem(LAST_PICK_KEY);
    if (!s) return null;
    const p = JSON.parse(s) as LabPick;
    return p && typeof p.slug === 'string' ? p : null;
  } catch {
    return null;
  }
}

export function saveLastPick(p: LabPick | null): void {
  try {
    if (!p) localStorage.removeItem(LAST_PICK_KEY);
    else localStorage.setItem(LAST_PICK_KEY, JSON.stringify(p));
  } catch {
    // ignore
  }
}

/** URLs MJPEG + audio avec paramètres explicites (le serveur les honore depuis le fix query string). */
export function buildLabUrls(
  streamUrl: string,
  seekSeconds: number,
  preset: QualityPreset,
  pace: LabPace,
): { mjpegUrl: string; audioUrl: string } {
  const seek = Math.max(0, Number.isFinite(seekSeconds) ? seekSeconds : 0);
  let url: URL;
  try {
    url = new URL(streamUrl, window.location.origin);
  } catch {
    url = new URL(`http://localhost${streamUrl.startsWith('/') ? '' : '/'}${streamUrl}`);
  }
  let pathname = url.pathname.replace(/\/car\.(mjpeg|audio)$/i, '');
  if (pathname.endsWith('/')) pathname = pathname.slice(0, -1);

  const mjpeg = new URL(url.toString());
  mjpeg.pathname = `${pathname}/car.mjpeg`;
  mjpeg.searchParams.set('seek', seek.toFixed(3));
  mjpeg.searchParams.set('max_height', String(preset.maxHeight));
  mjpeg.searchParams.set('max_fps', String(preset.fps));
  mjpeg.searchParams.set('quality', String(preset.q));
  mjpeg.searchParams.set('pace', pace === 'burst' ? 'burst' : '1');
  mjpeg.searchParams.set('_lab', String(Date.now()));

  const audio = new URL(url.toString());
  audio.pathname = `${pathname}/car.audio`;
  audio.searchParams.set('seek', seek.toFixed(3));
  audio.searchParams.set('bitrate', preset.audioBitrate);
  audio.searchParams.set('_lab', String(Date.now()));

  return { mjpegUrl: mjpeg.toString(), audioUrl: audio.toString() };
}

/** Préfixe du proxy même-origine (docker/nginx.conf du client : /srv/ → http://server:3000/). */
export const PROXY_PREFIX = '/srv';

/**
 * direct : URL telle que fournie par le client (serveur configuré, ex. popcornn-server.jeser.app via Cloudflare) ;
 * proxy  : même chemin servi par l'origine du client (client.popcornn.app/srv/…) → nginx du conteneur client
 *          → conteneur serveur sur le réseau Docker interne (pas de CORS/preflight, autre chemin Cloudflare/Traefik).
 */
export function routeStreamUrl(streamUrl: string, route: LabRoute): string {
  if (route !== 'proxy') return streamUrl;
  try {
    const u = new URL(streamUrl, window.location.origin);
    if (u.origin === window.location.origin && u.pathname.startsWith(`${PROXY_PREFIX}/`)) return u.toString();
    return `${window.location.origin}${PROXY_PREFIX}${u.pathname}${u.search}`;
  } catch {
    return streamUrl;
  }
}

/** Base « …/car » pour car.subs.json / car.subs.vtt (même résolution de fichier que car.mjpeg). */
export function buildSubsUrls(streamUrl: string, seekSeconds: number, track: number | null): { listUrl: string; vttUrl: string | null } {
  const url = new URL(streamUrl, window.location.origin);
  let pathname = url.pathname.replace(/\/car\.(mjpeg|audio|subs\.json|subs\.vtt)$/i, '');
  if (pathname.endsWith('/')) pathname = pathname.slice(0, -1);
  const list = new URL(url.toString());
  list.pathname = `${pathname}/car.subs.json`;
  let vttUrl: string | null = null;
  if (track != null) {
    const v = new URL(url.toString());
    v.pathname = `${pathname}/car.subs.vtt`;
    v.searchParams.set('track', String(track));
    v.searchParams.set('seek', Math.max(0, seekSeconds).toFixed(3));
    v.searchParams.set('_lab', String(Date.now()));
    vttUrl = v.toString();
  }
  return { listUrl: list.toString(), vttUrl };
}
