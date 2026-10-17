import { useMemo, useState } from 'preact/hooks';
import { useI18n } from '../../lib/i18n/useI18n';
import type { ContentItem } from '../../lib/client/types';
import { SimpleTmdbPage } from '../page-model/SimpleTmdbPage';
import { useInfiniteFilms } from './hooks/useInfiniteFilms';
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
import { IS_STORE_BUILD } from '../../lib/distribution';
import StoreLibraryHome from './StoreLibraryHome';

const SECTION_LIMIT = 48;
const GENRE_CAP = 180;

function FullFilmsDashboard() {
  const { t, language } = useI18n();
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const { films, loading, error } = useInfiniteFilms();
  const highlights = useTmdbHighlights(['now_playing', 'upcoming', 'trending_movie']);
  const titles = useMemo(() => highlightTitles(language), [language]);
  const { resumeWatching, rewatchWatching } = useResumeWatching();
  const { activeDownloads } = useActiveDownloads();
  const { recentDownloads } = useLibraryBrowse('movies');
  const { withSignals: filmsWithSignals } = useContentSignals(films, resumeWatching);
  const movieDownloads = useMemo(() => filterByMediaType(activeDownloads, 'movie'), [activeDownloads]);

  const seenItems = useMemo(
    () => [...resumeWatching, ...rewatchWatching].filter((item) => item.type === 'movie'),
    [resumeWatching, rewatchWatching]
  );

  /** tmdb → torrent / média local (relie les suggestions TMDB à ce qui est disponible). */
  const availabilityIndex = useMemo(
    () => buildAvailabilityIndex(recentDownloads, filmsWithSignals),
    [recentDownloads, filmsWithSignals]
  );

  const heroItems = useMemo(() => {
    const watchNow = excludeSeenItems(filterWatchNow(filmsWithSignals), seenItems);
    const newestUnwatched = excludeSeenItems(
      [
        ...recentDownloads,
        ...recentAvailable(filmsWithSignals, 12),
        ...linkAvailability(highlights.now_playing ?? [], availabilityIndex).slice(0, 8),
      ],
      seenItems
    );
    return pickFeaturedHero(watchNow, newestUnwatched);
  }, [filmsWithSignals, highlights, availabilityIndex, recentDownloads, seenItems]);

  const handleNavigate = (item: ContentItem) => {
    window.location.href = buildSuggestionUrl(item, 'films');
  };

  const catalog = useMemo(() => uniqueByMedia(filmsWithSignals), [filmsWithSignals]);
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
      // TMDB « du moment » (région FR) relié aux torrents disponibles, puis torrents récents (≤ 12 mois).
      { id: 'now-playing-films', title: titles.nowPlaying, items: linkAvailability(highlights.now_playing ?? [], availabilityIndex).slice(0, SECTION_LIMIT) },
      { id: 'trending-films', title: titles.trendingMovies, items: linkAvailability(highlights.trending_movie ?? [], availabilityIndex).slice(0, SECTION_LIMIT) },
      { id: 'recent-films', title: titles.recentAvailable, items: recentAvailable(catalog, SECTION_LIMIT) },
      { id: 'upcoming-films', title: titles.upcoming, items: linkAvailability(highlights.upcoming ?? [], availabilityIndex).slice(0, SECTION_LIMIT) },
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
    highlights,
    availabilityIndex,
    titles,
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
      headerAction={
        <GenreSidebar
          selectedGenre={selectedGenre}
          onSelectGenre={setSelectedGenre}
          language={lang}
        />
      }
    >
      {selectedGenre ? (
        <CatalogGrid
          title={t('dashboard.moviesGenre', { genre: translateGenre(selectedGenre, lang) })}
          items={genreItems}
          onNavigate={handleNavigate}
        />
      ) : null}
    </SimpleTmdbPage>
  );
}

/** Version store (PUBLIC_DISTRIBUTION=play) : bibliothèque du serveur uniquement, sans catalogue torrent. */
export default function FilmsDashboard() {
  return IS_STORE_BUILD ? <StoreLibraryHome filter="movies" /> : <FullFilmsDashboard />;
}
