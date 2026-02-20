import {
  Monitor,
  Palette,
  LayoutGrid,
  Globe,
  UserCircle,
  Play,
  Library,
  Wrench,
  LayoutDashboard,
} from 'lucide-preact';
import { useI18n } from '../../lib/i18n/useI18n';
import { useMemo, useState, useEffect } from 'preact/hooks';
import { canAccess } from '../../lib/permissions';

type NavItem = {
  id: string;
  labelKey: string;
  href: string;
  icon: typeof Monitor;
  /** Permission requise (une seule) pour afficher l'entrée */
  permission?: string;
  /** OU: visible si l'utilisateur a au moins une de ces permissions */
  permissions?: string[];
  /** Si défini, actif quand pathname commence par ce préfixe (ex. /settings/server) */
  pathPrefix?: string;
  /** Si défini, actif quand pathname === /settings et search inclut ce paramètre (ex. category=maintenance) */
  categoryParam?: string;
};

const NAV_ITEMS: NavItem[] = [
  {
    id: 'overview',
    labelKey: 'settingsMenu.overview',
    href: '/settings',
    icon: LayoutDashboard,
  },
  {
    id: 'system',
    labelKey: 'settingsMenu.category.system',
    href: '/settings/server',
    icon: Monitor,
    permission: 'settings.server',
    pathPrefix: '/settings/server',
  },
  {
    id: 'maintenance',
    labelKey: 'settingsMenu.category.maintenance',
    href: '/settings?category=maintenance',
    icon: Wrench,
    permission: 'settings.server',
    categoryParam: 'maintenance',
  },
  {
    id: 'interface',
    labelKey: 'settingsMenu.category.interface',
    href: '/settings/ui-preferences',
    icon: Palette,
    permission: 'settings.ui_preferences',
    pathPrefix: '/settings/ui-preferences',
  },
  {
    id: 'playback',
    labelKey: 'settingsMenu.category.playback',
    href: '/settings?category=playback',
    icon: Play,
    permission: 'settings.ui_preferences',
    categoryParam: 'playback',
  },
  {
    id: 'content',
    labelKey: 'settingsMenu.category.content',
    href: '/settings?category=content',
    icon: LayoutGrid,
    permissions: ['settings.indexers', 'settings.sync', 'settings.server'],
    categoryParam: 'content',
  },
  {
    id: 'library',
    labelKey: 'settingsMenu.category.library',
    href: '/settings?category=library',
    icon: Library,
    permissions: ['settings.server', 'settings.friends'],
    categoryParam: 'library',
  },
  {
    id: 'discovery',
    labelKey: 'settingsMenu.category.discovery',
    href: '/settings?category=discovery',
    icon: Globe,
    permission: 'settings.server',
    categoryParam: 'discovery',
  },
  {
    id: 'account',
    labelKey: 'settingsMenu.category.account',
    href: '/settings/account',
    icon: UserCircle,
    permission: 'settings.account',
    pathPrefix: '/settings/account',
  },
];

function isItemVisible(item: NavItem): boolean {
  if (item.permission) return canAccess(item.permission as any);
  if (item.permissions?.length) return item.permissions.some((p) => canAccess(p as any));
  return true;
}

function isItemActive(item: NavItem, pathname: string, search: string): boolean {
  if (item.id === 'overview') {
    return pathname === '/settings' && !new URLSearchParams(search).get('category');
  }
  if (item.pathPrefix && pathname.startsWith(item.pathPrefix)) {
    if (item.pathPrefix === '/settings/server') return pathname === '/settings/server' || pathname.startsWith('/settings/server/');
    if (item.pathPrefix === '/settings/ui-preferences') return pathname === '/settings/ui-preferences' || pathname.startsWith('/settings/ui-preferences/');
    if (item.pathPrefix === '/settings/account') return pathname.startsWith('/settings/account');
    return true;
  }
  if (item.categoryParam) {
    return pathname === '/settings' && new URLSearchParams(search).get('category') === item.categoryParam;
  }
  return false;
}

