import { useState, useEffect } from 'preact/hooks';
import { Sliders, ClipboardList, Ban, Users } from 'lucide-preact';
import { useI18n } from '../../lib/i18n/useI18n';
import { canAccess } from '../../lib/permissions';
import DiscoverSlidersManager from './DiscoverSlidersManager';
import RequestsAdminManager from './RequestsAdminManager';
import BlacklistManager from './BlacklistManager';
import QuotaAdminPanel from './QuotaAdminPanel';
import { SettingsNavCard } from './SettingsNavCard';
import { SettingsSubPageFrame } from './SettingsSubPageFrame';
import { isRouteBlockedInStoreBuild } from '../../lib/distribution';

const BASE_URL = '/settings/discovery/';

const DISCOVERY_SUBS = ['sliders', 'requests', 'blacklist', 'quotas'] as const;
type DiscoverySub = (typeof DISCOVERY_SUBS)[number];

function getSubFromUrl(): DiscoverySub | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const sub = params.get('sub');
  return DISCOVERY_SUBS.includes(sub as DiscoverySub) ? (sub as DiscoverySub) : null;
}

type DiscoveryItem = {
  id: DiscoverySub;
  titleKey: string;
  descriptionKey: string;
  icon: typeof Sliders;
};

/** Page dédiée de chaque section : une section dont la page est masquée (module absent) l'est ici aussi. */
const SUB_ROUTES: Record<DiscoverySub, string> = {
  sliders: '/settings/discover-sliders',
  requests: '/settings/requests-admin',
  blacklist: '/settings/blacklist',
  quotas: '/settings/requests-admin',
};

function isSubAvailable(id: DiscoverySub): boolean {
  return !isRouteBlockedInStoreBuild(SUB_ROUTES[id]);
}

const DISCOVERY_ITEMS: DiscoveryItem[] = [
  { id: 'sliders', titleKey: 'discover.sliders', descriptionKey: 'discover.description', icon: Sliders },
  { id: 'requests', titleKey: 'requestsAdmin.title', descriptionKey: 'requestsAdmin.description', icon: ClipboardList },
  { id: 'blacklist', titleKey: 'blacklist.title', descriptionKey: 'blacklist.description', icon: Ban },
  { id: 'quotas', titleKey: 'quotas.title', descriptionKey: 'quotas.description', icon: Users },
];


export default function DiscoverySubMenuPanel() {
  const { t } = useI18n();
  const [sub, setSub] = useState<DiscoverySub | null>(getSubFromUrl);

  useEffect(() => {
    setSub(getSubFromUrl());
  }, []);

  useEffect(() => {
    const update = () => setSub(getSubFromUrl());
    window.addEventListener('popstate', update);
    document.addEventListener('astro:page-load', update);
    return () => {
      window.removeEventListener('popstate', update);
      document.removeEventListener('astro:page-load', update);
    };
  }, []);

  if (!canAccess('settings.server' as any)) return null;

  const items = DISCOVERY_ITEMS.filter((i) => isSubAvailable(i.id));
  const detailItem = items.find((i) => i.id === sub);

  return (
    <>
      <div className="hub-grid" data-tv-list role="list">
        {items.map((item) => (
          <SettingsNavCard
            key={item.id}
            href={`${BASE_URL}?sub=${item.id}`}
            icon={item.icon}
            title={t(item.titleKey)}
            description={t(item.descriptionKey)}
          />
        ))}
      </div>
      {detailItem && (
        <SettingsSubPageFrame backHref={BASE_URL} icon={detailItem.icon} title={t(detailItem.titleKey)} description={t(detailItem.descriptionKey)}>
          {sub === 'sliders' && <DiscoverSlidersManager />}
          {sub === 'requests' && <RequestsAdminManager />}
          {sub === 'blacklist' && <BlacklistManager />}
          {sub === 'quotas' && <QuotaAdminPanel />}
        </SettingsSubPageFrame>
      )}
    </>
  );
}
