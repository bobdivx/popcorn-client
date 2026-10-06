import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { Car, Pause, Play, RotateCcw, SkipBack, SkipForward, X } from 'lucide-preact';
import { stampTeslaBrowserHints } from '../../../lib/utils/device-detection';
import { useCarMediaSource } from './useCarMediaSource';
import CarLibraryBrowser, { type CarLibraryPick } from './CarLibraryBrowser';
import { attachCarStream } from './attachCarStream';
import { buildCarDriveUrls, CAR_DRIVE_PRESET_LABELS, getCarDriveQualityProfile, type CarDrivePreset } from './buildCarDriveUrls';
import { getCapsSession, getCarAutoTuning, noteDriveModeForCapabilities, onCapabilitiesReported, type CarAutoTuning } from './carCapabilities';
import {
  CarCanvasRenderer,
  readCarRenderEngine,
  writeCarRenderEngine,
  type CarConcreteEngine,
  type CarRenderEngine,
} from './carCanvasRenderer';
import { CarWorkerRenderer } from './carWorkerRenderer';
import type { FrameCoreStats } from './carFrameCore';
import { PlaybackTelemetry, type PlaybackSecond } from './carTelemetry';
import CarStatsStrip, { type StripStats } from './CarStatsStrip';
import CarCategoryBar, { useAutoHide, type BarCategory } from './CarCategoryBar';
import CarPlaybackTypeSelector from './CarPlaybackTypeSelector';
import type { CarPlaybackSettings, CarPlaybackType } from './carPlaybackTypes';
import { getStoredPlaybackSettings, resolvePlaybackType, setStoredPlaybackSettings } from './carPlaybackTypes';
import { detectDriveModeWithCache, startDriveModeMonitoring, type TeslaDriveMode } from './driveModeDetector';

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

type CarQualityChoice = 'auto' | CarDrivePreset;
const QUALITY_KEY = 'popcorn_car_drive_quality';
const STRIP_KEY = 'popcorn_car_stats_strip';

function readQualityChoice(): CarQualityChoice {
  try {
    const v = localStorage.getItem(QUALITY_KEY);
    if (v === 'auto' || v === 'standard' || v === 'lite' || v === 'plus') return v;
  } catch {
    // ignore
  }
  return 'auto';
}

function readStripOn(): boolean {
  try {
    return localStorage.getItem(STRIP_KEY) !== '0';
  } catch {
    return true;
  }
}

const ENGINE_LABEL: Record<CarConcreteEngine, string> = { canvas: 'Canvas', worker: 'Worker', img: 'Image' };

function readSlugFromLocation(): string | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const slug = params.get('slug') || params.get('id') || params.get('contentId');
    return slug?.trim() || null;
  } catch {
    return null;
  }
}

function writeCarUrl(pick: CarLibraryPick | null) {
  try {
    if (!pick) {
      window.history.pushState({}, '', '/car');
      return;
    }
    const params = new URLSearchParams();
    params.set('slug', pick.slug);
    if (pick.path) params.set('path', pick.path);
    if (pick.infoHash) params.set('infoHash', pick.infoHash);
    window.history.pushState({}, '', `/car?${params.toString()}`);
  } catch {
    // ignore
  }
}

/**
 * Lecteur Tesla Theater.
 * - Stationné : `<video>` MP4 H.264/AAC.
 * - En conduite : Tesla force pause sur `<video>` → MJPEG (`<img>`) + MP3 (`<audio>`)
 *   pour garder IMAGE + SON actifs.
 * - Détection auto Park/Drive avec monitoring continu.
 * - Sélecteur Auto/Manuel pour A/B testing.
 */