export default function SettingsSidebar() {
  const { t } = useI18n();
  const [pathname, setPathname] = useState(typeof window !== 'undefined' ? window.location.pathname : '/settings');
  const [search, setSearch] = useState(typeof window !== 'undefined' ? window.location.search : '');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const update = () => {
      setPathname(window.location.pathname);
      setSearch(window.location.search);
    };
    update();
    window.addEventListener('popstate', update);
    document.addEventListener('astro:page-load', update);
    return () => {
      window.removeEventListener('popstate', update);
      document.removeEventListener('astro:page-load', update);
    };
  }, []);

  useEffect(() => {
    const openDrawer = () => setSidebarOpen(true);
    document.addEventListener('open-settings-drawer', openDrawer);
    return () => document.removeEventListener('open-settings-drawer', openDrawer);
  }, []);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Liste stable au premier rendu (SSR + hydratation) pour éviter le mismatch, puis filtrée par permissions après montage
  const visibleItems = useMemo(
    () => (mounted ? NAV_ITEMS.filter(isItemVisible) : NAV_ITEMS),
    [mounted]
  );

  return (
    <>
      {/* Overlay mobile */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 z-[25] bg-[var(--ds-surface-overlay)]"
          aria-hidden
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <nav
        className={`
          settings-sidebar flex-shrink-0 w-[min(18rem,85vw)] sm:w-72 lg:w-72 xl:w-80 border-b lg:border-b-0 lg:border-r border-[var(--ds-border)] bg-[var(--ds-surface-elevated)]
          fixed left-0 z-[30] top-[calc(3.75rem+var(--safe-area-inset-top,0px))] bottom-0
          lg:static lg:top-auto lg:bottom-auto lg:h-full
          transform transition-transform duration-200 ease-out
          pt-4 lg:pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]
          overflow-hidden flex flex-col
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
        aria-label={t('settingsMenu.title')}
        data-tv-settings-nav
      >
        <div className="px-3 sm:px-4 pt-2 pb-2 min-w-0 flex-shrink-0">
          <h2 className="ds-title-page truncate text-base sm:text-lg">
            {t('settingsMenu.title')}
          </h2>
          <p className="ds-text-secondary text-xs mt-1 hidden lg:block">
            {t('settingsMenu.subtitle')}
          </p>
        </div>
        <ul className="py-2 px-2 space-y-0.5 sm:space-y-1 scrollbar-hide overflow-y-auto overflow-x-hidden flex-1 min-h-0" role="list">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const isActive = isItemActive(item, pathname, search);
            return (
              <li key={item.id}>
                <a
                  href={item.href}
                  data-astro-prefetch
                  data-settings-category
                  data-focusable
                  onClick={() => setSidebarOpen(false)}
                  className={`
                    settings-nav-item w-full flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl text-left transition-all duration-200
                    focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)] focus:ring-offset-2 focus:ring-offset-[var(--ds-surface-elevated)]
                    min-h-[44px] sm:min-h-[48px] tv:min-h-[56px] min-w-0 touch-manipulation
                    ${isActive
                      ? 'bg-[var(--ds-accent-violet)] text-[var(--ds-text-on-accent)]'
                      : 'text-[var(--ds-text-secondary)] hover:bg-white/10 hover:text-[var(--ds-text-primary)]'
                    }
                  `}
                  tabIndex={0}
                  aria-current={isActive ? 'page' : undefined}
                  aria-label={t(item.labelKey)}
                >
                  <Icon
                    className={`w-5 h-5 sm:w-6 sm:h-6 tv:w-7 tv:h-7 flex-shrink-0 ${isActive ? 'opacity-100' : 'opacity-80'}`}
                    aria-hidden
                  />
                  <span className="font-semibold truncate min-w-0 text-sm sm:text-base">{t(item.labelKey)}</span>
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
