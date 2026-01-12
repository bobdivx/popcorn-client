import { useState, useEffect } from 'preact/hooks';
import { X, Home, Library, Search, Download, Settings, Menu } from 'lucide-preact';
import { serverApi } from '../../lib/client/server-api';

export default function Sidebar() {
  const [isOpen, setIsOpen] = useState(false);
  const [currentPath, setCurrentPath] = useState('');
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const updatePath = () => {
      setCurrentPath(window.location.pathname + window.location.search);
    };
    updatePath();
    
    window.addEventListener('popstate', updatePath);
    
    // Charger les informations utilisateur
    loadUser();
    
    return () => {
      window.removeEventListener('popstate', updatePath);
    };
  }, []);

  // Détecter si on est sur TV/Desktop pour afficher la sidebar par défaut
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isTV = window.matchMedia('(min-width: 1920px)').matches;
      const isDesktop = window.matchMedia('(min-width: 1024px)').matches && !window.matchMedia('(pointer: coarse)').matches;
      
      if (isTV || isDesktop) {
        setIsOpen(true);
      }
    }
  }, []);

  const loadUser = async () => {
    if (!serverApi.isAuthenticated()) {
      setLoading(false);
      return;
    }

    try {
      const response = await serverApi.getMe();
      if (response.success && response.data) {
        setUser(response.data);
      }
    } catch (error) {
      // Ignorer silencieusement les erreurs d'authentification
    } finally {
      setLoading(false);
    }
  };

  const isActive = (path: string) => currentPath === path;

  const navigationItems = [
    { href: '/dashboard', label: 'Torrents', icon: Home, paths: ['/dashboard', '/torrents', '/films', '/series'] },
    { href: '/library', label: 'Library', icon: Library, paths: ['/library'] },
    { href: '/search', label: 'Search', icon: Search, paths: ['/search'] },
    { href: '/downloads', label: 'Transfers', icon: Download, paths: ['/downloads'] },
    { href: '/settings', label: 'Settings', icon: Settings, paths: ['/settings'] },
  ];

  if (loading || !user) {
    return null;
  }

  return (
    <>
      {/* Bouton toggle pour mobile */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed top-20 left-4 z-40 lg:hidden p-3 glass-panel rounded-lg text-white hover:bg-glass-hover transition-all duration-300 focus:outline-none focus:ring-4 focus:ring-primary-600 focus:ring-opacity-50 min-h-[48px] min-w-[48px] ${
          isOpen ? 'rotate-90' : ''
        }`}
        aria-label="Toggle sidebar"
        tabIndex={0}
        data-focusable
      >
        <Menu className="w-6 h-6" size={24} />
      </button>

      {/* Overlay pour mobile */}
      <div
        className={`fixed inset-0 bg-black/80 backdrop-blur-sm z-[45] transition-opacity duration-300 lg:hidden ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setIsOpen(false)}
        aria-hidden="true"
      />

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-screen w-80 max-w-[85vw] z-50 transform transition-transform duration-300 ease-out glass-panel-lg border-r border-white/10 ${
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
        role="navigation"
        aria-label="Navigation latérale"
      >
        <div className="flex flex-col h-full">
          {/* Header avec artwork en arrière-plan */}
          <div className="relative p-6 border-b border-white/10 flex-shrink-0 overflow-hidden">
            {/* Artwork en arrière-plan avec blur */}
            <div 
              className="absolute inset-0 opacity-20"
              style={{
                backgroundImage: 'url(/popcorn_logo.png)',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                filter: 'blur(40px)',
              }}
            />
            <div className="relative z-10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img 
                  src="/popcorn_logo.png" 
                  alt="Popcorn" 
                  className="w-10 h-10 object-contain"
                />
                <span className="text-white font-bold text-xl">Popcorn</span>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="lg:hidden p-2 text-white hover:bg-glass-hover rounded-lg transition-colors focus:outline-none focus:ring-4 focus:ring-primary-600 focus:ring-opacity-50 min-h-[48px] min-w-[48px]"
                aria-label="Fermer la sidebar"
                tabIndex={0}
                data-focusable
              >
                <X className="w-5 h-5" size={20} />
              </button>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto overflow-x-hidden py-4 px-4 min-h-0" data-focusable-container>
            <ul className="space-y-2">
              {navigationItems.map((item) => {
                const Icon = item.icon;
                const active = item.paths.some(path => isActive(path));
                
                return (
                  <li key={item.href}>
                    <a
                      href={item.href}
                      className={`flex items-center gap-4 px-4 py-3 text-white transition-all duration-300 rounded-lg min-h-[48px] tv:min-h-[56px] focus:outline-none focus:ring-4 focus:ring-primary-600 focus:ring-opacity-50 ${
                        active
                          ? 'bg-primary shadow-primary-lg text-white font-semibold'
                          : 'hover:bg-glass-hover text-gray-300 hover:text-white'
                      }`}
                      tabIndex={0}
                      data-focusable
                    >
                      <Icon className="w-5 h-5 tv:w-6 tv:h-6 flex-shrink-0" size={24} />
                      <span className="text-base tv:text-lg font-medium">{item.label}</span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Footer avec profil utilisateur */}
          <div className="border-t border-white/10 p-4 flex-shrink-0 glass-panel">
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="w-10 h-10 tv:w-12 tv:h-12 rounded-lg bg-primary text-white flex items-center justify-center font-bold text-sm tv:text-base shadow-primary flex-shrink-0">
                {user.email ? user.email.charAt(0).toUpperCase() : 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-sm tv:text-base truncate">
                  {user.email || 'Utilisateur'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}