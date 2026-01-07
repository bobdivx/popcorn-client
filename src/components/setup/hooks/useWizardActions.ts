import { useState } from 'preact/hooks';
import { serverApi } from '../../../lib/client/server-api';
import { PreferencesManager } from '../../../lib/client/storage';
import type { IndexerFormData } from '../../../lib/client/types';

export function useWizardActions() {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const saveIndexer = async (data: IndexerFormData) => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await serverApi.createIndexer(data);
      if (response.success) {
        setSuccess('Indexer créé avec succès');
        return true;
      } else {
        setError(response.message || 'Erreur lors de la création de l\'indexer');
        return false;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveTmdbKey = async (key: string) => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await serverApi.saveTmdbKey(key);
      if (response.success) {
        setSuccess('Clé TMDB sauvegardée avec succès');
        return true;
      } else {
        setError(response.message || 'Erreur lors de la sauvegarde de la clé TMDB');
        return false;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveDownloadLocation = async (path: string) => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      // Sauvegarder côté client uniquement
      PreferencesManager.setDownloadLocation(path);
      setSuccess('Emplacement de téléchargement sauvegardé');
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const completeSetup = () => {
    // Rediriger vers le dashboard
    window.location.href = '/dashboard';
  };

  return {
    saving,
    error,
    success,
    setError,
    setSuccess,
    saveIndexer,
    saveTmdbKey,
    saveDownloadLocation,
    completeSetup,
  };
}
