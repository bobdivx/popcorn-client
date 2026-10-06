/**
 * Détecteur de mode conduite Tesla (Drive vs Park).
 *
 * En Drive, Tesla met en pause / fige les <video> « réels » (OS). Les toutes petites
 * sondes (16×16 data-URL) peuvent encore avancer sur certains firmwares → faux Park.
 *
 * Stratégie phase 3 :
 * - Combine plusieurs signaux : clip réel (intro.mp4) taille visible, advance currentTime,
 *   requestVideoFrameCallback, drawImage non-noir, pause forcée, play() rejeté.
 * - Si UN signal Drive fort → Drive ; Park seulement si la vidéo avance CLAIREMENT
 *   (temps + frames peintes) ; sinon Unknown. Jamais d’erreur → Park.
 * - Override manuel obligatoire : ?mode=drive|park|auto + localStorage + boutons UI.
 * - Sondes fréquentes au démarrage (2 s × 20 s) puis toutes les 10 s.
 */

export type TeslaDriveMode = 'park' | 'drive' | 'unknown';
export type ModeSource = 'auto' | 'manual' | 'url';
export type ModeOverride = 'auto' | 'park' | 'drive';

export interface ProbeDetails {
  advanced: boolean;
  paused: boolean;
  readyState: number;
  error: string | null;
  durationTried: number;
  timeDelta: number;
  timeupdates: number;
  rvfcFired: boolean | null;
  framePainted: boolean | null;
  playRejected: boolean;
  forcedPause: boolean;
  asset: string;
  width: number;
  height: number;
  reason: string;
}

export interface DetectionResult {
  mode: TeslaDriveMode;
  /** Timestamp de la dernière détection */
  timestamp: number;
  /** Confiance du résultat (0-1) */
  confidence: number;
  /** Raison courte (debug / probe) */
  reason?: string;
  /** auto | manual (UI/localStorage) | url (?mode=) */
  modeSource?: ModeSource;
  /** Détail de la dernière sonde auto (ignoré si override manuel) */
  probe?: ProbeDetails;
}

const CACHE_KEY = 'popcorn_tesla_drive_mode';
const OVERRIDE_KEY = 'popcorn_tesla_mode_override';
const FAST_INTERVAL_MS = 2000;
const FAST_WINDOW_MS = 20000;
const SLOW_INTERVAL_MS = 10000;
const OBSERVE_MS = 1400;
const LOAD_TIMEOUT_MS = 4000;
const PARK_MIN_DELTA = 0.25;

/** Clip réel court (public/intro.mp4) — plus fiable qu’un MP4 16×16 inline. */
const PROBE_ASSET = '/intro.mp4';
const PROBE_W = 320;
const PROBE_H = 180;

let probe: HTMLVideoElement | null = null;
let probeCanvas: HTMLCanvasElement | null = null;
let probeTimeupdates = 0;
let probeExternalPause = 0;
let probeSelfPausing = false;
let inflight: Promise<DetectionResult> | null = null;
let lastAutoResult: DetectionResult | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function now(): number {
  return Date.now();
}

/* ------------------------------------------------------------------ override */

function readUrlMode(): ModeOverride | null {
  if (typeof window === 'undefined') return null;
  try {
    const m = new URLSearchParams(window.location.search).get('mode')?.trim().toLowerCase();
    if (m === 'drive' || m === 'park' || m === 'auto') return m;
  } catch {
    // ignore
  }
  return null;
}

function readStoredOverride(): ModeOverride {
  if (typeof localStorage === 'undefined') return 'auto';
  try {
    const v = localStorage.getItem(OVERRIDE_KEY)?.trim().toLowerCase();
    if (v === 'drive' || v === 'park' || v === 'auto') return v;
  } catch {
    // ignore
  }
  return 'auto';
}

