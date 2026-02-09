import { useEffect, useState, useRef } from 'preact/hooks';
import { Download, Search as SearchIcon, Settings as SettingsIcon, Menu, X, Globe } from 'lucide-preact';
import { serverApi } from '../../lib/client/server-api';
import { getLocalProfile, onProfileChanged } from '../../lib/client/profile';
import Avatar from '../ui/Avatar';
import BackendStatusBadge from './BackendStatusBadge';
import { isMobileDevice, isTVPlatform } from '../../lib/utils/device-detection';
import { calculateSyncProgress } from '../../lib/utils/sync-progress';
import { useI18n } from '../../lib/i18n/useI18n';
import { LANGUAGE_NAMES, type SupportedLanguage } from '../../lib/i18n';
import { isDemoMode, setDemoMode } from '../../lib/backend-config';

type NavTab = { label: string; href: string; match?: 'exact' | 'prefix' };

export default function Navbar() {
  const { t, language, setLanguage, availableLanguages } = useI18n();
  const [isScrolled, setIsScrolled] = useState(false);
  const [currentPath, setCurrentPath] = useState('');
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(() => getLocalProfile());
  const isMobile = isMobileDevice();
  const isTV = isTVPlatform();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [useHamburger, setUseHamburger] = useState(false);
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const tabsWrapperRef = useRef<HTMLDivElement>(null);
  const checkTimeoutRef = useRef<number | null>(null);
  const [clock, setClock] = useState(() => {
    try {
      return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date());
    } catch {
      const d = new Date();
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
  });
  const [syncProgress, setSyncProgress] = useState<{ inProgress: boolean; progress: number }>({ inProgress: false, progress: 0 });
  const previousStatsRef = useRef<Record<string, number>>({});
  const [demoMode, setDemoModeNav] = useState(false);
  useEffect(() => {
    setDemoModeNav(isDemoMode());
  }, []);

  useEffect(() => {
    const updatePath = () => setCurrentPath(window.location.pathname + window.location.search);
    updatePath();

    const handleScroll = () => setIsScrolled(window.scrollY > 10);

    window.addEventListener('scroll', handleScroll);
    window.addEventListener('popstate', updatePath);

    loadUser();

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('popstate', updatePath);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return onProfileChanged(() => setProfile(getLocalProfile()));
  }, []);

  // Vérifier si tous les onglets peuvent tenir dans l'espace disponible
  useEffect(() => {
    if (!user) {
      setUseHamburger(false);
      return;
    }

    // Ne jamais utiliser le hamburger sur TV
    if (isTV) {
      setUseHamburger(false);
      return;
    }

    const checkSpace = () => {
      if (checkTimeoutRef.current) {
        clearTimeout(checkTimeoutRef.current);
      }

      checkTimeoutRef.current = window.setTimeout(() => {
        // Sur grands écrans (>= 1024px), toujours afficher les onglets, pas le hamburger.
        // Évite le bug sur certaines pages (ex. Bibliothèque) où le calcul de débordement
        // peut être faux au premier rendu ou à cause du layout.
        const isLargeScreen = typeof window !== 'undefined' && window.innerWidth >= 1024;
        if (isLargeScreen) {
          setUseHamburger(false);
          return;
        }

        const wrapper = tabsWrapperRef.current;
        if (!wrapper) return;

        // Vérifier si le wrapper a un scroll (donc les éléments débordent)
        const hasScroll = wrapper.scrollWidth > wrapper.clientWidth;
        
        // Si scroll activé, on ne peut pas tout afficher → utiliser hamburger
        // Mais jamais sur TV
        setUseHamburger(hasScroll && !isTV);
      }, 100);
    };

    // Vérifier après le rendu
    const initialCheck = window.setTimeout(checkSpace, 200);

    // Observer les changements de taille du wrapper
    let resizeObserver: ResizeObserver | null = null;
    if (tabsWrapperRef.current) {
      resizeObserver = new ResizeObserver(checkSpace);
      resizeObserver.observe(tabsWrapperRef.current);
    }

    window.addEventListener('resize', checkSpace);

    return () => {
      clearTimeout(initialCheck);
      if (checkTimeoutRef.current) {
        clearTimeout(checkTimeoutRef.current);
      }
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      window.removeEventListener('resize', checkSpace);
    };
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

  // Vérifier le statut de synchronisation pour afficher le cercle de progression
  useEffect(() => {
    if (!user) {
      setSyncProgress({ inProgress: false, progress: 0 });
      return;
    }

    const checkSyncStatus = async () => {
      try {
        const response = await serverApi.getSyncStatus();
        if (response.success && response.data) {
          const data = response.data;
          // Vérifier si la sync est en cours uniquement via le flag sync_in_progress
          // Les stats peuvent persister après la fin d'une sync, donc on ne doit pas les utiliser
          // pour déterminer si la sync est en cours
          const inProgress = data.sync_in_progress === true;
          
          // Initialiser previousStats si c'est le début d'une sync
          if (Object.keys(previousStatsRef.current).length === 0 && inProgress) {
            previousStatsRef.current = data.stats || {};
          }
          
          // Utiliser la fonction utilitaire partagée pour calculer la progression
          const progress = calculateSyncProgress(
            {
              sync_in_progress: inProgress,
              stats: data.stats,
              progress: data.progress,
            },
            previousStatsRef.current
          );
          
          // Réinitialiser previousStats si la sync vient de se terminer
          if (!inProgress && Object.keys(previousStatsRef.current).length > 0) {
            previousStatsRef.current = {};
          }
          
          setSyncProgress({ inProgress, progress });
        } else {
          // Si pas de réponse ou erreur, réinitialiser
          previousStatsRef.current = {};
          setSyncProgress({ inProgress: false, progress: 0 });
        }
      } catch (err) {
        // Ignorer les erreurs silencieusement mais réinitialiser
        previousStatsRef.current = {};
        setSyncProgress({ inProgress: false, progress: 0 });
      }
    };

    checkSyncStatus();

    // Au repos : 30 s. Pendant une sync : 2 s.
    const POLL_ACTIVE_MS = 2000;
    const POLL_IDLE_MS = 30000;
    const intervalMs = syncProgress?.inProgress ? POLL_ACTIVE_MS : POLL_IDLE_MS;
    const interval = setInterval(checkSyncStatus, intervalMs);
    return () => clearInterval(interval);
  }, [user, syncProgress?.inProgress]);

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
    { label: t('nav.home'), href: '/dashboard', match: 'exact' },
    // Sur certains environnements (Tauri / WebView), les routes "directory" nécessitent un slash final.
    { label: t('nav.films'), href: '/films/', match: 'prefix' },
    { label: t('nav.series'), href: '/series/', match: 'prefix' },
    { label: t('nav.demandes'), href: '/demandes', match: 'prefix' },
  ];

  if (loading) return null;

  return (
    <nav
      className={`fixed top-0 left-0 right-0 w-full z-50 transition-all duration-300 glass-panel border-b border-white/10 ${
        isScrolled ? 'bg-glass-active' : 'bg-glass'
      }`}
      style={{
        paddingTop: 'var(--safe-area-inset-top)',
        paddingLeft: 'var(--safe-area-inset-left)',
        paddingRight: 'var(--safe-area-inset-right)'
      }}
    >
      <div className="w-full px-4 sm:px-6 md:px-8 lg:px-12 xl:px-16 tv:px-24">
        <div className="flex items-center justify-between h-14 sm:h-16 md:h-18 lg:h-20 tv:h-24">
          {/* Gauche: avatar (ou logo) + recherche */}
          <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3 flex-shrink-0 min-w-0">
            <a
              href={user ? '/dashboard' : '/'}
              className="flex items-center gap-2 sm:gap-3 hover:opacity-80 transition-all duration-200 hover:scale-110 focus:outline-none focus:ring-4 focus:ring-primary-600/50 focus:ring-offset-2 focus:ring-offset-black rounded-full py-1 pr-2"
              tabIndex={0}
              data-focusable
              aria-label={t('nav.home')}
            >
              <img
                src="/popcorn_logo.png"
                alt="Popcorn Client"
                className="w-7 h-7 sm:w-9 sm:h-9 md:w-10 md:h-10 lg:w-11 lg:h-11 tv:w-14 tv:h-14 object-contain transition-transform duration-200"
                loading="eager"
              />
            </a>

            {user ? (
                <a
                  href="/search"
                  className={`gtv-icon-btn transition-all duration-200 hover:scale-110 ${isActive('/search') ? 'bg-glass-active scale-110' : ''}`}
                  aria-label={t('nav.search')}
                  tabIndex={0}
                  data-focusable
                >
                <SearchIcon className="w-4 h-4 sm:w-5 sm:h-5 tv:w-6 tv:h-6 transition-transform duration-200" />
              </a>
            ) : null}
          </div>

          {/* Centre: onglets en pilule (Google TV-like) ou menu hamburger si pas assez de place */}
          {user ? (
            <>
              {!useHamburger ? (
                <div 
                  ref={tabsContainerRef}
                  className={`flex-1 min-w-0 ${isMobile ? 'px-1' : 'px-2 sm:px-4'}`}
                  style={{ overflow: 'visible' }}
                >
                  <div className="flex items-center justify-center nav-tabs-container">
                    <div 
                      ref={tabsWrapperRef}
                      className={`flex items-center gap-1 sm:gap-2 overflow-x-auto scrollbar-hide max-w-full nav-tabs-wrapper ${isMobile ? 'px-1' : ''}`}
                    >
                      {tabs.map((t) => {
                        const active = t.match === 'exact' ? isActive(t.href) : isActivePrefix(t.href);
                        return (
                          <a
                            key={t.href}
                            href={t.href}
                            className={`nav-tab whitespace-nowrap flex-shrink-0 transition-all duration-200 ${isMobile ? 'nav-tab-mobile' : ''} ${active ? 'nav-tab-active' : ''} ${
                              active ? 'transform scale-105' : 'hover:scale-105'
                            }`}
                            tabIndex={0}
                            data-focusable
                            aria-current={active ? 'page' : undefined}
                          >
                            {t.label}
                          </a>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 min-w-0" />

              )}

              {/* Menu dropdown hamburger (affiché quand useHamburger, le bouton est à droite) */}
              {user && useHamburger && mobileMenuOpen && (
                    <div className={`absolute top-full left-0 right-0 z-50 dropdown-menu-mobile animate-slide-down ${
                      isMobile ? 'mt-2 mx-4 rounded-xl' : 'mt-1 rounded-lg'
                    }`}>
                      <div className="px-2 py-3 space-y-1">
                        {/* Carte avatar en tête du menu */}
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
                            sizeClassName="w-10 h-10 sm:w-11 sm:h-11"
                            shape="circle"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold truncate">
                              {profile.displayName || user.email}
                            </p>
                            {profile.displayName && user.email && (
                              <p className="text-xs text-white/60 truncate">{user.email}</p>
                            )}
                          </div>
                        </a>
                        <div className="border-t border-white/10 my-1" aria-hidden />
                        {/* Bloc serveur local (statut + démarrer/arrêter/redémarrer si desktop) */}
                        <BackendStatusBadge variant="inline" />
                        <div className="border-t border-white/10 my-1" aria-hidden />
                        {tabs.map((t, index) => {
                          const active = t.match === 'exact' ? isActive(t.href) : isActivePrefix(t.href);
                          return (
                            <a
                              key={t.href}
                              href={t.href}
                              onClick={() => setMobileMenuOpen(false)}
                              className={`block px-4 py-3.5 rounded-lg text-white transition-all duration-200 transform hover:scale-[1.02] hover:shadow-lg ${
                                active 
                                  ? 'bg-primary-600 text-white font-bold shadow-primary-lg scale-[1.02]' 
                                  : 'hover:bg-white/10 text-white/90 hover:text-white'
                              }`}
                              style={{ animationDelay: `${index * 30}ms` }}
                              tabIndex={0}
                              data-focusable
                              aria-current={active ? 'page' : undefined}
                            >
                              <div className="flex items-center gap-3">
                                {active && (
                                  <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse-slow" />
                                )}
                                <span>{t.label}</span>
                              </div>
                            </a>
                          );
                        })}
                        <div className="border-t border-white/10 my-2" aria-hidden />
                        <a
                          href="/settings"
                          onClick={() => setMobileMenuOpen(false)}
                          className={`block px-4 py-3.5 rounded-lg text-white transition-all duration-200 hover:scale-[1.02] hover:shadow-lg hover:bg-white/10 ${
                            isActivePrefix('/settings') ? 'bg-primary-600 font-bold' : 'text-white/90 hover:text-white'
                          }`}
                          tabIndex={0}
                          data-focusable
                          aria-current={isActivePrefix('/settings') ? 'page' : undefined}
                        >
                          <div className="flex items-center gap-3">
                            {isActivePrefix('/settings') && (
                              <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse-slow" />
                            )}
                            <SettingsIcon className="w-5 h-5 flex-shrink-0" />
                            <span>{t('nav.settings')}</span>
                          </div>
                        </a>
                      </div>
                    </div>
                  )}
            </>
          ) : (
            <div className="flex-1" />
          )}

          {/* Droite: pastille serveur (desktop), mode démo, téléchargements, menu ou paramètres, avatar (desktop), horloge */}
          <div className="flex items-center gap-2 sm:gap-3 md:gap-4 flex-shrink-0 min-w-0">
            {/* Mode démo : bouton pour quitter directement */}
            {demoMode && (
              <button
                type="button"
                onClick={() => {
                  setDemoMode(false);
                  window.location.href = '/';
                }}
                className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-600/90 text-white hover:bg-amber-500 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 focus:ring-offset-gray-900"
                title={t('demo.exitDemo')}
              >
                {t('demo.exitDemo')}
              </button>
            )}
            {/* Desktop : pastille serveur (mobile : menu serveur dans le hamburger) */}
            <div className="hidden sm:flex items-center">
              <BackendStatusBadge />
            </div>
            {user ? (
              <>
                <a
                  href="/downloads"
                  className="gtv-icon-btn flex-shrink-0 inline-flex transition-all duration-200 hover:scale-110"
                  aria-label={t('nav.downloads')}
                  tabIndex={0}
                  data-focusable
                >
                  <Download className="w-4 h-4 sm:w-5 sm:h-5 tv:w-6 tv:h-6 transition-transform duration-200" />
                </a>
                {/* Emplacement paramètres : hamburger si menu replié, sinon icône paramètres */}
                {useHamburger ? (
                  <button
                    type="button"
                    onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                    className={`gtv-icon-btn flex-shrink-0 transition-all duration-300 ${mobileMenuOpen ? 'bg-primary-600 rotate-90' : ''}`}
                    aria-label={t('nav.menu') || 'Menu'}
                    aria-expanded={mobileMenuOpen}
                    tabIndex={0}
                    data-focusable
                  >
                    {mobileMenuOpen ? (
                      <X className="w-4 h-4 sm:w-5 sm:h-5 transition-transform duration-300" />
                    ) : (
                      <Menu className="w-4 h-4 sm:w-5 sm:h-5 transition-transform duration-300" />
                    )}
                  </button>
                ) : (
                  <a
                    href="/settings"
                    className={`gtv-icon-btn flex-shrink-0 relative ${isTV ? 'inline-flex' : 'hidden sm:inline-flex'} transition-all duration-200 hover:scale-110 ${isActivePrefix('/settings') ? 'bg-glass-active scale-110' : ''}`}
                    aria-label={t('nav.settings')}
                    tabIndex={0}
                    data-focusable
                  >
                    {syncProgress.inProgress && (
                      <svg
                        className="absolute inset-0 w-full h-full transform -rotate-90 pointer-events-none"
                        viewBox="0 0 36 36"
                        style={{ width: '100%', height: '100%' }}
                      >
                        <circle cx="18" cy="18" r="16" fill="none" stroke="rgba(255, 255, 255, 0.1)" strokeWidth="2" />
                        <circle
                          cx="18" cy="18" r="16" fill="none" stroke="rgb(59, 130, 246)" strokeWidth="2"
                          strokeDasharray={`${(syncProgress.progress / 100) * 100.53}, 100.53`}
                          strokeDashoffset="0" strokeLinecap="round"
                          className="transition-all duration-500 ease-out"
                          style={{ strokeDasharray: `${(syncProgress.progress / 100) * 100.53}, 100.53` }}
                        />
                      </svg>
                    )}
                    <SettingsIcon className="w-4 h-4 sm:w-5 sm:h-5 tv:w-6 tv:h-6 relative z-10" />
                  </a>
                )}

                <a
                  href="/settings/account"
                  className={`cursor-pointer focus:outline-none focus:ring-4 focus:ring-primary-600/50 rounded-full transition-all duration-200 hover:scale-110 hover:ring-2 hover:ring-primary-600/30 ${user ? 'hidden sm:inline-flex' : ''}`}
                  tabIndex={0}
                  data-focusable
                  aria-label={t('nav.account')}
                >
                  <Avatar
                    email={user.email}
                    displayName={profile.displayName}
                    profile={profile}
                    sizeClassName="w-7 h-7 sm:w-9 sm:h-9 md:w-10 md:h-10 lg:w-11 lg:h-11 tv:w-14 tv:h-14 transition-transform duration-200"
                  />
                </a>

                <div className="hidden lg:flex flex-col items-end leading-none pl-2">
                  <div className="text-white/90 font-semibold text-sm tv:text-base tabular-nums">{clock}</div>
                  <div className="text-white/50 text-xs tv:text-sm">Popcorn TV</div>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2 sm:gap-3">
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
                      <option key={lang} value={lang} className="bg-gray-900 text-white">
                        {LANGUAGE_NAMES[lang]}
                      </option>
                    ))}
                  </select>
                </label>
                <a
                  href="/login"
                  className="gtv-pill-btn transition-all duration-200 hover:scale-105"
                  tabIndex={0}
                  data-focusable
                >
                  {t('common.login')}
                </a>
                <a
                  href="/register"
                  className="gtv-pill-btn gtv-pill-btn-primary transition-all duration-200 hover:scale-105 hover:shadow-primary-lg"
                  tabIndex={0}
                  data-focusable
                >
                  {t('common.register')}
                </a>
              </div>
            )}
          </div>
      </div>
    </div>
    </nav>
  );
}
