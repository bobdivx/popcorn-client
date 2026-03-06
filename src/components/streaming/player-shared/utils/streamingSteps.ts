/**
 * Étapes du chargement streaming (partagé entre overlay plein écran et lecteur).
 * 1 = En file d'attente / Fichier torrent, 2 = Métadonnées, 3 = Connexion seeders, 4 = Téléchargement
 */

export const LOADING_STEPS = [
  { label: 'En file d\'attente', icon: '📥' },
  { label: 'Métadonnées', icon: '📋' },
  { label: 'Connexion seeders', icon: '🔗' },
  { label: 'Téléchargement', icon: '⬇️' },
] as const;

export interface TorrentStatsLike {
  progress?: number;
  download_speed?: number;
  /** État du torrent côté client (ex. 'queued', 'downloading'). */
  state?: string;
}

export function getLoadingStep(
  playStatus: string,
  progressMessage: string,
  torrentStats: TorrentStatsLike | null
): number {
  const m = progressMessage.toLowerCase();

  // En file d'attente ou lancement de la lecture → étape 1 (première barre)
  if (torrentStats?.state === 'queued') return 1;
  if (m.includes('lancement')) return 1;

  if (playStatus === 'adding') {
    if (m.includes('métadonnées') || m.includes('metadonnees')) return 2;
    return 1;
  }
  if (playStatus === 'downloading' || playStatus === 'buffering') {
    const hasData =
      torrentStats && (torrentStats.progress > 0 || (torrentStats.download_speed ?? 0) > 0);
    return hasData ? 4 : 3;
  }
  return 0;
}
