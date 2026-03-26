import { useEffect, useState, useRef } from 'preact/hooks';
import type { ComponentType } from 'preact';
import { Download, Search as SearchIcon, Settings as SettingsIcon, Menu, X, Globe, Home, Film, Tv2, ListPlus } from 'lucide-preact';
import { serverApi } from '../../lib/client/server-api';
import { getLocalProfile, onProfileChanged } from '../../lib/client/profile';
import Avatar from '../ui/Avatar';
import BackendStatusBadge from './BackendStatusBadge';
import { DsProgressRing } from '../ui/design-system';
import { isTVPlatform } from '../../lib/utils/device-detection';
import { calculateSyncProgress } from '../../lib/utils/sync-progress';
import {
  getSyncStatusStore,
  subscribeSyncStatusStore,
  startSyncStatusPolling,
} from '../../lib/sync-status-store';
import { useI18n } from '../../lib/i18n/useI18n';
import { LANGUAGE_NAMES, type SupportedLanguage } from '../../lib/i18n';
import { isDemoMode, setDemoMode } from '../../lib/backend-config';
import { TokenManager } from '../../lib/client/storage';
import { loadSubscription } from '../../lib/subscription-store';

type NavTab = { label: string; href: string; match?: 'exact' | 'prefix'; icon?: ComponentType<{ className?: string }> };

