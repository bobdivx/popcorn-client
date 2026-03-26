import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import { serverApi } from '../../../lib/client/server-api';
import type { SeriesData } from '../../../lib/client/types';
import { useI18n } from '../../../lib/i18n/useI18n';
import { getLibraryDisplayConfig } from '../../../lib/utils/library-display-config';

const BACKGROUND_PAGE_DELAY_MS = 80;

function sortByDate(data: SeriesData[]) {
  return [...data].sort((a, b) => {
    const completeDiff = Number(Boolean(b.isCompletePack)) - Number(Boolean(a.isCompletePack));
    if (completeDiff !== 0) return completeDiff;
    const dateA = a.firstAirDate ? new Date(a.firstAirDate).getTime() : 0;
    const dateB = b.firstAirDate ? new Date(b.firstAirDate).getTime() : 0;
    return dateB - dateA;
  });
}

export function useInfiniteSeries() {
  const { language } = useI18n();
  const [series, setSeries] = useState<SeriesData[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);

  const nextPageToLoadRef = useRef(2);
  const loadingInProgressRef = useRef(false);
  const backgroundRunningRef = useRef(false);

  const loadSeries = useCallback(
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
        const response = await serverApi.getSeriesDataPaginated(
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
            setError('Réponse invalide: liste de séries attendue');
            return;
          }

          const sortedSeries = sortByDate(response.data);
          const fullPage = sortedSeries.length === limit;

          if (silentRefetchMerge) {
            setSeries((prev) => {
              const page1Ids = new Set(sortedSeries.map((s) => s.id));
              const rest = prev.filter((s) => !page1Ids.has(s.id));
              const merged = sortByDate([...sortedSeries, ...rest]);
              return merged;
            });
            setHasMore(true);
            return;
          }

          if (isInitial) {
            setSeries(sortedSeries);
            setHasMore(fullPage);
            setPage(1);
            nextPageToLoadRef.current = 2;

            // Charger toutes les pages en arrière-plan jusqu'à épuisement (tous les torrents synchronisés)
            if (fullPage && !backgroundRunningRef.current) {
              backgroundRunningRef.current = true;
              (async () => {
                const prefs2 = getLibraryDisplayConfig();
                const limit2 = prefs2.torrentsInitialLimit;
                const minSeeds2 = prefs2.showZeroSeedTorrents ? 0 : 1;
                while (true) {
                  const nextPage = nextPageToLoadRef.current;
                  await new Promise((r) => setTimeout(r, BACKGROUND_PAGE_DELAY_MS));
                  const res = await serverApi.getSeriesDataPaginated(
                    nextPage,
                    limit2,
                    language,
                    'release_date',
                    minSeeds2,
                    prefs2.mediaLanguages,
                    prefs2.minQuality
                  );
                  if (!res.success || !Array.isArray(res.data)) break;
                  const newSeries = sortByDate(res.data);
                  const isFullPage = newSeries.length === limit2;
                  nextPageToLoadRef.current = nextPage + 1;
                  setSeries((prev) => {
                    const existingIds = new Set(prev.map((s) => s.id));
                    const toAdd = newSeries.filter((s) => !existingIds.has(s.id));
                    return sortByDate([...prev, ...toAdd]);
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

          nextPageToLoadRef.current = pageNum + 1;
          setSeries((prev) => {
            const existingIds = new Set(prev.map((s) => s.id));
            const newItems = sortedSeries.filter((s) => !existingIds.has(s.id));
            return sortByDate([...prev, ...newItems]);
          });
          setPage(pageNum);
          setHasMore(fullPage);
          return { fullPage };
        } else {
          setError(response.message || 'Erreur lors du chargement des séries');
          if (!silentRefetchMerge) setHasMore(false);
        }
      } catch (err) {
        console.error('[INFINITE SERIES] Exception:', err);
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
    loadSeries(1, true);
  }, [language]);

  useEffect(() => {
    const handler = () => {
      setSeries([]);
      setPage(1);
      setHasMore(true);
      nextPageToLoadRef.current = 2;
      backgroundRunningRef.current = false;
      loadSeries(1, true);
    };
    window.addEventListener('popcorn:torrents-cleared', handler);
    return () => window.removeEventListener('popcorn:torrents-cleared', handler);
  }, [loadSeries]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore || loading) return;
    const nextPage = nextPageToLoadRef.current;
    loadSeries(nextPage, false);
  }, [loadingMore, hasMore, loading, loadSeries]);

  const refetch = useCallback(() => {
    setPage(1);
    setHasMore(true);
    nextPageToLoadRef.current = 2;
    backgroundRunningRef.current = false;
    loadSeries(1, true);
  }, [loadSeries]);

  const clearAndRefetch = useCallback(() => {
    setSeries([]);
    setPage(1);
    setHasMore(true);
    nextPageToLoadRef.current = 2;
    backgroundRunningRef.current = false;
    loadSeries(1, true);
  }, [loadSeries]);

  const refetchSilent = useCallback(() => {
    setPage(1);
    nextPageToLoadRef.current = 2;
    loadSeries(1, false, true, true);
  }, [loadSeries]);

  const refetchReplaceSilent = useCallback(() => {
    setPage(1);
    setHasMore(true);
    nextPageToLoadRef.current = 2;
    backgroundRunningRef.current = false;
    loadSeries(1, true, true);
  }, [loadSeries]);

  return {
    series,
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
