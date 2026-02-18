import { useState, useEffect, useCallback } from 'preact/hooks';
import { serverApi } from '../../../lib/client/server-api';
import type { FilmData } from '../../../lib/client/types';
import { useI18n } from '../../../lib/i18n/useI18n';
import { getLibraryDisplayConfig } from '../../../lib/utils/library-display-config';

export function useInfiniteFilms() {
  const { language } = useI18n();
  const [films, setFilms] = useState<FilmData[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);

  const loadFilms = useCallback(async (pageNum: number, isInitial = false, silent = false) => {
    try {
      if (!silent) {
        if (isInitial) {
          setLoading(true);
        } else {
          setLoadingMore(true);
        }
      }
      setError(null);

      const prefs = getLibraryDisplayConfig();
      const limit = isInitial ? prefs.torrentsInitialLimit : prefs.torrentsLoadMoreLimit;
      const minSeeds = prefs.showZeroSeedTorrents ? 0 : 1;
      const response = await serverApi.getFilmsDataPaginated(
        pageNum,
        limit,
        language,
        'release_date',
        minSeeds,
        prefs.mediaLanguages,
        prefs.minQuality
      );

      if (response.success && response.data) {
        if (!Array.isArray(response.data)) {
          setError('Réponse invalide: liste de films attendue');
          return;
        }

        // Déjà triés par date de sortie (release_date) côté API
        const sortedFilms = response.data;

        if (isInitial) {
          setFilms(sortedFilms);
        } else {
          setFilms(prev => {
            // Éviter les doublons
            const existingIds = new Set(prev.map(f => f.id));
            const newFilms = sortedFilms.filter(f => !existingIds.has(f.id));
            return [...prev, ...newFilms];
          });
        }

        // Si on reçoit moins d'éléments que demandé, il n'y a plus de données
        setHasMore(response.data.length === limit);
      } else {
        setError(response.message || 'Erreur lors du chargement des films');
        setHasMore(false);
      }
    } catch (err) {
      console.error('[INFINITE FILMS] Exception:', err);
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
      setHasMore(false);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [language]);

  useEffect(() => {
    loadFilms(1, true);
  }, [language]); // Recharger quand la langue change

  const loadMore = useCallback(() => {
    if (!loadingMore && hasMore && !loading) {
      const nextPage = page + 1;
      setPage(nextPage);
      loadFilms(nextPage, false);
    }
  }, [page, loadingMore, hasMore, loading, loadFilms]);

  const refetch = useCallback(() => {
    setPage(1);
    setHasMore(true);
    loadFilms(1, true);
  }, [loadFilms]);

  /** Recharge en arrière-plan sans spinner : les nouveaux torrents apparaissent au fur et à mesure. */
  const refetchSilent = useCallback(() => {
    setPage(1);
    setHasMore(true);
    loadFilms(1, true, true);
  }, [loadFilms]);

  return {
    films,
    loading,
    loadingMore,
    error,
    hasMore,
    loadMore,
    refetch,
    refetchSilent,
  };
}
