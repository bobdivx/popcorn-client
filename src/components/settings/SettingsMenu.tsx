import {
  Monitor,
  Palette,
  LayoutGrid,
  Globe,
  UserCircle,
  Play,
  Library,
  Wrench,
} from 'lucide-preact';
import SystemSubMenuPanel from './SystemSubMenuPanel';
import MaintenanceSubMenuPanel from './MaintenanceSubMenuPanel';
import InterfaceSubMenuPanel from './InterfaceSubMenuPanel';
import ContentSubMenuPanel from './ContentSubMenuPanel';
import LibrarySubMenuPanel from './LibrarySubMenuPanel';
import DiscoverySubMenuPanel from './DiscoverySubMenuPanel';
import AccountSubMenuPanel from './AccountSubMenuPanel';
import PlaybackSettingsPanel from './PlaybackSettingsPanel';
import { useI18n } from '../../lib/i18n/useI18n';
import { useState, useMemo, useEffect } from 'preact/hooks';
import type { ComponentType } from 'preact';
import { canAccess } from '../../lib/permissions';

type CategoryId = 'system' | 'interface' | 'content' | 'library' | 'discovery' | 'account' | 'playback' | 'maintenance';

interface SettingsItem {
  id: string;
  titleKey: string;
  descriptionKey: string;
  href: string;
  hrefFn?: () => string;
  icon: any;
  permission?: string;
  isExternal?: boolean;
}

interface CategoryDef {
  id: CategoryId;
  labelKey: string;
  icon: any;
  items: SettingsItem[];
  /** Composant à afficher à la place de la liste d'items (ex: paramètres éditables directement) */
  inlineContent?: ComponentType;
  /** Permission requise pour afficher la catégorie (une seule) */
  inlinePermission?: string;
  /** OU: visibles si l'utilisateur a au moins une de ces permissions */
  inlinePermissions?: string[];
}

const CATEGORY_ICONS: Record<CategoryId, any> = {
  system: Monitor,
  interface: Palette,
  content: LayoutGrid,
  library: Library,
  discovery: Globe,
  account: UserCircle,
  playback: Play,
  maintenance: Wrench,
};

const VALID_CATEGORIES: CategoryId[] = ['system', 'interface', 'content', 'library', 'discovery', 'account', 'playback', 'maintenance'];

function getInitialCategory(): CategoryId {
  if (typeof window === 'undefined') return 'system';
  const params = new URLSearchParams(window.location.search);
  const cat = params.get('category');
  if (cat && VALID_CATEGORIES.includes(cat as CategoryId)) return cat as CategoryId;
  return 'system';
}

