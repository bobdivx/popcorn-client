import { useEffect, useState, useRef } from 'preact/hooks';
import { Download, Search as SearchIcon, Settings as SettingsIcon, Menu, X } from 'lucide-preact';
import { serverApi } from '../../lib/client/server-api';
import { getLocalProfile, onProfileChanged } from '../../lib/client/profile';
import Avatar from '../ui/Avatar';
import { isMobileDevice } from '../../lib/utils/device-detection';
import { redirectTo } from '../../lib/utils/navigation.js';
import { calculateSyncProgress } from '../../lib/utils/sync-progress';

type NavTab = { label: string; href: string; match?: 'exact' | 'prefix' };

export default function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [currentPath, setCurrentPath] = useState('');
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(() => getLocalProfile());
  const isMobile = isMobileDevice();
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

    const checkSpace = () => {
      if (checkTimeoutRef.current) {
        clearTimeout(checkTimeoutRef.current);
      }

      checkTimeoutRef.current = window.setTimeout(() => {
        const wrapper = tabsWrapperRef.current;
        if (!wrapper) return;

        // Vérifier si le wrapper a un scroll (donc les éléments débordent)
        const hasScroll = wrapper.scrollWidth > wrapper.clientWidth;
        
        // Si scroll activé, on ne peut pas tout afficher → utiliser hamburger
        setUseHamburger(hasScroll);
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
  }, [user]);

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
          // Vérifier si la sync est en cours (soit via flag, soit via stats)
          const hasStats = data.stats && Object.keys(data.stats).length > 0;
          const inProgress = data.sync_in_progress || hasStats;
          
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
          
          // Debug: log pour vérifier les valeurs
          if (inProgress && progress > 0) {
            console.log('[NAVBAR SYNC]', { inProgress, progress, stats: data.stats, progressData: data.progress });
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
    const interval = setInterval(checkSyncStatus, 2000);
    return () => clearInterval(interval);
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

  const handleLogout = async () => {
    try {
      await serverApi.logout();
    } catch (error) {
      console.error('Erreur lors de la déconnexion:', error);
    } finally {
      redirectTo('/login');
    }
  };

  const isActive = (path: string) => currentPath === path;
  const isActivePrefix = (prefix: string) => currentPath === prefix || currentPath.startsWith(prefix + '/') || currentPath.startsWith(prefix + '?');

  const tabs: NavTab[] = [
    { label: 'Home', href: '/dashboard', match: 'exact' },
    // Sur certains environnements (Tauri / WebView), les routes "directory" nécessitent un slash final.
    { label: 'Films', href: '/films/', match: 'prefix' },
    { label: 'Séries', href: '/series/', match: 'prefix' },
    { label: 'Bibliothèque', href: '/library', match: 'prefix' },
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
        <div className="flex items-center justify-between h-16 sm:h-18 md:h-20 lg:h-20 tv:h-24">
          {/* Gauche: avatar (ou logo) + recherche */}
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0 min-w-0">
            <a
              href={user ? '/dashboard' : '/'}
              className="flex items-center gap-2 sm:gap-3 hover:opacity-80 transition-opacity focus:outline-none focus:ring-4 focus:ring-primary-600/50 focus:ring-offset-2 focus:ring-offset-black rounded-full py-1 pr-2"
              tabIndex={0}
              data-focusable
              aria-label="Aller à l'accueil"
            >
              <img
                src="/popcorn_logo.png"
                alt="Popcorn Client"
                className="w-9 h-9 sm:w-10 sm:h-10 md:w-11 md:h-11 tv:w-14 tv:h-14 object-contain"
                loading="eager"
              />
            </a>

            {user ? (
              <a
                href="/search"
                className={`gtv-icon-btn ${isActive('/search') ? 'bg-glass-active' : ''}`}
                aria-label="Recherche"
                tabIndex={0}
                data-focusable
              >
                <SearchIcon className="w-5 h-5 tv:w-6 tv:h-6" />
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
                >
                  <div className="flex items-center justify-center">
                    <div 
                      ref={tabsWrapperRef}
                      className={`flex items-center gap-1 sm:gap-2 overflow-x-hidden scrollbar-hide max-w-full ${isMobile ? 'px-1' : ''}`}
                    >
                      {tabs.map((t) => {
                        const active = t.match === 'exact' ? isActive(t.href) : isActivePrefix(t.href);
                        return (
                          <a
                            key={t.href}
                            href={t.href}
                            className={`nav-tab whitespace-nowrap flex-shrink-0 ${isMobile ? 'nav-tab-mobile' : ''} ${active ? 'nav-tab-active' : ''}`}
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
                <>
                  {/* Menu hamburger si pas assez de place */}
                  <div className="flex-1 min-w-0 flex items-center justify-center">
                    <button
                      onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                      className="gtv-icon-btn"
                      aria-label="Menu"
                      tabIndex={0}
                      data-focusable
                    >
                      {mobileMenuOpen ? (
                        <X className="w-5 h-5" />
                      ) : (
                        <Menu className="w-5 h-5" />
                      )}
                    </button>
                  </div>

                  {/* Menu dropdown */}
                  {mobileMenuOpen && (
                    <div className="absolute top-full left-0 right-0 z-50 bg-glass-panel-lg border-b border-white/10 backdrop-blur-md">
                      <div className="px-4 py-3 space-y-2">
                        {tabs.map((t) => {
                          const active = t.match === 'exact' ? isActive(t.href) : isActivePrefix(t.href);
                          return (
                            <a
                              key={t.href}
                              href={t.href}
                              onClick={() => setMobileMenuOpen(false)}
                              className={`block px-4 py-3 rounded-lg text-white/90 transition-all ${
                                active 
                                  ? 'bg-glass-active text-white font-bold' 
                                  : 'hover:bg-glass-hover text-white/80'
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
                  )}
                </>
              )}
            </>
          ) : (
            <div className="flex-1" />
          )}

          {/* Droite: actions + profil + horloge */}
          <div className="flex items-center gap-2 sm:gap-3 md:gap-4 flex-shrink-0">
            {user ? (
              <>
                <a
                  href="/downloads"
                  className="gtv-icon-btn hidden sm:inline-flex"
                  aria-label="Téléchargements"
                  tabIndex={0}
                  data-focusable
                >
                  <Download className="w-5 h-5 tv:w-6 tv:h-6" />
                </a>
                <a
                  href="/settings"
                  className={`gtv-icon-btn hidden sm:inline-flex relative ${isActivePrefix('/settings') ? 'bg-glass-active' : ''}`}
                  aria-label="Paramètres"
                  tabIndex={0}
                  data-focusable
                >
                  {syncProgress.inProgress && (
                    <svg
                      className="absolute inset-0 w-full h-full transform -rotate-90 pointer-events-none"
                      viewBox="0 0 36 36"
                      style={{ width: '100%', height: '100%' }}
                    >
                      {/* Cercle de fond */}
                      <circle
                        cx="18"
                        cy="18"
                        r="16"
                        fill="none"
                        stroke="rgba(255, 255, 255, 0.1)"
                        strokeWidth="2"
                      />
                      {/* Cercle de progression */}
                      <circle
                        cx="18"
                        cy="18"
                        r="16"
                        fill="none"
                        stroke="rgb(59, 130, 246)"
                        strokeWidth="2"
                        strokeDasharray={`${(syncProgress.progress / 100) * 100.53}, 100.53`}
                        strokeDashoffset="0"
                        strokeLinecap="round"
                        className="transition-all duration-500 ease-out"
                        style={{
                          strokeDasharray: `${(syncProgress.progress / 100) * 100.53}, 100.53`
                        }}
                      />
                    </svg>
                  )}
                  <SettingsIcon className="w-5 h-5 tv:w-6 tv:h-6 relative z-10" />
                </a>

                <div className="dropdown dropdown-end">
                  <div
                    tabIndex={0}
                    role="button"
                    className="cursor-pointer focus:outline-none focus:ring-4 focus:ring-primary-600/50 rounded-full"
                    data-focusable
                    aria-label="Menu profil"
                  >
                    <Avatar
                      email={user.email}
                      displayName={profile.displayName}
                      profile={profile}
                      sizeClassName="w-9 h-9 sm:w-10 sm:h-10 md:w-11 md:h-11 tv:w-14 tv:h-14"
                    />
                  </div>
                  <ul
                    tabIndex={0}
                    className="menu menu-sm dropdown-content mt-3 z-[1] p-3 shadow-2xl glass-panel-lg rounded-xl w-72 border border-white/10"
                  >
                    <li className="menu-title">
                      <span className="text-white font-bold text-lg">
                        {profile.displayName || user.email || 'Utilisateur'}
                      </span>
                    </li>
                    <li>
                      <a href="/dashboard" className="text-white hover:bg-glass-hover text-base py-3 px-4 rounded-lg">
                        Accueil
                      </a>
                    </li>
                    <li>
                      <a href="/films/" className="text-white hover:bg-glass-hover text-base py-3 px-4 rounded-lg">
                        Films
                      </a>
                    </li>
                    <li>
                      <a href="/series/" className="text-white hover:bg-glass-hover text-base py-3 px-4 rounded-lg">
                        Séries
                      </a>
                    </li>
                    <li>
                      <a href="/downloads" className="text-white hover:bg-glass-hover text-base py-3 px-4 rounded-lg">
                        Téléchargements
                      </a>
                    </li>
                    <li>
                      <a href="/settings" className="text-white hover:bg-glass-hover text-base py-3 px-4 rounded-lg">
                        Paramètres
                      </a>
                    </li>
                    <li>
                      <hr className="my-2 border-white/10" />
                    </li>
                    <li>
                      <a
                        onClick={handleLogout}
                        className="text-primary-400 hover:bg-glass-hover text-base py-3 px-4 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-600/50"
                      >
                        Déconnexion
                      </a>
                    </li>
                  </ul>
                </div>

                <div className="hidden lg:flex flex-col items-end leading-none pl-2">
                  <div className="text-white/90 font-semibold text-sm tv:text-base tabular-nums">{clock}</div>
                  <div className="text-white/50 text-xs tv:text-sm">Popcorn TV</div>
                </div>
              </>
            ) : (
              <div className="flex gap-2 sm:gap-3">
                <a
                  href="/login"
                  className="gtv-pill-btn"
                  tabIndex={0}
                  data-focusable
                >
                  Connexion
                </a>
                <a
                  href="/register"
                  className="gtv-pill-btn gtv-pill-btn-primary"
                  tabIndex={0}
                  data-focusable
                >
                  Inscription
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
