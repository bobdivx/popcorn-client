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
  onDurationChange?: (duration: number) => void;
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
  onDurationChange,
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
  const onDurationChangeRef = useRef(onDurationChange);
  const totalDurationRef = useRef<number>(0);
  
  // Mettre à jour les refs quand les props changent (sans déclencher de réinitialisation)
  useEffect(() => {
    onErrorRef.current = onError;
    onLoadingChangeRef.current = onLoadingChange;
    canAutoPlayRef.current = canAutoPlay;
    startFromBeginningRef.current = startFromBeginning;
    torrentIdRef.current = torrentId;
    onDurationChangeRef.current = onDurationChange;
  }, [onError, onLoadingChange, canAutoPlay, startFromBeginning, torrentId, onDurationChange]);

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
      // Liste des fonctions de nettoyage à appeler
      const cleanupFunctions: Array<() => void> = [];
      
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

        // Appel non bloquant à l'API durée (ffprobe). Ne pas retarder le démarrage HLS.
        const durationUrl = `${baseUrl}/api/local/duration?path=${encodedPath}&info_hash=${encodeURIComponent(infoHash)}`;
        // #region agent log
        console.log('[useHlsPlayer] duration fetch starting', { baseUrl, hasPath: !!encodedPath, hasInfoHash: !!infoHash });
        fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'useHlsPlayer.ts:durationFetch', message: 'duration fetch starting', data: { baseUrl, hasPath: !!encodedPath, hasInfoHash: !!infoHash }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'H1' }) }).catch(() => {});
        // #endregion
        const ac = new AbortController();
        const t = setTimeout(() => ac.abort(), 3000);
        fetch(durationUrl, { signal: ac.signal })
          .then((r) => {
            clearTimeout(t);
            if (!r.ok) {
              // #region agent log
              console.warn('[useHlsPlayer] duration API !ok:', r.status, r.statusText, durationUrl);
              fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'useHlsPlayer.ts:durationFetch', message: 'duration API !ok', data: { status: r.status, statusText: r.statusText }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'H2' }) }).catch(() => {});
              // #endregion
              return;
            }
            return r.json();
          })
          .then((res: { success?: boolean; data?: { duration: number } } | undefined) => {
            if (!res) return;
            const d = res?.data?.duration;
            if (typeof d === 'number' && d > 0 && isFinite(d)) {
              const prevBeforeApi = totalDurationRef.current;
              totalDurationRef.current = Math.max(totalDurationRef.current, d);
              onDurationChangeRef.current?.(d);
              // #region agent log
              console.log('[useHlsPlayer] duration set from API', d, 'prev was', prevBeforeApi, 'new value', totalDurationRef.current);
              fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'useHlsPlayer.ts:durationFetch', message: 'duration set from API', data: { duration: d, prevBeforeApi, newValue: totalDurationRef.current }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'H4' }) }).catch(() => {});
              // #endregion
            } else {
              // #region agent log
              console.warn('[useHlsPlayer] duration API 200 but invalid duration', { hasData: !!res?.data, dType: typeof d, d });
              fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'useHlsPlayer.ts:durationFetch', message: 'duration API 200 but invalid duration', data: { hasData: !!res?.data, dType: typeof d, d }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'H4' }) }).catch(() => {});
              // #endregion
            }
          })
          .catch((e) => {
            clearTimeout(t);
            // #region agent log
            console.warn('[useHlsPlayer] duration fetch failed', e);
            fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'useHlsPlayer.ts:durationFetch', message: 'duration fetch failed', data: { err: String((e as Error)?.message ?? e), name: (e as Error)?.name }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'H2' }) }).catch(() => {});
            // #endregion
          });

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

        // Définir checkDuration une seule fois en dehors de MANIFEST_PARSED pour éviter les problèmes de closure
        // et garantir qu'une seule instance écoute les événements
        let lastVideoDuration = 0;
        let durationStableCount = 0;
        const checkDuration = () => {
          const videoDuration = video.duration;
          const prevBeforeCheck = totalDurationRef.current;
          // #region agent log
          fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'useHlsPlayer.ts:checkDuration', message: 'checkDuration called', data: { videoDuration: videoDuration || null, prevBeforeCheck, timestamp: Date.now() }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'H4' }) }).catch(() => {});
          // #endregion
          if (videoDuration && isFinite(videoDuration) && videoDuration > 0) {
            // Si la durée vidéo a changé, réinitialiser le compteur de stabilité
            if (videoDuration !== lastVideoDuration) {
              lastVideoDuration = videoDuration;
              durationStableCount = 0;
            } else {
              durationStableCount++;
            }
            
            // Utiliser video.duration comme source de vérité principale
            // car il contient la durée réelle depuis les métadonnées du fichier
            // MAIS ne jamais écraser une durée supérieure déjà définie (ex: depuis l'API)
            // (cela évite d'utiliser la durée du buffer au lieu de la durée réelle)
            const prev = totalDurationRef.current;
            // TOUJOURS utiliser Math.max pour préserver la valeur la plus élevée
            // Cela garantit que si l'API a défini une valeur supérieure, elle ne sera jamais écrasée
            const newValue = Math.max(prev, videoDuration);
            // Ne mettre à jour que si la nouvelle valeur est supérieure à la valeur actuelle
            // Cela empêche d'écraser une valeur supérieure (ex: depuis l'API) avec une valeur inférieure
            if (newValue > prev) {
              // La nouvelle valeur est supérieure, l'utiliser
              totalDurationRef.current = newValue;
              onDurationChangeRef.current?.(newValue);
              // #region agent log
              fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'useHlsPlayer.ts:checkDuration', message: 'duration update (using Math.max, newValue > prev)', data: { videoDuration, totalDurationRef: totalDurationRef.current, prev, newValue, durationStableCount }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'H4' }) }).catch(() => {});
              // #endregion
            } else {
              // La nouvelle valeur n'est pas supérieure, ne pas écraser
              // Log pour debug si prev est significativement supérieur (probablement depuis l'API)
              if (prev > videoDuration && prev > 500) {
                // #region agent log
                fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'useHlsPlayer.ts:checkDuration', message: 'duration NOT updated (prev > video, preserving API value)', data: { videoDuration, totalDurationRef: totalDurationRef.current, prev, newValue, durationStableCount }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'H4' }) }).catch(() => {});
                // #endregion
              }
            }
          }
        };

        // Écouter les événements de durée du vidéo (une seule fois, en dehors de MANIFEST_PARSED)
        // pour éviter d'ajouter plusieurs listeners si MANIFEST_PARSED est déclenché plusieurs fois
        video.addEventListener('loadedmetadata', checkDuration);
        video.addEventListener('durationchange', checkDuration);
        cleanupFunctions.push(() => {
          video.removeEventListener('loadedmetadata', checkDuration);
          video.removeEventListener('durationchange', checkDuration);
        });

        hls.on(window.Hls.Events.MANIFEST_PARSED, (event: any, data: any) => {
          // Réinitialiser le compteur de retry en cas de succès
          retryCountRef.current = 0;
          setIsLoading(false);
          onLoadingChangeRef.current?.(false);
          
          // Extraire la durée totale depuis la playlist HLS
          // La durée totale peut être obtenue depuis les niveaux de qualité
          let totalDuration = 0;
          
          // D'abord, essayer d'obtenir la durée depuis data.totalduration
          if (data && data.totalduration && data.totalduration > 0) {
            totalDuration = data.totalduration;
          }
          
          // Si pas disponible, chercher dans tous les niveaux
          if (totalDuration === 0 && hls.levels && hls.levels.length > 0) {
            // Parcourir tous les niveaux pour trouver la durée la plus longue
            for (const level of hls.levels) {
              if (level.details) {
                // D'abord essayer totalduration
                if (level.details.totalduration && level.details.totalduration > totalDuration) {
                  totalDuration = level.details.totalduration;
                }
                // Sinon, calculer depuis les fragments
                else if (level.details.fragments && level.details.fragments.length > 0) {
                  const lastFragment = level.details.fragments[level.details.fragments.length - 1];
                  const calculatedDuration = lastFragment.start + lastFragment.duration;
                  if (calculatedDuration > totalDuration) {
                    totalDuration = calculatedDuration;
                  }
                }
              }
            }
          }
          
          // Si toujours pas de durée, essayer de calculer depuis tous les fragments de tous les niveaux
          if (totalDuration === 0 && hls.levels && hls.levels.length > 0) {
            for (const level of hls.levels) {
              if (level.details && level.details.fragments && level.details.fragments.length > 0) {
                // Additionner tous les fragments
                let sum = 0;
                for (const frag of level.details.fragments) {
                  if (frag.duration) {
                    sum += frag.duration;
                  }
                }
                if (sum > totalDuration) {
                  totalDuration = sum;
                }
              }
            }
          }
          
          // Si on a une durée valide, ne notifier que si on augmente la durée (éviter d'écraser l'API durée)
          if (totalDuration > 0 && isFinite(totalDuration)) {
            const prev = totalDurationRef.current;
            totalDurationRef.current = Math.max(prev, totalDuration);
            if (totalDurationRef.current > prev) {
              onDurationChangeRef.current?.(totalDurationRef.current);
            }
            // #region agent log
            fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'useHlsPlayer.ts:MANIFEST_PARSED', message: 'duration update in MANIFEST_PARSED', data: { prev, totalDuration, newValue: totalDurationRef.current }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'H2' }) }).catch(() => {});
            // #endregion
          }

          const segCount = hls.levels?.[0]?.details?.fragments?.length ?? 0;
          // #region agent log
          fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'useHlsPlayer.ts:MANIFEST_PARSED', message: 'duration sources', data: { dataTotalDuration: data?.totalduration ?? null, totalDuration, segmentCount: segCount, videoDuration: video.duration || null, currentRef: totalDurationRef.current }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'H2' }) }).catch(() => {});
          // #endregion
          
          // Vérifier la durée immédiatement après le parsing du manifest
          checkDuration();
          
          // Stocker la fonction de nettoyage pour le return
          cleanupFunctions.push(() => {
            video.removeEventListener('loadedmetadata', checkDuration);
            video.removeEventListener('durationchange', checkDuration);
          });
          
          if (startFromBeginningRef.current) {
            video.currentTime = 0;
          } else if (torrentIdRef.current) {
            // Charger la position sauvegardée (maintenant en secondes directement)
            const deviceId = getOrCreateDeviceId();
            getPlaybackPosition(torrentIdRef.current, deviceId).then(async (positionSeconds) => {
              if (positionSeconds && positionSeconds > 0) {
                // La position est maintenant directement en secondes
                // Utiliser la durée totale si disponible, sinon video.duration
                const videoDuration = totalDuration > 0 ? totalDuration : (video.duration || 0);
                if (videoDuration > 0) {
                  totalDurationRef.current = videoDuration;
                  // Limiter la position à 95% de la durée pour éviter les problèmes de fin de vidéo
                  const maxPosition = videoDuration * 0.95;
                  const finalPosition = Math.min(positionSeconds, maxPosition);
                  if (finalPosition > 1) {
                    video.currentTime = finalPosition;
                  }
                } else {
                  // Si la durée n'est pas encore disponible, attendre un peu et réessayer
                  setTimeout(() => {
                    const retryDuration = totalDurationRef.current > 0 ? totalDurationRef.current : (video.duration || 0);
                    if (retryDuration > 0) {
                      const maxPosition = retryDuration * 0.95;
                      const finalPosition = Math.min(positionSeconds, maxPosition);
                      if (finalPosition > 1) {
                        video.currentTime = finalPosition;
                      }
                    }
                  }, 1000);
                }
              }
            });
          }

          // Arrêter le buffer HLS lors de la pause pour économiser la bande passante
          const handlePause = () => {
            if (hlsRef.current && hlsRef.current.media) {
              try {
                hlsRef.current.stopLoad();
              } catch (e) {
                console.warn('[useHlsPlayer] Erreur lors de l\'arrêt du buffer:', e);
              }
            }
          };
          
          const handlePlay = () => {
            if (hlsRef.current && hlsRef.current.media) {
              try {
                hlsRef.current.startLoad();
              } catch (e) {
                console.warn('[useHlsPlayer] Erreur lors de la reprise du buffer:', e);
              }
            }
          };
          
          video.addEventListener('pause', handlePause);
          video.addEventListener('play', handlePlay);
          
          cleanupFunctions.push(() => {
            video.removeEventListener('pause', handlePause);
            video.removeEventListener('play', handlePlay);
          });

          setTimeout(() => {
            if (video.paused && (canAutoPlayRef.current === undefined || canAutoPlayRef.current())) {
              video.play().catch(() => {});
            }
          }, 100);
        });
        
        // Écouter LEVEL_LOADED pour obtenir la durée complète quand un niveau est complètement chargé
        // NOTE: La durée depuis les fragments peut être celle du buffer, donc on privilégie video.duration
        hls.on(window.Hls.Events.LEVEL_LOADED, (event: any, data: any) => {
          if (data && data.details) {
            let levelDuration = 0;
            
            // Essayer d'obtenir totalduration
            if (data.details.totalduration) {
              levelDuration = data.details.totalduration;
            }
            // Sinon, calculer depuis les fragments
            else if (data.details.fragments && data.details.fragments.length > 0) {
              const lastFragment = data.details.fragments[data.details.fragments.length - 1];
              levelDuration = lastFragment.start + lastFragment.duration;
              
              // Si toujours 0, additionner tous les fragments
              if (levelDuration === 0) {
                for (const frag of data.details.fragments) {
                  if (frag.duration) {
                    levelDuration += frag.duration;
                  }
                }
              }
            }
            
            // Ne mettre à jour que si la durée calculée est supérieure
            // TOUJOURS utiliser Math.max pour préserver la valeur la plus élevée (notamment celle de l'API)
            const videoDuration = video.duration || 0;
            if (levelDuration > 0 && isFinite(levelDuration)) {
              // Utiliser la durée la plus grande entre celle calculée, video.duration, et la valeur actuelle
              // Cela garantit que la valeur de l'API (634.6s) n'est jamais écrasée
              const finalDuration = Math.max(totalDurationRef.current, levelDuration, videoDuration);
              if (finalDuration > totalDurationRef.current) {
                totalDurationRef.current = finalDuration;
                onDurationChangeRef.current?.(finalDuration);
              }
            }
          }
        });
        
        // Écouter LEVEL_UPDATED pour mettre à jour la durée si elle change
        // NOTE: Pour les playlists dynamiques, cela peut être la durée du buffer
        // On privilégie toujours video.duration si disponible
        hls.on(window.Hls.Events.LEVEL_UPDATED, (event: any, data: any) => {
          if (data && data.details) {
            let levelDuration = 0;
            
            // Essayer d'obtenir totalduration
            if (data.details.totalduration) {
              levelDuration = data.details.totalduration;
            }
            // Sinon, calculer depuis les fragments
            else if (data.details.fragments && data.details.fragments.length > 0) {
              const lastFragment = data.details.fragments[data.details.fragments.length - 1];
              levelDuration = lastFragment.start + lastFragment.duration;
            }
            
            // TOUJOURS utiliser Math.max pour préserver la valeur la plus élevée (notamment celle de l'API)
            const videoDuration = video.duration || 0;
            if (levelDuration > 0 && isFinite(levelDuration)) {
              // Utiliser la durée la plus grande entre celle calculée, video.duration, et la valeur actuelle
              // Cela garantit que la valeur de l'API (634.6s) n'est jamais écrasée
              const finalDuration = Math.max(totalDurationRef.current, levelDuration, videoDuration);
              if (finalDuration > totalDurationRef.current) {
                totalDurationRef.current = finalDuration;
                onDurationChangeRef.current?.(finalDuration);
              }
            }
          }
        });
        
        // Écouter FRAG_LOADED pour mettre à jour la durée si elle devient plus précise
        // NOTE: Pour les playlists dynamiques, cela peut être la durée du buffer
        // On privilégie toujours video.duration si disponible
        hls.on(window.Hls.Events.FRAG_LOADED, (event: any, data: any) => {
          if (data && data.details && data.details.totalduration) {
            const fragDuration = data.details.totalduration;
            const videoDuration = video.duration || 0;
            // TOUJOURS utiliser Math.max pour préserver la valeur la plus élevée (notamment celle de l'API)
            // Utiliser la durée la plus grande entre celle du fragment, video.duration, et la valeur actuelle
            const finalDuration = Math.max(totalDurationRef.current, fragDuration, videoDuration);
            if (finalDuration > 0 && isFinite(finalDuration) && finalDuration > totalDurationRef.current) {
              totalDurationRef.current = finalDuration;
              onDurationChangeRef.current?.(finalDuration);
            }
          }
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

        // Sauvegarder la position périodiquement (maintenant directement en secondes)
        const savePositionInterval = setInterval(async () => {
          const currentTorrentId = torrentIdRef.current;
          if (currentTorrentId && video.currentTime > 0) {
            // Sauvegarder directement en secondes pour plus de précision
            const deviceId = getOrCreateDeviceId();
            savePlaybackPosition(currentTorrentId, deviceId, video.currentTime).catch(() => {});
          }
        }, 10000); // Sauvegarder toutes les 10 secondes

        // Fonction pour sauvegarder la position et arrêter le buffer
        const savePositionAndStopBuffer = async () => {
          // Sauvegarder la position avant de quitter
          const currentTorrentId = torrentIdRef.current;
          if (currentTorrentId && video.currentTime > 0) {
            const deviceId = getOrCreateDeviceId();
            try {
              await savePlaybackPosition(currentTorrentId, deviceId, video.currentTime);
            } catch (e) {
              console.warn('[useHlsPlayer] Erreur lors de la sauvegarde de position:', e);
            }
          }
          
          // Arrêter le buffer
          if (hlsRef.current && hlsRef.current.media) {
            try {
              hlsRef.current.stopLoad();
            } catch (e) {
              console.warn('[useHlsPlayer] Erreur lors de l\'arrêt du buffer:', e);
            }
          }
        };

        // Arrêter le buffer lors de la sortie de page
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
          savePositionAndStopBuffer();
          // Note: on ne peut pas empêcher la navigation, mais on peut sauvegarder
        };

        const handleVisibilityChange = () => {
          if (document.hidden) {
            // Page cachée, arrêter le buffer et sauvegarder
            savePositionAndStopBuffer();
          }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        cleanupFunctions.push(() => {
          window.removeEventListener('beforeunload', handleBeforeUnload);
          document.removeEventListener('visibilitychange', handleVisibilityChange);
        });

        return () => {
          clearInterval(savePositionInterval);
          // Sauvegarder la position et arrêter le buffer lors du cleanup
          savePositionAndStopBuffer();
          // Nettoyer tous les event listeners
          cleanupFunctions.forEach(cleanup => cleanup());
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

  // Fonction pour arrêter le buffer manuellement (utile lors de la fermeture)
  const stopBuffer = () => {
    if (hlsRef.current && hlsRef.current.media) {
      try {
        hlsRef.current.stopLoad();
      } catch (e) {
        console.warn('[useHlsPlayer] Erreur lors de l\'arrêt manuel du buffer:', e);
      }
    }
  };

  return {
    videoRef,
    hlsRef,
    isLoading,
    error,
    hlsLoaded,
    stopBuffer,
  };
}
