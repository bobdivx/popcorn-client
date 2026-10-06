/**
 * Détecteur de mode conduite Tesla (Drive vs Park).
 *
 * En Drive, le navigateur Tesla met en pause tous les éléments <video> (pause() forcé au niveau OS).
 * Stratégie (cheap + fiable) :
 * - UN SEUL <video> sonde, créé une fois et réutilisé (plus de création/suppression toutes les 10 s) ;
 * - asset VALIDE et minuscule : MP4 H.264 baseline 16×16, 2 s, 4 i/s, muet (≈1,6 ko inline, aucun réseau) ;
 * - à chaque vérification : play() puis on regarde, ~1,2 s plus tard, si la lecture a réellement avancé
 *   (timeupdate reçus + currentTime qui bouge + pas en pause) → Park ; chargée mais figée/pausée → Drive ;
 * - sonde remise en pause entre deux vérifications (coût CPU ≈ nul) ;
 * - si l'asset ne se charge pas (codec absent…) ou onglet masqué → « unknown » (on ne devine pas).
 */

export type TeslaDriveMode = 'park' | 'drive' | 'unknown';

export interface DetectionResult {
  mode: TeslaDriveMode;
  /** Timestamp de la dernière détection */
  timestamp: number;
  /** Confiance du résultat (0-1) */
  confidence: number;
  /** Raison courte (debug / probe) */
  reason?: string;
}

const STORAGE_KEY = 'popcorn_tesla_drive_mode';
const RECHECK_INTERVAL_MS = 10000;
const OBSERVE_MS = 1200;
const LOAD_TIMEOUT_MS = 2500;

/** MP4 H.264 Constrained Baseline 16×16, 2 s, 4 i/s, sans audio (généré avec ffmpeg). */
const PROBE_SRC = 'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAANEbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAB9AAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAm90cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAB9AAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAABAAAAAQAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAfQAAAAAAABAAAAAAHnbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAABAAAAAgABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABkm1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAVJzdGJsAAAAunN0c2QAAAAAAAAAAQAAAKphdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAABAAEABIAAAASAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGP//AAAAMGF2Y0MBQsAe/+EAF2dCwB6mEXsBEAAAAwAQAAADAIDxYuEYAQAGaMhCAZSyAAAAEHBhc3AAAAABAAAAAQAAABRidHJ0AAAAAAAACyAAAAFUAAAAGHN0dHMAAAAAAAAAAQAAAAgAABAAAAAAFHN0c3MAAAAAAAAAAQAAAAEAAAAcc3RzYwAAAAAAAAABAAAAAQAAAAgAAAABAAAANHN0c3oAAAAAAAAAAAAAAAgAAAAPAAAACgAAAAoAAAAKAAAACgAAAAoAAAAKAAAACgAAABRzdGNvAAAAAAAAAAEAAAN0AAAAYXVkdGEAAABZbWV0YQAAAAAAAAAhaGRscgAAAAAAAAAAbWRpcmFwcGwAAAAAAAAAAAAAAAAsaWxzdAAAACSpdG9vAAAAHGRhdGEAAAABAAAAAExhdmY2MS43LjEwMwAAAAhmcmVlAAAAXW1kYXQAAAALZYiCAl5MUAAQX8AAAAAGQZocBL1AAAAABkGaKgEvUAAAAAZBmjsBL1AAAAAGQZpJAEvUAAAABkGaWUBL1AAAAAZBmmmAR9QAAAAGQZp5wEPU';

let probe: HTMLVideoElement | null = null;
let probeTimeupdates = 0;
let probeExternalPause = 0;
let probeSelfPausing = false;
let inflight: Promise<DetectionResult> | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function getProbe(): HTMLVideoElement {
  if (probe && probe.isConnected) return probe;
  const v = document.createElement('video');
  v.muted = true;
  v.defaultMuted = true;
  v.loop = true;
  v.playsInline = true;
  v.preload = 'auto';
  v.setAttribute('muted', '');
  v.setAttribute('playsinline', '');
  v.setAttribute('aria-hidden', 'true');
  v.tabIndex = -1;
  v.style.cssText =
    'position:fixed;left:0;bottom:0;width:2px;height:2px;opacity:0.01;pointer-events:none;z-index:-1;';
  v.addEventListener('timeupdate', () => {
    probeTimeupdates++;
  });
  v.addEventListener('pause', () => {
    // Pause non demandée par nous → signal fort de Drive
    if (!probeSelfPausing) probeExternalPause++;
  });
  v.src = PROBE_SRC;
  document.body.appendChild(v);
  probe = v;
  return v;
}

