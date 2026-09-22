import { useMemo, useState } from 'preact/hooks';
import { useI18n } from '../../lib/i18n/useI18n';
import type { ContentItem } from '../../lib/client/types';
import { SimpleTmdbPage } from '../page-model/SimpleTmdbPage';
import { useInfiniteFilms } from './hooks/useInfiniteFilms';
import { useResumeWatching } from './hooks/useResumeWatching';
import { useContentSignals } from './hooks/useContentSignals';
import { useFreshSynced } from './hooks/useFreshSynced';
import { useLibraryBrowse } from './hooks/useLibraryBrowse';
import { buildStrictTmdbDetailUrlFromContentItem } from '../../lib/utils/media-detail-url';
import SuggestionsSection from './SuggestionsSection';
import { useActiveDownloads } from './hooks/useActiveDownloads';
import { GenreChipBar } from '../page-model/GenreChipBar';
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
} from './utils/browsePriority';

const SECTION_LIMIT = 48;
const GENRE_CAP = 180;

export default function FilmsDashboard() {
  const { t, language } = useI18n();
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const { films, loading, error } = useInfiniteFilms();
  const { resumeWatching, rewatchWatching } = useResumeWatching();
  const { activeDownloads } = useActiveDownloads();
  const freshSynced = useFreshSynced('films');
  const { recentDownloads } = useLibraryBrowse('movies');
  const { withSignals: filmsWithSignals } = useContentSignals(films, resumeWatching);
  const movieDownloads = useMemo(() => filterByMediaType(activeDownloads, 'movie'), [activeDownloads]);
  const { withSignals: freshWithSignals } = useContentSignals(freshSynced, resumeWatching);

  const seenItems = useMemo(
    () => [...resumeWatching, ...rewatchWatching].filter((item) => item.type === 'movie'),
    [resumeWatching, rewatchWatching]
  );

  const heroItems = useMemo(() => {
    const watchNow = excludeSeenItems(filterWatchNow(filmsWithSignals), seenItems);
    const newestUnwatched = excludeSeenItems(
      [...recentDownloads, ...filmsWithSignals.slice(0, SECTION_LIMIT), ...freshWithSignals],
      seenItems
    );
    return pickFeaturedHero(watchNow, newestUnwatched);
  }, [filmsWithSignals, freshWithSignals, recentDownloads, seenItems]);

  const handleNavigate = (item: ContentItem) => {
    window.location.href = buildStrictTmdbDetailUrlFromContentItem(item, 'films');
  };

  const catalog = useMemo(() => uniqueByMedia(filmsWithSignals), [filmsWithSignals]);
  const genres = useMemo(() => topGenres(catalog), [catalog]);
  const genreItems = useMemo(() => {
    if (!selectedGenre) return [];
    return byPopularity(catalog.filter((item) => itemInGenre(item, selectedGenre))).slice(0, GENRE_CAP);
  }, [catalog, selectedGenre]);

  const sections = useMemo(() => {
    const resumeMovies = resumeWatching.filter((item) => item.type === 'movie');
    const watchNow = excludeSeenItems(filterWatchNow(filmsWithSignals), seenItems);
    const downloadingNow = standaloneDownloads(movieDownloads, resumeMovies);
    const latestMerged = mergeReadyToWatch(
      mergeReadyToWatch(downloadingNow, excludeSeenItems(recentDownloads, seenItems)),
      watchNow
    );

    const personal = [
      { id: 'resume-films', title: t('dashboard.resumeWatching'), items: resumeMovies, kind: 'resume' as const, priority: true },
      {
        id: 'latest-downloads-films',
        title: t('dashboard.recentlyDownloaded'),
        items: latestMerged,
        priority: true,
      },
    ];

    if (selectedGenre) return [];

    return [
      ...personal,
      { id: 'recent-films', title: t('dashboard.newReleasesMovies'), items: byReleaseDate(catalog).slice(0, SECTION_LIMIT) },
      { id: 'popular-films', title: t('dashboard.popularMovies'), items: byPopularity(catalog).slice(0, SECTION_LIMIT) },
    ];
  }, [
    filmsWithSignals,
    resumeWatching,
    seenItems,
    movieDownloads,
    recentDownloads,
    catalog,
    selectedGenre,
    t,
  ]);

  const lang = language === 'en' ? 'en' : 'fr';

  return (
    <SimpleTmdbPage
      pageId="films"
      title={t('nav.films')}
      subtitle={t('dashboard.filmsSubtitle')}
      heroItems={heroItems}
      sections={sections}
      loading={loading}
      error={error}
      onNavigate={handleNavigate}
      emptyTitle={t('sync.noFilmsSynced')}
      emptyDescription={t('sync.startSyncDescription')}
      toolbar={
        <GenreChipBar
          genres={genres}
          total={catalog.length}
          selectedGenre={selectedGenre}
          onSelectGenre={setSelectedGenre}
          language={lang}
        />
      }
    >
      {selectedGenre ? (
        <CatalogGrid
          title={t('dashboard.moviesGenre', { genre: translateGenre(selectedGenre, lang) })}
          count={catalog.filter((item) => itemInGenre(item, selectedGenre)).length}
          items={genreItems}
          onNavigate={handleNavigate}
        />
      ) : (
        <SuggestionsSection contextType="movies" />
      )}
    </SimpleTmdbPage>
  );
}
