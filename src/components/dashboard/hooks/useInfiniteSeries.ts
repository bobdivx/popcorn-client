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

  const loadSeries = useCallback(async (pageNum: number, isInitial = false, silent = false) => {
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

        if (isInitial) {
          setSeries(sortedSeries);
        } else {
          setSeries(prev => {
            // Éviter les doublons
            const existingIds = new Set(prev.map(s => s.id));
            const newSeries = sortedSeries.filter(s => !existingIds.has(s.id));
            return [...prev, ...newSeries];
          });
        }

        // Si on reçoit moins d'éléments que demandé, il n'y a plus de données
        setHasMore(response.data.length === limit);
      } else {
        setError(response.message || 'Erreur lors du chargement des séries');
        setHasMore(false);
      }
    } catch (err) {
      console.error('[INFINITE SERIES] Exception:', err);
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
      setHasMore(false);
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

  /** Recharge en arrière-plan sans spinner : les nouveaux torrents apparaissent au fur et à mesure. */
  const refetchSilent = useCallback(() => {
    setPage(1);
    setHasMore(true);
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
    refetchSilent,
  };
}
