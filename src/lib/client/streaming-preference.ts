/**
 * Gestion de la préférence de mode streaming pour le client torrent
 */

const STORAGE_KEY = 'client_torrent_streaming_mode';

/**
 * Récupère la préférence de mode streaming depuis localStorage
 * @returns true si le mode streaming est activé, false sinon (par défaut)
 */
export function getStreamingMode(): boolean {
  if (typeof window === 'undefined') {
    return false; // Par défaut, désactivé
  }
  
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === null) {
    // Par défaut, le mode streaming est désactivé (comportement normal)
    return false;
  }
  
  return saved === 'true';
}

/**
 * Définit la préférence de mode streaming dans localStorage
 * @param enabled - true pour activer le mode streaming, false pour le désactiver
 */
export function setStreamingMode(enabled: boolean): void {
  if (typeof window === 'undefined') {
    return;
  }
  
  localStorage.setItem(STORAGE_KEY, String(enabled));
}
