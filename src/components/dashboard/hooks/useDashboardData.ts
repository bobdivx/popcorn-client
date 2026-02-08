import { useState, useEffect } from 'preact/hooks';
import { serverApi } from '../../../lib/client/server-api';
import type { DashboardData } from '../../../lib/client/types';
import { useI18n } from '../../../lib/i18n/useI18n';
import { getLibraryDisplayConfig } from '../../../lib/utils/library-display-config';

export function useDashboardData() {
  const { language } = useI18n();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [language]);

  const loadData = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setError(null);
      const prefs = getLibraryDisplayConfig();
      const opts = {
        minSeeds: prefs.showZeroSeedTorrents ? 0 : 1,
        popularLimit: 20,
        recentLimit: prefs.torrentsRecentLimit,
        mediaLanguages: prefs.mediaLanguages,
        minQuality: prefs.minQuality,
      };

      // Phase 1 (prioritaire) : films + séries populaires → affichage immédiat
      const phase1 = await serverApi.getDashboardDataPhase1(language, opts);
      if (!phase1.success || !phase1.data) {
        setError(phase1.message || 'Erreur lors du chargement des données');
        return;
      }
      setData(phase1.data);
      setLoading(false);

      // Phase 2 (secondaire) : ajouts récents + torrents rapides → chargement en arrière-plan
      const popularMovieIds = phase1.data.popularMovies?.map((m) => m.id) ?? [];
      const popularSeriesIds = phase1.data.popularSeries?.map((s) => s.id) ?? [];
      const phase2 = await serverApi.getDashboardDataPhase2(language, {
        ...opts,
        popularMovieIds,
        popularSeriesIds,
      });
      if (phase2.success && phase2.data) {
        setData((prev) =>
          prev
            ? {
                ...prev,
                recentAdditions: phase2.data!.recentAdditions,
                fastTorrents: phase2.data!.fastTorrents,
              }
            : prev
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  };

  return {
    data,
    loading,
    error,
    reload: () => loadData(false),
    /** Recharge en arrière-plan sans spinner : les nouveaux contenus apparaissent au fur et à mesure. */
    reloadSilent: () => loadData(true),
  };
}
