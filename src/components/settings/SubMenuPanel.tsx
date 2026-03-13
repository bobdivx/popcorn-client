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
            className="flex items-center gap-2 ds-text-secondary hover:text-[var(--ds-text-primary)] mb-4 text-sm font-medium tv:min-h-[48px] tv:py-2 focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)] focus:ring-offset-2 focus:ring-offset-[var(--ds-surface)] rounded-lg"
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
          className="flex items-center gap-2 ds-text-secondary hover:text-[var(--ds-text-primary)] mb-4 text-sm font-medium tv:min-h-[48px] tv:py-2 focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)] focus:ring-offset-2 focus:ring-offset-[var(--ds-surface)] rounded-lg"
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
                  class="sc-list-item"
                  tabIndex={0}
                >
                  <div className="sc-list-icon">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0 overflow-hidden">
                    <span className="sc-list-text-title block truncate">{item.title ?? t(item.titleKey)}</span>
                    <span className="sc-list-text-desc block truncate">
                      {item.description ?? t(item.descriptionKey)}
                    </span>
                  </div>
                  <ArrowRight className="sc-list-arrow w-4 h-4" />
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
                class="sc-list-item"
                tabIndex={0}
              >
                <div className="sc-list-icon">
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0 overflow-hidden">
                  <span className="sc-list-text-title block truncate">{item.title ?? t(item.titleKey)}</span>
                  <span className="sc-list-text-desc block truncate">
                    {item.description ?? t(item.descriptionKey)}
                  </span>
                </div>
                <ArrowRight className="sc-list-arrow w-4 h-4" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
