import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import { emitPlaybackStep } from '../../player-core/observability/playbackEvents';
import { usePlayerConfig } from './usePlayerConfig';
import { isTVPlatform } from '../../../../lib/utils/device-detection';

interface UseVideoControlsProps {
  videoRef: { current: HTMLVideoElement | null };
  hlsLoaded: boolean;
  hlsDuration?: number;
  isLoading?: boolean;
  pendingSeekPosition?: number;
  canUseSeekReload?: boolean;
  reloadWithSeek?: (seekSeconds: number) => void;
}

export function useVideoControls({
  videoRef,
  hlsLoaded,
  hlsDuration,
  isLoading = false,
  pendingSeekPosition = 0,
  canUseSeekReload = true,
  reloadWithSeek,
}: UseVideoControlsProps) {
  const playerConfig = usePlayerConfig();
  const [showControls, setShowControls] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedPercent, setBufferedPercent] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [isMuted, setIsMuted] = useState(playerConfig.muted);
  const [volume, setVolume] = useState(playerConfig.volume);
  const controlsTimeoutRef = useRef<number | null>(null);
  const userPausedRef = useRef<boolean>(false);
  /** Sur Android TV / TV : unmute une fois au premier "playing" (autoplay peut démarrer en muted). */
  const hasTriedUnmuteOnTVRef = useRef<boolean>(false);

  useEffect(() => {
    if (hlsDuration && hlsDuration > 0 && isFinite(hlsDuration)) {
      setDuration(hlsDuration);
    }
  }, [hlsDuration]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !hlsLoaded) return;

    // Synchroniser l'état play/pause avec la vidéo (évite un bouton play fixe si la vidéo est déjà en lecture ou en pause)
    setIsPlaying(!video.paused);

    // Si la vidéo est déjà en lecture (ex. autoplay, reprise), programmer le masquage des contrôles après quelques secondes (TV et desktop)
    if (!video.paused && playerConfig.autoHideControls) {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      controlsTimeoutRef.current = window.setTimeout(() => setShowControls(false), playerConfig.controlsTimeout);
    }

    const handleMouseMove = () => {
      setShowControls(true);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      controlsTimeoutRef.current = window.setTimeout(() => {
        if (!video.paused && playerConfig.autoHideControls) setShowControls(false);
      }, playerConfig.controlsTimeout);
    };

    const handleMouseLeave = () => {
      if (!video.paused && playerConfig.autoHideControls) setShowControls(false);
    };

    const updateBuffered = () => {
      const total = duration > 0 && isFinite(duration) ? duration : (video.duration && isFinite(video.duration) ? video.duration : 0);
      if (!total || !isFinite(total)) { setBufferedPercent(0); return; }
      try {
        const buffered = video.buffered;
        if (!buffered || buffered.length === 0) { setBufferedPercent(0); return; }
        const end = buffered.end(buffered.length - 1);
        setBufferedPercent(Math.max(0, Math.min(100, (end / total) * 100)));
      } catch (e) {
        setBufferedPercent(0);
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
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      if (playerConfig.autoHideControls) {
        controlsTimeoutRef.current = window.setTimeout(() => setShowControls(false), playerConfig.controlsTimeout);
      }
    };

    const handlePause = () => {
      setIsPlaying(false);
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
    const handleTouchStart = () => {
      setShowControls(true);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      controlsTimeoutRef.current = window.setTimeout(() => {
        if (!video.paused && playerConfig.autoHideControls) setShowControls(false);
      }, playerConfig.controlsTimeout);
    };

    if (container) {
      container.addEventListener('mousemove', handleMouseMove);
      container.addEventListener('mouseleave', handleMouseLeave);
      container.addEventListener('touchstart', handleTouchStart, { passive: true });
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

    video.volume = playerConfig.volume;
    video.muted = playerConfig.muted;

    /** Android TV : au premier "playing", forcer le son (certains WebView démarrent en muted pour l’autoplay). */
    const handlePlayingUnmuteTV = () => {
      if (!isTVPlatform() || hasTriedUnmuteOnTVRef.current) return;
      hasTriedUnmuteOnTVRef.current = true;
      const v = videoRef.current;
      if (v) {
        v.muted = false;
        v.volume = Math.max(0.5, playerConfig.volume);
      }
    };
    video.addEventListener('playing', handlePlayingUnmuteTV);

    return () => {
      if (container) {
        container.removeEventListener('mousemove', handleMouseMove);
        container.removeEventListener('mouseleave', handleMouseLeave);
        container.removeEventListener('touchstart', handleTouchStart);
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
      video.removeEventListener('playing', handlePlayingUnmuteTV);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [videoRef, hlsLoaded, playerConfig, hlsDuration]);

  const handlePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      userPausedRef.current = false;
      if (isTVPlatform()) {
        video.muted = false;
        video.volume = Math.max(0.5, playerConfig.volume);
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
      const durationValue =
        duration > 0 && isFinite(duration) ? duration : video.duration && isFinite(video.duration) ? video.duration : 0;
      if (!durationValue) return;
      const clamped = Math.max(0, Math.min(durationValue, targetTime));
      let bufferedEnd = 0;
      try {
        if (video.buffered?.length > 0) bufferedEnd = video.buffered.end(video.buffered.length - 1);
      } catch (_) {}
      if (!canUseSeekReload) {
        emitPlaybackStep('seek_native', { position: clamped });
        video.currentTime = clamped;
        return;
      }
      if (reloadWithSeek && clamped > 0 && !isLoading) {
        const margin = 2;
        const isBeyondBufferedWindow = clamped > bufferedEnd + margin;
        const isLargeJump = Math.abs(clamped - video.currentTime) > 60;
        if (isLargeJump || (bufferedEnd >= 20 && isBeyondBufferedWindow)) {
          emitPlaybackStep('seek_reload', { position: clamped });
          reloadWithSeek(clamped);
          return;
        }
      }
      if (isLoading) return;
      emitPlaybackStep('seek_native', { position: clamped });
      video.currentTime = clamped;
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

  return {
    showControls,
    isPlaying,
    currentTime: displayCurrentTime,
    duration,
    bufferedPercent,
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
