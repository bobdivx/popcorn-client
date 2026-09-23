import SettingsOverview from './SettingsOverview';
import { useI18n } from '../../lib/i18n/useI18n';
import { useState, useEffect } from 'preact/hooks';
import type { ComponentType } from 'preact';
import { canAccess } from '../../lib/permissions';
import PermissionGuard from '../ui/PermissionGuard';
import DsPageHeader from '../ui/DsPageHeader';
import { HubSkeleton } from './hub/HubTile';

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

const PAGE_LOADERS = {
  server: () => import('./ServerSettings'),
  account: () => import('./AccountSubMenuPanel'),
  ratio: () => import('./RatioAdminPanel'),
} as const;

/** Cache module-level : navigation retour instantanée sans re-fetch du chunk. */
const panelCache = new Map<string, ComponentType<any>>();

function loadCached(
  key: string,
  loader: () => Promise<{ default: ComponentType<any> }>
): Promise<ComponentType<any>> {
  const hit = panelCache.get(key);
  if (hit) return Promise.resolve(hit);
  return loader().then((m) => {
    panelCache.set(key, m.default);
    return m.default;
  });
}

function idlePrefetch(fn: () => void) {
  if (typeof window === 'undefined') return;
  const ric = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
  if (ric) ric(fn, { timeout: 2500 });
  else setTimeout(fn, 400);
}

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

  // Précharger en idle uniquement les chunks utiles (pas tout le settings d’un coup)
  useEffect(() => {
    idlePrefetch(() => {
      if (route.type === 'overview') {
        void loadCached('cat:system', CATEGORY_LOADERS.system);
        void loadCached('page:server', PAGE_LOADERS.server);
        return;
      }
      if (route.type === 'category') {
        void loadCached(`cat:${route.id}`, CATEGORY_LOADERS[route.id]);
        return;
      }
      if (route.type === 'page') {
        void loadCached(`page:${route.page}`, PAGE_LOADERS[route.page]);
      }
    });
  }, [route]);

  if (route.type === 'overview') {
    return <SettingsOverview />;
  }

  if (route.type === 'page') {
    return (
      <div className="hub-page">
        {route.page === 'server' && <LazyPageServer />}
        {route.page === 'account' && <LazyPageAccount />}
        {route.page === 'ratio' && <LazyPageRatio />}
      </div>
    );
  }

  const visibleCategory = route.type === 'category' && canSeeCategory(route.id) ? route.id : null;
  if (!visibleCategory) return <SettingsOverview />;

  return (
    <div className="hub-page">
      <header className="hub-header">
        <h1 className="hub-title">{t(CATEGORY_LABELS[visibleCategory])}</h1>
        <p className="hub-subtitle">{t('settingsMenu.subtitle')}</p>
      </header>
      <LazyCategoryPanel category={visibleCategory} />
    </div>
  );
}

function LazyPageServer() {
  const [ServerSettings, setServerSettings] = useState<ComponentType<any> | null>(
    () => panelCache.get('page:server') ?? null
  );
  useEffect(() => {
    let cancelled = false;
    loadCached('page:server', PAGE_LOADERS.server).then((C) => {
      if (!cancelled) setServerSettings(() => C);
    });
    return () => { cancelled = true; };
  }, []);
  if (!ServerSettings) return <SettingsRouteSkeleton />;
  return (
    <PermissionGuard permission="settings.server">
      <DsPageHeader titleKey="settingsPages.server.title" subtitleKey="settingsPages.server.subtitle" />
      <div className="sc-stack">
        <ServerSettings />
      </div>
    </PermissionGuard>
  );
}

function LazyPageAccount() {
  const [AccountSubMenuPanel, setAccountSubMenuPanel] = useState<ComponentType<{ baseUrl?: string }> | null>(
    () => panelCache.get('page:account') ?? null
  );
  useEffect(() => {
    let cancelled = false;
    loadCached('page:account', PAGE_LOADERS.account).then((C) => {
      if (!cancelled) setAccountSubMenuPanel(() => C);
    });
    return () => { cancelled = true; };
  }, []);
  if (!AccountSubMenuPanel) return <SettingsRouteSkeleton />;
  return (
    <PermissionGuard permission="settings.account">
      <DsPageHeader titleKey="settingsPages.account.title" subtitleKey="settingsPages.account.subtitle" />
      <AccountSubMenuPanel baseUrl="/settings/account/" />
    </PermissionGuard>
  );
}

function LazyPageRatio() {
  const [RatioAdminPanel, setRatioAdminPanel] = useState<ComponentType<any> | null>(
    () => panelCache.get('page:ratio') ?? null
  );
  useEffect(() => {
    let cancelled = false;
    loadCached('page:ratio', PAGE_LOADERS.ratio).then((C) => {
      if (!cancelled) setRatioAdminPanel(() => C);
    });
    return () => { cancelled = true; };
  }, []);
  if (!RatioAdminPanel) return <SettingsRouteSkeleton />;
  return <RatioAdminPanel />;
}

function SettingsRouteSkeleton() {
  return <HubSkeleton count={6} />;
}

function LazyCategoryPanel({ category }: { category: CategoryId }) {
  const cacheKey = `cat:${category}`;
  const [Component, setComponent] = useState<ComponentType<any> | null>(
    () => panelCache.get(cacheKey) ?? null
  );

  useEffect(() => {
    let cancelled = false;
    if (!panelCache.has(cacheKey)) setComponent(null);
    const loader = CATEGORY_LOADERS[category];
    if (!loader) return;
    loadCached(cacheKey, loader).then((C) => {
      if (!cancelled) setComponent(() => C);
    });
    return () => { cancelled = true; };
  }, [category, cacheKey]);

  if (!Component) {
    return <SettingsRouteSkeleton />;
  }
  return <Component />;
}
