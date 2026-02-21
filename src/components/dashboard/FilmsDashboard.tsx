import { useMemo, useEffect, useRef, useState, useCallback } from 'preact/hooks';
import { Download, Film, Library as LibraryIcon, Play } from 'lucide-preact';
import type { FilmData } from '../../lib/client/types';
import { HeroSection } from './components/HeroSection';
import CarouselRow from '../torrents/CarouselRow';
import { LazyTorrentPoster } from './components/LazyTorrentPoster';
import type { ContentItem } from '../../lib/client/types';
import { useInfiniteFilms } from './hooks/useInfiniteFilms';
import { useRecentFilms } from './hooks/useRecentFilms';
import { useFavoritesItems } from './hooks/useFavoritesItems';
import { useSyncStatus } from './hooks/useSyncStatus';
import { SyncProgress } from '../setup/components/SyncProgress';
import { SyncCard } from './components/SyncCard';
import { useI18n } from '../../lib/i18n/useI18n';
import HLSLoadingSpinner from '../ui/HLSLoadingSpinner';
import { translateGenre } from '../../lib/utils/genre-translation';
import { serverApi } from '../../lib/client/server-api';
import { NotificationContainer } from '../ui/Notification';
import { useNotifications } from '../torrents/MediaDetailPage/hooks/useNotifications';
import { resolveHeroTorrent } from './utils/heroDownload';
import { handleDownload } from '../torrents/MediaDetailPage/actions/download';
import { useSubscriptionMe } from '../torrents/MediaDetailPage/hooks/useSubscriptionMe';
import Library from '../Library';