async function waitLoaded(v: HTMLVideoElement): Promise<boolean> {
  if (v.readyState >= 2) return true;
  if (v.error) return false;
  return new Promise<boolean>((resolve) => {
    const done = (ok: boolean) => {
      clearTimeout(t);
      v.removeEventListener('loadeddata', onOk);
      v.removeEventListener('error', onErr);
      resolve(ok);
    };
    const onOk = () => done(true);
    const onErr = () => done(false);
    const t = setTimeout(() => done(v.readyState >= 2), LOAD_TIMEOUT_MS);
    v.addEventListener('loadeddata', onOk);
    v.addEventListener('error', onErr);
  });
}

async function runDetection(): Promise<DetectionResult> {
  const now = () => Date.now();
  if (typeof document === 'undefined' || !document.body) {
    return { mode: 'unknown', timestamp: now(), confidence: 0, reason: 'no-dom' };
  }
  if (document.hidden) {
    return { mode: 'unknown', timestamp: now(), confidence: 0, reason: 'hidden' };
  }
  const v = getProbe();
  if (v.canPlayType('video/mp4; codecs="avc1.42E00A"') === '' && v.canPlayType('video/mp4') === '') {
    return { mode: 'unknown', timestamp: now(), confidence: 0.1, reason: 'no-h264' };
  }
  const loaded = await waitLoaded(v);
  if (!loaded) {
    return { mode: 'unknown', timestamp: now(), confidence: 0.1, reason: v.error ? `error-${v.error.code}` : 'load-timeout' };
  }

  const tu0 = probeTimeupdates;
  const pause0 = probeExternalPause;
  const t0 = v.currentTime;
  let playRejected = false;
  try {
    await Promise.race([v.play(), sleep(OBSERVE_MS)]);
  } catch {
    playRejected = true;
  }
  await sleep(OBSERVE_MS);
  const advanced = probeTimeupdates - tu0 >= 2 && v.currentTime !== t0 && !v.paused;
  const forcedPause = probeExternalPause > pause0;

  probeSelfPausing = true;
  try {
    v.pause();
  } catch {
    // ignore
  }
  probeSelfPausing = false;

  if (advanced && !forcedPause) {
    return { mode: 'park', timestamp: now(), confidence: 0.9, reason: 'playing' };
  }
  if (forcedPause) {
    return { mode: 'drive', timestamp: now(), confidence: 0.9, reason: 'forced-pause' };
  }
  if (playRejected) {
    // play() refusé : Drive… ou politique autoplay (peu probable, la sonde est muette)
    return { mode: 'drive', timestamp: now(), confidence: 0.7, reason: 'play-rejected' };
  }
  return { mode: 'drive', timestamp: now(), confidence: 0.75, reason: 'frozen' };
}

/** Détection ponctuelle (réutilise la sonde unique ; appels concurrents mutualisés). */
export function detectTeslaDriveMode(): Promise<DetectionResult> {
  if (inflight) return inflight;
  inflight = runDetection()
    .catch(() => ({ mode: 'unknown' as TeslaDriveMode, timestamp: Date.now(), confidence: 0, reason: 'exception' }))
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function getCachedDriveMode(): DetectionResult | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached) as DetectionResult;
      // Cache valide seulement 30s (Tesla peut changer Park↔Drive rapidement)
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
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(result));
  } catch {
    // ignore
  }
}

/** Détecte le mode avec cache (cache < 30 s sinon re-détecte). */
export async function detectDriveModeWithCache(): Promise<DetectionResult> {
  const cached = getCachedDriveMode();
  if (cached) return cached;
  const result = await detectTeslaDriveMode();
  setCachedDriveMode(result);
  return result;
}

/**
 * Monitoring continu : re-vérifie toutes les 10 s avec la MÊME sonde (aucun nouvel élément).
 * Une pause forcée de la sonde entre deux vérifs n'est pas observable (elle est déjà en pause),
 * d'où la vérification périodique ; on re-vérifie aussi au retour de visibilité.
 */
export function startDriveModeMonitoring(onModeChange: (mode: TeslaDriveMode) => void): () => void {
  let currentMode: TeslaDriveMode = 'unknown';
  let stopped = false;

  const check = async () => {
    if (stopped) return;
    const result = await detectTeslaDriveMode();
    if (stopped) return;
    setCachedDriveMode(result);
    if (result.mode !== currentMode && result.mode !== 'unknown' && result.confidence > 0.5) {
      currentMode = result.mode;
      onModeChange(result.mode);
    }
  };

  void check();
  const intervalId = window.setInterval(() => void check(), RECHECK_INTERVAL_MS);
  const onVis = () => {
    if (!document.hidden) void check();
  };
  document.addEventListener('visibilitychange', onVis);

  return () => {
    stopped = true;
    clearInterval(intervalId);
    document.removeEventListener('visibilitychange', onVis);
  };
}

/** Export pour CarProbe : même logique de détection. */
export { detectTeslaDriveMode as detectDriveModeForProbe };
