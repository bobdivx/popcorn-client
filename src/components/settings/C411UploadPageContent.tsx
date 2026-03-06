import { useState, useEffect, useCallback } from 'preact/hooks';
import { useI18n } from '../../lib/i18n/useI18n';
import { ArrowLeft, Upload } from 'lucide-preact';
import { serverApi } from '../../lib/client/server-api';
import { DsCard, DsCardSection } from '../ui/design-system';
import UploadTrackerPanel from './UploadTrackerPanel';

const BASE_URL = '/settings/uploads/';
const ACCENT_ICON_BG = 'var(--ds-accent-violet-muted)';
const ACCENT_ICON_COLOR = 'var(--ds-accent-violet)';

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
    <div className="space-y-6">
      <a
        href={BASE_URL}
        data-astro-prefetch
        className="inline-flex items-center gap-2 text-sm font-medium text-[var(--ds-accent-violet)] hover:underline focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)] focus:ring-offset-2 rounded"
        aria-label={t('common.back')}
      >
        <ArrowLeft className="w-4 h-4" aria-hidden />
        <span>{t('common.back')}</span>
      </a>
      <div
        className={`min-w-0 transition-opacity duration-200 ${!c411Configured && !loadingC411Status ? 'opacity-60' : ''}`}
      >
        <DsCard variant="elevated" className="min-w-0 overflow-hidden">
          <DsCardSection className="flex flex-col min-h-0">
            <div className="flex items-center gap-3 mb-3">
              <span
                className="inline-flex w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex-shrink-0 items-center justify-center"
                style={{ backgroundColor: ACCENT_ICON_BG, color: ACCENT_ICON_COLOR }}
                aria-hidden
              >
                <Upload className="w-5 h-5 sm:w-6 sm:h-6" strokeWidth={1.8} />
              </span>
              <h2 className="ds-title-card text-[var(--ds-text-primary)] text-base sm:text-lg truncate">
                {t('settings.uploadTrackerPanel.title')}
              </h2>
            </div>
            {!c411Configured && !loadingC411Status && (
              <div className="rounded-lg bg-[var(--ds-surface-overlay)] border border-[var(--ds-border)] p-3 mb-4 text-sm ds-text-secondary">
                {t('settings.uploadTrackerPanel.c411NotConfiguredHint')}
              </div>
            )}
            <div className="min-w-0 overflow-auto">
              <UploadTrackerPanel onC411Configured={onC411Configured} />
            </div>
          </DsCardSection>
        </DsCard>
      </div>
    </div>
  );
}
