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
import { NextEpisodeOverlay } from '../player-shared/components/NextEpisodeOverlay';
import { SkipIntroOverlay } from '../player-shared/components/SkipIntroOverlay';
import PlayerBufferingOverlay from '../player-shared/components/PlayerBufferingOverlay';
import { useI18n } from '../../../lib/i18n';
import { useChromecast } from '../../../lib/chromecast/useChromecast';
import { useTouchGestures } from '../player-shared/hooks/useTouchGestures';
import { useDebouncedVideoWaiting } from '../player-shared/hooks/useDebouncedVideoWaiting';
import { formatTime } from '../player-shared/utils/formatTime';
import { useEffectiveVideoFillMode } from '../player-shared/hooks/useEffectiveVideoFillMode';

export default function LuciePlayer({ 
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
  onBufferProgress,
  onClose,
  baseUrl: baseUrlProp,
  stopBufferRef,
  onProgress,
  scrubThumbnails,
  scrubThumbnailsLoading,
}: LuciePlayerProps) {
  const playerConfig = usePlayerConfig();
  const effectiveVideoFillMode = useEffectiveVideoFillMode(playerConfig.videoFillMode);
  const { t } = useI18n();
  const chromecast = useChromecast();
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
    seriesSeason,
    seriesEpisode,
    variantId,
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

  const isFullscreen = useFullscreen();
  
  const {
    showControls,
    setShowControls,
    revealControls,
    isPlaying,
    currentTime,
    duration,
    bufferedPercent,
    bufferedTimelinePercent,
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

  // Reprendre / Revoir : après useVideoControls (évite TDZ) + refs (évite spam API)
  const effectiveDuration = duration > 0 ? duration : (lucieDuration ?? 0);
  const currentTimeRef = useRef(currentTime);
  const effectiveDurationRef = useRef(effectiveDuration);
  currentTimeRef.current = currentTime;
  effectiveDurationRef.current = effectiveDuration;
  useEffect(() => {
    if (!onProgress || effectiveDuration <= 0) return;
    onProgress(currentTimeRef.current, effectiveDuration);
    const id = setInterval(() => {
      onProgress(currentTimeRef.current, effectiveDurationRef.current);
    }, 15000);
    return () => {
      clearInterval(id);
      onProgress(currentTimeRef.current, effectiveDurationRef.current);
    };
  }, [onProgress, effectiveDuration]);

  useEffect(() => {
    if (onBufferProgress) {
      onBufferProgress(bufferedPercent);
    }
  }, [bufferedPercent, onBufferProgress]);
  
  useEffect(() => {
    canAutoPlayRef.current = canAutoPlay;
  }, [canAutoPlay]);

  const [seekFeedback, setSeekFeedback] = useState<{ direction: 'left' | 'right'; seconds: number; targetTime?: number } | null>(null);
  const seekFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSeekTV = (direction: 'left' | 'right', stepSeconds = 10) => {
    if (!duration) return;
    const newTime = direction === 'left'
      ? Math.max(0, currentTime - stepSeconds)
      : Math.min(duration, currentTime + stepSeconds);
    seekToTargetTime(newTime);
    if (seekFeedbackTimeoutRef.current) clearTimeout(seekFeedbackTimeoutRef.current);
    setSeekFeedback({ direction, seconds: stepSeconds, targetTime: newTime });
    seekFeedbackTimeoutRef.current = setTimeout(() => {
      setSeekFeedback(null);
      seekFeedbackTimeoutRef.current = null;
    }, 800);
  };

  const handleSeekPreview = (
    info: { targetTime: number; direction: 'left' | 'right'; stepSeconds: number } | null,
  ) => {
    if (seekFeedbackTimeoutRef.current) {
      clearTimeout(seekFeedbackTimeoutRef.current);
      seekFeedbackTimeoutRef.current = null;
    }
    if (!info) {
      setSeekFeedback(null);
      return;
    }
    setSeekFeedback({
      direction: info.direction,
      seconds: info.stepSeconds,
      targetTime: info.targetTime,
    });
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

  useEffect(() => {
    return () => {
      if (seekFeedbackTimeoutRef.current) clearTimeout(seekFeedbackTimeoutRef.current);
    };
  }, []);

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
  const showSkipIntro =
    isSeries &&
    (playerConfig.skipIntroEnabled ?? true) &&
    introSkipSeconds > 0 &&
    effectiveDuration > introSkipSeconds &&
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

  const { isTV, focusedControlIndex, focusedOnProgress, setFocusedOnProgress, hasBack, tvScrubIndex, focusedOnScrub, tvScrubBrowsing } = useTVPlayerNavigation({
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
    isPlaying,
    videoRef,
    progressBarRef,
    scrubThumbnails: scrubThumbnails?.mediaId && scrubThumbnails.count > 0 ? scrubThumbnails : null,
    onScrubSeek: seekToTargetTime,
    onSeekPreview: handleSeekPreview,
  });

  useTouchGestures({
    containerRef,
    onDoubleTap: handleDoubleTap,
    onSingleTap: () => {
      if (showControls) {
        setShowControls(false);
      } else {
        revealControls();
      }
    },
    enabled: !isTV,
  });

  const isWaiting = useDebouncedVideoWaiting(videoRef, [src]);

  const displayError = error;
  const shouldShowBuffering =
    isLoading || isWaiting || (isSeeking && bufferedPercent < 95);
  const overlayBufferedPercent =
    isLoading || isWaiting || bufferedPercent >= 100
      ? bufferedPercent > 0 && bufferedPercent < 100
        ? bufferedPercent
        : null
      : bufferedPercent > 0
        ? bufferedPercent
        : null;

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
        {seekFeedback && (
          <div
            class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 px-6 py-3 rounded-lg bg-black/85 text-white text-2xl font-semibold shadow-lg"
            role="status"
          >
            {seekFeedback.targetTime != null
              ? formatTime(seekFeedback.targetTime)
              : seekFeedback.direction === 'left'
                ? t('playback.seekBack', { seconds: seekFeedback.seconds })
                : t('playback.seekForward', { seconds: seekFeedback.seconds })}
          </div>
        )}
        {shouldShowBuffering && (
          <PlayerBufferingOverlay
            title={torrentName || fileName}
            bufferedPercent={overlayBufferedPercent}
            torrentStats={torrentStats}
            posterUrl={posterUrl}
            imageUrl={posterUrl}
            onClose={onClose}
            closeLabel={t('playback.stopPlayback') || t('common.close')}
            badge="Lucie Player"
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
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: effectiveVideoFillMode,
            objectPosition: 'center center',
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
            if (isTV && !showControls) {
              revealControls();
              return;
            }
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
          showControls={showControls}
          isPlaying={isPlaying}
          bufferedPercent={bufferedTimelinePercent}
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
          onRevealControls={revealControls}
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
          showCastButton={chromecast.isAvailable}
          isCasting={chromecast.isCasting}
          onCastClick={() => chromecast.castMedia(src, torrentName ?? fileName, currentTime)}
          videoFillMode={playerConfig.videoFillMode ?? 'contain'}
          scrubThumbnails={scrubThumbnails ?? null}
          scrubThumbnailsLoading={scrubThumbnailsLoading}
          tvScrubIndexExternal={isTV ? tvScrubIndex : undefined}
          tvScrubFocused={isTV ? focusedOnScrub : undefined}
          tvScrubBrowsing={isTV ? tvScrubBrowsing : undefined}
          onPlayNextEpisode={
            nextEpisodeInfo && onPlayNextEpisode && (playerConfig.nextEpisodeButtonEnabled ?? true)
              ? onPlayNextEpisode
              : undefined
          }
        />
        <div class="absolute inset-0 z-30 pointer-events-none">
          <SkipIntroOverlay
            onSkip={handleSkipIntro}
            visible={showSkipIntro}
            chromeVisible={showControls}
          />
          <NextEpisodeOverlay
            onNext={handleNextEpisode}
            visible={showNextEpisode}
            nextTitle={nextEpisodeInfo?.title}
            chromeVisible={showControls}
          />
        </div>
      </div>
    </div>
  );
}
