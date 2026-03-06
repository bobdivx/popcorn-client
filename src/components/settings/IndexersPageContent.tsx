import { useI18n } from '../../lib/i18n/useI18n';
import { Search } from 'lucide-preact';
import IndexersManager from './IndexersManager';

const ACCENT_ICON_BG = 'var(--ds-accent-violet-muted)';
const ACCENT_ICON_COLOR = 'var(--ds-accent-violet)';

/**
 * Contenu de la page Paramètres → Indexers.
 * En-tête avec icône à gauche du titre, puis grille de cartes (IndexersManager).
 */
export default function IndexersPageContent() {
  const { t } = useI18n();

  return (
    <div className="space-y-6 sm:space-y-8">
      <header className="flex items-start gap-3 sm:gap-4 min-w-0">
        <span
          className="inline-flex w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex-shrink-0 items-center justify-center"
          style={{ backgroundColor: ACCENT_ICON_BG, color: ACCENT_ICON_COLOR }}
          aria-hidden
        >
          <Search className="w-5 h-5 sm:w-6 sm:h-6" strokeWidth={1.8} />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="ds-title-page truncate text-xl sm:text-2xl md:text-3xl text-[var(--ds-text-primary)]">
            {t('settingsPages.indexers.title')}
          </h1>
          <p className="ds-text-secondary mt-0.5 sm:mt-1 text-sm sm:text-base">
            {t('settingsPages.indexers.subtitle')}
          </p>
        </div>
      </header>
      <IndexersManager />
    </div>
  );
}
