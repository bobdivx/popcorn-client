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

/** Données complètes pour une reprise série (TMDB) + position. */
export interface MediaPlaybackRecord {
  position: number;
  timestamp: number;
  tmdbId?: number;
  tmdbType?: string;
  /** Saison TMDB (séries). */
  season?: number;
  /** Numéro d'épisode dans la saison. */
  episode?: number;
  /** ID variante / épisode côté app (reprise fiable). */
  variantId?: string;
}

function mediaPlaybackKey(tmdbId: number, tmdbType: string, deviceId: string): string {
  return `${PLAYBACK_POSITION_MEDIA_PREFIX}${tmdbId}_${tmdbType}_${deviceId}`;
}

/**
 * Lit l'enregistrement complet (position + saison/épisode pour les séries).
 */
export async function getPlaybackPositionByMediaRecord(
  tmdbId: number,
  tmdbType: string,
  deviceId: string
): Promise<MediaPlaybackRecord | null> {
  if (typeof window === 'undefined') return null;
  try {
    const key = mediaPlaybackKey(tmdbId, tmdbType, deviceId);
    const stored = localStorage.getItem(key);
    if (!stored) return null;
    const data = JSON.parse(stored) as MediaPlaybackRecord;
    if (typeof data.position !== 'number') return null;
    return data;
  } catch (error) {
    console.error('Erreur lors de la récupération de la position (media, record):', error);
    return null;
  }
}

/**
 * Récupère la position de lecture sauvegardée pour un média (tmdb_id + tmdb_type).
 * Permet de reprendre au même endroit même si l'utilisateur rouvre via un autre info_hash (qualité différente).
 */
export async function getPlaybackPositionByMedia(
  tmdbId: number,
  tmdbType: string,
  deviceId: string
): Promise<number | null> {
  const rec = await getPlaybackPositionByMediaRecord(tmdbId, tmdbType, deviceId);
  return rec?.position ?? null;
}

export type SavePlaybackMediaExtras = {
  season?: number;
  episode?: number;
  variantId?: string;
};

/**
 * Sauvegarde la position de lecture pour un média (tmdb_id + tmdb_type).
 * Pour les séries, passer `extras` pour mémoriser saison / épisode / variante (reprise page détail + focus TV).
 */
export async function savePlaybackPositionByMedia(
  tmdbId: number,
  tmdbType: string,
  deviceId: string,
  position: number,
  extras?: SavePlaybackMediaExtras
): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    const key = mediaPlaybackKey(tmdbId, tmdbType, deviceId);
    const data: MediaPlaybackRecord = {
      tmdbId,
      tmdbType,
      position,
      timestamp: Date.now(),
    };
    if (tmdbType === 'tv' && extras) {
      if (extras.season != null) data.season = extras.season;
      if (extras.episode != null) data.episode = extras.episode;
      if (extras.variantId != null) data.variantId = extras.variantId;
    }
    localStorage.setItem(key, JSON.stringify(data));
  } catch (error) {
    console.error('Erreur lors de la sauvegarde de la position de lecture (media):', error);
  }
}

const WATCHED_EPISODES_TMDB_PREFIX = 'watched_episodes_tmdb_';

function episodeWatchedStorageKey(tmdbId: number): string {
  return `${WATCHED_EPISODES_TMDB_PREFIX}${tmdbId}`;
}

/** Clé stable pour une entrée épisode : "season:episode". */
export function watchedEpisodeKey(season: number, episode: number): string {
  return `${season}:${episode}`;
}

/** Épisodes marqués comme vus (localStorage), pour une série TMDB. */
export function getWatchedEpisodesSet(tmdbId: number): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(episodeWatchedStorageKey(tmdbId));
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

export function markEpisodeWatched(tmdbId: number, season: number, episode: number): void {
  if (typeof window === 'undefined') return;
  if (episode <= 0) return;
  try {
    const set = getWatchedEpisodesSet(tmdbId);
    const k = watchedEpisodeKey(season, episode);
    if (set.has(k)) return;
    set.add(k);
    localStorage.setItem(episodeWatchedStorageKey(tmdbId), JSON.stringify([...set]));
    window.dispatchEvent(new CustomEvent('popcorn-watched-episodes-changed', { detail: { tmdbId } }));
  } catch (e) {
    console.warn('markEpisodeWatched:', e);
  }
}

export function isEpisodeWatched(tmdbId: number, season: number, episode: number): boolean {
  if (episode <= 0) return false;
  return getWatchedEpisodesSet(tmdbId).has(watchedEpisodeKey(season, episode));
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
