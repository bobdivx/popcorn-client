import { useMemo, useEffect, useRef } from 'preact/hooks';
import type { SeriesData } from '../../lib/client/types';
import { HeroSection } from './components/HeroSection';
import CarouselRow from '../torrents/CarouselRow';
import { LazyTorrentPoster } from './components/LazyTorrentPoster';
import type { ContentItem } from '../../lib/client/types';
import { useInfiniteSeries } from './hooks/useInfiniteSeries';
import { useSyncStatus } from './hooks/useSyncStatus';
import { SyncProgress } from '../setup/components/SyncProgress';

export default function SeriesDashboard() {
  const { series, loading, error, hasMore, loadMore } = useInfiniteSeries();
  const { isSyncing, loading: syncLoading } = useSyncStatus();
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);

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

  // Grouper les séries par genre
  const seriesByGenre = useMemo(() => {
    const grouped: Record<string, SeriesData[]> = {};
    
    series.forEach(serie => {
      if (serie.genres && serie.genres.length > 0) {
        serie.genres.forEach(genre => {
          if (!grouped[genre]) {
            grouped[genre] = [];
          }
          // Éviter les doublons
          if (!grouped[genre].find(s => s.id === serie.id)) {
            grouped[genre].push(serie);
          }
        });
      } else {
        // Séries sans genre dans une catégorie "Autres"
        if (!grouped['Autres']) {
          grouped['Autres'] = [];
        }
        if (!grouped['Autres'].find(s => s.id === serie.id)) {
          grouped['Autres'].push(serie);
        }
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

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-black">
        <span className="loading loading-spinner loading-lg text-white"></span>
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

  if (series.length === 0) {
    // Si une synchronisation est en cours, afficher la progression
    if (!syncLoading && isSyncing) {
      return (
        <div className="min-h-screen bg-black text-white px-4 py-8">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-white mb-4">
                Synchronisation en cours
              </h2>
              <p className="text-gray-400 text-lg">
                Les séries sont en cours de synchronisation depuis vos indexers.
              </p>
            </div>
            <SyncProgress />
          </div>
        </div>
      );
    }

    // Sinon, afficher le message d'absence de séries
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white px-4">
        <div className="text-center max-w-2xl">
          <h2 className="text-3xl font-bold text-white mb-4">
            Aucune série disponible
          </h2>
          <p className="text-gray-400 text-lg">
            Aucune série n'est disponible pour le moment.
          </p>
          <p className="text-gray-500 text-sm mt-2">
            Vérifiez la console pour plus de détails.
          </p>
        </div>
      </div>
    );
  }

  // Trier les genres par ordre alphabétique
  const sortedGenres = Object.keys(seriesByGenre).sort();
  
  console.log(`[SERIES DASHBOARD] Affichage: ${series.length} série(s), ${sortedGenres.length} genre(s)`, {
    genres: sortedGenres,
    seriesByGenreCounts: Object.fromEntries(
      Object.entries(seriesByGenre).map(([genre, series]) => [genre, series.length])
    ),
  });

  // Debug: Vérifier les données des séries pour comprendre pourquoi les images ne s'affichent pas
  if (series.length > 0) {
    const firstSerie = series[0];
    console.log('[SERIES DASHBOARD] Première série:', {
      id: firstSerie.id,
      title: firstSerie.title,
      poster: firstSerie.poster,
      backdrop: firstSerie.backdrop,
      hasPoster: !!firstSerie.poster,
      hasBackdrop: !!firstSerie.backdrop,
      allKeys: Object.keys(firstSerie),
    });
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Section Hero avec carousel */}
      {heroSeries.length > 0 && (
        <HeroSection items={heroSeries} onPlay={handlePlay} />
      )}

      <div className="pb-8 tv:pb-12">
        {/* Afficher une ligne par genre */}
        {sortedGenres.length > 0 ? (
          sortedGenres.map(genre => {
            const genreSeries = seriesByGenre[genre];
            if (genreSeries.length === 0) return null;

            return (
              <CarouselRow key={genre} title={genre}>
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
          <CarouselRow title="Toutes les séries">
            {series.map((serie) => (
              <div key={serie.id} className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px]">
                <LazyTorrentPoster item={{ ...serie, type: 'tv' }} />
              </div>
            ))}
          </CarouselRow>
        )}
        {/* Trigger pour charger plus d'éléments */}
        {hasMore && <div ref={loadMoreTriggerRef} className="h-1" />}
      </div>
    </div>
  );
}
