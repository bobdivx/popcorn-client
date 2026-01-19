import { useState, useEffect, useRef } from 'preact/hooks';
import { Search as SearchIcon, X } from 'lucide-preact';
import { serverApi, type SearchResult } from '../lib/client/server-api';
import { CacheManager } from '../lib/client/storage';
import { FocusableCard } from './ui/FocusableCard';
import CarouselRow from './torrents/CarouselRow';

interface SearchProps {
  onResultClick?: (result: SearchResult) => void;
}

interface SearchResultPosterProps {
  result: SearchResult;
  onClick?: (result: SearchResult) => void;
}

/**
 * Composant pour afficher un résultat de recherche dans un style moderne
 */
function SearchResultPoster({ result, onClick }: SearchResultPosterProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(result.poster || null);

  useEffect(() => {
    if (result.poster && result.poster !== imageUrl) {
      setImageUrl(result.poster);
    }
  }, [result.poster]);

  const handleClick = (e: MouseEvent | KeyboardEvent) => {
    e.preventDefault();
    if (e.stopPropagation) {
      e.stopPropagation();
    }
    if (onClick) {
      onClick(result);
    } else {
      window.location.href = `/player/${result.id}`;
    }
  };

  return (
    <div
      className="relative group cursor-pointer torrent-poster min-w-[140px] sm:min-w-[160px] md:min-w-[180px] lg:min-w-[280px] xl:min-w-[320px] tv:min-w-[400px]"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <FocusableCard
        className="w-full"
        onClick={handleClick}
        href={`/player/${result.id}`}
        tabIndex={0}
      >
          <div className="relative aspect-[2/3] lg:aspect-video xl:aspect-[16/9] overflow-hidden bg-gray-900 shadow-lg rounded-lg transform transition-all duration-300 hover:scale-105 hover:shadow-primary focus-within:scale-105 focus-within:shadow-primary-lg focus-within:ring-4 focus-within:ring-primary-600 focus-within:ring-opacity-60">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={result.title}
              className="w-full h-full object-cover"
              loading="lazy"
              decoding="async"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900">
              <div className="text-center p-4">
                <div className="text-4xl mb-2">🎬</div>
                <p className="text-xs text-gray-400 line-clamp-2">{result.title}</p>
              </div>
            </div>
          )}

          {/* Badge type */}
          <div className="absolute top-2 left-2 lg:top-3 lg:left-3 tv:top-4 tv:left-4 z-10">
            <div className={`w-6 h-6 lg:w-8 lg:h-8 tv:w-12 tv:h-12 rounded flex items-center justify-center shadow-primary transition-all duration-200 ${
              result.type === 'movie' ? 'bg-primary-600' : 'bg-primary-500'
            }`}>
              <span className="text-white text-xs lg:text-sm tv:text-base font-bold">
                {result.type === 'movie' ? 'F' : 'S'}
              </span>
            </div>
          </div>

          {/* Overlay au survol */}
          {isHovered && (
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent flex flex-col justify-end p-3 lg:p-4 tv:p-6 transition-opacity pointer-events-none">
              <div className="space-y-1.5 lg:space-y-2 tv:space-y-3">
                <h3 className="text-white font-semibold text-sm lg:text-base tv:text-lg line-clamp-1">
                  {result.title}
                </h3>
                <div className="flex items-center gap-2 text-xs lg:text-sm tv:text-base text-gray-300 flex-wrap">
                  {result.year && (
                    <>
                      <span>{result.year}</span>
                      <span>•</span>
                    </>
                  )}
                  <span className="capitalize">{result.type === 'movie' ? 'Film' : 'Série'}</span>
                </div>
                {result.overview && (
                  <p className="text-xs lg:text-sm tv:text-base text-gray-300 line-clamp-2 mt-2">
                    {result.overview}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </FocusableCard>
    </div>
  );
}

export default function Search({ onResultClick }: SearchProps) {
  const [query, setQuery] = useState('');
  const [type, setType] = useState<'movie' | 'tv' | 'all'>('all');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus automatique sur le champ de recherche au chargement (pour TV)
  useEffect(() => {
    if (inputRef.current && typeof window !== 'undefined') {
      // Petit délai pour s'assurer que le composant est monté
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, []);

  const handleSearch = async () => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    // Vérifier le cache
    const cacheKey = `search_${query}_${type}`;
    const cached = CacheManager.get<SearchResult[]>(cacheKey);
    
    if (cached) {
      setResults(cached);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      if (!serverApi.isAuthenticated()) {
        setError('Vous devez être connecté pour rechercher du contenu');
        setLoading(false);
        return;
      }

      const response = await serverApi.search({
        q: query,
        type: type === 'all' ? undefined : type,
      });

      if (!response.success) {
        setError(response.message || 'Erreur lors de la recherche');
        return;
      }

      if (response.data) {
        setResults(response.data);
        // Mettre en cache pour 1 heure
        CacheManager.set(cacheKey, response.data, 60 * 60 * 1000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handleClear = () => {
    setQuery('');
    setResults([]);
    inputRef.current?.focus();
  };

  // Organiser les résultats par type pour affichage en carrousels
  const movies = results.filter(r => r.type === 'movie');
  const series = results.filter(r => r.type === 'tv');
  const allResults = type === 'all' ? results : (type === 'movie' ? movies : series);

  return (
    <div className="min-h-screen bg-black text-white w-full">
      {/* Section Hero avec barre de recherche moderne */}
      <div className="relative w-full min-h-[300px] tv:min-h-[400px] mb-8 overflow-hidden bg-gradient-to-b from-primary-900/20 via-black to-black">
        {/* Pattern de fond dégradé */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{
            backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(124, 58, 237, 0.3) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(124, 58, 237, 0.2) 0%, transparent 50%)'
          }}></div>
        </div>
        
        <div className="relative z-10 h-full flex flex-col justify-center px-4 sm:px-6 lg:px-16 tv:px-24 py-12 tv:py-16">
          <div className="max-w-4xl tv:max-w-5xl mx-auto w-full">
            {/* Titre */}
            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl tv:text-8xl font-bold text-white mb-6 tv:mb-8 drop-shadow-2xl">
              Rechercher
            </h1>

            {/* Barre de recherche moderne */}
            <div className="flex flex-col sm:flex-row gap-3 tv:gap-4 mb-6">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 flex items-center pl-4 tv:pl-6 pointer-events-none z-10">
                  <SearchIcon className="w-5 h-5 tv:w-7 tv:h-7 text-gray-400" size={24} />
                </div>
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Rechercher un film ou une série..."
                  className="w-full pl-12 tv:pl-16 pr-12 tv:pr-16 py-3 tv:py-4 bg-gray-900/90 backdrop-blur-sm border-2 border-gray-700 rounded-lg text-white placeholder-gray-400 focus:border-primary-600 focus:ring-4 focus:ring-primary-600 focus:ring-opacity-50 text-base tv:text-lg min-h-[56px] tv:min-h-[64px] transition-all duration-200"
                  value={query}
                  onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
                  onKeyPress={handleKeyPress}
                  tabIndex={0}
                />
                {query && (
                  <button
                    onClick={handleClear}
                    className="absolute inset-y-0 right-0 flex items-center pr-4 tv:pr-6 text-gray-400 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-opacity-50 rounded"
                    tabIndex={0}
                    aria-label="Effacer la recherche"
                  >
                    <X className="w-5 h-5 tv:w-6 tv:h-6" size={24} />
                  </button>
                )}
              </div>
              <button
                onClick={handleSearch}
                disabled={loading || !query.trim()}
                className="w-full sm:w-auto bg-primary hover:bg-primary-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white px-8 tv:px-12 py-3 tv:py-4 rounded-lg font-semibold text-base tv:text-lg flex items-center justify-center gap-2 transition-all duration-300 shadow-primary hover:shadow-primary-lg focus:outline-none focus:ring-4 focus:ring-primary-600 focus:ring-opacity-50 min-h-[56px] tv:min-h-[64px]"
                tabIndex={0}
              >
                {loading ? (
                  <span className="loading loading-spinner loading-sm tv:loading-md"></span>
                ) : (
                  <>
                    <SearchIcon className="w-5 h-5 tv:w-6 tv:h-6" size={24} />
                    <span className="hidden sm:inline">Rechercher</span>
                  </>
                )}
              </button>
            </div>

            {/* Filtres de catégories */}
            <div className="flex flex-wrap gap-3 tv:gap-4">
              <button
                onClick={() => {
                  setType('all');
                  if (query) handleSearch();
                }}
                className={`px-6 py-3 tv:px-8 tv:py-4 rounded-full font-semibold text-base tv:text-lg transition-all duration-200 min-h-[48px] tv:min-h-[56px] focus:outline-none focus:ring-4 focus:ring-primary-600 focus:ring-opacity-50 ${
                  type === 'all'
                    ? 'bg-primary hover:bg-primary-700 text-white shadow-primary shadow-primary-600/30'
                    : 'bg-gray-800/80 hover:bg-gray-700/80 text-gray-300 border border-gray-700 glass-panel'
                }`}
                tabIndex={0}
              >
                Tout
              </button>
              <button
                onClick={() => {
                  setType('movie');
                  if (query) handleSearch();
                }}
                className={`px-6 py-3 tv:px-8 tv:py-4 rounded-full font-semibold text-base tv:text-lg transition-all duration-200 min-h-[48px] tv:min-h-[56px] focus:outline-none focus:ring-4 focus:ring-primary-600 focus:ring-opacity-50 ${
                  type === 'movie'
                    ? 'bg-primary hover:bg-primary-700 text-white shadow-primary shadow-primary-600/30'
                    : 'bg-gray-800/80 hover:bg-gray-700/80 text-gray-300 border border-gray-700 glass-panel'
                }`}
                tabIndex={0}
              >
                Films
              </button>
              <button
                onClick={() => {
                  setType('tv');
                  if (query) handleSearch();
                }}
                className={`px-6 py-3 tv:px-8 tv:py-4 rounded-full font-semibold text-base tv:text-lg transition-all duration-200 min-h-[48px] tv:min-h-[56px] focus:outline-none focus:ring-4 focus:ring-primary-600 focus:ring-opacity-50 ${
                  type === 'tv'
                    ? 'bg-primary hover:bg-primary-700 text-white shadow-primary shadow-primary-600/30'
                    : 'bg-gray-800/80 hover:bg-gray-700/80 text-gray-300 border border-gray-700 glass-panel'
                }`}
                tabIndex={0}
              >
                Séries
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Affichage des résultats */}
      {error && (
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 tv:px-16 mb-6">
          <div className="alert alert-error bg-primary-900/20 border border-primary-500 text-primary-300 glass-panel">
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Résultats organisés en carrousels */}
      {!loading && query && allResults.length > 0 && (
        <div className="pb-8 tv:pb-12">
          {type === 'all' ? (
            <>
              {movies.length > 0 && (
                <CarouselRow title="Films trouvés">
                  {movies.map((result) => (
                    <div key={result.id} className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px]">
                      <SearchResultPoster result={result} onClick={onResultClick} />
                    </div>
                  ))}
                </CarouselRow>
              )}
              {series.length > 0 && (
                <CarouselRow title="Séries trouvées">
                  {series.map((result) => (
                    <div key={result.id} className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px]">
                      <SearchResultPoster result={result} onClick={onResultClick} />
                    </div>
                  ))}
                </CarouselRow>
              )}
            </>
          ) : (
            <CarouselRow title={`${type === 'movie' ? 'Films' : 'Séries'} trouvé${allResults.length > 1 ? 's' : ''}`}>
              {allResults.map((result) => (
                <div key={result.id} className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px]">
                  <SearchResultPoster result={result} onClick={onResultClick} />
                </div>
              ))}
            </CarouselRow>
          )}
        </div>
      )}

      {/* État de chargement */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-20 tv:py-32">
          <span className="loading loading-spinner loading-lg tv:loading-xl text-primary-600 mb-4"></span>
          <p className="text-gray-400 text-lg tv:text-xl">Recherche en cours...</p>
        </div>
      )}

      {/* État vide - aucun résultat */}
      {!loading && query && allResults.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-20 tv:py-32 px-4">
          <div className="text-center max-w-2xl tv:max-w-3xl">
            <div className="text-6xl tv:text-8xl mb-4 tv:mb-6">🔍</div>
            <h2 className="text-2xl tv:text-3xl font-bold text-white mb-4 tv:mb-6">
              Aucun résultat trouvé
            </h2>
            <p className="text-gray-400 text-base tv:text-lg mb-6 tv:mb-8">
              Aucun {type === 'all' ? 'contenu' : type === 'movie' ? 'film' : 'série'} trouvé pour "{query}"
            </p>
            <button
              onClick={handleClear}
              className="bg-primary hover:bg-primary-700 text-white px-8 tv:px-12 py-3 tv:py-4 rounded-lg font-semibold text-base tv:text-lg transition-all duration-300 shadow-primary hover:shadow-primary-lg focus:outline-none focus:ring-4 focus:ring-primary-600 focus:ring-opacity-50 min-h-[48px] tv:min-h-[56px]"
              tabIndex={0}
            >
              Nouvelle recherche
            </button>
          </div>
        </div>
      )}

      {/* État initial - pas encore de recherche */}
      {!query && !loading && (
        <div className="flex flex-col items-center justify-center py-20 tv:py-32 px-4">
          <div className="text-center max-w-2xl tv:max-w-3xl">
            <div className="text-6xl tv:text-8xl mb-4 tv:mb-6">🎬</div>
            <h2 className="text-2xl tv:text-3xl font-bold text-white mb-4 tv:mb-6">
              Commencez votre recherche
            </h2>
            <p className="text-gray-400 text-base tv:text-lg">
              Recherchez des films ou des séries en utilisant la barre de recherche ci-dessus
            </p>
          </div>
        </div>
      )}
    </div>
  );
}