/** Lit ?mode= puis localStorage ; si URL présente, la persiste. */
export function resolveModeOverride(): { override: ModeOverride; source: ModeSource } {
  const fromUrl = readUrlMode();
  if (fromUrl) {
    try {
      localStorage.setItem(OVERRIDE_KEY, fromUrl);
    } catch {
      // ignore
    }
    return { override: fromUrl, source: fromUrl === 'auto' ? 'auto' : 'manual' };
  }
  const stored = readStoredOverride();
  return { override: stored, source: stored === 'auto' ? 'auto' : 'manual' };
}

export function getModeOverride(): ModeOverride {
  return resolveModeOverride().override;
}

/** Force Park / Drive / Auto (sticky localStorage). `auto` efface le forçage. */
export function setModeOverride(override: ModeOverride): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(OVERRIDE_KEY, override);
  } catch {
    // ignore
  }
  // Met à jour l’URL sans recharger pour que ?mode= reflète le choix
  try {
    const url = new URL(window.location.href);
    if (override === 'auto') url.searchParams.delete('mode');
    else url.searchParams.set('mode', override);
    window.history.replaceState(window.history.state, '', url.toString());
  } catch {
    // ignore
  }
}

function manualResult(mode: 'park' | 'drive', source: ModeSource): DetectionResult {
  return {
    mode,
    timestamp: now(),
    confidence: 1,
    reason: `manual-${mode}`,
    modeSource: source,
    probe: lastAutoResult?.probe,
  };
}

/** Mode effectif : override manuel/URL prioritaire, sinon dernière auto (ou unknown). */
export function getEffectiveDriveMode(): DetectionResult {
  const { override, source } = resolveModeOverride();
  if (override === 'park' || override === 'drive') return manualResult(override, source);
  if (lastAutoResult) return { ...lastAutoResult, modeSource: 'auto' };
  const cached = getCachedDriveMode();
  if (cached) return { ...cached, modeSource: cached.modeSource || 'auto' };
  return { mode: 'unknown', timestamp: now(), confidence: 0, reason: 'no-probe-yet', modeSource: 'auto' };
}

/* ------------------------------------------------------------------- probe DOM */

function getProbe(): HTMLVideoElement {
  if (probe && probe.isConnected) return probe;
  const v = document.createElement('video');
  v.muted = true;
  v.defaultMuted = true;
  v.loop = true;
  v.playsInline = true;
  v.preload = 'auto';
  v.crossOrigin = 'anonymous';
  v.setAttribute('muted', '');
  v.setAttribute('playsinline', '');
  v.setAttribute('aria-hidden', 'true');
  v.tabIndex = -1;
  // Taille réelle (pas 2×2) : certains firmwares Tesla laissent passer les micro-vidéos en Drive.
  v.width = PROBE_W;
  v.height = PROBE_H;
  v.style.cssText = `position:fixed;left:0;top:0;width:${PROBE_W}px;height:${PROBE_H}px;opacity:0.02;pointer-events:none;z-index:-1;object-fit:cover;`;
  v.addEventListener('timeupdate', () => {
    probeTimeupdates++;
  });
  v.addEventListener('pause', () => {
    if (!probeSelfPausing) probeExternalPause++;
  });
  // Cache-bust léger pour forcer un vrai load réseau/local
  v.src = `${PROBE_ASSET}?pd=${Date.now().toString(36)}`;
  document.body.appendChild(v);
  probe = v;
  return v;
}

function getProbeCanvas(): HTMLCanvasElement {
  if (probeCanvas) return probeCanvas;
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 16;
  probeCanvas = c;
  return c;
}

async function waitLoaded(v: HTMLVideoElement): Promise<boolean> {
  if (v.readyState >= 2) return true;
  if (v.error) return false;
  return new Promise<boolean>((resolve) => {
    const done = (ok: boolean) => {
      clearTimeout(t);
      v.removeEventListener('loadeddata', onOk);
      v.removeEventListener('canplay', onOk);
      v.removeEventListener('error', onErr);
      resolve(ok);
    };
    const onOk = () => done(true);
    const onErr = () => done(false);
    const t = setTimeout(() => done(v.readyState >= 2), LOAD_TIMEOUT_MS);
    v.addEventListener('loadeddata', onOk);
    v.addEventListener('canplay', onOk);
    v.addEventListener('error', onErr);
  });
}

