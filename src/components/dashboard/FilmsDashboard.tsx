import { useMemo } from 'preact/hooks';
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
import {
  pickFeaturedHero,
  filterWatchNow,
  filterByMediaType,
  standaloneDownloads,
  mergeReadyToWatch,
  excludeSeenItems,
  promoteRecentFirst,
  contentItemKey,
} from './utils/browsePriority';

const SECTION_LIMIT = 25;
const MAX_GENRES = 12;
const MIN_FILMS_PER_GENRE = 4;

export default function FilmsDashboard() {
  const { t } = useI18n();
  const { films, loading, error } = useInfiniteFilms();
  const { resumeWatching, rewatchWatching } = useResumeWatching();
  const { activeDownloads } = useActiveDownloads();
  const freshSynced = useFreshSynced('films');
  const { recentDownloads, recentKeys } = useLibraryBrowse('movies');
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
    window.location.href = buildStrictTmdbDetailUrlFromContentItem(item, 'dashboard');
  };

  const sections = useMemo(() => {
    const newest = promoteRecentFirst(filmsWithSignals, recentKeys).slice(0, SECTION_LIMIT);

    const popular = promoteRecentFirst(
      [...filmsWithSignals].sort((a, b) => (b.seeds ?? 0) - (a.seeds ?? 0)),
      recentKeys
    ).slice(0, SECTION_LIMIT);

    const resumeMovies = resumeWatching.filter((item) => item.type === 'movie');
    const rewatchMovies = rewatchWatching.filter((item) => item.type === 'movie');
    const watchNow = excludeSeenItems(filterWatchNow(filmsWithSignals), seenItems);
    const downloadingNow = standaloneDownloads(movieDownloads, resumeMovies);

    // Une section : actifs + prêts ≤7j (bibliothèque), sans doublon
    const latestDownloads = mergeReadyToWatch(
      downloadingNow,
      excludeSeenItems(recentDownloads, seenItems)
    );

    // Enrichir avec signaux « prêts à regarder » encore dans la fenêtre récente
    const readyRecent = watchNow.filter((item) => recentKeys.has(contentItemKey(item)));
    const latestMerged = mergeReadyToWatch(latestDownloads, readyRecent);

    const genreMap = new Map<string, ContentItem[]>();
    for (const film of filmsWithSignals) {
      if (!Array.isArray(film.genres)) continue;
      for (const genre of film.genres) {
        if (!genre) continue;
        if (!genreMap.has(genre)) genreMap.set(genre, []);
        genreMap.get(genre)!.push(film);
      }
    }
    const genreSections = Array.from(genreMap.entries())
      .filter(([, items]) => items.length >= MIN_FILMS_PER_GENRE)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, MAX_GENRES)
      .map(([genre, items]) => ({
        id: `genre-${genre}`,
        title: t('dashboard.moviesGenre', { genre }),
        items: promoteRecentFirst(items, recentKeys).slice(0, SECTION_LIMIT),
      }));

    return [
      { id: 'resume-films', title: t('dashboard.resumeWatching'), items: resumeMovies, kind: 'resume' as const, priority: true },
      { id: 'rewatch-films', title: t('dashboard.rewatch'), items: rewatchMovies, kind: 'resume' as const, priority: true },
      {
        id: 'latest-downloads-films',
        title: t('library.latestDownload'),
        items: latestMerged,
        priority: true,
      },
      {
        id: 'recent-films',
        title: t('dashboard.newReleasesMovies'),
        items: newest,
      },
      {
        id: 'fresh-films',
        title: t('dashboard.freshlySyncedMovies'),
        items: promoteRecentFirst(freshWithSignals, recentKeys).slice(0, SECTION_LIMIT),
      },
      { id: 'popular-films', title: t('dashboard.popularMovies'), items: popular },
      ...genreSections,
    ];
  }, [
    filmsWithSignals,
    freshWithSignals,
    resumeWatching,
    rewatchWatching,
    seenItems,
    movieDownloads,
    recentDownloads,
    recentKeys,
    t,
  ]);

  return (
    <SimpleTmdbPage
      pageId="films"
      title=""
      heroItems={heroItems}
      sections={sections}
      loading={loading}
      error={error}
      onNavigate={handleNavigate}
      emptyTitle={t('sync.noFilmsSynced')}
      emptyDescription={t('sync.startSyncDescription')}
    >
      <SuggestionsSection contextType="movies" />
    </SimpleTmdbPage>
  );
}
