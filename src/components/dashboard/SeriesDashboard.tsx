import { useState, useEffect, useMemo } from 'preact/hooks';
import { serverApi } from '../../lib/client/server-api';
import type { SeriesData } from '../../lib/client/types';
import { HeroSection } from './components/HeroSection';
import CarouselRow from '../torrents/CarouselRow';
import { TorrentPoster } from './components/TorrentPoster';
import type { ContentItem } from '../../lib/client/types';

export default function SeriesDashboard() {
  const [series, setSeries] = useState<SeriesData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSeries();
  }, []);

  const loadSeries = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await serverApi.getSeriesData();
      
      if (response.success && response.data) {
        if (!Array.isArray(response.data)) {
          setError('Réponse invalide: liste de séries attendue');
          return;
        }
        // Trier par date de première diffusion (les plus récents en premier)
        const sortedSeries = [...response.data].sort((a, b) => {
          const dateA = a.firstAirDate ? new Date(a.firstAirDate).getTime() : 0;
          const dateB = b.firstAirDate ? new Date(b.firstAirDate).getTime() : 0;
          return dateB - dateA; // Plus récent en premier
        });
        setSeries(sortedSeries);
      } else {
        setError(response.message || 'Erreur lors du chargement des séries');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  };

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
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white px-4">
        <div className="text-center max-w-2xl">
          <h2 className="text-3xl font-bold text-white mb-4">
            Aucune série disponible
          </h2>
          <p className="text-gray-400 text-lg">
            Aucune série n'est disponible pour le moment.
          </p>
        </div>
      </div>
    );
  }

  // Trier les genres par ordre alphabétique
  const sortedGenres = Object.keys(seriesByGenre).sort();

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Section Hero avec carousel */}
      {heroSeries.length > 0 && (
        <HeroSection items={heroSeries} onPlay={handlePlay} />
      )}

      <div className="pb-8 tv:pb-12">
        {/* Afficher une ligne par genre */}
        {sortedGenres.map(genre => {
          const genreSeries = seriesByGenre[genre];
          if (genreSeries.length === 0) return null;

          return (
            <CarouselRow key={genre} title={genre}>
              {genreSeries.map((serie) => (
                <div key={serie.id} className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px]">
                  <TorrentPoster item={{ ...serie, type: 'tv' }} />
                </div>
              ))}
            </CarouselRow>
          );
        })}
      </div>
    </div>
  );
}
