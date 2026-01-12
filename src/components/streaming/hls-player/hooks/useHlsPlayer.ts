import { useState, useEffect, useRef } from 'preact/hooks';
import { useHlsLoader } from './useHlsLoader';
import { usePlayerConfig } from './usePlayerConfig';
import { clientApi } from '../../../../lib/client/api';
import { serverApi } from '../../../../lib/client/server-api';
import { getPlaybackPosition, savePlaybackPosition } from '../../../../lib/streaming/torrent-storage';
import { getOrCreateDeviceId } from '../../../../lib/utils/device-id';

interface UseHlsPlayerProps {
  src: string;
  infoHash?: string;
  fileName: string;
  torrentId?: string;
  filePath?: string;
  startFromBeginning: boolean;
  onError?: (error: Error) => void;
  onLoadingChange?: (loading: boolean) => void;
  canAutoPlay?: () => boolean;
}

export function useHlsPlayer({
  src,
  infoHash,
  fileName,
  torrentId,
  filePath,
  startFromBeginning,
  onError,
  onLoadingChange,
  canAutoPlay,
}: UseHlsPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const currentSrcRef = useRef<string | null>(null);
  const hasStartedPlayingRef = useRef(false);
  const blobUrlRef = useRef<string | null>(null);
  const retryCountRef = useRef(0);
  const maxRetries = 10; // Maximum 10 tentatives
  const retryTimeoutRef = useRef<number | null>(null);
  const previousFilePathRef = useRef<string | null>(null);
  const previousInfoHashRef = useRef<string | null>(null);

  const { hlsLoaded, error: loaderError } = useHlsLoader();
  const playerConfig = usePlayerConfig();

  useEffect(() => {
    if (loaderError) {
      setError(loaderError);
      setIsLoading(false);
      onError?.(new Error(loaderError));
    }
  }, [loaderError, onError]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !hlsLoaded || !infoHash || !filePath) return;

    // Réinitialiser le compteur de retry seulement si le fichier ou l'infoHash change vraiment
    const filePathChanged = previousFilePathRef.current !== filePath;
    const infoHashChanged = previousInfoHashRef.current !== infoHash;
    
    if (filePathChanged || infoHashChanged) {
      retryCountRef.current = 0;
      previousFilePathRef.current = filePath;
      previousInfoHashRef.current = infoHash;
    }

    const initializeVideo = async () => {
      try {
        setIsLoading(true);
        
        // Utiliser l'URL HLS du backend au lieu d'une Blob URL
        const baseUrl = serverApi.getServerUrl();
        // Le backend attend /api/local/stream/{filePath}/playlist.m3u8
        // Le filePath doit être le chemin relatif au répertoire de téléchargement
        // Normaliser le chemin (remplacer les backslashes par des slashes pour l'URL)
        const normalizedPath = filePath.replace(/\\/g, '/');
        const encodedPath = encodeURIComponent(normalizedPath);
        const hlsUrl = `${baseUrl}/api/local/stream/${encodedPath}/playlist.m3u8`;

        console.log('[useHlsPlayer] Construction URL HLS:', {
          filePath,
          normalizedPath,
          encodedPath,
          hlsUrl,
          infoHash,
          retryCount: retryCountRef.current,
        });

        blobUrlRef.current = hlsUrl;
        currentSrcRef.current = hlsUrl;

        // Le backend génère toujours des playlists HLS, donc on utilise toujours HLS.js
        if (!window.Hls || !window.Hls.isSupported()) {
          throw new Error('HLS.js n\'est pas disponible ou n\'est pas supporté par ce navigateur');
        }

        // Utiliser HLS.js pour les playlists HLS du backend
        const hls = new window.Hls({
          enableWorker: true,
          lowLatencyMode: false,
          backBufferLength: 30,
          maxBufferLength: playerConfig.bufferSize,
          maxMaxBufferLength: 120,
          maxBufferSize: playerConfig.maxBufferSize * 1000 * 1000,
        });
        hlsRef.current = hls;

        hls.loadSource(hlsUrl);
        hls.attachMedia(video);

        hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
          // Réinitialiser le compteur de retry en cas de succès
          retryCountRef.current = 0;
          setIsLoading(false);
          onLoadingChange?.(false);
          
          if (startFromBeginning) {
            video.currentTime = 0;
          } else if (torrentId) {
            // Charger la position sauvegardée
            const deviceId = getOrCreateDeviceId();
            getPlaybackPosition(torrentId, deviceId).then(async (position) => {
              if (position && position > 0 && filePath) {
                // Convertir bytes en secondes approximativement
                const files = await clientApi.getTorrentFiles(infoHash);
                const file = files.find(f => f.path === filePath);
                if (file && file.size > 0 && video.duration > 0) {
                  const estimatedSeconds = (position / file.size) * video.duration;
                  const maxPosition = video.duration * 0.95;
                  const finalPosition = Math.min(estimatedSeconds, maxPosition);
                  if (finalPosition > 1) {
                    video.currentTime = finalPosition;
                  }
                }
              }
            });
          }

          setTimeout(() => {
            if (video.paused && (canAutoPlay === undefined || canAutoPlay())) {
              video.play().catch(() => {});
            }
          }, 100);
        });

        hls.on(window.Hls.Events.ERROR, (event: any, data: any) => {
          if (data.fatal) {
            // Pour les erreurs réseau (404, networkError), réessayer automatiquement
            // car le fichier HLS peut ne pas être encore prêt même si le torrent est "completed"
            const isNetworkError = data.type === 'networkError' || 
                                  data.type === 'manifestLoadError' ||
                                  (data.details && (
                                    data.details.includes('404') ||
                                    data.details.includes('Failed to fetch') ||
                                    data.details.includes('NetworkError')
                                  ));
            
            if (isNetworkError && retryCountRef.current < maxRetries) {
              retryCountRef.current++;
              const retryDelay = Math.min(1000 * retryCountRef.current, 5000); // Délai progressif jusqu'à 5s max
              
              console.log(`[useHlsPlayer] Erreur réseau HLS (tentative ${retryCountRef.current}/${maxRetries}), réessai dans ${retryDelay}ms...`, {
                type: data.type,
                details: data.details,
                hlsUrl,
              });
              
              // Détruire l'instance HLS actuelle
              try {
                hls.destroy();
              } catch (e) {}
              
              // Réessayer après un délai en relançant initializeVideo
              retryTimeoutRef.current = window.setTimeout(() => {
                retryTimeoutRef.current = null;
                // Réinitialiser l'erreur et réessayer
                setError(null);
                setIsLoading(true);
                // Relancer initializeVideo
                initializeVideo().catch((e) => {
                  console.error('[useHlsPlayer] Erreur lors du retry:', e);
                  setError(e instanceof Error ? e.message : 'Erreur lors du retry');
                  setIsLoading(false);
                  onError?.(e instanceof Error ? e : new Error('Erreur lors du retry'));
                });
              }, retryDelay);
            } else {
              // Erreur fatale non-réseau ou trop de tentatives
              const errorMsg = retryCountRef.current >= maxRetries 
                ? `Erreur HLS: ${data.type} (trop de tentatives: ${retryCountRef.current})`
                : `Erreur HLS: ${data.type}`;
              setError(errorMsg);
              setIsLoading(false);
              onError?.(new Error(errorMsg));
            }
          }
        });

        // Sauvegarder la position périodiquement
        const savePositionInterval = setInterval(async () => {
          if (torrentId && filePath && video.duration > 0 && video.currentTime > 0) {
            const files = await clientApi.getTorrentFiles(infoHash);
            const file = files.find(f => f.path === filePath);
            if (file && file.size > 0) {
              const positionBytes = Math.floor((video.currentTime / video.duration) * file.size);
              const deviceId = getOrCreateDeviceId();
              savePlaybackPosition(torrentId, deviceId, positionBytes).catch(() => {});
            }
          }
        }, 10000); // Sauvegarder toutes les 10 secondes

        return () => {
          clearInterval(savePositionInterval);
          // Annuler les retries en cours
          if (retryTimeoutRef.current !== null) {
            clearTimeout(retryTimeoutRef.current);
            retryTimeoutRef.current = null;
          }
          // Plus besoin de révoquer les Blob URLs, on utilise des URLs HLS
          blobUrlRef.current = null;
          if (hlsRef.current) {
            try {
              hlsRef.current.destroy();
            } catch (e) {}
            hlsRef.current = null;
          }
          video.src = '';
          video.load();
          // Réinitialiser le compteur de retry
          retryCountRef.current = 0;
        };
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : 'Erreur inconnue';
        setError(errorMsg);
        setIsLoading(false);
        onError?.(e instanceof Error ? e : new Error(errorMsg));
        return () => {};
      }
    };

    initializeVideo();
    
    // Nettoyer les retries lors du démontage
    return () => {
      if (retryTimeoutRef.current !== null) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      // Réinitialiser le compteur de retry
      retryCountRef.current = 0;
    };
  }, [videoRef, hlsLoaded, infoHash, filePath, fileName, torrentId, startFromBeginning, canAutoPlay, playerConfig, onError, onLoadingChange]);

  return {
    videoRef,
    hlsRef,
    isLoading,
    error,
    hlsLoaded,
  };
}
