import { useState, useEffect, useRef } from 'preact/hooks';
import { emitPlaybackStep } from '../../../streaming/player-core/observability/playbackEvents';
import { usePlayerConfig } from './usePlayerConfig';

interface UseVideoControlsProps {
  videoRef: { current: HTMLVideoElement | null };
  hlsLoaded: boolean;
  hlsDuration?: number;
  isLoading?: boolean;
  /** Position de seek en cours (reload avec seek=) : afficher cette position pendant le buffering au lieu de 0 */
  pendingSeekPosition?: number;
  canUseSeekReload?: boolean;
  /** Si fourni, appelé quand l'utilisateur seek au-delà du buffer (ex. >90s) pour recharger avec seek= */
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

    const updateBuffered = () => {
      const total =
        duration > 0 && isFinite(duration)
          ? duration
          : (video.duration && isFinite(video.duration) ? video.duration : 0);
      if (!total || !isFinite(total)) {
        setBufferedPercent(0);
        return;
      }
      try {
        const buffered = video.buffered;
        if (!buffered || buffered.length === 0) {
          setBufferedPercent(0);
          return;
        }
        const end = buffered.end(buffered.length - 1);
        const percent = Math.max(0, Math.min(100, (end / total) * 100));
        setBufferedPercent(percent);
      } catch (e) {
        setBufferedPercent(0);
      }
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
      updateBuffered();
    };

