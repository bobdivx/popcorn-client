import DiscoverSlidersManager from './DiscoverSlidersManager';
import RequestsAdminManager from './RequestsAdminManager';
import BlacklistManager from './BlacklistManager';
import { Sliders, ClipboardList, Ban } from 'lucide-preact';
import { useI18n } from '../../lib/i18n/useI18n';

export default function DiscoveryPanel() {
  const { t } = useI18n();

  return (
    <div className="flex-1 py-4 px-4 sm:px-6 space-y-6 overflow-y-auto scrollbar-visible">
      <section className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
        <div className="p-4 sm:p-6">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-white mb-4">
            <Sliders className="w-5 h-5 text-primary-400" />
            {t('discover.sliders')}
          </h3>
          <p className="text-sm text-gray-400 mb-4">{t('discover.description')}</p>
          <DiscoverSlidersManager />
        </div>
      </section>

      <section className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
        <div className="p-4 sm:p-6">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-white mb-4">
            <ClipboardList className="w-5 h-5 text-primary-400" />
            {t('requestsAdmin.title')}
          </h3>
          <p className="text-sm text-gray-400 mb-4">{t('requestsAdmin.description')}</p>
          <RequestsAdminManager />
        </div>
      </section>

      <section className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
        <div className="p-4 sm:p-6">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-white mb-4">
            <Ban className="w-5 h-5 text-primary-400" />
            {t('blacklist.title')}
          </h3>
          <p className="text-sm text-gray-400 mb-4">{t('blacklist.description')}</p>
          <BlacklistManager />
        </div>
      </section>
    </div>
  );
}
