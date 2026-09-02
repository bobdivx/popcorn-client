import { useEffect, useMemo, useState } from 'preact/hooks';
import { useI18n } from '../../lib/i18n/useI18n';
import type { ContentItem } from '../../lib/client/types';
import Library from '../Library';
import { LibraryViewToggle, type LibraryViewMode } from '../page-model/LibraryViewToggle';
import { SimpleTmdbPage } from '../page-model/SimpleTmdbPage';
import { useInfiniteSeries } from './hooks/useInfiniteSeries';
import { useResumeWatching } from './hooks/useResumeWatching';
import { useContentSignals } from './hooks/useContentSignals';
import { useFreshSynced } from './hooks/useFreshSynced';
import { buildStrictTmdbDetailUrlFromContentItem } from '../../lib/utils/media-detail-url';
import SuggestionsSection from './SuggestionsSection';
import { useActiveDownloads } from './hooks/useActiveDownloads';
import {
  pickFeaturedHero,
  filterWatchNow,
  filterByMediaType,
  standaloneDownloads,
  excludeSeenItems,
} from './utils/browsePriority';

const SECTION_LIMIT = 25;
const MAX_GENRES = 12;
const MIN_SERIES_PER_GENRE = 4;
const VIEW_STORAGE_KEY = 'popcorn:series-view';

export default function SeriesDashboard() {
  const { t } = useI18n();
  const { series, loading, error } = useInfiniteSeries();
  const { resumeWatching, waitingForNext, rewatchWatching } = useResumeWatching();
  const { activeDownloads } = useActiveDownloads();
  const freshSynced = useFreshSynced('series');
  const [view, setView] = useState<LibraryViewMode>('torrents');
  const { withSignals: seriesWithSignals } = useContentSignals(series, resumeWatching);
  const seriesDownloads = useMemo(() => filterByMediaType(activeDownloads, 'tv'), [activeDownloads]);
  const { withSignals: freshWithSignals } = useContentSignals(freshSynced, resumeWatching);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
    if (stored === 'library' || stored === 'torrents') setView(stored);
  }, []);

  const handleChangeView = (next: LibraryViewMode) => {
    setView(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(VIEW_STORAGE_KEY, next);
    }
  };

  const seenItems = useMemo(
    () => [...resumeWatching, ...rewatchWatching].filter((item) => item.type === 'tv'),
    [resumeWatching, rewatchWatching]
  );

  const heroItems = useMemo(() => {
    const watchNow = excludeSeenItems(filterWatchNow(seriesWithSignals), seenItems);
    const newestUnwatched = excludeSeenItems(
      [...seriesWithSignals.slice(0, SECTION_LIMIT), ...freshWithSignals],
      seenItems
    );
    return pickFeaturedHero(watchNow, newestUnwatched);
  }, [seriesWithSignals, freshWithSignals, seenItems]);

  const handleNavigate = (item: ContentItem) => {
    window.location.href = buildStrictTmdbDetailUrlFromContentItem(item, 'dashboard');
  };

  const sections = useMemo(() => {
    const newest = seriesWithSignals.slice(0, SECTION_LIMIT);

    const popular = [...seriesWithSignals]
      .sort((a, b) => (b.seeds ?? 0) - (a.seeds ?? 0))
      .slice(0, SECTION_LIMIT);

    const resumeSeries = resumeWatching.filter((item) => item.type === 'tv');
    const rewatchSeries = rewatchWatching.filter((item) => item.type === 'tv');
    const waitingSeries = waitingForNext.filter((item) => item.type === 'tv');
    const watchNow = excludeSeenItems(filterWatchNow(seriesWithSignals), seenItems);
    const downloadingNow = standaloneDownloads(seriesDownloads, resumeSeries);

    const genreMap = new Map<string, ContentItem[]>();
    for (const tv of seriesWithSignals) {
      if (!Array.isArray(tv.genres)) continue;
      for (const genre of tv.genres) {
        if (!genre) continue;
        if (!genreMap.has(genre)) genreMap.set(genre, []);
        genreMap.get(genre)!.push(tv);
      }
    }
    const genreSections = Array.from(genreMap.entries())
      .filter(([, items]) => items.length >= MIN_SERIES_PER_GENRE)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, MAX_GENRES)
      .map(([genre, items]) => ({
        id: `genre-${genre}`,
        title: t('dashboard.seriesGenre', { genre }),
        items: items.slice(0, SECTION_LIMIT),
      }));

    return [
      { id: 'resume-series', title: t('dashboard.resumeWatching'), items: resumeSeries, kind: 'resume' as const, priority: true },
      { id: 'rewatch-series', title: t('dashboard.rewatch'), items: rewatchSeries, kind: 'resume' as const, priority: true },
      { id: 'active-downloads-series', title: t('dashboard.activeDownloads'), items: downloadingNow, priority: true },
      { id: 'recently-downloaded-series', title: t('dashboard.recentlyDownloaded'), items: watchNow, priority: true },
      {
        id: 'waiting-series',
        title: t('dashboard.waitingForNext'),
        items: [...waitingSeries].sort((a, b) => {
          const da = a.nextEpisodeAirDate ?? '';
          const db = b.nextEpisodeAirDate ?? '';
          return da.localeCompare(db);
        }),
        kind: 'resume' as const,
        priority: true,
      },
      { id: 'recent-series', title: t('dashboard.newReleasesSeries'), items: newest },
      { id: 'fresh-series', title: t('dashboard.freshlySyncedSeries'), items: freshWithSignals.slice(0, SECTION_LIMIT) },
      { id: 'popular-series', title: t('dashboard.popularSeries'), items: popular },
      ...genreSections,
    ];
  }, [seriesWithSignals, freshWithSignals, resumeWatching, rewatchWatching, waitingForNext, seenItems, seriesDownloads, t]);

  const toggle = (
    <LibraryViewToggle mode={view} onChange={handleChangeView} contentType="series" />
  );

  if (view === 'library') {
    return (
      <div className="min-h-screen bg-black text-white relative" data-page="series-library">
        <div className="px-3 sm:px-4 md:px-6 lg:px-8 xl:px-12 tv:px-16">
          <Library showHero showFilters={false} initialContentFilter="series" headerAction={toggle} />
        </div>
      </div>
    );
  }

  return (
    <SimpleTmdbPage
      pageId="series"
      title={t('nav.series')}
      heroItems={heroItems}
      sections={sections}
      loading={loading}
      error={error}
      onNavigate={handleNavigate}
      emptyTitle={t('sync.noSeriesSynced')}
      emptyDescription={t('sync.startSyncSeriesDescription')}
      headerAction={toggle}
    >
      <SuggestionsSection contextType="series" />
    </SimpleTmdbPage>
  );
}
