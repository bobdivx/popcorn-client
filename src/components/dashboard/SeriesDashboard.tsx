import { useMemo, useEffect, useRef, useState, useCallback } from 'preact/hooks';
import { Download, Tv, Library as LibraryIcon } from 'lucide-preact';
import type { SeriesData } from '../../lib/client/types';
import { HeroSection } from './components/HeroSection';
import CarouselRow from '../torrents/CarouselRow';
import { LazyTorrentPoster } from './components/LazyTorrentPoster';
import type { ContentItem } from '../../lib/client/types';
import { useInfiniteSeries } from './hooks/useInfiniteSeries';
import { useRecentSeries } from './hooks/useRecentSeries';
import { useSyncStatus } from './hooks/useSyncStatus';
import { SyncProgress } from '../setup/components/SyncProgress';
import { SyncCard } from './components/SyncCard';
import { useI18n } from '../../lib/i18n/useI18n';
import { translateGenre } from '../../lib/utils/genre-translation';
import HLSLoadingSpinner from '../ui/HLSLoadingSpinner';
import { serverApi } from '../../lib/client/server-api';
import { NotificationContainer } from '../ui/Notification';
import { useNotifications } from '../torrents/MediaDetailPage/hooks/useNotifications';
import { resolveHeroTorrent } from './utils/heroDownload';
import { handleDownload } from '../torrents/MediaDetailPage/actions/download';
import Library from '../Library';

