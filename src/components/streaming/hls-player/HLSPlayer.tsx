import { useEffect, useState, useRef } from 'preact/hooks';
import { useVideoControls } from '../player-shared/hooks/useVideoControls';
import { useFullscreen, toggleFullscreen } from '../player-shared/hooks/useFullscreen';
import { ErrorDisplay } from '../player-shared/components/ErrorDisplay';
import { VideoControls } from '../player-shared/components/VideoControls';
import type { HLSPlayerProps } from './types';
import { useHlsPlayer } from './hooks/useHlsPlayer';
import { useTVPlayerNavigation } from '../player-shared/hooks/useTVPlayerNavigation';
import { useHlsTracks } from './hooks/useHlsTracks';
import { usePlayerConfig } from '../player-shared/hooks/usePlayerConfig';
import { shouldAutoFullscreen } from '../../../lib/utils/device-detection';
import { isTauri } from '../../../lib/utils/tauri';
import { NextEpisodeOverlay } from '../player-shared/components/NextEpisodeOverlay';
import { SkipIntroOverlay } from '../player-shared/components/SkipIntroOverlay';
import PlayerBufferingOverlay from '../player-shared/components/PlayerBufferingOverlay';
import { useI18n } from '../../../lib/i18n';
import { useChromecast } from '../../../lib/chromecast/useChromecast';
import { useTouchGestures } from '../player-shared/hooks/useTouchGestures';

