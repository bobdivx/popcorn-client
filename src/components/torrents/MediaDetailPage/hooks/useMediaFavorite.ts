import { useState, useEffect, useCallback } from 'preact/hooks';
import { serverApi } from '../../../../lib/client/server-api';

export interface UseMediaFavoriteOptions {
  tmdbId: number | null | undefined;
  tmdbType: string | null | undefined; // "movie" | "tv"
  category?: string; // "films" | "series" — déduit de tmdbType si absent
}

export interface UseMediaFavoriteResult {
  isFavorite: boolean;
  loading: boolean;
  toggle: () => Promise<void>;
  error: string | null;
}

/**
 * Hook pour gérer l’état "à regarder plus tard" d’un média sur la page détail.
 * Utilise le backend (X-User-ID) et peut être synchronisé avec le cloud.
 */
export function useMediaFavorite({
  tmdbId,
  tmdbType,
  category,
}: UseMediaFavoriteOptions): UseMediaFavoriteResult {
  const [isFavorite, setIsFavorite] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const effectiveCategory = category ?? (tmdbType === 'tv' ? 'series' : 'films');
  const typeNorm = tmdbType === 'tv' ? 'tv' : 'movie';

  const fetchCheck = useCallback(async () => {
    if (tmdbId == null || !tmdbType) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await serverApi.checkMediaFavorite(tmdbId, typeNorm);
      if (res.success && res.data) {
        setIsFavorite(res.data.is_favorite);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }, [tmdbId, tmdbType, typeNorm]);

  useEffect(() => {
    void fetchCheck();
  }, [fetchCheck]);

  const toggle = useCallback(async () => {
    if (tmdbId == null || !tmdbType) return;
    setError(null);
    try {
      if (isFavorite) {
        const res = await serverApi.removeMediaFavorite(tmdbId, typeNorm);
        if (res.success) setIsFavorite(false);
        else setError(res.message ?? 'Erreur');
      } else {
        const res = await serverApi.addMediaFavorite({
          tmdb_id: tmdbId,
          tmdb_type: typeNorm,
          category: effectiveCategory,
        });
        if (res.success) setIsFavorite(true);
        else setError(res.message ?? 'Erreur');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    }
  }, [tmdbId, tmdbType, typeNorm, effectiveCategory, isFavorite]);

  return { isFavorite, loading, toggle, error };
}
