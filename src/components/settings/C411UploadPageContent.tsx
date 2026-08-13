import { useState, useEffect, useCallback } from 'preact/hooks';
import { useI18n } from '../../lib/i18n/useI18n';
import { ArrowLeft, Upload } from 'lucide-preact';
import { serverApi } from '../../lib/client/server-api';
import { SettingsCard } from './SettingsCard';
import UploadTrackerPanel from './UploadTrackerPanel';

const BASE_URL = '/settings/uploads/';

/** Contenu de la sous-page Uploads → Publication tracker (C411). Carte grisée si non configuré. */
export default function C411UploadPageContent() {
  const { t } = useI18n();
  const [c411Configured, setC411Configured] = useState(false);
  const [loadingC411Status, setLoadingC411Status] = useState(true);

  const loadC411Configured = useCallback(async () => {
    setLoadingC411Status(true);
    const res = await serverApi.getC411UploadCookies();
    if (res.success && res.data) {
      const configured =
        (res.data.has_session && res.data.has_csrf) ||
        Boolean(res.data.has_passkey);
      setC411Configured(configured);
    }
    setLoadingC411Status(false);
  }, []);

  useEffect(() => {
    loadC411Configured();
  }, [loadC411Configured]);

  const onC411Configured = useCallback(() => setC411Configured(true), []);

  return (
    <div className="sc-frame-wrap">
      <a
        href={BASE_URL}
        data-astro-prefetch
        class="sc-back"
        aria-label={t('common.back')}
      >
        <ArrowLeft className="w-4 h-4" aria-hidden />
        <span>{t('common.back')}</span>
      </a>
      <div
        className={`min-w-0 transition-opacity duration-200 ${!c411Configured && !loadingC411Status ? 'opacity-60' : ''}`}
      >
        <SettingsCard
          icon={Upload}
          title={t('settings.uploadTrackerPanel.title')}
        >
          {!c411Configured && !loadingC411Status && (
            <div className="rounded-lg bg-[var(--ds-surface-overlay)] border border-[var(--ds-border)] p-3 mb-4 text-sm ds-text-secondary">
              {t('settings.uploadTrackerPanel.c411NotConfiguredHint')}
            </div>
          )}
          <div className="min-w-0 overflow-auto">
            <UploadTrackerPanel onC411Configured={onC411Configured} />
          </div>
        </SettingsCard>
      </div>
    </div>
  );
}
