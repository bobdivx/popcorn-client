/**
 * Utilitaires pour stocker les informations de torrents (positions de lecture, etc.)
 * Utilise localStorage côté client
 */

export interface PlaybackPosition {
  torrentId: string;
  deviceId: string;
  position: number; // Position en bytes
  timestamp: number;
}

/**
 * Récupère la position de lecture sauvegardée pour un torrent
 */
export async function getPlaybackPosition(torrentId: string, deviceId: string): Promise<number | null> {
  if (typeof window === 'undefined') return null;

  try {
    const key = `playback_position_${torrentId}_${deviceId}`;
    const stored = localStorage.getItem(key);
    if (stored) {
      const data = JSON.parse(stored);
      return data.position || null;
    }
    return null;
  } catch (error) {
    console.error('Erreur lors de la récupération de la position de lecture:', error);
    return null;
  }
}

/**
 * Sauvegarde la position de lecture pour un torrent
 */
export async function savePlaybackPosition(
  torrentId: string,
  deviceId: string,
  position: number
): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    const key = `playback_position_${torrentId}_${deviceId}`;
    const data: PlaybackPosition = {
      torrentId,
      deviceId,
      position,
      timestamp: Date.now(),
    };
    localStorage.setItem(key, JSON.stringify(data));
  } catch (error) {
    console.error('Erreur lors de la sauvegarde de la position de lecture:', error);
  }
}

/**
 * Récupère un torrent depuis le stockage local (pour compatibilité)
 */
export async function getTorrentFromStorage(torrentId: string): Promise<{ infoHash?: string } | null> {
  if (typeof window === 'undefined') return null;

  try {
    const key = `torrent_${torrentId}`;
    const stored = localStorage.getItem(key);
    if (stored) {
      return JSON.parse(stored);
    }
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Sauvegarde un torrent dans le stockage local (pour compatibilité)
 */
export async function saveTorrentToStorage(torrentId: string, data: { infoHash?: string }): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    const key = `torrent_${torrentId}`;
    localStorage.setItem(key, JSON.stringify(data));
  } catch (error) {
    console.error('Erreur lors de la sauvegarde du torrent:', error);
  }
}
