import { useState, useEffect, useRef } from 'preact/hooks';
import { Search as SearchIcon, X } from 'lucide-preact';
import { serverApi, type SearchResult } from '../lib/client/server-api';
import { CacheManager } from '../lib/client/storage';
import { FocusableCard } from './ui/FocusableCard';
import CarouselRow from './torrents/CarouselRow';
import { useI18n } from '../lib/i18n/useI18n';

interface SearchProps {
  onResultClick?: (result: SearchResult) => void;
}

interface SearchResultPosterProps {
  result: SearchResult;
  onClick?: (result: SearchResult) => void;
}

/** URL de détail : Discover si pas de torrent (id tmdb-xxx), sinon page torrents */
function getDetailUrl(result: SearchResult): string {
  if (result.id?.startsWith('tmdb-') && result.tmdbId != null) {
    return `/discover?tmdbId=${result.tmdbId}&type=${result.type}`;
  }
  if (result.tmdbId != null) {
    return `/torrents?tmdbId=${result.tmdbId}&title=${encodeURIComponent(result.title)}&from=search`;
  }
  return `/torrents?slug=${encodeURIComponent(result.id)}&from=search`;
}

/** URL page Discover pour demander le média (quand pas de torrent) */
function getRequestUrl(result: SearchResult): string | null {
  if (result.tmdbId == null) return null;
  return `/discover?tmdbId=${result.tmdbId}&type=${result.type}`;
}

/**
 * Composant pour afficher un résultat de recherche dans un style moderne
 */
function SearchResultPoster({ result, onClick }: SearchResultPosterProps) {
  const { t } = useI18n();
  const [isHovered, setIsHovered] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(result.poster || null);
  const detailUrl = getDetailUrl(result);

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
      window.location.href = detailUrl;
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
        href={detailUrl}
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
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent flex flex-col justify-end p-3 lg:p-4 tv:p-6 transition-opacity">
              <div className="space-y-1.5 lg:space-y-2 tv:space-y-3 pointer-events-none">
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
                  <span className="capitalize">{result.type === 'movie' ? t('common.film') : t('common.serie')}</span>
                </div>
                {result.overview && (
                  <p className="text-xs lg:text-sm tv:text-base text-gray-300 line-clamp-2 mt-2">
                    {result.overview}
                  </p>
                )}
              </div>
              {getRequestUrl(result) && (
                <a
                  href={getRequestUrl(result)!}
                  onClick={(e) => e.stopPropagation()}
                  className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary hover:bg-primary-600 text-white text-xs font-medium pointer-events-auto transition-colors"
                >
                  {t('requests.requestMedia')}
                </a>
              )}
            </div>
          )}
        </div>
      </FocusableCard>
    </div>
  );
}

type SearchPhase = 'idle' | 'local' | 'indexer';

