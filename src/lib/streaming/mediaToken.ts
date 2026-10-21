/**
 * Stage D — URLs signées pour la lecture.
 *
 * <video>, hls.js (natif ou MSE), Chromecast et <img> (vignettes, car.mjpeg) appellent le
 * serveur SANS en-tête Authorization. Le serveur délivre aux membres un jeton média court
 * (`pmt`, HMAC lié au membre, 12 h) via GET /api/local/media-token ; ce module l'ajoute aux
 * URLs de lecture du backend configuré (jamais vers une autre origine). Les playlists HLS
 * sont réécrites côté serveur : les segments portent déjà le jeton.
 *
 * Les getters `src` / `currentSrc` renvoient l'URL SANS jeton (comparaisons existantes du
 * lecteur inchangées, jeton absent des journaux de diagnostic).
 */
import { getBackendUrl } from '../backend-url';
import { TokenManager } from '../client/storage';
import { clientIdentityHeaders } from '../client-identity';

const LS_KEY = 'popcorn_media_token_v1';
/** Renouveler tôt : une URL signée doit rester valable toute la séance (films longs). */
const REFRESH_MARGIN_S = 6 * 60 * 60;
const MEDIA_PATH_RE =
  /^\/api\/(?:local\/(?:stream|hls)\/|local\/(?:duration|audio-streams)$|stream-torrent\/|remote-stream\/proxy$|lucie\/|library\/scrub-thumbnails\/|client\/torrents\/[^/]+\/stats\/v1$)/;

interface MediaTokenState {
  token: string;
  exp: number;
  backend: string;
  isAdmin: boolean;
}

let state: MediaTokenState | null = null;
let inflight: Promise<string | null> | null = null;
let installed = false;

function nowS(): number {
  return Math.floor(Date.now() / 1000);
}

function normBackend(b?: string | null): string {
  return (b || '').trim().replace(/\/+$/, '');
}

function configuredBackend(): string {
  try {
    return normBackend(getBackendUrl());
  } catch {
    return '';
  }
}

function hasCloudSession(): boolean {
  try {
    // Token cloud ou session serveur d'un utilisateur local invite.
    return Boolean(TokenManager.getServerAuthToken());
  } catch {
    return false;
  }
}

function load(): MediaTokenState | null {
  if (state) return state;
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(LS_KEY) : null;
    if (raw) {
      const s = JSON.parse(raw);
      if (s && typeof s.token === 'string' && typeof s.exp === 'number') {
        state = { token: s.token, exp: s.exp, backend: normBackend(s.backend), isAdmin: s.isAdmin === true };
      }
    }
  } catch {
    /* ignore */
  }
  return state;
}

function save(s: MediaTokenState | null): void {
  state = s;
  try {
    if (s) localStorage.setItem(LS_KEY, JSON.stringify(s));
    else localStorage.removeItem(LS_KEY);
  } catch {
    /* ignore */
  }
}

function validFor(backend: string, marginS = 0): MediaTokenState | null {
  const s = load();
  if (!s || !s.token || !backend || s.backend !== backend) return null;
  if (s.exp - nowS() <= marginS) return null;
  return s;
}

export function clearMediaToken(): void {
  save(null);
}

/** Jeton média utilisable tout de suite pour le backend configuré (null si absent/expiré). */
export function getMediaTokenSync(): string | null {
  if (!hasCloudSession()) return null;
  const s = validFor(configuredBackend(), 60);
  return s ? s.token : null;
}

async function requestToken(backend: string): Promise<Response | null> {
  const t = TokenManager.getServerAuthToken();
  if (!t) return null;
  return fetch(`${backend}/api/local/media-token`, {
    headers: { Authorization: `Bearer ${t}`, ...clientIdentityHeaders() },
    credentials: 'omit',
    cache: 'no-store',
  });
}

