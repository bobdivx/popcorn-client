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
    <nav className={`fixed top-0 left-0 right-0 w-full z-50 transition-all duration-300 glass-panel border-b border-white/10 ${
      isScrolled ? 'bg-glass-active' : 'bg-glass'
    }`}>
      <div className="w-full px-4 sm:px-6 md:px-8 lg:px-12 xl:px-16 tv:px-24">
        <div className="flex items-center justify-between h-16 sm:h-18 md:h-20 lg:h-24 tv:h-28">
          {/* Logo à gauche */}
          <div className="flex items-center flex-shrink-0">
            <a 
              href="/dashboard" 
              className="flex items-center gap-2 sm:gap-3 hover:opacity-80 transition-opacity focus:outline-none focus:ring-4 focus:ring-primary-600 focus:ring-opacity-50 focus:ring-offset-2 focus:ring-offset-black rounded-lg py-1 tv:py-2"
              tabIndex={0}
              data-focusable
            >
              <img 
                src="/popcorn_logo.png" 
                alt="Popcorn Client" 
                className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 tv:w-16 tv:h-16 object-contain"
                loading="eager"
              />
              <span className="hidden sm:inline text-xl sm:text-2xl md:text-3xl tv:text-4xl font-bold text-white">Popcorn</span>
            </a>
          </div>
          
          {/* Navigation principale au centre - Onglets horizontaux */}
          {user && (
            <nav 
              className="hidden md:flex items-center gap-2 lg:gap-3 xl:gap-4 tv:gap-6 flex-1 justify-center" 
              role="tablist" 
              aria-label="Navigation principale"
              data-focusable-container
            >
              <a 
                href="/dashboard" 
                className={`nav-tab text-base lg:text-lg xl:text-xl tv:text-2xl font-medium transition-all duration-300 hover:text-white focus:outline-none ${
                  isActive('/dashboard') || isActive('/torrents') || isActive('/films') || isActive('/series')
                    ? 'nav-tab-active text-white font-bold' 
                    : 'text-gray-300 hover:text-white'
                }`}
                role="tab"
                aria-selected={isActive('/dashboard') || isActive('/torrents') || isActive('/films') || isActive('/series')}
                tabIndex={0}
                data-focusable
              >
                Torrents
              </a>
              <a 
                href="/library" 
                className={`nav-tab text-base lg:text-lg xl:text-xl tv:text-2xl font-medium transition-all duration-300 hover:text-white focus:outline-none ${
                  isActive('/library') 
                    ? 'nav-tab-active text-white font-bold' 
                    : 'text-gray-300 hover:text-white'
                }`}
                role="tab"
                aria-selected={isActive('/library')}
                tabIndex={0}
                data-focusable
              >
                Library
              </a>
              <a 
                href="/search" 
                className={`nav-tab text-base lg:text-lg xl:text-xl tv:text-2xl font-medium transition-all duration-300 hover:text-white focus:outline-none ${
                  isActive('/search') 
                    ? 'nav-tab-active text-white font-bold' 
                    : 'text-gray-300 hover:text-white'
                }`}
                role="tab"
                aria-selected={isActive('/search')}
                tabIndex={0}
                data-focusable
              >
                Search
              </a>
              <a 
                href="/downloads" 
                className={`nav-tab text-base lg:text-lg xl:text-xl tv:text-2xl font-medium transition-all duration-300 hover:text-white focus:outline-none ${
                  isActive('/downloads') 
                    ? 'nav-tab-active text-white font-bold' 
                    : 'text-gray-300 hover:text-white'
                }`}
                role="tab"
                aria-selected={isActive('/downloads')}
                tabIndex={0}
                data-focusable
              >
                Transfers
              </a>
              <a 
                href="/settings" 
                className={`nav-tab text-base lg:text-lg xl:text-xl tv:text-2xl font-medium transition-all duration-300 hover:text-white focus:outline-none ${
                  isActive('/settings') 
                    ? 'nav-tab-active text-white font-bold' 
                    : 'text-gray-300 hover:text-white'
                }`}
                role="tab"
                aria-selected={isActive('/settings')}
                tabIndex={0}
                data-focusable
              >
                Settings
              </a>
            </nav>
          )}

          {/* Menu mobile hamburger */}
          {user && (
            <div className="md:hidden">
              <button
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="p-2 text-white hover:text-gray-300 transition-colors focus:outline-none focus:ring-4 focus:ring-primary-600 focus:ring-opacity-50 rounded min-h-[48px] min-w-[48px]"
                aria-label="Menu"
                aria-expanded={isMenuOpen}
                tabIndex={0}
                data-focusable
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
                      className="p-2 text-white hover:text-gray-300 transition-colors rounded focus:outline-none focus:ring-4 focus:ring-primary-600 focus:ring-opacity-50 min-h-[48px] min-w-[48px]"
                      aria-label="Fermer le menu"
                      tabIndex={0}
                      data-focusable
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
                          className={`flex items-center gap-3 px-4 py-3 text-white transition-colors hover:bg-glass-hover focus:outline-none focus:ring-4 focus:ring-primary-600 focus:ring-opacity-50 min-h-[48px] ${
                            isActive('/dashboard') || isActive('/torrents') || isActive('/films') || isActive('/series') 
                              ? 'bg-glass-active border-l-4 border-primary-600' : ''
                          }`}
                          tabIndex={0}
                          data-focusable
                        >
                          <span className="font-medium">Torrents</span>
                        </a>
                      </li>
                      <li>
                        <a
                          href="/library"
                          onClick={closeMenu}
                          className={`flex items-center gap-3 px-4 py-3 text-white transition-colors hover:bg-glass-hover focus:outline-none focus:ring-4 focus:ring-primary-600 focus:ring-opacity-50 min-h-[48px] ${
                            isActive('/library') ? 'bg-glass-active border-l-4 border-primary-600' : ''
                          }`}
                          tabIndex={0}
                          data-focusable
                        >
                          <span className="font-medium">Library</span>
                        </a>
                      </li>
                      <li>
                        <a
                          href="/search"
                          onClick={closeMenu}
                          className={`flex items-center gap-3 px-4 py-3 text-white transition-colors hover:bg-glass-hover focus:outline-none focus:ring-4 focus:ring-primary-600 focus:ring-opacity-50 min-h-[48px] ${
                            isActive('/search') ? 'bg-glass-active border-l-4 border-primary-600' : ''
                          }`}
                          tabIndex={0}
                          data-focusable
                        >
                          <span className="font-medium">Search</span>
                        </a>
                      </li>
                      <li>
                        <a
                          href="/downloads"
                          onClick={closeMenu}
                          className={`flex items-center gap-3 px-4 py-3 text-white transition-colors hover:bg-glass-hover focus:outline-none focus:ring-4 focus:ring-primary-600 focus:ring-opacity-50 min-h-[48px] ${
                            isActive('/downloads') ? 'bg-glass-active border-l-4 border-primary-600' : ''
                          }`}
                          tabIndex={0}
                          data-focusable
                        >
                          <span className="font-medium">Transfers</span>
                        </a>
                      </li>
                      <li>
                        <a
                          href="/settings"
                          onClick={closeMenu}
                          className={`flex items-center gap-3 px-4 py-3 text-white transition-colors hover:bg-glass-hover focus:outline-none focus:ring-4 focus:ring-primary-600 focus:ring-opacity-50 min-h-[48px] ${
                            isActive('/settings') ? 'bg-glass-active border-l-4 border-primary-600' : ''
                          }`}
                          tabIndex={0}
                          data-focusable
                        >
                          <span className="font-medium">Settings</span>
                        </a>
                      </li>
                    </ul>
                  </nav>

                  {/* Footer du menu */}
                  <div className="border-t border-gray-800 p-4 flex-shrink-0">
                    <button
                      onClick={handleLogout}
                      className="flex items-center gap-3 w-full px-4 py-3 text-primary-400 hover:bg-glass-hover transition-colors rounded focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-opacity-50"
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
                  className="w-9 h-9 sm:w-10 sm:h-10 md:w-12 md:h-12 tv:w-16 tv:h-16 rounded-lg bg-primary text-white flex items-center justify-center font-bold text-sm sm:text-base md:text-lg tv:text-xl hover:bg-primary-700 transition-all duration-300 cursor-pointer focus:outline-none focus:ring-4 focus:ring-primary-600 focus:ring-opacity-50 shadow-primary min-h-[36px] tv:min-h-[64px]"
                  data-focusable
                >
                  {user.email ? user.email.charAt(0).toUpperCase() : 'U'}
                </div>
                <ul
                  tabIndex={0}
                  className="menu menu-sm dropdown-content mt-3 z-[1] p-3 shadow-2xl glass-panel-lg rounded-xl w-64 border border-white/10"
                >
                  <li className="menu-title">
                    <span className="text-white font-bold text-lg">{user.email || 'Utilisateur'}</span>
                  </li>
                  <li>
                    <a href="/dashboard" className="text-white hover:bg-glass-hover text-base py-3 px-4 rounded-lg transition-colors">
                      Tableau de bord
                    </a>
                  </li>
                  <li>
                    <a href="/settings" className="text-white hover:bg-glass-hover text-base py-3 px-4 rounded-lg transition-colors">
                      Paramètres
                    </a>
                  </li>
                  <li>
                    <a href="/installation" className="text-white hover:bg-glass-hover text-base py-3 px-4 rounded-lg transition-colors">
                      Installation
                    </a>
                  </li>
                  <li><hr className="my-2 border-white/10" /></li>
                  <li>
                    <a onClick={handleLogout} className="text-primary-400 hover:bg-glass-hover text-base py-3 px-4 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-opacity-50">
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
                className="text-white hover:text-gray-300 transition-all duration-300 text-base sm:text-lg md:text-xl tv:text-2xl px-4 sm:px-6 tv:px-8 py-2 sm:py-3 tv:py-4 rounded-lg focus:outline-none focus:ring-4 focus:ring-primary-600 focus:ring-opacity-50 focus:bg-glass-hover glass-panel min-h-[48px] tv:min-h-[56px]"
                tabIndex={0}
                data-focusable
              >
                Connexion
              </a>
              <a 
                href="/register" 
                className="bg-primary hover:bg-primary-700 text-white px-4 sm:px-6 md:px-8 tv:px-12 py-2 sm:py-3 md:py-4 tv:py-5 rounded-lg text-base sm:text-lg md:text-xl tv:text-2xl font-semibold transition-all duration-300 focus:outline-none focus:ring-4 focus:ring-primary-600 focus:ring-opacity-50 shadow-primary min-h-[48px] tv:min-h-[56px]"
                tabIndex={0}
                data-focusable
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
