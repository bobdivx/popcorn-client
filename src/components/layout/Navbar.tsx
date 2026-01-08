import { useState, useEffect } from 'preact/hooks';
import { serverApi } from '../../lib/client/server-api';

export default function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [currentPath, setCurrentPath] = useState('');
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const updatePath = () => {
      setCurrentPath(window.location.pathname + window.location.search);
    };
    updatePath();
    
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    
    window.addEventListener('scroll', handleScroll);
    window.addEventListener('popstate', updatePath);
    
    // Charger les informations utilisateur
    loadUser();
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('popstate', updatePath);
    };
  }, []);

  const loadUser = async () => {
    // Ne pas appeler getMe() si l'utilisateur n'est pas authentifié
    if (!serverApi.isAuthenticated()) {
      setLoading(false);
      return;
    }

    try {
      const response = await serverApi.getMe();
      if (response.success && response.data) {
        setUser(response.data);
      }
      // Les erreurs 401 sont normales si l'utilisateur n'est pas connecté, on ne les log pas
    } catch (error) {
      // Ignorer silencieusement les erreurs d'authentification
      if (error && typeof error === 'object' && 'error' in error && error.error !== 'Unauthorized') {
        console.error('Erreur lors du chargement de l\'utilisateur:', error);
      }
    } finally {
      setLoading(false);
    }
  };

  // Empêcher le scroll du body quand le menu est ouvert
  useEffect(() => {
    if (isMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMenuOpen]);

  const handleLogout = async () => {
    try {
      await serverApi.logout();
      window.location.href = '/login';
    } catch (error) {
      console.error('Erreur lors de la déconnexion:', error);
      window.location.href = '/login';
    }
  };

  const isActive = (path: string) => currentPath === path;

  const closeMenu = () => setIsMenuOpen(false);

  if (loading) {
    return null;
  }

  return (
    <nav className={`fixed top-0 left-0 right-0 w-full z-50 transition-all duration-300 ${
      isScrolled ? 'bg-black/80 backdrop-blur-md' : 'bg-black/40 backdrop-blur-sm'
    }`}>
      <div className="w-full px-4 sm:px-6 md:px-8 lg:px-12 xl:px-16">
        <div className="flex items-center justify-between h-16 sm:h-18 md:h-20 lg:h-24">
          {/* Logo à gauche */}
          <div className="flex items-center flex-shrink-0">
            <a 
              href="/dashboard" 
              className="flex items-center gap-2 sm:gap-3 hover:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-2 focus:ring-offset-black rounded-lg py-1"
            >
              <img 
                src="/popcorn_logo.png" 
                alt="Popcorn Client" 
                className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 object-contain"
                loading="eager"
              />
              <span className="hidden sm:inline text-xl sm:text-2xl md:text-3xl font-bold text-white">Popcorn</span>
            </a>
          </div>
          
          {/* Navigation principale au centre */}
          {user && (
            <nav 
              className="hidden md:flex items-center gap-4 lg:gap-6 xl:gap-8 flex-1 justify-center" 
              role="navigation" 
              aria-label="Navigation principale"
            >
              <a 
                href="/dashboard" 
                className={`text-base lg:text-lg xl:text-xl font-medium transition-all duration-300 hover:text-white focus:outline-none rounded-lg px-4 lg:px-6 py-2 lg:py-3 relative ${
                  isActive('/dashboard') 
                    ? 'text-white font-bold after:absolute after:bottom-0 after:left-0 after:right-0 after:h-1 after:bg-red-600 after:rounded-full' 
                    : 'text-gray-300 hover:text-white'
                } focus:ring-4 focus:ring-red-600 focus:ring-opacity-50 focus:bg-white/10`}
              >
                Accueil
              </a>
              <a 
                href="/films" 
                className={`text-base lg:text-lg xl:text-xl font-medium transition-all duration-300 hover:text-white focus:outline-none rounded-lg px-4 lg:px-6 py-2 lg:py-3 relative ${
                  isActive('/films') 
                    ? 'text-white font-bold after:absolute after:bottom-0 after:left-0 after:right-0 after:h-1 after:bg-red-600 after:rounded-full' 
                    : 'text-gray-300 hover:text-white'
                } focus:ring-4 focus:ring-red-600 focus:ring-opacity-50 focus:bg-white/10`}
              >
                Films
              </a>
              <a 
                href="/series" 
                className={`text-base lg:text-lg xl:text-xl font-medium transition-all duration-300 hover:text-white focus:outline-none rounded-lg px-4 lg:px-6 py-2 lg:py-3 relative ${
                  isActive('/series') 
                    ? 'text-white font-bold after:absolute after:bottom-0 after:left-0 after:right-0 after:h-1 after:bg-red-600 after:rounded-full' 
                    : 'text-gray-300 hover:text-white'
                } focus:ring-4 focus:ring-red-600 focus:ring-opacity-50 focus:bg-white/10`}
              >
                Séries
              </a>
              <a 
                href="/downloads" 
                className={`text-base lg:text-lg xl:text-xl font-medium transition-all duration-300 hover:text-white focus:outline-none rounded-lg px-4 lg:px-6 py-2 lg:py-3 relative ${
                  isActive('/downloads') 
                    ? 'text-white font-bold after:absolute after:bottom-0 after:left-0 after:right-0 after:h-1 after:bg-red-600 after:rounded-full' 
                    : 'text-gray-300 hover:text-white'
                } focus:ring-4 focus:ring-red-600 focus:ring-opacity-50 focus:bg-white/10`}
              >
                Téléchargements
              </a>
              <a 
                href="/settings" 
                className={`text-base lg:text-lg xl:text-xl font-medium transition-all duration-300 hover:text-white focus:outline-none rounded-lg px-4 lg:px-6 py-2 lg:py-3 relative ${
                  isActive('/settings') 
                    ? 'text-white font-bold after:absolute after:bottom-0 after:left-0 after:right-0 after:h-1 after:bg-red-600 after:rounded-full' 
                    : 'text-gray-300 hover:text-white'
                } focus:ring-4 focus:ring-red-600 focus:ring-opacity-50 focus:bg-white/10`}
              >
                Paramètres
              </a>
            </nav>
          )}

          {/* Menu mobile hamburger */}
          {user && (
            <div className="md:hidden">
              <button
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="p-2 text-white hover:text-gray-300 transition-colors focus:outline-none focus:ring-2 focus:ring-white/50 rounded"
                aria-label="Menu"
                aria-expanded={isMenuOpen}
              >
                {isMenuOpen ? (
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                )}
              </button>
            </div>
          )}

          {/* Menu mobile slide-in */}
          {user && (
            <>
              {/* Overlay */}
              <div
                className={`fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] transition-opacity duration-300 md:hidden ${
                  isMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
                }`}
                onClick={closeMenu}
                aria-hidden="true"
              />

              {/* Menu slide-in */}
              <div
                className={`fixed top-0 left-0 h-screen w-80 max-w-[85vw] bg-black z-[70] transform transition-transform duration-300 ease-out md:hidden overflow-hidden ${
                  isMenuOpen ? 'translate-x-0' : '-translate-x-full'
                }`}
                role="dialog"
                aria-modal="true"
                aria-label="Menu de navigation"
              >
                <div className="flex flex-col h-full max-h-screen">
                  {/* Header du menu */}
                  <div className="flex items-center justify-between p-4 border-b border-gray-800 flex-shrink-0">
                    <div className="flex items-center gap-2">
                      <img 
                        src="/popcorn_logo.png" 
                        alt="Popcorn" 
                        className="w-8 h-8 object-contain"
                      />
                      <span className="text-white font-bold text-lg">Menu</span>
                    </div>
                    <button
                      onClick={closeMenu}
                      className="p-2 text-white hover:text-gray-300 transition-colors rounded focus:outline-none focus:ring-2 focus:ring-white/50"
                      aria-label="Fermer le menu"
                    >
                      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  {/* Liste de navigation */}
                  <nav className="flex-1 overflow-y-auto overflow-x-hidden py-4 min-h-0">
                    <ul className="space-y-1">
                      <li>
                        <a
                          href="/dashboard"
                          onClick={closeMenu}
                          className={`flex items-center gap-3 px-4 py-3 text-white transition-colors hover:bg-gray-900 ${
                            isActive('/dashboard') ? 'bg-gray-900 border-l-4 border-red-600' : ''
                          }`}
                        >
                          <span className="font-medium">Accueil</span>
                        </a>
                      </li>
                      <li>
                        <a
                          href="/films"
                          onClick={closeMenu}
                          className={`flex items-center gap-3 px-4 py-3 text-white transition-colors hover:bg-gray-900 ${
                            isActive('/films') ? 'bg-gray-900 border-l-4 border-red-600' : ''
                          }`}
                        >
                          <span className="font-medium">Films</span>
                        </a>
                      </li>
                      <li>
                        <a
                          href="/series"
                          onClick={closeMenu}
                          className={`flex items-center gap-3 px-4 py-3 text-white transition-colors hover:bg-gray-900 ${
                            isActive('/series') ? 'bg-gray-900 border-l-4 border-red-600' : ''
                          }`}
                        >
                          <span className="font-medium">Séries</span>
                        </a>
                      </li>
                      <li>
                        <a
                          href="/downloads"
                          onClick={closeMenu}
                          className={`flex items-center gap-3 px-4 py-3 text-white transition-colors hover:bg-gray-900 ${
                            isActive('/downloads') ? 'bg-gray-900 border-l-4 border-red-600' : ''
                          }`}
                        >
                          <span className="font-medium">Téléchargements</span>
                        </a>
                      </li>
                      <li>
                        <a
                          href="/settings"
                          onClick={closeMenu}
                          className={`flex items-center gap-3 px-4 py-3 text-white transition-colors hover:bg-gray-900 ${
                            isActive('/settings') ? 'bg-gray-900 border-l-4 border-red-600' : ''
                          }`}
                        >
                          <span className="font-medium">Paramètres</span>
                        </a>
                      </li>
                    </ul>
                  </nav>

                  {/* Footer du menu */}
                  <div className="border-t border-gray-800 p-4 flex-shrink-0">
                    <button
                      onClick={handleLogout}
                      className="flex items-center gap-3 w-full px-4 py-3 text-red-500 hover:bg-gray-900 transition-colors rounded"
                    >
                      <span className="font-medium">Déconnexion</span>
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Profil utilisateur à droite */}
          {user && (
            <div className="flex items-center gap-3 sm:gap-4 md:gap-6 flex-shrink-0">
              <div className="dropdown dropdown-end">
                <div
                  tabIndex={0}
                  role="button"
                  className="w-9 h-9 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-lg bg-red-600 text-white flex items-center justify-center font-bold text-sm sm:text-base md:text-lg hover:bg-red-700 transition-all duration-300 cursor-pointer focus:outline-none focus:ring-4 focus:ring-red-600 focus:ring-opacity-50 shadow-lg"
                >
                  {user.email ? user.email.charAt(0).toUpperCase() : 'U'}
                </div>
                <ul
                  tabIndex={0}
                  className="menu menu-sm dropdown-content mt-3 z-[1] p-3 shadow-2xl bg-black/98 backdrop-blur-md rounded-xl w-64 border border-gray-800"
                >
                  <li className="menu-title">
                    <span className="text-white font-bold text-lg">{user.email || 'Utilisateur'}</span>
                  </li>
                  <li>
                    <a href="/dashboard" className="text-white hover:bg-gray-800 text-base py-3 px-4 rounded-lg transition-colors">
                      Tableau de bord
                    </a>
                  </li>
                  <li>
                    <a href="/settings" className="text-white hover:bg-gray-800 text-base py-3 px-4 rounded-lg transition-colors">
                      Paramètres
                    </a>
                  </li>
                  <li><hr className="my-2 border-gray-800" /></li>
                  <li>
                    <a onClick={handleLogout} className="text-red-500 hover:bg-gray-800 text-base py-3 px-4 rounded-lg transition-colors">
                      Déconnexion
                    </a>
                  </li>
                </ul>
              </div>
            </div>
          )}
          
          {!user && (
            <div className="flex gap-3 sm:gap-4">
              <a 
                href="/login" 
                className="text-white hover:text-gray-300 transition-all duration-300 text-base sm:text-lg md:text-xl px-4 sm:px-6 py-2 sm:py-3 rounded-lg focus:outline-none focus:ring-4 focus:ring-red-600 focus:ring-opacity-50 focus:bg-white/10"
              >
                Connexion
              </a>
              <a 
                href="/register" 
                className="bg-red-600 hover:bg-red-700 text-white px-4 sm:px-6 md:px-8 py-2 sm:py-3 md:py-4 rounded-lg text-base sm:text-lg md:text-xl font-semibold transition-all duration-300 focus:outline-none focus:ring-4 focus:ring-red-600 focus:ring-opacity-50 shadow-lg"
              >
                Inscription
              </a>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
