import { useI18n } from '../../lib/i18n/useI18n';
import { ArrowLeft } from 'lucide-preact';
import { DsCard, DsCardSection } from '../ui/design-system';
import ClientTorrentsAddTrackerList from './ClientTorrentsAddTrackerList';

const BASE_URL = '/settings/uploads/';

/** Contenu de la sous-page Uploads → Torrents du client. */
export default function ClientTorrentsUploadPageContent() {
  const { t } = useI18n();
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
      <DsCard variant="elevated" className="min-w-0 overflow-hidden">
        <DsCardSection className="flex flex-col min-h-0">
          <h2 className="ds-title-card text-[var(--ds-text-primary)] text-base sm:text-lg mb-2">
            {t('settings.clientTorrentsList.title')}
          </h2>
          <p className="text-sm ds-text-secondary mb-4">{t('settings.clientTorrentsList.description')}</p>
          <div className="min-w-0">
            <ClientTorrentsAddTrackerList />
          </div>
        </DsCardSection>
      </DsCard>
    </div>
  );
}
