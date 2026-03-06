import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import { serverApi } from '../../../lib/client/server-api';
import type { FilmData } from '../../../lib/client/types';
import { useI18n } from '../../../lib/i18n/useI18n';
import { getLibraryDisplayConfig } from '../../../lib/utils/library-display-config';

const BACKGROUND_PAGE_DELAY_MS = 80;

export function useInfiniteFilms() {
  const { language } = useI18n();
  const [films, setFilms] = useState<FilmData[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);

  const nextPageToLoadRef = useRef(2);
  const loadingInProgressRef = useRef(false);
  const backgroundRunningRef = useRef(false);

  const loadFilms = useCallback(
    async (
      pageNum: number,
      isInitial = false,
      silent = false,
      silentRefetchMerge = false
    ): Promise<{ fullPage?: boolean } | void> => {
      if (loadingInProgressRef.current) return;
      loadingInProgressRef.current = true;

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
        const limit =
          isInitial || silentRefetchMerge
            ? prefs.torrentsInitialLimit
            : prefs.torrentsLoadMoreLimit;
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

          const sortedFilms = response.data;
          const fullPage = sortedFilms.length === limit;

          if (silentRefetchMerge) {
            setFilms((prev) => {
              const page1Ids = new Set(sortedFilms.map((f) => f.id));
              const rest = prev.filter((f) => !page1Ids.has(f.id));
              const merged = [...sortedFilms, ...rest];
              merged.sort((a, b) => {
                const dateA = a.releaseDate ? new Date(a.releaseDate).getTime() : 0;
                const dateB = b.releaseDate ? new Date(b.releaseDate).getTime() : 0;
                return dateB - dateA;
              });
              return merged;
            });
            setHasMore(true);
            return;
          }

          if (isInitial) {
            setFilms(sortedFilms);
            setHasMore(fullPage);
            setPage(1);
            nextPageToLoadRef.current = 2;

            // Charger toutes les pages suivantes en arrière-plan jusqu'à épuisement (tous les torrents synchronisés)
            if (fullPage && !backgroundRunningRef.current) {
              backgroundRunningRef.current = true;
              (async () => {
                const prefs2 = getLibraryDisplayConfig();
                const limit2 = prefs2.torrentsInitialLimit;
                const minSeeds2 = prefs2.showZeroSeedTorrents ? 0 : 1;
                while (true) {
                  const nextPage = nextPageToLoadRef.current;
                  await new Promise((r) => setTimeout(r, BACKGROUND_PAGE_DELAY_MS));
                  const res = await serverApi.getFilmsDataPaginated(
                    nextPage,
                    limit2,
                    language,
                    'release_date',
                    minSeeds2,
                    prefs2.mediaLanguages,
                    prefs2.minQuality
                  );
                  if (!res.success || !Array.isArray(res.data)) break;
                  const newFilms = res.data;
                  const isFullPage = newFilms.length === limit2;
                  nextPageToLoadRef.current = nextPage + 1;
                  setFilms((prev) => {
                    const existingIds = new Set(prev.map((f) => f.id));
                    const toAdd = newFilms.filter((f) => !existingIds.has(f.id));
                    const merged = [...prev, ...toAdd];
                    merged.sort((a, b) => {
                      const dateA = a.releaseDate ? new Date(a.releaseDate).getTime() : 0;
                      const dateB = b.releaseDate ? new Date(b.releaseDate).getTime() : 0;
                      return dateB - dateA;
                    });
                    return merged;
                  });
                  setPage(nextPage);
                  setHasMore(isFullPage);
                  if (!isFullPage) break;
                }
                backgroundRunningRef.current = false;
              })();
            }
            return;
          }

          // Chargement d'une page suivante (scroll ou autre)
          nextPageToLoadRef.current = pageNum + 1;
          setFilms((prev) => {
            const existingIds = new Set(prev.map((f) => f.id));
            const newFilms = sortedFilms.filter((f) => !existingIds.has(f.id));
            const merged = [...prev, ...newFilms];
            merged.sort((a, b) => {
              const dateA = a.releaseDate ? new Date(a.releaseDate).getTime() : 0;
              const dateB = b.releaseDate ? new Date(b.releaseDate).getTime() : 0;
              return dateB - dateA;
            });
            return merged;
          });
          setPage(pageNum);
          setHasMore(fullPage);
          return { fullPage };
        } else {
          setError(response.message || 'Erreur lors du chargement des films');
          if (!silentRefetchMerge) setHasMore(false);
        }
      } catch (err) {
        console.error('[INFINITE FILMS] Exception:', err);
        setError(err instanceof Error ? err.message : 'Erreur inconnue');
        if (!silentRefetchMerge) setHasMore(false);
      } finally {
        loadingInProgressRef.current = false;
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [language]
  );

  useEffect(() => {
    loadFilms(1, true);
  }, [language]);

  useEffect(() => {
    const handler = () => {
      setFilms([]);
      setPage(1);
      setHasMore(true);
      nextPageToLoadRef.current = 2;
      backgroundRunningRef.current = false;
      loadFilms(1, true);
    };
    window.addEventListener('popcorn:torrents-cleared', handler);
    return () => window.removeEventListener('popcorn:torrents-cleared', handler);
  }, [loadFilms]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore || loading) return;
    const nextPage = nextPageToLoadRef.current;
    loadFilms(nextPage, false);
  }, [loadingMore, hasMore, loading, loadFilms]);

  const refetch = useCallback(() => {
    setPage(1);
    setHasMore(true);
    nextPageToLoadRef.current = 2;
    backgroundRunningRef.current = false;
    loadFilms(1, true);
  }, [loadFilms]);

  const clearAndRefetch = useCallback(() => {
    setFilms([]);
    setPage(1);
    setHasMore(true);
    nextPageToLoadRef.current = 2;
    backgroundRunningRef.current = false;
    loadFilms(1, true);
  }, [loadFilms]);

  const refetchSilent = useCallback(() => {
    setPage(1);
    nextPageToLoadRef.current = 2;
    loadFilms(1, false, true, true);
  }, [loadFilms]);

  const refetchReplaceSilent = useCallback(() => {
    setPage(1);
    setHasMore(true);
    nextPageToLoadRef.current = 2;
    backgroundRunningRef.current = false;
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
