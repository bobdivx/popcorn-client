import { useState, useEffect, useRef, useMemo, useCallback } from 'preact/hooks';
import { Film } from 'lucide-preact';
import { useI18n } from '../../../lib/i18n/useI18n';
import { NotificationContainer } from '../../ui/Notification';
import type { MediaDetailPageProps } from './types';
import { useTorrentPlayer } from './hooks/useTorrentPlayer';
import { useVideoFiles } from './hooks/useVideoFiles';
import { useDebug } from './hooks/useDebug';
import { useNotifications } from './hooks/useNotifications';
import { ProgressOverlay } from './components/ProgressOverlay';
import { EnhancedProgressOverlay } from './components/EnhancedProgressOverlay';
import { VideoPlayerWrapper } from './components/VideoPlayerWrapper';
import { MediaDetailActionButtons } from './components/MediaDetailActionButtons';
import { TorrentInfo } from './components/TorrentInfo';
import { QualityBadges } from './components/QualityBadges';
import { YouTubeVideoPlayer as VideoPlayer } from '../../ui/YouTubeVideoPlayer';
import { getPlaybackPosition, getPlaybackPositionByMedia } from '../../../lib/streaming/torrent-storage';
import { getOrCreateDeviceId } from '../../../lib/utils/device-id';
import { getDownloadClientStats } from '../../../lib/utils/download-meta-storage';
import { serverApi } from '../../../lib/client/server-api';
import { TokenManager } from '../../../lib/client/storage';
import { useSubscriptionMe } from './hooks/useSubscriptionMe';
import { PROGRESS_POLL_INTERVAL_MS } from './utils/constants';
import { startProgressPolling } from './actions/progressPolling';
import { DownloadVerificationPanel } from '../../downloads/DownloadVerificationPanel';
import type { SeriesEpisodesResponse } from '../../../lib/client/server-api/media';
import { isTVPlatform } from '../../../lib/utils/device-detection';
import { getHighQualityTmdbImageUrl } from '../../../lib/utils/tmdb-images';

/** Retourne l'épisode suivant (saison + id variante + titre) ou null. */
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