export default function FilmsDashboard() {
  const { t, language } = useI18n();
  const { films, loading, error, hasMore, loadMore, refetchSilent } = useInfiniteFilms();
  const { films: recentFilms } = useRecentFilms();
  const { items: favoritesItems } = useFavoritesItems();
  const { syncStatus, isSyncing, loading: syncLoading } = useSyncStatus();
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);
  const lastSyncProgressRef = useRef<number>(-1);
  const { notifications, addNotification, removeNotification } = useNotifications();
  const { streamingTorrentActive } = useSubscriptionMe();
  const [heroDownloading, setHeroDownloading] = useState(false);
  const [viewMode, setViewMode] = useState<'torrents' | 'library'>(() => {
    if (typeof window === 'undefined') return 'torrents';
    return new URLSearchParams(window.location.search).get('view') === 'library' ? 'library' : 'torrents';
  });
  const [autoViewChecked, setAutoViewChecked] = useState(false);
  const switchTorrentRef = useRef<HTMLButtonElement>(null);
  const switchLibraryRef = useRef<HTMLButtonElement>(null);

  const setViewModeAndUrl = useCallback((mode: 'torrents' | 'library') => {
    setViewMode(mode);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (mode === 'library') {
        url.searchParams.set('view', 'library');
      } else {
        url.searchParams.delete('view');
      }
      window.history.replaceState({}, '', url.toString());
    }
  }, []);

  // À l'arrivée sur la page, focus sur le switch (accessible télécommande / clavier)
  useEffect(() => {
    if (loading) return;
    const el = viewMode === 'torrents' ? switchTorrentRef.current : switchLibraryRef.current;
    if (el) {
      const t = setTimeout(() => el.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [loading, viewMode]);

  // Rafraîchir la liste des films au fur et à mesure de la synchronisation torrent
  useEffect(() => {
    if (!isSyncing) {
      lastSyncProgressRef.current = -1;
      return;
    }
    if (!syncStatus) return;
    const totalProcessed = syncStatus.progress?.total_processed ?? 0;
    const statsSum = syncStatus.stats
      ? Object.values(syncStatus.stats).reduce((a, b) => a + b, 0)
      : 0;
    const key = totalProcessed + statsSum;
    if (key > lastSyncProgressRef.current) {
      lastSyncProgressRef.current = key;
      if (key > 0) refetchSilent();
    }
  }, [isSyncing, syncStatus?.progress?.total_processed, syncStatus?.stats, refetchSilent]);

  // Fallback UX: si l'onglet Torrents est vide mais que la bibliothèque locale a des films,
  // basculer automatiquement vers la vue Bibliothèque.
  useEffect(() => {
    if (loading || autoViewChecked || viewMode !== 'torrents') return;

    const checkLibraryFallback = async () => {
      try {
        const res = await serverApi.getLibrary();
        if (!res.success || !Array.isArray(res.data)) {
          setAutoViewChecked(true);
          return;
        }
        const hasLibraryMovies = res.data.some((item: any) => {
          const category = String(item?.category ?? '').toUpperCase();
          const tmdbType = String(item?.tmdb_type ?? '').toLowerCase();
          return category === 'FILM' || tmdbType === 'movie';
        });
        if (films.length === 0 && hasLibraryMovies) {
          setViewModeAndUrl('library');
        }
      } finally {
        setAutoViewChecked(true);
      }
    };

    checkLibraryFallback();
  }, [loading, films.length, autoViewChecked, viewMode]);

  // Charger plus d'éléments automatiquement quand on approche de la fin
  useEffect(() => {
    if (!loadMoreTriggerRef.current || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadMore();
        }
      },
      { rootMargin: '500px' }
    );

    observer.observe(loadMoreTriggerRef.current);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  const handlePlay = (item: ContentItem) => {
    window.location.href = `/player/${item.id}`;
  };

  const switchBarClasses = 'relative z-30 shrink-0 w-full px-4 py-3 sm:px-6 sm:py-3 lg:px-8 bg-page flex items-center justify-center min-[640px]:justify-start';
  const showSyncBar = !syncLoading && isSyncing;

  const renderViewToggle = () => (
    <div className="w-full max-w-[280px] sm:max-w-none sm:w-auto flex rounded-full bg-white/10 border border-white/20 p-1 min-h-[48px] sm:min-h-[44px] tv:min-h-[52px]">
      <button
        ref={switchTorrentRef}
        type="button"
        data-focusable
        tabIndex={0}
        onClick={() => setViewModeAndUrl('torrents')}
        className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 sm:py-2 rounded-full text-sm font-semibold transition-colors min-h-[44px] focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-black sm:min-w-[7rem] ${
          viewMode === 'torrents' ? 'bg-white text-black shadow' : 'text-white/90 hover:bg-white/10'
        }`}
        aria-pressed={viewMode === 'torrents'}
        aria-label={t('common.torrents')}
      >
        <Film className="w-4 h-4 shrink-0" />
        <span className="truncate">{t('common.torrents')}</span>
      </button>
      <button
        ref={switchLibraryRef}
        type="button"
        data-focusable
        tabIndex={0}
        onClick={() => setViewModeAndUrl('library')}
        className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 sm:py-2 rounded-full text-sm font-semibold transition-colors min-h-[44px] focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-black sm:min-w-[7rem] ${
          viewMode === 'library' ? 'bg-white text-black shadow' : 'text-white/90 hover:bg-white/10'
        }`}
        aria-pressed={viewMode === 'library'}
        aria-label={t('library.title')}
      >
        <LibraryIcon className="w-4 h-4 shrink-0" />
        <span className="truncate">{t('library.title')}</span>
      </button>
    </div>
  );

  if (viewMode === 'library') {
    return (
      <div className="min-h-screen bg-page text-white flex flex-col">
        <NotificationContainer notifications={notifications} onRemove={removeNotification} />
        {showSyncBar && <SyncProgress compact externalStatus={syncStatus} />}
        <div className={switchBarClasses}>{renderViewToggle()}</div>
        <div className="pb-8 tv:pb-12 flex-1">
          <Library initialContentFilter="movies" showHero={false} showFilters={false} showSync={false} />
        </div>
      </div>
    );
  }

  const handleHeroDownload = useCallback(async (item: ContentItem) => {
    if (heroDownloading) return;
    setHeroDownloading(true);
    try {
      const torrent = await resolveHeroTorrent(item);
      if (!torrent) {
        addNotification('error', t('dashboard.downloadUnavailable'));
        return;
      }
      const isExternal = !!torrent._externalLink || torrent.id?.startsWith('external_');
      await handleDownload({
        torrent,
        isExternal,
        setDownloadingToClient: setHeroDownloading,
        addNotification,
      });
    } finally {
      setHeroDownloading(false);
    }
  }, [heroDownloading, addNotification, t]);

  // Grouper les films par genre principal uniquement (chaque film dans une seule ligne)
  const filmsByGenre = useMemo(() => {
    const grouped: Record<string, FilmData[]> = {};
    
    films.forEach(film => {
      if (film.genres && film.genres.length > 0) {
        // Utiliser uniquement le genre principal (premier du tableau)
        const primaryGenre = film.genres[0];
        if (!grouped[primaryGenre]) {
          grouped[primaryGenre] = [];
        }
        grouped[primaryGenre].push(film);
      } else {
        // Films sans genre dans une catégorie "Autres" (clé interne pour i18n)
        const otherKey = '__other__';
        if (!grouped[otherKey]) {
          grouped[otherKey] = [];
        }
        grouped[otherKey].push(film);
      }
    });

    // Trier chaque groupe par date (plus récent en premier)
    Object.keys(grouped).forEach(genre => {
      grouped[genre].sort((a, b) => {
        const dateA = a.releaseDate ? new Date(a.releaseDate).getTime() : 0;
        const dateB = b.releaseDate ? new Date(b.releaseDate).getTime() : 0;
        return dateB - dateA;
      });
    });

    return grouped;
  }, [films]);

  // Préparer les données pour le hero (les 3 films les plus récents par date de sortie, avec poster)
  const heroFilms = useMemo(() => {
    return [...films]
      .filter(f => f.poster || f.backdrop)
      .sort((a, b) => {
        const dateA = a.releaseDate ? new Date(a.releaseDate).getTime() : 0;
        const dateB = b.releaseDate ? new Date(b.releaseDate).getTime() : 0;
        return dateB - dateA;
      })
      .slice(0, 3)
      .map(f => ({
        ...f,
        type: 'movie' as const,
      }));
  }, [films]);

  // Résumés localisés pour le hero (langue courante via TMDB)
  const [heroOverviews, setHeroOverviews] = useState<Record<string, string>>({});
  const tmdbLang = language === 'fr' ? 'fr-FR' : 'en-US';
  useEffect(() => {
    if (heroFilms.length === 0) {
      setHeroOverviews({});
      return;
    }
    let cancelled = false;
    const next: Record<string, string> = {};
    (async () => {
      for (const item of heroFilms) {
        if (cancelled || !item.tmdbId) continue;
        try {
          const res = await serverApi.getTmdbMovieDetail(item.tmdbId, tmdbLang);
          if (res.success && res.data?.overview) {
            next[item.id] = res.data.overview;
          }
        } catch {
          // garder l'overview de la liste si l'appel échoue
        }
      }
      if (!cancelled) setHeroOverviews(prev => ({ ...prev, ...next }));
    })();
    return () => { cancelled = true; };
  }, [tmdbLang, heroFilms.map(f => `${f.id}:${f.tmdbId ?? ''}`).join('|')]);

  // Hero items avec overview dans la langue courante (priorité au fetch TMDB)
  const heroItemsWithOverview = useMemo(() => {
    return heroFilms.map(f => ({
      ...f,
      overview: heroOverviews[f.id] ?? f.overview,
    }));
  }, [heroFilms, heroOverviews]);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-page">
        <HLSLoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-page text-white px-4">
        <div className="alert alert-error max-w-2xl">
          <span>{error}</span>
        </div>
      </div>
    );
  }

  // Vérifier s'il y a des torrents synchronisés
  const totalTorrents = syncStatus?.stats 
    ? Object.values(syncStatus.stats).reduce((sum, count) => sum + count, 0)
    : 0;
  const hasTorrents = totalTorrents > 0;

  // Contenu principal quand films.length === 0
  const renderEmptyContent = () => {
    if (!syncLoading && !isSyncing && !hasTorrents) {
      return (
        <div className="flex-1 flex items-center justify-center min-h-[50vh]">
          <SyncCard type="films" />
        </div>
      );
    }
    if (isSyncing) {
      return (
        <div className="flex flex-col items-center justify-center flex-1 py-16 px-4">
          <p className="text-gray-400 text-center">
            {t('sync.filmsSyncDescription')}
          </p>
          <p className="text-gray-500 text-sm mt-2 text-center">
            Les films apparaîtront au fur et à mesure de la synchronisation.
          </p>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center flex-1 py-16 px-4">
        <h2 className="text-2xl font-bold text-white mb-2">Aucun film disponible</h2>
        <p className="text-gray-400 text-center">Aucun film n'est disponible pour le moment.</p>
      </div>
    );
  };

  // Trier les genres par ordre alphabétique
  const sortedGenres = Object.keys(filmsByGenre).sort((a, b) => {
    // Mettre "Autres" en dernier
    if (a === '__other__') return 1;
    if (b === '__other__') return -1;
    return a.localeCompare(b);
  });
  
  return (
    <div className="min-h-screen bg-page text-white flex flex-col">
      <NotificationContainer notifications={notifications} onRemove={removeNotification} />
      {/* Barre de progression compacte en haut quand sync en cours */}
      {showSyncBar && <SyncProgress compact externalStatus={syncStatus} />}
      {/* Switch : barre sous le header quand pas de hero */}
      {heroItemsWithOverview.length === 0 && (
        <div className={switchBarClasses}>{renderViewToggle()}</div>
      )}

      {/* Section Hero : switch à droite de la carte (mobile, tablette, PC), aligné en haut à droite */}
      {heroItemsWithOverview.length > 0 && (
        <div className="relative">
          <div className="absolute top-3 right-3 sm:top-4 sm:right-4 md:top-5 md:right-5 z-30 flex items-center justify-end w-auto max-w-[calc(100%-1.5rem)] sm:max-w-none">
            <div className="bg-black/60 backdrop-blur-sm rounded-full border border-white/20 p-1 shadow-lg">
              {renderViewToggle()}
            </div>
          </div>
          <HeroSection
            noOverlap
            items={heroItemsWithOverview}
            onPlay={handlePlay}
            onPrimaryAction={streamingTorrentActive ? handlePlay : handleHeroDownload}
            primaryActionDisabled={!streamingTorrentActive && heroDownloading}
            primaryButtonLabel={streamingTorrentActive ? t('common.watch') : t('common.download')}
            primaryButtonIcon={streamingTorrentActive ? <Play className="h-6 w-6 tv:h-8 tv:w-8" size={24} /> : <Download className="h-6 w-6 tv:h-8 tv:w-8" size={24} />}
          />
        </div>
      )}

      <div className="pb-8 tv:pb-12 flex-1">
        {/* Section Ajouts récents (tri par date de sortie du film) - première ligne */}
        {recentFilms.length > 0 && (
          <CarouselRow title={t('dashboard.recentAdditions')} autoScroll={false}>
            {recentFilms.map((film) => (
              <div key={film.id} className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px]">
                <LazyTorrentPoster item={{ ...film, type: 'movie' }} />
              </div>
            ))}
          </CarouselRow>
        )}
        {/* Section À regarder plus tard (favoris) */}
        {favoritesItems.length > 0 && (
          <CarouselRow title={t('dashboard.watchLater')} autoScroll={false}>
            {favoritesItems.map((item) => (
              <div key={item.id} className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px]">
                <LazyTorrentPoster item={item} />
              </div>
            ))}
          </CarouselRow>
        )}
        {/* Contenu vide : SyncCard ou message */}
        {films.length === 0 ? (
          renderEmptyContent()
        ) : sortedGenres.length > 0 ? (
          sortedGenres.map(genre => {
            const genreFilms = filmsByGenre[genre];
            if (genreFilms.length === 0) return null;

            const genreTitle =
              genre === '__other__' ? t('common.others') : translateGenre(genre, language);

            return (
              <CarouselRow key={genre} title={genreTitle} autoScroll={false}>
                {genreFilms.map((film) => (
                  <div key={film.id} className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px]">
                    <LazyTorrentPoster item={{ ...film, type: 'movie' }} />
                  </div>
                ))}
              </CarouselRow>
            );
          })
        ) : (
          // Si aucun genre, afficher tous les films dans une seule ligne
          <CarouselRow title={t('sync.allFilms')} autoScroll={false}>
            {films.map((film) => (
              <div key={film.id} className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px]">
                <LazyTorrentPoster item={{ ...film, type: 'movie' }} />
              </div>
            ))}
          </CarouselRow>
        )}
        {/* Trigger pour charger plus d'éléments */}
        {films.length > 0 && hasMore && <div ref={loadMoreTriggerRef} className="h-1" />}
      </div>
    </div>
  );
}
