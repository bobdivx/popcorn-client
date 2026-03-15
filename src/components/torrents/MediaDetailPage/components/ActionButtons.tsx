import { Play, RotateCw, Download, Link2, Check, Trash2, Loader2, Upload, XCircle, Radio, Bookmark, BookmarkCheck } from 'lucide-preact';
import type { MediaDetailPageProps } from '../types';
import type { ClientTorrentStats } from '../../../../lib/client/types';
import { TorrentProgressBar, TorrentSpeedDisplay, PeersIndicator } from '../../ui';
import { useI18n } from '../../../../lib/i18n/useI18n';
import { formatBytes, formatTimeRemaining } from '../../../../lib/utils/formatBytes';

interface ActionButtonsProps {
  torrent: MediaDetailPageProps['torrent'];
  allVariants?: MediaDetailPageProps['torrent'][];
  isAvailableLocally: boolean;
  isStreamingThisTorrent?: boolean;
  canStream: boolean;
  isExternal: boolean;
  hasInfoHash: boolean;
  streamingTorrentActive?: boolean;
  magnetCopied: boolean;
  downloadingToClient: boolean;
  deletingMedia: boolean;
  savedPlaybackPosition?: number | null;
  torrentStats?: ClientTorrentStats | null;
  countdownRemaining?: number | null;
  isPackWithMultipleFiles?: boolean;
  selectedPackEpisodePreviewIndex?: number | null;
  onDownloadSingleEpisode?: (fileIndex: number) => void | Promise<void>;
  onPlaySingleEpisode?: (fileIndex: number) => void | Promise<void>;
  onPlay: () => void;
  onPlayAuto?: (bestTorrent: MediaDetailPageProps['torrent']) => void;
  onPlayFromBeginning?: () => void;
  onDownload: () => void;
  onDownloadTorrent: () => void;
  onCancelDownload?: () => void;
  onCopyMagnet: () => void;
  onDeleteMedia: () => void;
  watchLater?: {
    isFavorite: boolean;
    loading: boolean;
    onToggle: () => void | Promise<void>;
  };
}

function selectBestTorrent(variants: MediaDetailPageProps['torrent'][]): MediaDetailPageProps['torrent'] | null {
  if (!variants || variants.length === 0) return null;
  const getQualityScore = (t: MediaDetailPageProps['torrent']): number => {
    let score = 0;
    const quality = t.quality;
    const full = quality?.full?.toUpperCase() || '';
    const resolution = quality?.resolution?.toUpperCase() || '';
    const source = quality?.source?.toUpperCase() || '';
    if (full.includes('REMUX') || source.includes('REMUX') || full.includes('BLURAY')) score += 1000;
    if (resolution === '4K' || resolution === '2160P' || resolution === 'UHD' || resolution.includes('2160')) score += 500;
    else if (resolution === '1080P' || resolution.includes('1080')) score += 300;
    else if (resolution === '720P' || resolution.includes('720')) score += 100;
    if (full.includes('HDR') || full.includes('DOLBY')) score += 50;
    const codec = quality?.codec?.toUpperCase() || '';
    if (codec === 'X265' || codec === 'H265' || codec === 'HEVC') score += 30;
    else if (codec === 'AV1') score += 25;
    else if (codec === 'X264' || codec === 'H264') score += 10;
    score += (t.seedCount || 0) * 0.1;
    return score;
  };
  return [...variants].sort((a, b) => getQualityScore(b) - getQualityScore(a))[0] || null;
}

