import { useState, useEffect } from 'preact/hooks';
import { ChevronLeft, Shield, ExternalLink } from 'lucide-preact';
import { serverApi } from '../../lib/client/server-api';
import { getUserConfig, saveUserConfigMerge } from '../../lib/api/popcorn-web';
import { useI18n } from '../../lib/i18n/useI18n';

const DOC_URL = 'https://github.com/bobdivx/popcorn-web/blob/main/docs/CASAOS_GUIDE.md#flaresolverr-indexers-derrière-cloudflare';
const DEFAULT_OPEN_URL = 'http://localhost:9191';

interface FlareSolverrPanelProps {
  onBack?: () => void;
}

export default function FlareSolverrPanel({ onBack }: FlareSolverrPanelProps) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [testReachable, setTestReachable] = useState<boolean | null>(null);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [openUrl, setOpenUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<'success' | 'error' | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      serverApi.checkServerHealth(),
      getUserConfig(),
    ]).then(([healthRes, config]) => {
      if (cancelled) return;
      if (healthRes.success && healthRes.data) {
        setConfigured(healthRes.data.flaresolverr_configured === true);
      } else {
        setConfigured(null);
      }
      const url = config?.flaresolverrOpenUrl ?? '';
      if (import.meta.env.DEV && config != null) {
        console.log('[FlareSolverrPanel] config.flaresolverrOpenUrl reçu:', config.flaresolverrOpenUrl ?? '(vide/absent)');
      }
      setOpenUrl(url);
    }).catch(() => {
      if (!cancelled) setConfigured(null);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (loading || configured !== true) {
      setTestReachable(null);
      setTestMessage(null);
      return;
    }
    let cancelled = false;
    setTestReachable(null);
    setTestMessage(null);
    serverApi.testFlareSolverr().then((res) => {
      if (cancelled) return;
      if (res.success && res.data) {
        setTestReachable(res.data.reachable);
        setTestMessage(res.data.message ?? null);
      } else {
        setTestReachable(false);
        setTestMessage(res.message ?? null);
      }
    }).catch(() => {
      if (!cancelled) {
        setTestReachable(false);
        setTestMessage(null);
      }
    });
    return () => { cancelled = true; };
  }, [loading, configured]);

  const handleSave = async () => {
    const urlToSave = openUrl.trim() || null;
    setSaving(true);
    setSaveMessage(null);
    try {
      const result = await saveUserConfigMerge({ flaresolverrOpenUrl: urlToSave });
      if (result?.success) {
        setSaveMessage('success');
        setTimeout(() => setSaveMessage(null), 3000);
      } else {
        setSaveMessage('error');
      }
    } catch {
      setSaveMessage('error');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenPage = () => {
    const url = (openUrl && openUrl.trim()) || DEFAULT_OPEN_URL;
    const normalized = url.startsWith('http://') || url.startsWith('https://') ? url : `http://${url}`;
    window.open(normalized, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="flex flex-col py-4 px-4 sm:px-6 overflow-y-auto">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 text-gray-400 hover:text-white mb-4"
          data-focusable
        >
          <ChevronLeft className="w-5 h-5" aria-hidden />
          <span>{t('common.back')}</span>
        </button>
      )}

      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-xl bg-primary-500/20 flex items-center justify-center">
          <Shield className="w-6 h-6 text-primary-400" aria-hidden />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-white">{t('settingsMenu.flaresolverr.title')}</h2>
          <p className="text-sm text-gray-400">{t('settingsMenu.flaresolverr.description')}</p>
        </div>
      </div>

      {loading ? (
        <p className="text-gray-400">{t('indexersManager.loading')}</p>
      ) : (
        <div className="space-y-4 text-gray-300">
          <p>{t('settingsMenu.flaresolverrPanel.intro')}</p>
          <p>{t('settingsMenu.flaresolverrPanel.configureBackend')}</p>
          <p>{t('settingsMenu.flaresolverrPanel.perIndexer')}</p>

          {configured !== null && (
            <div
              className={`rounded-lg border p-4 ${
                configured
                  ? 'bg-green-900/20 border-green-700/50 text-green-200'
                  : 'bg-amber-900/20 border-amber-700/50 text-amber-200'
              }`}
            >
              {configured
                ? t('settingsMenu.flaresolverrPanel.statusConfigured')
                : t('settingsMenu.flaresolverrPanel.statusNotConfigured')}
            </div>
          )}

          {configured === true && (
            <div className="rounded-lg border p-4 bg-gray-800/50 border-gray-700">
              <p className="text-sm font-medium text-white mb-2">{t('settingsMenu.flaresolverrPanel.testConnectivity')}</p>
              {testReachable === null && (
                <p className="text-gray-400 text-sm">{t('settingsMenu.flaresolverrPanel.testChecking')}</p>
              )}
              {testReachable === true && (
                <p className="text-green-400 text-sm">{t('settingsMenu.flaresolverrPanel.testOperational')}</p>
              )}
              {testReachable === false && (
                <p className="text-amber-400 text-sm">
                  {t('settingsMenu.flaresolverrPanel.testUnreachable')}
                  {testMessage && <span className="block mt-1 text-gray-400">{testMessage}</span>}
                </p>
              )}
            </div>
          )}

          <div className="form-control">
            <label className="label">
              <span className="label-text text-white">{t('settingsMenu.flaresolverrPanel.openUrlLabel')}</span>
            </label>
            <div className="flex flex-wrap gap-2">
              <input
                type="url"
                className="input input-bordered bg-gray-800 border-gray-700 text-white flex-1 min-w-[200px]"
                value={openUrl}
                onInput={(e) => setOpenUrl((e.target as HTMLInputElement).value)}
                placeholder={t('settingsMenu.flaresolverrPanel.openUrlPlaceholder')}
              />
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? t('indexersManager.saving') : t('settingsMenu.flaresolverrPanel.save')}
              </button>
            </div>
            {saveMessage === 'success' && <p className="text-sm text-green-400 mt-1">{t('settingsMenu.flaresolverrPanel.saveSuccess')}</p>}
            {saveMessage === 'error' && <p className="text-sm text-red-400 mt-1">{t('settingsMenu.flaresolverrPanel.saveError')}</p>}
          </div>

          <button
            type="button"
            className="btn btn-outline btn-sm gap-2"
            onClick={handleOpenPage}
          >
            <ExternalLink className="w-4 h-4" aria-hidden />
            {t('settingsMenu.flaresolverrPanel.openPage')}
          </button>

          <a
            href={DOC_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-primary-400 hover:text-primary-300"
          >
            <ExternalLink className="w-4 h-4" aria-hidden />
            {t('settingsMenu.flaresolverrPanel.docLink')}
          </a>
        </div>
      )}
    </div>
  );
}
