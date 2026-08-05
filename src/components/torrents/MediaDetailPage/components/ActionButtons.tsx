import { useState } from 'preact/hooks';
import {
  Play,
  RotateCw,
  Download,
  Link2,
  Check,
  Trash2,
  Loader2,
  Radio,
  Bookmark,
  BookmarkCheck,
  RefreshCw,
  Info,
} from 'lucide-preact';
import type { MediaDetailPageProps } from '../types';
import type { ClientTorrentStats } from '../../../../lib/client/types';
import { useI18n } from '../../../../lib/i18n/useI18n';
import {
  derivePlaybackPhase,
  isTorrentReallyComplete,
} from '../../../streaming/player-shared/derivePlaybackPhase';
import { PlaybackStatusSurface } from '../../../streaming/player-shared/components/PlaybackStatusSurface';
import { Modal } from '../../../ui/Modal';

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
  onDownloadAllEpisodes?: () => void;
  onCancelDownload?: () => void;
  onCopyMagnet: () => void;
  onDeleteMedia: () => void;
  watchLater?: {
    isFavorite: boolean;
    loading: boolean;
    onToggle: () => void | Promise<void>;
  };
  /** Rafraîchir les épisodes depuis les indexeurs (séries TMDB). */
  seriesIndexerRefresh?: {
    busy: boolean;
    onRefresh: () => void | Promise<void>;
  };
  /** Dossier série (bibliothèque) — bouton Info + modal. */
  seriesLibraryPath?: string | null;
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
  onDownloadAllEpisodes,
  onCancelDownload,
  onCopyMagnet,
  onDeleteMedia,
  watchLater,
  seriesIndexerRefresh,
  seriesLibraryPath,
}: ActionButtonsProps) {
  const { t } = useI18n();
  const [showSeriesPathModal, setShowSeriesPathModal] = useState(false);
  const hasSavedPosition = savedPlaybackPosition !== null && savedPlaybackPosition !== undefined && savedPlaybackPosition > 0;

  const stateLower = typeof torrentStats?.state === 'string' ? torrentStats.state.toLowerCase() : '';
  const phaseDerived = derivePlaybackPhase({
    playStatus: downloadingToClient
      ? 'adding'
      : torrentStats
        ? stateLower === 'queued'
          ? 'adding'
          : stateLower === 'downloading'
            ? 'downloading'
            : 'idle'
        : 'idle',
    torrentStats,
    hasVideoFiles: isAvailableLocally,
    isActiveSession: downloadingToClient || !!torrentStats,
  });
  const isDownloading =
    phaseDerived.phase === 'downloading' ||
    phaseDerived.phase === 'findingPeers' ||
    phaseDerived.phase === 'resolving';
  const isCompleted = isTorrentReallyComplete(torrentStats, { hasVideoFiles: isAvailableLocally });
  const progressPercent =
    phaseDerived.progressPercent != null ? Math.round(phaseDerived.progressPercent) : 0;
  const isDownloadComplete = isCompleted || isAvailableLocally;
  // Après reboot : état queued/downloading à 0% sans activité → ne pas masquer Lire.
  const looksStaleQueuedZero =
    !!torrentStats &&
    (stateLower === 'queued' || stateLower === 'downloading') &&
    (phaseDerived.progressPercent ?? 0) <= 0.1 &&
    (torrentStats.downloaded_bytes ?? 0) === 0 &&
    (torrentStats.download_speed ?? 0) === 0 &&
    (torrentStats.peers_connected ?? 0) === 0;

  const hasActiveDownloadStats =
    !!torrentStats &&
    !isDownloadComplete &&
    !isAvailableLocally &&
    !looksStaleQueuedZero &&
    phaseDerived.isActivelyDownloading;

  const isDownloadInProgress =
    ((!!torrentStats && !isDownloadComplete && !isAvailableLocally && !looksStaleQueuedZero) ||
      downloadingToClient);
  const showProgressInButton = hasActiveDownloadStats;
  const displayProgressPercent = hasActiveDownloadStats ? progressPercent : 0;
  const showProgressNextToCancel =
    !isStreamingThisTorrent &&
    isDownloadInProgress &&
    !!onCancelDownload &&
    !!torrentStats &&
    hasActiveDownloadStats;

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

  // Pack preview (torrent unique mais sélection possible via only_files) :
  // le bouton principal doit agir sur l'épisode sélectionné, jamais sur tout le pack.
  const isPackPreview = isPackWithMultipleFiles && !hasInfoHash;
  /** Série TV : lecture / téléchargement par épisode dans le carrousel — pas de pill « Lire » global (sauf pack preview). */
  const hidePrimaryPlayForTvSeries = torrent.tmdbType === 'tv' && !isPackPreview;
  const isPackEpisodeSelected = isPackPreview && selectedPackEpisodePreviewIndex != null;
  const canPlayPackPreviewEpisode = isPackEpisodeSelected && canStream && onPlaySingleEpisode != null;
  const canDownloadPackPreviewEpisode = isPackEpisodeSelected && onDownloadSingleEpisode != null;
  const primaryPackMode: 'play' | 'download' = canPlayPackPreviewEpisode ? 'play' : 'download';
  const isPrimaryPackSelectionMissing = isPackPreview && !isPackEpisodeSelected;

  return (
    <div className="mb-6 space-y-3">
      {/* ── Rangée principale ── */}
      <div className="flex flex-wrap gap-3 tv:gap-4 items-center overflow-visible">

        {/* Bouton Lire / Télécharger — gradient animé, rounded-full */}
        {(!hidePrimaryPlayForTvSeries || !shouldShowPlayButton) &&
          shouldShowButton &&
          !(isDownloadInProgress && onCancelDownload && showProgressNextToCancel) && (
          <button
            onClick={() => {
              // Override pack preview : Play/Download portent sur l'épisode sélectionné.
              if (isPackPreview && isPackEpisodeSelected) {
                if (primaryPackMode === 'play' && canPlayPackPreviewEpisode) {
                  void onPlaySingleEpisode!(selectedPackEpisodePreviewIndex!);
                  return;
                }
                if (primaryPackMode === 'download' && canDownloadPackPreviewEpisode) {
                  void onDownloadSingleEpisode!(selectedPackEpisodePreviewIndex!);
                  return;
                }
              }
              shouldShowPlayButton ? onPlay() : onDownload();
            }}
            disabled={
              (countdownRemaining !== null && countdownRemaining > 0) ||
              isPrimaryPackSelectionMissing ||
              (isPackPreview && isPackEpisodeSelected && !canPlayPackPreviewEpisode && !canDownloadPackPreviewEpisode)
            }
            title={
              isPackPreview && isPackEpisodeSelected
                ? primaryPackMode === 'play'
                  ? t('mediaDetail.playThisEpisode')
                  : t('mediaDetail.downloadThisEpisode')
                : isPlayStreamingMode
                  ? t('playback.playStreamingLabel')
                  : shouldShowPlayButton && hasSavedPosition
                    ? t('dashboard.resumeWatching')
                    : undefined
            }
            data-focusable
            data-media-detail-primary-action
            data-media-detail-action={
              isPackPreview && isPackEpisodeSelected ? primaryPackMode : shouldShowPlayButton ? 'play' : 'download'
            }
            tabIndex={0}
            className="gtv-pill-btn ds-focus-glow ds-active-glow ds-sync-active-pulse inline-flex items-center gap-2.5 font-bold text-base min-w-[9.5rem] tv:text-2xl tv:px-10 tv:py-5 tv:min-h-[68px] disabled:opacity-50 disabled:cursor-not-allowed border border-violet-500/40 hover:border-violet-400/60 hover:bg-violet-900/20 transition-[opacity,transform,background-color,border-color] duration-200 active:scale-[0.97]"
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
            ) : isPackPreview && isPackEpisodeSelected ? (
              primaryPackMode === 'play' ? (
                <>
                  <Play className="h-5 w-5 tv:h-7 tv:w-7 fill-current shrink-0" size={20} />
                  {t('mediaDetail.playThisEpisode')}
                </>
              ) : (
                <>
                  <Download className="h-5 w-5 tv:h-7 tv:w-7 shrink-0" size={20} />
                  {t('mediaDetail.downloadThisEpisode')}
                </>
              )
            ) : shouldShowPlayButton ? (
              <>
                <Play className="h-5 w-5 tv:h-7 tv:w-7 fill-current shrink-0" size={20} />
                {isPlayStreamingMode && <Radio className="h-4 w-4 opacity-60 shrink-0" size={16} aria-hidden />}
                {hasSavedPosition ? t('playback.resumeLabel') : t('playback.playLabel')}
              </>
            ) : (
              <>
                <Download className="h-5 w-5 tv:h-7 tv:w-7 shrink-0" size={20} />
                {isPackPreview ? t('mediaDetail.downloadThisEpisode') : isPackWithMultipleFiles ? 'Télécharger la saison' : torrent.tmdbType === 'tv' ? "Télécharger l'épisode" : t('common.download')}
              </>
            )}
          </button>
        )}

        {/* Tout télécharger (Series) */}
        {onDownloadAllEpisodes && (
          <button
            type="button"
            onClick={onDownloadAllEpisodes}
            data-focusable
            tabIndex={0}
            className="gtv-pill-btn ds-focus-glow ds-active-glow inline-flex items-center gap-2.5 tv:text-xl tv:px-8 tv:py-4 tv:min-h-[68px] border border-emerald-500/40 hover:border-emerald-400/60 hover:bg-emerald-900/20 transition-[opacity,transform,background-color,border-color] duration-200 active:scale-[0.97]"
            title="Télécharger tous les épisodes disponibles"
          >
            <Download className="h-5 w-5 tv:h-7 tv:w-7 shrink-0" size={20} />
            Tout télécharger
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
            className="gtv-pill-btn ds-focus-glow ds-active-glow inline-flex items-center gap-2.5 tv:text-xl tv:px-8 tv:py-4 tv:min-h-[68px] transition-[opacity,transform,background-color] duration-200 active:scale-[0.97]"
            title={isPackWithMultipleFiles ? t('playback.downloadFullSeason') : t('common.download')}
          >
            <Download className="h-5 w-5 tv:h-7 tv:w-7 shrink-0" size={20} />
            {isPackWithMultipleFiles ? t('playback.downloadFullSeason') : t('common.download')}
          </button>
        )}

        {/* Pack sans sélection */}
        {isPackWithMultipleFiles && !(selectedPackEpisodePreviewIndex != null && (onDownloadSingleEpisode != null || (canStream && onPlaySingleEpisode != null))) && !shouldShowPlayButton && (
          <button type="button" disabled tabIndex={-1}
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

        {/* Nouveaux épisodes (indexeurs) — icône seule */}
        {seriesIndexerRefresh && (
          <button
            type="button"
            disabled={seriesIndexerRefresh.busy}
            onClick={() => void seriesIndexerRefresh.onRefresh()}
            title={
              seriesIndexerRefresh.busy
                ? t('mediaDetail.refreshEpisodesBusy')
                : t('mediaDetail.refreshEpisodesFromIndexers')
            }
            aria-label={
              seriesIndexerRefresh.busy
                ? t('mediaDetail.refreshEpisodesBusy')
                : t('mediaDetail.refreshEpisodesFromIndexers')
            }
            aria-busy={seriesIndexerRefresh.busy}
            data-focusable
            tabIndex={0}
            className="gtv-icon-btn ds-focus-glow ds-active-glow tv:w-16 tv:h-16 disabled:opacity-50 disabled:pointer-events-none"
          >
            <RefreshCw
              className={`h-5 w-5 tv:h-7 tv:w-7 ${seriesIndexerRefresh.busy ? 'animate-spin' : ''}`}
              aria-hidden
            />
          </button>
        )}

        {/* Info — chemin dossier série (icône seule) */}
        {seriesLibraryPath && (
          <button
            type="button"
            onClick={() => setShowSeriesPathModal(true)}
            data-focusable
            tabIndex={0}
            title={t('mediaDetail.seriesPathTitle')}
            aria-label={t('mediaDetail.infoButton')}
            className="gtv-icon-btn ds-focus-glow ds-active-glow tv:w-16 tv:h-16"
          >
            <Info className="h-5 w-5 tv:h-7 tv:w-7" aria-hidden />
          </button>
        )}
      </div>

      {/* Carte progression glass – même dérivation que l’overlay */}
      {!isStreamingThisTorrent &&
        (showProgressNextToCancel || hasActiveDownloadStats) &&
        torrentStats && (
          <PlaybackStatusSurface
            variant="inline"
            playStatus={
              phaseDerived.phase === 'resolving'
                ? 'adding'
                : phaseDerived.phase === 'findingPeers' || phaseDerived.phase === 'downloading'
                  ? 'downloading'
                  : 'downloading'
            }
            torrentStats={torrentStats}
            posterUrl={torrent.imageUrl ?? null}
            imageUrl={torrent.heroImageUrl ?? torrent.imageUrl ?? null}
            title={torrent.cleanTitle || torrent.name || null}
            isActiveSession
            onCancel={onCancelDownload}
            cancelLabel={t('downloads.cancelDownload')}
            className="min-w-[200px] max-w-[520px] w-full"
          />
        )}

      {seriesLibraryPath && (
        <Modal
          isOpen={showSeriesPathModal}
          onClose={() => setShowSeriesPathModal(false)}
          title={t('mediaDetail.seriesPathTitle')}
          size="lg"
        >
          <div className="space-y-3 pt-2">
            <p className="text-sm text-white/60">{t('mediaDetail.seriesPathLabel')}</p>
            <code
              className="block w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white/90 break-all font-mono text-xs sm:text-sm"
              title={seriesLibraryPath}
            >
              {seriesLibraryPath}
            </code>
          </div>
        </Modal>
      )}

    </div>
  );
}
