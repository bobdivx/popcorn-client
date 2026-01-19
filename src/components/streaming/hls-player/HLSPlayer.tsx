import { useEffect, useState, useRef } from 'preact/hooks';
import { useVideoControls } from './hooks/useVideoControls';
import { useFullscreen, toggleFullscreen } from './hooks/useFullscreen';
import { ErrorDisplay } from './components/ErrorDisplay';
import { VideoControls } from './components/VideoControls';
import type { HLSPlayerProps } from './types';
import { useHlsPlayer } from './hooks/useHlsPlayer';
import { useTVPlayerNavigation } from './hooks/useTVPlayerNavigation';
import { useHlsTracks } from './hooks/useHlsTracks';
import { usePlayerConfig } from './hooks/usePlayerConfig';
import { shouldAutoFullscreen } from '../../../lib/utils/device-detection';

export default function HLSPlayer({ 
  src, 
  infoHash, 
  fileName, 
  torrentName, 
  torrentId, 
  filePath, 
  startFromBeginning = false, 
  onError, 
  onLoadingChange 
}: HLSPlayerProps) {
  const playerConfig = usePlayerConfig();
  const canAutoPlayRef = useRef<(() => boolean) | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasAutoFullscreenedRef = useRef(false);
  const [hlsDuration, setHlsDuration] = useState<number | undefined>(undefined);
  
  const { videoRef, hlsRef, isLoading, error, hlsLoaded } = useHlsPlayer({
    src,
    infoHash,
    fileName,
    torrentId,
    filePath,
    startFromBeginning,
    onError,
    onLoadingChange,
    canAutoPlay: () => canAutoPlayRef.current ? canAutoPlayRef.current() : true,
    onDurationChange: (duration) => {
      setHlsDuration(duration);
    },
  });

  const isFullscreen = useFullscreen();
  
  const {
    showControls: baseShowControls,
    isPlaying,
    currentTime,
    duration,
    isMuted,
    volume,
    handlePlayPause,
    handleSeek: baseHandleSeek,
    handleVolumeChange: baseHandleVolumeChange,
    toggleMute,
    canAutoPlay,
  } = useVideoControls({ videoRef, hlsLoaded, hlsDuration });
  
  useEffect(() => {
    canAutoPlayRef.current = canAutoPlay;
  }, [canAutoPlay]);

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

  useEffect(() => {
    setShowControls(baseShowControls);
  }, [baseShowControls]);

  const handleSeekTV = (direction: 'left' | 'right') => {
    const video = videoRef.current;
    if (!video || !duration) return;
    const seekAmount = 10;
    const newTime = direction === 'left' 
      ? Math.max(0, currentTime - seekAmount)
      : Math.min(duration, currentTime + seekAmount);
    video.currentTime = newTime;
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

  // Activer le plein écran automatiquement au démarrage sur mobile/Android
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !hlsLoaded || hasAutoFullscreenedRef.current) return;

    const handleFirstPlay = () => {
      if (shouldAutoFullscreen() && !isFullscreen) {
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
  }, [videoRef, hlsLoaded, isFullscreen]);

  const { isTV, focusedControlIndex } = useTVPlayerNavigation({
    showControls,
    setShowControls,
    onPlayPause: handlePlayPause,
    onSeek: handleSeekTV,
    onVolumeChange: handleVolumeChangeTV,
    onToggleMute: toggleMute,
    onToggleFullscreen: handleToggleFullscreen,
    duration,
    currentTime,
  });

  const displayError = error;

  if (displayError) {
    return <ErrorDisplay error={displayError} />;
  }

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
        class="relative flex-1 bg-black overflow-hidden" 
        style={{ 
          width: '100%', 
          height: '100%',
          transform: 'translateZ(0)',
          willChange: 'transform',
        }}
      >
        {isLoading && (
          <div class="absolute inset-0 flex items-center justify-center bg-black z-10">
            <span class="loading loading-spinner loading-lg text-white"></span>
            <p class="absolute bottom-4 text-white text-sm">Chargement de la vidéo...</p>
          </div>
        )}
        <video
          ref={videoRef}
          class="w-full h-full object-contain relative z-0"
          playsInline
          preload="auto"
          autoplay={playerConfig.autoplay}
          muted={playerConfig.muted}
          style={{
            transform: playerConfig.hardwareAcceleration ? 'translateZ(0)' : 'none',
            willChange: 'auto',
            backfaceVisibility: playerConfig.hardwareAcceleration ? 'hidden' : 'visible',
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
          showControls={showControls}
          isPlaying={isPlaying}
          currentTime={currentTime}
          duration={duration}
          isMuted={isMuted}
          volume={volume}
          isFullscreen={isFullscreen}
          isTV={isTV}
          focusedControlIndex={focusedControlIndex}
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
        />
      </div>
    </div>
  );
}
