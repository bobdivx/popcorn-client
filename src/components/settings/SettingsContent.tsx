import {
  Monitor,
  Palette,
  LayoutGrid,
  Globe,
  UserCircle,
  Play,
  Library,
  Wrench,
} from 'lucide-preact';
import SettingsOverview from './SettingsOverview';
import { useI18n } from '../../lib/i18n/useI18n';
import { useState, useMemo, useEffect } from 'preact/hooks';
import type { ComponentType } from 'preact';
import { canAccess } from '../../lib/permissions';
import PermissionGuard from '../ui/PermissionGuard';
import DsPageHeader from '../ui/DsPageHeader';

type CategoryId = 'system' | 'interface' | 'content' | 'library' | 'discovery' | 'account' | 'playback' | 'maintenance';

type SettingsRoute =
  | { type: 'overview' }
  | { type: 'category'; id: CategoryId }
  | { type: 'page'; page: 'server' | 'account' };

function getRouteFromUrl(): SettingsRoute {
  if (typeof window === 'undefined') return { type: 'overview' };
  const pathname = window.location.pathname;
  const params = new URLSearchParams(window.location.search);
  const category = params.get('category');
  if (pathname === '/settings') {
    if (category && VALID_CATEGORIES.includes(category as CategoryId)) return { type: 'category', id: category as CategoryId };
    return { type: 'overview' };
  }
  if (pathname === '/settings/server') return { type: 'page', page: 'server' };
  if (pathname.startsWith('/settings/account')) return { type: 'page', page: 'account' };
  if (pathname === '/settings/ui-preferences') return { type: 'category', id: 'interface' };
  return { type: 'overview' };
}

/** Charge un panneau à la demande pour alléger le premier chargement. */
const CATEGORY_LOADERS: Record<CategoryId, () => Promise<{ default: ComponentType<any> }>> = {
  system: () => import('./SystemSubMenuPanel'),
  maintenance: () => import('./MaintenanceSubMenuPanel'),
  interface: () => import('./InterfaceSubMenuPanel'),
  playback: () => import('./PlaybackSettingsPanel'),
  content: () => import('./ContentSubMenuPanel'),
  library: () => import('./LibrarySubMenuPanel'),
  discovery: () => import('./DiscoverySubMenuPanel'),
  account: () => import('./AccountSubMenuPanel'),
};

const CATEGORY_LABELS: Record<CategoryId, string> = {
  system: 'settingsMenu.category.system',
  maintenance: 'settingsMenu.category.maintenance',
  interface: 'settingsMenu.category.interface',
  playback: 'settingsMenu.category.playback',
  content: 'settingsMenu.category.content',
  library: 'settingsMenu.category.library',
  discovery: 'settingsMenu.category.discovery',
  account: 'settingsMenu.category.account',
};

const VALID_CATEGORIES: CategoryId[] = ['system', 'interface', 'content', 'library', 'discovery', 'account', 'playback', 'maintenance'];

const CATEGORY_PERMISSIONS: Record<CategoryId, string | string[] | undefined> = {
  system: 'settings.server',
  maintenance: 'settings.server',
  interface: 'settings.ui_preferences',
  playback: 'settings.ui_preferences',
  content: ['settings.indexers', 'settings.sync', 'settings.server'],
  library: ['settings.server', 'settings.friends'],
  discovery: 'settings.server',
  account: 'settings.account',
};

function canSeeCategory(cat: CategoryId): boolean {
  const p = CATEGORY_PERMISSIONS[cat];
  if (!p) return true;
  if (typeof p === 'string') return canAccess(p as any);
  return p.some((perm) => canAccess(perm as any));
}

