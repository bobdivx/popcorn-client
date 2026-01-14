import { useState, useEffect } from 'preact/hooks';
import { PreferencesManager } from '../../../lib/client/storage';
import type { SetupStatus } from '../../../lib/client/types';
import { serverApi } from '../../../lib/client/server-api';

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDockerPath, setIsDockerPath] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Utiliser directement le chemin existant ou le chemin par défaut "downloads"
    // Le backend sera configuré automatiquement avec ce chemin lors de son démarrage
    const existingPath = PreferencesManager.getDownloadLocation();
    if (existingPath) {
      setDownloadPath(existingPath);
      setLoading(false);
      console.log('[DOWNLOAD LOCATION] ✅ Utilisation du chemin existant:', existingPath);
    } else {
      // Utiliser le chemin par défaut "downloads" (standard pour dev et Docker)
      const defaultPath = 'downloads';
      setDownloadPath(defaultPath);
      setLoading(false);
      onSave(defaultPath).catch(err => {
        console.error('[DOWNLOAD LOCATION] Erreur lors de la sauvegarde du chemin par défaut:', err);
      });
      console.log('[DOWNLOAD LOCATION] ✅ Chemin par défaut configuré:', defaultPath);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Ne pas dépendre de onSave pour éviter les boucles infinies

  const handleSave = async () => {
    if (!downloadPath.trim()) {
      setError('Veuillez entrer un chemin de téléchargement');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await onSave(downloadPath.trim());
      setSaving(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
      setSaving(false);
    }
  };


  if (loading) {
    return (
      <div className="space-y-6">
        <h3 className="text-2xl font-bold text-white">Configuration de l'emplacement de téléchargement</h3>
        
        <div className="flex justify-center items-center py-12">
          <div className="text-center">
            <span className="loading loading-spinner loading-lg text-primary-600"></span>
            <p className="mt-4 text-gray-400">Récupération du chemin depuis le backend...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h3 className="text-2xl font-bold text-white">Configuration de l'emplacement de téléchargement</h3>
      
      <p className="text-gray-400">
        {isDockerPath ? (
          <>
            Le backend tourne en Docker. Le chemin affiché est le chemin interne du conteneur.
            {downloadPath && downloadPath.startsWith('/app/') && (
              <> Vous pouvez optionnellement définir le chemin <strong>hôte</strong> correspondant au volume monté dans votre <code className="bg-gray-800 px-1 rounded">docker-compose.yml</code>.</>
            )}
          </>
        ) : (
          <>
            Le backend utilise le dossier <code className="bg-gray-800 px-2 py-1 rounded">downloads</code> à la racine du projet.
            {downloadPath && ' Ce chemin a été récupéré depuis le backend.'}
          </>
        )}
      </p>

      {isDockerPath && downloadPath.startsWith('/app/') && (
        <div className="bg-blue-900/20 border border-blue-700/50 rounded-lg p-4">
          <p className="text-sm text-blue-300">
            💡 <strong>Mode Docker :</strong> Le chemin actuel (<code className="bg-gray-800 px-1 rounded">{downloadPath}</code>) est le chemin interne du conteneur.
            <br />
            <span className="text-xs text-blue-400 mt-1 block">
              <strong>Optionnel :</strong> Si vous souhaitez utiliser le chemin hôte (pour référence), entrez-le ci-dessous.
              <br />
              Exemple : Si votre docker-compose.yml monte <code className="bg-gray-800 px-1 rounded">./data/downloads:/app/downloads</code>, 
              vous pouvez entrer <code className="bg-gray-800 px-1 rounded">./data/downloads</code> ou le chemin absolu correspondant.
              <br />
              <strong>Note :</strong> Le backend gère les fichiers, ce chemin est uniquement utilisé comme référence par le client.
            </span>
          </p>
        </div>
      )}

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 text-red-300">
          <span>{error}</span>
        </div>
      )}

      <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
        <div className="space-y-4">
          <label className="block text-sm font-semibold text-white mb-2">
            {isDockerPath ? 'Chemin hôte de téléchargement' : 'Emplacement de téléchargement'}
          </label>
          
          {isDockerPath && downloadPath.startsWith('/app/') ? (
            <div className="space-y-3">
              <div className="bg-gray-800 rounded-lg p-3 border border-gray-700 mb-2">
                <p className="text-xs text-gray-400 mb-1">Chemin interne Docker (actuel) :</p>
                <code className="text-gray-500 text-sm font-mono break-all">{downloadPath}</code>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-2">
                  Chemin hôte (optionnel) :
                </label>
                <input
                  type="text"
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-transparent"
                  placeholder="Ex: ./data/downloads ou /host/path/to/downloads (optionnel)"
                  value={downloadPath.startsWith('/app/') ? '' : downloadPath}
                  onInput={async (e) => {
                    const newPath = (e.target as HTMLInputElement).value;
                    if (newPath.trim()) {
                      setDownloadPath(newPath.trim());
                      setIsDockerPath(false); // Plus en mode Docker si un chemin hôte est saisi
                    } else {
                      // Si vide, revenir au chemin par défaut (pas besoin d'appeler le backend)
                      const defaultPath = 'downloads';
                      setDownloadPath(defaultPath);
                      setIsDockerPath(false);
                      onSave(defaultPath).catch(err => {
                        console.error('[DOWNLOAD LOCATION] Erreur lors de la sauvegarde:', err);
                      });
                    }
                  }}
                />
              </div>
              <p className="text-xs text-gray-400">
                💡 Vous pouvez laisser vide pour utiliser le chemin Docker interne, ou saisir le chemin hôte pour référence.
              </p>
            </div>
          ) : (
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <code className="text-green-400 text-lg font-mono break-all">{downloadPath}</code>
              <p className="text-sm text-gray-400 mt-2">
                ✅ {isDockerPath ? 'Chemin hôte configuré.' : 'Chemin de téléchargement configuré. Le backend utilisera ce chemin.'}
              </p>
            </div>
          )}
        </div>
      </div>

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
          className="px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition-colors"
          onClick={async () => {
            // Si le chemin a été modifié en mode Docker, sauvegarder avant de continuer
            if (isDockerPath && downloadPath && !downloadPath.startsWith('/app/')) {
              await handleSave();
            }
            onNext();
          }}
        >
          Suivant →
        </button>
      </div>
    </div>
  );
}
