import type { ScrubThumbnailsMeta } from '../../types/scrubThumbnails';

export function scrubEffectiveDuration(
  duration: number,
  scrub: Pick<ScrubThumbnailsMeta, 'durationSeconds'> | null | undefined
): number {
  return duration > 0 ? duration : (scrub?.durationSeconds ?? 0);
}

export function scrubBaseUrl(serverUrl: string, mediaId: string): string {
  return `${serverUrl}/api/library/scrub-thumbnails/${encodeURIComponent(mediaId)}`;
}

/** URL d’une vignette ; `rev` évite le cache navigateur après régén (même chemin, fichiers remplacés). */
export function scrubUrlForIndex(
  baseUrl: string,
  count: number,
  idx: number,
  mediaId: string
): string {
  const safe = Math.min(count - 1, Math.max(0, Math.floor(idx)));
  const rev = encodeURIComponent(`${mediaId}:${count}`);
  return `${baseUrl}/${safe}?v=${rev}`;
}

export function scrubTimeForIndex(
  idx: number,
  meta: Pick<ScrubThumbnailsMeta, 'count' | 'intervalSeconds'>,
  effectiveDuration: number
): number {
  const count = meta.count;
  const safe = Math.min(count - 1, Math.max(0, Math.floor(idx)));
  const interval = meta.intervalSeconds;
  if (interval != null && Number.isFinite(interval) && interval > 0) {
    return Math.min(effectiveDuration, safe * interval);
  }
  if (count <= 0 || effectiveDuration <= 0) return 0;
  return ((safe + 0.5) / count) * effectiveDuration;
}

export function scrubIndexFromTimelinePercent(
  percent: number,
  effectiveDuration: number,
  meta: Pick<ScrubThumbnailsMeta, 'count' | 'intervalSeconds'>
): number {
  const count = meta.count;
  const p = Math.min(100, Math.max(0, percent));
  const t = (p / 100) * effectiveDuration;
  const interval = meta.intervalSeconds;
  if (interval != null && Number.isFinite(interval) && interval > 0) {
    return Math.min(count - 1, Math.max(0, Math.floor(t / interval)));
  }
  if (effectiveDuration <= 0) return 0;
  return Math.min(count - 1, Math.max(0, Math.floor((t / effectiveDuration) * count)));
}

/**
 * Fenêtre glissante autour de la vignette sélectionnée : peu de tuiles larges, sans scrollbar
 * (le nombre total de captures reste `count` côté serveur ; on navigue barre / clavier / clic).
 */
export function scrubVisibleWindow(
  count: number,
  selectedIndex: number,
  isTV: boolean,
  isFullscreen: boolean
): { start: number; end: number } {
  if (count <= 0) return { start: 0, end: -1 };
  const windowSize = Math.min(count, isTV ? 7 : isFullscreen ? 9 : 7);
  const half = Math.floor(windowSize / 2);
  const start = Math.max(0, Math.min(count - windowSize, selectedIndex - half));
  const end = Math.min(count - 1, start + windowSize - 1);
  return { start, end };
}
