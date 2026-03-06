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
import { LogOut } from 'lucide-preact';
import { serverApi } from '../../lib/client/server-api';
import { redirectTo } from '../../lib/utils/navigation.js';

type CategoryId = 'system' | 'interface' | 'content' | 'downloads' | 'library' | 'discovery' | 'account' | 'playback' | 'maintenance';

type SettingsRoute =
  | { type: 'overview' }
  | { type: 'category'; id: CategoryId }
  | { type: 'page'; page: 'server' | 'account' | 'ratio' };

function getRouteFromUrl(): SettingsRoute {
  if (typeof window === 'undefined') return { type: 'overview' };
  // Normaliser le pathname (sans barre finale) pour éviter les échecs en prod avec /settings/ ou /settings/server/
  const pathname = window.location.pathname.replace(/\/$/, '') || '/';
  const params = new URLSearchParams(window.location.search);
  const categoryFromQuery = params.get('category');

  // Pages dédiées (format /settings/segment/)
  if (pathname === '/settings/server') return { type: 'page', page: 'server' };
  if (pathname.startsWith('/settings/ratio')) return { type: 'page', page: 'ratio' };
  if (pathname.startsWith('/settings/account')) return { type: 'page', page: 'account' };
  if (pathname === '/settings/ui-preferences') return { type: 'category', id: 'interface' };

  // Catégories en path (format /settings/maintenance/, /settings/playback/, etc.)
  if (pathname.startsWith('/settings/')) {
    const segment = pathname.slice('/settings/'.length).split('/')[0];
    if (segment && VALID_CATEGORIES.includes(segment as CategoryId)) return { type: 'category', id: segment as CategoryId };
  }

  // Vue d’ensemble : /settings uniquement (sans segment, avec ou sans ?category= en fallback)
  if (pathname === '/settings') {
    if (categoryFromQuery && VALID_CATEGORIES.includes(categoryFromQuery as CategoryId)) return { type: 'category', id: categoryFromQuery as CategoryId };
    return { type: 'overview' };
  }

  return { type: 'overview' };
}

/** Charge un panneau à la demande pour alléger le premier chargement. */
const CATEGORY_LOADERS: Record<CategoryId, () => Promise<{ default: ComponentType<any> }>> = {
  system: () => import('./SystemSubMenuPanel'),
  maintenance: () => import('./MaintenanceSubMenuPanel'),
  interface: () => import('./InterfaceSubMenuPanel'),
  playback: () => import('./PlaybackSettingsPanel'),
  content: () => import('./ContentSubMenuPanel'),
  downloads: () => import('./DownloadsSubMenuPanel'),
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
  downloads: 'settingsMenu.category.downloads',
  library: 'settingsMenu.category.library',
  discovery: 'settingsMenu.category.discovery',
  account: 'settingsMenu.category.account',
};

const VALID_CATEGORIES: CategoryId[] = ['system', 'interface', 'content', 'downloads', 'library', 'discovery', 'account', 'playback', 'maintenance'];

const CATEGORY_PERMISSIONS: Record<CategoryId, string | string[] | undefined> = {
  system: 'settings.server',
  maintenance: 'settings.server',
  interface: 'settings.ui_preferences',
  playback: 'settings.ui_preferences',
  content: ['settings.indexers', 'settings.sync', 'settings.server'],
  downloads: 'settings.server',
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

  // Rediriger les anciennes URLs ?category=xxx vers /settings/xxx en conservant les autres paramètres (ex. sub=tmdb)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const pathname = window.location.pathname.replace(/\/$/, '') || '/';
    const params = new URLSearchParams(window.location.search);
    const categoryFromQuery = params.get('category');
    if (pathname === '/settings' && categoryFromQuery && VALID_CATEGORIES.includes(categoryFromQuery as CategoryId)) {
      params.delete('category');
      const search = params.toString();
      const newPath = search ? `/settings/${categoryFromQuery}?${search}` : `/settings/${categoryFromQuery}`;
      window.history.replaceState(window.history.state ?? {}, '', newPath);
      setRoute({ type: 'category', id: categoryFromQuery as CategoryId });
    }
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
          {route.page === 'ratio' && <LazyPageRatio />}
        </div>
      </div>
    );
  }

  const visibleCategory = route.type === 'category' && canSeeCategory(route.id) ? route.id : null;
  if (!visibleCategory) return <SettingsOverview />;

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-y-auto overflow-x-hidden">
      <div className="ds-container max-w-5xl py-4 sm:py-6 px-3 sm:px-6">
        <h1 className="ds-title-page truncate">{t(CATEGORY_LABELS[visibleCategory])}</h1>
        <p className="ds-text-secondary mb-4 sm:mb-6 text-sm sm:text-base">{t('settingsMenu.subtitle')}</p>
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
  const { t } = useI18n();
  const [AccountSubMenuPanel, setAccountSubMenuPanel] = useState<ComponentType<{ baseUrl?: string }> | null>(null);
  useEffect(() => {
    import('./AccountSubMenuPanel').then((m) => setAccountSubMenuPanel(() => m.default));
  }, []);
  const handleLogout = async () => {
    if (!confirm(t('account.logoutConfirm'))) return;
    try {
      await serverApi.logout();
    } catch (err) {
      console.error('Erreur lors de la déconnexion:', err);
    } finally {
      redirectTo('/login');
    }
  };
  if (!AccountSubMenuPanel) return <SettingsRouteSkeleton />;
  return (
    <PermissionGuard permission="settings.account">
      <div className="flex flex-col gap-4 sm:gap-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <DsPageHeader titleKey="settingsPages.account.title" subtitleKey="settingsPages.account.subtitle" />
          <button
            type="button"
            onClick={handleLogout}
            className="ds-btn-danger btn btn-sm gap-2 px-4 py-2.5 font-semibold text-white min-h-[var(--ds-touch-target-sm)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-red)] focus:ring-offset-2 focus:ring-offset-[var(--ds-surface-elevated)] flex-shrink-0"
            aria-label={t('account.logout')}
          >
            <LogOut className="w-4 h-4" aria-hidden />
            {t('account.logout')}
          </button>
        </div>
        <AccountSubMenuPanel baseUrl="/settings/account" />
      </div>
    </PermissionGuard>
  );
}

function LazyPageRatio() {
  const [RatioAdminPanel, setRatioAdminPanel] = useState<ComponentType<any> | null>(null);
  useEffect(() => {
    import('./RatioAdminPanel').then((m) => setRatioAdminPanel(() => m.default));
  }, []);
  if (!RatioAdminPanel) return <SettingsRouteSkeleton />;
  return <RatioAdminPanel />;
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
