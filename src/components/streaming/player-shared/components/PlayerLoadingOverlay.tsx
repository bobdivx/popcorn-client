import { useI18n } from '../../../../lib/i18n/useI18n';
import { PlaybackStatusSurface } from './PlaybackStatusSurface';
import { derivePlaybackPhase } from '../derivePlaybackPhase';

/** Stats torrent minimales pour affichage en temps réel dans l'overlay. */
export interface PlayerLoadingTorrentStats {
  progress?: number;
  state?: string;
  download_speed?: number;
  downloaded_bytes?: number;
  total_bytes?: number;
  eta_seconds?: number;
  peers_connected?: number;
  peers_total?: number;
  seeders?: number;
  files_available?: boolean;
}

interface PlayerLoadingOverlayProps {
  message: string;
  title?: string | null;
  loadingStep?: number;
  progressMessage?: string;
  torrentStats?: PlayerLoadingTorrentStats | null;
  onCancel?: () => void;
  cancelLabel?: string;
  isHlsPreparing?: boolean;
  hasVideoFiles?: boolean;
  posterUrl?: string | null;
  imageUrl?: string | null;
}

export default function PlayerLoadingOverlay({
  message,
  title,
  progressMessage,
  torrentStats,
  onCancel,
  cancelLabel,
  isHlsPreparing = true,
  hasVideoFiles,
  posterUrl,
  imageUrl,
}: PlayerLoadingOverlayProps) {
  const { t } = useI18n();
  const derived = derivePlaybackPhase({
    torrentStats,
    isHlsPreparing,
    hasVideoFiles,
    isActiveSession: true,
  });

  const playStatus =
    derived.phase === 'preparingPlayback'
      ? 'ready'
      : derived.phase === 'findingPeers' || derived.phase === 'downloading'
        ? 'downloading'
        : derived.phase === 'resolving'
          ? 'adding'
          : 'adding';

  return (
    <PlaybackStatusSurface
      variant="player"
      playStatus={playStatus}
      torrentStats={torrentStats}
      progressMessage={progressMessage || message}
      title={title}
      posterUrl={posterUrl}
      imageUrl={imageUrl || posterUrl}
      isHlsPreparing={isHlsPreparing || derived.isReallyComplete}
      hasVideoFiles={hasVideoFiles}
      isActiveSession
      onCancel={onCancel}
      cancelLabel={cancelLabel || t('common.close') || 'Fermer'}
    />
  );
}
