import { Film, Library, Tv2 } from 'lucide-preact';
import { useI18n } from '../../lib/i18n/useI18n';

export type LibraryViewMode = 'torrents' | 'library';

interface LibraryViewToggleProps {
  mode: LibraryViewMode;
  onChange: (mode: LibraryViewMode) => void;
  /** Type de contenu affiché — détermine l'icône de la vue "catalogue". */
  contentType: 'movies' | 'series';
}

function restoreToggleFocus() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const selected = document.querySelector<HTMLElement>('[data-tv-page-action] [aria-selected="true"]');
      selected?.focus();
    });
  });
}

export function LibraryViewToggle({ mode, onChange, contentType }: LibraryViewToggleProps) {
  const { t } = useI18n();
  const TorrentsIcon = contentType === 'movies' ? Film : Tv2;
  const catalogLabel = t('nav.catalog');
  const libraryLabel = t('nav.library');

  const select = (next: LibraryViewMode) => {
    onChange(next);
    restoreToggleFocus();
  };

  return (
    <div
      role="tablist"
      aria-label={`${catalogLabel} / ${libraryLabel}`}
      data-tv-page-action
      className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1 tv:p-1.5 backdrop-blur"
    >
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'torrents'}
        aria-label={catalogLabel}
        title={catalogLabel}
        tabIndex={0}
        data-focusable
        onClick={() => select('torrents')}
        className={
          'inline-flex items-center gap-2 rounded-full px-4 py-2 tv:px-6 tv:py-3 text-sm tv:text-lg font-medium transition-colors min-h-[40px] tv:min-h-[52px] focus:outline-none focus:ring-4 focus:ring-primary-600/60 focus:ring-offset-2 focus:ring-offset-black ' +
          (mode === 'torrents'
            ? 'bg-white text-black shadow'
            : 'text-white/70 hover:text-white hover:bg-white/10')
        }
      >
        <TorrentsIcon className="w-4 h-4 tv:w-6 tv:h-6" />
        <span>{catalogLabel}</span>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'library'}
        aria-label={libraryLabel}
        title={libraryLabel}
        tabIndex={0}
        data-focusable
        onClick={() => select('library')}
        className={
          'inline-flex items-center gap-2 rounded-full px-4 py-2 tv:px-6 tv:py-3 text-sm tv:text-lg font-medium transition-colors min-h-[40px] tv:min-h-[52px] focus:outline-none focus:ring-4 focus:ring-primary-600/60 focus:ring-offset-2 focus:ring-offset-black ' +
          (mode === 'library'
            ? 'bg-white text-black shadow'
            : 'text-white/70 hover:text-white hover:bg-white/10')
        }
      >
        <Library className="w-4 h-4 tv:w-6 tv:h-6" />
        <span>{libraryLabel}</span>
      </button>
    </div>
  );
}
