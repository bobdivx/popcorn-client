import { useState, useEffect } from 'preact/hooks';
import { getBackendUrl, setBackendUrl as saveBackendUrl, clearBackendUrl, hasBackendUrl } from '../../lib/backend-config.js';
import { useI18n } from '../../lib/i18n/useI18n';
import { HelpCircle, X } from 'lucide-preact';
import { saveUserConfigMerge } from '../../lib/api/popcorn-web.js';
import { TokenManager } from '../../lib/client/storage.js';

export default function ServerSettings() {
  const { t } = useI18n();
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [backendUrl, setBackendUrl] = useState('');
  const [savedBackendUrl, setSavedBackendUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const isMixedContentRisk = (urlString: string) => {
    if (typeof window === 'undefined') return false;
    if (window.location.protocol !== 'https:') return false;
    try {
      const urlObj = new URL(urlString);
      if (urlObj.protocol !== 'http:') return false;
      const host = urlObj.hostname.toLowerCase();
      const isLocalhost =
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host === '::1' ||
        host.endsWith('.localhost');
      return !isLocalhost;
    } catch {
      return false;
    }
  };

  // Charger la configuration depuis localStorage au démarrage
  useEffect(() => {
    loadBackendUrl();
  }, []);

  const loadBackendUrl = () => {
    try {
      setLoading(true);
      setError('');
      
      // Récupérer l'URL du backend depuis localStorage
      const url = getBackendUrl();
      setBackendUrl(url);
      
      // Vérifier si une URL est configurée (pas juste la valeur par défaut)
      if (hasBackendUrl()) {
        setSavedBackendUrl(url);
      } else {
        setSavedBackendUrl(null);
      }
    } catch (err) {
      console.error('Erreur lors du chargement de l\'URL du backend:', err);
      const defaultUrl = 'http://127.0.0.1:3000';
      setBackendUrl(defaultUrl);
      setSavedBackendUrl(null);
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    if (!backendUrl.trim()) {
      setError(t('serverSettings.enterUrl'));
      return;
    }

    try {
      setTesting(true);
      setError('');
      setSuccess('');

      // Valider l'URL
      try {
        const urlObj = new URL(backendUrl);
        // Vérifier que le protocole est http ou https
        if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
          throw new Error(t('serverSettings.protocolError'));
        }
      } catch (e) {
        if (e instanceof TypeError) {
          throw new Error(t('serverSettings.invalidUrl'));
        }
        throw e;
      }

      if (isMixedContentRisk(backendUrl.trim())) {
        setError(t('serverSettings.mixedContentError'));
        return;
      }

      // Tester la connexion au backend Rust directement
      const response = await fetch(`${backendUrl.trim()}/api/client/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(t('serverSettings.connectionError', { status: response.status }));
      }

      setSuccess(t('serverSettings.connectionSuccess'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!backendUrl.trim()) {
      setError(t('serverSettings.enterUrl'));
      return;
    }

    try {
      setSaving(true);
      setError('');
      setSuccess('');

      // Valider l'URL
      try {
        const urlObj = new URL(backendUrl);
        // Vérifier que le protocole est http ou https
        if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
          throw new Error(t('serverSettings.protocolError'));
        }
      } catch (e) {
        if (e instanceof TypeError) {
          throw new Error(t('serverSettings.invalidUrl'));
        }
        throw e;
      }

      if (isMixedContentRisk(backendUrl.trim())) {
        saveBackendUrl(backendUrl.trim());
        setSavedBackendUrl(backendUrl.trim());
        setSuccess(t('serverSettings.savedMixedContent'));
        return;
      }

      // Tester la connexion avant de sauvegarder
      setTesting(true);
      const testResponse = await fetch(`${backendUrl.trim()}/api/client/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      setTesting(false);

      if (!testResponse.ok) {
        throw new Error(t('serverSettings.connectionError', { status: testResponse.status }));
      }

      // Sauvegarder la configuration dans localStorage
      saveBackendUrl(backendUrl.trim());

      // Synchroniser l'URL du backend dans le cloud (pour quick-connect et autres appareils)
      const cloudToken = TokenManager.getCloudAccessToken();
      if (cloudToken) {
        try {
          const res = await saveUserConfigMerge({ backendUrl: backendUrl.trim() }, cloudToken);
          if (!res?.success) {
            console.warn('[ServerSettings] Sauvegarde cloud du backendUrl non effectuée:', res?.message);
          }
        } catch (e) {
          console.warn('[ServerSettings] Erreur sauvegarde cloud backendUrl:', e);
        }
      }

      setSavedBackendUrl(backendUrl.trim());
      setSuccess(t('serverSettings.savedSuccess'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
      setTesting(false);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    try {
      setSaving(true);
      setError('');
      
      // Réinitialiser à la valeur par défaut
      const defaultUrl = 'http://127.0.0.1:3000';
      clearBackendUrl();
      setBackendUrl(defaultUrl);
      setSavedBackendUrl(null);
      setSuccess(t('serverSettings.resetSuccess'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div class="space-y-6">
      {/* Titre avec icône aide */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">{t('serverSettings.title')}</h3>
        <button
          type="button"
          onClick={() => setShowInfoModal(true)}
          className="p-2 rounded-lg text-gray-400 hover:text-primary-400 hover:bg-white/5 transition-colors"
          title={t('serverSettings.info.title')}
          aria-label={t('serverSettings.info.title')}
        >
          <HelpCircle className="w-5 h-5" />
        </button>
      </div>

      {/* Modal Informations */}
      {showInfoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={() => setShowInfoModal(false)}>
          <div
            className="bg-[#1a1c20] border border-white/10 rounded-2xl p-6 max-w-md w-full shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">{t('serverSettings.info.title')}</h3>
              <button
                type="button"
                onClick={() => setShowInfoModal(false)}
                className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                aria-label={t('common.close')}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3 text-sm text-gray-300">
              <p>• {t('serverSettings.info.point1')}</p>
              <p>• {t('serverSettings.info.point2')}</p>
              <p>• {t('serverSettings.info.point3')}</p>
              <p>• {t('serverSettings.info.point4')}</p>
            </div>
            <div className="mt-6">
              <button
                type="button"
                onClick={() => setShowInfoModal(false)}
                className="btn btn-primary w-full"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Messages d'erreur et de succès */}
      {error && (
        <div class="p-4 bg-red-900/30 border border-red-600 rounded-lg">
          <span class="text-red-300">{error}</span>
        </div>
      )}

      {success && (
        <div class="p-4 bg-green-900/30 border border-green-600 rounded-lg">
          <span class="text-green-300">{success}</span>
        </div>
      )}

      {/* Chargement */}
      {loading && (
        <div class="p-4 bg-gray-900/30 border border-gray-600 rounded-lg">
          <p class="text-gray-300">
            <span class="loading loading-spinner loading-sm"></span> {t('serverSettings.loadingConfig')}
          </p>
        </div>
      )}

      {/* Configuration actuelle */}
      {!loading && savedBackendUrl && (
        <div class="p-4 bg-blue-900/30 border border-blue-600 rounded-lg">
          <p class="text-blue-300">
            <strong>{t('serverSettings.currentUrl')}</strong> {savedBackendUrl}
          </p>
          <p class="text-blue-400 text-sm mt-2">
            {t('serverSettings.urlStoredInfo')}
          </p>
        </div>
      )}

      {/* Carte de configuration */}
      <div class="p-4 sm:p-6 md:p-8 rounded-xl bg-gradient-to-br from-gray-900 to-black border-2 border-gray-800">
        <div class="space-y-6">
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">
              {t('serverSettings.backendUrl')}
            </label>
            <input
              type="text"
              value={backendUrl}
              onInput={(e) => {
                setBackendUrl((e.target as HTMLInputElement).value);
                setError('');
                setSuccess('');
              }}
              placeholder={t('serverSettings.backendUrlPlaceholder')}
              class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
              disabled={saving || testing || loading}
            />
            <p class="mt-2 text-sm text-gray-400">
              {t('serverSettings.examples')}
            </p>
          </div>

          <div class="flex flex-col sm:flex-row gap-4">
            <button
              onClick={handleTest}
              disabled={testing || saving || loading || !backendUrl.trim()}
              class="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-bold py-3 px-6 rounded-lg transition-all duration-200 min-h-[48px] focus:outline-none focus:ring-4 focus:ring-blue-500"
            >
              {testing ? (
                <span class="flex items-center gap-2">
                  <span class="loading loading-spinner loading-sm"></span>
                  {t('serverSettings.testing')}
                </span>
              ) : (
                t('serverSettings.testConnection')
              )}
            </button>

            <button
              onClick={handleSave}
              disabled={saving || testing || loading || !backendUrl.trim()}
              class="bg-primary hover:bg-primary-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-bold py-3 px-6 rounded-lg transition-all duration-200 min-h-[48px] focus:outline-none focus:ring-4 focus:ring-primary-500 flex-1"
            >
              {saving ? (
                <span class="flex items-center gap-2">
                  <span class="loading loading-spinner loading-sm"></span>
                  {t('serverSettings.saving')}
                </span>
              ) : testing ? (
                t('serverSettings.testing')
              ) : (
                t('serverSettings.testAndSave')
              )}
            </button>

            {savedBackendUrl && (
              <button
                onClick={handleReset}
                disabled={saving || testing || loading}
                class="bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 min-h-[48px] focus:outline-none focus:ring-4 focus:ring-gray-500"
              >
                {t('serverSettings.reset')}
              </button>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
