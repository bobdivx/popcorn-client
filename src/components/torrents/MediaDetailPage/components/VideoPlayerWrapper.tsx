import { useState, useEffect, useRef } from 'preact/hooks';
import { serverApi } from '../../../../lib/client/server-api';
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
}: VideoPlayerWrapperProps) {
  const baseUrl = serverApi.getServerUrl();
  const [forceHlsFallback, setForceHlsFallback] = useState(false);
  const [showFallbackMessage, setShowFallbackMessage] = useState(false);
  const [showPreroll, setShowPreroll] = useState(false);
  const [adsConfig, setAdsConfig] = useState<AdsConfig | null>(null);
  /** Message d’overlay pendant le chargement HLS (ex. « Préparation en cours » pendant retries 503) */
  const [hlsLoadingMessage, setHlsLoadingMessage] = useState<string | null>(null);
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
  });
  
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

  // Arrêter le buffer lors du démontage du composant
  useEffect(() => {
    return () => {
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
    // Réinitialiser le fallback et la qualité quand on change de média/session de lecture.
    setForceHlsFallback(false);
    setStreamQuality(null);
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
      (adsConfig.type === 'google' && !!adsConfig.googleAdTagUrl);

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
        <PlayerLoadingOverlay message="Chargement des fichiers vidéo..." />
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
            src={streamUrl}
            useDirectPlayer={Boolean(directStreamUrl || effectiveDirectMode)}
            useLuciePlayer={useLucieForThisSource && !directStreamUrl && !effectiveDirectMode}
            loading={isLoading}
            loadingMessage={hlsLoadingMessage ?? t('playback.loadingVideo')}
            closeLabel={t('common.close')}
            onClose={() => {
              stopBufferRef.current?.();
              onClose();
            }}
            onDirectLoadedData={() => setIsLoading(false)}
            onDirectError={(e) => {
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
          />
        </div>
      </div>
    </div>
  );
}
