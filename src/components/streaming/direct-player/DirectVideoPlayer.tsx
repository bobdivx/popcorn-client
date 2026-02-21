import { useState, useEffect, useRef, useMemo } from 'preact/hooks';
import { useVideoControls } from '../player-shared/hooks/useVideoControls';
import { useFullscreen } from '../player-shared/hooks/useFullscreen';
import { useTVPlayerNavigation } from '../player-shared/hooks/useTVPlayerNavigation';
import { usePlayerConfig } from '../player-shared/hooks/usePlayerConfig';
import { VideoControls } from '../player-shared/components/VideoControls';
import { useI18n } from '../../../lib/i18n';
import type { PlayerLoadingTorrentStats } from '../player-shared/components/PlayerLoadingOverlay';

interface DirectVideoPlayerProps {
  src: string;
  closeLabel: string;
  onClose: () => void;
  onLoadedData: () => void;
  onError: (event: Event) => void;
  /** Afficher l’overlay de chargement (même animation que HLS) pendant le chargement initial. */
  loading?: boolean;
  /** Message pendant le chargement initial (ex. « Chargement de la vidéo… »). */
  loadingMessage?: string;
  posterUrl?: string | null;
  logoUrl?: string | null;
  synopsis?: string | null;
  releaseDate?: string | null;
  torrentName?: string;
  /** Stats du client torrent pour afficher la partie téléchargée sur la barre de progression. */
  torrentStats?: PlayerLoadingTorrentStats | null;
  /** Appelé périodiquement et à la fermeture avec la progression (pour Reprendre / Revoir). */
  onProgress?: (currentTime: number, duration: number) => void;
}

