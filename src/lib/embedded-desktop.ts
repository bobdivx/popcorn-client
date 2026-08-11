/**
 * Backend embarqué Windows/Linux (bundle Tauri popcorn-tauri).
 * Le binaire popcorn-server est démarré par l'app ; on fixe automatiquement
 * http://127.0.0.1:3000 pour éviter l'étape manuelle « URL serveur ».
 */

import { hasBackendUrl, setBackendUrl } from './backend-config.js';
import { isTauri } from './utils/tauri.js';

export const EMBEDDED_DESKTOP_BACKEND_URL = 'http://127.0.0.1:3000';

/**
 * Platforme Tauri : popcorn-tauri expose `get_platform` (snake),
 * le shell mobile peut exposer `get-platform` (kebab).
 */
export async function getTauriPlatform(): Promise<string> {
  if (!isTauri()) return '';
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const platform =
      (await invoke<string>('get_platform').catch(() => null)) ||
      (await invoke<string>('get-platform').catch(() => null)) ||
      '';
    return platform;
  } catch {
    return '';
  }
}

/** Windows / Linux desktop avec serveur intégré (pas Android / webOS). */
export async function isEmbeddedDesktopPlatform(): Promise<boolean> {
  if (!isTauri()) return false;
  const platform = await getTauriPlatform();
  return platform === 'win32' || platform === 'windows' || platform === 'linux';
}

/**
 * Persiste l'URL du backend local si absente (ne remplace pas une URL custom).
 * @returns true si on est sur desktop embarqué
 */
export async function ensureEmbeddedDesktopBackendUrl(options?: {
  force?: boolean;
}): Promise<boolean> {
  const embedded = await isEmbeddedDesktopPlatform();
  if (!embedded) return false;
  if (options?.force || !hasBackendUrl()) {
    setBackendUrl(EMBEDDED_DESKTOP_BACKEND_URL);
  }
  return true;
}

/** Attend que le backend local réponde (health). */
export async function waitForEmbeddedBackend(
  url: string = EMBEDDED_DESKTOP_BACKEND_URL,
  attempts = 20,
  delayMs = 400
): Promise<boolean> {
  const base = url.replace(/\/$/, '');
  for (let i = 0; i < attempts; i++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 2500);
      const res = await fetch(`${base}/api/client/health`, {
        method: 'GET',
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (res.ok) return true;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}

/** Démarre le binaire serveur embarqué (idempotent côté UI). */
export async function startEmbeddedDesktopServer(): Promise<{ ok: boolean; error?: string }> {
  if (!(await isEmbeddedDesktopPlatform())) {
    return { ok: false, error: 'not-embedded-desktop' };
  }
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('start_server');
    return { ok: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    // Processus déjà lancé, etc. : on tente quand même le health ensuite
    return { ok: false, error };
  }
}
