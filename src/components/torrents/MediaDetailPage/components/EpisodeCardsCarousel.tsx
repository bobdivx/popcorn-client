import { useEffect, useMemo, useRef } from 'preact/hooks';
import { ChevronLeft, ChevronRight, CircleCheck, Play } from 'lucide-preact';
import { isTVPlatform } from '../../../../lib/utils/device-detection';

export interface EpisodeCarouselItem {
  key: string;
  episodeNumber: number | string;
  title: string;
  subtitle?: string | null;
  thumbnailUrl?: string | null;
  /** Épisode marqué comme vu (lecture quasi complète ou fin). */
  watched?: boolean;
  isSelected: boolean;
  onSelect: () => void;
  isTV?: boolean;
}

export function EpisodeCardsCarousel({
  items,
  ariaLabel,
}: {
  items: EpisodeCarouselItem[];
  ariaLabel: string;
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const selectedKey = useMemo(() => items.find((i) => i.isSelected)?.key ?? null, [items]);

  useEffect(() => {
    if (!selectedKey) return;
    const el = scrollerRef.current?.querySelector<HTMLElement>(`[data-episode-card="${CSS.escape(selectedKey)}"]`);
    el?.scrollIntoView?.({
      block: 'nearest',
      inline: 'center',
      behavior: isTVPlatform() ? 'auto' : 'smooth',
    });
  }, [selectedKey]);

  const scrollByCards = (dir: -1 | 1) => {
    const el = scrollerRef.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>('[data-episode-card]');
    const cardWidth = card ? card.getBoundingClientRect().width : 320;
    el.scrollBy({
      left: dir * (cardWidth + 16) * 2,
      behavior: isTVPlatform() ? 'auto' : 'smooth',
    });
  };

  return (
    <div aria-label={ariaLabel} className="relative">
      <div className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-black/60 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-black/60 to-transparent" />

      <button
        type="button"
        className="hidden sm:flex absolute left-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 items-center justify-center rounded-full border border-white/15 bg-black/40 hover:bg-black/60 text-white/90"
        onClick={() => scrollByCards(-1)}
        aria-label="Précédent"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>
      <button
        type="button"
        className="hidden sm:flex absolute right-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 items-center justify-center rounded-full border border-white/15 bg-black/40 hover:bg-black/60 text-white/90"
        onClick={() => scrollByCards(1)}
        aria-label="Suivant"
      >
        <ChevronRight className="w-5 h-5" />
      </button>

      <div
        ref={scrollerRef}
        role="list"
        className="overflow-x-auto scrollbar-hide px-4 sm:px-5 py-4 sm:py-5"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        <div className="flex gap-4">
          {items.map((it) => (
            <button
              key={it.key}
              type="button"
              role="listitem"
              onClick={it.onSelect}
              data-focusable={it.isTV ? true : undefined}
              data-episode-card={it.key}
              tabIndex={0}
              className={`group text-left rounded-2xl overflow-hidden border transition focus:outline-none focus:ring-2 focus:ring-primary-500 shrink-0 w-[280px] sm:w-[320px] ${
                it.isSelected ? 'border-primary-500/50 bg-primary-500/10' : 'border-white/10 bg-white/5 hover:bg-white/10'
              }`}
              style={{ scrollSnapAlign: 'start' }}
              aria-current={it.isSelected ? 'true' : undefined}
              onFocus={(e) => {
                (e.currentTarget as HTMLElement).scrollIntoView?.({ block: 'nearest', inline: 'center' });
              }}
            >
              <div className="relative aspect-video w-full overflow-hidden bg-black/30">
                {it.thumbnailUrl ? (
                  <img
                    src={it.thumbnailUrl}
                    alt=""
                    loading="lazy"
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-black/40 to-black/80" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

                <div className="absolute left-3 top-3 flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-full text-xs font-bold tracking-wide bg-black/50 border border-white/15 text-white/90">
                    {typeof it.episodeNumber === 'number' ? `ÉPISODE ${it.episodeNumber}` : `${it.episodeNumber}`}
                  </span>
                  {it.watched ? (
                    <span
                      className="inline-flex items-center justify-center"
                      title="Déjà vu"
                      aria-label="Déjà vu"
                    >
                      <CircleCheck className="w-6 h-6 text-emerald-400 drop-shadow-md" strokeWidth={2.5} />
                    </span>
                  ) : null}
                </div>

                <div className="absolute right-3 bottom-3 w-11 h-11 rounded-full flex items-center justify-center border border-white/15 bg-black/40 text-white/90 group-hover:bg-primary-500/80 group-hover:border-primary-500/40 transition">
                  <Play className="w-5 h-5 ml-0.5" fill="currentColor" />
                </div>
              </div>

              <div className="p-3 sm:p-4">
                <div className="text-base font-semibold text-white truncate">{it.title}</div>
                {it.subtitle ? (
                  <div className="text-xs sm:text-sm text-white/60 line-clamp-2 mt-1">{it.subtitle}</div>
                ) : null}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

