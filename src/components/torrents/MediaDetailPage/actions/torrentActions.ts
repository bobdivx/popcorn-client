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
  // Fonction pour lancer la lecture après téléchargement
  onPlayAfterDownload?: () => void;
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
    handleDownload: () => handleDownload(downloadOptions),
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
