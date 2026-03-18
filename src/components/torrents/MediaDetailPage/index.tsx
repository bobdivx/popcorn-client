import { useState, useEffect, useRef, useMemo, useCallback } from 'preact/hooks';
import { Film } from 'lucide-preact';
import { useI18n } from '../../../lib/i18n/useI18n';
import { NotificationContainer, type SeedingStatusInfo } from '../../ui/Notification';
import type { MediaDetailPageProps } from './types';
import { useTorrentPlayer } from './hooks/useTorrentPlayer';
import { scheduleUpdateOnlyFilesWithRetry } from './hooks/useTorrentPlayer/playHandler';
import { useVideoFiles } from './hooks/useVideoFiles';
import { useDebug } from './hooks/useDebug';
import { useNotifications } from './hooks/useNotifications';
import { ProgressOverlay } from './components/ProgressOverlay';
import { EnhancedProgressOverlay } from './components/EnhancedProgressOverlay';
import { VideoPlayerWrapper } from './components/VideoPlayerWrapper';
import { MediaDetailActionButtons } from './components/MediaDetailActionButtons';
import { SeriesEpisodesSection } from './components/SeriesEpisodesSection';
import { TorrentInfo } from './components/TorrentInfo';
import { QualityBadges } from './components/QualityBadges';
import { YouTubeVideoPlayer as VideoPlayer } from '../../ui/YouTubeVideoPlayer';
import { getPlaybackPosition, getPlaybackPositionByMedia } from '../../../lib/streaming/torrent-storage';
import { setStreamingInfoHash } from '../../../lib/streamingInfoHashStorage';
import { getOrCreateDeviceId } from '../../../lib/utils/device-id';
import { getDownloadClientStats, saveDownloadMeta } from '../../../lib/utils/download-meta-storage';
import { serverApi } from '../../../lib/client/server-api';
import { clientApi } from '../../../lib/client/api';
import { TokenManager } from '../../../lib/client/storage';
import { useSubscriptionMe } from './hooks/useSubscriptionMe';
import { PROGRESS_POLL_INTERVAL_MS } from './utils/constants';
import { startProgressPolling } from './actions/progressPolling';
import { DownloadVerificationPanel } from '../../downloads/DownloadVerificationPanel';
import type { SeriesEpisodesResponse, TorrentListFileEntry } from '../../../lib/client/server-api/media';
import { isTVPlatform } from '../../../lib/utils/device-detection';
import { getHighQualityTmdbImageUrl } from '../../../lib/utils/tmdb-images';
import { getLibraryDisplayConfig } from '../../../lib/utils/library-display-config';

/** Retourne l'Ã©pisode suivant (saison + id variante + titre) ou null. */
function getNextEpisode(
  seriesEpisodes: SeriesEpisodesResponse | null | undefined,
  selectedSeasonNum: number | null,
  selectedEpisodeVariantId: string | null
): { seasonNum: number; episodeVariantId: string; title: string } | null {
  if (!seriesEpisodes?.seasons?.length || selectedSeasonNum == null || selectedEpisodeVariantId == null) return null;
  const seasons = seriesEpisodes.seasons;
  const seasonIndex = seasons.findIndex((s) => s.season === selectedSeasonNum);
  if (seasonIndex < 0) return null;
  const season = seasons[seasonIndex];
  const epIndex = season.episodes.findIndex((e) => e.id === selectedEpisodeVariantId);
  if (epIndex < 0) return null;
  if (epIndex + 1 < season.episodes.length) {
    const next = season.episodes[epIndex + 1];
    return {
      seasonNum: season.season,
      episodeVariantId: next.id,
      title: next.episode === 0 ? 'Pack complet' : `S${season.season} E${next.episode}`,
    };
  }
  if (seasonIndex + 1 < seasons.length) {
    const nextSeason = seasons[seasonIndex + 1];
    const first = nextSeason.episodes[0];
    if (!first) return null;
    return {
      seasonNum: nextSeason.season,
      episodeVariantId: first.id,
      title: first.episode === 0 ? 'Pack complet' : `S${nextSeason.season} E${first.episode}`,
    };
  }
  return null;
}

