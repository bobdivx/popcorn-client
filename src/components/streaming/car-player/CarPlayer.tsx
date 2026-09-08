import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { Car, Pause, Play, RotateCcw, SkipBack, SkipForward, X } from 'lucide-preact';
import { stampTeslaBrowserHints } from '../../../lib/utils/device-detection';
import { useCarMediaSource } from './useCarMediaSource';
import CarLibraryBrowser, { type CarLibraryPick } from './CarLibraryBrowser';
import { attachCarStream } from './attachCarStream';
import { buildCarDriveUrls } from './buildCarDriveUrls';

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

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
 */
export default function CarPlayer() {
  const [slug, setSlug] = useState<string | null>(null);
  const [pickMeta, setPickMeta] = useState<{ title: string; posterUrl: string | null } | null>(null);
  const { source, loading, error } = useCarMediaSource(slug);

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
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

  useEffect(() => {
    driveModeRef.current = driveMode;
  }, [driveMode]);

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
    setDriveUrls(null);
  }, []);

  const startDriveAt = useCallback(
    (atSeconds: number) => {
      if (!source?.streamUrl) return;
      const seek = Math.max(0, atSeconds);
      const urls = buildCarDriveUrls(source.streamUrl, seek);
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
    const img = imgRef.current;
    if (!audio || !img) return;

    img.src = driveUrls.mjpegUrl;
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

    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('playing', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);

    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('playing', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
  }, [driveMode, driveUrls, driveSession]);

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

  const progressMax = duration > 0 ? duration : 0;
  const showDriveOverlay = driveMode && !mediaError;
  const displayTitle = pickMeta?.title || source.title;
  const displayPoster = pickMeta?.posterUrl || source.posterUrl;

  return (
    <div className="tesla-car-root tesla-car-player" onClick={() => setShowControls(true)}>
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
      {showDriveOverlay && (
        <img
          ref={imgRef}
          className="tesla-car-drive-mjpeg"
          alt={displayTitle}
          draggable={false}
        />
      )}

      {showDriveOverlay && (
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

      {(showControls || showDriveOverlay || mediaError) && (
        <div className="tesla-car-dock">
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
          </div>

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
