import { useState, useCallback } from 'preact/hooks';
import { createTorrentActions } from '../actions/torrentActions';
import type { MediaDetailPageProps } from '../types';
import type { ClientTorrentStats } from '../../../../lib/client/types';
import { PROGRESS_POLL_INTERVAL_MS } from '../utils/constants';

export interface UseMediaDetailActionsInput {
  /** Torrent actif (sélection saison/épisode ou défaut) */
  activeTorrent: MediaDetailPageProps['torrent'];
  allVariants: MediaDetailPageProps['torrent'][];
  isExternal: boolean;
  hasInfoHash: boolean;
  /** Stats du client (pour annuler par info_hash même si la page n'a pas encore activeTorrent.infoHash) */
  torrentStats?: ClientTorrentStats | null;
  setDownloadingToClient: (value: boolean) => void;
  setMagnetCopied: (value: boolean) => void;
  addNotification: (type: 'success' | 'error' | 'info', message: string) => void;
  setPlayStatus: (status: 'idle' | 'adding' | 'downloading' | 'ready' | 'error' | 'buffering') => void;
  setTorrentStats: (stats: ClientTorrentStats | null) => void;
  addDebugLog?: (type: 'success' | 'error', message: string, data?: unknown) => void;
  setIsAvailableLocally: (value: boolean) => void;
  progressPollIntervalRef: { current: number | null };
  pollTorrentProgress: (infoHash: string) => void;
  handlePlay: () => void;
  stopProgressPolling: () => void;
  setProgressMessage: (msg: string) => void;
  setErrorMessage: (msg: string | null) => void;
}

export interface UseMediaDetailActionsResult {
  /** Lance le téléchargement (ou ouvre la modal Sources si plusieurs variantes) */
  handleDownload: (torrentOverride?: MediaDetailPageProps['torrent']) => void;
  handleDownloadTorrent: () => void;
  handleCopyMagnet: () => void;
  /** Ouvre la modal de confirmation puis appelle deleteMediaAction(skipConfirm: true) */
  handleRequestDelete: () => void;
  /** Confirmation dans la modal : supprime le torrent du client et les fichiers du disque */
  handleConfirmDelete: () => Promise<void>;
  /** Annuler le téléchargement en cours (retirer du client, sans supprimer les fichiers) */
  handleCancelDownload: () => Promise<void>;
  /** À passer à onDeleteMedia pour ouvrir la modal */
  showDeleteConfirmModal: boolean;
  setShowDeleteConfirmModal: (show: boolean) => void;
  deletingMedia: boolean;
}

/**
 * Hook réutilisable qui centralise la logique des boutons de la page détail média :
 * Télécharger, Annuler le téléchargement, Lire, Supprimer (avec modal de confirmation).
 */
export function useMediaDetailActions(input: UseMediaDetailActionsInput): UseMediaDetailActionsResult {
  const {
    activeTorrent,
    allVariants,
    isExternal,
    hasInfoHash,
    torrentStats: inputTorrentStats,
    setDownloadingToClient,
    setMagnetCopied,
    addNotification,
    setPlayStatus,
    setTorrentStats,
    addDebugLog,
    setIsAvailableLocally,
    progressPollIntervalRef,
    pollTorrentProgress,
    handlePlay,
    stopProgressPolling,
    setProgressMessage,
    setErrorMessage,
  } = input;

  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [deletingMedia, setDeletingMedia] = useState(false);

  const {
    handleDownload: doDownload,
    handleDownloadTorrent: doDownloadTorrent,
    handleCopyMagnet: doCopyMagnet,
    handleDeleteMedia: deleteMediaAction,
  } = createTorrentActions({
    torrent: activeTorrent,
    isExternal,
    setDownloadingToClient,
    setMagnetCopied,
    addNotification,
    setPlayStatus,
    pollTorrentProgress,
    progressPollIntervalRef,
    PROGRESS_POLL_INTERVAL_MS,
    setTorrentStats,
    onPlayAfterDownload: handlePlay,
    variants: allVariants,
  });

  const handleRequestDelete = useCallback(() => {
    setShowDeleteConfirmModal(true);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!hasInfoHash || !activeTorrent.infoHash) {
      addNotification('error', 'Impossible de supprimer : infoHash manquant');
      setShowDeleteConfirmModal(false);
      return;
    }
    setDeletingMedia(true);
    try {
      await deleteMediaAction(activeTorrent.infoHash!, setIsAvailableLocally, addDebugLog, true);
      setShowDeleteConfirmModal(false);
    } finally {
      setDeletingMedia(false);
    }
  }, [
    hasInfoHash,
    activeTorrent.infoHash,
    deleteMediaAction,
    setIsAvailableLocally,
    addDebugLog,
    addNotification,
  ]);

  const handleCancelDownload = useCallback(async () => {
    const infoHash = (activeTorrent.infoHash ?? inputTorrentStats?.info_hash ?? '').trim();
    if (!infoHash) return;
    stopProgressPolling();
    setPlayStatus('idle');
    setTorrentStats(null);
    setProgressMessage('');
    setErrorMessage(null);
    try {
      const { clientApi } = await import('../../../../lib/client/api');
      await clientApi.removeTorrent(infoHash, false);
      addNotification('success', 'Téléchargement annulé');
    } catch (err) {
      addNotification('error', "Erreur lors de l'annulation du téléchargement");
    }
  }, [
    activeTorrent.infoHash,
    inputTorrentStats?.info_hash,
    stopProgressPolling,
    setPlayStatus,
    setTorrentStats,
    setProgressMessage,
    setErrorMessage,
    addNotification,
  ]);

  const handleDownloadAllEpisodes = useCallback(async (episodesPayload: any) => {
    if (!episodesPayload?.seasons) return;
    
    // Collecter tous les info_hashes uniques disponibles
    const uniqueInfoHashes = new Set<string>();
    const variantsToDownload: MediaDetailPageProps['torrent'][] = [];
    
    for (const season of episodesPayload.seasons) {
      for (const ep of season.episodes) {
        if (ep.info_hash && !uniqueInfoHashes.has(ep.info_hash)) {
          uniqueInfoHashes.add(ep.info_hash);
          // Trouver le variant correspondant dans allVariants
          const variant = allVariants.find(v => v.infoHash === ep.info_hash);
          if (variant) variantsToDownload.push(variant);
        }
      }
    }
    
    if (variantsToDownload.length === 0) {
      addNotification('info', 'Aucun épisode disponible pour le téléchargement');
      return;
    }
    
    addNotification('info', `Démarrage du téléchargement de ${variantsToDownload.length} source(s)...`);
    
    let successCount = 0;
    for (const v of variantsToDownload) {
      try {
        // On utilise directement doDownload avec l'override
        await doDownload(v);
        successCount++;
      } catch (e) {
        console.error(`Erreur téléchargement variant ${v.infoHash}:`, e);
      }
    }
    
    if (successCount > 0) {
      addNotification('success', `${successCount} source(s) ajoutée(s) avec succès`);
    }
  }, [allVariants, doDownload, addNotification]);

  return {
    handleDownload: doDownload,
    handleDownloadTorrent: doDownloadTorrent,
    handleDownloadAllEpisodes,
    handleCopyMagnet: doCopyMagnet,
    handleRequestDelete,
    handleConfirmDelete,
    handleCancelDownload,
    showDeleteConfirmModal,
    setShowDeleteConfirmModal,
    deletingMedia,
  };
}
