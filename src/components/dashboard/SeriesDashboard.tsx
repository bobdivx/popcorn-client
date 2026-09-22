import { useMemo, useState } from 'preact/hooks';
import { useI18n } from '../../lib/i18n/useI18n';
import type { ContentItem } from '../../lib/client/types';
import { SimpleTmdbPage } from '../page-model/SimpleTmdbPage';
import { useInfiniteSeries } from './hooks/useInfiniteSeries';
import { useResumeWatching } from './hooks/useResumeWatching';
import { useContentSignals } from './hooks/useContentSignals';
import { useFreshSynced } from './hooks/useFreshSynced';
import { useLibraryBrowse } from './hooks/useLibraryBrowse';
import { buildStrictTmdbDetailUrlFromContentItem } from '../../lib/utils/media-detail-url';
import { useActiveDownloads } from './hooks/useActiveDownloads';
import { GenreCardsRow } from './components/GenreCardsRow';
import { CatalogGrid } from '../page-model/CatalogGrid';
import { translateGenre } from '../../lib/utils/genre-translation';
import {
  pickFeaturedHero,
  filterWatchNow,
  filterByMediaType,
  standaloneDownloads,
  mergeReadyToWatch,
  excludeSeenItems,
  itemInGenre,
  topGenres,
  uniqueByMedia,
  byReleaseDate,
  byPopularity,
  postersByGenre,
} from './utils/browsePriority';

const SECTION_LIMIT = 48;
const GENRE_CAP = 180;

export default function SeriesDashboard() {
  const { t, language } = useI18n();
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const { series, loading, hasMore, error } = useInfiniteSeries();
  const { resumeWatching, waitingForNext, rewatchWatching } = useResumeWatching();
  const { activeDownloads } = useActiveDownloads();
  const freshSynced = useFreshSynced('series');
  const { recentDownloads } = useLibraryBrowse('series');
  const { withSignals: seriesWithSignals } = useContentSignals(series, resumeWatching);
  const seriesDownloads = useMemo(() => filterByMediaType(activeDownloads, 'tv'), [activeDownloads]);
  const { withSignals: freshWithSignals } = useContentSignals(freshSynced, resumeWatching);

  const seenItems = useMemo(
    () => [...resumeWatching, ...rewatchWatching].filter((item) => item.type === 'tv'),
    [resumeWatching, rewatchWatching]
  );

  const heroItems = useMemo(() => {
    const watchNow = excludeSeenItems(filterWatchNow(seriesWithSignals), seenItems);
    const newestUnwatched = excludeSeenItems(
      [...recentDownloads, ...seriesWithSignals.slice(0, SECTION_LIMIT), ...freshWithSignals],
      seenItems
    );
    return pickFeaturedHero(watchNow, newestUnwatched);
  }, [seriesWithSignals, freshWithSignals, recentDownloads, seenItems]);

  const handleNavigate = (item: ContentItem) => {
    window.location.href = buildStrictTmdbDetailUrlFromContentItem(item, 'series');
  };

  const catalog = useMemo(() => uniqueByMedia(seriesWithSignals), [seriesWithSignals]);
  const catalogReady = !loading && !hasMore;
  const genres = useMemo(
    () => (catalogReady ? topGenres(catalog).map((genre) => genre.key) : []),
    [catalog, catalogReady]
  );
  const genreBackgrounds = useMemo(
    () => (catalogReady ? postersByGenre(catalog) : {}),
    [catalog, catalogReady]
  );
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
      { id: 'recent-series', title: t('dashboard.newReleasesSeries'), items: byReleaseDate(catalog).slice(0, SECTION_LIMIT) },
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
      toolbar={
        genres.length > 0 ? (
          <GenreCardsRow
            genres={genres}
            genreBackgrounds={genreBackgrounds}
            allBackground={catalog.find((item) => item.poster || item.backdrop)?.poster || catalog[0]?.backdrop}
            selectedGenre={selectedGenre}
            onSelectGenre={setSelectedGenre}
            language={language === 'en' ? 'en' : 'fr'}
          />
        ) : null
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
