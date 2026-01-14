import { useState, useEffect } from 'preact/hooks';
import { serverApi } from '../../lib/client/server-api';
import { Search } from 'lucide-preact';

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

export default function IndexerCategoriesSelector({
  indexerId,
  availableCategories,
  onUpdate,
}: IndexerCategoriesSelectorProps) {
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [availableCategoriesList, setAvailableCategoriesList] = useState<Array<{ id: string; label: string; icon: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [loadingAvailable, setLoadingAvailable] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadCategories();
    loadAvailableCategories();
  }, [indexerId]);

  const loadAvailableCategories = async () => {
    if (!indexerId) return;
    
    try {
      setLoadingAvailable(true);
      setError('');
      
      // Essayer d'abord de récupérer les catégories depuis l'indexer
      const response = await serverApi.getIndexerAvailableCategories(indexerId);
      
      if (response.success && response.data && response.data.length > 0) {
        // Utiliser les catégories récupérées depuis l'indexer
        // Dédupliquer par ID pour éviter les clés dupliquées
        const seenIds = new Set<string>();
        const categories = response.data
          .filter(cat => {
            if (seenIds.has(cat.id)) {
              return false;
            }
            seenIds.add(cat.id);
            return true;
          })
          .map(cat => {
            const standard = STANDARD_CATEGORIES.find(c => c.id === cat.id);
            return standard || {
              id: cat.id,
              label: cat.name || cat.id.charAt(0).toUpperCase() + cat.id.slice(1),
              icon: '📁'
            };
          });
        setAvailableCategoriesList(categories);
      } else {
        // Fallback: utiliser categoryMapping ou catégories standard
        const availableFromMapping = availableCategories ? Object.keys(availableCategories) : [];
        const categories = availableFromMapping.length > 0 
          ? availableFromMapping.map(id => {
              const standard = STANDARD_CATEGORIES.find(c => c.id === id);
              return standard || { id, label: id.charAt(0).toUpperCase() + id.slice(1), icon: '📁' };
            })
          : STANDARD_CATEGORIES;
        setAvailableCategoriesList(categories);
      }
    } catch (err) {
      console.error('Erreur lors du chargement des catégories disponibles:', err);
      // En cas d'erreur, utiliser categoryMapping ou catégories standard
      const availableFromMapping = availableCategories ? Object.keys(availableCategories) : [];
      const categories = availableFromMapping.length > 0 
        ? availableFromMapping.map(id => {
            const standard = STANDARD_CATEGORIES.find(c => c.id === id);
            return standard || { id, label: id.charAt(0).toUpperCase() + id.slice(1), icon: '📁' };
          })
        : STANDARD_CATEGORIES;
      setAvailableCategoriesList(categories);
    } finally {
      setLoadingAvailable(false);
    }
  };
  
  // Filtrer les catégories selon la recherche
  const filteredCategories = availableCategoriesList.filter(cat =>
    cat.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    cat.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const loadCategories = async () => {
    if (!indexerId) return;
    
    try {
      setLoading(true);
      setError('');
      
      const response = await serverApi.request(`/api/v1/indexers/${indexerId}/categories`, {
        method: 'GET',
      });
      
      if (response.success && response.data) {
        setSelectedCategories(response.data || []);
      }
    } catch (err) {
      console.error('Erreur lors du chargement des catégories:', err);
      // Ne pas afficher d'erreur si l'indexer n'a pas encore de catégories configurées
      if (err instanceof Error && !err.message.includes('non trouvé')) {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleToggleCategory = async (category: string) => {
    if (!indexerId) return;
    
    const newSelected = selectedCategories.includes(category)
      ? selectedCategories.filter(c => c !== category)
      : [...selectedCategories, category];
    
    setSelectedCategories(newSelected);
    setSaving(true);
    setError('');
    setSuccess('');
    
    try {
      const response = await serverApi.updateIndexerCategories(indexerId, newSelected);
      
      if (response.success) {
        setSuccess('Catégories mises à jour avec succès');
        setTimeout(() => setSuccess(''), 3000);
        
        if (onUpdate) {
          onUpdate();
        }
      } else {
        throw new Error(response.message || 'Erreur lors de la mise à jour des catégories');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erreur lors de la mise à jour';
      setError(errorMessage);
      // Restaurer l'état précédent en cas d'erreur
      await loadCategories();
    } finally {
      setSaving(false);
    }
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
            const isSelected = selectedCategories.includes(category.id);
            
            return (
              <label
                key={category.id}
                class={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-green-900/30 border-green-600'
                    : 'bg-gray-800/50 border-gray-700 hover:border-gray-600'
                }`}
              >
                <input
                  type="checkbox"
                  class="checkbox checkbox-primary"
                  checked={isSelected}
                  onChange={() => handleToggleCategory(category.id)}
                  disabled={saving}
                />
                <span class="text-2xl">{category.icon}</span>
                <span class={`text-base font-medium flex-1 ${isSelected ? 'text-green-300' : 'text-gray-300'}`}>
                  {category.label}
                </span>
                {isSelected && (
                  <span class="ml-auto text-green-400 text-sm">✓ Activé</span>
                )}
              </label>
            );
          })
        )}
      </div>

      {selectedCategories.length === 0 && (
        <div class="alert alert-warning">
          <span>⚠️ Aucune catégorie sélectionnée. Aucun torrent ne sera synchronisé pour cet indexer.</span>
        </div>
      )}

      {selectedCategories.length > 0 && (
        <div class="text-sm text-gray-400">
          {selectedCategories.length} catégorie{selectedCategories.length > 1 ? 's' : ''} sélectionnée{selectedCategories.length > 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}
