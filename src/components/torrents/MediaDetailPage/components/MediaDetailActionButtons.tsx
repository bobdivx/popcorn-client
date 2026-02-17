import { useEffect } from 'preact/hooks';
import { useMediaDetailActions } from '../hooks/useMediaDetailActions';
import { useSubscriptionMe } from '../hooks/useSubscriptionMe';
import type { MediaDetailPageProps } from '../types';
import type { ClientTorrentStats } from '../../../../lib/client/types';
import { getStreamingInfoHash } from '../../../../lib/streamingInfoHashStorage';
import { ActionButtons } from './ActionButtons';
import { Modal } from '../../../ui/Modal';
import { useI18n } from '../../../../lib/i18n/useI18n';
import type { UseMediaDetailActionsResult } from '../hooks/useMediaDetailActions';

export interface MediaDetailActionButtonsProps {
  /** Torrent affiché (sélectionné ou défaut) */
  torrent: MediaDetailPageProps['torrent'];
  /** Torrent actif pour les actions (doit avoir infoHash pour download/cancel/delete) */
  activeTorrent: MediaDetailPageProps['torrent'];
  allVariants: MediaDetailPageProps['torrent'][];
  /** En mode streaming (lecture en cours) : masquer le panneau de progression téléchargement. */
  isPlaying?: boolean;
  isAvailableLocally: boolean;
  canStream: boolean;
  isExternal: boolean;
  hasInfoHash: boolean;
  magnetCopied: boolean;
  downloadingToClient: boolean;
  savedPlaybackPosition?: number | null;
  torrentStats?: ClientTorrentStats | null;
  countdownRemaining?: number | null;
  isPackWithMultipleFiles?: boolean;
  /** Refs / callbacks pour les actions */
  setTorrentStats: (stats: ClientTorrentStats | null) => void;
  setPlayStatus: (status: 'idle' | 'adding' | 'downloading' | 'ready' | 'error' | 'buffering') => void;
  setDownloadingToClient: (value: boolean) => void;
  setMagnetCopied: (value: boolean) => void;
  addNotification: (type: 'success' | 'error' | 'info', message: string) => void;
  addDebugLog?: (type: 'success' | 'error', message: string, data?: unknown) => void;
  setIsAvailableLocally: (value: boolean) => void;
  progressPollIntervalRef: { current: number | null };
  pollTorrentProgress: (infoHash: string) => void;
  handlePlay: () => void;
  stopProgressPolling: () => void;
  setProgressMessage: (msg: string) => void;
  setErrorMessage: (msg: string | null) => void;
  /** Ouvrir la modal de sélection de source (quand plusieurs variantes) */
  onOpenSourceModal?: () => void;
  videoWrapperRef?: { current: HTMLElement | null };
  /** Callbacks optionnels pour comportement personnalisé (ex. fullscreen avant lecture) */
  onPlay?: () => void | Promise<void>;
  onPlayFromBeginning?: () => void | Promise<void>;
  onPlayAuto?: (bestTorrent: MediaDetailPageProps['torrent']) => void | Promise<void>;
  /** Expose les actions (ex. handleDownload) pour la modal Sources ou autres usages */
  onActionsReady?: (actions: UseMediaDetailActionsResult) => void;
}

/**
 * Composant réutilisable qui gère toute la logique des boutons de la page détail média :
 * - Bouton principal : Télécharger / Annuler le téléchargement / Lire
 * - Bouton Supprimer (torrent complété) avec modal de confirmation
 * - Bouton Demander (request), Magnet, Bande-annonce
 * - Barre de progression et statut seeding
 */
