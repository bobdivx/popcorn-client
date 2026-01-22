import { useMemo } from 'preact/hooks';
import { useDashboardData } from './hooks/useDashboardData';
import { useResumeWatching } from './hooks/useResumeWatching';
import type { ContentItem } from '../../lib/client/types';
import CarouselRow from '../torrents/CarouselRow';
import { HeroSection } from './components/HeroSection';
import { LazyResumePoster } from './components/LazyResumePoster';
import { LazyTorrentPoster } from './components/LazyTorrentPoster';

export default function Dashboard() {
  const { data, loading, error } = useDashboardData();
  const { resumeWatching } = useResumeWatching();

  const handlePlay = (item: ContentItem) => {
    window.location.href = `/player/${item.id}`;
  };

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

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white px-4">
        <div className="text-center max-w-2xl">
          <h2 className="text-3xl font-bold text-white mb-4">
            Aucune donnée disponible
          </h2>
          <p className="text-gray-400 text-lg">
            Aucun contenu n'est disponible pour le moment.
          </p>
        </div>
      </div>
    );
  }

  // Grouper les films par genre
  const moviesByGenre = useMemo(() => {
    const grouped: Record<string, ContentItem[]> = {};
    
    if (data.popularMovies) {
      data.popularMovies.forEach(movie => {
        if (movie.genres && movie.genres.length > 0) {
          movie.genres.forEach(genre => {
            if (!grouped[genre]) {
              grouped[genre] = [];
            }
            // Éviter les doublons
            if (!grouped[genre].find(m => m.id === movie.id)) {
              grouped[genre].push(movie);
            }
          });
        } else {
          // Films sans genre dans une catégorie "Autres"
          if (!grouped['Autres']) {
            grouped['Autres'] = [];
          }
          if (!grouped['Autres'].find(m => m.id === movie.id)) {
            grouped['Autres'].push(movie);
          }
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

  // Grouper les séries par genre
  const seriesByGenre = useMemo(() => {
    const grouped: Record<string, ContentItem[]> = {};
    
    if (data.popularSeries) {
      data.popularSeries.forEach(serie => {
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
  const sortedMovieGenres = Object.keys(moviesByGenre).sort();
  const sortedSeriesGenres = Object.keys(seriesByGenre).sort();

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
    <div className="min-h-screen bg-black text-white">
      {/* Section Hero avec carousel */}
      {heroItems.length > 0 && (
        <HeroSection items={heroItems} onPlay={handlePlay} />
      )}

      <div className="pb-8 tv:pb-12">
        {/* Section Reprendre la lecture */}
        {(resumeWatching.length > 0 || (data.continueWatching && data.continueWatching.length > 0)) && (
          <CarouselRow title="Reprendre la lecture">
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

            return (
              <CarouselRow key={`movies-${genre}`} title={`Films - ${genre}`}>
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
            <CarouselRow title="Films populaires">
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

            return (
              <CarouselRow key={`series-${genre}`} title={`Séries - ${genre}`}>
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
            <CarouselRow title="Séries populaires">
              {data.popularSeries.map((item) => (
                <div key={item.id} className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px]">
                  <LazyTorrentPoster item={item} />
                </div>
              ))}
            </CarouselRow>
          )
        )}

        {/* Section Ajouts récents */}
        {data.recentAdditions && data.recentAdditions.length > 0 && (
          <CarouselRow title="Ajouts récents">
            {data.recentAdditions.map((item) => (
              <div key={item.id} className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px]">
                <LazyTorrentPoster item={item} />
              </div>
            ))}
          </CarouselRow>
        )}
      </div>
    </div>
  );
}
