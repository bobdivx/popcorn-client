import { useState, useEffect, useRef } from 'preact/hooks';
import { usePlayerConfig } from './usePlayerConfig';

interface UseVideoControlsProps {
  videoRef: { current: HTMLVideoElement | null };
  hlsLoaded: boolean;
  hlsDuration?: number;
}

export function useVideoControls({ videoRef, hlsLoaded, hlsDuration }: UseVideoControlsProps) {
  const playerConfig = usePlayerConfig();
  const [showControls, setShowControls] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(playerConfig.muted);
  const [volume, setVolume] = useState(playerConfig.volume);
  const controlsTimeoutRef = useRef<number | null>(null);
  const userPausedRef = useRef<boolean>(false);

  // Utiliser la durée HLS en priorité si disponible
  // La durée HLS est toujours prioritaire car elle est calculée depuis la playlist complète
  useEffect(() => {
    if (hlsDuration && hlsDuration > 0 && isFinite(hlsDuration)) {
      // Toujours utiliser hlsDuration si disponible et valide, même si elle est différente
      setDuration(hlsDuration);
    }
  }, [hlsDuration]);

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
      // Utiliser hlsDuration en priorité si disponible, sinon video.duration
      // Mais ne pas écraser hlsDuration si elle est déjà définie et valide
      if (!hlsDuration || hlsDuration === 0 || !isFinite(hlsDuration)) {
        const videoDuration = video.duration || 0;
        // Utiliser video.duration seulement s'il est supérieur à la durée actuelle
        // Cela évite de réduire la durée si hlsDuration était plus grande
        if (videoDuration > 0 && isFinite(videoDuration) && videoDuration > duration) {
          setDuration(videoDuration);
        }
      }
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
      // Utiliser hlsDuration en priorité si disponible, sinon video.duration
      if (!hlsDuration || hlsDuration === 0 || !isFinite(hlsDuration)) {
        const videoDuration = video.duration || 0;
        // Utiliser video.duration seulement s'il est supérieur à la durée actuelle
        if (videoDuration > 0 && isFinite(videoDuration) && videoDuration > duration) {
          setDuration(videoDuration);
        }
      }
    };
    
    const handleDurationChange = () => {
      // Écouter les changements de durée de la vidéo
      // Pour HLS, video.duration peut être mis à jour progressivement
      // On doit toujours utiliser la valeur la plus grande
      const videoDuration = video.duration || 0;
      if (videoDuration > 0 && isFinite(videoDuration)) {
        // Si hlsDuration n'est pas disponible, utiliser video.duration
        // Sinon, utiliser la valeur la plus grande entre hlsDuration et video.duration
        const finalDuration = hlsDuration && hlsDuration > 0 && isFinite(hlsDuration) 
          ? Math.max(hlsDuration, videoDuration) 
          : videoDuration;
        
        // Toujours mettre à jour si la nouvelle durée est supérieure
        if (finalDuration > duration) {
          setDuration(finalDuration);
        }
      }
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
    video.addEventListener('durationchange', handleDurationChange);

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
      video.removeEventListener('durationchange', handleDurationChange);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [videoRef, hlsLoaded, playerConfig, hlsDuration]);

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
    const targetTime = Math.max(0, Math.min(duration, pos * duration));
    if (typeof video.fastSeek === 'function') {
      video.fastSeek(targetTime);
    } else {
      video.currentTime = targetTime;
    }
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
