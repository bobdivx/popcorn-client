import { useMemo } from 'preact/hooks';
import { useI18n } from '../../lib/i18n/useI18n';
import type { ContentItem } from '../../lib/client/types';
import { SimpleTmdbPage } from '../page-model/SimpleTmdbPage';
import { useInfiniteSeries } from './hooks/useInfiniteSeries';

export default function SeriesDashboard() {
  const { t } = useI18n();
  const { series, loading, error } = useInfiniteSeries();

  const heroItems = useMemo(
    () => series.slice(0, 5).filter((item) => item.poster || item.backdrop),
    [series]
  );

  const handleNavigate = (item: ContentItem) => {
    window.location.href = `/torrents?slug=${encodeURIComponent(item.id)}&from=dashboard`;
  };

  const sections = useMemo(
    () => [
      { id: 'synced-series', title: t('sync.allSeries'), items: series },
    ],
    [series, t]
  );

  return (
    <SimpleTmdbPage
      pageId="series"
      title={t('nav.series')}
      subtitle={t('discover.pageSubtitle')}
      heroItems={heroItems}
      sections={sections}
      loading={loading}
      error={error}
      onNavigate={handleNavigate}
      emptyTitle={t('sync.noSeriesSynced')}
      emptyDescription={t('sync.startSyncSeriesDescription')}
    />
  );
}
