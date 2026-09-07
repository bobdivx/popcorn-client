import { useState, useRef } from 'preact/hooks';
import { Download, Upload, Sprout, Users, Film, Pause, Play } from 'lucide-preact';
import type { ClientTorrentStats } from '../../lib/client/types';
import { FocusableCard } from '../ui/FocusableCard';
import { useI18n } from '../../lib/i18n/useI18n';
import { TorrentStatusBadge } from '../torrents/ui';
import { formatBytes, formatSpeed, formatETA } from '../../lib/utils/formatBytes';
import { isTorrentActivelySeeding } from '../../lib/utils/torrentSeeding';
import {
  PLAYBACK_PHASE_I18N_KEYS,
  derivePlaybackPhase,
} from '../streaming/player-shared/derivePlaybackPhase';
import { tvBrowseItemKey } from '../../lib/tv-browse-restore';

/** Nettoie le nom brut du torrent pour affichage (sans codec, résolution, etc.) */
function cleanTorrentName(name: string | undefined): string {
  if (!name || !name.trim()) return '';
  return name
    .replace(/\./g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\d{4}\b/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\b(?:x264|x265|HEVC|HDR|DTS|AC3|BluRay|WEB-DL|REMUX|4K|1080p|720p|480p|BDRip|WEBRip|DVDRip|FRENCH|VOSTFR|VF)\b/gi, '')
    .replace(/S\d{2}E\d{2}/gi, '')
    .replace(/Season\s+\d+/gi, '')
    .trim();
}

interface DownloadCardProps {
  torrent: ClientTorrentStats;
  posterUrl?: string | null;
  backdropUrl?: string | null;
  displayTitle?: string | null;
  busy?: boolean;
  onOpenDetail?: (torrent: ClientTorrentStats, posterUrl?: string | null, backdropUrl?: string | null) => void;
  onPause?: (infoHash: string) => void;
  onResume?: (infoHash: string) => void;
}

