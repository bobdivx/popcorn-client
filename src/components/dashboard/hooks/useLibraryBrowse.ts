import { useEffect, useMemo, useState } from 'preact/hooks';
import { serverApi } from '../../../lib/client/server-api';
import type { ContentItem } from '../../../lib/client/types';
import type { LibraryMedia } from '../../Library';
import {
  contentItemKey,
  filterRecentDownloads,
  recentDownloadKeys,
} from '../utils/browsePriority';

export type LibraryBrowseFilter = 'movies' | 'series' | 'all';

function parseGenres(genres: string | null): string[] {
  if (!genres || !genres.trim()) return [];
  const trimmed = genres.trim();
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed.map((g: unknown) => String(g)) : [];
    } catch {
      return [];
    }
  }
  return trimmed.split(',').map((g) => g.trim()).filter(Boolean);
}

function isMovie(item: LibraryMedia): boolean {
  return item.category === 'FILM' || item.tmdb_type === 'movie';
}

function isSeries(item: LibraryMedia): boolean {
  return (
    item.category === 'SERIES' ||
    item.tmdb_type === 'tv' ||
    item.tmdb_type === 'series'
  );
}

/** Convertit une entrée GET /library en ContentItem (cartes dashboard). */
export function libraryMediaToContentItem(item: LibraryMedia): ContentItem {
  const type: 'movie' | 'tv' = isSeries(item) ? 'tv' : 'movie';
  return {
    id: item.info_hash || item.slug || item.name,
    title: item.name,
    type,
    poster: item.poster_url || undefined,
    backdrop: item.hero_image_url || undefined,
    overview: item.synopsis || undefined,
    rating: item.vote_average ?? undefined,
    releaseDate: item.release_date ?? undefined,
    tmdbId: item.tmdb_id ?? undefined,
    infoHash: item.info_hash || undefined,
    genres: parseGenres(item.genres),
    availableInLibrary: item.exists,
    isDownloading: !item.exists,
    addedAt: typeof item.added_at === 'number' ? item.added_at : undefined,
  };
}

function matchesFilter(item: LibraryMedia, filter: LibraryBrowseFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'movies') return isMovie(item);
  return isSeries(item);
}

/**
 * Charge la bibliothèque et expose les téléchargements récents (≤7j)
 * pour les pages Films / Séries unifiées.
 */
export function useLibraryBrowse(contentFilter: LibraryBrowseFilter = 'all') {
  const [rawItems, setRawItems] = useState<LibraryMedia[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await serverApi.getLibrary();
        if (cancelled) return;
        if (res.success && Array.isArray(res.data)) {
          setRawItems(res.data as unknown as LibraryMedia[]);
        } else {
          setRawItems([]);
        }
      } catch {
        if (!cancelled) setRawItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const libraryItems = useMemo(() => {
    const filtered = rawItems.filter((item) => matchesFilter(item, contentFilter));
    const seen = new Set<string>();
    const out: ContentItem[] = [];
    for (const raw of filtered) {
      const item = libraryMediaToContentItem(raw);
      const key = contentItemKey(item);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
    return out;
  }, [rawItems, contentFilter]);

  const recentDownloads = useMemo(
    () => filterRecentDownloads(libraryItems),
    [libraryItems]
  );

  const recentKeys = useMemo(
    () => recentDownloadKeys(recentDownloads),
    [recentDownloads]
  );

  return {
    libraryItems,
    recentDownloads,
    recentKeys,
    loading,
  };
}
