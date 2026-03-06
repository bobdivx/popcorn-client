import { useState, useEffect } from 'preact/hooks';
import { serverApi } from '../../lib/client/server-api';
import { Search, ChevronDown, ChevronRight } from 'lucide-preact';
import { syncIndexersToCloud } from '../../lib/utils/cloud-sync';

interface IndexerCategoriesSelectorProps {
  indexerId: string;
  availableCategories?: Record<string, any>; // categoryMapping depuis la définition (optionnel)
  onUpdate?: () => void;
}

// Catégories standard disponibles
const STANDARD_CATEGORIES = [
  { id: 'films', label: 'Films', icon: '🎬' },
  { id: 'series', label: 'Séries', icon: '📺' },
  { id: 'autres', label: 'Autres', icon: '📦' },
];

interface TmdbGenre {
  id: number;
  name: string;
}

interface CategoryConfig {
  enabled: boolean;
  genres?: number[];
}

export default function IndexerCategoriesSelector({
  indexerId,
  availableCategories,
  onUpdate,
}: IndexerCategoriesSelectorProps) {
  const [categoriesConfig, setCategoriesConfig] = useState<Record<string, CategoryConfig>>({});
  const [availableCategoriesList, setAvailableCategoriesList] = useState<Array<{ id: string; label: string; icon: string }>>([]);
  const [tmdbGenres, setTmdbGenres] = useState<{ movies: TmdbGenre[]; tv: TmdbGenre[] } | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['films', 'series']));
  const [loading, setLoading] = useState(true);
  const [loadingAvailable, setLoadingAvailable] = useState(true);
  const [loadingGenres, setLoadingGenres] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [tmdbGenresError, setTmdbGenresError] = useState<string | null>(null);

  // Construire la liste des catégories disponibles à partir des réponses API
  const processAvailableList = (
    availableResponse: { id: string; name?: string }[] | null,
  ): Array<{ id: string; label: string; icon: string }> => {
    if (availableResponse && availableResponse.length > 0) {
      const seenIds = new Set<string>();
      const categories = availableResponse
        .filter(cat => {
          if (seenIds.has(cat.id)) return false;
          seenIds.add(cat.id);
          return true;
        })
        .map(cat => {
          const standard = STANDARD_CATEGORIES.find(c => c.id === cat.id);
          return standard || {
            id: cat.id,
            label: cat.name || cat.id.charAt(0).toUpperCase() + cat.id.slice(1),
            icon: '📁',
          };
        });
      categories.sort((a, b) => {
        const aPriority = a.id === 'films' ? 0 : a.id === 'series' ? 1 : 2;
        const bPriority = b.id === 'films' ? 0 : b.id === 'series' ? 1 : 2;
        if (aPriority !== bPriority) return aPriority - bPriority;
        return a.label.localeCompare(b.label);
      });
      return categories;
    }
    const availableFromMapping = availableCategories ? Object.keys(availableCategories) : [];
    const categories = availableFromMapping.length > 0
      ? availableFromMapping.map(id => {
          const standard = STANDARD_CATEGORIES.find(c => c.id === id);
          return standard || { id, label: id.charAt(0).toUpperCase() + id.slice(1), icon: '📁' };
        })
      : [...STANDARD_CATEGORIES];
    categories.sort((a, b) => {
      const aPriority = a.id === 'films' ? 0 : a.id === 'series' ? 1 : 2;
      const bPriority = b.id === 'films' ? 0 : b.id === 'series' ? 1 : 2;
      if (aPriority !== bPriority) return aPriority - bPriority;
      return a.label.localeCompare(b.label);
    });
    return categories;
  };

  const loadData = async () => {
    if (!indexerId) return;
    try {
      setLoading(true);
      setLoadingAvailable(true);
      setLoadingGenres(true);
      setError('');
      setTmdbGenresError(null);

      const [availableRes, categoriesRes, tmdbRes] = await Promise.all([
        serverApi.getIndexerAvailableCategories(indexerId),
        serverApi.getIndexerCategories(indexerId),
        serverApi.getTmdbGenres(),
      ]);

      const availableList = processAvailableList(availableRes.success ? availableRes.data ?? null : null);
      setAvailableCategoriesList(availableList);

      if (tmdbRes.success && tmdbRes.data) {
        setTmdbGenres(tmdbRes.data);
      } else {
        setTmdbGenres(null);
        if (tmdbRes.message?.includes('Clé API TMDB') || tmdbRes.message?.includes('non configurée')) {
          setTmdbGenresError('Clé API TMDB non configurée. Configurez-la dans les paramètres TMDB pour utiliser les sous-catégories par genres.');
        } else {
          setTmdbGenresError(tmdbRes.message || null);
        }
      }

      setLoadingAvailable(false);
      setLoadingGenres(false);

      const hasExistingCategories = categoriesRes.success && categoriesRes.data && Object.keys(categoriesRes.data).length > 0;
      if (hasExistingCategories) {
        setCategoriesConfig(categoriesRes.data as Record<string, CategoryConfig>);
      } else {
        // Aucune config : activer toutes les catégories par défaut + tous les genres pour films/series
        const defaultConfig: Record<string, CategoryConfig> = {};
        const genres = tmdbRes.success ? tmdbRes.data : null;
        for (const cat of availableList) {
          if (cat.id === 'films' && genres?.movies?.length) {
            defaultConfig.films = { enabled: true, genres: genres.movies.map(g => g.id) };
          } else if (cat.id === 'series' && genres?.tv?.length) {
            defaultConfig.series = { enabled: true, genres: genres.tv.map(g => g.id) };
          } else {
            defaultConfig[cat.id] = { enabled: true };
          }
        }
        if (Object.keys(defaultConfig).length > 0) {
          setCategoriesConfig(defaultConfig);
          await saveCategories(defaultConfig);
        }
      }
    } catch (err) {
      console.error('Erreur lors du chargement des catégories:', err);
      if (err instanceof Error && !err.message.includes('non trouvé')) {
        setError(err.message);
      }
    } finally {
      setLoading(false);
      setLoadingAvailable(false);
      setLoadingGenres(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [indexerId]);

  // Filtrer les catégories selon la recherche
  const filteredCategories = availableCategoriesList.filter(cat =>
    cat.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    cat.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const saveCategories = async (config: Record<string, CategoryConfig>) => {
    if (!indexerId) return;
    
    setSaving(true);
    setError('');
    setSuccess('');
    
    try {
      const response = await serverApi.updateIndexerCategories(indexerId, config);
      
      if (response.success) {
        setSuccess('Catégories mises à jour avec succès');
        setTimeout(() => setSuccess(''), 3000);
        
        if (onUpdate) {
          onUpdate();
        }
        
        // Synchroniser automatiquement vers le cloud
        await syncIndexersToCloud();
      } else {
        throw new Error(response.message || 'Erreur lors de la mise à jour des catégories');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erreur lors de la mise à jour';
      setError(errorMessage);
      // Restaurer l'état précédent en cas d'erreur
      await loadData();
    } finally {
      setSaving(false);
    }
  };

  const handleToggleCategory = async (categoryId: string) => {
    const currentConfig = categoriesConfig[categoryId] || { enabled: false };
    const newConfig = {
      ...categoriesConfig,
      [categoryId]: {
        ...currentConfig,
        enabled: !currentConfig.enabled,
        // Si on active la catégorie et qu'il n'y a pas de genres, initialiser avec tous les genres
        genres: !currentConfig.enabled && !currentConfig.genres && tmdbGenres
          ? (categoryId === 'films' 
              ? tmdbGenres.movies.map(g => g.id)
              : categoryId === 'series'
              ? tmdbGenres.tv.map(g => g.id)
              : undefined)
          : currentConfig.genres,
      },
    };
    
    setCategoriesConfig(newConfig);
    await saveCategories(newConfig);
  };

  const handleToggleGenre = async (categoryId: string, genreId: number) => {
    const currentConfig = categoriesConfig[categoryId] || { enabled: true, genres: [] };
    const currentGenres = currentConfig.genres || [];
    const newGenres = currentGenres.includes(genreId)
      ? currentGenres.filter(g => g !== genreId)
      : [...currentGenres, genreId];
    
    const newConfig = {
      ...categoriesConfig,
      [categoryId]: {
        ...currentConfig,
        enabled: true, // S'assurer que la catégorie est activée si on sélectionne un genre
        genres: newGenres,
      },
    };
    
    setCategoriesConfig(newConfig);
    await saveCategories(newConfig);
  };

  const handleToggleAllGenres = async (categoryId: string) => {
    const currentConfig = categoriesConfig[categoryId] || { enabled: false };
    const categoryGenres = categoryId === 'films' 
      ? (tmdbGenres?.movies || [])
      : categoryId === 'series'
      ? (tmdbGenres?.tv || [])
      : [];
    
    const allGenresSelected = categoryGenres.every(g => 
      (currentConfig.genres || []).includes(g.id)
    );
    
    const newConfig = {
      ...categoriesConfig,
      [categoryId]: {
        enabled: true,
        genres: allGenresSelected ? [] : categoryGenres.map(g => g.id),
      },
    };
    
    setCategoriesConfig(newConfig);
    await saveCategories(newConfig);
  };

  const toggleExpand = (categoryId: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(categoryId)) {
      newExpanded.delete(categoryId);
    } else {
      newExpanded.add(categoryId);
    }
    setExpandedCategories(newExpanded);
  };

  if (loading || loadingAvailable) {
    return (
      <div class="flex justify-center items-center py-4">
        <span class="loading loading-spinner loading-sm"></span>
      </div>
    );
  }

  if (availableCategoriesList.length === 0) {
    return (
      <div class="text-gray-400 text-sm">
        Aucune catégorie disponible pour cet indexer
      </div>
    );
  }

  const selectedCount = Object.values(categoriesConfig).filter(c => c.enabled).length;
  const hasSelectedGenres = Object.values(categoriesConfig).some(c => c.enabled && c.genres && c.genres.length > 0);

  return (
    <div class="space-y-4">
      <div>
        <h4 class="text-lg font-semibold text-white mb-3">
          Catégories à synchroniser
        </h4>
        <p class="text-sm text-gray-400 mb-4">
          Sélectionnez les catégories que vous souhaitez synchroniser pour cet indexer
        </p>
      </div>

      {error && (
        <div class="alert alert-error">
          <span>{error}</span>
          <button
            class="btn btn-sm btn-ghost"
            onClick={() => setError('')}
          >
            ×
          </button>
        </div>
      )}

      {success && (
        <div class="alert alert-success">
          <span>{success}</span>
        </div>
      )}

      {tmdbGenresError && (
        <div class="alert alert-info">
          <span>ℹ️ {tmdbGenresError}</span>
          <button
            class="btn btn-sm btn-ghost"
            onClick={() => {
              // Rediriger vers la page de configuration TMDB si disponible
              const tmdbStep = document.querySelector('[data-step="tmdb"]');
              if (tmdbStep) {
                tmdbStep.scrollIntoView({ behavior: 'smooth' });
              } else {
                // Sinon, juste fermer l'alerte
                setTmdbGenresError(null);
              }
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Barre de recherche */}
      {availableCategoriesList.length > 3 && (
        <div class="form-control">
          <div class="relative">
            <Search class="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Rechercher une catégorie..."
              class="input input-bordered bg-gray-800 border-gray-700 text-white pl-10 w-full"
              value={searchQuery}
              onInput={(e) => setSearchQuery((e.target as HTMLInputElement).value)}
            />
          </div>
        </div>
      )}

      <div class="space-y-2 max-h-96 overflow-y-auto">
        {filteredCategories.length === 0 ? (
          <div class="text-center py-8 text-gray-400">
            <p>Aucune catégorie trouvée pour "{searchQuery}"</p>
          </div>
        ) : (
          filteredCategories.map((category) => {
            const config = categoriesConfig[category.id] || { enabled: false };
            const isExpanded = expandedCategories.has(category.id);
            const isMainCategory = category.id === 'films' || category.id === 'series';
            const categoryGenres = category.id === 'films' 
              ? (tmdbGenres?.movies || [])
              : category.id === 'series'
              ? (tmdbGenres?.tv || [])
              : [];
            const hasGenres = categoryGenres.length > 0;
            
            // Debug log pour comprendre pourquoi les sous-catégories ne s'affichent pas
            if (isMainCategory && import.meta.env.DEV) {
              console.log(`[IndexerCategoriesSelector] ${category.id}:`, {
                hasGenres,
                genresCount: categoryGenres.length,
                isExpanded,
                enabled: config.enabled,
                tmdbGenresLoaded: !!tmdbGenres,
              });
            }
            const allGenresSelected = hasGenres && categoryGenres.every(g => 
              (config.genres || []).includes(g.id)
            );
            const someGenresSelected = hasGenres && categoryGenres.some(g => 
              (config.genres || []).includes(g.id)
            );
            
            return (
              <div key={category.id} class="space-y-1">
                <label
                  class={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    config.enabled
                      ? 'bg-green-900/30 border-green-600'
                      : 'bg-gray-800/50 border-gray-700 hover:border-gray-600'
                  }`}
                >
                  <input
                    type="checkbox"
                    class="checkbox checkbox-primary"
                    checked={config.enabled}
                    onChange={() => handleToggleCategory(category.id)}
                    disabled={saving}
                  />
                  {isMainCategory && hasGenres && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpand(category.id);
                      }}
                      class="p-1 hover:bg-gray-700 rounded"
                    >
                      {isExpanded ? (
                        <ChevronDown class="w-4 h-4 text-gray-400" />
                      ) : (
                        <ChevronRight class="w-4 h-4 text-gray-400" />
                      )}
                    </button>
                  )}
                  <span class="text-2xl">{category.icon}</span>
                  <span class={`text-base font-medium flex-1 ${config.enabled ? 'text-green-300' : 'text-gray-300'}`}>
                    {category.label}
                  </span>
                  {config.enabled && (
                    <span class="ml-auto text-green-400 text-sm">
                      ✓ Activé
                      {hasGenres && config.genres && config.genres.length > 0 && (
                        <span class="ml-2 text-xs">({config.genres.length} genre{config.genres.length > 1 ? 's' : ''})</span>
                      )}
                    </span>
                  )}
                </label>
                
                {/* Sous-catégories (genres TMDB) */}
                {isMainCategory && hasGenres && isExpanded && (
                  <div class="ml-8 mt-2 space-y-2 border-l-2 border-gray-700 pl-4">
                    <div class="flex items-center justify-between mb-2">
                      <span class="text-sm text-gray-400">Genres TMDB</span>
                      {config.enabled && (
                        <button
                          type="button"
                          onClick={() => handleToggleAllGenres(category.id)}
                          class="text-xs text-blue-400 hover:text-blue-300"
                          disabled={saving}
                        >
                          {allGenresSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
                        </button>
                      )}
                    </div>
                    {!config.enabled && (
                      <p class="text-xs text-gray-500 mb-2">
                        Activez la catégorie pour sélectionner des genres
                      </p>
                    )}
                    <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {categoryGenres.map((genre) => {
                        const isGenreSelected = (config.genres || []).includes(genre.id);
                        const isDisabled = !config.enabled || saving;
                        return (
                          <label
                            key={genre.id}
                            class={`flex items-center gap-2 p-2 rounded border transition-colors text-sm ${
                              isDisabled
                                ? 'opacity-50 cursor-not-allowed'
                                : 'cursor-pointer'
                            } ${
                              isGenreSelected
                                ? 'bg-blue-900/30 border-blue-600'
                                : 'bg-gray-800/30 border-gray-700 hover:border-gray-600'
                            }`}
                          >
                            <input
                              type="checkbox"
                              class="checkbox checkbox-sm checkbox-primary"
                              checked={isGenreSelected}
                              onChange={() => handleToggleGenre(category.id, genre.id)}
                              disabled={isDisabled}
                            />
                            <span class={`text-xs flex-1 ${isGenreSelected ? 'text-blue-300' : 'text-gray-400'}`}>
                              {genre.name}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {selectedCount === 0 && (
        <div class="alert alert-warning">
          <span>⚠️ Aucune catégorie sélectionnée. Aucun torrent ne sera synchronisé pour cet indexer.</span>
        </div>
      )}

      {selectedCount > 0 && (
        <div class="text-sm text-gray-400">
          {selectedCount} catégorie{selectedCount > 1 ? 's' : ''} sélectionnée{selectedCount > 1 ? 's' : ''}
          {hasSelectedGenres && (
            <span class="ml-2">
              avec filtrage par genres TMDB
            </span>
          )}
        </div>
      )}
    </div>
  );
}