export function MediaDetailActionButtons({
  torrent,
  activeTorrent,
  allVariants,
  isPlaying = false,
  isAvailableLocally,
  canStream,
  isExternal,
  hasInfoHash,
  magnetCopied,
  downloadingToClient,
  savedPlaybackPosition,
  torrentStats,
  countdownRemaining = null,
  isPackWithMultipleFiles = false,
  setTorrentStats,
  setPlayStatus,
  setDownloadingToClient,
  setMagnetCopied,
  addNotification,
  addDebugLog,
  setIsAvailableLocally,
  progressPollIntervalRef,
  pollTorrentProgress,
  handlePlay,
  stopProgressPolling,
  setProgressMessage,
  setErrorMessage,
  onOpenSourceModal,
  onPlay,
  onPlayFromBeginning,
  onPlayAuto,
  onActionsReady,
}: MediaDetailActionButtonsProps) {
  const { t } = useI18n();
  const { streamingTorrentActive } = useSubscriptionMe();
  const streamingInfoHash = getStreamingInfoHash();
  const isStreamingThisTorrent =
    isPlaying ||
    (streamingTorrentActive && !!activeTorrent?.infoHash && streamingInfoHash === activeTorrent.infoHash);

  const actions = useMediaDetailActions({
    activeTorrent,
    allVariants,
    isExternal,
    hasInfoHash,
    torrentStats,
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
  });

  useEffect(() => {
    onActionsReady?.(actions);
  }, [actions, onActionsReady]);

  // Ne pas passer l'event du clic à handleDownload : il attend un optionnel torrentOverride, pas un Event
  const onDownloadClick =
    allVariants.length > 1 && onOpenSourceModal
      ? () => onOpenSourceModal()
      : () => void actions.handleDownload();

  return (
    <>
      <ActionButtons
        torrent={torrent}
        allVariants={allVariants}
        isAvailableLocally={isAvailableLocally}
        isStreamingThisTorrent={isStreamingThisTorrent}
        canStream={canStream}
        isExternal={isExternal}
        hasInfoHash={hasInfoHash}
        streamingTorrentActive={streamingTorrentActive}
        magnetCopied={magnetCopied}
        downloadingToClient={downloadingToClient}
        deletingMedia={actions.deletingMedia}
        savedPlaybackPosition={savedPlaybackPosition}
        torrentStats={torrentStats}
        countdownRemaining={countdownRemaining}
        isPackWithMultipleFiles={isPackWithMultipleFiles}
        onPlay={onPlay ?? (() => handlePlay())}
        onPlayFromBeginning={onPlayFromBeginning}
        onPlayAuto={onPlayAuto}
        onDownload={onDownloadClick}
        onDownloadTorrent={actions.handleDownloadTorrent}
        onCancelDownload={
          (hasInfoHash || !!torrentStats?.info_hash)
            ? () => void actions.handleCancelDownload()
            : undefined
        }
        onCopyMagnet={actions.handleCopyMagnet}
        onDeleteMedia={actions.handleRequestDelete}
      />

      {/* Modal de confirmation : supprimer le torrent du client et les fichiers du disque */}
      <Modal
        isOpen={actions.showDeleteConfirmModal}
        onClose={() => actions.setShowDeleteConfirmModal(false)}
        title={t('downloads.confirmDeleteTorrentTitle')}
        size="sm"
      >
        <p className="text-white/90 mb-6">{t('downloads.confirmDeleteTorrentMessage')}</p>
        <div className="flex flex-wrap gap-3 justify-end">
          <button
            type="button"
            onClick={() => actions.setShowDeleteConfirmModal(false)}
            className="px-5 py-2.5 rounded-lg font-semibold border border-white/30 bg-white/10 text-white hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-primary-500"
            data-focusable
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={actions.handleConfirmDelete}
            disabled={actions.deletingMedia}
            className="px-5 py-2.5 rounded-lg font-semibold bg-red-600 hover:bg-red-700 text-white focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50"
            data-focusable
          >
            {actions.deletingMedia ? (
              <>
                <span className="loading loading-spinner loading-sm mr-2" />
                {t('downloads.removing')}
              </>
            ) : (
              t('common.delete')
            )}
          </button>
        </div>
      </Modal>
    </>
  );
}