export default function SettingsContent() {
  const { t } = useI18n();
  const [route, setRoute] = useState<SettingsRoute>(getRouteFromUrl);

  useEffect(() => {
    const sync = () => setRoute(getRouteFromUrl());
    window.addEventListener('popstate', sync);
    document.addEventListener('astro:page-load', sync);
    return () => {
      window.removeEventListener('popstate', sync);
      document.removeEventListener('astro:page-load', sync);
    };
  }, []);

  // Précharger les chunks des panneaux en arrière-plan pour que la navigation soit instantanée (sans spinner)
  useEffect(() => {
    import('./ServerSettings');
    import('./AccountSettings');
    import('./TwoFactorSettings');
    import('./QuickConnectAuthorize');
    import('./LocalUsersLink');
    VALID_CATEGORIES.forEach((id) => CATEGORY_LOADERS[id]?.());
  }, []);

  if (route.type === 'overview') {
    return <SettingsOverview />;
  }

  if (route.type === 'page') {
    return (
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-y-auto overflow-x-hidden">
        <div className="ds-container max-w-5xl py-4 sm:py-6 px-3 sm:px-6">
          {route.page === 'server' && <LazyPageServer />}
          {route.page === 'account' && <LazyPageAccount />}
        </div>
      </div>
    );
  }

  const visibleCategory = route.type === 'category' && canSeeCategory(route.id) ? route.id : null;
  if (!visibleCategory) return <SettingsOverview />;

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-y-auto overflow-x-hidden">
      <div className="ds-container max-w-5xl py-4 sm:py-6 px-3 sm:px-6">
        <p className="ds-text-tertiary text-xs font-medium uppercase tracking-wider mb-1">
          {t('settingsMenu.title')}
        </p>
        <h1 className="ds-title-page truncate mb-4 sm:mb-6">{t(CATEGORY_LABELS[visibleCategory])}</h1>
        <LazyCategoryPanel category={visibleCategory} />
      </div>
    </div>
  );
}

function LazyPageServer() {
  const [ServerSettings, setServerSettings] = useState<ComponentType<any> | null>(null);
  useEffect(() => {
    import('./ServerSettings').then((m) => setServerSettings(() => m.default));
  }, []);
  if (!ServerSettings) return <SettingsRouteSkeleton />;
  return (
    <PermissionGuard permission="settings.server">
      <DsPageHeader titleKey="settingsPages.server.title" subtitleKey="settingsPages.server.subtitle" />
      <div className="space-y-6 sm:space-y-8">
        <ServerSettings />
      </div>
    </PermissionGuard>
  );
}

function LazyPageAccount() {
  const [Compos, setCompos] = useState<{
    AccountSettings: ComponentType<any>;
    TwoFactorSettings: ComponentType<any>;
    QuickConnectAuthorize: ComponentType<any>;
    LocalUsersLink: ComponentType<any>;
  } | null>(null);
  useEffect(() => {
    Promise.all([
      import('./AccountSettings'),
      import('./TwoFactorSettings'),
      import('./QuickConnectAuthorize'),
      import('./LocalUsersLink'),
    ]).then(([a, b, c, d]) =>
      setCompos({
        AccountSettings: a.default,
        TwoFactorSettings: b.default,
        QuickConnectAuthorize: c.default,
        LocalUsersLink: d.default,
      })
    );
  }, []);
  if (!Compos) return <SettingsRouteSkeleton />;
  return (
    <PermissionGuard permission="settings.account">
      <DsPageHeader titleKey="settingsPages.account.title" subtitleKey="settingsPages.account.subtitle" />
      <div className="space-y-6 sm:space-y-8">
        <Compos.AccountSettings />
        <Compos.TwoFactorSettings />
        <Compos.QuickConnectAuthorize />
        <Compos.LocalUsersLink />
      </div>
    </PermissionGuard>
  );
}

function SettingsRouteSkeleton() {
  return (
    <div className="flex items-center justify-center min-h-[120px]" aria-busy="true">
      <span className="loading loading-spinner loading-md text-[var(--ds-accent-violet)]" />
    </div>
  );
}

function LazyCategoryPanel({ category }: { category: CategoryId }) {
  const [Component, setComponent] = useState<ComponentType<any> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setComponent(null);
    const loader = CATEGORY_LOADERS[category];
    if (!loader) return;
    loader().then((m) => {
      if (!cancelled) setComponent(() => m.default);
    });
    return () => { cancelled = true; };
  }, [category]);

  if (!Component) {
    return (
      <div className="flex items-center justify-center min-h-[120px]" aria-busy="true">
        <span className="loading loading-spinner loading-md text-[var(--ds-accent-violet)]" />
      </div>
    );
  }
  return <Component />;
}
