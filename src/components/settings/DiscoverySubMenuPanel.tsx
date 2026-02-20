import { Sliders, ClipboardList, Ban } from 'lucide-preact';
import { useI18n } from '../../lib/i18n/useI18n';
import { canAccess } from '../../lib/permissions';
import { DsSettingsSectionCard } from '../ui/design-system';
import DiscoverSlidersManager from './DiscoverSlidersManager';
import RequestsAdminManager from './RequestsAdminManager';
import BlacklistManager from './BlacklistManager';

export default function DiscoverySubMenuPanel() {
  const { t } = useI18n();
  if (!canAccess('settings.server' as any)) return null;

  return (
    <div className="space-y-6 sm:space-y-8 min-w-0 overflow-hidden">
      <DsSettingsSectionCard
        icon={Sliders}
        title={t('discover.sliders')}
        accent="violet"
      >
        <div className="min-w-0">
          <p className="text-sm ds-text-secondary mb-4">{t('discover.description')}</p>
          <DiscoverSlidersManager />
        </div>
      </DsSettingsSectionCard>

      <DsSettingsSectionCard
        icon={ClipboardList}
        title={t('requestsAdmin.title')}
        accent="violet"
      >
        <div className="min-w-0">
          <p className="text-sm ds-text-secondary mb-4">{t('requestsAdmin.description')}</p>
          <RequestsAdminManager />
        </div>
      </DsSettingsSectionCard>

      <DsSettingsSectionCard
        icon={Ban}
        title={t('blacklist.title')}
        accent="violet"
      >
        <div className="min-w-0">
          <p className="text-sm ds-text-secondary mb-4">{t('blacklist.description')}</p>
          <BlacklistManager />
        </div>
      </DsSettingsSectionCard>
    </div>
  );
}
