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
  | { type: 'page'; page: 'server' | 'account' | 'favorites' };

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
  if (pathname.startsWith('/settings/favorites')) return { type: 'page', page: 'favorites' };
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
  library: undefined, // visible à tous (chaque carte filtre sa propre permission : favoris, affichage biblio, etc.)
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
          {route.page === 'favorites' && <LazyPageFavorites />}
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

// Cache des pages settings déjà chargées pour éviter le scintillement à la navigation télécommande
const pageComponentCache: Record<string, ComponentType<any>> = {};

function LazyPageServer() {
  const [ServerSettings, setServerSettings] = useState<ComponentType<any> | null>(() => pageComponentCache['server'] ?? null);
  useEffect(() => {
    if (pageComponentCache['server']) {
      setServerSettings(() => pageComponentCache['server']);
      return;
    }
    import('./ServerSettings').then((m) => {
      pageComponentCache['server'] = m.default;
      setServerSettings(() => m.default);
    });
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

function LazyPageFavorites() {
  const [FavoritesSettings, setFavoritesSettings] = useState<ComponentType<any> | null>(() => pageComponentCache['favorites'] ?? null);
  useEffect(() => {
    if (pageComponentCache['favorites']) {
      setFavoritesSettings(() => pageComponentCache['favorites']);
      return;
    }
    import('./FavoritesSettings').then((m) => {
      pageComponentCache['favorites'] = m.default;
      setFavoritesSettings(() => m.default);
    });
  }, []);
  if (!FavoritesSettings) return <SettingsRouteSkeleton />;
  return (
    <>
      <DsPageHeader titleKey="settingsPages.favorites.title" subtitleKey="settingsPages.favorites.subtitle" />
      <div className="space-y-6 sm:space-y-8">
        <FavoritesSettings />
      </div>
    </>
  );
}

function LazyPageAccount() {
  const [AccountSubMenuPanel, setAccountSubMenuPanel] = useState<ComponentType<any> | null>(() => pageComponentCache['account'] ?? null);
  useEffect(() => {
    if (pageComponentCache['account']) {
      setAccountSubMenuPanel(() => pageComponentCache['account']);
      return;
    }
    import('./AccountSubMenuPanel').then((m) => {
      pageComponentCache['account'] = m.default;
      setAccountSubMenuPanel(() => m.default);
    });
  }, []);
  if (!AccountSubMenuPanel) return <SettingsRouteSkeleton />;
  return (
    <PermissionGuard permission="settings.account">
      <DsPageHeader titleKey="settingsPages.account.title" subtitleKey="settingsPages.account.subtitle" />
      <AccountSubMenuPanel />
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

// Cache des panneaux déjà chargés pour éviter le scintillement du spinner à chaque changement de focus (télécommande)
const categoryPanelCache: Record<CategoryId, ComponentType<any>> = {};

function LazyCategoryPanel({ category }: { category: CategoryId }) {
  const [Component, setComponent] = useState<ComponentType<any> | null>(() => categoryPanelCache[category] ?? null);

  useEffect(() => {
    const cached = categoryPanelCache[category];
    if (cached) {
      setComponent(() => cached);
      return;
    }
    let cancelled = false;
    const loader = CATEGORY_LOADERS[category];
    if (!loader) return;
    loader().then((m) => {
      if (!cancelled) {
        categoryPanelCache[category] = m.default;
        setComponent(() => m.default);
      }
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
