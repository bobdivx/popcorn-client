/**
 * Persistance de l'info_hash du torrent en cours de streaming (sessionStorage).
 * Utilisé pour masquer la carte "Annuler le téléchargement" / progression quand
 * l'utilisateur revient sur la page MediaDetail pendant un streaming.
 */

const KEY = 'popcorn_streaming_info_hash';

export function setStreamingInfoHash(infoHash: string): void {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem(KEY, infoHash);
    }
  } catch {
    // ignore
  }
}

export function clearStreamingInfoHash(infoHash?: string): void {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      if (infoHash != null && window.sessionStorage.getItem(KEY) !== infoHash) return;
      window.sessionStorage.removeItem(KEY);
    }
  } catch {
    // ignore
  }
}

export function getStreamingInfoHash(): string | null {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      return window.sessionStorage.getItem(KEY);
    }
  } catch {
    // ignore
  }
  return null;
}
