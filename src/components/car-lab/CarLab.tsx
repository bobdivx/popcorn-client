/**
 * PROVISOIRE — Labo lecture Tesla : /car/lab
 * Compare instantanément moteurs de rendu / qualité / buffer pour isoler les saccades en Drive.
 * Isolé : n'importe rien du lecteur desktop/TV (seulement bibliothèque + résolution de source voiture).
 */
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import CarLibraryBrowser, { type CarLibraryPick } from '../streaming/car-player/CarLibraryBrowser';
import { useCarMediaSource } from '../streaming/car-player/useCarMediaSource';
import { detectTeslaDriveMode, startDriveModeMonitoring, type TeslaDriveMode } from '../streaming/car-player/driveModeDetector';
import { noteDriveModeForCapabilities } from '../streaming/car-player/carCapabilities';
import { PlaybackTelemetry } from '../streaming/car-player/carTelemetry';
import CarStatsStrip from '../streaming/car-player/CarStatsStrip';
import CarCategoryBar, { useAutoHide, type BarCategory, type BarOption } from '../streaming/car-player/CarCategoryBar';
import CarCapabilitiesPanel from './CarCapabilitiesPanel';
import {
  ENGINES,
  QUALITY_ORDER,
  QUALITY_PRESETS,
  PROXY_PREFIX,
  buildSubsUrls,
  engineInfo,
  routeStreamUrl,
  loadConfig,
  loadLastPick,
  saveConfig,
  saveLastPick,
  type LabConfig,
  type LabPick,
  type LabQuality,
} from './labConfig';
import { LabPlayer, engineAvailability, type LabStats } from './labPlayer';
import { SubtitleStream, fetchSubTracks, type SubTrack } from './labSubtitles';

const SUB_TRACK_KEY = 'popcorn_car_lab_sub_track_v1';

function pickDefaultTrack(tracks: SubTrack[]): number | null {
  if (!tracks.length) return null;
  try {
    const saved = Number(localStorage.getItem(SUB_TRACK_KEY));
    if (tracks.some((t) => t.index === saved)) return saved;
  } catch {
    // ignore
  }
  const fr = tracks.find((t) => /^(fr|fre|fra)/i.test(t.language) && !/forc/i.test(t.title));
  return (fr || tracks[0]).index;
}

