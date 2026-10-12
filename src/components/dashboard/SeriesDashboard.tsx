import { useMemo, useState } from 'preact/hooks';
import { useI18n } from '../../lib/i18n/useI18n';
import type { ContentItem } from '../../lib/client/types';
import { SimpleTmdbPage } from '../page-model/SimpleTmdbPage';
import { useInfiniteSeries } from './hooks/useInfiniteSeries';
import { useResumeWatching } from './hooks/useResumeWatching';
import { useContentSignals } from './hooks/useContentSignals';
import { useLibraryBrowse } from './hooks/useLibraryBrowse';
import { useActiveDownloads } from './hooks/useActiveDownloads';
import { useTmdbHighlights } from './hooks/useTmdbHighlights';
import {
  buildAvailabilityIndex,
  buildSuggestionUrl,
  highlightTitles,
  linkAvailability,
  recentAvailable,
} from './utils/highlights';
import { CatalogGrid } from '../page-model/CatalogGrid';
import { GenreSidebar } from '../page-model/GenreSidebar';
import { translateGenre } from '../../lib/utils/genre-translation';
import {
  pickFeaturedHero,
  filterWatchNow,
  filterByMediaType,
  standaloneDownloads,
  mergeReadyToWatch,
  excludeSeenItems,
  itemInGenre,
  uniqueByMedia,
  byPopularity,
} from './utils/browsePriority';

const SECTION_LIMIT = 48;
const GENRE_CAP = 180;

export default function SeriesDashboard() {
  const { t, language } = useI18n();
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const { series, loading, error } = useInfiniteSeries();
  const highlights = useTmdbHighlights(['on_the_air', 'trending_tv']);
  const titles = useMemo(() => highlightTitles(language), [language]);
  const { resumeWatching, waitingForNext, rewatchWatching } = useResumeWatching();
  const { activeDownloads } = useActiveDownloads();
  const { recentDownloads } = useLibraryBrowse('series');
  const { withSignals: seriesWithSignals } = useContentSignals(series, resumeWatching);
  const seriesDownloads = useMemo(() => filterByMediaType(activeDownloads, 'tv'), [activeDownloads]);

  const seenItems = useMemo(
    () => [...resumeWatching, ...rewatchWatching].filter((item) => item.type === 'tv'),
    [resumeWatching, rewatchWatching]
  );

  /** tmdb → torrent / média local (relie les suggestions TMDB à ce qui est disponible). */
  const availabilityIndex = useMemo(
    () => buildAvailabilityIndex(recentDownloads, seriesWithSignals),
    [recentDownloads, seriesWithSignals]
  );

  const heroItems = useMemo(() => {
    const watchNow = excludeSeenItems(filterWatchNow(seriesWithSignals), seenItems);
    const newestUnwatched = excludeSeenItems(
      [
        ...recentDownloads,
        ...recentAvailable(seriesWithSignals, 12),
        ...linkAvailability(highlights.on_the_air ?? [], availabilityIndex).slice(0, 8),
      ],
      seenItems
    );
    return pickFeaturedHero(watchNow, newestUnwatched);
  }, [seriesWithSignals, highlights, availabilityIndex, recentDownloads, seenItems]);

  const handleNavigate = (item: ContentItem) => {
    window.location.href = buildSuggestionUrl(item, 'series');
  };

  const catalog = useMemo(() => uniqueByMedia(seriesWithSignals), [seriesWithSignals]);
  const genreItems = useMemo(() => {
    if (!selectedGenre) return [];
    return byPopularity(catalog.filter((item) => itemInGenre(item, selectedGenre))).slice(0, GENRE_CAP);
  }, [catalog, selectedGenre]);

  const sections = useMemo(() => {
    const resumeSeries = resumeWatching.filter((item) => item.type === 'tv');
    const waitingSeries = [...waitingForNext.filter((item) => item.type === 'tv')].sort((a, b) =>
      (a.nextEpisodeAirDate ?? '').localeCompare(b.nextEpisodeAirDate ?? '')
    );
    const watchNow = excludeSeenItems(filterWatchNow(seriesWithSignals), seenItems);
    const downloadingNow = standaloneDownloads(seriesDownloads, resumeSeries);
    const latestMerged = mergeReadyToWatch(
      mergeReadyToWatch(downloadingNow, excludeSeenItems(recentDownloads, seenItems)),
      watchNow
    );

    const personal = [
      { id: 'resume-series', title: t('dashboard.resumeWatching'), items: resumeSeries, kind: 'resume' as const, priority: true },
      { id: 'waiting-series', title: t('dashboard.waitingForNext'), items: waitingSeries, kind: 'resume' as const, priority: true },
      { id: 'latest-downloads-series', title: t('dashboard.recentlyDownloaded'), items: latestMerged, priority: true },
    ];

    if (selectedGenre) return [];

    return [
      ...personal,
      // TMDB « du moment » relié aux torrents disponibles, puis torrents récents (≤ 12 mois).
      { id: 'on-the-air-series', title: titles.onTheAir, items: linkAvailability(highlights.on_the_air ?? [], availabilityIndex).slice(0, SECTION_LIMIT) },
      { id: 'trending-series', title: titles.trendingSeries, items: linkAvailability(highlights.trending_tv ?? [], availabilityIndex).slice(0, SECTION_LIMIT) },
      { id: 'recent-series', title: titles.recentAvailable, items: recentAvailable(catalog, SECTION_LIMIT) },
      { id: 'popular-series', title: t('dashboard.popularSeries'), items: byPopularity(catalog).slice(0, SECTION_LIMIT) },
    ];
  }, [
    seriesWithSignals,
    resumeWatching,
    waitingForNext,
    seenItems,
    seriesDownloads,
    recentDownloads,
    catalog,
    selectedGenre,
    highlights,
    availabilityIndex,
    titles,
    t,
  ]);

  return (
    <SimpleTmdbPage
      pageId="series"
      title={t('nav.series')}
      subtitle={t('dashboard.seriesSubtitle')}
      heroItems={heroItems}
      sections={sections}
      loading={loading}
      error={error}
      onNavigate={handleNavigate}
      emptyTitle={t('sync.noSeriesSynced')}
      emptyDescription={t('sync.startSyncSeriesDescription')}
      headerAction={
        <GenreSidebar
          selectedGenre={selectedGenre}
          onSelectGenre={setSelectedGenre}
          language={language === 'en' ? 'en' : 'fr'}
        />
      }
    >
      {selectedGenre ? (
        <CatalogGrid
          title={t('dashboard.seriesGenre', { genre: translateGenre(selectedGenre, language === 'en' ? 'en' : 'fr') })}
          items={genreItems}
          onNavigate={handleNavigate}
        />
      ) : null}
    </SimpleTmdbPage>
  );
}
