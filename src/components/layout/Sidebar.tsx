import { useState, useEffect } from 'preact/hooks';
import { X, Home, Download, Settings, Menu, Film, Tv } from 'lucide-preact';
import { serverApi } from '../../lib/client/server-api';
import { getLocalProfile, onProfileChanged } from '../../lib/client/profile';
import Avatar from '../ui/Avatar';
import { useI18n } from '../../lib/i18n/useI18n';
import { isTVPlatform } from '../../lib/utils/device-detection';

export default function Sidebar() {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [isCompact, setIsCompact] = useState(false);
  const [isTV, setIsTV] = useState(false);
  const [currentPath, setCurrentPath] = useState('');
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(() => getLocalProfile());

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

  // Sync profil local (avatar / displayName)
  useEffect(() => {
    return onProfileChanged(() => setProfile(getLocalProfile()));
  }, []);

  // Détecter si on est sur TV/Desktop pour afficher la sidebar
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const tvMode = isTVPlatform();
      setIsTV(tvMode);
      
      const isDesktop = window.matchMedia('(min-width: 1024px)').matches && !window.matchMedia('(pointer: coarse)').matches;
      
      // Sur TV, la sidebar est TOUJOURS rendue, mais agit en mode Rail (compacte par défaut, s'ouvre au focus)
      if (tvMode || isDesktop) {
        setIsOpen(true);
      }
    }
  }, []);

  // Mode rail (icônes) : sur TV, « étendu » = barre ouverte ou page dashboard épinglée (labels visibles)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mq = window.matchMedia('(min-width: 1024px)');
    const apply = () => {
      if (isTVPlatform()) {
        const open = document.documentElement.getAttribute('data-tv-sidebar-open') === 'true';
        const pin = document.documentElement.getAttribute('data-tv-dashboard-pin') === 'true';
        setIsCompact(!(open || pin));
      } else {
        setIsCompact(mq.matches);
      }
    };
    apply();

    mq.addEventListener?.('change', apply as any);
    if (isTVPlatform()) {
      const obs = new MutationObserver(apply);
      obs.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-tv-sidebar-open', 'data-tv-dashboard-pin'],
      });
      window.addEventListener('popstate', apply);
      document.addEventListener('astro:page-load', apply);
      return () => {
        mq.removeEventListener?.('change', apply as any);
        obs.disconnect();
        window.removeEventListener('popstate', apply);
        document.removeEventListener('astro:page-load', apply);
      };
    }
    return () => mq.removeEventListener?.('change', apply as any);
  }, []);

  // Permet au header de déclencher l’ouverture/fermeture (mobile)
  useEffect(() => {
    const handler = () => setIsOpen((v) => !v);
    window.addEventListener('sidebar-toggle', handler as EventListener);
    return () => window.removeEventListener('sidebar-toggle', handler as EventListener);
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
    { href: '/dashboard', label: t('nav.home'), icon: Home, paths: ['/dashboard', '/torrents', '/films', '/series'] },
    { href: '/films', label: t('nav.films'), icon: Film, paths: ['/films'] },
    { href: '/series', label: t('nav.series'), icon: Tv, paths: ['/series'] },
    { href: '/downloads', label: t('nav.downloads'), icon: Download, paths: ['/downloads'] },
    { href: '/settings', label: t('nav.settings'), icon: Settings, paths: ['/settings'] },
  ];

  if (loading || !user) {
    return null;
  }

  // Ne pas afficher la sidebar sur mobile/desktop classique si on veut l'exclusivité TV (A ajuster selon vos besoins)
  // Pour le moment, on force son affichage sur TV, et on la cache si ce n'est pas TV pour ne pas casser le site existant.
  if (!isTV && typeof window !== 'undefined') {
    return null;
  }

  return (
    <>
      {/* Bouton toggle pour mobile (fallback si besoin) */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed top-20 left-4 z-40 lg:hidden p-3 glass-panel backdrop-blur-sm rounded-lg text-white border border-white/15 hover:bg-white/10 transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 min-h-[48px] min-w-[48px] transform hover:scale-105 ${
          isOpen ? 'rotate-90 bg-white/15 ring-1 ring-white/25' : ''
        }`}
        aria-label="Toggle sidebar"
        tabIndex={0}
        data-focusable
      >
        <Menu className={`w-6 h-6 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} size={24} />
      </button>

      {/* Overlay pour mobile - Amélioré */}
      <div
        className={`fixed inset-0 bg-black/80 backdrop-blur-md z-[45] transition-all duration-300 lg:hidden ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setIsOpen(false)}
        aria-hidden="true"
      />

      {/* Sidebar - Mode TV (Rail extensible au focus) */}
      <aside
        data-tv-app-sidebar
        className={`fixed top-0 left-0 h-screen z-50 transform glass-panel-lg backdrop-blur-md border-r border-white/15 shadow-2xl sidebar-tv-rail ${
          isTV ? '' : 'transition-all duration-300 ease-out'
        } ${
          isTV ? 'w-80 max-w-[85vw]' : isCompact ? 'w-20 lg:w-24' : 'w-80 max-w-[85vw]'
        } ${
          isTV
            ? 'opacity-100'
            : isOpen
              ? 'translate-x-0 opacity-100'
              : '-translate-x-full lg:translate-x-0 opacity-0 lg:opacity-100'
        }`}
        role="navigation"
        aria-label={t('nav.sideNavigation')}
      >
        <div className="flex flex-col h-full relative">
          {/* Spacer : sur TV la navbar est masquée — moins de marge pour libérer la zone de focus */}
          <div className="flex-shrink-0 pt-16 md:pt-20 lg:pt-24 tv:pt-6" />

          {/* Bouton fermer (mobile drawer) */}
          <button
            onClick={() => setIsOpen(false)}
            className="lg:hidden absolute top-4 right-4 p-2 text-white glass-panel backdrop-blur-sm border border-white/15 hover:bg-white/10 rounded-lg transition-all duration-200 hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 min-h-[48px] min-w-[48px]"
            aria-label={t('common.close')}
            tabIndex={0}
            data-focusable
          >
            <X className="w-5 h-5 transition-transform duration-200 hover:rotate-90" size={20} />
          </button>

          {/* Navigation */}
          <nav
            className={`flex-1 overflow-y-auto overflow-x-hidden min-h-0 ${isCompact ? 'py-4 px-2' : 'py-4 px-4'}`}
            data-focusable-container
          >
            <ul className={isCompact ? 'space-y-3 flex flex-col items-center' : 'space-y-2'}>
              {navigationItems.map((item) => {
                const Icon = item.icon;
                const active = item.paths.some(path => isActive(path));
                
                return (
                  <li key={item.href}>
                    <a
                      href={item.href}
                      aria-label={item.label}
                      data-tip={item.label}
                      className={`${
                        isCompact ? 'tooltip tooltip-right' : ''
                      } flex items-center ${
                        isCompact ? 'justify-center w-14 h-14 tv:w-16 tv:h-16 px-0 py-0' : 'gap-4 px-4 py-3 min-h-[48px] tv:min-h-[56px]'
                      } transition-all duration-200 rounded-xl border focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-0 focus-visible:ring-offset-transparent transform ${
                        active
                          ? 'glass-panel backdrop-blur-sm border-white/25 bg-white/12 text-white font-semibold shadow-none'
                          : 'border-transparent text-white/75 hover:text-white hover:bg-white/10 hover:border-white/15'
                      }`}
                      tabIndex={0}
                      data-focusable
                    >
                      <Icon className={`w-6 h-6 tv:w-7 tv:h-7 flex-shrink-0 transition-transform duration-200 ${
                        active ? 'text-white' : 'text-white/80'
                      }`} size={24} />
                      <span className={`sidebar-label text-base tv:text-lg font-medium transition-all duration-200 ${
                        active ? 'font-bold' : 'font-medium'
                      } ${isCompact ? 'hidden' : 'block'}`}>
                        {item.label}
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Footer avec profil utilisateur */}
          <div className="sidebar-tv-footer border-t border-white/15 p-4 flex-shrink-0 bg-white/[0.06] backdrop-blur-md">
            <div className={`flex items-center ${isCompact ? 'justify-center px-0' : 'gap-3 px-4'} py-3`}>
              <Avatar
                email={user.email}
                displayName={profile.displayName}
                profile={profile}
                sizeClassName="w-10 h-10 tv:w-12 tv:h-12"
                className="flex-shrink-0"
              />
              <div className={`flex-1 min-w-0 sidebar-label ${isCompact ? 'hidden' : 'block'}`}>
                <p className="text-white font-semibold text-sm tv:text-base truncate" title={profile.displayName || user.email || t('account.defaultName')}>
                  {profile.displayName || user.email || t('account.defaultName')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}