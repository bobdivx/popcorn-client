import { useState, useEffect, useRef } from 'preact/hooks';
import { serverApi } from '../../../../lib/client/server-api';
import {
  getPlaybackPosition,
  savePlaybackPosition,
  savePlaybackPositionByMedia,
  markEpisodeWatched,
} from '../../../../lib/streaming/torrent-storage';
import { getOrCreateDeviceId } from '../../../../lib/utils/device-id';
import type { LucieManifest } from '../types';

interface UseLuciePlayerProps {
  src: string;
  infoHash?: string;
  fileName: string;
  torrentId?: string;
  filePath?: string;
  tmdbId?: number;
  tmdbType?: 'movie' | 'tv';
  seriesSeason?: number;
  seriesEpisode?: number;
  variantId?: string;
  startFromBeginning: boolean;
  onError?: (error: Error) => void;
  onLoadingChange?: (loading: boolean) => void;
  canAutoPlay?: () => boolean;
  onDurationChange?: (duration: number) => void;
  baseUrl?: string;
}

export function useLuciePlayer({
  src,
  infoHash,
  fileName,
  torrentId,
  filePath,
  tmdbId,
  tmdbType,
  seriesSeason,
  seriesEpisode,
  variantId,
  startFromBeginning,
  onError,
  onLoadingChange,
  canAutoPlay,
  onDurationChange,
  baseUrl: baseUrlProp,
}: UseLuciePlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaSourceRef = useRef<MediaSource | null>(null);
  const sourceBufferRef = useRef<SourceBuffer | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [manifest, setManifest] = useState<LucieManifest | null>(null);
  const [lucieLoaded, setLucieLoaded] = useState(false);
  
  const currentSegmentRef = useRef<number>(0);
  const bufferedSegmentsRef = useRef<Set<number>>(new Set());
  const pendingSegmentsRef = useRef<Set<number>>(new Set());
  const isBufferingRef = useRef(false);
  const shouldStopRef = useRef(false);
  
  const onErrorRef = useRef(onError);
  const onLoadingChangeRef = useRef(onLoadingChange);
  const canAutoPlayRef = useRef(canAutoPlay);
  const startFromBeginningRef = useRef(startFromBeginning);
  const torrentIdRef = useRef(torrentId);
  const tmdbIdRef = useRef(tmdbId);
  const tmdbTypeRef = useRef(tmdbType);
  const seriesSeasonRef = useRef(seriesSeason);
  const seriesEpisodeRef = useRef(seriesEpisode);
  const variantIdRef = useRef(variantId);
  const onDurationChangeRef = useRef(onDurationChange);

  // Mettre à jour les refs quand les props changent
  useEffect(() => {
    onErrorRef.current = onError;
    onLoadingChangeRef.current = onLoadingChange;
    canAutoPlayRef.current = canAutoPlay;
    startFromBeginningRef.current = startFromBeginning;
    torrentIdRef.current = torrentId;
    tmdbIdRef.current = tmdbId;
    tmdbTypeRef.current = tmdbType;
    seriesSeasonRef.current = seriesSeason;
    seriesEpisodeRef.current = seriesEpisode;
    variantIdRef.current = variantId;
    onDurationChangeRef.current = onDurationChange;
  }, [onError, onLoadingChange, canAutoPlay, startFromBeginning, torrentId, tmdbId, tmdbType, seriesSeason, seriesEpisode, variantId, onDurationChange]);

  const baseUrl = (baseUrlProp && baseUrlProp.trim()) || serverApi.getServerUrl();

  /**
   * Récupère le manifest JSON du serveur
   */
  const fetchManifest = async (): Promise<LucieManifest> => {
    // src contient déjà l'URL complète générée par buildStreamUrl
    console.log('[useLuciePlayer] Récupération du manifest:', src);
    
    const response = await fetch(src);
    if (!response.ok) {
      throw new Error(`Échec de récupération du manifest: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('[useLuciePlayer] Manifest reçu:', data);
    return data;
  };

  /**
   * Récupère un segment vidéo par son numéro
   */
  const fetchSegment = async (segmentNumber: number): Promise<ArrayBuffer> => {
    // Construire l'URL du segment à partir de l'URL du manifest
    // src contient l'URL complète du manifest, on remplace manifest.json par segment/<number>
    const baseManifestUrl = src.split('?')[0]; // Enlever les query params
    const queryParams = src.includes('?') ? '?' + src.split('?')[1] : '';
    const segmentUrl = baseManifestUrl.replace('/manifest.json', `/segment/${segmentNumber}`) + queryParams;
    console.log(`[useLuciePlayer] Récupération du segment ${segmentNumber}:`, segmentUrl);
    
    const response = await fetch(segmentUrl);
    if (!response.ok) {
      throw new Error(`Échec de récupération du segment ${segmentNumber}: ${response.status}`);
    }
    
    return response.arrayBuffer();
  };

  /**
   * Ajoute un segment au SourceBuffer
   */
  const appendSegment = async (segmentNumber: number, manifestOverride?: LucieManifest) => {
    const sourceBuffer = sourceBufferRef.current;
    const currentManifest = manifestOverride || manifest;
    
    console.log(`[useLuciePlayer] appendSegment(${segmentNumber}): sourceBuffer=${!!sourceBuffer}, manifest=${!!currentManifest}`);
    
    if (!sourceBuffer || !currentManifest) {
      console.warn(`[useLuciePlayer] appendSegment(${segmentNumber}): Annulé car sourceBuffer ou manifest manquant`);
      return;
    }
    
    if (pendingSegmentsRef.current.has(segmentNumber) || 
        bufferedSegmentsRef.current.has(segmentNumber)) {
      console.log(`[useLuciePlayer] Segment ${segmentNumber} déjà chargé ou en cours`);
      return; // Segment déjà en cours de chargement ou chargé
    }

    try {
      pendingSegmentsRef.current.add(segmentNumber);
      const segmentData = await fetchSegment(segmentNumber);
      
      if (shouldStopRef.current) {
        pendingSegmentsRef.current.delete(segmentNumber);
        return;
      }

      // Attendre que le SourceBuffer soit prêt
      await new Promise<void>((resolve) => {
        if (!sourceBuffer.updating) {
          resolve();
        } else {
          const onUpdateEnd = () => {
            sourceBuffer.removeEventListener('updateend', onUpdateEnd);
            resolve();
          };
          sourceBuffer.addEventListener('updateend', onUpdateEnd);
        }
      });

      // Segments 1+ : fragment seul (moof+mdat), timestamps internes 0–5s → on les place avec timestampOffset.
      // Segment 0 : init+fragment, pas d'offset.
      if (segmentNumber > 0) {
        const offsetSeconds = segmentNumber * currentManifest.segmentDuration;
        sourceBuffer.timestampOffset = offsetSeconds;
      }
      sourceBuffer.appendBuffer(segmentData);
      
      await new Promise<void>((resolve, reject) => {
        const onUpdateEnd = () => {
          sourceBuffer.removeEventListener('updateend', onUpdateEnd);
          sourceBuffer.removeEventListener('error', onError);
          bufferedSegmentsRef.current.add(segmentNumber);
          pendingSegmentsRef.current.delete(segmentNumber);
          resolve();
        };
        const onError = () => {
          sourceBuffer.removeEventListener('updateend', onUpdateEnd);
          sourceBuffer.removeEventListener('error', onError);
          pendingSegmentsRef.current.delete(segmentNumber);
          reject(new Error(`Erreur lors de l'ajout du segment ${segmentNumber}`));
        };
        sourceBuffer.addEventListener('updateend', onUpdateEnd);
        sourceBuffer.addEventListener('error', onError);
      });

      console.log(`[useLuciePlayer] Segment ${segmentNumber} ajouté avec succès`);
    } catch (e) {
      console.error(`[useLuciePlayer] Erreur lors du chargement du segment ${segmentNumber}:`, e);
      pendingSegmentsRef.current.delete(segmentNumber);
      throw e;
    }
  };

  /**
   * Buffer les segments à l'avance.
   * @param manifestOverride - manifest à utiliser (optionnel)
   * @param fromTime - si fourni, buffer autour de ce temps (s) au lieu de video.currentTime (pour restauration de position)
   */
  const bufferAhead = async (manifestOverride?: LucieManifest, fromTime?: number) => {
    const video = videoRef.current;
    const currentManifest = manifestOverride || manifest;
    if (!video || !currentManifest || isBufferingRef.current || shouldStopRef.current) return;

    const timeRef = fromTime ?? video.currentTime;
    const currentSegment = Math.floor(timeRef / currentManifest.segmentDuration);
    const segmentsToBuffer = 5; // Buffer 5 segments à l'avance (25 secondes)

    console.log(`[useLuciePlayer] Buffer depuis segment ${currentSegment} (time=${timeRef}s)`);
    
    isBufferingRef.current = true;

    try {
      for (let i = 0; i <= segmentsToBuffer; i++) {
        const segmentNum = currentSegment + i;
        if (segmentNum >= currentManifest.segmentCount) break;
        if (shouldStopRef.current) break;
        
        if (!bufferedSegmentsRef.current.has(segmentNum) && 
            !pendingSegmentsRef.current.has(segmentNum)) {
          await appendSegment(segmentNum, currentManifest);
        }
      }
    } catch (e) {
      console.error('[useLuciePlayer] Erreur lors du buffering:', e);
    } finally {
      isBufferingRef.current = false;
    }
  };

  /**
   * Initialise le lecteur Lucie avec MediaSource
   */
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !infoHash || !filePath) return;
    
    // Vérifier que l'URL est bien une URL de manifest Lucie (pas HLS)
    if (!src.includes('/api/lucie/manifest.json')) {
      console.log('[useLuciePlayer] URL non-Lucie détectée, attente de l\'URL correcte:', src);
      return;
    }

    let cleanup: (() => void) | null = null;
    shouldStopRef.current = false;

    const initializePlayer = async () => {
      try {
        setIsLoading(true);
        setError(null);

        if (!window.MediaSource) {
          throw new Error('MediaSource non supporté par ce navigateur');
        }

        // Récupérer le manifest (nécessaire pour vérifier le support des codecs fMP4)
        const manifestData = await fetchManifest();
        const mimeType = `video/mp4; codecs="${manifestData.videoCodec},${manifestData.audioCodec}"`;
        if (!MediaSource.isTypeSupported(mimeType)) {
          throw new Error(`Codecs fMP4 non supportés: ${mimeType}`);
        }
        setManifest(manifestData);
        onDurationChangeRef.current?.(manifestData.duration);

        // Créer MediaSource
        const mediaSource = new MediaSource();
        mediaSourceRef.current = mediaSource;
        
        const objectURL = URL.createObjectURL(mediaSource);
        video.src = objectURL;

        // Attendre que MediaSource soit prêt
        await new Promise<void>((resolve, reject) => {
          const onSourceOpen = async () => {
            try {
              mediaSource.removeEventListener('sourceopen', onSourceOpen);
              
              // Créer le SourceBuffer avec le codec MP4 (fMP4)
              const mimeType = `video/mp4; codecs="${manifestData.videoCodec},${manifestData.audioCodec}"`;
              const sourceBuffer = mediaSource.addSourceBuffer(mimeType);
              // Pas de mode 'sequence' : segment 0 = init+fragment, segments 1+ = fragment seul (backend)
              // On utilise timestampOffset pour placer chaque fragment à la bonne position.
              sourceBufferRef.current = sourceBuffer;
              sourceBuffer.addEventListener('error', (e) => {
                console.error('[useLuciePlayer] SourceBuffer error:', e);
              });
              mediaSource.addEventListener('sourceended', () => {
                console.log('[useLuciePlayer] MediaSource sourceended');
              });
              mediaSource.addEventListener('error', (e) => {
                console.error('[useLuciePlayer] MediaSource error:', e);
              });
              console.log('[useLuciePlayer] SourceBuffer créé avec:', mimeType);
              resolve();
            } catch (e) {
              reject(e);
            }
          };
          mediaSource.addEventListener('sourceopen', onSourceOpen);
        });

        setLucieLoaded(true);
        setIsLoading(false);
        onLoadingChangeRef.current?.(false);

        // Restauration de position désactivée pour Lucie (MSE/fMP4) : les segments générés
        // par FFmpeg n'ont pas de timestamps alignés sur la timeline, donc pas de données
        // à la position restaurée. Toujours démarrer depuis 0 pour une lecture immédiate.
        // La position continue d'être sauvegardée pour cohérence / futur support.
        if (video.currentTime < 1) {
          await bufferAhead(manifestData);
        }

        const sourceBuffer = sourceBufferRef.current;
        if (mediaSource.readyState === 'open' && sourceBuffer && !sourceBuffer.updating) {
          try {
            mediaSource.duration = manifestData.duration;
          } catch (e) {
            console.warn('[useLuciePlayer] mediaSource.duration:', e);
          }
        }

        // Diagnostic : SourceBuffer.buffered vs video.buffered (MSE peut retarder la mise à jour du video)
        const sbRanges: string[] = [];
        if (sourceBuffer) {
          for (let i = 0; i < sourceBuffer.buffered.length; i++) {
            sbRanges.push(`[${sourceBuffer.buffered.start(i).toFixed(1)}, ${sourceBuffer.buffered.end(i).toFixed(1)}]`);
          }
        }
        const videoRanges: string[] = [];
        for (let i = 0; i < video.buffered.length; i++) {
          videoRanges.push(`[${video.buffered.start(i).toFixed(1)}, ${video.buffered.end(i).toFixed(1)}]`);
        }
        console.log('[useLuciePlayer] SourceBuffer.buffered:', sbRanges.join(' ') || '(vide)', '| video.buffered:', videoRanges.join(' ') || '(vide)', '| readyState:', video.readyState);

        if (video.paused && (canAutoPlayRef.current === undefined || canAutoPlayRef.current())) {
          // Attendre canplay pour laisser le décodeur prêt (évite waiting à 0)
          await Promise.race([
            new Promise<void>((resolve) => {
              if (video.readyState >= 3) {
                resolve();
                return;
              }
              const onCanPlay = () => {
                video.removeEventListener('canplay', onCanPlay);
                resolve();
              };
              video.addEventListener('canplay', onCanPlay);
            }),
            new Promise<void>((resolve) => setTimeout(resolve, 8000)),
          ]);
          console.log('[useLuciePlayer] Démarrage auto-play (readyState=', video.readyState, ')');
          const playPromise = video.play();
          if (playPromise) {
            playPromise.then(() => {
              console.log('[useLuciePlayer] ✅ Lecture démarrée !');
            }).catch((e) => {
              console.error('[useLuciePlayer] ❌ Erreur play():', e);
            });
          }
        }

        const mediaExtrasForSave = () => {
          const tty = tmdbTypeRef.current;
          if (tty !== 'tv') return undefined;
          const s = seriesSeasonRef.current;
          const e = seriesEpisodeRef.current;
          const v = variantIdRef.current;
          if (s == null && e == null && v == null) return undefined;
          return { season: s ?? undefined, episode: e ?? undefined, variantId: v ?? undefined };
        };

        // Sauvegarder la position périodiquement
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
              savePlaybackPositionByMedia(tid, tty, deviceId, video.currentTime, mediaExtrasForSave()).catch(() => {});
            }
          }
        }, 10000);

        const handleEndedWatched = () => {
          const tid = tmdbIdRef.current;
          const tty = tmdbTypeRef.current;
          const s = seriesSeasonRef.current;
          const e = seriesEpisodeRef.current;
          if (typeof tid === 'number' && tty === 'tv' && s != null && e != null && e > 0) {
            markEpisodeWatched(tid, s, e);
          }
        };
        const handleTimeUpdateWatched = () => {
          const tid = tmdbIdRef.current;
          const tty = tmdbTypeRef.current;
          const s = seriesSeasonRef.current;
          const e = seriesEpisodeRef.current;
          if (typeof tid !== 'number' || tty !== 'tv' || s == null || e == null || e <= 0) return;
          const dur = video.duration;
          if (!dur || !Number.isFinite(dur) || dur <= 0) return;
          if (video.currentTime / dur >= 0.92) markEpisodeWatched(tid, s, e);
        };
        video.addEventListener('ended', handleEndedWatched);
        video.addEventListener('timeupdate', handleTimeUpdateWatched);

        // Buffer automatique pendant la lecture
        const handleTimeUpdate = () => {
          bufferAhead();
        };
        video.addEventListener('timeupdate', handleTimeUpdate);

        cleanup = () => {
          clearInterval(savePositionInterval);
          video.removeEventListener('ended', handleEndedWatched);
          video.removeEventListener('timeupdate', handleTimeUpdateWatched);
          video.removeEventListener('timeupdate', handleTimeUpdate);
          shouldStopRef.current = true;
          
          if (sourceBufferRef.current) {
            sourceBufferRef.current = null;
          }
          
          if (mediaSourceRef.current && mediaSourceRef.current.readyState === 'open') {
            try {
              mediaSourceRef.current.endOfStream();
            } catch (e) {
              console.warn('[useLuciePlayer] Erreur lors de la fermeture de MediaSource:', e);
            }
          }
          
          if (objectURL) {
            URL.revokeObjectURL(objectURL);
          }
          
          video.src = '';
          video.load();
          
          bufferedSegmentsRef.current.clear();
          pendingSegmentsRef.current.clear();
        };

      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : 'Erreur inconnue';
        console.error('[useLuciePlayer] Erreur d\'initialisation:', e);
        setError(errorMsg);
        setIsLoading(false);
        onErrorRef.current?.(e instanceof Error ? e : new Error(errorMsg));
      }
    };

    initializePlayer();

    return () => {
      cleanup?.();
    };
  }, [infoHash, filePath, baseUrl, src, seriesSeason, seriesEpisode, variantId]);

  const stopBuffer = () => {
    shouldStopRef.current = true;
    bufferedSegmentsRef.current.clear();
    pendingSegmentsRef.current.clear();
  };

  return {
    videoRef,
    isLoading,
    error,
    lucieLoaded,
    manifest,
    stopBuffer,
  };
}