    const handlePlay = () => {
      console.log(`[PLAYBACK STATE] 🎬 handlePlay: video.paused=${video.paused}, userPausedRef=${userPausedRef.current}, currentTime=${video.currentTime}s`);
      if (userPausedRef.current) {
        requestAnimationFrame(() => {
          if (userPausedRef.current && !video.paused) {
            console.log(`[PLAYBACK STATE] ⏸️ handlePlay: userPausedRef=true, forçage de pause`);
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
      console.log(`[PLAYBACK STATE] ⏸️ handlePause: currentTime=${video.currentTime}s`);
      setIsPlaying(false);
      setShowControls(true);
    };

    const handleSeeking = () => {
      console.log(`[PLAYBACK STATE] 🔍 handleSeeking: currentTime=${video.currentTime}s`);
      setIsSeeking(true);
    };

    const handleSeeked = () => {
      console.log(`[PLAYBACK STATE] ✅ handleSeeked: currentTime=${video.currentTime}s`);
      setIsSeeking(false);
      updateBuffered();
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
      updateBuffered();
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

    // Logs pour suivre l'état de lecture
    const handlePlaying = () => {
      console.log(`[PLAYBACK STATE] ▶️ handlePlaying: vidéo EN COURS DE LECTURE, currentTime=${video.currentTime}s (${Math.floor(video.currentTime / 60)}:${Math.floor(video.currentTime % 60).toString().padStart(2, '0')}), paused=${video.paused}, readyState=${video.readyState}`);
    };
    const handleCanPlay = () => {
      console.log(`[PLAYBACK STATE] ✅ handleCanPlay: vidéo PRÊTE À JOUER, currentTime=${video.currentTime}s, paused=${video.paused}`);
    };
    const handleWaiting = () => {
      console.log(`[PLAYBACK STATE] ⏳ handleWaiting: vidéo EN ATTENTE DE DONNÉES, currentTime=${video.currentTime}s`);
    };
    const handleStalled = () => {
      console.log(`[PLAYBACK STATE] 🛑 handleStalled: chargement BLOQUÉ, currentTime=${video.currentTime}s`);
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('progress', updateBuffered);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('seeking', handleSeeking);
    video.addEventListener('seeked', handleSeeked);
    video.addEventListener('volumechange', handleVolumeChange);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('durationchange', handleDurationChange);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('stalled', handleStalled);

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
      video.removeEventListener('progress', updateBuffered);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('seeking', handleSeeking);
      video.removeEventListener('seeked', handleSeeked);
      video.removeEventListener('volumechange', handleVolumeChange);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('durationchange', handleDurationChange);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('stalled', handleStalled);
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
    console.log(`[SEEK FLOW] 0️⃣ handleSeek APPELÉ, event type=${e?.type}, currentTarget=${e?.currentTarget?.tagName}`);
    const video = videoRef.current;
    if (!video) {
      console.log(`[SEEK FLOW] ❌ handleSeek: video ref null, abandon`);
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const clientX =
      e?.clientX ??
      e?.nativeEvent?.clientX ??
      e?.touches?.[0]?.clientX ??
      e?.changedTouches?.[0]?.clientX;
    if (typeof clientX !== 'number') {
      console.log(`[SEEK FLOW] ❌ handleSeek: clientX invalide (${typeof clientX}), abandon`);
      return;
    }
    const durationValue =
      duration > 0 && isFinite(duration)
        ? duration
        : (video.duration && isFinite(video.duration) ? video.duration : 0);
    if (!durationValue) {
      console.log(`[SEEK FLOW] ❌ handleSeek: durationValue=0, abandon`);
      return;
    }
    if (!rect.width) {
      console.log(`[SEEK FLOW] ❌ handleSeek: rect.width=0, abandon`);
      return;
    }
    const pos = (clientX - rect.left) / rect.width;
    const targetTime = Math.max(0, Math.min(durationValue, pos * durationValue));
    console.log(`[SEEK FLOW] handleSeek: targetTime calculé=${targetTime}s (${Math.floor(targetTime / 60)}:${Math.floor(targetTime % 60).toString().padStart(2, '0')}), pos=${(pos * 100).toFixed(1)}%, duration=${durationValue}s`);

    // Si la cible est au-delà du buffer (ex. playlist progressive limitée à ~90s),
    // recharger la source avec force_vod et seek= pour que le backend renvoie une playlist à partir de targetTime.
    let bufferedEnd = 0;
    try {
      if (video.buffered && video.buffered.length > 0) {
        bufferedEnd = video.buffered.end(video.buffered.length - 1);
      }
    } catch (_) {}

    // Si le mode reloadWithSeek backend est désactivé (ex: certains médias locaux),
    // laisser le seek natif HTML5/HLS gérer la récupération sans forcer de reload backend.
    if (!canUseSeekReload) {
      console.log(`[SEEK FLOW] handleSeek: seek natif (canUseSeekReload=false), targetTime=${targetTime}s`);
      emitPlaybackStep('seek_native', { position: targetTime });
      video.currentTime = targetTime;
      return;
    }

    if (reloadWithSeek && targetTime > 0 && !isLoading) {
      // Pour les gros sauts (> 60s), toujours utiliser reloadWithSeek (ignore buffer minimal)
      // Pour les petits sauts, attendre un buffer minimal avant de reload
      const minBufferedForReload = 20; // secondes
      const margin = 2; // secondes
      const isBeyondBufferedWindow = targetTime > bufferedEnd + margin;
      const isLargeJump = Math.abs(targetTime - video.currentTime) > 60; // Saut > 1 minute
      
      // Si c'est un gros saut OU (buffer suffisant ET au-delà du buffer)
      if (isLargeJump || (bufferedEnd >= minBufferedForReload && isBeyondBufferedWindow)) {
        console.log(`[SEEK FLOW] handleSeek: appel reloadWithSeek pour targetTime=${targetTime}s (${Math.floor(targetTime / 60)}:${Math.floor(targetTime % 60).toString().padStart(2, '0')}), isLargeJump=${isLargeJump}, bufferedEnd=${bufferedEnd}s`);
        emitPlaybackStep('seek_reload', { position: targetTime });
        reloadWithSeek(targetTime);
        return;
      } else {
        console.log(`[SEEK FLOW] handleSeek: condition reloadWithSeek non remplie, seek natif. targetTime=${targetTime}s, bufferedEnd=${bufferedEnd}s, isLargeJump=${isLargeJump}`);
      }
    }

    // Ne pas appliquer un seek natif si un reloadWithSeek est déjà en cours :
    // le buffer ne couvre pas encore la cible et le navigateur clamp serait à l'ancienne position.
    if (isLoading) {
      console.log(`[SEEK FLOW] handleSeek: reload en cours, pas de seek natif (targetTime=${targetTime}s)`);
      return;
    }

    console.log(`[SEEK FLOW] handleSeek: seek natif (petit saut), targetTime=${targetTime}s, currentTime=${video.currentTime}s`);
    emitPlaybackStep('seek_native', { position: targetTime });
    video.currentTime = targetTime;
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

  // Pendant un reload-with-seek, garder la barre de progression à la position demandée au lieu de 0
  const displayCurrentTime =
    pendingSeekPosition > 0 && isLoading ? pendingSeekPosition : currentTime;

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
    handleVolumeChange,
    toggleMute,
    canAutoPlay,
  };
}
