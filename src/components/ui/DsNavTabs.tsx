import type { ComponentChildren } from 'preact';

export interface DsNavTabItem {
  id: string;
  label: string;
  /** Contenu à afficher quand l’onglet est actif */
  content: ComponentChildren;
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
      <div class="ds-nav-tabs__row flex flex-nowrap items-center gap-2 min-w-0">
        <div role="tablist" class={`ds-nav-tabs ds-nav-tabs--inline ${className}`.trim()} aria-label="Navigation par onglets">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeId === tab.id}
              aria-controls={`panel-${tab.id}`}
              id={`tab-${tab.id}`}
              class="ds-nav-tab"
              onClick={() => onChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {rightContent != null && (
          <div class="ds-nav-tabs__right flex flex-wrap items-center gap-2 flex-shrink-0 ml-auto min-w-0">
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
