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
  Upload,
  Download,
} from 'lucide-preact';
import { useI18n } from '../../lib/i18n/useI18n';
import { useMemo, useState, useEffect } from 'preact/hooks';
import { canAccess } from '../../lib/permissions';

type NavItem = {
  id: string;
  labelKey: string;
  href: string;
  icon: typeof Monitor;
  permission?: string;
  permissions?: string[];
  pathPrefix?: string;
};

const NAV_ITEMS: NavItem[] = [
  {
    id: 'overview',
    labelKey: 'settingsMenu.overview',
    href: '/settings/',
    icon: LayoutDashboard,
  },
  {
    id: 'system',
    labelKey: 'settingsMenu.category.system',
    href: '/settings/server/',
    icon: Monitor,
    permission: 'settings.server',
    pathPrefix: '/settings/server',
  },
  {
    id: 'uploads',
    labelKey: 'settingsPages.uploads.title',
    href: '/settings/uploads/',
    icon: Upload,
    permission: 'settings.indexers',
    pathPrefix: '/settings/uploads',
  },
  {
    id: 'maintenance',
    labelKey: 'settingsMenu.category.maintenance',
    href: '/settings/maintenance/',
    icon: Wrench,
    permission: 'settings.server',
    pathPrefix: '/settings/maintenance',
  },
  {
    id: 'interface',
    labelKey: 'settingsMenu.category.interface',
    href: '/settings/ui-preferences/',
    icon: Palette,
    permission: 'settings.ui_preferences',
    pathPrefix: '/settings/ui-preferences',
  },
  {
    id: 'playback',
    labelKey: 'settingsMenu.category.playback',
    href: '/settings/playback/',
    icon: Play,
    permission: 'settings.ui_preferences',
    pathPrefix: '/settings/playback',
  },
  {
    id: 'content',
    labelKey: 'settingsMenu.category.content',
    href: '/settings/content/',
    icon: LayoutGrid,
    permissions: ['settings.indexers', 'settings.sync', 'settings.server'],
    pathPrefix: '/settings/content',
  },
  {
    id: 'downloads',
    labelKey: 'settingsMenu.category.downloads',
    href: '/settings/downloads/',
    icon: Download,
    permission: 'settings.server',
    pathPrefix: '/settings/downloads',
  },
  {
    id: 'library',
    labelKey: 'settingsMenu.category.library',
    href: '/settings/library/',
    icon: Library,
    permissions: ['settings.server', 'settings.friends'],
    pathPrefix: '/settings/library',
  },
  {
    id: 'discovery',
    labelKey: 'settingsMenu.category.discovery',
    href: '/settings/discovery/',
    icon: Globe,
    permission: 'settings.server',
    pathPrefix: '/settings/discovery',
  },
  {
    id: 'account',
    labelKey: 'settingsMenu.category.account',
    href: '/settings/account/',
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
  const path = pathname.replace(/\/$/, '') || '/';
  if (item.id === 'overview') {
    return path === '/settings' && !new URLSearchParams(search).get('category');
  }
  if (item.pathPrefix && path.startsWith(item.pathPrefix)) {
    if (item.pathPrefix === '/settings/server') return path === '/settings/server' || path.startsWith('/settings/server/');
    if (item.pathPrefix === '/settings/uploads') return path === '/settings/uploads' || path.startsWith('/settings/uploads/');
    if (item.pathPrefix === '/settings/ui-preferences') return path === '/settings/ui-preferences' || path.startsWith('/settings/ui-preferences/');
    if (item.pathPrefix === '/settings/account') return path.startsWith('/settings/account');
    return path === item.pathPrefix || path.startsWith(item.pathPrefix + '/');
  }
  return false;
}

const SIDEBAR_CSS = `
  .sn-sidebar {
    background: linear-gradient(180deg, #0e0815 0%, #0a0812 100%);
    border-right: 1px solid rgba(255,255,255,0.05);
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .sn-sidebar::before {
    content: '';
    position: absolute;
    top: -80px; left: -80px;
    width: 320px; height: 320px;
    background: radial-gradient(circle, rgba(124,58,237,0.14) 0%, transparent 70%);
    pointer-events: none;
    z-index: 0;
  }
  .sn-sidebar::after {
    content: '';
    position: absolute;
    bottom: -60px; right: -60px;
    width: 220px; height: 220px;
    background: radial-gradient(circle, rgba(139,92,246,0.08) 0%, transparent 70%);
    pointer-events: none;
    z-index: 0;
  }

  /* Logo */
  .sn-logo {
    display: flex; align-items: center; gap: 10px;
    padding: 18px 14px 14px;
    border-bottom: 1px solid rgba(255,255,255,0.05);
    margin-bottom: 6px;
    position: relative; z-index: 1;
    flex-shrink: 0;
  }
  .sn-logo-icon {
    width: 36px; height: 36px; border-radius: 10px;
    background: rgba(124,58,237,0.15);
    border: 1px solid rgba(124,58,237,0.3);
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .sn-logo-title { color: #fff; font-weight: 700; font-size: 14px; line-height: 1.2; }
  .sn-logo-sub { color: rgba(167,139,250,0.65); font-size: 11px; margin-top: 2px; }

  /* Liste */
  .sn-list {
    flex: 1;
    overflow-y: auto;
    padding: 4px 8px 16px;
    position: relative; z-index: 1;
    min-height: 0;
    scrollbar-width: none;
  }
  .sn-list::-webkit-scrollbar { display: none; }

  /* Item */
  .sn-item {
    display: flex; align-items: center; gap: 10px;
    padding: 9px 10px; border-radius: 10px;
    margin-bottom: 2px;
    transition: background 0.18s ease, border-color 0.18s ease;
    border: 1px solid transparent;
    cursor: pointer;
    text-decoration: none;
    min-height: 44px;
    width: 100%;
    outline: none;
    -webkit-tap-highlight-color: transparent;
  }
  .sn-item:hover:not(.sn-item--active) {
    background: rgba(255,255,255,0.04);
    border-color: rgba(255,255,255,0.06);
  }
  .sn-item--active {
    background: rgba(124,58,237,0.12);
    border-color: rgba(124,58,237,0.25);
  }
  .sn-item:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px rgba(124,58,237,0.55), inset 0 0 0 1px rgba(124,58,237,0.3);
  }

  /* Icône */
  .sn-icon {
    width: 32px; height: 32px; border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
    transition: background 0.18s ease, color 0.18s ease;
  }
  .sn-icon--active {
    background: rgba(124,58,237,0.22);
    color: #a78bfa;
  }
  .sn-icon--inactive {
    background: rgba(255,255,255,0.05);
    color: rgba(255,255,255,0.4);
  }
  .sn-item:hover .sn-icon--inactive {
    background: rgba(255,255,255,0.09);
    color: rgba(255,255,255,0.7);
  }

  /* Label */
  .sn-label {
    flex: 1;
    font-size: 13px; font-weight: 500;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    min-width: 0;
    transition: color 0.18s ease;
  }
  .sn-label--active { color: rgba(255,255,255,0.92); }
  .sn-label--inactive { color: rgba(255,255,255,0.48); }
  .sn-item:hover .sn-label--inactive { color: rgba(255,255,255,0.75); }

  /* Point animé (item actif) */
  .sn-dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: #a78bfa; flex-shrink: 0;
    animation: sn-pulse 2s ease-in-out infinite;
  }
  @keyframes sn-pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.4; transform: scale(0.6); }
  }

  /* Overlay mobile */
  .sn-overlay {
    position: fixed; inset: 0; z-index: 25;
    background: rgba(0,0,0,0.65);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    transition: opacity 0.2s ease;
  }

  /* TV & grande cible tactile */
  @media (hover: none) and (pointer: coarse) {
    .sn-item { min-height: 52px; padding: 10px 12px; }
    .sn-icon { width: 36px; height: 36px; }
    .sn-label { font-size: 14px; }
  }

  @media (prefers-reduced-motion: reduce) {
    .sn-dot { animation: none; opacity: 0.7; }
    .sn-item { transition: none; }
    .sn-icon { transition: none; }
    .sn-label { transition: none; }
  }

  /* ── Thème clair ── */
  [data-theme="light"] .sn-sidebar {
    background: linear-gradient(180deg, #f0eef8 0%, #ece9f5 100%);
    border-right-color: rgba(0,0,0,0.07);
  }
  [data-theme="light"] .sn-sidebar::before {
    background: radial-gradient(circle, rgba(124,58,237,0.08) 0%, transparent 70%);
  }
  [data-theme="light"] .sn-sidebar::after {
    background: radial-gradient(circle, rgba(139,92,246,0.05) 0%, transparent 70%);
  }
  [data-theme="light"] .sn-logo {
    border-bottom-color: rgba(0,0,0,0.06);
  }
  [data-theme="light"] .sn-logo-title { color: #0f0f11; }
  [data-theme="light"] .sn-logo-sub { color: rgba(109,40,217,0.65); }
  [data-theme="light"] .sn-item:hover:not(.sn-item--active) {
    background: rgba(0,0,0,0.04);
    border-color: rgba(0,0,0,0.07);
  }
  [data-theme="light"] .sn-icon--inactive {
    background: rgba(0,0,0,0.05);
    color: rgba(15,15,17,0.45);
  }
  [data-theme="light"] .sn-item:hover .sn-icon--inactive {
    background: rgba(109,40,217,0.1);
    color: rgba(109,40,217,0.75);
  }
  [data-theme="light"] .sn-label--active { color: rgba(15,15,17,0.92); }
  [data-theme="light"] .sn-label--inactive { color: rgba(15,15,17,0.48); }
  [data-theme="light"] .sn-item:hover .sn-label--inactive { color: rgba(15,15,17,0.75); }
  [data-theme="light"] .sn-overlay { background: rgba(0,0,0,0.45); }
`;

export default function SettingsSidebar() {
  const { t } = useI18n();
  // Important: use a static default for SSR + first client render
  // so that the initial markup matches and hydration can succeed.
  const [pathname, setPathname] = useState('/settings');
  const [search, setSearch] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const update = () => {
      if (typeof window === 'undefined') return;
      setPathname(window.location.pathname);
      setSearch(window.location.search);
    };
    update();
    if (typeof window === 'undefined') return;
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

  const visibleItems = useMemo(
    () => (mounted ? NAV_ITEMS.filter(isItemVisible) : NAV_ITEMS),
    [mounted]
  );

  return (
    <>
      <style>{SIDEBAR_CSS}</style>

      {/* Overlay mobile */}
      <div
        class="sn-overlay lg:hidden"
        aria-hidden
        style={{ opacity: sidebarOpen ? 1 : 0, pointerEvents: sidebarOpen ? 'auto' : 'none' }}
        onClick={() => setSidebarOpen(false)}
      />

      <nav
        class={`
          sn-sidebar flex-shrink-0
          w-[min(18rem,85vw)] sm:w-72 lg:w-72 xl:w-80
          fixed left-0 z-[30] bottom-0
          top-[calc(3.75rem+var(--safe-area-inset-top,0px))] sm:top-[calc(5rem+var(--safe-area-inset-top,0px))] md:top-[calc(5.5rem+var(--safe-area-inset-top,0px))] lg:top-auto lg:bottom-auto lg:h-full
          transform transition-transform duration-200 ease-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
        aria-label={t('settingsMenu.title')}
        data-tv-settings-nav
      >
        {/* Logo */}
        <div class="sn-logo">
          <div class="sn-logo-icon">
            <img
              src="/popcorn_logo.png"
              alt=""
              style="width:20px;height:20px;object-fit:contain;"
              loading="eager"
              aria-hidden
            />
          </div>
          <div>
            <div class="sn-logo-title">Popcornn</div>
            <div class="sn-logo-sub">{t('settingsMenu.title')}</div>
          </div>
        </div>

        {/* Navigation */}
        <ul class="sn-list" role="list">
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
                  class={`sn-item${isActive ? ' sn-item--active' : ''}`}
                  tabIndex={0}
                  aria-current={isActive ? 'page' : undefined}
                  aria-label={t(item.labelKey)}
                >
                  <div class={`sn-icon${isActive ? ' sn-icon--active' : ' sn-icon--inactive'}`}>
                    <Icon class="w-[18px] h-[18px]" strokeWidth={1.8} aria-hidden />
                  </div>
                  <span class={`sn-label${isActive ? ' sn-label--active' : ' sn-label--inactive'}`}>
                    {t(item.labelKey)}
                  </span>
                  {isActive && <div class="sn-dot" aria-hidden />}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
