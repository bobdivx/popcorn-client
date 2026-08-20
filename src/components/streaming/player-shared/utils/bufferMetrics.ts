/**
 * Métriques de buffer vidéo fiables pour seek HLS / MSE.
 * Ne jamais utiliser buffered.end / duration pour l’overlay : après un seek,
 * end ≈ position cible → faux ~100 %.
 */

/** Secondes de buffer ahead considérées comme « plein » pour l’overlay (%). */
export const BUFFER_AHEAD_TARGET_SEC = 20;

/** Buffer ahead minimum avant de lever l’overlay / isLoading après un seek. */
export const MIN_BUFFER_AFTER_SEEK_SEC = 2.5;
export const MIN_BUFFER_AFTER_SEEK_REMOTE_SEC = 4;

/** Buffer ahead minimum avant le 1er `play()` (≈ 2–3 segments HLS de 4 s). */
export const MIN_BUFFER_BEFORE_PLAY_SEC = 10;
export const MIN_BUFFER_BEFORE_PLAY_REMOTE_SEC = 8;

/** Hystérésis overlay : masquer seulement au-dessus, réafficher seulement en dessous. */
export const OVERLAY_HIDE_BUFFER_SEC = 8;
export const OVERLAY_SHOW_BUFFER_SEC = 2;

/** Délais debounce overlay waiting (évite le clignotement). */
export const WAITING_SHOW_DELAY_MS = 280;
export const WAITING_HIDE_DELAY_MS = 420;

/** Segments supplémentaires après la cible avant de répondre 200 (serveur). */
export const SEEK_READY_EXTRA_SEGMENTS = 2;

export interface TimeRangesLike {
  length: number;
  start(index: number): number;
  end(index: number): number;
}

/** Secondes de média déjà décodables devant `position` (0 si hors buffer). */
export function getBufferAheadSeconds(
  buffered: TimeRangesLike | null | undefined,
  position: number,
): number {
  if (!buffered || buffered.length === 0 || !Number.isFinite(position)) return 0;
  try {
    for (let i = 0; i < buffered.length; i++) {
      const start = buffered.start(i);
      const end = buffered.end(i);
      if (position >= start && position < end) {
        return Math.max(0, end - position);
      }
      // Légèrement avant le début d’une range (seek tout juste posé)
      if (position < start && start - position < 0.5) {
        return Math.max(0, end - start);
      }
    }
  } catch {
    return 0;
  }
  return 0;
}

/** Fin de la range contenant `position`, sinon fin de la dernière range, sinon 0. */
export function getBufferedEndAround(
  buffered: TimeRangesLike | null | undefined,
  position: number,
): number {
  if (!buffered || buffered.length === 0) return 0;
  try {
    for (let i = 0; i < buffered.length; i++) {
      const start = buffered.start(i);
      const end = buffered.end(i);
      if (position >= start && position <= end + 0.25) return end;
    }
    return buffered.end(buffered.length - 1);
  } catch {
    return 0;
  }
}

export function isTimeInBuffered(
  buffered: TimeRangesLike | null | undefined,
  time: number,
  marginSec = 0.5,
): boolean {
  if (!buffered || buffered.length === 0 || !Number.isFinite(time)) return false;
  try {
    for (let i = 0; i < buffered.length; i++) {
      if (time >= buffered.start(i) - marginSec && time <= buffered.end(i) + marginSec) {
        return true;
      }
    }
  } catch {
    return false;
  }
  return false;
}

/** % pour overlay / readiness : 0–100 selon buffer ahead vs cible. */
export function getBufferAheadPercent(
  aheadSeconds: number,
  targetSeconds: number = BUFFER_AHEAD_TARGET_SEC,
): number {
  if (!Number.isFinite(aheadSeconds) || aheadSeconds <= 0) return 0;
  if (!Number.isFinite(targetSeconds) || targetSeconds <= 0) return 0;
  return Math.max(0, Math.min(100, (aheadSeconds / targetSeconds) * 100));
}

