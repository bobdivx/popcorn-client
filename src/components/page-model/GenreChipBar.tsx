import { translateGenre } from '../../lib/utils/genre-translation';
import { useI18n } from '../../lib/i18n/useI18n';
import type { GenreCount } from '../dashboard/utils/browsePriority';

interface GenreChipBarProps {
  genres: GenreCount[];
  total: number;
  selectedGenre: string | null;
  onSelectGenre: (genre: string | null) => void;
  language: 'fr' | 'en';
}

export function GenreChipBar({
  genres,
  total,
  selectedGenre,
  onSelectGenre,
  language,
}: GenreChipBarProps) {
  const { t } = useI18n();
  if (genres.length === 0) return null;

  const chip = (active: boolean) =>
    [
      'shrink-0 inline-flex items-center gap-2 rounded-full border px-4 py-2 tv:px-6 tv:py-3',
      'text-sm tv:text-lg font-semibold min-h-[44px] tv:min-h-[56px] ds-focus-glow',
      active
        ? 'border-violet-300 bg-violet-600 text-white'
        : 'border-white/15 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white',
    ].join(' ');

  return (
    <div className="px-3 sm:px-4 md:px-6 lg:px-8 xl:px-12 tv:px-16 pb-2">
      <p className="mb-2 text-xs tv:text-base font-semibold uppercase tracking-wide text-white/45">
        {t('dashboard.genresTitle')}
      </p>
      <div
        data-carousel
        data-browse-carousel
        className="flex w-full min-w-0 gap-2 tv:gap-3 overflow-x-auto scrollbar-hide py-1"
        style={{ scrollbarWidth: 'none' }}
      >
        <button
          type="button"
          data-focusable
          data-browse-slot
          tabIndex={0}
          aria-pressed={selectedGenre === null}
          className={chip(selectedGenre === null)}
          onClick={() => onSelectGenre(null)}
        >
          {t('dashboard.genreAll')}
          <span className={selectedGenre === null ? 'text-white/80' : 'text-white/45'}>{total}</span>
        </button>
        {genres.map((genre) => {
          const active = selectedGenre === genre.key;
          return (
            <button
              key={genre.key}
              type="button"
              data-focusable
              data-browse-slot
              tabIndex={0}
              aria-pressed={active}
              className={chip(active)}
              onClick={() => onSelectGenre(active ? null : genre.key)}
            >
              {translateGenre(genre.key, language)}
              <span className={active ? 'text-white/80' : 'text-white/45'}>{genre.count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
