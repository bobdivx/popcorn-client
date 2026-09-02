import { useEffect, useMemo, useState } from 'preact/hooks';
import { useI18n } from '../../lib/i18n/useI18n';
import type { ContentItem } from '../../lib/client/types';
import Library from '../Library';
import { LibraryViewToggle, type LibraryViewMode } from '../page-model/LibraryViewToggle';
import { SimpleTmdbPage } from '../page-model/SimpleTmdbPage';
import { useInfiniteFilms } from './hooks/useInfiniteFilms';
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
const MIN_FILMS_PER_GENRE = 4;
const VIEW_STORAGE_KEY = 'popcorn:films-view';

export default function FilmsDashboard() {
  const { t } = useI18n();
  const { films, loading, error } = useInfiniteFilms();
  const { resumeWatching, rewatchWatching } = useResumeWatching();
  const { activeDownloads } = useActiveDownloads();
  const freshSynced = useFreshSynced('films');
  const [view, setView] = useState<LibraryViewMode>('torrents');
  const { withSignals: filmsWithSignals } = useContentSignals(films, resumeWatching);
  const movieDownloads = useMemo(() => filterByMediaType(activeDownloads, 'movie'), [activeDownloads]);
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
    () => [...resumeWatching, ...rewatchWatching].filter((item) => item.type === 'movie'),
    [resumeWatching, rewatchWatching]
  );

  const heroItems = useMemo(() => {
    const watchNow = excludeSeenItems(filterWatchNow(filmsWithSignals), seenItems);
    const newestUnwatched = excludeSeenItems(
      [...filmsWithSignals.slice(0, SECTION_LIMIT), ...freshWithSignals],
      seenItems
    );
    return pickFeaturedHero(watchNow, newestUnwatched);
  }, [filmsWithSignals, freshWithSignals, seenItems]);

  const handleNavigate = (item: ContentItem) => {
    window.location.href = buildStrictTmdbDetailUrlFromContentItem(item, 'dashboard');
  };

  const sections = useMemo(() => {
    const newest = filmsWithSignals.slice(0, SECTION_LIMIT);

    const popular = [...filmsWithSignals]
      .sort((a, b) => (b.seeds ?? 0) - (a.seeds ?? 0))
      .slice(0, SECTION_LIMIT);

    const resumeMovies = resumeWatching.filter((item) => item.type === 'movie');
    const rewatchMovies = rewatchWatching.filter((item) => item.type === 'movie');
    const watchNow = excludeSeenItems(filterWatchNow(filmsWithSignals), seenItems);
    const downloadingNow = standaloneDownloads(movieDownloads, resumeMovies);

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
        items: items.slice(0, SECTION_LIMIT),
      }));

    return [
      { id: 'resume-films', title: t('dashboard.resumeWatching'), items: resumeMovies, kind: 'resume' as const, priority: true },
      { id: 'rewatch-films', title: t('dashboard.rewatch'), items: rewatchMovies, kind: 'resume' as const, priority: true },
      { id: 'active-downloads-films', title: t('dashboard.activeDownloads'), items: downloadingNow, priority: true },
      { id: 'recently-downloaded-films', title: t('dashboard.recentlyDownloaded'), items: watchNow, priority: true },
      { id: 'recent-films', title: t('dashboard.newReleasesMovies'), items: newest },
      { id: 'fresh-films', title: t('dashboard.freshlySyncedMovies'), items: freshWithSignals.slice(0, SECTION_LIMIT) },
      { id: 'popular-films', title: t('dashboard.popularMovies'), items: popular },
      ...genreSections,
    ];
  }, [filmsWithSignals, freshWithSignals, resumeWatching, rewatchWatching, seenItems, movieDownloads, t]);

  const toggle = (
    <LibraryViewToggle mode={view} onChange={handleChangeView} contentType="movies" />
  );

  if (view === 'library') {
    return (
      <div className="min-h-screen bg-black text-white relative" data-page="films-library">
        <div className="px-3 sm:px-4 md:px-6 lg:px-8 xl:px-12 tv:px-16">
          <Library showHero showFilters={false} initialContentFilter="movies" headerAction={toggle} />
        </div>
      </div>
    );
  }

  return (
    <SimpleTmdbPage
      pageId="films"
      title={t('nav.films')}
      heroItems={heroItems}
      sections={sections}
      loading={loading}
      error={error}
      onNavigate={handleNavigate}
      emptyTitle={t('sync.noFilmsSynced')}
      emptyDescription={t('sync.startSyncDescription')}
      headerAction={toggle}
    >
      <SuggestionsSection contextType="movies" />
    </SimpleTmdbPage>
  );
}