/** Obtient (ou renouvelle) le jeton média auprès du backend configuré. */
export async function ensureMediaToken(force = false): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  const backend = configuredBackend();
  if (!backend || !hasCloudSession()) return null;
  if (!force) {
    const s = validFor(backend, REFRESH_MARGIN_S);
    if (s) return s.token;
  }
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      let res = await requestToken(backend);
      if (res && res.status === 401) {
        try {
          const { refreshCloudToken } = await import('../api/popcorn-web.js');
          if (await refreshCloudToken()) res = await requestToken(backend);
        } catch {
          /* garder la première réponse */
        }
      }
      if (!res) return validFor(backend, 0)?.token ?? null;
      if (res.status === 401 || res.status === 403) {
        save(null);
        return null;
      }
      if (!res.ok) return validFor(backend, 0)?.token ?? null;
      const json = (await res.json().catch(() => null)) as
        | { success?: boolean; data?: { token?: string; expires_at?: number; is_admin?: boolean } }
        | null;
      const d = json?.data;
      if (!d?.token || typeof d.expires_at !== 'number') return validFor(backend, 0)?.token ?? null;
      save({ token: d.token, exp: d.expires_at, backend, isAdmin: d.is_admin === true });
      return d.token;
    } catch {
      return validFor(backend, 0)?.token ?? null;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Rôle admin du serveur (source : serveur, via /api/local/media-token). null = inconnu. */
export function isServerAdminSync(): boolean | null {
  const s = validFor(configuredBackend(), 0);
  return s ? s.isAdmin : null;
}

/** true seulement si le serveur a confirmé le rôle admin (les non-admins n'appellent pas les routes admin). */
export async function isServerAdmin(): Promise<boolean> {
  if (isServerAdminSync() === null) await ensureMediaToken();
  return isServerAdminSync() === true;
}

export function isSignableMediaUrl(url: string, backend: string = configuredBackend()): boolean {
  if (!url || !backend || /^(blob:|data:)/i.test(url)) return false;
  try {
    const here = typeof window !== 'undefined' && window.location ? window.location.href : backend;
    const u = new URL(url, here);
    const b = new URL(backend);
    if (u.origin !== b.origin) return false;
    let p = u.pathname;
    const bp = b.pathname.replace(/\/+$/, '');
    if (bp && p.startsWith(`${bp}/`)) p = p.slice(bp.length);
    return MEDIA_PATH_RE.test(p);
  } catch {
    return false;
  }
}

export function addMediaToken(url: string, token: string): string {
  if (/[?&]pmt=/.test(url)) return url;
  const i = url.indexOf('#');
  const base = i >= 0 ? url.slice(0, i) : url;
  const frag = i >= 0 ? url.slice(i) : '';
  return `${base}${base.includes('?') ? '&' : '?'}pmt=${encodeURIComponent(token)}${frag}`;
}

export function stripMediaToken(url: string): string {
  if (!url || !/[?&]pmt=/.test(url)) return url;
  const i = url.indexOf('#');
  const base = i >= 0 ? url.slice(0, i) : url;
  const frag = i >= 0 ? url.slice(i) : '';
  const q = base.indexOf('?');
  if (q < 0) return url;
  const kept = base
    .slice(q + 1)
    .split('&')
    .filter((p) => p.split('=')[0] !== 'pmt');
  return `${base.slice(0, q)}${kept.length ? `?${kept.join('&')}` : ''}${frag}`;
}

/** Ajoute le jeton média à une URL de lecture du backend configuré (sinon inchangée). */
export function signMediaUrl(url: string): string {
  try {
    if (!isSignableMediaUrl(url)) return url;
    const t = getMediaTokenSync();
    return t ? addMediaToken(url, t) : url;
  } catch {
    return url;
  }
}

/** Version asynchrone : obtient le jeton si besoin (Chromecast, démarrage de lecture). */
export async function signMediaUrlAsync(url: string): Promise<string> {
  try {
    if (!isSignableMediaUrl(url)) return url;
    const t = getMediaTokenSync() || (await ensureMediaToken());
    return t ? addMediaToken(url, t) : url;
  } catch {
    return url;
  }
}

function patchSrcProperty(proto: object | undefined): void {
  if (!proto) return;
  try {
    const d = Object.getOwnPropertyDescriptor(proto, 'src');
    if (!d || !d.set || !d.get) return;
    const get = d.get;
    const set = d.set;
    Object.defineProperty(proto, 'src', {
      configurable: true,
      enumerable: d.enumerable,
      get(this: unknown) {
        const v = get.call(this);
        return typeof v === 'string' ? stripMediaToken(v) : v;
      },
      set(this: unknown, v: unknown) {
        set.call(this, typeof v === 'string' ? signMediaUrl(v) : v);
      },
    });
  } catch {
    /* ignore */
  }
}

function patchCurrentSrc(): void {
  try {
    const proto = HTMLMediaElement.prototype;
    const d = Object.getOwnPropertyDescriptor(proto, 'currentSrc');
    if (!d || !d.get) return;
    const get = d.get;
    Object.defineProperty(proto, 'currentSrc', {
      configurable: true,
      enumerable: d.enumerable,
      get(this: unknown) {
        const v = get.call(this);
        return typeof v === 'string' ? stripMediaToken(v) : v;
      },
    });
  } catch {
    /* ignore */
  }
}

/**
 * Installe la signature automatique (idempotent) : fetch, XMLHttpRequest (hls.js),
 * src des <video>/<audio>/<source>/<img>, setAttribute('src'). Démarre le renouvellement.
 */
export function installMediaUrlSigning(): void {
  if (installed || typeof window === 'undefined') return;
  // Tests unitaires (vitest) : pas de patch global ni de minuterie.
  if ((globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.VITEST) return;
  installed = true;

  try {
    const origFetch = window.fetch.bind(window);
    const patched = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      try {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
        if (isSignableMediaUrl(url) && !/[?&]pmt=/.test(url)) {
          const t = getMediaTokenSync() || (await ensureMediaToken());
          if (t) {
            const signed = addMediaToken(url, t);
            if (typeof input === 'string' || input instanceof URL) return origFetch(signed, init);
            return origFetch(new Request(signed, input as Request), init);
          }
        }
      } catch {
        /* requête d'origine */
      }
      return origFetch(input, init);
    };
    window.fetch = patched as typeof window.fetch;
  } catch {
    /* ignore */
  }

  try {
    const origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
      let u: string | URL = url;
      try {
        const s = typeof url === 'string' ? url : url?.href;
        if (s) u = signMediaUrl(s);
      } catch {
        /* ignore */
      }
      return (origOpen as (...a: unknown[]) => void).call(this, method, u, ...rest);
    } as typeof XMLHttpRequest.prototype.open;
  } catch {
    /* ignore */
  }

  if (typeof HTMLMediaElement !== 'undefined') {
    patchSrcProperty(HTMLMediaElement.prototype);
    patchCurrentSrc();
  }
  if (typeof HTMLSourceElement !== 'undefined') patchSrcProperty(HTMLSourceElement.prototype);
  if (typeof HTMLImageElement !== 'undefined') patchSrcProperty(HTMLImageElement.prototype);

  try {
    const origSet = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (this: Element, name: string, value: string) {
      let v = value;
      try {
        if (
          typeof v === 'string' &&
          (name === 'src' || name === 'SRC') &&
          ((typeof HTMLMediaElement !== 'undefined' && this instanceof HTMLMediaElement) ||
            (typeof HTMLSourceElement !== 'undefined' && this instanceof HTMLSourceElement) ||
            (typeof HTMLImageElement !== 'undefined' && this instanceof HTMLImageElement))
        ) {
          v = signMediaUrl(v);
        }
      } catch {
        /* ignore */
      }
      return origSet.call(this, name, v);
    };
  } catch {
    /* ignore */
  }

  // Jeton prêt avant la première lecture, puis renouvelé en tâche de fond.
  setTimeout(() => void ensureMediaToken(), 300);
  setInterval(() => void ensureMediaToken(), 10 * 60 * 1000);
  try {
    window.addEventListener('focus', () => void ensureMediaToken());
  } catch {
    /* ignore */
  }
}
