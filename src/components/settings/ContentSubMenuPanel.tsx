import { useState, useEffect } from 'preact/hooks';
import { Film, Search, RefreshCw, Layers } from 'lucide-preact';
import { useI18n } from '../../lib/i18n/useI18n';
import { canAccess } from '../../lib/permissions';
import TmdbConfig from './TmdbConfig';
import TorrentSyncManager from './TorrentSyncManager';
import { SettingsNavCard } from './SettingsNavCard';
import { SettingsSubPageFrame } from './SettingsSubPageFrame';

const CONTENT_BASE = '/settings/content';

type ContentLinkItem = {
  id: string;
  titleKey: string;
  descriptionKey: string;
  icon: typeof Film;
  permission?: string;
  href: string;
  isExternal?: boolean;
};

const CONTENT_ITEMS: ContentLinkItem[] = [
  {
    id: 'tmdb',
    titleKey: 'settingsMenu.tmdb.title',
    descriptionKey: 'settingsMenu.tmdb.description',
    icon: Film,
    permission: 'settings.indexers',
    href: `${CONTENT_BASE}?sub=tmdb`,
  },
  {
    id: 'indexers',
    titleKey: 'settingsMenu.indexersConfigured.title',
    descriptionKey: 'settingsMenu.indexersConfigured.description',
    icon: Search,
    permission: 'settings.indexers',
    href: '/settings/indexers',
  },
  {
    id: 'sync-categories',
    titleKey: 'settingsMenu.syncCategories.title',
    descriptionKey: 'settingsMenu.syncCategories.description',
    icon: Layers,
    permission: 'settings.indexers',
    href: '/settings/sync',
  },
  {
    id: 'sync',
    titleKey: 'settingsMenu.sync.title',
    descriptionKey: 'settingsMenu.sync.description',
    icon: RefreshCw,
    permission: 'settings.sync',
    href: `${CONTENT_BASE}?sub=sync`,
  },
];

function getContentSubFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const sub = params.get('sub');
  return sub === 'tmdb' || sub === 'sync' ? sub : null;
}

export default function ContentSubMenuPanel() {
  const { t } = useI18n();
  const [sub, setSub] = useState<string | null>(getContentSubFromUrl);

  useEffect(() => {
    setSub(getContentSubFromUrl());
  }, []);

  useEffect(() => {
    const update = () => setSub(getContentSubFromUrl());
    window.addEventListener('popstate', update);
    document.addEventListener('astro:page-load', update);
    return () => {
      window.removeEventListener('popstate', update);
      document.removeEventListener('astro:page-load', update);
    };
  }, []);

  const visible = CONTENT_ITEMS.filter(
    (item) => !item.permission || canAccess(item.permission as any)
  );

  if (sub === 'tmdb') {
    const item = CONTENT_ITEMS.find((i) => i.id === 'tmdb')!;
    return (
      <SettingsSubPageFrame backHref={CONTENT_BASE} icon={item.icon} title={t(item.titleKey)} description={t(item.descriptionKey)}>
        <TmdbConfig embedded />
      </SettingsSubPageFrame>
    );
  }

  if (sub === 'sync') {
    const item = CONTENT_ITEMS.find((i) => i.id === 'sync')!;
    return (
      <SettingsSubPageFrame backHref={CONTENT_BASE} icon={item.icon} title={t(item.titleKey)} description={t(item.descriptionKey)}>
        <TorrentSyncManager />
      </SettingsSubPageFrame>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-5 ds-card-animate-stagger" role="list">
      {visible.map((item) => (
        <SettingsNavCard
          key={item.id}
          href={item.href}
          icon={item.icon}
          title={t(item.titleKey)}
          description={t(item.descriptionKey)}
          isExternal={item.isExternal}
        />
      ))}
    </div>
  );
}
