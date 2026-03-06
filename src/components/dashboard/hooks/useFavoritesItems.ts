import { useState, useEffect } from 'preact/hooks';
import { serverApi } from '../../../lib/client/server-api';
import type { ContentItem } from '../../../lib/client/types';

const FAVORITES_LIMIT = 20;

/**
 * Convertit une réponse groupe API (getTorrentGroupByTmdbId) en ContentItem
 */
function groupToContentItem(
  raw: { slug?: string; main_title?: string; variants?: Array<{ poster_url?: string; hero_image_url?: string; tmdb_id?: number; tmdb_type?: string }> },
  tmdbType: string
): ContentItem {
  const id = raw?.slug || '';
  const type: 'movie' | 'tv' = tmdbType === 'tv' ? 'tv' : 'movie';
  const title = raw?.main_title || '';
  const firstVariant = Array.isArray(raw?.variants) ? raw.variants[0] : undefined;
  const poster = firstVariant?.poster_url || undefined;
  const backdrop = firstVariant?.hero_image_url || undefined;
  const tmdbId = firstVariant?.tmdb_id ?? undefined;
  return {
    id,
    title,
    type,
    poster,
    backdrop,
    tmdbId: tmdbId ?? null,
  };
}

/**
 * Charge les favoris et pour chacun récupère le groupe par tmdb_id pour afficher les ContentItem sur le dashboard.
 */
export function useFavoritesItems() {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const res = await serverApi.listMediaFavorites({ limit: FAVORITES_LIMIT });
        if (cancelled || !res.success || !Array.isArray(res.data)) {
          setItems([]);
          setLoading(false);
          return;
        }
        const favorites = res.data;
        const results: ContentItem[] = [];
        for (const fav of favorites) {
          try {
            const groupRes = await serverApi.getTorrentGroupByTmdbId(fav.tmdb_id);
            if (cancelled) break;
            if (groupRes.success && groupRes.data) {
              const item = groupToContentItem(groupRes.data as any, fav.tmdb_type);
              if (item.id) results.push(item);
            }
          } catch {
            // ignorer les erreurs par favori (média pas encore sync, etc.)
          }
        }
        if (!cancelled) setItems(results);
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  return { items, loading };
}
