import { useState, useEffect, useRef, useMemo, useCallback } from 'preact/hooks';
import { Film } from 'lucide-preact';
import { useI18n } from '../../../lib/i18n/useI18n';
import { NotificationContainer, type SeedingStatusInfo } from '../../ui/Notification';
import type { MediaDetailPageProps } from './types';
import { useTorrentPlayer } from './hooks/useTorrentPlayer';
import { scheduleUpdateOnlyFilesWithRetry } from './hooks/useTorrentPlayer/playHandler';
import {
  useVideoFiles,
  isSparseOrEmptyMessage,
  isStreamTorrentAuthMessage,
  SparseOrEmptyError,
  SPARSE_OR_EMPTY_CODE,
} from './hooks/useVideoFiles';
import { findPackFileIndexForEpisode, parseSeasonEpisodeFromName, usePackEpisodes } from './hooks/usePackEpisodes';
import { episodeReleaseMatchesTmdbEpisode } from '../../../lib/utils/episodeReleaseMatch';
import {
  absoluteEpisodeNumber,
  lookupBySeasonEpisodeKey,
  relativeEpisodeFromAbsolute,
  releaseMatchesTmdbEpisode,
  seasonEpisodeCountsFromSeasons,
} from '../../../lib/utils/seasonOrder';
import { useDebug } from './hooks/useDebug';
import { useNotifications } from './hooks/useNotifications';
import { VideoPlayerWrapper } from './components/VideoPlayerWrapper';
import { MediaDetailActionButtons } from './components/MediaDetailActionButtons';
import { TorrentInfo } from './components/TorrentInfo';
import { HeroHeader } from './components/HeroHeader';
import { EpisodesArea } from './components/EpisodesArea';
import { ActionsRow } from './components/ActionsRow';
import { YouTubeVideoPlayer as VideoPlayer } from '../../ui/YouTubeVideoPlayer';
import { redirectToCarPlayerIfNeeded } from '../../streaming/car-player/carPlaybackRedirect';
import {
  getPlaybackPositionByMediaRecord,
  getWatchedEpisodesSet,
  watchedEpisodeKey,
} from '../../../lib/streaming/torrent-storage';
import {
  getEpisodeProgressMap,
  syncWatchedEpisodesFromServer,
  WATCHED_EPISODE_THRESHOLD_PERCENT,
  type EpisodeProgressEntry,
} from '../../../lib/watchedEpisodes';
import { resolveResumeSeconds } from '../../../lib/streaming/resumePosition';
import { setStreamingInfoHash } from '../../../lib/streamingInfoHashStorage';
import { getOrCreateDeviceId } from '../../../lib/utils/device-id';
import { getDownloadClientStats, saveDownloadMeta } from '../../../lib/utils/download-meta-storage';
import { serverApi } from '../../../lib/client/server-api';
import { clientApi } from '../../../lib/client/api';
import { TokenManager } from '../../../lib/client/storage';
import { useSubscriptionMe } from './hooks/useSubscriptionMe';
import {
  PROGRESS_POLL_INTERVAL_MS,
  LIST_TORRENTS_POLL_MS,
  EPISODES_LIBRARY_POLL_MS,
} from './utils/constants';
import { startProgressPolling } from './actions/progressPolling';
import { DownloadVerificationPanel } from '../../downloads/DownloadVerificationPanel';
import type { SeriesEpisodesResponse, TorrentListFileEntry } from '../../../lib/client/server-api/media';
import type { PackEpisodeKey } from './hooks/usePackEpisodes';
import { isTVPlatform } from '../../../lib/utils/device-detection';
import { getHighQualityTmdbImageUrl } from '../../../lib/utils/tmdb-images';
import {
  inferCourStartsFromAirDates,
  inferCourStartsFromSceneVariants,
  isContinuousTmdbSeasonLayout,
  scenePackMatchesTmdbEpisode,
  tmdbAbsoluteToScene,
} from '../../../lib/utils/tmdbSceneSeasonMap';
import { getLibraryDisplayConfig } from '../../../lib/utils/library-display-config';
import {
  candidatesExcluding3DUnlessAllowed,
  filter3DTorrentsIfDisabled,
} from '../../../lib/torrents/is3dTorrent';
import { getMediaDisplayTitle } from './utils/mediaDisplayTitle';
import { resolveDownloadTypeHeader } from './utils/resolveDownloadTypeHeader';
import { resolveSeriesFolderPath } from './utils/resolveSeriesFolderPath';
import { collectAvailableMediaLanguages, mediaLanguageLabel, variantMediaLanguage } from './utils/mediaLanguage';
import {
  buildExternalDownloadParams,
  looksLikeBencodedTorrent,
} from '../../../lib/torrents/externalDownloadParams';
import { useTmdbApiTitle } from './hooks/useTmdbApiTitle';
import { isLocalMedia as isLocalMediaHash } from './actions/delete';
import { getNextEpisodeInfo, getPreviousEpisodeInfo } from './utils/episodeNavigation';
import { buildIndexerOrigin } from '../../../lib/torrents/indexerOrigin';

/**
 * Épisode à mettre en avant à l'ouverture d'une série déjà commencée : le DERNIER épisode
 * regardé (progression par épisode, fusion appareil + serveur `/api/watched-episodes`, toutes
 * plateformes). S'il a été fini (≥ seuil « vu »), l'épisode suivant de la liste (s'il existe).
 */
function pickLastWatchedEpisode(
  seasons: SeriesEpisodesResponse['seasons'],
  progress: Record<string, EpisodeProgressEntry>,
  watched: Set<string>,
): { season: number; episode: number } | null {
  let best: { season: number; episode: number; t: number; p: number } | null = null;
  for (const s of seasons) {
    for (const e of s.episodes ?? []) {
      if (typeof e.episode !== 'number' || !(e.episode > 0)) continue;
      const entry = progress?.[watchedEpisodeKey(s.season, e.episode)];
      if (!entry || !Number.isFinite(entry.t)) continue;
      if (!best || entry.t > best.t) {
        best = { season: s.season, episode: e.episode, t: entry.t, p: Number(entry.p) || 0 };
      }
    }
  }
  if (!best) return null;
  const finished = best.p >= WATCHED_EPISODE_THRESHOLD_PERCENT;
  if (!finished) return { season: best.season, episode: best.episode };
  // Ordre de lecture : saisons croissantes (spéciaux en dernier), épisodes croissants.
  // (boucles simples, pas de flatMap : vieux moteurs webOS)
  const ordered: { season: number; episode: number }[] = [];
  const sortedSeasons = seasons
    .slice()
    .sort((a, b) => (a.season === 0 ? 1 : b.season === 0 ? -1 : a.season - b.season));
  for (const s of sortedSeasons) {
    const eps = (s.episodes ?? [])
      .filter((e) => typeof e.episode === 'number' && e.episode > 0)
      .sort((a, b) => a.episode - b.episode);
    for (const e of eps) ordered.push({ season: s.season, episode: e.episode });
  }
  const idx = ordered.findIndex((x) => x.season === best!.season && x.episode === best!.episode);
  if (idx >= 0) {
    for (let i = idx + 1; i < ordered.length; i++) {
      const next = ordered[i];
      // Sauter un épisode suivant déjà vu (ex. vu sur un autre appareil)
      if (!watched.has(watchedEpisodeKey(next.season, next.episode))) return next;
    }
  }
  return { season: best.season, episode: best.episode };
}

/** Retourne l'épisode suivant (saison + id variante + titre) ou null — franchit les saisons. */
function getNextEpisode(
  seriesEpisodes: SeriesEpisodesResponse | null | undefined,
  selectedSeasonNum: number | null,
  selectedEpisodeVariantId: string | null
): { seasonNum: number; episodeVariantId: string; title: string } | null {
  return getNextEpisodeInfo(seriesEpisodes, selectedSeasonNum, selectedEpisodeVariantId);
}

/** Retourne l'épisode précédent (S02E01 → dernier épisode de S01) ou null. */
function getPreviousEpisode(
  seriesEpisodes: SeriesEpisodesResponse | null | undefined,
  selectedSeasonNum: number | null,
  selectedEpisodeVariantId: string | null
): { seasonNum: number; episodeVariantId: string; title: string } | null {
  return getPreviousEpisodeInfo(seriesEpisodes, selectedSeasonNum, selectedEpisodeVariantId);
}

