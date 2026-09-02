/**
 * Seuil « visionnage terminé » (générique inclus), en % 0–100.
 * Aligné sur markEpisodeWatched (~92 %) : beaucoup d'utilisateurs quittent avant 99 %.
 */
export const REWATCH_PROGRESS_THRESHOLD = 90;

/** True si la progression (ou position/durée) indique une fin de visionnage. */
export function isResumeFinished(item: {
  progress?: number | null;
  positionSeconds?: number | null;
  durationSeconds?: number | null;
}): boolean {
  const progress = typeof item.progress === 'number' ? item.progress : 0;
  if (progress >= REWATCH_PROGRESS_THRESHOLD) return true;
  const pos = item.positionSeconds;
  const dur = item.durationSeconds;
  if (typeof pos === 'number' && typeof dur === 'number' && dur > 0) {
    return (pos / dur) * 100 >= REWATCH_PROGRESS_THRESHOLD;
  }
  return false;
}
