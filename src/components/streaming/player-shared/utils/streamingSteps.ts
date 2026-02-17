/**
 * Étapes du chargement streaming (partagé entre overlay plein écran et lecteur).
 * 1 = Fichier torrent, 2 = Métadonnées, 3 = Connexion seeders, 4 = Téléchargement
 */

export const LOADING_STEPS = [
  { label: 'Fichier torrent', icon: '📥' },
  { label: 'Métadonnées', icon: '📋' },
  { label: 'Connexion seeders', icon: '🔗' },
  { label: 'Téléchargement', icon: '⬇️' },
] as const;

export interface TorrentStatsLike {
  progress?: number;
  download_speed?: number;
}

export function getLoadingStep(
  playStatus: string,
  progressMessage: string,
  torrentStats: TorrentStatsLike | null
): number {
  if (playStatus === 'adding') {
    const m = progressMessage.toLowerCase();
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
