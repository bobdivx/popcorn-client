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
import { SkipIntroOverlay } from '../player-shared/components/SkipIntroOverlay';
import { NextEpisodeOverlay } from '../player-shared/components/NextEpisodeOverlay';
import { useI18n } from '../../../lib/i18n';

export default function HLSPlayer({ 
  src, 
  infoHash, 
  fileName, 
  torrentName,
  posterUrl,
  logoUrl,
  synopsis,
  releaseDate,
  torrentId, 
  filePath, 
  tmdbId,
  tmdbType,
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
}: HLSPlayerProps) {
  const playerConfig = usePlayerConfig();
  const { t } = useI18n();
  const canAutoPlayRef = useRef<(() => boolean) | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    if (onBufferProgress) {
      onBufferProgress(bufferedPercent);
    }
  }, [bufferedPercent, onBufferProgress]);
  
  useEffect(() => {
    canAutoPlayRef.current = canAutoPlay;
  }, [canAutoPlay]);

  // Reprendre / Revoir : enregistrer la progression périodiquement et à la fermeture
  const effectiveDuration = duration > 0 ? duration : (hlsDuration ?? 0);
  useEffect(() => {
    if (!onProgress || effectiveDuration <= 0) return;
    const id = setInterval(() => onProgress(currentTime, effectiveDuration), 15000);
    return () => {
      clearInterval(id);
      onProgress(currentTime, effectiveDuration);
    };
  }, [onProgress, currentTime, effectiveDuration]);

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
  const nextEpisodeCountdownSeconds = playerConfig.nextEpisodeCountdownSeconds ?? 90;
  const showSkipIntro =
    isSeries &&
    duration > introSkipSeconds &&
    currentTime >= 0 &&
    currentTime <= introSkipSeconds;
  const handleSkipIntro = () => {
    const video = videoRef.current;
    if (video) {
      video.currentTime = introSkipSeconds;
    }
  };
  const showNextEpisode =
    !!nextEpisodeInfo &&
    !!onPlayNextEpisode &&
    (playerConfig.nextEpisodeButtonEnabled ?? true) &&
    duration > 0 &&
    currentTime >= duration - nextEpisodeCountdownSeconds;
  const handleNextEpisode = () => {
    onPlayNextEpisode?.();
  };

  // Activer le plein écran automatiquement au démarrage sur mobile/Android
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !hlsLoaded || hasAutoFullscreenedRef.current) return;

    const handleFirstPlay = () => {
      const wantAutoFullscreen = shouldAutoFullscreen() || playerConfig.autoFullscreen;
      if (wantAutoFullscreen && !isFullscreen) {
        // Utiliser video-player-wrapper en priorité pour le plein écran automatique
        const container = document.getElementById('video-player-wrapper') || containerRef.current;
        if (container) {
          hasAutoFullscreenedRef.current = true;
          // Petit délai pour s'assurer que la vidéo est bien prête
          setTimeout(() => {
            toggleFullscreen(container).catch((err) => {
              console.warn('Impossible d\'activer le plein écran automatique:', err);
            });
          }, 300); // Délai un peu plus long pour laisser le temps au navigateur
        }
      }
    };

    video.addEventListener('play', handleFirstPlay, { once: true });

    return () => {
      video.removeEventListener('play', handleFirstPlay);
    };
  }, [videoRef, hlsLoaded, isFullscreen, playerConfig.autoFullscreen]);

  const { isTV, focusedControlIndex, focusedOnProgress, setFocusedOnProgress, hasBack } = useTVPlayerNavigation({
    showControls,
    setShowControls,
    onPlayPause: handlePlayPause,
    onSeek: handleSeekTV,
    onVolumeChange: handleVolumeChangeTV,
    onToggleMute: toggleMute,
    onToggleFullscreen: handleToggleFullscreen,
    onClose,
    duration,
    currentTime,
    progressBarRef,
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

  const displayError = error;
  const shouldShowBuffering = isLoading || (isSeeking && bufferedPercent < 100);
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
          <div class="absolute inset-0 flex flex-col items-center justify-center bg-black z-10">
            {/* Animation du logo Popcorn */}
            <div class="relative w-32 h-32 mb-6">
              {/* Cercle de chargement externe */}
              <div class="absolute inset-0 border-4 border-primary-600/20 rounded-full"></div>
              <div 
                class="absolute inset-0 border-4 border-primary-600 border-t-transparent rounded-full"
                style={{
                  animation: 'spin 1s linear infinite',
                }}
              ></div>
              {/* Logo Popcorn avec animation pulse */}
              <div 
                class="absolute inset-2 flex items-center justify-center"
                style={{
                  animation: 'pulse 2s ease-in-out infinite',
                }}
              >
                <img 
                  src="/popcorn_logo.png" 
                  alt="Popcorn" 
                  class="w-full h-full object-contain drop-shadow-lg"
                  style={{
                    filter: 'drop-shadow(0 0 10px rgba(220, 38, 38, 0.5))',
                  }}
                />
              </div>
            </div>
            <p class="text-white/80 text-lg font-medium">
              {bufferedPercent > 0
                ? t('playback.bufferingProgress', { percent: Math.round(bufferedPercent) })
                : t('playback.buffering')}
            </p>
            {/* Points animés */}
            <div class="flex gap-1 mt-2">
              <span 
                class="w-2 h-2 bg-primary-600 rounded-full"
                style={{ animation: 'bounce 1.4s infinite ease-in-out both', animationDelay: '0s' }}
              ></span>
              <span 
                class="w-2 h-2 bg-primary-600 rounded-full"
                style={{ animation: 'bounce 1.4s infinite ease-in-out both', animationDelay: '0.2s' }}
              ></span>
              <span 
                class="w-2 h-2 bg-primary-600 rounded-full"
                style={{ animation: 'bounce 1.4s infinite ease-in-out both', animationDelay: '0.4s' }}
              ></span>
            </div>
            {/* Keyframes CSS inline */}
            <style>{`
              @keyframes spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
              }
              @keyframes pulse {
                0%, 100% { transform: scale(1); opacity: 1; }
                50% { transform: scale(0.9); opacity: 0.8; }
              }
              @keyframes bounce {
                0%, 80%, 100% { transform: scale(0); }
                40% { transform: scale(1); }
              }
            `}</style>
          </div>
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
            objectFit: 'contain',
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
          showControls={effectiveShowControls}
          isPlaying={isPlaying}
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
          onPlayNextEpisode={
            nextEpisodeInfo && onPlayNextEpisode && (playerConfig.nextEpisodeButtonEnabled ?? true)
              ? onPlayNextEpisode
              : undefined
          }
        />
        {/* Overlays skip intro / épisode suivant au-dessus des contrôles (z-30) pour rester cliquables */}
        {showSkipIntro && (
          <div class="absolute inset-0 z-30 pointer-events-none">
            <SkipIntroOverlay onSkip={handleSkipIntro} visible={showSkipIntro} />
          </div>
        )}
        {showNextEpisode && (
          <div class="absolute inset-0 z-30 pointer-events-none">
            <NextEpisodeOverlay
              onNext={handleNextEpisode}
              visible={showNextEpisode}
              nextTitle={nextEpisodeInfo?.title}
            />
          </div>
        )}
      </div>
    </div>
  );
}
