import type { MediaDetailPageProps } from '../types';

export interface ProgressPollingOptions {
  torrent: MediaDetailPageProps['torrent'];
  pollTorrentProgress?: (infoHash: string) => void;
  progressPollIntervalRef?: { current: number | null };
  PROGRESS_POLL_INTERVAL_MS?: number;
  setPlayStatus?: (status: 'idle' | 'adding' | 'downloading' | 'ready' | 'error' | 'buffering') => void;
}

/**
 * Démarre le polling de progression pour un torrent
 */
export function startProgressPolling(
  infoHash: string | null,
  options: ProgressPollingOptions
): void {
  const {
    torrent,
    pollTorrentProgress,
    progressPollIntervalRef,
    PROGRESS_POLL_INTERVAL_MS = 2000,
    setPlayStatus,
  } = options;

  if (!infoHash) {
    // Si l'infoHash n'est pas disponible, utiliser celui du torrent s'il existe
    if (torrent.infoHash) {
      infoHash = torrent.infoHash;
    } else {
      // Attendre un peu et réessayer avec l'infoHash du torrent
      setTimeout(() => {
        if (torrent.infoHash) {
          startProgressPolling(torrent.infoHash, options);
        }
      }, 1000);
      return;
    }
  }
  
  if (!pollTorrentProgress || !progressPollIntervalRef) return;
  
  // Démarrer le polling si ce n'est pas déjà fait
  if (!progressPollIntervalRef.current) {
    progressPollIntervalRef.current = window.setInterval(() => {
      pollTorrentProgress(infoHash!);
    }, PROGRESS_POLL_INTERVAL_MS);
    // Premier appel immédiat pour mettre à jour les stats tout de suite
    pollTorrentProgress(infoHash);
  }
  
  // Ne pas mettre à jour playStatus pour le téléchargement (réservé au streaming)
  // Le statut sera affiché directement sur la page détail via torrentStats
}
