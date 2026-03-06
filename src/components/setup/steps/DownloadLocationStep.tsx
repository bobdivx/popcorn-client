import { useState, useEffect } from 'preact/hooks';
import { PreferencesManager } from '../../../lib/client/storage';
import type { SetupStatus } from '../../../lib/client/types';
import { serverApi } from '../../../lib/client/server-api';
import { useI18n } from '../../../lib/i18n';

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
  const { t } = useI18n();
  const [downloadPath, setDownloadPath] = useState('');
  const [backendRealPath, setBackendRealPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const existingPath = PreferencesManager.getDownloadLocation();
      if (existingPath) {
        setDownloadPath(existingPath);
      } else {
        const defaultPath = 'downloads';
        setDownloadPath(defaultPath);
        onSave(defaultPath).catch(err => {
          console.error('[DOWNLOAD LOCATION] Erreur lors de la sauvegarde du chemin par défaut:', err);
        });
      }
      const healthRes = await serverApi.checkServerHealth();
      if (!cancelled && healthRes.success && healthRes.data?.download_dir) {
        setBackendRealPath(healthRes.data.download_dir);
      }
      if (!cancelled) setLoading(false);
    };
    run();
    return () => { cancelled = true; };
  }, []);

  const handleSave = async () => {
    if (!downloadPath.trim()) {
      setError(t('wizard.downloadLocation.errorRequired'));
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

  const handleNext = async () => {
    if (!downloadPath.trim()) {
      setError(t('wizard.downloadLocation.errorRequired'));
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onSave(downloadPath.trim());
      setSaving(false);
      onNext();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h3 className="text-2xl font-bold text-white">{t('wizard.downloadLocation.stepTitle')}</h3>
        <div className="flex justify-center items-center py-12">
          <div className="text-center">
            <span className="loading loading-spinner loading-lg text-primary-600"></span>
            <p className="mt-4 text-gray-400">{t('wizard.downloadLocation.loading')}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h3 className="text-2xl font-bold text-white">{t('wizard.downloadLocation.stepTitle')}</h3>

      <p className="text-gray-400">{t('wizard.downloadLocation.stepIntro')}</p>

      <ul className="list-disc list-inside space-y-2 text-gray-400 text-sm bg-gray-900/50 rounded-lg p-4 border border-gray-800">
        <li><strong className="text-gray-300">{t('wizard.downloadLocation.contextDevLabel')}</strong> — {t('wizard.downloadLocation.contextDev')}</li>
        <li><strong className="text-gray-300">{t('wizard.downloadLocation.contextDockerLabel')}</strong> — {t('wizard.downloadLocation.contextDocker')}</li>
        <li><strong className="text-gray-300">{t('wizard.downloadLocation.contextWindowsDaemonLabel')}</strong> — {t('wizard.downloadLocation.contextWindowsDaemon')}</li>
      </ul>

      {backendRealPath && (
        <div className="bg-primary-900/20 border border-primary-700/50 rounded-lg p-4">
          <p className="text-sm font-semibold text-primary-200 mb-1">
            {t('wizard.downloadLocation.realPathLabel')}
          </p>
          <code className="block text-sm font-mono text-white break-all bg-gray-900/60 px-3 py-2 rounded">
            {backendRealPath}
          </code>
        </div>
      )}

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 text-red-300">
          <span>{error}</span>
        </div>
      )}

      <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
        <label className="block text-sm font-semibold text-white mb-2">
          {t('wizard.downloadLocation.pathLabel')}
        </label>
        <input
          type="text"
          className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-transparent font-mono"
          placeholder={t('wizard.downloadLocation.pathPlaceholder')}
          value={downloadPath}
          onInput={(e) => setDownloadPath((e.target as HTMLInputElement).value)}
        />
        <p className="text-xs text-gray-500 mt-2">
          {t('wizard.downloadLocation.pathSavedHint')}
        </p>
      </div>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-4 mt-8">
        <button
          ref={(el) => { buttonRefs.current[0] = el; }}
          className="w-full sm:w-auto px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors"
          onClick={onPrevious}
        >
          ← {t('wizard.downloadLocation.previous')}
        </button>
        <button
          ref={(el) => { buttonRefs.current[1] = el; }}
          className="w-full sm:w-auto px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
          onClick={handleNext}
          disabled={saving}
        >
          {saving ? '…' : `${t('wizard.downloadLocation.next')} →`}
        </button>
      </div>
    </div>
  );
}
