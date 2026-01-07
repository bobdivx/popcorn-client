import { useState, useEffect, useRef } from 'preact/hooks';
import { useHlsLoader } from './useHlsLoader';
import { usePlayerConfig } from './usePlayerConfig';
import { webtorrentClient } from '../../../../lib/torrent/webtorrent-client';
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

    const initializeVideo = async () => {
      try {
        setIsLoading(true);
        
        // Récupérer l'index du fichier depuis le torrent
        const files = webtorrentClient.getTorrentFiles(infoHash);
        const fileIndex = files.findIndex(f => (f.path || f.name) === filePath);
        
        if (fileIndex === -1) {
          throw new Error('Fichier non trouvé dans le torrent');
        }

        // Créer une Blob URL pour le fichier
        const blobUrl = await webtorrentClient.createBlobUrl(infoHash, fileIndex);
        if (!blobUrl) {
          throw new Error('Impossible de créer la Blob URL');
        }

        blobUrlRef.current = blobUrl;
        currentSrcRef.current = blobUrl;

        // Utiliser HLS.js si c'est un fichier HLS, sinon lire directement
        const ext = fileName.split('.').pop()?.toLowerCase() || '';
        const isHLS = ext === 'm3u8' || blobUrl.includes('.m3u8');

        if (isHLS && window.Hls && window.Hls.isSupported()) {
          // Utiliser HLS.js pour les fichiers HLS
          const hls = new window.Hls({
            enableWorker: true,
            lowLatencyMode: false,
            backBufferLength: 30,
            maxBufferLength: playerConfig.bufferSize,
            maxMaxBufferLength: 120,
            maxBufferSize: playerConfig.maxBufferSize * 1000 * 1000,
          });
          hlsRef.current = hls;

          hls.loadSource(blobUrl);
          hls.attachMedia(video);

          hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
            setIsLoading(false);
            onLoadingChange?.(false);
            
            if (startFromBeginning) {
              video.currentTime = 0;
            } else if (torrentId) {
              // Charger la position sauvegardée
              const deviceId = getOrCreateDeviceId();
              getPlaybackPosition(torrentId, deviceId).then((position) => {
                if (position && position > 0 && filePath) {
                  // Convertir bytes en secondes approximativement
                  const files = webtorrentClient.getTorrentFiles(infoHash);
                  const file = files[fileIndex];
                  if (file && file.length > 0 && video.duration > 0) {
                    const estimatedSeconds = (position / file.length) * video.duration;
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
              setError(`Erreur HLS: ${data.type}`);
              setIsLoading(false);
              onError?.(new Error(`Erreur HLS: ${data.type}`));
            }
          });
        } else {
          // Lecture directe pour les fichiers vidéo non-HLS
          video.src = blobUrl;
          video.addEventListener('loadedmetadata', () => {
            setIsLoading(false);
            onLoadingChange?.(false);
            
            if (startFromBeginning) {
              video.currentTime = 0;
            } else if (torrentId) {
              // Charger la position sauvegardée
              const deviceId = getOrCreateDeviceId();
              getPlaybackPosition(torrentId, deviceId).then((position) => {
                if (position && position > 0 && filePath) {
                  const files = webtorrentClient.getTorrentFiles(infoHash);
                  const file = files[fileIndex];
                  if (file && file.length > 0 && video.duration > 0) {
                    const estimatedSeconds = (position / file.length) * video.duration;
                    const maxPosition = video.duration * 0.95;
                    const finalPosition = Math.min(estimatedSeconds, maxPosition);
                    if (finalPosition > 1) {
                      video.currentTime = finalPosition;
                    }
                  }
                }
              });
            }

            if (canAutoPlay === undefined || canAutoPlay()) {
              video.play().catch(() => {});
            }
          });

          video.addEventListener('error', () => {
            if (video.error) {
              setError(`Erreur vidéo (code ${video.error.code})`);
              setIsLoading(false);
              onError?.(new Error(`Erreur vidéo: ${video.error.message}`));
            }
          });
        }

        // Sauvegarder la position périodiquement
        const savePositionInterval = setInterval(() => {
          if (torrentId && filePath && video.duration > 0 && video.currentTime > 0) {
            const files = webtorrentClient.getTorrentFiles(infoHash);
            const file = files[fileIndex];
            if (file && file.length > 0) {
              const positionBytes = Math.floor((video.currentTime / video.duration) * file.length);
              const deviceId = getOrCreateDeviceId();
              savePlaybackPosition(torrentId, deviceId, positionBytes).catch(() => {});
            }
          }
        }, 10000); // Sauvegarder toutes les 10 secondes

        return () => {
          clearInterval(savePositionInterval);
          if (blobUrlRef.current) {
            URL.revokeObjectURL(blobUrlRef.current);
            blobUrlRef.current = null;
          }
          if (hlsRef.current) {
            try {
              hlsRef.current.destroy();
            } catch (e) {}
            hlsRef.current = null;
          }
          video.src = '';
          video.load();
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
  }, [videoRef, hlsLoaded, infoHash, filePath, fileName, torrentId, startFromBeginning, canAutoPlay, playerConfig, onError, onLoadingChange]);

  return {
    videoRef,
    hlsRef,
    isLoading,
    error,
    hlsLoaded,
  };
}
