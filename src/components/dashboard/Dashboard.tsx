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
import { pickHeroItems, filterWatchNow, standaloneDownloads } from './utils/browsePriority';

function getDashboardItemKey(item: ContentItem): string {
  if (typeof item.tmdbId === 'number') return `${item.type}:${item.tmdbId}`;
  if (item.id) return `id:${item.id}`;
  if (item.infoHash) return `infoHash:${item.infoHash}`;
  return `fallback:${item.title}:${item.type}`;
}

function dedupeDashboardItems(items: ContentItem[]): ContentItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = getDashboardItemKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default function Dashboard() {
  const { t } = useI18n();
  const { data, loading: dataLoading, error } = useDashboardData();
  const { activeDownloads, loading: downloadsLoading } = useActiveDownloads();
  const { inProgress, seriesInProgress } = useResumeWatching();
  const loading = dataLoading && downloadsLoading;
  
  const popularMovies = data?.popularMovies ?? [];
  const popularSeries = data?.popularSeries ?? [];
  const recentMovies = data?.recentMovies ?? [];
  const recentSeries = data?.recentSeries ?? [];
  const allDashboardItems = useMemo(
    () => dedupeDashboardItems([...recentMovies, ...recentSeries, ...popularMovies, ...popularSeries, ...activeDownloads]),
    [popularMovies, popularSeries, recentMovies, recentSeries, activeDownloads]
  );
  // On utilise resumeWatching pour les signaux, mais on pourrait utiliser inProgress + seriesInProgress pour être plus large.
  // Cependant, useContentSignals a besoin de la liste complète pour savoir quoi enrichir.
  const { resumeWatching } = useResumeWatching();
  const { withSignals: allDashboardItemsWithSignals } = useContentSignals(allDashboardItems, resumeWatching);

  const heroItems = useMemo(
    () =>
      pickHeroItems(
        [...resumeWatching, ...filterWatchNow(allDashboardItemsWithSignals), ...activeDownloads],
        allDashboardItemsWithSignals
      ),
    [allDashboardItemsWithSignals, resumeWatching, activeDownloads]
  );

  const handleNavigate = (item: ContentItem) => {
    window.location.href = buildStrictTmdbDetailUrlFromContentItem(item, 'dashboard');
  };

  const sections = useMemo(
    () => {
      // 1. Enrichir ResumeWatching avec les infos de téléchargement
      const enrichedResumeWatching = resumeWatching.map(item => {
        const active = activeDownloads.find(ad => 
          (ad.tmdbId != null && item.tmdbId != null && ad.tmdbId === item.tmdbId && ad.type === item.type) || 
          (ad.infoHash && item.infoHash && ad.infoHash === item.infoHash)
        );
        if (active) {
          return {
            ...item,
            isDownloading: true,
            downloadProgress: active.progress,
            downloadSpeed: active.downloadSpeed
          };
        }
        return item;
      });

      const watchNowItems = filterWatchNow(allDashboardItemsWithSignals);
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

      // Reste des sections classiques
      result.push(
        { id: 'recentMovies', title: t('nav.films'), items: allDashboardItemsWithSignals.filter((i) => recentMovies.some((r) => r.id === i.id)) },
        { id: 'popularMovies', title: t('dashboard.popularMovies'), items: allDashboardItemsWithSignals.filter((i) => popularMovies.some((r) => r.id === i.id)) },
        { id: 'recentSeries', title: t('nav.series'), items: allDashboardItemsWithSignals.filter((i) => recentSeries.some((r) => r.id === i.id)) },
        { id: 'popularSeries', title: t('dashboard.popularSeries'), items: allDashboardItemsWithSignals.filter((i) => popularSeries.some((r) => r.id === i.id)) }
      );

      return result;
    },
    [allDashboardItemsWithSignals, activeDownloads, resumeWatching, popularMovies, popularSeries, recentMovies, recentSeries, t]
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
    >
      <SuggestionsSection contextType="all" />
    </SimpleTmdbPage>
  );
}
