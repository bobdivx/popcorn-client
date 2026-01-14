import { useState, useEffect } from 'preact/hooks';
import { TokenManager } from '../../../lib/client/storage';
import { CloudImportManager } from '../../../lib/client/cloud-import';
import type { CloudImportStatus } from '../../../lib/client/cloud-import';

interface WelcomeStepProps {
  focusedButtonIndex: number;
  buttonRefs: { current: (HTMLButtonElement | null)[] };
  onNext: (saveToCloud: boolean) => void;
}

export function WelcomeStep({ focusedButtonIndex, buttonRefs, onNext }: WelcomeStepProps) {
  const [saveToCloud, setSaveToCloud] = useState(true);
  const [hasToken, setHasToken] = useState(false);
  const [importStatus, setImportStatus] = useState<CloudImportStatus>(CloudImportManager.getStatus());

  useEffect(() => {
    // Vérifier si l'utilisateur a un token d'authentification
    const token = TokenManager.getAccessToken();
    setHasToken(!!token);
    // Si pas de token, désactiver la sauvegarde cloud
    if (!token) {
      setSaveToCloud(false);
    }
  }, []);

  useEffect(() => {
    return CloudImportManager.subscribe(setImportStatus);
  }, []);

  const isImportRunning = importStatus.phase === 'running';

  return (
    <div className="space-y-6 sm:space-y-8">
      <p className="text-xl sm:text-2xl md:text-3xl text-white text-center leading-relaxed">
        Bienvenue dans Popcorn Client !
      </p>
      <p className="text-lg sm:text-xl text-gray-400 text-center">
        Ce wizard va vous guider pour configurer votre client.
      </p>
      <div className="bg-gray-900 rounded-xl p-6 sm:p-8 border border-gray-800">
        <p className="text-lg sm:text-xl text-white mb-4 font-semibold">
          Vous devrez configurer :
        </p>
        <ul className="space-y-3 sm:space-y-4 text-gray-300 text-base sm:text-lg">
          <li className="flex items-start">
            <span className="text-primary-600 mr-3 text-xl">•</span>
            <span>Au moins un indexer pour récupérer les torrents</span>
          </li>
          <li className="flex items-start">
            <span className="text-primary-600 mr-3 text-xl">•</span>
            <span>Une clé API TMDB pour enrichir les métadonnées</span>
          </li>
          <li className="flex items-start">
            <span className="text-primary-600 mr-3 text-xl">•</span>
            <span>L'emplacement de téléchargement local</span>
          </li>
        </ul>
      </div>

      {(importStatus.phase === 'running' || importStatus.phase === 'success' || importStatus.phase === 'error') && (
        <div className="rounded-xl p-6 sm:p-8 border border-gray-800 bg-gray-900">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              <p className="text-white font-semibold mb-1">
                Import de votre configuration cloud
              </p>
              <p className="text-sm text-gray-400">
                {importStatus.message}
              </p>
              {importStatus.phase === 'error' && importStatus.error && (
                <p className="text-sm text-primary-300 mt-2">
                  {importStatus.error}
                </p>
              )}
            </div>
            {importStatus.phase === 'running' && (
              <span className="loading loading-spinner loading-md text-primary-600"></span>
            )}
          </div>

          {importStatus.total > 0 && (
            <div className="mt-4">
              <div className="w-full bg-gray-800 rounded-full h-2">
                <div
                  className="bg-primary-600 h-2 rounded-full transition-all"
                  style={{ width: `${Math.min(100, Math.round((importStatus.done / importStatus.total) * 100))}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {importStatus.done} / {importStatus.total}
              </p>
            </div>
          )}
        </div>
      )}

      {hasToken && (
        <div className="bg-blue-900/20 border border-blue-700/50 rounded-xl p-6 sm:p-8">
          <div className="flex items-start gap-3 text-left">
            <input
              type="checkbox"
              id="save-config-cloud"
              checked={saveToCloud}
              onChange={(e) => setSaveToCloud((e.target as HTMLInputElement).checked)}
              className="mt-1 w-5 h-5 text-primary-600 bg-gray-800 border-gray-700 rounded focus:ring-primary-600 focus:ring-2 cursor-pointer"
            />
            <label htmlFor="save-config-cloud" className="flex-1 cursor-pointer">
              <span className="font-semibold text-white text-lg block mb-2">
                💾 Synchroniser la configuration dans le cloud
              </span>
              <span className="text-sm text-gray-300 block">
                Votre configuration (indexers, clé TMDB, emplacement de téléchargement) sera sauvegardée dans votre compte cloud.
                Vous pourrez la restaurer lors d'une prochaine installation sur un autre appareil.
              </span>
            </label>
          </div>
        </div>
      )}

      {!hasToken && (
        <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-4">
          <p className="text-sm text-gray-400 text-center">
            ℹ️ Connectez-vous avec un compte cloud pour synchroniser votre configuration et la restaurer sur d'autres appareils.
          </p>
        </div>
      )}

      <div className="flex justify-end mt-8 sm:mt-12">
        <button
          ref={(el) => { buttonRefs.current[0] = el; }}
          className="px-8 py-4 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition-colors text-lg"
          onClick={() => onNext(saveToCloud)}
          disabled={isImportRunning}
        >
          {isImportRunning ? 'Import en cours…' : 'Commencer'}
        </button>
      </div>
    </div>
  );
}
