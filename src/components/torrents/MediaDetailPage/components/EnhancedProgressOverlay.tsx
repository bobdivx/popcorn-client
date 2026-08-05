import type { PlayStatus, DebugLog } from '../types';
import type { ClientTorrentStats } from '../../../../lib/client/types';
import { PlaybackStatusSurface } from '../../../streaming/player-shared/components/PlaybackStatusSurface';

interface EnhancedProgressOverlayProps {
  playStatus: PlayStatus;
  torrentStats: ClientTorrentStats | null;
  progressMessage: string;
  errorMessage: string | null;
  /** Backdrop / hero (fond flou). */
  imageUrl: string | null;
  /** Affiche portrait TMDB. */
  posterUrl?: string | null;
  showDebug: boolean;
  debugLogs: DebugLog[];
  onCancel: () => void;
  onContinueInBackground?: () => void;
  onRetry: () => void;
  onToggleDebug: () => void;
  onCopyLogs: () => void;
  onClearLogs: () => void;
  title?: string | null;
  hasVideoFiles?: boolean;
  isHlsPreparing?: boolean;
}

/** Overlay plein écran — délègue à PlaybackStatusSurface (glass). */
export function EnhancedProgressOverlay({
  playStatus,
  torrentStats,
  progressMessage,
  errorMessage,
  imageUrl,
  posterUrl,
  showDebug,
  debugLogs,
  onCancel,
  onContinueInBackground,
  onRetry,
  onToggleDebug,
  onCopyLogs,
  onClearLogs,
  title,
  hasVideoFiles,
  isHlsPreparing,
}: EnhancedProgressOverlayProps) {
  return (
    <PlaybackStatusSurface
      variant="fullscreen"
      playStatus={playStatus}
      torrentStats={torrentStats}
      progressMessage={progressMessage}
      errorMessage={errorMessage}
      imageUrl={imageUrl}
      posterUrl={posterUrl ?? imageUrl}
      title={title}
      showDebug={showDebug}
      debugLogs={debugLogs}
      hasVideoFiles={hasVideoFiles}
      isHlsPreparing={isHlsPreparing}
      isActiveSession
      onCancel={onCancel}
      onContinueInBackground={onContinueInBackground}
      onRetry={onRetry}
      onToggleDebug={onToggleDebug}
      onCopyLogs={onCopyLogs}
      onClearLogs={onClearLogs}
    />
  );
}