function sampleFrame(v: HTMLVideoElement): boolean | null {
  try {
    if (v.readyState < 2 || v.videoWidth < 2) return null;
    const c = getProbeCanvas();
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(v, 0, 0, c.width, c.height);
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) sum += data[i] + data[i + 1] + data[i + 2];
    // Non-noir = frame peinte (Park). Noir pur = souvent Drive (extraction bloquée).
    return sum > 80;
  } catch {
    return null;
  }
}

function watchRvfc(v: HTMLVideoElement, ms: number): Promise<boolean | null> {
  const proto = HTMLVideoElement.prototype as HTMLVideoElement & {
    requestVideoFrameCallback?: (cb: (now: number, meta: unknown) => void) => number;
    cancelVideoFrameCallback?: (id: number) => void;
  };
  if (typeof proto.requestVideoFrameCallback !== 'function') return Promise.resolve(null);
  return new Promise((resolve) => {
    let fired = false;
    let id = 0;
    const t = window.setTimeout(() => {
      try {
        proto.cancelVideoFrameCallback?.(id);
      } catch {
        // ignore
      }
      resolve(fired);
    }, ms);
    try {
      id = proto.requestVideoFrameCallback!.call(v, () => {
        fired = true;
        clearTimeout(t);
        resolve(true);
      });
    } catch {
      clearTimeout(t);
      resolve(null);
    }
  });
}