export function ActionButtons({
  torrent,
  isAvailableLocally,
  isStreamingThisTorrent = false,
  canStream,
  isExternal,
  hasInfoHash,
  streamingTorrentActive = false,
  magnetCopied,
  downloadingToClient,
  deletingMedia,
  savedPlaybackPosition,
  torrentStats,
  countdownRemaining = null,
  isPackWithMultipleFiles = false,
  selectedPackEpisodePreviewIndex = null,
  onDownloadSingleEpisode,
  onPlaySingleEpisode,
  onPlay,
  onPlayFromBeginning,
  onDownload,
  onDownloadTorrent,
  onCancelDownload,
  onCopyMagnet,
  onDeleteMedia,
  watchLater,
}: ActionButtonsProps) {
  const { t } = useI18n();
  const hasSavedPosition = savedPlaybackPosition !== null && savedPlaybackPosition !== undefined && savedPlaybackPosition > 0;

  const stateLower = typeof torrentStats?.state === 'string' ? torrentStats.state.toLowerCase() : '';
  const isDownloading = !!torrentStats && (stateLower === 'downloading' || stateLower === 'queued');
  const isCompleted = !!torrentStats && (stateLower === 'completed' || stateLower === 'seeding');
  const progressValue = typeof torrentStats?.progress === 'number' ? torrentStats.progress : 0;
  const progressPercent = torrentStats ? Math.round(progressValue * 100) : 0;
  const progressComplete = !!(torrentStats && torrentStats.progress >= 0.99);
  const isDownloadComplete = isCompleted || progressComplete;
  const isSeeding = !!torrentStats && stateLower === 'seeding';
  const hasActiveDownloadStats = !!torrentStats && !isDownloadComplete && (
    isDownloading || progressValue > 0 ||
    (torrentStats.download_speed ?? 0) > 0 ||
    (torrentStats.peers_connected ?? 0) > 0 ||
    (torrentStats.downloaded_bytes ?? 0) > 0
  );
  const isDownloadInProgress = (!!torrentStats && !isDownloadComplete) || downloadingToClient;
  const showProgressInButton = hasActiveDownloadStats;
  const displayProgressPercent = hasActiveDownloadStats ? progressPercent : 0;
  const showProgressNextToCancel = !isStreamingThisTorrent && (isDownloadInProgress && !!onCancelDownload && !!torrentStats) && hasActiveDownloadStats;

  const isLocalTorrent =
    torrent.id?.startsWith('local_') ||
    torrent.slug?.startsWith('local_') ||
    torrent.infoHash?.startsWith('local_') ||
    !!(torrent as any).downloadPath;

  const shouldShowButton = !isAvailableLocally || isDownloadComplete || (isAvailableLocally && hasInfoHash) || isLocalTorrent || (streamingTorrentActive && canStream);
  const shouldShowPlayButton =
    isLocalTorrent ||
    (isAvailableLocally && hasInfoHash) ||
    isDownloadComplete ||
    (streamingTorrentActive && canStream);
  const isPlayStreamingMode = shouldShowPlayButton && streamingTorrentActive && canStream && !isAvailableLocally && !isDownloadComplete;
  const showDownloadButtonAlongsidePlay =
    streamingTorrentActive && canStream && shouldShowPlayButton &&
    !isDownloadComplete && !showProgressNextToCancel && !downloadingToClient;

  return (
    <div className="mb-6 space-y-3">
      {/* ── Rangée principale ── */}
      <div className="flex flex-wrap gap-3 tv:gap-4 items-center">

        {/* Bouton Lire / Télécharger — gradient animé, rounded-full */}
        {shouldShowButton && !(isDownloadInProgress && onCancelDownload && showProgressNextToCancel) && (
          <button
            onClick={shouldShowPlayButton ? onPlay : onDownload}
            disabled={countdownRemaining !== null && countdownRemaining > 0}
            title={isPlayStreamingMode ? t('playback.playStreamingLabel') : (shouldShowPlayButton && hasSavedPosition ? t('dashboard.resumeWatching') : undefined)}
            data-focusable
            data-media-detail-primary-action
            data-media-detail-action={shouldShowPlayButton ? 'play' : 'download'}
            tabIndex={0}
            className="gtv-pill-btn ds-focus-glow ds-active-glow ds-sync-active-pulse inline-flex items-center gap-2.5 font-bold text-base tv:text-2xl tv:px-10 tv:py-5 tv:min-h-[68px] disabled:opacity-50 disabled:cursor-not-allowed border border-violet-500/40 hover:border-violet-400/60 hover:bg-violet-900/20"
          >
            {downloadingToClient ? (
              <>
                <Loader2 className="h-5 w-5 tv:h-7 tv:w-7 animate-spin shrink-0" size={20} />
                Ajout...
              </>
            ) : (isDownloading || hasActiveDownloadStats) && !onCancelDownload ? (
              <>
                <Loader2 className="h-5 w-5 tv:h-7 tv:w-7 animate-spin shrink-0" size={20} />
                {showProgressInButton ? `${displayProgressPercent}%` : '0%'}
              </>
            ) : countdownRemaining !== null && countdownRemaining > 0 ? (
              <>
                <Loader2 className="h-5 w-5 tv:h-7 tv:w-7 animate-spin shrink-0" size={20} />
                {countdownRemaining} s...
              </>
            ) : shouldShowPlayButton ? (
              <>
                <Play className="h-5 w-5 tv:h-7 tv:w-7 fill-current shrink-0" size={20} />
                {isPlayStreamingMode && <Radio className="h-4 w-4 opacity-60 shrink-0" size={16} aria-hidden />}
                {hasSavedPosition ? t('playback.resumeLabel') : t('playback.playLabel')}
              </>
            ) : (
              <>
                <Download className="h-5 w-5 tv:h-7 tv:w-7 shrink-0" size={20} />
                {isPackWithMultipleFiles ? 'Télécharger la saison' : t('common.download')}
              </>
            )}
          </button>
        )}

        {/* Télécharger à côté de Lire (streaming) — style glass pill */}
        {showDownloadButtonAlongsidePlay && (
          <button
            type="button"
            onClick={onDownload}
            data-focusable
            data-media-detail-action="download"
            tabIndex={0}
            className="gtv-pill-btn ds-focus-glow ds-active-glow inline-flex items-center gap-2.5 tv:text-xl tv:px-8 tv:py-4 tv:min-h-[68px]"
            title={isPackWithMultipleFiles ? t('playback.downloadFullSeason') : t('common.download')}
          >
            <Download className="h-5 w-5 tv:h-7 tv:w-7 shrink-0" size={20} />
            {isPackWithMultipleFiles ? t('playback.downloadFullSeason') : t('common.download')}
          </button>
        )}

        {/* Carte progression en cours */}
        {showProgressNextToCancel && torrentStats && onCancelDownload && (
          <div
            className="flex items-center gap-3 min-w-[200px] max-w-[340px] flex-1 px-4 py-3.5 rounded-xl border border-violet-500/20 bg-gradient-to-r from-violet-950/60 to-black/40 backdrop-blur-md"
            aria-label={t('downloads.progress')}
          >
            <div className="flex flex-col gap-1.5 flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-white/55 text-xs font-semibold uppercase tracking-wider truncate">
                  {torrentStats.state === 'queued' ? t('torrentStats.queued') : t('torrentStats.downloading')}
                </span>
                <span className="text-lg font-bold tabular-nums text-white shrink-0">{displayProgressPercent}%</span>
              </div>
              <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(100, displayProgressPercent)}%`,
                    background: 'linear-gradient(90deg, #7c3aed, #a78bfa)',
                  }}
                  role="progressbar"
                  aria-valuenow={displayProgressPercent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                />
              </div>
              <div className="flex items-center gap-2 text-xs text-white/40">
                {(torrentStats.download_speed ?? 0) > 0 && (
                  <span>{((torrentStats.download_speed! / (1024 * 1024)).toFixed(1))} MB/s</span>
                )}
                {torrentStats.eta_seconds != null && torrentStats.eta_seconds > 0 && (
                  <span>· {formatTimeRemaining(torrentStats.eta_seconds)}</span>
                )}
                {torrentStats.total_bytes > 0 && (
                  <span>· {formatBytes(torrentStats.downloaded_bytes ?? 0)} / {formatBytes(torrentStats.total_bytes)}</span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={onCancelDownload}
              title={t('downloads.cancelDownload')}
              aria-label={t('downloads.cancelDownload')}
              data-focusable
              data-media-detail-primary-action
              className="gtv-icon-btn ds-focus-glow ds-active-glow shrink-0 w-9 h-9 min-w-9 min-h-9 text-white/60 hover:text-red-400"
            >
              <XCircle className="h-5 w-5" size={20} />
            </button>
          </div>
        )}

        {/* Pack : épisode sélectionné */}
        {isPackWithMultipleFiles && selectedPackEpisodePreviewIndex != null && (onDownloadSingleEpisode != null || (canStream && onPlaySingleEpisode != null)) && (
          <>
            {canStream && onPlaySingleEpisode != null && (
              <button
                type="button"
                onClick={() => void onPlaySingleEpisode(selectedPackEpisodePreviewIndex!)}
                disabled={downloadingToClient}
                title={t('mediaDetail.playThisEpisode')}
                data-focusable
                tabIndex={0}
                className="gtv-pill-btn ds-focus-glow ds-active-glow inline-flex items-center gap-2.5 font-bold text-base disabled:opacity-50 border border-violet-500/40 hover:border-violet-400/60 hover:bg-violet-900/20"
              >
                <Play className="h-5 w-5 fill-current shrink-0" size={20} />
                {t('mediaDetail.playThisEpisode')}
              </button>
            )}
            {onDownloadSingleEpisode != null && (
              <button
                type="button"
                onClick={() => void onDownloadSingleEpisode(selectedPackEpisodePreviewIndex!)}
                disabled={downloadingToClient}
                title={t('mediaDetail.downloadThisEpisode')}
                data-focusable
                tabIndex={0}
                className="gtv-pill-btn ds-focus-glow ds-active-glow inline-flex items-center gap-2.5 disabled:opacity-50"
              >
                {downloadingToClient ? (
                  <Loader2 className="h-5 w-5 animate-spin shrink-0" size={20} />
                ) : (
                  <Download className="h-5 w-5 shrink-0" size={20} />
                )}
                {t('mediaDetail.downloadThisEpisode')}
              </button>
            )}
          </>
        )}

        {/* Pack sans sélection */}
        {isPackWithMultipleFiles && !(selectedPackEpisodePreviewIndex != null && (onDownloadSingleEpisode != null || (canStream && onPlaySingleEpisode != null))) && !shouldShowPlayButton && (
          <button type="button" disabled tabIndex={0}
            className="gtv-pill-btn inline-flex items-center gap-2.5 opacity-40 cursor-not-allowed">
            <Download className="h-5 w-5 shrink-0" size={20} />
            {t('mediaDetail.downloadThisEpisode')}
          </button>
        )}

        {/* ── Séparateur ── */}
        {(watchLater || (torrent._externalMagnetUri || (torrent._externalLink && torrent._externalLink.startsWith('magnet:'))) || ((isAvailableLocally || isDownloadComplete) && hasInfoHash && !isExternal)) && (
          <div className="w-px h-7 bg-white/12 mx-0.5 self-center max-sm:hidden" aria-hidden />
        )}

        {/* À regarder plus tard — icône ronde */}
        {watchLater && (torrent.tmdbId && (torrent.tmdbType === 'movie' || torrent.tmdbType === 'tv')) && (
          <button
            type="button"
            onClick={() => void watchLater.onToggle()}
            disabled={watchLater.loading}
            data-focusable
            tabIndex={0}
            title={watchLater.isFavorite ? t('playback.watchLaterRemove') : t('playback.watchLaterAdd')}
            aria-label={watchLater.isFavorite ? t('playback.watchLaterRemove') : t('playback.watchLaterAdd')}
            aria-pressed={watchLater.isFavorite}
            className={`gtv-icon-btn ds-focus-glow ds-active-glow tv:w-16 tv:h-16 disabled:opacity-50 ${watchLater.isFavorite ? 'text-violet-400 bg-violet-900/30' : ''}`}
          >
            {watchLater.loading ? (
              <Loader2 className="h-5 w-5 tv:h-7 tv:w-7 animate-spin" size={20} />
            ) : watchLater.isFavorite ? (
              <BookmarkCheck className="h-5 w-5 tv:h-7 tv:w-7" size={20} />
            ) : (
              <Bookmark className="h-5 w-5 tv:h-7 tv:w-7" size={20} />
            )}
          </button>
        )}

        {/* Magnet — icône ronde */}
        {(torrent._externalMagnetUri || (torrent._externalLink && torrent._externalLink.startsWith('magnet:'))) && (
          <button
            onClick={onCopyMagnet}
            data-focusable
            tabIndex={0}
            title={magnetCopied ? 'Copié !' : 'Copier le lien magnet'}
            aria-label={magnetCopied ? 'Copié !' : 'Copier le lien magnet'}
            className={`gtv-icon-btn ds-focus-glow ds-active-glow tv:w-16 tv:h-16 ${magnetCopied ? 'text-green-400 bg-green-900/30' : ''}`}
          >
            {magnetCopied ? (
              <Check className="h-5 w-5 tv:h-7 tv:w-7" size={20} />
            ) : (
              <Link2 className="h-5 w-5 tv:h-7 tv:w-7" size={20} />
            )}
          </button>
        )}

        {/* Supprimer — danger discret */}
        {((isAvailableLocally || isDownloadComplete) && hasInfoHash && !isExternal) && (
          <button
            onClick={onDeleteMedia}
            disabled={deletingMedia}
            data-focusable
            tabIndex={0}
            className="gtv-pill-btn ds-focus-glow ds-active-glow inline-flex items-center gap-2 text-white/45 hover:text-red-400 text-sm font-medium disabled:opacity-40"
            title={isLocalTorrent ? 'Supprimer le fichier local' : 'Supprimer le torrent'}
          >
            {deletingMedia ? (
              <Loader2 className="h-4 w-4 animate-spin shrink-0" size={16} />
            ) : (
              <Trash2 className="h-4 w-4 shrink-0" size={16} />
            )}
            Supprimer
          </button>
        )}
      </div>

      {/* Barre de progression détaillée */}
      {!isStreamingThisTorrent && hasActiveDownloadStats && torrentStats && !showProgressNextToCancel && (
        <div className="px-4 py-3 rounded-xl border border-white/8 bg-white/3 backdrop-blur-sm">
          <TorrentProgressBar
            progress={torrentStats.progress}
            downloadedBytes={torrentStats.downloaded_bytes}
            totalBytes={torrentStats.total_bytes}
            downloadSpeed={torrentStats.download_speed}
            etaSeconds={torrentStats.eta_seconds ?? null}
            statusLabel={torrentStats.state === 'queued' ? t('torrentStats.queued') : t('torrentStats.downloading')}
            variant="full"
            progressColor="blue"
          />
          {torrentStats.status_reason && (
            <p className="text-white/35 text-xs mt-1">{torrentStats.status_reason}</p>
          )}
        </div>
      )}

      {/* Seeding */}
      {isSeeding && torrentStats && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-green-500/15 bg-green-950/25 backdrop-blur-sm">
          <div className="flex items-center gap-2 text-green-400 shrink-0">
            <Upload className="h-4 w-4 shrink-0" size={16} />
            <span className="text-sm font-semibold">{t('torrentStats.seeding')}</span>
          </div>
          <div className="w-px h-4 bg-white/12 shrink-0" aria-hidden />
          <div className="flex items-center gap-3 text-green-300 text-sm min-w-0">
            <TorrentSpeedDisplay uploadSpeed={torrentStats.upload_speed} showEta={false} className="!text-green-300" />
            <PeersIndicator peersConnected={torrentStats.peers_connected} className="text-green-300" />
          </div>
        </div>
      )}
    </div>
  );
}