export default function SeriesDashboard() {
  const { t, language } = useI18n();
  const { series, loading, error, hasMore, loadMore, refetchSilent } = useInfiniteSeries();
  const { series: recentSeries } = useRecentSeries();
  const { syncStatus, isSyncing, loading: syncLoading } = useSyncStatus();
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);
  const lastSyncProgressRef = useRef<number>(-1);
  const { notifications, addNotification, removeNotification } = useNotifications();
  const [heroDownloading, setHeroDownloading] = useState(false);
  const [viewMode, setViewMode] = useState<'torrents' | 'library'>('torrents');
  const [autoViewChecked, setAutoViewChecked] = useState(false);
  const switchTorrentRef = useRef<HTMLButtonElement>(null);
  const switchLibraryRef = useRef<HTMLButtonElement>(null);

  // À l'arrivée sur la page, focus sur le switch (accessible télécommande / clavier)
  useEffect(() => {
    if (loading) return;
    const el = viewMode === 'torrents' ? switchTorrentRef.current : switchLibraryRef.current;
    if (el) {
      const t = setTimeout(() => el.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [loading, viewMode]);

  // Rafraîchir la liste des séries au fur et à mesure de la synchronisation torrent
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

  // Fallback UX: si l'onglet Torrents est vide mais que la bibliothèque locale a des séries,
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
        const hasLibrarySeries = res.data.some((item: any) => {
          const category = String(item?.category ?? '').toUpperCase();
          const tmdbType = String(item?.tmdb_type ?? '').toLowerCase();
          return category === 'SERIES' || tmdbType === 'tv' || tmdbType === 'series';
        });
        if (series.length === 0 && hasLibrarySeries) {
          setViewMode('library');
        }
      } finally {
        setAutoViewChecked(true);
      }
    };

    checkLibraryFallback();
  }, [loading, series.length, autoViewChecked, viewMode]);

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
          ref={switchTorrentRef}
          type="button"
          data-focusable
          tabIndex={0}
          onClick={() => setViewMode('torrents')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-colors min-h-[44px] tv:min-h-[52px] focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-black ${
            viewMode === 'torrents' ? 'bg-white text-black' : 'text-white/80 hover:bg-white/10'
          }`}
          aria-pressed={viewMode === 'torrents'}
          aria-label={t('common.torrents')}
        >
          <Tv className="w-4 h-4" />
          {t('common.torrents')}
        </button>
        <button
          ref={switchLibraryRef}
          type="button"
          data-focusable
          tabIndex={0}
          onClick={() => setViewMode('library')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-colors min-h-[44px] tv:min-h-[52px] focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-black ${
            viewMode === 'library' ? 'bg-white text-black' : 'text-white/80 hover:bg-white/10'
          }`}
          aria-pressed={viewMode === 'library'}
          aria-label={t('library.title')}
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
        <Library initialContentFilter="series" showHero={false} showFilters={false} showSync={false} />
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

  // Grouper les séries par genre principal uniquement (chaque série dans une seule ligne)
  const seriesByGenre = useMemo(() => {
    const grouped: Record<string, SeriesData[]> = {};
    
    series.forEach(serie => {
      if (serie.genres && serie.genres.length > 0) {
        // Utiliser uniquement le genre principal (premier du tableau)
        const primaryGenre = serie.genres[0];
        if (!grouped[primaryGenre]) {
          grouped[primaryGenre] = [];
        }
        grouped[primaryGenre].push(serie);
      } else {
        // Séries sans genre dans une catégorie "Autres" (clé interne pour i18n)
        const otherKey = '__other__';
        if (!grouped[otherKey]) {
          grouped[otherKey] = [];
        }
        grouped[otherKey].push(serie);
      }
    });

    // Trier chaque groupe par date (plus récent en premier)
    Object.keys(grouped).forEach(genre => {
      grouped[genre].sort((a, b) => {
        const dateA = a.firstAirDate ? new Date(a.firstAirDate).getTime() : 0;
        const dateB = b.firstAirDate ? new Date(b.firstAirDate).getTime() : 0;
        return dateB - dateA;
      });
    });

    return grouped;
  }, [series]);

  // Préparer les données pour le hero (les 3 séries les plus récentes avec poster)
  const heroSeries = useMemo(() => {
    return series
      .filter(s => s.poster || s.backdrop)
      .slice(0, 3)
      .map(s => ({
        ...s,
        type: 'tv' as const,
      }));
  }, [series]);

  // Résumés localisés pour le hero (langue courante via TMDB)
  const [heroOverviews, setHeroOverviews] = useState<Record<string, string>>({});
  const tmdbLang = language === 'fr' ? 'fr-FR' : 'en-US';
  useEffect(() => {
    if (heroSeries.length === 0) {
      setHeroOverviews({});
      return;
    }
    let cancelled = false;
    const next: Record<string, string> = {};
    (async () => {
      for (const item of heroSeries) {
        if (cancelled || !item.tmdbId) continue;
        try {
          const res = await serverApi.getTmdbTvDetail(item.tmdbId, tmdbLang);
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
  }, [tmdbLang, heroSeries.map(f => `${f.id}:${f.tmdbId ?? ''}`).join('|')]);

  // Hero items avec overview dans la langue courante (priorité au fetch TMDB)
  const heroItemsWithOverview = useMemo(() => {
    return heroSeries.map(f => ({
      ...f,
      overview: heroOverviews[f.id] ?? f.overview,
    }));
  }, [heroSeries, heroOverviews]);

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

  // Contenu principal quand series.length === 0
  const renderEmptyContent = () => {
    if (!syncLoading && !isSyncing && !hasTorrents) {
      return (
        <div className="flex-1 flex items-center justify-center min-h-[50vh]">
          <SyncCard type="series" />
        </div>
      );
    }
    if (isSyncing) {
      return (
        <div className="flex flex-col items-center justify-center flex-1 py-16 px-4">
          <p className="text-gray-400 text-center">
            {t('sync.seriesSyncDescription')}
          </p>
          <p className="text-gray-500 text-sm mt-2 text-center">
            Les séries apparaîtront au fur et à mesure de la synchronisation.
          </p>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center flex-1 py-16 px-4">
        <h2 className="text-2xl font-bold text-white mb-2">Aucune série disponible</h2>
        <p className="text-gray-400 text-center">Aucune série n'est disponible pour le moment.</p>
      </div>
    );
  };

  // Trier les genres par ordre alphabétique
  const sortedGenres = Object.keys(seriesByGenre).sort((a, b) => {
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
      {/* Switch Torrent / Bibliothèque : toujours sous le header, accessible à la télécommande */}
      <div className="px-4 sm:px-6 lg:px-8 py-3 flex items-center">
        {renderViewToggle()}
      </div>

      {/* Section Hero avec carousel (toujours en dessous du header et du switch) */}
      {heroItemsWithOverview.length > 0 && (
        <div className="relative">
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
        {recentSeries.length > 0 && (
          <CarouselRow title={t('dashboard.recentAdditions')} autoScroll={false}>
            {recentSeries.map((serie) => (
              <div key={serie.id} className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px]">
                <LazyTorrentPoster item={{ ...serie, type: 'tv' }} />
              </div>
            ))}
          </CarouselRow>
        )}
        {/* Contenu vide : SyncCard ou message */}
        {series.length === 0 ? (
          renderEmptyContent()
        ) : sortedGenres.length > 0 ? (
          sortedGenres.map(genre => {
            const genreSeries = seriesByGenre[genre];
            if (genreSeries.length === 0) return null;

            const genreTitle =
              genre === '__other__' ? t('common.others') : translateGenre(genre, language);

            return (
              <CarouselRow key={genre} title={genreTitle} autoScroll={false}>
                {genreSeries.map((serie) => (
                  <div key={serie.id} className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px]">
                    <LazyTorrentPoster item={{ ...serie, type: 'tv' }} />
                  </div>
                ))}
              </CarouselRow>
            );
          })
        ) : (
          // Si aucun genre, afficher toutes les séries dans une seule ligne
          <CarouselRow title={t('sync.allSeries')} autoScroll={false}>
            {series.map((serie) => (
              <div key={serie.id} className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px]">
                <LazyTorrentPoster item={{ ...serie, type: 'tv' }} />
              </div>
            ))}
          </CarouselRow>
        )}
        {/* Trigger pour charger plus d'éléments */}
        {series.length > 0 && hasMore && <div ref={loadMoreTriggerRef} className="h-1" />}
      </div>
    </div>
  );
}
