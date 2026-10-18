import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'preact/hooks';
import { emitPlaybackStep } from '../../player-core/observability/playbackEvents';
import {
  SEEK_RELOAD_BUFFER_MARGIN_SEC,
  shouldReloadSeekForTarget,
} from '../../player-core/policies/SeekPolicy';
import { usePlayerConfig } from './usePlayerConfig';
import { isTVPlatform, isWebOSTV, stampTvPlatformHints } from '../../../../lib/utils/device-detection';
import { toggleFullscreen } from './useFullscreen';
import {
  getBufferAheadPercent,
  getBufferAheadSeconds,
  getBufferedTimelinePercent,
} from '../utils/bufferMetrics';

interface UseVideoControlsProps {
  videoRef: { current: HTMLVideoElement | null };
  hlsLoaded: boolean;
  hlsDuration?: number;
  isLoading?: boolean;
  pendingSeekPosition?: number;
  canUseSeekReload?: boolean;
  reloadWithSeek?: (seekSeconds: number) => void;
  /**
   * Le lecteur gère lui-même le tap (useTouchGestures : tap = afficher / masquer).
   * Dans ce cas, un toucher ne force plus l'affichage des contrôles : sinon le 1er toucher
   * les affichait puis le tap les re-masquait, et les boutons flottants bougeaient sous le doigt.
   */
  externalTouchToggle?: boolean;
}

