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
import { useState, useMemo, useEffect, useRef } from 'preact/hooks';
import type { ComponentType } from 'preact';
import { canAccess } from '../../lib/permissions';

const FOCUSABLE_IN_CONTENT =
  'a[href]:not([disabled]), button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [data-focusable]';

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

  const containerRef = useRef<HTMLDivElement>(null);

  // Télécommande : Droite depuis le menu → panneau de droite ; Gauche depuis le panneau → menu
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const nav = el.querySelector<HTMLElement>('[data-tv-settings-nav]');
      const content = el.querySelector<HTMLElement>('[data-tv-settings-content]');
      if (!nav || !content) return;
      const active = document.activeElement as HTMLElement;
      if (e.key === 'ArrowRight' && nav.contains(active)) {
        const first = content.querySelector<HTMLElement>(FOCUSABLE_IN_CONTENT);
        if (first) {
          first.focus();
          first.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          e.preventDefault();
          e.stopPropagation();
        }
      }
      if (e.key === 'ArrowLeft' && content.contains(active)) {
        const currentBtn =
          nav.querySelector<HTMLElement>('[data-settings-category][aria-current="true"]') ||
          nav.querySelector<HTMLElement>('[data-settings-category]');
        if (currentBtn) {
          currentBtn.focus();
          e.preventDefault();
          e.stopPropagation();
        }
      }
    };
    el.addEventListener('keydown', onKey, true);
    return () => el.removeEventListener('keydown', onKey, true);
  }, []);

  return (
    <div
      ref={containerRef}
      className="settings-android-tv flex flex-col lg:flex-row min-h-[70vh] ds-card overflow-hidden"
      data-tv-settings-container
    >
      {/* Panneau gauche : menu (style Learning Dashboard, accent violet pour sélection) */}
      <nav
        className="settings-nav flex-shrink-0 w-full lg:w-72 xl:w-80 border-b lg:border-b-0 lg:border-r border-[var(--ds-border)] bg-[var(--ds-surface-elevated)]"
        aria-label={t('settingsMenu.title')}
        data-tv-settings-nav
      >
        <div className="px-4 pt-6 pb-2 min-w-0">
          <h1 className="ds-title-page truncate">
            {t('settingsMenu.title')}
          </h1>
          <p className="ds-text-secondary text-xs mt-1 hidden sm:block">
            {t('settingsMenu.subtitle')}
          </p>
        </div>
        <ul className="py-2 px-2 space-y-1 scrollbar-hide overflow-y-auto max-h-[50vh] lg:max-h-none lg:min-h-0">
          {visibleCategories.map((cat) => {
            const Icon = cat.icon;
            const isSelected = cat.id === selectedCategory;
            return (
              <li key={cat.id}>
                <button
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  onFocus={(e) => {
                    setSelectedCategory(cat.id);
                    (e.currentTarget as HTMLElement).scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                  }}
                  data-settings-category
                  data-focusable
                  className={`settings-nav-item w-full flex items-center gap-3 px-3 sm:px-4 py-3 rounded-2xl text-left transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)] focus:ring-offset-2 focus:ring-offset-[var(--ds-surface-elevated)] min-h-[48px] tv:min-h-[56px] min-w-0 ${
                    isSelected
                      ? 'bg-[var(--ds-accent-violet)] text-[var(--ds-text-on-accent)]'
                      : 'text-[var(--ds-text-secondary)] hover:bg-white/10 hover:text-[var(--ds-text-primary)]'
                  }`}
                  tabIndex={0}
                  aria-current={isSelected ? 'true' : undefined}
                  aria-label={t(cat.labelKey)}
                >
                  <Icon
                    className={`w-6 h-6 tv:w-7 tv:h-7 flex-shrink-0 ${
                      isSelected ? 'opacity-100' : 'opacity-80'
                    }`}
                    aria-hidden
                  />
                  <span className="font-semibold truncate min-w-0">{t(cat.labelKey)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Panneau droit : contenu (cartes 32px, titres design system) */}
      <div
        className="settings-content flex-1 flex flex-col min-w-0 bg-[var(--ds-surface-elevated)]"
        data-tv-settings-content
      >
        {currentCategory && (
          <>
            <div className="flex-shrink-0 px-4 sm:px-6 pt-4 sm:pt-6 pb-2 border-b border-[var(--ds-border)] min-w-0">
              <p className="ds-text-tertiary text-xs font-medium uppercase tracking-wider hidden sm:block">
                {t('settingsMenu.title')}
              </p>
              <h2 className="ds-title-page truncate mt-0 sm:mt-1">
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
              className="flex-1 py-4 px-4 sm:px-6 space-y-1 overflow-y-auto scrollbar-visible"
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
                      className="settings-content-item group flex items-center gap-4 px-4 py-3 rounded-2xl text-[var(--ds-text-primary)] transition-all duration-200 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)] focus:ring-offset-2 focus:ring-offset-[var(--ds-surface-elevated)] focus:bg-white/10 min-h-[56px] tv:min-h-[64px]"
                      tabIndex={0}
                    >
                      <div className="flex-shrink-0 w-10 h-10 tv:w-12 tv:h-12 rounded-xl bg-white/10 flex items-center justify-center group-hover:bg-white/15 transition-colors">
                        <Icon className="w-5 h-5 tv:w-6 tv:h-6 text-[var(--ds-text-secondary)] group-hover:text-[var(--ds-text-primary)]" aria-hidden />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="block font-semibold truncate">
                          {t(item.titleKey)}
                        </span>
                        <span className="block text-sm text-[var(--ds-text-secondary)] truncate mt-0.5">
                          {t(item.descriptionKey)}
                        </span>
                      </div>
                      <svg
                        className="w-5 h-5 text-[var(--ds-text-tertiary)] flex-shrink-0 group-hover:translate-x-1 transition-transform"
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
