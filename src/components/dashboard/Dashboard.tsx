import { useMemo } from 'preact/hooks';
import { useI18n } from '../../lib/i18n/useI18n';
import type { ContentItem } from '../../lib/client/types';
import { SimpleTmdbPage } from '../page-model/SimpleTmdbPage';
import { useDashboardData } from './hooks/useDashboardData';

export default function Dashboard() {
  const { t } = useI18n();
  const { data, loading, error } = useDashboardData();
  const popularMovies = data?.popularMovies ?? [];
  const popularSeries = data?.popularSeries ?? [];
  const recentMovies = data?.recentMovies ?? [];
  const recentSeries = data?.recentSeries ?? [];

  const heroItems = useMemo(
    () => {
      const seen = new Set<string>();
      return [...recentMovies, ...recentSeries, ...popularMovies, ...popularSeries]
        .filter((item) => {
          if (seen.has(item.id)) return false;
          seen.add(item.id);
          return Boolean(item.poster || item.backdrop);
        })
        .slice(0, 5);
    },
    [popularMovies, popularSeries, recentMovies, recentSeries]
  );

  const handleNavigate = (item: ContentItem) => {
    window.location.href = `/torrents?slug=${encodeURIComponent(item.id)}&from=dashboard`;
  };

  const sections = useMemo(
    () => [
      { id: 'recentMovies', title: t('nav.films'), items: recentMovies },
      { id: 'popularMovies', title: t('dashboard.popularMovies'), items: popularMovies },
      { id: 'recentSeries', title: t('nav.series'), items: recentSeries },
      { id: 'popularSeries', title: t('dashboard.popularSeries'), items: popularSeries },
    ],
    [popularMovies, popularSeries, recentMovies, recentSeries, t]
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
