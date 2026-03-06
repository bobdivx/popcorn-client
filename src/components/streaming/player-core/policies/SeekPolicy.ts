/**
 * Politique de seek : quand autoriser le reload backend avec seek= vs seek natif uniquement.
 */

export interface SeekPolicy {
  /** Si false, seul le seek natif (video.currentTime) est utilisé (local_, UNC, ami). */
  canUseSeekReload: boolean;
}

export const DEFAULT_SEEK_POLICY: SeekPolicy = {
  canUseSeekReload: true,
};
