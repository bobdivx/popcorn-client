import { Film, Library, Tv2 } from 'lucide-preact';
import { useI18n } from '../../lib/i18n/useI18n';

export type LibraryViewMode = 'torrents' | 'library';

interface LibraryViewToggleProps {
  mode: LibraryViewMode;
  onChange: (mode: LibraryViewMode) => void;
  /** Type de contenu affiché — détermine l'icône de la vue "torrents" (films vs séries). */
  contentType: 'movies' | 'series';
}

export function LibraryViewToggle({ mode, onChange, contentType }: LibraryViewToggleProps) {
  const { t } = useI18n();
  const TorrentsIcon = contentType === 'movies' ? Film : Tv2;
  const torrentsLabel = contentType === 'movies' ? t('nav.films') : t('nav.series');
  const libraryLabel = t('nav.library');

  return (
    <div
      role="tablist"
      aria-label={libraryLabel}
      data-tv-page-action
      className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1 backdrop-blur"
    >
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'torrents'}
        aria-label={torrentsLabel}
        title={torrentsLabel}
        tabIndex={0}
        data-focusable
        onClick={() => onChange('torrents')}
        className={
          'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs sm:text-sm tv:text-base font-medium transition-colors min-h-[36px] tv:min-h-[44px] focus:outline-none focus:ring-4 focus:ring-primary-600/60 focus:ring-offset-2 focus:ring-offset-black ' +
          (mode === 'torrents'
            ? 'bg-white text-black shadow'
            : 'text-white/70 hover:text-white hover:bg-white/10')
        }
      >
        <TorrentsIcon className="w-4 h-4 tv:w-5 tv:h-5" />
        <span>{torrentsLabel}</span>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'library'}
        aria-label={libraryLabel}
        title={libraryLabel}
        tabIndex={0}
        data-focusable
        onClick={() => onChange('library')}
        className={
          'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs sm:text-sm tv:text-base font-medium transition-colors min-h-[36px] tv:min-h-[44px] focus:outline-none focus:ring-4 focus:ring-primary-600/60 focus:ring-offset-2 focus:ring-offset-black ' +
          (mode === 'library'
            ? 'bg-white text-black shadow'
            : 'text-white/70 hover:text-white hover:bg-white/10')
        }
      >
        <Library className="w-4 h-4 tv:w-5 tv:h-5" />
        <span>{libraryLabel}</span>
      </button>
    </div>
  );
}