export default function DirectVideoPlayer({
  src,
  closeLabel,
  onClose,
  onLoadedData,
  onError,
  loading: loadingProp = false,
  loadingMessage = '',
  posterUrl,
  logoUrl,
  synopsis,
  releaseDate,
  torrentName = '',
  torrentStats,
  onProgress,
}: DirectVideoPlayerProps) {
  const { t } = useI18n();
  const playerConfig = usePlayerConfig();

  /** Progression téléchargement (0–1) pour la barre verte. Utilise downloaded_bytes/total_bytes ou state completed/seeding pour éviter les incohérences (ex. fichier 100% téléchargé mais progress incorrect). */
  const torrentProgress = useMemo(() => {
    if (!torrentStats) return null;
    const s = torrentStats;
    if (s.state === 'completed' || s.state === 'seeding') return 1.0;
    if (s.total_bytes != null && s.total_bytes > 0 && s.downloaded_bytes != null) {
      return Math.min(1, s.downloaded_bytes / s.total_bytes);
    }
    const p = s.progress;
    if (p == null) return null;
    return p > 1 ? p / 100 : p; // normaliser si API renvoie 0–100
  }, [torrentStats]);
  const containerRef = useRef<HTMLDivElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [loaded, setLoaded] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);
  const [hasError, setHasError] = useState(false);

  const isFullscreen = useFullscreen();

  const {
    showControls: baseShowControls,
    isPlaying,
    currentTime,
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
  } = useVideoControls({
    videoRef,
    hlsLoaded: loaded,
    canUseSeekReload: false,
  });

  const [showControls, setShowControls] = useState(baseShowControls);
  useEffect(() => {
    setShowControls(baseShowControls);
  }, [baseShowControls]);

  // Reprendre / Revoir : enregistrer la progression périodiquement et à la fermeture
  useEffect(() => {
    if (!onProgress || duration <= 0) return;
    const id = setInterval(() => onProgress(currentTime, duration), 15000);
    return () => {
      clearInterval(id);
      onProgress(currentTime, duration);
    };
  }, [onProgress, currentTime, duration]);

  const handleToggleFullscreen = () => {
    const container =
      document.getElementById('video-player-wrapper') ||
      containerRef.current ||
      document.getElementById('direct-player-container');
    if (container) toggleFullscreen(container).catch(() => {});
  };

  const handleRestart = () => {
    const video = videoRef.current;
    if (video) {
      video.currentTime = 0;
      video.play().catch(() => {});
    }
  };

  const handleSeekTV = (direction: 'left' | 'right', stepSeconds = 10) => {
    if (!duration) return;
    const newTime =
      direction === 'left'
        ? Math.max(0, currentTime - stepSeconds)
        : Math.min(duration, currentTime + stepSeconds);
    seekToTargetTime(newTime);
  };

  const handleVolumeChangeTV = (direction: 'up' | 'down') => {
    const video = videoRef.current;
    if (!video) return;
    const changeAmount = 0.1;
    const newVolume = direction === 'up' ? Math.min(1, volume + changeAmount) : Math.max(0, volume - changeAmount);
    video.volume = newVolume;
    video.muted = newVolume === 0;
  };

  const { isTV, focusedControlIndex, focusedOnProgress, setFocusedOnProgress, hasBack } = useTVPlayerNavigation({
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
    progressBarRef,
  });

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedData = () => {
      setLoaded(true);
      setIsWaiting(false);
      onLoadedData();
    };

    const handleWaiting = () => setIsWaiting(true);
    const handleCanPlay = () => setIsWaiting(false);
    const handlePlaying = () => setIsWaiting(false);

    video.addEventListener('loadeddata', handleLoadedData);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('playing', handlePlaying);

    return () => {
      video.removeEventListener('loadeddata', handleLoadedData);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('playing', handlePlaying);
    };
  }, [onLoadedData]);

  const shouldShowBuffering =
    loadingProp || isWaiting || (isSeeking && bufferedPercent < 100);
  const effectiveShowControls = showControls;
  const bufferingMessage =
    loadingProp
      ? loadingMessage || t('playback.loadingVideo')
      : bufferedPercent > 0
        ? t('playback.bufferingProgress', { percent: Math.round(bufferedPercent) })
        : t('playback.buffering');

  return (
    <div
      ref={containerRef}
      id="direct-player-container"
      class="w-full h-full flex flex-col relative bg-black group"
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
        {shouldShowBuffering && (
          <div class="absolute inset-0 flex flex-col items-center justify-center bg-black z-10 pointer-events-none">
            <div class="relative w-32 h-32 mb-6">
              <div class="absolute inset-0 border-4 border-primary-600/20 rounded-full" />
              <div
                class="absolute inset-0 border-4 border-primary-600 border-t-transparent rounded-full"
                style={{ animation: 'spin 1s linear infinite' }}
              />
              <div
                class="absolute inset-2 flex items-center justify-center"
                style={{ animation: 'pulse 2s ease-in-out infinite' }}
              >
                <img
                  src="/popcorn_logo.png"
                  alt="Popcorn"
                  class="w-full h-full object-contain drop-shadow-lg"
                  style={{ filter: 'drop-shadow(0 0 10px rgba(220, 38, 38, 0.5))' }}
                />
              </div>
            </div>
            <p class="text-white/80 text-lg font-medium">{bufferingMessage}</p>
            <div class="flex gap-1 mt-2">
              <span
                class="w-2 h-2 bg-primary-600 rounded-full"
                style={{ animation: 'bounce 1.4s infinite ease-in-out both', animationDelay: '0s' }}
              />
              <span
                class="w-2 h-2 bg-primary-600 rounded-full"
                style={{ animation: 'bounce 1.4s infinite ease-in-out both', animationDelay: '0.2s' }}
              />
              <span
                class="w-2 h-2 bg-primary-600 rounded-full"
                style={{ animation: 'bounce 1.4s infinite ease-in-out both', animationDelay: '0.4s' }}
              />
            </div>
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
          src={src}
          class="relative z-0 w-full h-full"
          playsInline
          preload="auto"
          autoPlay
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
          onError={(e) => {
            setHasError(true);
            onError(e as Event);
          }}
          onClick={(e: Event) => {
            const target = (e.target as HTMLElement);
            if (target.closest('.pointer-events-auto')) return;
            e.preventDefault();
            e.stopPropagation();
            handlePlayPause();
          }}
        />
        {/* Overlay d’erreur : toujours visible avec bouton Fermer pour ne pas bloquer l’utilisateur */}
        {hasError && (
          <div class="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/90 pointer-events-auto p-6">
            <div class="flex flex-col items-center max-w-md text-center">
              <div class="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 class="text-white text-xl font-semibold mb-2">{t('common.error')}</h3>
              <p class="text-white/80 text-sm mb-6">{t('playback.errorStream')}</p>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onClose();
                }}
                class="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-primary-600 hover:bg-primary-700 text-white font-medium focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-black min-h-[44px]"
                aria-label={closeLabel}
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                {closeLabel}
              </button>
            </div>
          </div>
        )}
        <VideoControls
          torrentName={torrentName}
          posterUrl={posterUrl ?? undefined}
          logoUrl={logoUrl ?? undefined}
          synopsis={synopsis ?? undefined}
          releaseDate={releaseDate ?? undefined}
          torrentProgress={torrentProgress}
          showControls={hasError ? true : effectiveShowControls}
          isPlaying={isPlaying}
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
          onSeek={handleSeek}
          onVolumeChange={handleVolumeChange}
          onToggleMute={toggleMute}
          onToggleFullscreen={handleToggleFullscreen}
          onSeekTV={handleSeekTV}
          onVolumeChangeTV={handleVolumeChangeTV}
          audioTracks={[]}
          subtitleTracks={[]}
          showLogo={playerConfig.showLogo}
          onClose={onClose}
          onRestart={handleRestart}
        />
      </div>
    </div>
  );
}
