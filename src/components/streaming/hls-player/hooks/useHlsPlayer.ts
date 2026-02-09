import { useState, useEffect, useRef } from 'preact/hooks';
import { useHlsLoader } from './useHlsLoader';
import { usePlayerConfig } from './usePlayerConfig';
import { clientApi } from '../../../../lib/client/api';
import { serverApi } from '../../../../lib/client/server-api';
import {
  getPlaybackPosition,
  savePlaybackPosition,
  savePlaybackPositionByMedia,
} from '../../../../lib/streaming/torrent-storage';
import { getOrCreateDeviceId } from '../../../../lib/utils/device-id';

interface UseHlsPlayerProps {
  src: string;
  infoHash?: string;
  fileName: string;
  torrentId?: string;
  filePath?: string;
  /** Pour sauvegarder la position par média (tmdb), reprise même avec un autre info_hash */
  tmdbId?: number;
  tmdbType?: 'movie' | 'tv';
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
  tmdbId,
  tmdbType,
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
  const forceVodInFlightRef = useRef(false);
  const pendingSeekRef = useRef<number | null>(null);
  const hlsFileIdRef = useRef<string | null>(null);
  const activeVideoRegisteredRef = useRef(false);
  const fileIdPollTimeoutRef = useRef<number | null>(null);
  // Refs pour les callbacks et configs qui changent mais ne doivent pas déclencher de réinitialisation
  const onErrorRef = useRef(onError);
  const onLoadingChangeRef = useRef(onLoadingChange);
  const canAutoPlayRef = useRef(canAutoPlay);
  const startFromBeginningRef = useRef(startFromBeginning);
  const torrentIdRef = useRef(torrentId);
  const tmdbIdRef = useRef(tmdbId);
  const tmdbTypeRef = useRef(tmdbType);
  const onDurationChangeRef = useRef(onDurationChange);
  const totalDurationRef = useRef<number>(0);
  const apiDurationRef = useRef<number>(0);
  
  // Mettre à jour les refs quand les props changent (sans déclencher de réinitialisation)
  useEffect(() => {
    onErrorRef.current = onError;
    onLoadingChangeRef.current = onLoadingChange;
    canAutoPlayRef.current = canAutoPlay;
    startFromBeginningRef.current = startFromBeginning;
    torrentIdRef.current = torrentId;
    tmdbIdRef.current = tmdbId;
    tmdbTypeRef.current = tmdbType;
    onDurationChangeRef.current = onDurationChange;
  }, [onError, onLoadingChange, canAutoPlay, startFromBeginning, torrentId, tmdbId, tmdbType, onDurationChange]);

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
    
    const baseUrl = serverApi.getServerUrl();
    const buildHlsUrl = (forceVod = false) => {
      const normalizedPath = filePath.replace(/\\/g, '/');
      const encodedPath = encodeURIComponent(normalizedPath);
      const params = new URLSearchParams({
        info_hash: infoHash,
      });
      if (forceVod) {
        params.set('force_vod', 'true');
      }
      return `${baseUrl}/api/local/stream/${encodedPath}/playlist.m3u8?${params.toString()}`;
    };
    // Construire l'URL HLS pour vérifier si elle a changé
    const hlsUrl = buildHlsUrl(false);
    
    // Si l'URL est la même que la précédente, ne pas réinitialiser le player
    if (currentSrcRef.current === hlsUrl && hlsRef.current && !filePathChanged && !infoHashChanged) {
      // L'URL est identique et le player existe déjà, ne rien faire
      return;
    }
    
    if (filePathChanged || infoHashChanged) {
      retryCountRef.current = 0;
      previousFilePathRef.current = filePath;
      previousInfoHashRef.current = infoHash;
      totalDurationRef.current = 0;
      apiDurationRef.current = 0;
      hlsFileIdRef.current = null;
      activeVideoRegisteredRef.current = false;
    }

