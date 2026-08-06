/**
 * Politique de seek : quand autoriser le reload backend avec seek= vs seek natif uniquement.
 */

import {
  MIN_BUFFER_AFTER_SEEK_REMOTE_SEC,
  MIN_BUFFER_AFTER_SEEK_SEC,
} from '../../player-shared/utils/bufferMetrics';

export interface SeekPolicy {
  /** Si false, seul le seek natif (video.currentTime) est utilisé (local_, UNC, ami). */
  canUseSeekReload: boolean;
}

export const DEFAULT_SEEK_POLICY: SeekPolicy = {
  canUseSeekReload: true,
};

/** Jump (s) au-delà duquel on force un reload playlist plutôt qu’un seek MSE. */
export const SEEK_RELOAD_LARGE_JUMP_SEC = 60;

/** Marge (s) hors fenêtre bufferée avant reload. */
export const SEEK_RELOAD_BUFFER_MARGIN_SEC = 2;

/** Buffer end minimum (s) avant d’utiliser la détection « hors fenêtre ». */
export const SEEK_RELOAD_MIN_BUFFERED_END_SEC = 20;

export function minBufferAfterSeekSec(isRemoteStream: boolean): number {
  return isRemoteStream ? MIN_BUFFER_AFTER_SEEK_REMOTE_SEC : MIN_BUFFER_AFTER_SEEK_SEC;
}
