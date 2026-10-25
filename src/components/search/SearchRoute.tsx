/**
 * Page /search : choisit la recherche selon les modules du serveur.
 * - Sans module Indexers : recherche dans la bibliothèque locale uniquement.
 * - Avec Indexers : recherche complète (indexers + TMDB), avec un onglet « Ma bibliothèque »
 *   (`?scope=library`) pour ne chercher que dans les fichiers déjà présents sur le serveur.
 */
import { useMemo } from 'preact/hooks';
import SearchComponent from '../Search';
import LibrarySearch from './LibrarySearch';
import { useServerCapabilities } from '../../lib/capabilities';
import { isIndexersModuleAvailable } from '../../lib/distribution';
import { useI18n } from '../../lib/i18n/useI18n';

function currentScope(): 'library' | 'all' {
  if (typeof window === 'undefined') return 'all';
  return new URLSearchParams(window.location.search).get('scope') === 'library' ? 'library' : 'all';
}

function scopeHref(scope: 'library' | 'all'): string {
  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  if (scope === 'library') params.set('scope', 'library');
  else params.delete('scope');
  const qs = params.toString();
  return qs ? `/search?${qs}` : '/search';
}

function ScopeTabs({ scope }: { scope: 'library' | 'all' }) {
  const { language } = useI18n();
  const labels = language === 'en' ? { all: 'Indexers', library: 'My library' } : { all: 'Indexeurs', library: 'Ma bibliothèque' };
  const tabs: Array<'all' | 'library'> = ['all', 'library'];
  return (
    <nav
      className="flex items-center justify-center gap-2 tv:gap-3 pt-3 sm:pt-4 px-4"
      aria-label={language === 'en' ? 'Search scope' : 'Portée de la recherche'}
      data-search-scope-tabs
    >
      {tabs.map((id) => {
        const active = scope === id;
        return (
          <a
            key={id}
            href={scopeHref(id)}
            aria-current={active ? 'page' : undefined}
            tabIndex={0}
            data-focusable
            className={`gtv-pill-btn ds-focus-glow ds-active-glow inline-flex items-center rounded-full px-3.5 py-1.5 tv:px-6 tv:py-3 text-sm tv:text-xl font-medium border transition-colors min-h-[36px] tv:min-h-[56px] ${
              active
                ? 'bg-[var(--ds-surface-elevated)] text-[var(--ds-text-primary)] border-[var(--ds-accent-violet)]'
                : 'bg-transparent text-[var(--ds-text-secondary)] border-[var(--ds-border)] hover:border-[var(--ds-border-strong)]'
            }`}
          >
            {labels[id]}
          </a>
        );
      })}
    </nav>
  );
}

export default function SearchRoute() {
  const capabilities = useServerCapabilities();
  const hasIndexers = useMemo(() => isIndexersModuleAvailable(), [capabilities]);
  const scope = currentScope();

  if (!hasIndexers) return <LibrarySearch />;
  return (
    <>
      <ScopeTabs scope={scope} />
      {scope === 'library' ? <LibrarySearch /> : <SearchComponent />}
    </>
  );
}
