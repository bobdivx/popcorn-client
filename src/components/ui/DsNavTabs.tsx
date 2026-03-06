import type { ComponentChildren } from 'preact';

export interface DsNavTabItem {
  id: string;
  /** Libellé texte ou contenu (ex. icône) à afficher dans l’onglet */
  label: ComponentChildren;
  /** Contenu à afficher quand l’onglet est actif */
  content: ComponentChildren;
  /** Texte pour l’accessibilité (aria-label) lorsque label est une icône */
  ariaLabel?: string;
}

interface DsNavTabsProps {
  tabs: DsNavTabItem[];
  activeId: string;
  onChange: (id: string) => void;
  /** Classe sur le conteneur des onglets */
  className?: string;
  /** Contenu affiché à droite des onglets, sur la même ligne */
  rightContent?: ComponentChildren;
}

export function DsNavTabs({ tabs, activeId, onChange, className = '', rightContent }: DsNavTabsProps) {
  const activeTab = tabs.find((t) => t.id === activeId) ?? tabs[0];
  return (
    <div class="min-w-0 flex-1 flex flex-col">
      <div class="flex flex-nowrap items-center gap-2 min-w-0">
        <div role="tablist" class={`ds-nav-tabs ds-nav-tabs--inline ${className}`.trim()} aria-label="Navigation par onglets">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeId === tab.id}
              aria-controls={`panel-${tab.id}`}
              id={`tab-${tab.id}`}
                class={`ds-nav-tab ${typeof tab.label !== 'string' ? 'ds-nav-tab--icon' : ''}`}
              aria-label={tab.ariaLabel ?? (typeof tab.label === 'string' ? tab.label : undefined)}
              onClick={() => onChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {rightContent != null && (
          <div class="sync-toolbar__right-outer">
            {rightContent}
          </div>
        )}
      </div>
      <div
        id={`panel-${activeTab.id}`}
        role="tabpanel"
        aria-labelledby={`tab-${activeTab.id}`}
        class="mt-6 min-w-0"
      >
        {activeTab.content}
      </div>
    </div>
  );
}
