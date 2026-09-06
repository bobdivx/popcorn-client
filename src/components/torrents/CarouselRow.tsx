import { useRef, useState, useCallback, useEffect } from 'preact/hooks';
import { toChildArray } from 'preact';
import { isTVPlatform } from '../../lib/utils/device-detection';
import { ensureBrowseScrollSpacer } from '../page-model/browseCarouselAnchor';

interface CarouselRowProps {
  title: string;
  children: preact.ComponentChildren;
  className?: string;
  subtitle?: string;
  /** Défilement automatique activé (défaut: true) */
  autoScroll?: boolean;
  /** Intervalle en ms entre chaque scroll (défaut: 5000) */
  autoScrollInterval?: number;
}

export default function CarouselRow({
  title,
  subtitle,
  children,
  className = '',
  autoScroll = true,
  autoScrollInterval = 5000,
}: CarouselRowProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isTV] = useState(() => typeof window !== 'undefined' && isTVPlatform());
  const [isCoarsePointer] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(hover: none) and (pointer: coarse)').matches
  );

  const scroll = useCallback((direction: 'left' | 'right') => {
    if (!scrollContainerRef.current) return;
    const scrollAmount = scrollContainerRef.current.clientWidth * 0.75;

    scrollContainerRef.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: isTV ? 'auto' : 'smooth',
    });
  }, [isTV]);

  const [isHovered, setIsHovered] = useState(false);
  const isHoveredRef = useRef(false);
  isHoveredRef.current = isHovered;

  useEffect(() => {
    if (!autoScroll || isTV || isCoarsePointer) return;
    const el = scrollContainerRef.current;
    if (!el) return;

    const tick = () => {
      if (isHoveredRef.current) return;
      const { scrollLeft, scrollWidth, clientWidth } = el;
      const scrollAmount = clientWidth * 0.75;
      const nearEnd = scrollLeft + clientWidth >= scrollWidth - 50;
      if (nearEnd) {
        el.scrollTo({ left: 0, behavior: 'smooth' });
      } else {
        el.scrollBy({ left: scrollAmount, behavior: 'smooth' });
      }
    };

    const id = setInterval(tick, autoScrollInterval);
    return () => clearInterval(id);
  }, [autoScroll, autoScrollInterval, isTV, isCoarsePointer]);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.classList.add('opacity-100');
    }
  }, []);

  // Spacer ≥ viewport : ancre le paysage à gauche même avec 2–3 cartes (Reprenez / À revoir)
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const sync = () => ensureBrowseScrollSpacer(el);
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, [children]);

  const childrenArray = toChildArray(children);

  return (
    <div
      ref={containerRef}
      className={`mb-10 sm:mb-12 md:mb-14 tv:mb-20 w-full min-w-0 max-w-full overflow-x-visible overflow-y-visible opacity-100 ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="flex items-center mb-3 sm:mb-4 tv:mb-6 px-3 sm:px-4 md:px-6 lg:px-8 xl:px-12 tv:px-16 tv-overscan-x gap-2 group/row-title">
        <div className="min-w-0 flex items-center gap-2">
          <h2 className="text-[1.05rem] sm:text-xl md:text-[1.35rem] tv:text-3xl font-semibold tracking-tight text-white/90 group-hover/row-title:text-white truncate transition-colors duration-150">
            {title}
          </h2>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            className="h-4 w-4 sm:h-5 sm:w-5 tv:h-7 tv:w-7 text-white/0 group-hover/row-title:text-white/70 transition-colors duration-150 flex-shrink-0 translate-y-[1px]"
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          {subtitle ? (
            <p className="text-xs sm:text-sm text-white/45 mt-0 truncate hidden sm:block">{subtitle}</p>
          ) : null}
        </div>
        {!isTV && (isHovered || (scrollContainerRef.current?.scrollLeft || 0) > 0) && (
          <div className="hidden xs:flex gap-1.5 sm:gap-2 tv:gap-4 ml-auto">
            <button
              onClick={() => scroll('left')}
              className="w-7 h-7 sm:w-8 sm:h-8 md:w-10 md:h-10 tv:w-14 tv:h-14 rounded-full border border-[var(--ds-border)] bg-[var(--ds-surface-elevated)] hover:border-[var(--ds-border-strong)] flex items-center justify-center text-[var(--ds-text-primary)] transition-all hover:scale-110 ds-focus-glow ds-active-glow min-h-[28px] tv:min-h-[56px]"
              aria-label="Défiler vers la gauche"
              tabIndex={0}
              data-focusable
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:h-5 sm:w-5 tv:h-7 tv:w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={() => scroll('right')}
              className="w-7 h-7 sm:w-8 sm:h-8 md:w-10 md:h-10 tv:w-14 tv:h-14 rounded-full border border-[var(--ds-border)] bg-[var(--ds-surface-elevated)] hover:border-[var(--ds-border-strong)] flex items-center justify-center text-[var(--ds-text-primary)] transition-all hover:scale-110 ds-focus-glow ds-active-glow min-h-[28px] tv:min-h-[56px]"
              aria-label="Défiler vers la droite"
              tabIndex={0}
              data-focusable
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:h-5 sm:w-5 tv:h-7 tv:w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        )}
      </div>
      <div
        ref={scrollContainerRef}
        data-carousel
        data-browse-carousel
        className={`flex w-full min-w-0 max-w-full items-start gap-4 sm:gap-5 md:gap-5 lg:gap-6 tv:gap-7 overflow-x-auto overscroll-x-contain overflow-y-visible scrollbar-hide px-3 sm:px-4 md:px-6 lg:px-8 xl:px-12 tv:px-16 pt-1 pb-12 tv:pb-16 carousel-container`}
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          scrollBehavior: 'auto',
          touchAction: 'pan-x pan-y',
        }}
      >
        {childrenArray}
        <div
          data-browse-scroll-spacer
          aria-hidden="true"
          className="pointer-events-none invisible shrink-0"
          style={{ flex: '0 0 auto', width: '100vw', minWidth: '100vw', height: 1 }}
        />
      </div>
    </div>
  );
}
