import type { ScrubThumbnailsMeta } from '../../types/scrubThumbnails';

/** Durée pour mapper les vignettes : la plus longue connue (film, meta, couverture réelle). */
export function scrubEffectiveDuration(
  duration: number,
  scrub: Pick<ScrubThumbnailsMeta, 'durationSeconds' | 'count' | 'intervalSeconds'> | null | undefined,
): number {
  const video = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const meta =
    scrub?.durationSeconds && Number.isFinite(scrub.durationSeconds) && scrub.durationSeconds > 0
      ? scrub.durationSeconds
      : 0;
  const covered =
    scrub &&
    scrub.count > 0 &&
    scrub.intervalSeconds != null &&
    Number.isFinite(scrub.intervalSeconds) &&
    scrub.intervalSeconds > 0
      ? scrub.count * scrub.intervalSeconds
      : 0;
  return Math.max(video, meta, covered);
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
    const t = safe * interval;
    if (effectiveDuration > 0) return Math.min(effectiveDuration, t);
    return t;
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
 * Fenêtre glissante autour de la vignette sélectionnée.
 * Mobile : peu de tuiles mais plus grandes (UX type Netflix).
 */
export function scrubWindowSize(
  count: number,
  isTV: boolean,
  isFullscreen: boolean,
  isMobile = false,
): number {
  if (count <= 0) return 0;
  if (isTV) return Math.min(count, 7);
  if (isMobile) return Math.min(count, isFullscreen ? 5 : 3);
  return Math.min(count, isFullscreen ? 11 : 9);
}

export function scrubVisibleWindow(
  count: number,
  selectedIndex: number,
  isTV: boolean,
  isFullscreen: boolean,
  isMobile = false,
): { start: number; end: number } {
  if (count <= 0) return { start: 0, end: -1 };
  const windowSize = scrubWindowSize(count, isTV, isFullscreen, isMobile);
  const half = Math.floor(windowSize / 2);
  const start = Math.max(0, Math.min(count - windowSize, selectedIndex - half));
  const end = Math.min(count - 1, start + windowSize - 1);
  return { start, end };
}
