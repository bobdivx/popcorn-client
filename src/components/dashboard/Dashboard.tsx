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
  const recentAdditions = data?.recentAdditions ?? [];
  const fastTorrents = data?.fastTorrents ?? [];

  const heroItems = useMemo(
    () => {
      const seen = new Set<string>();
      return [...popularMovies, ...popularSeries, ...recentAdditions]
        .filter((item) => {
          if (seen.has(item.id)) return false;
          seen.add(item.id);
          return Boolean(item.poster || item.backdrop);
        })
        .slice(0, 5);
    },
    [popularMovies, popularSeries, recentAdditions]
  );

  const handleNavigate = (item: ContentItem) => {
    window.location.href = `/torrents?slug=${encodeURIComponent(item.id)}&from=dashboard`;
  };

  const sections = useMemo(
    () => [
      { id: 'recentAdditions', title: t('dashboard.recentAdditions'), items: recentAdditions },
      { id: 'popularMovies', title: t('dashboard.syncedMovies'), items: popularMovies },
      { id: 'popularSeries', title: t('dashboard.syncedSeries'), items: popularSeries },
      { id: 'fastTorrents', title: t('dashboard.fastTorrents'), items: fastTorrents },
    ],
    [fastTorrents, popularMovies, popularSeries, recentAdditions, t]
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
