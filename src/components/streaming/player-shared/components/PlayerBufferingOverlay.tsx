import { useI18n } from '../../../../lib/i18n/useI18n';
import type { PlayerLoadingTorrentStats } from './PlayerLoadingOverlay';
import { PlaybackStatusSurface } from './PlaybackStatusSurface';

export interface PlayerBufferingOverlayProps {
  title?: string | null;
  bufferedPercent?: number;
  message?: string | null;
  detailMessage?: string | null;
  torrentStats?: PlayerLoadingTorrentStats | null;
  onClose?: () => void;
  closeLabel?: string;
  badge?: string | null;
  posterUrl?: string | null;
  imageUrl?: string | null;
}

/**
 * Overlay buffering in-player — même surface glass que le loading.
 */
export default function PlayerBufferingOverlay({
  title,
  bufferedPercent = 0,
  message,
  detailMessage,
  torrentStats,
  onClose,
  closeLabel,
  posterUrl,
  imageUrl,
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
      onCancel={onClose}
      cancelLabel={closeLabel || t('common.close') || 'Fermer'}
    />
  );
}
