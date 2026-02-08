import { useMemo, useEffect, useRef } from 'preact/hooks';
import { useDashboardData } from './hooks/useDashboardData';
import { useResumeWatching } from './hooks/useResumeWatching';
import { useSyncStatus } from './hooks/useSyncStatus';
import type { ContentItem } from '../../lib/client/types';
import CarouselRow from '../torrents/CarouselRow';
import { HeroSection } from './components/HeroSection';
import { LazyResumePoster } from './components/LazyResumePoster';
import { LazyTorrentPoster } from './components/LazyTorrentPoster';
import { SyncCard } from './components/SyncCard';
import { SyncProgress } from '../setup/components/SyncProgress';
import { useI18n } from '../../lib/i18n/useI18n';
import { translateGenre } from '../../lib/utils/genre-translation';
import HLSLoadingSpinner from '../ui/HLSLoadingSpinner';

export default function Dashboard() {
  const { t, language } = useI18n();
  const { data, loading, error, reloadSilent } = useDashboardData();
  const { resumeWatching } = useResumeWatching();
  const { syncStatus, isSyncing, loading: syncLoading } = useSyncStatus();
  const lastSyncProgressRef = useRef<number>(-1);

  // Rafraîchir les données au fur et à mesure de la synchronisation torrent
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
      if (key > 0) reloadSilent();
    }
  }, [isSyncing, syncStatus?.progress?.total_processed, syncStatus?.stats, reloadSilent]);

  const handlePlay = (item: ContentItem) => {
    window.location.href = `/player/${item.id}`;
  };

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
  
  // Vérifier s'il y a des données à afficher
  const hasData = data && (
    (data.popularMovies && data.popularMovies.length > 0) ||
    (data.popularSeries && data.popularSeries.length > 0) ||
    (data.continueWatching && data.continueWatching.length > 0) ||
    (data.recentAdditions && data.recentAdditions.length > 0) ||
    resumeWatching.length > 0
  );

  // Barre compacte en haut quand une sync est en cours (affiche le contenu en dessous)
  const showSyncBar = !syncLoading && isSyncing;

  // Afficher la carte de synchronisation si:
  // - Pas de données ET pas de synchronisation en cours ET pas de torrents synchronisés
  if ((!data || !hasData) && !syncLoading && !isSyncing && !hasTorrents) {
    return (
      <div className="min-h-screen bg-black text-white">
        <SyncCard type="all" />
      </div>
    );
  }

  if (!data) {
    if (!isSyncing) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white px-4">
          <div className="text-center max-w-2xl">
            <h2 className="text-3xl font-bold text-white mb-4">
              {t('common.noData')}
            </h2>
            <p className="text-gray-400 text-lg">
              {t('dashboard.noContent')}
            </p>
          </div>
        </div>
      );
    }
    // Sync en cours mais pas de données : afficher barre compacte + message
    return (
      <div className="min-h-screen bg-black text-white flex flex-col">
        {showSyncBar && <SyncProgress compact externalStatus={syncStatus} />}
        <div className="flex-1 flex flex-col items-center justify-center py-16 px-4">
          <p className="text-gray-400 text-center">{t('sync.syncDescription')}</p>
          <p className="text-gray-500 text-sm mt-2 text-center">
            Les contenus apparaîtront au fur et à mesure de la synchronisation.
          </p>
        </div>
      </div>
    );
  }

  // Grouper les films par genre principal uniquement (chaque film dans une seule ligne)
  const moviesByGenre = useMemo(() => {
    const grouped: Record<string, ContentItem[]> = {};
    
    if (data.popularMovies) {
      data.popularMovies.forEach(movie => {
        if (movie.genres && movie.genres.length > 0) {
          // Utiliser uniquement le genre principal (premier du tableau)
          const primaryGenre = movie.genres[0];
          if (!grouped[primaryGenre]) {
            grouped[primaryGenre] = [];
          }
          grouped[primaryGenre].push(movie);
        } else {
          // Films sans genre dans une catégorie "Autres" (clé interne pour i18n)
          const otherKey = '__other__';
          if (!grouped[otherKey]) {
            grouped[otherKey] = [];
          }
          grouped[otherKey].push(movie);
        }
      });
    }

    // Trier chaque groupe par date (plus récent en premier)
    Object.keys(grouped).forEach(genre => {
      grouped[genre].sort((a, b) => {
        const dateA = a.releaseDate ? new Date(a.releaseDate).getTime() : 0;
        const dateB = b.releaseDate ? new Date(b.releaseDate).getTime() : 0;
        return dateB - dateA;
      });
    });

    return grouped;
  }, [data.popularMovies]);

  // Grouper les séries par genre principal uniquement (chaque série dans une seule ligne)
  const seriesByGenre = useMemo(() => {
    const grouped: Record<string, ContentItem[]> = {};
    
    if (data.popularSeries) {
      data.popularSeries.forEach(serie => {
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
    }

    // Trier chaque groupe par date (plus récent en premier)
    Object.keys(grouped).forEach(genre => {
      grouped[genre].sort((a, b) => {
        const dateA = a.firstAirDate || a.releaseDate ? new Date(a.firstAirDate || a.releaseDate || '').getTime() : 0;
        const dateB = b.firstAirDate || b.releaseDate ? new Date(b.firstAirDate || b.releaseDate || '').getTime() : 0;
        return dateB - dateA;
      });
    });

    return grouped;
  }, [data.popularSeries]);

  // Trier les genres par ordre alphabétique
  const sortedMovieGenres = Object.keys(moviesByGenre).sort((a, b) => {
    if (a === '__other__') return 1;
    if (b === '__other__') return -1;
    return a.localeCompare(b);
  });
  const sortedSeriesGenres = Object.keys(seriesByGenre).sort((a, b) => {
    if (a === '__other__') return 1;
    if (b === '__other__') return -1;
    return a.localeCompare(b);
  });

  // Préparer les données pour le hero (combiner films et séries populaires)
  const heroItems: ContentItem[] = [];
  if (data.hero) {
    heroItems.push(data.hero);
  }
  if (data.popularMovies && data.popularMovies.length > 0) {
    heroItems.push(...data.popularMovies.slice(0, 2));
  }
  if (data.popularSeries && data.popularSeries.length > 0) {
    heroItems.push(...data.popularSeries.slice(0, 2));
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Barre de progression compacte en haut quand sync en cours */}
      {showSyncBar && <SyncProgress compact externalStatus={syncStatus} />}

      {/* Section Hero avec carousel */}
      {heroItems.length > 0 && (
        <HeroSection items={heroItems} onPlay={handlePlay} />
      )}

      <div className="pb-8 tv:pb-12">
        {/* Section Ajouts récents - juste sous le Hero */}
        {data.recentAdditions && data.recentAdditions.length > 0 && (
          <CarouselRow title={t('dashboard.recentAdditions')} autoScroll={false}>
            {data.recentAdditions.map((item) => (
              <div key={item.id} className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px]">
                <LazyTorrentPoster item={item} />
              </div>
            ))}
          </CarouselRow>
        )}

        {/* Section Torrents rapides (beaucoup de seeders) */}
        {data.fastTorrents && data.fastTorrents.length > 0 && (
          <CarouselRow title={t('dashboard.fastTorrents')} autoScroll={false}>
            {data.fastTorrents.map((item) => (
              <div key={item.id} className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px]">
                <LazyTorrentPoster item={item} />
              </div>
            ))}
          </CarouselRow>
        )}

        {/* Section Reprendre la lecture */}
        {(resumeWatching.length > 0 || (data.continueWatching && data.continueWatching.length > 0)) && (
          <CarouselRow title={t('dashboard.resumeWatching')} autoScroll={false}>
            {(resumeWatching.length > 0 ? resumeWatching : data.continueWatching || []).map((item) => (
              <div key={item.id} className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px] relative">
                <LazyResumePoster item={item} />
              </div>
            ))}
          </CarouselRow>
        )}

        {/* Section Films populaires - par catégories */}
        {sortedMovieGenres.length > 0 ? (
          sortedMovieGenres.map(genre => {
            const genreMovies = moviesByGenre[genre];
            if (genreMovies.length === 0) return null;

            const genreTitle =
              genre === '__other__' ? t('common.others') : translateGenre(genre, language);

            return (
              <CarouselRow key={`movies-${genre}`} title={t('dashboard.moviesGenre', { genre: genreTitle })} autoScroll={false}>
                {genreMovies.map((item) => (
                  <div key={item.id} className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px]">
                    <LazyTorrentPoster item={item} />
                  </div>
                ))}
              </CarouselRow>
            );
          })
        ) : (
          // Si aucun genre, afficher tous les films dans une seule ligne
          data.popularMovies && data.popularMovies.length > 0 && (
            <CarouselRow title={t('dashboard.popularMovies')} autoScroll={false}>
              {data.popularMovies.map((item) => (
                <div key={item.id} className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px]">
                  <LazyTorrentPoster item={item} />
                </div>
              ))}
            </CarouselRow>
          )
        )}

        {/* Section Séries populaires - par catégories */}
        {sortedSeriesGenres.length > 0 ? (
          sortedSeriesGenres.map(genre => {
            const genreSeries = seriesByGenre[genre];
            if (genreSeries.length === 0) return null;

            const genreTitle =
              genre === '__other__' ? t('common.others') : translateGenre(genre, language);

            return (
              <CarouselRow key={`series-${genre}`} title={t('dashboard.seriesGenre', { genre: genreTitle })} autoScroll={false}>
                {genreSeries.map((item) => (
                  <div key={item.id} className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px]">
                    <LazyTorrentPoster item={item} />
                  </div>
                ))}
              </CarouselRow>
            );
          })
        ) : (
          // Si aucun genre, afficher toutes les séries dans une seule ligne
          data.popularSeries && data.popularSeries.length > 0 && (
            <CarouselRow title={t('dashboard.popularSeries')} autoScroll={false}>
              {data.popularSeries.map((item) => (
                <div key={item.id} className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px]">
                  <LazyTorrentPoster item={item} />
                </div>
              ))}
            </CarouselRow>
          )
        )}
      </div>
    </div>
  );
}
