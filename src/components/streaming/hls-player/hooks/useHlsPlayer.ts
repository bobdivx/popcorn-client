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
  // Refs pour les callbacks et configs qui changent mais ne doivent pas déclencher de réinitialisation
  const onErrorRef = useRef(onError);
  const onLoadingChangeRef = useRef(onLoadingChange);
  const canAutoPlayRef = useRef(canAutoPlay);
  const startFromBeginningRef = useRef(startFromBeginning);
  const torrentIdRef = useRef(torrentId);
  
  // Mettre à jour les refs quand les props changent (sans déclencher de réinitialisation)
  useEffect(() => {
    onErrorRef.current = onError;
    onLoadingChangeRef.current = onLoadingChange;
    canAutoPlayRef.current = canAutoPlay;
    startFromBeginningRef.current = startFromBeginning;
    torrentIdRef.current = torrentId;
  }, [onError, onLoadingChange, canAutoPlay, startFromBeginning, torrentId]);

  const { hlsLoaded, error: loaderError } = useHlsLoader();
  const playerConfig = usePlayerConfig();

  useEffect(() => {
    if (loaderError) {
      setError(loaderError);
      setIsLoading(false);
      onErrorRef.current?.(new Error(loaderError));
    }
  }, [loaderError]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !hlsLoaded || !infoHash || !filePath) return;

    // Réinitialiser le compteur de retry seulement si le fichier ou l'infoHash change vraiment
    const filePathChanged = previousFilePathRef.current !== filePath;
    const infoHashChanged = previousInfoHashRef.current !== infoHash;
    
    // Construire l'URL HLS pour vérifier si elle a changé
    const baseUrl = serverApi.getServerUrl();
    const normalizedPath = filePath.replace(/\\/g, '/');
    const encodedPath = encodeURIComponent(normalizedPath);
    const hlsUrl = `${baseUrl}/api/local/stream/${encodedPath}/playlist.m3u8?info_hash=${encodeURIComponent(infoHash)}`;
    
    // Si l'URL est la même que la précédente, ne pas réinitialiser le player
    if (currentSrcRef.current === hlsUrl && hlsRef.current && !filePathChanged && !infoHashChanged) {
      // L'URL est identique et le player existe déjà, ne rien faire
      return;
    }
    
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
        // Passer l'info_hash en query parameter pour que le backend puisse utiliser get_file_path
        const hlsUrl = `${baseUrl}/api/local/stream/${encodedPath}/playlist.m3u8?info_hash=${encodeURIComponent(infoHash)}`;

        // Si l'URL est la même que celle déjà chargée, ne pas réinitialiser
        if (currentSrcRef.current === hlsUrl && hlsRef.current) {
          console.log('[useHlsPlayer] URL HLS identique, réutilisation du player existant:', hlsUrl);
          setIsLoading(false);
          return;
        }

        console.log('[useHlsPlayer] Construction URL HLS:', {
          filePath,
          normalizedPath,
          encodedPath,
          hlsUrl,
          infoHash,
          retryCount: retryCountRef.current,
          previousUrl: currentSrcRef.current,
        });

        // Détruire l'ancien player HLS si il existe
        if (hlsRef.current) {
          try {
            hlsRef.current.destroy();
          } catch (e) {
            console.warn('[useHlsPlayer] Erreur lors de la destruction de l\'ancien player:', e);
          }
          hlsRef.current = null;
        }

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
          onLoadingChangeRef.current?.(false);
          
          if (startFromBeginningRef.current) {
            video.currentTime = 0;
          } else if (torrentIdRef.current) {
            // Charger la position sauvegardée
            const deviceId = getOrCreateDeviceId();
            getPlaybackPosition(torrentIdRef.current, deviceId).then(async (position) => {
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
            if (video.paused && (canAutoPlayRef.current === undefined || canAutoPlayRef.current())) {
              video.play().catch(() => {});
            }
          }, 100);
        });

        hls.on(window.Hls.Events.ERROR, (event: any, data: any) => {
          if (data.fatal) {
            console.error('[useHlsPlayer] Erreur HLS fatale:', {
              type: data.type,
              details: data.details,
              fatal: data.fatal,
              frag: data.frag,
              response: data.response,
              hlsUrl,
            });
            
            // Pour les erreurs réseau (404, networkError), réessayer automatiquement
            // car le fichier HLS peut ne pas être encore prêt même si le torrent est "completed"
            const isNetworkError = data.type === 'networkError' || 
                                  data.type === 'manifestLoadError' ||
                                  (data.details && (
                                    data.details.includes('404') ||
                                    data.details.includes('Failed to fetch') ||
                                    data.details.includes('NetworkError')
                                  ));
            
            // Gestion spécifique des erreurs mediaError
            const isMediaError = data.type === 'mediaError';
            
            if (isMediaError) {
              // Erreur mediaError: problème avec le média lui-même
              // Causes possibles: fichier corrompu, format non supporté, fichier inexistant, conversion HLS échouée
              let errorMsg = 'Erreur de lecture du média';
              let suggestions: string[] = [];
              
              if (data.details) {
                console.error('[useHlsPlayer] Détails de l\'erreur mediaError:', data.details);
                
                if (data.details.includes('buffer') || data.details.includes('Buffer')) {
                  errorMsg = 'Erreur de lecture: problème de tampon vidéo';
                  suggestions.push('Le fichier vidéo peut être corrompu ou incomplet');
                  suggestions.push('La conversion HLS peut avoir échoué');
                } else if (data.details.includes('codec') || data.details.includes('decoder')) {
                  errorMsg = 'Erreur de décodage: codec non supporté ou problème de décodage';
                  suggestions.push('Le format vidéo peut ne pas être compatible');
                  suggestions.push('Le fichier peut nécessiter une conversion');
                } else if (data.details.includes('fragment') || data.details.includes('segment')) {
                  errorMsg = 'Erreur de segment HLS: segment manquant ou corrompu';
                  suggestions.push('La conversion HLS peut être incomplète');
                  suggestions.push('Les segments vidéo peuvent être corrompus');
                }
              }
              
              // Suggestions générales pour mediaError
              if (suggestions.length === 0) {
                suggestions.push('Le fichier vidéo peut être corrompu ou dans un format non supporté');
                suggestions.push('La conversion HLS peut avoir échoué - vérifiez les logs du serveur');
                suggestions.push('Le torrent peut être marqué comme complété mais le fichier peut ne pas être encore disponible sur le disque');
                suggestions.push('Essayez de redémarrer la lecture ou de retélécharger le torrent');
              }
              
              const fullErrorMessage = `${errorMsg}.\n\nCauses possibles:\n${suggestions.map(s => `• ${s}`).join('\n')}`;
              
              console.error('[useHlsPlayer] Erreur mediaError détectée:', {
                errorMsg,
                suggestions,
                data: data,
                filePath,
                infoHash,
              });
              
              setError(fullErrorMessage);
              setIsLoading(false);
              onErrorRef.current?.(new Error(fullErrorMessage));
              return;
            }
            
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
              let errorMsg: string;
              
              if (retryCountRef.current >= maxRetries) {
                errorMsg = `Erreur HLS: ${data.type} (trop de tentatives: ${retryCountRef.current})`;
                
                // Ajouter des suggestions selon le type d'erreur
                if (isNetworkError) {
                  errorMsg += '\n\nLa playlist HLS n\'est toujours pas disponible après plusieurs tentatives.';
                  errorMsg += '\n• Le fichier peut ne pas être complètement téléchargé';
                  errorMsg += '\n• La conversion HLS peut prendre plus de temps';
                  errorMsg += '\n• Vérifiez les logs du serveur pour plus de détails';
                }
              } else {
                errorMsg = `Erreur HLS: ${data.type}`;
                if (data.details) {
                  errorMsg += `\nDétails: ${data.details}`;
                }
              }
              
              console.error('[useHlsPlayer] Erreur HLS fatale (non-récupérable):', {
                type: data.type,
                details: data.details,
                errorMsg,
                retryCount: retryCountRef.current,
              });
              
              setError(errorMsg);
              setIsLoading(false);
              onErrorRef.current?.(new Error(errorMsg));
            }
          } else {
            // Erreur non-fatale, juste logger
            console.warn('[useHlsPlayer] Erreur HLS non-fatale:', {
              type: data.type,
              details: data.details,
            });
          }
        });

        // Sauvegarder la position périodiquement
        const savePositionInterval = setInterval(async () => {
          const currentTorrentId = torrentIdRef.current;
          if (currentTorrentId && filePath && video.duration > 0 && video.currentTime > 0) {
            const files = await clientApi.getTorrentFiles(infoHash);
            const file = files.find(f => f.path === filePath);
            if (file && file.size > 0) {
              const positionBytes = Math.floor((video.currentTime / video.duration) * file.size);
              const deviceId = getOrCreateDeviceId();
              savePlaybackPosition(currentTorrentId, deviceId, positionBytes).catch(() => {});
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
        onErrorRef.current?.(e instanceof Error ? e : new Error(errorMsg));
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
    // IMPORTANT: Utiliser des dépendances stabilisées pour éviter les réinitialisations multiples
    // Seulement infoHash et filePath sont critiques, les autres dépendances sont stables ou gérées via refs
  }, [hlsLoaded, infoHash, filePath]); // Retirer videoRef, fileName, torrentId, startFromBeginning, canAutoPlay, playerConfig, onError, onLoadingChange car ils ne devraient pas déclencher une réinitialisation

  return {
    videoRef,
    hlsRef,
    isLoading,
    error,
    hlsLoaded,
  };
}
