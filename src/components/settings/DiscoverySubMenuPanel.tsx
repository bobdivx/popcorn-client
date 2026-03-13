import { useState, useEffect } from 'preact/hooks';
import { Sliders, ClipboardList, Ban } from 'lucide-preact';
import { useI18n } from '../../lib/i18n/useI18n';
import { canAccess } from '../../lib/permissions';
import DiscoverSlidersManager from './DiscoverSlidersManager';
import RequestsAdminManager from './RequestsAdminManager';
import BlacklistManager from './BlacklistManager';
import { SettingsNavCard } from './SettingsNavCard';
import { SettingsSubPageFrame } from './SettingsSubPageFrame';

const BASE_URL = '/settings?category=discovery';

const DISCOVERY_SUBS = ['sliders', 'requests', 'blacklist'] as const;
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

const DISCOVERY_ITEMS: DiscoveryItem[] = [
  { id: 'sliders', titleKey: 'discover.sliders', descriptionKey: 'discover.description', icon: Sliders },
  { id: 'requests', titleKey: 'requestsAdmin.title', descriptionKey: 'requestsAdmin.description', icon: ClipboardList },
  { id: 'blacklist', titleKey: 'blacklist.title', descriptionKey: 'blacklist.description', icon: Ban },
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

  if (sub === 'sliders') {
    const item = DISCOVERY_ITEMS.find((i) => i.id === 'sliders')!;
    return (
      <SettingsSubPageFrame backHref={BASE_URL} icon={item.icon} title={t(item.titleKey)} description={t(item.descriptionKey)}>
        <DiscoverSlidersManager />
      </SettingsSubPageFrame>
    );
  }
  if (sub === 'requests') {
    const item = DISCOVERY_ITEMS.find((i) => i.id === 'requests')!;
    return (
      <SettingsSubPageFrame backHref={BASE_URL} icon={item.icon} title={t(item.titleKey)} description={t(item.descriptionKey)}>
        <RequestsAdminManager />
      </SettingsSubPageFrame>
    );
  }
  if (sub === 'blacklist') {
    const item = DISCOVERY_ITEMS.find((i) => i.id === 'blacklist')!;
    return (
      <SettingsSubPageFrame backHref={BASE_URL} icon={item.icon} title={t(item.titleKey)} description={t(item.descriptionKey)}>
        <BlacklistManager />
      </SettingsSubPageFrame>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-5 ds-card-animate-stagger" role="list">
      {DISCOVERY_ITEMS.map((item) => (
        <SettingsNavCard
          key={item.id}
          href={`${BASE_URL}&sub=${item.id}`}
          icon={item.icon}
          title={t(item.titleKey)}
          description={t(item.descriptionKey)}
        />
      ))}
    </div>
  );
}
