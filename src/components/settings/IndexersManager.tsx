import { useState, useEffect } from 'preact/hooks';
import { serverApi } from '../../lib/client/server-api';
import type { Indexer, IndexerFormData } from '../../lib/client/types';

export default function IndexersManager() {
  const [indexers, setIndexers] = useState<Indexer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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

  useEffect(() => {
    loadIndexers();
  }, []);

  const loadIndexers = async () => {
    try {
      setLoading(true);
      const response = await serverApi.getIndexers();
      if (response.success && response.data) {
        setIndexers(response.data);
      } else {
        setError(response.message || 'Erreur lors du chargement des indexers');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
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
      } else {
        setError(response.message || 'Erreur lors de la sauvegarde');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setSaving(false);
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
      priority: indexer.priority,
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cet indexer ?')) {
      return;
    }

    try {
      const response = await serverApi.deleteIndexer(id);
      if (response.success) {
        await loadIndexers();
      } else {
        setError(response.message || 'Erreur lors de la suppression');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    }
  };

  if (loading) {
    return (
      <div class="flex justify-center items-center min-h-[400px]">
        <span class="loading loading-spinner loading-lg"></span>
      </div>
    );
  }

  return (
    <div class="space-y-6">
      {error && (
        <div class="alert alert-error">
          <span>{error}</span>
        </div>
      )}

      {!showForm ? (
        <>
          <div class="flex justify-between items-center mb-6">
            <h2 class="text-2xl font-bold text-white">Indexers configurés</h2>
            <button class="btn btn-primary" onClick={() => setShowForm(true)}>
              Ajouter un indexer
            </button>
          </div>

          {indexers.length === 0 ? (
            <div class="text-center py-12">
              <p class="text-gray-400">Aucun indexer configuré</p>
            </div>
          ) : (
            <div class="space-y-4">
              {indexers.map((indexer) => (
                <div key={indexer.id} class="card bg-gray-800 shadow-xl border border-gray-700">
                  <div class="card-body">
                    <div class="flex justify-between items-start">
                      <div>
                        <h3 class="card-title text-white">
                          {indexer.name}
                          {indexer.isDefault && (
                            <span class="badge badge-primary">Par défaut</span>
                          )}
                          {!indexer.isEnabled && (
                            <span class="badge badge-error">Désactivé</span>
                          )}
                        </h3>
                        <p class="text-sm text-gray-400">{indexer.baseUrl}</p>
                        <p class="text-xs text-gray-500">
                          Priorité: {indexer.priority}
                        </p>
                      </div>
                      <div class="flex gap-2">
                        <button
                          class="btn btn-sm btn-outline"
                          onClick={() => handleEdit(indexer)}
                        >
                          Modifier
                        </button>
                        <button
                          class="btn btn-sm btn-error"
                          onClick={() => handleDelete(indexer.id)}
                        >
                          Supprimer
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <form onSubmit={handleSubmit} class="space-y-4">
          <h2 class="text-2xl font-bold text-white mb-6">
            {editingIndexer ? 'Modifier l\'indexer' : 'Ajouter un indexer'}
          </h2>

          <div class="form-control">
            <label class="label">
              <span class="label-text text-white">Nom</span>
            </label>
            <input
              type="text"
              class="input input-bordered bg-gray-800 border-gray-700 text-white"
              value={formData.name}
              onInput={(e) => setFormData({ ...formData, name: (e.target as HTMLInputElement).value })}
              required
            />
          </div>

          <div class="form-control">
            <label class="label">
              <span class="label-text text-white">URL de base</span>
            </label>
            <input
              type="url"
              class="input input-bordered bg-gray-800 border-gray-700 text-white"
              value={formData.baseUrl}
              onInput={(e) => setFormData({ ...formData, baseUrl: (e.target as HTMLInputElement).value })}
              required
            />
          </div>

          <div class="form-control">
            <label class="label">
              <span class="label-text text-white">Clé API</span>
            </label>
            <input
              type="text"
              class="input input-bordered bg-gray-800 border-gray-700 text-white"
              value={formData.apiKey}
              onInput={(e) => setFormData({ ...formData, apiKey: (e.target as HTMLInputElement).value })}
              required
            />
          </div>

          <div class="form-control">
            <label class="label">
              <span class="label-text text-white">Nom de l'indexer Jackett (optionnel)</span>
            </label>
            <input
              type="text"
              class="input input-bordered bg-gray-800 border-gray-700 text-white"
              value={formData.jackettIndexerName}
              onInput={(e) => setFormData({ ...formData, jackettIndexerName: (e.target as HTMLInputElement).value })}
            />
          </div>

          <div class="form-control">
            <label class="label cursor-pointer">
              <span class="label-text text-white">Activer</span>
              <input
                type="checkbox"
                class="toggle toggle-primary"
                checked={formData.isEnabled}
                onChange={(e) => setFormData({ ...formData, isEnabled: (e.target as HTMLInputElement).checked })}
              />
            </label>
          </div>

          <div class="form-control">
            <label class="label cursor-pointer">
              <span class="label-text text-white">Par défaut</span>
              <input
                type="checkbox"
                class="toggle toggle-primary"
                checked={formData.isDefault}
                onChange={(e) => setFormData({ ...formData, isDefault: (e.target as HTMLInputElement).checked })}
              />
            </label>
          </div>

          <div class="form-control">
            <label class="label">
              <span class="label-text text-white">Priorité</span>
            </label>
            <input
              type="number"
              class="input input-bordered bg-gray-800 border-gray-700 text-white"
              value={formData.priority}
              onInput={(e) => setFormData({ ...formData, priority: parseInt((e.target as HTMLInputElement).value) || 0 })}
              min="0"
            />
          </div>

          <div class="flex gap-4">
            <button
              type="button"
              class="btn btn-outline"
              onClick={() => {
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
              }}
            >
              Annuler
            </button>
            <button type="submit" class="btn btn-primary" disabled={saving}>
              {saving ? (
                <>
                  <span class="loading loading-spinner loading-sm"></span>
                  Sauvegarde...
                </>
              ) : (
                'Sauvegarder'
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
