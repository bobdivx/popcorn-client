import { useState, useEffect, useCallback } from 'preact/hooks';
import { serverApi } from '../../../lib/client/server-api';
import type { SeriesData } from '../../../lib/client/types';
import { useI18n } from '../../../lib/i18n/useI18n';
import { getLibraryDisplayConfig } from '../../../lib/utils/library-display-config';
import { PreferencesManager } from '../../../lib/client/storage';

export function useInfiniteSeries() {
  const { language } = useI18n();
  const [series, setSeries] = useState<SeriesData[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);

  const loadSeries = useCallback(async (pageNum: number, isInitial = false, silent = false, silentRefetchMerge = false) => {
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
      const response = await serverApi.getSeriesDataPaginated(
        pageNum,
        limit,
        language,
        'popular',
        minSeeds,
        prefs.mediaLanguages,
        prefs.minQuality
      );

      if (response.success && response.data) {
        if (!Array.isArray(response.data)) {
          setError('Réponse invalide: liste de séries attendue');
          return;
        }

        const sortedSeries = [...response.data].sort((a, b) => {
          const dateA = a.firstAirDate ? new Date(a.firstAirDate).getTime() : 0;
          const dateB = b.firstAirDate ? new Date(b.firstAirDate).getTime() : 0;
          return dateB - dateA;
        });

        if (silentRefetchMerge) {
          // Refetch silencieux pendant la sync : garder toute la liste déjà chargée, mettre à jour la page 1
          setSeries(prev => {
            const page1Ids = new Set(sortedSeries.map(s => s.id));
            const rest = prev.filter(s => !page1Ids.has(s.id));
            const merged = [...sortedSeries, ...rest];
            merged.sort((a, b) => {
              const dateA = a.firstAirDate ? new Date(a.firstAirDate).getTime() : 0;
              const dateB = b.firstAirDate ? new Date(b.firstAirDate).getTime() : 0;
              return dateB - dateA;
            });
            return merged;
          });
          setHasMore(true);
        } else if (isInitial) {
          setSeries(sortedSeries);
          setHasMore(response.data.length === limit);
        } else {
          setSeries(prev => {
            const existingIds = new Set(prev.map(s => s.id));
            const newSeries = sortedSeries.filter(s => !existingIds.has(s.id));
            return [...prev, ...newSeries];
          });
          setHasMore(response.data.length === limit);
        }
      } else {
        setError(response.message || 'Erreur lors du chargement des séries');
        if (!silentRefetchMerge) setHasMore(false);
      }
    } catch (err) {
      console.error('[INFINITE SERIES] Exception:', err);
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
      if (!silentRefetchMerge) setHasMore(false);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [language]);

  useEffect(() => {
    loadSeries(1, true);
  }, [language]); // Recharger quand la langue change

  const loadMore = useCallback(() => {
    if (!loadingMore && hasMore && !loading) {
      const nextPage = page + 1;
      setPage(nextPage);
      loadSeries(nextPage, false);
    }
  }, [page, loadingMore, hasMore, loading, loadSeries]);

  const refetch = useCallback(() => {
    setPage(1);
    setHasMore(true);
    loadSeries(1, true);
  }, [loadSeries]);

  /** Recharge en arrière-plan sans spinner : merge la page 1 avec la liste existante pour ne pas perdre les torrents déjà chargés. */
  const refetchSilent = useCallback(() => {
    setPage(1);
    loadSeries(1, false, true, true);
  }, [loadSeries]);

  return {
    series,
    loading,
    loadingMore,
    error,
    hasMore,
    loadMore,
    refetch,
    refetchSilent,
  };
}
