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
  const { resumeWatching } = useResumeWatching();
  const popularMovies = data?.popularMovies ?? [];
  const popularSeries = data?.popularSeries ?? [];
  const recentMovies = data?.recentMovies ?? [];
  const recentSeries = data?.recentSeries ?? [];
  const allDashboardItems = useMemo(
    () => [...recentMovies, ...recentSeries, ...popularMovies, ...popularSeries],
    [popularMovies, popularSeries, recentMovies, recentSeries]
  );
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

      return [
        // Reprendre la lecture en 1ère position si l'utilisateur a quelque chose à reprendre.
        { id: 'resume', title: t('dashboard.resumeWatching'), items: resumeWatching, kind: 'resume' as const },
        { id: 'watch-now', title: t('dashboard.watchNowHighlights'), items: watchNowItems },
        { id: 'recentMovies', title: t('nav.films'), items: allDashboardItemsWithSignals.filter((i) => recentMovies.some((r) => r.id === i.id)) },
        { id: 'popularMovies', title: t('dashboard.popularMovies'), items: allDashboardItemsWithSignals.filter((i) => popularMovies.some((r) => r.id === i.id)) },
        { id: 'recentSeries', title: t('nav.series'), items: allDashboardItemsWithSignals.filter((i) => recentSeries.some((r) => r.id === i.id)) },
        { id: 'popularSeries', title: t('dashboard.popularSeries'), items: allDashboardItemsWithSignals.filter((i) => popularSeries.some((r) => r.id === i.id)) },
      ];
    },
    [allDashboardItemsWithSignals, popularMovies, popularSeries, recentMovies, recentSeries, resumeWatching, t]
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
