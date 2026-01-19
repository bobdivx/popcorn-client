import { useState, useEffect, useMemo } from 'preact/hooks';
import { serverApi } from '../../lib/client/server-api';
import type { FilmData } from '../../lib/client/types';
import { HeroSection } from './components/HeroSection';
import CarouselRow from '../torrents/CarouselRow';
import { TorrentPoster } from './components/TorrentPoster';
import type { ContentItem } from '../../lib/client/types';

export default function FilmsDashboard() {
  const [films, setFilms] = useState<FilmData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadFilms();
  }, []);

  const loadFilms = async () => {
    try {
      setLoading(true);
      setError(null);
      console.log('[FILMS DASHBOARD] Chargement des films...');
      const response = await serverApi.getFilmsData();
      
      console.log('[FILMS DASHBOARD] Réponse reçue:', {
        success: response.success,
        hasData: !!response.data,
        dataLength: Array.isArray(response.data) ? response.data.length : 'N/A',
        error: response.error,
        message: response.message,
      });
      
      if (response.success && response.data) {
        if (!Array.isArray(response.data)) {
          console.error('[FILMS DASHBOARD] Réponse invalide: data n\'est pas un tableau', response.data);
          setError('Réponse invalide: liste de films attendue');
          return;
        }
        console.log(`[FILMS DASHBOARD] ${response.data.length} film(s) reçu(s) avant tri`);
        // Trier par date de sortie (les plus récents en premier)
        const sortedFilms = [...response.data].sort((a, b) => {
          const dateA = a.releaseDate ? new Date(a.releaseDate).getTime() : 0;
          const dateB = b.releaseDate ? new Date(b.releaseDate).getTime() : 0;
          return dateB - dateA; // Plus récent en premier
        });
        console.log(`[FILMS DASHBOARD] ${sortedFilms.length} film(s) après tri, mise à jour de l'état`);
        setFilms(sortedFilms);
      } else {
        console.error('[FILMS DASHBOARD] Erreur:', response.message || response.error);
        setError(response.message || 'Erreur lors du chargement des films');
      }
    } catch (err) {
      console.error('[FILMS DASHBOARD] Exception:', err);
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  };

  const handlePlay = (item: ContentItem) => {
    window.location.href = `/player/${item.id}`;
  };

  // Grouper les films par genre
  const filmsByGenre = useMemo(() => {
    const grouped: Record<string, FilmData[]> = {};
    
    films.forEach(film => {
      if (film.genres && film.genres.length > 0) {
        film.genres.forEach(genre => {
          if (!grouped[genre]) {
            grouped[genre] = [];
          }
          // Éviter les doublons
          if (!grouped[genre].find(f => f.id === film.id)) {
            grouped[genre].push(film);
          }
        });
      } else {
        // Films sans genre dans une catégorie "Autres"
        if (!grouped['Autres']) {
          grouped['Autres'] = [];
        }
        if (!grouped['Autres'].find(f => f.id === film.id)) {
          grouped['Autres'].push(film);
        }
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

  if (films.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white px-4">
        <div className="text-center max-w-2xl">
          <h2 className="text-3xl font-bold text-white mb-4">
            Aucun film disponible
          </h2>
          <p className="text-gray-400 text-lg">
            Aucun film n'est disponible pour le moment.
          </p>
          <p className="text-gray-500 text-sm mt-2">
            Vérifiez la console pour plus de détails.
          </p>
        </div>
      </div>
    );
  }

  // Trier les genres par ordre alphabétique
  const sortedGenres = Object.keys(filmsByGenre).sort();
  
  console.log(`[FILMS DASHBOARD] Affichage: ${films.length} film(s), ${sortedGenres.length} genre(s)`, {
    genres: sortedGenres,
    filmsByGenreCounts: Object.fromEntries(
      Object.entries(filmsByGenre).map(([genre, films]) => [genre, films.length])
    ),
  });

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Section Hero avec carousel */}
      {heroFilms.length > 0 && (
        <HeroSection items={heroFilms} onPlay={handlePlay} />
      )}

      <div className="pb-8 tv:pb-12">
        {/* Afficher une ligne par genre */}
        {sortedGenres.length > 0 ? (
          sortedGenres.map(genre => {
            const genreFilms = filmsByGenre[genre];
            if (genreFilms.length === 0) return null;

            return (
              <CarouselRow key={genre} title={genre}>
                {genreFilms.map((film) => (
                  <div key={film.id} className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px]">
                    <TorrentPoster item={{ ...film, type: 'movie' }} />
                  </div>
                ))}
              </CarouselRow>
            );
          })
        ) : (
          // Si aucun genre, afficher tous les films dans une seule ligne
          <CarouselRow title="Tous les films">
            {films.map((film) => (
              <div key={film.id} className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px]">
                <TorrentPoster item={{ ...film, type: 'movie' }} />
              </div>
            ))}
          </CarouselRow>
        )}
      </div>
    </div>
  );
}
