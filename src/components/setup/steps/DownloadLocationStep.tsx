import { useState, useEffect } from 'preact/hooks';
import { PreferencesManager } from '../../../lib/client/storage';
import type { SetupStatus } from '../../../lib/client/types';
import { serverApi } from '../../../lib/client/server-api';
import { useI18n } from '../../../lib/i18n';
import { StepHeader, StepLoading, Alert, Spinner, IconArrowLeft, IconArrowRight } from '../wizardUi';

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
      <div>
        <StepHeader kicker="Stockage" title={t('wizard.downloadLocation.stepTitle')} />
        <StepLoading label={t('wizard.downloadLocation.loading')} />
      </div>
    );
  }

  return (
    <div>
      <StepHeader
        kicker="Stockage"
        title={t('wizard.downloadLocation.stepTitle')}
        lead={t('wizard.downloadLocation.stepIntro')}
      />

      <div class="wz-stack">
        <div class="wz-rows">
          <div class="wz-row" style="align-items:flex-start;">
            <div class="wz-row__body">
              <span class="wz-row__title">{t('wizard.downloadLocation.contextDevLabel')}</span>
              <span class="wz-row__desc">{t('wizard.downloadLocation.contextDev')}</span>
            </div>
          </div>
          <div class="wz-row" style="align-items:flex-start;">
            <div class="wz-row__body">
              <span class="wz-row__title">{t('wizard.downloadLocation.contextDockerLabel')}</span>
              <span class="wz-row__desc">{t('wizard.downloadLocation.contextDocker')}</span>
            </div>
          </div>
          <div class="wz-row" style="align-items:flex-start;">
            <div class="wz-row__body">
              <span class="wz-row__title">{t('wizard.downloadLocation.contextWindowsDaemonLabel')}</span>
              <span class="wz-row__desc">{t('wizard.downloadLocation.contextWindowsDaemon')}</span>
            </div>
          </div>
        </div>

        {backendRealPath && (
          <div class="wz-panel wz-panel--accent">
            <span class="wz-label" style="color:var(--wz-accent);">{t('wizard.downloadLocation.realPathLabel')}</span>
            <code class="wz-code">{backendRealPath}</code>
          </div>
        )}

        {error && <Alert tone="error">{error}</Alert>}

        <div class="wz-panel">
          <label class="wz-label" for="wz-download-path">
            {t('wizard.downloadLocation.pathLabel')}
          </label>
          <input
            id="wz-download-path"
            type="text"
            class="wz-input wz-input--mono"
            placeholder={t('wizard.downloadLocation.pathPlaceholder')}
            value={downloadPath}
            onInput={(e) => setDownloadPath((e.target as HTMLInputElement).value)}
          />
          <p class="wz-help">{t('wizard.downloadLocation.pathSavedHint')}</p>
        </div>
      </div>

      <div class="wz-actions">
        <button
          ref={(el) => { buttonRefs.current[0] = el; }}
          type="button"
          class="wz-btn wz-btn--ghost"
          data-focusable
          onClick={onPrevious}
        >
          <IconArrowLeft />
          {t('wizard.downloadLocation.previous')}
        </button>
        <button
          ref={(el) => { buttonRefs.current[1] = el; }}
          type="button"
          class="wz-btn wz-btn--primary"
          data-focusable
          onClick={handleNext}
          disabled={saving}
        >
          {saving ? <Spinner /> : null}
          {t('wizard.downloadLocation.next')}
          {!saving ? <IconArrowRight /> : null}
        </button>
      </div>
    </div>
  );
}
