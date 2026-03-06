/**
 * Utilitaires pour stocker les informations de torrents (positions de lecture, etc.)
 * Utilise localStorage côté client
 */

export interface PlaybackPosition {
  torrentId: string;
  deviceId: string;
  position: number; // Position en secondes (changé depuis bytes pour plus de précision)
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

const PLAYBACK_POSITION_MEDIA_PREFIX = 'playback_position_media_';

/**
 * Récupère la position de lecture sauvegardée pour un média (tmdb_id + tmdb_type).
 * Permet de reprendre au même endroit même si l'utilisateur rouvre via un autre info_hash (qualité différente).
 */
export async function getPlaybackPositionByMedia(
  tmdbId: number,
  tmdbType: string,
  deviceId: string
): Promise<number | null> {
  if (typeof window === 'undefined') return null;

  try {
    const key = `${PLAYBACK_POSITION_MEDIA_PREFIX}${tmdbId}_${tmdbType}_${deviceId}`;
    const stored = localStorage.getItem(key);
    if (stored) {
      const data = JSON.parse(stored);
      return typeof data.position === 'number' ? data.position : null;
    }
    return null;
  } catch (error) {
    console.error('Erreur lors de la récupération de la position de lecture (media):', error);
    return null;
  }
}

/**
 * Sauvegarde la position de lecture pour un média (tmdb_id + tmdb_type).
 */
export async function savePlaybackPositionByMedia(
  tmdbId: number,
  tmdbType: string,
  deviceId: string,
  position: number
): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    const key = `${PLAYBACK_POSITION_MEDIA_PREFIX}${tmdbId}_${tmdbType}_${deviceId}`;
    const data = {
      tmdbId,
      tmdbType,
      deviceId,
      position,
      timestamp: Date.now(),
    };
    localStorage.setItem(key, JSON.stringify(data));
  } catch (error) {
    console.error('Erreur lors de la sauvegarde de la position de lecture (media):', error);
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
