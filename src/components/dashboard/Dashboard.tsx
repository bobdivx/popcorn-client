import { useEffect, useMemo, useState } from 'preact/hooks';
import { useI18n } from '../../lib/i18n/useI18n';
import type { ContentItem } from '../../lib/client/types';
import { serverApi } from '../../lib/client/server-api';
import { aiReady, useAiEnabled } from '../../lib/ai/prefs';
import { SimpleTmdbPage } from '../page-model/SimpleTmdbPage';
import { useDashboardData } from './hooks/useDashboardData';
import { useResumeWatching } from './hooks/useResumeWatching';
import { useContentSignals } from './hooks/useContentSignals';
import { useActiveDownloads } from './hooks/useActiveDownloads';
import { useLibraryBrowse } from './hooks/useLibraryBrowse';
import { buildStrictTmdbDetailUrlFromContentItem } from '../../lib/utils/media-detail-url';
import {
  pickFeaturedHero,
  filterWatchNow,
  standaloneDownloads,
  mergeReadyToWatch,
  excludeSeenItems,
  contentItemKey,
  uniqueByMedia,
  byReleaseDate,
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
  const { t, language } = useI18n();
  const aiEnabled = useAiEnabled();
  const { data, loading: dataLoading, error } = useDashboardData();
  const { activeDownloads, loading: downloadsLoading } = useActiveDownloads();
  const { resumeWatching, rewatchWatching } = useResumeWatching();
  const { recentDownloads } = useLibraryBrowse('all');
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
        ...recentDownloads,
      ]),
    [
      popularMovies,
      popularSeries,
      recentMovies,
      recentSeries,
      freshMovies,
      freshSeries,
      activeDownloads,
      recentDownloads,
    ]
  );

  const { withSignals: allDashboardItemsWithSignals } = useContentSignals(allDashboardItems, resumeWatching);

  // Exclure Reprenez + contenus terminés (ex-À revoir) de « Prêts à regarder »
  const seenItems = useMemo(
    () => [...resumeWatching, ...rewatchWatching],
    [resumeWatching, rewatchWatching]
  );

  const heroItems = useMemo(() => {
    const watchNow = excludeSeenItems(filterWatchNow(allDashboardItemsWithSignals), seenItems);
    const newestUnwatched = excludeSeenItems(
      [...recentDownloads, ...recentMovies, ...recentSeries, ...freshMovies, ...freshSeries],
      seenItems
    );
    return pickFeaturedHero(watchNow, newestUnwatched);
  }, [
    allDashboardItemsWithSignals,
    seenItems,
    recentDownloads,
    recentMovies,
    recentSeries,
    freshMovies,
    freshSeries,
  ]);

  const handleNavigate = (item: ContentItem) => {
    window.location.href = buildStrictTmdbDetailUrlFromContentItem(item, 'dashboard');
  };

  const tonightPool = useMemo(
    () => uniqueByMedia([...recentDownloads, ...recentMovies, ...recentSeries]).slice(0, 20),
    [recentDownloads, recentMovies, recentSeries],
  );
  const [tonightItems, setTonightItems] = useState<ContentItem[]>([]);

  useEffect(() => {
    if (!aiEnabled || tonightPool.length === 0) {
      setTonightItems([]);
      return;
    }
    let cancelled = false;
    aiReady().then(async (ready) => {
      if (!ready || cancelled) return;
      const res = await serverApi.aiTonight({
        locale: language === 'en' ? 'en' : 'fr',
        items: tonightPool.map((item) => ({
          id: item.id,
          title: item.tmdbTitle || item.title,
          type: item.type,
          seeds: item.seeds || 0,
          in_library: true,
        })),
      });
      if (cancelled || !res.success || !res.data?.ids?.length) return;
      const picked = res.data.ids
        .map((id) => tonightPool.find((item) => item.id === id))
        .filter((item): item is ContentItem => !!item);
      setTonightItems(picked);
    });
    return () => {
      cancelled = true;
    };
  }, [aiEnabled, language, tonightPool]);

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
    const readyToWatch = mergeReadyToWatch(
      excludeSeenItems(recentDownloads, seenItems),
      watchNowItems
    ).filter((item) => !downloadingNow.some((dl) => contentItemKey(dl) === contentItemKey(item)));

    const result = [];

    if (tonightItems.length > 0) {
      result.push({
        id: 'tonight',
        title: t('ai.tonightTitle'),
        items: tonightItems,
        priority: true,
      });
    }

    if (downloadingNow.length > 0) {
      result.push({
        id: 'active-downloads',
        title: t('dashboard.activeDownloads'),
        items: downloadingNow,
        kind: 'downloads' as const,
        priority: true,
      });
    }

    if (enrichedResumeWatching.length > 0) {
      result.push({
        id: 'resume-watching',
        title: t('dashboard.resumeWatching') || 'Reprendre la lecture',
        items: enrichedResumeWatching,
        kind: 'resume' as const,
        priority: true,
      });
    }

    if (readyToWatch.length > 0) {
      result.push({
        id: 'recently-downloaded',
        title: t('dashboard.recentlyDownloaded'),
        items: readyToWatch,
        priority: true,
      });
    }

    const cinemaRecent = byReleaseDate(uniqueByMedia([...recentMovies, ...recentSeries])).slice(0, 40);
    if (cinemaRecent.length > 0) {
      result.push({
        id: 'cinema-recent',
        title: t('dashboard.cinemaRecent'),
        items: cinemaRecent,
      });
    }

    const mostDownloaded = uniqueByMedia([...popularMovies, ...popularSeries])
      .sort((a, b) => (b.seeds ?? 0) - (a.seeds ?? 0))
      .slice(0, 40);
    if (mostDownloaded.length > 0) {
      result.push({
        id: 'most-downloaded',
        title: t('dashboard.mostDownloaded'),
        items: mostDownloaded,
      });
    }

    return result;
  }, [
    allDashboardItemsWithSignals,
    activeDownloads,
    resumeWatching,
    recentDownloads,
    seenItems,
    recentMovies,
    recentSeries,
    popularMovies,
    popularSeries,
    tonightItems,
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
    />
  );
}