export function useVideoControls({
  videoRef,
  hlsLoaded,
  hlsDuration,
  isLoading = false,
  pendingSeekPosition = 0,
  canUseSeekReload = true,
  reloadWithSeek,
  externalTouchToggle = false,
}: UseVideoControlsProps) {
  const playerConfig = usePlayerConfig();
  const [showControls, setShowControls] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  /** Buffer ahead 0–100 (overlay / readiness). */
  const [bufferedPercent, setBufferedPercent] = useState(0);
  /** Fin du buffer le long de la timeline 0–100 (barre de progression). */
  const [bufferedTimelinePercent, setBufferedTimelinePercent] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [isMuted, setIsMuted] = useState(() =>
    isTVPlatform() || isWebOSTV() ? true : playerConfig.muted,
  );
  const [volume, setVolume] = useState(playerConfig.volume);
  const controlsTimeoutRef = useRef<number | null>(null);
  const userPausedRef = useRef<boolean>(false);
  /** Sur Android TV / TV : unmute après le priming muted (pas pendant le buffer kickstart). */
  const hasTriedUnmuteOnTVRef = useRef<boolean>(false);
  const isLoadingRef = useRef(isLoading);
  isLoadingRef.current = isLoading;

  useEffect(() => {
    if (hlsDuration && hlsDuration > 0 && isFinite(hlsDuration)) {
      setDuration(hlsDuration);
    }
  }, [hlsDuration]);

  /** Dès que le priming/loading est fini et que la vidéo joue : forcer le son TV.
   *  Évite la course où `playing` part pendant le play() muted, puis hls re-mute. */
  useEffect(() => {
    if (isLoading) return;
    if (!(isTVPlatform() || isWebOSTV())) return;
    const video = videoRef.current;
    if (!video || video.paused) return;
    video.muted = false;
    video.volume = Math.max(0.5, playerConfig.volume);
    hasTriedUnmuteOnTVRef.current = true;
  }, [isLoading, playerConfig.volume, videoRef]);

  useLayoutEffect(() => {
    // Après le commit : videoRef est peuplé. Ne pas attendre hls.js (TV / HLS natif).
    stampTvPlatformHints();
    const video = videoRef.current;
    if (!video) return;

    // Synchroniser l'état play/pause avec la vidéo (évite un bouton play fixe si la vidéo est déjà en lecture ou en pause)
    setIsPlaying(!video.paused);

    const clearControlsTimeout = () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
        controlsTimeoutRef.current = null;
      }
    };

    const scheduleAutoHide = () => {
      clearControlsTimeout();
      if (!playerConfig.autoHideControls) return;
      if (video.paused) return;
      // Sur TV / webOS (app simple URL incluse), useTVPlayerNavigation gère le timer.
      if (isTVPlatform() || isWebOSTV()) return;
      controlsTimeoutRef.current = window.setTimeout(() => {
        controlsTimeoutRef.current = null;
        if (!video.paused) setShowControls(false);
      }, playerConfig.controlsTimeout);
    };

    // Si déjà en lecture (autoplay / reprise) : afficher puis masquer.
    if (!video.paused && playerConfig.autoHideControls) {
      setShowControls(true);
      scheduleAutoHide();
    }

    const handleMouseMove = () => {
      setShowControls(true);
      scheduleAutoHide();
    };

    const handleMouseLeave = () => {
      if (!video.paused && playerConfig.autoHideControls) setShowControls(false);
    };

    const updateBuffered = () => {
      const total =
        (hlsDuration && hlsDuration > 0 && isFinite(hlsDuration) ? hlsDuration : 0) ||
        (duration > 0 && isFinite(duration) ? duration : 0) ||
        (video.duration && isFinite(video.duration) ? video.duration : 0);
      const pos = Number.isFinite(video.currentTime) ? video.currentTime : 0;
      try {
        const buffered = video.buffered;
        const ahead = getBufferAheadSeconds(buffered, pos);
        setBufferedPercent(getBufferAheadPercent(ahead));
        setBufferedTimelinePercent(getBufferedTimelinePercent(buffered, pos, total));
      } catch {
        setBufferedPercent(0);
        setBufferedTimelinePercent(0);
      }
    };

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      if (!hlsDuration || hlsDuration === 0 || !isFinite(hlsDuration)) {
        const videoDuration = video.duration || 0;
        if (videoDuration > 0 && isFinite(videoDuration) && videoDuration > duration) setDuration(videoDuration);
      }
      updateBuffered();
    };

    const handlePlay = () => {
      if (userPausedRef.current) {
        requestAnimationFrame(() => {
          if (userPausedRef.current && !video.paused) video.pause();
        });
        return;
      }
      setIsPlaying(true);
      userPausedRef.current = false;
      setShowControls(true);
      scheduleAutoHide();
    };

    const handlePause = () => {
      // Un seek HLS/MSE émet souvent `pause` sans intention utilisateur.
      if (video.seeking) return;
      // webOS émet pause pendant un rebuffer MSE sans vraiment arrêter l’image.
      if (isTVPlatform() || isWebOSTV()) {
        window.setTimeout(() => {
          if (video.paused && !video.seeking) {
            setIsPlaying(false);
            setShowControls(true);
          }
        }, 500);
        return;
      }
      setIsPlaying(false);
      clearControlsTimeout();
      setShowControls(true);
    };

    const handleSeeking = () => setIsSeeking(true);
    const handleSeeked = () => { setIsSeeking(false); updateBuffered(); };
    const handleVolumeChange = () => { setIsMuted(video.muted); setVolume(video.volume); };

    const handleLoadedMetadata = () => {
      if (!hlsDuration || hlsDuration === 0 || !isFinite(hlsDuration)) {
        const videoDuration = video.duration || 0;
        if (videoDuration > 0 && isFinite(videoDuration) && videoDuration > duration) setDuration(videoDuration);
      }
      updateBuffered();
    };

    const handleDurationChange = () => {
      const videoDuration = video.duration || 0;
      if (videoDuration > 0 && isFinite(videoDuration)) {
        const finalDuration = hlsDuration && hlsDuration > 0 && isFinite(hlsDuration) ? Math.max(hlsDuration, videoDuration) : videoDuration;
        if (finalDuration > duration) setDuration(finalDuration);
      }
      updateBuffered();
    };

    const container = video.parentElement?.parentElement;
    const handleTouchStart = (e: TouchEvent) => {
      if (externalTouchToggle) {
        // Interaction avec les commandes déjà visibles : repousser le masquage auto.
        const target = e.target as HTMLElement | null;
        if (target?.closest('.video-controls-chrome, [data-player-overlay-action]')) scheduleAutoHide();
        return;
      }
      setShowControls(true);
      scheduleAutoHide();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (isTVPlatform()) return;

      const key = e.key;
      switch (key.toLowerCase()) {
        case ' ':
        case 'k':
          e.preventDefault();
          handlePlayPause();
          break;
        case 'arrowleft':
        case 'j':
          e.preventDefault();
          setShowControls(true);
          scheduleAutoHide();
          if (video.duration) {
            seekToTargetTime(Math.max(0, video.currentTime - 10));
          }
          break;
        case 'arrowright':
        case 'l':
          e.preventDefault();
          setShowControls(true);
          scheduleAutoHide();
          if (video.duration) {
            seekToTargetTime(Math.min(video.duration, video.currentTime + 10));
          }
          break;
        case 'arrowup':
          e.preventDefault();
          video.volume = Math.min(1, video.volume + 0.1);
          video.muted = false;
          break;
        case 'arrowdown':
          e.preventDefault();
          video.volume = Math.max(0, video.volume - 0.1);
          video.muted = video.volume === 0;
          break;
        case 'm':
          e.preventDefault();
          toggleMute();
          break;
        case 'f':
          e.preventDefault();
          const wrapper = document.getElementById('video-player-wrapper') || video.parentElement?.parentElement;
          if (wrapper) {
            toggleFullscreen(wrapper).catch(() => {});
          }
          break;
        default:
          if (/^[0-9]$/.test(key)) {
            e.preventDefault();
            const pct = parseInt(key, 10) / 10;
            const durationValue = video.duration || duration || hlsDuration || 0;
            if (durationValue && isFinite(durationValue)) {
              seekToTargetTime(pct * durationValue);
            }
          }
          break;
      }
    };

    if (container && !(isTVPlatform() || isWebOSTV())) {
      container.addEventListener('mousemove', handleMouseMove);
      container.addEventListener('mouseleave', handleMouseLeave);
      container.addEventListener('touchstart', handleTouchStart, { passive: true });
    }

    const handleTvPointerReveal = () => {
      setShowControls(true);
    };
    if (container && (isTVPlatform() || isWebOSTV())) {
      container.addEventListener('pointerdown', handleTvPointerReveal);
    }

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('progress', updateBuffered);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('seeking', handleSeeking);
    video.addEventListener('seeked', handleSeeked);
    video.addEventListener('volumechange', handleVolumeChange);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('durationchange', handleDurationChange);
    window.addEventListener('keydown', handleKeyDown);

    video.volume = playerConfig.volume;
    // TV : muted seulement tant que l’autoplay n’a pas démarré. Ne pas re-muter
    // à chaque re-run (duration / config), sinon le son disparaît pour de bon.
    if (isTVPlatform() || isWebOSTV()) {
      if (!hasTriedUnmuteOnTVRef.current) video.muted = true;
    } else {
      video.muted = playerConfig.muted;
    }

    /** TV / webOS : autoplay muted pendant le priming, puis son une fois hors loading.
     *  Ne pas passer par setState/muted JSX : webOS coupe play() si l’attribut muted change.
     *  Ne pas « consommer » l’unmute pendant isLoading : hls peut re-muter juste après. */
    const handlePlayingUnmuteTV = () => {
      if (!(isTVPlatform() || isWebOSTV())) return;
      if (isLoadingRef.current) return;
      const v = videoRef.current;
      if (!v || v.paused) return;
      if (v.muted || v.volume < 0.5) {
        v.muted = false;
        v.volume = Math.max(0.5, playerConfig.volume);
      }
      hasTriedUnmuteOnTVRef.current = true;
    };
    const handlePlaying = () => {
      setIsPlaying(true);
      userPausedRef.current = false;
      handlePlayingUnmuteTV();
    };
    video.addEventListener('playing', handlePlaying);

    let tvPlayPoll: number | null = null;
    const syncTvPlaying = () => {
      if (video.paused === false) handlePlaying();
    };
    if (isTVPlatform() || isWebOSTV()) {
      tvPlayPoll = window.setInterval(syncTvPlaying, 250);
    }

    return () => {
      if (container && !(isTVPlatform() || isWebOSTV())) {
        container.removeEventListener('mousemove', handleMouseMove);
        container.removeEventListener('mouseleave', handleMouseLeave);
        container.removeEventListener('touchstart', handleTouchStart);
      }
      if (container && (isTVPlatform() || isWebOSTV())) {
        container.removeEventListener('pointerdown', handleTvPointerReveal);
      }
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('progress', updateBuffered);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('seeking', handleSeeking);
      video.removeEventListener('seeked', handleSeeked);
      video.removeEventListener('volumechange', handleVolumeChange);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('durationchange', handleDurationChange);
      video.removeEventListener('playing', handlePlaying);
      window.removeEventListener('keydown', handleKeyDown);
      if (tvPlayPoll != null) window.clearInterval(tvPlayPoll);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [videoRef, hlsLoaded, playerConfig, hlsDuration]);

  const handlePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      userPausedRef.current = false;
      if (isTVPlatform() || isWebOSTV()) {
        video.muted = false;
        video.volume = Math.max(0.5, playerConfig.volume);
        hasTriedUnmuteOnTVRef.current = true;
      }
      video.play().catch(() => setIsPlaying(false));
    } else {
      userPausedRef.current = true;
      video.pause();
    }
  };

  const seekToTargetTime = useCallback(
    (targetTime: number) => {
      const video = videoRef.current;
      if (!video) return;
      const stateDuration =
        duration > 0 && isFinite(duration) ? duration : 0;
      const mediaDuration =
        video.duration && isFinite(video.duration) && video.duration !== Infinity ? video.duration : 0;
      const durationValue = Math.max(stateDuration, mediaDuration);
      if (!durationValue && !reloadWithSeek) return;
      const clamped = durationValue
        ? Math.max(0, Math.min(durationValue, targetTime))
        : Math.max(0, targetTime);
      const shouldResume = !video.paused && !userPausedRef.current;
      const resumeIfNeeded = () => {
        if (!shouldResume) return;
        userPausedRef.current = false;
        if (video.paused) video.play().catch(() => {});
      };
      const buffered = video.buffered;
      if (!canUseSeekReload) {
        emitPlaybackStep('seek_native', { position: clamped });
        video.currentTime = Math.min(clamped, mediaDuration > 0 ? mediaDuration : clamped);
        resumeIfNeeded();
        return;
      }
      // Hors fenêtre bufferée → régénérer la playlist (seek=) pour déplacer le buffer.
      // Même pendant isLoading : un nouveau clic remplace la cible en cours.
      if (
        reloadWithSeek &&
        clamped > 0 &&
        shouldReloadSeekForTarget({
          targetSec: clamped,
          buffered,
          mediaDuration,
          marginSec: SEEK_RELOAD_BUFFER_MARGIN_SEC,
        })
      ) {
        emitPlaybackStep('seek_reload', { position: clamped });
        reloadWithSeek(clamped);
        return;
      }
      if (isLoading) return;
      emitPlaybackStep('seek_native', { position: clamped });
      video.currentTime = clamped;
      resumeIfNeeded();
    },
    [videoRef, duration, canUseSeekReload, reloadWithSeek, isLoading]
  );

  const handleSeek = (e: any) => {
    const video = videoRef.current;
    if (!video) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = e?.clientX ?? e?.nativeEvent?.clientX ?? e?.touches?.[0]?.clientX ?? e?.changedTouches?.[0]?.clientX;
    if (typeof clientX !== 'number') return;
    const durationValue = duration > 0 && isFinite(duration) ? duration : (video.duration && isFinite(video.duration) ? video.duration : 0);
    if (!durationValue || !rect.width) return;
    const pos = (clientX - rect.left) / rect.width;
    seekToTargetTime(Math.max(0, Math.min(durationValue, pos * durationValue)));
  };

  const handleVolumeChange = (e: any) => {
    const video = videoRef.current;
    if (!video) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    const newVolume = Math.max(0, Math.min(1, pos));
    video.volume = newVolume;
    video.muted = newVolume === 0;
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
  };

  const displayCurrentTime = pendingSeekPosition > 0 && isLoading ? pendingSeekPosition : currentTime;

  /** Affiche les contrôles et programme le masquage (desktop/mobile). Sur TV, no-op timer (TV hook). */
  const revealControls = useCallback(() => {
    setShowControls(true);
    const video = videoRef.current;
    if (!video || video.paused || !playerConfig.autoHideControls || isTVPlatform()) return;
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = window.setTimeout(() => {
      controlsTimeoutRef.current = null;
      if (videoRef.current && !videoRef.current.paused) setShowControls(false);
    }, playerConfig.controlsTimeout);
  }, [playerConfig.autoHideControls, playerConfig.controlsTimeout, videoRef]);

  return {
    showControls,
    setShowControls,
    revealControls,
    isPlaying,
    currentTime: displayCurrentTime,
    duration,
    /** Buffer ahead (overlay). */
    bufferedPercent,
    /** Position buffer sur la timeline (barre). */
    bufferedTimelinePercent,
    isSeeking,
    isMuted,
    volume,
    handlePlayPause,
    handleSeek,
    seekToTargetTime,
    handleVolumeChange,
    toggleMute,
    canAutoPlay: () => playerConfig.autoplay,
  };
}
