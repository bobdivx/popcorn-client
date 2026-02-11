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
import { emitPlaybackStep } from '../../player-core/observability/playbackEvents';

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
  /** URL du backend de stream (ex. bibliothèque ami). Évite les reconstructions implicites via getServerUrl(). */
  baseUrl?: string;
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
  baseUrl: baseUrlProp,
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
  // Jellyfin handleHlsJsMediaError: debounce pour recoverMediaError / swapAudioCodec
  const recoverDecodingErrorDateRef = useRef<number>(0);
  const recoverSwapAudioCodecDateRef = useRef<number>(0);
  const previousFilePathRef = useRef<string | null>(null);
  const previousInfoHashRef = useRef<string | null>(null);
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
  /** Seek à appliquer après le prochain chargement de manifest (reload avec seek=) */
  const pendingSeekRef = useRef<number>(0);
  const reloadWithSeekRef = useRef<((seekSeconds: number) => void) | null>(null);
  /** URL du dernier reloadWithSeek (pour retry si 503) */
  const seekLoadUrlRef = useRef<string | null>(null);
  const seekLoadRetryCountRef = useRef<number>(0);
  const seekFallbackTriedRef = useRef<boolean>(false);
  /** Restauration playlist progressive après 503 sur fallback : retries dédiés */
  const restoringProgressiveRef = useRef<boolean>(false);
  const progressiveRestoreRetryCountRef = useRef<number>(0);
  /** 404 sur un segment (progressive) : retry par rechargement de la playlist */
  const segment404RetryCountRef = useRef<number>(0);
  /** 503 sur rechargement de niveau (même URL seek) après un Seek OK : retries avant d’afficher l’erreur */
  const levelReload503RetryCountRef = useRef<number>(0);
  const seekVerifyTimeoutRef = useRef<number | null>(null);

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
    const baseUrl = (baseUrlProp && baseUrlProp.trim()) || serverApi.getServerUrl();
    const buildHlsUrl = (forceVod = false, seekSeconds?: number) => {
      const normalizedPath = filePath.replace(/\\/g, '/');
      const encodedPath = encodeURIComponent(normalizedPath);
      const params = new URLSearchParams({
        info_hash: infoHash,
      });
      if (forceVod) {
        params.set('force_vod', 'true');
        if (Number.isFinite(seekSeconds) && (seekSeconds ?? 0) > 0) {
          params.set('seek', String(seekSeconds));
        }
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

    const initializeVideo = async (forceReload = false, useForceVod = false) => {
      // Liste des fonctions de nettoyage à appeler
      const cleanupFunctions: Array<() => void> = [];
      
      try {
        setIsLoading(true);
        
        // Utiliser l'URL HLS du backend. force_vod quand 503 (playlist en cours de génération)
        const hlsUrl = buildHlsUrl(useForceVod);
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

        // Appel non bloquant à l'API durée (ffprobe). Ignoré pour flux local (backend n'expose pas /api/local/duration).
        const isLocalStream = hlsUrl.includes('/api/local/');
        if (!isLocalStream) {
          const encodedPathParam = encodeURIComponent(filePath.replace(/\\/g, '/'));
          const durationUrl = `${baseUrl}/api/local/duration?path=${encodedPathParam}&info_hash=${encodeURIComponent(infoHash)}`;
          const ac = new AbortController();
          const t = setTimeout(() => ac.abort(), 10000);
          fetch(durationUrl, { signal: ac.signal })
            .then((r) => {
              clearTimeout(t);
              if (!r.ok) {
                const err = new Error(`API returned ${r.status}`) as Error & { status?: number };
                err.status = r.status;
                throw err;
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
              const status = (e as Error & { status?: number }).status;
              if (status !== 404) {
                const message = e instanceof Error ? e.message : String(e);
                console.warn('[useHlsPlayer] Could not fetch duration:', message);
              }
            });
        }

        // Le backend génère toujours des playlists HLS, donc on utilise toujours HLS.js
        if (!window.Hls || !window.Hls.isSupported()) {
          throw new Error('HLS.js n\'est pas disponible ou n\'est pas supporté par ce navigateur');
        }

        // Configuration HLS.js. Buffer large pour 4K/REMUX/NAS où le transcodage peut être plus lent que le temps réel
        // (sinon la lecture s'arrête ~1 min quand le buffer 60s s'épuise)
        const maxBufferLength = 120;
        const hls = new window.Hls({
          enableWorker: true,
          lowLatencyMode: false,
          // Jellyfin-style: backBufferLength défini globalement dans useHlsLoader
          maxBufferLength,
          maxMaxBufferLength: maxBufferLength,
          maxBufferSize: playerConfig.maxBufferSize * 1000 * 1000,
          maxBufferHole: 0.5,
          highBufferWatchdogPeriod: 2,
          nudgeOffset: 0.1,
          nudgeMaxRetry: 15,
          // Qualité adaptée au player et démarrage rapide
          capLevelToPlayerSize: true,
          startLevel: -1,
          // Timeouts augmentés pour REMUX/NAS (premier segment peut prendre 30s+)
          fragLoadingTimeOut: 45000,
          manifestLoadingTimeOut: 30000,
          levelLoadingTimeOut: 45000,
        });
        hlsRef.current = hls;

        hls.loadSource(hlsUrl);
        hls.attachMedia(video);

        // Permet de recharger la playlist avec seek= pour avancer au-delà du buffer (ex. >90s)
        reloadWithSeekRef.current = (seekSeconds: number) => {
          const seekUrl = buildHlsUrl(true, seekSeconds);
          if (!hlsRef.current || !hlsRef.current.media) return;
          if (currentSrcRef.current === seekUrl) {
            video.currentTime = seekSeconds;
            return;
          }
          pendingSeekRef.current = seekSeconds;
          seekLoadUrlRef.current = seekUrl;
          seekLoadRetryCountRef.current = 0;
          levelReload503RetryCountRef.current = 0;
          seekFallbackTriedRef.current = false;
          currentSrcRef.current = seekUrl;
          setIsLoading(true);
          console.log(`[SEEK FLOW] 1️⃣ reloadWithSeek: demande seek à ${seekSeconds}s (${Math.floor(seekSeconds / 60)}:${Math.floor(seekSeconds % 60).toString().padStart(2, '0')}), currentTime actuel: ${video.currentTime}s, pendingSeekRef set à ${seekSeconds}s`);
          try {
            hlsRef.current.loadSource(seekUrl);
            console.log(`[SEEK FLOW] 2️⃣ loadSource: URL chargée avec seek=${seekSeconds}s`);
          } catch (e) {
            console.warn('[useHlsPlayer] reloadWithSeek loadSource:', e);
            pendingSeekRef.current = 0;
            seekLoadUrlRef.current = null;
            setIsLoading(false);
          }
        };

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

        // Reprise du chargement quand le buffer est vide (event 'waiting') — complète bufferStalledError
        let waitingTimeoutId: number | null = null;
        const handleWaiting = () => {
          if (waitingTimeoutId !== null) return;
          waitingTimeoutId = window.setTimeout(() => {
            waitingTimeoutId = null;
            const hls = hlsRef.current;
            if (hls && hls.media) {
              try {
                const pos = Number.isFinite(video.currentTime) ? video.currentTime : -1;
                hls.startLoad(pos >= 0 ? pos : undefined);
              } catch (_) {}
            }
          }, 400);
        };
        video.addEventListener('waiting', handleWaiting);
        cleanupFunctions.push(() => {
          video.removeEventListener('waiting', handleWaiting);
          if (waitingTimeoutId !== null) clearTimeout(waitingTimeoutId);
        });

        hls.on(window.Hls.Events.MANIFEST_PARSED, (event: any, data: any) => {
          // Réinitialiser le compteur de retry en cas de succès
          const hadSeekRetries = seekLoadRetryCountRef.current > 0 && pendingSeekRef.current > 0;
          if (hadSeekRetries) {
            console.debug('[useHlsPlayer] Seek OK: playlist reçue après', seekLoadRetryCountRef.current, 'retry(s)');
          }
          console.log(`[SEEK FLOW] MANIFEST_PARSED: pendingSeek=${pendingSeekRef.current}s, video.currentTime=${video.currentTime}s`);
          retryCountRef.current = 0;
          seekLoadRetryCountRef.current = 0;
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
          
          // Jellyfin seekOnPlaybackStart / setCurrentTimeIfNeeded: ne seek que si diff >= 1s
          const setCurrentTimeIfNeeded = (seconds: number) => {
            if (Math.abs((video.currentTime || 0) - seconds) >= 1) {
              video.currentTime = seconds;
            }
          };

          if (startFromBeginningRef.current) {
            setCurrentTimeIfNeeded(0);
            if (playerConfig.skipIntroEnabled && playerConfig.introSkipSeconds > 0) {
              setTimeout(() => {
                const introEnd = Math.min(
                  playerConfig.introSkipSeconds,
                  video.duration && isFinite(video.duration) ? video.duration - 1 : playerConfig.introSkipSeconds
                );
                if (introEnd > 0) setCurrentTimeIfNeeded(introEnd);
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
                    setCurrentTimeIfNeeded(finalPosition);
                  }
                } else {
                  // Si la durée n'est pas encore disponible, attendre un peu et réessayer
                  setTimeout(() => {
                    const retryDuration = totalDurationRef.current > 0 ? totalDurationRef.current : (video.duration || 0);
                    if (retryDuration > 0) {
                      const maxPosition = retryDuration * 0.95;
                      const finalPosition = Math.min(positionSeconds, maxPosition);
                      if (finalPosition > 1) {
                        setCurrentTimeIfNeeded(finalPosition);
                      }
                    }
                  }, 1000);
                }
              }
            });
          }

          // Jellyfin bindEventsToHlsPlayer: play immédiatement sur MANIFEST_PARSED
          if (video.paused && (canAutoPlayRef.current === undefined || canAutoPlayRef.current())) {
            video.play().catch(() => {});
          }
        });
        
        // Écouter LEVEL_LOADED pour obtenir la durée complète quand un niveau est complètement chargé
        // NOTE: La durée depuis les fragments peut être celle du buffer, donc on privilégie video.duration
        hls.on(window.Hls.Events.LEVEL_LOADED, (event: any, data: any) => {
          segment404RetryCountRef.current = 0;
          levelReload503RetryCountRef.current = 0;
          const pendingSeek = pendingSeekRef.current;
          console.log(`[SEEK FLOW] 3️⃣ LEVEL_LOADED: pendingSeek=${pendingSeek}s, video.currentTime=${video.currentTime}s`);
          if (pendingSeek > 0 && Number.isFinite(pendingSeek)) {
            pendingSeekRef.current = 0;
            restoringProgressiveRef.current = false;
            progressiveRestoreRetryCountRef.current = 0;
            try {
              hls.startLoad(pendingSeek);
            } catch (_) {}
            const oldTime = video.currentTime;
            video.currentTime = pendingSeek;
            console.log(`[SEEK FLOW] 4️⃣ LEVEL_LOADED: video.currentTime mis à jour de ${oldTime}s à ${pendingSeek}s (${Math.floor(pendingSeek / 60)}:${Math.floor(pendingSeek % 60).toString().padStart(2, '0')})`);
            const maxSeekVerifyRetries = 25;
            const toleranceSec = 1;
            let retries = 0;
            const runVerify = () => {
              if (seekVerifyTimeoutRef.current != null) clearTimeout(seekVerifyTimeoutRef.current);
              seekVerifyTimeoutRef.current = window.setTimeout(() => {
                seekVerifyTimeoutRef.current = null;
                const now = video.currentTime;
                if (Math.abs(now - pendingSeek) <= toleranceSec || retries >= maxSeekVerifyRetries) {
                  setIsLoading(false);
                  return;
                }
                retries += 1;
                video.currentTime = pendingSeek;
                runVerify();
              }, retries === 0 ? 100 : 200);
            };
            runVerify();
          } else {
            console.log(`[SEEK FLOW] ⚠️ LEVEL_LOADED: pendingSeek=${pendingSeek} invalide ou déjà traité, pas de mise à jour de currentTime`);
          }
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

        // Jellyfin handleHlsJsMediaError: recovery MEDIA_ERR_DECODE / MEDIA_ERROR
        const handleHlsJsMediaError = (): boolean => {
          const hls = hlsRef.current;
          if (!hls) return false;
          const now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
          const recoverDecodingErrorDate = recoverDecodingErrorDateRef.current;
          const recoverSwapAudioCodecDate = recoverSwapAudioCodecDateRef.current;

          if (!recoverDecodingErrorDate || now - recoverDecodingErrorDate > 3000) {
            recoverDecodingErrorDateRef.current = now;
            console.debug('[useHlsPlayer] Tentative de récupération MEDIA_ERROR...');
            hls.recoverMediaError();
            return true;
          }
          if (!recoverSwapAudioCodecDate || now - recoverSwapAudioCodecDate > 3000) {
            recoverSwapAudioCodecDateRef.current = now;
            console.debug('[useHlsPlayer] Tentative swap audio + récupération MEDIA_ERROR...');
            hls.swapAudioCodec();
            hls.recoverMediaError();
            return true;
          }
          console.error('[useHlsPlayer] Impossible de récupérer après MEDIA_ERROR');
          return false;
        };

        hls.on(window.Hls.Events.ERROR, (event: any, data: any) => {
          const HlsErrorTypes = window.Hls.ErrorTypes;
          const statusCode = data?.response?.code;

          // Jellyfin bindEventsToHlsPlayer: erreur réseau avec code >= 400 → destroy
          if (data.type === HlsErrorTypes?.NETWORK_ERROR && typeof statusCode === 'number' && statusCode >= 400) {
            // 503/202 = playlist seek en cours de génération côté backend (cf. Jellyfin: nouveau stream URL avec position)
            const seekUrl = seekLoadUrlRef.current;
            // 503/202 = playlist seek en cours de génération (backend peut prendre 2-5 min pour un long film avec seek lointain)
            if ((statusCode === 503 || statusCode === 202) && pendingSeekRef.current > 0 && seekUrl && seekLoadRetryCountRef.current < 15) {
              seekLoadRetryCountRef.current += 1;
              const retryAfterHeader = data?.response?.headers?.['Retry-After'] ?? data?.response?.headers?.['retry-after'];
              const retryAfterSec = typeof retryAfterHeader === 'string' ? parseInt(retryAfterHeader, 10) : NaN;
              const baseDelays = [4000, 8000, 12000, 20000, 35000, 55000]; // Jusqu'à 55s entre retries
              const delayMs = Number.isFinite(retryAfterSec) && retryAfterSec > 0
                ? retryAfterSec * 1000
                : baseDelays[Math.min(seekLoadRetryCountRef.current - 1, baseDelays.length - 1)];
              emitPlaybackStep('retry_503', { attempt: seekLoadRetryCountRef.current });
              console.debug('[useHlsPlayer] 503/202 sur reloadWithSeek, retry', seekLoadRetryCountRef.current, 'dans', delayMs / 1000, 's');
              window.setTimeout(() => {
                if (hlsRef.current && seekLoadUrlRef.current === seekUrl) {
                  try {
                    hlsRef.current.loadSource(seekUrl);
                  } catch (e) {
                    pendingSeekRef.current = 0;
                    seekLoadUrlRef.current = null;
                    setIsLoading(false);
                  }
                }
              }, delayMs);
              return;
            }
            // Après 15 retries (environ 5 minutes), abandonner et afficher une erreur
            if (
              (statusCode === 503 || statusCode === 202) &&
              pendingSeekRef.current > 0 &&
              seekUrl &&
              seekLoadRetryCountRef.current >= 15 &&
              hlsRef.current
            ) {
              console.error('[useHlsPlayer] 503 après 15 retries (5+ min) → abandon du seek, le serveur n\'a pas terminé la génération');
              pendingSeekRef.current = 0;
              seekLoadUrlRef.current = null;
              setError('Le serveur met trop de temps à générer la vidéo. Réessayez plus tard.');
              setIsLoading(false);
              return;
            }
            // 503 pendant restauration progressive : retry avec délai (éviter boucle fallback ↔ progressive)
            if (
              (statusCode === 503 || statusCode === 202) &&
              restoringProgressiveRef.current &&
              hlsRef.current
            ) {
              if (progressiveRestoreRetryCountRef.current < 2) {
                progressiveRestoreRetryCountRef.current += 1;
                const originalUrl = buildHlsUrl(false);
                const delayMs = 4000;
                console.debug('[useHlsPlayer] 503 sur playlist progressive, retry', progressiveRestoreRetryCountRef.current, 'dans', delayMs / 1000, 's');
                window.setTimeout(() => {
                  if (hlsRef.current) {
                    try {
                      currentSrcRef.current = originalUrl;
                      hlsRef.current.loadSource(originalUrl);
                      setIsLoading(true);
                    } catch (e) {
                      restoringProgressiveRef.current = false;
                      progressiveRestoreRetryCountRef.current = 0;
                    }
                  }
                }, delayMs);
                return;
              }
              restoringProgressiveRef.current = false;
              // ne pas remettre progressiveRestoreRetryCountRef à 0 pour éviter de ré-entrer le bloc fallback ci-dessous
            }
            // 503 sur rechargement de niveau (même URL seek) après Seek OK : pendingSeekRef est déjà à 0, retry avant de détruire
            const isSeekUrl = seekLoadUrlRef.current && (currentSrcRef.current === seekLoadUrlRef.current || (data?.response?.url && String(data.response.url).includes('force_vod=true') && String(data.response.url).includes('seek=')));
            if (
              (statusCode === 503 || statusCode === 202) &&
              isSeekUrl &&
              levelReload503RetryCountRef.current < 3 &&
              hlsRef.current
            ) {
              levelReload503RetryCountRef.current += 1;
              const urlToReload = seekLoadUrlRef.current || currentSrcRef.current;
              const delayMs = 2000;
              console.debug('[useHlsPlayer] 503 sur rechargement niveau (seek), retry', levelReload503RetryCountRef.current, 'dans', delayMs / 1000, 's');
              window.setTimeout(() => {
                if (hlsRef.current && urlToReload) {
                  try {
                    hlsRef.current.loadSource(urlToReload);
                  } catch (e) {
                    levelReload503RetryCountRef.current = 0;
                  }
                }
              }, delayMs);
              return;
            }
            // NOTE : Cette section "503 sur fallback -> playlist progressive" a été supprimée.
            // Maintenant qu'on n'utilise plus le fallback "force_vod sans seek", on n'a plus besoin
            // de revenir à la playlist progressive. Le client attend simplement que le serveur
            // finisse la génération du seek.
            // 404 sur un segment (playlist progressive : segment pas encore écrit) → retry par rechargement playlist
            if (
              statusCode === 404 &&
              data.frag &&
              hlsRef.current &&
              segment404RetryCountRef.current < 2
            ) {
              segment404RetryCountRef.current += 1;
              const url = currentSrcRef.current;
              console.debug(
                '[useHlsPlayer] 404 segment, rechargement playlist (retry',
                segment404RetryCountRef.current,
                ')'
              );
              window.setTimeout(() => {
                if (hlsRef.current && url) {
                  try {
                    hlsRef.current.loadSource(url);
                    setIsLoading(true);
                  } catch (e) {
                    segment404RetryCountRef.current = 0;
                  }
                }
              }, 2000);
              return;
            }

            console.debug('[useHlsPlayer] Erreur HLS réponse HTTP:', statusCode);
            restoringProgressiveRef.current = false;
            progressiveRestoreRetryCountRef.current = 0;
            segment404RetryCountRef.current = 0;
            levelReload503RetryCountRef.current = 0;
            try {
              hls.destroy();
            } catch (_) {}
            hlsRef.current = null;
            seekLoadUrlRef.current = null;
            const msg = `Erreur serveur HLS (HTTP ${statusCode})`;
            setError(msg);
            setIsLoading(false);
            onErrorRef.current?.(new Error(msg));
            return;
          }

          if (data.fatal) {
            console.error('[useHlsPlayer] Erreur HLS fatale:', {
              type: data.type,
              details: data.details,
              fatal: data.fatal,
              frag: data.frag,
              response: data.response,
              hlsUrl,
            });

            // Jellyfin: MEDIA_ERROR → handleHlsJsMediaError (recover ou swap audio)
            if (data.type === HlsErrorTypes?.MEDIA_ERROR) {
              if (handleHlsJsMediaError()) return;
              try {
                hls.destroy();
              } catch (_) {}
              hlsRef.current = null;
              const msg = 'Erreur HLS fatale: impossible de récupérer après erreur média';
              setError(msg);
              setIsLoading(false);
              onErrorRef.current?.(new Error(msg));
              return;
            }

            // Jellyfin: NETWORK_ERROR fatal
            if (data.type === HlsErrorTypes?.NETWORK_ERROR) {
              if (statusCode === 0) {
                // CORS ou problème d'accès
                try {
                  hls.destroy();
                } catch (_) {}
                hlsRef.current = null;
                const msg = 'Erreur réseau HLS (accès refusé ou CORS)';
                setError(msg);
                setIsLoading(false);
                onErrorRef.current?.(new Error(msg));
                return;
              }
              // Tenter de récupérer
              console.debug('[useHlsPlayer] Erreur réseau fatale, tentative hls.startLoad()');
              try {
                hls.startLoad();
              } catch (_) {}
              return;
            }

            // Erreur fatale non-réseau, non-média: retry réseau ou destroy
            const isNetworkError = data.type === 'networkError' ||
                                  data.type === 'manifestLoadError' ||
                                  (typeof statusCode === 'number' && statusCode >= 500) ||
                                  (data.details && (
                                    data.details.includes('404') ||
                                    data.details.includes('Failed to fetch') ||
                                    data.details.includes('NetworkError')
                                  ));

            if (isNetworkError && retryCountRef.current < maxRetries) {
              retryCountRef.current++;
              const useForceVod = statusCode === 503 || statusCode === 202;
              const retryDelay = retryCountRef.current <= 3
                ? 500 * retryCountRef.current
                : Math.min(2000 * retryCountRef.current, 5000);
              
              console.log(`[useHlsPlayer] Erreur réseau HLS (tentative ${retryCountRef.current}/${maxRetries}), réessai avec force_vod=${useForceVod} dans ${retryDelay}ms...`, {
                type: data.type,
                details: data.details,
                statusCode,
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
                // Réinitialiser l'erreur et réessayer avec force_vod si 503/202
                setError(null);
                setIsLoading(true);
                initializeVideo(true, useForceVod).catch((e) => {
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
            // Erreur non-fatale : bufferStalledError = buffer vide, reprendre le chargement
            if (data.details === 'bufferStalledError') {
              console.debug('[useHlsPlayer] bufferStalledError, reprise du chargement (startLoad)');
              try {
                hls.startLoad();
              } catch (e) {
                console.warn('[useHlsPlayer] startLoad après bufferStalledError:', e);
              }
              return;
            }
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

        // Sauvegarder la position (sans toucher au buffer)
        const savePositionOnly = async () => {
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
        };

        // Sauvegarde + arrêt du buffer (uniquement à la sortie / démontage)
        const savePositionAndStopBuffer = async () => {
          await savePositionOnly();
          if (hlsRef.current && hlsRef.current.media) {
            try {
              hlsRef.current.stopLoad();
            } catch (e) {
              console.warn('[useHlsPlayer] Erreur lors de l\'arrêt du buffer:', e);
            }
          }
        };

        const handleBeforeUnload = () => {
          savePositionAndStopBuffer();
          void unregisterActiveVideo();
        };

        // Ne pas appeler stopLoad() quand l'onglet est caché : ça coupait la lecture après quelques secondes
        // (visibilitychange peut se déclencher dans certains cas pendant la lecture). On sauvegarde seulement.
        const handleVisibilityChange = () => {
          if (document.hidden) {
            void savePositionOnly();
          }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        cleanupFunctions.push(() => {
          window.removeEventListener('beforeunload', handleBeforeUnload);
          document.removeEventListener('visibilitychange', handleVisibilityChange);
        });

        return () => {
          reloadWithSeekRef.current = null;
          seekLoadUrlRef.current = null;
          seekFallbackTriedRef.current = false;
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
          if (seekVerifyTimeoutRef.current !== null) {
            clearTimeout(seekVerifyTimeoutRef.current);
            seekVerifyTimeoutRef.current = null;
          }
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
  }, [hlsLoaded, infoHash, filePath, baseUrlProp]); // baseUrl pour bibliothèque ami / backend distant

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

  const reloadWithSeek = (seekSeconds: number) => {
    reloadWithSeekRef.current?.(seekSeconds);
  };

  return {
    videoRef,
    hlsRef,
    isLoading,
    error,
    hlsLoaded,
    stopBuffer,
    reloadWithSeek,
  };
}
