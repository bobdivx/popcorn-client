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

export default function FilmsDashboard() {
  const { t, language } = useI18n();
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
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
    window.location.href = buildStrictTmdbDetailUrlFromContentItem(item, 'films');
  };

  const sections = useMemo(() => {
    const newest = promoteRecentFirst(filmsWithSignals, recentKeys).slice(0, SECTION_LIMIT);

    const popular = promoteRecentFirst(
      [...filmsWithSignals].sort((a, b) => (b.seeds ?? 0) - (a.seeds ?? 0)),
      recentKeys
    ).slice(0, SECTION_LIMIT);

    const resumeMovies = resumeWatching.filter((item) => item.type === 'movie');
    const watchNow = excludeSeenItems(filterWatchNow(filmsWithSignals), seenItems);
    const downloadingNow = standaloneDownloads(movieDownloads, resumeMovies);

    // Actifs + bibliothèque récente + tous les « non vus » (pas seulement ≤ fenêtre)
    const latestMerged = mergeReadyToWatch(
      mergeReadyToWatch(downloadingNow, excludeSeenItems(recentDownloads, seenItems)),
      watchNow
    );

    const personal = [
      { id: 'resume-films', title: t('dashboard.resumeWatching'), items: resumeMovies.filter((item) => itemInGenre(item, selectedGenre)), kind: 'resume' as const, priority: true },
      {
        id: 'latest-downloads-films',
        title: t('dashboard.recentlyDownloaded'),
        items: latestMerged.filter((item) => itemInGenre(item, selectedGenre)),
        priority: true,
      },
    ];

    if (selectedGenre) {
      const lang = language === 'en' ? 'en' : 'fr';
      const inGenre = filmsWithSignals.filter((item) => itemInGenre(item, selectedGenre));
      return [
        ...personal,
        {
          id: `genre-${selectedGenre}`,
          title: t('dashboard.moviesGenre', { genre: translateGenre(selectedGenre, lang) }),
          items: promoteRecentFirst(inGenre, recentKeys).slice(0, 40),
        },
      ];
    }

    return [
      ...personal,
      { id: 'recent-films', title: t('dashboard.newReleasesMovies'), items: newest },
      { id: 'popular-films', title: t('dashboard.popularMovies'), items: popular },
    ];
  }, [
    filmsWithSignals,
    resumeWatching,
    seenItems,
    movieDownloads,
    recentDownloads,
    recentKeys,
    selectedGenre,
    language,
    t,
  ]);

  const genres = useMemo(() => topGenres(filmsWithSignals), [filmsWithSignals]);

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
    >
      <GenreChipBar
        genres={genres}
        selectedGenre={selectedGenre}
        onSelectGenre={setSelectedGenre}
        language={language === 'en' ? 'en' : 'fr'}
      />
      {selectedGenre ? null : <SuggestionsSection contextType="movies" />}
    </SimpleTmdbPage>
  );
}
