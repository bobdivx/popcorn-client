import type { ScrubThumbnailsMeta } from '../../../../streaming/player-shared/types/scrubThumbnails';

/**
 * Évite d’écraser une bande déjà affichée par un poll intermédiaire (count qui baisse
 * pendant une génération / régén) — même media_id, on ne garde que les progrès ou l’égalité.
 */
export function mergeScrubMeta(
  prev: ScrubThumbnailsMeta | null,
  next: ScrubThumbnailsMeta
): ScrubThumbnailsMeta {
  if (!prev) return next;
  if (prev.mediaId !== next.mediaId) return next;
  if (next.count < prev.count) return prev;
  return next;
}

export function metaFromApiPayload(data: Record<string, unknown>): ScrubThumbnailsMeta | null {
  const mediaId = String(data.media_id ?? '').trim();
  const count = Number(data.count ?? 0);
  const durationSeconds = Number(data.duration_seconds ?? 0);
  const intervalSeconds = Number(data.interval_seconds ?? 0);
  if (!mediaId || !Number.isFinite(count) || count <= 0) return null;
  return {
    mediaId,
    count,
    durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : undefined,
    intervalSeconds: Number.isFinite(intervalSeconds) && intervalSeconds > 0 ? intervalSeconds : undefined,
  };
}
