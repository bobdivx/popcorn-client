import { useRef, useState, useCallback, useEffect } from 'preact/hooks';

interface CarouselRowProps {
  title: string;
  children: preact.ComponentChildren;
  className?: string;
  /** Défilement automatique activé (défaut: true) */
  autoScroll?: boolean;
  /** Intervalle en ms entre chaque scroll (défaut: 5000) */
  autoScrollInterval?: number;
}

export default function CarouselRow({
  title,
  children,
  className = '',
  autoScroll = true,
  autoScrollInterval = 5000,
}: CarouselRowProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const scroll = useCallback((direction: 'left' | 'right') => {
    if (!scrollContainerRef.current) return;
    const scrollAmount = scrollContainerRef.current.clientWidth * 0.75;
    
    // Utiliser courbe de Bézier organique pour défilement fluide
    scrollContainerRef.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  }, []);

  // Navigation et focus gérés par TVNavigationProvider global
  // Ce carousel expose juste data-carousel pour que TVNavigationProvider puisse le détecter

  const [isHovered, setIsHovered] = useState(false);
  const isHoveredRef = useRef(false);
  isHoveredRef.current = isHovered;

  // Défilement automatique
  useEffect(() => {
    if (!autoScroll) return;
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
  }, [autoScroll, autoScrollInterval]);

  // Animation au scroll avec Intersection Observer
  useEffect(() => {
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
      if (containerRef.current) {
        containerRef.current.classList.add('animate-fade-in-up');
      }
      return;
    }

    const element = containerRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('animate-fade-in-up');
            observer.unobserve(entry.target);
          }
        });
      },
      {
        rootMargin: '0px 0px -50px 0px',
        threshold: 0.1,
      }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, []);

  const childrenArray = Array.isArray(children) ? children : [children];

  return (
    <div 
      ref={containerRef}
      className={`mb-8 sm:mb-10 md:mb-12 tv:mb-16 ${className} opacity-0`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="flex items-center mb-2 sm:mb-3 tv:mb-4 px-3 sm:px-4 md:px-6 lg:px-8 xl:px-12 tv:px-16">
        <h2 className="text-lg sm:text-xl md:text-2xl tv:text-3xl font-bold text-white">{title}</h2>
        {(isHovered || (scrollContainerRef.current?.scrollLeft || 0) > 0) && (
          <div className="hidden xs:flex gap-1.5 sm:gap-2 tv:gap-4 ml-auto">
            <button
              onClick={() => scroll('left')}
              className="w-7 h-7 sm:w-8 sm:h-8 md:w-10 md:h-10 tv:w-14 tv:h-14 rounded-full glass-panel hover:bg-glass-hover border border-white/30 flex items-center justify-center text-white transition-all hover:scale-110 focus:outline-none focus:ring-4 focus:ring-primary-600 focus:ring-opacity-50 min-h-[28px] tv:min-h-[56px]"
              aria-label="Défiler vers la gauche"
              tabIndex={0}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:h-5 sm:w-5 tv:h-7 tv:w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={() => scroll('right')}
              className="w-7 h-7 sm:w-8 sm:h-8 md:w-10 md:h-10 tv:w-14 tv:h-14 rounded-full glass-panel hover:bg-glass-hover border border-white/30 flex items-center justify-center text-white transition-all hover:scale-110 focus:outline-none focus:ring-4 focus:ring-primary-600 focus:ring-opacity-50 min-h-[28px] tv:min-h-[56px]"
              aria-label="Défiler vers la droite"
              tabIndex={0}
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
        className="flex gap-1 sm:gap-1.5 md:gap-2 lg:gap-4 xl:gap-6 tv:gap-8 overflow-x-auto overflow-y-visible scrollbar-hide px-3 sm:px-4 md:px-6 lg:px-8 xl:px-12 tv:px-16 py-2 scroll-smooth carousel-container"
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          scrollBehavior: 'smooth',
        }}
      >
        {childrenArray.map((child, index) => (
          <div key={index} className="flex-shrink-0">
            {child}
          </div>
        ))}
      </div>
    </div>
  );
}