export default function Search({ onResultClick }: SearchProps) {
  const { t, language } = useI18n();
  const [query, setQuery] = useState('');
  const [type, setType] = useState<'movie' | 'tv' | 'all'>('all');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [tmdbFallbackResults, setTmdbFallbackResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchPhase, setSearchPhase] = useState<SearchPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current && typeof window !== 'undefined') {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const q = new URLSearchParams(window.location.search).get('q');
    if (q && q.trim()) setQuery(q.trim());
  }, []);

  const handleSearch = async () => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const cacheKey = `search_${query}_${type}_${language}`;
    const cached = CacheManager.get<SearchResult[]>(cacheKey);
    if (cached) {
      setResults(cached);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setSearchPhase('local');

      if (!serverApi.isAuthenticated()) {
        setError(t('search.mustBeLoggedIn'));
        setLoading(false);
        setSearchPhase('idle');
        return;
      }

      const typeParam = type === 'all' ? undefined : type;

      const localRes = await serverApi.search({
        q: query,
        type: typeParam,
        source: 'local',
        lang: language,
      });

      if (!localRes.success) {
        setError(localRes.message || 'Erreur lors de la recherche');
        setLoading(false);
        setSearchPhase('idle');
        return;
      }

      const localData = localRes.data ?? [];
      if (localData.length > 0) {
        setResults(localData);
        setTmdbFallbackResults([]);
        CacheManager.set(cacheKey, localData, 60 * 60 * 1000);
        setLoading(false);
        setSearchPhase('idle');
        return;
      }

      setSearchPhase('indexer');
      const indexerRes = await serverApi.search({
        q: query,
        type: typeParam,
        source: 'indexer',
        lang: language,
      });

      if (!indexerRes.success) {
        setError(indexerRes.message || 'Erreur lors de la recherche sur les indexeurs');
        setLoading(false);
        setSearchPhase('idle');
        return;
      }

      const indexerData = indexerRes.data ?? [];
      setResults(indexerData);
      CacheManager.set(cacheKey, indexerData, 60 * 60 * 1000);

      // Si toujours aucun torrent trouvé : recherche TMDB pour permettre "Demander"
      if (indexerData.length === 0 && query.trim()) {
        const tmdbLang = language === 'fr' ? 'fr-FR' : 'en-US';
        const tmdbRes = await serverApi.searchTmdb({
          q: query.trim(),
          type: typeParam,
          language: tmdbLang,
          page: 1,
        });
        if (tmdbRes.success && tmdbRes.data && tmdbRes.data.length > 0) {
          setTmdbFallbackResults(
            tmdbRes.data.map((r: any) => ({
              id: r.id ?? `tmdb-${r.tmdbId}-${r.type}`,
              title: r.title ?? '',
              type: (r.type === 'tv' ? 'tv' : 'movie') as 'movie' | 'tv',
              poster: r.poster ?? undefined,
              year: r.year ?? undefined,
              overview: r.overview ?? undefined,
              tmdbId: r.tmdbId ?? 0,
            }))
          );
        } else {
          setTmdbFallbackResults([]);
        }
      } else {
        setTmdbFallbackResults([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
      setSearchPhase('idle');
    }
  };

  const handleClear = () => {
    setQuery('');
    setResults([]);
    setTmdbFallbackResults([]);
    setSearchPhase('idle');
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
              {t('search.title')}
            </h1>

            {/* Barre de recherche moderne */}
            <form
              className="flex flex-col sm:flex-row gap-3 tv:gap-4 mb-6"
              onSubmit={(e) => {
                e.preventDefault();
                handleSearch();
              }}
            >
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 flex items-center pl-4 tv:pl-6 pointer-events-none z-10">
                  <SearchIcon className="w-5 h-5 tv:w-7 tv:h-7 text-gray-400" size={24} />
                </div>
                <input
                  ref={inputRef}
                  type="text"
                  placeholder={t('search.placeholder')}
                  className="w-full pl-12 tv:pl-16 pr-12 tv:pr-16 py-3 tv:py-4 bg-gray-900/90 backdrop-blur-sm border-2 border-gray-700 rounded-lg text-white placeholder-gray-400 focus:border-primary-600 focus:ring-4 focus:ring-primary-600 focus:ring-opacity-50 text-base tv:text-lg min-h-[56px] tv:min-h-[64px] transition-all duration-200"
                  value={query}
                  onInput={(e) => {
                    const el = e.target as HTMLInputElement;
                    setQuery(el?.value ?? '');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSearch();
                    }
                  }}
                  tabIndex={0}
                  autoComplete="off"
                />
                {query && (
                  <button
                    type="button"
                    onClick={handleClear}
                    className="absolute inset-y-0 right-0 flex items-center pr-4 tv:pr-6 text-gray-400 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-opacity-50 rounded"
                    tabIndex={0}
                    aria-label={t('search.clearSearch')}
                  >
                    <X className="w-5 h-5 tv:w-6 tv:h-6" size={24} />
                  </button>
                )}
              </div>
              <button
                type="submit"
                disabled={loading || !query.trim()}
                className="w-full sm:w-auto bg-primary hover:bg-primary-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white px-8 tv:px-12 py-3 tv:py-4 rounded-lg font-semibold text-base tv:text-lg flex items-center justify-center gap-2 transition-all duration-300 shadow-primary hover:shadow-primary-lg focus:outline-none focus:ring-4 focus:ring-primary-600 focus:ring-opacity-50 min-h-[56px] tv:min-h-[64px]"
                tabIndex={0}
              >
                {loading ? (
                  <span className="loading loading-spinner loading-sm tv:loading-md"></span>
                ) : (
                  <>
                    <SearchIcon className="w-5 h-5 tv:w-6 tv:h-6" size={24} />
                    <span className="hidden sm:inline">{t('common.search')}</span>
                  </>
                )}
              </button>
            </form>

            {/* Filtres de catégories */}
            <div className="flex flex-wrap gap-3 tv:gap-4">
              <button
                type="button"
                data-focusable
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
                {t('common.all')}
              </button>
              <button
                type="button"
                data-focusable
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
                {t('nav.films')}
              </button>
              <button
                type="button"
                data-focusable
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
                {t('nav.series')}
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
                <CarouselRow title={t('search.moviesFound')}>
                  {movies.map((result) => (
                    <div key={result.id} className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px]">
                      <SearchResultPoster result={result} onClick={onResultClick} />
                    </div>
                  ))}
                </CarouselRow>
              )}
              {series.length > 0 && (
                <CarouselRow title={t('search.seriesFound')}>
                  {series.map((result) => (
                    <div key={result.id} className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px]">
                      <SearchResultPoster result={result} onClick={onResultClick} />
                    </div>
                  ))}
                </CarouselRow>
              )}
            </>
          ) : (
            <CarouselRow title={type === 'movie' ? t('search.moviesFound') : t('search.seriesFound')}>
              {allResults.map((result) => (
                <div key={result.id} className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px]">
                  <SearchResultPoster result={result} onClick={onResultClick} />
                </div>
              ))}
            </CarouselRow>
          )}
        </div>
      )}

      {/* État de chargement : mascotte Popcorn + étape affichée */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-20 tv:py-32 px-4">
          <div className="relative mb-6 tv:mb-8">
            <div className="w-24 h-24 tv:w-32 tv:h-32 relative">
              <div className="absolute inset-0 border-2 border-primary-500/30 rounded-full animate-spin" style={{ animationDuration: '3s' }} />
              <div className="absolute inset-2 border-2 border-primary-400/20 rounded-full animate-spin" style={{ animationDuration: '2s', animationDirection: 'reverse' }} />
              <div className="absolute inset-0 flex items-center justify-center">
                <img
                  src="/popcorn_logo.png"
                  alt="Popcorn"
                  className="w-14 h-14 tv:w-20 tv:h-20 object-contain animate-pulse"
                  style={{ animationDuration: '1.5s' }}
                />
              </div>
            </div>
          </div>
          <p className="text-gray-300 text-lg tv:text-xl font-medium text-center max-w-md">
            {searchPhase === 'local'
              ? t('search.searchingLocal')
              : t('search.searchingIndexers')}
          </p>
          <p className="text-gray-500 text-sm tv:text-base mt-2 text-center">
            {searchPhase === 'local'
              ? t('search.localSearchNote')
              : t('search.indexerSearchNote')}
          </p>
        </div>
      )}

      {/* Aucun torrent trouvé mais résultats TMDB : proposer "Demander" */}
      {!loading && query && allResults.length === 0 && !error && tmdbFallbackResults.length > 0 && (
        <div className="pb-8 tv:pb-12 container mx-auto px-4 sm:px-6 lg:px-8 tv:px-16">
          <p className="text-gray-400 text-base tv:text-lg mb-4">
            {t('search.noTorrentsUseRequest')}
          </p>
          {type === 'all' ? (
            <>
              {tmdbFallbackResults.filter((r) => r.type === 'movie').length > 0 && (
                <CarouselRow title={t('search.tmdbMoviesRequest')}>
                  {tmdbFallbackResults
                    .filter((r) => r.type === 'movie')
                    .map((result) => (
                      <div key={result.id} className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px]">
                        <SearchResultPoster result={result} onClick={onResultClick} />
                      </div>
                    ))}
                </CarouselRow>
              )}
              {tmdbFallbackResults.filter((r) => r.type === 'tv').length > 0 && (
                <CarouselRow title={t('search.tmdbSeriesRequest')}>
                  {tmdbFallbackResults
                    .filter((r) => r.type === 'tv')
                    .map((result) => (
                      <div key={result.id} className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px]">
                        <SearchResultPoster result={result} onClick={onResultClick} />
                      </div>
                    ))}
                </CarouselRow>
              )}
            </>
          ) : (
            <CarouselRow title={t('search.tmdbRequestTitle')}>
              {tmdbFallbackResults.map((result) => (
                <div key={result.id} className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px]">
                  <SearchResultPoster result={result} onClick={onResultClick} />
                </div>
              ))}
            </CarouselRow>
          )}
          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={handleClear}
              className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-2 rounded-lg text-sm"
            >
              {t('search.newSearch')}
            </button>
          </div>
        </div>
      )}

      {/* État vide - aucun résultat (ni torrent ni TMDB) */}
      {!loading && query && allResults.length === 0 && !error && tmdbFallbackResults.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 tv:py-32 px-4">
          <div className="text-center max-w-2xl tv:max-w-3xl">
            <div className="text-6xl tv:text-8xl mb-4 tv:mb-6">🔍</div>
            <h2 className="text-2xl tv:text-3xl font-bold text-white mb-4 tv:mb-6">
              {t('search.noResults')}
            </h2>
            <p className="text-gray-400 text-base tv:text-lg mb-6 tv:mb-8">
              {t('search.noResultsFor', { 
                type: type === 'all' ? t('search.content') : type === 'movie' ? t('common.film').toLowerCase() : t('common.serie').toLowerCase(),
                query 
              })}
            </p>
            <button
              type="button"
              onClick={handleClear}
              className="bg-primary hover:bg-primary-700 text-white px-8 tv:px-12 py-3 tv:py-4 rounded-lg font-semibold text-base tv:text-lg transition-all duration-300 shadow-primary hover:shadow-primary-lg focus:outline-none focus:ring-4 focus:ring-primary-600 focus:ring-opacity-50 min-h-[48px] tv:min-h-[56px]"
              tabIndex={0}
            >
              {t('search.newSearch')}
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
              {t('search.startSearch')}
            </h2>
            <p className="text-gray-400 text-base tv:text-lg">
              {t('search.startSearchDescription')}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}