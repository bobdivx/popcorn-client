import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { Car, Pause, Play, RotateCcw, SkipBack, SkipForward, X } from 'lucide-preact';
import { stampTeslaBrowserHints } from '../../../lib/utils/device-detection';
import { serverApi } from '../../../lib/client/server-api';
import { buildStreamUrl } from '../player-core/utils/buildStreamUrl';
import { useCarMediaSource } from './useCarMediaSource';
import CarLibraryBrowser, { type CarLibraryPick } from './CarLibraryBrowser';
import { attachCarStream } from './attachCarStream';

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

export default function CarPlayer() {
  const [slug, setSlug] = useState<string | null>(null);
  const [pickMeta, setPickMeta] = useState<{ title: string; posterUrl: string | null } | null>(null);
  const { source, loading, error } = useCarMediaSource(slug);

  const videoRef = useRef<HTMLVideoElement>(null);
  const userWantsPlayRef = useRef(false);
  const userPausedRef = useRef(false);
  const lastAdvanceAtRef = useRef(0);
  const hasMediaErrorRef = useRef(false);
  const hlsFallbackTriedRef = useRef(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [driveMode, setDriveMode] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [showControls, setShowControls] = useState(true);
  const [playbackModeLabel, setPlaybackModeLabel] = useState('—');

  useEffect(() => {
    stampTeslaBrowserHints();
    setSlug(readSlugFromLocation());
    const onPop = () => setSlug(readSlugFromLocation());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const openLibraryPick = useCallback((pick: CarLibraryPick) => {
    writeCarUrl(pick);
    setPickMeta({ title: pick.title, posterUrl: pick.posterUrl || null });
    setSlug(pick.slug);
  }, []);

  const backToLibrary = useCallback(() => {
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
    hasMediaErrorRef.current = false;
    hlsFallbackTriedRef.current = false;
    userWantsPlayRef.current = false;
    userPausedRef.current = false;
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !source?.streamUrl) return;

    let destroyed = false;
    let destroyAttach: (() => void) | null = null;
    hasMediaErrorRef.current = false;
    hlsFallbackTriedRef.current = false;
    setMediaError(null);
    setDriveMode(false);
    userWantsPlayRef.current = false;
    userPausedRef.current = false;
    setPlaybackModeLabel(source.mode === 'direct' ? 'Direct' : 'HLS');

    const playWhenReady = () => {
      if (destroyed) return;
      userWantsPlayRef.current = true;
      void video.play().catch(() => undefined);
    };

    const startAttach = async (url: string, mode: 'direct' | 'hls-native' | 'hls', label: string) => {
      if (destroyAttach) {
        destroyAttach();
        destroyAttach = null;
      }
      setPlaybackModeLabel(label);
      const result = await attachCarStream(video, url, mode, (message) => {
        if (destroyed) return;
        if (
          mode === 'direct' &&
          !hlsFallbackTriedRef.current &&
          source &&
          /Format non supporté|code 4|Passage HLS/i.test(message)
        ) {
          hlsFallbackTriedRef.current = true;
          const baseUrl = serverApi.getServerUrl();
          const hls = buildStreamUrl({
            baseUrl,
            infoHash: source.infoHash,
            filePath: source.filePath,
            fileName: source.fileName,
            fileIndex: source.fileIndex,
            isDirectMode: false,
            isLucieMode: false,
            maxHeight: 720,
          });
          setMediaError(null);
          hasMediaErrorRef.current = false;
          void startAttach(hls.streamUrl, 'hls', 'HLS (fallback)').then(playWhenReady);
          return;
        }
        hasMediaErrorRef.current = true;
        setDriveMode(false);
        setMediaError(message);
      });
      if (destroyed) {
        result.destroy();
        return;
      }
      destroyAttach = result.destroy;
    };

    void startAttach(source.streamUrl, source.mode, source.mode === 'direct' ? 'Direct' : 'HLS').then(
      playWhenReady,
    );

    return () => {
      destroyed = true;
      destroyAttach?.();
    };
  }, [source?.streamUrl, source?.mode, source?.infoHash, source?.filePath, source?.fileName, source?.fileIndex]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTime = () => {
      setCurrentTime(video.currentTime || 0);
      if (!video.paused && video.currentTime > 0.2) {
        lastAdvanceAtRef.current = Date.now();
      }
    };
    const onMeta = () => setDuration(video.duration || 0);
    const onPlay = () => {
      setIsPlaying(true);
      if (!userPausedRef.current) setDriveMode(false);
    };
    const onPlaying = () => {
      setIsPlaying(true);
      lastAdvanceAtRef.current = Date.now();
      hasMediaErrorRef.current = false;
    };
    const onPause = () => {
      setIsPlaying(false);
      if (hasMediaErrorRef.current || video.error) return;
      if (userWantsPlayRef.current && !userPausedRef.current) {
        setDriveMode(true);
      }
    };
    const onEnded = () => {
      setIsPlaying(false);
      userWantsPlayRef.current = false;
      setDriveMode(false);
    };

    video.addEventListener('timeupdate', onTime);
    video.addEventListener('loadedmetadata', onMeta);
    video.addEventListener('durationchange', onMeta);
    video.addEventListener('play', onPlay);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('pause', onPause);
    video.addEventListener('ended', onEnded);

    const interval = window.setInterval(() => {
      if (!userWantsPlayRef.current || userPausedRef.current || hasMediaErrorRef.current) return;
      if (video.error) return;
      if (video.paused) {
        setDriveMode(true);
        return;
      }
      const stalled = Date.now() - lastAdvanceAtRef.current > 4000 && video.currentTime > 0.5;
      if (stalled) setDriveMode(true);
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
  }, [source?.streamUrl]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      userPausedRef.current = false;
      userWantsPlayRef.current = true;
      setDriveMode(false);
      void video.play().catch(() => setMediaError('Lecture bloquée — touchez Play à nouveau.'));
    } else {
      userPausedRef.current = true;
      userWantsPlayRef.current = false;
      video.pause();
      setDriveMode(false);
    }
    setShowControls(true);
  }, []);

  const seekBy = useCallback((delta: number) => {
    const video = videoRef.current;
    if (!video) return;
    const next = Math.max(0, Math.min((video.duration || 0) || Infinity, (video.currentTime || 0) + delta));
    video.currentTime = next;
    setCurrentTime(next);
    setShowControls(true);
  }, []);

  const onSeekBar = useCallback((e: Event) => {
    const video = videoRef.current;
    const input = e.currentTarget as HTMLInputElement;
    if (!video) return;
    const value = Number(input.value);
    if (!Number.isFinite(value)) return;
    video.currentTime = value;
    setCurrentTime(value);
  }, []);

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

      {showDriveOverlay && (
        <div
          className="tesla-car-drive"
          style={
            displayPoster
              ? {
                  backgroundImage: `linear-gradient(rgba(0,0,0,0.78), rgba(0,0,0,0.9)), url(${displayPoster})`,
                }
              : undefined
          }
        >
          <span className="tesla-car-drive__badge">
            <Car className="w-5 h-5" />
            Audio en conduite
          </span>
          <h1>{displayTitle}</h1>
          <p>La vidéo est masquée par le véhicule. L’audio peut continuer — pilotez avec les commandes.</p>
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

            <button
              type="button"
              className="tesla-car-ctrl tesla-car-ctrl--ghost tesla-car-ctrl--drive"
              onClick={() => {
                if (hasMediaErrorRef.current) return;
                userPausedRef.current = false;
                userWantsPlayRef.current = true;
                setDriveMode(true);
              }}
              title="Mode conduite"
            >
              <Car className="w-5 h-5" />
              <span className="hidden sm:inline">Drive</span>
            </button>

            {showDriveOverlay && (
              <button
                type="button"
                className="tesla-car-ctrl tesla-car-ctrl--ghost"
                onClick={() => {
                  setDriveMode(false);
                  userPausedRef.current = false;
                  userWantsPlayRef.current = true;
                  void videoRef.current?.play().catch(() => undefined);
                }}
              >
                <RotateCcw className="w-5 h-5" />
                <span className="hidden sm:inline">Vidéo</span>
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
