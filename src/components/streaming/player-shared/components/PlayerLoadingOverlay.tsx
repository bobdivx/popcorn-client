import { useI18n } from '../../../../lib/i18n/useI18n';
import { PlaybackStatusSurface } from './PlaybackStatusSurface';
import type { PlaybackPipelineStatus } from '../../../../lib/streaming/playbackPipeline';
import type { PlaybackLiveTraceState } from '../hooks/usePlaybackLiveTrace';
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
  /** Annuler vraiment le téléchargement (retirer le torrent). */
  onAbortDownload?: () => void;
  cancelLabel?: string;
  isHlsPreparing?: boolean;
  hasVideoFiles?: boolean;
  posterUrl?: string | null;
  imageUrl?: string | null;
  pipelineStatus?: PlaybackPipelineStatus | null;
  debugLogsUrl?: string | null;
  liveTrace?: PlaybackLiveTraceState | null;
}

export default function PlayerLoadingOverlay({
  message,
  title,
  progressMessage,
  torrentStats,
  onCancel,
  onAbortDownload,
  cancelLabel,
  isHlsPreparing = true,
  hasVideoFiles,
  posterUrl,
  imageUrl,
  pipelineStatus = null,
  debugLogsUrl = null,
  liveTrace = null,
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
      pipelineStatus={pipelineStatus}
      debugLogsUrl={debugLogsUrl}
      liveTrace={liveTrace}
      onCancel={onCancel}
      onAbortDownload={onAbortDownload}
      cancelLabel={cancelLabel || t('common.cancel') || 'Annuler'}
    />
  );
}
