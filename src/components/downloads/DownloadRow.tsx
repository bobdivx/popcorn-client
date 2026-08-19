import { Download, Upload, Pause, Play, Trash2, ChevronRight, Film } from 'lucide-preact';
import type { ClientTorrentStats } from '../../lib/client/types';
import { useI18n } from '../../lib/i18n/useI18n';
import { TorrentStatusBadge } from '../torrents/ui';
import { formatBytes, formatSpeed, formatETA } from '../../lib/utils/formatBytes';
import { isTorrentActivelySeeding } from '../../lib/utils/torrentSeeding';
import { derivePlaybackPhase } from '../streaming/player-shared/derivePlaybackPhase';

interface DownloadRowProps {
  torrent: ClientTorrentStats;
  posterUrl?: string | null;
  displayTitle?: string | null;
  busy?: boolean;
  onOpenDetail: (torrent: ClientTorrentStats, posterUrl?: string | null, backdropUrl?: string | null) => void;
  backdropUrl?: string | null;
  onPause: (infoHash: string) => void;
  onResume: (infoHash: string) => void;
  onRemove: (infoHash: string) => void;
}

export function DownloadRow({
  torrent,
  posterUrl,
  backdropUrl,
  displayTitle,
  busy = false,
  onOpenDetail,
  onPause,
  onResume,
  onRemove,
}: DownloadRowProps) {
  const { t } = useI18n();
  const title = (displayTitle && displayTitle.trim()) || torrent.tmdb_title || torrent.name || '';
  const canPause = torrent.state === 'downloading' || torrent.state === 'seeding' || torrent.state === 'queued';
  const canResume = torrent.state === 'paused' || torrent.state === 'error';
  const phaseDerived = derivePlaybackPhase({
    playStatus:
      torrent.state === 'queued'
        ? 'adding'
        : torrent.state === 'downloading'
          ? 'downloading'
          : torrent.state === 'error'
            ? 'error'
            : torrent.state === 'completed' || torrent.state === 'seeding'
              ? 'ready'
              : 'idle',
    torrentStats: torrent,
    isActiveSession: true,
  });
  const percent = phaseDerived.progressPercent ?? Math.round((torrent.progress ?? 0) * 1000) / 10;
  const activeSeeding = isTorrentActivelySeeding(torrent);

  return (
    <div className="dl-row flex items-stretch gap-3 sm:gap-4 rounded-2xl border border-[var(--ds-border)] bg-[var(--ds-surface-elevated)] p-2.5 sm:p-3">
      <button
        type="button"
        className="flex min-w-0 flex-1 items-stretch gap-3 sm:gap-4 text-left rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)]"
        data-focusable
        data-tv-list-primary
        tabIndex={0}
        onClick={() => onOpenDetail(torrent, posterUrl, backdropUrl)}
        aria-label={`${title} — ${t('common.details')}`}
      >
        <div className="relative h-[72px] w-[48px] sm:h-[84px] sm:w-[56px] shrink-0 overflow-hidden rounded-xl bg-[var(--ds-surface)]">
          {posterUrl ? (
            <img src={posterUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[var(--ds-text-tertiary)]">
              <Film className="h-5 w-5" size={20} />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 py-0.5">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <TorrentStatusBadge
              state={torrent.state}
              seedingActive={activeSeeding}
              className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide border border-[var(--ds-border)] text-[var(--ds-text-secondary)]"
            />
            {torrent.download_speed > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold tabular-nums text-[var(--ds-accent-violet)]">
                <Download className="h-3 w-3" size={12} />
                {formatSpeed(torrent.download_speed)}
              </span>
            )}
            {torrent.upload_speed > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold tabular-nums text-[var(--ds-accent-green)]">
                <Upload className="h-3 w-3" size={12} />
                {formatSpeed(torrent.upload_speed)}
              </span>
            )}
          </div>
          <p className="truncate text-sm sm:text-base font-semibold text-[var(--ds-text-primary)]" title={title}>
            {title}
          </p>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--ds-border)]">
            <div
              className="h-full rounded-full bg-[var(--ds-accent-violet)]"
              style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
            />
          </div>
          <p className="mt-1 text-[11px] sm:text-xs text-[var(--ds-text-tertiary)] tabular-nums">
            {percent.toFixed(1)}%
            {torrent.total_bytes > 0
              ? ` · ${formatBytes(torrent.downloaded_bytes)} / ${formatBytes(torrent.total_bytes)}`
              : ''}
            {torrent.eta_seconds && torrent.eta_seconds > 0 ? ` · ETA ${formatETA(torrent.eta_seconds)}` : ''}
          </p>
        </div>
      </button>

      <div className="flex shrink-0 flex-col sm:flex-row items-center justify-center gap-1.5">
        {canPause && (
          <button
            type="button"
            data-focusable
            tabIndex={0}
            disabled={busy}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--ds-border)] text-[var(--ds-text-secondary)] hover:bg-[var(--ds-surface)] disabled:opacity-50"
            aria-label={t('common.pause')}
            title={t('common.pause')}
            onClick={() => onPause(torrent.info_hash)}
          >
            <Pause className="h-4 w-4" size={16} />
          </button>
        )}
        {canResume && (
          <button
            type="button"
            data-focusable
            tabIndex={0}
            disabled={busy}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--ds-border)] text-[var(--ds-text-secondary)] hover:bg-[var(--ds-surface)] disabled:opacity-50"
            aria-label={t('common.resume')}
            title={t('common.resume')}
            onClick={() => onResume(torrent.info_hash)}
          >
            <Play className="h-4 w-4" size={16} />
          </button>
        )}
        <button
          type="button"
          data-focusable
          tabIndex={0}
          disabled={busy}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--ds-border)] text-[var(--ds-accent-red)] hover:bg-[var(--ds-surface)] disabled:opacity-50"
          aria-label={t('common.delete')}
          title={t('common.delete')}
          onClick={() => onRemove(torrent.info_hash)}
        >
          <Trash2 className="h-4 w-4" size={16} />
        </button>
        <button
          type="button"
          data-focusable
          tabIndex={0}
          className="hidden sm:inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--ds-border)] text-[var(--ds-text-tertiary)] hover:bg-[var(--ds-surface)]"
          aria-label={t('common.details')}
          title={t('common.details')}
          onClick={() => onOpenDetail(torrent, posterUrl, backdropUrl)}
        >
          <ChevronRight className="h-4 w-4" size={16} />
        </button>
      </div>
    </div>
  );
}
