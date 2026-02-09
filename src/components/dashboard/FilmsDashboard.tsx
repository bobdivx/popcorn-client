import { useMemo, useEffect, useRef, useState, useCallback } from 'preact/hooks';
import { Download, Film, Library as LibraryIcon } from 'lucide-preact';
import type { FilmData } from '../../lib/client/types';
import { HeroSection } from './components/HeroSection';
import CarouselRow from '../torrents/CarouselRow';
import { LazyTorrentPoster } from './components/LazyTorrentPoster';
import type { ContentItem } from '../../lib/client/types';
import { useInfiniteFilms } from './hooks/useInfiniteFilms';
import { useRecentFilms } from './hooks/useRecentFilms';
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
import Library from '../Library';

export default function FilmsDashboard() {
  const { t, language } = useI18n();
  const { films, loading, error, hasMore, loadMore, refetchSilent } = useInfiniteFilms();
  const { films: recentFilms } = useRecentFilms();
  const { syncStatus, isSyncing, loading: syncLoading } = useSyncStatus();
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);
  const lastSyncProgressRef = useRef<number>(-1);
  const { notifications, addNotification, removeNotification } = useNotifications();
  const [heroDownloading, setHeroDownloading] = useState(false);
  const [viewMode, setViewMode] = useState<'torrents' | 'library'>('torrents');

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

  const renderViewToggle = (className?: string) => (
    <div className={className}>
      <div className="inline-flex items-center gap-1 p-1 rounded-full bg-black/70 border border-white/20 shadow-lg backdrop-blur">
        <button
          type="button"
          onClick={() => setViewMode('torrents')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
            viewMode === 'torrents' ? 'bg-white text-black' : 'text-white/80 hover:bg-white/10'
          }`}
        >
          <Film className="w-4 h-4" />
          {t('common.torrents')}
        </button>
        <button
          type="button"
          onClick={() => setViewMode('library')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
            viewMode === 'library' ? 'bg-white text-black' : 'text-white/80 hover:bg-white/10'
          }`}
        >
          <LibraryIcon className="w-4 h-4" />
          {t('library.title')}
        </button>
      </div>
    </div>
  );

  if (viewMode === 'library') {
    return (
      <div className="pb-8 tv:pb-12">
        {renderViewToggle('px-4 sm:px-6 lg:px-8 mb-4')}
        <Library initialContentFilter="movies" showHero={false} showFilters={false} showSync={false} />
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

  // Préparer les données pour le hero (les 3 films les plus récents avec poster)
  const heroFilms = useMemo(() => {
    return films
      .filter(f => f.poster || f.backdrop)
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
      <div className="flex justify-center items-center min-h-screen bg-black">
        <HLSLoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white px-4">
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

  // Barre compacte en haut quand une sync est en cours (affiche le contenu en dessous)
  const showSyncBar = !syncLoading && isSyncing;

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
    <div className="min-h-screen bg-black text-white flex flex-col">
      <NotificationContainer notifications={notifications} onRemove={removeNotification} />
      {/* Barre de progression compacte en haut quand sync en cours */}
      {showSyncBar && <SyncProgress compact externalStatus={syncStatus} />}
      {renderViewToggle('px-4 sm:px-6 lg:px-8 mb-4')}

      {/* Section Hero avec carousel */}
      {heroItemsWithOverview.length > 0 && (
        <div className="relative">
          <div className="absolute top-4 right-4 z-20">
            {renderViewToggle()}
          </div>
          <HeroSection
            items={heroItemsWithOverview}
            onPlay={handlePlay}
            onPrimaryAction={handleHeroDownload}
            primaryActionDisabled={heroDownloading}
            primaryButtonLabel={t('common.download')}
            primaryButtonIcon={<Download className="h-6 w-6 tv:h-8 tv:w-8" size={24} />}
          />
        </div>
      )}

      <div className="pb-8 tv:pb-12 flex-1">
        {/* Section Ajouts récents (tri par date indexeur) - première ligne */}
        {recentFilms.length > 0 && (
          <CarouselRow title={t('dashboard.recentAdditions')} autoScroll={false}>
            {recentFilms.map((film) => (
              <div key={film.id} className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px]">
                <LazyTorrentPoster item={{ ...film, type: 'movie' }} />
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