export function DownloadCard({
  torrent,
  posterUrl: posterUrlProp,
  backdropUrl: backdropUrlProp,
  displayTitle: displayTitleProp,
  busy = false,
  onOpenDetail,
  onPause,
  onResume,
}: DownloadCardProps) {
  const { t } = useI18n();
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const cardContainerRef = useRef<HTMLDivElement>(null);

  const posterUrl = posterUrlProp ?? null;
  const backdropUrl = backdropUrlProp ?? null;
  const displayTitle =
    (displayTitleProp && displayTitleProp.trim()) || cleanTorrentName(torrent.name) || torrent.name || '';

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
  const reliablePercent = phaseDerived.progressPercent ?? Math.round((torrent.progress ?? 0) * 1000) / 10;

  const progressTone =
    phaseDerived.phase === 'downloading' || phaseDerived.phase === 'findingPeers'
      ? 'from-[var(--ds-accent-violet)] to-sky-400'
      : phaseDerived.phase === 'ready' || torrent.state === 'seeding' || torrent.state === 'completed'
        ? 'from-[var(--ds-accent-green)] to-emerald-300'
        : torrent.state === 'error'
          ? 'from-[var(--ds-accent-red)] to-rose-400'
          : 'from-white/40 to-white/20';

  const isActive = torrent.state === 'downloading' || torrent.state === 'seeding';
  const showPulse = isActive && (torrent.download_speed > 0 || torrent.upload_speed > 0);
  const showChrome = isHovered || isFocused;
  /** Pause/resume au survol souris seulement (pas au focus TV). */
  const showQuickActions = isHovered;
  const activeSeeding = isTorrentActivelySeeding(torrent);
  const phaseLabel = t(PLAYBACK_PHASE_I18N_KEYS[phaseDerived.phase]) || '';
  const canPause = torrent.state === 'downloading' || torrent.state === 'seeding' || torrent.state === 'queued';
  const canResume = torrent.state === 'paused' || torrent.state === 'error';

  return (
    <div
      ref={cardContainerRef}
      data-torrent-card
      data-download-card
      data-tv-item-key={tvBrowseItemKey({ info_hash: torrent.info_hash })}
      className="relative w-full max-w-full h-full"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <FocusableCard
        className={`group dl-card text-left rounded-2xl tv:rounded-3xl overflow-hidden border transition-[border-color,box-shadow,transform,background-color] duration-300 focus:outline-none w-full h-full block ${
          isFocused || isHovered
            ? 'border-[var(--ds-accent-violet)]/55 bg-[var(--ds-accent-violet-muted)] shadow-[0_18px_48px_rgba(0,0,0,0.35)]'
            : 'border-white/10 bg-white/[0.04] hover:border-white/20 hover:bg-white/[0.07]'
        }`}
        tabIndex={0}
        ariaLabel={displayTitle || torrent.name}
        onFocus={(e) => {
          setIsFocused(true);
          (e.currentTarget as HTMLElement).scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
        }}
        onBlur={() => {
          setIsFocused(false);
        }}
        onClick={(e) => {
          if (onOpenDetail && !(e.target as HTMLElement).closest('button, a')) {
            onOpenDetail(torrent, posterUrl, backdropUrl);
          }
        }}
      >
        <div className="relative aspect-video w-full overflow-hidden bg-black/40">
          {backdropUrl ? (
            <img
              src={backdropUrl}
              alt=""
              loading="lazy"
              className={`absolute inset-0 w-full h-full object-cover z-0 transition-transform duration-700 ease-out ${
                showChrome ? 'scale-105' : 'scale-100'
              }`}
            />
          ) : posterUrl ? (
            <img
              src={posterUrl}
              alt=""
              loading="lazy"
              className={`absolute inset-0 w-full h-full object-cover z-0 transition-transform duration-700 ease-out ${
                showChrome ? 'scale-105' : 'scale-100'
              }`}
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-white/10 via-black/50 to-black/90 z-0 p-2 text-white/25">
              <Film className="w-10 h-10 tv:w-14 tv:h-14 mb-2 shrink-0" size={48} />
            </div>
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/35 to-black/10 z-10" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(59,106,225,0.18),transparent_55%)] z-10 pointer-events-none" />

          <div className="absolute left-3 top-3 tv:left-4 tv:top-4 z-20 flex flex-wrap gap-1.5 items-start max-w-[70%]">
            <TorrentStatusBadge
              state={torrent.state}
              seedingActive={activeSeeding}
              className="px-2.5 py-1 tv:px-3.5 tv:py-1.5 rounded-full text-[10px] tv:text-sm font-bold tracking-wide bg-black/50 border border-white/15 text-white/95 backdrop-blur-md"
            />
            {phaseLabel &&
            (phaseDerived.phase === 'findingPeers' ||
              phaseDerived.phase === 'resolving' ||
              phaseDerived.phase === 'downloading') ? (
              <span className="px-2.5 py-1 tv:px-3.5 tv:py-1.5 rounded-full text-[10px] tv:text-sm font-semibold tracking-wide bg-black/50 border border-white/12 text-white/85 backdrop-blur-md">
                {phaseLabel}
                {phaseDerived.phase === 'downloading' && reliablePercent != null
                  ? ` · ${Math.round(reliablePercent)}%`
                  : ''}
              </span>
            ) : null}
          </div>

          <div className="absolute top-3 right-3 tv:top-4 tv:right-4 z-20 flex flex-col gap-1.5 items-end">
            {torrent.download_speed > 0 && (
              <div className="bg-[var(--ds-accent-violet)]/95 backdrop-blur-sm rounded-full px-2.5 py-1 tv:px-3.5 tv:py-1.5 flex items-center gap-1.5 text-[10px] tv:text-sm text-[var(--ds-text-on-accent)] shadow-lg border border-white/15">
                <Download className="w-3 h-3 tv:w-4 tv:h-4" strokeWidth={2.5} size={14} />
                <span className="font-semibold tracking-wide tabular-nums">{formatSpeed(torrent.download_speed)}</span>
              </div>
            )}
            {torrent.upload_speed > 0 && (
              <div className="bg-[var(--ds-accent-green)]/95 backdrop-blur-sm rounded-full px-2.5 py-1 tv:px-3.5 tv:py-1.5 flex items-center gap-1.5 text-[10px] tv:text-sm text-[var(--ds-text-on-accent)] shadow-lg border border-white/15">
                <Upload className="w-3 h-3 tv:w-4 tv:h-4" strokeWidth={2.5} size={14} />
                <span className="font-semibold tracking-wide tabular-nums">{formatSpeed(torrent.upload_speed)}</span>
              </div>
            )}
            {torrent.seeders > 0 && (
              <div className="bg-black/55 backdrop-blur-sm rounded-full px-2.5 py-1 tv:px-3 tv:py-1.5 flex items-center gap-1.5 text-[10px] tv:text-sm text-white/90 border border-white/12">
                <Sprout className="w-3 h-3 tv:w-4 tv:h-4 text-[var(--ds-accent-green)]" strokeWidth={2.5} size={14} />
                <span className="font-semibold tabular-nums">{torrent.seeders}</span>
              </div>
            )}
            {(torrent.peers_connected > 0 || torrent.peers_total > 0) && (
              <div className="bg-black/55 backdrop-blur-sm rounded-full px-2.5 py-1 tv:px-3 tv:py-1.5 flex items-center gap-1.5 text-[10px] tv:text-sm text-white/90 border border-white/12">
                <Users className="w-3 h-3 tv:w-4 tv:h-4" strokeWidth={2.5} size={14} />
                <span className="font-semibold tabular-nums">{torrent.peers_connected || torrent.peers_total}</span>
              </div>
            )}
          </div>

          {(canPause || canResume) && (onPause || onResume) && (
            <div
              className={`dl-quick-actions absolute inset-0 z-30 flex items-center justify-center gap-3 bg-black/35 backdrop-blur-[2px] transition-opacity duration-200 ${
                showQuickActions ? 'opacity-100' : 'opacity-0 pointer-events-none'
              }`}
            >
              {canPause && onPause && (
                <button
                  type="button"
                  data-focusable
                  tabIndex={0}
                  disabled={busy}
                  aria-label={t('common.pause')}
                  className="inline-flex h-12 w-12 tv:h-16 tv:w-16 items-center justify-center rounded-full border border-white/25 bg-black/55 text-white hover:bg-[var(--ds-accent-violet)] disabled:opacity-40 ds-focus-glow"
                  onClick={(e) => {
                    e.stopPropagation();
                    onPause(torrent.info_hash);
                  }}
                >
                  <Pause className="h-5 w-5 tv:h-7 tv:w-7" size={22} />
                </button>
              )}
              {canResume && onResume && (
                <button
                  type="button"
                  data-focusable
                  tabIndex={0}
                  disabled={busy}
                  aria-label={t('common.resume')}
                  className="inline-flex h-12 w-12 tv:h-16 tv:w-16 items-center justify-center rounded-full border border-white/25 bg-black/55 text-white hover:bg-[var(--ds-accent-green)] disabled:opacity-40 ds-focus-glow"
                  onClick={(e) => {
                    e.stopPropagation();
                    onResume(torrent.info_hash);
                  }}
                >
                  <Play className="h-5 w-5 tv:h-7 tv:w-7 ml-0.5" size={22} />
                </button>
              )}
            </div>
          )}

          <div className="absolute left-3 right-3 bottom-3 tv:left-4 tv:right-4 tv:bottom-4 z-20">
            <div className="flex items-end justify-between gap-3 mb-2">
              <span className="text-lg tv:text-2xl font-bold tabular-nums text-white drop-shadow-md">
                {reliablePercent != null ? `${Math.round(reliablePercent)}%` : '—'}
              </span>
              {torrent.eta_seconds && torrent.eta_seconds > 0 ? (
                <span className="text-[11px] tv:text-sm font-medium text-white/75 tabular-nums">
                  ETA {formatETA(torrent.eta_seconds)}
                </span>
              ) : null}
            </div>
            <div className="h-1.5 tv:h-2.5 w-full overflow-hidden rounded-full bg-white/15">
              <div
                className={`h-full rounded-full bg-gradient-to-r ${progressTone} transition-[width] duration-500 ease-out ${
                  showPulse ? 'animate-[pulse_2s_ease-in-out_infinite]' : ''
                }`}
                style={{ width: `${Math.min(100, Math.max(0, reliablePercent))}%` }}
              />
            </div>
          </div>
        </div>

        <div className="p-3 sm:p-4 tv:p-5 relative z-10 text-left">
          <div
            className="text-sm sm:text-base tv:text-xl font-semibold text-white/95 line-clamp-2 leading-snug"
            title={displayTitle}
          >
            {displayTitle || torrent.name}
          </div>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] sm:text-xs tv:text-sm text-white/55 mt-2">
            <span className="tabular-nums">
              {torrent.total_bytes > 0
                ? `${formatBytes(torrent.downloaded_bytes)} / ${formatBytes(torrent.total_bytes)}`
                : t('playback.metric.na')}
            </span>
            {torrent.is_private ? (
              <>
                <span className="w-1 h-1 rounded-full bg-white/25" />
                <span className="text-[var(--ds-accent-yellow)] font-medium">Privé</span>
              </>
            ) : null}
          </div>

          {torrent.status_reason ? (
            <div className="text-xs tv:text-sm text-[var(--ds-accent-yellow)] mt-2 line-clamp-1 opacity-90">
              {torrent.status_reason}
            </div>
          ) : null}
        </div>
      </FocusableCard>
    </div>
  );
}
