import { isCarPlayerMode, isTeslaBrowser, stampTeslaBrowserHints } from '../../../lib/utils/device-detection';

export interface CarPlaybackTarget {
  slug?: string | null;
  id?: string | null;
  infoHash?: string | null;
  downloadPath?: string | null;
  filePath?: string | null;
  fileIndex?: number | null;
}

/** True si la lecture doit passer par `/car` (Tesla / mode voiture). */
export function shouldUseCarPlayback(): boolean {
  stampTeslaBrowserHints();
  return isTeslaBrowser() || isCarPlayerMode();
}

/** Construit l’URL du lecteur voiture pour un média bibliothèque / torrent. */
export function buildCarPlayerUrl(target: CarPlaybackTarget): string | null {
  const slug = (target.slug || target.id || target.infoHash || '').trim();
  if (!slug) return null;
  const params = new URLSearchParams();
  params.set('slug', slug);
  const path = (target.filePath || target.downloadPath || '').trim();
  if (path) params.set('path', path);
  const hash = (target.infoHash || '').trim();
  if (hash) params.set('infoHash', hash);
  if (target.fileIndex != null && Number.isFinite(target.fileIndex)) {
    params.set('fileIndex', String(target.fileIndex));
  }
  return `/car?${params.toString()}`;
}

/**
 * Si navigateur voiture détecté, redirige vers `/car` et retourne true.
 * Sinon retourne false (laisser le lecteur classique).
 */
export function redirectToCarPlayerIfNeeded(target: CarPlaybackTarget): boolean {
  if (typeof window === 'undefined') return false;
  if (!shouldUseCarPlayback()) return false;
  const url = buildCarPlayerUrl(target);
  if (!url) return false;
  window.location.href = url;
  return true;
}
