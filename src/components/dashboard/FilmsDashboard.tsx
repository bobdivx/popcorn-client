import { useEffect, useMemo, useState } from 'preact/hooks';
import { useI18n } from '../../lib/i18n/useI18n';
import type { ContentItem } from '../../lib/client/types';
import Library from '../Library';
import { LibraryViewToggle, type LibraryViewMode } from '../page-model/LibraryViewToggle';
import { PageHeader } from '../page-model/PageHeader';
import { SimpleTmdbPage } from '../page-model/SimpleTmdbPage';
import { useInfiniteFilms } from './hooks/useInfiniteFilms';
import { useResumeWatching } from './hooks/useResumeWatching';

const SECTION_LIMIT = 25;
const MAX_GENRES = 12;
const MIN_FILMS_PER_GENRE = 4;
const VIEW_STORAGE_KEY = 'popcorn:films-view';

export default function FilmsDashboard() {
  const { t } = useI18n();
  const { films, loading, error } = useInfiniteFilms();
  const { resumeWatching } = useResumeWatching();
  const [view, setView] = useState<LibraryViewMode>('torrents');

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

  const heroItems = useMemo(
    () => films.slice(0, 5).filter((item) => item.poster || item.backdrop),
    [films]
  );

  const handleNavigate = (item: ContentItem) => {
    window.location.href = `/torrents?slug=${encodeURIComponent(item.id)}&from=dashboard`;
  };

  const sections = useMemo(() => {
    const newest = films.slice(0, SECTION_LIMIT);

    const popular = [...films]
      .sort((a, b) => (b.seeds ?? 0) - (a.seeds ?? 0))
      .slice(0, SECTION_LIMIT);

    const resumeMovies = resumeWatching.filter((item) => item.type === 'movie');

    const genreMap = new Map<string, ContentItem[]>();
    for (const film of films) {
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
      { id: 'recent-films', title: t('dashboard.newReleasesMovies'), items: newest },
      { id: 'popular-films', title: t('dashboard.popularMovies'), items: popular },
      { id: 'resume-films', title: t('dashboard.resumeWatching'), items: resumeMovies },
      ...genreSections,
    ];
  }, [films, resumeWatching, t]);

  const toggle = (
    <LibraryViewToggle mode={view} onChange={handleChangeView} contentType="movies" />
  );

  if (view === 'library') {
    return (
      <div className="min-h-screen bg-black text-white relative" data-page="films-library">
        <PageHeader title={t('nav.films')} headerAction={toggle} />
        <div className="px-3 sm:px-4 md:px-6 lg:px-8 xl:px-12 tv:px-16">
          <Library showHero showFilters={false} initialContentFilter="movies" />
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
    />
  );
}
