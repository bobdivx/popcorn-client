import { useEffect, useState } from 'preact/hooks';
import { Menu, Search as SearchIcon } from 'lucide-preact';
import { serverApi } from '../../lib/client/server-api';
import { getLocalProfile, onProfileChanged } from '../../lib/client/profile';
import Avatar from '../ui/Avatar';

export default function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [currentPath, setCurrentPath] = useState('');
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(() => getLocalProfile());

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

  if (loading) return null;

  return (
    <nav
      className={`fixed top-0 left-0 right-0 w-full z-50 transition-all duration-300 glass-panel border-b border-white/10 ${
        isScrolled ? 'bg-glass-active' : 'bg-glass'
      }`}
    >
      <div className="w-full px-4 sm:px-6 md:px-8 lg:px-12 xl:px-16 tv:px-24">
        <div className="flex items-center justify-between h-16 sm:h-18 md:h-20 lg:h-24 tv:h-28">
          {/* Logo + menu */}
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            {user ? (
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('sidebar-toggle'))}
                className="lg:hidden p-2 text-white hover:bg-glass-hover transition-colors focus:outline-none focus:ring-4 focus:ring-primary-600/50 rounded min-h-[48px] min-w-[48px]"
                aria-label="Ouvrir le menu"
                tabIndex={0}
                data-focusable
              >
                <Menu className="w-6 h-6" />
              </button>
            ) : null}

            <a
              href={user ? '/dashboard' : '/'}
              className="flex items-center gap-2 sm:gap-3 hover:opacity-80 transition-opacity focus:outline-none focus:ring-4 focus:ring-primary-600/50 focus:ring-offset-2 focus:ring-offset-black rounded-lg py-1 tv:py-2"
              tabIndex={0}
              data-focusable
            >
              <img
                src="/popcorn_logo.png"
                alt="Popcorn Client"
                className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 tv:w-16 tv:h-16 object-contain"
                loading="eager"
              />
              <span className="hidden sm:inline text-xl sm:text-2xl md:text-3xl tv:text-4xl font-bold text-white">
                Popcorn
              </span>
            </a>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 sm:gap-4 md:gap-6 flex-shrink-0">
            {user ? (
              <>
                {/* Search = icône (pas de tab texte dans le header) */}
                <a
                  href="/search"
                  className={`btn btn-ghost glass-panel min-h-[48px] min-w-[48px] px-3 text-white hover:bg-glass-hover focus:outline-none focus:ring-4 focus:ring-primary-600/50 ${
                    isActive('/search') ? 'bg-glass-active' : ''
                  }`}
                  aria-label="Recherche"
                  tabIndex={0}
                  data-focusable
                >
                  <SearchIcon className="w-5 h-5 tv:w-6 tv:h-6" />
                </a>

                <div className="dropdown dropdown-end">
                  <div
                    tabIndex={0}
                    role="button"
                    className="cursor-pointer focus:outline-none focus:ring-4 focus:ring-primary-600/50 rounded-lg"
                    data-focusable
                  >
                    <Avatar
                      email={user.email}
                      displayName={profile.displayName}
                      profile={profile}
                      sizeClassName="w-9 h-9 sm:w-10 sm:h-10 md:w-12 md:h-12 tv:w-16 tv:h-16"
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
                      <a href="/settings" className="text-white hover:bg-glass-hover text-base py-3 px-4 rounded-lg">
                        Paramètres
                      </a>
                    </li>
                    <li>
                      <a href="/settings/account" className="text-white hover:bg-glass-hover text-base py-3 px-4 rounded-lg">
                        Mon compte
                      </a>
                    </li>
                    <li><hr className="my-2 border-white/10" /></li>
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
              </>
            ) : (
              <div className="flex gap-3 sm:gap-4">
                <a
                  href="/login"
                  className="text-white hover:text-gray-300 transition-all duration-300 text-base sm:text-lg md:text-xl tv:text-2xl px-4 sm:px-6 tv:px-8 py-2 sm:py-3 tv:py-4 rounded-lg focus:outline-none focus:ring-4 focus:ring-primary-600/50 focus:bg-glass-hover glass-panel min-h-[48px] tv:min-h-[56px]"
                  tabIndex={0}
                  data-focusable
                >
                  Connexion
                </a>
                <a
                  href="/register"
                  className="bg-primary hover:bg-primary-700 text-white px-4 sm:px-6 md:px-8 tv:px-12 py-2 sm:py-3 md:py-4 tv:py-5 rounded-lg text-base sm:text-lg md:text-xl tv:text-2xl font-semibold transition-all duration-300 focus:outline-none focus:ring-4 focus:ring-primary-600/50 shadow-primary min-h-[48px] tv:min-h-[56px]"
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
