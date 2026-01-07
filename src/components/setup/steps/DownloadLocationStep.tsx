import { useState, useEffect } from 'preact/hooks';
import { isTauri } from '../../../lib/utils/tauri';
import { PreferencesManager } from '../../../lib/client/storage';
import type { SetupStatus } from '../../../lib/client/types';

interface DownloadLocationStepProps {
  setupStatus: SetupStatus | null;
  focusedButtonIndex: number;
  buttonRefs: { current: (HTMLButtonElement | null)[] };
  onPrevious: () => void;
  onNext: () => void;
  onSave: (path: string) => Promise<void>;
}

export function DownloadLocationStep({
  setupStatus,
  focusedButtonIndex,
  buttonRefs,
  onPrevious,
  onNext,
  onSave,
}: DownloadLocationStepProps) {
  const [downloadPath, setDownloadPath] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    // Charger le chemin existant
    const existingPath = PreferencesManager.getDownloadLocation();
    if (existingPath) {
      setDownloadPath(existingPath);
    }
  }, []);

  const handleSelectFolder = async () => {
    // En mode Tauri, utiliser le sélecteur natif qui permet de choisir un dossier
    if (isTauri()) {
      try {
        // Utiliser une chaîne dynamique avec @vite-ignore pour éviter la résolution au build
        const modulePath = '@tauri-apps/plugin-dialog';
        // @ts-expect-error - Import dynamique conditionnel
        const dialogModule = await import(/* @vite-ignore */ modulePath);
        
        if (!dialogModule || !dialogModule.open) {
          setError('Le module Tauri dialog n\'est pas disponible');
          return;
        }
        
        const { open } = dialogModule;
        // Ouvrir le sélecteur de dossier natif
        const selected = await open({
          directory: true,
          multiple: false,
          title: 'Sélectionner le dossier de téléchargement',
        });
        
        if (selected && typeof selected === 'string') {
          // Chemin complet du dossier sélectionné (ex: C:\Users\Nom\Downloads)
          setDownloadPath(selected);
          setSuccess('Dossier sélectionné avec succès');
        } else if (Array.isArray(selected) && selected.length > 0) {
          setDownloadPath(selected[0]);
          setSuccess('Dossier sélectionné avec succès');
        }
      } catch (err) {
        console.error('Erreur sélection dossier:', err);
        setError('Erreur lors de la sélection du dossier. Veuillez entrer le chemin manuellement.');
      }
      return;
    }

    // En mode web : permettre la saisie directe du chemin dans le frontend
    // Pas de fenêtre système, l'utilisateur saisit directement le chemin
    setError(null);
    setSuccess('Saisissez le chemin du dossier directement dans le champ ci-dessus (ex: C:\\Users\\Nom\\Downloads ou /home/user/Downloads)');
  };

  const handleSave = async () => {
    if (!downloadPath.trim()) {
      setError('Veuillez sélectionner un emplacement de téléchargement');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await onSave(downloadPath);
      if (result) {
        setSuccess('Emplacement de téléchargement sauvegardé');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <h3 className="text-2xl font-bold text-white">Configuration de l'emplacement de téléchargement</h3>
      
      <p className="text-gray-400">
        Choisissez l'emplacement où les fichiers téléchargés seront stockés localement.
        {isTauri() ? (
          <span className="block mt-2 text-sm text-gray-500">
            💡 Cliquez sur "Parcourir" pour sélectionner un dossier sur votre système.
          </span>
        ) : (
          <span className="block mt-2 text-sm text-gray-500">
            💡 En mode web, saisissez directement le chemin du dossier dans le champ ci-dessous (ex: <code className="bg-gray-800 px-1 rounded">C:\Users\Nom\Downloads</code> sur Windows ou <code className="bg-gray-800 px-1 rounded">/home/user/Downloads</code> sur Linux/Mac).
          </span>
        )}
      </p>

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
          Emplacement de téléchargement
        </label>
        <div className="flex gap-4">
          <input
            type="text"
            className="flex-1 px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-transparent"
            placeholder={isTauri() ? "Sélectionnez un dossier" : "Entrez le chemin du dossier (ex: C:\\Users\\Nom\\Downloads ou /home/user/Downloads)"}
            value={downloadPath}
            onInput={(e) => setDownloadPath((e.target as HTMLInputElement).value)}
            readOnly={isTauri()}
          />
          {isTauri() && (
            <button
              type="button"
              className="px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors"
              onClick={handleSelectFolder}
            >
              Parcourir
            </button>
          )}
        </div>
        {!isTauri() && (
          <div className="space-y-2">
            <p className="text-sm text-gray-500">
              💡 Exemples de chemins :
            </p>
            <ul className="text-sm text-gray-500 list-disc list-inside ml-4 space-y-1">
              <li>Windows : <code className="bg-gray-800 px-1 rounded">C:\Users\Nom\Downloads</code></li>
              <li>Linux : <code className="bg-gray-800 px-1 rounded">/home/user/Downloads</code></li>
              <li>Mac : <code className="bg-gray-800 px-1 rounded">/Users/Nom/Downloads</code></li>
            </ul>
          </div>
        )}
      </div>

      <div className="flex justify-between mt-8">
        <button
          ref={(el) => { buttonRefs.current[0] = el; }}
          className="px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors"
          onClick={onPrevious}
        >
          ← Précédent
        </button>
        <div className="flex gap-4">
          <button
            ref={(el) => { buttonRefs.current[1] = el; }}
            className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleSave}
            disabled={saving || !downloadPath.trim()}
          >
            {saving ? (
              <>
                <span className="loading loading-spinner loading-sm"></span>
                Sauvegarde...
              </>
            ) : (
              'Sauvegarder'
            )}
          </button>
          <button
            ref={(el) => { buttonRefs.current[2] = el; }}
            className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors"
            onClick={onNext}
          >
            Suivant →
          </button>
        </div>
      </div>
    </div>
  );
}
