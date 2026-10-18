import { useEffect, useState, useRef, useCallback } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import { useVideoControls } from '../player-shared/hooks/useVideoControls';
import { useFullscreen, toggleFullscreen } from '../player-shared/hooks/useFullscreen';
import { PlaybackStatusSurface } from '../player-shared/components/PlaybackStatusSurface';
import { VideoControls } from '../player-shared/components/VideoControls';
import { TvPlayerDock } from '../player-shared/components/TvPlayerDock';
import { PlayerSettingsMenu } from '../player-shared/components/PlayerSettingsMenu';
import type { HLSPlayerProps } from './types';
import { useHlsPlayer } from './hooks/useHlsPlayer';
import { useTVPlayerNavigation } from '../player-shared/hooks/useTVPlayerNavigation';
import { useHlsTracks } from './hooks/useHlsTracks';
import { usePlayerConfig, toggleVideoFillMode } from '../player-shared/hooks/usePlayerConfig';
import { shouldAutoFullscreen, isTVPlatform, isWebOSTV } from '../../../lib/utils/device-detection';
import { isTauri } from '../../../lib/utils/tauri';
import { NextEpisodeOverlay } from '../player-shared/components/NextEpisodeOverlay';
import { SkipIntroOverlay } from '../player-shared/components/SkipIntroOverlay';
import { ResumeOverlay } from '../player-shared/components/ResumeOverlay';
import { resolveResumeSeconds, RESUME_RESTART_PERCENT } from '../../../lib/streaming/resumePosition';
import { getOrCreateDeviceId } from '../../../lib/utils/device-id';
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
  initialSeekSeconds = null,
  isSeries = false,
  nextEpisodeInfo = null,
  onPlayNextEpisode,
  previousEpisodeInfo = null,
  onPlayPreviousEpisode,
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
  audioIndex = 0,
  sourceAudioTracks = [],
  onAudioIndexChange,
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
    audioIndex: audioIndex ?? 0,
    fileName,
    torrentId,
    filePath,
    tmdbId,
    tmdbType,
    seriesSeason,
    seriesEpisode,
    variantId,
    startFromBeginning,
    initialSeekSeconds,
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
    externalTouchToggle: true,
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

  // Progression épisode : fin de lecture = vu ; fermeture app / arrière-plan (webOS Back, Android Home,
  // onglet masqué) = sauvegarde immédiate. Attaché à l'élément <video> → hls.js ET HLS natif TV.
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const flushProgress = useCallback((finished = false) => {
    const cb = onProgressRef.current;
    const dur = effectiveDurationRef.current;
    if (!cb || !(dur > 0)) return;
    cb(finished ? dur : currentTimeRef.current, dur);
  }, []);
  useEffect(() => {
    const video = videoRef.current;
    const onEnded = () => flushProgress(true);
    const onHidden = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') flushProgress(false);
    };
    const onPageHide = () => flushProgress(false);
    video?.addEventListener('ended', onEnded);
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('beforeunload', onPageHide);
    return () => {
      video?.removeEventListener('ended', onEnded);
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('beforeunload', onPageHide);
    };
  }, [videoRef, hlsLoaded, src, flushProgress]);

  /** Navigation épisode (barre de contrôle, dock TV, touches média). Undefined = bout de série / film. */
  const goNextEpisode =
    isSeries && nextEpisodeInfo && onPlayNextEpisode
      ? () => {
          flushProgress(false);
          onPlayNextEpisode();
        }
      : undefined;
  const goPreviousEpisode =
    isSeries && previousEpisodeInfo && onPlayPreviousEpisode
      ? () => {
          flushProgress(false);
          onPlayPreviousEpisode();
        }
      : undefined;
  const goNextEpisodeRef = useRef(goNextEpisode);
  goNextEpisodeRef.current = goNextEpisode;
  const goPreviousEpisodeRef = useRef(goPreviousEpisode);
  goPreviousEpisodeRef.current = goPreviousEpisode;

  // Hors TV (web, mobile, desktop Tauri, Android téléphone) : touches média + Media Session.
  useEffect(() => {
    if (isTVPlatform() || isWebOSTV()) return;
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement | null;
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) return;
      const k = e.key;
      const next = k === 'MediaTrackNext' || (e.shiftKey && (k === 'N' || k === 'n'));
      const prev = k === 'MediaTrackPrevious' || (e.shiftKey && (k === 'P' || k === 'p'));
      if (next && goNextEpisodeRef.current) {
        e.preventDefault();
        goNextEpisodeRef.current();
      } else if (prev && goPreviousEpisodeRef.current) {
        e.preventDefault();
        goPreviousEpisodeRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    const ms = typeof navigator !== 'undefined' ? (navigator as any).mediaSession : null;
    const setHandler = (action: string, fn: (() => void) | null) => {
      try {
        ms?.setActionHandler?.(action, fn);
      } catch {
        /* action non supportée */
      }
    };
    setHandler('nexttrack', goNextEpisode ? () => goNextEpisodeRef.current?.() : null);
    setHandler('previoustrack', goPreviousEpisode ? () => goPreviousEpisodeRef.current?.() : null);
    return () => {
      window.removeEventListener('keydown', onKey);
      setHandler('nexttrack', null);
      setHandler('previoustrack', null);
    };
  }, [!!goNextEpisode, !!goPreviousEpisode]);

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

  // Toutes plateformes : useHlsPlayer démarre toujours à 0 (seek avant le 1er play = chasse du
  // live edge sur une playlist EVENT encore en cours de transcodage → lecture bloquée). On
  // reprend donc juste APRÈS le démarrage, via le même seek qu'un geste utilisateur
  // (seekToTargetTime → reloadWithSeek si hors buffer). Avant 1.4.14, mobile / PC appliquaient
  // la reprise avant le 1er play (startLoad(position)) : avec la reprise par défaut de 1.4.12,
  // un épisode entamé pouvait ne jamais démarrer.
  const tvResumeTargetRef = useRef<number | null>(null);
  const tvResumeAppliedRef = useRef(false);
  const [tvResumedAt, setTvResumedAt] = useState<number | null>(null);
  useEffect(() => {
    tvResumeTargetRef.current = null;
    tvResumeAppliedRef.current = false;
    setTvResumedAt(null);
    if (startFromBeginning) return;
    let cancelled = false;
    void resolveResumeSeconds({
      torrentId,
      tmdbId,
      tmdbType,
      season: seriesSeason ?? null,
      episode: seriesEpisode ?? null,
      deviceId: getOrCreateDeviceId(),
      preferredSeconds: initialSeekSeconds,
    })
      .then((pos) => {
        if (!cancelled) tvResumeTargetRef.current = pos;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startFromBeginning, src, filePath, infoHash, seriesSeason, seriesEpisode]);
  useEffect(() => {
    if (!playbackStarted || tvResumeAppliedRef.current) return;
    let tries = 0;
    const id = window.setInterval(() => {
      tries += 1;
      const target = tvResumeTargetRef.current;
      if (target == null && tries < 10) return; // résolution encore en cours (≤ 5 s)
      window.clearInterval(id);
      if (tvResumeAppliedRef.current || target == null || !(target > 0)) return;
      const dur = effectiveDurationRef.current;
      // Règle des 95 % seulement si la durée connue couvre la cible : sur une playlist EVENT
      // (transcodage en cours) la durée visible est partielle et écartait toute reprise.
      if (dur > target && (target / dur) * 100 >= RESUME_RESTART_PERCENT) return;
      tvResumeAppliedRef.current = true;
      seekToTargetTime(target);
      setTvResumedAt(target);
    }, 500);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playbackStarted]);
  const resumedAt = tvResumedAt;
  const handleRestartFromBeginning = () => {
    seekToTargetTime(0);
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
    // Overlay / compte à rebours de fin : l'épisode courant est terminé → « vu ».
    flushProgress(true);
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

  const { isTV, focusedControlIndex, focusedControlId, focusedOnProgress, setFocusedOnProgress, hasBack, tvScrubIndex, focusedOnScrub, tvScrubBrowsing, settingsOpen, toggleSettings, closeSettings } = useTVPlayerNavigation({
    showControls,
    setShowControls,
    onPlayPause: handlePlayPause,
    onSeek: handleSeekTV,
    onVolumeChange: handleVolumeChangeTV,
    onToggleMute: toggleMute,
    onToggleFullscreen: handleToggleFullscreen,
    onClose,
    onOpenQualityMenu: onQualityChange != null ? () => openQualityMenuRef.current?.() : undefined,
    onToggleSubtitles:
      sourceAudioTracks.length > 0 || audioTracks.length > 0 || subtitleTracks.length > 0
        ? toggleSubtitleSelector
        : undefined,
    onSelectQuality: onQualityChange,
    streamQuality: streamQuality ?? null,
    onToggleFillMode: toggleVideoFillMode,
    duration,
    currentTime,
    isPlaying,
    videoRef,
    progressBarRef,
    scrubThumbnails: scrubThumbnails?.mediaId && scrubThumbnails.count > 0 ? scrubThumbnails : null,
    onScrubSeek: seekToTargetTime,
    onSeekPreview: handleSeekPreview,
    onNextEpisode: goNextEpisode,
    onPreviousEpisode: goPreviousEpisode,
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

  // TV : masquer le dock pour laisser le focus sur « Passer le générique » / « Épisode suivant ».
  useEffect(() => {
    if (!isTV || (!showSkipIntro && !showNextEpisode)) return;
    setShowControls(false);
  }, [isTV, showSkipIntro, showNextEpisode, setShowControls]);

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
  }, [src, infoHash, filePath, hlsLoaded]);

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

  const playbackActive = isPlaying || mediaVisiblyPlaying || playbackStarted;
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
  // Erreur serveur (ffmpeg en échec, playlist jamais créée) : ne plus masquer derrière
  // « Optimisation de l'image… » — afficher l'erreur et arrêter l'attente.
  const serverPhaseError =
    liveTrace.status?.phase === 'error'
      ? (liveTrace.status as { last_error?: string | null }).last_error || t('playback.hls.serverPrepareFailed')
      : null;
  const [startTimedOut, setStartTimedOut] = useState(false);
  useEffect(() => {
    setStartTimedOut(false);
    if (playbackActive) return;
    const id = window.setTimeout(() => setStartTimedOut(true), 90_000);
    return () => window.clearTimeout(id);
  }, [infoHash, filePath, maxHeight, playbackActive]);
  const timeoutError = startTimedOut && !playbackActive ? t('playback.hls.startTimeout') : null;
  const displayError = serverPhaseError || timeoutError || (uhdFallbackMessage ? null : error);
  const shouldShowBuffering =
    !serverPhaseError &&
    !timeoutError &&
    (!!uhdFallbackMessage ||
      (isLoading && !playbackStarted) ||
      bufferingOverlayVisible ||
      (!playbackActive &&
        (isSeekSettling || (isSeeking && (bufferedPercent < 95 || pendingSeekPosition > 0)))));

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
          currentTime: videoRef.current?.currentTime ?? 0,
        })
      ) {
        onUhdStartFailed('fatal');
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [infoHash, filePath, maxHeight, onQualityChange, onUhdStartFailed]);
  useEffect(() => {
    const t = videoRef.current?.currentTime ?? currentTime;
    if (isPlaying && t >= 1) setUhdFallbackMessage(null);
  }, [isPlaying, currentTime]);

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
              uhdFallbackMessage
                ? null
                : pipelineHeadline(liveTrace.status, t) ||
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
            qualityTransition={!!uhdFallbackMessage}
          />
        )}
        <video
          ref={videoRef}
          class="relative z-0 w-full h-full"
          playsInline
          preload="auto"
          autoplay={playerConfig.autoplay}
          {...(isTV ? {} : { muted: isMuted })}
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
          showControls={isTV ? false : effectiveShowControls}
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
          audioTracks={sourceAudioTracks.length > 0 ? sourceAudioTracks : audioTracks}
          subtitleTracks={subtitleTracks}
          currentAudioTrack={
            sourceAudioTracks.length > 0 ? (audioIndex ?? 0) : currentAudioTrack
          }
          currentSubtitleTrack={currentSubtitleTrack}
          showSubtitleSelector={showSubtitleSelector}
          onChangeAudioTrack={
            sourceAudioTracks.length > 0 && onAudioIndexChange
              ? (id) => onAudioIndexChange(id)
              : changeAudioTrack
          }
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
          onCastClick={() => {
            void chromecast.castMedia(src, torrentName ?? fileName, currentTime).then((ok) => {
              if (ok) videoRef.current?.pause();
            });
          }}
          videoFillMode={playerConfig.videoFillMode ?? 'contain'}
          scrubThumbnails={scrubThumbnails ?? null}
          scrubThumbnailsLoading={scrubThumbnailsLoading}
          tvScrubIndexExternal={isTV ? tvScrubIndex : undefined}
          tvScrubFocused={isTV ? focusedOnScrub : undefined}
          tvScrubBrowsing={isTV ? tvScrubBrowsing : undefined}
          showEpisodeNav={isSeries}
          onNextEpisode={goNextEpisode}
          onPreviousEpisode={goPreviousEpisode}
          nextEpisodeTitle={nextEpisodeInfo?.title ?? null}
          previousEpisodeTitle={previousEpisodeInfo?.title ?? null}
        />
        {/* Boutons flottants : calque AU-DESSUS du chrome (z-40, plein écran et cliquable quand
            les contrôles sont visibles) — sinon le chrome interceptait le tap. Le calque lui-même
            laisse passer les touchers (pointer-events-none) ; masqué quand un menu est ouvert. */}
        <div class="absolute inset-0 z-[45] pointer-events-none">
          <SkipIntroOverlay
            onSkip={handleSkipIntro}
            visible={showSkipIntro && !showSubtitleSelector && !settingsOpen}
            chromeVisible={effectiveShowControls}
          />
          <ResumeOverlay
            resumedAt={resumedAt}
            onRestart={handleRestartFromBeginning}
            chromeVisible={effectiveShowControls}
          />
          <NextEpisodeOverlay
            onNext={handleNextEpisode}
            visible={showNextEpisode && !showSubtitleSelector && !settingsOpen}
            nextTitle={nextEpisodeInfo?.title}
            chromeVisible={effectiveShowControls}
          />
        </div>
        {isTV && (
          <TvPlayerDock
            show={
              showControls &&
              !showSubtitleSelector &&
              !settingsOpen &&
              !shouldShowBuffering &&
              (isPlaying || playbackStarted || mediaVisiblyPlaying)
            }
            isPlaying={isPlaying}
            currentTime={currentTime}
            duration={duration}
            mediaTitle={torrentName || fileName}
            seriesSeasonNum={seriesSeason}
            seriesEpisodeNum={seriesEpisode}
            focusedControlId={focusedControlId}
            focusedOnScrub={focusedOnScrub}
            tvScrubIndex={tvScrubIndex}
            tvScrubBrowsing={tvScrubBrowsing}
            scrubThumbnails={scrubThumbnails ?? null}
            scrubThumbnailsLoading={scrubThumbnailsLoading}
            videoFillMode={playerConfig.videoFillMode ?? 'cover'}
            settingsOpen={settingsOpen}
            audioTracks={sourceAudioTracks.length > 0 ? sourceAudioTracks : audioTracks}
            subtitleTracks={subtitleTracks}
            currentSubtitleTrack={currentSubtitleTrack}
            onClose={onClose}
            onPlayPause={handlePlayPause}
            onSeekToTime={seekToTargetTime}
            onToggleFillMode={toggleVideoFillMode}
            onOpenSettings={toggleSettings}
            onNextEpisode={goNextEpisode}
            onPreviousEpisode={goPreviousEpisode}
            onToggleSubtitles={
              sourceAudioTracks.length > 0 ||
              audioTracks.length > 0 ||
              subtitleTracks.length > 0
                ? toggleSubtitleSelector
                : undefined
            }
          />
        )}
        {isTV &&
          settingsOpen &&
          typeof document !== 'undefined' &&
          createPortal(
            <PlayerSettingsMenu
              streamQuality={streamQuality ?? null}
              showQualitySelector={onQualityChange != null}
              onQualityChange={onQualityChange}
              videoFillMode={playerConfig.videoFillMode ?? 'cover'}
              audioTracks={sourceAudioTracks.length > 0 ? sourceAudioTracks : audioTracks}
              subtitleTracks={subtitleTracks}
              currentAudioTrack={
                sourceAudioTracks.length > 0 ? (audioIndex ?? 0) : currentAudioTrack
              }
              currentSubtitleTrack={currentSubtitleTrack}
              onChangeAudioTrack={
                sourceAudioTracks.length > 0 && onAudioIndexChange
                  ? (id) => onAudioIndexChange(id)
                  : changeAudioTrack
              }
              onChangeSubtitleTrack={changeSubtitleTrack}
              onClose={closeSettings}
              isTV
            />,
            document.body,
          )}
      </div>
    </div>
  );
}
