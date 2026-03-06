import { useState, useEffect } from 'preact/hooks';
import { getBackendUrl, setBackendUrl as saveBackendUrl, clearBackendUrl, hasBackendUrl, isBackendUrlSameAsClientUrl } from '../../lib/backend-config.js';
import { useI18n } from '../../lib/i18n/useI18n';
import { HelpCircle, X } from 'lucide-preact';
import { saveUserConfigMerge } from '../../lib/api/popcorn-web.js';
import { TokenManager } from '../../lib/client/storage.js';
import { serverApi } from '../../lib/client/server-api.js';
import { DsCard, DsCardSection } from '../ui/design-system';

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
        const previousUrl = getBackendUrl()?.trim().replace(/\/$/, '') ?? '';
        const newUrl = backendUrl.trim().replace(/\/$/, '');
        if (typeof window !== 'undefined' && isBackendUrlSameAsClientUrl(newUrl)) {
          const confirmed = window.confirm(t('serverSettings.sameOriginConfirmMessage'));
          if (!confirmed) {
            setSaving(false);
            return;
          }
        }
        saveBackendUrl(backendUrl.trim());
        if (previousUrl !== newUrl) {
          try {
            serverApi.logout();
          } catch {
            // ignore
          }
        }
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

      // Si l'URL backend est identique à l'adresse du client, demander confirmation
      const newUrl = backendUrl.trim().replace(/\/$/, '');
      if (typeof window !== 'undefined' && isBackendUrlSameAsClientUrl(newUrl)) {
        const confirmed = window.confirm(t('serverSettings.sameOriginConfirmMessage'));
        if (!confirmed) {
          setSaving(false);
          return;
        }
      }

      // Si l'URL backend change, invalider la session après sauvegarde (évite anciens tokens sur nouveau serveur)
      const previousUrl = getBackendUrl()?.trim().replace(/\/$/, '') ?? '';

      // Sauvegarder la configuration dans localStorage
      saveBackendUrl(backendUrl.trim());

      if (previousUrl !== newUrl) {
        try {
          serverApi.logout();
        } catch {
          // ignore
        }
      }

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

      // Réinitialiser l'URL et invalider la session (tokens / user) pour éviter
      // d'envoyer d'anciens tokens après une "nouvelle installation" ou changement de serveur
      clearBackendUrl();
      try {
        serverApi.logout();
      } catch {
        // ignore
      }
      const defaultUrl = 'http://127.0.0.1:3000';
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
    <div class="space-y-6 sm:space-y-8">
      {/* Messages d'état */}
      {error && (
        <div className="ds-status-badge ds-status-badge--error w-full max-w-xl" role="alert">
          {error}
        </div>
      )}
      {success && (
        <div className="ds-status-badge ds-status-badge--success w-full max-w-xl" role="status">
          {success}
        </div>
      )}
      {loading && (
        <div className="ds-card rounded-[var(--ds-radius-lg)] px-4 py-3 flex items-center gap-2">
          <span className="loading loading-spinner loading-sm text-[var(--ds-accent-violet)]" />
          <span className="ds-text-secondary text-sm">{t('serverSettings.loadingConfig')}</span>
        </div>
      )}
      {!loading && savedBackendUrl && (
        <div className="ds-card rounded-[var(--ds-radius-lg)] px-4 py-3 border border-[var(--ds-border)]">
          <p className="text-sm text-[var(--ds-text-primary)]">
            <strong>{t('serverSettings.currentUrl')}</strong> {savedBackendUrl}
          </p>
          <p className="ds-text-secondary text-xs mt-1">{t('serverSettings.urlStoredInfo')}</p>
        </div>
      )}

      {/* Carte de configuration */}
      <DsCard variant="elevated">
        <DsCardSection>
          <div className="flex items-center justify-between mb-4">
            <h3 className="ds-title-section text-[var(--ds-text-primary)]">{t('serverSettings.title')}</h3>
            <button
              type="button"
              onClick={() => setShowInfoModal(true)}
              className="p-2 rounded-lg text-[var(--ds-text-tertiary)] hover:text-[var(--ds-text-primary)] hover:bg-white/5 transition-colors"
              title={t('serverSettings.info.title')}
              aria-label={t('serverSettings.info.title')}
            >
              <HelpCircle className="w-5 h-5" />
            </button>
          </div>
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-[var(--ds-text-secondary)] mb-2">
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
                className="w-full px-4 py-3 bg-[var(--ds-surface)] border border-[var(--ds-border)] rounded-[var(--ds-radius-sm)] text-[var(--ds-text-primary)] placeholder-[var(--ds-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)] focus:border-transparent transition-all"
                disabled={saving || testing || loading}
              />
              <p className="mt-2 ds-text-tertiary text-sm">{t('serverSettings.examples')}</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-4">
              <button
                onClick={handleTest}
                disabled={testing || saving || loading || !backendUrl.trim()}
                className="min-h-[48px] px-6 py-3 rounded-[var(--ds-radius-sm)] font-semibold text-[var(--ds-text-on-accent)] transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[var(--ds-surface)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                style={{ backgroundColor: 'var(--ds-accent-violet)' }}
              >
                {testing ? (
                  <>
                    <span className="loading loading-spinner loading-sm" />
                    {t('serverSettings.testing')}
                  </>
                ) : (
                  t('serverSettings.testConnection')
                )}
              </button>
              <button
                onClick={handleSave}
                disabled={saving || testing || loading || !backendUrl.trim()}
                className="min-h-[48px] flex-1 px-6 py-3 rounded-[var(--ds-radius-sm)] font-semibold bg-[var(--ds-accent-violet)] text-[var(--ds-text-on-accent)] hover:opacity-95 transition-all focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)] focus:ring-offset-2 focus:ring-offset-[var(--ds-surface)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {saving ? (
                  <>
                    <span className="loading loading-spinner loading-sm" />
                    {t('serverSettings.saving')}
                  </>
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
                  className="min-h-[48px] px-6 py-3 rounded-[var(--ds-radius-sm)] font-semibold bg-[var(--ds-surface-elevated)] text-[var(--ds-text-primary)] border border-[var(--ds-border)] hover:bg-white/10 transition-all focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)] focus:ring-offset-2 focus:ring-offset-[var(--ds-surface)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t('serverSettings.reset')}
                </button>
              )}
            </div>
          </div>
        </DsCardSection>
      </DsCard>

      {/* Modal Informations */}
      {showInfoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--ds-surface-overlay)]" onClick={() => setShowInfoModal(false)}>
          <DsCard variant="elevated" className="max-w-md w-full shadow-xl" onClick={(e) => e.stopPropagation()}>
            <DsCardSection>
              <div className="flex items-center justify-between mb-4">
                <h3 className="ds-title-section text-[var(--ds-text-primary)]">{t('serverSettings.info.title')}</h3>
                <button
                  type="button"
                  onClick={() => setShowInfoModal(false)}
                  className="p-2 rounded-lg text-[var(--ds-text-tertiary)] hover:text-[var(--ds-text-primary)] hover:bg-white/10 transition-colors"
                  aria-label={t('common.close')}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-3 text-sm ds-text-secondary">
                <p>• {t('serverSettings.info.point1')}</p>
                <p>• {t('serverSettings.info.point2')}</p>
                <p>• {t('serverSettings.info.point3')}</p>
                <p>• {t('serverSettings.info.point4')}</p>
              </div>
              <div className="mt-6">
                <button
                  type="button"
                  onClick={() => setShowInfoModal(false)}
                  className="w-full min-h-[48px] rounded-[var(--ds-radius-sm)] font-semibold bg-[var(--ds-accent-violet)] text-[var(--ds-text-on-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)] focus:ring-offset-2 focus:ring-offset-[var(--ds-surface)]"
                >
                  {t('common.close')}
                </button>
              </div>
            </DsCardSection>
          </DsCard>
        </div>
      )}
    </div>
  );
}
