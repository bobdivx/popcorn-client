import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import { serverApi } from '../../../../lib/client/server-api';
import { updateResumeWatching } from '../../../../lib/resumeWatchingStorage';
import type { ContentItem } from '../../../../lib/client/types';
import type { TorrentFile } from '../hooks/useVideoFiles';
import { useFullscreen } from '../../../streaming/player-shared/hooks/useFullscreen';
import { QualityBadges } from './QualityBadges';
import { isMobileDevice } from '../../../../lib/utils/device-detection';
import IntroVideoWithHlsPreload from '../../../IntroVideoWithHlsPreload';
import PrerollPlayer from '../../../streaming/hls-player/components/PrerollPlayer';
import { getPublicAdsSettings, type AdsConfig } from '../../../../lib/api/popcorn-web';
import { useHlsLoader } from '../../../streaming/hls-player/hooks/useHlsLoader';
import { usePlayerConfig } from '../../../streaming/player-shared/hooks/usePlayerConfig';
import PlayerLoadingOverlay from '../../../streaming/player-shared/components/PlayerLoadingOverlay';
import { getLoadingStep } from '../../../streaming/player-shared/utils/streamingSteps';
import UnifiedPlayer from '../../../streaming/player-core/components/UnifiedPlayer';
import { useStreamSource } from '../../../streaming/player-core/hooks/useStreamSource';
import { buildProxyUrl } from '../../../streaming/player-core/utils/buildStreamUrl';
import { canUseSeekReload as computeCanUseSeekReload } from '../../../streaming/player-core/utils/streamSourceUtils';
import { emitPlaybackStep } from '../../../streaming/player-core/observability/playbackEvents';
import { useI18n } from '../../../../lib/i18n/useI18n';

/** Info épisode suivant (série) pour le bouton « Épisode suivant » */
export interface NextEpisodeInfo {
  seasonNum: number;
  episodeVariantId: string;
  title?: string;
}

interface VideoPlayerWrapperProps {
  infoHash: string;
  selectedFile?: TorrentFile;
  torrentName: string;
  torrentId?: string;
  /** Pour sauvegarder la position par média (tmdb) dans le player */
  tmdbId?: number;
  tmdbType?: 'movie' | 'tv';
  startFromBeginning?: boolean;
  /** Contexte série : afficher « Passer le générique » et appliquer auto-skip si activé */
  isSeries?: boolean;
  /** Épisode suivant (série) : afficher bouton « Épisode suivant » peu avant la fin */
  nextEpisodeInfo?: NextEpisodeInfo | null;
  onPlayNextEpisode?: () => void;
  onClose: () => void;
  visible?: boolean;
  wrapperRef?: (element: HTMLDivElement | null) => void;
  quality?: {
    resolution?: string;
    source?: string;
    codec?: string;
    audio?: string;
    language?: string;
    full?: string;
  };
  /** En mode démo : URL directe du MP4 (ex. popcorn-web/public/media), pour lecture sans HLS. */
  directStreamUrl?: string | null;
  /** Média partagé par un ami : URL du serveur ami pour le stream uniquement (on garde notre backend pour le reste). */
  streamBackendUrl?: string | null;
  /** URL du poster (affiché en overlay pause avec le synopsis). */
  posterUrl?: string | null;
  /** URL du logo du média (TMDB) — affiché à la place du logo Popcorn si fourni. */
  logoUrl?: string | null;
  /** Synopsis du média (affiché en overlay pause avec le poster). */
  synopsis?: string | null;
  /** Année de sortie (badge overlay pause). */
  releaseDate?: string | null;
  /** Utiliser la route /api/stream-torrent (option payante) avec token. */
  useStreamTorrentMode?: boolean;
  /** Token cloud pour stream-torrent (?access_token=). */
  streamingTorrentToken?: string | null;
  /** Statut de lecture (pour l'indicateur d'étapes dans l'overlay du lecteur). */
  playStatus?: string;
  /** Message de progression (ex. "Recherche de peers..."). */
  progressMessage?: string;
  /** Stats du torrent (pour déduire l'étape courante). */
  torrentStats?: { progress?: number; download_speed?: number } | null;
}

