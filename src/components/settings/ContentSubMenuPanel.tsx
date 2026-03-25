import type { ComponentType } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { Film, Search, RefreshCw, Layers, Package } from 'lucide-preact';
import { useI18n } from '../../lib/i18n/useI18n';
import { canAccess } from '../../lib/permissions';
import TmdbConfig from './TmdbConfig';
import TorrentSyncManager from './TorrentSyncManager';
import { SettingsNavCard } from './SettingsNavCard';
import { SettingsSubPageFrame } from './SettingsSubPageFrame';

/** Chargement dynamique : évite ReferenceError / ordre d’init avec Vite HMR et gros graphe d’imports. */
function LazyContentBulkTorrentZipPanel() {
  const [Comp, setComp] = useState<ComponentType | null>(null);
  useEffect(() => {
    let cancelled = false;
    import('./ContentBulkTorrentZipPanel')
      .then((m) => {
        if (!cancelled) setComp(() => m.default);
      })
      .catch((e) => {
        console.error('[ContentSubMenuPanel] ContentBulkTorrentZipPanel:', e);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  if (!Comp) {
    return (
      <div className="flex items-center justify-center min-h-[120px]" aria-busy="true">
        <span className="loading loading-spinner loading-md text-[var(--ds-accent-violet)]" />
      </div>
    );
  }
  return <Comp />;
}

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
  {
    id: 'bulk-torrent-zip',
    titleKey: 'settingsMenu.bulkTorrentZipNav.title',
    descriptionKey: 'settingsMenu.bulkTorrentZipNav.description',
    icon: Package,
    permission: 'settings.indexers',
    href: `${CONTENT_BASE}?sub=bulk-torrent-zip`,
  },
];

const VALID_SUBS = ['tmdb', 'sync', 'bulk-torrent-zip'] as const;
type ContentSub = (typeof VALID_SUBS)[number];

function getContentSubFromUrl(): ContentSub | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const sub = params.get('sub');
  return (VALID_SUBS as readonly string[]).includes(sub || '') ? (sub as ContentSub) : null;
}

function isContentQuerySubNav(href: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const u = new URL(href, window.location.origin);
    const base = CONTENT_BASE.replace(/\/$/, '');
    const path = (u.pathname.replace(/\/$/, '') || '/').replace(/\/$/, '');
    const normalized = path || '/';
    return (normalized === base || normalized === `${base}/`) && u.searchParams.has('sub');
  } catch {
    return false;
  }
}

export default function ContentSubMenuPanel() {
  const { t } = useI18n();
  const [sub, setSub] = useState<ContentSub | null>(getContentSubFromUrl);

  useEffect(() => {
    setSub(getContentSubFromUrl());
  }, []);

  useEffect(() => {
    const update = () => setSub(getContentSubFromUrl());
    window.addEventListener('popstate', update);
    document.addEventListener('astro:page-load', update);
    document.addEventListener('astro:after-swap', update);
    return () => {
      window.removeEventListener('popstate', update);
      document.removeEventListener('astro:page-load', update);
      document.removeEventListener('astro:after-swap', update);
    };
  }, []);

  const visible = CONTENT_ITEMS.filter(
    (item) => !item.permission || canAccess(item.permission as any)
  );

  const goBackToContentGrid = () => {
    window.history.pushState(window.history.state ?? {}, '', CONTENT_BASE);
    setSub(null);
  };

  if (sub === 'tmdb') {
    const item = CONTENT_ITEMS.find((i) => i.id === 'tmdb')!;
    return (
      <SettingsSubPageFrame backOnClick={goBackToContentGrid} icon={item.icon} title={t(item.titleKey)} description={t(item.descriptionKey)}>
        <TmdbConfig embedded />
      </SettingsSubPageFrame>
    );
  }

  if (sub === 'sync') {
    const item = CONTENT_ITEMS.find((i) => i.id === 'sync')!;
    return (
      <SettingsSubPageFrame backOnClick={goBackToContentGrid} icon={item.icon} title={t(item.titleKey)} description={t(item.descriptionKey)}>
        <TorrentSyncManager />
      </SettingsSubPageFrame>
    );
  }

  if (sub === 'bulk-torrent-zip') {
    const item = CONTENT_ITEMS.find((i) => i.id === 'bulk-torrent-zip')!;
    return (
      <SettingsSubPageFrame backOnClick={goBackToContentGrid} icon={item.icon} title={t(item.titleKey)} description={t(item.descriptionKey)}>
        <LazyContentBulkTorrentZipPanel />
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
          onLinkClick={
            isContentQuerySubNav(item.href)
              ? (e) => {
                  e.preventDefault();
                  const u = new URL(item.href, window.location.origin);
                  const next = `${u.pathname}${u.search}`;
                  window.history.pushState(window.history.state ?? {}, '', next);
                  setSub(getContentSubFromUrl());
                }
              : undefined
          }
        />
      ))}
    </div>
  );
}