async function runAutoDetection(): Promise<DetectionResult> {
  if (typeof document === 'undefined' || !document.body) {
    return { mode: 'unknown', timestamp: now(), confidence: 0, reason: 'no-dom', modeSource: 'auto' };
  }
  if (document.hidden) {
    return { mode: 'unknown', timestamp: now(), confidence: 0, reason: 'hidden', modeSource: 'auto' };
  }

  const v = getProbe();
  const canMp4 = v.canPlayType('video/mp4') || v.canPlayType('video/mp4; codecs="avc1.42E01E"');
  if (canMp4 === '') {
    return {
      mode: 'unknown',
      timestamp: now(),
      confidence: 0.1,
      reason: 'no-h264',
      modeSource: 'auto',
      probe: {
        advanced: false,
        paused: true,
        readyState: v.readyState,
        error: 'no-h264',
        durationTried: 0,
        timeDelta: 0,
        timeupdates: 0,
        rvfcFired: null,
        framePainted: null,
        playRejected: false,
        forcedPause: false,
        asset: PROBE_ASSET,
        width: PROBE_W,
        height: PROBE_H,
        reason: 'no-h264',
      },
    };
  }

  const loaded = await waitLoaded(v);
  if (!loaded) {
    const err = v.error ? `error-${v.error.code}` : 'load-timeout';
    return {
      mode: 'unknown',
      timestamp: now(),
      confidence: 0.1,
      reason: err,
      modeSource: 'auto',
      probe: {
        advanced: false,
        paused: !!v.paused,
        readyState: v.readyState,
        error: err,
        durationTried: Number.isFinite(v.duration) ? v.duration : 0,
        timeDelta: 0,
        timeupdates: 0,
        rvfcFired: null,
        framePainted: null,
        playRejected: false,
        forcedPause: false,
        asset: PROBE_ASSET,
        width: PROBE_W,
        height: PROBE_H,
        reason: err,
      },
    };
  }

  const tu0 = probeTimeupdates;
  const pause0 = probeExternalPause;
  const t0 = v.currentTime;
  let playRejected = false;

  const rvfcPromise = watchRvfc(v, OBSERVE_MS);
  try {
    await Promise.race([v.play(), sleep(OBSERVE_MS)]);
  } catch {
    playRejected = true;
  }
  await sleep(OBSERVE_MS);

  const rvfcFired = await rvfcPromise;
  const timeDelta = Math.abs((v.currentTime || 0) - t0);
  const tuDelta = probeTimeupdates - tu0;
  const forcedPause = probeExternalPause > pause0;
  const framePainted = sampleFrame(v);
  const durationTried = Number.isFinite(v.duration) ? v.duration : 0;

  // Park = avance CLAIRE + (frame peinte OU rVFC). Sans preuve visuelle → pas Park.
  const clearlyAdvanced = tuDelta >= 2 && timeDelta >= PARK_MIN_DELTA && !v.paused;
  const visualOk = framePainted === true || rvfcFired === true;
  const visualBlocked = framePainted === false || rvfcFired === false;

  probeSelfPausing = true;
  try {
    v.pause();
  } catch {
    // ignore
  }
  probeSelfPausing = false;

  const baseProbe = (reason: string, advanced: boolean): ProbeDetails => ({
    advanced,
    paused: !!v.paused,
    readyState: v.readyState,
    error: v.error ? `MediaError ${v.error.code}` : null,
    durationTried,
    timeDelta: Math.round(timeDelta * 1000) / 1000,
    timeupdates: tuDelta,
    rvfcFired,
    framePainted,
    playRejected,
    forcedPause,
    asset: PROBE_ASSET,
    width: PROBE_W,
    height: PROBE_H,
    reason,
  });

  // Signaux Drive forts en premier
  if (forcedPause) {
    return {
      mode: 'drive',
      timestamp: now(),
      confidence: 0.95,
      reason: 'forced-pause',
      modeSource: 'auto',
      probe: baseProbe('forced-pause', false),
    };
  }
  if (playRejected) {
    return {
      mode: 'drive',
      timestamp: now(),
      confidence: 0.8,
      reason: 'play-rejected',
      modeSource: 'auto',
      probe: baseProbe('play-rejected', false),
    };
  }
  if (clearlyAdvanced && visualBlocked) {
    // currentTime avance mais pas de frame → typique Drive « soft » (horloge seule)
    return {
      mode: 'drive',
      timestamp: now(),
      confidence: 0.85,
      reason: 'time-without-frames',
      modeSource: 'auto',
      probe: baseProbe('time-without-frames', true),
    };
  }
  if (clearlyAdvanced && visualOk) {
    return {
      mode: 'park',
      timestamp: now(),
      confidence: 0.92,
      reason: 'playing+frames',
      modeSource: 'auto',
      probe: baseProbe('playing+frames', true),
    };
  }
  if (clearlyAdvanced && framePainted == null && rvfcFired == null) {
    // Avance claire mais pas de signal visuel dispo → Park prudent (moins sûr)
    return {
      mode: 'park',
      timestamp: now(),
      confidence: 0.7,
      reason: 'playing-no-visual-api',
      modeSource: 'auto',
      probe: baseProbe('playing-no-visual-api', true),
    };
  }
  if (!v.paused && timeDelta < PARK_MIN_DELTA) {
    return {
      mode: 'drive',
      timestamp: now(),
      confidence: 0.8,
      reason: 'frozen',
      modeSource: 'auto',
      probe: baseProbe('frozen', false),
    };
  }
  if (v.paused && timeDelta < PARK_MIN_DELTA) {
    return {
      mode: 'drive',
      timestamp: now(),
      confidence: 0.75,
      reason: 'paused-frozen',
      modeSource: 'auto',
      probe: baseProbe('paused-frozen', false),
    };
  }

  return {
    mode: 'unknown',
    timestamp: now(),
    confidence: 0.3,
    reason: 'inconclusive',
    modeSource: 'auto',
    probe: baseProbe('inconclusive', clearlyAdvanced),
  };
}

/** Détection auto ponctuelle (réutilise la sonde ; appels concurrents mutualisés). */
export function detectTeslaDriveMode(): Promise<DetectionResult> {
  // Override : ne pas lancer la sonde (coût) — retour immédiat
  const { override, source } = resolveModeOverride();
  if (override === 'park' || override === 'drive') {
    return Promise.resolve(manualResult(override, source));
  }
  if (inflight) return inflight;
  inflight = runAutoDetection()
    .catch(
      (): DetectionResult => ({
        mode: 'unknown',
        timestamp: now(),
        confidence: 0,
        reason: 'exception',
        modeSource: 'auto',
      }),
    )
    .then((r) => {
      lastAutoResult = r;
      return r;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function getCachedDriveMode(): DetectionResult | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached) as DetectionResult;
      if (Date.now() - parsed.timestamp < 30000) return parsed;
    }
  } catch {
    // ignore
  }
  return null;
}

