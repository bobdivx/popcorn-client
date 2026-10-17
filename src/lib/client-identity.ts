/**
 * Identite client (version + plateforme) envoyee au serveur sur chaque requete API,
 * pour le gate de version minimale (min-client-version). La version vient de /VERSION.json
 * (source de verite runtime, meme fichier que l'update-checker).
 */
import { isWebOSTV } from './utils/device-detection';

let cachedVersion = '';

/** Plateforme logique pour le gate serveur : web | android | desktop | webos-native | webos-lite. */
export function getClientPlatform(): string {
  if (typeof window === 'undefined') return '';
  try {
    const proto = window.location?.protocol || '';
    const host = (window.location?.hostname || '').toLowerCase();
    const ua = navigator.userAgent || '';
    if (isWebOSTV()) {
      // Native = UI embarquee servie en local (file:// ou 127.0.0.1); lite = charge client.popcornn.app.
      const isLocal = proto === 'file:' || host === '127.0.0.1' || host === 'localhost';
      return isLocal ? 'webos-native' : 'webos-lite';
    }
    if (/Electron/i.test(ua)) return 'desktop';
    if (/Android/i.test(ua)) return 'android';
    return 'web';
  } catch {
    return 'web';
  }
}

export function getClientVersion(): string {
  return cachedVersion;
}

/** Charge la version depuis /VERSION.json (cache localStorage pour dispo immediate au reload). */
export async function initClientVersion(): Promise<void> {
  if (typeof window === 'undefined' || cachedVersion) return;
  try {
    const c = localStorage.getItem('popcorn_client_version');
    if (c) cachedVersion = c;
  } catch { /* ignore */ }
  try {
    const isFile = window.location?.protocol === 'file:';
    const url = isFile ? './VERSION.json' : '/VERSION.json';
    const r = await fetch(url, { cache: 'no-store' });
    const j = await r.json().catch(() => null);
    const v = j?.client?.version;
    if (typeof v === 'string' && v) {
      cachedVersion = v;
      try { localStorage.setItem('popcorn_client_version', v); } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
}

/**
 * En-tetes d'identite client a joindre aux requetes API (gate min-client-version).
 * Reactive apres ajout de X-Popcorn-Client-Version / X-Popcorn-Client-Platform a
 * access-control-allow-headers cote serveur (verifie par preflight web + webOS-native).
 */
export function clientIdentityHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  if (typeof window === 'undefined') return h;
  const v = getClientVersion();
  const p = getClientPlatform();
  if (v) h['X-Popcorn-Client-Version'] = v;
  if (p) h['X-Popcorn-Client-Platform'] = p;
  return h;
}

// Charge la version des l'import du module (best-effort, non bloquant).
void initClientVersion();