export default function CarPlayer() {
  const [slug, setSlug] = useState<string | null>(null);
  const [pickMeta, setPickMeta] = useState<{ title: string; posterUrl: string | null } | null>(null);
  const { source, loading, error } = useCarMediaSource(slug);
  
  // Paramètres playback (Auto/Manuel + type manuel)
  const [playbackSettings, setPlaybackSettings] = useState<CarPlaybackSettings>(() => getStoredPlaybackSettings());
  
  // Détection mode Tesla (Park/Drive/Unknown)
  const [detectedMode, setDetectedMode] = useState<TeslaDriveMode>('unknown');
  
  // Type effectif calculé (Auto → résolu selon Drive/Park, Manuel → choix utilisateur)
  const [effectiveType, setEffectiveType] = useState<CarPlaybackType>(() => {
    const initial = getStoredPlaybackSettings();
    return resolvePlaybackType(initial, null);
  });

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasRendererRef = useRef<{ stop(): void; takeStats(): FrameCoreStats | null } | null>(null);
  const [qualityChoice, setQualityChoice] = useState<CarQualityChoice>(() => readQualityChoice());
  const qualityChoiceRef = useRef(qualityChoice);
  qualityChoiceRef.current = qualityChoice;
  const [stripOn, setStripOn] = useState<boolean>(() => readStripOn());
  const [engineStats, setEngineStats] = useState<FrameCoreStats | null>(null);
  const [videoStats, setVideoStats] = useState<StripStats | null>(null);
  const telemetryRef = useRef<PlaybackTelemetry | null>(null);
  const detectedModeRef = useRef<TeslaDriveMode>('unknown');
  const presetRef = useRef<CarDrivePreset>('standard');
  const [renderEngine, setRenderEngine] = useState<CarRenderEngine>(() => readCarRenderEngine());
  // Choix auto moteur/preset Drive à partir de l'empreinte des capacités (relevé pris en Drive)
  const [autoTuning, setAutoTuning] = useState<CarAutoTuning>(() => getCarAutoTuning());
  const wantedEngine: CarConcreteEngine = renderEngine === 'auto' ? autoTuning.engine : renderEngine;
  const renderEngineRef = useRef(renderEngine);
  renderEngineRef.current = renderEngine;
  const wantedEngineRef = useRef(wantedEngine);
  wantedEngineRef.current = wantedEngine;
  const autoTuningRef = useRef(autoTuning);
  autoTuningRef.current = autoTuning;
  const canvasFailedRef = useRef(false);
  const workerFailedRef = useRef(false);
  const driveFpsRef = useRef(getCarDriveQualityProfile().maxFps);
  // Moteur figé pour la session Drive en cours (pas de bascule img/canvas en plein flux)
  const [activeEngine, setActiveEngine] = useState<CarConcreteEngine>('canvas');
  const activeEngineRef = useRef<CarConcreteEngine>('canvas');
  activeEngineRef.current = activeEngine;
  const canvasActive = activeEngine !== 'img';
  const userWantsPlayRef = useRef(false);
  const userPausedRef = useRef(false);
  const lastAdvanceAtRef = useRef(0);
  const hasMediaErrorRef = useRef(false);
  const driveModeRef = useRef(false);
  const driveAnchorRef = useRef(0); // position média au démarrage du flux drive
  const driveStartedAtRef = useRef(0); // performance.now() au démarrage drive
  const destroyVideoAttachRef = useRef<(() => void) | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [driveMode, setDriveMode] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [prepStatus, setPrepStatus] = useState<string | null>(null);
  const [showControls, setShowControls] = useState(true);
  const [playbackModeLabel, setPlaybackModeLabel] = useState('MP4');
  const [driveUrls, setDriveUrls] = useState<{ mjpegUrl: string; audioUrl: string } | null>(null);
  const [driveSession, setDriveSession] = useState(0);
  // Barre de contrôle : masquage auto après 6 s d'inactivité pendant la lecture, tap pour réafficher
  const { visible: controlsVisible, poke: pokeControls, setPinned: setControlsPinned } = useAutoHide(6000, isPlaying && !mediaError);

  useEffect(() => {
    driveModeRef.current = driveMode;
  }, [driveMode]);

  // Détection initiale + monitoring continu du mode Tesla
  useEffect(() => {
    // Détection initiale avec cache
    detectDriveModeWithCache().then((result) => {
      setDetectedMode(result.mode);
    });

    // Monitoring continu (re-check toutes les 10s)
    const stopMonitoring = startDriveModeMonitoring((mode) => {
      setDetectedMode(mode);
    });

    return () => {
      stopMonitoring();
    };
  }, []);

  // Empreinte capacités : au chargement puis à chaque transition Park↔Drive (auto, sans impact lecture)
  useEffect(() => {
    detectedModeRef.current = detectedMode;
    noteDriveModeForCapabilities('/car', detectedMode);
  }, [detectedMode]);

  useEffect(() => onCapabilitiesReported(() => setAutoTuning(getCarAutoTuning())), []);

  // Télémétrie de lecture (échantillon / 10 s pendant la lecture, Park et Drive)
  const telemetryCtxRef = useRef({ engine: 'video', preset: 'mp4', position: 0 });
  useEffect(() => {
    const t = new PlaybackTelemetry(() => ({
      page: '/car',
      engine: telemetryCtxRef.current.engine,
      mode: detectedModeRef.current,
      preset: telemetryCtxRef.current.preset,
      route: 'direct',
      position: telemetryCtxRef.current.position,
      extra: { renderChoice: renderEngineRef.current, qualityChoice: qualityChoiceRef.current },
    }));
    telemetryRef.current = t;
    t.start();
    return () => {
      t.stop();
      telemetryRef.current = null;
    };
  }, []);

  // Recalculer effectiveType quand settings ou detectedMode changent
  useEffect(() => {
    const isDrive = detectedMode === 'drive' ? true : detectedMode === 'park' ? false : null;
    const resolved = resolvePlaybackType(playbackSettings, isDrive);
    setEffectiveType(resolved);
  }, [playbackSettings, detectedMode]);

  // Appliquer effectiveType: si changement de moteur, basculer entre MJPEG et native-video
  useEffect(() => {
    if (!source?.streamUrl) return;
    
    if (effectiveType === 'mjpeg' && !driveMode) {
      // Besoin de passer en MJPEG alors qu'on est en video native
      startDriveAt(currentTime || 0);
    } else if (effectiveType === 'native-video' && driveMode) {
      // Besoin de passer en video native alors qu'on est en MJPEG
      exitDriveToVideo();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveType, source?.streamUrl]);

  const handleSettingsChange = useCallback((newSettings: CarPlaybackSettings) => {
    setPlaybackSettings(newSettings);
    setStoredPlaybackSettings(newSettings);
  }, []);

  useEffect(() => {
    stampTeslaBrowserHints();
    setSlug(readSlugFromLocation());
    const onPop = () => setSlug(readSlugFromLocation());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const stopDriveStreams = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    const img = imgRef.current;
    if (img) {
      img.removeAttribute('src');
    }
    canvasRendererRef.current?.stop();
    canvasRendererRef.current = null;
    setDriveUrls(null);
  }, []);

  const startDriveAt = useCallback(
    (atSeconds: number) => {
      if (!source?.streamUrl) return;
      const seek = Math.max(0, atSeconds);
      const qc = qualityChoiceRef.current;
      const preset: CarDrivePreset = qc === 'auto' ? autoTuningRef.current.preset : qc;
      presetRef.current = preset;
      const urls = buildCarDriveUrls(source.streamUrl, seek, preset, getCapsSession());
      driveFpsRef.current = getCarDriveQualityProfile(preset).maxFps;
      // Chaîne de repli (auto) : worker → canvas → <img>
      const auto = renderEngineRef.current === 'auto';
      let engine: CarConcreteEngine = wantedEngineRef.current;
      if (engine === 'worker' && (!CarWorkerRenderer.isSupported() || (auto && workerFailedRef.current))) engine = 'canvas';
      if (engine === 'canvas' && (!CarCanvasRenderer.isSupported() || (auto && canvasFailedRef.current))) engine = 'img';
      setActiveEngine(engine);
      setEngineStats(null);
      driveAnchorRef.current = seek;
      driveStartedAtRef.current = performance.now();
      hasMediaErrorRef.current = false;
      userPausedRef.current = false;
      userWantsPlayRef.current = true;
      setMediaError(null);
      setDriveMode(true);
      setPlaybackModeLabel('Conduite · MJPEG+MP3');
      setDriveUrls(urls);
      setDriveSession((n) => n + 1);
      setCurrentTime(seek);
      setShowControls(true);

      // Couper le <video> pour laisser Tesla tranquille
      const video = videoRef.current;
      if (video) {
        video.pause();
      }
    },
    [source?.streamUrl],
  );

  const exitDriveToVideo = useCallback(() => {
    const resumeAt = currentTime;
    if (!source?.streamUrl) return;
    const video = videoRef.current;
    if (!video) return;

    stopDriveStreams();
    setDriveMode(false);
    setPlaybackModeLabel('MP4');
    setPrepStatus('Préparation MP4…');
    setMediaError(null);
    hasMediaErrorRef.current = false;
    userPausedRef.current = false;
    userWantsPlayRef.current = true;

    void (async () => {
      destroyVideoAttachRef.current?.();
      const result = await attachCarStream(
        video,
        source.streamUrl,
        'direct',
        (message) => {
          setPrepStatus(null);
          setMediaError(message);
          startDriveAt(resumeAt);
        },
        (status) => setPrepStatus(status),
      );
      destroyVideoAttachRef.current = result.destroy;
      if (hasMediaErrorRef.current) return;
      setPrepStatus(null);
      try {
        video.currentTime = resumeAt;
      } catch {
        // ignore
      }
      void video.play().catch(() => {
        setMediaError('Lecture MP4 bloquée — retour en conduite.');
        startDriveAt(resumeAt);
      });
    })();
  }, [currentTime, source?.streamUrl, startDriveAt, stopDriveStreams]);

  const openLibraryPick = useCallback((pick: CarLibraryPick) => {
    writeCarUrl(pick);
    setPickMeta({ title: pick.title, posterUrl: pick.posterUrl || null });
    setSlug(pick.slug);
  }, []);

  const backToLibrary = useCallback(() => {
    stopDriveStreams();
    destroyVideoAttachRef.current?.();
    destroyVideoAttachRef.current = null;
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
    writeCarUrl(null);
    setSlug(null);
    setPickMeta(null);
    setDriveMode(false);
    setMediaError(null);
    setPrepStatus(null);
    hasMediaErrorRef.current = false;
    userWantsPlayRef.current = false;
    userPausedRef.current = false;
    setPlaybackModeLabel('MP4');
  }, [stopDriveStreams]);

  // Démarrer tout de suite en MJPEG+MP3 (évite l’attente remux MP4 qui bloque la lecture).
  useEffect(() => {
    if (!source?.streamUrl) return;

    hasMediaErrorRef.current = false;
    setMediaError(null);
    setPrepStatus(null);
    setDuration(0);
    setCurrentTime(0);
    destroyVideoAttachRef.current?.();
    destroyVideoAttachRef.current = null;

    const t = window.setTimeout(() => {
      startDriveAt(0);
    }, 50);

    return () => {
      window.clearTimeout(t);
      destroyVideoAttachRef.current?.();
      destroyVideoAttachRef.current = null;
    };
  }, [source?.streamUrl, startDriveAt]);

  // Événements <video> + détection pause Tesla → bascule conduite
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTime = () => {
      if (driveModeRef.current) return;
      setCurrentTime(video.currentTime || 0);
      if (!video.paused && video.currentTime > 0.2) {
        lastAdvanceAtRef.current = Date.now();
      }
    };
    const onMeta = () => setDuration(video.duration || 0);
    const onPlay = () => {
      if (driveModeRef.current) return;
      setIsPlaying(true);
    };
    const onPlaying = () => {
      if (driveModeRef.current) return;
      setIsPlaying(true);
      lastAdvanceAtRef.current = Date.now();
      hasMediaErrorRef.current = false;
    };
    const onPause = () => {
      if (driveModeRef.current) return;
      setIsPlaying(false);
      if (hasMediaErrorRef.current || video.error) return;
      // Tesla force pause en Drive alors que l’utilisateur veut lire → bascule MJPEG+audio
      if (userWantsPlayRef.current && !userPausedRef.current) {
        startDriveAt(video.currentTime || 0);
      }
    };
    const onEnded = () => {
      if (driveModeRef.current) return;
      setIsPlaying(false);
      userWantsPlayRef.current = false;
    };

    video.addEventListener('timeupdate', onTime);
    video.addEventListener('loadedmetadata', onMeta);
    video.addEventListener('durationchange', onMeta);
    video.addEventListener('play', onPlay);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('pause', onPause);
    video.addEventListener('ended', onEnded);

    const interval = window.setInterval(() => {
      if (driveModeRef.current) return;
      if (!userWantsPlayRef.current || userPausedRef.current || hasMediaErrorRef.current) return;
      if (video.error) return;
      if (video.paused) {
        startDriveAt(video.currentTime || 0);
        return;
      }
      const stalled = Date.now() - lastAdvanceAtRef.current > 4000 && video.currentTime > 0.5;
      if (stalled) startDriveAt(video.currentTime || 0);
    }, 1500);

    return () => {
      video.removeEventListener('timeupdate', onTime);
      video.removeEventListener('loadedmetadata', onMeta);
      video.removeEventListener('durationchange', onMeta);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onEnded);
      window.clearInterval(interval);
    };
  }, [source?.streamUrl, startDriveAt]);

  // Branche audio + img en mode conduite
  useEffect(() => {
    if (!driveMode || !driveUrls) return;
    const audio = audioRef.current;
    if (!audio) return;
    const engineNow = activeEngine;
    if (engineNow !== 'img') {
      // Moteurs canvas / worker : jitter buffer + cadence calée sur l'horloge audio, images en retard jetées
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvasRendererRef.current?.stop();
      const onEngineError = (m: string) => {
        // En auto : repli immédiat worker → canvas → <img> (une fois par chargement de page)
        if (renderEngineRef.current === 'auto') {
          const failedRef = engineNow === 'worker' ? workerFailedRef : canvasFailedRef;
          if (!failedRef.current) {
            failedRef.current = true;
            console.warn(`[car] moteur ${engineNow} KO → repli`, m);
            startDriveAt(driveAnchorRef.current + (audio.currentTime || 0));
            return;
          }
        }
        setMediaError(m);
      };
      const opts = { canvas, url: driveUrls.mjpegUrl, audio, fps: driveFpsRef.current, onError: onEngineError };
      const renderer = engineNow === 'worker' ? new CarWorkerRenderer(opts) : new CarCanvasRenderer(opts);
      canvasRendererRef.current = renderer;
      renderer.start();
    } else {
      const img = imgRef.current;
      if (!img) return;
      img.src = driveUrls.mjpegUrl;
    }
    audio.src = driveUrls.audioUrl;
    audio.load();
    void audio.play().catch(() => {
      setMediaError('Touchez Play pour démarrer l’audio en conduite.');
    });
    setIsPlaying(true);

    const onTime = () => {
      // Audio stream redémarre à seek=0 relatif : position absolue = ancre + audio.currentTime
      const abs = driveAnchorRef.current + (audio.currentTime || 0);
      setCurrentTime(abs);
      setIsPlaying(!audio.paused);
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => {
      setIsPlaying(false);
      // Ne pas rebasculer : on est déjà en conduite
    };
    const onEnded = () => {
      setIsPlaying(false);
      userWantsPlayRef.current = false;
    };
    const onError = () => {
      setMediaError('Flux conduite (audio/MJPEG) indisponible. Vérifiez FFmpeg sur le serveur.');
    };

    // Stats moteur 1 s → bande de stats + télémétrie
    telemetryRef.current?.resetTotals();
    const statsTimer = window.setInterval(() => {
      const st = canvasRendererRef.current?.takeStats() ?? null;
      setEngineStats(st);
      if (st) {
        telemetryRef.current?.push(st as PlaybackSecond);
      } else if (!audio.paused) {
        // <img> natif : pas d'accès aux images, on trace quand même l'état (rAF, long tasks, mode…)
        telemetryRef.current?.push({
          state: 'playing', fpsShown: null, fpsReceived: null, targetFps: driveFpsRef.current, dropped: 0, late: 0, stalls: 0,
          paintJitterMs: null, arrivalJitterMs: null, kbps: null, bufferFrames: null, bufferMs: null, decodeMs: null, paintMs: null, avSyncMs: null,
        });
      }
    }, 1000);

    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('playing', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);

    return () => {
      window.clearInterval(statsTimer);
      canvasRendererRef.current?.stop();
      canvasRendererRef.current = null;
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('playing', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
  }, [driveMode, driveUrls, driveSession]);

  // Park (<video> natif) : stats 1 s via getVideoPlaybackQuality → bande + télémétrie
  useEffect(() => {
    if (driveMode) {
      setVideoStats(null);
      return;
    }
    let lastTotal = -1;
    const timer = window.setInterval(() => {
      const v = videoRef.current;
      if (!v || v.paused || v.readyState < 1) return;
      const q = typeof v.getVideoPlaybackQuality === 'function' ? v.getVideoPlaybackQuality() : null;
      const total = q ? q.totalVideoFrames : 0;
      const fps = lastTotal >= 0 && q ? Math.max(0, total - lastTotal) : null;
      lastTotal = total;
      let bufferMs: number | null = null;
      try {
        for (let i = 0; i < v.buffered.length; i++) {
          if (v.buffered.start(i) <= v.currentTime && v.buffered.end(i) >= v.currentTime) {
            bufferMs = Math.round((v.buffered.end(i) - v.currentTime) * 1000);
          }
        }
      } catch {
        // ignore
      }
      const state = v.readyState >= 3 ? 'playing' : 'buffering';
      const dropped = q ? q.droppedVideoFrames : 0;
      setVideoStats({ state, fpsShown: fps, dropped, bufferMs, frameSize: v.videoWidth ? `${v.videoWidth}×${v.videoHeight}` : '—' });
      telemetryRef.current?.push({
        state, fpsShown: fps, fpsReceived: null, targetFps: 0, dropped, late: 0, stalls: 0, paintJitterMs: null, arrivalJitterMs: null,
        kbps: null, bufferFrames: null, bufferMs, decodeMs: null, paintMs: null, avSyncMs: null,
        frameSize: v.videoWidth ? `${v.videoWidth}×${v.videoHeight}` : undefined,
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [driveMode]);

  const togglePlay = useCallback(() => {
    if (driveModeRef.current) {
      const audio = audioRef.current;
      if (!audio) return;
      if (audio.paused) {
        userPausedRef.current = false;
        userWantsPlayRef.current = true;
        void audio.play().catch(() => setMediaError('Lecture audio bloquée — touchez Play.'));
      } else {
        userPausedRef.current = true;
        userWantsPlayRef.current = false;
        audio.pause();
      }
      setShowControls(true);
      return;
    }

    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      userPausedRef.current = false;
      userWantsPlayRef.current = true;
      void video.play().catch(() => setMediaError('Lecture bloquée — touchez Play à nouveau.'));
    } else {
      userPausedRef.current = true;
      userWantsPlayRef.current = false;
      video.pause();
    }
    setShowControls(true);
  }, []);

  const seekBy = useCallback(
    (delta: number) => {
      const next = Math.max(0, Math.min(duration || Infinity, currentTime + delta));
      if (driveModeRef.current) {
        startDriveAt(next);
        setShowControls(true);
        return;
      }
      const video = videoRef.current;
      if (!video) return;
      video.currentTime = next;
      setCurrentTime(next);
      setShowControls(true);
    },
    [currentTime, duration, startDriveAt],
  );

  const onSeekBar = useCallback(
    (e: Event) => {
      const input = e.currentTarget as HTMLInputElement;
      const value = Number(input.value);
      if (!Number.isFinite(value)) return;
      if (driveModeRef.current) {
        startDriveAt(value);
        return;
      }
      const video = videoRef.current;
      if (!video) return;
      video.currentTime = value;
      setCurrentTime(value);
    },
    [startDriveAt],
  );

  if (!slug) {
    return <CarLibraryBrowser onSelect={openLibraryPick} />;
  }

  if (loading) {
    return (
      <div className="tesla-car-root tesla-car-center">
        <p>Préparation du flux…</p>
        <button type="button" className="tesla-car-btn" onClick={backToLibrary}>
          Bibliothèque
        </button>
      </div>
    );
  }

  if (error || !source) {
    return (
      <div className="tesla-car-root tesla-car-center">
        <p className="is-warn">{error || 'Source indisponible'}</p>
        <button type="button" className="tesla-car-btn" onClick={backToLibrary}>
          Retour à la bibliothèque
        </button>
      </div>
    );
  }

  telemetryCtxRef.current = {
    engine: driveMode ? activeEngine : 'video',
    preset: driveMode ? presetRef.current : 'mp4',
    position: currentTime,
  };
  const progressMax = duration > 0 ? duration : 0;
  const showDriveOverlay = driveMode && !mediaError;
  const displayTitle = pickMeta?.title || source.title;
  const displayPoster = pickMeta?.posterUrl || source.posterUrl;
  const dockVisible = controlsVisible || !!mediaError || !isPlaying;

  const restartDrive = () => {
    if (driveModeRef.current) startDriveAt(currentTime);
  };
  const autoPresetLabel = CAR_DRIVE_PRESET_LABELS[autoTuning.preset];
  const shownEngine: CarConcreteEngine = driveMode ? activeEngine : wantedEngine;
  const workerOk = CarWorkerRenderer.isSupported();
  const barCategories: BarCategory[] = [
    {
      id: 'engine',
      label: 'Moteur',
      value: renderEngine === 'auto' ? `Auto · ${ENGINE_LABEL[shownEngine]}` : ENGINE_LABEL[renderEngine],
      options: [
        { id: 'auto', label: `Auto → ${ENGINE_LABEL[autoTuning.engine]}`, hint: autoTuning.reasons.slice(0, 2).join(' · '), active: renderEngine === 'auto' },
        { id: 'canvas', label: 'Canvas', hint: 'jitter buffer + horloge audio (thread principal)', active: renderEngine === 'canvas' },
        {
          id: 'worker',
          label: 'Worker',
          hint: workerOk ? 'décodage + dessin hors thread (OffscreenCanvas)' : 'indisponible sur ce navigateur',
          active: renderEngine === 'worker',
          disabled: !workerOk,
        },
        { id: 'img', label: 'Image <img>', hint: 'MJPEG natif, aucune régulation', active: renderEngine === 'img' },
      ],
      onSelect: (id) => {
        const next = id as CarRenderEngine;
        writeCarRenderEngine(next);
        canvasFailedRef.current = false;
        workerFailedRef.current = false;
        renderEngineRef.current = next;
        wantedEngineRef.current = next === 'auto' ? autoTuning.engine : next;
        setRenderEngine(next);
        restartDrive();
      },
    },
    {
      id: 'quality',
      label: 'Qualité',
      value: qualityChoice === 'auto' ? `Auto · ${getCarDriveQualityProfile(autoTuning.preset).maxHeight}p` : `${getCarDriveQualityProfile(qualityChoice).maxHeight}p`,
      options: [
        { id: 'auto', label: 'Auto', hint: autoPresetLabel, active: qualityChoice === 'auto' },
        { id: 'lite', label: CAR_DRIVE_PRESET_LABELS.lite, hint: '≈0,7 Mb/s', active: qualityChoice === 'lite' },
        { id: 'standard', label: CAR_DRIVE_PRESET_LABELS.standard, hint: '≈1,4 Mb/s (défaut)', active: qualityChoice === 'standard' },
        { id: 'plus', label: CAR_DRIVE_PRESET_LABELS.plus, hint: '≈2,7 Mb/s', active: qualityChoice === 'plus' },
      ],
      onSelect: (id) => {
        const next = id as CarQualityChoice;
        try {
          localStorage.setItem(QUALITY_KEY, next);
        } catch {
          // ignore
        }
        qualityChoiceRef.current = next;
        setQualityChoice(next);
        restartDrive();
      },
    },
    {
      id: 'stats',
      label: 'Stats',
      value: stripOn ? 'Bande ON' : 'Masquées',
      options: [
        { id: 'on', label: 'Bande de stats en haut', active: stripOn },
        { id: 'off', label: 'Masquer', active: !stripOn },
      ],
      onSelect: (id) => {
        const on = id === 'on';
        try {
          localStorage.setItem(STRIP_KEY, on ? '1' : '0');
        } catch {
          // ignore
        }
        setStripOn(on);
      },
    },
  ];
  const stripStats: StripStats | null = driveMode
    ? engineStats ?? (activeEngine === 'img' ? { state: isPlaying ? '<img> natif (sans stats image)' : 'pause' } : null)
    : videoStats;

  return (
    <div
      className={`tesla-car-root tesla-car-player${stripOn ? ' has-strip' : ''}`}
      onClick={() => {
        setShowControls(true);
        pokeControls();
      }}
    >
      {stripOn && (
        <CarStatsStrip
          stats={stripStats}
          tags={[
            driveMode ? ENGINE_LABEL[activeEngine] : 'Vidéo',
            driveMode ? `${getCarDriveQualityProfile(presetRef.current).maxHeight}p` : 'MP4',
            detectedMode === 'drive' ? 'DRIVE' : detectedMode === 'park' ? 'PARK' : '?',
          ]}
          details={[
            ['Auto :', autoTuning.reasons.join(' · ')],
            ['Télémétrie :', telemetryRef.current ? `${telemetryRef.current.sent} envoi(s)${telemetryRef.current.lastError ? ` · ${telemetryRef.current.lastError}` : ''}` : '—'],
          ]}
          onHide={() => {
            try {
              localStorage.setItem(STRIP_KEY, '0');
            } catch {
              // ignore
            }
            setStripOn(false);
          }}
        />
      )}
      <video
        ref={videoRef}
        className={`tesla-car-player__video${showDriveOverlay ? ' is-hidden' : ''}`}
        playsInline
        preload="auto"
        poster={displayPoster || undefined}
        controls={false}
      />

      {/* Audio + MJPEG : actifs uniquement en conduite (Tesla ne bloque pas img/audio) */}
      <audio ref={audioRef} className="tesla-car-drive-audio" preload="auto" />
      {showDriveOverlay && !canvasActive && (
        <img
          ref={imgRef}
          className="tesla-car-drive-mjpeg"
          alt={displayTitle}
          draggable={false}
        />
      )}
      {showDriveOverlay && canvasActive && (
        <canvas
          key={activeEngine === 'worker' ? `w${driveSession}` : 'c'}
          ref={canvasRef}
          className="tesla-car-drive-mjpeg"
          aria-label={displayTitle}
        />
      )}

      {showDriveOverlay && dockVisible && !stripOn && (
        <div className="tesla-car-drive-chrome">
          <span className="tesla-car-drive__badge">
            <Car className="w-5 h-5" />
            Conduite · vidéo + audio
          </span>
          <p className="tesla-car-drive-chrome__hint">
            Image MJPEG + audio MP3 — pour garder la vidéo visible en roulant (Tesla coupe le lecteur natif).
          </p>
        </div>
      )}

      {!showDriveOverlay && (
        <div className="tesla-car-player__top">
          <button type="button" className="tesla-car-icon-btn" onClick={backToLibrary} aria-label="Bibliothèque">
            <X className="w-6 h-6" />
          </button>
          <div className="tesla-car-player__heading">
            <p className="eyebrow">Theater</p>
            <h2>{displayTitle}</h2>
            <p className="mode">{playbackModeLabel}</p>
          </div>
        </div>
      )}

      {(showControls || showDriveOverlay || mediaError) && dockVisible && (
        <div className="tesla-car-dock" onClick={(e) => { e.stopPropagation(); pokeControls(); }}>
          {prepStatus && !mediaError && (
            <p className="tesla-car-dock__error" style={{ opacity: 0.85 }}>
              {prepStatus}
            </p>
          )}
          {mediaError && <p className="tesla-car-dock__error">{mediaError}</p>}

          <div className="tesla-car-scrub">
            <time>{formatTime(currentTime)}</time>
            <input
              type="range"
              min={0}
              max={progressMax || 1}
              step={0.1}
              value={Math.min(currentTime, progressMax || 0)}
              onInput={onSeekBar}
              aria-label="Position"
            />
            <time>{formatTime(duration)}</time>
          </div>

          <div className="tesla-car-controls">
            <button type="button" className="tesla-car-ctrl" onClick={() => seekBy(-30)} aria-label="Reculer 30 secondes">
              <SkipBack className="w-7 h-7" />
              <span>−30</span>
            </button>

            <button
              type="button"
              className="tesla-car-ctrl tesla-car-ctrl--play"
              onClick={togglePlay}
              aria-label={isPlaying ? 'Pause' : 'Lecture'}
            >
              {isPlaying ? (
                <Pause className="w-11 h-11" fill="currentColor" />
              ) : (
                <Play className="w-11 h-11 ml-1" fill="currentColor" />
              )}
            </button>

            <button type="button" className="tesla-car-ctrl" onClick={() => seekBy(30)} aria-label="Avancer 30 secondes">
              <SkipForward className="w-7 h-7" />
              <span>+30</span>
            </button>

            {!showDriveOverlay ? (
              <button
                type="button"
                className="tesla-car-ctrl tesla-car-ctrl--ghost tesla-car-ctrl--drive"
                onClick={() => startDriveAt(currentTime)}
                title="Forcer vidéo + audio en conduite (MJPEG + MP3)"
              >
                <Car className="w-5 h-5" />
                <span className="hidden sm:inline">Conduite</span>
              </button>
            ) : (
              <button
                type="button"
                className="tesla-car-ctrl tesla-car-ctrl--ghost"
                onClick={exitDriveToVideo}
                title="Revenir au mode vidéo native (Parking)"
              >
                <RotateCcw className="w-5 h-5" />
                <span className="hidden sm:inline">Parking</span>
              </button>
            )}

            <CarPlaybackTypeSelector
              settings={playbackSettings}
              effectiveType={effectiveType}
              isDrive={detectedMode === 'drive' ? true : detectedMode === 'park' ? false : null}
              onSettingsChange={handleSettingsChange}
            />
          </div>

          <CarCategoryBar categories={barCategories} onOpenChange={setControlsPinned} onActivity={pokeControls} />

          {showDriveOverlay && (
            <div style={{ marginTop: '1.25rem', display: 'flex', justifyContent: 'center' }}>
              <button type="button" className="tesla-car-btn" onClick={backToLibrary}>
                Bibliothèque
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
