import { useI18n } from '../../../../lib/i18n/useI18n';
import type { PlayerLoadingTorrentStats } from './PlayerLoadingOverlay';
import { deriveTorrentOverlayStats } from './playerOverlayStats';

export interface TorrentStatsBlockProps {
  torrentStats: PlayerLoadingTorrentStats;
  /** Style carte (buffering) vs liste simple (loading). */
  variant?: 'plain' | 'card';
  /** Couleur de la barre : primary (loading) ou emerald (buffering download). */
  barTone?: 'primary' | 'emerald';
}

/** Bloc progression torrent partagé (loading / buffering overlays). */
export function TorrentStatsBlock({
  torrentStats,
  variant = 'plain',
  barTone = 'primary',
}: TorrentStatsBlockProps) {
  const { t } = useI18n();
  const stats = deriveTorrentOverlayStats(torrentStats);
  if (!stats.showStats) return null;

  const barClass = barTone === 'emerald' ? 'bg-emerald-500' : 'bg-primary-500';
  const wrapperClass =
    variant === 'card'
      ? 'mt-5 w-full max-w-xs space-y-2 rounded-xl bg-white/5 border border-white/10 px-4 py-3'
      : 'mt-6 w-full max-w-xs space-y-2';

  return (
    <div className={wrapperClass}>
      {(stats.progressPercent != null ||
        (stats.downloadedFormatted != null && stats.totalFormatted != null)) && (
        <>
          <div className="flex justify-between text-sm text-white/70">
            <span>
              {variant === 'card'
                ? `${t('playback.downloadProgress') || 'Téléchargement'} ${
                    stats.progressPercent != null ? `${stats.progressPercent}%` : ''
                  }`
                : `${stats.progressPercent ?? 0}%`}
            </span>
            {stats.downloadedFormatted != null && stats.totalFormatted != null && (
              <span className={variant === 'card' ? 'text-white/50' : undefined}>
                {stats.downloadedFormatted} / {stats.totalFormatted}
              </span>
            )}
          </div>
          {stats.progressPercent != null && (
            <div
              className={`w-full bg-white/10 rounded-full ${variant === 'card' ? 'h-1.5' : 'h-2'} overflow-hidden`}
            >
              <div
                className={`${barClass} h-full rounded-full transition-[width] duration-300`}
                style={{ width: `${Math.min(100, stats.progressPercent)}%` }}
                role="progressbar"
                aria-valuenow={stats.progressPercent}
                aria-valuemin={0}
                aria-valuemax={100}
              />
            </div>
          )}
        </>
      )}
      <div
        className={`flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-white/60 ${
          variant === 'card' ? 'pt-1' : ''
        }`}
      >
        {stats.downloadSpeedLabel && (
          <span>
            {variant === 'card' ? `${t('playback.downloadSpeed') || 'Vitesse'} ` : ''}
            {stats.downloadSpeedLabel}
          </span>
        )}
        {stats.etaFormatted && (
          <span>
            {t('torrentStats.eta') || 'Temps restant'} {stats.etaFormatted}
          </span>
        )}
        {(torrentStats.peers_connected != null || torrentStats.peers_total != null) && (
          <span>
            {t('downloads.stats.peers') || 'Peers'} {torrentStats.peers_connected ?? 0}/
            {torrentStats.peers_total ?? 0}
          </span>
        )}
        {(torrentStats.seeders ?? 0) > 0 && (
          <span>
            {t('downloads.stats.seeders') || 'Seeders'} {torrentStats.seeders}
          </span>
        )}
      </div>
    </div>
  );
}