export function VideoPlayerWrapper({ 
  infoHash, 
  selectedFile, 
  torrentName, 
  torrentId, 
  tmdbId,
  tmdbType,
  startFromBeginning = false, 
  isSeries = false,
  nextEpisodeInfo,
  onPlayNextEpisode,
  onClose, 
  visible = true, 
  wrapperRef,
  quality,
  directStreamUrl,
  streamBackendUrl,
  posterUrl,
  logoUrl,
  synopsis,
  releaseDate,
  useStreamTorrentMode = false,
  streamingTorrentToken,
  playStatus,
  progressMessage,
  torrentStats,
}: VideoPlayerWrapperProps) {
  const baseUrl = serverApi.getServerUrl();
  const [forceHlsFallback, setForceHlsFallback] = useState(false);
  const [showFallbackMessage, setShowFallbackMessage] = useState(false);
  const [showPreroll, setShowPreroll] = useState(false);
  const [adsConfig, setAdsConfig] = useState<AdsConfig | null>(null);
  /** Message d’overlay pendant le chargement HLS (ex. « Préparation en cours » pendant retries 503) */
  const [hlsLoadingMessage, setHlsLoadingMessage] = useState<string | null>(null);
  /** En mode stream-torrent : nombre de tentatives du lecteur direct (remount pour réessayer après 503). */
  const [directStreamRetryCount, setDirectStreamRetryCount] = useState(0);
  const directStreamRetryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hlsPreloadRef = useRef<any>(null);
  const preloadVideoRef = useRef<HTMLVideoElement | null>(null);
  const { hlsLoaded } = useHlsLoader();
  const isFullscreen = useFullscreen();
  const wrapperElementRef = useRef<HTMLDivElement>(null);
  const stopBufferRef = useRef<(() => void) | null>(null);
  const isMobile = isMobileDevice();
  const { t } = useI18n();
  const playerConfig = usePlayerConfig();
  const isDirectMode = playerConfig.streamingMode === 'direct';
  const isLucieMode = playerConfig.streamingMode === 'lucie';
  // Désactiver Lucie pour la bibliothèque (local_) : la MSE ne remplit pas le buffer avec les segments actuels.
  // Utiliser HLS pour que la lecture fonctionne. Lucie reste utilisé pour les torrents si config = lucie.
  const useLucieForThisSource = isLucieMode && !forceHlsFallback && !infoHash?.startsWith('local_');
  const effectiveDirectMode = isDirectMode && !forceHlsFallback;
  /** Qualité stream HLS : hauteur max en pixels (720, 480, 360) ou null = source. Modifiable dans le player. */
  const [streamQuality, setStreamQuality] = useState<number | null>(null);
  const {
    streamUrl,
    hlsFilePath,
    isLoading,
    setIsLoading,
    showIntro,
    setShowIntro,
  } = useStreamSource({
    selectedFile,
    infoHash,
    directStreamUrl,
    baseUrl,
    isDirectMode: effectiveDirectMode,
    isLucieMode: useLucieForThisSource,
    streamBackendUrl,
    maxHeight: streamQuality,
    streamingTorrentMode: useStreamTorrentMode,
    streamingTorrentToken: streamingTorrentToken ?? undefined,
  });

  const [scrubThumbnails, setScrubThumbnails] = useState<{
    mediaId: string;
    count: number;
    durationSeconds?: number;
    intervalSeconds?: number;
  } | null>(null);
  const [scrubThumbnailsLoading, setScrubThumbnailsLoading] = useState(false);
  const scrubRetryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      scrubRetryTimeoutRef.current && clearTimeout(scrubRetryTimeoutRef.current);
      scrubRetryTimeoutRef.current = null;
    };
  }, []);

  // Charger (ou déclencher) les miniatures scrub pour ce média, si c'est un média local.
  useEffect(() => {
    // Pas de scrub thumbnails pour un flux distant (bibliothèque ami) ni en démo.
    if (!visible) {
      setScrubThumbnails(null);
      setScrubThumbnailsLoading(false);
      return;
    }
    if (streamBackendUrl?.trim()) {
      setScrubThumbnails(null);
      setScrubThumbnailsLoading(false);
      return;
    }
    // Médias bibliothèque : l'infoHash/id est au format local_{local_media_id}.
    // Dans ce cas, on peut utiliser directement l'id sans heuristique sur le file_path.
    const localIdFromInfoHash =
      typeof infoHash === 'string' && infoHash.startsWith('local_')
        ? infoHash.slice('local_'.length).trim()
        : '';
    if (!hlsFilePath || typeof hlsFilePath !== 'string') {
      // Si on a déjà l'id via local_, on peut continuer même sans file_path.
      if (!localIdFromInfoHash) {
        setScrubThumbnails(null);
        return;
      }
    }

    let cancelled = false;
    scrubRetryTimeoutRef.current && clearTimeout(scrubRetryTimeoutRef.current);
    scrubRetryTimeoutRef.current = null;

    const normalizePath = (p: string) => p.replace(/\\\\/g, '/').trim().toLowerCase();
    const baseName = (p: string) => {
      const n = normalizePath(p);
      const parts = n.split('/');
      return parts[parts.length - 1] || '';
    };
    const targetPath = hlsFilePath ? normalizePath(hlsFilePath) : '';
    const targetBase = hlsFilePath ? baseName(hlsFilePath) : '';

    const run = async () => {
      try {
        let localMediaId = localIdFromInfoHash;
        // Torrents téléchargés : on peut récupérer le local_media_id via info_hash si l'entrée existe déjà.
        if (!localMediaId && typeof infoHash === 'string' && infoHash.length >= 12 && !infoHash.startsWith('local_')) {
          try {
            const lm = await serverApi.findLocalMediaByInfoHash(infoHash);
            if ((lm as any)?.success && (lm as any)?.data?.id) {
              localMediaId = String((lm as any).data.id).trim();
            }
          } catch {
            // ignore
          }
        }
        if (!localMediaId) {
          const libraryMedia = await serverApi.getLibraryMedia();
          if ((libraryMedia as any)?.success) {
            const items = Array.isArray((libraryMedia as any)?.data) ? (libraryMedia as any).data : [];
            const match = items.find((m: any) => {
              const fp = String(m?.file_path ?? '');
              const fpNorm = normalizePath(fp);
              if (targetPath && fpNorm === targetPath) return true;
              if (targetBase && baseName(fp) === targetBase) return true;
              const fn = String(m?.file_name ?? '');
              if (targetBase && normalizePath(fn) === targetBase) return true;
              return false;
            });
            localMediaId = (match?.id ?? '').trim();
          }
        }
        // Fallback : le backend accepte aussi l'info_hash (40 hex) pour résoudre le média.
        if (!localMediaId && typeof infoHash === 'string' && infoHash.length === 40 && /^[a-fA-F0-9]+$/.test(infoHash)) {
          localMediaId = infoHash.trim().toLowerCase();
        }
        if (!localMediaId) return;

        const fetchMeta = async () => {
          const meta = await serverApi.getScrubThumbnailsMeta(localMediaId);
          const ok = (meta as any)?.success === true;
          const data = (meta as any)?.data;
          if (!ok || !data) throw new Error('meta not ready');
          const mediaId = (data.media_id ?? '').trim();
          const count = Number(data.count ?? 0);
          const durationSeconds = Number(data.duration_seconds ?? 0);
          const intervalSeconds = Number(data.interval_seconds ?? 0);
          if (!mediaId || !Number.isFinite(count) || count <= 0) throw new Error('meta invalid');
          if (!cancelled) {
            setScrubThumbnails({
              mediaId,
              count,
              durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : undefined,
              intervalSeconds: Number.isFinite(intervalSeconds) && intervalSeconds > 0 ? intervalSeconds : undefined,
            });
            setScrubThumbnailsLoading(false);
          }
        };

        try {
          await fetchMeta();
          // Si on détecte un ancien cache (ex: ~20 vignettes => intervalle très grand),
          // forcer une régénération "1 vignette / 10s" pour correspondre au nouveau mode.
          const meta = await serverApi.getScrubThumbnailsMeta(localMediaId).catch(() => null);
          const data = (meta as any)?.data;
          const count = Number(data?.count ?? 0);
          const durationSeconds = Number(data?.duration_seconds ?? 0);
          const intervalSeconds = Number(data?.interval_seconds ?? 0);
          const expected = durationSeconds > 0 ? Math.min(300, Math.ceil(durationSeconds / 10)) : 0;
          // Legacy si:
          // - interval très grand (fallback duration/count, ex 44s)
          // - OU interval absent/0 (meta.json manquant) ET count très faible par rapport au mode 10s
          const looksLegacy =
            expected > 0 &&
            count > 0 &&
            count < Math.min(expected, 60) &&
            ((Number.isFinite(intervalSeconds) && intervalSeconds > 30) || !Number.isFinite(intervalSeconds) || intervalSeconds <= 0);
          if (looksLegacy) {
            if (!cancelled) {
              setScrubThumbnails(null);
              setScrubThumbnailsLoading(true);
            }
            await serverApi.generateScrubThumbnails(localMediaId, { force: true }).catch(() => {});
            // Poll meta sans relancer une génération "non-force"
            throw new Error('forced_regen');
          }
          return;
        } catch (err) {
          // Déclencher la génération, puis poll meta (génération peut prendre >2.5s selon le média/CPU)
          const isForcedRegen = err instanceof Error && err.message === 'forced_regen';
          if (!cancelled && !isForcedRegen) setScrubThumbnailsLoading(true);
          if (!isForcedRegen) {
            await serverApi.generateScrubThumbnails(localMediaId).catch(() => {});
          }
          let attempts = 0;
          const poll = () => {
            if (cancelled) return;
            attempts += 1;
            fetchMeta()
              .catch(() => {
                if (attempts >= 12) {
                  setScrubThumbnailsLoading(false);
                  return; // ~24s
                }
                scrubRetryTimeoutRef.current = setTimeout(poll, 2000);
              });
          };
          scrubRetryTimeoutRef.current = setTimeout(poll, 1500);
        }
      } catch {
        // ignore — scrub thumbnails restent désactivées
        if (!cancelled) setScrubThumbnailsLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [infoHash, hlsFilePath, streamBackendUrl, visible]);

  const loadingStepFromStatus = getLoadingStep(playStatus ?? '', progressMessage ?? '', torrentStats ?? null);
  // Quand on attend le flux (isLoading sans étape précise), afficher l’étape 1 (en file d’attente), pas la 4
  const loadingStep = loadingStepFromStatus > 0 ? loadingStepFromStatus : isLoading ? 1 : 0;

  const handlePlaybackProgress = useCallback(
    (currentTime: number, duration: number) => {
      if (tmdbId == null || !tmdbType || duration <= 0) return;
      const progressPercent = (currentTime / duration) * 100;
      const item: ContentItem = {
        id: String(tmdbId),
        title: torrentName || '',
        type: tmdbType,
        poster: posterUrl ?? undefined,
        tmdbId,
      };
      updateResumeWatching(item, progressPercent);
    },
    [tmdbId, tmdbType, torrentName, posterUrl]
  );

  const STORAGE_INTRO_SKIPPED = 'popcorn_intro_skipped';
  const STORAGE_INTRO_ALWAYS_SHOW = 'popcorn_intro_always_show';
  const STORAGE_ADS_SESSION = 'popcorn_ads_preroll_session';
  const STORAGE_ADS_DAY = 'popcorn_ads_preroll_day';

  useEffect(() => {
    if (wrapperRef) {
      wrapperRef(wrapperElementRef.current);
    }
  }, [wrapperRef]);

  // Arrêter le buffer HLS lors de la fermeture du lecteur (via ref typée)
  useEffect(() => {
    if (!visible && stopBufferRef.current) {
      try {
        stopBufferRef.current();
      } catch (e) {
        console.warn('[VideoPlayerWrapper] Erreur lors de l\'arrêt du buffer:', e);
      }
    }
  }, [visible]);

  // Arrêter le buffer et annuler le retry stream-torrent lors du démontage du composant
  useEffect(() => {
    return () => {
      directStreamRetryTimeoutRef.current && clearTimeout(directStreamRetryTimeoutRef.current);
      directStreamRetryTimeoutRef.current = null;
      if (stopBufferRef.current) {
        try {
          stopBufferRef.current();
        } catch (e) {
          console.warn('[VideoPlayerWrapper] Erreur lors de l\'arrêt du buffer au démontage:', e);
        }
      }
    };
  }, []);

  useEffect(() => {
    // Réinitialiser le fallback, la qualité et les retries stream-torrent quand on change de média/session de lecture.
    setForceHlsFallback(false);
    setStreamQuality(null);
    setDirectStreamRetryCount(0);
  }, [infoHash, selectedFile?.path, directStreamUrl, visible]);

  useEffect(() => {
    let mounted = true;
    getPublicAdsSettings(baseUrl)
      .then((cfg) => {
        if (mounted) setAdsConfig(cfg);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [baseUrl]);

  useEffect(() => {
    if (directStreamUrl || effectiveDirectMode) return; // Lecture directe, pas de préchargement HLS
    if (!showPreroll || showIntro) return;
    if (!hlsLoaded || !infoHash || !hlsFilePath || !window.Hls) return;

    const preloadHls = () => {
      try {
        const normalizedPath = hlsFilePath.replace(/\\/g, '/');
        const encodedPath = encodeURIComponent(normalizedPath);
        const path = `/api/local/stream/${encodedPath}/playlist.m3u8`;
        const hlsUrl = streamBackendUrl?.trim()
          ? buildProxyUrl(baseUrl, streamBackendUrl.trim(), path, { info_hash: infoHash })
          : `${baseUrl}${path}?info_hash=${encodeURIComponent(infoHash)}`;

        const backgroundVideo = document.createElement('video');
        backgroundVideo.style.display = 'none';
        backgroundVideo.muted = true;
        backgroundVideo.playsInline = true;
        preloadVideoRef.current = backgroundVideo;
        document.body.appendChild(backgroundVideo);

        const hls = new window.Hls({
          enableWorker: true,
          lowLatencyMode: false,
          backBufferLength: 10,
          maxBufferLength: 30,
          maxMaxBufferLength: 60,
          maxBufferSize: 60 * 1000 * 1000,
          startLevel: -1,
          autoStartLoad: true,
        });

        hlsPreloadRef.current = hls;
        hls.loadSource(hlsUrl);
        hls.attachMedia(backgroundVideo);

        hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
          hls.startLoad();
        });
      } catch (e) {
        console.warn('[VideoPlayerWrapper] Erreur préchargement HLS pré‑roll:', e);
      }
    };

    preloadHls();

    return () => {
      if (hlsPreloadRef.current) {
        try {
          hlsPreloadRef.current.stopLoad();
          hlsPreloadRef.current.destroy();
        } catch (e) {
          console.warn('[VideoPlayerWrapper] Erreur nettoyage HLS pré‑roll:', e);
        }
        hlsPreloadRef.current = null;
      }
      if (preloadVideoRef.current && preloadVideoRef.current.parentNode) {
        preloadVideoRef.current.parentNode.removeChild(preloadVideoRef.current);
        preloadVideoRef.current = null;
      }
    };
  }, [showPreroll, showIntro, hlsLoaded, infoHash, hlsFilePath, directStreamUrl, baseUrl, effectiveDirectMode, streamBackendUrl]);

  useEffect(() => {
    if (!adsConfig || !selectedFile || !infoHash) return;
    if (showIntro) return;

    const hasMedia =
      (adsConfig.type === 'image' && !!adsConfig.imageUrl) ||
      (adsConfig.type === 'video' && !!adsConfig.videoUrl) ||
      (adsConfig.type === 'google' && !!adsConfig.googleAdTagUrl) ||
      (adsConfig.type === 'google_display' && !!adsConfig.googleAdClient && !!adsConfig.googleAdSlot);

    if (!adsConfig.enabled || !hasMedia) return;

    const today = new Date().toISOString().slice(0, 10);
    let shouldShow = true;
    try {
      if (adsConfig.frequency === 'once_per_session') {
        shouldShow = sessionStorage.getItem(STORAGE_ADS_SESSION) !== '1';
      } else if (adsConfig.frequency === 'once_per_day') {
        shouldShow = localStorage.getItem(STORAGE_ADS_DAY) !== today;
      }
    } catch (e) {
      shouldShow = true;
    }

    if (shouldShow) {
      setShowPreroll(true);
    }
  }, [adsConfig, selectedFile, infoHash, showIntro]);

  const markPrerollSeen = () => {
    if (!adsConfig) return;
    const today = new Date().toISOString().slice(0, 10);
    try {
      if (adsConfig.frequency === 'once_per_session') {
        sessionStorage.setItem(STORAGE_ADS_SESSION, '1');
      } else if (adsConfig.frequency === 'once_per_day') {
        localStorage.setItem(STORAGE_ADS_DAY, today);
      }
    } catch (e) {
      // ignore storage errors
    }
  };

  // Afficher l'intro avec préchargement HLS si nécessaire (pas en mode lecture directe)
  if (!directStreamUrl && !effectiveDirectMode && showIntro && selectedFile && hlsFilePath && infoHash) {
    return (
      <IntroVideoWithHlsPreload
        hlsStreamUrl={streamUrl}
        onEnded={() => {
          // Marquer l'intro comme vue (seulement si on n'est pas en mode "toujours afficher")
          try {
            const alwaysShow = localStorage.getItem(STORAGE_INTRO_ALWAYS_SHOW) === '1';
            if (!alwaysShow) {
              localStorage.setItem(STORAGE_INTRO_SKIPPED, '1');
            }
          } catch (e) {
            console.warn('[VideoPlayerWrapper] Erreur localStorage:', e);
          }
          setShowIntro(false);
        }}
        hlsInfoHash={infoHash}
        hlsFilePath={hlsFilePath}
        hlsFileName={selectedFile.name}
        onHlsReady={(hlsInstance) => {
          console.log('[VideoPlayerWrapper] HLS préchargé et prêt:', hlsInstance);
        }}
      />
    );
  }

  if (showPreroll && adsConfig) {
    return (
      <PrerollPlayer
        config={adsConfig}
        onEnded={() => {
          markPrerollSeen();
          setShowPreroll(false);
        }}
        onSkip={() => {
          markPrerollSeen();
          setShowPreroll(false);
        }}
      />
    );
  }

  if (!selectedFile && !directStreamUrl) {
    return (
      <div 
        ref={wrapperElementRef}
        id="video-player-wrapper" 
        className="fixed inset-0 z-50 bg-black w-full h-full"
        style={{
          ...(isFullscreen ? { width: '100vw', height: '100vh' } : {}),
          display: visible ? 'block' : 'none',
        }}
      >
        <PlayerLoadingOverlay
          message="Chargement des fichiers vidéo..."
          loadingStep={loadingStep}
          progressMessage={progressMessage}
          torrentStats={torrentStats ?? undefined}
          onCancel={onClose}
          cancelLabel={t('downloads.cancelDownload')}
        />
      </div>
    );
  }

  return (
    <div 
      ref={wrapperElementRef}
      id="video-player-wrapper" 
      className="fixed inset-0 z-50 bg-black w-full h-full"
      style={{
        ...(isFullscreen ? { width: '100vw', height: '100vh' } : {}),
        display: visible ? 'block' : 'none',
        transform: 'translateZ(0)',
        willChange: 'transform',
        backfaceVisibility: 'hidden',
      }}
    >
      {/* Badges de qualité en haut à droite (mode non plein écran) */}
      {!isFullscreen && (
        <div className="absolute top-4 right-4 z-10">
          <QualityBadges quality={quality} align="right" />
        </div>
      )}
      
      {/* Badges de qualité en plein écran aussi */}
      {isFullscreen && (
        <div className="absolute top-4 right-4 z-20">
          <QualityBadges quality={quality} align="right" />
        </div>
      )}

      {/* Message unique après fallback direct → HLS */}
      {showFallbackMessage && (
        <div
          className="absolute top-4 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded bg-black/80 text-white text-sm"
          role="status"
        >
          {t('playback.streamingFallbackToHls')}
        </div>
      )}

      <div 
        className={`absolute inset-0 ${isFullscreen ? 'p-0' : isMobile ? 'pt-12 pb-1 px-0' : 'pt-16 pb-1 px-1'}`}
      >
        <div 
          className={`h-full w-full flex flex-col relative ${isFullscreen ? '' : 'max-w-[99vw]'}`}
          style={{
            width: '100%',
            height: '100%',
          }}
        >
          <UnifiedPlayer
            key={useStreamTorrentMode ? `stream-torrent-${directStreamRetryCount}` : undefined}
            src={streamUrl}
            useDirectPlayer={Boolean(directStreamUrl || effectiveDirectMode || useStreamTorrentMode)}
            useLuciePlayer={useLucieForThisSource && !directStreamUrl && !effectiveDirectMode}
            loading={isLoading}
            loadingMessage={hlsLoadingMessage ?? t('playback.loadingVideo')}
            loadingStep={loadingStep}
            progressMessage={progressMessage ?? undefined}
            torrentStats={torrentStats ?? undefined}
            closeLabel={t('common.close')}
            cancelLabel={t('downloads.cancelDownload')}
            onClose={() => {
              stopBufferRef.current?.();
              onClose();
            }}
            onDirectLoadedData={() => setIsLoading(false)}
            onDirectError={(e) => {
              if (useStreamTorrentMode) {
                // Le flux peut mettre 30–60 s à être prêt (torrent initializing côté librqbit) : plus de tentatives et délai 5 s
                const maxRetries = 12;
                const retryDelayMs = 5000;
                if (directStreamRetryCount < maxRetries - 1) {
                  // 503 / flux pas encore prêt : normal au démarrage, on réessaie automatiquement
                  console.warn('[VideoPlayerWrapper] Flux pas encore prêt (503?), nouvelle tentative dans', retryDelayMs / 1000, 's…', e);
                  directStreamRetryTimeoutRef.current && clearTimeout(directStreamRetryTimeoutRef.current);
                  setHlsLoadingMessage(t('playback.streamPreparingRetry') ?? 'Préparation du flux, nouvelle tentative…');
                  setIsLoading(true);
                  directStreamRetryTimeoutRef.current = window.setTimeout(() => {
                    directStreamRetryTimeoutRef.current = null;
                    setDirectStreamRetryCount((c) => c + 1);
                    setHlsLoadingMessage(null);
                  }, retryDelayMs);
                  return;
                }
                console.error('[VideoPlayerWrapper] Direct video error après', maxRetries, 'tentatives:', e);
                setHlsLoadingMessage(t('playback.torrentUnavailableOnIndexer') ?? 'Ce torrent n\'est plus disponible sur l\'indexeur. Choisissez une autre source.');
                setIsLoading(false);
                return;
              }
              console.error('[VideoPlayerWrapper] Direct video error:', e);
              if (!directStreamUrl && isDirectMode && !forceHlsFallback) {
                console.warn('[VideoPlayerWrapper] Fallback automatique vers HLS après échec du mode direct.');
                emitPlaybackStep('fallback_direct_to_hls', { message: 'Direct stream failed' });
                emitPlaybackStep('fallback_message_shown');
                setIsLoading(true);
                setForceHlsFallback(true);
                setShowFallbackMessage(true);
                window.setTimeout(() => setShowFallbackMessage(false), 5000);
                return;
              }
              setIsLoading(false);
            }}
            hlsProps={{
              infoHash,
              fileName: selectedFile?.path || selectedFile?.name || torrentName || 'video',
              torrentName: torrentName || selectedFile?.name || 'video',
              posterUrl: posterUrl ?? undefined,
              logoUrl: logoUrl ?? undefined,
              synopsis: synopsis ?? undefined,
              releaseDate: releaseDate ?? undefined,
              torrentId,
              filePath: selectedFile?.path || selectedFile?.name || torrentName || 'video',
              tmdbId,
              tmdbType,
              startFromBeginning,
              isSeries,
              nextEpisodeInfo,
              onPlayNextEpisode,
              onClose,
              canUseSeekReload: computeCanUseSeekReload({
                infoHash,
                streamBackendUrl,
                filePath: selectedFile?.path ?? selectedFile?.name ?? null,
              }),
              baseUrl,
              isRemoteStream: !!streamBackendUrl?.trim(),
              onLoadingMessageChange: setHlsLoadingMessage,
              streamBackendUrl: streamBackendUrl ?? undefined,
              stopBufferRef,
              maxHeight: streamQuality,
              streamQuality,
              onQualityChange: setStreamQuality,
              useStreamTorrentUrl: useStreamTorrentMode,
              scrubThumbnails,
              scrubThumbnailsLoading,
            }}
            lucieProps={{
              infoHash,
              fileName: selectedFile?.path || selectedFile?.name || torrentName || 'video',
              torrentName: torrentName || selectedFile?.name || 'video',
              posterUrl: posterUrl ?? undefined,
              logoUrl: logoUrl ?? undefined,
              synopsis: synopsis ?? undefined,
              releaseDate: releaseDate ?? undefined,
              torrentId,
              filePath: selectedFile?.path || selectedFile?.name || torrentName || 'video',
              tmdbId,
              tmdbType,
              startFromBeginning,
              isSeries,
              nextEpisodeInfo,
              onPlayNextEpisode,
              onClose,
              baseUrl,
              stopBufferRef,
              scrubThumbnails,
              scrubThumbnailsLoading,
            }}
            onHlsLoadingChange={(loading) => setIsLoading(loading)}
            onHlsError={(e) => {
              console.error('[VideoPlayerWrapper] Player error:', e);
              if (isLucieMode && !forceHlsFallback) {
                console.warn('[VideoPlayerWrapper] Fallback automatique vers HLS après échec Lucie (ex. manifest 404).');
                emitPlaybackStep('fallback_lucie_to_hls', { message: e?.message ?? 'Lucie failed' });
                emitPlaybackStep('fallback_message_shown');
                setIsLoading(true);
                setForceHlsFallback(true);
                setShowFallbackMessage(true);
                window.setTimeout(() => setShowFallbackMessage(false), 5000);
                return;
              }
              setIsLoading(false);
            }}
            onProgress={handlePlaybackProgress}
          />
        </div>
      </div>
    </div>
  );
}
