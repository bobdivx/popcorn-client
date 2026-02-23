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

  const loadFilms = useCallback(async (pageNum: number, isInitial = false, silent = false, silentRefetchMerge = false) => {
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
      const limit = (isInitial || silentRefetchMerge) ? prefs.torrentsInitialLimit : prefs.torrentsLoadMoreLimit;
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

        if (silentRefetchMerge) {
          // Refetch silencieux pendant la sync : garder toute la liste déjà chargée, mettre à jour la page 1
          setFilms(prev => {
            const page1Ids = new Set(sortedFilms.map(f => f.id));
            const rest = prev.filter(f => !page1Ids.has(f.id));
            const merged = [...sortedFilms, ...rest];
            merged.sort((a, b) => {
              const dateA = a.releaseDate ? new Date(a.releaseDate).getTime() : 0;
              const dateB = b.releaseDate ? new Date(b.releaseDate).getTime() : 0;
              return dateB - dateA;
            });
            return merged;
          });
          setHasMore(true);
        } else if (isInitial) {
          setFilms(sortedFilms);
          setHasMore(response.data.length === limit);
        } else {
          setFilms(prev => {
            const existingIds = new Set(prev.map(f => f.id));
            const newFilms = sortedFilms.filter(f => !existingIds.has(f.id));
            return [...prev, ...newFilms];
          });
          setHasMore(response.data.length === limit);
        }
      } else {
        setError(response.message || 'Erreur lors du chargement des films');
        if (!silentRefetchMerge) setHasMore(false);
      }
    } catch (err) {
      console.error('[INFINITE FILMS] Exception:', err);
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
      if (!silentRefetchMerge) setHasMore(false);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [language]);

  useEffect(() => {
    loadFilms(1, true);
  }, [language]); // Recharger quand la langue change

  // Après "vider les torrents" : vider l'affichage et recharger (cache navigateur désactivé pour /api/torrents/list)
  useEffect(() => {
    const handler = () => {
      setFilms([]);
      setPage(1);
      setHasMore(true);
      loadFilms(1, true);
    };
    window.addEventListener('popcorn:torrents-cleared', handler);
    return () => window.removeEventListener('popcorn:torrents-cleared', handler);
  }, [loadFilms]);

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

  /** Vide la liste immédiatement puis recharge (pour "vider les torrents" : affichage à jour tout de suite). */
  const clearAndRefetch = useCallback(() => {
    setFilms([]);
    setPage(1);
    setHasMore(true);
    loadFilms(1, true);
  }, [loadFilms]);

  /** Recharge en arrière-plan sans spinner : merge la page 1 avec la liste existante pour ne pas perdre les torrents déjà chargés. */
  const refetchSilent = useCallback(() => {
    setPage(1);
    loadFilms(1, false, true, true);
  }, [loadFilms]);

  /** Recharge depuis le backend et remplace la liste (sans spinner). À appeler à chaque affichage de la page pour rester aligné avec le backend. */
  const refetchReplaceSilent = useCallback(() => {
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
    clearAndRefetch,
    refetchSilent,
    refetchReplaceSilent,
  };
}
