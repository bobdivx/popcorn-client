import { useRef } from 'preact/hooks';
import { ChevronLeft, ChevronRight } from 'lucide-preact';
import { translateGenre } from '../../../lib/utils/genre-translation';
import { useI18n } from '../../../lib/i18n/useI18n';

interface GenreCardsRowProps {
  genres: string[];
  genreBackgrounds: Record<string, string>;
  allBackground?: string | null;
  selectedGenre: string | null;
  onSelectGenre: (genre: string | null) => void;
  language: 'fr' | 'en';
}

export function GenreCardsRow({
  genres,
  genreBackgrounds,
  allBackground,
  selectedGenre,
  onSelectGenre,
  language,
}: GenreCardsRowProps) {
  if (genres.length === 0) return null;
  const { t } = useI18n();
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const scrollByCards = (dir: -1 | 1) => {
    const el = scrollerRef.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>('[data-genre-card]');
    const cardWidth = card ? card.getBoundingClientRect().width : 180;
    el.scrollBy({ left: dir * (cardWidth + 16) * 3, behavior: 'smooth' });
  };

  return (
    <section className="mb-8 sm:mb-10 md:mb-12 px-3 sm:px-4 md:px-6 lg:px-8 xl:px-12 tv:px-16">
      <div className="rounded-2xl p-3 sm:p-4 md:p-5">
        <div className="mb-3 sm:mb-4">
          <h2 className="text-lg sm:text-xl md:text-2xl tv:text-3xl font-bold text-white">
            {t('dashboard.genresTitle')}
          </h2>
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => scrollByCards(-1)}
            className="hidden sm:flex absolute left-2 top-1/2 -translate-y-1/2 z-20 w-10 h-10 items-center justify-center rounded-full border border-white/20 bg-black/45 hover:bg-black/65 text-white/90"
            aria-label={t('common.previous')}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => scrollByCards(1)}
            className="hidden sm:flex absolute right-2 top-1/2 -translate-y-1/2 z-20 w-10 h-10 items-center justify-center rounded-full border border-white/20 bg-black/45 hover:bg-black/65 text-white/90"
            aria-label={t('common.next')}
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          <div className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-black/70 to-transparent z-10" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-black/70 to-transparent z-10" />

          <div
            ref={scrollerRef}
            className="overflow-x-auto no-scrollbar py-1 px-1"
            style={{
              scrollSnapType: 'x mandatory',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
            }}
            data-carousel
          >
            <div className="flex gap-4">
              <button
                type="button"
                data-focusable
                data-genre-card
                tabIndex={0}
                onClick={() => onSelectGenre(null)}
                className={`group shrink-0 w-[150px] sm:w-[170px] tv:w-[210px] aspect-[2/3] rounded-2xl border overflow-hidden text-left transition-all focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                  selectedGenre === null
                    ? 'border-primary-500/60 text-white shadow-[0_0_0_1px_rgba(124,58,237,0.25)]'
                    : 'border-white/20 text-white/90 hover:border-white/30'
                }`}
                style={{ scrollSnapAlign: 'start' }}
              >
                <div className="relative h-full">
                  {allBackground ? (
                    <img
                      src={allBackground}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : null}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 to-black/20" />
                  <div className="relative h-full p-4 sm:p-5 flex flex-col justify-between">
                    <div />
                    <div>
                      <div className="text-base sm:text-lg font-bold">{t('dashboard.genreAll')}</div>
                    </div>
                  </div>
                </div>
              </button>

              {genres.map((genre) => {
                const isActive = selectedGenre === genre;
                const bg = genreBackgrounds[genre];
                return (
                  <button
                    key={genre}
                    type="button"
                    data-focusable
                    data-genre-card
                    tabIndex={0}
                    onClick={() => onSelectGenre(genre)}
                    className={`group shrink-0 w-[150px] sm:w-[170px] tv:w-[210px] aspect-[2/3] rounded-2xl border overflow-hidden text-left transition-all focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                      isActive
                        ? 'border-primary-500/60 text-white shadow-[0_0_0_1px_rgba(124,58,237,0.25)]'
                        : 'border-white/20 text-white/90 hover:border-white/30'
                    }`}
                    style={{ scrollSnapAlign: 'start' }}
                  >
                    <div className="relative h-full">
                      {bg ? (
                        <img
                          src={bg}
                          alt=""
                          className="absolute inset-0 w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : null}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 to-black/20" />
                      <div className="relative h-full p-4 sm:p-5 flex flex-col justify-between">
                        <div />
                        <div>
                          <div className="text-base sm:text-lg font-bold leading-tight line-clamp-2">
                            {translateGenre(genre, language)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

