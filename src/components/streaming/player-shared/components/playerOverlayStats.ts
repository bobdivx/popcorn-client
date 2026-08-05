import { formatBytes, formatSpeed, formatTimeRemaining } from '../../../../lib/utils/formatBytes';
import {
  computeReliableProgressPercent,
  derivePlaybackPhase,
  isTorrentReallyComplete,
  type PlaybackStatsLike,
} from '../derivePlaybackPhase';
import type { PlayerLoadingTorrentStats } from './PlayerLoadingOverlay';

export interface DerivedTorrentOverlayStats {
  isCompleted: boolean;
  isActivelyDownloading: boolean;
  progressPercent: number | null;
  downloadSpeedLabel: string | null;
  downloadedFormatted: string | null;
  totalFormatted: string | null;
  etaFormatted: string | null;
  showStats: boolean;
}

/** Dérive les stats affichables pour les overlays player (loading / buffering). */
export function deriveTorrentOverlayStats(
  torrentStats: PlayerLoadingTorrentStats | null | undefined,
  opts?: { hasVideoFiles?: boolean; isHlsPreparing?: boolean; isBuffering?: boolean },
): DerivedTorrentOverlayStats {
  const stats = torrentStats as PlaybackStatsLike | null | undefined;
  const derived = derivePlaybackPhase({
    torrentStats: stats,
    hasVideoFiles: opts?.hasVideoFiles,
    isHlsPreparing: opts?.isHlsPreparing,
    isBuffering: opts?.isBuffering,
  });

  const isCompleted = isTorrentReallyComplete(stats, { hasVideoFiles: opts?.hasVideoFiles });
  const progressPercent = computeReliableProgressPercent(stats);

  const downloadSpeedLabel =
    torrentStats?.download_speed != null && torrentStats.download_speed > 0
      ? formatSpeed(torrentStats.download_speed)
      : null;

  const downloadedFormatted =
    torrentStats?.downloaded_bytes != null ? formatBytes(torrentStats.downloaded_bytes) : null;
  const totalFormatted =
    torrentStats?.total_bytes != null && torrentStats.total_bytes > 0
      ? formatBytes(torrentStats.total_bytes)
      : null;
  const etaFormatted =
    torrentStats?.eta_seconds != null && torrentStats.eta_seconds > 0
      ? formatTimeRemaining(torrentStats.eta_seconds)
      : null;

  const showStats =
    derived.isActivelyDownloading &&
    torrentStats != null &&
    (progressPercent != null ||
      downloadSpeedLabel != null ||
      (downloadedFormatted != null && totalFormatted != null));

  return {
    isCompleted,
    isActivelyDownloading: derived.isActivelyDownloading,
    progressPercent,
    downloadSpeedLabel,
    downloadedFormatted,
    totalFormatted,
    etaFormatted,
    showStats,
  };
}
