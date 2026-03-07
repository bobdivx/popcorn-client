import { useEffect, useState, useRef } from 'preact/hooks';
import { useVideoControls } from '../player-shared/hooks/useVideoControls';
import { useFullscreen, toggleFullscreen } from '../player-shared/hooks/useFullscreen';
import { ErrorDisplay } from '../player-shared/components/ErrorDisplay';
import { VideoControls } from '../player-shared/components/VideoControls';
import type { LuciePlayerProps } from './types';
import { useLuciePlayer } from './hooks/useLuciePlayer';
import { useTVPlayerNavigation } from '../player-shared/hooks/useTVPlayerNavigation';
import { usePlayerConfig } from '../player-shared/hooks/usePlayerConfig';
import { shouldAutoFullscreen } from '../../../lib/utils/device-detection';
import { SkipIntroOverlay } from '../player-shared/components/SkipIntroOverlay';
import { NextEpisodeOverlay } from '../player-shared/components/NextEpisodeOverlay';
import { useI18n } from '../../../lib/i18n';

export default function LuciePlayer({ 
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
  onBufferProgress,
  onClose,
  baseUrl: baseUrlProp,
  stopBufferRef,
  onProgress,
}: LuciePlayerProps) {
  const playerConfig = usePlayerConfig();
  const { t } = useI18n();
  const canAutoPlayRef = useRef<(() => boolean) | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const hasAutoFullscreenedRef = useRef(false);
  const [lucieDuration, setLucieDuration] = useState<number | undefined>(undefined);
  
  const { videoRef, isLoading, error, lucieLoaded, manifest, stopBuffer } = useLuciePlayer({
    src,
    infoHash,
    fileName,
    torrentId,
    filePath,
    tmdbId,
    tmdbType,
    startFromBeginning,
    onError,
    onLoadingChange,
    canAutoPlay: () => canAutoPlayRef.current ? canAutoPlayRef.current() : true,
    onDurationChange: (duration) => {
      setLucieDuration(duration);
    },
    baseUrl: baseUrlProp,
  });
  
  // Exposer stopBuffer via ref pour que le parent puisse l'appeler à la fermeture
  useEffect(() => {
    if (stopBufferRef) {
      (stopBufferRef as { current: (() => void) | null }).current = stopBuffer;
      return () => {
        (stopBufferRef as { current: (() => void) | null }).current = null;
      };
    }
  }, [stopBuffer, stopBufferRef]);

  const effectiveDuration = duration > 0 ? duration : (lucieDuration ?? 0);
  useEffect(() => {
    if (!onProgress || effectiveDuration <= 0) return;
    const id = setInterval(() => onProgress(currentTime, effectiveDuration), 15000);
    return () => {
      clearInterval(id);
      onProgress(currentTime, effectiveDuration);
    };
  }, [onProgress, currentTime, effectiveDuration]);

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
    hlsLoaded: lucieLoaded,
    hlsDuration: lucieDuration,
    isLoading,
    canUseSeekReload: false, // Pas de reload avec seek pour Lucie
    reloadWithSeek: () => {}, // Pas utilisé pour Lucie
  });

  useEffect(() => {
    if (onBufferProgress) {
      onBufferProgress(bufferedPercent);
    }
  }, [bufferedPercent, onBufferProgress]);
  
  useEffect(() => {
    canAutoPlayRef.current = canAutoPlay;
  }, [canAutoPlay]);

  const [showControls, setShowControls] = useState(baseShowControls);

  useEffect(() => {
    setShowControls(baseShowControls);
  }, [baseShowControls]);

  const handleSeekTV = (direction: 'left' | 'right', stepSeconds = 10) => {
    if (!duration) return;
    const newTime = direction === 'left'
      ? Math.max(0, currentTime - stepSeconds)
      : Math.min(duration, currentTime + stepSeconds);
    seekToTargetTime(newTime);
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
    const container = document.getElementById('video-player-wrapper') || 
                      containerRef.current ||
                      document.getElementById('lucie-player-container');
    if (!container) {
      console.warn('Aucun conteneur trouvé pour le plein écran');
      return;
    }
    toggleFullscreen(container).catch((err) => {
      console.error('Erreur lors du toggle plein écran:', err);
    });
  };

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
    if (!video || !lucieLoaded || hasAutoFullscreenedRef.current) return;

    const handleFirstPlay = () => {
      const wantAutoFullscreen = shouldAutoFullscreen() || playerConfig.autoFullscreen;
      if (wantAutoFullscreen && !isFullscreen) {
        const container = document.getElementById('video-player-wrapper') || containerRef.current;
        if (container) {
          hasAutoFullscreenedRef.current = true;
          setTimeout(() => {
            toggleFullscreen(container).catch((err) => {
              console.warn('Impossible d\'activer le plein écran automatique:', err);
            });
          }, 300);
        }
      }
    };

    video.addEventListener('play', handleFirstPlay, { once: true });

    return () => {
      video.removeEventListener('play', handleFirstPlay);
    };
  }, [videoRef, lucieLoaded, isFullscreen, playerConfig.autoFullscreen]);

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

  const displayError = error;
  const shouldShowBuffering = isLoading || (isSeeking && bufferedPercent < 100);

  if (displayError) {
    return <ErrorDisplay error={displayError} />;
  }

  return (
    <div 
      ref={containerRef}
      class="w-full h-full flex flex-col relative bg-black group" 
      id="lucie-player-container" 
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
        {shouldShowBuffering && (
          <div class="absolute inset-0 flex flex-col items-center justify-center bg-black z-10">
            <div class="loading-icon-container mb-6">
              <div class="loading-icon-ring-outer"></div>
              <div class="loading-icon-ring-middle"></div>
              <div class="loading-icon-glow"></div>
              <div class="loading-icon-circle">
                <img
                  src="/popcorn_logo.png"
                  alt=""
                  class="w-full h-full object-contain"
                  style={{ filter: 'drop-shadow(0 0 10px rgba(168, 85, 247, 0.5))' }}
                />
              </div>
            </div>
            <p class="text-white/80 text-lg font-medium">
              {bufferedPercent > 0
                ? t('playback.bufferingProgress', { percent: Math.round(bufferedPercent) })
                : t('playback.buffering')}
            </p>
            <div class="ds-progress-container mt-4 mb-2 max-w-[16rem]">
              <div class="ds-progress-bar"></div>
              <div class="ds-progress-wave"></div>
            </div>
            <div class="mt-4 px-3 py-1 bg-primary-500/20 border border-primary-400/50 rounded-full">
              <span class="text-primary-200 text-sm font-semibold">Lucie Player</span>
            </div>
            <div class="flex gap-1 mt-2">
              <span
                class="w-2 h-2 bg-primary-500 rounded-full"
                style={{ animation: 'hls-bounce 1.4s infinite ease-in-out both', animationDelay: '0s' }}
              />
              <span
                class="w-2 h-2 bg-primary-500 rounded-full"
                style={{ animation: 'hls-bounce 1.4s infinite ease-in-out both', animationDelay: '0.2s' }}
              />
              <span
                class="w-2 h-2 bg-primary-500 rounded-full"
                style={{ animation: 'hls-bounce 1.4s infinite ease-in-out both', animationDelay: '0.4s' }}
              />
            </div>
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
          showControls={showControls}
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
          audioTracks={[]} // Pas de sélection de pistes audio pour Lucie
          subtitleTracks={[]} // Pas de sous-titres pour Lucie (pour l'instant)
          currentAudioTrack={-1}
          currentSubtitleTrack={-1}
          showSubtitleSelector={false}
          onChangeAudioTrack={() => {}}
          onChangeSubtitleTrack={() => {}}
          onToggleSubtitleSelector={() => {}}
          onCloseSubtitleSelector={() => {}}
          showLogo={playerConfig.showLogo}
          onClose={onClose}
          onRestart={handleRestart}
          videoFillMode={playerConfig.videoFillMode ?? 'contain'}
          onPlayNextEpisode={
            nextEpisodeInfo && onPlayNextEpisode && (playerConfig.nextEpisodeButtonEnabled ?? true)
              ? onPlayNextEpisode
              : undefined
          }
        />
        {/* Overlays skip intro / épisode suivant */}
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
