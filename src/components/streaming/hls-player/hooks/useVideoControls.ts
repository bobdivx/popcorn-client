import { useState, useEffect, useRef } from 'preact/hooks';
import { usePlayerConfig } from './usePlayerConfig';

interface UseVideoControlsProps {
  videoRef: { current: HTMLVideoElement | null };
  hlsLoaded: boolean;
}

export function useVideoControls({ videoRef, hlsLoaded }: UseVideoControlsProps) {
  const playerConfig = usePlayerConfig();
  const [showControls, setShowControls] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(playerConfig.muted);
  const [volume, setVolume] = useState(playerConfig.volume);
  const controlsTimeoutRef = useRef<number | null>(null);
  const userPausedRef = useRef<boolean>(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !hlsLoaded) return;

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

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      setDuration(video.duration || 0);
    };

    const handlePlay = () => {
      if (userPausedRef.current) {
        requestAnimationFrame(() => {
          if (userPausedRef.current && !video.paused) {
            video.pause();
          }
        });
        return;
      }
      setIsPlaying(true);
      userPausedRef.current = false;
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      if (playerConfig.autoHideControls) {
        controlsTimeoutRef.current = window.setTimeout(() => {
          setShowControls(false);
        }, playerConfig.controlsTimeout);
      }
    };
    
    const handlePause = () => {
      setIsPlaying(false);
      setShowControls(true);
    };

    const handleVolumeChange = () => {
      setIsMuted(video.muted);
      setVolume(video.volume);
    };

    const handleLoadedMetadata = () => {
      setDuration(video.duration || 0);
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
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('volumechange', handleVolumeChange);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);

    // Initialiser le volume
    video.volume = playerConfig.volume;
    video.muted = playerConfig.muted;

    return () => {
      if (container) {
        container.removeEventListener('mousemove', handleMouseMove);
        container.removeEventListener('mouseleave', handleMouseLeave);
        container.removeEventListener('touchstart', handleTouchStart);
      }
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('volumechange', handleVolumeChange);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [videoRef, hlsLoaded, playerConfig]);

  const handlePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      userPausedRef.current = false;
      video.play().catch((err) => {
        console.error('Erreur lors de la lecture:', err);
        setIsPlaying(false);
      });
    } else {
      userPausedRef.current = true;
      video.pause();
    }
  };

  const handleSeek = (e: any) => {
    const video = videoRef.current;
    if (!video || !duration) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    video.currentTime = pos * duration;
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

  const canAutoPlay = () => {
    // Vérifier si l'autoplay est possible
    return playerConfig.autoplay;
  };

  return {
    showControls,
    isPlaying,
    currentTime,
    duration,
    isMuted,
    volume,
    handlePlayPause,
    handleSeek,
    handleVolumeChange,
    toggleMute,
    canAutoPlay,
  };
}
