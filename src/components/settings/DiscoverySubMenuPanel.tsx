import { Sliders, ClipboardList, Ban } from 'lucide-preact';
import { useI18n } from '../../lib/i18n/useI18n';
import { canAccess } from '../../lib/permissions';
import SubMenuPanel, { type SubMenuItem } from './SubMenuPanel';
import DiscoverSlidersManager from './DiscoverSlidersManager';
import RequestsAdminManager from './RequestsAdminManager';
import BlacklistManager from './BlacklistManager';

function SlidersSection() {
  const { t } = useI18n();
  return (
    <div>
      <h3 className="flex items-center gap-2 text-lg font-semibold text-white mb-4">
        <Sliders className="w-5 h-5 text-primary-400" />
        {t('discover.sliders')}
      </h3>
      <p className="text-sm text-gray-400 mb-4">{t('discover.description')}</p>
      <DiscoverSlidersManager />
    </div>
  );
}

function RequestsSection() {
  const { t } = useI18n();
  return (
    <div>
      <h3 className="flex items-center gap-2 text-lg font-semibold text-white mb-4">
        <ClipboardList className="w-5 h-5 text-primary-400" />
        {t('requestsAdmin.title')}
      </h3>
      <p className="text-sm text-gray-400 mb-4">{t('requestsAdmin.description')}</p>
      <RequestsAdminManager />
    </div>
  );
}

function BlacklistSection() {
  const { t } = useI18n();
  return (
    <div>
      <h3 className="flex items-center gap-2 text-lg font-semibold text-white mb-4">
        <Ban className="w-5 h-5 text-primary-400" />
        {t('blacklist.title')}
      </h3>
      <p className="text-sm text-gray-400 mb-4">{t('blacklist.description')}</p>
      <BlacklistManager />
    </div>
  );
}

const DISCOVERY_ITEMS: SubMenuItem[] = [
  {
    id: 'sliders',
    titleKey: 'discover.sliders',
    descriptionKey: 'discover.description',
    icon: Sliders,
    permission: 'settings.server',
    inlineContent: SlidersSection,
  },
  {
    id: 'requests',
    titleKey: 'requestsAdmin.title',
    descriptionKey: 'requestsAdmin.description',
    icon: ClipboardList,
    permission: 'settings.server',
    inlineContent: RequestsSection,
  },
  {
    id: 'blacklist',
    titleKey: 'blacklist.title',
    descriptionKey: 'blacklist.description',
    icon: Ban,
    permission: 'settings.server',
    inlineContent: BlacklistSection,
  },
];

export default function DiscoverySubMenuPanel() {
  const visibleItems = DISCOVERY_ITEMS.filter(
    (item) => !item.permission || canAccess(item.permission as any)
  );
  return <SubMenuPanel items={DISCOVERY_ITEMS} visibleItems={visibleItems} />;
}
