import { formatBytes, formatSpeed, formatTimeRemaining } from '../../../../lib/utils/formatBytes';
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
  torrentStats: PlayerLoadingTorrentStats | null | undefined
): DerivedTorrentOverlayStats {
  const isCompleted =
    torrentStats != null &&
    (torrentStats.state === 'completed' ||
      torrentStats.state === 'seeding' ||
      (torrentStats.progress != null && torrentStats.progress >= 0.99));

  const isActivelyDownloading =
    torrentStats != null &&
    !isCompleted &&
    (torrentStats.state === 'downloading' ||
      (torrentStats.download_speed ?? 0) > 0 ||
      (torrentStats.progress != null && torrentStats.progress > 0 && torrentStats.progress < 0.99));

  const progressFromBytes =
    torrentStats?.total_bytes != null &&
    torrentStats.total_bytes > 0 &&
    torrentStats?.downloaded_bytes != null
      ? (torrentStats.downloaded_bytes / torrentStats.total_bytes) * 100
      : null;

  const progressPercent =
    progressFromBytes != null
      ? Math.round(progressFromBytes * 10) / 10
      : torrentStats?.progress != null
        ? Math.round(torrentStats.progress * 100 * 10) / 10
        : null;

  const downloadSpeedLabel =
    torrentStats?.download_speed != null && torrentStats.download_speed > 0
      ? formatSpeed(torrentStats.download_speed)
      : null;

  const downloadedFormatted =
    torrentStats?.downloaded_bytes != null ? formatBytes(torrentStats.downloaded_bytes) : null;
  const totalFormatted =
    torrentStats?.total_bytes != null ? formatBytes(torrentStats.total_bytes) : null;
  const etaFormatted =
    torrentStats?.eta_seconds != null && torrentStats.eta_seconds > 0
      ? formatTimeRemaining(torrentStats.eta_seconds)
      : null;

  const showStats =
    isActivelyDownloading &&
    torrentStats != null &&
    (progressPercent != null ||
      downloadSpeedLabel != null ||
      (downloadedFormatted != null && totalFormatted != null) ||
      (torrentStats.download_speed ?? 0) > 0);

  return {
    isCompleted,
    isActivelyDownloading,
    progressPercent,
    downloadSpeedLabel,
    downloadedFormatted,
    totalFormatted,
    etaFormatted,
    showStats,
  };
}
