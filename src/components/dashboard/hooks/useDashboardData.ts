import { useState, useEffect, useCallback } from 'preact/hooks';
import { serverApi } from '../../../lib/client/server-api';
import type { DashboardData } from '../../../lib/client/types';
import { useI18n } from '../../../lib/i18n/useI18n';
import { getLibraryDisplayConfig } from '../../../lib/utils/library-display-config';

export function useDashboardData() {
  const { language } = useI18n();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (silent = false) => {
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

      // Phase 1 : films + séries populaires
      const phase1 = await serverApi.getDashboardDataPhase1(language, opts);
      if (!phase1.success || !phase1.data) {
        setError(phase1.message || 'Erreur lors du chargement des données');
        return;
      }

      // Phase 2 : ajouts récents + torrents rapides (même requête, pas de setData intermédiaire)
      const popularMovieIds = phase1.data.popularMovies?.map((m) => m.id) ?? [];
      const popularSeriesIds = phase1.data.popularSeries?.map((s) => s.id) ?? [];
      const phase2 = await serverApi.getDashboardDataPhase2(language, {
        ...opts,
        popularMovieIds,
        popularSeriesIds,
      });

      // Un seul setData avec toutes les données → affichage en une fois, sans scintillement
      const merged: DashboardData = {
        ...phase1.data,
        recentAdditions: phase2.success && phase2.data ? phase2.data.recentAdditions : phase1.data.recentAdditions,
        fastTorrents: phase2.success && phase2.data ? phase2.data.fastTorrents : phase1.data.fastTorrents,
      };
      setData(merged);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, [language]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const reload = useCallback(() => loadData(false), [loadData]);
  const reloadSilent = useCallback(() => loadData(true), [loadData]);

  return {
    data,
    loading,
    error,
    reload,
    /** Recharge en arrière-plan sans spinner : les nouveaux contenus apparaissent au fur et à mesure. */
    reloadSilent,
  };
}