// Modal de sélection de source (TV-friendly) quand plusieurs sources sont disponibles
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
  // États de base
  const [isPlaying, setIsPlaying] = useState(false);
  const [showInfo, setShowInfo] = useState(true);
  const [imageUrl, setImageUrl] = useState<string | null>(torrent.imageUrl || null);
  const [heroImageUrl, setHeroImageUrl] = useState<string | null>(torrent.heroImageUrl || null);
  const isCompletedFromProps = torrent.clientState === 'completed' || 
                                torrent.clientState === 'seeding' || 
                                (torrent.clientProgress !== undefined && torrent.clientProgress >= 0.95);
  // Détecter si c'est un média local (slug ou id commence par "local_")
  const isLocalMedia = torrent.id?.startsWith('local_') || torrent.slug?.startsWith('local_') || torrent.infoHash?.startsWith('local_');
  // Pour les médias locaux, ils sont toujours disponibles localement
  const [isAvailableLocally, setIsAvailableLocally] = useState(isCompletedFromProps || isLocalMedia);
  const [downloadingToClient, setDownloadingToClient] = useState(false);
  const [magnetCopied, setMagnetCopied] = useState(false);
  const [trailerKey, setTrailerKey] = useState<string | null>(torrent.trailerKey || null);
  const [isLoadingTrailer, setIsLoadingTrailer] = useState(false);
  const [isPlayingTrailer, setIsPlayingTrailer] = useState(false);
  const trailerCloseButtonRef = useRef<HTMLButtonElement>(null);
  const hasAutoPlayedTrailerRef = useRef(false);
  const [verificationInfoHash, setVerificationInfoHash] = useState<string | null>(null);
  const [verificationTorrentName, setVerificationTorrentName] = useState<string | null>(null);
  const [showVerificationPanel, setShowVerificationPanel] = useState(false);
  const [showSourceModal, setShowSourceModal] = useState(false);
  const sourceModalFirstButtonRef = useRef<HTMLButtonElement>(null);
  const mediaDetailActionsRef = useRef<{ handleDownload: (variant?: MediaDetailPageProps['torrent']) => void } | null>(null);
  const backLinkRef = useRef<HTMLAnchorElement>(null);
  const tvBackHandlerRef = useRef<HTMLDivElement>(null);
  /** Compteur d'échecs consécutifs de getTorrent (hors 404) pour invalider torrentStats si backend injoignable. */
  const getTorrentFailCountRef = useRef<number>(0);
  /** Dernière valeur connue de torrentStats (pour ne pas écraser un état complété par une réponse API invalide type unknown/0). */
  const lastTorrentStatsRef = useRef<{ state?: string; progress?: number } | null>(null);

  // États pour les seeders/leechers
  const [currentSeedCount, setCurrentSeedCount] = useState<number>(torrent.seedCount);
  const [currentLeechCount, setCurrentLeechCount] = useState<number>(torrent.leechCount);
  const [currentFileSize, setCurrentFileSize] = useState<number>(torrent.fileSize);

  // États pour les variantes (séries : sélection par saison/épisode)
  const [allVariants, setAllVariants] = useState<any[]>([torrent]);
  const [selectedTorrent, setSelectedTorrent] = useState<any>(torrent);
  /** Saison / épisode sélectionnés (pour séries) */
  const [selectedSeasonNum, setSelectedSeasonNum] = useState<number | null>(null);
  const [selectedEpisodeVariantId, setSelectedEpisodeVariantId] = useState<string | null>(null);

  // État pour la position de lecture sauvegardée
  const [savedPlaybackPosition, setSavedPlaybackPosition] = useState<number | null>(null);
  const [startFromBeginning, setStartFromBeginning] = useState(true);

  /** Chemin du fichier en bibliothèque (library ou findLocalMediaByTmdb), pour lecture sans torrent dans le client. */
  const [libraryDownloadPath, setLibraryDownloadPath] = useState<string | null>(null);

  // Torrent actif (sélectionné ou défaut) — utilisé pour lecture / téléchargement
  const activeTorrent = selectedTorrent || torrent;
  // Torrent avec chemin bibliothèque si connu (permet à useVideoFiles de lire depuis le disque sans getTorrent)
  const activeTorrentWithLibraryPath = useMemo(
    () =>
      libraryDownloadPath
        ? { ...activeTorrent, downloadPath: libraryDownloadPath }
        : activeTorrent,
    [activeTorrent, libraryDownloadPath]
  );

  // Constantes dérivées (basées sur le torrent actif pour lecture/téléchargement)
  const isExternal = activeTorrent.id.startsWith('external_');
  const hasInfoHash = typeof activeTorrent.infoHash === 'string' && activeTorrent.infoHash.trim().length > 0;
  const hasMagnetLink = typeof activeTorrent._externalMagnetUri === 'string' && activeTorrent._externalMagnetUri.trim().length > 0;
  const canStream = hasInfoHash || (isExternal && (!!activeTorrent._externalLink || hasMagnetLink));
  const isLocalTorrent =
    activeTorrent.id?.startsWith('local_') ||
    activeTorrent.slug?.startsWith('local_') ||
    activeTorrent.infoHash?.startsWith('local_') ||
    !!(activeTorrent as any).downloadPath;

  // Initialiser les variantes depuis le groupe (séries)
  useEffect(() => {
    if (initialVariants && initialVariants.length > 0) {
      setAllVariants(initialVariants);
    }
  }, [initialVariants]);

  // Hooks personnalisés
  const { videoFiles, selectedFile, setVideoFiles, setSelectedFile, loadVideoFiles } = useVideoFiles({
    torrentName: activeTorrent.name,
    torrent: activeTorrentWithLibraryPath,
    onError: (error) => {
      console.error('Erreur lors du chargement des fichiers vidéo:', error);
    },
  });
  const { notifications, addNotification, removeNotification } = useNotifications();
  const { debugLogs, showDebug, setShowDebug, addDebugLog, clearDebugLogs } = useDebug();
  const { streamingTorrentActive } = useSubscriptionMe();

  // Hook useTorrentPlayer (utilise le torrent actif = sélection saison/épisode)
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
    torrent: activeTorrent,
    initialTorrentStats: initialTorrentStats ?? null,
    isExternal,
    hasInfoHash,
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

  const isDownloadComplete = !!torrentStats && (
    torrentStats.state === 'completed' ||
    torrentStats.state === 'seeding' ||
    (torrentStats.progress ?? 0) >= 0.99
  );
  const shouldShowPlayButton = isLocalTorrent || (isAvailableLocally && hasInfoHash) || isDownloadComplete;

  // Garder une ref à jour avec torrentStats pour éviter d'écraser un état complété par une réponse API invalide (unknown/0)
  useEffect(() => {
    lastTorrentStatsRef.current = torrentStats
      ? { state: torrentStats.state, progress: torrentStats.progress }
      : null;
  }, [torrentStats]);

  // Quand on arrive depuis la page Téléchargements avec des stats (complété), précharger les fichiers vidéo pour que « Lire » soit utilisable
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

  // Séries depuis la bibliothèque : le torrent actif (épisode sélectionné) peut être différent du torrent principal.
  // Synchroniser les stats depuis le stockage pour l'info_hash de l'épisode actif afin d'afficher « Lire » si cet épisode est déjà téléchargé.
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

  // Vérifier la position de lecture sauvegardée (torrent actif) : priorité par média (tmdb) si dispo, sinon par torrent
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
        console.debug('Erreur lors de la vérification de la position de lecture:', err);
        setSavedPlaybackPosition(null);
      }
    };
    checkSavedPosition();
  }, [activeTorrent.id, activeTorrent.tmdbId, activeTorrent.tmdbType]);

  // Vérifier si le torrent est disponible localement (torrent actif)
  // Note: isAvailableLocally n'est mis à true que lorsque des fichiers sont confirmés (loadVideoFiles ou files_available).
  // Note: Les erreurs 404 dans la console sont normales si le torrent n'est pas encore téléchargé
  // On utilise d'abord listTorrents() (même source que la page /downloads) pour avoir les stats de téléchargement sur la page détail (slug).
  useEffect(() => {
    if (hasInfoHash && activeTorrent.infoHash) {
      const checkAvailability = async () => {
        try {
          const { clientApi } = await import('../../../lib/client/api');
          const ih = activeTorrent.infoHash!.toLowerCase();
          let fromList: import('../../../lib/client/types').ClientTorrentStats | undefined;
          // Même source que la page /downloads : récupérer les stats depuis la liste des torrents
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
            }
          } catch (_) {
            // listTorrents en échec (ex. client non dispo)
          }
          // Ne pas appeler getTorrent quand le torrent n'est pas dans la liste : évite le 404 en console.
          // On s'appuie sur la library et findLocalMediaByTmdb pour afficher "Lire" si le fichier est sur disque.
          // 1) Vérifier la library (info_hash ou tmdb_id) — fichier sur disque même si torrent supprimé du client
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
                  // Ne pas écraser si le torrent a déjà un chemin ; ne pas utiliser un chemin qui est un dossier (streaming a besoin du fichier)
                  const pathIsFile = item.download_path && /\.(mkv|mp4|avi|webm|mov|m4v|wmv|ts|m2ts)$/i.test(item.download_path.replace(/\\/g, '/'));
                  if (item.download_path && !hasExistingPath && pathIsFile) {
                    setLibraryDownloadPath(item.download_path);
                  }
                  setTorrentStats((prev) =>
                    prev ?? {
                      info_hash: activeTorrent.infoHash!,
                      name: item.name || activeTorrent.name || '',
                      state: 'completed',
                      downloaded_bytes: item.file_size ?? 0,
                      uploaded_bytes: 0,
                      total_bytes: item.file_size ?? 0,
                      progress: 1,
                      download_speed: 0,
                      upload_speed: 0,
                      peers_connected: 0,
                      peers_total: 0,
                      seeders: 0,
                      leechers: 0,
                      eta_seconds: null,
                      download_started: true,
                    }
                  );
                  addDebugLog('success', '📚 Média trouvé dans la bibliothèque (library)', {
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
          // 2) Vérifier par TMDB ID (local-media by tmdb) si pas déjà disponible
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
                // Ne pas écraser le chemin si le torrent en a déjà un ; ne pas utiliser un chemin qui est un dossier
                const firstPathIsFile = firstPath && /\.(mkv|mp4|avi|webm|mov|m4v|wmv|ts|m2ts)$/i.test(firstPath.replace(/\\/g, '/'));
                if (!hasExistingPathTmdb && firstPathIsFile) {
                  setLibraryDownloadPath(firstPath);
                }
                setTorrentStats((prev) =>
                  prev ?? {
                    info_hash: activeTorrent.infoHash!,
                    name: activeTorrent.name || '',
                    state: 'completed',
                    downloaded_bytes: 0,
                    uploaded_bytes: 0,
                    total_bytes: 0,
                    progress: 1,
                    download_speed: 0,
                    upload_speed: 0,
                    peers_connected: 0,
                    peers_total: 0,
                    seeders: 0,
                    leechers: 0,
                    eta_seconds: null,
                    download_started: true,
                  }
                );
                if (localMedia.length === 1) {
                  addDebugLog('success', `📚 Média local trouvé (TMDB ID: ${activeTorrent.tmdbId})`, {
                    file: localMedia[0].file_name,
                    quality: localMedia[0].quality || 'N/A',
                    resolution: localMedia[0].resolution || 'N/A',
                  });
                } else {
                  addDebugLog('success', `📚 ${localMedia.length} version(s) locale(s) trouvée(s) (TMDB ID: ${activeTorrent.tmdbId})`, {
                    versions: localMedia.map(m => ({
                      file: m.file_name,
                      quality: m.quality || 'N/A',
                      resolution: m.resolution || 'N/A',
                    })),
                  });
                }
              }
            } catch (_) {
              // findLocalMediaByTmdb en échec : on a déjà tenté la library au-dessus
            }
          }
          // Ne pas logger si stats est null (torrent non téléchargé, c'est normal)
        } catch (err) {
          // Ignorer silencieusement les erreurs 404 (torrent non téléchargé)
          if (err instanceof Error && (err.message.includes('404') || err.message.includes('Not Found'))) {
            return;
          }
          getTorrentFailCountRef.current += 1;
          // Ne pas effacer torrentStats si un polling de progression est actif (téléchargement en cours)
          // sinon la barre de progression disparaît brièvement puis réapparaît
          if (getTorrentFailCountRef.current >= 2 && !progressPollIntervalRef?.current) {
            setTorrentStats(null);
            getTorrentFailCountRef.current = 0;
          }
        }
      };

      checkAvailability();
    }
  }, [hasInfoHash, activeTorrent.infoHash, activeTorrent.tmdbId, activeTorrent.tmdbType, activeTorrent.clientState, activeTorrent.clientProgress, isExternal]);

  // Vérifier si un téléchargement est en cours au montage (torrent actif)
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
            }
          } catch (err) {
            // Ignorer les erreurs
          }
          return;
        }
      }

      // Toujours rafraîchir les stats depuis listTorrents quand on n'est pas en lecture,
      // y compris pendant "adding" / "downloading", pour que la progression s'affiche sans recharger la page.
      if (hasInfoHash && activeTorrent.infoHash && !isPlaying) {
        try {
          const { clientApi } = await import('../../../lib/client/api');
          const ih = activeTorrent.infoHash.toLowerCase();
          // Même source que /downloads : rafraîchir les stats depuis la liste (polling)
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
                  if (videos.length > 0) setIsAvailableLocally(true);
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
              return; // stats à jour depuis listTorrents, pas besoin d'appeler getTorrent
            }
          } catch (_) {}
          // Ne pas appeler getTorrent quand le torrent n'est pas dans la liste : évite le 404 en console.
          // listTorrents est la seule source (même que /downloads) ; si pas trouvé, rien à afficher.
        } catch (err) {
          // Ignorer silencieusement les erreurs 404 (torrent non téléchargé)
          if (err instanceof Error && (err.message.includes('404') || err.message.includes('Not Found'))) {
            return;
          }
          getTorrentFailCountRef.current += 1;
          // Ne pas effacer torrentStats si un polling de progression est actif (téléchargement en cours)
          if (getTorrentFailCountRef.current >= 2 && !progressPollIntervalRef?.current) {
            setTorrentStats(null);
            getTorrentFailCountRef.current = 0;
          }
        }
      }
    };

    checkDownloadingTorrent();
    // Polling des stats : met à jour progression / état du téléchargement sans recharger la page
    const STATS_POLL_MS = 5_000;
    const iv = setInterval(checkDownloadingTorrent, STATS_POLL_MS);
    return () => clearInterval(iv);
  }, [hasInfoHash, activeTorrent.infoHash, activeTorrent.clientState, activeTorrent.clientProgress, isPlaying, playStatus]);

  // Afficher le panneau de vérification quand un téléchargement vient d'être ajouté (événement torrentAdded)
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

  // Focus par défaut sur Lire si affiché, sinon sur Télécharger (télécommande TV : webOS, Android TV, etc.)
  useEffect(() => {
    if (!isTVPlatform()) return;
    const t = setTimeout(() => {
      const playEl = document.querySelector('[data-media-detail-action="play"]') as HTMLButtonElement | null;
      const downloadEl = document.querySelector('[data-media-detail-action="download"]') as HTMLButtonElement | null;
      const el =
        playEl && !playEl.disabled
          ? playEl
          : downloadEl && !downloadEl.disabled
            ? downloadEl
            : null;
      if (el) el.focus();
    }, 150);
    return () => clearTimeout(t);
  }, [activeTorrent?.id, torrentStats, isAvailableLocally, isPlaying]);

  // Télécommande : première touche Retour met le focus sur le bouton Retour, deuxième touche navigue
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

  // Utiliser directement le trailerKey du torrent s'il est disponible (torrent principal pour la série)
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

  // Fermer la bande-annonce (héros) avec Escape ou touche Retour
  useEffect(() => {
    if (!isPlayingTrailer) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const inInput = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || (target?.isContentEditable ?? false);
      if (e.key === 'Backspace' && inInput) return;
      if (e.key === 'Escape' || e.key === 'Backspace' || e.key === 'BrowserBack' || e.key === 'GoBack') {
        e.preventDefault();
        e.stopPropagation();
        setIsPlayingTrailer(false);
      }
    };
    const handleWebOSBack = () => setIsPlayingTrailer(false);
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
  }, [isPlayingTrailer]);

  // Initialiser la sélection saison/épisode au premier chargement (première saison, premier épisode)
  useEffect(() => {
    if (seriesEpisodes?.seasons?.length && selectedSeasonNum === null) {
      const first = seriesEpisodes.seasons[0];
      if (first?.episodes?.length) {
        setSelectedSeasonNum(first.season);
        setSelectedEpisodeVariantId(first.episodes[0].id);
      }
    }
  }, [seriesEpisodes, selectedSeasonNum]);

  // Torrent actif : infoHash et validité (déclarés tôt pour les effets ci-dessous)
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

  // Synchroniser selectedTorrent (et libraryDownloadPath) quand l'utilisateur choisit un épisode (séries)
  useEffect(() => {
    if (!seriesEpisodes?.seasons?.length || selectedEpisodeVariantId == null) return;
    let variant = allVariants.find((v: any) => v.id === selectedEpisodeVariantId);
    // Fallback pour la bibliothèque : les variants ont id "local_xxx", pas l'id TMDB → matcher par SxxExx
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
      // Mettre à jour le chemin bibliothèque pour la lecture (séries depuis library)
      if (variant.downloadPath) {
        setLibraryDownloadPath(variant.downloadPath);
      }
    }
  }, [seriesEpisodes, selectedEpisodeVariantId, allVariants, parseSeasonEpisodeFromVariant]);

  // Pack complet (épisode 0) : charger la liste des fichiers du torrent pour lister les épisodes
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
  useEffect(() => {
    if (isPackSelected && hasValidInfoHash && activeTorrent.infoHash) {
      void loadVideoFiles(activeTorrent.infoHash);
    }
  }, [isPackSelected, activeTorrent.infoHash, hasValidInfoHash, torrentStats?.state]);

  // Série (un épisode = une variante) : charger les fichiers du variant actif quand on joue
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
  /** Pendant la transition vers l'épisode suivant, on garde l'épisode en cours affiché pour ne pas démonter le lecteur (évite que video.play() soit bloqué par l'autoplay). */
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
  // Quand on a demandé l'épisode suivant, loadVideoFiles (nouvel infoHash) vide puis remplit videoFiles.
  // useVideoFiles met déjà à jour selectedFile à la fin de loadVideoFiles ; on ne fait que réinitialiser le ref.
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

  /** Pendant la transition, on affiche encore l'épisode précédent pour garder le lecteur monté (même élément vidéo) et permettre play() après changement de source. */
  const displayTorrent = isTransitioningToNext && previousActiveTorrentRef.current ? previousActiveTorrentRef.current : activeTorrent;
  const displayFile = isTransitioningToNext && previousSelectedFileRef.current ? previousSelectedFileRef.current : selectedFile;
  const displayInfoHash = displayTorrent?.infoHash;

  // Vérifier si on peut afficher le lecteur vidéo (ou pendant la transition pour ne pas démonter)
  const canShowVideoPlayer = isPlaying && hasValidInfoHash && (!!displayFile && (videoFiles.length > 0 || isTransitioningToNext));
  
  // Ref pour le wrapper vidéo
  const videoWrapperRef = useRef<HTMLDivElement | null>(null);
  
  // Flag pour indiquer qu'on continue en arrière-plan (pour éviter que l'overlay se réaffiche)
  const continueInBackgroundRef = useRef<boolean>(false);
  
  // Afficher l'overlay de progression UNIQUEMENT pour le streaming (bouton "Lire")
  // Pas pour le téléchargement (bouton "Télécharger") - le statut sera affiché sur la page détail
  // L'overlay ne doit s'afficher que si on a cliqué sur "Lire" ET que le torrent n'est pas encore prêt
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
          
          // Réinitialiser le flag de continuation en arrière-plan
          continueInBackgroundRef.current = false;
          
          if (activeInfoHash && torrentStats) {
            const shouldDelete = confirm('Voulez-vous annuler et supprimer le téléchargement ?');
            
            if (shouldDelete) {
              const { isLocalMedia } = await import('./actions/delete');
              if (!isLocalMedia(activeInfoHash)) {
                try {
                  const { clientApi } = await import('../../../lib/client/api');
                  addDebugLog('info', '🗑️ Suppression du torrent en cours...', { infoHash: activeInfoHash });
                  await clientApi.removeTorrent(activeInfoHash, false);
                  addDebugLog('success', '✅ Torrent supprimé');
                  addNotification('success', 'Téléchargement annulé et supprimé');
                } catch (err) {
                  addDebugLog('error', '❌ Erreur lors de la suppression du torrent', { error: err });
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
          // Fermer l'overlay mais continuer le téléchargement en arrière-plan
          // Ne pas arrêter le polling, juste masquer l'overlay
          continueInBackgroundRef.current = true;
          // Ne pas appeler stopProgressPolling() - on veut continuer à suivre la progression
          // Le polling continue en arrière-plan pour suivre la progression
          setPlayStatus('idle'); // Masquer l'overlay
          // Garder torrentStats pour qu'on puisse voir la progression si on revient
          // Ne pas réinitialiser torrentStats pour garder les stats actuelles
          setProgressMessage('');
          setErrorMessage(null);
          addDebugLog('info', '📱 Téléchargement continué en arrière-plan', { 
            hasPolling: !!progressPollIntervalRef.current,
            torrentStats: torrentStats ? { progress: torrentStats.progress, state: torrentStats.state } : null
          });
          addNotification('info', 'Le téléchargement continue en arrière-plan');
        }}
        onRetry={() => {
          // Réinitialiser le flag de continuation en arrière-plan quand on réessaie
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
            addDebugLog('success', '✅ Logs copiés dans le presse-papiers');
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
            addDebugLog('success', '✅ Logs copiés dans le presse-papiers (fallback)');
          }
        }}
        onClearLogs={() => {
          clearDebugLogs();
          addDebugLog('info', '=== Logs effacés ===');
        }}
      />
    );
  }

  // Si on peut afficher le lecteur vidéo, l'afficher (display* = épisode en cours ou précédent pendant la transition)
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
        onClose={handleClosePlayer}
        visible={true}
        wrapperRef={(el) => { videoWrapperRef.current = el; }}
        quality={displayTorrent.quality}
        directStreamUrl={(displayTorrent as any)._demoStreamUrl ?? undefined}
        streamBackendUrl={streamBackendUrl ?? undefined}
        posterUrl={displayTorrent.imageUrl ?? null}
        logoUrl={displayTorrent.logoUrl ?? null}
        synopsis={displayTorrent.synopsis ?? displayTorrent.description ?? null}
        releaseDate={displayTorrent.releaseDate ?? null}
        useStreamTorrentMode={streamingTorrentActive && !isAvailableLocally}
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
      {/* Pendant le téléchargement (isPlaying = false), ne pas rendre le composant pour éviter de déclencher le lecteur HLS */}
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
          onClose={handleClosePlayer}
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
          useStreamTorrentMode={streamingTorrentActive && !isAvailableLocally}
          streamingTorrentToken={TokenManager.getCloudAccessToken()}
        />
      )}
    <div className="relative bg-black text-white">
      {/* Hero section : fond = bande-annonce (vidéo) ou image selon état */}
      <div className="fixed top-0 left-0 right-0 bottom-0 z-0 overflow-hidden">
        {isPlayingTrailer && trailerKey ? (
          <>
            <div className="absolute inset-0 w-full h-full [&_iframe]:absolute [&_iframe]:inset-0 [&_iframe]:w-full [&_iframe]:h-full">
              <VideoPlayer
                youtubeKey={trailerKey}
                autoplay={true}
                muted={true}
                loop={true}
                controls={true}
                cover={true}
                className="absolute inset-0 w-full h-full object-cover"
              />
            </div>
            <div className="absolute inset-0 pointer-events-none bg-gradient-to-r from-black/70 via-black/50 to-transparent" />
            <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/80 via-transparent to-transparent" />
            <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-transparent via-black/30 to-black" />
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

      {/* Contenu principal (data-tv-back-handler : première touche Retour = focus sur Retour, deuxième = navigation) */}
      <div className="relative z-10" ref={tvBackHandlerRef} data-tv-back-handler>
        <div className="relative w-full min-h-[60vh] sm:min-h-[70vh] flex flex-col justify-end px-3 sm:px-4 md:px-6 lg:px-16 pb-8 sm:pb-12 md:pb-16 pt-20 sm:pt-24 md:pt-32">
          {/* Bouton Bande-annonce ou Fermer sur la carte héros (haut droite) */}
          {trailerKey && (
            isPlayingTrailer ? (
              <button
                ref={trailerCloseButtonRef}
                type="button"
                onClick={() => setIsPlayingTrailer(false)}
                title={t('common.close')}
                aria-label={t('common.close')}
                data-focusable
                tabIndex={0}
                className="absolute top-4 right-3 sm:top-6 sm:right-4 md:right-6 lg:right-16 inline-flex items-center justify-center bg-black/60 hover:bg-black/80 text-white backdrop-blur-sm p-2.5 rounded-lg border border-white/30 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:ring-offset-2 focus:ring-offset-black transition-colors min-h-[44px] min-w-[44px]"
              >
                <svg className="h-5 w-5 sm:h-6 sm:w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setIsPlayingTrailer(true);
                }}
                disabled={isLoadingTrailer}
                title={t('ads.trailerPlay')}
                aria-label={t('ads.trailerPlay')}
                data-focusable
                tabIndex={0}
                className="absolute top-4 right-3 sm:top-6 sm:right-4 md:right-6 lg:right-16 inline-flex items-center gap-2 bg-white/15 hover:bg-white/25 text-white backdrop-blur-sm px-4 py-2.5 rounded-lg font-semibold text-sm border border-white/30 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:ring-offset-2 focus:ring-offset-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
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
            )
          )}
          <a
            ref={backLinkRef}
            href={backHref ?? '/dashboard'}
            onClick={(e) => {
              if (typeof window !== 'undefined' && window.history.length > 1) {
                e.preventDefault();
                window.history.back();
              }
            }}
            className="inline-flex items-center gap-2 text-white/80 hover:text-white transition-colors mb-4 sm:mb-6 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2 focus:ring-offset-black rounded px-2 py-1 min-h-[44px] tv:min-h-[52px]"
            data-focusable
            data-media-detail-back
            tabIndex={0}
            aria-label="Retour"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:h-5 sm:w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span className="text-sm sm:text-base">Retour</span>
          </a>

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
                  <div className="flex items-center">
                    <span className="inline-flex items-center justify-center px-4 py-2 bg-gradient-to-r from-gray-800/90 to-gray-900/90 backdrop-blur-md text-white/95 text-base sm:text-lg md:text-xl font-semibold rounded-lg border border-white/30 shadow-lg min-w-[70px]">
                      {new Date(torrent.releaseDate).getFullYear()}
                    </span>
                  </div>
                )}
              </div>
              {/* Badges de qualité sous le titre avec logos officiels */}
              {torrent.quality && (
                <div className="mt-3 sm:mt-4">
                  <QualityBadges quality={torrent.quality} />
                </div>
              )}
            </div>

            {/* Sélecteur Saison / Épisode (séries) */}
            {seriesEpisodes?.seasons?.length ? (
              <div className="mb-6 space-y-4">
                {/* Indication du nombre d'épisodes réellement en bibliothèque (série depuis library) */}
                {isLocalTorrent && allVariants.length > 0 && (
                  <p className="text-sm text-white/70 mb-2">
                    {allVariants.length === 1
                      ? t('library.episodesInLibrary', { count: 1 })
                      : t('library.episodesInLibrary_plural', { count: allVariants.length })}
                  </p>
                )}
                <div>
                  <span className="text-sm font-semibold text-white/80 block mb-2">Saison</span>
                  <div className="flex flex-wrap gap-2">
                    {seriesEpisodes.seasons.map((s) => (
                      <button
                        key={s.season}
                        type="button"
                        onClick={() => {
                          setSelectedSeasonNum(s.season);
                          const firstEp = s.episodes[0];
                          if (firstEp) setSelectedEpisodeVariantId(firstEp.id);
                        }}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-black ${
                          selectedSeasonNum === s.season
                            ? 'bg-primary-600 text-white'
                            : 'bg-white/10 text-white/90 hover:bg-white/20'
                        }`}
                      >
                        Saison {s.season}
                      </button>
                    ))}
                  </div>
                </div>
                {selectedSeasonNum != null && (() => {
                  const season = seriesEpisodes.seasons.find((s) => s.season === selectedSeasonNum);
                  if (!season?.episodes?.length) return null;
                  return (
                    <div>
                      <span className="text-sm font-semibold text-white/80 block mb-2">Épisode</span>
                      <div className="flex flex-wrap gap-2">
                        {season.episodes.map((ep) => (
                          <button
                            key={ep.id}
                            type="button"
                            onClick={() => setSelectedEpisodeVariantId(ep.id)}
                            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-black ${
                              selectedEpisodeVariantId === ep.id
                                ? 'bg-primary-600 text-white'
                                : 'bg-white/10 text-white/90 hover:bg-white/20'
                            }`}
                          >
                            {ep.episode === 0 ? 'Pack complet' : `Ép. ${ep.episode}`}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })()}
                {/* Pack complet : lister les fichiers (épisodes) du torrent pour lecture / téléchargement ciblé */}
                {isPackSelected && videoFiles.length > 1 && (
                  <div>
                    <span className="text-sm font-semibold text-white/80 block mb-2">
                      Fichiers du pack (pour la lecture)
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {videoFiles.map((file, idx) => {
                        const label = (() => {
                          const name = file.name || file.path || '';
                          const s01e01 = /[Ss](\d{1,2})[Ee](\d{1,2})/.exec(name);
                          if (s01e01) return `Ép. ${parseInt(s01e01[2], 10)}`;
                          return `Fichier ${idx + 1}`;
                        })();
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
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            {/* Boutons d'action (logique centralisée dans MediaDetailActionButtons) */}
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
              isPackWithMultipleFiles={Boolean(isPackSelected && videoFiles.length > 1)}
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
              />
            )}
          </div>
        </div>
      </div>

      {/* Modal de sélection de source (plusieurs sources disponibles) — adaptée TV */}
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

      {/* Panneau de vérification du téléchargement (après ajout d'un torrent) */}
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
            onStatsUpdate={setTorrentStats}
            dismissible={true}
            onDismiss={() => {
              setShowVerificationPanel(false);
              setVerificationInfoHash(null);
              setVerificationTorrentName(null);
            }}
          />
        </div>
      )}

      {/* Notifications */}
      <NotificationContainer notifications={notifications} onRemove={removeNotification} />
    </div>
    </>
  );
}