export default function HLSPlayer({ 
  src, 
  infoHash, 
  fileName, 
  torrentName,
  torrentStats,
  posterUrl,
  logoUrl,
  synopsis,
  releaseDate,
  torrentId, 
  filePath, 
  tmdbId,
  tmdbType,
  seriesSeason,
  seriesEpisode,
  variantId,
  startFromBeginning = false, 
  isSeries = false,
  nextEpisodeInfo = null,
  onPlayNextEpisode,
  onError, 
  onLoadingChange,
  onLoadingMessageChange,
  onBufferProgress,
  onClose,
  canUseSeekReload: canUseSeekReloadProp,
  baseUrl: baseUrlProp,
  isRemoteStream = false,
  streamBackendUrl,
  stopBufferRef,
  maxHeight,
  streamQuality,
  onQualityChange,
  useStreamTorrentUrl: useStreamTorrentUrlProp,
  onProgress,
  scrubThumbnails,
  scrubThumbnailsLoading,
  seriesEpisodePickerItems,
  selectedSeriesEpisodeVariantId,
  onSelectSeriesEpisode,
}: HLSPlayerProps) {
  const playerConfig = usePlayerConfig();
  const { t } = useI18n();
  const chromecast = useChromecast();
  const canAutoPlayRef = useRef<(() => boolean) | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const openQualityMenuRef = useRef<(() => void) | null>(null);
  const hasAutoFullscreenedRef = useRef(false);
  const [hlsDuration, setHlsDuration] = useState<number | undefined>(undefined);
  const hlsDurationRef = useRef<number>(0);
  
  // Réinitialiser hlsDurationRef quand on change de vidéo
  useEffect(() => {
    hlsDurationRef.current = 0;
    setHlsDuration(undefined);
  }, [infoHash, filePath]);

  const { videoRef, hlsRef, isLoading, pendingSeekPosition, error, hlsLoaded, loadingStatusMessage, stopBuffer, reloadWithSeek } = useHlsPlayer({
    src,
    infoHash,
    maxHeight: maxHeight ?? undefined,
    fileName,
    torrentId,
    filePath,
    tmdbId,
    tmdbType,
    seriesSeason,
    seriesEpisode,
    variantId,
    startFromBeginning,
    onError,
    onLoadingChange,
    canAutoPlay: () => canAutoPlayRef.current ? canAutoPlayRef.current() : true,
    onTranscodingsEvicted: () => {
      setTranscodingsEvictedMessage(t('playback.transcodingsEvicted'));
    },
    onDurationChange: (duration) => {
      // Toujours utiliser Math.max pour préserver la valeur la plus élevée
      // Cela garantit que si l'API a défini une valeur supérieure, elle ne sera jamais écrasée
      const newValue = Math.max(hlsDurationRef.current, duration);
      if (newValue > hlsDurationRef.current) {
        hlsDurationRef.current = newValue;
        setHlsDuration(newValue);
      }
    },
    baseUrl: baseUrlProp,
    isRemoteStream,
    streamBackendUrl,
    useStreamTorrentUrl: useStreamTorrentUrlProp,
  });

  // Propager le message d'overlay (ex. « Préparation en cours » pendant retries 503)
  useEffect(() => {
    onLoadingMessageChange?.(loadingStatusMessage ?? null);
  }, [loadingStatusMessage, onLoadingMessageChange]);

  // Exposer stopBuffer via ref pour que le parent (VideoPlayerWrapper) puisse l'appeler à la fermeture
  useEffect(() => {
    if (stopBufferRef) {
      (stopBufferRef as { current: (() => void) | null }).current = stopBuffer;
      return () => {
        (stopBufferRef as { current: (() => void) | null }).current = null;
      };
    }
  }, [stopBuffer, stopBufferRef]);

  const isFullscreen = useFullscreen();
  const isLocalLibraryMedia =
    typeof infoHash === 'string' && infoHash.startsWith('local_');
  
  const {
    showControls: baseShowControls,
    isPlaying,
    currentTime,
    duration,
    bufferedPercent,
    isSeeking,
    isMuted,
    volume,
    handlePlayPause,
    handleSeek: baseHandleSeek,
    seekToTargetTime,
    handleVolumeChange: baseHandleVolumeChange,
    toggleMute,
    canAutoPlay,
  } = useVideoControls({
    videoRef,
    hlsLoaded,
    hlsDuration,
    isLoading,
    pendingSeekPosition,
    // Réactivé pour local_ : la protection active_seek_target côté serveur empêche les 503 en boucle.
    // Maintenant, reloadWithSeek fonctionne correctement pour tous les types de fichiers.
    canUseSeekReload: canUseSeekReloadProp ?? true,
    reloadWithSeek,
  });

  // Pendant la préparation HLS (surtout local/AV1), end/duration peut être ~100%
  // sur une playlist prématurée de quelques secondes — indéterminé plutôt que faux %.
  const overlayBufferedPercent =
    isLoading || (isLocalLibraryMedia && bufferedPercent >= 85 && !isPlaying)
      ? null
      : bufferedPercent > 0
        ? bufferedPercent
        : null;

  useEffect(() => {
    if (onBufferProgress) {
      onBufferProgress(bufferedPercent);
    }
  }, [bufferedPercent, onBufferProgress]);
  
  useEffect(() => {
    canAutoPlayRef.current = canAutoPlay;
  }, [canAutoPlay]);

  // Reprendre / Revoir : progress via refs (éviter spam API à chaque timeupdate)
  const effectiveDuration = duration > 0 ? duration : (hlsDuration ?? 0);
  const currentTimeRef = useRef(currentTime);
  const effectiveDurationRef = useRef(effectiveDuration);
  currentTimeRef.current = currentTime;
  effectiveDurationRef.current = effectiveDuration;
  useEffect(() => {
    if (!onProgress || effectiveDuration <= 0) return;
    // Notifier dès que la durée HLS est connue (reprise + miniatures scrub).
    onProgress(currentTimeRef.current, effectiveDuration);
    const id = setInterval(() => {
      onProgress(currentTimeRef.current, effectiveDurationRef.current);
    }, 15000);
    return () => {
      clearInterval(id);
      onProgress(currentTimeRef.current, effectiveDurationRef.current);
    };
  }, [onProgress, effectiveDuration]);

  const {
    audioTracks,
    subtitleTracks,
    currentAudioTrack,
    currentSubtitleTrack,
    showSubtitleSelector,
    changeAudioTrack,
    changeSubtitleTrack,
    toggleSubtitleSelector,
    setShowSubtitleSelector,
  } = useHlsTracks({ videoRef, hlsRef, hlsLoaded, src });

  const [showControls, setShowControls] = useState(baseShowControls);
  const [transcodingsEvictedMessage, setTranscodingsEvictedMessage] = useState<string | null>(null);
  const [seekFeedback, setSeekFeedback] = useState<{ direction: 'left' | 'right'; seconds: number } | null>(null);
  const seekFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setShowControls(baseShowControls);
  }, [baseShowControls]);

  const handleSeekTV = (direction: 'left' | 'right', stepSeconds = 10) => {
    if (!duration) return;
    const newTime = direction === 'left'
      ? Math.max(0, currentTime - stepSeconds)
      : Math.min(duration, currentTime + stepSeconds);
    seekToTargetTime(newTime);
    // Retour visuel seek : afficher "-10 s" ou "+10 s" pendant ~800 ms
    if (seekFeedbackTimeoutRef.current) clearTimeout(seekFeedbackTimeoutRef.current);
    setSeekFeedback({ direction, seconds: stepSeconds });
    seekFeedbackTimeoutRef.current = setTimeout(() => {
      setSeekFeedback(null);
      seekFeedbackTimeoutRef.current = null;
    }, 800);
  };

  const handleDoubleTap = (direction: 'left' | 'right') => {
    const video = videoRef.current;
    if (!video) return;
    const durValue = duration > 0 ? duration : (video.duration || 0);
    if (!durValue) return;

    const targetTime = direction === 'left'
      ? Math.max(0, video.currentTime - 10)
      : Math.min(durValue, video.currentTime + 10);
    
    seekToTargetTime(targetTime);

    if (seekFeedbackTimeoutRef.current) clearTimeout(seekFeedbackTimeoutRef.current);
    setSeekFeedback({ direction, seconds: 10 });
    seekFeedbackTimeoutRef.current = setTimeout(() => {
      setSeekFeedback(null);
      seekFeedbackTimeoutRef.current = null;
    }, 800);
  };



  const handleVolumeChangeTV = (direction: 'up' | 'down') => {
    const video = videoRef.current;
    if (!video) return;
    const changeAmount = 0.1;
    const newVolume = direction === 'up'
      ? Math.min(1, volume + changeAmount)
      : Math.max(0, volume - changeAmount);
    video.volume = newVolume;
    video.muted = newVolume === 0;
  };

  const handleToggleFullscreen = () => {
    // Utiliser video-player-wrapper en priorité car c'est le conteneur principal
    const container = document.getElementById('video-player-wrapper') || 
                      containerRef.current ||
                      document.getElementById('hls-player-container');
    if (!container) {
      console.warn('Aucun conteneur trouvé pour le plein écran');
      return;
    }
    toggleFullscreen(container).catch((err) => {
      console.error('Erreur lors du toggle plein écran:', err);
    });
  };

  // Fonction pour redémarrer la vidéo depuis le début
  const handleRestart = () => {
    const video = videoRef.current;
    if (video) {
      video.currentTime = 0;
      video.play().catch((err) => {
        console.warn('Impossible de démarrer la lecture:', err);
      });
    }
  };

  const introSkipSeconds = playerConfig.introSkipSeconds ?? 90;
  const showSkipIntro =
    isSeries &&
    (playerConfig.skipIntroEnabled ?? true) &&
    introSkipSeconds > 0 &&
    duration > introSkipSeconds &&
    currentTime >= 3 &&
    currentTime < introSkipSeconds - 1;
  const handleSkipIntro = () => {
    const video = videoRef.current;
    if (!video) return;
    const target = Math.min(
      introSkipSeconds,
      Number.isFinite(video.duration) && video.duration > 0 ? video.duration - 1 : introSkipSeconds
    );
    if (target > 0) video.currentTime = target;
  };

  const nextEpisodeCountdownSeconds = playerConfig.nextEpisodeCountdownSeconds ?? 90;
  const showNextEpisode =
    !!nextEpisodeInfo &&
    !!onPlayNextEpisode &&
    (playerConfig.nextEpisodeButtonEnabled ?? true) &&
    duration > 0 &&
    currentTime >= duration - nextEpisodeCountdownSeconds;
  const handleNextEpisode = () => {
    onPlayNextEpisode?.();
  };

  // Activer le plein écran automatiquement au démarrage (uniquement dans l'app Tauri : Android/webOS).
  // En navigateur web, l'API fullscreen exige un "user gesture" : on ne tente pas pour éviter l'erreur.
  // Le bouton plein écran reste utilisable partout (clic = user gesture).
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !hlsLoaded || hasAutoFullscreenedRef.current) return;
    if (!isTauri()) return;

    const handleFirstPlay = () => {
      const wantAutoFullscreen = shouldAutoFullscreen() || playerConfig.autoFullscreen;
      if (wantAutoFullscreen && !isFullscreen) {
        const container = document.getElementById('video-player-wrapper') || containerRef.current;
        if (container) {
          hasAutoFullscreenedRef.current = true;
          setTimeout(() => {
            toggleFullscreen(container).catch((err) => {
              const msg = err?.message ?? String(err);
              if (!msg.includes('user gesture') && !msg.includes('Permissions check')) {
                console.warn('Impossible d\'activer le plein écran automatique:', err);
              }
            });
          }, 300);
        }
      }
    };

    video.addEventListener('play', handleFirstPlay, { once: true });

    return () => {
      video.removeEventListener('play', handleFirstPlay);
    };
  }, [videoRef, hlsLoaded, isFullscreen, playerConfig.autoFullscreen]);

  const { isTV, focusedControlIndex, focusedOnProgress, setFocusedOnProgress, hasBack, tvScrubIndex, focusedOnScrub } = useTVPlayerNavigation({
    showControls,
    setShowControls,
    onPlayPause: handlePlayPause,
    onSeek: handleSeekTV,
    onVolumeChange: handleVolumeChangeTV,
    onToggleMute: toggleMute,
    onToggleFullscreen: handleToggleFullscreen,
    onClose,
    onOpenQualityMenu: onQualityChange != null ? () => openQualityMenuRef.current?.() : undefined,
    duration,
    currentTime,
    progressBarRef,
    scrubThumbnails: scrubThumbnails?.mediaId && scrubThumbnails.count > 0 ? scrubThumbnails : null,
    onScrubSeek: seekToTargetTime,
  });

  useTouchGestures({
    containerRef,
    onDoubleTap: handleDoubleTap,
    onSingleTap: () => {
      setShowControls((prev) => !prev);
    },
    enabled: !isTV,
  });

  // Message informatif "autres transcodages arrêtés" : afficher 5 s puis masquer
  useEffect(() => {
    if (!transcodingsEvictedMessage) return;
    const tId = window.setTimeout(() => setTranscodingsEvictedMessage(null), 5000);
    return () => clearTimeout(tId);
  }, [transcodingsEvictedMessage]);

  // Cleanup seek feedback timeout on unmount
  useEffect(() => {
    return () => {
      if (seekFeedbackTimeoutRef.current) clearTimeout(seekFeedbackTimeoutRef.current);
    };
  }, []);

  const [isWaiting, setIsWaiting] = useState(false);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onWaiting = () => setIsWaiting(true);
    const onReady = () => setIsWaiting(false);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('canplay', onReady);
    video.addEventListener('playing', onReady);
    return () => {
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('canplay', onReady);
      video.removeEventListener('playing', onReady);
    };
  }, [videoRef, src]);

  const displayError = error;
  const shouldShowBuffering = isLoading || isWaiting || (isSeeking && bufferedPercent < 100);
  /** En cas d'erreur, garder les contrôles visibles pour permettre d'appuyer sur Retour */
  const effectiveShowControls = showControls || !!displayError;

  return (
    <div 
      ref={containerRef}
      class="w-full h-full flex flex-col relative bg-black group" 
      id="hls-player-container" 
      style={{ 
        width: '100%', 
        height: '100%',
        transform: 'translateZ(0)',
        willChange: 'contents',
        backfaceVisibility: 'hidden',
      }}
    >
      <div 
        class="relative flex-1 min-h-0 bg-black overflow-hidden" 
        style={{ 
          width: '100%', 
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transform: 'translateZ(0)',
          willChange: 'transform',
        }}
      >
        {transcodingsEvictedMessage && (
          <div
            class="absolute bottom-16 left-1/2 -translate-x-1/2 z-20 px-4 py-2 rounded-lg bg-black/80 text-white text-sm text-center shadow-lg toast-animate max-w-[90%]"
            role="status"
          >
            {transcodingsEvictedMessage}
          </div>
        )}
        {seekFeedback && (
          <div
            class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 px-6 py-3 rounded-lg bg-black/85 text-white text-2xl font-semibold shadow-lg animate-pulse"
            role="status"
          >
            {seekFeedback.direction === 'left'
              ? t('playback.seekBack', { seconds: seekFeedback.seconds })
              : t('playback.seekForward', { seconds: seekFeedback.seconds })}
          </div>
        )}
        {displayError && (
          <div class="absolute inset-0 z-10 flex items-center justify-center bg-black/90">
            <ErrorDisplay error={displayError} />
          </div>
        )}
        {shouldShowBuffering && (
          <PlayerBufferingOverlay
            title={torrentName || fileName}
            bufferedPercent={overlayBufferedPercent}
            detailMessage={
              loadingStatusMessage ||
              (isLocalLibraryMedia && isLoading
                ? t('playback.phase.preparingPlayback') || 'Préparation de la lecture…'
                : undefined)
            }
            torrentStats={isLocalLibraryMedia ? null : torrentStats}
            posterUrl={posterUrl}
            imageUrl={posterUrl}
            onClose={onClose}
            closeLabel={t('playback.stopPlayback') || t('common.close')}
          />
        )}
        <video
          ref={videoRef}
          class="relative z-0 w-full h-full"
          playsInline
          preload="auto"
          autoplay={playerConfig.autoplay}
          muted={playerConfig.muted}
          poster="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'%3E%3Crect fill='%23000' width='1' height='1'/%3E%3C/svg%3E"
          style={{
            transform: playerConfig.hardwareAcceleration ? 'translateZ(0)' : 'none',
            willChange: 'auto',
            backfaceVisibility: playerConfig.hardwareAcceleration ? 'hidden' : 'visible',
            width: '100%',
            height: '100%',
            objectFit: playerConfig.videoFillMode ?? 'contain',
            display: 'block',
            backgroundColor: '#000',
          }}
          onClick={(e: any) => {
            const target = e.target as HTMLElement;
            if (target.closest('.pointer-events-auto')) {
              return;
            }
            e.preventDefault();
            e.stopPropagation();
            handlePlayPause();
          }}
        />
        <VideoControls
          torrentName={torrentName}
          posterUrl={posterUrl}
          logoUrl={logoUrl}
          synopsis={synopsis}
          releaseDate={releaseDate}
          seriesSeasonNum={seriesSeason}
          seriesEpisodeNum={seriesEpisode}
          showControls={effectiveShowControls}
          isPlaying={isPlaying}
          bufferedPercent={bufferedPercent}
          currentTime={currentTime}
          duration={duration}
          isMuted={isMuted}
          volume={volume}
          isFullscreen={isFullscreen}
          isTV={isTV}
          focusedControlIndex={focusedControlIndex}
          focusedOnProgress={focusedOnProgress}
          setFocusedOnProgress={setFocusedOnProgress}
          progressBarRef={progressBarRef}
          hasBackButton={hasBack}
          onPlayPause={handlePlayPause}
          onSeek={baseHandleSeek}
          onSeekToTime={seekToTargetTime}
          onVolumeChange={baseHandleVolumeChange}
          onToggleMute={toggleMute}
          onToggleFullscreen={handleToggleFullscreen}
          onSeekTV={handleSeekTV}
          onVolumeChangeTV={handleVolumeChangeTV}
          audioTracks={audioTracks}
          subtitleTracks={subtitleTracks}
          currentAudioTrack={currentAudioTrack}
          currentSubtitleTrack={currentSubtitleTrack}
          showSubtitleSelector={showSubtitleSelector}
          onChangeAudioTrack={changeAudioTrack}
          onChangeSubtitleTrack={changeSubtitleTrack}
          onToggleSubtitleSelector={toggleSubtitleSelector}
          onCloseSubtitleSelector={() => setShowSubtitleSelector(false)}
          showLogo={playerConfig.showLogo}
          onClose={onClose}
          onRestart={handleRestart}
          showQualitySelector={onQualityChange != null}
          streamQuality={streamQuality ?? null}
          onQualityChange={onQualityChange}
          onOpenQualityMenuRef={openQualityMenuRef}
          showCastButton={chromecast.isAvailable}
          isCasting={chromecast.isCasting}
          onCastClick={() => chromecast.castMedia(src, torrentName ?? fileName, currentTime)}
          videoFillMode={playerConfig.videoFillMode ?? 'contain'}
          scrubThumbnails={scrubThumbnails ?? null}
          scrubThumbnailsLoading={scrubThumbnailsLoading}
          tvScrubIndexExternal={isTV ? tvScrubIndex : undefined}
          tvScrubFocused={isTV ? focusedOnScrub : undefined}
          onPlayNextEpisode={
            nextEpisodeInfo && onPlayNextEpisode && (playerConfig.nextEpisodeButtonEnabled ?? true)
              ? onPlayNextEpisode
              : undefined
          }
          seriesEpisodePickerItems={seriesEpisodePickerItems}
          selectedSeriesEpisodeVariantId={selectedSeriesEpisodeVariantId}
          onSelectSeriesEpisode={onSelectSeriesEpisode}
        />
        <div class="absolute inset-0 z-30 pointer-events-none">
          <SkipIntroOverlay onSkip={handleSkipIntro} visible={showSkipIntro} />
          <NextEpisodeOverlay
            onNext={handleNextEpisode}
            visible={showNextEpisode}
            nextTitle={nextEpisodeInfo?.title}
          />
        </div>
      </div>
    </div>
  );
}
