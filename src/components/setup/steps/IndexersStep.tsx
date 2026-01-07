import { useState, useEffect } from 'preact/hooks';
import { serverApi } from '../../../lib/client/server-api';
import type { SetupStatus, Indexer, IndexerFormData } from '../../../lib/client/types';

interface IndexersStepProps {
  setupStatus: SetupStatus | null;
  focusedButtonIndex: number;
  buttonRefs: { current: (HTMLButtonElement | null)[] };
  onPrevious: () => void;
  onNext: () => void;
  onStatusChange: () => void;
}

export function IndexersStep({
  setupStatus,
  focusedButtonIndex,
  buttonRefs,
  onPrevious,
  onNext,
  onStatusChange,
}: IndexersStepProps) {
  const [indexers, setIndexers] = useState<Indexer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingIndexer, setEditingIndexer] = useState<Indexer | null>(null);
  const [formData, setFormData] = useState<IndexerFormData>({
    name: '',
    baseUrl: '',
    apiKey: '',
    jackettIndexerName: '',
    isEnabled: true,
    isDefault: false,
    priority: 0,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    loadIndexers();
  }, []);

  const loadIndexers = async () => {
    try {
      setLoading(true);
      const response = await serverApi.getIndexers();
      if (response.success && response.data) {
        setIndexers(response.data);
      }
    } catch (err) {
      console.error('Erreur lors du chargement des indexers:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (indexer: Indexer) => {
    setEditingIndexer(indexer);
    setFormData({
      name: indexer.name,
      baseUrl: indexer.baseUrl,
      apiKey: indexer.apiKey || '',
      jackettIndexerName: indexer.jackettIndexerName || '',
      isEnabled: indexer.isEnabled,
      isDefault: indexer.isDefault,
      priority: indexer.priority || 0,
    });
    setShowForm(true);
    setError(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cet indexer ?')) {
      return;
    }

    setDeleting(id);
    setError(null);

    try {
      const response = await serverApi.deleteIndexer(id);
      if (response.success) {
        await loadIndexers();
        onStatusChange();
      } else {
        setError(response.message || 'Erreur lors de la suppression de l\'indexer');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setDeleting(null);
    }
  };

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      let response;
      if (editingIndexer) {
        response = await serverApi.updateIndexer(editingIndexer.id, formData);
      } else {
        response = await serverApi.createIndexer(formData);
      }

      if (response.success) {
        setShowForm(false);
        setEditingIndexer(null);
        setFormData({
          name: '',
          baseUrl: '',
          apiKey: '',
          jackettIndexerName: '',
          isEnabled: true,
          isDefault: false,
          priority: 0,
        });
        await loadIndexers();
        onStatusChange();
      } else {
        setError(response.message || `Erreur lors de la ${editingIndexer ? 'mise à jour' : 'création'} de l'indexer`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingIndexer(null);
    setFormData({
      name: '',
      baseUrl: '',
      apiKey: '',
      jackettIndexerName: '',
      isEnabled: true,
      isDefault: false,
      priority: 0,
    });
    setError(null);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h3 className="text-2xl font-bold text-white">Configuration des indexers</h3>
      
      {setupStatus?.hasIndexers ? (
        <div className="bg-green-900/30 border border-green-700 rounded-lg p-4 text-green-300">
          <span>Au moins un indexer est configuré</span>
        </div>
      ) : (
        <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-4 text-yellow-300">
          <span>Aucun indexer configuré. Veuillez en ajouter au moins un.</span>
        </div>
      )}

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 text-red-300">
          <span>{error}</span>
        </div>
      )}

      {!showForm ? (
        <>
          <div className="space-y-4">
            {indexers.length > 0 ? (
              <div className="space-y-2">
                {indexers.map((indexer) => (
                  <div key={indexer.id} className="bg-gray-900 border border-gray-800 rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h4 className="text-lg font-semibold text-white">{indexer.name}</h4>
                          {indexer.isDefault && (
                            <span className="px-2 py-1 bg-red-600 text-white text-xs font-semibold rounded">Par défaut</span>
                          )}
                          {!indexer.isEnabled && (
                            <span className="px-2 py-1 bg-gray-700 text-gray-300 text-xs font-semibold rounded">Désactivé</span>
                          )}
                        </div>
                        <p className="text-sm text-gray-400 mb-1">{indexer.baseUrl}</p>
                        {indexer.jackettIndexerName && (
                          <p className="text-xs text-gray-500">Indexer: {indexer.jackettIndexerName}</p>
                        )}
                        <p className="text-xs text-gray-500">Priorité: {indexer.priority}</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm font-semibold rounded-lg transition-colors"
                          onClick={() => handleEdit(indexer)}
                        >
                          Éditer
                        </button>
                        <button
                          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
                          onClick={() => handleDelete(indexer.id)}
                          disabled={deleting === indexer.id}
                        >
                          {deleting === indexer.id ? (
                            <span className="loading loading-spinner loading-sm"></span>
                          ) : (
                            'Supprimer'
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-400">Aucun indexer configuré</p>
            )}
          </div>

          <button
            className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors"
            onClick={() => {
              setShowForm(true);
              setEditingIndexer(null);
              setFormData({
                name: '',
                baseUrl: '',
                apiKey: '',
                jackettIndexerName: '',
                isEnabled: true,
                isDefault: false,
                priority: 0,
              });
            }}
          >
            Ajouter un indexer
          </button>
        </>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {editingIndexer && (
            <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-4 text-blue-300">
              <span>Édition de l'indexer: {editingIndexer.name}</span>
            </div>
          )}

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-white">Nom</label>
            <input
              type="text"
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-transparent"
              value={formData.name}
              onInput={(e) => setFormData({ ...formData, name: (e.target as HTMLInputElement).value })}
              required
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-white">URL de base</label>
            <input
              type="url"
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-transparent"
              value={formData.baseUrl}
              onInput={(e) => setFormData({ ...formData, baseUrl: (e.target as HTMLInputElement).value })}
              required
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-white">Clé API</label>
            <input
              type="text"
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-transparent"
              value={formData.apiKey}
              onInput={(e) => setFormData({ ...formData, apiKey: (e.target as HTMLInputElement).value })}
              required
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-white">Nom de l'indexer Jackett (optionnel)</label>
            <input
              type="text"
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-transparent"
              value={formData.jackettIndexerName}
              onInput={(e) => setFormData({ ...formData, jackettIndexerName: (e.target as HTMLInputElement).value })}
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-white">Priorité</label>
            <input
              type="number"
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-transparent"
              value={formData.priority}
              onInput={(e) => setFormData({ ...formData, priority: parseInt((e.target as HTMLInputElement).value) || 0 })}
              min="0"
            />
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 text-red-600 bg-gray-900 border-gray-700 rounded focus:ring-red-600"
                checked={formData.isEnabled}
                onChange={(e) => setFormData({ ...formData, isEnabled: (e.target as HTMLInputElement).checked })}
              />
              <span className="text-white">Activer</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 text-red-600 bg-gray-900 border-gray-700 rounded focus:ring-red-600"
                checked={formData.isDefault}
                onChange={(e) => setFormData({ ...formData, isDefault: (e.target as HTMLInputElement).checked })}
              />
              <span className="text-white">Par défaut</span>
            </label>
          </div>

          <div className="flex gap-4">
            <button
              type="button"
              className="px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors"
              onClick={handleCancel}
            >
              Annuler
            </button>
            <button
              type="submit"
              className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={saving}
            >
              {saving ? (
                <>
                  <span className="loading loading-spinner loading-sm"></span>
                  Sauvegarde...
                </>
              ) : (
                editingIndexer ? 'Mettre à jour' : 'Créer'
              )}
            </button>
          </div>
        </form>
      )}

      <div className="flex justify-between mt-8">
        <button
          ref={(el) => { buttonRefs.current[0] = el; }}
          className="px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors"
          onClick={onPrevious}
        >
          ← Précédent
        </button>
        <button
          ref={(el) => { buttonRefs.current[1] = el; }}
          className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={onNext}
          disabled={!setupStatus?.hasIndexers}
        >
          Suivant →
        </button>
      </div>
    </div>
  );
}
