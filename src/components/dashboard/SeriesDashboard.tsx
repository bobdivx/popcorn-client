import { useMemo, useEffect, useRef, useState, useCallback } from 'preact/hooks';
import { Download, Tv, Library as LibraryIcon, Play } from 'lucide-preact';
import type { SeriesData } from '../../lib/client/types';
import { HeroSection } from './components/HeroSection';
import CarouselRow from '../torrents/CarouselRow';
import { LazyTorrentPoster } from './components/LazyTorrentPoster';
import { LazyResumePoster } from './components/LazyResumePoster';
import type { ContentItem } from '../../lib/client/types';
import { useInfiniteSeries } from './hooks/useInfiniteSeries';
import { useFavoritesItems } from './hooks/useFavoritesItems';
import { useResumeWatching } from './hooks/useResumeWatching';
import { useSyncStatus } from './hooks/useSyncStatus';
import { refreshSyncStatusStore } from '../../lib/sync-status-store';
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
import { useSubscriptionMe } from '../torrents/MediaDetailPage/hooks/useSubscriptionMe';
import Library from '../Library';

const MIN_ITEMS_PER_GENRE_ROW = 10;

export default function SeriesDashboard() {
  const { t, language } = useI18n();
  const { series, loading, error, hasMore, loadMore, clearAndRefetch, refetchSilent, refetchReplaceSilent } = useInfiniteSeries();
  const { items: favoritesItems } = useFavoritesItems();
  const { resumeWatching, rewatchWatching, watchedIds } = useResumeWatching();
  const { syncStatus, isSyncing, loading: syncLoading } = useSyncStatus();
  const resumeSeries = useMemo(() => resumeWatching.filter((item) => item.type === 'tv'), [resumeWatching]);
  const rewatchSeries = useMemo(() => rewatchWatching.filter((item) => item.type === 'tv'), [rewatchWatching]);
  const favoritesSeries = useMemo(() => favoritesItems.filter((item) => item.type === 'tv'), [favoritesItems]);
  const isWatched = useCallback(
    (item: ContentItem) => watchedIds.has(item.id) || (item.tmdbId != null && watchedIds.has(String(item.tmdbId))),
    [watchedIds]
  );
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);
  const lastSyncProgressRef = useRef<number>(-1);
  const lastRefetchSilentAtRef = useRef<number>(0);
  const SYNC_REFETCH_THROTTLE_MS = 2500;
  const clearedBySyncRef = useRef(false);
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

  // Au montage : mise à jour du statut sync pour l’affichage (Films 0 / Séries 0).
  useEffect(() => {
    refreshSyncStatusStore();
  }, []);

  // Quand l’onglet redevient visible : recharger la liste depuis le backend (source de vérité). Pas de spinner.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && viewMode === 'torrents') refetchReplaceSilent();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [viewMode, refetchReplaceSilent]);

  // Réinitialiser la garde quand il y a à nouveau des torrents (pour un prochain "vider").
  const totalTorrentsFromSync = syncStatus?.stats
    ? Object.values(syncStatus.stats).reduce((a: number, b: unknown) => a + Number(b), 0)
    : -1;
  const hasExplicitSyncStats = syncStatus?.stats && Object.keys(syncStatus.stats).length > 0;
  if (totalTorrentsFromSync > 0) clearedBySyncRef.current = false;

  // Source de vérité : si la sync dit explicitement 0 torrents (stats avec clés et somme 0), vider et recharger une seule fois.
  // Ne pas vider quand stats est vide (ex. mode démo ou statut pas encore renseigné).
  useEffect(() => {
    if (syncLoading || !hasExplicitSyncStats || totalTorrentsFromSync !== 0 || viewMode !== 'torrents') return;
    if (clearedBySyncRef.current) return;
    clearedBySyncRef.current = true;
    clearAndRefetch();
  }, [syncLoading, hasExplicitSyncStats, totalTorrentsFromSync, viewMode, clearAndRefetch]);

  // Rafraîchir la liste des séries au fur et à mesure de la synchronisation torrent (throttlé pour éviter que les cartes bougent en continu)
  const wasSyncingRef = useRef(false);
  useEffect(() => {
    if (!isSyncing) {
      if (wasSyncingRef.current) refetchSilent(); // Rafraîchir une dernière fois à la fin de la sync
      wasSyncingRef.current = false;
      lastSyncProgressRef.current = -1;
      return;
    }
    wasSyncingRef.current = true;
    if (!syncStatus) return;
    const totalProcessed = syncStatus.progress?.total_processed ?? 0;
    const statsSum = syncStatus.stats
      ? Object.values(syncStatus.stats).reduce((a, b) => a + b, 0)
      : 0;
    const key = totalProcessed + statsSum;
    if (key > lastSyncProgressRef.current) {
      lastSyncProgressRef.current = key;
      if (key > 0) {
        const now = Date.now();
        if (now - lastRefetchSilentAtRef.current >= SYNC_REFETCH_THROTTLE_MS) {
          lastRefetchSilentAtRef.current = now;
          refetchSilent();
        }
      }
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
          setViewModeAndUrl('library');
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

  const switchBarClasses = 'relative z-30 shrink-0 w-full px-4 py-3 sm:px-6 sm:py-3 lg:px-8 bg-black flex items-center justify-center min-[640px]:justify-start';
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
        <Tv className="w-4 h-4 shrink-0" />
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
      <div className="min-h-screen bg-page text-white flex flex-col safe-area-x">
        <NotificationContainer notifications={notifications} onRemove={removeNotification} />
        {showSyncBar && <SyncProgress compact externalStatus={syncStatus} />}
        <div className={switchBarClasses}>{renderViewToggle()}</div>
        <div className="pb-8 tv:pb-12 flex-1 safe-area-bottom" style={{ paddingBottom: 'max(2rem, var(--safe-area-inset-bottom))' }}>
          <Library initialContentFilter="series" showHero={false} showFilters={false} showSync={false} />
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

  // Normaliser un élément genre (string ou objet TMDB { id, name }) en clé string
  const genreToKey = (g: string | { id?: number; name?: string }): string => {
    if (typeof g === 'string') return g.trim();
    if (g && typeof g === 'object' && typeof (g as { name?: string }).name === 'string') {
      return (g as { name: string }).name.trim();
    }
    return '';
  };

  // Grouper les séries par genre ; chaque ligne est triée avec les plus récentes au début.
  const seriesByGenre = useMemo(() => {
    const grouped: Record<string, SeriesData[]> = {};
    const watched = new Set(watchedIds);

    series.forEach(serie => {
      if (watched.has(serie.id) || (serie.tmdbId != null && watched.has(String(serie.tmdbId)))) return;
      if (serie.genres && serie.genres.length > 0) {
        const seenGenres = new Set<string>();
        for (const g of serie.genres) {
          const key = genreToKey(g);
          if (!key || seenGenres.has(key)) continue;
          seenGenres.add(key);
          if (!grouped[key]) grouped[key] = [];
          grouped[key].push(serie);
        }
      } else {
        const otherKey = '__other__';
        if (!grouped[otherKey]) grouped[otherKey] = [];
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
  }, [series, watchedIds]);

  // Lignes "Nouveautés" (par date de première diffusion TMDB) et "Les plus seedées"
  const recentSeriesRow = useMemo(() => {
    if (series.length === 0) return [];
    return [...series]
      .sort((a, b) => {
        const dateA = a.firstAirDate ? new Date(a.firstAirDate).getTime() : 0;
        const dateB = b.firstAirDate ? new Date(b.firstAirDate).getTime() : 0;
        return dateB - dateA;
      })
      .slice(0, 40);
  }, [series]);

  const mostSeededSeriesRow = useMemo(() => {
    const withSeeds = series.filter((s) => typeof s.seeds === 'number' && (s.seeds ?? 0) > 0);
    if (withSeeds.length === 0) return [];
    return withSeeds
      .slice()
      .sort((a, b) => (b.seeds ?? 0) - (a.seeds ?? 0))
      .slice(0, 40);
  }, [series]);

  // Préparer les données pour le hero (les 3 séries les plus récentes par date de sortie TMDB, avec poster)
  const heroSeries = useMemo(() => {
    return [...series]
      .filter(s => s.poster || s.backdrop)
      .sort((a, b) => {
        const dateA = a.firstAirDate ? new Date(a.firstAirDate).getTime() : 0;
        const dateB = b.firstAirDate ? new Date(b.firstAirDate).getTime() : 0;
        return dateB - dateA;
      })
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

  // Contenu principal quand series.length === 0 — un seul état affiché selon sync pour éviter le scintillement
  const renderEmptyContent = () => {
    if (syncLoading) {
      return (
        <div className="flex-1 flex items-center justify-center min-h-[50vh]">
          <p className="text-gray-400 text-center">{t('common.loading')}</p>
        </div>
      );
    }
    if (!isSyncing && !hasTorrents) {
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
    <div className="min-h-screen bg-page text-white flex flex-col safe-area-x">
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

      <div className="pb-8 tv:pb-12 flex-1 safe-area-bottom" style={{ paddingBottom: 'max(2rem, var(--safe-area-inset-bottom))' }}>
        {/* Section Reprendre la lecture — en tête de page */}
        {resumeSeries.length > 0 && (
          <CarouselRow title={t('dashboard.resumeWatching')} autoScroll={false}>
            {resumeSeries.map((item) => (
              <div key={item.id} className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px] relative">
                <LazyResumePoster item={item} />
              </div>
            ))}
          </CarouselRow>
        )}
        {/* Section Revoir (séries déjà terminées) */}
        {rewatchSeries.length > 0 && (
          <CarouselRow title={t('dashboard.rewatch')} autoScroll={false}>
            {rewatchSeries.map((item) => (
              <div key={item.id} className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px] relative">
                <LazyResumePoster item={item} />
              </div>
            ))}
          </CarouselRow>
        )}
        {/* Section À regarder plus tard (favoris séries) */}
        {favoritesSeries.length > 0 && (
          <CarouselRow title={t('dashboard.watchLater')} autoScroll={false}>
            {favoritesSeries.map((item) => (
              <div key={item.id} className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px]">
                <LazyTorrentPoster item={item} />
              </div>
            ))}
          </CarouselRow>
        )}
        {/* Section Nouveautés séries (par date de première diffusion TMDB) — masquée pendant la sync torrent */}
        {!isSyncing && recentSeriesRow.length >= MIN_ITEMS_PER_GENRE_ROW && (
          <CarouselRow title={t('dashboard.newReleasesSeries')} autoScroll={false}>
            {recentSeriesRow.map((serie) => (
              <div
                key={serie.id}
                className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px]"
              >
                <LazyTorrentPoster item={{ ...serie, type: 'tv' }} />
              </div>
            ))}
          </CarouselRow>
        )}
        {/* Section Les plus seedées (torrents avec le plus de seed) */}
        {mostSeededSeriesRow.length >= MIN_ITEMS_PER_GENRE_ROW && (
          <CarouselRow title={t('dashboard.mostShared')} autoScroll={false}>
            {mostSeededSeriesRow.map((serie) => (
              <div
                key={serie.id}
                className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px]"
              >
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
            // Pour un rendu plus "Netflix", on masque les genres avec trop peu d'éléments.
            if (!genreSeries || genreSeries.length < MIN_ITEMS_PER_GENRE_ROW) return null;

            const genreTitle =
              genre === '__other__' ? t('common.others') : translateGenre(genre, language);
            const inDb = genre !== '__other__' ? syncStatus?.genre_counts_series?.[genre] : undefined;
            const titleBadge =
              typeof inDb === 'number' ? `${genreSeries.length} / ${inDb}` : undefined;

            return (
              <CarouselRow key={genre} title={genreTitle} titleBadge={titleBadge} autoScroll={false}>
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
