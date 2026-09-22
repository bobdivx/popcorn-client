import { useEffect, useRef, useState } from 'preact/hooks';
import { CANONICAL_GENRES, translateGenre } from '../../lib/utils/genre-translation';
import { useI18n } from '../../lib/i18n/useI18n';

interface GenreSidebarProps {
  selectedGenre: string | null;
  onSelectGenre: (genre: string | null) => void;
  language: 'fr' | 'en';
}

export function GenreSidebar({ selectedGenre, onSelectGenre, language }: GenreSidebarProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const genres = [...CANONICAL_GENRES].sort((a, b) =>
    translateGenre(a, language).localeCompare(translateGenre(b, language), language)
  );
  const currentLabel = selectedGenre
    ? translateGenre(selectedGenre, language)
    : t('dashboard.genresTitle');

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const focusTimer = window.requestAnimationFrame(() => {
      const current = panel?.querySelector<HTMLElement>('[data-genre-current]');
      const first = panel?.querySelector<HTMLElement>('[data-focusable]');
      (current ?? first)?.focus();
    });
    const onBack = (event: Event) => {
      event.preventDefault();
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    panel?.addEventListener('tv-back-button', onBack);
    window.addEventListener('keydown', onKey);
    return () => {
      window.cancelAnimationFrame(focusTimer);
      panel?.removeEventListener('tv-back-button', onBack);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const choose = (genre: string | null) => {
    onSelectGenre(genre);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        data-focusable
        data-tv-page-action
        className="gtv-pill-btn ds-focus-glow border border-white/20 px-5 tv:px-8 tv:min-h-[64px] tv:text-xl"
        onClick={() => setOpen(true)}
      >
        {currentLabel}
      </button>
      {open ? (
        <div ref={panelRef} className="fixed inset-0 z-[220]" role="dialog" aria-modal="true" aria-label={t('dashboard.genresTitle')}>
          <button
            type="button"
            className="absolute inset-0 bg-black/65"
            aria-label={t('common.close')}
            tabIndex={-1}
            data-tv-nav-skip
            onClick={() => setOpen(false)}
          />
          <aside
            data-tv-list
            className="absolute left-0 top-0 bottom-0 flex w-[min(28rem,88vw)] flex-col border-r border-white/10 bg-[#141414] shadow-[8px_0_40px_rgba(0,0,0,0.45)]"
          >
            <div className="flex items-center justify-between px-6 pt-6 pb-3 tv:px-8 tv:pt-10">
              <h2 className="text-2xl tv:text-4xl font-bold text-white">{t('dashboard.genresTitle')}</h2>
              <button
                type="button"
                data-close
                data-focusable
                className="gtv-pill-btn ds-focus-glow border border-white/15 px-4 py-2 tv:min-h-[56px] tv:text-lg"
                onClick={() => setOpen(false)}
              >
                {t('common.close')}
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-8 tv:px-5">
              <GenreRow
                label={t('dashboard.genreAll')}
                active={selectedGenre === null}
                onChoose={() => choose(null)}
              />
              {genres.map((genre) => (
                <GenreRow
                  key={genre}
                  label={translateGenre(genre, language)}
                  active={selectedGenre === genre}
                  onChoose={() => choose(genre)}
                />
              ))}
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}

function GenreRow({
  label,
  active,
  onChoose,
}: {
  label: string;
  active: boolean;
  onChoose: () => void;
}) {
  return (
    <div data-tv-list-item>
      <button
        type="button"
        data-focusable
        data-tv-list-primary
        data-genre-current={active ? 'true' : undefined}
        aria-pressed={active}
        className={[
          'flex w-full items-center rounded-xl px-4 py-3 tv:px-6 tv:py-4 text-left text-lg tv:text-2xl font-semibold ds-focus-glow',
          'min-h-[52px] tv:min-h-[72px]',
          active ? 'bg-white text-black' : 'text-white/85 hover:bg-white/10',
        ].join(' ')}
        onClick={onChoose}
      >
        {label}
      </button>
    </div>
  );
}