// Modal de sÃ©lection de source (TV-friendly) quand plusieurs sources sont disponibles
function SourceSelectModal({
  variants,
  onSelect,
  onDownloadAllSeries,
  isSeries = false,
  onClose,
  firstButtonRef,
}: {
  variants: MediaDetailPageProps['torrent'][];
  onSelect: (variant: MediaDetailPageProps['torrent']) => void;
  onDownloadAllSeries?: (quality: string) => void;
  isSeries?: boolean;
  onClose: () => void;
  firstButtonRef: { current: HTMLButtonElement | null };
}) {
  const { t } = useI18n();
  const normalizeResolution = useCallback((raw?: string | null): string => {
    if (!raw) return '';
    const up = raw.toUpperCase();
    if (up.includes('2160') || up === '4K' || up === 'UHD') return '4K';
    if (up.includes('1080')) return '1080p';
    if (up.includes('720')) return '720p';
    if (up.includes('480')) return '480p';
    if (up.includes('REMUX')) return 'Remux';
    return raw;
  }, []);

  const qualityOrder: Record<string, number> = { Remux: 1000, '4K': 500, '1080p': 300, '720p': 100, '480p': 50 };
  const sortedVariants = [...variants].sort((a, b) => {
    const aRes = normalizeResolution((a.quality as { resolution?: string })?.resolution ?? '');
    const bRes = normalizeResolution((b.quality as { resolution?: string })?.resolution ?? '');
    const aQuality = qualityOrder[aRes] ?? 0;
    const bQuality = qualityOrder[bRes] ?? 0;
    return bQuality - aQuality || (b.seedCount ?? 0) - (a.seedCount ?? 0);
  });
  const availableQualities = useMemo(() => {
    const set = new Set<string>();
    for (const variant of variants) {
      const q = normalizeResolution((variant.quality as { resolution?: string })?.resolution ?? '');
      if (q) set.add(q);
    }
    return [...set].sort((a, b) => (qualityOrder[b] ?? 0) - (qualityOrder[a] ?? 0));
  }, [normalizeResolution, qualityOrder, variants]);
  const [selectedQuality, setSelectedQuality] = useState<string>(() => {
    if (availableQualities.includes('1080p')) return '1080p';
    return availableQualities[0] ?? '';
  });
  const primaryDownloadAllRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (availableQualities.length === 0) {
      setSelectedQuality('');
      return;
    }
    // 1080p est seulement la valeur par défaut initiale, sans forcer la sélection ensuite.
    if (!selectedQuality || !availableQualities.includes(selectedQuality)) {
      if (availableQualities.includes('1080p')) {
        setSelectedQuality('1080p');
      } else {
        setSelectedQuality(availableQualities[0]);
      }
    }
  }, [availableQualities, selectedQuality]);
  const displayedVariants = useMemo(() => {
    if (!selectedQuality) return sortedVariants;
    return sortedVariants.filter((variant) => normalizeResolution((variant.quality as { resolution?: string })?.resolution ?? '') === selectedQuality);
  }, [normalizeResolution, selectedQuality, sortedVariants]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (isSeries && onDownloadAllSeries && primaryDownloadAllRef.current) {
        primaryDownloadAllRef.current.focus();
        return;
      }
      if (firstButtonRef.current) {
        firstButtonRef.current.focus();
      }
    }, 50);
    return () => clearTimeout(t);
  }, [firstButtonRef, isSeries, onDownloadAllSeries]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const inInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (e.key === 'Backspace' && inInput) return;
      if (e.key === 'Escape' || e.key === 'Backspace' || e.key === 'BrowserBack' || e.key === 'GoBack') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    const handleWebOSBack = () => onClose();
    document.addEventListener('keydown', handleKeyDown);
    if (typeof window !== 'undefined' && (window as any).webOS) {
      window.addEventListener('webosback', handleWebOSBack);
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (typeof window !== 'undefined' && (window as any).webOS) {
        window.removeEventListener('webosback', handleWebOSBack);
      }
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[9999] bg-black/95 backdrop-blur-md flex flex-col items-center justify-center p-2 sm:p-4 tv:p-8" role="dialog" aria-modal="true" aria-label="Choisir une source">
      <div className="w-full max-w-2xl tv:max-w-4xl max-h-[95vh] sm:max-h-[90vh] tv:max-h-[85vh] flex flex-col bg-gray-900/95 rounded-xl border border-white/20 shadow-2xl overflow-hidden relative">
        <div className="flex items-center justify-between p-4 tv:p-6 border-b border-white/10 flex-shrink-0">
          <h2 className="text-xl tv:text-3xl font-bold text-white truncate mr-2">Choisir une source</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 sm:w-12 sm:h-12 tv:w-16 tv:h-16 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white focus:outline-none focus:ring-4 focus:ring-primary-500 data-focusable flex-shrink-0"
            aria-label="Fermer"
          >
            <svg className="w-5 h-5 sm:w-6 sm:h-6 tv:w-8 tv:h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 tv:p-6 space-y-3 tv:space-y-4">
          {isSeries && onDownloadAllSeries && (
            <div className="p-4 tv:p-6 rounded-xl border border-white/12 bg-white/5 backdrop-blur-sm">
              <div className="flex flex-col gap-3 tv:gap-4">
                <div className="flex flex-wrap items-center gap-2 tv:gap-3">
                  {availableQualities.map((quality) => (
                    <button
                      key={quality}
                      type="button"
                      onClick={() => setSelectedQuality(quality)}
                      data-focusable
                      className={`gtv-pill-btn ds-focus-glow ds-active-glow px-3 py-1.5 tv:px-4 tv:py-2 rounded-lg border text-sm tv:text-base font-semibold transition-colors ${
                        selectedQuality === quality
                          ? 'bg-violet-600/30 text-white border-violet-300 ring-2 ring-violet-300/80 shadow-[0_0_0_1px_rgba(255,161,166,0.45)]'
                          : 'text-white/80 border-white/25 hover:bg-white/10'
                      }`}
                    >
                      {quality}
                    </button>
                  ))}
                </div>
                <button
                  ref={primaryDownloadAllRef}
                  type="button"
                  onClick={() => selectedQuality && onDownloadAllSeries(selectedQuality)}
                  disabled={!selectedQuality}
                  data-focusable
                  tabIndex={0}
                  className="gtv-pill-btn ds-focus-glow ds-active-glow ds-sync-active-pulse w-full tv:w-auto inline-flex items-center justify-center gap-2.5 font-bold text-base tv:text-2xl tv:px-10 tv:py-5 tv:min-h-[68px] disabled:opacity-50 disabled:cursor-not-allowed border border-violet-500/40 hover:border-violet-400/60 hover:bg-violet-900/20 tv-element-focused"
                >
                  Tout télécharger
                </button>
              </div>
            </div>
          )}
          {displayedVariants.map((variant, index) => {
            const tracker = (variant as any).indexerName ?? (variant as any).indexer_name ?? 'Tracker';
            const quality = normalizeResolution((variant.quality as { resolution?: string })?.resolution ?? '');
            const codec = (variant.quality as { codec?: string })?.codec ?? (variant as any).codec ?? '';
            const seeds = variant.seedCount ?? 0;
            const peers = variant.leechCount ?? 0;
            const fileSize = variant.fileSize ?? 0;
            const minimumRatio = (variant as any).minimumRatio ?? (variant as any).minimum_ratio ?? null;
            const trackerName = (variant as any).tracker ?? null;
            const sizeStr = fileSize >= 1024 * 1024 * 1024
              ? `${(fileSize / (1024 * 1024 * 1024)).toFixed(1)} Go`
              : fileSize >= 1024 * 1024
                ? `${(fileSize / (1024 * 1024)).toFixed(0)} Mo`
                : `${(fileSize / 1024).toFixed(0)} Ko`;
            return (
              <button
                key={variant.id ?? index}
                type="button"
                ref={index === 0 && !(isSeries && onDownloadAllSeries) ? firstButtonRef : undefined}
                onClick={() => onSelect(variant)}
                data-focusable
                className="w-full text-left p-4 tv:p-6 rounded-xl bg-white/5 hover:bg-primary/30 border border-white/10 hover:border-primary-500/50 transition-all flex flex-col gap-2 tv:gap-3 focus:outline-none focus:ring-4 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-gray-900 tv-element-focused"
              >
                <div className="flex flex-wrap items-center gap-2 tv:gap-3">
                  <span className="px-3 py-1 tv:px-4 tv:py-2 bg-primary/20 text-primary-200 rounded-lg text-sm tv:text-base font-semibold">
                    {tracker}
                  </span>
                  {(() => {
                    const name = variant.name || '';
                    const mSxxExx = name.match(/S(\d{1,2})E(\d{1,3})/i);
                    const isSxxExx = !!mSxxExx;
                    const mSxx = name.match(/S([0-9]{1,2})/);
                    const isComplete = name.toLowerCase().includes('integrale') || name.toLowerCase().includes('complete');
                    let scope = null;
                    if (isSxxExx) {
                      scope = `S${mSxxExx[1].padStart(2, '0')}E${mSxxExx[2].padStart(2, '0')} (Épisode)`;
                    } else if (mSxx || name.toLowerCase().includes('saison ') || name.toLowerCase().includes('season ')) {
                      scope = mSxx ? `Saison ${parseInt(mSxx[1], 10)} (Pack)` : 'Saison Complète';
                    } else if (isComplete) {
                      scope = 'Série Complète';
                    }
                    if (scope) {
                      return (
                        <span className="px-3 py-1 tv:px-4 tv:py-2 bg-rose-500/80 text-white rounded-lg text-sm tv:text-base font-semibold shadow-sm border border-rose-400/50">
                          {scope}
                        </span>
                      );
                    }
                    return null;
                  })()}
                  {quality && (
                    <span className="px-3 py-1 tv:px-4 tv:py-2 bg-white/10 text-white rounded-lg text-sm tv:text-base font-semibold">
                      {quality}
                    </span>
                  )}
                  {(() => {
                    const lang = variantMediaLanguage(variant);
                    if (!lang) return null;
                    return (
                      <span className="px-3 py-1 tv:px-4 tv:py-2 bg-violet-500/25 text-violet-100 border border-violet-400/40 rounded-lg text-sm tv:text-base font-semibold">
                        {mediaLanguageLabel(lang)}
                      </span>
                    );
                  })()}
                  {codec && (
                    <span className="px-3 py-1 tv:px-4 tv:py-2 bg-white/10 text-white rounded-lg text-sm tv:text-base font-semibold">
                      {codec === 'x265' ? 'H.265' : codec === 'x264' ? 'H.264' : codec}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-4 tv:gap-6 text-sm tv:text-base text-white/80">
                  <span>{seeds} seeders</span>
                  <span>{peers} leechers</span>
                  <span>{sizeStr}</span>
                  {minimumRatio != null && (
                    <span>{t('mediaDetail.minimumRatio')} <strong className="text-white/90">{Number(minimumRatio) === Math.floor(Number(minimumRatio)) ? String(Math.floor(Number(minimumRatio))) : Number(minimumRatio).toFixed(1)}</strong></span>
                  )}
                  {trackerName && (
                    <span className="truncate max-w-[180px]" title={trackerName}>{t('mediaDetail.tracker')}: <strong className="text-white/90">{trackerName}</strong></span>
                  )}
                </div>
              </button>
            );
          })}
          {displayedVariants.length === 0 && (
            <div className="p-4 tv:p-6 rounded-xl border border-white/10 bg-white/5 text-white/75">
              Aucune source disponible pour cette qualité.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function MediaDetailPage({
  torrent,
  initialVariants,
  seriesEpisodes,
  initialTorrentStats,
  backHref,
  streamBackendUrl,
  seriesIndexerRefreshTmdbId,
  reloadMediaDetail,
}: MediaDetailPageProps) {
  const { t, language } = useI18n();
  // Ã‰tats de base
  const [isPlaying, setIsPlaying] = useState(false);
  const [showInfo, setShowInfo] = useState(true);
  const [movieTechInfoOpen, setMovieTechInfoOpen] = useState(false);
  /** Flag pour indiquer qu'on continue en arrière-plan (pour éviter que l'overlay se réaffiche). */
  const continueInBackgroundRef = useRef<boolean>(false);
  const [imageUrl, setImageUrl] = useState<string | null>(torrent.imageUrl || null);
  const [heroImageUrl, setHeroImageUrl] = useState<string | null>(torrent.heroImageUrl || null);
  const isCompletedFromProps = torrent.clientState === 'completed' || 
                                torrent.clientState === 'seeding' || 
                                (torrent.clientProgress !== undefined && torrent.clientProgress >= 0.95);
  // DÃ©tecter si c'est un mÃ©dia local (slug ou id commence par "local_")
  const isLocalMedia = torrent.id?.startsWith('local_') || torrent.slug?.startsWith('local_') || torrent.infoHash?.startsWith('local_');
  const hasDownloadPathFromProps = !!(torrent as { downloadPath?: string | null }).downloadPath;
  // Pour les mÃ©dias locaux / chemin bibliothèque déjà résolu, disponibles immédiatement
  // (y compris pendant checking post-reboot).
  // local_* / downloadPath = vrai fichier disque. isCompletedFromProps seul ne suffit pas
  // (torrent peut être absent du client → 404 + boucle useVideoFiles).
  const [isAvailableLocally, setIsAvailableLocally] = useState(
    isLocalMedia || hasDownloadPathFromProps,
  );
  const [downloadingToClient, setDownloadingToClient] = useState(false);
  const [magnetCopied, setMagnetCopied] = useState(false);
  const [trailerKey, setTrailerKey] = useState<string | null>(torrent.trailerKey || null);
  const [isLoadingTrailer, setIsLoadingTrailer] = useState(false);
  const [isPlayingTrailer, setIsPlayingTrailer] = useState(false);

  /** En mode immersif (false), les infos et overlays sont masquÃ©s, luminositÃ© vidÃ©o normale. Clic ou touche rÃ©affiche. */
  const [trailerUiVisible, setTrailerUiVisible] = useState(true);
  const trailerCloseButtonRef = useRef<HTMLButtonElement>(null);
  /** Couche plein écran « Afficher les informations » (hors zone aria-hidden du contenu). */
  const trailerImmersiveLayerRef = useRef<HTMLDivElement>(null);
  const hasAutoPlayedTrailerRef = useRef(false);
  const [verificationInfoHash, setVerificationInfoHash] = useState<string | null>(null);
  const [verificationTorrentName, setVerificationTorrentName] = useState<string | null>(null);
  const [showVerificationPanel, setShowVerificationPanel] = useState(false);
  const [showSourceModal, setShowSourceModal] = useState(false);
  /** IncrÃ©mentÃ© Ã  la fermeture du lecteur pour rafraÃ®chir stats et disponibilitÃ© (torrent supprimÃ© ou complÃ©tÃ© aprÃ¨s stream). */
  const [refreshAfterClose, setRefreshAfterClose] = useState(0);
  const sourceModalFirstButtonRef = useRef<HTMLButtonElement>(null);
  const mediaDetailActionsRef = useRef<{ handleDownload: (variant?: MediaDetailPageProps['torrent']) => void } | null>(null);
  const backLinkRef = useRef<HTMLAnchorElement>(null);
  const tvBackHandlerRef = useRef<HTMLDivElement>(null);
  /** Héros + actions masqués en BA immersive ; le carrousel épisodes reste hors de ce bloc (clics / focus TV). */
  const trailerImmersiveHiddenChromeRef = useRef<HTMLDivElement>(null);
  /** Clic sur une carte épisode (série) : lancer la lecture une fois le torrent résolu. */
  const episodePlayIntentRef = useRef<string | null>(null);
  /** Incrémenté à chaque clic épisode pour relancer la lecture même si déjà sélectionné. */
  const [episodePlayNonce, setEpisodePlayNonce] = useState(0);
  const isTV = isTVPlatform();
  const [seriesIndexerRefreshBusy, setSeriesIndexerRefreshBusy] = useState(false);
  /** Compteur d'Ã©checs consÃ©cutifs de getTorrent (hors 404) pour invalider torrentStats si backend injoignable. */
  const getTorrentFailCountRef = useRef<number>(0);
  /** Message sparse en attente tant que setErrorMessage n'est pas encore disponible. */
  const sparseErrorPendingRef = useRef<string | null>(null);
  /** Évite une boucle de recovery sparse → play → sparse. */
  const playbackRecoveryRef = useRef(false);
  /** Après échec auth stream-torrent : forcer le téléchargement classique. */
  const [forceDownloadFallback, setForceDownloadFallback] = useState(false);
  /** DerniÃ¨re valeur connue de torrentStats (pour ne pas Ã©craser un Ã©tat complÃ©tÃ© par une rÃ©ponse API invalide type unknown/0). */
  const lastTorrentStatsRef = useRef<{ state?: string; progress?: number } | null>(null);
  /** Snapshot partagé listTorrents (évite un 2e fetch dans le poll épisodes). */
  const listTorrentsSnapshotRef = useRef<{ at: number; list: Awaited<ReturnType<typeof clientApi.listTorrents>> } | null>(null);

  // Ã‰tats pour les seeders/leechers
  const [currentSeedCount, setCurrentSeedCount] = useState<number>(torrent.seedCount);
  const [currentLeechCount, setCurrentLeechCount] = useState<number>(torrent.leechCount);
  const [currentFileSize, setCurrentFileSize] = useState<number>(torrent.fileSize);

  // Ã‰tats pour les variantes (sÃ©ries : sÃ©lection par saison/Ã©pisode)
  const [allVariants, setAllVariants] = useState<any[]>([torrent]);
  const [selectedTorrent, setSelectedTorrent] = useState<any>(torrent);
  /** Fichiers bibliothèque / disque pour ce TMDB (langues disponibles = ceux-là). */
  const [localOnDiskMedias, setLocalOnDiskMedias] = useState<
    Array<{ language?: string | null; file_name?: string; file_path?: string; name?: string }>
  >([]);
  /** Saison / Ã©pisode sÃ©lectionnÃ©s (pour sÃ©ries) */
  const [selectedSeasonNum, setSelectedSeasonNum] = useState<number | null>(null);
  const [selectedEpisodeVariantId, setSelectedEpisodeVariantId] = useState<string | null>(null);
  /** Épisode de reprise (dernier regardé / deep-link) : focus TV + défilement à l'ouverture. */
  const [resumeTargetEpisodeId, setResumeTargetEpisodeId] = useState<string | null>(null);
  const resumeTargetResolvedAtRef = useRef(0);
  const resumeTvFocusDoneRef = useRef<string | null>(null);
  const resumeRevealDoneRef = useRef<string | null>(null);
  const normalizeResolution = useCallback((raw?: string | null): string => {
    if (!raw) return '';
    const up = raw.toUpperCase();
    if (up.includes('2160') || up === '4K' || up === 'UHD') return '4K';
    if (up.includes('1080')) return '1080p';
    if (up.includes('720')) return '720p';
    if (up.includes('480')) return '480p';
    if (up.includes('REMUX')) return 'Remux';
    return raw;
  }, []);

  // Ã‰tat pour la position de lecture sauvegardÃ©e
  const [savedPlaybackPosition, setSavedPlaybackPosition] = useState<number | null>(null);
  /** Incrémenté à la fermeture du lecteur pour rafraîchir les pastilles « déjà vu » */
  const [watchedEpisodesRefresh, setWatchedEpisodesRefresh] = useState(0);
  /** Ref synchrone : setState est async — sans ça, « Reprendre » monte le player encore avec startFromBeginning=true.
   *  Défaut false : le lecteur reprend à la position sauvegardée (s'il y en a une, < 95 %).
   *  true uniquement sur demande explicite (« Recommencer ») ou passage à l'épisode suivant. */
  const startFromBeginningRef = useRef(false);
  const setPlaybackStartMode = useCallback((fromBeginning: boolean) => {
    startFromBeginningRef.current = fromBeginning;
  }, []);
  /** Passage « épisode suivant » en cours (évite reprise position / sync torrent). */
  const pendingNextEpisodeRef = useRef(false);
  /** Forcer départ à 0 (+ auto-skip) pour le prochain lancement (épisode suivant). */
  const forceStartFromBeginningRef = useRef(false);
  /** Épisodes identifiés comme présents dans la bibliothèque (Set de "season:episode") */
  const [downloadedEpisodesSet, setDownloadedEpisodesSet] = useState<Set<string>>(new Set());
  /** Map "season:episode" -> "chemin du fichier" pour les épisodes téléchargés */
  const [libraryEpisodesPathMap, setLibraryEpisodesPathMap] = useState<Record<string, string>>({});
  /** Map "season:episode" -> "info_hash" pour les épisodes téléchargés */
  const [libraryEpisodesInfoHashMap, setLibraryEpisodesInfoHashMap] = useState<Record<string, string>>({});
  /** Map "season:episode" -> progression (0-100) pour les épisodes en cours de téléchargement */
  const [downloadingEpisodesMap, setDownloadingEpisodesMap] = useState<Record<string, number>>({});

  /** Chemin du fichier en bibliothÃ¨que (library ou findLocalMediaByTmdb), pour lecture sans torrent dans le client. */
  const [libraryDownloadPath, setLibraryDownloadPath] = useState<string | null>(
    () => (torrent as { downloadPath?: string | null }).downloadPath?.trim() || null,
  );

  /** AprÃ¨s ajout d'un seul Ã©pisode (streaming), info_hash pour que le lecteur utilise ce torrent */
  const [addedTorrentInfoHash, setAddedTorrentInfoHash] = useState<string | null>(null);

  // Torrent actif (sÃ©lectionnÃ© ou dÃ©faut) â€” utilisÃ© pour lecture / tÃ©lÃ©chargement
  const activeTorrent = selectedTorrent || torrent;

  /** Extrait SxxExx / NxN d'un nom ou chemin fichier. */
  const parseSeasonEpisodeLabel = useCallback((label: string | null | undefined) => {
    if (!label) return null;
    const m =
      String(label).match(/s(\d{1,2})[.\s_-]*e(\d{1,3})/i) ||
      String(label).match(/(\d{1,2})x(\d{1,3})/i);
    if (!m) return null;
    return { season: parseInt(m[1], 10), episode: parseInt(m[2], 10) };
  }, []);

  // Métadonnées de l'épisode sélectionné — doit être déclaré AVANT activeTorrentWithLibraryPath
  // (sinon TDZ: Cannot access '…' before initialization au premier rendu).
  const selectedEpisodeMeta = useMemo(() => {
    if (!seriesEpisodes?.seasons?.length || selectedSeasonNum == null || selectedEpisodeVariantId == null) return null;
    const season = seriesEpisodes.seasons.find((s) => s.season === selectedSeasonNum);
    const ep = season?.episodes.find((e) => e.id === selectedEpisodeVariantId);
    if (!ep) return null;
    return { season: ep.season, episode: ep.episode, variantId: ep.id };
  }, [seriesEpisodes, selectedSeasonNum, selectedEpisodeVariantId]);

  /**
   * Remap anime : TMDB saison continue (S01E25) ↔ numérotation scène indexeur (S02E01).
   * Sert à matcher les fichiers d’un pack S02 et les chemins bibliothèque.
   */
  const selectedSceneEpisode = useMemo(() => {
    if (!seriesEpisodes?.seasons?.length || !selectedEpisodeMeta || selectedEpisodeMeta.episode <= 0) {
      return null;
    }
    const seasonNums = seriesEpisodes.seasons.map((s) => s.season);
    if (!isContinuousTmdbSeasonLayout(seasonNums) || selectedEpisodeMeta.season !== 1) {
      return null;
    }
    const s1 = seriesEpisodes.seasons.find((s) => s.season === 1);
    let courStarts = inferCourStartsFromAirDates(
      (s1?.episodes ?? []).map((e) => ({ episode: e.episode, airDate: e.air_date })),
    );
    if (courStarts.length <= 1) {
      const names = (initialVariants ?? []).map((v) => v.name || v.cleanTitle || '');
      courStarts =
        inferCourStartsFromSceneVariants(s1?.episodes?.length ?? 0, names) ?? courStarts;
    }
    if (courStarts.length <= 1) return null;
    return tmdbAbsoluteToScene(selectedEpisodeMeta.episode, courStarts);
  }, [seriesEpisodes, selectedEpisodeMeta, initialVariants]);

  /** Tailles de saisons TMDB — remap absolu pour séries multi-saisons classiques. */
  const tmdbSeasonEpisodeCounts = useMemo(
    () =>
      seriesEpisodes?.seasons?.length
        ? seasonEpisodeCountsFromSeasons(seriesEpisodes.seasons)
        : null,
    [seriesEpisodes],
  );

  /** Options de match TMDB ↔ release (saison continue + tailles multi-saisons). */
  const seriesReleaseMatchOpts = useMemo(() => {
    if (!seriesEpisodes?.seasons?.length) return null;
    const seasonNums = seriesEpisodes.seasons.map((s) => s.season);
    const continuous = isContinuousTmdbSeasonLayout(seasonNums);
    const s1 = seriesEpisodes.seasons.find((s) => s.season === 1);
    const variantNames = (initialVariants ?? []).map((v) => v.name || v.cleanTitle || '');
    let courStarts =
      continuous && s1
        ? inferCourStartsFromAirDates(
            (s1.episodes ?? []).map((e) => ({ episode: e.episode, airDate: e.air_date })),
          )
        : null;
    if (continuous && (!courStarts || courStarts.length <= 1)) {
      courStarts =
        inferCourStartsFromSceneVariants(s1?.episodes?.length ?? 0, variantNames) ?? courStarts;
    }
    return {
      continuous,
      courStarts,
      seasonEpisodeCounts: tmdbSeasonEpisodeCounts ?? undefined,
    };
  }, [seriesEpisodes, initialVariants, tmdbSeasonEpisodeCounts]);

  // Torrent avec chemin bibliothèque si connu — uniquement si le chemin correspond à l'épisode sélectionné
  // (évite d'injecter S03E08 pendant la lecture de S01E01 après un fallback localMedia[0]).
  const activeTorrentWithLibraryPath = useMemo(() => {
    if (!libraryDownloadPath) return activeTorrent;
    if (selectedEpisodeMeta && selectedEpisodeMeta.episode > 0) {
      const se = parseSeasonEpisodeLabel(libraryDownloadPath);
      if (se) {
        const tmdbOk =
          se.season === selectedEpisodeMeta.season && se.episode === selectedEpisodeMeta.episode;
        const sceneOk =
          selectedSceneEpisode != null &&
          se.season === selectedSceneEpisode.season &&
          se.episode === selectedSceneEpisode.episode;
        const absoluteOk = releaseMatchesTmdbEpisode(
          se.season,
          se.episode,
          selectedEpisodeMeta.season,
          selectedEpisodeMeta.episode,
          tmdbSeasonEpisodeCounts,
        );
        if (!tmdbOk && !sceneOk && !absoluteOk) {
          return activeTorrent;
        }
      }
    }
    return { ...activeTorrent, downloadPath: libraryDownloadPath };
  }, [
    activeTorrent,
    libraryDownloadPath,
    selectedEpisodeMeta,
    selectedSceneEpisode,
    parseSeasonEpisodeLabel,
    tmdbSeasonEpisodeCounts,
  ]);

  /** TMDB série pour vignettes épisodes : torrent ou ids synthétiques popcorn_tmdb_{id}_s_e */
  const episodeCarouselTmdbId = useMemo(() => {
    if (typeof activeTorrent?.tmdbId === 'number' && !Number.isNaN(activeTorrent.tmdbId)) {
      return activeTorrent.tmdbId;
    }
    const first = seriesEpisodes?.seasons?.[0]?.episodes?.[0]?.id;
    const m = typeof first === 'string' ? first.match(/^popcorn_tmdb_(\d+)_s\d+_e\d+$/) : null;
    return m ? parseInt(m[1], 10) : null;
  }, [activeTorrent?.tmdbId, seriesEpisodes]);

  // Constantes dérivées (basées sur le torrent actif pour lecture/téléchargement)
  // Note: les variantes sync ont un id UUID/slug (pas external_*) mais _externalLink/magnet ;
  // playHandler utilise hasExternalSource pour l'ajout, pas seulement le préfixe id.
  const isExternal = activeTorrent.id.startsWith('external_');
  const hasInfoHash = typeof activeTorrent.infoHash === 'string' && activeTorrent.infoHash.trim().length > 0;
  const hasMagnetLink = typeof activeTorrent._externalMagnetUri === 'string' && activeTorrent._externalMagnetUri.trim().length > 0;
  const hasLocalPlaybackPath = !!(
    (activeTorrent as { downloadPath?: string }).downloadPath ||
    libraryDownloadPath
  );
  // Lecture possible via infoHash, lien/magnet, ou fichier bibliothèque déjà résolu
  const canStream =
    hasInfoHash ||
    !!(activeTorrent as { _externalLink?: string })._externalLink ||
    hasMagnetLink ||
    hasLocalPlaybackPath;
  const isLocalTorrent =
    activeTorrent.id?.startsWith('local_') ||
    activeTorrent.slug?.startsWith('local_') ||
    activeTorrent.infoHash?.startsWith('local_') ||
    hasLocalPlaybackPath;

  // Pack complet (Ã©pisode 0) : l'utilisateur a sÃ©lectionnÃ© l'entrÃ©e "pack complet" dans la liste d'Ã©pisodes.
  // Doit Ãªtre calculÃ© avant useVideoFiles (utilisÃ© pour garder tous les fichiers du torrent).
  const isPackSelected = Boolean(
    seriesEpisodes?.seasons?.length &&
      selectedSeasonNum != null &&
      selectedEpisodeVariantId != null &&
      (() => {
        const season = seriesEpisodes.seasons.find((s) => s.season === selectedSeasonNum);
        const ep = season?.episodes?.find((e) => e.id === selectedEpisodeVariantId);
        return ep?.episode === 0;
      })()
  );

  // Initialiser les variantes depuis le groupe (sÃ©ries)
  useEffect(() => {
    if (initialVariants && initialVariants.length > 0) {
      const allow3d = getLibraryDisplayConfig().allow3dTorrents === true;
      const variantsForUi = filter3DTorrentsIfDisabled(initialVariants, allow3d);
      const non3dPick = candidatesExcluding3DUnlessAllowed(initialVariants, allow3d);
      const variantsForPick =
        non3dPick.length > 0
          ? non3dPick
          : variantsForUi.length > 0
            ? variantsForUi
            : initialVariants;
      setAllVariants(variantsForUi.length > 0 ? variantsForUi : initialVariants);

      // Séries TV : ne pas réassigner selectedTorrent selon la qualité préférée — plusieurs variantes
      // peuvent être des épisodes / releases différents (ex. bibliothèque). La sélection réelle est
      // faite par saison/épisode (resolveVariantForSelectedEpisode). Sinon on écrase l’info_hash de
      // l’épisode avec une autre ligne du groupe → oscillation useVideoFiles / fallback local.
      const tmdbTy = String((torrent as { tmdb_type?: string }).tmdbType ?? (torrent as { tmdb_type?: string }).tmdb_type ?? '').toLowerCase();
      if (tmdbTy === 'tv' || tmdbTy === 'series') return;

      // Appliquer la qualitÃ© prÃ©fÃ©rÃ©e des paramÃ¨tres si plusieurs variantes disponibles
      if (variantsForPick.length > 1) {
        const { preferredQuality } = getLibraryDisplayConfig();
        if (preferredQuality) {
          const QUALITY_ORDER: Record<string, number> = { Remux: 6, '4K': 5, '2160p': 5, UHD: 5, '1080p': 4, '720p': 3, '480p': 2 };
          const normalizeRes = (raw?: string): string => {
            if (!raw) return '';
            const up = raw.toUpperCase();
            if (up.includes('2160') || up === '4K' || up === 'UHD') return '4K';
            if (up.includes('1080')) return '1080p';
            if (up.includes('720')) return '720p';
            if (up.includes('480')) return '480p';
            if (up.includes('REMUX')) return 'Remux';
            return raw;
          };
          const targetRes = normalizeRes(preferredQuality);
          // Chercher les variantes de la qualitÃ© prÃ©fÃ©rÃ©e
          const preferred = variantsForPick.filter((v: any) => normalizeRes(v.quality?.resolution) === targetRes);
          if (preferred.length > 0) {
            // Parmi les variantes prÃ©fÃ©rÃ©es, prendre celle avec le plus de seeders
            const best = [...preferred].sort((a: any, b: any) => (b.seedCount ?? 0) - (a.seedCount ?? 0))[0];
            setSelectedTorrent(best);
          } else {
            // QualitÃ© prÃ©fÃ©rÃ©e non disponible : prendre la meilleure qualitÃ© disponible (ordre dÃ©croissant puis seeders)
            const best = [...variantsForPick].sort((a: any, b: any) => {
              const aQ = QUALITY_ORDER[normalizeRes(a.quality?.resolution)] ?? 0;
              const bQ = QUALITY_ORDER[normalizeRes(b.quality?.resolution)] ?? 0;
              return bQ - aQ || (b.seedCount ?? 0) - (a.seedCount ?? 0);
            })[0];
            setSelectedTorrent(best);
          }
        } else {
          // Sans préférence qualité : éviter de rester sur un 3D s’il existe une alternative 2D
          const non3d = candidatesExcluding3DUnlessAllowed(variantsForPick, false);
          if (!allow3d && non3d.length > 0) {
            const best = [...non3d].sort((a: any, b: any) => (b.seedCount ?? 0) - (a.seedCount ?? 0))[0];
            setSelectedTorrent(best);
          }
        }
      } else if (variantsForPick.length === 1) {
        setSelectedTorrent(variantsForPick[0]);
      }
    }
  }, [initialVariants]);

  // Met à jour libraryDownloadPath quand l'épisode sélectionné change (pour les séries)
  useEffect(() => {
    if (activeTorrent.tmdbType === 'tv' && selectedEpisodeMeta) {
      const path = lookupBySeasonEpisodeKey(
        libraryEpisodesPathMap,
        selectedEpisodeMeta.season,
        selectedEpisodeMeta.episode,
        tmdbSeasonEpisodeCounts,
      );
      if (path) {
        if (libraryDownloadPath !== path) setLibraryDownloadPath(path);
      } else {
        if (libraryDownloadPath !== null) setLibraryDownloadPath(null);
      }
    }
  }, [
    selectedEpisodeMeta,
    libraryEpisodesPathMap,
    activeTorrent.tmdbType,
    libraryDownloadPath,
    tmdbSeasonEpisodeCounts,
  ]);

  // Hooks personnalisÃ©s
  const {
    videoFiles,
    selectedFile,
    setVideoFiles,
    setSelectedFile,
    loadVideoFiles,
    emptyOrSparse,
    setEmptyOrSparse,
  } = useVideoFiles({
    torrentName: activeTorrent.name,
    torrent: activeTorrentWithLibraryPath,
    keepAllVideoFiles: isPackSelected,
    season: selectedEpisodeMeta?.season ?? null,
    episode: selectedEpisodeMeta?.episode ?? null,
    sceneSeason: selectedSceneEpisode?.season ?? null,
    sceneEpisode: selectedSceneEpisode?.episode ?? null,
    seasonEpisodeCounts: tmdbSeasonEpisodeCounts,
    // Passer le chemin spécifique de l'épisode s'il est connu dans la bibliothèque
    filePath: selectedEpisodeMeta
      ? lookupBySeasonEpisodeKey(
          libraryEpisodesPathMap,
          selectedEpisodeMeta.season,
          selectedEpisodeMeta.episode,
          tmdbSeasonEpisodeCounts,
        ) ?? null
      : null,
    onError: (error) => {
      console.error('Erreur lors du chargement des fichiers vidéo:', error);
      if (error instanceof SparseOrEmptyError || isSparseOrEmptyMessage(error.message)) {
        setIsAvailableLocally(false);
        // setErrorMessage est branché après useTorrentPlayer (effet dédié + playHandler)
        sparseErrorPendingRef.current = error.message || `${SPARSE_OR_EMPTY_CODE}: fichiers vides`;
      }
    },
  });

  useEffect(() => {
    if (emptyOrSparse) {
      setIsAvailableLocally(false);
    }
  }, [emptyOrSparse]);

  const { notifications, addNotification, removeNotification } = useNotifications();
  const { debugLogs, showDebug, setShowDebug, addDebugLog, clearDebugLogs } = useDebug();
  const { streamingTorrentActive } = useSubscriptionMe();

  // Stream-torrent = proxy librqbit. Activé si entitlement + torrent non vraiment local.
  // Les chemins bibliothèque sparses (emptyOrSparse) ne doivent PAS forcer le HLS local.
  const hasLibraryFilePath = Boolean(
    libraryDownloadPath ||
      activeTorrent.downloadPath ||
      (selectedEpisodeMeta &&
        lookupBySeasonEpisodeKey(
          libraryEpisodesPathMap,
          selectedEpisodeMeta.season,
          selectedEpisodeMeta.episode,
          tmdbSeasonEpisodeCounts,
        )),
  );
  const effectiveStreamingActive = (streamingTorrentActive ?? false) && !forceDownloadFallback;

  // Log des paramètres streaming en console (visible dans l’onglet Console pour debug)
  // (useStreamTorrentMode calculé après useTorrentPlayer — voir plus bas)

  // Hook useTorrentPlayer (utilise le torrent actif = sÃ©lection saison/Ã©pisode)
  const effectiveTorrent = addedTorrentInfoHash ? { ...activeTorrent, infoHash: addedTorrentInfoHash } : activeTorrent;
  const effectiveHasInfoHash = Boolean(effectiveTorrent.infoHash?.trim());
  const {
    playStatus,
    setPlayStatus,
    torrentStats,
    setTorrentStats,
    progressMessage,
    setProgressMessage,
    errorMessage,
    setErrorMessage,
    handlePlay,
    handleClosePlayer,
    stopProgressPolling,
    pollTorrentProgress,
    progressPollIntervalRef,
    countdownRemaining,
  } = useTorrentPlayer({
    torrent: effectiveTorrent,
    initialTorrentStats: initialTorrentStats ?? null,
    isExternal,
    hasInfoHash: effectiveHasInfoHash,
    hasMagnetLink,
    canStream: Boolean(canStream),
    streamingTorrentActive: effectiveStreamingActive,
    emptyOrSparse: Boolean(emptyOrSparse),
    isAvailableLocally: Boolean(isAvailableLocally),
    setIsAvailableLocally,
    loadVideoFiles,
    videoFiles,
    selectedFile,
    setVideoFiles,
    setSelectedFile,
    isPlaying,
    setIsPlaying,
    setShowInfo,
    addDebugLog,
  });

  // checking/initializing : HLS local seulement si on a vraiment des octets (sinon 503).
  const torrentIsChecking =
    torrentStats?.state === 'checking' ||
    initialTorrentStats?.state === 'checking' ||
    activeTorrent.clientState === 'checking' ||
    (typeof torrentStats?.state === 'string' &&
      torrentStats.state.toLowerCase() === 'initializing');
  const checkingHasLocalBytes =
    torrentIsChecking &&
    ((torrentStats?.files_available === true) ||
      ((torrentStats?.downloaded_bytes ?? 0) > 256 * 1024) ||
      ((torrentStats?.progress ?? 0) > 0.005) ||
      ((initialTorrentStats?.downloaded_bytes ?? 0) > 256 * 1024) ||
      ((initialTorrentStats?.progress ?? 0) > 0.005));
  // Stream-torrent si pas jouable en local. Pendant checking sans octets : garder stream-torrent
  // (ne pas forcer HLS local → 503 / buffer stall).
  // Ne pas utiliser `isPlaying` ici : dès le clic Lire, isPlaying=true basculait à tort
  // vers stream-torrent même quand isAvailableLocally=true (fichier présent, sans path library).
  const useStreamTorrentMode =
    effectiveStreamingActive &&
    !activeTorrent.infoHash?.startsWith('local_') &&
    !(torrentIsChecking && checkingHasLocalBytes) &&
    (Boolean(emptyOrSparse) ||
      (!isAvailableLocally && !hasLibraryFilePath) ||
      (torrentIsChecking && !checkingHasLocalBytes));

  useEffect(() => {
    const token = typeof TokenManager?.getCloudAccessToken === 'function' ? TokenManager.getCloudAccessToken() : null;
    console.debug('[MediaDetail] Paramètres streaming', {
      streamingTorrentActive: streamingTorrentActive ?? false,
      effectiveStreamingActive,
      forceDownloadFallback,
      useStreamTorrentMode,
      isAvailableLocally: Boolean(isAvailableLocally),
      emptyOrSparse: Boolean(emptyOrSparse),
      hasLibraryFilePath,
      torrentIsChecking,
      hasCloudToken: !!token,
    });
  }, [
    streamingTorrentActive,
    effectiveStreamingActive,
    forceDownloadFallback,
    isAvailableLocally,
    useStreamTorrentMode,
    emptyOrSparse,
    hasLibraryFilePath,
    torrentIsChecking,
  ]);

  useEffect(() => {
    if (sparseErrorPendingRef.current) {
      setErrorMessage(sparseErrorPendingRef.current);
      sparseErrorPendingRef.current = null;
    }
  }, [setErrorMessage, emptyOrSparse, errorMessage]);

  // Reset recovery quand on change de média / épisode
  useEffect(() => {
    playbackRecoveryRef.current = false;
    setForceDownloadFallback(false);
  }, [activeTorrent.infoHash, selectedEpisodeVariantId]);

  // Si playHandler a échoué sur auth stream-torrent (sans passer par le lecteur), basculer en téléchargement.
  // Même après une recovery sparse : on autorise une 2e passe en mode download (forceDownloadFallback).
  useEffect(() => {
    if (!errorMessage || !isStreamTorrentAuthMessage(errorMessage)) return;
    if (forceDownloadFallback) return;
    setForceDownloadFallback(true);
    setIsAvailableLocally(false);
    setEmptyOrSparse(true);
    setIsPlaying(false);
    setPlayStatus('idle');
    setErrorMessage(null);
    playbackRecoveryRef.current = true;
    addDebugLog('warning', 'Stream-torrent auth échoué (playHandler) — retéléchargement');
    window.setTimeout(() => {
      void handlePlay();
    }, 150);
  }, [
    errorMessage,
    forceDownloadFallback,
    handlePlay,
    addDebugLog,
    setPlayStatus,
    setErrorMessage,
    setIsPlaying,
    setIsAvailableLocally,
    setEmptyOrSparse,
  ]);

  const handleDeleteEmptyFiles = useCallback(async () => {
    const activeInfoHash = (selectedTorrent || torrent).infoHash;
    if (!activeInfoHash || activeInfoHash.startsWith('local_')) {
      addNotification('error', t('playback.sparseOrEmptyDeleteError') || 'Impossible de supprimer');
      return;
    }
    try {
      addDebugLog('info', 'Suppression des fichiers sparses/vides...', { infoHash: activeInfoHash });
      await clientApi.removeTorrent(activeInfoHash, true);
      setEmptyOrSparse(false);
      setIsAvailableLocally(false);
      setLibraryDownloadPath(null);
      setVideoFiles([]);
      setSelectedFile(null);
      setTorrentStats(null);
      setErrorMessage(null);
      setPlayStatus('idle');
      setIsPlaying(false);
      addNotification(
        'success',
        t('playback.sparseOrEmptyDeleteSuccess') || 'Fichiers vides supprimés'
      );
      addDebugLog('success', 'Fichiers sparses/vides supprimés');
    } catch (err) {
      addDebugLog('error', 'Erreur suppression fichiers vides', { error: err });
      addNotification(
        'error',
        t('playback.sparseOrEmptyDeleteError') || 'Erreur lors de la suppression'
      );
    }
  }, [
    selectedTorrent,
    torrent,
    addNotification,
    t,
    addDebugLog,
    setEmptyOrSparse,
    setVideoFiles,
    setSelectedFile,
    setTorrentStats,
    setErrorMessage,
    setPlayStatus,
    setIsPlaying,
  ]);

  const handleDownloadWholeSeriesByQuality = useCallback((quality: string) => {
    const target = normalizeResolution(quality);
    const byInfoHash = new Map<string, MediaDetailPageProps['torrent']>();
    for (const variant of allVariants) {
      const infoHash = (variant.infoHash ?? '').trim();
      if (!infoHash) continue;
      if (normalizeResolution(variant.quality?.resolution) !== target) continue;
      const prev = byInfoHash.get(infoHash);
      if (!prev || (variant.seedCount ?? 0) > (prev.seedCount ?? 0)) {
        byInfoHash.set(infoHash, variant);
      }
    }
    const variantsToDownload = [...byInfoHash.values()].sort((a, b) => (b.seedCount ?? 0) - (a.seedCount ?? 0));
    if (variantsToDownload.length === 0) {
      addNotification('info', `Aucune source ${target} disponible pour cette série`);
      return;
    }
    for (const variant of variantsToDownload) {
      mediaDetailActionsRef.current?.handleDownload(variant);
    }
    addNotification('success', `${variantsToDownload.length} source(s) ${target} ajoutée(s)`);
    setShowSourceModal(false);
  }, [addNotification, allVariants, normalizeResolution]);

  // Langues des fichiers déjà présents sur disque (bibliothèque), pas des variantes indexeurs.
  // Pendant checking post-reboot : marquer aussi disponible + chemin pour Lire (sans attendre 100%).
  useEffect(() => {
    const tmdbId = torrent.tmdbId ?? activeTorrent?.tmdbId ?? null;
    if (typeof tmdbId !== 'number' || !Number.isFinite(tmdbId) || tmdbId <= 0) {
      setLocalOnDiskMedias([]);
      return;
    }
    let cancelled = false;
    const tmdbType =
      (activeTorrent?.tmdbType || torrent.tmdbType || (torrent.category === 'series' ? 'tv' : 'movie')) as
        | 'movie'
        | 'tv'
        | string;
    (async () => {
      try {
        const list = await clientApi.findLocalMediaByTmdb(tmdbId, tmdbType === 'tv' ? 'tv' : 'movie');
        if (cancelled) return;
        const onDisk = (Array.isArray(list) ? list : []).filter((m: any) => {
          const path = (m.file_path || m.downloadPath || '').toString().trim();
          const size = Number(m.file_size ?? m.fileSize ?? 0);
          return path.length > 0 && (size > 0 || /\.(mkv|mp4|avi|webm|mov|m4v)$/i.test(path));
        });
        setLocalOnDiskMedias(
          onDisk.map((m: any) => ({
            language: m.language ?? null,
            file_name: m.file_name ?? m.fileName ?? null,
            file_path: m.file_path ?? m.downloadPath ?? null,
            name: m.file_name || m.name || null,
          })),
        );
        if (onDisk.length > 0) {
          const best = onDisk[0] as { file_path?: string; downloadPath?: string; file_size?: number };
          const path = (best.file_path || best.downloadPath || '').toString().trim();
          if (path) {
            setLibraryDownloadPath((prev) => prev || path);
            setIsAvailableLocally(true);
          }
        }
      } catch {
        if (!cancelled) setLocalOnDiskMedias([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [torrent.tmdbId, torrent.tmdbType, torrent.category, activeTorrent?.tmdbId, activeTorrent?.tmdbType]);

  const handleRefreshSeriesFromIndexers = useCallback(async () => {
    if (seriesIndexerRefreshTmdbId == null || seriesIndexerRefreshBusy) return;
    setSeriesIndexerRefreshBusy(true);
    try {
      const srcTorrent = selectedTorrent || torrent;
      const qRaw =
        [srcTorrent.mainTitle, (srcTorrent as { cleanTitle?: string }).cleanTitle, srcTorrent.name]
          .map((x) => (typeof x === 'string' ? x.trim() : ''))
          .find((s) => s.length >= 2) ?? '';
      const r = await serverApi.refreshSeriesEpisodesFromIndexers(seriesIndexerRefreshTmdbId, {
        lang: language === 'fr' ? 'fr-FR' : language === 'en' ? 'en-US' : undefined,
        /** Force la requête texte sur Torznab / indexeurs (sinon le backend se base surtout sur le titre en DB). */
        q: qRaw.length >= 2 ? qRaw : undefined,
      });
      if (r.success) {
        if (r.data) {
          const { imported, scanned } = r.data;
          if (imported > 0) {
            addNotification(
              'success',
              t('mediaDetail.refreshEpisodesSuccess', { imported, scanned }),
            );
          } else {
            addNotification('info', t('mediaDetail.refreshEpisodesNone', { scanned }));
          }
        }
        reloadMediaDetail?.();
      } else {
        addNotification('error', r.message || t('mediaDetail.refreshEpisodesError'));
      }
    } catch (e) {
      addNotification('error', e instanceof Error ? e.message : t('mediaDetail.refreshEpisodesError'));
    } finally {
      setSeriesIndexerRefreshBusy(false);
    }
  }, [
    seriesIndexerRefreshTmdbId,
    seriesIndexerRefreshBusy,
    language,
    addNotification,
    t,
    reloadMediaDetail,
    selectedTorrent,
    torrent,
  ]);

  /** Ferme le lecteur puis déclenche un rafraîchissement des stats et de la disponibilité (carte à jour après stream). */
  const handleClosePlayerAndRefresh = useCallback(async () => {
    await handleClosePlayer();
    setRefreshAfterClose((r) => r + 1);
    setWatchedEpisodesRefresh((n) => n + 1);
  }, [handleClosePlayer]);

  /** Annule vraiment le téléchargement (retire le torrent du client, sans supprimer les fichiers). */
  const handleAbortDownload = useCallback(async () => {
    const activeInfoHash = (selectedTorrent || torrent).infoHash;
    continueInBackgroundRef.current = false;

    if (activeInfoHash) {
      if (!isLocalMediaHash(activeInfoHash)) {
        try {
          const { clientApi } = await import('../../../lib/client/api');
          addDebugLog('info', 'Suppression du torrent en cours...', { infoHash: activeInfoHash });
          await clientApi.removeTorrent(activeInfoHash, false);
          addDebugLog('success', 'Torrent supprimé');
          addNotification('success', 'Téléchargement annulé et supprimé');
        } catch (err) {
          addDebugLog('error', 'Erreur lors de la suppression du torrent', { error: err });
          addNotification('error', 'Erreur lors de la suppression du torrent');
        }
      }
    }

    stopProgressPolling();
    setPlayStatus('idle');
    setProgressMessage('');
    setTorrentStats(null);
    setErrorMessage(null);
    setIsPlaying(false);
    addDebugLog('info', '=== Annulation ===');
  }, [
    selectedTorrent,
    torrent,
    addDebugLog,
    addNotification,
    stopProgressPolling,
  ]);

  /** Télécharger un seul épisode du pack (preview) : ajoute le torrent avec only_files [fileIndex]. */
  const handleDownloadSingleEpisode = useCallback(
    async (fileIndex: number) => {
      const torrent = activeTorrent;
      const magnet = (torrent as { _externalMagnetUri?: string })._externalMagnetUri ?? ((torrent as { _externalLink?: string })._externalLink?.startsWith('magnet:') ? (torrent as { _externalLink: string })._externalLink : null);
      const externalLink = (torrent as { _externalLink?: string })._externalLink && !(torrent as { _externalLink?: string })._externalLink?.startsWith('magnet:') ? (torrent as { _externalLink: string })._externalLink : null;
      setDownloadingToClient(true);
      setPlayStatus('adding');
      try {
        let infoHash: string;
        if (magnet) {
          const downloadType = resolveDownloadTypeHeader(torrent);
          const result = await clientApi.addMagnetLink(magnet, torrent.name, false, downloadType, undefined, [fileIndex], buildIndexerOrigin(torrent));
          infoHash = result?.info_hash ?? '';
          if (infoHash) {
            saveDownloadMeta(infoHash, { ...torrent, imageUrl: torrent.imageUrl ?? undefined, heroImageUrl: torrent.heroImageUrl ?? undefined, cleanTitle: torrent.cleanTitle ?? torrent.name ?? undefined });
            if (typeof torrent.tmdbId === 'number' && (torrent.tmdbType === 'movie' || torrent.tmdbType === 'tv')) {
              clientApi.bindDownloadToMedia(infoHash, torrent.tmdbId, torrent.tmdbType).catch(() => {});
            }
            scheduleUpdateOnlyFilesWithRetry(infoHash, fileIndex);
          }
        } else if (externalLink) {
          const baseUrl = serverApi.getServerUrl();
          const token = serverApi.getAccessToken();
          const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
          const isRelative = !externalLink.startsWith('http://') && !externalLink.startsWith('https://');
          const ext = buildExternalDownloadParams(torrent as any);
          const q = new URLSearchParams();
          if (isRelative) {
            if (ext.indexerId) q.set('indexerId', ext.indexerId);
            const idFromLink = externalLink.match(/[?&]id=(\d+)/)?.[1];
            q.set('torrentId', idFromLink || ext.torrentId || '');
            if (ext.guid) q.set('guid', ext.guid);
            if (ext.indexerTypeId) q.set('indexerTypeId', ext.indexerTypeId);
            q.set('relativeUrl', externalLink);
          } else {
            q.set('url', externalLink);
            if (ext.indexerId) q.set('indexerId', ext.indexerId);
            if (ext.guid) q.set('guid', ext.guid);
            if (ext.torrentId) q.set('torrentId', ext.torrentId);
            if (ext.indexerTypeId) q.set('indexerTypeId', ext.indexerTypeId);
            if (ext.infoHash) q.set('infoHash', ext.infoHash);
          }
          const res = await fetch(`${baseUrl}/api/torrents/external/download?${q.toString()}`, { headers });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error((err as { error?: string }).error || `Erreur ${res.status}`);
          }
          const buf = new Uint8Array(await res.arrayBuffer());
          if (!looksLikeBencodedTorrent(buf)) {
            throw new Error('La réponse n\'est pas un fichier .torrent (souvent page HTML C411). Vérifiez la clé API Torznab.');
          }
          const file = new File([buf], `${torrent.name}.torrent`, { type: 'application/x-bittorrent' });
          const downloadType = resolveDownloadTypeHeader(torrent);
          const result = await clientApi.addTorrentFile(file, false, downloadType, undefined, [fileIndex], buildIndexerOrigin(torrent));
          infoHash = result?.info_hash ?? '';
          if (infoHash) {
            saveDownloadMeta(infoHash, { ...torrent, imageUrl: torrent.imageUrl ?? undefined, heroImageUrl: torrent.heroImageUrl ?? undefined, cleanTitle: torrent.cleanTitle ?? torrent.name ?? undefined });
            if (typeof torrent.tmdbId === 'number' && (torrent.tmdbType === 'movie' || torrent.tmdbType === 'tv')) {
              clientApi.bindDownloadToMedia(infoHash, torrent.tmdbId, torrent.tmdbType).catch(() => {});
            }
            scheduleUpdateOnlyFilesWithRetry(infoHash, fileIndex);
          }
        } else {
          throw new Error('Aucun lien magnet ou URL externe');
        }
        if (infoHash!) {
          addNotification('success', 'Épisode ajouté au téléchargement.');
          setTorrentStats({ info_hash: infoHash, name: torrent.name, state: 'queued', downloaded_bytes: 0, uploaded_bytes: 0, total_bytes: 0, progress: 0, download_speed: 0, upload_speed: 0, peers_connected: 0, peers_total: 0, seeders: 0, leechers: 0, eta_seconds: null, download_started: true });
          startProgressPolling(infoHash, { torrent: activeTorrent, pollTorrentProgress, progressPollIntervalRef, PROGRESS_POLL_INTERVAL_MS, setPlayStatus });
        }
      } catch (e) {
        addNotification('error', (e instanceof Error ? e.message : 'Erreur') + '');
      } finally {
        setDownloadingToClient(false);
      }
    },
    [activeTorrent, addNotification, setDownloadingToClient, setPlayStatus, setTorrentStats, pollTorrentProgress, progressPollIntervalRef]
  );

  /** Lire un seul Ã©pisode du pack (preview) en streaming : ajoute avec for_streaming + only_files [fileIndex], puis lance le lecteur. */
  const handlePlaySingleEpisode = useCallback(
    async (fileIndex: number) => {
      const torrent = activeTorrent;
      if (
        redirectToCarPlayerIfNeeded({
          slug: torrent.slug || torrent.id,
          id: torrent.id,
          infoHash: torrent.infoHash,
          downloadPath: torrent.downloadPath,
          fileIndex,
        })
      ) {
        return;
      }
      const magnet = (torrent as { _externalMagnetUri?: string })._externalMagnetUri ?? ((torrent as { _externalLink?: string })._externalLink?.startsWith('magnet:') ? (torrent as { _externalLink: string })._externalLink : null);
      const externalLink = (torrent as { _externalLink?: string })._externalLink && !(torrent as { _externalLink?: string })._externalLink?.startsWith('magnet:') ? (torrent as { _externalLink: string })._externalLink : null;
      setPlayStatus('adding');
      try {
        let infoHash: string;
        if (magnet) {
          const result = await clientApi.addMagnetLink(magnet, torrent.name, true, undefined, undefined, [fileIndex], buildIndexerOrigin(torrent));
          infoHash = result?.info_hash ?? '';
          if (infoHash) scheduleUpdateOnlyFilesWithRetry(infoHash, fileIndex);
        } else if (externalLink) {
          const baseUrl = serverApi.getServerUrl();
          const token = serverApi.getAccessToken();
          const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
          const isRelative = !externalLink.startsWith('http://') && !externalLink.startsWith('https://');
          const ext = buildExternalDownloadParams(torrent as any);
          const q = new URLSearchParams();
          if (isRelative) {
            if (ext.indexerId) q.set('indexerId', ext.indexerId);
            const idFromLink = externalLink.match(/[?&]id=(\d+)/)?.[1];
            q.set('torrentId', idFromLink || ext.torrentId || '');
            if (ext.guid) q.set('guid', ext.guid);
            if (ext.indexerTypeId) q.set('indexerTypeId', ext.indexerTypeId);
            q.set('relativeUrl', externalLink);
          } else {
            q.set('url', externalLink);
            if (ext.indexerId) q.set('indexerId', ext.indexerId);
            if (ext.guid) q.set('guid', ext.guid);
            if (ext.torrentId) q.set('torrentId', ext.torrentId);
            if (ext.indexerTypeId) q.set('indexerTypeId', ext.indexerTypeId);
            if (ext.infoHash) q.set('infoHash', ext.infoHash);
          }
          const res = await fetch(`${baseUrl}/api/torrents/external/download?${q.toString()}`, { headers });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error((err as { error?: string }).error || `Erreur ${res.status}`);
          }
          const buf = new Uint8Array(await res.arrayBuffer());
          if (!looksLikeBencodedTorrent(buf)) {
            throw new Error('La réponse n\'est pas un fichier .torrent (souvent page HTML C411). Vérifiez la clé API Torznab.');
          }
          const file = new File([buf], `${torrent.name}.torrent`, { type: 'application/x-bittorrent' });
          const result = await clientApi.addTorrentFile(file, true, undefined, undefined, [fileIndex], buildIndexerOrigin(torrent));
          infoHash = result?.info_hash ?? '';
          if (infoHash) scheduleUpdateOnlyFilesWithRetry(infoHash, fileIndex);
        } else {
          throw new Error('Aucun lien magnet ou URL externe');
        }
        if (infoHash!) {
          setStreamingInfoHash(infoHash);
          setAddedTorrentInfoHash(infoHash);
          if (typeof torrent.tmdbId === 'number' && (torrent.tmdbType === 'movie' || torrent.tmdbType === 'tv')) {
            clientApi.bindDownloadToMedia(infoHash, torrent.tmdbId, torrent.tmdbType).catch(() => {});
          }
          setPlayStatus('downloading');
          setProgressMessage('Préparation du flux…');
          const waitForFiles = async (attempts = 0): Promise<void> => {
            if (attempts > 30) return;
            try {
              const videos = await loadVideoFiles(infoHash);
              if (videos.length > 0) {
                setVideoFiles(videos);
                // Préférer l'index only_files ; sinon le premier fichier vidéo listé.
                const chosen =
                  videos.find((v) => typeof v.index === 'number' && v.index === fileIndex) ??
                  videos[0];
                setSelectedFile(chosen);
                setPlayStatus('ready');
                setProgressMessage('Lancement de la lecture...');
                setIsPlaying(true);
                setShowInfo(false);
                stopProgressPolling();
                return;
              }
            } catch {
              // ignore
            }
            setTimeout(() => waitForFiles(attempts + 1), 1000);
          };
          waitForFiles();
        }
      } catch (e) {
        setPlayStatus('idle');
        setErrorMessage(e instanceof Error ? e.message : 'Erreur');
        addNotification('error', (e instanceof Error ? e.message : 'Erreur') + '');
      }
    },
    [activeTorrent, setPlayStatus, setProgressMessage, setErrorMessage, addNotification, loadVideoFiles, setVideoFiles, setSelectedFile, setIsPlaying, setShowInfo, stopProgressPolling]
  );

  const isDownloadComplete = !!torrentStats && (
    torrentStats.state === 'completed' ||
    torrentStats.state === 'seeding' ||
    torrentStats.files_available === true
  );
  const isTorrentChecking =
    torrentStats?.state === 'checking' ||
    (typeof torrentStats?.state === 'string' && torrentStats.state.toLowerCase() === 'initializing');
  // Pendant la vérif post-reboot, autoriser Lire : les fichiers sont déjà sur disque.
  const shouldShowPlayButton =
    isLocalTorrent ||
    (isAvailableLocally && hasInfoHash) ||
    isDownloadComplete ||
    (isTorrentChecking && hasInfoHash);

  // Garder une ref Ã  jour avec torrentStats pour Ã©viter d'Ã©craser un Ã©tat complÃ©tÃ© par une rÃ©ponse API invalide (unknown/0)
  useEffect(() => {
    lastTorrentStatsRef.current = torrentStats
      ? { state: torrentStats.state, progress: torrentStats.progress }
      : null;
  }, [torrentStats]);

  // Quand on arrive depuis la page Téléchargements avec des stats (complété / vérif), prÃ©charger les fichiers vidÃ©o pour que Â« Lire Â» soit utilisable
  useEffect(() => {
    if (
      initialTorrentStats &&
      hasInfoHash &&
      activeTorrent.infoHash &&
      (initialTorrentStats.state === 'completed' ||
        initialTorrentStats.state === 'seeding' ||
        initialTorrentStats.state === 'checking' ||
        initialTorrentStats.progress >= 0.99)
    ) {
      loadVideoFiles(activeTorrent.infoHash)
        .then((videos) => {
          if (videos.length > 0) {
            setVideoFiles(videos);
            if (!selectedFile) setSelectedFile(videos[0]);
            setIsAvailableLocally(true);
          }
        })
        .catch(() => {});
    }
  }, [initialTorrentStats?.state, initialTorrentStats?.progress, hasInfoHash, activeTorrent.infoHash]);

  // SÃ©ries depuis la bibliothÃ¨que : le torrent actif (Ã©pisode sÃ©lectionnÃ©) peut Ãªtre diffÃ©rent du torrent principal.
  // Synchroniser les stats depuis le stockage pour l'info_hash de l'Ã©pisode actif afin d'afficher Â« Lire Â» si cet Ã©pisode est dÃ©jÃ  tÃ©lÃ©chargÃ©.
  useEffect(() => {
    if (!hasInfoHash || !activeTorrent.infoHash) return;
    const stats = getDownloadClientStats(activeTorrent.infoHash);
    if (
      stats &&
      (stats.state === 'completed' ||
        stats.state === 'seeding' ||
        stats.state === 'checking' ||
        (stats.progress ?? 0) >= 0.99)
    ) {
      setTorrentStats(stats);
      loadVideoFiles(activeTorrent.infoHash!)
        .then((videos) => {
          if (videos.length > 0) {
            setVideoFiles(videos);
            if (!selectedFile) setSelectedFile(videos[0]);
            setIsAvailableLocally(true);
          }
        })
        .catch(() => {});
    }
  }, [activeTorrent.infoHash, hasInfoHash]);

  // VÃ©rifier la position de lecture sauvegardÃ©e (torrent actif) : prioritÃ© au query param ?t=
  // (deep-link "Reprendre la lecture"), sinon par mÃ©dia (tmdb), sinon par torrent.
  useEffect(() => {
    const checkSavedPosition = async () => {
      if (typeof window === 'undefined') return;
      // Ne pas réinjecter une position pendant un passage « épisode suivant ».
      if (forceStartFromBeginningRef.current || pendingNextEpisodeRef.current) {
        setSavedPlaybackPosition(null);
        return;
      }
      const deviceId = getOrCreateDeviceId();
      try {
        const params = new URLSearchParams(window.location.search);
        const tNum = Number(params.get('t'));
        const sNum = Number(params.get('season'));
        const eNum = Number(params.get('episode'));
        // Source unique (cartes, « Continuer », serveur, local) — par épisode pour les séries.
        const position = await resolveResumeSeconds({
          torrentId: activeTorrent.id,
          tmdbId: activeTorrent.tmdbId,
          tmdbType: activeTorrent.tmdbType,
          season: Number.isFinite(sNum) && params.has('season') ? sNum : null,
          episode: Number.isFinite(eNum) && eNum > 0 ? eNum : null,
          deviceId,
          preferredSeconds: Number.isFinite(tNum) && tNum > 0 ? tNum : null,
        });
        if (forceStartFromBeginningRef.current || pendingNextEpisodeRef.current) {
          setSavedPlaybackPosition(null);
          return;
        }
        if (position != null && position > 0) {
          setSavedPlaybackPosition(position);
          return;
        }
        setSavedPlaybackPosition(null);
      } catch (err) {
        console.debug('Erreur lors de la vÃ©rification de la position de lecture:', err);
        setSavedPlaybackPosition(null);
      }
    };
    checkSavedPosition();
  }, [activeTorrent.id, activeTorrent.tmdbId, activeTorrent.tmdbType]);

  // VÃ©rifier si le torrent est disponible localement (torrent actif)
  // Note: isAvailableLocally n'est mis Ã  true que lorsque des fichiers sont confirmÃ©s (loadVideoFiles ou files_available).
  // Note: Les erreurs 404 dans la console sont normales si le torrent n'est pas encore tÃ©lÃ©chargÃ©
  // On utilise d'abord listTorrents() (mÃªme source que la page /downloads) pour avoir les stats de tÃ©lÃ©chargement sur la page dÃ©tail (slug).
  useEffect(() => {
    if (hasInfoHash && activeTorrent.infoHash) {
      const checkAvailability = async () => {
        try {
          const { clientApi } = await import('../../../lib/client/api');
          const ih = activeTorrent.infoHash!.toLowerCase();
          let fromList: import('../../../lib/client/types').ClientTorrentStats | undefined;
          let isAvailableInClient = false;
          let isAvailableInLibrary = false;
          let isAvailableInLocalMedia = false;

          // Même source que /downloads : stats depuis listTorrents
          try {
            const list = await clientApi.listTorrents();
            listTorrentsSnapshotRef.current = { at: Date.now(), list };
            fromList = list.find(
              (t) => (t.info_hash ?? (t as unknown as { infoHash?: string }).infoHash ?? '').toLowerCase() === ih
            );
            if (fromList) {
              getTorrentFailCountRef.current = 0;
              setTorrentStats(fromList);
              const completed = fromList.state === 'completed' || fromList.state === 'seeding' || (fromList.progress ?? 0) >= 0.99;
              const checking =
                fromList.state === 'checking' ||
                (typeof fromList.state === 'string' && fromList.state.toLowerCase() === 'initializing');
              if (completed) {
                setIsAvailableLocally(true);
                isAvailableInClient = true;
              }
              // Post-reboot : même à 0% pendant la vérif, tenter les fichiers (métadonnées + disque).
              if ((completed || checking) && activeTorrent.infoHash) {
                try {
                  const videos = await loadVideoFiles(activeTorrent.infoHash);
                  if (videos.length > 0) {
                    setVideoFiles(videos);
                    if (!selectedFile) setSelectedFile(videos[0]);
                    setIsAvailableLocally(true);
                    isAvailableInClient = true;
                  }
                } catch {
                  /* library lookup ci-dessous */
                }
              }
            } else if (!progressPollIntervalRef?.current) {
              // Ne pas effacer les stats optimistes juste après un clic Télécharger :
              // listTorrents peut encore ne pas contenir le torrent.
              setTorrentStats(null);
            }
          } catch (_) {
            // listTorrents en échec (ex. client non dispo)
          }

          const applyCompletedLocalStats = (opts: {
            name?: string;
            fileSize?: number;
            markLibrary?: boolean;
            markLocalMedia?: boolean;
          }) => {
            // Ne pas marquer « complété » si le client a ce torrent à 0% (fichiers sparses).
            // Exception : pendant checking/initializing (post-reboot), progress_bytes reste à 0
            // tant que la vérif n'a pas avancé — les fichiers sont déjà sur disque.
            const listState = (fromList?.state ?? '').toLowerCase();
            const isCheckingState =
              listState === 'checking' || listState === 'initializing';
            const listProgress =
              typeof fromList?.progress === 'number' ? fromList.progress : null;
            const listDownloaded = fromList?.downloaded_bytes ?? 0;
            const torrentEmptyOnClient =
              !!fromList &&
              !isCheckingState &&
              fromList.files_available !== true &&
              (listProgress == null || listProgress <= 0.001) &&
              listDownloaded <= 0 &&
              fromList.state !== 'completed' &&
              fromList.state !== 'seeding';
            if (torrentEmptyOnClient) {
              return;
            }

            if (opts.markLibrary) isAvailableInLibrary = true;
            if (opts.markLocalMedia) isAvailableInLocalMedia = true;
            setIsAvailableLocally(true);
            setTorrentStats((prev) => {
              const prevState = (prev?.state ?? '').toLowerCase();
              const prevProgress = typeof prev?.progress === 'number' ? prev.progress : 0;
              // Pendant la vérif, conserver l'état checking (pas un faux « completed »).
              if (prevState === 'checking' || prevState === 'initializing' || isCheckingState) {
                return prev ?? fromList ?? null;
              }
              const looksStaleQueued =
                (prevState === 'queued' || prevState === 'downloading') &&
                prevProgress <= 0.001 &&
                (prev?.downloaded_bytes ?? 0) === 0 &&
                (prev?.download_speed ?? 0) === 0;
              const prevIsComplete =
                prevState === 'completed' || prevState === 'seeding' || prevProgress >= 0.99;
              // Ne jamais écraser un torrent réellement à 0% (sparse) par un faux « completed ».
              if (looksStaleQueued) return prev;
              if (prev && !prevIsComplete) return prev;
              return {
                info_hash: activeTorrent.infoHash!,
                name: opts.name || activeTorrent.name || '',
                state: 'completed',
                downloaded_bytes: opts.fileSize ?? prev?.downloaded_bytes ?? 0,
                uploaded_bytes: prev?.uploaded_bytes ?? 0,
                total_bytes: opts.fileSize ?? prev?.total_bytes ?? 0,
                progress: 1,
                download_speed: 0,
                upload_speed: 0,
                peers_connected: 0,
                peers_total: 0,
                seeders: 0,
                leechers: 0,
                eta_seconds: null,
                download_started: true,
              };
            });
          };

          // 1) Lookup ciblé par info_hash (évite getLibrary() full) — accepte aussi local_<uuid>
          if (hasInfoHash && activeTorrent.infoHash) {
            try {
              const byHash = await serverApi.findLocalMediaByInfoHash(activeTorrent.infoHash);
              const item = byHash.success ? (byHash.data as any) : null;
              const path =
                item?.file_path || item?.download_path || item?.downloadPath || null;
              if (item && (path || item.exists)) {
                const hasExistingPath = !!(activeTorrent as any).downloadPath || !!libraryDownloadPath;
                const pathIsFile =
                  typeof path === 'string' &&
                  /\.(mkv|mp4|avi|webm|mov|m4v|wmv|ts|m2ts)$/i.test(path.replace(/\\/g, '/'));
                if (path && !hasExistingPath && pathIsFile) {
                  // Ne pas coller un fichier d'un autre SxxExx (ex. pack S01 → localMedia hors épisode).
                  const se = parseSeasonEpisodeLabel(path);
                  const episodeOk =
                    !selectedEpisodeMeta ||
                    selectedEpisodeMeta.episode <= 0 ||
                    !se ||
                    (se.season === selectedEpisodeMeta.season &&
                      se.episode === selectedEpisodeMeta.episode);
                  if (episodeOk) {
                    setLibraryDownloadPath(path);
                  }
                }
                applyCompletedLocalStats({
                  name: item.name || item.file_name,
                  fileSize: item.file_size ?? item.fileSize,
                  markLibrary: true,
                });
              }
            } catch (_e) {
              // Ignorer
            }
          }

          // 2) Lookup ciblé par TMDB si pas déjà trouvé — matcher l'épisode sélectionné (pas localMedia[0])
          if (!isAvailableInLibrary && activeTorrent.tmdbId) {
            try {
              const localMedia = await clientApi.findLocalMediaByTmdb(
                activeTorrent.tmdbId,
                activeTorrent.tmdbType || undefined
              );
              if (localMedia.length > 0) {
                const hasExistingPathTmdb =
                  !!(activeTorrent as any).downloadPath || !!libraryDownloadPath;
                const currentName = (activeTorrent.name || '').toLowerCase();
                const seFromName =
                  currentName.match(/s([0-9]{1,2})[.\s-]*e([0-9]{1,3})/i) ||
                  currentName.match(/([0-9]{1,2})x([0-9]{1,3})/i);
                const targetSe =
                  selectedEpisodeMeta && selectedEpisodeMeta.episode > 0
                    ? { s: selectedEpisodeMeta.season, e: selectedEpisodeMeta.episode }
                    : seFromName
                      ? {
                          s: parseInt(seFromName[1], 10),
                          e: parseInt(seFromName[2], 10),
                        }
                      : null;
                const matchesSE = (m: any, s: number, e: number) => {
                  const n = `${m.file_name || ''} ${m.file_path || ''}`;
                  return (
                    new RegExp(`s0?${s}[.\\s_-]*e0?${e}\\b`, 'i').test(n) ||
                    new RegExp(`${s}x0?${e}\\b`, 'i').test(n)
                  );
                };
                const pathFromMap = targetSe
                  ? lookupBySeasonEpisodeKey(
                      libraryEpisodesPathMap,
                      targetSe.s,
                      targetSe.e,
                      tmdbSeasonEpisodeCounts,
                    ) || null
                  : null;
                const matchByEpisode = targetSe
                  ? localMedia.find((m: any) => {
                      if (matchesSE(m, targetSe.s, targetSe.e)) return true;
                      const abs = absoluteEpisodeNumber(
                        targetSe.s,
                        targetSe.e,
                        tmdbSeasonEpisodeCounts ?? new Map(),
                      );
                      return (
                        targetSe.s > 1 &&
                        abs !== targetSe.e &&
                        matchesSE(m, 1, abs)
                      );
                    })
                  : null;
                // Match flou uniquement sans cible SxxExx (évite pack S01 → S03E08 via "house"/"dragon").
                const matchByName =
                  !targetSe && !matchByEpisode && currentName
                    ? localMedia.find((m: any) => {
                        const n = (m.file_name || m.name || '').toLowerCase();
                        const tokens = currentName.split(/[.\s\-_]+/).filter((t) => t.length > 3);
                        const hit = tokens.filter((t) => n.includes(t)).length;
                        return hit >= 2;
                      })
                    : null;
                const matchByLocalId = activeTorrent.infoHash?.startsWith('local_')
                  ? localMedia.find(
                      (m: any) =>
                        m.id &&
                        (`local_${m.id}` === activeTorrent.infoHash ||
                          m.id === activeTorrent.infoHash.replace(/^local_/, '')),
                    )
                  : null;
                const chosen =
                  matchByEpisode ??
                  matchByLocalId ??
                  matchByName ??
                  // Jamais localMedia[0] pour une série avec épisode ciblé (souvent un autre SxxExx).
                  (targetSe ? null : localMedia[0]);
                const firstPath =
                  pathFromMap || (chosen as { file_path?: string } | null)?.file_path;
                const firstPathIsFile =
                  firstPath &&
                  /\.(mkv|mp4|avi|webm|mov|m4v|wmv|ts|m2ts)$/i.test(firstPath.replace(/\\/g, '/'));
                if (!hasExistingPathTmdb && firstPathIsFile) {
                  const se = parseSeasonEpisodeLabel(firstPath);
                  const episodeOk =
                    !targetSe ||
                    !se ||
                    (se.season === targetSe.s && se.episode === targetSe.e);
                  if (episodeOk) {
                    setLibraryDownloadPath(firstPath);
                  }
                }
                if (chosen || pathFromMap) {
                  applyCompletedLocalStats({
                    fileSize: (chosen as { file_size?: number } | null)?.file_size,
                    markLocalMedia: true,
                  });
                }
              }
            } catch (_) {
              // Ignorer
            }
          }

          // Si le média n'est trouvé dans AUCUNE source, on le marque non disponible.
          if (!isAvailableInClient && !isAvailableInLibrary && !isAvailableInLocalMedia) {
            // Média bibliothèque (local_*) : absent de listTorrents, ne pas repasser à false
            // (évite un flash isAvailableLocally et un redémarrage HLS en boucle).
            if (!ih.startsWith('local_') && !libraryDownloadPath && !(activeTorrent as { downloadPath?: string }).downloadPath) {
              setIsAvailableLocally(false);
            }
          }
          // Ne pas logger si stats est null (torrent non tÃ©lÃ©chargÃ©, c'est normal)
        } catch (err) {
          // Ignorer silencieusement les erreurs 404 (torrent non tÃ©lÃ©chargÃ©)
          if (err instanceof Error && (err.message.includes('404') || err.message.includes('Not Found'))) {
            return;
          }
          getTorrentFailCountRef.current += 1;
          // Ne pas effacer torrentStats si un polling de progression est actif (tÃ©lÃ©chargement en cours)
          // sinon la barre de progression disparaÃ®t briÃ¨vement puis rÃ©apparaÃ®t
          if (getTorrentFailCountRef.current >= 2 && !progressPollIntervalRef?.current) {
            setTorrentStats(null);
            getTorrentFailCountRef.current = 0;
          }
        }
      };

      checkAvailability();
    }
  }, [
    hasInfoHash,
    activeTorrent.infoHash,
    activeTorrent.tmdbId,
    activeTorrent.tmdbType,
    activeTorrent.clientState,
    activeTorrent.clientProgress,
    isExternal,
    refreshAfterClose,
    selectedEpisodeMeta,
    libraryEpisodesPathMap,
    parseSeasonEpisodeLabel,
  ]);

  // VÃ©rifier si un tÃ©lÃ©chargement est en cours au montage (torrent actif)
  useEffect(() => {
    const checkDownloadingTorrent = async () => {
      if (activeTorrent.clientState && activeTorrent.clientProgress !== undefined) {
        const isCompleted = activeTorrent.clientState === 'completed' || 
                            activeTorrent.clientState === 'seeding' || 
                            activeTorrent.clientProgress >= 0.95;
        const isChecking =
          activeTorrent.clientState === 'checking' ||
          activeTorrent.clientState === 'initializing';
        if ((isCompleted || isChecking) && hasInfoHash && activeTorrent.infoHash) {
          try {
            const videos = await loadVideoFiles(activeTorrent.infoHash);
            if (videos.length > 0) {
              setVideoFiles(videos);
              if (!selectedFile) {
                setSelectedFile(videos[0]);
              }
              // Fichiers présents = disponible localement (même en mode streaming / pendant checking).
              setIsAvailableLocally(true);
              setTorrentStats((prev) => {
                const prevState = (prev?.state ?? '').toLowerCase();
                const prevProgress = typeof prev?.progress === 'number' ? prev.progress : 0;
                const prevIsComplete = prevState === 'completed' || prevState === 'seeding' || prevProgress >= 0.99;
                if (prevIsComplete) return prev;
                // Garder checking visible ; ne pas forcer completed pendant la vérif.
                if (prevState === 'checking' || prevState === 'initializing' || isChecking) {
                  return prev;
                }
                const looksStaleQueued =
                  (prevState === 'queued' || prevState === 'downloading') &&
                  prevProgress <= 0.001 &&
                  (prev?.downloaded_bytes ?? 0) === 0 &&
                  (prev?.download_speed ?? 0) === 0;
                if (prev && !looksStaleQueued) return prev;
                return {
                  info_hash: activeTorrent.infoHash!,
                  name: activeTorrent.name || prev?.name || '',
                  state: 'completed',
                  downloaded_bytes: prev?.downloaded_bytes ?? 0,
                  uploaded_bytes: prev?.uploaded_bytes ?? 0,
                  total_bytes: prev?.total_bytes ?? 0,
                  progress: 1,
                  download_speed: 0,
                  upload_speed: 0,
                  peers_connected: 0,
                  peers_total: 0,
                  seeders: 0,
                  leechers: 0,
                  eta_seconds: null,
                  download_started: true,
                };
              });
            }
          } catch (err) {
            // Ignorer les erreurs
          }
          return;
        }
      }

      // Rafraîchir via listTorrents sauf si getTorrent (progress poll) est déjà actif.
      if (hasInfoHash && activeTorrent.infoHash && !isPlaying) {
        if (progressPollIntervalRef?.current) {
          return;
        }
        try {
          const ih = activeTorrent.infoHash.toLowerCase();
          try {
            const list = await clientApi.listTorrents();
            listTorrentsSnapshotRef.current = { at: Date.now(), list };
            const fromList = list.find(
              (t) => (t.info_hash ?? (t as unknown as { infoHash?: string }).infoHash ?? '').toLowerCase() === ih
            );
            if (fromList) {
              setTorrentStats(fromList);
              const completed = fromList.state === 'completed' || fromList.state === 'seeding' || (fromList.progress ?? 0) >= 0.95;
              if (completed) {
                try {
                  const videos = await loadVideoFiles(activeTorrent.infoHash!);
                  if (videos.length > 0) setIsAvailableLocally(true);
                } catch (_) {}
              }
              // Pas de startProgressPolling ici : listTorrents suffit pour l’UI stats ;
              // le progress poll est démarré uniquement depuis les actions download/play.
              return;
            }
          } catch (_) {}
        } catch (err) {
          if (err instanceof Error && (err.message.includes('404') || err.message.includes('Not Found'))) {
            return;
          }
          getTorrentFailCountRef.current += 1;
          if (getTorrentFailCountRef.current >= 2 && !progressPollIntervalRef?.current) {
            setTorrentStats(null);
            getTorrentFailCountRef.current = 0;
          }
        }
      }
    };

    checkDownloadingTorrent();
    const iv = setInterval(checkDownloadingTorrent, LIST_TORRENTS_POLL_MS);
    return () => clearInterval(iv);
  }, [hasInfoHash, activeTorrent.infoHash, activeTorrent.clientState, activeTorrent.clientProgress, isPlaying, playStatus, streamingTorrentActive]);

  // Détection des épisodes téléchargés dans la bibliothèque pour les séries
  useEffect(() => {
    if (torrent.tmdbType !== 'tv' || !torrent.tmdbId || !seriesEpisodes?.seasons) return;

    let cancelled = false;

    const areRecordsEqual = (a: Record<string, any>, b: Record<string, any>) => {
      const keysA = Object.keys(a);
      const keysB = Object.keys(b);
      if (keysA.length !== keysB.length) return false;
      return keysA.every((key) => a[key] === b[key]);
    };

    const updateDownloadedEpisodes = async () => {
      try {
        // Source 1 : Médias locaux indexés par le serveur
        const localMedias = await clientApi.findLocalMediaByTmdb(torrent.tmdbId!, 'tv');

        // Source 2 : listTorrents — réutiliser le snapshot du poll 5s s'il est frais
        const snap = listTorrentsSnapshotRef.current;
        const allTorrents =
          snap && Date.now() - snap.at < LIST_TORRENTS_POLL_MS + 1000
            ? snap.list
            : await clientApi.listTorrents().then((list) => {
                listTorrentsSnapshotRef.current = { at: Date.now(), list };
                return list;
              });

        if (cancelled) return;

        const episodesSet = new Set<string>();
        const pathMap: Record<string, string> = {};
        const infoHashMap: Record<string, string> = {};
        const seasonCounts = seasonEpisodeCountsFromSeasons(seriesEpisodes.seasons);

        /** Alias TMDB : fichier S01E25 → aussi clé 2:1 si S1 TMDB = 24 eps. */
        const addTmdbRelativeAlias = (literalSeason: number, literalEpisode: number) => {
          if (literalSeason !== 1 || literalEpisode <= 0) return;
          const s1Count = seasonCounts.get(1) ?? 0;
          if (s1Count <= 0 || literalEpisode <= s1Count) return;
          const rel = relativeEpisodeFromAbsolute(literalEpisode, seasonCounts);
          if (!rel || (rel.season === literalSeason && rel.episode === literalEpisode)) return;
          const litKey = `${literalSeason}:${literalEpisode}`;
          const relKey = `${rel.season}:${rel.episode}`;
          episodesSet.add(relKey);
          if (pathMap[litKey] && !pathMap[relKey]) pathMap[relKey] = pathMap[litKey];
          if (infoHashMap[litKey] && !infoHashMap[relKey]) infoHashMap[relKey] = infoHashMap[litKey];
        };

        // Helper pour extraire SxxEyy d'un nom de fichier ou de torrent
        const parseSE = (name: string) => {
          if (!name) return null;
          // Patterns: S01E01, 1x01, S01.E01, S01 - E01, Season 1 Episode 1
          const m = name.match(/s([0-9]{1,2})[.\s-]*e([0-9]{1,3})/i) || 
                    name.match(/([0-9]{1,2})x([0-9]{1,3})/i) ||
                    name.match(/season[.\s-]*([0-9]{1,2})[.\s-]*episode[.\s-]*([0-9]{1,3})/i);
          if (m) return { s: parseInt(m[1], 10), e: parseInt(m[2], 10) };
          return null;
        };
        const normalizeText = (v: string) =>
          (v || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();
        const tokenize = (v: string) =>
          normalizeText(v)
            .split(' ')
            .filter((w) => w.length >= 3 && !['the', 'les', 'des', 'une', 'and', 'for', 'with', 'episode', 'saison'].includes(w));
        // Toujours partir du torrent « page » (props), pas du torrent épisode actif : sinon le nom change
        // à chaque bascule d’info_hash et relance cet effet en boucle (library / fallback local).
        const activeTitleTokens = new Set<string>(
          tokenize(String(torrent.mainTitle || torrent.cleanTitle || torrent.name || '')),
        );
        const hasTitleAffinity = (torrentName: string): boolean => {
          if (!torrentName || activeTitleTokens.size === 0) return false;
          const tTokens = tokenize(torrentName);
          if (tTokens.length === 0) return false;
          let overlap = 0;
          for (const token of tTokens) {
            if (activeTitleTokens.has(token)) overlap += 1;
          }
          return overlap >= 1;
        };

        // 1. Analyser les médias locaux revenus de l'index
        if (localMedias && Array.isArray(localMedias)) {
          for (const media of localMedias) {
             // Priorité aux champs explicites du backend s'ils existent (local_media peut avoir season/episode_number)
             let s = media.season ?? media.season_number ?? media.seasonNumber;
             let e = media.episode ?? media.episode_number ?? media.episodeNumber;
             
             if (typeof s !== 'number' || typeof e !== 'number') {
               const se = parseSE(media.file_name || media.file_path || media.name || '');
               if (se) {
                 s = se.s;
                 e = se.e;
               }
             }

             if (typeof s === 'number' && typeof e === 'number') {
               const key = `${s}:${e}`;
               episodesSet.add(key);
               const rawPath = media.file_path || media.downloadPath;
               if (rawPath) {
                 let p = String(rawPath).replace(/\\/g, '/');
                 while (p.toLowerCase().startsWith('media/media/')) {
                   p = p.slice(6);
                 }
                 pathMap[key] = p;
               }
               // Préférer un vrai hash hex ; sinon stub local_<id> pour la lecture bibliothèque.
               const localInfoHash = (media.info_hash || media.infoHash || '').toString().trim();
               if (localInfoHash && /^[a-fA-F0-9]{32}$|^[a-fA-F0-9]{40}$/.test(localInfoHash)) {
                 infoHashMap[key] = localInfoHash;
               } else if (!infoHashMap[key] && media.id) {
                 infoHashMap[key] = `local_${media.id}`;
               }
               addTmdbRelativeAlias(s, e);
             }
          }
        }

        const downloadingMap: Record<string, number> = {};
        // 2. Analyser les torrents (complétés ou en cours)
        for (const t of allTorrents) {
          const isCompleted =
            t.state === 'completed' || t.state === 'seeding' || t.files_available === true;
          const isDownloading =
            t.state === 'downloading' ||
            t.state === 'queued' ||
            t.state === 'checking' ||
            (t.state === 'active' && (t.progress ?? 0) < 0.99);

          if (t.name) {
            // Matching prioritaire: ID TMDB quand disponible.
            // Fallback contrôlé: similarité de titre quand tmdb_id absent côté client_torrents.
            let matched = false;
            const tTmdbId = (t as any).tmdb_id || (t as any).tmdbId;
            if (torrent.tmdbId && tTmdbId && Number(tTmdbId) === Number(torrent.tmdbId)) {
              matched = true;
            }
            if (!matched && !tTmdbId && hasTitleAffinity(String(t.name || ''))) {
              matched = true;
            }

            if (matched) {
               const se = parseSE(t.name);
                 if (se) {
                 const key = `${se.s}:${se.e}`;
                 if (isCompleted) {
                   if (!episodesSet.has(key)) {
                      episodesSet.add(key);
                   }
                 } else if (isDownloading && !episodesSet.has(key)) {
                   downloadingMap[key] = Math.round((t.progress ?? 0) * 100);
                 }
                 
                 const torrentInfoHash = ((t as any).info_hash || (t as any).infoHash || '').toString().trim();
                 // Un hash torrent réel remplace toujours un stub local_* (lecture via librqbit).
                 if (torrentInfoHash && /^[a-fA-F0-9]{32}$|^[a-fA-F0-9]{40}$/.test(torrentInfoHash)) {
                   const existing = infoHashMap[key];
                   if (!existing || existing.startsWith('local_')) {
                     infoHashMap[key] = torrentInfoHash;
                   }
                 }
                 addTmdbRelativeAlias(se.s, se.e);
               }
            }
          }
        }
        // Fallback final : entrée bibliothèque / route (props), pas le torrent épisode sélectionné.
        if (torrent.infoHash && torrent.name) {
          const currentSe = parseSE(torrent.name);
          if (currentSe) {
            const currentKey = `${currentSe.s}:${currentSe.e}`;
            // On ne l'ajoute que s'il n'est pas déjà détecté comme complété (pour éviter les doublons dans le set)
            if (!episodesSet.has(currentKey)) {
              episodesSet.add(currentKey);
            }
            if (!infoHashMap[currentKey]) {
              infoHashMap[currentKey] = String(torrent.infoHash).trim();
            }
          }
        }

        if (!cancelled) {
          setDownloadedEpisodesSet((prev) => {
            if (prev.size === episodesSet.size) {
              let hasChanged = false;
              for (const item of episodesSet) {
                if (!prev.has(item)) {
                  hasChanged = true;
                  break;
                }
              }
              if (!hasChanged) return prev;
            }
            return episodesSet;
          });
          setLibraryEpisodesPathMap((prev) => areRecordsEqual(prev, pathMap) ? prev : pathMap);
          setLibraryEpisodesInfoHashMap((prev) => areRecordsEqual(prev, infoHashMap) ? prev : infoHashMap);
          setDownloadingEpisodesMap((prev) => areRecordsEqual(prev, downloadingMap) ? prev : downloadingMap);
        }
      } catch (err) {
        console.error('[MediaDetailPage] Erreur updateDownloadedEpisodes:', err);
      }
    };

    updateDownloadedEpisodes();
    const iv = setInterval(updateDownloadedEpisodes, EPISODES_LIBRARY_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [
    torrent.tmdbId,
    torrent.tmdbType,
    seriesEpisodes,
    torrent.name,
    torrent.mainTitle,
    torrent.cleanTitle,
  ]);

  // Auto-téléchargement des nouveaux épisodes : désactivé — rien ne démarre
  // juste à l'ouverture d'une fiche (recherche → détail). Lire / Télécharger restent manuels.

  // Afficher le panneau de vÃ©rification quand un tÃ©lÃ©chargement vient d'Ãªtre ajoutÃ© (Ã©vÃ©nement torrentAdded)
  useEffect(() => {
    const onTorrentAdded = (e: Event) => {
      const customEvent = e as CustomEvent<{ infoHash?: string; name?: string }>;
      const infoHash = customEvent.detail?.infoHash;
      const name = customEvent.detail?.name;
      if (infoHash && typeof infoHash === 'string' && infoHash.trim()) {
        setVerificationInfoHash(infoHash.trim());
        setVerificationTorrentName(typeof name === 'string' && name.trim() ? name.trim() : null);
        setShowVerificationPanel(true);
      }
    };
    window.addEventListener('torrentAdded', onTorrentAdded);
    return () => window.removeEventListener('torrentAdded', onTorrentAdded);
  }, []);

  // Focus par défaut en TV : série → 1re carte du carrousel (ou carte reprise si position > 0) ; sinon Lire > Télécharger > Retour
  useEffect(() => {
    if (!isTVPlatform()) return;
    if (isPlayingTrailer && !trailerUiVisible) return;
    const hasSeriesCarousel = !!seriesEpisodes?.seasons?.length;
    const seriesResume =
      hasSeriesCarousel &&
      savedPlaybackPosition != null &&
      savedPlaybackPosition > 0 &&
      selectedEpisodeVariantId != null;
    const firstSeasonWithEpisodes = seriesEpisodes?.seasons.find((s) => (s.episodes?.length ?? 0) > 0);
    const firstCarouselEpisodeId = firstSeasonWithEpisodes?.episodes?.[0]?.id ?? null;
    // Série commencée : focus sur le dernier épisode regardé (saison comprise), même sans
    // position sauvegardée pour la fiche (avant : 1re carte du carrousel).
    const isResumeTarget =
      hasSeriesCarousel && !!resumeTargetEpisodeId && resumeTargetEpisodeId === selectedEpisodeVariantId;
    // Déjà focalisé une fois : ne pas reprendre le focus à l'utilisateur sur un re-rendu.
    if (isResumeTarget && resumeTvFocusDoneRef.current === resumeTargetEpisodeId) return;
    const focusEpisodeCardId =
      hasSeriesCarousel && selectedEpisodeVariantId
        ? seriesResume || isResumeTarget
          ? selectedEpisodeVariantId
          : (firstCarouselEpisodeId ?? selectedEpisodeVariantId)
        : null;
    const delayMs = seriesResume || isResumeTarget ? 550 : hasSeriesCarousel ? 400 : 200;
    let cancelled = false;
    const t = setTimeout(() => {
      if (cancelled) return;
      const focusPlayOrBack = () => {
        if (cancelled) return;
        const playEl = document.querySelector('[data-media-detail-action="play"]') as HTMLButtonElement | null;
        const downloadEl = document.querySelector('[data-media-detail-action="download"]') as HTMLButtonElement | null;
        const backLink = backLinkRef.current;
        const el =
          playEl && !playEl.disabled
            ? playEl
            : downloadEl && !downloadEl.disabled
              ? downloadEl
              : backLink;
        const active = document.activeElement as HTMLElement | null;
        const shouldAutoFocus = !active || active === document.body || (backLink && active === backLink);
        if (el && shouldAutoFocus && el !== active) el.focus();
      };

      if (focusEpisodeCardId) {
        const variantId = focusEpisodeCardId;
        const tryFocusEpisode = (remaining: number) => {
          if (cancelled) return;
          const epBtn = document.querySelector(
            `[data-episode-card="${CSS.escape(variantId)}"]`,
          ) as HTMLElement | null;
          if (epBtn) {
            epBtn.focus();
            if (isResumeTarget) {
              resumeTvFocusDoneRef.current = variantId;
              // Rangée de la bonne saison bien visible + carte centrée dans la rangée.
              try {
                epBtn.scrollIntoView({ block: 'center', inline: 'center' });
              } catch {
                /* anciens moteurs */
              }
            }
            return;
          }
          if (remaining > 0) {
            setTimeout(() => tryFocusEpisode(remaining - 1), 120);
            return;
          }
          focusPlayOrBack();
        };
        tryFocusEpisode(12);
        return;
      }
      focusPlayOrBack();
    }, delayMs);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [
    activeTorrent?.id,
    isAvailableLocally,
    isPlaying,
    isPlayingTrailer,
    trailerUiVisible,
    seriesEpisodes,
    savedPlaybackPosition,
    selectedEpisodeVariantId,
    resumeTargetEpisodeId,
  ]);

  // Tactile / desktop : série commencée → amener la carte du dernier épisode regardé à l'écran
  // (bonne rangée de saison + carte centrée), surlignée par l'état « sélectionné ».
  useEffect(() => {
    if (isTVPlatform()) return;
    const target = resumeTargetEpisodeId;
    if (!target || target !== selectedEpisodeVariantId) return;
    if (resumeRevealDoneRef.current === target) return;
    // Bande-annonce immersive : attendre que l'UI soit visible (sans voler la vue de la vidéo).
    if (isPlayingTrailer && !trailerUiVisible) return;
    let cancelled = false;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      if (cancelled) return;
      const card = document.querySelector<HTMLElement>(`[data-episode-card="${CSS.escape(target)}"]`);
      if (!card) {
        tries += 1;
        if (tries < 20) timer = setTimeout(tick, 150);
        return;
      }
      resumeRevealDoneRef.current = target;
      // Plus de 6 s après l'ouverture : seulement recentrer la carte dans sa rangée (pas de saut de page).
      const late = Date.now() - resumeTargetResolvedAtRef.current > 6000;
      if (late) {
        const scroller = card.closest<HTMLElement>('[data-tv-episode-scroller]');
        if (scroller) {
          scroller.scrollLeft = Math.max(0, card.offsetLeft - (scroller.clientWidth - card.offsetWidth) / 2);
        }
        return;
      }
      try {
        card.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
      } catch {
        card.scrollIntoView();
      }
    };
    timer = setTimeout(tick, 350);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [resumeTargetEpisodeId, selectedEpisodeVariantId, isPlayingTrailer, trailerUiVisible]);

  // Télécommande : Retour quitte la fiche (pas de bouton Retour à l'écran en TV)
  useEffect(() => {
    const el = tvBackHandlerRef.current;
    if (!el) return;
    const goBack = () => {
      if (typeof window !== 'undefined' && window.history.length > 1) {
        window.history.back();
      } else if (backHref) {
        window.location.href = backHref;
      } else {
        window.location.href = '/dashboard';
      }
    };
    (el as HTMLElement & { _tvBack?: () => void })._tvBack = () => {
      const backLink = backLinkRef.current;
      if (!backLink) {
        goBack();
        return;
      }
      if (document.activeElement === backLink) {
        goBack();
      } else {
        backLink.focus();
      }
    };
    return () => {
      delete (el as HTMLElement & { _tvBack?: () => void })._tvBack;
    };
  }, [backHref]);

  // Utiliser directement le trailerKey du torrent s'il est disponible (torrent principal pour la sÃ©rie)
  useEffect(() => {
    if (torrent.trailerKey) {
      setTrailerKey(torrent.trailerKey);
      setIsPlayingTrailer(false);
    } else {
      setTrailerKey(null);
      setIsPlayingTrailer(false);
    }
  }, [torrent.trailerKey]);

  // Lancer automatiquement la bande-annonce (sans clic)
  useEffect(() => {
    if (!trailerKey || hasAutoPlayedTrailerRef.current) return;
    hasAutoPlayedTrailerRef.current = true;
    setIsPlayingTrailer(true);
  }, [trailerKey]);

  // Quand on ferme la bande-annonce, rÃ©afficher lâ€™UI pour la prochaine fois
  useEffect(() => {
    if (!isPlayingTrailer) setTrailerUiVisible(true);
  }, [isPlayingTrailer]);

  // Bande-annonce immersive : ne pas laisser le focus dans le héros aria-hidden (pas le carrousel épisodes).
  useEffect(() => {
    if (!isPlayingTrailer || trailerUiVisible) return;
    const scope = trailerImmersiveHiddenChromeRef.current;
    const active = document.activeElement;
    if (scope && active instanceof HTMLElement && scope.contains(active)) {
      active.blur();
    }
    const layer = trailerImmersiveLayerRef.current;
    if (layer) {
      requestAnimationFrame(() => {
        try {
          layer.focus({ preventScroll: true });
        } catch {
          layer.focus();
        }
      });
    }
  }, [isPlayingTrailer, trailerUiVisible]);

  // TV : quand l'UI redevient visible pendant la bande-annonce â†’ focus sur Lire ou TÃ©lÃ©charger
  useEffect(() => {
    if (!isPlayingTrailer || !trailerUiVisible || !isTVPlatform()) return;
    const t = setTimeout(() => {
      const playEl = document.querySelector<HTMLElement>('[data-media-detail-action="play"]');
      const downloadEl = document.querySelector<HTMLElement>('[data-media-detail-action="download"]');
      const el =
        playEl && !(playEl as HTMLButtonElement).disabled
          ? playEl
          : downloadEl && !(downloadEl as HTMLButtonElement).disabled
            ? downloadEl
            : null;
      if (el) el.focus();
    }, 80);
    return () => clearTimeout(t);
  }, [trailerUiVisible, isPlayingTrailer]);

  // Clic ou touche en mode immersif â†’ rÃ©afficher les infos. Escape/Retour quand UI visible â†’ fermer la bande-annonce.
  useEffect(() => {
    if (!isPlayingTrailer) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const inInput = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || (target?.isContentEditable ?? false);
      if (e.key === 'Backspace' && inInput) return;
      // En mode immersif : toute touche (dont Retour) rÃ©affiche lâ€™UI sans fermer
      if (!trailerUiVisible) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setTrailerUiVisible(true);
        return;
      }
      if (e.key === 'Escape' || e.key === 'Backspace' || e.key === 'BrowserBack' || e.key === 'GoBack') {
        e.preventDefault();
        e.stopPropagation();
        setIsPlayingTrailer(false);
      }
    };
    const handleWebOSBack = () => {
      if (!trailerUiVisible) {
        setTrailerUiVisible(true);
      } else {
        setIsPlayingTrailer(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    if (typeof window !== 'undefined' && (window as any).webOS) {
      window.addEventListener('webosback', handleWebOSBack);
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (typeof window !== 'undefined' && (window as any).webOS) {
        window.removeEventListener('webosback', handleWebOSBack);
      }
    };
  }, [isPlayingTrailer, trailerUiVisible]);

  // Initialiser saison/épisode : query params → dernier épisode regardé (progression par
  // épisode, serveur) → position locale → API resume → 1er épisode.
  useEffect(() => {
    if (!seriesEpisodes?.seasons?.length || selectedSeasonNum !== null) return;
    let cancelled = false;

    const resolveEpisodeSelection = (opts: {
      variantId?: string | null;
      season?: number | null;
      episode?: number | null;
    }): { epId: string; seasonNum: number } | null => {
      const seasons = seriesEpisodes.seasons;
      if (opts.variantId && opts.variantId !== 'library') {
        for (const s of seasons) {
          const e = s.episodes.find((x) => x.id === opts.variantId);
          if (e) return { epId: e.id, seasonNum: s.season };
        }
      }
      if (opts.season != null && opts.episode != null) {
        const s = seasons.find((x) => x.season === opts.season);
        const e = s?.episodes.find((x) => x.episode === opts.episode);
        if (e && s) return { epId: e.id, seasonNum: s.season };
      }
      return null;
    };

    const markResumeTarget = (epId: string) => {
      resumeTargetResolvedAtRef.current = Date.now();
      setResumeTargetEpisodeId(epId);
    };

    (async () => {
      // 1) Query params (deep-link de la rangée Reprendre)
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const variantParam = params.get('variantId');
        const seasonParam = params.get('season');
        const episodeParam = params.get('episode');
        const sNum = seasonParam != null ? Number(seasonParam) : NaN;
        const eNum = episodeParam != null ? Number(episodeParam) : NaN;
        const fromUrl = resolveEpisodeSelection({
          variantId: variantParam,
          season: Number.isFinite(sNum) ? sNum : null,
          episode: Number.isFinite(eNum) ? eNum : null,
        });
        if (!cancelled && fromUrl) {
          setSelectedSeasonNum(fromUrl.seasonNum);
          setSelectedEpisodeVariantId(fromUrl.epId);
          markResumeTarget(fromUrl.epId);
          return;
        }
      }

      const tid = activeTorrent.tmdbId;
      const tty = activeTorrent.tmdbType;
      if (typeof tid !== 'number' || tty !== 'tv') {
        // Film / pas de TMDB : premier épisode si structure série quand même
      } else {
        // 2) Dernier épisode regardé d'après la progression PAR ÉPISODE (fusion appareil +
        //    serveur, partagée web / webOS / Android TV / desktop). Rattrapage serveur borné.
        try {
          await Promise.race([
            syncWatchedEpisodesFromServer(tid).catch(() => undefined),
            new Promise((resolve) => setTimeout(resolve, 1500)),
          ]);
        } catch {
          /* hors-ligne : progression locale seule */
        }
        if (cancelled) return;
        const lastWatched = pickLastWatchedEpisode(
          seriesEpisodes.seasons,
          getEpisodeProgressMap(tid),
          getWatchedEpisodesSet(tid),
        );
        if (lastWatched) {
          const fromProgress = resolveEpisodeSelection({
            season: lastWatched.season,
            episode: lastWatched.episode,
          });
          if (fromProgress) {
            setSelectedSeasonNum(fromProgress.seasonNum);
            setSelectedEpisodeVariantId(fromProgress.epId);
            markResumeTarget(fromProgress.epId);
            return;
          }
        }

        // 3) localStorage (savePlaybackPositionByMedia) — même appareil
        const deviceId = getOrCreateDeviceId();
        const record = await getPlaybackPositionByMediaRecord(tid, tty, deviceId);
        if (cancelled) return;
        if (record && (record.position > 0 || record.season != null || record.variantId)) {
          const fromLocal = resolveEpisodeSelection({
            variantId: record.variantId,
            season: record.season,
            episode: record.episode,
          });
          if (fromLocal) {
            setSelectedSeasonNum(fromLocal.seasonNum);
            setSelectedEpisodeVariantId(fromLocal.epId);
            markResumeTarget(fromLocal.epId);
            return;
          }
        }

        // 4) API « Reprendre » (compte utilisateur) — ouverture hors rangée Reprendre
        try {
          const res = await serverApi.listResumeWatching({ limit: 80 });
          if (cancelled) return;
          if (res.success && Array.isArray(res.data)) {
            const hit = res.data.find(
              (it) =>
                it.tmdb_type === 'tv' &&
                it.tmdb_id === tid &&
                ((it.season != null && it.episode != null) || it.variant_id),
            );
            if (hit) {
              const fromApi = resolveEpisodeSelection({
                variantId: hit.variant_id,
                season: hit.season,
                episode: hit.episode,
              });
              if (fromApi) {
                setSelectedSeasonNum(fromApi.seasonNum);
                setSelectedEpisodeVariantId(fromApi.epId);
                markResumeTarget(fromApi.epId);
                return;
              }
            }
          }
        } catch {
          // ignore — fallback 1er épisode
        }
      }

      if (cancelled) return;

      // 5) Rien de regardé : comportement par défaut — premier épisode (saison 0 / spéciaux en dernier)
      const first =
        seriesEpisodes.seasons.find((s) => s.season > 0 && (s.episodes?.length ?? 0) > 0) ??
        seriesEpisodes.seasons.find((s) => (s.episodes?.length ?? 0) > 0);
      if (first?.episodes?.length) {
        setSelectedSeasonNum(first.season);
        setSelectedEpisodeVariantId(first.episodes[0].id);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [seriesEpisodes, selectedSeasonNum, activeTorrent.tmdbId, activeTorrent.tmdbType]);

  // Torrent actif : infoHash et validitÃ© (dÃ©clarÃ©s tÃ´t pour les effets ci-dessous)
  const activeInfoHash = activeTorrent.infoHash;
  const hasValidInfoHash = Boolean(
    activeInfoHash &&
    typeof activeInfoHash === 'string' &&
    activeInfoHash.trim().length > 0
  );

  // Extraire SxxExx depuis un chemin ou un nom (ex. "Series S01E05.mkv" ou "series/Name/S01/E05.mkv")
  const parseSeasonEpisodeFromVariant = useCallback((v: any): { season: number; episode: number } | null => {
    const text = [v.downloadPath, v.name, (v as any).cleanTitle].filter(Boolean).join(' ').toLowerCase();
    // S01E05, s1e5, 1x05, S1-E5 (épisode jusqu'à 3 chiffres)
    const m = text.match(/(?:s(\d{1,2})[.\s-]*e(\d{1,3})|(\d{1,2})x(\d{1,3}))/i);
    if (m) {
      const s = parseInt(m[1] ?? m[3], 10);
      const e = parseInt(m[2] ?? m[4], 10);
      if (!Number.isNaN(s) && !Number.isNaN(e)) return { season: s, episode: e };
    }
    return null;
  }, []);

  const resolveVariantForSelectedEpisode = useCallback(
    (episodeVariantId: string | null): MediaDetailPageProps['torrent'] | null => {
      if (!seriesEpisodes?.seasons?.length || episodeVariantId == null) return null;
      let variant: MediaDetailPageProps['torrent'] | null | undefined = allVariants.find((v: any) => v.id === episodeVariantId);
      let episodeSeason: number | null = null;
      let episodeNumber: number | null = null;
      const seasonForEp = seriesEpisodes.seasons.find((s) => s.episodes.some((e) => e.id === episodeVariantId));
      const epMeta = seasonForEp?.episodes.find((e) => e.id === episodeVariantId);
      if (epMeta) {
        episodeSeason = epMeta.season;
        episodeNumber = epMeta.episode;
      }
      if (!variant) {
        const season = seasonForEp;
        const ep = epMeta;
        if (ep != null) {
          if (ep.info_hash) {
            variant = allVariants.find((v: any) => (v.infoHash || (v as any).info_hash) === ep.info_hash);
          }
          if (!variant) {
            variant = allVariants.find((v: any) => {
              const name = String(v.name || v.cleanTitle || v.downloadPath || '');
              if (
                seriesReleaseMatchOpts &&
                episodeReleaseMatchesTmdbEpisode(ep.season, ep.episode, name, seriesReleaseMatchOpts)
              ) {
                return true;
              }
              const se = parseSeasonEpisodeFromVariant(v);
              if (!se) return false;
              if (se.season === ep.season && se.episode === ep.episode) return true;
              return releaseMatchesTmdbEpisode(
                se.season,
                se.episode,
                ep.season,
                ep.episode,
                tmdbSeasonEpisodeCounts,
              );
            });
          }
          if (!variant) {
            const key = `${ep.season}:${ep.episode}`;
            const fallbackInfoHash =
              (
                ep.info_hash ||
                lookupBySeasonEpisodeKey(
                  libraryEpisodesInfoHashMap,
                  ep.season,
                  ep.episode,
                  tmdbSeasonEpisodeCounts,
                ) ||
                ''
              )
                .toString()
                .trim() || null;
            const fallbackPath =
              lookupBySeasonEpisodeKey(
                libraryEpisodesPathMap,
                ep.season,
                ep.episode,
                tmdbSeasonEpisodeCounts,
              ) || null;
            if (fallbackInfoHash || fallbackPath) {
              variant = {
                ...torrent,
                id: ep.id || `${torrent.id || 'episode'}_${key}`,
                infoHash: fallbackInfoHash,
                downloadPath: fallbackPath ?? torrent.downloadPath ?? null,
                name: ep.name || torrent.name,
                tmdbType: torrent.tmdbType ?? 'tv',
              };
            }
          }
          // Pack saison correspondant au cour scène (E25 → pack S02, jamais S01 ni « best » S03).
          if (!variant && ep.episode > 0) {
            const packMatch = allVariants.find((v: any) => {
              const name = String(v.name || v.cleanTitle || '');
              if (!name) return false;
              if (seriesReleaseMatchOpts) {
                return scenePackMatchesTmdbEpisode(
                  ep.season,
                  ep.episode,
                  name,
                  seriesReleaseMatchOpts,
                );
              }
              return false;
            });
            if (packMatch) variant = packMatch;
          }
          // Pack virtuel épisode 0 de la saison TMDB (séries classiques multi-saisons).
          if (!variant && ep.episode > 0 && !seriesReleaseMatchOpts?.continuous) {
            const packEp = season?.episodes.find((e) => e.episode === 0);
            if (packEp?.id) {
              variant = allVariants.find((v: any) => v.id === packEp.id);
              if (!variant && packEp.info_hash) {
                variant = allVariants.find(
                  (v: any) => (v.infoHash || (v as any).info_hash) === packEp.info_hash,
                );
              }
            }
          }
          // Jamais de fallback « meilleur torrent du groupe » pour un épisode N :
          // ça choisit S03E02 pour E25 et provoque l’oscillation de hash.
        }
      }

      // Enrichir avec chemin / hash bibliothèque pour l'épisode (évite local_* sans downloadPath).
      if (variant && episodeSeason != null && episodeNumber != null && episodeNumber > 0) {
        const libPath = lookupBySeasonEpisodeKey(
          libraryEpisodesPathMap,
          episodeSeason,
          episodeNumber,
          tmdbSeasonEpisodeCounts,
        );
        const libHash = (
          lookupBySeasonEpisodeKey(
            libraryEpisodesInfoHashMap,
            episodeSeason,
            episodeNumber,
            tmdbSeasonEpisodeCounts,
          ) || ''
        )
          .toString()
          .trim();
        const currentHash = String(
          variant.infoHash || (variant as { info_hash?: string }).info_hash || '',
        ).trim();
        const isHexHash = (h: string) => /^[a-fA-F0-9]{32}$|^[a-fA-F0-9]{40}$/.test(h);
        // Ne jamais remplacer un vrai infoHash torrent par un stub local_* (reset lecteur / mauvaises URLs).
        let nextHash = currentHash || libHash || null;
        if (isHexHash(currentHash)) {
          nextHash = currentHash;
        } else if (isHexHash(libHash)) {
          nextHash = libHash;
        } else if (currentHash) {
          nextHash = currentHash;
        } else {
          nextHash = libHash || null;
        }
        if (libPath || nextHash !== (variant.infoHash || null)) {
          variant = {
            ...variant,
            downloadPath: libPath || (variant as { downloadPath?: string }).downloadPath || null,
            infoHash: nextHash,
          };
        }
      }

      return variant ?? null;
    },
    [
      seriesEpisodes,
      allVariants,
      parseSeasonEpisodeFromVariant,
      libraryEpisodesInfoHashMap,
      libraryEpisodesPathMap,
      torrent,
      tmdbSeasonEpisodeCounts,
      seriesReleaseMatchOpts,
      selectedSceneEpisode,
    ],
  );

  const handleSeriesEpisodeSelect = useCallback(
    (episodeVariantId: string) => {
      if (!seriesEpisodes?.seasons?.length) return;
      if (isPlayingTrailer && !trailerUiVisible) {
        setTrailerUiVisible(true);
      }
      const se = seriesEpisodes.seasons.find((s) => s.episodes.some((e) => e.id === episodeVariantId));
      if (se) setSelectedSeasonNum(se.season);
      setSelectedEpisodeVariantId(episodeVariantId);
      // Appliquer tout de suite le torrent résolu (évite l’attente sameHash + oscillation S01/S03).
      const resolved = resolveVariantForSelectedEpisode(episodeVariantId);
      if (resolved) {
        setSelectedTorrent(resolved);
        setCurrentSeedCount(resolved.seedCount ?? 0);
        setCurrentLeechCount(resolved.leechCount ?? 0);
        setCurrentFileSize(resolved.fileSize ?? 0);
        if (resolved.downloadPath) setLibraryDownloadPath(resolved.downloadPath);
      }
      episodePlayIntentRef.current = episodeVariantId;
      setEpisodePlayNonce((n) => n + 1);
    },
    [
      seriesEpisodes,
      isPlayingTrailer,
      trailerUiVisible,
      resolveVariantForSelectedEpisode,
    ],
  );

  // Synchroniser selectedTorrent (et libraryDownloadPath) quand l'utilisateur choisit un Ã©pisode (sÃ©ries)
  useEffect(() => {
    if (!seriesEpisodes?.seasons?.length || selectedEpisodeVariantId == null) return;
    const variant = resolveVariantForSelectedEpisode(selectedEpisodeVariantId);
    if (variant) {
      setSelectedTorrent((prev: MediaDetailPageProps['torrent']) => {
        const vh = String(variant.infoHash || (variant as { info_hash?: string }).info_hash || '').toLowerCase();
        const ph = String(prev?.infoHash || (prev as { info_hash?: string })?.info_hash || '').toLowerCase();
        if (prev && variant.id === prev.id && vh === ph) return prev;
        // Même épisode : garder le hash torrent réel plutôt qu'un stub local_* (évite reset HLS).
        const prevIsHex = /^[a-f0-9]{32}$|^[a-f0-9]{40}$/.test(ph);
        const nextIsLocal = vh.startsWith('local_');
        if (prev && prevIsHex && nextIsLocal) {
          const parseSe = (name: string) => {
            const m =
              name.match(/s(\d{1,2})[.\s_-]*e(\d{1,3})/i) ||
              name.match(/(\d{1,2})x(\d{1,3})/i);
            return m
              ? { s: parseInt(m[1], 10), e: parseInt(m[2], 10) }
              : null;
          };
          const prevSe = parseSe(String(prev.name || ''));
          const nextSe = parseSe(String(variant.name || ''));
          const sameEpisode =
            prevSe &&
            nextSe &&
            prevSe.s === nextSe.s &&
            prevSe.e === nextSe.e;
          if (sameEpisode) {
            return {
              ...variant,
              infoHash: prev.infoHash,
              downloadPath:
                variant.downloadPath ||
                (prev as { downloadPath?: string | null }).downloadPath ||
                null,
            };
          }
        }
        return variant;
      });
      setCurrentSeedCount(variant.seedCount ?? 0);
      setCurrentLeechCount(variant.leechCount ?? 0);
      setCurrentFileSize(variant.fileSize ?? 0);
      if (variant.downloadPath) {
        setLibraryDownloadPath((prev) => {
          const next = variant.downloadPath ?? null;
          if (!next) return prev;
          return prev === next ? prev : next;
        });
      }
    }
  }, [seriesEpisodes, selectedEpisodeVariantId, resolveVariantForSelectedEpisode]);

  // Après clic sur une carte épisode : lancer Lire quand le torrent actif correspond à la variante résolue.
  // Si l'épisode N>0 est servi via un pack saison, n'ajouter que ce fichier (only_files) — pas toute la saison.
  useEffect(() => {
    if (episodePlayNonce === 0) return;
    const intent = episodePlayIntentRef.current;
    if (intent == null || selectedEpisodeVariantId !== intent) return;
    const expected = resolveVariantForSelectedEpisode(intent);
    if (!expected) {
      episodePlayIntentRef.current = null;
      addNotification('error', t('mediaDetail.episodeNoSource'));
      return;
    }
    const sameId = Boolean(activeTorrent.id && expected.id && activeTorrent.id === expected.id);
    const sameHash =
      Boolean(activeTorrent.infoHash && expected.infoHash) &&
      String(activeTorrent.infoHash).toLowerCase() === String(expected.infoHash).toLowerCase();
    if (!sameId && !sameHash) return;

    episodePlayIntentRef.current = null;

    void (async () => {
      // « Épisode suivant » : toujours repartir du début (ne pas reprendre la position de l’épisode courant).
      if (forceStartFromBeginningRef.current) {
        forceStartFromBeginningRef.current = false;
        setPlaybackStartMode(true);
        setSavedPlaybackPosition(null);
      } else {
        // Reprise si une position (< 95 %) existe pour CET épisode — résolue par le lecteur.
        setPlaybackStartMode(false);
      }
      const el = videoWrapperRef.current || (document.getElementById('video-player-wrapper') as HTMLDivElement);
      if (el && !document.fullscreenElement) {
        try {
          await el.requestFullscreen();
        } catch (_) {}
      }
      continueInBackgroundRef.current = false;

      // Épisode individuel déjà en bibliothèque → lecture locale / flux normal.
      const season = seriesEpisodes?.seasons?.find((s) => s.episodes.some((e) => e.id === intent));
      const clickedEp = season?.episodes.find((e) => e.id === intent);
      const localPath =
        clickedEp && clickedEp.episode > 0
          ? lookupBySeasonEpisodeKey(
              libraryEpisodesPathMap,
              clickedEp.season,
              clickedEp.episode,
              tmdbSeasonEpisodeCounts,
            )
          : null;
      if (localPath) {
        setLibraryDownloadPath(localPath);
        setSelectedFile({
          path: localPath,
          name: localPath.split(/[/\\]/).pop() || 'video',
          size: 0,
          is_video: true,
        });
        handlePlay();
        return;
      }

      // Pack déjà listé en mémoire : basculer tout de suite sur le fichier SxxExx (évite rejouer le même).
      if (clickedEp && clickedEp.episode > 0 && videoFiles.length > 1) {
        const memIdx = findPackFileIndexForEpisode(
          videoFiles.map((f) => ({ name: f.path || f.name })),
          clickedEp.season,
          clickedEp.episode,
          tmdbSeasonEpisodeCounts,
          selectedSceneEpisode,
        );
        if (memIdx != null) {
          const nextFile = videoFiles[memIdx];
          setSelectedFile(nextFile);
          const currentHash = String(
            addedTorrentInfoHash ||
              activeTorrent.infoHash ||
              (activeTorrent as { info_hash?: string }).info_hash ||
              '',
          ).toLowerCase();
          if (currentHash && /^[a-f0-9]{40}$/i.test(currentHash) && typeof nextFile.index === 'number') {
            const curIdx = typeof selectedFile?.index === 'number' ? selectedFile.index : null;
            const only = [
              ...new Set(
                [curIdx, nextFile.index].filter((i): i is number => typeof i === 'number' && i >= 0),
              ),
            ];
            if (only.length > 0) {
              void clientApi.updateOnlyFiles(currentHash, only).catch(() => {
                scheduleUpdateOnlyFilesWithRetry(currentHash, nextFile.index!);
              });
            }
          }
          setIsPlaying(true);
          setPlayStatus('ready');
          return;
        }
      }

      // Clic sur un épisode N>0 : si la source résolue est un pack multi-fichiers,
      // n'ajouter que ce fichier (only_files). « Tout télécharger » reste le chemin full-pack.
      if (clickedEp && clickedEp.episode > 0) {
        try {
          const magnet =
            (expected as { _externalMagnetUri?: string })._externalMagnetUri ??
            ((expected as { _externalLink?: string })._externalLink?.startsWith('magnet:')
              ? (expected as { _externalLink: string })._externalLink
              : null);
          const externalLink =
            (expected as { _externalLink?: string })._externalLink &&
            !(expected as { _externalLink?: string })._externalLink?.startsWith('magnet:')
              ? (expected as { _externalLink: string })._externalLink
              : null;
          const rawHash = String(
            expected.infoHash || (expected as { info_hash?: string }).info_hash || '',
          ).toLowerCase();
          const packInfoHash = /^[a-f0-9]{40}$/i.test(rawHash) ? rawHash : '';
          if (magnet || externalLink || packInfoHash) {
            setPlayStatus('adding');
            setProgressMessage(t('mediaDetail.preparingEpisode'));
            const isRelativeLink =
              externalLink != null &&
              !externalLink.startsWith('http://') &&
              !externalLink.startsWith('https://');
            const idMatch = externalLink != null ? externalLink.match(/[?&]id=(\d+)/) : null;
            const numericTorrentId = (idMatch && idMatch[1]) ?? null;
            const listParams = magnet
              ? { ...(packInfoHash ? { infoHash: packInfoHash } : {}), magnet }
              : {
                  ...(packInfoHash ? { infoHash: packInfoHash } : {}),
                  url: isRelativeLink ? undefined : externalLink || undefined,
                  indexerId: (expected as { indexerId?: string }).indexerId,
                  torrentId:
                    numericTorrentId ??
                    (expected.id?.includes('_') ? expected.id.split('_').pop() : expected.id),
                  guid: (expected as { _guid?: string })._guid,
                  indexerTypeId:
                    (expected as { indexer_type_id?: string }).indexer_type_id ??
                    (() => {
                      const tm = expected.id && expected.id.match(/^external_([^_]+)_/);
                      return (tm && tm[1]) || undefined;
                    })(),
                  ...(isRelativeLink && externalLink ? { relativeUrl: externalLink } : {}),
                };
            const listRes = await serverApi.getTorrentFileList(listParams);
            const files = listRes.success && Array.isArray(listRes.data) ? listRes.data : null;
            if (files && files.length > 1) {
              const fileIndex = findPackFileIndexForEpisode(
                files,
                clickedEp.season,
                clickedEp.episode,
                tmdbSeasonEpisodeCounts,
                selectedSceneEpisode,
              );
              if (fileIndex != null) {
                await handlePlaySingleEpisode(fileIndex);
                return;
              }
              setPlayStatus('idle');
              addNotification('error', t('mediaDetail.episodeNotFoundInPack'));
              return;
            }
          }
        } catch (e) {
          // list-files indisponible → fallback handlePlay (torrent mono-épisode fréquent)
          console.warn('[episode-play] list-files pack failed, fallback handlePlay', e);
        }
      }

      handlePlay();
    })();
  }, [
    episodePlayNonce,
    selectedEpisodeVariantId,
    activeTorrent.id,
    activeTorrent.infoHash,
    resolveVariantForSelectedEpisode,
    handlePlay,
    handlePlaySingleEpisode,
    seriesEpisodes,
    libraryEpisodesPathMap,
    tmdbSeasonEpisodeCounts,
    savedPlaybackPosition,
    addNotification,
    setPlayStatus,
    setProgressMessage,
    t,
    videoFiles,
    selectedFile,
    setSelectedFile,
    setLibraryDownloadPath,
    setIsPlaying,
    addedTorrentInfoHash,
    selectedSceneEpisode,
  ]);

  // Pack complet (Ã©pisode 0) : calculÃ© plus haut (avant useVideoFiles)
  /** Liste des fichiers du pack sans ajouter le torrent (API list-files : magnet ou URL externe) */
  const [packPreviewFiles, setPackPreviewFiles] = useState<TorrentListFileEntry[] | null>(null);
  const [loadingPackPreview, setLoadingPackPreview] = useState(false);
  /** Erreur API list-files / téléchargement .torrent (ex. C411 → HTML au lieu du binaire) */
  const [packPreviewLoadError, setPackPreviewLoadError] = useState<string | null>(null);
  /** Index du fichier (dans packPreviewFiles) sÃ©lectionnÃ© pour "TÃ©lÃ©charger cet Ã©pisode" / "Lire" (preview, torrent pas encore ajoutÃ©) */
  const [selectedPackEpisodePreviewIndex, setSelectedPackEpisodePreviewIndex] = useState<number | null>(null);
  useEffect(() => {
    // Charger la preview (list-files) mÃªme si on a un infoHash :
    // dans beaucoup de cas (indexers) on a un info_hash dÃ¨s la recherche mais le torrent n'est pas encore ajoutÃ© au client,
    // et on veut quand mÃªme dÃ©composer le pack en Ã©pisodes pour l'affichage.
    if (!isPackSelected) {
      setPackPreviewFiles(null);
      setSelectedPackEpisodePreviewIndex(null);
      setAddedTorrentInfoHash(null);
      setPackPreviewLoadError(null);
      return;
    }
    const magnet = (activeTorrent as { _externalMagnetUri?: string })._externalMagnetUri ?? ((activeTorrent as { _externalLink?: string })._externalLink?.startsWith('magnet:') ? (activeTorrent as { _externalLink: string })._externalLink : null);
    const externalLink = (activeTorrent as { _externalLink?: string })._externalLink && !(activeTorrent as { _externalLink?: string })._externalLink?.startsWith('magnet:') ? (activeTorrent as { _externalLink: string })._externalLink : null;
    const rawPackInfoHash = activeTorrent.infoHash?.trim() ?? '';
    const packInfoHash = /^[a-f0-9]{40}$/i.test(rawPackInfoHash) ? rawPackInfoHash.toLowerCase() : '';
    if (!magnet && !externalLink && !packInfoHash) {
      setPackPreviewFiles(null);
      setPackPreviewLoadError(null);
      return;
    }
    const isRelativeLink = externalLink != null && !externalLink.startsWith('http://') && !externalLink.startsWith('https://');
    const idMatch = externalLink != null ? externalLink.match(/[?&]id=(\d+)/) : null;
    const numericTorrentId = (idMatch && idMatch[1]) ?? null;
    let cancelled = false;
    setLoadingPackPreview(true);
    const load = async () => {
      setPackPreviewLoadError(null);
      const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
      const isRecoverablePackError = (err: unknown) => {
        if (!(err instanceof Error)) return false;
        const msg = err.message || '';
        return msg.includes('502') || msg.includes('503') || msg.includes('504') || msg.toLowerCase().includes('gateway');
      };
      try {
        const params = magnet
          ? { ...(packInfoHash ? { infoHash: packInfoHash } : {}), magnet }
          : {
              ...(packInfoHash ? { infoHash: packInfoHash } : {}),
              url: isRelativeLink ? undefined : externalLink!,
              indexerId: (activeTorrent as { indexerId?: string }).indexerId,
              torrentId: numericTorrentId ?? (activeTorrent.id?.includes('_') ? activeTorrent.id.split('_').pop() : activeTorrent.id),
              guid: (activeTorrent as { _guid?: string })._guid,
              indexerTypeId: (activeTorrent as { indexer_type_id?: string }).indexer_type_id ?? (() => {
                const tm = activeTorrent.id && activeTorrent.id.match(/^external_([^_]+)_/);
                return (tm && tm[1]) || undefined;
              })(),
              ...(isRelativeLink && externalLink && { relativeUrl: externalLink }),
            };
        let res: Awaited<ReturnType<typeof serverApi.getTorrentFileList>> | null = null;
        let lastErr: unknown = null;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          try {
            res = await serverApi.getTorrentFileList(params);
            if (res?.success) break;
            lastErr = new Error(res?.message || 'Erreur list-files');
          } catch (e) {
            lastErr = e;
            if (!isRecoverablePackError(e) || attempt === 2) break;
            await sleep(700 * (attempt + 1));
          }
        }
        if (!res && lastErr) throw lastErr;
        if (cancelled) return;
        if (res?.success && Array.isArray(res.data)) {
          setPackPreviewFiles(res.data);
          setPackPreviewLoadError(null);
        } else {
          setPackPreviewFiles(null);
          const msg =
            (res?.success === false && res.message ? res.message : '') ||
            (lastErr instanceof Error ? lastErr.message : '') ||
            t('mediaDetail.packListFilesFailed');
          setPackPreviewLoadError(msg);
          addNotification('error', msg);
        }
      } catch (e) {
        if (!cancelled) {
          setPackPreviewFiles(null);
          const msg = e instanceof Error ? e.message : t('mediaDetail.packListFilesFailed');
          setPackPreviewLoadError(msg);
          addNotification('error', msg);
        }
      } finally {
        if (!cancelled) setLoadingPackPreview(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [
    isPackSelected,
    activeTorrent.id,
    activeTorrent.infoHash,
    (activeTorrent as { _externalLink?: string })._externalLink,
    (activeTorrent as { _externalMagnetUri?: string })._externalMagnetUri,
    t,
    addNotification,
  ]);

  const packEpisodesModel = usePackEpisodes({ packPreviewFiles, videoFiles });
  const [selectedPackSeason, setSelectedPackSeason] = useState<number | null>(null);
  useEffect(() => {
    if (packEpisodesModel?.seasons?.length && selectedPackSeason === null) {
      setSelectedPackSeason(packEpisodesModel.seasons[0] ?? null);
    }
    if (!packEpisodesModel) setSelectedPackSeason(null);
  }, [packEpisodesModel, selectedPackSeason]);

  // Pack preview (avant ajout au client) : par défaut, sélectionner le 1er épisode de la saison affichée.
  // Ça évite le comportement "télécharger tout" et colle au pattern streaming (Netflix/Prime).
  useEffect(() => {
    if (!isPackSelected) return;
    // Uniquement en preview (avant que les fichiers du torrent soient dispo dans `videoFiles`)
    if (videoFiles.length > 1) return;
    if (!packEpisodesModel || selectedPackSeason == null) return;
    const list = packEpisodesModel.episodesBySeason.get(selectedPackSeason);
    if (!list || list.length === 0) return;
    const firstPreviewIndex =
      list.find((x) => x.key.kind === 'preview')?.key.kind === 'preview'
        ? (list.find((x) => x.key.kind === 'preview')!.key as any).index
        : null;
    if (firstPreviewIndex == null) return;

    setSelectedPackEpisodePreviewIndex((prev) => {
      if (prev != null && list.some((x) => x.key.kind === 'preview' && (x.key as any).index === prev)) return prev;
      return firstPreviewIndex;
    });
  }, [isPackSelected, packEpisodesModel, selectedPackSeason, videoFiles.length]);

  const selectedPackEpisodeKey = useMemo(() => {
    if (!isPackSelected) return null;
    if (videoFiles.length > 1 && selectedFile?.path) return { kind: 'file' as const, path: selectedFile.path };
    if (selectedPackEpisodePreviewIndex != null) return { kind: 'preview' as const, index: selectedPackEpisodePreviewIndex };
    return null;
  }, [isPackSelected, selectedFile?.path, selectedPackEpisodePreviewIndex, videoFiles.length]);

  const onSelectPackEpisodeKey = (key: PackEpisodeKey) => {
    if (key.kind === 'file') {
      const f = videoFiles.find((vf) => vf.path === key.path);
      if (f) setSelectedFile(f);
    } else {
      setSelectedPackEpisodePreviewIndex(key.index);
    }
  };
  useEffect(() => {
    if (isPackSelected && hasValidInfoHash && activeTorrent.infoHash) {
      void loadVideoFiles(activeTorrent.infoHash);
    }
  }, [isPackSelected, activeTorrent.infoHash, hasValidInfoHash, torrentStats?.state]);

  // SÃ©rie (un Ã©pisode = une variante) : charger les fichiers du variant actif quand on joue
  useEffect(() => {
    if (
      isPlaying &&
      hasValidInfoHash &&
      activeTorrent.infoHash &&
      seriesEpisodes?.seasons?.length &&
      !isPackSelected
    ) {
      void loadVideoFiles(activeTorrent.infoHash);
    }
  }, [isPlaying, hasValidInfoHash, activeTorrent.infoHash, seriesEpisodes?.seasons?.length, isPackSelected]);

  /** Pendant la transition vers l'Ã©pisode suivant, on garde l'Ã©pisode en cours affichÃ© pour ne pas dÃ©monter le lecteur (Ã©vite que video.play() soit bloquÃ© par l'autoplay). */
  const [isTransitioningToNext, setIsTransitioningToNext] = useState(false);
  const previousActiveTorrentRef = useRef<typeof activeTorrent | null>(null);
  const previousSelectedFileRef = useRef<typeof selectedFile>(null);
  /** Prefetch déjà lancé pour cet épisode suivant (évite doublons). */
  const nextEpisodePrefetchedKeyRef = useRef<string | null>(null);

  const prefetchNextEpisode = useCallback(async () => {
    const next = getNextEpisode(seriesEpisodes ?? undefined, selectedSeasonNum, selectedEpisodeVariantId);
    if (!next) return;
    const prefetchKey = `${next.seasonNum}:${next.episodeVariantId}`;
    if (nextEpisodePrefetchedKeyRef.current === prefetchKey) return;
    nextEpisodePrefetchedKeyRef.current = prefetchKey;

    try {
      const season = seriesEpisodes?.seasons?.find((s) => s.season === next.seasonNum);
      const nextEp = season?.episodes?.find((e) => e.id === next.episodeVariantId);
      if (!nextEp || nextEp.episode <= 0) return;

      // Déjà en bibliothèque locale → rien à prefetch.
      if (
        lookupBySeasonEpisodeKey(
          libraryEpisodesPathMap,
          nextEp.season,
          nextEp.episode,
          tmdbSeasonEpisodeCounts,
        )
      ) {
        return;
      }

      const expected = resolveVariantForSelectedEpisode(next.episodeVariantId);
      if (!expected) return;

      const magnet =
        (expected as { _externalMagnetUri?: string })._externalMagnetUri ??
        ((expected as { _externalLink?: string })._externalLink?.startsWith('magnet:')
          ? (expected as { _externalLink: string })._externalLink
          : null);
      const externalLink =
        (expected as { _externalLink?: string })._externalLink &&
        !(expected as { _externalLink?: string })._externalLink?.startsWith('magnet:')
          ? (expected as { _externalLink: string })._externalLink
          : null;
      const rawHash = String(
        expected.infoHash || (expected as { info_hash?: string }).info_hash || '',
      ).toLowerCase();
      const packInfoHash = /^[a-f0-9]{40}$/i.test(rawHash) ? rawHash : '';
      if (!magnet && !externalLink && !packInfoHash) return;

      const isRelativeLink =
        externalLink != null &&
        !externalLink.startsWith('http://') &&
        !externalLink.startsWith('https://');
      const idMatch = externalLink != null ? externalLink.match(/[?&]id=(\d+)/) : null;
      const numericTorrentId = (idMatch && idMatch[1]) ?? null;
      const listParams = magnet
        ? { ...(packInfoHash ? { infoHash: packInfoHash } : {}), magnet }
        : {
            ...(packInfoHash ? { infoHash: packInfoHash } : {}),
            url: isRelativeLink ? undefined : externalLink || undefined,
            indexerId: (expected as { indexerId?: string }).indexerId,
            torrentId:
              numericTorrentId ??
              (expected.id?.includes('_') ? expected.id.split('_').pop() : expected.id),
            guid: (expected as { _guid?: string })._guid,
            indexerTypeId:
              (expected as { indexer_type_id?: string }).indexer_type_id ??
              (() => {
                const tm = expected.id && expected.id.match(/^external_([^_]+)_/);
                return (tm && tm[1]) || undefined;
              })(),
            ...(isRelativeLink && externalLink ? { relativeUrl: externalLink } : {}),
          };
      const listRes = await serverApi.getTorrentFileList(listParams);
      const files = listRes.success && Array.isArray(listRes.data) ? listRes.data : null;

      if (files && files.length > 1) {
        const nextFileIndex = findPackFileIndexForEpisode(
          files,
          nextEp.season,
          nextEp.episode,
          tmdbSeasonEpisodeCounts,
          selectedSceneEpisode,
        );
        if (nextFileIndex == null) return;

        const currentHash = String(
          addedTorrentInfoHash ||
            activeTorrent.infoHash ||
            (activeTorrent as { info_hash?: string }).info_hash ||
            '',
        ).toLowerCase();
        const samePackAlreadyActive =
          packInfoHash && currentHash && packInfoHash === currentHash;

        if (samePackAlreadyActive) {
          // Même pack en lecture : élargir only_files (épisode courant + suivant), ne pas remplacer.
          const currentIdx =
            typeof selectedFile?.index === 'number'
              ? selectedFile.index
              : findPackFileIndexForEpisode(
                  files,
                  selectedEpisodeMeta?.season ?? nextEp.season,
                  selectedEpisodeMeta?.episode ?? -1,
                  tmdbSeasonEpisodeCounts,
                  selectedSceneEpisode,
                );
          const only = [
            ...new Set(
              [currentIdx, nextFileIndex].filter((i): i is number => typeof i === 'number' && i >= 0),
            ),
          ];
          if (only.length > 0) {
            await clientApi.updateOnlyFiles(currentHash, only).catch(() => {
              scheduleUpdateOnlyFilesWithRetry(currentHash, nextFileIndex);
            });
          }
          return;
        }

        // Autre pack : ajouter avec only_files = épisode suivant uniquement.
        const downloadType = resolveDownloadTypeHeader(expected);
        if (magnet) {
          const result = await clientApi.addMagnetLink(
            magnet,
            expected.name,
            false,
            downloadType,
            undefined,
            [nextFileIndex],
            buildIndexerOrigin(expected),
          );
          const ih = result?.info_hash ?? '';
          if (ih) {
            saveDownloadMeta(ih, {
              posterUrl: expected.imageUrl ?? null,
              backdropUrl: expected.heroImageUrl ?? null,
              cleanTitle: expected.cleanTitle ?? expected.name ?? null,
            });
            if (typeof expected.tmdbId === 'number' && (expected.tmdbType === 'movie' || expected.tmdbType === 'tv')) {
              clientApi.bindDownloadToMedia(ih, expected.tmdbId, expected.tmdbType).catch(() => {});
            }
            scheduleUpdateOnlyFilesWithRetry(ih, nextFileIndex);
          }
          return;
        }

        if (externalLink) {
          const baseUrl = serverApi.getServerUrl();
          const token = serverApi.getAccessToken();
          const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
          const ext = buildExternalDownloadParams(expected as any);
          const q = new URLSearchParams();
          if (isRelativeLink) {
            if (ext.indexerId) q.set('indexerId', ext.indexerId);
            const idFromLink = externalLink.match(/[?&]id=(\d+)/)?.[1];
            q.set('torrentId', idFromLink || ext.torrentId || '');
            if (ext.guid) q.set('guid', ext.guid);
            if (ext.indexerTypeId) q.set('indexerTypeId', ext.indexerTypeId);
            q.set('relativeUrl', externalLink);
          } else {
            q.set('url', externalLink);
            if (ext.indexerId) q.set('indexerId', ext.indexerId);
            if (ext.guid) q.set('guid', ext.guid);
            if (ext.torrentId) q.set('torrentId', ext.torrentId);
            if (ext.indexerTypeId) q.set('indexerTypeId', ext.indexerTypeId);
            if (ext.infoHash) q.set('infoHash', ext.infoHash);
          }
          const res = await fetch(`${baseUrl}/api/torrents/external/download?${q.toString()}`, { headers });
          if (!res.ok) return;
          const buf = new Uint8Array(await res.arrayBuffer());
          if (!looksLikeBencodedTorrent(buf)) return;
          const file = new File([buf], `${expected.name}.torrent`, { type: 'application/x-bittorrent' });
          const result = await clientApi.addTorrentFile(file, false, downloadType, undefined, [nextFileIndex], buildIndexerOrigin(expected));
          const ih = result?.info_hash ?? '';
          if (ih) {
            saveDownloadMeta(ih, {
              posterUrl: expected.imageUrl ?? null,
              backdropUrl: expected.heroImageUrl ?? null,
              cleanTitle: expected.cleanTitle ?? expected.name ?? null,
            });
            if (typeof expected.tmdbId === 'number' && (expected.tmdbType === 'movie' || expected.tmdbType === 'tv')) {
              clientApi.bindDownloadToMedia(ih, expected.tmdbId, expected.tmdbType).catch(() => {});
            }
            scheduleUpdateOnlyFilesWithRetry(ih, nextFileIndex);
          }
          return;
        }
        return;
      }

      // Mono-fichier / épisode dédié : ajout silencieux en arrière-plan.
      const downloadType = resolveDownloadTypeHeader(expected);
      if (magnet) {
        const result = await clientApi.addMagnetLink(magnet, expected.name, false, downloadType, undefined, undefined, buildIndexerOrigin(expected));
        const ih = result?.info_hash ?? '';
        if (ih) {
          saveDownloadMeta(ih, {
            posterUrl: expected.imageUrl ?? null,
            backdropUrl: expected.heroImageUrl ?? null,
            cleanTitle: expected.cleanTitle ?? expected.name ?? null,
          });
          if (typeof expected.tmdbId === 'number' && (expected.tmdbType === 'movie' || expected.tmdbType === 'tv')) {
            clientApi.bindDownloadToMedia(ih, expected.tmdbId, expected.tmdbType).catch(() => {});
          }
        }
        return;
      }
      if (externalLink) {
        const baseUrl = serverApi.getServerUrl();
        const token = serverApi.getAccessToken();
        const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
        const ext = buildExternalDownloadParams(expected as any);
        const q = new URLSearchParams();
        if (isRelativeLink) {
          if (ext.indexerId) q.set('indexerId', ext.indexerId);
          const idFromLink = externalLink.match(/[?&]id=(\d+)/)?.[1];
          q.set('torrentId', idFromLink || ext.torrentId || '');
          if (ext.guid) q.set('guid', ext.guid);
          if (ext.indexerTypeId) q.set('indexerTypeId', ext.indexerTypeId);
          q.set('relativeUrl', externalLink);
        } else {
          q.set('url', externalLink);
          if (ext.indexerId) q.set('indexerId', ext.indexerId);
          if (ext.guid) q.set('guid', ext.guid);
          if (ext.torrentId) q.set('torrentId', ext.torrentId);
          if (ext.indexerTypeId) q.set('indexerTypeId', ext.indexerTypeId);
          if (ext.infoHash) q.set('infoHash', ext.infoHash);
        }
        const res = await fetch(`${baseUrl}/api/torrents/external/download?${q.toString()}`, { headers });
        if (!res.ok) return;
        const buf = new Uint8Array(await res.arrayBuffer());
        if (!looksLikeBencodedTorrent(buf)) return;
        const file = new File([buf], `${expected.name}.torrent`, { type: 'application/x-bittorrent' });
        const result = await clientApi.addTorrentFile(file, false, downloadType, undefined, undefined, buildIndexerOrigin(expected));
        const ih = result?.info_hash ?? '';
        if (ih) {
          saveDownloadMeta(ih, {
            posterUrl: expected.imageUrl ?? null,
            backdropUrl: expected.heroImageUrl ?? null,
            cleanTitle: expected.cleanTitle ?? expected.name ?? null,
          });
          if (typeof expected.tmdbId === 'number' && (expected.tmdbType === 'movie' || expected.tmdbType === 'tv')) {
            clientApi.bindDownloadToMedia(ih, expected.tmdbId, expected.tmdbType).catch(() => {});
          }
        }
      }
    } catch (e) {
      console.warn('[prefetch-next] failed', e);
      if (nextEpisodePrefetchedKeyRef.current === prefetchKey) {
        nextEpisodePrefetchedKeyRef.current = null;
      }
    }
  }, [
    seriesEpisodes,
    selectedSeasonNum,
    selectedEpisodeVariantId,
    libraryEpisodesPathMap,
    tmdbSeasonEpisodeCounts,
    resolveVariantForSelectedEpisode,
    activeTorrent,
    selectedFile,
    selectedEpisodeMeta,
    addedTorrentInfoHash,
  ]);

  const onPlayNextEpisode = () => {
    playAdjacentEpisode(getNextEpisode(seriesEpisodes ?? undefined, selectedSeasonNum, selectedEpisodeVariantId));
  };
  const onPlayPreviousEpisode = () => {
    playAdjacentEpisode(getPreviousEpisode(seriesEpisodes ?? undefined, selectedSeasonNum, selectedEpisodeVariantId));
  };
  /** Lance l'épisode cible (suivant / précédent) en gardant le lecteur monté. */
  const playAdjacentEpisode = (next: { seasonNum: number; episodeVariantId: string } | null) => {
    if (!next) return;
    previousActiveTorrentRef.current = activeTorrent;
    previousSelectedFileRef.current = selectedFile;
    pendingNextEpisodeRef.current = true;
    setIsTransitioningToNext(true);
    // Épisode suivant = départ à 0 + auto-skip générique (si activé), pas reprise de l’épisode courant.
    forceStartFromBeginningRef.current = true;
    setPlaybackStartMode(true);
    setSavedPlaybackPosition(null);
    // Appliquer tout de suite le torrent résolu (comme un clic carte) pour éviter le blocage sameHash.
    const resolved = resolveVariantForSelectedEpisode(next.episodeVariantId);
    if (resolved) {
      setSelectedTorrent(resolved);
      setCurrentSeedCount(resolved.seedCount ?? 0);
      setCurrentLeechCount(resolved.leechCount ?? 0);
      setCurrentFileSize(resolved.fileSize ?? 0);
      if (resolved.downloadPath) setLibraryDownloadPath(resolved.downloadPath);
    }
    // Déclencher le même chemin que le clic carte (only_files si pack).
    episodePlayIntentRef.current = next.episodeVariantId;
    setSelectedSeasonNum(next.seasonNum);
    setSelectedEpisodeVariantId(next.episodeVariantId);
    setEpisodePlayNonce((n) => n + 1);
  };
  // Fin de transition dès que le fichier lu n’est plus celui de l’épisode précédent.
  useEffect(() => {
    if (!pendingNextEpisodeRef.current || !isTransitioningToNext) return;
    const prevPath = previousSelectedFileRef.current?.path ?? previousSelectedFileRef.current?.name ?? '';
    const curPath = selectedFile?.path ?? selectedFile?.name ?? '';
    if (!curPath || curPath === prevPath) return;
    pendingNextEpisodeRef.current = false;
    setIsTransitioningToNext(false);
  }, [selectedFile?.path, selectedFile?.name, isTransitioningToNext]);

  // Filet de sécurité : ne lever la transition QUE si le fichier a vraiment changé
  // (sinon UI « épisode suivant » + vidéo de l’épisode précédent).
  useEffect(() => {
    if (!isTransitioningToNext) return;
    const tId = window.setTimeout(() => {
      const prevPath =
        previousSelectedFileRef.current?.path ?? previousSelectedFileRef.current?.name ?? '';
      const curPath = selectedFile?.path ?? selectedFile?.name ?? '';
      if (curPath && curPath !== prevPath) {
        pendingNextEpisodeRef.current = false;
        setIsTransitioningToNext(false);
      }
    }, 12000);
    return () => clearTimeout(tId);
  }, [isTransitioningToNext, selectedFile?.path, selectedFile?.name]);

  const nextEpisodeInfo = useMemo(
    () => getNextEpisode(seriesEpisodes ?? undefined, selectedSeasonNum, selectedEpisodeVariantId),
    [seriesEpisodes, selectedSeasonNum, selectedEpisodeVariantId]
  );
  const previousEpisodeInfo = useMemo(
    () => getPreviousEpisode(seriesEpisodes ?? undefined, selectedSeasonNum, selectedEpisodeVariantId),
    [seriesEpisodes, selectedSeasonNum, selectedEpisodeVariantId]
  );

  /** Saison / numéro d'épisode / id variante pour le lecteur (reprise TMDB + « vu »). */
  // Déjà défini plus haut pour useVideoFiles

  /** Pendant la transition, on affiche encore l'Ã©pisode prÃ©cÃ©dent pour garder le lecteur montÃ© (mÃªme Ã©lÃ©ment vidÃ©o) et permettre play() aprÃ¨s changement de source. */
  const displayTorrent = isTransitioningToNext && previousActiveTorrentRef.current ? previousActiveTorrentRef.current : activeTorrent;
  const displayFile = isTransitioningToNext && previousSelectedFileRef.current ? previousSelectedFileRef.current : selectedFile;
  const displayInfoHash = displayTorrent?.infoHash;
  /** Libellé S/E aligné sur le fichier réellement lu (évite « E3 » affiché pendant que E2 joue). */
  const displayEpisodeFromFile = useMemo(() => {
    const label = displayFile?.path || displayFile?.name || '';
    return label ? parseSeasonEpisodeFromName(label) : null;
  }, [displayFile?.path, displayFile?.name]);

  /**
   * Position explicite ?t= (carte « Continuer ») : transmise au lecteur seulement si elle vise
   * l'épisode réellement lu (sinon le lecteur résout lui-même la reprise de CET épisode).
   */
  const explicitResumeSeconds = (() => {
    if (typeof window === 'undefined') return null;
    const qp = new URLSearchParams(window.location.search);
    const tq = Number(qp.get('t'));
    if (!Number.isFinite(tq) || tq <= 0) return null;
    if (displayTorrent?.tmdbType !== 'tv') return tq;
    const playSeason = displayEpisodeFromFile?.season ?? selectedEpisodeMeta?.season ?? null;
    const playEpisode = displayEpisodeFromFile?.episode ?? selectedEpisodeMeta?.episode ?? null;
    return Number(qp.get('season')) === playSeason && Number(qp.get('episode')) === playEpisode ? tq : null;
  })();

  const tmdbApiTitleActive = useTmdbApiTitle(activeTorrent?.tmdbId, activeTorrent?.tmdbType, language);
  const tmdbApiTitleDisplay = useTmdbApiTitle(displayTorrent?.tmdbId, displayTorrent?.tmdbType, language);
  const mediaTitleForHero = getMediaDisplayTitle(activeTorrent, tmdbApiTitleActive);
  const mediaTitleForPlayer = getMediaDisplayTitle(displayTorrent, tmdbApiTitleDisplay);
  /** Variantes déjà téléchargées / présentes sur disque (pas les releases indexeurs). */
  const onDiskVariants = useMemo(() => {
    return (allVariants.length > 0 ? allVariants : [activeTorrent]).filter((v: any) => {
      const path = (v.downloadPath || v.download_path || '').toString().trim();
      if (path) return true;
      const ih = (v.infoHash || v.info_hash || v.id || '').toString();
      return ih.startsWith('local_');
    });
  }, [allVariants, activeTorrent]);
  const availableMediaLanguages = useMemo(() => {
    const fromLocalApi = localOnDiskMedias.map((m) => ({
      language: m.language,
      name: m.file_name || m.name || m.file_path,
    }));
    // Fallback : fichier courant si déjà local mais pas encore listé par l’API.
    const fallback =
      fromLocalApi.length === 0 && onDiskVariants.length === 0 && (libraryDownloadPath || activeTorrent.downloadPath)
        ? [{ language: activeTorrent.language, name: activeTorrent.name || libraryDownloadPath || activeTorrent.downloadPath }]
        : [];
    return collectAvailableMediaLanguages([...fromLocalApi, ...onDiskVariants, ...fallback]);
  }, [localOnDiskMedias, onDiskVariants, libraryDownloadPath, activeTorrent]);

  /** Toujours proposer si on a un TMDB série : le POST interroge les indexeurs activés sur le serveur. */
  const showSeriesIndexerRefresh =
    typeof seriesIndexerRefreshTmdbId === 'number' &&
    (torrent.tmdbType === 'tv' ||
      torrent.category === 'series' ||
      (seriesEpisodes?.seasons?.length ?? 0) > 0);

  const isTvSeriesDetail =
    torrent.tmdbType === 'tv' ||
    torrent.category === 'series' ||
    (seriesEpisodes?.seasons?.length ?? 0) > 0;

  /** Dossier série (pas le .mkv d’un épisode) pour le bouton Info. */
  const seriesLibraryPath = useMemo(() => {
    if (!isTvSeriesDetail) return null;
    let streamPath: string | null = null;
    if (typeof window !== 'undefined') {
      try {
        const v = new URLSearchParams(window.location.search).get('streamPath');
        streamPath = v ? decodeURIComponent(v) : null;
      } catch {
        streamPath = null;
      }
    }
    const episodePaths = Object.values(libraryEpisodesPathMap).filter(Boolean);
    const candidates = [
      streamPath,
      ...episodePaths,
      libraryDownloadPath,
      (activeTorrent as { downloadPath?: string | null }).downloadPath,
      torrent.downloadPath,
    ];
    for (const c of candidates) {
      const resolved = resolveSeriesFolderPath(c);
      if (resolved) return resolved;
    }
    return null;
  }, [
    isTvSeriesDetail,
    libraryEpisodesPathMap,
    libraryDownloadPath,
    activeTorrent,
    torrent.downloadPath,
  ]);

  // VÃ©rifier si on peut afficher le lecteur vidÃ©o (ou pendant la transition pour ne pas dÃ©monter)
  const canShowVideoPlayer = isPlaying && hasValidInfoHash;
  
  // Ref pour le wrapper vidéo
  const videoWrapperRef = useRef<HTMLDivElement | null>(null);
  
  // Ne plus afficher l'overlay fullscreen - le loading se fait maintenant in-player via PlayerLoadingOverlay
  // Le VideoPlayerWrapper gère l'affichage du loading overlay intégré

  if (canShowVideoPlayer && displayInfoHash) {
    return (
      <VideoPlayerWrapper
        key={`player-${displayInfoHash}-${displayFile?.path ?? displayFile?.name ?? ''}`}
        infoHash={displayInfoHash}
        selectedFile={displayFile!}
        torrentName={mediaTitleForPlayer}
        torrentId={displayTorrent.id}
        tmdbId={displayTorrent.tmdbId}
        tmdbType={displayTorrent.tmdbType}
        seriesSeasonNum={displayEpisodeFromFile?.season ?? selectedEpisodeMeta?.season ?? null}
        seriesEpisodeNum={displayEpisodeFromFile?.episode ?? selectedEpisodeMeta?.episode ?? null}
        startFromBeginning={isTransitioningToNext ? false : startFromBeginningRef.current}
        initialSeekSeconds={
          isTransitioningToNext || startFromBeginningRef.current
            ? null
            : explicitResumeSeconds
        }
        isSeries={!!(seriesEpisodes?.seasons?.length)}
        nextEpisodeInfo={nextEpisodeInfo}
        onPlayNextEpisode={onPlayNextEpisode}
        previousEpisodeInfo={previousEpisodeInfo}
        onPlayPreviousEpisode={onPlayPreviousEpisode}
        onPrefetchNextEpisode={prefetchNextEpisode}
        onClose={handleClosePlayerAndRefresh}
        onAbortDownload={() => void handleAbortDownload()}
        visible={true}
        wrapperRef={(el) => { videoWrapperRef.current = el; }}
        quality={displayTorrent.quality}
        tmdbMatchSource={displayTorrent.tmdbMatchSource ?? null}
        tmdbMatchConfidence={displayTorrent.tmdbMatchConfidence ?? null}
        directStreamUrl={(displayTorrent as any)._demoStreamUrl ?? undefined}
        streamBackendUrl={streamBackendUrl ?? undefined}
        posterUrl={displayTorrent.imageUrl ?? null}
        logoUrl={displayTorrent.logoUrl ?? null}
        synopsis={displayTorrent.synopsis ?? displayTorrent.description ?? null}
        releaseDate={displayTorrent.releaseDate ?? null}
        useStreamTorrentMode={useStreamTorrentMode}
        streamingTorrentToken={TokenManager.getCloudAccessToken()}
        playStatus={playStatus}
        progressMessage={progressMessage}
        torrentStats={torrentStats}
        errorMessage={errorMessage}
        onPlaybackError={(msg) => {
          const sparse = isSparseOrEmptyMessage(msg);
          const streamAuth = isStreamTorrentAuthMessage(msg);
          if (!sparse && !streamAuth) return;

          setIsAvailableLocally(false);
          setEmptyOrSparse(true);
          setLibraryDownloadPath(null);
          setVideoFiles([]);
          setSelectedFile(null);
          setIsPlaying(false);
          setPlayStatus('idle');
          setErrorMessage(null);

          if (streamAuth) {
            // Auth stream échouée : une 2e passe en download même si recovery sparse déjà faite
            if (forceDownloadFallback) {
              setErrorMessage(msg);
              setPlayStatus('error');
              return;
            }
            setForceDownloadFallback(true);
            addDebugLog('warning', 'Stream-torrent refusé — bascule téléchargement classique', { msg });
            playbackRecoveryRef.current = true;
            window.setTimeout(() => {
              void handlePlay();
            }, 150);
            return;
          }

          addDebugLog('warning', 'Fichier local sparse/vide — relance lecture (stream ou retéléchargement)', {
            msg,
            streaming: effectiveStreamingActive,
          });
          if (playbackRecoveryRef.current) {
            setErrorMessage(msg);
            setPlayStatus('error');
            return;
          }
          playbackRecoveryRef.current = true;
          window.setTimeout(() => {
            void handlePlay();
          }, 150);
        }}
        onDeleteEmptyFiles={handleDeleteEmptyFiles}
      />
    );
  }

  // Page principale
  return (
    <>
      {/* Afficher VideoPlayerWrapper dès isPlaying pour avoir le loading in-player */}
      {displayInfoHash && isPlaying && canShowVideoPlayer && (
        <VideoPlayerWrapper
          key={`player-${displayInfoHash}-${displayFile?.path ?? displayFile?.name ?? ''}`}
          infoHash={displayInfoHash}
          selectedFile={displayFile!}
        torrentName={mediaTitleForPlayer}
        torrentId={displayTorrent.id}
        tmdbId={displayTorrent.tmdbId}
        tmdbType={displayTorrent.tmdbType}
        seriesSeasonNum={displayEpisodeFromFile?.season ?? selectedEpisodeMeta?.season ?? null}
        seriesEpisodeNum={displayEpisodeFromFile?.episode ?? selectedEpisodeMeta?.episode ?? null}
        startFromBeginning={isTransitioningToNext ? false : startFromBeginningRef.current}
        initialSeekSeconds={
          isTransitioningToNext || startFromBeginningRef.current
            ? null
            : explicitResumeSeconds
        }
        isSeries={!!(seriesEpisodes?.seasons?.length)}
        nextEpisodeInfo={nextEpisodeInfo}
        onPlayNextEpisode={onPlayNextEpisode}
        previousEpisodeInfo={previousEpisodeInfo}
        onPlayPreviousEpisode={onPlayPreviousEpisode}
        onPrefetchNextEpisode={prefetchNextEpisode}
        onClose={handleClosePlayerAndRefresh}
        onAbortDownload={() => void handleAbortDownload()}
        visible={true}
        wrapperRef={(el) => { videoWrapperRef.current = el; }}
        quality={displayTorrent.quality}
        tmdbMatchSource={displayTorrent.tmdbMatchSource ?? null}
        tmdbMatchConfidence={displayTorrent.tmdbMatchConfidence ?? null}
        directStreamUrl={(displayTorrent as any)._demoStreamUrl ?? undefined}
        streamBackendUrl={streamBackendUrl ?? undefined}
        playStatus={playStatus}
        progressMessage={progressMessage}
        torrentStats={torrentStats}
        posterUrl={displayTorrent.imageUrl ?? null}
        logoUrl={displayTorrent.logoUrl ?? null}
        synopsis={displayTorrent.synopsis ?? displayTorrent.description ?? null}
        releaseDate={displayTorrent.releaseDate ?? null}
        useStreamTorrentMode={useStreamTorrentMode}
        streamingTorrentToken={TokenManager.getCloudAccessToken()}
        errorMessage={errorMessage}
        />
      )}
    <div className="relative bg-page text-white animate-fade-in-up min-h-[100dvh]" data-dark-context data-tv-media-detail>
      {/* Hero section : fond = bande-annonce (vidÃ©o) ou image selon Ã©tat */}
      <div className="fixed top-0 left-0 right-0 bottom-0 z-0 overflow-hidden">
        {isPlayingTrailer && trailerKey ? (
          <>
            <div className="absolute inset-0 w-full h-full [&_iframe]:absolute [&_iframe]:inset-0 [&_iframe]:w-full [&_iframe]:h-full">
              <VideoPlayer
                youtubeKey={trailerKey}
                autoplay={true}
                muted={false}
                loop={false}
                controls={true}
                cover={true}
                className="absolute inset-0 w-full h-full object-cover"
                onEnded={() => setIsPlayingTrailer(false)}
              />
            </div>
            {trailerUiVisible && (
              <>
                <div className="absolute inset-0 pointer-events-none bg-gradient-to-r from-black/70 via-black/50 to-transparent" />
                <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-transparent via-black/30 to-black" />
              </>
            )}
            {!trailerUiVisible && (
              <div
                ref={trailerImmersiveLayerRef}
                className="absolute inset-0 z-[5] cursor-pointer outline-none focus:ring-2 focus:ring-white/40 focus:ring-inset"
                onClick={() => setTrailerUiVisible(true)}
                onKeyDown={(e) => { e.key === 'Enter' && setTrailerUiVisible(true); }}
                role="button"
                tabIndex={0}
                aria-label="Afficher les informations"
              />
            )}
          </>
        ) : (heroImageUrl || imageUrl || trailerKey) ? (
          <>
            <div
              className="absolute inset-0 bg-cover bg-center bg-no-repeat pointer-events-none"
              style={{
                backgroundImage: `url(${
                  getHighQualityTmdbImageUrl(heroImageUrl || imageUrl) ||
                  heroImageUrl ||
                  imageUrl ||
                  (trailerKey ? `https://img.youtube.com/vi/${trailerKey}/hqdefault.jpg` : '')
                })`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black via-black/80 to-transparent pointer-events-none" />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent pointer-events-none" />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/40 to-black pointer-events-none" />
          </>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-b from-gray-900 to-black pointer-events-none" />
        )}
      </div>

      {/* Contenu principal : en BA immersive, seul le héros est masqué — le carrousel épisodes reste utilisable (souris / TV). */}
      <div className="relative z-10 transition-opacity duration-300 pb-16 sm:pb-24" ref={tvBackHandlerRef} data-tv-back-handler>
        <div
          ref={trailerImmersiveHiddenChromeRef}
          className={`${isPlayingTrailer && !trailerUiVisible ? 'opacity-0 pointer-events-none' : ''}`}
          aria-hidden={isPlayingTrailer && !trailerUiVisible}
        >
        <div className="relative w-full min-h-[56vh] sm:min-h-[66vh] flex flex-col justify-end px-3 sm:px-4 md:px-6 lg:px-16 pb-8 sm:pb-12 md:pb-16 pt-16 sm:pt-20 md:pt-28">
          {/* Bouton Bande-annonce (haut droite) — visible uniquement quand la bande-annonce ne joue pas */}
          {trailerKey && !isPlayingTrailer && (
            <button
              type="button"
              onClick={() => setIsPlayingTrailer(true)}
              disabled={isLoadingTrailer}
              title={t('ads.trailerPlay')}
              aria-label={t('ads.trailerPlay')}
              data-focusable={isTV ? undefined : true}
              data-tv-nav-skip={isTV ? true : undefined}
              tabIndex={isTV ? -1 : 0}
              className="absolute top-4 right-3 sm:top-6 sm:right-4 md:right-6 lg:right-16 gtv-pill-btn ds-focus-glow ds-active-glow gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoadingTrailer ? (
                <span className="loading loading-spinner loading-sm" />
              ) : (
                <>
                  <Film className="h-5 w-5 shrink-0" size={20} />
                  <span className="hidden sm:inline">{t('ads.trailerPlay')}</span>
                </>
              )}
            </button>
          )}

          <div className="max-w-6xl w-full mb-6 sm:mb-8 md:mb-10 ds-stream-cascade">
            <div data-stream-item>
            <HeroHeader
              torrent={activeTorrent}
              displayTitle={mediaTitleForHero}
            />
            </div>

            <div data-stream-item>
            <ActionsRow>
              <MediaDetailActionButtons
              backHref={backHref ?? '/dashboard'}
              backLinkRef={backLinkRef}
              torrent={selectedTorrent || torrent}
              activeTorrent={activeTorrent}
              allVariants={allVariants}
              isPlaying={isPlaying}
              isAvailableLocally={Boolean(isAvailableLocally)}
              canStream={Boolean(canStream)}
              isExternal={isExternal}
              hasInfoHash={hasInfoHash}
              magnetCopied={magnetCopied}
              downloadingToClient={downloadingToClient}
              savedPlaybackPosition={savedPlaybackPosition}
              torrentStats={torrentStats}
              countdownRemaining={countdownRemaining}
              isPackWithMultipleFiles={Boolean(isPackSelected && (videoFiles.length > 1 || (packPreviewFiles && packPreviewFiles.length > 1)))}
              selectedPackEpisodePreviewIndex={selectedPackEpisodePreviewIndex}
              onDownloadSingleEpisode={handleDownloadSingleEpisode}
              onPlaySingleEpisode={handlePlaySingleEpisode}
              setTorrentStats={setTorrentStats}
              setPlayStatus={setPlayStatus}
              setDownloadingToClient={setDownloadingToClient}
              setMagnetCopied={setMagnetCopied}
              addNotification={addNotification}
              addDebugLog={addDebugLog}
              setIsAvailableLocally={setIsAvailableLocally}
              progressPollIntervalRef={progressPollIntervalRef}
              pollTorrentProgress={pollTorrentProgress}
              handlePlay={handlePlay}
              stopProgressPolling={stopProgressPolling}
              setProgressMessage={setProgressMessage}
              setErrorMessage={setErrorMessage}
              onOpenSourceModal={allVariants.length > 1 ? () => setShowSourceModal(true) : undefined}
              onActionsReady={(actions) => {
                mediaDetailActionsRef.current = actions;
              }}
              onPlay={async () => {
                // Lecture = reprise automatique (le lecteur repart du début si rien / ≥ 95 %).
                setPlaybackStartMode(false);
                const el = videoWrapperRef.current || (document.getElementById('video-player-wrapper') as HTMLDivElement);
                if (el && !document.fullscreenElement) {
                  try { await el.requestFullscreen(); } catch (_) {}
                }
                continueInBackgroundRef.current = false;
                handlePlay();
              }}
              onPlayFromBeginning={async () => {
                setPlaybackStartMode(true);
                const el = videoWrapperRef.current || (document.getElementById('video-player-wrapper') as HTMLDivElement);
                if (el && !document.fullscreenElement) {
                  try { await el.requestFullscreen(); } catch (_) {}
                }
                continueInBackgroundRef.current = false;
                handlePlay();
              }}
              onPlayAuto={async (bestTorrent) => {
                setSelectedTorrent(bestTorrent);
                // Ne pas forcer le début : reprendre à la position sauvegardée s'il y en a une.
                setPlaybackStartMode(false);
                continueInBackgroundRef.current = false;
                const el = videoWrapperRef.current || (document.getElementById('video-player-wrapper') as HTMLDivElement);
                if (el && !document.fullscreenElement) {
                  try { await el.requestFullscreen(); } catch (_) {}
                }
                setTimeout(() => handlePlay(), 150);
              }}
              seriesIndexerRefresh={
                showSeriesIndexerRefresh
                  ? {
                      busy: seriesIndexerRefreshBusy,
                      onRefresh: handleRefreshSeriesFromIndexers,
                    }
                  : undefined
              }
              seriesLibraryPath={seriesLibraryPath}
              onPlayTrailer={
                trailerKey && !isPlayingTrailer ? () => setIsPlayingTrailer(true) : undefined
              }
              onOpenMovieTechInfo={
                (() => {
                  const t = selectedTorrent || torrent;
                  const anyT = t as {
                    downloadPath?: string | null;
                    indexerName?: string;
                    indexer_name?: string;
                  };
                  const hasTech =
                    !!anyT.downloadPath ||
                    !!anyT.indexerName ||
                    !!anyT.indexer_name ||
                    hasInfoHash ||
                    allVariants.length > 0;
                  return hasTech ? () => setMovieTechInfoOpen(true) : undefined;
                })()
              }
            />
            </ActionsRow>
            </div>

            {/* Informations détaillées */}
            {showInfo && (
              <TorrentInfo
                torrent={selectedTorrent || torrent}
                seedCount={currentSeedCount}
                leechCount={currentLeechCount}
                fileSize={currentFileSize}
                showSeederWarning={!shouldShowPlayButton}
                isSeries={isTvSeriesDetail}
                sources={allVariants && allVariants.length > 1 ? allVariants.map((variant) => ({
                  tracker: variant.indexerName || variant.uploader || 'Tracker',
                  seeds: variant.seedCount || 0,
                  peers: variant.leechCount || 0,
                  quality: variant.quality?.resolution as 'Remux' | '4K' | '1080p' | '720p' | '480p' | undefined,
                  codec: variant.codec as 'x264' | 'x265' | 'AV1' | undefined,
                  fileSize: variant.fileSize,
                })) : undefined}
                allVariants={allVariants}
                availableLanguages={availableMediaLanguages}
                onDiskVariants={onDiskVariants}
                selectedVariantId={(selectedTorrent || torrent).id}
                onSelectVariant={(variant) => {
                  setSelectedTorrent(variant);
                }}
                canDelete={
                  Boolean(hasInfoHash) &&
                  Boolean(isAvailableLocally || isDownloadComplete || !!(selectedTorrent || torrent).downloadPath)
                }
                isAvailableLocally={Boolean(isAvailableLocally)}
                torrentStats={torrentStats}
                setIsAvailableLocally={setIsAvailableLocally}
                addNotification={addNotification}
                techInfoModalOpen={movieTechInfoOpen}
                onTechInfoModalOpenChange={setMovieTechInfoOpen}
              />
            )}
          </div>
        </div>
        </div>

          {/* Carousel épisodes : hors du bloc immersif BA (visible, pointer-events OK, pas aria-hidden). */}
          {seriesEpisodes?.seasons?.length ? (
            <div className="px-3 sm:px-4 md:px-6 lg:px-16 relative z-20 mt-10 pb-[max(7rem,calc(2rem+env(safe-area-inset-bottom,0px)))] sm:pb-[max(9rem,calc(2.5rem+env(safe-area-inset-bottom,0px)))] md:pb-[max(10rem,calc(3rem+env(safe-area-inset-bottom,0px)))]">
              <div className="ed-episodes-panel overflow-hidden border border-white/10">
                <EpisodesArea
                  seriesEpisodes={seriesEpisodes}
                  tmdbId={episodeCarouselTmdbId}
                  watchedEpisodesRefresh={watchedEpisodesRefresh}
                  selectedEpisodeVariantId={selectedEpisodeVariantId}
                  onSelectEpisode={handleSeriesEpisodeSelect}
                  savedPlaybackPosition={savedPlaybackPosition}
                  downloadedEpisodesSet={downloadedEpisodesSet}
                  downloadingEpisodesMap={downloadingEpisodesMap}
                  onEpisodeSourceChanged={reloadMediaDetail}
                  notify={addNotification}
                  isPackSelected={isPackSelected}
                  videoFilesCount={videoFiles.length}
                  hasInfoHash={hasInfoHash}
                  packInfoHash={activeTorrent?.infoHash ?? null}
                  loadingPackPreview={loadingPackPreview}
                  packPreviewLoadError={packPreviewLoadError}
                  packPreviewFilesCount={packPreviewFiles?.length ?? 0}
                  packEpisodesModel={packEpisodesModel}
                  selectedPackSeason={selectedPackSeason}
                  onSelectPackSeason={setSelectedPackSeason}
                  selectedPackEpisodeKey={selectedPackEpisodeKey}
                  onSelectPackEpisodeKey={onSelectPackEpisodeKey}
                  isTV={isTV}
                  isDownloading={playStatus === 'downloading' || playStatus === 'starting'}
                  downloadProgress={torrentStats?.progress != null ? torrentStats.progress * 100 : undefined}
                  statusMessage={progressMessage}
                />
              </div>
            </div>
          ) : null}
      </div>

      {/* Modal de sÃ©lection de source (plusieurs sources disponibles) â€” adaptÃ©e TV */}
      {showSourceModal && allVariants.length > 1 && (
        <SourceSelectModal
          variants={allVariants}
          isSeries={activeTorrent.tmdbType === 'tv'}
          onDownloadAllSeries={activeTorrent.tmdbType === 'tv' ? handleDownloadWholeSeriesByQuality : undefined}
          onSelect={(variant) => {
            setShowSourceModal(false);
            mediaDetailActionsRef.current?.handleDownload(variant);
          }}
          onClose={() => setShowSourceModal(false)}
          firstButtonRef={sourceModalFirstButtonRef}
        />
      )}

      {/* Panneau de vÃ©rification du tÃ©lÃ©chargement (aprÃ¨s ajout d'un torrent) */}
      {showVerificationPanel && verificationInfoHash && (
        <div className="fixed bottom-4 left-4 right-4 z-40 max-w-md md:left-6 md:right-auto min-w-0">
          <DownloadVerificationPanel
            infoHash={verificationInfoHash}
            torrentName={verificationTorrentName ?? torrent.name}
            onComplete={(result) => {
              if (result?.health === 'ok') {
                // Auto-dismiss quand tout est OK
                setTimeout(() => {
                  setShowVerificationPanel(false);
                  setVerificationInfoHash(null);
                  setVerificationTorrentName(null);
                }, 1200);
              }
            }}
            onStatsUpdate={undefined}
            dismissible={true}
            onDismiss={() => {
              setShowVerificationPanel(false);
              setVerificationInfoHash(null);
              setVerificationTorrentName(null);
            }}
          />
        </div>
      )}

      {/* Notifications + statut de partage */}
      <NotificationContainer
        notifications={notifications}
        onRemove={removeNotification}
        seedingStatus={
          torrentStats && (torrentStats.state === 'seeding' || torrentStats.state === 'completed' || torrentStats.files_available)
            ? ({ uploadSpeed: torrentStats.upload_speed, peersConnected: torrentStats.peers_connected } satisfies SeedingStatusInfo)
            : null
        }
      />
    </div>
    </>
  );
}