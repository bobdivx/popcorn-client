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
import SuggestionsSection from './SuggestionsSection';
import { useActiveDownloads } from './hooks/useActiveDownloads';
import { GenreChipBar } from '../page-model/GenreChipBar';
import { translateGenre } from '../../lib/utils/genre-translation';
import {
  pickFeaturedHero,
  filterWatchNow,
  filterByMediaType,
  standaloneDownloads,
  mergeReadyToWatch,
  excludeSeenItems,
  promoteRecentFirst,
  itemInGenre,
  topGenres,
} from './utils/browsePriority';

const SECTION_LIMIT = 25;

export default function SeriesDashboard() {
  const { t, language } = useI18n();
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const { series, loading, error } = useInfiniteSeries();
  const { resumeWatching, waitingForNext, rewatchWatching } = useResumeWatching();
  const { activeDownloads } = useActiveDownloads();
  const freshSynced = useFreshSynced('series');
  const { recentDownloads, recentKeys } = useLibraryBrowse('series');
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

  const sections = useMemo(() => {
    const newest = promoteRecentFirst(seriesWithSignals, recentKeys).slice(0, SECTION_LIMIT);

    const popular = promoteRecentFirst(
      [...seriesWithSignals].sort((a, b) => (b.seeds ?? 0) - (a.seeds ?? 0)),
      recentKeys
    ).slice(0, SECTION_LIMIT);

    const resumeSeries = resumeWatching.filter((item) => item.type === 'tv');
    const waitingSeries = waitingForNext.filter((item) => item.type === 'tv');
    const watchNow = excludeSeenItems(filterWatchNow(seriesWithSignals), seenItems);
    const downloadingNow = standaloneDownloads(seriesDownloads, resumeSeries);

    const latestMerged = mergeReadyToWatch(
      mergeReadyToWatch(downloadingNow, excludeSeenItems(recentDownloads, seenItems)),
      watchNow
    );

    const lang = language === 'en' ? 'en' : 'fr';
    const personal = [
      {
        id: 'resume-series',
        title: t('dashboard.resumeWatching'),
        items: resumeSeries.filter((item) => itemInGenre(item, selectedGenre)),
        kind: 'resume' as const,
        priority: true,
      },
      {
        id: 'waiting-series',
        title: t('dashboard.waitingForNext'),
        items: [...waitingSeries]
          .filter((item) => itemInGenre(item, selectedGenre))
          .sort((a, b) => (a.nextEpisodeAirDate ?? '').localeCompare(b.nextEpisodeAirDate ?? '')),
        kind: 'resume' as const,
        priority: true,
      },
      {
        id: 'latest-downloads-series',
        title: t('dashboard.recentlyDownloaded'),
        items: latestMerged.filter((item) => itemInGenre(item, selectedGenre)),
        priority: true,
      },
    ];

    if (selectedGenre) {
      const inGenre = seriesWithSignals.filter((item) => itemInGenre(item, selectedGenre));
      return [
        ...personal,
        {
          id: `genre-${selectedGenre}`,
          title: t('dashboard.seriesGenre', { genre: translateGenre(selectedGenre, lang) }),
          items: promoteRecentFirst(inGenre, recentKeys).slice(0, 40),
        },
      ];
    }

    return [
      ...personal,
      { id: 'recent-series', title: t('dashboard.newReleasesSeries'), items: newest },
      { id: 'popular-series', title: t('dashboard.popularSeries'), items: popular },
    ];
  }, [
    seriesWithSignals,
    resumeWatching,
    waitingForNext,
    seenItems,
    seriesDownloads,
    recentDownloads,
    recentKeys,
    selectedGenre,
    language,
    t,
  ]);

  const genres = useMemo(() => topGenres(seriesWithSignals), [seriesWithSignals]);

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
    >
      <GenreChipBar
        genres={genres}
        selectedGenre={selectedGenre}
        onSelectGenre={setSelectedGenre}
        language={language === 'en' ? 'en' : 'fr'}
      />
      {selectedGenre ? null : <SuggestionsSection contextType="series" />}
    </SimpleTmdbPage>
  );
}
