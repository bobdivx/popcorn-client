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