export function setCachedDriveMode(result: DetectionResult): void {
  if (typeof localStorage === 'undefined') return;
  if (result.mode === 'unknown') return;
  if (result.modeSource && result.modeSource !== 'auto') return; // ne pas polluer le cache auto
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(result));
  } catch {
    // ignore
  }
}

/** Détecte le mode avec cache (respecte override manuel/URL). */
export async function detectDriveModeWithCache(): Promise<DetectionResult> {
  const { override, source } = resolveModeOverride();
  if (override === 'park' || override === 'drive') return manualResult(override, source);
  const cached = getCachedDriveMode();
  if (cached) return { ...cached, modeSource: 'auto' };
  const result = await detectTeslaDriveMode();
  setCachedDriveMode(result);
  return result;
}

export type DriveModeListener = (mode: TeslaDriveMode, result: DetectionResult) => void;

/**
 * Monitoring continu : 2 s pendant les 20 premières secondes, puis 10 s.
 * Override manuel/URL court-circuite la sonde et notifie immédiatement.
 */
export function startDriveModeMonitoring(onModeChange: DriveModeListener): () => void {
  let currentMode: TeslaDriveMode = 'unknown';
  let stopped = false;
  let startedAt = Date.now();
  let intervalId = 0;

  let lastKey = '';
  const emit = (result: DetectionResult) => {
    if (stopped) return;
    if (result.mode === 'unknown' && result.modeSource === 'auto') return;
    const key = result.mode + '|' + (result.modeSource || 'auto') + '|' + (result.reason || '');
    if (key === lastKey) return;
    lastKey = key;
    currentMode = result.mode;
    onModeChange(result.mode, result);
  };

  const check = async () => {
    if (stopped) return;
    const result = await detectTeslaDriveMode();
    if (stopped) return;
    if (result.modeSource === 'auto') setCachedDriveMode(result);
    emit(result);
  };

  const armInterval = () => {
    window.clearInterval(intervalId);
    const elapsed = Date.now() - startedAt;
    const ms = elapsed < FAST_WINDOW_MS ? FAST_INTERVAL_MS : SLOW_INTERVAL_MS;
    intervalId = window.setInterval(() => {
      if (Date.now() - startedAt >= FAST_WINDOW_MS && ms === FAST_INTERVAL_MS) {
        armInterval(); // passe en rythme lent
      }
      void check();
    }, ms);
  };

  // Appliquer override URL dès le montage
  resolveModeOverride();
  void check();
  armInterval();

  const onVis = () => {
    if (!document.hidden) void check();
  };
  document.addEventListener('visibilitychange', onVis);

  // Écoute storage (autre onglet) + event custom local
  const onStorage = (e: StorageEvent) => {
    if (e.key === OVERRIDE_KEY) void check();
  };
  window.addEventListener('storage', onStorage);
  const onOverride = () => {
    startedAt = Date.now();
    armInterval();
    void check();
  };
  window.addEventListener('popcorn-drive-mode-override', onOverride);

  return () => {
    stopped = true;
    window.clearInterval(intervalId);
    document.removeEventListener('visibilitychange', onVis);
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('popcorn-drive-mode-override', onOverride);
  };
}

/** À appeler après setModeOverride pour réveiller le monitoring sans attendre l’intervalle. */
export function notifyModeOverrideChanged(): void {
  try {
    window.dispatchEvent(new Event('popcorn-drive-mode-override'));
  } catch {
    // ignore
  }
}

/** Helper UI : set + notify. */
export function applyModeOverride(override: ModeOverride): DetectionResult {
  setModeOverride(override);
  notifyModeOverrideChanged();
  return getEffectiveDriveMode();
}

/** Export pour CarProbe : même logique de détection. */
export { detectTeslaDriveMode as detectDriveModeForProbe };