export function minBufferBeforePlaySec(isRemoteStream: boolean): number {
  return isRemoteStream ? MIN_BUFFER_BEFORE_PLAY_REMOTE_SEC : MIN_BUFFER_BEFORE_PLAY_SEC;
}

/** webOS : `play` / TimeRanges peuvent manquer alors que l’image avance. */
export function isVideoVisiblyPlaying(video: HTMLVideoElement | null | undefined): boolean {
  if (!video) return false;
  const t = video.currentTime;
  if (!Number.isFinite(t)) return false;
  if (video.paused === false) return true;
  return t > 0.4;
}

/**
 * Lecture réellement en cours (image décodée), pas seulement « canplay ».
 * `readyState >= 2` est trop tôt : 1 fragment suffit, ce n’est pas encore du play.
 */
export function hasMediaPlaybackStarted(video: HTMLVideoElement | null | undefined): boolean {
  if (!video) return false;
  if (isVideoVisiblyPlaying(video)) return true;
  if ((video.videoWidth || 0) > 0 && (video.videoHeight || 0) > 0) return true;
  const decoded = (video as HTMLVideoElement & { webkitDecodedFrameCount?: number })
    .webkitDecodedFrameCount;
  if (typeof decoded === 'number' && decoded > 0) return true;
  return false;
}

export interface HlsForwardBufferInfo {
  len?: number;
  start?: number;
  end?: number;
}

/** Buffer ahead : TimeRanges média, sinon buffer MSE reporté par hls.js. */
export function getEngineBufferAhead(
  mediaBuffered: TimeRangesLike | null | undefined,
  position: number,
  hlsInfo?: HlsForwardBufferInfo | null,
): number {
  const fromEl = getBufferAheadSeconds(mediaBuffered, position);
  if (!hlsInfo) return fromEl;
  let fromHls = 0;
  if (Number.isFinite(hlsInfo.len) && (hlsInfo.len as number) > 0) {
    fromHls = hlsInfo.len as number;
  } else if (Number.isFinite(hlsInfo.end as number)) {
    fromHls = Math.max(0, (hlsInfo.end as number) - position);
  }
  return Math.max(fromEl, fromHls);
}

/**
 * Hystérésis de l’overlay buffering : une seule modal jusqu’au buffer de démarrage,
 * puis réaffichage seulement si le buffer retombe vraiment bas.
 */
export function nextBufferingOverlayVisible(
  currentlyVisible: boolean,
  bufferAheadSec: number,
  opts: {
    isLoading: boolean;
    isWaiting: boolean;
    isSeekSettling: boolean;
    isPlaying?: boolean;
  },
  hideSec: number = OVERLAY_HIDE_BUFFER_SEC,
  showSec: number = OVERLAY_SHOW_BUFFER_SEC,
): boolean {
  if (opts.isSeekSettling) return true;
  const ahead = Number.isFinite(bufferAheadSec) ? bufferAheadSec : 0;
  // webOS / HLS natif : `video.buffered` reste souvent vide alors que ça lit.
  // Masquer dès que le média joue, sans exiger de TimeRanges.
  if (opts.isPlaying) return false;
  if (opts.isLoading) return true;
  if (ahead >= hideSec) return false;
  if (opts.isWaiting && ahead <= showSec) return true;
  return currentlyVisible;
}

/**
 * % pour la barre timeline : fin du buffer autour de la tête / durée réelle.
 * Utiliser la durée API/HLS (pas video.duration temporaire post-seek).
 */
export function getBufferedTimelinePercent(
  buffered: TimeRangesLike | null | undefined,
  position: number,
  duration: number,
): number {
  if (!duration || !Number.isFinite(duration) || duration <= 0) return 0;
  const end = getBufferedEndAround(buffered, position);
  if (!end || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.min(100, (end / duration) * 100));
}
