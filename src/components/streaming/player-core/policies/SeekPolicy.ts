/**
 * Politique de seek : quand autoriser le reload backend avec seek= vs seek natif uniquement.
 */

import {
  MIN_BUFFER_AFTER_SEEK_REMOTE_SEC,
  MIN_BUFFER_AFTER_SEEK_SEC,
  isTimeInBuffered,
  type TimeRangesLike,
} from '../../player-shared/utils/bufferMetrics';

export interface SeekPolicy {
  /** Si false, seul le seek natif (video.currentTime) est utilisé (local_, UNC, ami). */
  canUseSeekReload: boolean;
}

export const DEFAULT_SEEK_POLICY: SeekPolicy = {
  canUseSeekReload: true,
};

/** @deprecated Conservé pour compat ; le reload hors buffer ne dépend plus d’un jump min. */
export const SEEK_RELOAD_LARGE_JUMP_SEC = 60;

/** Marge (s) hors fenêtre bufferée avant reload. */
export const SEEK_RELOAD_BUFFER_MARGIN_SEC = 2;

/** @deprecated Conservé pour compat ; tout hors-buffer déclenche un reload. */
export const SEEK_RELOAD_MIN_BUFFERED_END_SEC = 20;

export function minBufferAfterSeekSec(isRemoteStream: boolean): number {
  return isRemoteStream ? MIN_BUFFER_AFTER_SEEK_REMOTE_SEC : MIN_BUFFER_AFTER_SEEK_SEC;
}

/**
 * True → régénérer la playlist HLS à `targetSec` (déplacer le buffer).
 * False → seek MSE natif dans la fenêtre déjà bufferée.
 */
export function shouldReloadSeekForTarget(opts: {
  targetSec: number;
  buffered: TimeRangesLike | null | undefined;
  mediaDuration: number;
  marginSec?: number;
}): boolean {
  const { targetSec, buffered, mediaDuration } = opts;
  const margin = opts.marginSec ?? SEEK_RELOAD_BUFFER_MARGIN_SEC;
  if (!Number.isFinite(targetSec) || targetSec <= 0) return false;
  const beyondGeneratedPlaylist =
    mediaDuration > 0 && Number.isFinite(mediaDuration) && targetSec > mediaDuration + 0.5;
  if (beyondGeneratedPlaylist) return true;
  return !isTimeInBuffered(buffered, targetSec, margin);
}
