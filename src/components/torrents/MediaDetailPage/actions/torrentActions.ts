import type { MediaDetailPageProps } from '../types';
import { handleDownload, type DownloadOptions } from './download';
import { handleDownloadTorrent, type DownloadTorrentOptions } from './downloadTorrent';
import { handleCopyMagnet, type MagnetOptions } from './magnet';
import { handleDeleteMedia, type DeleteOptions } from './delete';

export interface TorrentActionsOptions {
  torrent: MediaDetailPageProps['torrent'];
  isExternal: boolean;
  setDownloadingToClient: (value: boolean) => void;
  setMagnetCopied: (value: boolean) => void;
  addNotification: (type: 'success' | 'error' | 'info', message: string) => void;
  // Fonctions pour démarrer le polling de progression
  setPlayStatus?: (status: 'idle' | 'adding' | 'downloading' | 'ready' | 'error' | 'buffering') => void;
  pollTorrentProgress?: (infoHash: string) => void;
  progressPollIntervalRef?: { current: number | null };
  PROGRESS_POLL_INTERVAL_MS?: number;
  /** Pour afficher la barre de progression dès le démarrage du téléchargement */
  setTorrentStats?: (stats: import('../../../../lib/client/types').ClientTorrentStats | null) => void;
  // Fonction pour lancer la lecture après téléchargement
  onPlayAfterDownload?: () => void;
  /** Variantes du même groupe : en cas d'erreur "torrent non disponible", réessayer une autre variante */
  variants?: MediaDetailPageProps['torrent'][];
}

/**
 * Crée les actions pour gérer les torrents
 */
export function createTorrentActions(options: TorrentActionsOptions) {
  const {
    torrent,
    isExternal,
    setDownloadingToClient,
    setMagnetCopied,
    addNotification,
    setPlayStatus,
    pollTorrentProgress,
    progressPollIntervalRef,
    PROGRESS_POLL_INTERVAL_MS = 2000,
    setTorrentStats,
    variants,
  } = options;

  const downloadOptions: DownloadOptions = {
    torrent,
    isExternal,
    setDownloadingToClient,
    addNotification,
    setPlayStatus,
    pollTorrentProgress,
    progressPollIntervalRef,
    PROGRESS_POLL_INTERVAL_MS,
    setTorrentStats,
    variants,
  };

  const downloadTorrentOptions: DownloadTorrentOptions = {
    torrent,
    isExternal,
  };

  const magnetOptions: MagnetOptions = {
    torrent,
    setMagnetCopied,
  };

  return {
    /** Télécharger le torrent actif ou un variant spécifique (pour la modal Sources) */
    handleDownload: (torrentOverride?: MediaDetailPageProps['torrent']) =>
      handleDownload({ ...downloadOptions, torrent: torrentOverride ?? torrent }),
    handleDownloadTorrent: () => handleDownloadTorrent(downloadTorrentOptions),
    handleCopyMagnet: () => handleCopyMagnet(magnetOptions),
    handleDeleteMedia: async (
      infoHash: string,
      setIsAvailableLocally: (value: boolean) => void,
      addDebugLog?: (type: 'success' | 'error', message: string, data?: any) => void
    ) => {
      const deleteOptions: DeleteOptions = {
        torrent,
        setIsAvailableLocally,
        addNotification,
        addDebugLog,
      };
      return handleDeleteMedia(infoHash, deleteOptions);
    },
  };
}
