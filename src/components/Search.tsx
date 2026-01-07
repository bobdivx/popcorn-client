import { useState } from 'preact/hooks';
import { serverApi, type SearchResult } from '../lib/client/server-api';
import { CacheManager } from '../lib/client/storage';

interface SearchProps {
  onResultClick?: (result: SearchResult) => void;
}

export default function Search({ onResultClick }: SearchProps) {
  const [query, setQuery] = useState('');
  const [type, setType] = useState<'movie' | 'tv' | 'all'>('all');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div class="w-full">
      <div class="flex gap-2 mb-4">
        <input
          type="text"
          placeholder="Rechercher un film ou une série..."
          class="input input-bordered flex-1"
          value={query}
          onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
          onKeyPress={handleKeyPress}
        />
        <select
          class="select select-bordered"
          value={type}
          onChange={(e) => setType((e.target as HTMLSelectElement).value as any)}
        >
          <option value="all">Tout</option>
          <option value="movie">Films</option>
          <option value="tv">Séries</option>
        </select>
        <button
          class="btn btn-primary"
          onClick={handleSearch}
          disabled={loading}
        >
          {loading ? (
            <span class="loading loading-spinner loading-sm"></span>
          ) : (
            'Rechercher'
          )}
        </button>
      </div>

      {error && (
        <div class="alert alert-error mb-4">
          <span>{error}</span>
        </div>
      )}

      {results.length > 0 && (
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {results.map((result) => (
            <div
              key={result.id}
              class="card bg-base-200 shadow-md hover:shadow-xl transition-shadow cursor-pointer"
              onClick={() => onResultClick?.(result)}
            >
              <figure class="aspect-[2/3] bg-base-300">
                {result.poster ? (
                  <img
                    src={result.poster}
                    alt={result.title}
                    class="w-full h-full object-cover"
                  />
                ) : (
                  <div class="flex items-center justify-center w-full h-full">
                    <span class="text-4xl">🎬</span>
                  </div>
                )}
              </figure>
              <div class="card-body p-3">
                <h3 class="card-title text-sm line-clamp-2">{result.title}</h3>
                <div class="flex items-center gap-2 mt-2">
                  <span class="badge badge-outline text-xs">
                    {result.type === 'movie' ? 'Film' : 'Série'}
                  </span>
                  {result.year && (
                    <span class="text-xs text-gray-500">{result.year}</span>
                  )}
                </div>
                {result.overview && (
                  <p class="text-xs text-gray-400 line-clamp-2 mt-2">
                    {result.overview}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && query && results.length === 0 && !error && (
        <div class="text-center p-8">
          <p class="text-gray-500">Aucun résultat trouvé</p>
        </div>
      )}
    </div>
  );
}
