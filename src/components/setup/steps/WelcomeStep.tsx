import { useState, useEffect } from 'preact/hooks';
import { TokenManager } from '../../../lib/client/storage';
import { CloudImportManager } from '../../../lib/client/cloud-import';
import type { CloudImportStatus } from '../../../lib/client/cloud-import';
import { useI18n } from '../../../lib/i18n';
import { serverApi } from '../../../lib/client/server-api';

interface WelcomeStepProps {
  focusedButtonIndex: number;
  buttonRefs: { current: (HTMLButtonElement | null)[] };
  onNext: (saveToCloud: boolean) => void;
  onNavigateToStep?: (stepId: string) => void;
}

export function WelcomeStep({ focusedButtonIndex, buttonRefs, onNext, onNavigateToStep }: WelcomeStepProps) {
  const { t } = useI18n();
  const [saveToCloud, setSaveToCloud] = useState(true);
  const [hasToken, setHasToken] = useState(false);
  const [importStatus, setImportStatus] = useState<CloudImportStatus>(CloudImportManager.getStatus());
  const [hasBackendTmdb, setHasBackendTmdb] = useState(false);
  const [backendTmdbPreview, setBackendTmdbPreview] = useState<string | null>(null);
  const [hasBackendIndexerCategories, setHasBackendIndexerCategories] = useState(false);

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

  useEffect(() => {
    let cancelled = false;
    const loadBackendTmdb = async () => {
      try {
        const res = await serverApi.getTmdbKey();
        if (cancelled) return;
        const hasKey = !!(res.success && res.data?.hasKey);
        setHasBackendTmdb(hasKey);
        setBackendTmdbPreview(res.success && res.data?.apiKey ? res.data.apiKey : null);
      } catch {
        if (!cancelled) {
          setHasBackendTmdb(false);
          setBackendTmdbPreview(null);
        }
      }
    };
    loadBackendTmdb();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadBackendCategories = async () => {
      try {
        const indexersRes = await serverApi.getIndexers();
        if (!indexersRes.success || !indexersRes.data || cancelled) {
          setHasBackendIndexerCategories(false);
          return;
        }
        let found = false;
        for (const idx of indexersRes.data) {
          if (!idx?.id) continue;
          const catsRes = await serverApi.getIndexerCategories(idx.id);
          if (!catsRes.success || !catsRes.data) continue;
          const hasEnabled = Object.values(catsRes.data).some((cfg) => cfg?.enabled === true);
          if (hasEnabled) {
            found = true;
            break;
          }
        }
        if (!cancelled) {
          setHasBackendIndexerCategories(found);
        }
      } catch {
        if (!cancelled) {
          setHasBackendIndexerCategories(false);
        }
      }
    };
    loadBackendCategories();
    return () => {
      cancelled = true;
    };
  }, []);

  const isImportRunning = importStatus.phase === 'running';

  return (
    <div className="space-y-6 sm:space-y-8">
      <p className="text-xl sm:text-2xl md:text-3xl text-white text-center leading-relaxed">
        {t('wizard.welcome.title')}
      </p>
      <p className="text-lg sm:text-xl text-gray-400 text-center">
        {t('wizard.welcome.description')}
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
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex-1">
              <p className="text-white font-semibold mb-1">
                {t('wizard.welcome.importTitle')}
              </p>
              <p className="text-sm text-gray-400">
                {importStatus.message}
              </p>
              <p className="text-xs text-gray-500 mt-2">
                {t('wizard.welcome.importExplanation')}
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

          {/* Liste des types d'import avec badge (Importé / Rien dans le cloud) */}
          {importStatus.phase === 'success' && importStatus.importedData && (
            <div className="mt-6 pt-6 border-t border-gray-700">
              <p className="text-white font-semibold mb-3">
                {t('wizard.welcome.importedConfigTitle')}
              </p>
              <ul className="space-y-2 mb-6">
                {[
                  {
                    key: 'indexers',
                    label: t('wizard.welcome.importLabelIndexers'),
                    present: !!(importStatus.importedData.indexers?.length),
                    detail: importStatus.importedData.indexers?.length
                      ? `${importStatus.importedData.indexers.length} ${importStatus.importedData.indexers.length > 1 ? 'indexers' : 'indexer'}`
                      : null,
                  },
                  {
                    key: 'tmdb',
                    label: t('wizard.welcome.importLabelTmdb'),
                    present: !!importStatus.importedData.tmdbApiKey || hasBackendTmdb,
                    detail: null,
                  },
                  {
                    key: 'categories',
                    label: t('wizard.welcome.importLabelCategories'),
                    present: !!(importStatus.importedData.indexerCategories && Object.keys(importStatus.importedData.indexerCategories).length > 0) || hasBackendIndexerCategories,
                    detail: null,
                  },
                  {
                    key: 'downloadLocation',
                    label: t('wizard.welcome.importLabelDownloadLocation'),
                    present: !!importStatus.importedData.downloadLocation,
                    detail: null,
                  },
                  {
                    key: 'syncSettings',
                    label: t('wizard.welcome.importLabelSyncSettings'),
                    present: !!importStatus.importedData.syncSettings,
                    detail: null,
                  },
                  {
                    key: 'language',
                    label: t('wizard.welcome.importLabelLanguage'),
                    present: !!importStatus.importedData.language,
                    detail: importStatus.importedData.language || null,
                  },
                ].map(({ key, label, present, detail }) => (
                  <li key={key} className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-800/60">
                    <span className="text-gray-300 text-sm">{label}</span>
                    <span className="flex items-center gap-2">
                      {detail && present && <span className="text-xs text-gray-500">{detail}</span>}
                      {present ? (
                        <span className="badge badge-sm badge-success gap-1">
                          {t('wizard.welcome.importBadgeImported')}
                        </span>
                      ) : (
                        <span className="badge badge-sm badge-ghost text-gray-500 border border-gray-600">
                          {t('wizard.welcome.importBadgeNothingInCloud')}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              {importStatus.importedData.indexers?.length &&
                !importStatus.importedData.tmdbApiKey &&
                !importStatus.importedData.downloadLocation &&
                !importStatus.importedData.syncSettings && (
                  <p className="text-sm text-primary-300 mb-4 p-3 bg-primary-900/20 rounded-lg border border-primary-700/30">
                    {t('wizard.welcome.importOnlyIndexersHint')}
                  </p>
                )}
              {onNavigateToStep && (
                <div className="space-y-3">
                  {importStatus.importedData.indexers && importStatus.importedData.indexers.length > 0 && (
                    <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                      <div className="flex-1">
                        <p className="text-white font-medium">
                          {importStatus.importedData.indexers.length} indexer{importStatus.importedData.indexers.length > 1 ? 's' : ''} importé{importStatus.importedData.indexers.length > 1 ? 's' : ''}
                        </p>
                        <p className="text-sm text-gray-400">
                          {importStatus.importedData.indexers.map(idx => idx.name).join(', ')}
                        </p>
                      </div>
                      <button
                        onClick={() => onNavigateToStep('indexers')}
                        className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold rounded-lg transition-colors"
                      >
                        {t('wizard.welcome.modify')}
                      </button>
                    </div>
                  )}
                  {(importStatus.importedData.tmdbApiKey || hasBackendTmdb) && (
                    <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                      <div className="flex-1">
                        <p className="text-white font-medium">{t('wizard.welcome.importLabelTmdb')}</p>
                        <p className="text-sm text-gray-400">
                          {importStatus.importedData.tmdbApiKey
                            ? (importStatus.importedData.tmdbApiKey.length > 8
                                ? `${importStatus.importedData.tmdbApiKey.substring(0, 4)}...${importStatus.importedData.tmdbApiKey.substring(importStatus.importedData.tmdbApiKey.length - 4)}`
                                : '****')
                            : (backendTmdbPreview || '****')}
                        </p>
                      </div>
                      <button
                        onClick={() => onNavigateToStep('tmdb')}
                        className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold rounded-lg transition-colors"
                      >
                        {t('wizard.welcome.modify')}
                      </button>
                    </div>
                  )}
                  {importStatus.importedData.downloadLocation && (
                    <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                      <div className="flex-1">
                        <p className="text-white font-medium">{t('wizard.welcome.importLabelDownloadLocation')}</p>
                        <p className="text-sm text-gray-400 truncate">
                          {importStatus.importedData.downloadLocation}
                        </p>
                      </div>
                      <button
                        onClick={() => onNavigateToStep('downloadLocation')}
                        className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold rounded-lg transition-colors"
                      >
                        {t('wizard.welcome.modify')}
                      </button>
                    </div>
                  )}
                  {importStatus.importedData.syncSettings && (
                    <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                      <div className="flex-1">
                        <p className="text-white font-medium">{t('wizard.welcome.importLabelSyncSettings')}</p>
                        <p className="text-sm text-gray-400">
                          {importStatus.importedData.syncSettings.syncEnabled ? 'Activée' : 'Désactivée'}
                          {importStatus.importedData.syncSettings.syncFrequencyMinutes &&
                            ` • ${importStatus.importedData.syncSettings.syncFrequencyMinutes} min`}
                        </p>
                      </div>
                      <button
                        onClick={() => onNavigateToStep('sync')}
                        className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold rounded-lg transition-colors"
                      >
                        {t('wizard.welcome.modify')}
                      </button>
                    </div>
                  )}
                </div>
              )}
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
          className="w-full sm:w-auto px-8 py-4 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition-colors text-lg"
          onClick={() => onNext(saveToCloud)}
          disabled={isImportRunning}
        >
          {isImportRunning ? 'Import en cours…' : 'Commencer'}
        </button>
      </div>
    </div>
  );
}
