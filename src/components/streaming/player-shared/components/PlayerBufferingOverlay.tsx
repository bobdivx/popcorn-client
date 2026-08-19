import { useI18n } from '../../../../lib/i18n/useI18n';
import type { PlayerLoadingTorrentStats } from './PlayerLoadingOverlay';
import { PlaybackStatusSurface } from './PlaybackStatusSurface';
import type { PlaybackPipelineStatus } from '../../../../lib/streaming/playbackPipeline';

export interface PlayerBufferingOverlayProps {
  title?: string | null;
  /** null = indéterminé (préparation HLS locale, pas un faux 85–100 %). */
  bufferedPercent?: number | null;
  message?: string | null;
  detailMessage?: string | null;
  torrentStats?: PlayerLoadingTorrentStats | null;
  onClose?: () => void;
  closeLabel?: string;
  badge?: string | null;
  posterUrl?: string | null;
  imageUrl?: string | null;
  pipelineStatus?: PlaybackPipelineStatus | null;
  debugLogsUrl?: string | null;
}

/**
 * Overlay buffering in-player — même surface glass que le loading.
 */
export default function PlayerBufferingOverlay({
  title,
  bufferedPercent = null,
  message,
  detailMessage,
  torrentStats,
  onClose,
  closeLabel,
  posterUrl,
  imageUrl,
  pipelineStatus = null,
  debugLogsUrl = null,
}: PlayerBufferingOverlayProps) {
  const { t } = useI18n();

  return (
    <PlaybackStatusSurface
      variant="player"
      playStatus="buffering"
      torrentStats={torrentStats}
      progressMessage={detailMessage || message || undefined}
      title={title}
      posterUrl={posterUrl}
      imageUrl={imageUrl || posterUrl}
      isBuffering
      isActiveSession
      bufferedPercent={bufferedPercent}
      pipelineStatus={pipelineStatus}
      debugLogsUrl={debugLogsUrl}
      onCancel={onClose}
      cancelLabel={closeLabel || t('common.close') || 'Fermer'}
    />
  );
}
