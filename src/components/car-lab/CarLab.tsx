/**
 * PROVISOIRE — Labo lecture Tesla : /car/lab
 * Compare instantanément moteurs de rendu / qualité / buffer pour isoler les saccades en Drive.
 * Isolé : n'importe rien du lecteur desktop/TV (seulement bibliothèque + résolution de source voiture).
 */
import type { ComponentChildren } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import CarLibraryBrowser, { type CarLibraryPick } from '../streaming/car-player/CarLibraryBrowser';
import { useCarMediaSource } from '../streaming/car-player/useCarMediaSource';
import { detectTeslaDriveMode, type TeslaDriveMode } from '../streaming/car-player/driveModeDetector';
import {
  ENGINES,
  QUALITY_ORDER,
  QUALITY_PRESETS,
  engineInfo,
  loadConfig,
  loadLastPick,
  saveConfig,
  saveLastPick,
  type LabConfig,
  type LabPick,
  type LabQuality,
} from './labConfig';
import { LabPlayer, engineAvailability, type LabStats } from './labPlayer';

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

function Toggle(props: { active: boolean; disabled?: boolean; onClick: () => void; children: ComponentChildren; title?: string }) {
  return (
    <button
      type="button"
      title={props.title}
      disabled={props.disabled}
      className={`car-lab__btn${props.active ? ' is-active' : ''}${props.disabled ? ' is-disabled' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        if (!props.disabled) props.onClick();
      }}
    >
      {props.children}
    </button>
  );
}

export default function CarLab() {
  const [slug, setSlug] = useState<string | null>(null);
  const [cfg, setCfg] = useState<LabConfig>(() => loadConfig());
  const [effQuality, setEffQuality] = useState<LabQuality>(() => loadConfig().quality);
  const [stats, setStats] = useState<LabStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [panel, setPanel] = useState(true);
  const [drive, setDrive] = useState<TeslaDriveMode | 'testing'>('unknown');
  const [session, setSession] = useState(0);
  const [lastPick, setLastPick] = useState<LabPick | null>(null);
  const [title, setTitle] = useState<string>('');

  const hostRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<LabPlayer | null>(null);
  const posRef = useRef(0);
  const badSecondsRef = useRef(0);
  const goodSecondsRef = useRef(0);

  const { source, loading, error: sourceError } = useCarMediaSource(slug);

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

  // (Re)démarre le moteur à la position courante à chaque changement de mode
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !source?.streamUrl || paused) return;
    setError(null);
    const player = new LabPlayer({
      host,
      streamUrl: source.streamUrl,
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
      },
      onError: (m) => setError(m),
    });
    playerRef.current = player;
    badSecondsRef.current = 0;
    goodSecondsRef.current = 0;
    player.start();
    return () => {
      posRef.current = player.getPosition();
      player.stop();
      if (playerRef.current === player) playerRef.current = null;
    };
  }, [source?.streamUrl, cfg.engine, cfg.buffer, cfg.pace, cfg.clock, cfg.audio, effQuality, paused, session]);

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
      else if (el.requestFullscreen) void el.requestFullscreen().catch(() => setPanel(false));
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
      else setPanel(false);
    } catch {
      setPanel(false);
    }
  }, []);

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
          <a className="car-lab__btn" href="/car">
            ← Theater
          </a>
        </div>
        <CarLibraryBrowser onSelect={pickMedia} />
      </div>
    );
  }

  const preset = QUALITY_PRESETS[effQuality];
  const driveLabel = drive === 'testing' ? 'test…' : drive === 'drive' ? 'DRIVE' : drive === 'park' ? 'PARK' : 'inconnu';
  const isMjpeg = engineInfo(cfg.engine).mjpeg;

  return (
    <div ref={rootRef} className="car-lab" onClick={() => setPanel(true)}>
      <div ref={hostRef} className="car-lab__host" />

      {loading && <div className="car-lab__center">Préparation de la source…</div>}
      {sourceError && <div className="car-lab__center is-warn">{sourceError}</div>}
      {paused && <div className="car-lab__center">⏸ Pause — {fmt(posRef.current)}</div>}
      {stats?.state === 'unavailable' && (
        <div className="car-lab__center is-warn">
          {engineInfo(cfg.engine).label} : indisponible — {stats.note}
        </div>
      )}

      {cfg.stats && stats && (
        <div className="car-lab__stats" onClick={(e) => e.stopPropagation()}>
          <div>
            <b>{engineInfo(cfg.engine).short}</b> · {preset.label}
            {cfg.adaptive && effQuality !== cfg.quality ? ' (adapt.)' : ''} · {preset.maxHeight}p/{preset.fps}fps/q{preset.q}
          </div>
          <div>
            Mode voiture : <b className={drive === 'drive' ? 'is-warn' : ''}>{driveLabel}</b> · état : {stats.state}
          </div>
          <div>
            FPS affiché <b>{stats.fpsPainted}</b>/{stats.targetFps} · reçu {stats.fpsReceived}
          </div>
          <div>
            Jetées {stats.dropped} · en retard {stats.late} · coupures {stats.stalls}
          </div>
          <div>
            Jitter affichage {stats.paintJitterMs} ms · arrivée {stats.arrivalJitterMs} ms
          </div>
          <div>
            Débit {(stats.kbps / 1000).toFixed(2)} Mb/s · buffer {stats.bufferFrames} img / {stats.bufferMs} ms
          </div>
          <div>
            Décodage {stats.decodeMs} ms · peinture {stats.paintMs} ms · {stats.frameSize}
          </div>
          <div>
            Audio {stats.audioState}
            {stats.avSyncMs != null && (
              <>
                {' '}· A/V{' '}
                <b className={Math.abs(stats.avSyncMs) > 250 ? 'is-warn' : 'is-ok'}>
                  {stats.avSyncMs > 0 ? '+' : ''}
                  {stats.avSyncMs} ms
                </b>
              </>
            )}
          </div>
          {stats.note && <div className="car-lab__muted">{stats.note}</div>}
        </div>
      )}

      {error && (
        <div className="car-lab__error" onClick={(e) => e.stopPropagation()}>
          {error}{' '}
          <button type="button" className="car-lab__btn" onClick={() => setSession((n) => n + 1)}>
            Relancer
          </button>
        </div>
      )}

      {panel ? (
        <div className="car-lab__panel" onClick={(e) => e.stopPropagation()}>
          <div className="car-lab__row car-lab__row--transport">
            <button type="button" className="car-lab__btn" onClick={back}>
              ← Bibliothèque
            </button>
            <button type="button" className="car-lab__btn" onClick={() => seekBy(-30)}>
              −30
            </button>
            <button type="button" className="car-lab__btn car-lab__btn--big" onClick={togglePause}>
              {paused ? '▶' : '⏸'}
            </button>
            <button type="button" className="car-lab__btn" onClick={() => seekBy(30)}>
              +30
            </button>
            <button type="button" className="car-lab__btn" onClick={() => playerRef.current?.resumeAudio()}>
              🔊 Débloquer son
            </button>
            <span className="car-lab__time">
              {fmt(stats?.position ?? posRef.current)} · {title || source?.title || ''}
            </span>
          </div>

          <div className="car-lab__row">
            <span className="car-lab__label">Moteur</span>
            {ENGINES.map((e) => {
              const av = engineAvailability(e.id);
              return (
                <Toggle
                  key={e.id}
                  active={cfg.engine === e.id}
                  disabled={!av.ok}
                  title={av.ok ? e.description : `Indisponible : ${av.reason}`}
                  onClick={() => updateCfg({ engine: e.id })}
                >
                  {e.short}
                  {!av.ok && <small> indispo</small>}
                </Toggle>
              );
            })}
          </div>

          <div className="car-lab__row">
            <span className="car-lab__label">Qualité</span>
            {QUALITY_ORDER.map((q) => (
              <Toggle key={q} active={cfg.quality === q} disabled={!isMjpeg} onClick={() => updateCfg({ quality: q })}>
                {QUALITY_PRESETS[q].label}
                <small> {QUALITY_PRESETS[q].maxHeight}p·{QUALITY_PRESETS[q].fps}fps</small>
              </Toggle>
            ))}
            <Toggle active={cfg.adaptive} disabled={!isMjpeg} onClick={() => updateCfg({ adaptive: !cfg.adaptive })}>
              {cfg.adaptive ? 'Adaptatif' : 'Fixe'}
            </Toggle>
          </div>

          <div className="car-lab__row">
            <span className="car-lab__label">Buffer</span>
            <Toggle active={cfg.buffer === 'aggressive'} disabled={!isMjpeg} onClick={() => updateCfg({ buffer: 'aggressive' })}>
              Agressif <small>~0,3 s</small>
            </Toggle>
            <Toggle active={cfg.buffer === 'cautious'} disabled={!isMjpeg} onClick={() => updateCfg({ buffer: 'cautious' })}>
              Prudent <small>~3 s</small>
            </Toggle>
            <span className="car-lab__label">Serveur</span>
            <Toggle active={cfg.pace === 'realtime'} disabled={!isMjpeg} onClick={() => updateCfg({ pace: 'realtime' })}>
              Temps réel
            </Toggle>
            <Toggle
              active={cfg.pace === 'burst'}
              disabled={!isMjpeg || cfg.engine === 'img'}
              title="FFmpeg sans -re, régulé par le client (backpressure)"
              onClick={() => updateCfg({ pace: 'burst' })}
            >
              Rafale+buffer
            </Toggle>
          </div>

          <div className="car-lab__row">
            <span className="car-lab__label">Horloge</span>
            <Toggle active={cfg.clock === 'audio'} disabled={!isMjpeg} onClick={() => updateCfg({ clock: 'audio' })}>
              Calée audio
            </Toggle>
            <Toggle active={cfg.clock === 'fixed'} disabled={!isMjpeg} onClick={() => updateCfg({ clock: 'fixed' })}>
              Fixe
            </Toggle>
            <Toggle active={cfg.audio} onClick={() => updateCfg({ audio: !cfg.audio })}>
              {cfg.audio ? 'Son ON' : 'Son OFF'}
            </Toggle>
            <Toggle active={cfg.stats} onClick={() => updateCfg({ stats: !cfg.stats })}>
              Stats
            </Toggle>
            <button type="button" className="car-lab__btn" onClick={goFullscreen}>
              ⛶ Plein écran
            </button>
            <button type="button" className="car-lab__btn" onClick={() => setPanel(false)}>
              Masquer
            </button>
            <button type="button" className="car-lab__btn" onClick={runDriveTest}>
              Re-tester Drive
            </button>
            <button type="button" className="car-lab__btn" onClick={copyLink}>
              Lien
            </button>
          </div>
          <p className="car-lab__muted car-lab__desc">{engineInfo(cfg.engine).description}</p>
        </div>
      ) : (
        <button
          type="button"
          className="car-lab__btn car-lab__show"
          onClick={(e) => {
            e.stopPropagation();
            setPanel(true);
          }}
        >
          Réglages
        </button>
      )}
    </div>
  );
}
