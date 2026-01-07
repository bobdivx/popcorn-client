import { useState, useEffect } from 'preact/hooks';
import { serverApi } from '../../lib/client/server-api';

interface IndexerCategoriesSelectorProps {
  indexerId: string;
  availableCategories: Record<string, any>; // categoryMapping depuis la définition
  onUpdate?: () => void;
}

export default function IndexerCategoriesSelector({
  indexerId,
  availableCategories,
  onUpdate,
}: IndexerCategoriesSelectorProps) {
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Récupérer les catégories disponibles depuis categoryMapping
  const categories = Object.keys(availableCategories || {});

  useEffect(() => {
    loadCategories();
  }, [indexerId]);

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
      const response = await serverApi.request(`/api/v1/indexers/${indexerId}/categories`, {
        method: 'PUT',
        body: JSON.stringify({ categories: newSelected }),
      });
      
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

  if (loading) {
    return (
      <div class="flex justify-center items-center py-4">
        <span class="loading loading-spinner loading-sm"></span>
      </div>
    );
  }

  if (categories.length === 0) {
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

      <div class="space-y-2">
        {categories.map((category) => {
          const isSelected = selectedCategories.includes(category);
          const categoryLabel = category === 'films' ? 'Films' : category === 'series' ? 'Séries' : category;
          
          return (
            <label
              key={category}
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
                onChange={() => handleToggleCategory(category)}
                disabled={saving}
              />
              <span class={`text-base font-medium ${isSelected ? 'text-green-300' : 'text-gray-300'}`}>
                {categoryLabel}
              </span>
              {isSelected && (
                <span class="ml-auto text-green-400 text-sm">✓ Activé</span>
              )}
            </label>
          );
        })}
      </div>

      {selectedCategories.length === 0 && (
        <div class="alert alert-warning">
          <span>⚠️ Aucune catégorie sélectionnée. Aucun torrent ne sera synchronisé pour cet indexer.</span>
        </div>
      )}
    </div>
  );
}