export default function Navbar() {
  const { t, language, setLanguage, availableLanguages } = useI18n();
  const [isScrolled, setIsScrolled] = useState(false);
  const [currentPath, setCurrentPath] = useState('');
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(() => getLocalProfile());
  const isTV = isTVPlatform();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [useHamburger, setUseHamburger] = useState(false);
  const [guestMenuOpen, setGuestMenuOpen] = useState(false);
  const [guestUseHamburger, setGuestUseHamburger] = useState(false);
  const guestMenuRef = useRef<HTMLDivElement>(null);
  const [clock, setClock] = useState(() => {
    try {
      return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date());
    } catch {
      const d = new Date();
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
  });
  const [storeState, setStoreState] = useState(() => getSyncStatusStore());
  const previousStatsRef = useRef<Record<string, number>>({});
  const [demoMode, setDemoModeNav] = useState(false);

  useEffect(() => {
    const status = storeState.status;
    if (!status) return;
    if (status.sync_in_progress && Object.keys(previousStatsRef.current).length === 0) {
      previousStatsRef.current = status.stats || {};
    }
    if (!status.sync_in_progress && Object.keys(previousStatsRef.current).length > 0) {
      previousStatsRef.current = {};
    }
  }, [storeState.status?.sync_in_progress]);

  const syncProgress = (() => {
    const status = storeState.status;
    if (!status) return { inProgress: false, progress: 0 };
    const inProgress = status.sync_in_progress === true;
    const progress = calculateSyncProgress(
      { sync_in_progress: inProgress, stats: status.stats, progress: status.progress },
      previousStatsRef.current
    );
    return { inProgress, progress };
  })();
  useEffect(() => {
    setDemoModeNav(isDemoMode());
  }, []);

  // Écrans étroits : menu hamburger pour les invités (langue, Connexion, S'inscrire)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const update = () => setGuestUseHamburger(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // Fermer le menu invité au clic à l'extérieur
  useEffect(() => {
    if (!guestMenuOpen) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (guestMenuRef.current?.contains(target)) return;
      const btn = document.querySelector('[data-guest-menu-toggle]');
      if (btn?.contains(target)) return;
      setGuestMenuOpen(false);
    };
    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [guestMenuOpen]);

  useEffect(() => {
    const updatePath = () => setCurrentPath(window.location.pathname + window.location.search);
    updatePath();

    const handleScroll = () => setIsScrolled(window.scrollY > 10);

    // passive: true améliore la fluidité du scroll (ne bloque pas le main thread)
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('popstate', updatePath);

    loadUser();

    const handleAuthChanged = () => loadUser();
    window.addEventListener('popcorn-auth-changed', handleAuthChanged);

    // Charger le statut d'abonnement cloud une fois (partagé avec toutes les pages)
    if (TokenManager.getCloudAccessToken()) {
      loadSubscription().catch(() => {});
    }

    // Masquer le fallback de chargement (Layout.astro) une fois l'app montée
    window.dispatchEvent(new Event('popcorn-app-ready'));

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('popstate', updatePath);
      window.removeEventListener('popcorn-auth-changed', handleAuthChanged);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return onProfileChanged(() => setProfile(getLocalProfile()));
  }, []);

  // Breakpoint CSS déterministe : hamburger sous lg (1024px), onglets inline au-dessus
  // Aucune mesure de débordement JS → pas de flash, pas de chevauchement possible
  useEffect(() => {
    if (!user || isTV) {
      setUseHamburger(false);
      return;
    }
    const mq = window.matchMedia('(max-width: 1023px)');
    const update = () => setUseHamburger(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [user, isTV]);

  useEffect(() => {
    // Horloge (mise à jour au changement de minute)
    const tick = () => {
      try {
        setClock(new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date()));
      } catch {
        const d = new Date();
        setClock(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
      }
    };
    tick();
    const i = window.setInterval(tick, 30_000);
    return () => window.clearInterval(i);
  }, []);

  // Statut de sync unifié : abonnement au store + démarrage du polling quand l'utilisateur est connecté
  useEffect(() => {
    if (!user) {
      setStoreState({ status: null, loading: false });
      return undefined;
    }
    const unsub = subscribeSyncStatusStore((s) => setStoreState({ ...s }));
    const stopPolling = startSyncStatusPolling();
    return () => {
      unsub();
      stopPolling();
    };
  }, [user]);

  const loadUser = async () => {
    if (!serverApi.isAuthenticated()) {
      setLoading(false);
      return;
    }

    try {
      const response = await serverApi.getMe();
      if (response.success && response.data) setUser(response.data);
    } catch (error) {
      if (error && typeof error === 'object' && 'error' in error && (error as any).error !== 'Unauthorized') {
        console.error("Erreur lors du chargement de l'utilisateur:", error);
      }
    } finally {
      setLoading(false);
    }
  };

  const isActive = (path: string) => currentPath === path;
  const isActivePrefix = (prefix: string) => currentPath === prefix || currentPath.startsWith(prefix + '/') || currentPath.startsWith(prefix + '?');

  const tabs: NavTab[] = [
    { label: t('nav.home'), href: '/dashboard', match: 'exact', icon: Home },
    // Sur certains environnements (Tauri / WebView), les routes "directory" nécessitent un slash final.
    { label: t('nav.films'), href: '/films/', match: 'prefix', icon: Film },
    { label: t('nav.series'), href: '/series/', match: 'prefix', icon: Tv2 },
    { label: t('nav.demandes'), href: '/demandes', match: 'prefix', icon: ListPlus },
  ];

  if (loading) return null;
  if (isTV) return null; // Ne pas afficher la top Navbar sur TV

  return (
    <nav
      data-tv-site-header
      className={`fixed top-0 left-0 right-0 w-full z-50 transition-all duration-500 navbar-tv ${isScrolled ? 'navbar-scrolled' : ''}`}
      style={{
        paddingTop: 'var(--safe-area-inset-top)',
        paddingLeft: 'var(--safe-area-inset-left)',
        paddingRight: 'var(--safe-area-inset-right)'
      }}
    >
        <div className="w-full px-4 sm:px-6 md:px-8 lg:px-12 xl:px-16 tv:px-20">
        <div className="flex items-center h-14 sm:h-16 lg:h-18 tv:h-20 gap-3 sm:gap-4 lg:gap-6 tv:gap-8">

          {/* ── GAUCHE : Marque ── */}
          <div className="flex-shrink-0">
            <a
              href={user ? '/dashboard' : '/'}
              className="flex items-center gap-2 sm:gap-3 group rounded-xl py-1 pr-2 focus:outline-none focus:ring-4 focus:ring-primary-600/50 focus:ring-offset-2 focus:ring-offset-black transition-opacity duration-200 hover:opacity-90"
              tabIndex={0}
              data-focusable
              aria-label="Popcornn"
            >
              <img
                src="/popcorn_logo.png"
                alt="Popcornn"
                className="w-8 h-8 sm:w-9 sm:h-9 lg:w-11 lg:h-11 tv:w-12 tv:h-12 object-contain transition-transform duration-300 group-hover:scale-110 group-hover:drop-shadow-[0_0_10px_rgba(168,85,247,0.8)]"
                loading="eager"
              />
              <span className="hidden sm:block font-extrabold text-white text-xl lg:text-2xl tv:text-3xl leading-none tracking-tight select-none">
                Popcornn
              </span>
            </a>
          </div>

          {/* ── CENTRE : Navigation ── */}
          <div className="flex-1 min-w-0 flex items-center justify-center">
            {user && !useHamburger && (
              <div className="nav-tabs-container" style={{ overflow: 'visible' }}>
                <div className="flex items-center gap-1 lg:gap-2 tv:gap-3 nav-tabs-wrapper">
                  {tabs.map((tab) => {
                    const active = tab.match === 'exact' ? isActive(tab.href) : isActivePrefix(tab.href);
                    const TabIcon = tab.icon;
                    return (
                      <a
                        key={tab.href}
                        href={tab.href}
                        className={`nav-tab whitespace-nowrap flex-shrink-0 ${active ? 'nav-tab-active' : ''}`}
                        tabIndex={0}
                        data-focusable
                        aria-current={active ? 'page' : undefined}
                      >
                        {TabIcon && <TabIcon className="w-4 h-4 tv:w-5 tv:h-5 flex-shrink-0" />}
                        <span>{tab.label}</span>
                      </a>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Dropdown hamburger — affiché sous lg (1024px) */}
            {user && useHamburger && mobileMenuOpen && (
              <div className="absolute top-full left-0 right-0 z-50 dropdown-menu-mobile animate-slide-down mt-1 mx-3 sm:mx-4 rounded-xl">
                <div className="px-2 py-3 space-y-1">
                  <a
                    href="/settings/account"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 rounded-lg text-white hover:bg-white/10 transition-all duration-200"
                    tabIndex={0}
                    data-focusable
                    aria-label={t('nav.account')}
                  >
                    <Avatar
                      email={user.email}
                      displayName={profile.displayName}
                      profile={profile}
                      sizeClassName="w-10 h-10"
                      shape="circle"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold truncate">{profile.displayName || user.email}</p>
                      {profile.displayName && user.email && (
                        <p className="text-xs text-white/60 truncate">{user.email}</p>
                      )}
                    </div>
                  </a>
                  <div className="border-t border-white/10 my-1" aria-hidden />
                  <BackendStatusBadge variant="inline" />
                  <div className="border-t border-white/10 my-1" aria-hidden />
                  {tabs.map((tab, index) => {
                    const active = tab.match === 'exact' ? isActive(tab.href) : isActivePrefix(tab.href);
                    const TabIcon = tab.icon;
                    return (
                      <a
                        key={tab.href}
                        href={tab.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className={`flex items-center gap-3 px-4 py-3.5 rounded-lg text-white transition-all duration-200 ${
                          active ? 'bg-primary-600 font-bold' : 'hover:bg-white/10 text-white/85 hover:text-white'
                        }`}
                        style={{ animationDelay: `${index * 30}ms` }}
                        tabIndex={0}
                        data-focusable
                        aria-current={active ? 'page' : undefined}
                      >
                        {TabIcon && <TabIcon className="w-5 h-5 flex-shrink-0 opacity-80" />}
                        <span>{tab.label}</span>
                      </a>
                    );
                  })}
                  <div className="border-t border-white/10 my-2" aria-hidden />
                  <a
                    href="/downloads"
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3.5 rounded-lg text-white transition-all duration-200 ${
                      isActivePrefix('/downloads') ? 'bg-primary-600 font-bold' : 'hover:bg-white/10 text-white/85 hover:text-white'
                    }`}
                    tabIndex={0}
                    data-focusable
                    aria-current={isActivePrefix('/downloads') ? 'page' : undefined}
                  >
                    <Download className="w-5 h-5 flex-shrink-0 opacity-80" />
                    <span>{t('nav.downloads')}</span>
                  </a>
                  <a
                    href="/settings"
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3.5 rounded-lg text-white transition-all duration-200 ${
                      isActivePrefix('/settings') ? 'bg-primary-600 font-bold' : 'hover:bg-white/10 text-white/85 hover:text-white'
                    }`}
                    tabIndex={0}
                    data-focusable
                    aria-current={isActivePrefix('/settings') ? 'page' : undefined}
                  >
                    <SettingsIcon className="w-5 h-5 flex-shrink-0 opacity-80" />
                    <span>{t('nav.settings')}</span>
                  </a>
                </div>
              </div>
            )}
          </div>

          {/* ── DROITE : Actions ── */}
          {/* Règle : Search toujours visible · Downloads/Status/Settings/Avatar/Clock → lg+ seulement · Hamburger → < lg */}
          <div className="flex items-center gap-1.5 sm:gap-2 lg:gap-3 tv:gap-4 flex-shrink-0">
            {/* Mode démo */}
            {demoMode && (
              <button
                type="button"
                onClick={() => { setDemoMode(false); window.location.href = '/'; }}
                className="flex-shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-amber-600/90 text-white hover:bg-amber-500 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 focus:ring-offset-gray-900"
                title={t('demo.exitDemo')}
              >
                <span className="hidden sm:inline">{t('demo.exitDemo')}</span>
                <span className="sm:hidden">Demo</span>
              </button>
            )}

            {user ? (
              <>
                {/* Recherche — toujours visible */}
                <a
                  href="/search"
                  className={`gtv-icon-btn ds-focus-glow ds-active-glow flex-shrink-0 relative inline-flex items-center justify-center transition-all duration-200 hover:scale-110 ${isActive('/search') ? 'bg-glass-active' : ''}`}
                  aria-label={t('nav.search')}
                  tabIndex={0}
                  data-focusable
                >
                  <SearchIcon className="w-4 h-4 sm:w-5 sm:h-5 tv:w-6 tv:h-6 relative z-10" />
                </a>

                {/* Téléchargements — lg+ uniquement (dans hamburger sinon) */}
                <a
                  href="/downloads"
                  className={`hidden lg:inline-flex gtv-icon-btn ds-focus-glow ds-active-glow flex-shrink-0 relative items-center justify-center transition-all duration-200 hover:scale-110 ${isActivePrefix('/downloads') ? 'bg-glass-active' : ''}`}
                  aria-label={t('nav.downloads')}
                  tabIndex={0}
                  data-focusable
                >
                  <Download className="w-4 h-4 sm:w-5 sm:h-5 tv:w-6 tv:h-6 relative z-10" />
                </a>

                {/* Statut serveur — lg+ uniquement */}
                <div className="hidden lg:flex items-center" aria-hidden="true" tabIndex={-1}>
                  <BackendStatusBadge />
                </div>

                {/* Paramètres (lg+) ou hamburger (< lg) */}
                {useHamburger ? (
                  <button
                    type="button"
                    onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                    className={`gtv-icon-btn ds-focus-glow ds-active-glow flex-shrink-0 relative inline-flex items-center justify-center transition-all duration-300 ${mobileMenuOpen ? 'bg-primary-600' : ''}`}
                    aria-label={t('nav.menu') || 'Menu'}
                    aria-expanded={mobileMenuOpen}
                    tabIndex={0}
                    data-focusable
                  >
                    {mobileMenuOpen
                      ? <X className="w-4 h-4 sm:w-5 sm:h-5 relative z-10" />
                      : <Menu className="w-4 h-4 sm:w-5 sm:h-5 relative z-10" />
                    }
                  </button>
                ) : (
                  <a
                    href="/settings"
                    className={`gtv-icon-btn ds-focus-glow ds-active-glow flex-shrink-0 relative inline-flex items-center justify-center transition-all duration-200 hover:scale-110 ${isActivePrefix('/settings') ? 'bg-glass-active' : ''} ${syncProgress.inProgress ? 'ds-sync-active-pulse' : ''}`}
                    aria-label={t('nav.settings')}
                    tabIndex={0}
                    data-focusable
                  >
                    {syncProgress.inProgress && (
                      <span className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden>
                        <DsProgressRing
                          value={syncProgress.progress}
                          size={40}
                          strokeWidth={2}
                          color="var(--ds-accent-violet)"
                          trackColor="rgba(255, 255, 255, 0.15)"
                          className="w-full h-full max-w-[40px] max-h-[40px]"
                        />
                      </span>
                    )}
                    <SettingsIcon className="w-4 h-4 sm:w-5 sm:h-5 tv:w-6 tv:h-6 relative z-10" />
                  </a>
                )}

                {/* Avatar — lg+ uniquement (dans hamburger sinon) */}
                <a
                  href="/settings/account"
                  className="hidden lg:block nav-avatar-btn flex-shrink-0 rounded-full overflow-hidden transition-all duration-200 hover:scale-105 hover:ring-2 hover:ring-primary-500/70 hover:ring-offset-1 hover:ring-offset-black focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-accent-violet)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ds-surface-elevated)] active:scale-95 w-10 h-10 lg:w-11 lg:h-11 tv:w-12 tv:h-12"
                  tabIndex={0}
                  data-focusable
                  aria-label={t('nav.account')}
                >
                  <Avatar
                    email={user.email}
                    displayName={profile.displayName}
                    profile={profile}
                    sizeClassName="w-full h-full"
                    shape="circle"
                  />
                </a>

                {/* Horloge — lg+ */}
                <div className="hidden lg:flex items-center pl-1 tv:pl-3">
                  <span className="text-white/80 font-semibold text-sm tv:text-xl tabular-nums tracking-tight">
                    {clock}
                  </span>
                </div>
              </>
            ) : (
              /* ── Invité ── */
              <div className="flex items-center gap-2 sm:gap-3 relative" ref={guestMenuRef}>
                {guestUseHamburger ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setGuestMenuOpen(!guestMenuOpen)}
                      className="gtv-icon-btn ds-focus-glow ds-active-glow flex-shrink-0 relative inline-flex items-center justify-center transition-all duration-300"
                      aria-label={t('nav.menu')}
                      aria-expanded={guestMenuOpen}
                      tabIndex={0}
                      data-focusable
                      data-guest-menu-toggle
                    >
                      {guestMenuOpen
                        ? <X className="w-5 h-5 relative z-10" />
                        : <Menu className="w-5 h-5 relative z-10" />
                      }
                    </button>
                    {guestMenuOpen && (
                      <div className="absolute top-full right-0 mt-2 mx-4 sm:mx-6 rounded-xl z-50 dropdown-menu-mobile animate-slide-down min-w-[200px]">
                        <div className="px-2 py-3 space-y-1">
                          <label className="flex items-center gap-3 px-4 py-3 rounded-lg text-white/90 text-sm">
                            <Globe className="w-4 h-4 flex-shrink-0" aria-hidden />
                            <span className="flex-1">{t('nav.language')}</span>
                            <select
                              value={language}
                              onChange={(e) => setLanguage((e.target as HTMLSelectElement).value as SupportedLanguage)}
                              className="bg-white/10 border border-white/20 text-white rounded-lg px-2.5 py-1.5 text-sm cursor-pointer focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
                              aria-label={t('nav.language')}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {availableLanguages.map((lang) => (
                                <option key={lang} value={lang} className="bg-gray-900 text-white">{LANGUAGE_NAMES[lang]}</option>
                              ))}
                            </select>
                          </label>
                          <div className="border-t border-white/10 my-1" aria-hidden />
                          <a href="/login" onClick={() => setGuestMenuOpen(false)} className="block px-4 py-3.5 rounded-lg text-white hover:bg-white/10 transition-all duration-200" tabIndex={0} data-focusable>
                            {t('common.login')}
                          </a>
                          <a href="/register" onClick={() => setGuestMenuOpen(false)} className="block px-4 py-3.5 rounded-lg bg-primary-600 text-white font-semibold hover:bg-primary-500 transition-all duration-200" tabIndex={0} data-focusable>
                            {t('common.register')}
                          </a>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <label className="flex items-center gap-1.5 text-white/80 text-sm">
                      <Globe className="w-4 h-4 flex-shrink-0" aria-hidden />
                      <select
                        value={language}
                        onChange={(e) => setLanguage((e.target as HTMLSelectElement).value as SupportedLanguage)}
                        className="bg-white/10 border border-white/20 text-white rounded-lg px-2.5 py-1.5 text-sm cursor-pointer focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
                        aria-label={t('nav.language')}
                        tabIndex={0}
                        data-focusable
                      >
                        {availableLanguages.map((lang) => (
                          <option key={lang} value={lang} className="bg-gray-900 text-white">{LANGUAGE_NAMES[lang]}</option>
                        ))}
                      </select>
                    </label>
                    <a href="/login" className="gtv-pill-btn transition-all duration-200 hover:scale-105" tabIndex={0} data-focusable>
                      {t('common.login')}
                    </a>
                    <a href="/register" className="gtv-pill-btn gtv-pill-btn-primary transition-all duration-200 hover:scale-105 hover:shadow-primary-lg" tabIndex={0} data-focusable>
                      {t('common.register')}
                    </a>
                  </>
                )}
              </div>
            )}
          </div>

        </div>
      </div>
    </nav>
  );
}
