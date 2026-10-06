import { useState, useEffect, useRef } from 'preact/hooks';
import { useI18n } from '../../lib/i18n/useI18n';
import type { ComponentType } from 'preact';
import { HubModal } from './hub/HubModal';
import { HubTile } from './hub/HubTile';

export interface SubMenuItem {
  id: string;
  titleKey: string;
  /** Titre affiché tel quel (prioritaire sur titleKey si défini) */
  title?: string;
  descriptionKey: string;
  description?: string;
  icon: ComponentType<any>;
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

export default function SubMenuPanel({ visibleItems, onParentBack }: SubMenuPanelProps) {
  const { t } = useI18n();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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
  const ContentComponent = selectedItem?.inlineContent;

  return (
    <div ref={containerRef}>
      {onParentBack && (
        <div class="hub-back-row" data-tv-list-header>
          <button type="button" onClick={onParentBack} data-focusable data-tv-page-action tabIndex={0} class="hub-back">
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            {t('common.back')}
          </button>
        </div>
      )}
      <div class="hub-grid" data-tv-list role="list">
        {visibleItems.map((item) => {
          const href = item.hrefFn ? item.hrefFn() : item.href;
          const title = item.title ?? t(item.titleKey);
          const hint = item.description ?? t(item.descriptionKey);
          if (href) {
            return (
              <HubTile
                key={item.id}
                href={href}
                isExternal={item.isExternal}
                icon={item.icon}
                title={title}
                hint={hint}
              />
            );
          }
          return (
            <HubTile
              key={item.id}
              icon={item.icon}
              title={title}
              hint={hint}
              onClick={() => setSelectedId(item.id)}
            />
          );
        })}
      </div>
      {selectedItem && ContentComponent && (
        <HubModal
          open
          title={selectedItem.title ?? t(selectedItem.titleKey)}
          description={selectedItem.description ?? t(selectedItem.descriptionKey)}
          onClose={() => setSelectedId(null)}
          size="xl"
        >
          {selectedItem.nestedSubMenu ? (
            <ContentComponent onParentBack={() => setSelectedId(null)} />
          ) : (
            <ContentComponent onBack={() => setSelectedId(null)} />
          )}
        </HubModal>
      )}
    </div>
  );
}
