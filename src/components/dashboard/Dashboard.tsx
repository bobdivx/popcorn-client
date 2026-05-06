import { useMemo } from 'preact/hooks';
import { useI18n } from '../../lib/i18n/useI18n';
import type { ContentItem } from '../../lib/client/types';
import { SimpleTmdbPage } from '../page-model/SimpleTmdbPage';
import { useDashboardData } from './hooks/useDashboardData';
import { useResumeWatching } from './hooks/useResumeWatching';
import { useContentSignals } from './hooks/useContentSignals';

export default function Dashboard() {
  const { t } = useI18n();
  const { data, loading, error } = useDashboardData();
  const { inProgress, seriesInProgress } = useResumeWatching();
  const popularMovies = data?.popularMovies ?? [];
  const popularSeries = data?.popularSeries ?? [];
  const recentMovies = data?.recentMovies ?? [];
  const recentSeries = data?.recentSeries ?? [];
  const allDashboardItems = useMemo(
    () => [...recentMovies, ...recentSeries, ...popularMovies, ...popularSeries],
    [popularMovies, popularSeries, recentMovies, recentSeries]
  );
  // On utilise resumeWatching pour les signaux, mais on pourrait utiliser inProgress + seriesInProgress pour être plus large.
  // Cependant, useContentSignals a besoin de la liste complète pour savoir quoi enrichir.
  const { resumeWatching } = useResumeWatching();
  const { withSignals: allDashboardItemsWithSignals } = useContentSignals(allDashboardItems, resumeWatching);

  const heroItems = useMemo(
    () => {
      const seen = new Set<string>();
      return allDashboardItemsWithSignals
        .filter((item) => {
          if (seen.has(item.id)) return false;
          seen.add(item.id);
          return Boolean(item.poster || item.backdrop);
        })
        .slice(0, 5);
    },
    [allDashboardItemsWithSignals]
  );

  const handleNavigate = (item: ContentItem) => {
    window.location.href = `/torrents?slug=${encodeURIComponent(item.id)}&from=dashboard`;
  };

  const sections = useMemo(
    () => {
      const watchNowItems = allDashboardItemsWithSignals
        .filter((item) => item.heroSignal?.downloadedUnseen || item.heroSignal?.requestDownloaded)
        .slice(0, 25);

      const result = [];

      // 1. Téléchargés récemment
      if (watchNowItems.length > 0) {
        result.push({ id: 'recently-downloaded', title: t('dashboard.recentlyDownloaded'), items: watchNowItems });
      }

      // 2. Reprendre la lecture (films ou épisodes en cours)
      if (inProgress.length > 0) {
        result.push({ id: 'resume-in-progress', title: t('dashboard.resumeWatching'), items: inProgress, kind: 'resume' as const });
      }

      // 3. Séries en cours (suivi des épisodes)
      if (seriesInProgress.length > 0) {
        result.push({ id: 'ongoing-series', title: t('dashboard.ongoingSeries'), items: seriesInProgress, kind: 'resume' as const });
      }

      // Reste des sections classiques
      result.push(
        { id: 'recentMovies', title: t('nav.films'), items: allDashboardItemsWithSignals.filter((i) => recentMovies.some((r) => r.id === i.id)) },
        { id: 'popularMovies', title: t('dashboard.popularMovies'), items: allDashboardItemsWithSignals.filter((i) => popularMovies.some((r) => r.id === i.id)) },
        { id: 'recentSeries', title: t('nav.series'), items: allDashboardItemsWithSignals.filter((i) => recentSeries.some((r) => r.id === i.id)) },
        { id: 'popularSeries', title: t('dashboard.popularSeries'), items: allDashboardItemsWithSignals.filter((i) => popularSeries.some((r) => r.id === i.id)) }
      );

      return result;
    },
    [allDashboardItemsWithSignals, popularMovies, popularSeries, recentMovies, recentSeries, inProgress, seriesInProgress, t]
  );

  return (
    <SimpleTmdbPage
      pageId="dashboard"
      title={t('nav.dashboard')}
      subtitle={t('dashboard.syncedSubtitle')}
      heroItems={heroItems}
      sections={sections}
      loading={loading}
      error={error}
      onNavigate={handleNavigate}
      emptyTitle={t('sync.noTorrentsSynced')}
      emptyDescription={t('sync.startSyncAllDescription')}
    />
  );
}