// Modal de sÃ©lection de source (TV-friendly) quand plusieurs sources sont disponibles
function SourceSelectModal({
  variants,
  onSelect,
  onClose,
  firstButtonRef,
}: {
  variants: MediaDetailPageProps['torrent'][];
  onSelect: (variant: MediaDetailPageProps['torrent']) => void;
  onClose: () => void;
  firstButtonRef: { current: HTMLButtonElement | null };
}) {
  const { t } = useI18n();
  const sortedVariants = [...variants].sort((a, b) => {
    const qualityOrder: Record<string, number> = { Remux: 1000, '4K': 500, '1080p': 300, '720p': 100, '480p': 50 };
    const aRes = (a.quality as { resolution?: string })?.resolution ?? '';
    const bRes = (b.quality as { resolution?: string })?.resolution ?? '';
    const aQuality = qualityOrder[aRes] ?? 0;
    const bQuality = qualityOrder[bRes] ?? 0;
    return bQuality - aQuality || (b.seedCount ?? 0) - (a.seedCount ?? 0);
  });

  useEffect(() => {
    const t = setTimeout(() => {
      if (firstButtonRef.current) {
        firstButtonRef.current.focus();
      }
    }, 50);
    return () => clearTimeout(t);
  }, [firstButtonRef]);

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
    <div className="fixed inset-0 z-[9999] bg-black/95 backdrop-blur-md flex items-center justify-center p-4 tv:p-8 overflow-y-auto" role="dialog" aria-modal="true" aria-label="Choisir une source">
      <div className="w-full max-w-2xl tv:max-w-4xl max-h-[90vh] tv:max-h-[85vh] flex flex-col bg-gray-900/95 rounded-xl border border-white/20 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between p-4 tv:p-6 border-b border-white/10 flex-shrink-0">
          <h2 className="text-xl tv:text-3xl font-bold text-white">Choisir une source</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-12 h-12 tv:w-16 tv:h-16 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white focus:outline-none focus:ring-4 focus:ring-primary-500 data-focusable"
            aria-label="Fermer"
          >
            <svg className="w-6 h-6 tv:w-8 tv:h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 tv:p-6 space-y-3 tv:space-y-4">
          {sortedVariants.map((variant, index) => {
            const tracker = (variant as any).indexerName ?? (variant as any).indexer_name ?? 'Tracker';
            const quality = (variant.quality as { resolution?: string })?.resolution ?? '';
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
                ref={index === 0 ? firstButtonRef : undefined}
                onClick={() => onSelect(variant)}
                data-focusable
                className="w-full text-left p-4 tv:p-6 rounded-xl bg-white/5 hover:bg-primary/30 border border-white/10 hover:border-primary-500/50 transition-all flex flex-col gap-2 tv:gap-3 focus:outline-none focus:ring-4 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-gray-900 tv-element-focused"
              >
                <div className="flex flex-wrap items-center gap-2 tv:gap-3">
                  <span className="px-3 py-1 tv:px-4 tv:py-2 bg-primary/20 text-primary-200 rounded-lg text-sm tv:text-base font-semibold">
                    {tracker}
                  </span>
                  {quality && (
                    <span className="px-3 py-1 tv:px-4 tv:py-2 bg-white/10 text-white rounded-lg text-sm tv:text-base font-semibold">
                      {quality}
                    </span>
                  )}
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
        </div>
      </div>
    </div>
  );
}

export default function MediaDetailPage({ torrent, initialVariants, seriesEpisodes, initialTorrentStats, backHref, streamBackendUrl }: MediaDetailPageProps) {
  const { t } = useI18n();
  // Ã‰tats de base
  const [isPlaying, setIsPlaying] = useState(false);
  const [showInfo, setShowInfo] = useState(true);
  const [imageUrl, setImageUrl] = useState<string | null>(torrent.imageUrl || null);
  const [heroImageUrl, setHeroImageUrl] = useState<string | null>(torrent.heroImageUrl || null);
  const isCompletedFromProps = torrent.clientState === 'completed' || 
                                torrent.clientState === 'seeding' || 
                                (torrent.clientProgress !== undefined && torrent.clientProgress >= 0.95);
  // DÃ©tecter si c'est un mÃ©dia local (slug ou id commence par "local_")
  const isLocalMedia = torrent.id?.startsWith('local_') || torrent.slug?.startsWith('local_') || torrent.infoHash?.startsWith('local_');
  // Pour les mÃ©dias locaux, ils sont toujours disponibles localement
  const [isAvailableLocally, setIsAvailableLocally] = useState(isCompletedFromProps || isLocalMedia);
  const [downloadingToClient, setDownloadingToClient] = useState(false);
  const [magnetCopied, setMagnetCopied] = useState(false);
  const [trailerKey, setTrailerKey] = useState<string | null>(torrent.trailerKey || null);
  const [isLoadingTrailer, setIsLoadingTrailer] = useState(false);
  const [isPlayingTrailer, setIsPlayingTrailer] = useState(false);
  /** En mode immersif (false), les infos et overlays sont masquÃ©s, luminositÃ© vidÃ©o normale. Clic ou touche rÃ©affiche. */
  const [trailerUiVisible, setTrailerUiVisible] = useState(true);
  const trailerCloseButtonRef = useRef<HTMLButtonElement>(null);
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
  const isTV = isTVPlatform();
  /** Compteur d'Ã©checs consÃ©cutifs de getTorrent (hors 404) pour invalider torrentStats si backend injoignable. */
  const getTorrentFailCountRef = useRef<number>(0);
  /** DerniÃ¨re valeur connue de torrentStats (pour ne pas Ã©craser un Ã©tat complÃ©tÃ© par une rÃ©ponse API invalide type unknown/0). */
  const lastTorrentStatsRef = useRef<{ state?: string; progress?: number } | null>(null);

  // Ã‰tats pour les seeders/leechers
  const [currentSeedCount, setCurrentSeedCount] = useState<number>(torrent.seedCount);
  const [currentLeechCount, setCurrentLeechCount] = useState<number>(torrent.leechCount);
  const [currentFileSize, setCurrentFileSize] = useState<number>(torrent.fileSize);

  // Ã‰tats pour les variantes (sÃ©ries : sÃ©lection par saison/Ã©pisode)
  const [allVariants, setAllVariants] = useState<any[]>([torrent]);
  const [selectedTorrent, setSelectedTorrent] = useState<any>(torrent);
  /** Saison / Ã©pisode sÃ©lectionnÃ©s (pour sÃ©ries) */
  const [selectedSeasonNum, setSelectedSeasonNum] = useState<number | null>(null);
  const [selectedEpisodeVariantId, setSelectedEpisodeVariantId] = useState<string | null>(null);

  // Ã‰tat pour la position de lecture sauvegardÃ©e
  const [savedPlaybackPosition, setSavedPlaybackPosition] = useState<number | null>(null);
  const [startFromBeginning, setStartFromBeginning] = useState(true);

  /** Chemin du fichier en bibliothÃ¨que (library ou findLocalMediaByTmdb), pour lecture sans torrent dans le client. */
  const [libraryDownloadPath, setLibraryDownloadPath] = useState<string | null>(null);

  /** AprÃ¨s ajout d'un seul Ã©pisode (streaming), info_hash pour que le lecteur utilise ce torrent */
  const [addedTorrentInfoHash, setAddedTorrentInfoHash] = useState<string | null>(null);

  // Torrent actif (sÃ©lectionnÃ© ou dÃ©faut) â€” utilisÃ© pour lecture / tÃ©lÃ©chargement
  const activeTorrent = selectedTorrent || torrent;
  // Torrent avec chemin bibliothÃ¨que si connu (permet Ã  useVideoFiles de lire depuis le disque sans getTorrent)
  const activeTorrentWithLibraryPath = useMemo(
    () =>
      libraryDownloadPath
        ? { ...activeTorrent, downloadPath: libraryDownloadPath }
        : activeTorrent,
    [activeTorrent, libraryDownloadPath]
  );

  // Constantes dÃ©rivÃ©es (basÃ©es sur le torrent actif pour lecture/tÃ©lÃ©chargement)
  const isExternal = activeTorrent.id.startsWith('external_');
  const hasInfoHash = typeof activeTorrent.infoHash === 'string' && activeTorrent.infoHash.trim().length > 0;
  const hasMagnetLink = typeof activeTorrent._externalMagnetUri === 'string' && activeTorrent._externalMagnetUri.trim().length > 0;
  // Pouvoir lancer la lecture si on a un infoHash (stream-torrent ou dÃ©jÃ  ajoutÃ©) ou un magnet/lien pour ajouter puis stream
  const canStream = hasInfoHash || !!(activeTorrent as { _externalLink?: string })._externalLink || hasMagnetLink;
  const isLocalTorrent =
    activeTorrent.id?.startsWith('local_') ||
    activeTorrent.slug?.startsWith('local_') ||
    activeTorrent.infoHash?.startsWith('local_') ||
    !!(activeTorrent as any).downloadPath;

  // Initialiser les variantes depuis le groupe (sÃ©ries)
  useEffect(() => {
    if (initialVariants && initialVariants.length > 0) {
      setAllVariants(initialVariants);

      // Appliquer la qualitÃ© prÃ©fÃ©rÃ©e des paramÃ¨tres si plusieurs variantes disponibles
      if (initialVariants.length > 1) {
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
          const preferred = initialVariants.filter((v: any) => normalizeRes(v.quality?.resolution) === targetRes);
          if (preferred.length > 0) {
            // Parmi les variantes prÃ©fÃ©rÃ©es, prendre celle avec le plus de seeders
            const best = [...preferred].sort((a: any, b: any) => (b.seedCount ?? 0) - (a.seedCount ?? 0))[0];
            setSelectedTorrent(best);
          } else {
            // QualitÃ© prÃ©fÃ©rÃ©e non disponible : prendre la meilleure qualitÃ© disponible (ordre dÃ©croissant puis seeders)
            const best = [...initialVariants].sort((a: any, b: any) => {
              const aQ = QUALITY_ORDER[normalizeRes(a.quality?.resolution)] ?? 0;
              const bQ = QUALITY_ORDER[normalizeRes(b.quality?.resolution)] ?? 0;
              return bQ - aQ || (b.seedCount ?? 0) - (a.seedCount ?? 0);
            })[0];
            setSelectedTorrent(best);
          }
        }
      }
    }
  }, [initialVariants]);

  // Hooks personnalisÃ©s
  const { videoFiles, selectedFile, setVideoFiles, setSelectedFile, loadVideoFiles } = useVideoFiles({
    torrentName: activeTorrent.name,
    torrent: activeTorrentWithLibraryPath,
    onError: (error) => {
      console.error('Erreur lors du chargement des fichiers vidÃ©o:', error);
    },
  });
  const { notifications, addNotification, removeNotification } = useNotifications();
  const { debugLogs, showDebug, setShowDebug, addDebugLog, clearDebugLogs } = useDebug();
  const { streamingTorrentActive } = useSubscriptionMe();

  // En mode streaming : garder l'URL stream-torrent pendant la lecture mÃªme si isAvailableLocally
  // passe Ã  true (fichier en stream_cache), pour Ã©viter de basculer sur HLS local (transcodage, timeout).
  // MÃ©dias bibliothÃ¨que (local_xxx) : pas d'API stream-torrent cÃ´tÃ© backend, toujours utiliser le flux local.
  const useStreamTorrentMode =
    (streamingTorrentActive ?? false) &&
    (!isAvailableLocally || isPlaying) &&
    !activeTorrent.infoHash?.startsWith('local_');

  // Log des paramÃ¨tres streaming en console (visible dans lâ€™onglet Console pour debug)
  useEffect(() => {
    const token = typeof TokenManager?.getCloudAccessToken === 'function' ? TokenManager.getCloudAccessToken() : null;
    console.debug('[MediaDetail] ParamÃ¨tres streaming', {
      streamingTorrentActive: streamingTorrentActive ?? false,
      useStreamTorrentMode,
      isAvailableLocally: Boolean(isAvailableLocally),
      hasCloudToken: !!token,
    });
  }, [streamingTorrentActive, isAvailableLocally, useStreamTorrentMode]);

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
    streamingTorrentActive: streamingTorrentActive ?? false,
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

  /** Ferme le lecteur puis dÃ©clenche un rafraÃ®chissement des stats et de la disponibilitÃ© (carte Ã  jour aprÃ¨s stream). */
  const handleClosePlayerAndRefresh = useCallback(async () => {
    await handleClosePlayer();
    setRefreshAfterClose((r) => r + 1);
  }, [handleClosePlayer]);

  /** TÃ©lÃ©charger un seul Ã©pisode du pack (preview) : ajoute le torrent avec only_files [fileIndex]. */
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
          const downloadType = torrent.tmdbType === 'movie' ? 'film' : (torrent.tmdbType === 'tv' ? 'serie' : 'film');
          const result = await clientApi.addMagnetLink(magnet, torrent.name, false, downloadType, undefined, [fileIndex]);
          infoHash = result?.info_hash ?? '';
          if (infoHash) {
            saveDownloadMeta(infoHash, { ...torrent, imageUrl: torrent.imageUrl ?? undefined, heroImageUrl: torrent.heroImageUrl ?? undefined, cleanTitle: torrent.cleanTitle ?? torrent.name ?? undefined });
            if (typeof torrent.tmdbId === 'number' && (torrent.tmdbType === 'movie' || torrent.tmdbType === 'tv')) {
              clientApi.bindDownloadToMedia(infoHash, torrent.tmdbId, torrent.tmdbType).catch(() => {});
            }
          }
        } else if (externalLink) {
          const baseUrl = serverApi.getServerUrl();
          const token = serverApi.getAccessToken();
          const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
          const isRelative = !externalLink.startsWith('http://') && !externalLink.startsWith('https://');
          const q = new URLSearchParams();
          if (isRelative) {
            q.set('indexerId', String((torrent as { indexerId?: string }).indexerId ?? (torrent as { indexer_id?: string }).indexer_id ?? ''));
            q.set('torrentId', (() => {
              const m = externalLink.match(/[?&]id=(\d+)/);
              return (m && m[1]) || (torrent.id && torrent.id.includes('_') ? torrent.id.split('_').pop() : torrent.id) || '';
            })());
            if ((torrent as { _guid?: string })._guid) q.set('guid', (torrent as { _guid: string })._guid);
            const typeMatch = torrent.id && torrent.id.match(/^external_([^_]+)_/);
            if (typeMatch && typeMatch[1]) q.set('indexerTypeId', typeMatch[1]);
            q.set('relativeUrl', externalLink);
          } else {
            q.set('url', externalLink);
            if ((torrent as { indexerId?: string }).indexerId) q.set('indexerId', String((torrent as { indexerId: string }).indexerId));
            if ((torrent as { _guid?: string })._guid) q.set('guid', (torrent as { _guid: string })._guid);
            if (torrent.id?.includes('_')) q.set('torrentId', torrent.id!.split('_').pop()!);
            const extMatch = torrent.id && torrent.id.match(/^external_(.+?)_\d+$/);
            if (extMatch && extMatch[1]) q.set('indexerTypeId', extMatch[1]);
          }
          const res = await fetch(`${baseUrl}/api/torrents/external/download?${q.toString()}`, { headers });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error((err as { error?: string }).error || `Erreur ${res.status}`);
          }
          const blob = await res.blob();
          const file = new File([blob], `${torrent.name}.torrent`, { type: 'application/x-bittorrent' });
          const downloadType = torrent.tmdbType === 'movie' ? 'film' : (torrent.tmdbType === 'tv' ? 'serie' : 'film');
          const result = await clientApi.addTorrentFile(file, false, downloadType);
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
          addNotification('success', 'Ã‰pisode ajoutÃ© au tÃ©lÃ©chargement.');
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
      const magnet = (torrent as { _externalMagnetUri?: string })._externalMagnetUri ?? ((torrent as { _externalLink?: string })._externalLink?.startsWith('magnet:') ? (torrent as { _externalLink: string })._externalLink : null);
      const externalLink = (torrent as { _externalLink?: string })._externalLink && !(torrent as { _externalLink?: string })._externalLink?.startsWith('magnet:') ? (torrent as { _externalLink: string })._externalLink : null;
      setPlayStatus('adding');
      try {
        let infoHash: string;
        if (magnet) {
          const result = await clientApi.addMagnetLink(magnet, torrent.name, true, undefined, undefined, [fileIndex]);
          infoHash = result?.info_hash ?? '';
        } else if (externalLink) {
          const baseUrl = serverApi.getServerUrl();
          const token = serverApi.getAccessToken();
          const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
          const isRelative = !externalLink.startsWith('http://') && !externalLink.startsWith('https://');
          const q = new URLSearchParams();
          if (isRelative) {
            q.set('indexerId', String((torrent as { indexerId?: string }).indexerId ?? (torrent as { indexer_id?: string }).indexer_id ?? ''));
            q.set('torrentId', (() => {
              const m = externalLink.match(/[?&]id=(\d+)/);
              return (m && m[1]) || (torrent.id && torrent.id.includes('_') ? torrent.id.split('_').pop() : torrent.id) || '';
            })());
            if ((torrent as { _guid?: string })._guid) q.set('guid', (torrent as { _guid: string })._guid);
            const typeMatch = torrent.id && torrent.id.match(/^external_([^_]+)_/);
            if (typeMatch && typeMatch[1]) q.set('indexerTypeId', typeMatch[1]);
            q.set('relativeUrl', externalLink);
          } else {
            q.set('url', externalLink);
            if ((torrent as { indexerId?: string }).indexerId) q.set('indexerId', String((torrent as { indexerId: string }).indexerId));
            if ((torrent as { _guid?: string })._guid) q.set('guid', (torrent as { _guid: string })._guid);
            if (torrent.id?.includes('_')) q.set('torrentId', torrent.id!.split('_').pop()!);
            const extMatch = torrent.id && torrent.id.match(/^external_(.+?)_\d+$/);
            if (extMatch && extMatch[1]) q.set('indexerTypeId', extMatch[1]);
          }
          const res = await fetch(`${baseUrl}/api/torrents/external/download?${q.toString()}`, { headers });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error((err as { error?: string }).error || `Erreur ${res.status}`);
          }
          const blob = await res.blob();
          const file = new File([blob], `${torrent.name}.torrent`, { type: 'application/x-bittorrent' });
          const result = await clientApi.addTorrentFile(file, true);
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
          setProgressMessage('PrÃ©paration du fluxâ€¦');
          const waitForFiles = async (attempts = 0): Promise<void> => {
            if (attempts > 30) return;
            try {
              const videos = await loadVideoFiles(infoHash);
              if (videos.length > 0) {
                setVideoFiles(videos);
                setSelectedFile(videos[0]);
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
    (torrentStats.progress ?? 0) >= 0.99
  );
  const shouldShowPlayButton = isLocalTorrent || (isAvailableLocally && hasInfoHash) || isDownloadComplete;

  // Garder une ref Ã  jour avec torrentStats pour Ã©viter d'Ã©craser un Ã©tat complÃ©tÃ© par une rÃ©ponse API invalide (unknown/0)
  useEffect(() => {
    lastTorrentStatsRef.current = torrentStats
      ? { state: torrentStats.state, progress: torrentStats.progress }
      : null;
  }, [torrentStats]);

  // Quand on arrive depuis la page TÃ©lÃ©chargements avec des stats (complÃ©tÃ©), prÃ©charger les fichiers vidÃ©o pour que Â« Lire Â» soit utilisable
  useEffect(() => {
    if (
      initialTorrentStats &&
      hasInfoHash &&
      activeTorrent.infoHash &&
      (initialTorrentStats.state === 'completed' || initialTorrentStats.state === 'seeding' || initialTorrentStats.progress >= 0.99)
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
    if (stats && (stats.state === 'completed' || stats.state === 'seeding' || (stats.progress ?? 0) >= 0.99)) {
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

  // VÃ©rifier la position de lecture sauvegardÃ©e (torrent actif) : prioritÃ© par mÃ©dia (tmdb) si dispo, sinon par torrent
  useEffect(() => {
    const checkSavedPosition = async () => {
      if (typeof window === 'undefined') return;
      const deviceId = getOrCreateDeviceId();
      try {
        const tmdbId = activeTorrent.tmdbId;
        const tmdbType = activeTorrent.tmdbType;
        if (typeof tmdbId === 'number' && (tmdbType === 'movie' || tmdbType === 'tv')) {
          const position = await getPlaybackPositionByMedia(tmdbId, tmdbType, deviceId);
          if (position != null && position > 0) {
            setSavedPlaybackPosition(position);
            return;
          }
        }
        if (activeTorrent.id) {
          const position = await getPlaybackPosition(activeTorrent.id, deviceId);
          if (position != null && position > 0) {
            setSavedPlaybackPosition(position);
            return;
          }
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
          // MÃªme source que la page /downloads : rÃ©cupÃ©rer les stats depuis la liste des torrents
          try {
            const list = await clientApi.listTorrents();
            fromList = list.find(
              (t) => (t.info_hash ?? (t as unknown as { infoHash?: string }).infoHash ?? '').toLowerCase() === ih
            );
            if (fromList) {
              getTorrentFailCountRef.current = 0;
              setTorrentStats(fromList);
              const completed = fromList.state === 'completed' || fromList.state === 'seeding' || (fromList.progress ?? 0) >= 0.99;
              if (completed) {
                setIsAvailableLocally(true);
              }
            } else {
              setTorrentStats(null);
              setIsAvailableLocally(false);
            }
          } catch (_) {
            // listTorrents en Ã©chec (ex. client non dispo)
          }
          // Ne pas appeler getTorrent quand le torrent n'est pas dans la liste : Ã©vite le 404 en console.
          // On s'appuie sur la library et findLocalMediaByTmdb pour afficher "Lire" si le fichier est sur disque.
          // 1) VÃ©rifier la library (info_hash ou tmdb_id) â€” fichier sur disque mÃªme si torrent supprimÃ© du client
          if (hasInfoHash && activeTorrent.infoHash) {
            try {
              const libRes = await serverApi.getLibrary();
              if (libRes.success && Array.isArray(libRes.data)) {
                const ih = activeTorrent.infoHash!.toLowerCase();
                const tmdbId = activeTorrent.tmdbId;
                const tmdbType = activeTorrent.tmdbType || 'movie';
                const item = (libRes.data as any[]).find((i: any) => {
                  const matchHash = (i.info_hash || i.infoHash || '').toLowerCase() === ih;
                  const matchTmdb =
                    tmdbId != null &&
                    (i.tmdb_id === tmdbId || i.tmdb_id === Number(tmdbId)) &&
                    (i.tmdb_type || 'movie') === tmdbType;
                  return matchHash || matchTmdb;
                });
                if (item && (item.download_path || item.exists)) {
                  setIsAvailableLocally(true);
                  const hasExistingPath = !!(activeTorrent as any).downloadPath;
                  // Ne pas Ã©craser si le torrent a dÃ©jÃ  un chemin ; ne pas utiliser un chemin qui est un dossier (streaming a besoin du fichier)
                  const pathIsFile = item.download_path && /\.(mkv|mp4|avi|webm|mov|m4v|wmv|ts|m2ts)$/i.test(item.download_path.replace(/\\/g, '/'));
                  if (item.download_path && !hasExistingPath && pathIsFile) {
                    setLibraryDownloadPath(item.download_path);
                  }
                  setTorrentStats((prev) => {
                    const prevState = (prev?.state ?? '').toLowerCase();
                    const prevProgress = typeof prev?.progress === 'number' ? prev.progress : 0;
                    const looksStaleQueued =
                      (prevState === 'queued' || prevState === 'downloading') &&
                      prevProgress <= 0.001 &&
                      (prev?.downloaded_bytes ?? 0) === 0 &&
                      (prev?.download_speed ?? 0) === 0;
                    const prevIsComplete =
                      prevState === 'completed' || prevState === 'seeding' || prevProgress >= 0.99;

                    // Si la bibliothèque confirme que le média existe déjà, on doit écraser
                    // les stats "queued 0%" (souvent après reboot) pour éviter l'incohérence UI.
                    if (prev && !looksStaleQueued && !prevIsComplete) return prev;
                    return {
                      info_hash: activeTorrent.infoHash!,
                      name: item.name || activeTorrent.name || '',
                      state: 'completed',
                      downloaded_bytes: item.file_size ?? prev?.downloaded_bytes ?? 0,
                      uploaded_bytes: prev?.uploaded_bytes ?? 0,
                      total_bytes: item.file_size ?? prev?.total_bytes ?? 0,
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
                  addDebugLog('success', 'ðŸ“š MÃ©dia trouvÃ© dans la bibliothÃ¨que (library)', {
                    info_hash: activeTorrent.infoHash,
                    download_path: item.download_path,
                    by: (item.info_hash || item.infoHash || '').toLowerCase() === ih ? 'info_hash' : 'tmdb_id',
                  });
                }
              }
            } catch (_e) {
              // Ignorer les erreurs (ex. endpoint /library non disponible)
            }
          }
          // 2) VÃ©rifier par TMDB ID (local-media by tmdb) si pas dÃ©jÃ  disponible
          if (activeTorrent.tmdbId) {
            try {
              const localMedia = await clientApi.findLocalMediaByTmdb(activeTorrent.tmdbId, activeTorrent.tmdbType || undefined);
              if (localMedia.length > 0) {
                setIsAvailableLocally(true);
                const hasExistingPathTmdb = !!(activeTorrent as any).downloadPath;
                const currentName = (activeTorrent.name || '').toLowerCase();
                const matchByName = currentName
                  ? localMedia.find((m: any) => (m.file_name || m.name || '').toLowerCase().includes(currentName.split(/[.\s\-_]+/)[0] || '') || currentName.includes((m.file_name || m.name || '').toLowerCase().split(/[.\s\-_]+/)[0] || ''))
                  : null;
                const chosen = matchByName ?? localMedia[0];
                const firstPath = (chosen as { file_path?: string }).file_path;
                // Ne pas Ã©craser le chemin si le torrent en a dÃ©jÃ  un ; ne pas utiliser un chemin qui est un dossier
                const firstPathIsFile = firstPath && /\.(mkv|mp4|avi|webm|mov|m4v|wmv|ts|m2ts)$/i.test(firstPath.replace(/\\/g, '/'));
                if (!hasExistingPathTmdb && firstPathIsFile) {
                  setLibraryDownloadPath(firstPath);
                }
                setTorrentStats((prev) => {
                  const prevState = (prev?.state ?? '').toLowerCase();
                  const prevProgress = typeof prev?.progress === 'number' ? prev.progress : 0;
                  const looksStaleQueued =
                    (prevState === 'queued' || prevState === 'downloading') &&
                    prevProgress <= 0.001 &&
                    (prev?.downloaded_bytes ?? 0) === 0 &&
                    (prev?.download_speed ?? 0) === 0;
                  const prevIsComplete =
                    prevState === 'completed' || prevState === 'seeding' || prevProgress >= 0.99;
                  if (prev && !looksStaleQueued && !prevIsComplete) return prev;
                  return {
                    info_hash: activeTorrent.infoHash!,
                    name: activeTorrent.name || '',
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
                if (localMedia.length === 1) {
                  addDebugLog('success', `ðŸ“š MÃ©dia local trouvÃ© (TMDB ID: ${activeTorrent.tmdbId})`, {
                    file: localMedia[0].file_name,
                    quality: localMedia[0].quality || 'N/A',
                    resolution: localMedia[0].resolution || 'N/A',
                  });
                } else {
                  addDebugLog('success', `ðŸ“š ${localMedia.length} version(s) locale(s) trouvÃ©e(s) (TMDB ID: ${activeTorrent.tmdbId})`, {
                    versions: localMedia.map(m => ({
                      file: m.file_name,
                      quality: m.quality || 'N/A',
                      resolution: m.resolution || 'N/A',
                    })),
                  });
                }
              }
            } catch (_) {
              // findLocalMediaByTmdb en Ã©chec : on a dÃ©jÃ  tentÃ© la library au-dessus
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
  }, [hasInfoHash, activeTorrent.infoHash, activeTorrent.tmdbId, activeTorrent.tmdbType, activeTorrent.clientState, activeTorrent.clientProgress, isExternal, refreshAfterClose]);

  // VÃ©rifier si un tÃ©lÃ©chargement est en cours au montage (torrent actif)
  useEffect(() => {
    const checkDownloadingTorrent = async () => {
      if (activeTorrent.clientState && activeTorrent.clientProgress !== undefined) {
        const isCompleted = activeTorrent.clientState === 'completed' || 
                            activeTorrent.clientState === 'seeding' || 
                            activeTorrent.clientProgress >= 0.95;
        if (isCompleted && hasInfoHash && activeTorrent.infoHash) {
          try {
            const videos = await loadVideoFiles(activeTorrent.infoHash);
            if (videos.length > 0) {
              setVideoFiles(videos);
              if (!selectedFile) {
                setSelectedFile(videos[0]);
              }
              // Si on a des fichiers vidéo, le média est localement disponible.
              // Après reboot, il arrive que les stats du client restent bloquées en "queued 0%":
              // on force alors un état "completed" pour éviter d'afficher la carte de téléchargement.
              if (!streamingTorrentActive) setIsAvailableLocally(true);
              setTorrentStats((prev) => {
                const prevState = (prev?.state ?? '').toLowerCase();
                const prevProgress = typeof prev?.progress === 'number' ? prev.progress : 0;
                const prevIsComplete = prevState === 'completed' || prevState === 'seeding' || prevProgress >= 0.99;
                if (prevIsComplete) return prev;
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

      // Toujours rafraÃ®chir les stats depuis listTorrents quand on n'est pas en lecture,
      // y compris pendant "adding" / "downloading", pour que la progression s'affiche sans recharger la page.
      if (hasInfoHash && activeTorrent.infoHash && !isPlaying) {
        try {
          const { clientApi } = await import('../../../lib/client/api');
          const ih = activeTorrent.infoHash.toLowerCase();
          // MÃªme source que /downloads : rafraÃ®chir les stats depuis la liste (polling)
          try {
            const list = await clientApi.listTorrents();
            const fromList = list.find(
              (t) => (t.info_hash ?? (t as unknown as { infoHash?: string }).infoHash ?? '').toLowerCase() === ih
            );
            if (fromList) {
              setTorrentStats(fromList);
              const completed = fromList.state === 'completed' || fromList.state === 'seeding' || (fromList.progress ?? 0) >= 0.95;
              if (completed) {
                try {
                  const videos = await loadVideoFiles(activeTorrent.infoHash!);
                  // En mode streaming actif, ne pas marquer "disponible localement" pour garder l'URL stream-torrent (Ã©vite bascule HLS / 502).
                  if (videos.length > 0 && !streamingTorrentActive) setIsAvailableLocally(true);
                } catch (_) {}
                return;
              }
              if (fromList.state === 'downloading' || fromList.state === 'queued') {
                startProgressPolling(fromList.info_hash, {
                  torrent,
                  pollTorrentProgress,
                  progressPollIntervalRef,
                  PROGRESS_POLL_INTERVAL_MS,
                  setPlayStatus,
                });
              }
              return; // stats Ã  jour depuis listTorrents, pas besoin d'appeler getTorrent
            }
          } catch (_) {}
          // Ne pas appeler getTorrent quand le torrent n'est pas dans la liste : Ã©vite le 404 en console.
          // listTorrents est la seule source (mÃªme que /downloads) ; si pas trouvÃ©, rien Ã  afficher.
        } catch (err) {
          // Ignorer silencieusement les erreurs 404 (torrent non tÃ©lÃ©chargÃ©)
          if (err instanceof Error && (err.message.includes('404') || err.message.includes('Not Found'))) {
            return;
          }
          getTorrentFailCountRef.current += 1;
          // Ne pas effacer torrentStats si un polling de progression est actif (tÃ©lÃ©chargement en cours)
          if (getTorrentFailCountRef.current >= 2 && !progressPollIntervalRef?.current) {
            setTorrentStats(null);
            getTorrentFailCountRef.current = 0;
          }
        }
      }
    };

    checkDownloadingTorrent();
    // Polling des stats : met Ã  jour progression / Ã©tat du tÃ©lÃ©chargement sans recharger la page
    const STATS_POLL_MS = 5_000;
    const iv = setInterval(checkDownloadingTorrent, STATS_POLL_MS);
    return () => clearInterval(iv);
  }, [hasInfoHash, activeTorrent.infoHash, activeTorrent.clientState, activeTorrent.clientProgress, isPlaying, playStatus, streamingTorrentActive]);

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

  // Focus par dÃ©faut en TV : prioritÃ© Lire (si disponible) > TÃ©lÃ©charger > Retour
  useEffect(() => {
    if (!isTVPlatform()) return;
    const t = setTimeout(() => {
      const playEl = document.querySelector('[data-media-detail-action="play"]') as HTMLButtonElement | null;
      const downloadEl = document.querySelector('[data-media-detail-action="download"]') as HTMLButtonElement | null;
      const backLink = backLinkRef.current;
      const el =
        playEl && !playEl.disabled
          ? playEl
          : downloadEl && !downloadEl.disabled
            ? downloadEl
            : backLink;
      if (el) el.focus();
    }, 200);
    return () => clearTimeout(t);
  }, [activeTorrent?.id, torrentStats, isAvailableLocally, isPlaying]);

  // TÃ©lÃ©commande : premiÃ¨re touche Retour met le focus sur le bouton Retour, deuxiÃ¨me touche navigue
  useEffect(() => {
    const el = tvBackHandlerRef.current;
    if (!el) return;
    (el as HTMLElement & { _tvBack?: () => void })._tvBack = () => {
      const backLink = backLinkRef.current;
      if (backLink && document.activeElement === backLink) {
        if (typeof window !== 'undefined' && window.history.length > 1) {
          window.history.back();
        } else if (backHref) {
          window.location.href = backHref;
        } else {
          window.location.href = '/dashboard';
        }
      } else if (backLink) {
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

  // Lancer automatiquement la bande-annonce (sans clic) ; les infos se cachent aprÃ¨s 5 s (voir effet ci-dessous)
  useEffect(() => {
    if (!trailerKey || hasAutoPlayedTrailerRef.current) return;
    hasAutoPlayedTrailerRef.current = true;
    setIsPlayingTrailer(true);
  }, [trailerKey]);

  // Quand on ferme la bande-annonce, rÃ©afficher lâ€™UI pour la prochaine fois
  useEffect(() => {
    if (!isPlayingTrailer) setTrailerUiVisible(true);
  }, [isPlayingTrailer]);

  // DÃ©lai 5 s aprÃ¨s le dÃ©but de la bande-annonce puis masquer les infos (mode immersif)
  const TRAILER_HIDE_UI_DELAY_MS = 5000;
  useEffect(() => {
    if (!isPlayingTrailer) return;
    setTrailerUiVisible(true);
    const t = setTimeout(() => setTrailerUiVisible(false), TRAILER_HIDE_UI_DELAY_MS);
    return () => clearTimeout(t);
  }, [isPlayingTrailer]);

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

  // Initialiser la sÃ©lection saison/Ã©pisode au premier chargement (premiÃ¨re saison, premier Ã©pisode)
  useEffect(() => {
    if (seriesEpisodes?.seasons?.length && selectedSeasonNum === null) {
      const first = seriesEpisodes.seasons[0];
      if (first?.episodes?.length) {
        setSelectedSeasonNum(first.season);
        setSelectedEpisodeVariantId(first.episodes[0].id);
      }
    }
  }, [seriesEpisodes, selectedSeasonNum]);

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
    // S01E05, s1e5, 1x05, S1-E5
    const m = text.match(/(?:s(\d{1,2})[.\s-]*e(\d{1,2})|(\d{1,2})x(\d{1,2}))/i);
    if (m) {
      const s = parseInt(m[1] ?? m[3], 10);
      const e = parseInt(m[2] ?? m[4], 10);
      if (!Number.isNaN(s) && !Number.isNaN(e)) return { season: s, episode: e };
    }
    return null;
  }, []);

  // Synchroniser selectedTorrent (et libraryDownloadPath) quand l'utilisateur choisit un Ã©pisode (sÃ©ries)
  useEffect(() => {
    if (!seriesEpisodes?.seasons?.length || selectedEpisodeVariantId == null) return;
    let variant = allVariants.find((v: any) => v.id === selectedEpisodeVariantId);
    // Fallback pour la bibliothÃ¨que : les variants ont id "local_xxx", pas l'id TMDB â†’ matcher par SxxExx
    if (!variant) {
      const season = seriesEpisodes.seasons.find((s) =>
        s.episodes.some((e) => e.id === selectedEpisodeVariantId)
      );
      const ep = season?.episodes.find((e) => e.id === selectedEpisodeVariantId);
      if (ep != null) {
        variant = allVariants.find((v: any) => {
          const se = parseSeasonEpisodeFromVariant(v);
          return se && se.season === ep.season && se.episode === ep.episode;
        });
      }
    }
    if (variant) {
      setSelectedTorrent(variant);
      setCurrentSeedCount(variant.seedCount ?? 0);
      setCurrentLeechCount(variant.leechCount ?? 0);
      setCurrentFileSize(variant.fileSize ?? 0);
      // Mettre Ã  jour le chemin bibliothÃ¨que pour la lecture (sÃ©ries depuis library)
      if (variant.downloadPath) {
        setLibraryDownloadPath(variant.downloadPath);
      }
    }
  }, [seriesEpisodes, selectedEpisodeVariantId, allVariants, parseSeasonEpisodeFromVariant]);

  // Pack complet (Ã©pisode 0) : charger la liste des fichiers du torrent pour lister les Ã©pisodes
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
  /** Liste des fichiers du pack sans ajouter le torrent (API list-files : magnet ou URL externe) */
  const [packPreviewFiles, setPackPreviewFiles] = useState<TorrentListFileEntry[] | null>(null);
  const [loadingPackPreview, setLoadingPackPreview] = useState(false);
  /** Index du fichier (dans packPreviewFiles) sÃ©lectionnÃ© pour "TÃ©lÃ©charger cet Ã©pisode" / "Lire" (preview, torrent pas encore ajoutÃ©) */
  const [selectedPackEpisodePreviewIndex, setSelectedPackEpisodePreviewIndex] = useState<number | null>(null);
  useEffect(() => {
    if (!isPackSelected || hasInfoHash) {
      setPackPreviewFiles(null);
      setSelectedPackEpisodePreviewIndex(null);
      setAddedTorrentInfoHash(null);
      return;
    }
    const magnet = (activeTorrent as { _externalMagnetUri?: string })._externalMagnetUri ?? ((activeTorrent as { _externalLink?: string })._externalLink?.startsWith('magnet:') ? (activeTorrent as { _externalLink: string })._externalLink : null);
    const externalLink = (activeTorrent as { _externalLink?: string })._externalLink && !(activeTorrent as { _externalLink?: string })._externalLink?.startsWith('magnet:') ? (activeTorrent as { _externalLink: string })._externalLink : null;
    if (!magnet && !externalLink) {
      setPackPreviewFiles(null);
      return;
    }
    const isRelativeLink = externalLink != null && !externalLink.startsWith('http://') && !externalLink.startsWith('https://');
    const idMatch = externalLink != null ? externalLink.match(/[?&]id=(\d+)/) : null;
    const numericTorrentId = (idMatch && idMatch[1]) ?? null;
    let cancelled = false;
    setLoadingPackPreview(true);
    const load = async () => {
      try {
        const params = magnet
          ? { magnet }
          : {
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
        const res = await serverApi.getTorrentFileList(params);
        if (cancelled) return;
        if (res.success && Array.isArray(res.data)) {
          setPackPreviewFiles(res.data);
        } else {
          setPackPreviewFiles(null);
        }
      } catch {
        if (!cancelled) setPackPreviewFiles(null);
      } finally {
        if (!cancelled) setLoadingPackPreview(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [isPackSelected, hasInfoHash, activeTorrent.id, (activeTorrent as { _externalLink?: string })._externalLink, (activeTorrent as { _externalMagnetUri?: string })._externalMagnetUri]);
  /** DÃ©compose les fichiers du pack en saisons/Ã©pisodes via SxxExx ou 1x05 dans les noms */
  const packEpisodesBySeason = useMemo(() => {
    if (!isPackSelected || videoFiles.length < 2) return null;
    const parsed: { season: number; episode: number; file: typeof videoFiles[0] }[] = [];
    for (const file of videoFiles) {
      const name = file.name || file.path || '';
      const m = name.match(/[Ss](\d{1,2})[.\s-]*[Ee](\d{1,2})|(\d{1,2})[xX](\d{1,2})/);
      if (m) {
        const s = parseInt(m[1] ?? m[3] ?? '1', 10);
        const e = parseInt(m[2] ?? m[4] ?? '1', 10);
        if (!Number.isNaN(s) && !Number.isNaN(e)) parsed.push({ season: s, episode: e, file });
      }
    }
    if (parsed.length === 0) return null;
    const bySeason = new Map<number, { episode: number; file: typeof videoFiles[0] }[]>();
    for (const p of parsed) {
      const list = bySeason.get(p.season) ?? [];
      list.push({ episode: p.episode, file: p.file });
      bySeason.set(p.season, list);
    }
    for (const list of bySeason.values()) list.sort((a, b) => a.episode - b.episode);
    const seasons = Array.from(bySeason.keys()).sort((a, b) => a - b);
    return { bySeason, seasons };
  }, [isPackSelected, videoFiles]);
  /** MÃªme structure Ã  partir de la liste preview (sans torrent ajoutÃ©) : permet d'afficher les Ã©pisodes et "TÃ©lÃ©charger tout" */
  const packEpisodesBySeasonFromPreview = useMemo(() => {
    if (!isPackSelected || !packPreviewFiles || packPreviewFiles.length < 2) return null;
    const parsed: { season: number; episode: number; index: number; name: string }[] = [];
    for (let i = 0; i < packPreviewFiles.length; i++) {
      const f = packPreviewFiles[i];
      const name = f.name || '';
      const m = name.match(/[Ss](\d{1,2})[.\s-]*[Ee](\d{1,2})|(\d{1,2})[xX](\d{1,2})/);
      if (m) {
        const s = parseInt(m[1] ?? m[3] ?? '1', 10);
        const e = parseInt(m[2] ?? m[4] ?? '1', 10);
        if (!Number.isNaN(s) && !Number.isNaN(e)) parsed.push({ season: s, episode: e, index: i, name });
      }
    }
    if (parsed.length === 0) return null;
    const bySeason = new Map<number, { episode: number; index: number; name: string }[]>();
    for (const p of parsed) {
      const list = bySeason.get(p.season) ?? [];
      list.push({ episode: p.episode, index: p.index, name: p.name });
      bySeason.set(p.season, list);
    }
    for (const list of bySeason.values()) list.sort((a, b) => a.episode - b.episode);
    const seasons = Array.from(bySeason.keys()).sort((a, b) => a - b);
    return { bySeason, seasons };
  }, [isPackSelected, packPreviewFiles]);
  /** Afficher la dÃ©composition par saison/Ã©pisode soit depuis les fichiers du torrent (aprÃ¨s ajout), soit depuis la preview (avant ajout) */
  const displayedPackEpisodes = packEpisodesBySeason ?? packEpisodesBySeasonFromPreview;
  const [selectedPackSeason, setSelectedPackSeason] = useState<number | null>(null);
  useEffect(() => {
    if (displayedPackEpisodes?.seasons?.length && selectedPackSeason === null) {
      setSelectedPackSeason(displayedPackEpisodes.seasons[0] ?? null);
    }
    if (!displayedPackEpisodes) setSelectedPackSeason(null);
  }, [displayedPackEpisodes, selectedPackSeason]);
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

  const pendingNextEpisodeRef = useRef(false);
  /** Pendant la transition vers l'Ã©pisode suivant, on garde l'Ã©pisode en cours affichÃ© pour ne pas dÃ©monter le lecteur (Ã©vite que video.play() soit bloquÃ© par l'autoplay). */
  const [isTransitioningToNext, setIsTransitioningToNext] = useState(false);
  const previousActiveTorrentRef = useRef<typeof activeTorrent | null>(null);
  const previousSelectedFileRef = useRef<typeof selectedFile>(null);
  const onPlayNextEpisode = () => {
    const next = getNextEpisode(seriesEpisodes ?? undefined, selectedSeasonNum, selectedEpisodeVariantId);
    if (!next) return;
    previousActiveTorrentRef.current = activeTorrent;
    previousSelectedFileRef.current = selectedFile;
    pendingNextEpisodeRef.current = true;
    setIsTransitioningToNext(true);
    setSelectedSeasonNum(next.seasonNum);
    setSelectedEpisodeVariantId(next.episodeVariantId);
  };
  // Quand on a demandÃ© l'Ã©pisode suivant, loadVideoFiles (nouvel infoHash) vide puis remplit videoFiles.
  // useVideoFiles met dÃ©jÃ  Ã  jour selectedFile Ã  la fin de loadVideoFiles ; on ne fait que rÃ©initialiser le ref.
  useEffect(() => {
    if (pendingNextEpisodeRef.current && videoFiles.length > 0) {
      pendingNextEpisodeRef.current = false;
      setIsTransitioningToNext(false);
    }
  }, [videoFiles]);

  const nextEpisodeInfo = useMemo(
    () => getNextEpisode(seriesEpisodes ?? undefined, selectedSeasonNum, selectedEpisodeVariantId),
    [seriesEpisodes, selectedSeasonNum, selectedEpisodeVariantId]
  );

  /** Pendant la transition, on affiche encore l'Ã©pisode prÃ©cÃ©dent pour garder le lecteur montÃ© (mÃªme Ã©lÃ©ment vidÃ©o) et permettre play() aprÃ¨s changement de source. */
  const displayTorrent = isTransitioningToNext && previousActiveTorrentRef.current ? previousActiveTorrentRef.current : activeTorrent;
  const displayFile = isTransitioningToNext && previousSelectedFileRef.current ? previousSelectedFileRef.current : selectedFile;
  const displayInfoHash = displayTorrent?.infoHash;

  // VÃ©rifier si on peut afficher le lecteur vidÃ©o (ou pendant la transition pour ne pas dÃ©monter)
  const canShowVideoPlayer = isPlaying && hasValidInfoHash && (!!displayFile && (videoFiles.length > 0 || isTransitioningToNext));
  
  // Ref pour le wrapper vidÃ©o
  const videoWrapperRef = useRef<HTMLDivElement | null>(null);
  
  // Flag pour indiquer qu'on continue en arriÃ¨re-plan (pour Ã©viter que l'overlay se rÃ©affiche)
  const continueInBackgroundRef = useRef<boolean>(false);
  
  // Afficher l'overlay de progression UNIQUEMENT pour le streaming (bouton "Lire")
  // Pas pour le tÃ©lÃ©chargement (bouton "TÃ©lÃ©charger") - le statut sera affichÃ© sur la page dÃ©tail
  // L'overlay ne doit s'afficher que si on a cliquÃ© sur "Lire" ET que le torrent n'est pas encore prÃªt
  // Si playStatus === 'ready' et qu'on a des fichiers, ne jamais afficher l'overlay (lecteur doit s'afficher)
  const shouldShowOverlay = !canShowVideoPlayer && 
                            playStatus !== 'idle' && 
                            playStatus !== 'error' && 
                            playStatus !== 'ready' && // 'ready' = on peut lancer la lecture, afficher le lecteur
                            !continueInBackgroundRef.current &&
                            isPlaying; // L'overlay ne s'affiche que si on est en mode streaming (isPlaying = true)

  if (shouldShowOverlay) {
    return (
      <EnhancedProgressOverlay
        playStatus={playStatus}
        torrentStats={torrentStats}
        progressMessage={progressMessage}
        errorMessage={errorMessage}
        imageUrl={imageUrl}
        showDebug={showDebug}
        debugLogs={debugLogs}
        onCancel={async () => {
          const activeInfoHash = (selectedTorrent || torrent).infoHash;
          
          // RÃ©initialiser le flag de continuation en arriÃ¨re-plan
          continueInBackgroundRef.current = false;
          
          if (activeInfoHash && torrentStats) {
            const shouldDelete = confirm('Voulez-vous annuler et supprimer le tÃ©lÃ©chargement ?');
            
            if (shouldDelete) {
              const { isLocalMedia } = await import('./actions/delete');
              if (!isLocalMedia(activeInfoHash)) {
                try {
                  const { clientApi } = await import('../../../lib/client/api');
                  addDebugLog('info', 'ðŸ—‘ï¸ Suppression du torrent en cours...', { infoHash: activeInfoHash });
                  await clientApi.removeTorrent(activeInfoHash, false);
                  addDebugLog('success', 'âœ… Torrent supprimÃ©');
                  addNotification('success', 'TÃ©lÃ©chargement annulÃ© et supprimÃ©');
                } catch (err) {
                  addDebugLog('error', 'âŒ Erreur lors de la suppression du torrent', { error: err });
                  addNotification('error', 'Erreur lors de la suppression du torrent');
                }
              }
            }
          }
          
          stopProgressPolling();
          setPlayStatus('idle');
          setProgressMessage('');
          setTorrentStats(null);
          setErrorMessage(null);
          addDebugLog('info', '=== Annulation ===');
        }}
        onContinueInBackground={() => {
          // Fermer l'overlay mais continuer le tÃ©lÃ©chargement en arriÃ¨re-plan
          // Ne pas arrÃªter le polling, juste masquer l'overlay
          continueInBackgroundRef.current = true;
          // Ne pas appeler stopProgressPolling() - on veut continuer Ã  suivre la progression
          // Le polling continue en arriÃ¨re-plan pour suivre la progression
          setPlayStatus('idle'); // Masquer l'overlay
          // Garder torrentStats pour qu'on puisse voir la progression si on revient
          // Ne pas rÃ©initialiser torrentStats pour garder les stats actuelles
          setProgressMessage('');
          setErrorMessage(null);
          addDebugLog('info', 'ðŸ“± TÃ©lÃ©chargement continuÃ© en arriÃ¨re-plan', { 
            hasPolling: !!progressPollIntervalRef.current,
            torrentStats: torrentStats ? { progress: torrentStats.progress, state: torrentStats.state } : null
          });
          addNotification('info', 'Le tÃ©lÃ©chargement continue en arriÃ¨re-plan');
        }}
        onRetry={() => {
          // RÃ©initialiser le flag de continuation en arriÃ¨re-plan quand on rÃ©essaie
          continueInBackgroundRef.current = false;
          setPlayStatus('idle');
          setErrorMessage(null);
          setProgressMessage('');
          handlePlay();
        }}
        onToggleDebug={() => setShowDebug(!showDebug)}
        onCopyLogs={async () => {
          try {
            const logsText = debugLogs.map(log => {
              const dataStr = log.data ? `\n  Data: ${JSON.stringify(log.data, null, 2)}` : '';
              return `[${log.time}] [${log.type.toUpperCase()}] ${log.message}${dataStr}`;
            }).join('\n\n');
            await navigator.clipboard.writeText(logsText);
            addDebugLog('success', 'âœ… Logs copiÃ©s dans le presse-papiers');
          } catch (err) {
            const textarea = document.createElement('textarea');
            const logsText = debugLogs.map(log => {
              const dataStr = log.data ? `\n  Data: ${JSON.stringify(log.data, null, 2)}` : '';
              return `[${log.time}] [${log.type.toUpperCase()}] ${log.message}${dataStr}`;
            }).join('\n\n');
            textarea.value = logsText;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            addDebugLog('success', 'âœ… Logs copiÃ©s dans le presse-papiers (fallback)');
          }
        }}
        onClearLogs={() => {
          clearDebugLogs();
          addDebugLog('info', '=== Logs effacÃ©s ===');
        }}
      />
    );
  }

  // Si on peut afficher le lecteur vidÃ©o, l'afficher (display* = Ã©pisode en cours ou prÃ©cÃ©dent pendant la transition)
  if (canShowVideoPlayer && !shouldShowOverlay && displayInfoHash) {
    return (
      <VideoPlayerWrapper
        key={`player-${displayInfoHash}-${displayFile?.path ?? displayFile?.name ?? ''}`}
        infoHash={displayInfoHash}
        selectedFile={displayFile!}
        torrentName={displayTorrent.mainTitle || displayTorrent.cleanTitle || displayTorrent.name}
        torrentId={displayTorrent.id}
        tmdbId={displayTorrent.tmdbId}
        tmdbType={displayTorrent.tmdbType}
        startFromBeginning={isTransitioningToNext ? false : startFromBeginning}
        isSeries={!!(seriesEpisodes?.seasons?.length)}
        nextEpisodeInfo={nextEpisodeInfo}
        onPlayNextEpisode={onPlayNextEpisode}
        onClose={handleClosePlayerAndRefresh}
        visible={true}
        wrapperRef={(el) => { videoWrapperRef.current = el; }}
        quality={displayTorrent.quality}
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
      />
    );
  }

  // Page principale
  return (
    <>
      {/* Ne rendre VideoPlayerWrapper QUE si on est en mode streaming (isPlaying = true) */}
      {/* Pendant le tÃ©lÃ©chargement (isPlaying = false), ne pas rendre le composant pour Ã©viter de dÃ©clencher le lecteur HLS */}
      {displayInfoHash && !shouldShowOverlay && isPlaying && canShowVideoPlayer && (
        <VideoPlayerWrapper
          key={`player-${displayInfoHash}-${displayFile?.path ?? displayFile?.name ?? ''}`}
          infoHash={displayInfoHash}
          selectedFile={displayFile!}
          torrentName={displayTorrent.mainTitle || displayTorrent.cleanTitle || displayTorrent.name}
          torrentId={displayTorrent.id}
          tmdbId={displayTorrent.tmdbId}
          tmdbType={displayTorrent.tmdbType}
          startFromBeginning={isTransitioningToNext ? false : startFromBeginning}
          isSeries={!!(seriesEpisodes?.seasons?.length)}
          nextEpisodeInfo={nextEpisodeInfo}
          onPlayNextEpisode={onPlayNextEpisode}
          onClose={handleClosePlayerAndRefresh}
          visible={true}
          wrapperRef={(el) => { videoWrapperRef.current = el; }}
          quality={displayTorrent.quality}
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
        />
      )}
    <div className="relative bg-page text-white">
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
                className="absolute inset-0 z-[5] cursor-pointer"
                onClick={() => setTrailerUiVisible(true)}
                onKeyDown={(e) => { e.key === 'Enter' && setTrailerUiVisible(true); }}
                role="button"
                tabIndex={0}
                aria-label="Afficher les informations"
              />
            )}
          </>
        ) : (heroImageUrl || imageUrl) ? (
          <>
            <div
              className="absolute inset-0 bg-cover bg-center bg-no-repeat pointer-events-none"
              style={{
                backgroundImage: `url(${getHighQualityTmdbImageUrl(heroImageUrl || imageUrl) || heroImageUrl || imageUrl})`,
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

      {/* Contenu principal (data-tv-back-handler : premiÃ¨re touche Retour = focus sur Retour, deuxiÃ¨me = navigation). MasquÃ© en mode immersif bande-annonce. */}
      <div
        className={`relative z-10 transition-opacity duration-300 ${isPlayingTrailer && !trailerUiVisible ? 'opacity-0 pointer-events-none' : ''}`}
        ref={tvBackHandlerRef}
        data-tv-back-handler
        aria-hidden={isPlayingTrailer && !trailerUiVisible}
      >
        <div className="relative w-full min-h-[60vh] sm:min-h-[70vh] flex flex-col justify-end px-3 sm:px-4 md:px-6 lg:px-16 pb-8 sm:pb-12 md:pb-16 pt-20 sm:pt-24 md:pt-32">
          {/* Bouton Bande-annonce (haut droite) — visible uniquement quand la bande-annonce ne joue pas */}
          {trailerKey && !isPlayingTrailer && (
            <button
              type="button"
              onClick={() => setIsPlayingTrailer(true)}
              disabled={isLoadingTrailer}
              title={t('ads.trailerPlay')}
              aria-label={t('ads.trailerPlay')}
              data-focusable
              tabIndex={0}
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

          <div className="max-w-4xl">
            <div className="mb-4 sm:mb-6">
              {torrent.logoUrl && (
                <img
                  src={torrent.logoUrl}
                  alt=""
                  className="max-h-14 sm:max-h-16 md:max-h-20 lg:max-h-24 xl:max-h-28 w-auto object-contain object-left mb-3 sm:mb-4 drop-shadow-2xl"
                  style={{ maxWidth: 'min(24rem, 85vw)' }}
                />
              )}
              <div className="flex items-baseline gap-4 flex-wrap">
                <h1 className={`font-bold leading-tight ${
                  torrent.logoUrl
                    ? 'text-lg sm:text-xl md:text-2xl lg:text-3xl text-white/90'
                    : 'text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl text-white'
                }`}>
                  {torrent.mainTitle || torrent.cleanTitle || torrent.name}
                </h1>
                {torrent.releaseDate && (
                  <span className="text-white/50 font-normal text-xl sm:text-2xl md:text-3xl lg:text-4xl tabular-nums">
                    {new Date(torrent.releaseDate).getFullYear()}
                  </span>
                )}
              </div>
              {/* Badges de qualitÃ© sous le titre avec logos officiels */}
              {torrent.quality && (
                <div className="mt-3 sm:mt-4">
                  <QualityBadges quality={torrent.quality} />
                </div>
              )}
            </div>

            {/* SÃ©ries : section Ã‰pisodes type streaming (saisons + liste dâ€™Ã©pisodes) */}
            {seriesEpisodes?.seasons?.length ? (
              <div className="mb-6 space-y-6">
                <SeriesEpisodesSection
                  seriesEpisodes={seriesEpisodes}
                  selectedSeasonNum={selectedSeasonNum}
                  selectedEpisodeVariantId={selectedEpisodeVariantId}
                  onSelectSeason={(num) => {
                    setSelectedSeasonNum(num);
                    const s = seriesEpisodes.seasons.find((se) => se.season === num);
                    if (s?.episodes?.[0]) setSelectedEpisodeVariantId(s.episodes[0].id);
                  }}
                  onSelectEpisode={setSelectedEpisodeVariantId}
                  savedPlaybackPosition={savedPlaybackPosition}
                  episodesInLibraryCount={isLocalTorrent && allVariants.length > 0 ? allVariants.length : undefined}
                />
                {/* Pack complet sÃ©lectionnÃ© : hint, chargement, puis liste des fichiers par SxxExx */}
                {isPackSelected && videoFiles.length <= 1 && !hasInfoHash && !loadingPackPreview && !(packPreviewFiles && packPreviewFiles.length > 1) && (
                  <p className="text-xs text-white/60">
                    {t('mediaDetail.packAddTorrentHint')}
                  </p>
                )}
                {isPackSelected && loadingPackPreview && (
                  <p className="text-xs text-white/60">{t('common.loading') || 'Chargement...'}</p>
                )}
                {isPackSelected && (videoFiles.length > 1 || (packPreviewFiles && packPreviewFiles.length > 1)) && (
                  <div>
                    <span className="text-sm font-semibold text-white/80 block mb-2">
                      {displayedPackEpisodes
                        ? t('mediaDetail.packEpisodesByFile')
                        : t('mediaDetail.packFilesList')}
                    </span>
                    {displayedPackEpisodes ? (
                      <div className="space-y-3">
                        <div>
                          <span className="text-xs font-medium text-white/60 block mb-1">{t('mediaDetail.season')}</span>
                          <div className="flex flex-wrap gap-2">
                            {displayedPackEpisodes.seasons.map((s) => (
                              <button
                                key={s}
                                type="button"
                                onClick={() => setSelectedPackSeason(s)}
                                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-black ${
                                  selectedPackSeason === s
                                    ? 'bg-primary-600 text-white'
                                    : 'bg-white/10 text-white/90 hover:bg-white/20'
                                }`}
                              >
                                {t('mediaDetail.seasonNumber', { number: s })}
                              </button>
                            ))}
                          </div>
                        </div>
                        {selectedPackSeason != null && displayedPackEpisodes.bySeason.get(selectedPackSeason) && (
                          <div>
                            <span className="text-xs font-medium text-white/60 block mb-1">{t('mediaDetail.episodes')}</span>
                            <div className="flex flex-wrap gap-2">
                              {packEpisodesBySeason
                                ? packEpisodesBySeason.bySeason.get(selectedPackSeason)!.map(({ episode, file }) => {
                                    const isSelected = selectedFile?.path === file.path;
                                    return (
                                      <button
                                        key={file.path}
                                        type="button"
                                        onClick={() => setSelectedFile(file)}
                                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-black ${
                                          isSelected ? 'bg-primary-600 text-white' : 'bg-white/10 text-white/90 hover:bg-white/20'
                                        }`}
                                        title={file.name || file.path}
                                      >
                                        {t('mediaDetail.episodeNumber', { number: episode })}
                                      </button>
                                    );
                                  })
                                : packEpisodesBySeasonFromPreview!.bySeason.get(selectedPackSeason)!.map(({ episode, index, name }) => {
                                    const isSelected = selectedPackEpisodePreviewIndex === index;
                                    return (
                                      <button
                                        key={`${selectedPackSeason}-${episode}-${index}`}
                                        type="button"
                                        onClick={() => setSelectedPackEpisodePreviewIndex(index)}
                                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-black ${
                                          isSelected ? 'bg-primary-600 text-white' : 'bg-white/10 text-white/90 hover:bg-white/20'
                                        }`}
                                        title={name}
                                      >
                                        {t('mediaDetail.episodeNumber', { number: episode })}
                                      </button>
                                    );
                                  })}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {(packPreviewFiles || videoFiles).map((fileOrPreview, idx) => {
                          const file = 'path' in fileOrPreview ? fileOrPreview : null;
                          const preview = file ? null : fileOrPreview as TorrentListFileEntry;
                          const name = file ? (file.name || file.path || '') : (preview?.name || '');
                          const label = (() => {
                            const s01e01 = /[Ss](\d{1,2})[Ee](\d{1,2})/.exec(name);
                            if (s01e01) return t('mediaDetail.episodeNumber', { number: parseInt(s01e01[2], 10) });
                            return `${idx + 1}`;
                          })();
                          const isSelected = file && selectedFile?.path === file.path;
                          return file ? (
                            <button
                              key={file.path}
                              type="button"
                              onClick={() => setSelectedFile(file)}
                              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-black ${
                                isSelected ? 'bg-primary-600 text-white' : 'bg-white/10 text-white/90 hover:bg-white/20'
                              }`}
                              title={name}
                            >
                              {label}
                            </button>
                          ) : (
                            <span key={idx} className="px-3 py-2 rounded-lg text-sm font-medium bg-white/10 text-white/90" title={name}>
                              {label}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : null}

            {/* Boutons d'action : icône Retour + actions principales */}
            <div className="flex items-start gap-3 tv:gap-4">
              {/* Bouton Retour — icône ronde alignée avec le premier bouton */}
              <a
                ref={backLinkRef}
                href={backHref ?? '/dashboard'}
                onClick={(e) => {
                  if (typeof window !== 'undefined' && window.history.length > 1) {
                    e.preventDefault();
                    window.history.back();
                  }
                }}
                className={`gtv-icon-btn ds-focus-glow ds-active-glow flex-shrink-0 ${isTV ? 'tv:w-16 tv:h-16' : ''}`}
                data-focusable
                data-media-detail-back
                tabIndex={0}
                aria-label="Retour"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className={isTV ? 'h-6 w-6 tv:h-8 tv:w-8' : 'h-5 w-5'} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </a>
              <div className="flex-1 min-w-0">
            <MediaDetailActionButtons
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
                if (savedPlaybackPosition && savedPlaybackPosition > 0) setStartFromBeginning(false);
                else setStartFromBeginning(true);
                const el = videoWrapperRef.current || (document.getElementById('video-player-wrapper') as HTMLDivElement);
                if (el && !document.fullscreenElement) {
                  try { await el.requestFullscreen(); } catch (_) {}
                }
                continueInBackgroundRef.current = false;
                handlePlay();
              }}
              onPlayFromBeginning={async () => {
                setStartFromBeginning(true);
                const el = videoWrapperRef.current || (document.getElementById('video-player-wrapper') as HTMLDivElement);
                if (el && !document.fullscreenElement) {
                  try { await el.requestFullscreen(); } catch (_) {}
                }
                continueInBackgroundRef.current = false;
                handlePlay();
              }}
              onPlayAuto={async (bestTorrent) => {
                setSelectedTorrent(bestTorrent);
                setStartFromBeginning(true);
                continueInBackgroundRef.current = false;
                const el = videoWrapperRef.current || (document.getElementById('video-player-wrapper') as HTMLDivElement);
                if (el && !document.fullscreenElement) {
                  try { await el.requestFullscreen(); } catch (_) {}
                }
                setTimeout(() => handlePlay(), 150);
              }}
            />
              </div>
            </div>

            {/* Informations détaillées */}
            {showInfo && (
              <TorrentInfo
                torrent={selectedTorrent || torrent}
                seedCount={currentSeedCount}
                leechCount={currentLeechCount}
                fileSize={currentFileSize}
                showSeederWarning={!shouldShowPlayButton}
                sources={allVariants && allVariants.length > 1 ? allVariants.map((variant) => ({
                  tracker: variant.indexerName || variant.uploader || 'Tracker',
                  seeds: variant.seedCount || 0,
                  peers: variant.leechCount || 0,
                  quality: variant.quality?.resolution as 'Remux' | '4K' | '1080p' | '720p' | '480p' | undefined,
                  codec: variant.codec as 'x264' | 'x265' | 'AV1' | undefined,
                  fileSize: variant.fileSize,
                })) : undefined}
                allVariants={allVariants}
                selectedVariantId={(selectedTorrent || torrent).id}
                onSelectVariant={(variant) => {
                  setSelectedTorrent(variant);
                }}
              />
            )}
          </div>
        </div>
      </div>

      {/* Modal de sÃ©lection de source (plusieurs sources disponibles) â€” adaptÃ©e TV */}
      {showSourceModal && allVariants.length > 1 && (
        <SourceSelectModal
          variants={allVariants}
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