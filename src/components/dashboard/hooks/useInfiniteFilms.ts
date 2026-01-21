import { useState, useEffect, useCallback } from 'preact/hooks';
import { serverApi } from '../../../lib/client/server-api';
import type { FilmData } from '../../../lib/client/types';

const INITIAL_LIMIT = 30;
const LOAD_MORE_LIMIT = 30;

export function useInfiniteFilms() {
  const [films, setFilms] = useState<FilmData[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);

  const loadFilms = useCallback(async (pageNum: number, isInitial = false) => {
    try {
      if (isInitial) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      setError(null);

      // Appel avec pagination
      const limit = isInitial ? INITIAL_LIMIT : LOAD_MORE_LIMIT;
      const response = await serverApi.getFilmsDataPaginated(pageNum, limit);

      if (response.success && response.data) {
        if (!Array.isArray(response.data)) {
          setError('Réponse invalide: liste de films attendue');
          return;
        }

        // Les données sont déjà triées par l'API, mais on peut les trier à nouveau pour être sûr
        const sortedFilms = [...response.data].sort((a, b) => {
          const dateA = a.releaseDate ? new Date(a.releaseDate).getTime() : 0;
          const dateB = b.releaseDate ? new Date(b.releaseDate).getTime() : 0;
          return dateB - dateA;
        });

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
  }, []);

  useEffect(() => {
    loadFilms(1, true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = useCallback(() => {
    if (!loadingMore && hasMore && !loading) {
      const nextPage = page + 1;
      setPage(nextPage);
      loadFilms(nextPage, false);
    }
  }, [page, loadingMore, hasMore, loading, loadFilms]);

  return {
    films,
    loading,
    loadingMore,
    error,
    hasMore,
    loadMore,
  };
}
