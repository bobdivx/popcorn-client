import { useState, useEffect, useRef } from 'preact/hooks';
import { useI18n } from '../../lib/i18n/useI18n';
import { ArrowRight, ChevronLeft } from 'lucide-preact';
import type { ComponentType } from 'preact';

export interface SubMenuItem {
  id: string;
  titleKey: string;
  /** Titre affiché tel quel (prioritaire sur titleKey si défini) */
  title?: string;
  descriptionKey: string;
  description?: string;
  icon: ComponentType<{ className?: string }>;
  permission?: string;
  href?: string;
  hrefFn?: () => string;
  isExternal?: boolean;
  inlineContent?: ComponentType<any>;
  /** Si true, le contenu est un sous-menu imbriqué qui gère son propre Retour ; on n'affiche pas le bouton parent */
  nestedSubMenu?: boolean;
}

interface SubMenuPanelProps {
  items: SubMenuItem[];
  visibleItems: SubMenuItem[];
  /** Callback pour revenir au niveau parent (utilisé par les sous-menus imbriqués) */
  onParentBack?: () => void;
}

export default function SubMenuPanel({ items, visibleItems, onParentBack }: SubMenuPanelProps) {
  const { t } = useI18n();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Permettre à la télécommande (Escape/Back) de revenir dans les sous-menus
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (selectedId === null) return;
    el.setAttribute('data-tv-back-handler', '');
    (el as any)._tvBack = () => setSelectedId(null);
    return () => {
      el.removeAttribute('data-tv-back-handler');
      delete (el as any)._tvBack;
    };
  }, [selectedId]);

  const selectedItem = selectedId ? visibleItems.find((i) => i.id === selectedId) : null;

  if (selectedItem?.inlineContent) {
    const ContentComponent = selectedItem.inlineContent!;
    const isNested = selectedItem.nestedSubMenu === true;
    const showBackButton = !isNested;
    const handleParentBack = () => setSelectedId(null);

    return (
      <div ref={containerRef} className="flex-1 flex flex-col py-4 px-4 sm:px-6 overflow-hidden">
        {showBackButton && (
          <button
            type="button"
            onClick={handleParentBack}
            data-focusable
            tabIndex={0}
            className="flex items-center gap-2 text-gray-400 hover:text-white mb-4 text-sm font-medium tv:min-h-[48px] tv:py-2"
          >
            <ChevronLeft className="w-4 h-4" />
            {t('common.back')}
          </button>
        )}
        <div className="flex-1 overflow-y-auto scrollbar-visible">
          {isNested ? (
            <ContentComponent onParentBack={handleParentBack} />
          ) : (
            <ContentComponent onBack={handleParentBack} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 py-4 px-4 sm:px-6 overflow-y-auto scrollbar-visible">
      {onParentBack && (
        <button
          type="button"
          onClick={onParentBack}
          data-focusable
          tabIndex={0}
          className="flex items-center gap-2 text-gray-400 hover:text-white mb-4 text-sm font-medium tv:min-h-[48px] tv:py-2"
        >
          <ChevronLeft className="w-4 h-4" />
          {t('common.back')}
        </button>
      )}
      <ul className="space-y-0.5" role="list">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const href = item.hrefFn ? item.hrefFn() : item.href;
          const isLink = !!href;
          const externalProps = item.isExternal
            ? { target: '_blank' as const, rel: 'noopener noreferrer' }
            : {};

          if (isLink) {
            return (
              <li key={item.id}>
                <a
                  href={href}
                  {...externalProps}
                  data-focusable
                  className="settings-content-item group flex items-center gap-4 px-4 py-3 rounded-xl text-white transition-all duration-200 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-[#1a1c20] focus:bg-white/10 min-h-[56px] tv:min-h-[64px]"
                  tabIndex={0}
                >
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center group-hover:bg-white/15 transition-colors">
                    <Icon className="w-5 h-5 text-gray-300 group-hover:text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="block font-medium text-white truncate">{item.title ?? t(item.titleKey)}</span>
                    <span className="block text-sm text-gray-400 truncate mt-0.5">
                      {item.description ?? t(item.descriptionKey)}
                    </span>
                  </div>
                  <ArrowRight className="w-5 h-5 text-gray-500 flex-shrink-0 group-hover:translate-x-1 transition-transform" />
                </a>
              </li>
            );
          }

          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => setSelectedId(item.id)}
                data-focusable
                className="settings-content-item group flex items-center gap-4 px-4 py-3 rounded-xl text-white w-full text-left transition-all duration-200 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-[#1a1c20] focus:bg-white/10 min-h-[56px] tv:min-h-[64px]"
                tabIndex={0}
              >
                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center group-hover:bg-white/15 transition-colors">
                  <Icon className="w-5 h-5 text-gray-300 group-hover:text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="block font-medium text-white truncate">{item.title ?? t(item.titleKey)}</span>
                  <span className="block text-sm text-gray-400 truncate mt-0.5">
                    {item.description ?? t(item.descriptionKey)}
                  </span>
                </div>
                <ArrowRight className="w-5 h-5 text-gray-500 flex-shrink-0 group-hover:translate-x-1 transition-transform" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
