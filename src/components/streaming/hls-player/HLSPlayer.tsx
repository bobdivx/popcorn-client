import { useEffect, useState, useRef, useCallback } from 'preact/hooks';
import { useVideoControls } from '../player-shared/hooks/useVideoControls';
import { useFullscreen, toggleFullscreen } from '../player-shared/hooks/useFullscreen';
import { PlaybackStatusSurface } from '../player-shared/components/PlaybackStatusSurface';
import { VideoControls } from '../player-shared/components/VideoControls';
import type { HLSPlayerProps } from './types';
import { useHlsPlayer } from './hooks/useHlsPlayer';
import { useTVPlayerNavigation } from '../player-shared/hooks/useTVPlayerNavigation';
import { useHlsTracks } from './hooks/useHlsTracks';
import { usePlayerConfig } from '../player-shared/hooks/usePlayerConfig';
import { shouldAutoFullscreen, isTVPlatform, isWebOSTV } from '../../../lib/utils/device-detection';
import { isTauri } from '../../../lib/utils/tauri';
import { NextEpisodeOverlay } from '../player-shared/components/NextEpisodeOverlay';
import { SkipIntroOverlay } from '../player-shared/components/SkipIntroOverlay';
import PlayerBufferingOverlay from '../player-shared/components/PlayerBufferingOverlay';
import { usePlaybackLiveTrace } from '../player-shared/hooks/usePlaybackLiveTrace';
import { playbackDebugUrl, pipelineHeadline } from '../../../lib/streaming/playbackPipeline';
import {
  isUhdQualityAttempt,
  shouldFallbackUhdPlayback,
  UHD_FALLBACK_HEIGHT,
} from '../../../lib/streaming/uhdPlaybackFallback';
import { emitPlaybackStep } from '../player-core/observability/playbackEvents';
import { useI18n } from '../../../lib/i18n';
import { useChromecast } from '../../../lib/chromecast/useChromecast';
import { useTouchGestures } from '../player-shared/hooks/useTouchGestures';
import { useDebouncedVideoWaiting } from '../player-shared/hooks/useDebouncedVideoWaiting';
import { formatTime } from '../player-shared/utils/formatTime';
import { useEffectiveVideoFillMode } from '../player-shared/hooks/useEffectiveVideoFillMode';
import { nextBufferingOverlayVisible, getEngineBufferAhead, hasMediaPlaybackStarted } from '../player-shared/utils/bufferMetrics';

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
}: HLSPlayerProps) {
  const playerConfig = usePlayerConfig();
  const effectiveVideoFillMode = useEffectiveVideoFillMode(playerConfig.videoFillMode);
  const { t } = useI18n();
  const chromecast = useChromecast();
  const canAutoPlayRef = useRef<(() => boolean) | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const openQualityMenuRef = useRef<(() => void) | null>(null);
  const hasAutoFullscreenedRef = useRef(false);
  const [hlsDuration, setHlsDuration] = useState<number | undefined>(undefined);
  const hlsDurationRef = useRef<number>(0);
  const [uhdFallbackMessage, setUhdFallbackMessage] = useState<string | null>(null);
  const uhdFallbackDoneRef = useRef(false);

  useEffect(() => {
    uhdFallbackDoneRef.current = false;
    setUhdFallbackMessage(null);
  }, [infoHash, filePath]);

  const onUhdStartFailed = useCallback(
    (reason: 'media' | 'fatal') => {
      if (uhdFallbackDoneRef.current) return false;
      if (!onQualityChange) return false;
      if (!isUhdQualityAttempt(maxHeight)) return false;
      uhdFallbackDoneRef.current = true;
      setUhdFallbackMessage(t('playback.hls.uhdFallback1080'));
      emitPlaybackStep('fallback_uhd_to_1080', { message: reason });
      emitPlaybackStep('fallback_message_shown');
      onQualityChange(UHD_FALLBACK_HEIGHT);
      return true;
    },
    [maxHeight, onQualityChange, t],
  );
  
  // Réinitialiser hlsDurationRef quand on change de vidéo
  useEffect(() => {
    hlsDurationRef.current = 0;
    setHlsDuration(undefined);
  }, [infoHash, filePath]);

  const { videoRef, hlsRef, isLoading, playbackStarted, pendingSeekPosition, error, hlsLoaded, loadingStatusMessage, stopBuffer, reloadWithSeek } = useHlsPlayer({
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
    onUhdStartFailed,
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

  const apiFullscreen = useFullscreen();
  const isTvPlayback = isTVPlatform() || isWebOSTV();
  const isFullscreen = apiFullscreen || isTvPlayback;
  const isLocalLibraryMedia =
    typeof infoHash === 'string' && infoHash.startsWith('local_');
  
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
    hlsLoaded,
    hlsDuration,
    isLoading,
    pendingSeekPosition,
    // Réactivé pour local_ : la protection active_seek_target côté serveur empêche les 503 en boucle.
    // Maintenant, reloadWithSeek fonctionne correctement pour tous les types de fichiers.
    canUseSeekReload: canUseSeekReloadProp ?? true,
    reloadWithSeek,
  });

  const isSeekSettling = isLoading && pendingSeekPosition > 0;

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

  const [transcodingsEvictedMessage, setTranscodingsEvictedMessage] = useState<string | null>(null);
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

  /** Preview télécommande sans seek (flèches) — le commit arrive via onScrubSeek au settle / Enter. */
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

  // Plein écran TV : la WebView webOS (URL client.popcornn.app) n’est pas Tauri,
  // et l’événement `play` arrive souvent avant hls.js. Ne pas exiger les deux.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || hasAutoFullscreenedRef.current) return;
    const tv = isTVPlatform() || isWebOSTV();
    if (!isTauri() && !tv) return;

    const enter = () => {
      if (hasAutoFullscreenedRef.current) return;
      const wantAutoFullscreen = shouldAutoFullscreen() || playerConfig.autoFullscreen || tv;
      if (!wantAutoFullscreen) return;
      const container = document.getElementById('video-player-wrapper') || containerRef.current;
      if (!container) return;
      hasAutoFullscreenedRef.current = true;
      toggleFullscreen(container).catch(() => {
        /* webOS : l’API fullscreen échoue souvent ; le layout TV est déjà inset-0. */
      });
    };

    video.addEventListener('play', enter, { once: true });
    video.addEventListener('playing', enter, { once: true });
    if (playbackStarted) enter();
    return () => {
      video.removeEventListener('play', enter);
      video.removeEventListener('playing', enter);
    };
  }, [videoRef, hlsLoaded, playbackStarted, playerConfig.autoFullscreen]);

  const { isTV, focusedControlIndex, focusedOnProgress, setFocusedOnProgress, hasBack, tvScrubIndex, focusedOnScrub, tvScrubBrowsing } = useTVPlayerNavigation({
    showControls,
    setShowControls,
    onPlayPause: handlePlayPause,
    onSeek: handleSeekTV,
    onVolumeChange: handleVolumeChangeTV,
    onToggleMute: toggleMute,
    onToggleFullscreen: handleToggleFullscreen,
    onClose,
    onOpenQualityMenu: onQualityChange != null ? () => openQualityMenuRef.current?.() : undefined,
    onToggleSubtitles: toggleSubtitleSelector,
    duration,
    currentTime,
    isPlaying,
    videoRef,
    progressBarRef,
    scrubThumbnails: scrubThumbnails?.mediaId && scrubThumbnails.count > 0 ? scrubThumbnails : null,
    onScrubSeek: seekToTargetTime,
    onSeekPreview: handleSeekPreview,
  });

  useEffect(() => {
    if (!isTV || !playbackStarted) return;
    setShowControls(true);
    const wrap =
      document.getElementById('video-player-wrapper') ||
      containerRef.current ||
      document.getElementById('hls-player-container');
    wrap?.focus({ preventScroll: true });
  }, [isTV, playbackStarted, setShowControls]);

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

  const isWaiting = useDebouncedVideoWaiting(videoRef, [src, hlsLoaded]);
  const [bufferingOverlayVisible, setBufferingOverlayVisible] = useState(true);
  const [mediaVisiblyPlaying, setMediaVisiblyPlaying] = useState(false);

  useEffect(() => {
    setBufferingOverlayVisible(true);
    setMediaVisiblyPlaying(false);
  }, [src, infoHash, filePath]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const syncFromElement = () => {
      if (!hasMediaPlaybackStarted(video)) return;
      setMediaVisiblyPlaying(true);
      setBufferingOverlayVisible(false);
      onLoadingChange?.(false);
    };
    video.addEventListener('playing', syncFromElement);
    video.addEventListener('play', syncFromElement);
    video.addEventListener('timeupdate', syncFromElement);
    const id = window.setInterval(syncFromElement, 200);
    syncFromElement();
    return () => {
      video.removeEventListener('playing', syncFromElement);
      video.removeEventListener('play', syncFromElement);
      video.removeEventListener('timeupdate', syncFromElement);
      window.clearInterval(id);
    };
  }, [src, infoHash, filePath, hlsLoaded, onLoadingChange]);

  useEffect(() => {
    const tick = () => {
      const video = videoRef.current;
      const ahead = getEngineBufferAhead(
        video?.buffered,
        Number.isFinite(video?.currentTime) ? (video?.currentTime as number) : currentTime,
        hlsRef.current?.mainForwardBufferInfo,
      );
      setBufferingOverlayVisible((visible) =>
        nextBufferingOverlayVisible(visible, ahead, {
          isLoading,
          isWaiting,
          isSeekSettling,
          isPlaying: isPlaying || mediaVisiblyPlaying || playbackStarted,
        }),
      );
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [isLoading, isWaiting, isSeekSettling, isPlaying, mediaVisiblyPlaying, playbackStarted, currentTime, bufferedPercent, isSeeking]);

  // Overlay : buffer ahead uniquement. Pendant waiting/seek/loading, ne jamais
  // afficher 100 % (artefact ou cible atteinte alors que le décodeur attend encore).
  const overlayBufferedPercent =
    isSeekSettling || isLoading || isWaiting || bufferedPercent >= 100
      ? bufferedPercent > 0 && bufferedPercent < 100
        ? bufferedPercent
        : null
      : bufferedPercent > 0
        ? bufferedPercent
        : null;

  const displayError = uhdFallbackMessage ? null : error;
  // Même hystérésis que le PC : overlay jusqu’au play réel ou buffer de démarrage.
  const playbackActive = isPlaying || mediaVisiblyPlaying || playbackStarted;
  const shouldShowBuffering =
    !!uhdFallbackMessage ||
    (!playbackActive &&
      (bufferingOverlayVisible ||
        isSeekSettling ||
        (isSeeking && (bufferedPercent < 95 || pendingSeekPosition > 0))));
  const liveTrace = usePlaybackLiveTrace(
    {
      path: filePath,
      infoHash,
      baseUrl: baseUrlProp,
    },
    true,
    videoRef,
    hlsRef,
    isRemoteStream,
  );
  const pipelineDebugUrl = playbackDebugUrl({
    path: filePath,
    infoHash,
    fileId: liveTrace.status?.file_id,
    baseUrl: baseUrlProp,
  });

  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  const bufferedPercentRef = useRef(bufferedPercent);
  bufferedPercentRef.current = bufferedPercent;
  const playlistReadyRef = useRef(false);
  playlistReadyRef.current =
    Boolean(liveTrace.status?.playlist_ready) || (liveTrace.status?.segment_count ?? 0) > 0;
  const maxHeightRef = useRef(maxHeight);
  maxHeightRef.current = maxHeight;

  useEffect(() => {
    if (!onQualityChange || !isUhdQualityAttempt(maxHeight)) return;
    const startedAt = Date.now();
    const id = window.setInterval(() => {
      if (
        shouldFallbackUhdPlayback({
          isUhdAttempt: isUhdQualityAttempt(maxHeightRef.current),
          alreadyFellBack: uhdFallbackDoneRef.current,
          hasStartedPlayback: isPlayingRef.current,
          playlistOrBufferReady:
            playlistReadyRef.current || (bufferedPercentRef.current ?? 0) > 0,
          elapsedMs: Date.now() - startedAt,
          fatalMediaError: false,
        })
      ) {
        onUhdStartFailed('fatal');
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [infoHash, filePath, maxHeight, onQualityChange, onUhdStartFailed]);
  useEffect(() => {
    if (isPlaying) setUhdFallbackMessage(null);
  }, [isPlaying]);

  /** En cas d'erreur, garder les contrôles visibles pour permettre d'appuyer sur Retour */
  const effectiveShowControls = showControls || !!displayError;

  return (
    <div 
      ref={containerRef}
      class="w-full h-full flex flex-col relative bg-black group" 
      id="hls-player-container"
      data-tv-player-active="true"
      tabIndex={-1} 
      style={{ 
        width: '100%', 
        height: '100%',
        ...(isTV
          ? {}
          : {
              transform: 'translateZ(0)',
              willChange: 'contents',
              backfaceVisibility: 'hidden',
            }),
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
          ...(isTV ? {} : { transform: 'translateZ(0)', willChange: 'transform' }),
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
        {displayError && (
          <PlaybackStatusSurface
            variant="player"
            playStatus="error"
            errorMessage={displayError}
            title={torrentName || fileName}
            posterUrl={posterUrl}
            imageUrl={posterUrl}
            isActiveSession
            pipelineStatus={liveTrace.status}
            debugLogsUrl={pipelineDebugUrl}
            liveTrace={liveTrace}
            onCancel={onClose}
            onRetry={() => window.location.reload()}
          />
        )}
        {shouldShowBuffering && (
          <PlayerBufferingOverlay
            title={torrentName || fileName}
            bufferedPercent={overlayBufferedPercent}
            detailMessage={
              uhdFallbackMessage ||
              pipelineHeadline(liveTrace.status, t) ||
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
            pipelineStatus={liveTrace.status}
            debugLogsUrl={pipelineDebugUrl}
            liveTrace={liveTrace}
          />
        )}
        <video
          ref={videoRef}
          class="relative z-0 w-full h-full"
          playsInline
          preload="auto"
          autoplay={playerConfig.autoplay}
          muted={playerConfig.muted || isTV}
          poster="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'%3E%3Crect fill='%23000' width='1' height='1'/%3E%3C/svg%3E"
          style={{
            transform: isTV ? 'none' : playerConfig.hardwareAcceleration ? 'translateZ(0)' : 'none',
            willChange: 'auto',
            backfaceVisibility: isTV ? 'visible' : playerConfig.hardwareAcceleration ? 'hidden' : 'visible',
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
          showControls={effectiveShowControls}
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
            chromeVisible={effectiveShowControls}
          />
          <NextEpisodeOverlay
            onNext={handleNextEpisode}
            visible={showNextEpisode}
            nextTitle={nextEpisodeInfo?.title}
            chromeVisible={effectiveShowControls}
          />
        </div>
      </div>
    </div>
  );
}
