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
  onLoadingChange,
  onClose 
}: HLSPlayerProps) {
  const playerConfig = usePlayerConfig();
  const canAutoPlayRef = useRef<(() => boolean) | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasAutoFullscreenedRef = useRef(false);
  const [hlsDuration, setHlsDuration] = useState<number | undefined>(undefined);
  const hlsDurationRef = useRef<number>(0);
  
  // Réinitialiser hlsDurationRef quand on change de vidéo
  useEffect(() => {
    hlsDurationRef.current = 0;
    setHlsDuration(undefined);
  }, [infoHash, filePath]);
  
  const { videoRef, hlsRef, isLoading, error, hlsLoaded, stopBuffer } = useHlsPlayer({
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
      // Toujours utiliser Math.max pour préserver la valeur la plus élevée
      // Cela garantit que si l'API a défini une valeur supérieure, elle ne sera jamais écrasée
      const newValue = Math.max(hlsDurationRef.current, duration);
      if (newValue > hlsDurationRef.current) {
        hlsDurationRef.current = newValue;
        setHlsDuration(newValue);
      }
    },
  });
  
  // Exposer stopBuffer via window pour que VideoPlayerWrapper puisse l'appeler
  // (solution temporaire, idéalement utiliser forwardRef)
  useEffect(() => {
    (window as any).__hlsPlayerStopBuffer = stopBuffer;
    return () => {
      delete (window as any).__hlsPlayerStopBuffer;
    };
  }, [stopBuffer]);

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
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transform: 'translateZ(0)',
          willChange: 'transform',
        }}
      >
        {isLoading && (
          <div class="absolute inset-0 flex flex-col items-center justify-center bg-black z-10">
            {/* Animation du logo Popcorn */}
            <div class="relative w-32 h-32 mb-6">
              {/* Cercle de chargement externe */}
              <div class="absolute inset-0 border-4 border-primary-600/20 rounded-full"></div>
              <div 
                class="absolute inset-0 border-4 border-primary-600 border-t-transparent rounded-full"
                style={{
                  animation: 'spin 1s linear infinite',
                }}
              ></div>
              {/* Logo Popcorn avec animation pulse */}
              <div 
                class="absolute inset-2 flex items-center justify-center"
                style={{
                  animation: 'pulse 2s ease-in-out infinite',
                }}
              >
                <img 
                  src="/popcorn_logo.png" 
                  alt="Popcorn" 
                  class="w-full h-full object-contain drop-shadow-lg"
                  style={{
                    filter: 'drop-shadow(0 0 10px rgba(220, 38, 38, 0.5))',
                  }}
                />
              </div>
            </div>
            <p class="text-white/80 text-lg font-medium">Chargement de la vidéo...</p>
            {/* Points animés */}
            <div class="flex gap-1 mt-2">
              <span 
                class="w-2 h-2 bg-primary-600 rounded-full"
                style={{ animation: 'bounce 1.4s infinite ease-in-out both', animationDelay: '0s' }}
              ></span>
              <span 
                class="w-2 h-2 bg-primary-600 rounded-full"
                style={{ animation: 'bounce 1.4s infinite ease-in-out both', animationDelay: '0.2s' }}
              ></span>
              <span 
                class="w-2 h-2 bg-primary-600 rounded-full"
                style={{ animation: 'bounce 1.4s infinite ease-in-out both', animationDelay: '0.4s' }}
              ></span>
            </div>
            {/* Keyframes CSS inline */}
            <style>{`
              @keyframes spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
              }
              @keyframes pulse {
                0%, 100% { transform: scale(1); opacity: 1; }
                50% { transform: scale(0.9); opacity: 0.8; }
              }
              @keyframes bounce {
                0%, 80%, 100% { transform: scale(0); }
                40% { transform: scale(1); }
              }
            `}</style>
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
            objectFit: 'contain',
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
          onClose={onClose}
          onRestart={handleRestart}
        />
      </div>
    </div>
  );
}
