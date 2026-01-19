import { useEffect, useState } from 'preact/hooks';
import { Download, Search as SearchIcon, Settings as SettingsIcon } from 'lucide-preact';
import { serverApi } from '../../lib/client/server-api';
import { getLocalProfile, onProfileChanged } from '../../lib/client/profile';
import Avatar from '../ui/Avatar';

type NavTab = { label: string; href: string; match?: 'exact' | 'prefix' };

export default function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [currentPath, setCurrentPath] = useState('');
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(() => getLocalProfile());
  const [clock, setClock] = useState(() => {
    try {
      return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date());
    } catch {
      const d = new Date();
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
  });

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
      window.location.href = '/login';
    }
  };

  const isActive = (path: string) => currentPath === path;
  const isActivePrefix = (prefix: string) => currentPath === prefix || currentPath.startsWith(prefix + '/') || currentPath.startsWith(prefix + '?');

  const tabs: NavTab[] = [
    { label: 'Home', href: '/dashboard', match: 'exact' },
    // Sur certains environnements (Tauri / WebView), les routes "directory" nécessitent un slash final.
    { label: 'Films', href: '/films/', match: 'prefix' },
    { label: 'Séries', href: '/series/', match: 'prefix' },
  ];

  if (loading) return null;

  return (
    <nav
      className={`fixed top-0 left-0 right-0 w-full z-50 transition-all duration-300 glass-panel border-b border-white/10 ${
        isScrolled ? 'bg-glass-active' : 'bg-glass'
      }`}
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

          {/* Centre: onglets en pilule (Google TV-like) */}
          {user ? (
            <div className="flex-1 min-w-0 px-2 sm:px-4">
              <div className="flex items-center justify-center">
                <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto scrollbar-hide max-w-full">
                  {tabs.map((t) => {
                    const active = t.match === 'exact' ? isActive(t.href) : isActivePrefix(t.href);
                    return (
                      <a
                        key={t.href}
                        href={t.href}
                        className={`nav-tab whitespace-nowrap ${active ? 'nav-tab-active' : ''}`}
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
                  className={`gtv-icon-btn hidden sm:inline-flex ${isActivePrefix('/settings') ? 'bg-glass-active' : ''}`}
                  aria-label="Paramètres"
                  tabIndex={0}
                  data-focusable
                >
                  <SettingsIcon className="w-5 h-5 tv:w-6 tv:h-6" />
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
                      <a href="/library" className="text-white hover:bg-glass-hover text-base py-3 px-4 rounded-lg">
                        Bibliothèque
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
