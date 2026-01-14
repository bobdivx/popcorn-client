import { useState, useEffect } from 'preact/hooks';
import { serverApi } from '../../../lib/client/server-api';
import type { SetupStatus } from '../../../lib/client/types';

interface TmdbStepProps {
  setupStatus: SetupStatus | null;
  focusedButtonIndex: number;
  buttonRefs: { current: (HTMLButtonElement | null)[] };
  onPrevious: () => void;
  onNext: () => void;
  onSave: (key: string) => Promise<void>;
  onStatusChange?: () => void;
}

export function TmdbStep({
  setupStatus,
  focusedButtonIndex,
  buttonRefs,
  onPrevious,
  onNext,
  onSave,
  onStatusChange,
}: TmdbStepProps) {
  const [tmdbKey, setTmdbKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTmdbKey();
  }, []);

  const loadTmdbKey = async () => {
    try {
      setLoading(true);
      const response = await serverApi.getTmdbKey();
      if (response.success && response.data?.hasKey && response.data.apiKey) {
        // Afficher la clé masquée pour indiquer qu'une clé existe
        setTmdbKey(response.data.apiKey);
      }
    } catch (err) {
      console.error('Erreur lors du chargement de la clé TMDB:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!tmdbKey.trim()) {
      setError('Veuillez entrer une clé API TMDB');
      return;
    }

    // Si c'est une clé masquée (contient des *), ne pas sauvegarder
    if (tmdbKey.includes('*')) {
      setError('Veuillez entrer une nouvelle clé API TMDB complète');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await onSave(tmdbKey);
      if (result) {
        setSuccess('Clé TMDB sauvegardée avec succès');
        // Recharger la clé masquée après sauvegarde
        await loadTmdbKey();
        // Mettre à jour le statut du setup (comme dans IndexersStep)
        if (onStatusChange) {
          onStatusChange();
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    );
  }

  const hasExistingKey = setupStatus?.hasTmdbKey || (tmdbKey && tmdbKey.includes('*'));

  return (
    <div className="space-y-6">
      <h3 className="text-2xl font-bold text-white">Configuration de la clé API TMDB</h3>
      
      {hasExistingKey ? (
        <div className="bg-green-900/30 border border-green-700 rounded-lg p-4 text-green-300">
          <span>Clé API TMDB configurée</span>
        </div>
      ) : (
        <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-4 text-yellow-300">
          <span>Clé API TMDB non configurée. Il est recommandé d'en configurer une pour enrichir les métadonnées.</span>
        </div>
      )}

      <p className="text-gray-400">
        Le token TMDB permet d'enrichir automatiquement les torrents avec des métadonnées
        (synopsis, date de sortie, genres, note, etc.).
      </p>

      <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
        <a
          href="https://www.themoviedb.org/settings/api"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary-600 hover:text-primary-500 transition-colors"
        >
          Obtenir une clé API TMDB gratuite →
        </a>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 text-red-300">
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="bg-green-900/30 border border-green-700 rounded-lg p-4 text-green-300">
          <span>{success}</span>
        </div>
      )}

      <div className="space-y-2">
        <label className="block text-sm font-semibold text-white">
          Clé API TMDB
        </label>
        <div className="flex gap-4">
          <input
            type="text"
            className="flex-1 px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-transparent"
            placeholder={hasExistingKey ? "Entrez une nouvelle clé pour remplacer" : "Entrez votre clé API TMDB"}
            value={tmdbKey}
            onInput={(e) => setTmdbKey((e.target as HTMLInputElement).value)}
            disabled={saving}
          />
          <button
            ref={(el) => { buttonRefs.current[0] = el; }}
            className="px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleSave}
            disabled={saving || !tmdbKey.trim() || tmdbKey.includes('*')}
          >
            {saving ? (
              <>
                <span className="loading loading-spinner loading-sm"></span>
                Sauvegarde...
              </>
            ) : (
              hasExistingKey ? 'Remplacer' : 'Sauvegarder'
            )}
          </button>
        </div>
        {hasExistingKey && (
          <p className="text-sm text-gray-500">
            Une clé est déjà configurée. Entrez une nouvelle clé complète pour la remplacer.
          </p>
        )}
      </div>

      <div className="flex justify-between mt-8">
        <button
          ref={(el) => { buttonRefs.current[1] = el; }}
          className="px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors"
          onClick={onPrevious}
        >
          ← Précédent
        </button>
        <button
          ref={(el) => { buttonRefs.current[2] = el; }}
          className="px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition-colors"
          onClick={onNext}
        >
          Suivant →
        </button>
      </div>
    </div>
  );
}