function fmt(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

function readSlug(): string | null {
  try {
    const p = new URLSearchParams(window.location.search);
    return p.get('slug')?.trim() || null;
  } catch {
    return null;
  }
}

function writePickToUrl(pick: LabPick | null): void {
  try {
    const url = new URL(window.location.href);
    for (const k of ['slug', 'path', 'infoHash', 't']) url.searchParams.delete(k);
    if (pick) {
      url.searchParams.set('slug', pick.slug);
      if (pick.path) url.searchParams.set('path', pick.path);
      if (pick.infoHash) url.searchParams.set('infoHash', pick.infoHash);
    }
    window.history.pushState({}, '', url.toString());
  } catch {
    // ignore
  }
}

function readStartTime(): number {
  try {
    const t = Number(new URLSearchParams(window.location.search).get('t'));
    return Number.isFinite(t) && t > 0 ? t : 0;
  } catch {
    return 0;
  }
}

export default function CarLab() {
  const [slug, setSlug] = useState<string | null>(null);
  const [cfg, setCfg] = useState<LabConfig>(() => loadConfig());
  const [effQuality, setEffQuality] = useState<LabQuality>(() => loadConfig().quality);
  const [stats, setStats] = useState<LabStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [drive, setDrive] = useState<TeslaDriveMode | 'testing'>('unknown');
  const [session, setSession] = useState(0);
  const [lastPick, setLastPick] = useState<LabPick | null>(null);
  const [title, setTitle] = useState<string>('');
  const [subTracks, setSubTracks] = useState<SubTrack[] | null>(null);
  const [subInfo, setSubInfo] = useState<string>('');
  const [subTrack, setSubTrack] = useState<number | null>(null);
  const [subText, setSubText] = useState<string>('');
  const [capsOpen, setCapsOpen] = useState(false);

  const hostRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<LabPlayer | null>(null);
  const posRef = useRef(0);
  const badSecondsRef = useRef(0);
  const goodSecondsRef = useRef(0);

  const { source, loading, error: sourceError } = useCarMediaSource(slug);
  const { visible: barVisible, poke: pokeBar, hide: hideBar, setPinned: setBarPinned } = useAutoHide(5000, !!slug && !paused);
  const telemetryRef = useRef<PlaybackTelemetry | null>(null);
  const teleCtxRef = useRef({ engine: '', preset: '', route: '', drive: 'unknown' as TeslaDriveMode | 'testing', extra: {} as Record<string, unknown> });
  const effectiveUrl = source?.streamUrl ? routeStreamUrl(source.streamUrl, cfg.route) : null;

  useEffect(() => {
    setSlug(readSlug());
    posRef.current = readStartTime();
    setLastPick(loadLastPick());
    const onPop = () => setSlug(readSlug());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const runDriveTest = useCallback(() => {
    setDrive('testing');
    void detectTeslaDriveMode()
      .then((r) => setDrive(r.mode))
      .catch(() => setDrive('unknown'));
  }, []);

  useEffect(() => {
    runDriveTest();
  }, [runDriveTest]);

  // Suivi Park↔Drive (même sonde) + empreinte capacités auto au chargement et à chaque transition
  useEffect(() => startDriveModeMonitoring((m) => setDrive(m)), []);
  useEffect(() => {
    if (drive !== 'testing') noteDriveModeForCapabilities('/car/lab', drive);
  }, [drive]);

  const updateCfg = useCallback((patch: Partial<LabConfig>) => {
    setCfg((prev) => {
      const next = { ...prev, ...patch };
      saveConfig(next);
      return next;
    });
    if (patch.quality) setEffQuality(patch.quality);
  }, []);

  useEffect(() => {
    saveConfig(cfg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Télémétrie de lecture : échantillon / 10 s pendant la lecture → POST /api/car/telemetry
  useEffect(() => {
    if (!slug) return;
    const t = new PlaybackTelemetry(() => ({
      page: '/car/lab',
      engine: teleCtxRef.current.engine,
      mode: teleCtxRef.current.drive,
      preset: teleCtxRef.current.preset,
      route: teleCtxRef.current.route,
      position: posRef.current,
      extra: teleCtxRef.current.extra,
    }));
    telemetryRef.current = t;
    t.start();
    return () => {
      t.stop();
      telemetryRef.current = null;
    };
  }, [slug]);

  // (Re)démarre le moteur à la position courante à chaque changement de mode
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !effectiveUrl || paused) return;
    setError(null);
    const player = new LabPlayer({
      host,
      streamUrl: effectiveUrl,
      seek: posRef.current,
      engine: cfg.engine,
      preset: QUALITY_PRESETS[effQuality],
      buffer: cfg.buffer,
      pace: cfg.pace,
      clock: cfg.clock,
      audio: cfg.audio,
      onStats: (s) => {
        posRef.current = s.position;
        setStats(s);
        if (s.state !== 'unavailable' && s.state !== 'idle') {
          telemetryRef.current?.push({
            state: s.state,
            fpsShown: s.fpsPainted,
            fpsReceived: s.engine === 'img' || s.engine === 'native' ? null : s.fpsReceived,
            targetFps: s.targetFps,
            dropped: s.dropped,
            late: s.late,
            stalls: s.stalls,
            paintJitterMs: s.paintJitterMs,
            arrivalJitterMs: s.arrivalJitterMs,
            kbps: s.kbps,
            bufferFrames: s.bufferFrames,
            bufferMs: s.bufferMs,
            decodeMs: s.decodeMs,
            paintMs: s.paintMs,
            avSyncMs: s.avSyncMs,
            frameSize: s.frameSize,
          });
        }
      },
      onError: (m) => setError(m),
    });
    playerRef.current = player;
    telemetryRef.current?.resetTotals();
    badSecondsRef.current = 0;
    goodSecondsRef.current = 0;
    player.start();
    return () => {
      posRef.current = player.getPosition();
      player.stop();
      if (playerRef.current === player) playerRef.current = null;
    };
  }, [effectiveUrl, cfg.engine, cfg.buffer, cfg.pace, cfg.clock, cfg.audio, effQuality, paused, session]);

  // Pistes sous-titres (ffprobe serveur) — chargées seulement si les sous-titres sont activés
  useEffect(() => {
    if (!cfg.subs || !effectiveUrl) return;
    const ac = new AbortController();
    setSubInfo('recherche des pistes…');
    fetchSubTracks(buildSubsUrls(effectiveUrl, 0, null).listUrl, ac.signal)
      .then(({ tracks, imageOnly }) => {
        setSubTracks(tracks);
        setSubTrack((cur) => (cur != null && tracks.some((t) => t.index === cur) ? cur : pickDefaultTrack(tracks)));
        setSubInfo(
          tracks.length
            ? `${tracks.length} piste(s) texte${imageOnly ? ` · ${imageOnly} image (PGS/VobSub) ignorée(s)` : ''}`
            : imageOnly
              ? `${imageOnly} piste(s) image (PGS/VobSub) seulement — non affichables`
              : 'aucune piste de sous-titres dans ce fichier',
        );
      })
      .catch((e) => {
        if (ac.signal.aborted) return;
        setSubTracks([]);
        setSubInfo(`pistes indisponibles (${e instanceof Error ? e.message : String(e)}) — serveur pas encore à jour ?`);
      });
    return () => ac.abort();
  }, [cfg.subs, source?.streamUrl, cfg.route]);

  // Flux WebVTT progressif depuis la position courante, affiché en overlay (indépendant du moteur vidéo)
  useEffect(() => {
    setSubText('');
    if (!cfg.subs || subTrack == null || !effectiveUrl || paused) return;
    const base = playerRef.current?.getPosition() ?? posRef.current;
    const { vttUrl } = buildSubsUrls(effectiveUrl, base, subTrack);
    if (!vttUrl) return;
    const stream = new SubtitleStream(vttUrl);
    stream.start();
    const timer = window.setInterval(() => {
      const pos = playerRef.current?.getPosition() ?? posRef.current;
      setSubText(stream.textAt(pos - base));
      if (stream.error) setSubInfo(stream.error);
    }, 200);
    return () => {
      window.clearInterval(timer);
      stream.stop();
    };
  }, [cfg.subs, subTrack, effectiveUrl, paused, session]);

  // Débit adaptatif : descend si on ne reçoit pas assez d'images, remonte après 30 s stables
  useEffect(() => {
    if (!stats || !cfg.adaptive || !engineInfo(cfg.engine).mjpeg || stats.state === 'unavailable') return;
    if (stats.state === 'connecting' || stats.state === 'buffering') return;
    const starving = stats.fpsReceived < stats.targetFps * 0.8 || stats.state === 'stalled';
    if (starving) {
      badSecondsRef.current++;
      goodSecondsRef.current = 0;
    } else {
      goodSecondsRef.current++;
      badSecondsRef.current = 0;
    }
    const idx = QUALITY_ORDER.indexOf(effQuality);
    const maxIdx = QUALITY_ORDER.indexOf(cfg.quality);
    if (badSecondsRef.current >= 4 && idx > 0) {
      setEffQuality(QUALITY_ORDER[idx - 1]);
    } else if (goodSecondsRef.current >= 30 && idx < maxIdx) {
      setEffQuality(QUALITY_ORDER[idx + 1]);
    }
  }, [stats]);

  useEffect(() => {
    if (!cfg.adaptive) setEffQuality(cfg.quality);
  }, [cfg.adaptive, cfg.quality]);

  const posBucket = stats ? Math.floor(stats.position / 10) : -1;
  useEffect(() => {
    if (source && slug) {
      const t = title || source.title;
      const pick: LabPick = {
        slug,
        path: source.filePath,
        infoHash: source.infoHash,
        title: t,
        position: posRef.current,
      };
      saveLastPick(pick);
    }
  }, [posBucket, source, slug]);

  const pickMedia = useCallback((pick: CarLibraryPick | LabPick) => {
    const p: LabPick = { slug: pick.slug, path: pick.path, infoHash: pick.infoHash, title: pick.title, posterUrl: pick.posterUrl };
    posRef.current = 'position' in pick && typeof pick.position === 'number' ? pick.position : 0;
    writePickToUrl(p);
    saveLastPick({ ...p, position: posRef.current });
    setTitle(p.title);
    setPaused(false);
    setSlug(p.slug);
  }, []);

  const back = useCallback(() => {
    playerRef.current?.stop();
    writePickToUrl(null);
    setSlug(null);
    setStats(null);
    setLastPick(loadLastPick());
  }, []);

  const seekBy = useCallback((d: number) => {
    const cur = playerRef.current?.getPosition() ?? posRef.current;
    posRef.current = Math.max(0, cur + d);
    setSession((n) => n + 1);
  }, []);

  const togglePause = useCallback(() => {
    if (!paused) posRef.current = playerRef.current?.getPosition() ?? posRef.current;
    setPaused((p) => !p);
  }, [paused]);

  const goFullscreen = useCallback(() => {
    const el = rootRef.current as (HTMLElement & { webkitRequestFullscreen?: () => void }) | null;
    if (!el) return;
    try {
      if (document.fullscreenElement) void document.exitFullscreen();
      else if (el.requestFullscreen) void el.requestFullscreen().catch(() => hideBar());
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
      else hideBar();
    } catch {
      hideBar();
    }
  }, [hideBar]);

  const copyLink = useCallback(() => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('t', String(Math.floor(posRef.current)));
      void navigator.clipboard?.writeText(url.toString());
      window.history.replaceState(window.history.state, '', url.toString());
    } catch {
      // ignore
    }
  }, []);

  if (!slug) {
    return (
      <div className="car-lab car-lab--picker">
        <div className="car-lab__pickerbar">
          <div>
            <strong>Labo lecture Tesla</strong> <span className="car-lab__muted">(provisoire)</span>
          </div>
          {lastPick && (
            <button type="button" className="car-lab__btn is-active" onClick={() => pickMedia(lastPick)}>
              ▶ Reprendre : {lastPick.title}
              {lastPick.position ? ` · ${fmt(lastPick.position)}` : ''}
            </button>
          )}
          <button type="button" className="car-lab__btn" onClick={() => setCapsOpen(true)}>
            Capacités
          </button>
          <a className="car-lab__btn" href="/car">
            ← Theater
          </a>
        </div>
        <CarLibraryBrowser onSelect={pickMedia} />
        {capsOpen && <CarCapabilitiesPanel mode={drive} onClose={() => setCapsOpen(false)} />}
      </div>
    );
  }

  const preset = QUALITY_PRESETS[effQuality];
  const driveLabel = drive === 'testing' ? 'test…' : drive === 'drive' ? 'DRIVE' : drive === 'park' ? 'PARK' : '?';
  const isMjpeg = engineInfo(cfg.engine).mjpeg;
  const eng = engineInfo(cfg.engine);
  teleCtxRef.current = {
    engine: cfg.engine,
    preset: `${effQuality} ${preset.maxHeight}p/${preset.fps}/q${preset.q}`,
    route: cfg.route,
    drive,
    extra: { buffer: cfg.buffer, pace: cfg.pace, clock: cfg.clock, adaptive: cfg.adaptive, audioOn: cfg.audio, subs: cfg.subs },
  };

  const opt = (id: string, label: string, active: boolean, hint?: string, disabled?: boolean): BarOption => ({ id, label, active, hint, disabled });
  const categories: BarCategory[] = [
    {
      id: 'engine',
      label: 'Moteur',
      value: eng.short,
      options: ENGINES.map((e) => {
        const av = engineAvailability(e.id);
        return opt(e.id, e.label, cfg.engine === e.id, av.ok ? e.description : `Indisponible : ${av.reason}`, !av.ok);
      }),
      onSelect: (id) => updateCfg({ engine: id as LabConfig['engine'] }),
    },
    {
      id: 'quality',
      label: 'Qualité',
      value: `${preset.maxHeight}p ${preset.fps} i/s${cfg.adaptive && effQuality !== cfg.quality ? ' (adapt.)' : ''}`,
      disabled: !isMjpeg,
      options: QUALITY_ORDER.map((q) => {
        const p = QUALITY_PRESETS[q];
        return opt(q, `${p.label} · ${p.maxHeight}p ${p.fps} i/s`, cfg.quality === q, `q${p.q} · audio ${p.audioBitrate} · ${p.approx}`);
      }),
      onSelect: (id) => updateCfg({ quality: id as LabQuality }),
    },
    {
      id: 'rate',
      label: 'Débit',
      value: `${cfg.adaptive ? 'Adaptatif' : 'Fixe'} · ${cfg.pace === 'burst' ? 'Rafale' : 'T. réel'}`,
      disabled: !isMjpeg,
      closeOnSelect: false,
      options: [
        opt('adaptive', 'Adaptatif', cfg.adaptive, 'descend si < 80 % des images reçues pendant 4 s, remonte après 30 s'),
        opt('fixed', 'Fixe', !cfg.adaptive, 'qualité choisie, sans adaptation'),
        opt('realtime', 'Serveur temps réel', cfg.pace === 'realtime', 'FFmpeg -re (cadence serveur)'),
        opt('burst', 'Serveur rafale + buffer', cfg.pace === 'burst', 'FFmpeg sans -re, régulé par le client (backpressure)', cfg.engine === 'img' || cfg.engine === 'worker'),
      ],
      onSelect: (id) => {
        if (id === 'adaptive' || id === 'fixed') updateCfg({ adaptive: id === 'adaptive' });
        else updateCfg({ pace: id as LabConfig['pace'] });
      },
    },
    {
      id: 'buffer',
      label: 'Buffer',
      value: `${cfg.buffer === 'cautious' ? 'Prudent' : 'Agressif'} · ${cfg.clock === 'audio' ? 'audio' : 'fixe'}`,
      disabled: !isMjpeg,
      closeOnSelect: false,
      options: [
        opt('aggressive', 'Agressif · ~0,3 s', cfg.buffer === 'aggressive', 'latence mini, sensible au jitter'),
        opt('cautious', 'Prudent · ~3 s', cfg.buffer === 'cautious', 'absorbe le jitter réseau'),
        opt('audio', 'Horloge calée audio', cfg.clock === 'audio', 'image choisie selon audio.currentTime'),
        opt('fixed', 'Horloge fixe', cfg.clock === 'fixed', 'cadence fixe, pas de calage audio'),
      ],
      onSelect: (id) => {
        if (id === 'aggressive' || id === 'cautious') updateCfg({ buffer: id });
        else updateCfg({ clock: id as LabConfig['clock'] });
      },
    },
    {
      id: 'route',
      label: 'Flux',
      value: cfg.route === 'proxy' ? 'Proxy client' : 'Direct',
      options: [
        opt('direct', 'Direct serveur', cfg.route === 'direct', 'URL serveur configurée (Cloudflare → Traefik → serveur), CORS'),
        opt('proxy', 'Via proxy client', cfg.route === 'proxy', `même origine ${PROXY_PREFIX}/… → nginx client → serveur (Docker interne)`),
      ],
      onSelect: (id) => updateCfg({ route: id as LabConfig['route'] }),
    },
    {
      id: 'av',
      label: 'Son / ST',
      value: `${cfg.audio ? 'Son' : 'Muet'} · ${cfg.subs ? (subTrack != null ? `ST #${subTrack}` : 'ST') : 'sans ST'}`,
      closeOnSelect: false,
      options: [
        opt('audio', cfg.audio ? 'Son ON (toucher pour couper)' : 'Son OFF (toucher pour activer)', cfg.audio),
        opt('unlock', '🔊 Débloquer le son', false, 'si l’autoplay a bloqué l’audio'),
        opt('subs', cfg.subs ? 'Sous-titres ON' : 'Sous-titres OFF', cfg.subs, cfg.subs ? subInfo : 'pistes texte du fichier, en overlay'),
        ...(cfg.subs
          ? (subTracks || []).map((t) =>
              opt(`track-${t.index}`, `${(t.language || `#${t.index}`).toUpperCase()}${t.title ? ` · ${t.title.slice(0, 24)}` : ''}`, subTrack === t.index, `${t.codec} · piste #${t.index}`),
            )
          : []),
      ],
      onSelect: (id) => {
        if (id === 'audio') updateCfg({ audio: !cfg.audio });
        else if (id === 'unlock') playerRef.current?.resumeAudio();
        else if (id === 'subs') updateCfg({ subs: !cfg.subs });
        else if (id.startsWith('track-')) {
          const idx = Number(id.slice(6));
          setSubTrack(idx);
          try {
            localStorage.setItem(SUB_TRACK_KEY, String(idx));
          } catch {
            // ignore
          }
        }
      },
    },
    {
      id: 'display',
      label: 'Affichage',
      value: driveLabel,
      options: [
        opt('fullscreen', '⛶ Plein écran', false),
        opt('hide', 'Masquer la barre', false, 'un tap sur l’image la réaffiche'),
        opt('drive', 'Re-tester Drive', drive === 'testing', `mode actuel : ${driveLabel}`),
        opt('link', 'Copier le lien (position + réglages)', false),
        opt('library', '← Bibliothèque', false),
        opt('theater', '← Theater (/car)', false),
      ],
      onSelect: (id) => {
        if (id === 'fullscreen') goFullscreen();
        else if (id === 'hide') hideBar();
        else if (id === 'drive') runDriveTest();
        else if (id === 'link') copyLink();
        else if (id === 'library') back();
        else if (id === 'theater') window.location.href = '/car';
      },
    },
    {
      id: 'stats',
      label: 'Stats',
      value: cfg.stats ? 'Bande ON' : 'Masquées',
      options: [opt('on', 'Bande de stats en haut', cfg.stats), opt('off', 'Masquer', !cfg.stats)],
      onSelect: (id) => updateCfg({ stats: id === 'on' }),
    },
    { id: 'caps', label: 'Capacités', value: 'Relevé', onClick: () => setCapsOpen(true) },
  ];

  return (
    <div
      ref={rootRef}
      className={`car-lab${cfg.stats ? ' car-lab--strip' : ''}`}
      onClick={() => pokeBar()}
    >
      <div ref={hostRef} className="car-lab__host" />

      {cfg.stats && (
        <CarStatsStrip
          stats={
            stats
              ? {
                  state: stats.state,
                  fpsShown: stats.fpsPainted,
                  targetFps: stats.targetFps,
                  fpsReceived: isMjpeg && cfg.engine !== 'img' ? stats.fpsReceived : null,
                  dropped: stats.dropped,
                  late: stats.late,
                  stalls: stats.stalls,
                  kbps: isMjpeg && cfg.engine !== 'img' ? stats.kbps : null,
                  bufferMs: stats.bufferMs,
                  decodeMs: isMjpeg && cfg.engine !== 'img' ? stats.decodeMs : null,
                  paintMs: stats.paintMs,
                  avSyncMs: stats.avSyncMs,
                  paintJitterMs: stats.paintJitterMs,
                  arrivalJitterMs: stats.arrivalJitterMs,
                  frameSize: stats.frameSize,
                }
              : null
          }
          tags={[eng.short, `${preset.maxHeight}p`, cfg.route === 'proxy' ? 'proxy' : 'direct', driveLabel]}
          details={[
            ['Audio :', stats?.audioState ?? '—'],
            ['Note :', stats?.note || '—'],
            ['Télémétrie :', telemetryRef.current ? `${telemetryRef.current.sent} envoi(s)${telemetryRef.current.lastError ? ` · ${telemetryRef.current.lastError}` : ''}` : '—'],
          ]}
          onHide={() => updateCfg({ stats: false })}
        />
      )}

      {loading && <div className="car-lab__center">Préparation de la source…</div>}
      {sourceError && <div className="car-lab__center is-warn">{sourceError}</div>}
      {paused && <div className="car-lab__center">⏸ Pause — {fmt(posRef.current)}</div>}
      {stats?.state === 'unavailable' && (
        <div className="car-lab__center is-warn">
          {eng.label} : indisponible — {stats.note}
        </div>
      )}

      {cfg.subs && subText && <div className="car-lab__subs">{subText}</div>}
      {capsOpen && <CarCapabilitiesPanel mode={drive} onClose={() => setCapsOpen(false)} />}

      {error && (
        <div className="car-lab__error" onClick={(e) => e.stopPropagation()}>
          {error}{' '}
          <button type="button" className="car-lab__btn" onClick={() => setSession((n) => n + 1)}>
            Relancer
          </button>
        </div>
      )}

      {barVisible && (
        <div className="car-lab__bar">
          <CarCategoryBar
            categories={categories}
            onOpenChange={setBarPinned}
            onActivity={pokeBar}
            leading={
              <>
                <button type="button" className="car-ui-bar__btn" onClick={() => seekBy(-30)} aria-label="Reculer 30 s">
                  −30
                </button>
                <button type="button" className="car-ui-bar__btn car-ui-bar__btn--play" onClick={togglePause} aria-label={paused ? 'Lecture' : 'Pause'}>
                  {paused ? '▶' : '⏸'}
                </button>
                <button type="button" className="car-ui-bar__btn" onClick={() => seekBy(30)} aria-label="Avancer 30 s">
                  +30
                </button>
                <span className="car-ui-bar__time">
                  {fmt(stats?.position ?? posRef.current)} · {title || source?.title || ''}
                </span>
              </>
            }
          />
        </div>
      )}
    </div>
  );
}