    const registerActiveVideo = async (fileId: string) => {
      try {
        await fetch(`${baseUrl}/api/media/cache/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ file_id: fileId }),
        });
        activeVideoRegisteredRef.current = true;
      } catch (e) {
        console.warn('[useHlsPlayer] Impossible d\'enregistrer la vidéo active:', e);
      }
    };

    const unregisterActiveVideo = async () => {
      const fileId = hlsFileIdRef.current;
      if (!fileId || !activeVideoRegisteredRef.current) return;
      activeVideoRegisteredRef.current = false;
      try {
        await fetch(`${baseUrl}/api/media/cache/unregister`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ file_id: fileId }),
        });
      } catch (e) {
        console.warn('[useHlsPlayer] Impossible de désenregistrer la vidéo active:', e);
      }
    };

    const resolveAndRegisterFileId = async (playlistUrl: string, attempt = 0) => {
      if (hlsFileIdRef.current) return;
      try {
        const res = await fetch(playlistUrl, { method: 'HEAD', cache: 'no-store' });
        if (res.ok) {
          const fileId = res.headers.get('x-hls-file-id');
          if (fileId) {
            hlsFileIdRef.current = fileId;
            await registerActiveVideo(fileId);
            return;
          }
        }
      } catch (e) {
        console.warn('[useHlsPlayer] Impossible de récupérer le file_id HLS:', e);
      }
      if (attempt < 10 && !hlsFileIdRef.current) {
        const delay = Math.min(1000 + attempt * 500, 4000);
        fileIdPollTimeoutRef.current = window.setTimeout(() => {
          resolveAndRegisterFileId(playlistUrl, attempt + 1);
        }, delay);
      }
    };

    const initializeVideo = async (forceReload = false) => {
      // Liste des fonctions de nettoyage à appeler
      const cleanupFunctions: Array<() => void> = [];
      
      try {
        setIsLoading(true);
        
        // Utiliser l'URL HLS du backend au lieu d'une Blob URL
        // Passer l'info_hash en query parameter pour que le backend puisse utiliser get_file_path
        const hlsUrl = buildHlsUrl(false);
        void resolveAndRegisterFileId(hlsUrl);

        // Si l'URL est la même que celle déjà chargée, ne pas réinitialiser
        if (!forceReload && currentSrcRef.current === hlsUrl && hlsRef.current) {
          console.log('[useHlsPlayer] URL HLS identique, réutilisation du player existant:', hlsUrl);
          setIsLoading(false);
          return;
        }

        console.log('[useHlsPlayer] Construction URL HLS:', {
          filePath,
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
        const encodedPathParam = encodeURIComponent(filePath.replace(/\\/g, '/'));
        const durationUrl = `${baseUrl}/api/local/duration?path=${encodedPathParam}&info_hash=${encodeURIComponent(infoHash)}`;
        const ac = new AbortController();
        const t = setTimeout(() => ac.abort(), 10000);
        fetch(durationUrl, { signal: ac.signal })
          .then((r) => {
            clearTimeout(t);
            if (!r.ok) {
              throw new Error(`API returned ${r.status}`);
            }
            return r.json();
          })
          .then((res: { success?: boolean; data?: { duration: number } } | undefined) => {
            if (!res) return;
            const d = res?.data?.duration;
            if (typeof d === 'number' && d > 0 && isFinite(d)) {
              apiDurationRef.current = d;
              totalDurationRef.current = d;
              onDurationChangeRef.current?.(d);
            }
          })
          .catch((e) => {
            clearTimeout(t);
            const message = e instanceof Error ? e.message : String(e);
            console.warn('[useHlsPlayer] Could not fetch duration:', message);
          });

        // Le backend génère toujours des playlists HLS, donc on utilise toujours HLS.js
        if (!window.Hls || !window.Hls.isSupported()) {
          throw new Error('HLS.js n\'est pas disponible ou n\'est pas supporté par ce navigateur');
        }

        // Utiliser HLS.js pour les playlists HLS du backend
        const hls = new window.Hls({
          enableWorker: true,
          lowLatencyMode: false,
          // Buffering plus réactif pour les seeks
          backBufferLength: 10,
          maxBufferLength: playerConfig.bufferSize,
          maxMaxBufferLength: 120,
          maxBufferSize: playerConfig.maxBufferSize * 1000 * 1000,
          maxBufferHole: 0.5,
          highBufferWatchdogPeriod: 2,
          nudgeOffset: 0.1,
          nudgeMaxRetry: 5,
          // Qualité adaptée au player et démarrage rapide
          capLevelToPlayerSize: true,
          startLevel: -1,
          // Timeouts: manifeste plus long pour 4K/NAS (génération HLS peut dépasser 10s)
          fragLoadingTimeOut: 20000,
          manifestLoadingTimeOut: 60000,
          levelLoadingTimeOut: 20000,
        });
        hlsRef.current = hls;

        hls.loadSource(hlsUrl);
        hls.attachMedia(video);

        const applyDurationCandidate = (candidate: number) => {
          if (!candidate || !isFinite(candidate) || candidate <= 0) return;
          const apiDuration = apiDurationRef.current;
          if (apiDuration > 0 && isFinite(apiDuration)) {
            if (totalDurationRef.current !== apiDuration) {
              totalDurationRef.current = apiDuration;
              onDurationChangeRef.current?.(apiDuration);
            }
            return;
          }
          // Ne pas appliquer une durée très courte venue du manifest (ex. 48s d'intro)
          // quand l'API durée n'a pas répondu (404/0, ex. bibliothèque distante) pour éviter
          // d'afficher "0:48" au lieu de la vraie durée du film.
          const MIN_DURATION_WHEN_NO_API = 120;
          if (apiDuration <= 0 && candidate < MIN_DURATION_WHEN_NO_API) return;
          const next = Math.max(totalDurationRef.current, candidate);
          if (next > totalDurationRef.current) {
            totalDurationRef.current = next;
            onDurationChangeRef.current?.(next);
          }
        };

        // Définir checkDuration une seule fois en dehors de MANIFEST_PARSED pour éviter les problèmes de closure
        // et garantir qu'une seule instance écoute les événements
        let lastVideoDuration = 0;
        let durationStableCount = 0;
        const checkDuration = () => {
          const videoDuration = video.duration;
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
            applyDurationCandidate(videoDuration);
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
          applyDurationCandidate(totalDuration);
          
          // Vérifier la durée immédiatement après le parsing du manifest
          checkDuration();
          
          // Stocker la fonction de nettoyage pour le return
          cleanupFunctions.push(() => {
            video.removeEventListener('loadedmetadata', checkDuration);
            video.removeEventListener('durationchange', checkDuration);
          });
          
          if (startFromBeginningRef.current) {
            video.currentTime = 0;
            if (playerConfig.skipIntroEnabled && playerConfig.introSkipSeconds > 0) {
              setTimeout(() => {
                const introEnd = Math.min(
                  playerConfig.introSkipSeconds,
                  video.duration && isFinite(video.duration) ? video.duration - 1 : playerConfig.introSkipSeconds
                );
                if (introEnd > 0) video.currentTime = introEnd;
              }, 200);
            }
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

          const isTimeBuffered = (time: number) => {
            const buffered = video.buffered;
            if (!buffered || buffered.length === 0) return false;
            for (let i = 0; i < buffered.length; i++) {
              const start = buffered.start(i);
              const end = buffered.end(i);
              if (time >= start - 0.05 && time <= end + 0.05) {
                return true;
              }
            }
            return false;
          };

          const requestForceVod = async (target: number) => {
            if (forceVodInFlightRef.current) return;
            forceVodInFlightRef.current = true;
            setIsLoading(true);
            pendingSeekRef.current = target;

            const forceUrl = buildHlsUrl(true);
            const maxAttempts = 30;
            let reloaded = false;
            for (let attempt = 0; attempt < maxAttempts; attempt++) {
              try {
                const res = await fetch(forceUrl, { cache: 'no-store' });
                if (res.status === 200) {
                  const reloadUrl = `${forceUrl}&_=${Date.now()}`;
                  const hls = hlsRef.current;
                  if (hls) {
                    const onParsed = () => {
                      hls.off(window.Hls.Events.MANIFEST_PARSED, onParsed);
                      const seekTarget = pendingSeekRef.current ?? target;
                      if (Number.isFinite(seekTarget) && seekTarget > 0) {
                        video.currentTime = seekTarget;
                        hls.startLoad(seekTarget);
                      } else {
                        hls.startLoad();
                      }
                      pendingSeekRef.current = null;
                    };
                    hls.on(window.Hls.Events.MANIFEST_PARSED, onParsed);
                    hls.loadSource(reloadUrl);
                    reloaded = true;
                  }
                  break;
                }
                if (res.status !== 202) {
                  break;
                }
              } catch (e) {
                console.warn('[useHlsPlayer] Force VOD request failed:', e);
                break;
              }
              await new Promise((resolve) => setTimeout(resolve, 1500));
            }

            forceVodInFlightRef.current = false;
            if (!reloaded) {
              setIsLoading(false);
            }
          };

          // Recharger le buffer lors d'un seek (utile si le buffer a été stoppé)
          const handleSeeking = () => {
            if (hlsRef.current && hlsRef.current.media) {
              try {
                const target = Number.isFinite(video.currentTime) ? video.currentTime : -1;
                if (target > 0 && !isTimeBuffered(target)) {
                  hlsRef.current.stopLoad();
                  void requestForceVod(target);
                  return;
                }
                if (forceVodInFlightRef.current) {
                  hlsRef.current.stopLoad();
                  return;
                }
                hlsRef.current.stopLoad();
                // Demande explicitement à HLS de (re)charger depuis la nouvelle position
                hlsRef.current.startLoad(target);
              } catch (e) {
                console.warn('[useHlsPlayer] Erreur lors de la reprise du buffer (seek):', e);
              }
            }
          };

          video.addEventListener('seeking', handleSeeking);

          cleanupFunctions.push(() => {
            video.removeEventListener('seeking', handleSeeking);
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
              const finalDuration = Math.max(levelDuration, videoDuration);
              applyDurationCandidate(finalDuration);
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
              const finalDuration = Math.max(levelDuration, videoDuration);
              applyDurationCandidate(finalDuration);
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
            const finalDuration = Math.max(fragDuration, videoDuration);
            applyDurationCandidate(finalDuration);
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
            const statusCode = data?.response?.code;
            const isNetworkError = data.type === 'networkError' || 
                                  data.type === 'manifestLoadError' ||
                                  (typeof statusCode === 'number' && statusCode >= 500) ||
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
              const retryDelay = retryCountRef.current <= 3
                ? 500 * retryCountRef.current
                : Math.min(2000 * retryCountRef.current, 5000);
              
              console.log(`[useHlsPlayer] Erreur réseau HLS (tentative ${retryCountRef.current}/${maxRetries}), réessai dans ${retryDelay}ms...`, {
                type: data.type,
                details: data.details,
                hlsUrl,
              });
              
              // Détruire l'instance HLS actuelle
              try {
                hls.destroy();
              } catch (e) {}
              
              // Marquer l'instance comme invalidée pour forcer une réinit au retry
              hlsRef.current = null;
              currentSrcRef.current = null;
              
              // Réessayer après un délai en relançant initializeVideo
              retryTimeoutRef.current = window.setTimeout(() => {
                retryTimeoutRef.current = null;
                // Réinitialiser l'erreur et réessayer
                setError(null);
                setIsLoading(true);
                // Relancer initializeVideo
                initializeVideo(true).catch((e) => {
                  console.error('[useHlsPlayer] Erreur lors du retry:', e);
                  setError(e instanceof Error ? e.message : 'Erreur lors du retry');
                  setIsLoading(false);
                  onErrorRef.current?.(e instanceof Error ? e : new Error('Erreur lors du retry'));
                });
              }, retryDelay);
            } else {
              // Erreur fatale non-réseau ou trop de tentatives
              let errorMsg: string;
              
              if (retryCountRef.current >= maxRetries) {
                const statusSuffix = typeof statusCode === 'number' ? ` (HTTP ${statusCode})` : '';
                errorMsg = `Erreur HLS: ${data.type}${statusSuffix} (trop de tentatives: ${retryCountRef.current})`;
                
                // Ajouter des suggestions selon le type d'erreur
                if (isNetworkError) {
                  errorMsg += '\n\nLa playlist HLS n\'est toujours pas disponible après plusieurs tentatives.';
                  errorMsg += '\n• Le fichier peut ne pas être complètement téléchargé';
                  errorMsg += '\n• La conversion HLS peut prendre plus de temps';
                  errorMsg += '\n• Vérifiez les logs du serveur pour plus de détails';
                  if (statusCode === 503) {
                    errorMsg += '\n• Vérifiez que FFmpeg est bien installé sur le serveur (HLS en dépend)';
                  }
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
          const deviceId = getOrCreateDeviceId();
          if (video.currentTime > 0) {
            if (currentTorrentId) {
              savePlaybackPosition(currentTorrentId, deviceId, video.currentTime).catch(() => {});
            }
            const tid = tmdbIdRef.current;
            const tty = tmdbTypeRef.current;
            if (typeof tid === 'number' && (tty === 'movie' || tty === 'tv')) {
              savePlaybackPositionByMedia(tid, tty, deviceId, video.currentTime).catch(() => {});
            }
          }
        }, 10000); // Sauvegarder toutes les 10 secondes

        // Fonction pour sauvegarder la position et arrêter le buffer
        const savePositionAndStopBuffer = async () => {
          const deviceId = getOrCreateDeviceId();
          if (video.currentTime > 0) {
            const currentTorrentId = torrentIdRef.current;
            if (currentTorrentId) {
              try {
                await savePlaybackPosition(currentTorrentId, deviceId, video.currentTime);
              } catch (e) {
                console.warn('[useHlsPlayer] Erreur lors de la sauvegarde de position:', e);
              }
            }
            const tid = tmdbIdRef.current;
            const tty = tmdbTypeRef.current;
            if (typeof tid === 'number' && (tty === 'movie' || tty === 'tv')) {
              try {
                await savePlaybackPositionByMedia(tid, tty, deviceId, video.currentTime);
              } catch (e) {
                console.warn('[useHlsPlayer] Erreur sauvegarde position (media):', e);
              }
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
          void unregisterActiveVideo();
          // Note: on ne peut pas empêcher la navigation, mais on peut sauvegarder
        };

        const handleVisibilityChange = () => {
          if (document.hidden) {
            // Page cachée, arrêter le buffer et sauvegarder
            savePositionAndStopBuffer();
          } else if (hlsRef.current && hlsRef.current.media) {
            // Reprendre le buffer quand l'onglet redevient visible
            try {
              hlsRef.current.startLoad();
            } catch (e) {
              console.warn('[useHlsPlayer] Erreur lors de la reprise du buffer (visibility):', e);
            }
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
          void unregisterActiveVideo();
          if (fileIdPollTimeoutRef.current !== null) {
            clearTimeout(fileIdPollTimeoutRef.current);
            fileIdPollTimeoutRef.current = null;
          }
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
      if (fileIdPollTimeoutRef.current !== null) {
        clearTimeout(fileIdPollTimeoutRef.current);
        fileIdPollTimeoutRef.current = null;
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