export default function SettingsMenu() {
  const { t } = useI18n();
  const [selectedCategory, setSelectedCategory] = useState<CategoryId>(getInitialCategory);

  const categories: CategoryDef[] = useMemo(() => {
    const list: CategoryDef[] = [
      {
        id: 'system',
        labelKey: 'settingsMenu.category.system',
        icon: CATEGORY_ICONS.system,
        items: [],
        inlineContent: SystemSubMenuPanel,
        inlinePermission: 'settings.server',
      },
      {
        id: 'maintenance',
        labelKey: 'settingsMenu.category.maintenance',
        icon: CATEGORY_ICONS.maintenance,
        items: [],
        inlineContent: MaintenanceSubMenuPanel,
        inlinePermission: 'settings.server',
      },
      {
        id: 'interface',
        labelKey: 'settingsMenu.category.interface',
        icon: CATEGORY_ICONS.interface,
        items: [],
        inlineContent: InterfaceSubMenuPanel,
        inlinePermission: 'settings.ui_preferences',
      },
      {
        id: 'playback',
        labelKey: 'settingsMenu.category.playback',
        icon: CATEGORY_ICONS.playback,
        items: [],
        inlineContent: PlaybackSettingsPanel,
        inlinePermission: 'settings.ui_preferences',
      },
      {
        id: 'content',
        labelKey: 'settingsMenu.category.content',
        icon: CATEGORY_ICONS.content,
        items: [],
        inlineContent: ContentSubMenuPanel,
        inlinePermissions: ['settings.indexers', 'settings.sync', 'settings.server'],
      },
      {
        id: 'library',
        labelKey: 'settingsMenu.category.library',
        icon: CATEGORY_ICONS.library,
        items: [],
        inlineContent: LibrarySubMenuPanel,
        inlinePermissions: ['settings.server', 'settings.friends'],
      },
      {
        id: 'discovery',
        labelKey: 'settingsMenu.category.discovery',
        icon: CATEGORY_ICONS.discovery,
        items: [],
        inlineContent: DiscoverySubMenuPanel,
        inlinePermission: 'settings.server',
      },
      {
        id: 'account',
        labelKey: 'settingsMenu.category.account',
        icon: CATEGORY_ICONS.account,
        items: [],
        inlineContent: AccountSubMenuPanel,
        inlinePermission: 'settings.account',
      },
    ];
    return list;
  }, []);

  const visibleCategories = useMemo(() => {
    return categories.filter((cat) => {
      if (cat.inlineContent) {
        if (cat.inlinePermissions?.length) {
          return cat.inlinePermissions.some((p) => canAccess(p as any));
        }
        if (cat.inlinePermission) {
          return canAccess(cat.inlinePermission as any);
        }
      }
      const visibleItems = cat.items.filter((item) =>
        item.permission ? canAccess(item.permission as any) : true
      );
      return visibleItems.length > 0;
    });
  }, [categories]);

  const currentCategory = visibleCategories.find((c) => c.id === selectedCategory) ?? visibleCategories[0];
  const currentItems = useMemo(() => {
    if (!currentCategory) return [];
    return currentCategory.items.filter((item) =>
      item.permission ? canAccess(item.permission as any) : true
    );
  }, [currentCategory]);

  // Lire ?category= depuis l'URL au montage (ex: lien depuis Compte)
  useEffect(() => {
    const init = getInitialCategory();
    if (init !== selectedCategory) setSelectedCategory(init);
  }, []);

  // Initialiser ou corriger la catégorie sélectionnée si elle n'est plus visible
  useEffect(() => {
    const firstId = visibleCategories[0]?.id;
    if (!firstId) return;
    const isCurrentVisible = visibleCategories.some((c) => c.id === selectedCategory);
    if (!isCurrentVisible) {
      setSelectedCategory(firstId);
    }
  }, [visibleCategories, selectedCategory]);

  return (
    <div
      className="settings-android-tv flex flex-col lg:flex-row min-h-[70vh] bg-[#1a1c20] rounded-2xl overflow-hidden border border-white/5"
      data-tv-settings-container
    >
      {/* Panneau gauche : menu principal (catégories) */}
      <nav
        className="settings-nav flex-shrink-0 w-full lg:w-72 xl:w-80 border-b lg:border-b-0 lg:border-r border-white/10 bg-[#16181c]"
        aria-label={t('settingsMenu.title')}
        data-tv-settings-nav
      >
        <div className="px-4 pt-6 pb-2">
          <h1 className="text-xl lg:text-2xl font-semibold text-white tracking-tight">
            {t('settingsMenu.title')}
          </h1>
          <p className="text-xs text-gray-500 mt-1 hidden sm:block">
            {t('settingsMenu.subtitle')}
          </p>
        </div>
        <ul className="py-2 px-2 space-y-0.5 scrollbar-hide overflow-y-auto max-h-[50vh] lg:max-h-none lg:min-h-0">
          {visibleCategories.map((cat) => {
            const Icon = cat.icon;
            const isSelected = cat.id === selectedCategory;
            return (
              <li key={cat.id}>
                <button
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  data-settings-category
                  data-focusable
                  className={`settings-nav-item w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-[#16181c] min-h-[48px] tv:min-h-[56px] ${
                    isSelected
                      ? 'bg-white/15 text-white'
                      : 'text-gray-300 hover:bg-white/10 hover:text-white'
                  }`}
                  tabIndex={0}
                  aria-current={isSelected ? 'true' : undefined}
                  aria-label={t(cat.labelKey)}
                >
                  <Icon
                    className={`w-6 h-6 tv:w-7 tv:h-7 flex-shrink-0 ${
                      isSelected ? 'text-white' : 'text-gray-400'
                    }`}
                    aria-hidden
                  />
                  <span className="font-medium truncate">{t(cat.labelKey)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Panneau droit : sous-menu (éléments de la catégorie) */}
      <div className="settings-content flex-1 flex flex-col min-w-0 bg-[#1a1c20]">
        {currentCategory && (
          <>
            <div className="flex-shrink-0 px-6 pt-6 pb-2 border-b border-white/10">
              <p className="text-xs font-medium text-primary-400 uppercase tracking-wider">
                {t('settingsMenu.title')}
              </p>
              <h2 className="text-xl lg:text-2xl font-semibold text-white mt-1">
                {t(currentCategory.labelKey)}
              </h2>
            </div>
            {currentCategory.inlineContent ? (
              (() => {
                const InlineComponent = currentCategory.inlineContent!;
                return <InlineComponent />;
              })()
            ) : (
            <ul
              className="flex-1 py-4 px-4 sm:px-6 space-y-0.5 overflow-y-auto scrollbar-visible"
              role="list"
            >
              {currentItems.map((item) => {
                const Icon = item.icon;
                const href = item.hrefFn ? item.hrefFn() : item.href;
                const externalProps = item.isExternal
                  ? { target: '_blank' as const, rel: 'noopener noreferrer' }
                  : {};
                return (
                  <li key={item.id}>
                    <a
                      href={href}
                      {...externalProps}
                      data-settings-item
                      data-focusable
                      className="settings-content-item group flex items-center gap-4 px-4 py-3 rounded-xl text-white transition-all duration-200 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-[#1a1c20] focus:bg-white/10 min-h-[56px] tv:min-h-[64px]"
                      tabIndex={0}
                    >
                      <div className="flex-shrink-0 w-10 h-10 tv:w-12 tv:h-12 rounded-lg bg-white/10 flex items-center justify-center group-hover:bg-white/15 transition-colors">
                        <Icon className="w-5 h-5 tv:w-6 tv:h-6 text-gray-300 group-hover:text-white" aria-hidden />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="block font-medium text-white truncate">
                          {t(item.titleKey)}
                        </span>
                        <span className="block text-sm text-gray-400 truncate mt-0.5">
                          {t(item.descriptionKey)}
                        </span>
                      </div>
                      <svg
                        className="w-5 h-5 text-gray-500 flex-shrink-0 group-hover:translate-x-1 transition-transform"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </a>
                  </li>
                );
              })}
            </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
