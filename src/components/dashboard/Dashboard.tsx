import { useMemo } from 'preact/hooks';
import { useI18n } from '../../lib/i18n/useI18n';
import type { ContentItem } from '../../lib/client/types';
import { SimpleTmdbPage } from '../page-model/SimpleTmdbPage';
import { useDashboardData } from './hooks/useDashboardData';
import { useResumeWatching } from './hooks/useResumeWatching';
import { useContentSignals } from './hooks/useContentSignals';
import { useActiveDownloads } from './hooks/useActiveDownloads';
import { buildStrictTmdbDetailUrlFromContentItem } from '../../lib/utils/media-detail-url';
import SuggestionsSection from './SuggestionsSection';
import {
  pickFeaturedHero,
  filterWatchNow,
  standaloneDownloads,
  excludeSeenItems,
  contentItemKey,
} from './utils/browsePriority';

function dedupeDashboardItems(items: ContentItem[]): ContentItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = contentItemKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default function Dashboard() {
  const { t } = useI18n();
  const { data, loading: dataLoading, error } = useDashboardData();
  const { activeDownloads, loading: downloadsLoading } = useActiveDownloads();
  const { resumeWatching, rewatchWatching } = useResumeWatching();
  const loading = dataLoading && downloadsLoading;

  const popularMovies = data?.popularMovies ?? [];
  const popularSeries = data?.popularSeries ?? [];
  const recentMovies = data?.recentMovies ?? [];
  const recentSeries = data?.recentSeries ?? [];
  const freshMovies = data?.freshMovies ?? [];
  const freshSeries = data?.freshSeries ?? [];

  const allDashboardItems = useMemo(
    () =>
      dedupeDashboardItems([
        ...recentMovies,
        ...recentSeries,
        ...freshMovies,
        ...freshSeries,
        ...popularMovies,
        ...popularSeries,
        ...activeDownloads,
      ]),
    [popularMovies, popularSeries, recentMovies, recentSeries, freshMovies, freshSeries, activeDownloads]
  );

  const { withSignals: allDashboardItemsWithSignals } = useContentSignals(allDashboardItems, resumeWatching);

  const seenItems = useMemo(
    () => [...resumeWatching, ...rewatchWatching],
    [resumeWatching, rewatchWatching]
  );

  const heroItems = useMemo(() => {
    const watchNow = excludeSeenItems(filterWatchNow(allDashboardItemsWithSignals), seenItems);
    const newestUnwatched = excludeSeenItems(
      [...recentMovies, ...recentSeries, ...freshMovies, ...freshSeries],
      seenItems
    );
    return pickFeaturedHero(watchNow, newestUnwatched);
  }, [allDashboardItemsWithSignals, seenItems, recentMovies, recentSeries, freshMovies, freshSeries]);

  const handleNavigate = (item: ContentItem) => {
    window.location.href = buildStrictTmdbDetailUrlFromContentItem(item, 'dashboard');
  };

  const sections = useMemo(() => {
    const enrichedResumeWatching = resumeWatching.map((item) => {
      const active = activeDownloads.find(
        (ad) =>
          (ad.tmdbId != null && item.tmdbId != null && ad.tmdbId === item.tmdbId && ad.type === item.type) ||
          (ad.infoHash && item.infoHash && ad.infoHash === item.infoHash)
      );
      if (active) {
        return {
          ...item,
          isDownloading: true,
          downloadProgress: active.progress,
          downloadSpeed: active.downloadSpeed,
        };
      }
      return item;
    });

    const watchNowItems = excludeSeenItems(filterWatchNow(allDashboardItemsWithSignals), seenItems);
    const downloadingNow = standaloneDownloads(activeDownloads, resumeWatching);

    const result = [];

    if (enrichedResumeWatching.length > 0) {
      result.push({
        id: 'resume-watching',
        title: t('dashboard.resumeWatching') || 'Reprendre la lecture',
        items: enrichedResumeWatching,
        kind: 'resume' as const,
        priority: true,
      });
    }

    if (rewatchWatching.length > 0) {
      result.push({
        id: 'rewatch-watching',
        title: t('dashboard.rewatch'),
        items: rewatchWatching,
        kind: 'resume' as const,
        priority: true,
      });
    }

    if (downloadingNow.length > 0) {
      result.push({
        id: 'active-downloads',
        title: t('dashboard.activeDownloads'),
        items: downloadingNow,
        priority: true,
      });
    }

    if (watchNowItems.length > 0) {
      result.push({
        id: 'recently-downloaded',
        title: t('dashboard.recentlyDownloaded'),
        items: watchNowItems,
        priority: true,
      });
    }

    const freshMoviesWithSignals = allDashboardItemsWithSignals.filter((i) =>
      freshMovies.some((r) => r.id === i.id)
    );
    const freshSeriesWithSignals = allDashboardItemsWithSignals.filter((i) =>
      freshSeries.some((r) => r.id === i.id)
    );

    result.push(
      {
        id: 'recentMovies',
        title: t('dashboard.newReleasesMovies'),
        items: allDashboardItemsWithSignals.filter((i) => recentMovies.some((r) => r.id === i.id)),
      },
      {
        id: 'freshMovies',
        title: t('dashboard.freshlySyncedMovies'),
        items: freshMoviesWithSignals,
      },
      {
        id: 'popularMovies',
        title: t('dashboard.popularMovies'),
        items: allDashboardItemsWithSignals.filter((i) => popularMovies.some((r) => r.id === i.id)),
      },
      {
        id: 'recentSeries',
        title: t('dashboard.newReleasesSeries'),
        items: allDashboardItemsWithSignals.filter((i) => recentSeries.some((r) => r.id === i.id)),
      },
      {
        id: 'freshSeries',
        title: t('dashboard.freshlySyncedSeries'),
        items: freshSeriesWithSignals,
      },
      {
        id: 'popularSeries',
        title: t('dashboard.popularSeries'),
        items: allDashboardItemsWithSignals.filter((i) => popularSeries.some((r) => r.id === i.id)),
      }
    );

    return result;
  }, [
    allDashboardItemsWithSignals,
    activeDownloads,
    resumeWatching,
    rewatchWatching,
    seenItems,
    popularMovies,
    popularSeries,
    recentMovies,
    recentSeries,
    freshMovies,
    freshSeries,
    t,
  ]);

  return (
    <SimpleTmdbPage
      pageId="dashboard"
      title=""
      heroItems={heroItems}
      sections={sections}
      loading={loading}
      error={error}
      onNavigate={handleNavigate}
      emptyTitle={t('sync.noTorrentsSynced')}
      emptyDescription={t('sync.startSyncAllDescription')}
    >
      <SuggestionsSection contextType="all" />
    </SimpleTmdbPage>
  );
}
