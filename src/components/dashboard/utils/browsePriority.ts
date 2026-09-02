import type { ContentItem } from '../../../lib/client/types';

export function contentItemKey(item: ContentItem): string {
  if (typeof item.tmdbId === 'number') return `${item.type}:${item.tmdbId}`;
  if (item.id) return `id:${item.id}`;
  if (item.infoHash) return `infoHash:${item.infoHash}`;
  return `fallback:${item.title}:${item.type}`;
}

export function pickHeroItems(preferred: ContentItem[], fallback: ContentItem[] = [], limit = 5): ContentItem[] {
  const seen = new Set<string>();
  const out: ContentItem[] = [];
  for (const item of [...preferred, ...fallback]) {
    if (!item.poster && !item.backdrop) continue;
    const key = contentItemKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Hero catalogue : téléchargés non vus / prêts, puis sorties récentes non vues.
 * N'inclut ni « Reprendre » ni « À revoir ».
 */
export function pickFeaturedHero(
  watchNow: ContentItem[],
  newestUnwatched: ContentItem[] = [],
  limit = 5
): ContentItem[] {
  return pickHeroItems(watchNow, newestUnwatched, limit);
}

/** Retire les titres déjà en Reprendre / À revoir (ou toute liste « vu / en cours »). */
export function excludeSeenItems(items: ContentItem[], seen: ContentItem[]): ContentItem[] {
  if (seen.length === 0) return items;
  const keys = new Set(seen.map(contentItemKey));
  return items.filter((item) => !keys.has(contentItemKey(item)));
}

export function filterWatchNow(items: ContentItem[], limit = 25): ContentItem[] {
  return items
    .filter((item) => item.heroSignal?.downloadedUnseen || item.heroSignal?.requestDownloaded)
    .slice(0, limit);
}

export function filterByMediaType<T extends { type?: string }>(items: T[], type: 'movie' | 'tv'): T[] {
  return items.filter((item) => item.type === type);
}

export function matchesResume(download: ContentItem, resume: ContentItem): boolean {
  if (download.tmdbId != null && resume.tmdbId != null && download.tmdbId === resume.tmdbId && download.type === resume.type) {
    return true;
  }
  if (download.infoHash && resume.infoHash && download.infoHash === resume.infoHash) {
    return true;
  }
  return false;
}

export function standaloneDownloads(activeDownloads: ContentItem[], resumeWatching: ContentItem[]): ContentItem[] {
  return activeDownloads.filter((ad) => !resumeWatching.some((rw) => matchesResume(ad, rw)));
}
